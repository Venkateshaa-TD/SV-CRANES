"use server";

import { revalidatePath } from "next/cache";
import { Prisma, type BillingConfiguration, type Project } from "@prisma/client";

import { prisma } from "@/lib/db/prisma";
import { requireCurrentUserWithPermission } from "@/lib/auth/current-user";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { recordAudit } from "@/lib/audit/audit";
import { createBillingDraftSchema, billingDraftReviewSchema, chargeInputSchema } from "@/lib/validation/billing-draft";
import {
  calculateHourlyBilling,
  calculateDailyBilling,
  calculateMonthlyBilling,
  calculateFixedBilling,
  computeBillingDraftTotals,
  computeBillingTax,
  sumAdditionalCharges,
  validateAdditionalCharge,
  daysBetweenInclusive,
} from "@/lib/business/billing";
import { isFullBusinessCalendarMonth, businessDaysInMonth } from "@/lib/business/business-time";
import { formatDateOnly } from "@/lib/business/invoice";
import { findEligibleHourlyLogs, findEligibleBillingDays } from "@/lib/data/finance-queries";
import { issueInvoiceNumber } from "@/lib/db/invoice-sequence";
import { assertPeriodNotLocked } from "@/lib/data/period-lock";
import { ActionInputError, ok, toActionError, type ActionResult } from "./action-result";

interface DraftCalculation {
  quantity: Prisma.Decimal;
  baseAmount: Prisma.Decimal;
  calculationDetail: Prisma.InputJsonValue;
  sourceLogRows: { dailyLogId: string; hoursCounted: Prisma.Decimal | null }[];
}

/** Runs the billing-type-specific calculation for a project/period,
 * shared by both draft generation and recalculation so the two never
 * drift apart. */
async function calculateForBillingType(params: {
  companyId: string;
  project: Project;
  config: BillingConfiguration;
  periodStart: Date;
  periodEnd: Date;
  allowProration: boolean;
}): Promise<DraftCalculation> {
  const { companyId, project, config, periodStart, periodEnd } = params;

  if (config.billingType === "HOURLY") {
    const logs = await findEligibleHourlyLogs(companyId, project.id, periodStart, periodEnd);
    const result = calculateHourlyBilling(
      logs.map((l) => ({ dailyLogId: l.id, logDate: l.logDate, workingHours: l.workingHours! })),
      {
        baseRate: config.baseRate,
        minimumGuaranteedHours: config.minimumGuaranteedHours,
        overtimeThresholdHours: config.overtimeThresholdHours,
        overtimeRate: config.overtimeRate,
      },
    );
    return {
      quantity: result.quantity,
      baseAmount: result.baseAmount,
      calculationDetail: {
        perLog: result.perLog.map((l) => ({ ...l, logDate: l.logDate.toISOString() })),
        totalNormalHours: result.totalNormalHours.toString(),
        totalOvertimeHours: result.totalOvertimeHours.toString(),
      },
      sourceLogRows: result.perLog.map((l) => ({ dailyLogId: l.dailyLogId, hoursCounted: new Prisma.Decimal(l.billableHours) })),
    };
  }

  if (config.billingType === "DAILY") {
    const eligibleDays = await findEligibleBillingDays(companyId, project.id, periodStart, periodEnd);
    const result = calculateDailyBilling(eligibleDays, { baseRate: config.baseRate });
    return {
      quantity: result.quantity,
      baseAmount: result.baseAmount,
      calculationDetail: { eligibleDays: eligibleDays.map((d) => ({ dailyLogId: d.dailyLogId, logDate: d.logDate.toISOString() })) },
      sourceLogRows: eligibleDays.map((d) => ({ dailyLogId: d.dailyLogId, hoursCounted: null })),
    };
  }

  if (config.billingType === "MONTHLY") {
    const isFullMonth = isFullBusinessCalendarMonth(periodStart, periodEnd);
    const result = calculateMonthlyBilling({
      config: { baseRate: config.baseRate },
      isFullCalendarMonth: isFullMonth,
      daysInPeriod: daysBetweenInclusive(periodStart, periodEnd),
      daysInMonth: businessDaysInMonth(periodStart),
      allowProration: params.allowProration,
    });
    return {
      quantity: result.quantity,
      baseAmount: result.baseAmount,
      calculationDetail: { prorated: result.prorated, isFullCalendarMonth: isFullMonth },
      sourceLogRows: [],
    };
  }

  const result = calculateFixedBilling({ baseRate: config.baseRate });
  return { quantity: result.quantity, baseAmount: result.baseAmount, calculationDetail: {}, sourceLogRows: [] };
}

