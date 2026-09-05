"use server";

import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/db/prisma";
import { requireCurrentUserWithPermission } from "@/lib/auth/current-user";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { recordAudit } from "@/lib/audit/audit";
import { projectFormSchema } from "@/lib/validation/project";
import { assertValidProjectDates } from "@/lib/business/project";
import { ActionInputError, ok, toActionError, type ActionResult } from "./action-result";

function dateOrNull(value: string | undefined): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export async function createProject(input: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    const actor = await requireCurrentUserWithPermission(PERMISSIONS.PROJECT_MANAGE);
    const data = projectFormSchema.parse(input);

    const customer = await prisma.customer.findFirst({ where: { id: data.customerId, companyId: actor.companyId, archivedAt: null } });
    if (!customer) throw new ActionInputError("Selected customer was not found.");

    if (data.code) {
      const duplicate = await prisma.project.findFirst({ where: { companyId: actor.companyId, code: data.code } });
      if (duplicate) return { success: false, fieldErrors: { code: "This job number is already in use." } };
    }

    const startDate = dateOrNull(data.startDate);
    const endDate = dateOrNull(data.endDate);
    assertValidProjectDates(startDate, endDate);

    const project = await prisma.project.create({
      data: {
        companyId: actor.companyId,
        customerId: customer.id,
        name: data.name,
        code: data.code ?? null,
        siteLocation: data.siteLocation ?? null,
        status: data.status,
        startDate,
        endDate,
        notes: data.notes ?? null,
        createdById: actor.id,
        updatedById: actor.id,
      },
    });

    await recordAudit({
      companyId: actor.companyId,
      actorId: actor.id,
      action: "project.created",
      entityType: "Project",
      entityId: project.id,
      afterValue: { name: project.name, customerId: project.customerId, status: project.status },
    });

    revalidatePath("/projects");
    return ok("Project created.", { id: project.id });
  } catch (error) {
    return toActionError(error);
  }
}

export async function updateProject(projectId: string, input: unknown): Promise<ActionResult> {
  try {
    const actor = await requireCurrentUserWithPermission(PERMISSIONS.PROJECT_MANAGE);
    const data = projectFormSchema.parse(input);

    const before = await prisma.project.findFirst({ where: { id: projectId, companyId: actor.companyId } });
    if (!before) return { success: false, message: "Project not found." };

    const customer = await prisma.customer.findFirst({ where: { id: data.customerId, companyId: actor.companyId, archivedAt: null } });
    if (!customer) throw new ActionInputError("Selected customer was not found.");

    if (data.code) {
      const duplicate = await prisma.project.findFirst({ where: { companyId: actor.companyId, code: data.code, NOT: { id: projectId } } });
      if (duplicate) return { success: false, fieldErrors: { code: "This job number is already in use." } };
    }

    const startDate = dateOrNull(data.startDate);
    const endDate = dateOrNull(data.endDate);
    assertValidProjectDates(startDate, endDate);

    const project = await prisma.project.update({
      where: { id: projectId },
      data: {
        customerId: customer.id,
        name: data.name,
        code: data.code ?? null,
        siteLocation: data.siteLocation ?? null,
        status: data.status,
        startDate,
        endDate,
        notes: data.notes ?? null,
        updatedById: actor.id,
      },
    });

    if (before.status !== project.status) {
      await recordAudit({
        companyId: actor.companyId,
        actorId: actor.id,
        action: "project.status_changed",
        entityType: "Project",
        entityId: project.id,
        beforeValue: { status: before.status },
        afterValue: { status: project.status },
      });
    }
    await recordAudit({
      companyId: actor.companyId,
      actorId: actor.id,
      action: "project.updated",
      entityType: "Project",
      entityId: project.id,
      beforeValue: { name: before.name, siteLocation: before.siteLocation },
      afterValue: { name: project.name, siteLocation: project.siteLocation },
    });

    revalidatePath("/projects");
    revalidatePath(`/projects/${projectId}`);
    return ok("Project updated.");
  } catch (error) {
    return toActionError(error);
  }
}
