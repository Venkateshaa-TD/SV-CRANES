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

export async function listActiveCustomerOptions(companyId: string) {
  return prisma.customer.findMany({
    where: { companyId, archivedAt: null },
    select: { id: true, name: true, customerCode: true },
    orderBy: { name: "asc" },
  });
}

/** Vehicles not already carrying an open-ended (currently active)
 * assignment to some other project — the practical pool available to
 * assign next. A vehicle whose only assignments are closed (assignedTo
 * set) is still offered here. */
export async function listAssignableVehicleOptions(companyId: string) {
  const vehicles = await prisma.vehicle.findMany({
    where: { companyId, archivedAt: null },
    select: {
      id: true,
      name: true,
      code: true,
      registrationNumber: true,
      projectAssignments: { where: { assignedTo: null }, select: { projectId: true }, take: 1 },
    },
    orderBy: { name: "asc" },
  });
  return vehicles.map((v) => ({
    id: v.id,
    name: v.name,
    code: v.code,
    registrationNumber: v.registrationNumber,
    currentlyAssigned: v.projectAssignments.length > 0,
  }));
}