export async function generateBillingDraft(input: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    const actor = await requireCurrentUserWithPermission(PERMISSIONS.BILLING_MANAGE);
    const data = createBillingDraftSchema.parse(input);

    const project = await prisma.project.findFirst({ where: { id: data.projectId, companyId: actor.companyId }, include: { billingConfig: true } });
    if (!project) throw new ActionInputError("Selected project was not found.");
    if (!project.billingConfig) throw new ActionInputError("This project has no billing configuration yet. Set one up first.");

    const periodStart = new Date(data.periodStart);
    const periodEnd = new Date(data.periodEnd);
    if (Number.isNaN(periodStart.getTime()) || Number.isNaN(periodEnd.getTime())) {
      throw new ActionInputError("Enter a valid billing period.");
    }
    if (periodEnd.getTime() < periodStart.getTime()) {
      throw new ActionInputError("Billing period end cannot be before its start.");
    }

    for (const charge of data.charges) validateAdditionalCharge(charge);
    const additionalChargesAmount = sumAdditionalCharges(data.charges);

    const config = project.billingConfig;
    const calc = await calculateForBillingType({ companyId: actor.companyId, project, config, periodStart, periodEnd, allowProration: data.allowProration });
    const totals = computeBillingDraftTotals({ baseAmount: calc.baseAmount, additionalChargesAmount, taxPercent: config.taxPercent });

    const draft = await prisma.$transaction(async (tx) => {
      const created = await tx.billingDraft.create({
        data: {
          companyId: actor.companyId,
          projectId: project.id,
          customerId: project.customerId,
          billingType: config.billingType,
          periodStart,
          periodEnd,
          status: "DRAFT",
          quantity: calc.quantity,
          rate: config.baseRate,
          baseAmount: totals.baseAmount,
          additionalChargesAmount: totals.additionalChargesAmount,
          taxPercent: config.taxPercent,
          taxAmount: totals.taxAmount,
          totalAmount: totals.totalAmount,
          calculationDetail: calc.calculationDetail,
          notes: data.notes ?? null,
          createdById: actor.id,
        },
      });

      if (data.charges.length > 0) {
        await tx.billingDraftCharge.createMany({
          data: data.charges.map((c) => ({ billingDraftId: created.id, description: c.description, amount: new Prisma.Decimal(c.amount) })),
        });
      }
      if (calc.sourceLogRows.length > 0) {
        await tx.billingDraftSourceLog.createMany({
          data: calc.sourceLogRows.map((s) => ({ billingDraftId: created.id, dailyLogId: s.dailyLogId, hoursCounted: s.hoursCounted })),
        });
      }
      return created;
    });

    await recordAudit({
      companyId: actor.companyId,
      actorId: actor.id,
      action: "billingDraft.created",
      entityType: "BillingDraft",
      entityId: draft.id,
      afterValue: { projectId: project.id, billingType: draft.billingType, totalAmount: draft.totalAmount.toString() },
    });

    revalidatePath("/finance/billing");
    revalidatePath(`/projects/${project.id}`);
    return ok("Billing draft created.", { id: draft.id });
  } catch (error) {
    return toActionError(error);
  }
}

/** Re-runs the calculation for a still-DRAFT billing draft against its
 * stored period/project — picks up any daily logs approved since the
 * draft was first generated, and any billing-configuration change made
 * since. Existing additional charges are preserved. */
