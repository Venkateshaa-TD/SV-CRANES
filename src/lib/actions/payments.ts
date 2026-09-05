"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/db/prisma";
import { requireCurrentUserWithPermission } from "@/lib/auth/current-user";
import { can, AuthorizationError } from "@/lib/auth/authorize";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { recordAudit } from "@/lib/audit/audit";
import { paymentFormSchema, cancelPaymentSchema } from "@/lib/validation/payment";
import { validatePaymentAmount } from "@/lib/business/payment";
import { deriveInvoiceStatus } from "@/lib/business/invoice";
import { assertPeriodNotLocked } from "@/lib/data/period-lock";
import { ActionInputError, ok, toActionError, type ActionResult } from "./action-result";

export async function createPayment(input: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    const actor = await requireCurrentUserWithPermission(PERMISSIONS.PAYMENT_MANAGE);
    const data = paymentFormSchema.parse(input);

    const customer = await prisma.customer.findFirst({ where: { id: data.customerId, companyId: actor.companyId, archivedAt: null } });
    if (!customer) throw new ActionInputError("Selected customer was not found.");

    const amount = new Prisma.Decimal(data.amount);
    validatePaymentAmount(amount);

    const paymentDate = new Date(data.paymentDate);
    if (Number.isNaN(paymentDate.getTime())) throw new ActionInputError("Enter a valid payment date.");
    await assertPeriodNotLocked({ companyId: actor.companyId, actorId: actor.id, date: paymentDate, entityType: "Payment", action: "payment.create" });

    const payment = await prisma.payment.create({
      data: {
        companyId: actor.companyId,
        customerId: customer.id,
        paymentDate,
        amount,
        method: data.method,
        referenceNumber: data.referenceNumber ?? null,
        notes: data.notes ?? null,
        receivedById: actor.id,
        createdById: actor.id,
        updatedById: actor.id,
      },
    });

    await recordAudit({
      companyId: actor.companyId,
      actorId: actor.id,
      action: "payment.created",
      entityType: "Payment",
      entityId: payment.id,
      afterValue: { customerId: payment.customerId, amount: payment.amount.toString(), method: payment.method },
    });

    revalidatePath("/finance/payments");
    revalidatePath("/finance/outstanding");
    return ok("Payment recorded.", { id: payment.id });
  } catch (error) {
    return toActionError(error);
  }
}

/**
 * Cancels a payment and reverses every allocation it made — never a
 * silent edit. Requires CUSTOMER_FINANCIAL_EDIT (the same trusted-few
 * permission gating other sensitive financial corrections) plus a
 * reason. Each affected invoice's amountPaid/status is recomputed from
 * its remaining allocations inside the same transaction.
 */
export async function cancelPayment(input: unknown): Promise<ActionResult> {
  try {
    const actor = await requireCurrentUserWithPermission(PERMISSIONS.PAYMENT_MANAGE);
    const allowed = await can(actor, PERMISSIONS.CUSTOMER_FINANCIAL_EDIT);
    if (!allowed) throw new AuthorizationError("Cancelling a payment requires the customer-finance-edit permission.");

    const data = cancelPaymentSchema.parse(input);
    const payment = await prisma.payment.findFirst({ where: { id: data.paymentId, companyId: actor.companyId } });
    if (!payment) return { success: false, message: "Payment not found." };
    if (payment.cancelledAt) return { success: false, message: "This payment is already cancelled." };
    await assertPeriodNotLocked({ companyId: actor.companyId, actorId: actor.id, date: payment.paymentDate, entityType: "Payment", entityId: payment.id, action: "payment.cancel" });

    const reversedInvoiceIds = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT id FROM "Payment" WHERE id = ${payment.id} FOR UPDATE`;

      // Ordered by invoiceId — a fixed lock order avoids a deadlock
      // against a concurrent allocatePayment/removeAllocation call
      // touching an overlapping set of invoices (see the same reasoning
      // in payment-allocations.ts#allocatePayment).
      const allocations = await tx.paymentAllocation.findMany({ where: { paymentId: payment.id }, orderBy: { invoiceId: "asc" } });
      const invoiceIds: string[] = [];

      for (const allocation of allocations) {
        await tx.$executeRaw`SELECT id FROM "Invoice" WHERE id = ${allocation.invoiceId} FOR UPDATE`;
        const invoice = await tx.invoice.findUniqueOrThrow({ where: { id: allocation.invoiceId } });
        // The payment's own date may be open while an invoice it was
        // allocated to is dated in a since-closed month (or vice versa)
        // — reversing the allocation would otherwise silently mutate
        // that invoice's amountPaid/status without ever checking its
        // period lock. Checked per-invoice, same as allocatePayment.
        await assertPeriodNotLocked({ companyId: actor.companyId, actorId: actor.id, date: invoice.issueDate, entityType: "Invoice", entityId: invoice.id, action: "payment.cancel" });
        await tx.paymentAllocation.delete({ where: { id: allocation.id } });

        const remaining = await tx.paymentAllocation.aggregate({ where: { invoiceId: invoice.id }, _sum: { amountAllocated: true } });
        const amountPaid = new Prisma.Decimal(remaining._sum.amountAllocated ?? 0);
        const status = deriveInvoiceStatus({
          isDraft: invoice.status === "DRAFT",
          isCancelled: invoice.status === "CANCELLED",
          sentAt: invoice.sentAt,
          totalAmount: invoice.totalAmount,
          amountAllocated: amountPaid,
          dueDate: invoice.dueDate,
        });
        await tx.invoice.update({ where: { id: invoice.id }, data: { amountPaid, status } });
        invoiceIds.push(invoice.id);
      }

      const result = await tx.payment.updateMany({
        where: { id: payment.id, cancelledAt: null },
        data: { cancelledAt: new Date(), cancelledById: actor.id, cancellationReason: data.reason },
      });
      if (result.count === 0) {
        throw new ActionInputError("This payment was already cancelled.");
      }

      return invoiceIds;
    });

    for (const invoiceId of reversedInvoiceIds) {
      await recordAudit({
        companyId: actor.companyId,
        actorId: actor.id,
        action: "paymentAllocation.removed",
        entityType: "Invoice",
        entityId: invoiceId,
        reason: `Payment ${payment.id} cancelled: ${data.reason}`,
      });
    }
    await recordAudit({
      companyId: actor.companyId,
      actorId: actor.id,
      action: "payment.cancelled",
      entityType: "Payment",
      entityId: payment.id,
      reason: data.reason,
      beforeValue: { amount: payment.amount.toString() },
    });

    revalidatePath("/finance/payments");
    revalidatePath("/finance/invoices");
    revalidatePath("/finance/outstanding");
    return ok("Payment cancelled and its allocations reversed.");
  } catch (error) {
    return toActionError(error);
  }
}
