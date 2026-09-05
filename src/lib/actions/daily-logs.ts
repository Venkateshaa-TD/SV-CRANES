"use server";

import { revalidatePath } from "next/cache";
import { Prisma, type DailyLog } from "@prisma/client";

import { prisma } from "@/lib/db/prisma";
import { requireCurrentUser, type CurrentUser } from "@/lib/auth/current-user";
import { can, requirePermission, AuthorizationError } from "@/lib/auth/authorize";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { recordAudit } from "@/lib/audit/audit";
import { dailyLogFormSchema } from "@/lib/validation/daily-log";
import {
  assertNoForwardOverrun,
  assertNoRollback,
  checkSuspiciousJump,
  computeAdvancedVehicleMeters,
  computeDistance,
  computeWorkingHours,
  validateMeterReadings,
} from "@/lib/business/daily-log";
import { isAfterBusinessToday } from "@/lib/business/business-time";
import { assertPeriodNotLocked } from "@/lib/data/period-lock";
import { ActionInputError, ok, toActionError, type ActionResult } from "./action-result";

/**
 * The daily log immediately before `logDate` for this vehicle — i.e. the
 * reading a new/edited entry's start reading must not regress behind.
 * Same-day entries are ordered by `referenceCreatedAt`: for a brand-new
 * log this is "now" (so every existing same-day row, all created earlier,
 * counts as a candidate); for an edit it must be the row's own original
 * `createdAt`, never "now", or every other same-day row would wrongly
 * look like it came first. `excludeLogId` keeps an edit from comparing a
 * log against itself.
 */
async function findPriorChronologicalLog(
  tx: Prisma.TransactionClient,
  vehicleId: string,
  logDate: Date,
  referenceCreatedAt: Date,
  excludeLogId?: string,
): Promise<DailyLog | null> {
  return tx.dailyLog.findFirst({
    where: {
      vehicleId,
      archivedAt: null,
      id: excludeLogId ? { not: excludeLogId } : undefined,
      OR: [{ logDate: { lt: logDate } }, { logDate: logDate, createdAt: { lt: referenceCreatedAt } }],
    },
    orderBy: [{ logDate: "desc" }, { createdAt: "desc" }],
  });
}

/** The nearest log after `logDate` for this vehicle — the reading a
 * new/edited entry's end reading must not exceed. See
 * findPriorChronologicalLog for the same-day tie-break reasoning. */
async function findNextChronologicalLog(
  tx: Prisma.TransactionClient,
  vehicleId: string,
  logDate: Date,
  referenceCreatedAt: Date,
  excludeLogId?: string,
): Promise<DailyLog | null> {
  return tx.dailyLog.findFirst({
    where: {
      vehicleId,
      archivedAt: null,
      id: excludeLogId ? { not: excludeLogId } : undefined,
      OR: [{ logDate: { gt: logDate } }, { logDate: logDate, createdAt: { gt: referenceCreatedAt } }],
    },
    orderBy: [{ logDate: "asc" }, { createdAt: "asc" }],
  });
}

async function hasAnyOtherLog(tx: Prisma.TransactionClient, vehicleId: string, excludeLogId?: string): Promise<boolean> {
  const other = await tx.dailyLog.findFirst({
    where: { vehicleId, archivedAt: null, id: excludeLogId ? { not: excludeLogId } : undefined },
    select: { id: true },
  });
  return !!other;
}

/**
 * Locks the vehicle row for the rest of the transaction (Postgres
 * `SELECT ... FOR UPDATE`) before any chronology check or meter update, so
 * two daily logs for the same vehicle submitted at nearly the same time
 * are serialized rather than racing — without this, two concurrent
 * transactions can both read the same "current" reading, both pass
 * validation against it, and the second commit can silently clobber the
 * first's meter advance with stale data (a classic lost-update bug).
 * Prisma's typed `vehicle.findUnique` is used for the actual read (after
 * the lock is held) so callers get proper Decimal-typed fields back.
 */
async function lockVehicleForUpdate(tx: Prisma.TransactionClient, vehicleId: string) {
  await tx.$executeRaw`SELECT id FROM "Vehicle" WHERE id = ${vehicleId} FOR UPDATE`;
  return tx.vehicle.findUniqueOrThrow({ where: { id: vehicleId } });
}

