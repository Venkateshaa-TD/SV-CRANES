"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/db/prisma";
import { requireCurrentUserWithPermission } from "@/lib/auth/current-user";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { recordAudit } from "@/lib/audit/audit";
import { fuelFormSchema } from "@/lib/validation/fuel";
import { computeFuelTotal, isSuspiciousFuelQuantity, validateFuelQuantities } from "@/lib/business/fuel";
import { ActionInputError, ok, toActionError, type ActionResult } from "./action-result";

function decimalOrNull(value: string | undefined): Prisma.Decimal | null {
  if (!value || value.length === 0) return null;
  return new Prisma.Decimal(value);
}

async function resolveFuelInput(input: unknown, companyId: string) {
  const data = fuelFormSchema.parse(input);

  const vehicle = await prisma.vehicle.findFirst({ where: { id: data.vehicleId, companyId, archivedAt: null } });
  if (!vehicle) throw new ActionInputError("Selected vehicle was not found.");

  if (data.projectId) {
    const project = await prisma.project.findFirst({ where: { id: data.projectId, companyId } });
    if (!project) throw new ActionInputError("Selected project was not found.");
  }

  const quantityLiters = new Prisma.Decimal(data.quantityLiters);
  const ratePerLiter = new Prisma.Decimal(data.ratePerLiter);
  validateFuelQuantities({ quantityLiters, ratePerLiter });
  // Server-authoritative total — the client's computed preview is never
  // trusted or persisted directly.
  const totalCost = computeFuelTotal(quantityLiters, ratePerLiter);
  const flagged = isSuspiciousFuelQuantity(quantityLiters);

  const entryDate = new Date(`${data.entryDate}T${data.entryTime || "00:00"}`);
  if (Number.isNaN(entryDate.getTime())) throw new ActionInputError("Enter a valid date.");

  return {
    vehicleId: vehicle.id,
    projectId: data.projectId ?? null,
    entryDate,
    fuelType: data.fuelType,
    quantityLiters,
    ratePerLiter,
    totalCost,
    odometerAtFill: decimalOrNull(data.odometerAtFill),
    hourMeterAtFill: decimalOrNull(data.hourMeterAtFill),
    vendorName: data.vendorName ?? null,
    notes: data.notes ?? null,
    receiptFileId: data.receiptFileId ?? null,
    flagged,
  };
}

export async function createFuelEntry(input: unknown): Promise<ActionResult<{ id: string; flagged: boolean }>> {
  try {
    const actor = await requireCurrentUserWithPermission(PERMISSIONS.FUEL_CREATE);
    const resolved = await resolveFuelInput(input, actor.companyId);

    const entry = await prisma.fuelEntry.create({
      data: { ...resolved, createdById: actor.id, updatedById: actor.id },
    });

    await recordAudit({
      companyId: actor.companyId,
      actorId: actor.id,
      action: "fuelEntry.created",
      entityType: "FuelEntry",
      entityId: entry.id,
      afterValue: {
        vehicleId: entry.vehicleId,
        quantityLiters: entry.quantityLiters.toString(),
        totalCost: entry.totalCost.toString(),
        flagged: resolved.flagged,
      },
    });

    revalidatePath("/fuel");
    revalidatePath(`/vehicles/${entry.vehicleId}`);
    revalidatePath("/dashboard");
    return ok(
      resolved.flagged ? "Fuel entry added — quantity is unusually high and was flagged for review." : "Fuel entry added.",
      { id: entry.id, flagged: resolved.flagged },
    );
  } catch (error) {
    return toActionError(error);
  }
}

export async function updateFuelEntry(entryId: string, input: unknown): Promise<ActionResult> {
  try {
    const actor = await requireCurrentUserWithPermission(PERMISSIONS.FUEL_CREATE);
    const before = await prisma.fuelEntry.findFirst({
      where: { id: entryId, vehicle: { companyId: actor.companyId } },
    });
    if (!before) return { success: false, message: "Fuel entry not found." };

    const resolved = await resolveFuelInput(input, actor.companyId);

    const entry = await prisma.fuelEntry.update({
      where: { id: entryId },
      data: { ...resolved, updatedById: actor.id },
    });

    await recordAudit({
      companyId: actor.companyId,
      actorId: actor.id,
      action: "fuelEntry.edited",
      entityType: "FuelEntry",
      entityId: entry.id,
      beforeValue: { quantityLiters: before.quantityLiters.toString(), totalCost: before.totalCost.toString() },
      afterValue: { quantityLiters: entry.quantityLiters.toString(), totalCost: entry.totalCost.toString() },
    });

    revalidatePath("/fuel");
    revalidatePath(`/vehicles/${entry.vehicleId}`);
    revalidatePath("/dashboard");
    return ok("Fuel entry updated.");
  } catch (error) {
    return toActionError(error);
  }
}
