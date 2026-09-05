import "server-only";

import { prisma } from "@/lib/db/prisma";
import { isSuspiciousFuelQuantity } from "@/lib/business/fuel";
import { businessLocalDateParts } from "@/lib/business/business-time";
import type { ClosingChecklistCounts } from "@/lib/business/closing-period";

/** Calendar-date key matching the plain-UTC-midnight storage convention
 * used for every date-only field this module reads — see
 * business-time.ts#calendarMonthRange for why this isn't IST-adjusted. */
function dateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

/** Company-scoped single-period lookup for the Month Closing page —
 * includes the closed-by/reopened-by actor names the UI displays. Never
 * fetch a ClosingPeriod by id alone; an id from a URL/form is untrusted
 * and must always be scoped to the requesting company. */
export async function getClosingPeriodById(companyId: string, id: string) {
  return prisma.closingPeriod.findFirst({
    where: { id, companyId },
    include: {
      closedBy: { select: { name: true } },
      reopenedBy: { select: { name: true } },
    },
  });
}

/**
 * Company-scoped counts backing the month-end closing checklist (see
 * src/lib/business/closing-period.ts#buildClosingChecklist for how these
 * become blocker/warning items). `range` bounds are the ClosingPeriod's
 * own [startDate, endDate] — plain calendar instants, not business-
 * timezone-offset ones.
 */
export async function getClosingChecklistCounts(companyId: string, range: { startDate: Date; endDate: Date }): Promise<ClosingChecklistCounts> {
  const { startDate, endDate } = range;

  const [
    flaggedDailyLogCount,
    missingDailyLogVehicleCount,
    pendingExpenseCount,
    missingExpenseReceiptCount,
    fuelAnomalyCount,
    missingFuelReceiptCount,
    projectsMissingBillingConfigCount,
    unfinalizedBillingDraftCount,
    draftInvoiceCount,
  ] = await Promise.all([
    prisma.dailyLog.count({
      where: { vehicle: { companyId }, archivedAt: null, logDate: { gte: startDate, lte: endDate }, flaggedForReview: true },
    }),
    countWorkingVehiclesMissingADay(companyId, startDate, endDate),
    prisma.expense.count({
      where: { submittedBy: { companyId }, archivedAt: null, status: "PENDING", expenseDate: { gte: startDate, lte: endDate } },
    }),
    prisma.expense.count({
      where: { submittedBy: { companyId }, archivedAt: null, status: { not: "REJECTED" }, expenseDate: { gte: startDate, lte: endDate }, receiptFileId: null },
    }),
    countFuelAnomalies(companyId, startDate, endDate),
    prisma.fuelEntry.count({
      where: { vehicle: { companyId }, archivedAt: null, entryDate: { gte: startDate, lte: endDate }, receiptFileId: null },
    }),
    prisma.project.count({ where: { companyId, archivedAt: null, status: "ACTIVE", billingConfig: null } }),
    prisma.billingDraft.count({
      where: { companyId, status: { in: ["DRAFT", "REVIEW"] }, periodStart: { lte: endDate }, periodEnd: { gte: startDate } },
    }),
    prisma.invoice.count({
      where: { companyId, archivedAt: null, status: "DRAFT", issueDate: { gte: startDate, lte: endDate } },
    }),
  ]);

  return {
    flaggedDailyLogCount,
    missingDailyLogVehicleCount,
    pendingExpenseCount,
    missingExpenseReceiptCount,
    fuelAnomalyCount,
    missingFuelReceiptCount,
    projectsMissingBillingConfigCount,
    unfinalizedBillingDraftCount,
    draftInvoiceCount,
  };
}

/**
 * Counts currently-WORKING vehicles that have at least one calendar day
 * in [startDate, min(endDate, today)] with no DailyLog at all — never
 * flags a day that hasn't happened yet, so closing the current,
 * still-in-progress month doesn't spuriously warn about "missing" future
 * logs. Counts vehicles, not day-instances, per the checklist label.
 */
async function countWorkingVehiclesMissingADay(companyId: string, startDate: Date, endDate: Date): Promise<number> {
  const workingVehicles = await prisma.vehicle.findMany({
    where: { companyId, archivedAt: null, status: "WORKING" },
    select: { id: true },
  });
  if (workingVehicles.length === 0) return 0;

  // Business-local (Asia/Kolkata) calendar date of "now", represented as
  // a plain UTC-midnight instant to match logDate's own storage
  // convention (see dateKey above) — NOT a UTC slice of "now". Using the
  // UTC calendar date here would lag the true IST business day by up to
  // a full day during the ~00:00-05:29 IST window, which would let a
  // just-started IST business day still count as "today" from the
  // previous day's perspective.
  const { year: y, month: m, day: d } = businessLocalDateParts(new Date());
  const today = new Date(Date.UTC(y, m - 1, d));
  const effectiveEnd = endDate.getTime() < today.getTime() ? endDate : today;
  if (effectiveEnd.getTime() < startDate.getTime()) return 0;

  const logs = await prisma.dailyLog.findMany({
    where: { vehicleId: { in: workingVehicles.map((v) => v.id) }, archivedAt: null, logDate: { gte: startDate, lte: effectiveEnd } },
    select: { vehicleId: true, logDate: true },
  });
  const loggedDaysByVehicle = new Map<string, Set<string>>();
  for (const log of logs) {
    const set = loggedDaysByVehicle.get(log.vehicleId) ?? new Set<string>();
    set.add(dateKey(log.logDate));
    loggedDaysByVehicle.set(log.vehicleId, set);
  }

  const days: string[] = [];
  for (let d = startDate; d.getTime() <= effectiveEnd.getTime(); d = addDays(d, 1)) {
    days.push(dateKey(d));
  }

  let missingCount = 0;
  for (const vehicle of workingVehicles) {
    const loggedDays = loggedDaysByVehicle.get(vehicle.id) ?? new Set<string>();
    if (days.some((day) => !loggedDays.has(day))) missingCount++;
  }
  return missingCount;
}

/** FuelEntry has no persisted flag column (unlike DailyLog) — recomputed
 * on the fly from the same rule used at entry time (see
 * src/lib/actions/fuel.ts). */
async function countFuelAnomalies(companyId: string, startDate: Date, endDate: Date): Promise<number> {
  const entries = await prisma.fuelEntry.findMany({
    where: { vehicle: { companyId }, archivedAt: null, entryDate: { gte: startDate, lte: endDate } },
    select: { quantityLiters: true },
  });
  return entries.filter((e) => isSuspiciousFuelQuantity(e.quantityLiters)).length;
}