interface ResolvedInput {
  operatorId: string;
  vehicleId: string;
  logDate: Date;
  projectId: string | null;
  startHourMeter: Prisma.Decimal;
  endHourMeter: Prisma.Decimal;
  startOdometer: Prisma.Decimal;
  endOdometer: Prisma.Decimal;
  workDescription: string | null;
  breakdownNotes: string | null;
  remarks: string | null;
  meterPhotoFileId: string | null;
  sitePhotoFileId: string | null;
}

async function resolveInput(input: unknown, actor: CurrentUser): Promise<ResolvedInput> {
  const data = dailyLogFormSchema.parse(input);

  const canActForOthers = await can(actor, PERMISSIONS.DAILY_LOG_APPROVE);

  let operatorId = actor.id;
  if (canActForOthers && data.operatorId) {
    const operator = await prisma.user.findFirst({
      where: { id: data.operatorId, companyId: actor.companyId, archivedAt: null },
    });
    if (!operator) throw new ActionInputError("Selected operator was not found.");
    operatorId = operator.id;
  } else {
    await requirePermission(actor, PERMISSIONS.DAILY_LOG_CREATE);
  }

  const vehicle = await prisma.vehicle.findFirst({
    where: { id: data.vehicleId, companyId: actor.companyId, archivedAt: null },
  });
  if (!vehicle) throw new ActionInputError("Selected vehicle was not found.");

  const logDate = new Date(data.logDate);
  if (Number.isNaN(logDate.getTime())) throw new ActionInputError("Enter a valid date.");
  // Anchored to the business's own timezone (India), not the server's —
  // see business-time.ts.
  if (isAfterBusinessToday(logDate)) throw new ActionInputError("Date cannot be in the future.");

  if (data.projectId) {
    const project = await prisma.project.findFirst({ where: { id: data.projectId, companyId: actor.companyId } });
    if (!project) throw new ActionInputError("Selected project was not found.");
  }

  return {
    operatorId,
    vehicleId: vehicle.id,
    logDate,
    projectId: data.projectId ?? null,
    startHourMeter: new Prisma.Decimal(data.startHourMeter),
    endHourMeter: new Prisma.Decimal(data.endHourMeter),
    startOdometer: new Prisma.Decimal(data.startOdometer),
    endOdometer: new Prisma.Decimal(data.endOdometer),
    workDescription: data.workDescription ?? null,
    breakdownNotes: data.breakdownNotes ?? null,
    remarks: data.remarks ?? null,
    meterPhotoFileId: data.meterPhotoFileId ?? null,
    sitePhotoFileId: data.sitePhotoFileId ?? null,
  };
}

/** Validates a (create or edit) log's readings against its chronological
 * neighbors: must not regress behind the nearest prior reading (or the
 * vehicle's baseline, when this is the only log on record), and must not
 * exceed the nearest subsequent reading. No neighbor on a side means no
 * bound on that side — never assumed, always looked up. */
async function assertChronologyConsistent(params: {
  tx: Prisma.TransactionClient;
  vehicleId: string;
  logDate: Date;
  referenceCreatedAt: Date;
  excludeLogId?: string;
  resolved: Pick<ResolvedInput, "startHourMeter" | "startOdometer" | "endHourMeter" | "endOdometer">;
  vehicleBaseline: { currentHourMeter: Prisma.Decimal | null; currentOdometer: Prisma.Decimal | null };
}): Promise<void> {
  const { tx, vehicleId, logDate, referenceCreatedAt, excludeLogId, resolved, vehicleBaseline } = params;

  const [priorLog, nextLog] = await Promise.all([
    findPriorChronologicalLog(tx, vehicleId, logDate, referenceCreatedAt, excludeLogId),
    findNextChronologicalLog(tx, vehicleId, logDate, referenceCreatedAt, excludeLogId),
  ]);

  if (priorLog) {
    assertNoRollback({
      newStartHourMeter: resolved.startHourMeter,
      newStartOdometer: resolved.startOdometer,
      priorEndHourMeter: priorLog.endHourMeter,
      priorEndOdometer: priorLog.endOdometer,
    });
  } else if (!(await hasAnyOtherLog(tx, vehicleId, excludeLogId))) {
    // Only meaningful when this is genuinely the sole log for the
    // vehicle — a baseline set on the vehicle doesn't necessarily predate
    // an even-earlier historical entry being backfilled among other logs.
    assertNoRollback({
      newStartHourMeter: resolved.startHourMeter,
      newStartOdometer: resolved.startOdometer,
      priorEndHourMeter: vehicleBaseline.currentHourMeter,
      priorEndOdometer: vehicleBaseline.currentOdometer,
    });
  }

  if (nextLog) {
    assertNoForwardOverrun({
      newEndHourMeter: resolved.endHourMeter,
      newEndOdometer: resolved.endOdometer,
      nextStartHourMeter: nextLog.startHourMeter,
      nextStartOdometer: nextLog.startOdometer,
    });
  }
}

