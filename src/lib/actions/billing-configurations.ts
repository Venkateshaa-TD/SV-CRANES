"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/db/prisma";
import { requireCurrentUserWithPermission } from "@/lib/auth/current-user";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { recordAudit } from "@/lib/audit/audit";
import { billingConfigurationFormSchema } from "@/lib/validation/billing-configuration";
import { validateBillingConfig } from "@/lib/business/billing";
import { ok, toActionError, type ActionResult } from "./action-result";

function decimalOrNull(value: string | undefined): Prisma.Decimal | null {
  if (!value || value.length === 0) return null;
  return new Prisma.Decimal(value);
}

/** Creates or replaces a project's billing terms. This is intentionally
 * mutable in place (not versioned) — see the model comment on
 * BillingConfiguration: every past BillingDraft/Invoice already
 * snapshotted its own rate, so changing this never rewrites history. */
export async function upsertBillingConfiguration(projectId: string, input: unknown): Promise<ActionResult> {
  try {
    const actor = await requireCurrentUserWithPermission(PERMISSIONS.BILLING_MANAGE);
    const data = billingConfigurationFormSchema.parse(input);

    const project = await prisma.project.findFirst({ where: { id: projectId, companyId: actor.companyId } });
    if (!project) return { success: false, message: "Project not found." };

    validateBillingConfig({
      billingType: data.billingType,
      baseRate: data.baseRate,
      minimumGuaranteedHours: data.minimumGuaranteedHours,
      overtimeThresholdHours: data.overtimeThresholdHours,
      overtimeRate: data.overtimeRate,
      taxPercent: data.taxPercent,
    });

    const before = await prisma.billingConfiguration.findUnique({ where: { projectId } });

    const configData = {
      billingType: data.billingType,
      baseRate: new Prisma.Decimal(data.baseRate),
      minimumGuaranteedHours: decimalOrNull(data.minimumGuaranteedHours),
      overtimeThresholdHours: decimalOrNull(data.overtimeThresholdHours),
      overtimeRate: decimalOrNull(data.overtimeRate),
      mobilisationCharge: decimalOrNull(data.mobilisationCharge),
      demobilisationCharge: decimalOrNull(data.demobilisationCharge),
      taxPercent: new Prisma.Decimal(data.taxPercent ?? 0),
      billingNotes: data.billingNotes ?? null,
    };

    const config = await prisma.billingConfiguration.upsert({
      where: { projectId },
      create: { projectId, ...configData, createdById: actor.id, updatedById: actor.id },
      update: { ...configData, updatedById: actor.id },
    });

    await recordAudit({
      companyId: actor.companyId,
      actorId: actor.id,
      action: before ? "billingConfiguration.updated" : "billingConfiguration.created",
      entityType: "BillingConfiguration",
      entityId: config.id,
      beforeValue: before
        ? { billingType: before.billingType, baseRate: before.baseRate.toString() }
        : null,
      afterValue: { billingType: config.billingType, baseRate: config.baseRate.toString() },
    });

    revalidatePath(`/projects/${projectId}`);
    return ok("Billing configuration saved.");
  } catch (error) {
    return toActionError(error);
  }
}
