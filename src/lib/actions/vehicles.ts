"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/db/prisma";
import { requireCurrentUserWithPermission } from "@/lib/auth/current-user";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { recordAudit } from "@/lib/audit/audit";
import { vehicleFormSchema } from "@/lib/validation/vehicle";
import { ActionInputError, ok, toActionError, type ActionResult } from "./action-result";

function decimalOrNull(value: string | undefined): Prisma.Decimal | null {
  if (!value || value.length === 0) return null;
  return new Prisma.Decimal(value);
}

function dateOrNull(value: string | undefined): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

async function assertOperatorBelongsToCompany(operatorId: string | undefined, companyId: string) {
  if (!operatorId) return;
  const operator = await prisma.user.findFirst({ where: { id: operatorId, companyId, archivedAt: null } });
  if (!operator) {
    throw new ActionInputError("Selected operator was not found.");
  }
}

export async function createVehicle(input: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    const user = await requireCurrentUserWithPermission(PERMISSIONS.VEHICLE_MANAGE);
    const data = vehicleFormSchema.parse(input);
    await assertOperatorBelongsToCompany(data.assignedOperatorId, user.companyId);

    const existing = await prisma.vehicle.findUnique({ where: { registrationNumber: data.registrationNumber } });
    if (existing) {
      return { success: false, fieldErrors: { registrationNumber: "This registration number is already in use." } };
    }

    const vehicle = await prisma.vehicle.create({
      data: {
        companyId: user.companyId,
        name: data.name,
        registrationNumber: data.registrationNumber,
        code: data.code ?? null,
        category: data.category,
        status: data.status,
        capacityTons: decimalOrNull(data.capacityTons),
        make: data.make ?? null,
        model: data.model ?? null,
        year: data.year ?? null,
        fuelType: data.fuelType ?? null,
        currentHourMeter: decimalOrNull(data.currentHourMeter),
        currentOdometer: decimalOrNull(data.currentOdometer),
        assignedOperatorId: data.assignedOperatorId ?? null,
        purchaseDate: dateOrNull(data.purchaseDate),
        purchaseAmount: decimalOrNull(data.purchaseAmount),
        imageFileId: data.imageFileId ?? null,
        notes: data.notes ?? null,
        createdById: user.id,
        updatedById: user.id,
      },
    });

    await recordAudit({
      companyId: user.companyId,
      actorId: user.id,
      action: "vehicle.created",
      entityType: "Vehicle",
      entityId: vehicle.id,
      afterValue: { name: vehicle.name, registrationNumber: vehicle.registrationNumber, status: vehicle.status },
    });

    revalidatePath("/vehicles");
    return ok("Vehicle created.", { id: vehicle.id });
  } catch (error) {
    return toActionError(error);
  }
}

export async function updateVehicle(vehicleId: string, input: unknown): Promise<ActionResult> {
  try {
    const user = await requireCurrentUserWithPermission(PERMISSIONS.VEHICLE_MANAGE);
    const data = vehicleFormSchema.parse(input);
    await assertOperatorBelongsToCompany(data.assignedOperatorId, user.companyId);

    const before = await prisma.vehicle.findFirst({ where: { id: vehicleId, companyId: user.companyId } });
    if (!before) {
      return { success: false, message: "Vehicle not found." };
    }

    const duplicateRegistration = await prisma.vehicle.findFirst({
      where: { registrationNumber: data.registrationNumber, NOT: { id: vehicleId } },
    });
    if (duplicateRegistration) {
      return { success: false, fieldErrors: { registrationNumber: "This registration number is already in use." } };
    }

    const vehicle = await prisma.vehicle.update({
      where: { id: vehicleId },
      data: {
        name: data.name,
        registrationNumber: data.registrationNumber,
        code: data.code ?? null,
        category: data.category,
        status: data.status,
        capacityTons: decimalOrNull(data.capacityTons),
        make: data.make ?? null,
        model: data.model ?? null,
        year: data.year ?? null,
        fuelType: data.fuelType ?? null,
        currentHourMeter: decimalOrNull(data.currentHourMeter),
        currentOdometer: decimalOrNull(data.currentOdometer),
        assignedOperatorId: data.assignedOperatorId ?? null,
        purchaseDate: dateOrNull(data.purchaseDate),
        purchaseAmount: decimalOrNull(data.purchaseAmount),
        imageFileId: data.imageFileId ?? null,
        notes: data.notes ?? null,
        updatedById: user.id,
      },
    });

    await recordAudit({
      companyId: user.companyId,
      actorId: user.id,
      action: "vehicle.updated",
      entityType: "Vehicle",
      entityId: vehicle.id,
      beforeValue: {
        name: before.name,
        status: before.status,
        currentHourMeter: before.currentHourMeter?.toString() ?? null,
        currentOdometer: before.currentOdometer?.toString() ?? null,
        assignedOperatorId: before.assignedOperatorId,
      },
      afterValue: {
        name: vehicle.name,
        status: vehicle.status,
        currentHourMeter: vehicle.currentHourMeter?.toString() ?? null,
        currentOdometer: vehicle.currentOdometer?.toString() ?? null,
        assignedOperatorId: vehicle.assignedOperatorId,
      },
    });

    revalidatePath("/vehicles");
    revalidatePath(`/vehicles/${vehicleId}`);
    return ok("Vehicle updated.");
  } catch (error) {
    return toActionError(error);
  }
}

export async function archiveVehicle(vehicleId: string): Promise<ActionResult> {
  try {
    const user = await requireCurrentUserWithPermission(PERMISSIONS.VEHICLE_MANAGE);
    const vehicle = await prisma.vehicle.findFirst({ where: { id: vehicleId, companyId: user.companyId } });
    if (!vehicle) return { success: false, message: "Vehicle not found." };

    await prisma.vehicle.update({
      where: { id: vehicleId },
      data: { archivedAt: new Date(), isActive: false, updatedById: user.id },
    });

    await recordAudit({
      companyId: user.companyId,
      actorId: user.id,
      action: "vehicle.archived",
      entityType: "Vehicle",
      entityId: vehicleId,
    });

    revalidatePath("/vehicles");
    revalidatePath(`/vehicles/${vehicleId}`);
    return ok("Vehicle archived.");
  } catch (error) {
    return toActionError(error);
  }
}

export async function restoreVehicle(vehicleId: string): Promise<ActionResult> {
  try {
    const user = await requireCurrentUserWithPermission(PERMISSIONS.VEHICLE_MANAGE);
    const vehicle = await prisma.vehicle.findFirst({ where: { id: vehicleId, companyId: user.companyId } });
    if (!vehicle) return { success: false, message: "Vehicle not found." };

    await prisma.vehicle.update({
      where: { id: vehicleId },
      data: { archivedAt: null, isActive: true, updatedById: user.id },
    });

    await recordAudit({
      companyId: user.companyId,
      actorId: user.id,
      action: "vehicle.restored",
      entityType: "Vehicle",
      entityId: vehicleId,
    });

    revalidatePath("/vehicles");
    revalidatePath(`/vehicles/${vehicleId}`);
    return ok("Vehicle restored.");
  } catch (error) {
    return toActionError(error);
  }
}