export async function createDailyLog(input: unknown): Promise<ActionResult<{ id: string; flagged: boolean }>> {
  try {
    const actor = await requireCurrentUser();
    const resolved = await resolveInput(input, actor);
    await assertPeriodNotLocked({ companyId: actor.companyId, actorId: actor.id, date: resolved.logDate, entityType: "DailyLog", action: "dailyLog.create" });

    validateMeterReadings(resolved);
    const workingHours = computeWorkingHours(resolved.startHourMeter, resolved.endHourMeter);
    const distance = computeDistance(resolved.startOdometer, resolved.endOdometer);
    const jump = checkSuspiciousJump(workingHours, distance);

    const created = await prisma.$transaction(async (tx) => {
      const vehicle = await lockVehicleForUpdate(tx, resolved.vehicleId);

      await assertChronologyConsistent({
        tx,
        vehicleId: resolved.vehicleId,
        logDate: resolved.logDate,
        referenceCreatedAt: new Date(),
        resolved,
        vehicleBaseline: { currentHourMeter: vehicle.currentHourMeter, currentOdometer: vehicle.currentOdometer },
      });

      const log = await tx.dailyLog.create({
        data: {
          vehicleId: resolved.vehicleId,
          projectId: resolved.projectId,
          operatorId: resolved.operatorId,
          logDate: resolved.logDate,
          startHourMeter: resolved.startHourMeter,
          endHourMeter: resolved.endHourMeter,
          startOdometer: resolved.startOdometer,
          endOdometer: resolved.endOdometer,
          workingHours,
          distance,
          workDescription: resolved.workDescription,
          breakdownNotes: resolved.breakdownNotes,
          remarks: resolved.remarks,
          meterPhotoFileId: resolved.meterPhotoFileId,
          sitePhotoFileId: resolved.sitePhotoFileId,
          flaggedForReview: jump.flagged,
          flagReason: jump.reason,
          createdById: actor.id,
          updatedById: actor.id,
        },
      });

      // The vehicle row is locked (above), so this MAX-based advance is
      // race-free: a concurrent submission for the same vehicle must wait
      // for this transaction to commit before it can read/advance it.
      const advanced = computeAdvancedVehicleMeters({
        currentHourMeter: vehicle.currentHourMeter,
        currentOdometer: vehicle.currentOdometer,
        logEndHourMeter: resolved.endHourMeter,
        logEndOdometer: resolved.endOdometer,
      });
      await tx.vehicle.update({
        where: { id: resolved.vehicleId },
        data: { currentHourMeter: advanced.hourMeter, currentOdometer: advanced.odometer },
      });

      return log;
    });

    await recordAudit({
      companyId: actor.companyId,
      actorId: actor.id,
      action: "dailyLog.created",
      entityType: "DailyLog",
      entityId: created.id,
      afterValue: {
        vehicleId: created.vehicleId,
        operatorId: created.operatorId,
        logDate: created.logDate.toISOString(),
        workingHours: created.workingHours?.toString(),
        flagged: created.flaggedForReview,
      },
    });

    revalidatePath("/daily-logs");
    revalidatePath(`/vehicles/${resolved.vehicleId}`);
    revalidatePath("/dashboard");
    return ok(
      jump.flagged ? "Daily report saved — flagged for review due to an unusual reading." : "Daily report saved.",
      { id: created.id, flagged: jump.flagged },
    );
  } catch (error) {
    return toActionError(error);
  }
}