export async function recalculateBillingDraft(billingDraftId: string): Promise<ActionResult> {
  try {
    const actor = await requireCurrentUserWithPermission(PERMISSIONS.BILLING_MANAGE);
    const draft = await prisma.billingDraft.findFirst({
      where: { id: billingDraftId, companyId: actor.companyId },
      include: { project: { include: { billingConfig: true } }, charges: true },
    });
    if (!draft) return { success: false, message: "Billing draft not found." };
    if (draft.status !== "DRAFT") return { success: false, message: "Only a draft not yet submitted for review can be recalculated." };
    const config = draft.project.billingConfig;
    if (!config) return { success: false, message: "This project no longer has a billing configuration." };

    const calc = await calculateForBillingType({
      companyId: actor.companyId,
      project: draft.project,
      config,
      periodStart: draft.periodStart,
      periodEnd: draft.periodEnd,
      allowProration: (draft.calculationDetail as { prorated?: boolean } | null)?.prorated ?? false,
    });
    const additionalChargesAmount = sumAdditionalCharges(draft.charges.map((c) => ({ description: c.description, amount: c.amount })));
    const totals = computeBillingDraftTotals({ baseAmount: calc.baseAmount, additionalChargesAmount, taxPercent: config.taxPercent });

    await prisma.$transaction(async (tx) => {
      await tx.billingDraftSourceLog.deleteMany({ where: { billingDraftId } });
      if (calc.sourceLogRows.length > 0) {
        await tx.billingDraftSourceLog.createMany({
          data: calc.sourceLogRows.map((s) => ({ billingDraftId, dailyLogId: s.dailyLogId, hoursCounted: s.hoursCounted })),
        });
      }
      await tx.billingDraft.update({
        where: { id: billingDraftId },
        data: {
          billingType: config.billingType,
          rate: config.baseRate,
          quantity: calc.quantity,
          baseAmount: totals.baseAmount,
          additionalChargesAmount: totals.additionalChargesAmount,
          taxPercent: config.taxPercent,
          taxAmount: totals.taxAmount,
          totalAmount: totals.totalAmount,
          calculationDetail: calc.calculationDetail,
        },
      });
    });

    await recordAudit({ companyId: actor.companyId, actorId: actor.id, action: "billingDraft.recalculated", entityType: "BillingDraft", entityId: billingDraftId });

    revalidatePath(`/finance/billing/${billingDraftId}`);
    return ok("Billing draft recalculated.");
  } catch (error) {
    return toActionError(error);
  }
}

async function recomputeChargesAndTotals(tx: Prisma.TransactionClient, billingDraftId: string): Promise<void> {
  const draft = await tx.billingDraft.findUniqueOrThrow({ where: { id: billingDraftId } });
  const charges = await tx.billingDraftCharge.findMany({ where: { billingDraftId } });
  const additionalChargesAmount = sumAdditionalCharges(charges.map((c) => ({ description: c.description, amount: c.amount })));
  const totals = computeBillingDraftTotals({ baseAmount: draft.baseAmount, additionalChargesAmount, taxPercent: draft.taxPercent });
  await tx.billingDraft.update({
    where: { id: billingDraftId },
    data: { additionalChargesAmount: totals.additionalChargesAmount, taxAmount: totals.taxAmount, totalAmount: totals.totalAmount },
  });
}

export async function addBillingDraftCharge(billingDraftId: string, input: unknown): Promise<ActionResult> {
  try {
    const actor = await requireCurrentUserWithPermission(PERMISSIONS.BILLING_MANAGE);
    const charge = chargeInputSchema.parse(input);
    validateAdditionalCharge(charge);

    const draft = await prisma.billingDraft.findFirst({ where: { id: billingDraftId, companyId: actor.companyId } });
    if (!draft) return { success: false, message: "Billing draft not found." };
    if (draft.status !== "DRAFT") return { success: false, message: "Charges can only be edited while the draft is not yet submitted for review." };

    await prisma.$transaction(async (tx) => {
      await tx.billingDraftCharge.create({ data: { billingDraftId, description: charge.description, amount: new Prisma.Decimal(charge.amount) } });
      await recomputeChargesAndTotals(tx, billingDraftId);
    });

    await recordAudit({ companyId: actor.companyId, actorId: actor.id, action: "billingDraft.recalculated", entityType: "BillingDraft", entityId: billingDraftId, afterValue: { addedCharge: charge.description } });

    revalidatePath(`/finance/billing/${billingDraftId}`);
    return ok("Charge added.");
  } catch (error) {
    return toActionError(error);
  }
}

