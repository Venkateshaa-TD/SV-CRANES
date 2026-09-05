"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/db/prisma";
import { requireCurrentUserWithPermission } from "@/lib/auth/current-user";
import { can, AuthorizationError } from "@/lib/auth/authorize";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { recordAudit } from "@/lib/audit/audit";
import { manualInvoiceFormSchema, updateInvoiceDraftSchema, cancelInvoiceSchema } from "@/lib/validation/invoice";
import { computeInvoiceLine, computeInvoiceTotals, isInvoiceEditable, canCancelInvoice } from "@/lib/business/invoice";
import { issueInvoiceNumber } from "@/lib/db/invoice-sequence";
import { assertPeriodNotLocked } from "@/lib/data/period-lock";
import { ActionInputError, ok, toActionError, type ActionResult } from "./action-result";

function decimalOrUndefined(value: string | undefined): Prisma.Decimal | undefined {
  return value === undefined || value.length === 0 ? undefined : new Prisma.Decimal(value);
}

/** A manual, ad-hoc DRAFT invoice not generated from a BillingDraft — for
 * one-off charges the billing engine doesn't cover. Line amounts are
 * always recomputed server-side from quantity/rate/tax%, never trusted
 * from the client. */
export async function createManualInvoice(input: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    const actor = await requireCurrentUserWithPermission(PERMISSIONS.INVOICE_MANAGE);
    const data = manualInvoiceFormSchema.parse(input);

    const customer = await prisma.customer.findFirst({ where: { id: data.customerId, companyId: actor.companyId, archivedAt: null } });
    if (!customer) throw new ActionInputError("Selected customer was not found.");
    if (data.projectId) {
      const project = await prisma.project.findFirst({ where: { id: data.projectId, companyId: actor.companyId } });
      if (!project) throw new ActionInputError("Selected project was not found.");
    }

    const issueDate = new Date(data.issueDate);
    if (Number.isNaN(issueDate.getTime())) throw new ActionInputError("Enter a valid issue date.");
    const dueDate = data.dueDate ? new Date(data.dueDate) : null;
    if (data.dueDate && Number.isNaN(dueDate?.getTime())) throw new ActionInputError("Enter a valid due date.");
    await assertPeriodNotLocked({ companyId: actor.companyId, actorId: actor.id, date: issueDate, entityType: "Invoice", action: "invoice.create" });

    const computedLines = data.lines.map((line, index) => ({
      ...computeInvoiceLine({ quantity: line.quantity, unitPrice: line.unitPrice, taxPercent: line.taxPercent }),
      description: line.description,
      vehicleId: line.vehicleId ?? null,
      sortOrder: index,
    }));
    const totals = computeInvoiceTotals({ lines: computedLines, discountAmount: data.discountAmount });

    const invoice = await prisma.$transaction(async (tx) => {
      const invoiceNumber = await issueInvoiceNumber(tx, actor.companyId, issueDate);
      return tx.invoice.create({
        data: {
          companyId: actor.companyId,
          customerId: customer.id,
          projectId: data.projectId ?? null,
          invoiceNumber,
          status: "DRAFT",
          issueDate,
          dueDate,
          subtotal: totals.subtotal,
          discountAmount: decimalOrUndefined(data.discountAmount) ?? new Prisma.Decimal(0),
          taxAmount: totals.taxAmount,
          totalAmount: totals.totalAmount,
          notes: data.notes ?? null,
          createdById: actor.id,
          updatedById: actor.id,
          lines: {
            createMany: {
              data: computedLines.map((line) => ({
                vehicleId: line.vehicleId,
                description: line.description,
                quantity: line.quantity,
                unitPrice: line.unitPrice,
                amount: line.amount,
                taxPercent: line.taxPercent,
                taxAmount: line.taxAmount,
                sourceType: "MANUAL",
                sortOrder: line.sortOrder,
              })),
            },
          },
        },
      });
    });

    await recordAudit({
      companyId: actor.companyId,
      actorId: actor.id,
      action: "invoice.created",
      entityType: "Invoice",
      entityId: invoice.id,
      afterValue: { invoiceNumber: invoice.invoiceNumber, totalAmount: invoice.totalAmount.toString(), source: "MANUAL" },
    });

    revalidatePath("/finance/invoices");
    return ok("Invoice created.", { id: invoice.id });
  } catch (error) {
    return toActionError(error);
  }
}

