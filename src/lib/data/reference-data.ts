import "server-only";

import { prisma } from "@/lib/db/prisma";

/** Lightweight option lists for form <select>s. Scoped to the company and
 * to active/non-archived records only. */

export async function listActiveVehicleOptions(companyId: string) {
  return prisma.vehicle.findMany({
    where: { companyId, archivedAt: null },
    select: { id: true, name: true, code: true, registrationNumber: true, category: true },
    orderBy: { name: "asc" },
  });
}

export async function listActiveEmployeeOptions(companyId: string) {
  return prisma.user.findMany({
    where: { companyId, archivedAt: null, isActive: true },
    select: { id: true, name: true, role: true, employeeCode: true },
    orderBy: { name: "asc" },
  });
}

export async function listActiveProjectOptions(companyId: string) {
  return prisma.project.findMany({
    where: { companyId, archivedAt: null },
    select: { id: true, name: true, code: true },
    orderBy: { name: "asc" },
  });
}

export async function listActiveExpenseCategoryOptions(companyId: string) {
  return prisma.expenseCategory.findMany({
    where: { companyId, isActive: true },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
}