export async function removeBillingDraftCharge(chargeId: string): Promise<ActionResult> {
  try {
    const actor = await requireCurrentUserWithPermission(PERMISSIONS.BILLING_MANAGE);
    const charge = await prisma.billingDraftCharge.findFirst({
      where: { id: chargeId, billingDraft: { companyId: actor.companyId } },
      include: { billingDraft: { select: { id: true, status: true } } },
    });
    if (!charge) return { success: false, message: "Charge not found." };
    if (charge.billingDraft.status !== "DRAFT") {
      return { success: false, message: "Charges can only be edited while the draft is not yet submitted for review." };
    }

    await prisma.$transaction(async (tx) => {
      await tx.billingDraftCharge.delete({ where: { id: chargeId } });
      await recomputeChargesAndTotals(tx, charge.billingDraft.id);
    });

    await recordAudit({ companyId: actor.companyId, actorId: actor.id, action: "billingDraft.recalculated", entityType: "BillingDraft", entityId: charge.billingDraft.id, afterValue: { removedCharge: charge.description } });

    revalidatePath(`/finance/billing/${charge.billingDraft.id}`);
    return ok("Charge removed.");
  } catch (error) {
    return toActionError(error);
  }
}

export async function submitBillingDraftForReview(billingDraftId: string): Promise<ActionResult> {
  try {
    const actor = await requireCurrentUserWithPermission(PERMISSIONS.BILLING_MANAGE);
    const draft = await prisma.billingDraft.findFirst({ where: { id: billingDraftId, companyId: actor.companyId } });
    if (!draft) return { success: false, message: "Billing draft not found." };
    if (draft.status !== "DRAFT") return { success: false, message: `This draft is already ${draft.status.toLowerCase()}.` };

    const result = await prisma.billingDraft.updateMany({ where: { id: billingDraftId, status: "DRAFT" }, data: { status: "REVIEW" } });
    if (result.count === 0) return { success: false, message: "This draft was already submitted." };

    await recordAudit({ companyId: actor.companyId, actorId: actor.id, action: "billingDraft.submitted_for_review", entityType: "BillingDraft", entityId: billingDraftId });

    revalidatePath("/finance/billing");
    revalidatePath(`/finance/billing/${billingDraftId}`);
    return ok("Submitted for review.");
  } catch (error) {
    return toActionError(error);
  }
}

/** Approve/reject a billing draft in REVIEW. The atomic updateMany guard
 * (re-asserting status: "REVIEW" in the same UPDATE) prevents two
 * reviewers from both approving/rejecting the same draft. */
export async function reviewBillingDraft(input: unknown): Promise<ActionResult> {
  try {
    const actor = await requireCurrentUserWithPermission(PERMISSIONS.BILLING_MANAGE);
    const data = billingDraftReviewSchema.parse(input);

    const draft = await prisma.billingDraft.findFirst({ where: { id: data.billingDraftId, companyId: actor.companyId } });
    if (!draft) return { success: false, message: "Billing draft not found." };
    if (draft.status !== "REVIEW") return { success: false, message: `This draft is ${draft.status.toLowerCase()}, not awaiting review.` };
    if (data.decision === "REJECTED" && !data.reviewNote) {
      return { success: false, fieldErrors: { reviewNote: "A reason is required to reject a billing draft." } };
    }

    const result = await prisma.billingDraft.updateMany({
      where: { id: data.billingDraftId, status: "REVIEW" },
      data: { status: data.decision, reviewedById: actor.id, reviewedAt: new Date(), reviewNote: data.reviewNote ?? null },
    });
    if (result.count === 0) return { success: false, message: "This draft was already reviewed by someone else." };

    await recordAudit({
      companyId: actor.companyId,
      actorId: actor.id,
      action: data.decision === "APPROVED" ? "billingDraft.approved" : "billingDraft.rejected",
      entityType: "BillingDraft",
      entityId: data.billingDraftId,
      reason: data.reviewNote ?? null,
      afterValue: { status: data.decision },
    });

    revalidatePath("/finance/billing");
    revalidatePath(`/finance/billing/${data.billingDraftId}`);
    return ok(data.decision === "APPROVED" ? "Billing draft approved." : "Billing draft rejected.");
  } catch (error) {
    return toActionError(error);
  }
}

/**
 * Generates the Invoice from an APPROVED billing draft. The atomic
 * updateMany guard (status: "APPROVED" -> "INVOICED" inside the same
 * transaction as the Invoice insert) prevents two concurrent requests
 * from both generating an invoice off the same draft; Invoice.
 * billingDraftId's DB-level unique constraint is a second line of
 * defense. Invoice totals are copied verbatim from the draft snapshot —
 * never re-derived from the project's current billing configuration.
 */