/** DRAFT invoices only — line edits are further restricted to manual
 * invoices (no billingDraftId): a billing-engine-generated invoice's
 * amounts are a reviewed/approved snapshot and stay locked even while
 * still in DRAFT, though its notes/due date remain editable. */
export async function updateInvoiceDraft(invoiceId: string, input: unknown): Promise<ActionResult> {
  try {
    const actor = await requireCurrentUserWithPermission(PERMISSIONS.INVOICE_MANAGE);
    const data = updateInvoiceDraftSchema.parse(input);

    const before = await prisma.invoice.findFirst({ where: { id: invoiceId, companyId: actor.companyId }, include: { lines: true } });
    if (!before) return { success: false, message: "Invoice not found." };
    if (!isInvoiceEditable(before.status)) {
      return { success: false, message: `This invoice is ${before.status.toLowerCase()} and can no longer be freely edited.` };
    }
    await assertPeriodNotLocked({ companyId: actor.companyId, actorId: actor.id, date: before.issueDate, entityType: "Invoice", entityId: invoiceId, action: "invoice.update" });

    const dueDate = data.dueDate ? new Date(data.dueDate) : null;
    if (data.dueDate && Number.isNaN(dueDate?.getTime())) throw new ActionInputError("Enter a valid due date.");

    if (data.lines && before.billingDraftId) {
      return { success: false, message: "This invoice was generated from billing and its line amounts cannot be edited directly." };
    }

    await prisma.$transaction(async (tx) => {
      if (data.lines) {
        const computedLines = data.lines.map((line, index) => ({
          ...computeInvoiceLine({ quantity: line.quantity, unitPrice: line.unitPrice, taxPercent: line.taxPercent }),
          description: line.description,
          vehicleId: line.vehicleId ?? null,
          sortOrder: index,
        }));
        const totals = computeInvoiceTotals({ lines: computedLines, discountAmount: data.discountAmount ?? before.discountAmount });

        await tx.invoiceLine.deleteMany({ where: { invoiceId } });
        await tx.invoiceLine.createMany({
          data: computedLines.map((line) => ({
            invoiceId,
            vehicleId: line.vehicleId,
            description: line.description,
            quantity: line.quantity,
            unitPrice: line.unitPrice,
            amount: line.amount,
            taxPercent: line.taxPercent,
            taxAmount: line.taxAmount,
            sourceType: "MANUAL",
            sortOrder: line.sortOrder,
          })),
        });
        await tx.invoice.update({
          where: { id: invoiceId },
          data: {
            dueDate,
            notes: data.notes ?? before.notes,
            subtotal: totals.subtotal,
            discountAmount: decimalOrUndefined(data.discountAmount) ?? before.discountAmount,
            taxAmount: totals.taxAmount,
            totalAmount: totals.totalAmount,
            updatedById: actor.id,
          },
        });
      } else {
        await tx.invoice.update({
          where: { id: invoiceId },
          data: { dueDate, notes: data.notes ?? before.notes, updatedById: actor.id },
        });
      }
    });

    await recordAudit({
      companyId: actor.companyId,
      actorId: actor.id,
      action: "invoice.updated",
      entityType: "Invoice",
      entityId: invoiceId,
      beforeValue: { dueDate: before.dueDate?.toISOString() ?? null, totalAmount: before.totalAmount.toString() },
    });

    revalidatePath("/finance/invoices");
    revalidatePath(`/finance/invoices/${invoiceId}`);
    return ok("Invoice updated.");
  } catch (error) {
    return toActionError(error);
  }
}

export async function approveInvoice(invoiceId: string): Promise<ActionResult> {
  try {
    const actor = await requireCurrentUserWithPermission(PERMISSIONS.INVOICE_MANAGE);
    const invoice = await prisma.invoice.findFirst({ where: { id: invoiceId, companyId: actor.companyId } });
    if (!invoice) return { success: false, message: "Invoice not found." };
    if (invoice.status !== "DRAFT") {
      return { success: false, message: `This invoice is already ${invoice.status.toLowerCase()}.` };
    }
    await assertPeriodNotLocked({ companyId: actor.companyId, actorId: actor.id, date: invoice.issueDate, entityType: "Invoice", entityId: invoiceId, action: "invoice.approve" });

    // Atomic guard against double approval.
    const result = await prisma.invoice.updateMany({
      where: { id: invoiceId, status: "DRAFT" },
      data: { status: "APPROVED", approvedAt: new Date(), approvedById: actor.id },
    });
    if (result.count === 0) return { success: false, message: "This invoice was already approved by someone else." };

    await recordAudit({ companyId: actor.companyId, actorId: actor.id, action: "invoice.approved", entityType: "Invoice", entityId: invoiceId });

    revalidatePath("/finance/invoices");
    revalidatePath(`/finance/invoices/${invoiceId}`);
    return ok("Invoice approved.");
  } catch (error) {
    return toActionError(error);
  }
}

