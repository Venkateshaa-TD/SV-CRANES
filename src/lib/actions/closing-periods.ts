"use server";

import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/db/prisma";
import { requireCurrentUserWithPermission } from "@/lib/auth/current-user";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { recordAudit } from "@/lib/audit/audit";
import { selectMonthSchema, closeMonthSchema, reopenMonthSchema } from "@/lib/validation/closing-period";
import { calendarMonthRange } from "@/lib/business/business-time";
import { buildClosingChecklist, canClosePeriod, canReopenPeriod, validateCloseRequest, validateReopenReason } from "@/lib/business/closing-period";
import { getClosingChecklistCounts } from "@/lib/data/closing-queries";
import { ok, toActionError, type ActionResult } from "./action-result";

/**
 * Finds or creates the ClosingPeriod row for a given company/year/month
 * (defaulting to OPEN) — purely bookkeeping, so this is gated behind the
 * read permission (CLOSING_VIEW), not CLOSING_MANAGE: selecting a month
 * to inspect its checklist shouldn't require the higher permission that
 * governs actually closing it.
 */
export async function getOrCreateClosingPeriod(input: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    const actor = await requireCurrentUserWithPermission(PERMISSIONS.CLOSING_VIEW);
    const data = selectMonthSchema.parse(input);
    const { startDate, endDate } = calendarMonthRange(data.year, data.month);

    const period = await prisma.closingPeriod.upsert({
      where: { companyId_year_month: { companyId: actor.companyId, year: data.year, month: data.month } },
      update: {},
      create: { companyId: actor.companyId, year: data.year, month: data.month, startDate, endDate, status: "OPEN" },
    });

    return ok(undefined, { id: period.id });
  } catch (error) {
    return toActionError(error);
  }
}

export async function markPeriodInReview(periodId: string): Promise<ActionResult> {
  try {
    const actor = await requireCurrentUserWithPermission(PERMISSIONS.CLOSING_MANAGE);
    const period = await prisma.closingPeriod.findFirst({ where: { id: periodId, companyId: actor.companyId } });
    if (!period) return { success: false, message: "Closing period not found." };
    if (period.status !== "OPEN") return { success: false, message: `This month is already ${period.status.toLowerCase()}.` };

    const result = await prisma.closingPeriod.updateMany({ where: { id: periodId, status: "OPEN" }, data: { status: "REVIEW" } });
    if (result.count === 0) return { success: false, message: "This month's status changed before the request completed. Please retry." };

    await recordAudit({ companyId: actor.companyId, actorId: actor.id, action: "closingPeriod.review_started", entityType: "ClosingPeriod", entityId: periodId });

    revalidatePath("/finance/closing");
    return ok("Month moved to review.");
  } catch (error) {
    return toActionError(error);
  }
}

/**
 * Closes a month, atomically: re-runs the checklist right before writing
 * (never trusts a possibly-stale client-side view), rejects outright if
 * any blocker remains, requires a reason if any warning remains, and
 * uses an atomic updateMany guard (re-asserting the pre-close status in
 * the same UPDATE) so two concurrent close requests can't both succeed.
 */
export async function closeMonth(input: unknown): Promise<ActionResult> {
  try {
    const actor = await requireCurrentUserWithPermission(PERMISSIONS.CLOSING_MANAGE);
    const data = closeMonthSchema.parse(input);

    const period = await prisma.closingPeriod.findFirst({ where: { id: data.periodId, companyId: actor.companyId } });
    if (!period) return { success: false, message: "Closing period not found." };
    if (!canClosePeriod(period.status)) {
      return { success: false, message: `This month is ${period.status.toLowerCase()} and cannot be closed directly.` };
    }

    // Final validation — recomputed fresh, not trusted from an earlier
    // page load.
    const counts = await getClosingChecklistCounts(actor.companyId, { startDate: period.startDate, endDate: period.endDate });
    const checklist = buildClosingChecklist(counts);
    validateCloseRequest({ blockerCount: checklist.blockerCount, warningCount: checklist.warningCount, overrideReason: data.overrideReason });

    const result = await prisma.closingPeriod.updateMany({
      where: { id: data.periodId, status: period.status },
      data: { status: "CLOSED", closedAt: new Date(), closedById: actor.id, overrideReason: checklist.warningCount > 0 ? data.overrideReason : null },
    });
    if (result.count === 0) {
      return { success: false, message: "This month's status changed before closing could complete. Please retry." };
    }

    if (checklist.warningCount > 0) {
      await recordAudit({
        companyId: actor.companyId,
        actorId: actor.id,
        action: "closingPeriod.validation_overridden",
        entityType: "ClosingPeriod",
        entityId: data.periodId,
        reason: data.overrideReason,
        afterValue: { warningCount: checklist.warningCount, items: checklist.items.filter((i) => i.count > 0).map((i) => ({ key: i.key, count: i.count })) },
      });
    }
    await recordAudit({
      companyId: actor.companyId,
      actorId: actor.id,
      action: "closingPeriod.closed",
      entityType: "ClosingPeriod",
      entityId: data.periodId,
      afterValue: { year: period.year, month: period.month, warningCount: checklist.warningCount },
    });

    revalidatePath("/finance/closing");
    return ok(`${period.year}-${String(period.month).padStart(2, "0")} closed.`);
  } catch (error) {
    return toActionError(error);
  }
}

/**
 * Reopens a CLOSED month — requires CLOSING_REOPEN (a dedicated, narrow
 * override in the same style as CUSTOMER_FINANCIAL_EDIT, never implied
 * by CLOSING_MANAGE) and a non-empty reason. Never automatic.
 */
export async function reopenMonth(input: unknown): Promise<ActionResult> {
  try {
    const actor = await requireCurrentUserWithPermission(PERMISSIONS.CLOSING_REOPEN);
    const data = reopenMonthSchema.parse(input);
    validateReopenReason(data.reason);

    const period = await prisma.closingPeriod.findFirst({ where: { id: data.periodId, companyId: actor.companyId } });
    if (!period) return { success: false, message: "Closing period not found." };
    if (!canReopenPeriod(period.status)) {
      return { success: false, message: `Only a closed month can be reopened (this one is ${period.status.toLowerCase()}).` };
    }

    const result = await prisma.closingPeriod.updateMany({
      where: { id: data.periodId, status: "CLOSED" },
      data: { status: "REOPENED", reopenedAt: new Date(), reopenedById: actor.id, reopenReason: data.reason },
    });
    if (result.count === 0) {
      return { success: false, message: "This month is no longer closed — someone else may have already reopened it." };
    }

    await recordAudit({
      companyId: actor.companyId,
      actorId: actor.id,
      action: "closingPeriod.reopened",
      entityType: "ClosingPeriod",
      entityId: data.periodId,
      reason: data.reason,
      afterValue: { year: period.year, month: period.month },
    });

    revalidatePath("/finance/closing");
    return ok(`${period.year}-${String(period.month).padStart(2, "0")} reopened.`);
  } catch (error) {
    return toActionError(error);
  }
}