export async function generateInvoiceFromBillingDraft(billingDraftId: string): Promise<ActionResult<{ id: string }>> {
  try {
    const actor = await requireCurrentUserWithPermission(PERMISSIONS.INVOICE_MANAGE);

    const draft = await prisma.billingDraft.findFirst({
      where: { id: billingDraftId, companyId: actor.companyId },
      include: { charges: true, customer: { select: { defaultDueDays: true } } },
    });
    if (!draft) return { success: false, message: "Billing draft not found." };
    if (draft.status !== "APPROVED") {
      return { success: false, message: `This billing draft is ${draft.status.toLowerCase()} and cannot be invoiced.` };
    }

    const now = new Date();
    const dueDays = draft.customer.defaultDueDays ?? 30;
    const dueDate = new Date(now.getTime() + dueDays * 24 * 60 * 60 * 1000);
    // The generated invoice is always dated "now" (its own book date is
    // today, regardless of which historical period the underlying
    // billing draft covers) — so it's today's period that must be
    // checked, the same as createManualInvoice does for its issueDate.
    await assertPeriodNotLocked({ companyId: actor.companyId, actorId: actor.id, date: now, entityType: "Invoice", action: "invoice.generateFromBillingDraft" });

    const invoice = await prisma.$transaction(async (tx) => {
      const guard = await tx.billingDraft.updateMany({ where: { id: draft.id, status: "APPROVED" }, data: { status: "INVOICED" } });
      if (guard.count === 0) {
        throw new ActionInputError("This billing draft was already invoiced or is no longer approved.");
      }

      const invoiceNumber = await issueInvoiceNumber(tx, actor.companyId, now);

      const lines = [
        {
          description: `${draft.billingType} billing — ${formatDateOnly(draft.periodStart)} to ${formatDateOnly(draft.periodEnd)}`,
          quantity: draft.quantity,
          unitPrice: draft.rate,
          amount: draft.baseAmount,
          taxPercent: draft.taxPercent,
          taxAmount: computeBillingTax(draft.baseAmount, draft.taxPercent),
          sourceType: "BILLING_DRAFT",
          sourceId: draft.id,
          sortOrder: 0,
        },
        ...draft.charges.map((charge, index) => ({
          description: charge.description,
          quantity: new Prisma.Decimal(1),
          unitPrice: charge.amount,
          amount: charge.amount,
          taxPercent: draft.taxPercent,
          taxAmount: computeBillingTax(charge.amount, draft.taxPercent),
          sourceType: "ADDITIONAL_CHARGE",
          sourceId: charge.id,
          sortOrder: index + 1,
        })),
      ];

      return tx.invoice.create({
        data: {
          companyId: actor.companyId,
          customerId: draft.customerId,
          projectId: draft.projectId,
          billingDraftId: draft.id,
          invoiceNumber,
          status: "DRAFT",
          issueDate: now,
          dueDate,
          billingPeriodStart: draft.periodStart,
          billingPeriodEnd: draft.periodEnd,
          // Copied verbatim from the reviewed/approved draft snapshot —
          // never re-derived from lines or from current project rates.
          subtotal: draft.baseAmount.plus(draft.additionalChargesAmount),
          taxAmount: draft.taxAmount,
          totalAmount: draft.totalAmount,
          createdById: actor.id,
          updatedById: actor.id,
          lines: { createMany: { data: lines } },
        },
      });
    });

    await recordAudit({ companyId: actor.companyId, actorId: actor.id, action: "billingDraft.invoiced", entityType: "BillingDraft", entityId: draft.id, afterValue: { invoiceId: invoice.id } });
    await recordAudit({
      companyId: actor.companyId,
      actorId: actor.id,
      action: "invoice.created",
      entityType: "Invoice",
      entityId: invoice.id,
      afterValue: { invoiceNumber: invoice.invoiceNumber, totalAmount: invoice.totalAmount.toString(), billingDraftId: draft.id },
    });

    revalidatePath("/finance/billing");
    revalidatePath("/finance/invoices");
    revalidatePath(`/projects/${draft.projectId}`);
    return ok("Invoice generated.", { id: invoice.id });
  } catch (error) {
    return toActionError(error);
  }
}