export async function markInvoiceSent(invoiceId: string): Promise<ActionResult> {
  try {
    const actor = await requireCurrentUserWithPermission(PERMISSIONS.INVOICE_MANAGE);
    const invoice = await prisma.invoice.findFirst({ where: { id: invoiceId, companyId: actor.companyId } });
    if (!invoice) return { success: false, message: "Invoice not found." };
    if (invoice.status !== "APPROVED") {
      return { success: false, message: "Only an approved invoice can be marked as sent." };
    }
    await assertPeriodNotLocked({ companyId: actor.companyId, actorId: actor.id, date: invoice.issueDate, entityType: "Invoice", entityId: invoiceId, action: "invoice.markSent" });

    await prisma.invoice.update({ where: { id: invoiceId }, data: { status: "SENT", sentAt: new Date() } });
    await recordAudit({ companyId: actor.companyId, actorId: actor.id, action: "invoice.sent", entityType: "Invoice", entityId: invoiceId });

    revalidatePath("/finance/invoices");
    revalidatePath(`/finance/invoices/${invoiceId}`);
    return ok("Invoice marked as sent.");
  } catch (error) {
    return toActionError(error);
  }
}

/**
 * The controlled correction/cancellation workflow required for
 * APPROVED/SENT/PARTIALLY_PAID/OVERDUE invoices — never a silent edit.
 * Requires CUSTOMER_FINANCIAL_EDIT (the same trusted-few permission that
 * governs other sensitive financial corrections), a reason, and leaves a
 * full audit trail. A PAID invoice cannot be cancelled this way, and an
 * invoice with existing payment allocations must have them removed
 * first — cancellation never silently reverses a customer's payments.
 */
export async function cancelInvoice(input: unknown): Promise<ActionResult> {
  try {
    const actor = await requireCurrentUserWithPermission(PERMISSIONS.INVOICE_MANAGE);
    const allowed = await can(actor, PERMISSIONS.CUSTOMER_FINANCIAL_EDIT);
    if (!allowed) throw new AuthorizationError("Cancelling an invoice requires the customer-finance-edit permission.");

    const data = cancelInvoiceSchema.parse(input);
    const invoice = await prisma.invoice.findFirst({
      where: { id: data.invoiceId, companyId: actor.companyId },
      include: { paymentAllocations: { select: { id: true } } },
    });
    if (!invoice) return { success: false, message: "Invoice not found." };
    if (!canCancelInvoice(invoice.status)) {
      return { success: false, message: `An invoice that is ${invoice.status.toLowerCase()} cannot be cancelled.` };
    }
    if (invoice.paymentAllocations.length > 0) {
      return { success: false, message: "Remove this invoice's payment allocations before cancelling it." };
    }
    await assertPeriodNotLocked({ companyId: actor.companyId, actorId: actor.id, date: invoice.issueDate, entityType: "Invoice", entityId: data.invoiceId, action: "invoice.cancel" });

    const result = await prisma.invoice.updateMany({
      where: { id: data.invoiceId, status: invoice.status },
      data: { status: "CANCELLED", cancelledAt: new Date(), cancelledById: actor.id, cancellationReason: data.reason },
    });
    if (result.count === 0) return { success: false, message: "This invoice's status changed before cancellation could complete. Please retry." };

    await recordAudit({
      companyId: actor.companyId,
      actorId: actor.id,
      action: "invoice.cancelled",
      entityType: "Invoice",
      entityId: data.invoiceId,
      reason: data.reason,
      beforeValue: { status: invoice.status },
      afterValue: { status: "CANCELLED" },
    });

    revalidatePath("/finance/invoices");
    revalidatePath(`/finance/invoices/${data.invoiceId}`);
    return ok("Invoice cancelled.");
  } catch (error) {
    return toActionError(error);
  }
}