export async function updateDailyLog(logId: string, input: unknown): Promise<ActionResult> {
  try {
    const actor = await requireCurrentUser();
    // Company-scoped: an id alone must never be enough to reach another
    // company's record, even though this deployment only has one company
    // today.
    const existing = await prisma.dailyLog.findFirst({
      where: { id: logId, vehicle: { companyId: actor.companyId } },
    });
    if (!existing) return { success: false, message: "Daily log not found." };

    const isOwner = existing.operatorId === actor.id || existing.createdById === actor.id;
    if (!isOwner) {
      await requirePermission(actor, PERMISSIONS.DAILY_LOG_APPROVE);
    } else {
      const allowedSelfEdit = await can(actor, PERMISSIONS.DAILY_LOG_CREATE);
      if (!allowedSelfEdit) throw new AuthorizationError();
    }

    const resolved = await resolveInput(input, actor);
    // Editing to a different operator still requires DAILY_LOG_APPROVE,
    // enforced inside resolveInput via canActForOthers.

    // Both the log's existing date and its (possibly changed) new date
    // must be in an open period — blocks editing a log that already
    // sits in a closed month, and blocks moving a log into one.
    await assertPeriodNotLocked({ companyId: actor.companyId, actorId: actor.id, date: existing.logDate, entityType: "DailyLog", entityId: logId, action: "dailyLog.update" });
    if (resolved.logDate.getTime() !== existing.logDate.getTime()) {
      await assertPeriodNotLocked({ companyId: actor.companyId, actorId: actor.id, date: resolved.logDate, entityType: "DailyLog", entityId: logId, action: "dailyLog.update" });
    }

    validateMeterReadings(resolved);
    const workingHours = computeWorkingHours(resolved.startHourMeter, resolved.endHourMeter);
    const distance = computeDistance(resolved.startOdometer, resolved.endOdometer);
    const jump = checkSuspiciousJump(workingHours, distance);

    await prisma.$transaction(async (tx) => {
      const vehicle = await lockVehicleForUpdate(tx, resolved.vehicleId);

      await assertChronologyConsistent({
        tx,
        vehicleId: resolved.vehicleId,
        logDate: resolved.logDate,
        // Use the log's own original createdAt, not "now" — otherwise
        // every other same-day row would look like it came first.
        referenceCreatedAt: existing.createdAt,
        excludeLogId: logId,
        resolved,
        vehicleBaseline: { currentHourMeter: vehicle.currentHourMeter, currentOdometer: vehicle.currentOdometer },
      });

      await tx.dailyLog.update({
        where: { id: logId },
        data: {
          vehicleId: resolved.vehicleId,
          projectId: resolved.projectId,
          operatorId: resolved.operatorId,
          logDate: resolved.logDate,
          startHourMeter: resolved.startHourMeter,
          endHourMeter: resolved.endHourMeter,
          startOdometer: resolved.startOdometer,
          endOdometer: resolved.endOdometer,
          workingHours,
          distance,
          workDescription: resolved.workDescription,
          breakdownNotes: resolved.breakdownNotes,
          remarks: resolved.remarks,
          meterPhotoFileId: resolved.meterPhotoFileId,
          sitePhotoFileId: resolved.sitePhotoFileId,
          flaggedForReview: jump.flagged,
          flagReason: jump.reason,
          updatedById: actor.id,
        },
      });

      // Full recompute (not just forward-MAX) so an edit that lowers a
      // previously-maximum reading doesn't leave the vehicle's current
      // reading incorrectly stuck at the old, edited-away value. Safe
      // under the vehicle row lock held since the top of this transaction.
      const maxAgg = await tx.dailyLog.aggregate({
        where: { vehicleId: resolved.vehicleId, archivedAt: null },
        _max: { endHourMeter: true, endOdometer: true },
      });
      await tx.vehicle.update({
        where: { id: resolved.vehicleId },
        data: {
          currentHourMeter: maxAgg._max.endHourMeter ?? undefined,
          currentOdometer: maxAgg._max.endOdometer ?? undefined,
        },
      });
    });

    await recordAudit({
      companyId: actor.companyId,
      actorId: actor.id,
      action: "dailyLog.edited",
      entityType: "DailyLog",
      entityId: logId,
      beforeValue: {
        startHourMeter: existing.startHourMeter?.toString(),
        endHourMeter: existing.endHourMeter?.toString(),
        startOdometer: existing.startOdometer?.toString(),
        endOdometer: existing.endOdometer?.toString(),
      },
      afterValue: {
        startHourMeter: resolved.startHourMeter.toString(),
        endHourMeter: resolved.endHourMeter.toString(),
        startOdometer: resolved.startOdometer.toString(),
        endOdometer: resolved.endOdometer.toString(),
      },
    });

    revalidatePath("/daily-logs");
    revalidatePath(`/vehicles/${resolved.vehicleId}`);
    revalidatePath("/dashboard");
    return ok("Daily report updated.");
  } catch (error) {
    return toActionError(error);
  }
}
