import "server-only";

import { prisma } from "@/lib/db/prisma";
import { recordAudit } from "@/lib/audit/audit";
import { PeriodLockedError } from "@/lib/business/closing-period";

/**
 * The single enforcement point for month-end period locks — every
 * date-bearing mutation across DailyLog, FuelEntry, Expense, Invoice,
 * Payment, and PaymentAllocation calls this before writing. A month with
 * no ClosingPeriod row is implicitly OPEN (unlocked); REOPENED behaves
 * like OPEN. Only CLOSED blocks. Never bypassed for any role, including
 * SUPER_ADMIN — reopening the period is the only sanctioned way past
 * this, by design (see src/lib/actions/closing-periods.ts#reopenMonth).
 */
export async function getClosingPeriodStatusForDate(companyId: string, date: Date) {
  return prisma.closingPeriod.findFirst({
    where: { companyId, startDate: { lte: date }, endDate: { gte: date } },
    select: { id: true, status: true, year: true, month: true },
  });
}

/**
 * Throws PeriodLockedError (and records an audit entry for the blocked
 * attempt) if `date` falls inside a CLOSED accounting period for this
 * company. Call this from server actions only, after resolving the
 * record's company-scoped date but before any write — never rely on the
 * client having hidden the form for a closed month; this is the real
 * enforcement, independent of what the UI shows.
 */
export async function assertPeriodNotLocked(params: {
  companyId: string;
  actorId: string;
  date: Date;
  entityType: string;
  entityId?: string | null;
  /** Short label for the blocked-attempt audit entry, e.g. "dailyLog.create". */
  action: string;
}): Promise<void> {
  const period = await getClosingPeriodStatusForDate(params.companyId, params.date);
  if (!period || period.status !== "CLOSED") return;

  const periodLabel = `${period.year}-${String(period.month).padStart(2, "0")}`;

  await recordAudit({
    companyId: params.companyId,
    actorId: params.actorId,
    action: "closingPeriod.locked_edit_attempt",
    entityType: params.entityType,
    entityId: params.entityId ?? null,
    reason: `Blocked ${params.action} — ${periodLabel} is closed.`,
    afterValue: { attemptedAction: params.action, periodId: period.id, period: periodLabel },
  });

  throw new PeriodLockedError(
    `This record's date falls in ${periodLabel}, which is closed for editing. An authorized user must reopen the month first.`,
  );
}
