"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/db/prisma";
import { requireCurrentUserWithPermission } from "@/lib/auth/current-user";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { recordAudit } from "@/lib/audit/audit";
import { projectVehicleAssignmentFormSchema, endAssignmentSchema } from "@/lib/validation/project";
import { assertNoOverlappingAssignment } from "@/lib/business/project";
import { ActionInputError, ok, toActionError, type ActionResult } from "./action-result";

/** Locks the vehicle row for the rest of the transaction so two
 * assignment requests for the same vehicle can't race past each other's
 * overlap check — mirrors the same pattern used for DailyLog chronology
 * in src/lib/actions/daily-logs.ts. */
async function lockVehicleForUpdate(tx: Prisma.TransactionClient, vehicleId: string) {
  await tx.$executeRaw`SELECT id FROM "Vehicle" WHERE id = ${vehicleId} FOR UPDATE`;
}

export async function assignVehicleToProject(projectId: string, input: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    const actor = await requireCurrentUserWithPermission(PERMISSIONS.PROJECT_MANAGE);
    const data = projectVehicleAssignmentFormSchema.parse(input);

    const project = await prisma.project.findFirst({ where: { id: projectId, companyId: actor.companyId } });
    if (!project) return { success: false, message: "Project not found." };

    const vehicle = await prisma.vehicle.findFirst({ where: { id: data.vehicleId, companyId: actor.companyId, archivedAt: null } });
    if (!vehicle) throw new ActionInputError("Selected vehicle was not found.");

    const assignedFrom = new Date(data.assignedFrom);
    if (Number.isNaN(assignedFrom.getTime())) throw new ActionInputError("Enter a valid start date.");
    const assignedTo = data.assignedTo ? new Date(data.assignedTo) : null;
    if (data.assignedTo && Number.isNaN(assignedTo?.getTime())) throw new ActionInputError("Enter a valid end date.");

    const created = await prisma.$transaction(async (tx) => {
      await lockVehicleForUpdate(tx, vehicle.id);

      // Every other assignment for this vehicle, company-wide (a vehicle
      // can only do one job at a time regardless of project) — not just
      // this project's own assignment history.
      const existing = await tx.projectVehicleAssignment.findMany({
        where: { vehicleId: vehicle.id, project: { companyId: actor.companyId } },
        select: { id: true, assignedFrom: true, assignedTo: true },
      });
      assertNoOverlappingAssignment({ assignedFrom, assignedTo }, existing);

      return tx.projectVehicleAssignment.create({
        data: {
          projectId: project.id,
          vehicleId: vehicle.id,
          assignedFrom,
          assignedTo,
          notes: data.notes ?? null,
          createdById: actor.id,
        },
      });
    });

    await recordAudit({
      companyId: actor.companyId,
      actorId: actor.id,
      action: "projectVehicleAssignment.created",
      entityType: "ProjectVehicleAssignment",
      entityId: created.id,
      afterValue: { projectId: project.id, vehicleId: vehicle.id, assignedFrom: assignedFrom.toISOString() },
    });

    revalidatePath(`/projects/${projectId}`);
    revalidatePath(`/vehicles/${vehicle.id}`);
    return ok("Vehicle assigned to project.", { id: created.id });
  } catch (error) {
    return toActionError(error);
  }
}

export async function endVehicleAssignment(input: unknown): Promise<ActionResult> {
  try {
    const actor = await requireCurrentUserWithPermission(PERMISSIONS.PROJECT_MANAGE);
    const data = endAssignmentSchema.parse(input);

    const assignment = await prisma.projectVehicleAssignment.findFirst({
      where: { id: data.assignmentId, project: { companyId: actor.companyId } },
    });
    if (!assignment) return { success: false, message: "Assignment not found." };

    const assignedTo = new Date(data.assignedTo);
    if (Number.isNaN(assignedTo.getTime())) throw new ActionInputError("Enter a valid end date.");
    if (assignedTo.getTime() <= assignment.assignedFrom.getTime()) {
      throw new ActionInputError("End date must be after the assignment's start date.");
    }

    await prisma.projectVehicleAssignment.update({ where: { id: assignment.id }, data: { assignedTo } });

    await recordAudit({
      companyId: actor.companyId,
      actorId: actor.id,
      action: "projectVehicleAssignment.ended",
      entityType: "ProjectVehicleAssignment",
      entityId: assignment.id,
      afterValue: { assignedTo: assignedTo.toISOString() },
    });

    revalidatePath(`/projects/${assignment.projectId}`);
    revalidatePath(`/vehicles/${assignment.vehicleId}`);
    return ok("Assignment ended.");
  } catch (error) {
    return toActionError(error);
  }
}
