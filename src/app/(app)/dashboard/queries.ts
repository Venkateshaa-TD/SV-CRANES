import "server-only";

import { prisma } from "@/lib/db/prisma";
import { startOfBusinessDay, startOfBusinessMonth, startOfBusinessWeek, startOfNextBusinessDay } from "@/lib/business/business-time";

export type DashboardPeriod = "today" | "week" | "month";

export function getPeriodRange(period: DashboardPeriod, now: Date = new Date()): { start: Date; label: string } {
  switch (period) {
    case "today":
      return { start: startOfBusinessDay(now), label: "Today" };
    case "week":
      return { start: startOfBusinessWeek(now), label: "This Week" };
    case "month":
    default:
      return { start: startOfBusinessMonth(now), label: "This Month" };
  }
}

/**
 * Real read-only aggregates for the dashboard cards — every number here
 * is a live query, not sample data.
 *
 * Source-of-truth note on "Approved Expenses": FuelEntry is the
 * authoritative record of fuel cost (shown separately as "Fuel Cost"
 * below). The ExpenseCategory list also includes a "Fuel" category for
 * cases that don't fit the structured fuel-entry flow, but if that
 * category's expenses were included here too, fuel spend would be
 * double-counted against the same money. They're deliberately excluded
 * from this total for that reason.
 */
export async function getDashboardStats(companyId: string, period: DashboardPeriod) {
  const { start } = getPeriodRange(period);

  const [vehicleStatusCounts, workingHoursAgg, fuelAgg, otherExpenseAgg] = await Promise.all([
    prisma.vehicle.groupBy({
      by: ["status"],
      where: { companyId, archivedAt: null },
      _count: { _all: true },
    }),
    prisma.dailyLog.aggregate({
      where: { vehicle: { companyId }, logDate: { gte: start }, archivedAt: null },
      _sum: { workingHours: true },
    }),
    prisma.fuelEntry.aggregate({
      where: { vehicle: { companyId }, entryDate: { gte: start }, archivedAt: null },
      _sum: { quantityLiters: true, totalCost: true },
    }),
    prisma.expense.aggregate({
      where: {
        expenseDate: { gte: start },
        archivedAt: null,
        status: "APPROVED",
        submittedBy: { companyId },
        category: { name: { not: "Fuel" } },
      },
      _sum: { amount: true },
    }),
  ]);

  const countByStatus = (status: string) => vehicleStatusCounts.find((row) => row.status === status)?._count._all ?? 0;
  const totalVehicles = vehicleStatusCounts.reduce((sum, row) => sum + row._count._all, 0);

  return {
    totalVehicles,
    working: countByStatus("WORKING"),
    idle: countByStatus("IDLE"),
    maintenance: countByStatus("MAINTENANCE"),
    workingHours: Number(workingHoursAgg._sum.workingHours ?? 0),
    fuelLiters: Number(fuelAgg._sum.quantityLiters ?? 0),
    fuelCost: Number(fuelAgg._sum.totalCost ?? 0),
    approvedOtherExpenses: Number(otherExpenseAgg._sum.amount ?? 0),
  };
}

export async function getRecentDailyLogs(companyId: string) {
  return prisma.dailyLog.findMany({
    where: { vehicle: { companyId }, archivedAt: null },
    include: { vehicle: { select: { name: true } }, operator: { select: { name: true } } },
    orderBy: { createdAt: "desc" },
    take: 5,
  });
}

export async function getRecentFuelEntries(companyId: string) {
  return prisma.fuelEntry.findMany({
    where: { vehicle: { companyId }, archivedAt: null },
    include: { vehicle: { select: { name: true } } },
    orderBy: { createdAt: "desc" },
    take: 5,
  });
}

export async function getPendingExpenseCount(companyId: string) {
  return prisma.expense.count({ where: { status: "PENDING", archivedAt: null, submittedBy: { companyId } } });
}

/**
 * Missing-log rule: a WORKING, active, non-archived vehicle with no daily
 * log dated today (business-timezone "today" — see business-time.ts).
 * Only WORKING vehicles are considered — an idle or in-maintenance
 * vehicle isn't expected to have logged work, so flagging it would be
 * noise, not a meaningful exception.
 */
export async function getWorkingVehiclesMissingTodaysLog(companyId: string) {
  const today = startOfBusinessDay();
  const tomorrow = startOfNextBusinessDay();

  const workingVehicles = await prisma.vehicle.findMany({
    where: { companyId, status: "WORKING", archivedAt: null },
    select: { id: true, name: true, registrationNumber: true },
  });
  if (workingVehicles.length === 0) return [];

  const loggedVehicleIds = await prisma.dailyLog.findMany({
    where: { vehicleId: { in: workingVehicles.map((v) => v.id) }, logDate: { gte: today, lt: tomorrow }, archivedAt: null },
    select: { vehicleId: true },
    distinct: ["vehicleId"],
  });
  const loggedSet = new Set(loggedVehicleIds.map((l) => l.vehicleId));

  return workingVehicles.filter((v) => !loggedSet.has(v.id));
}
