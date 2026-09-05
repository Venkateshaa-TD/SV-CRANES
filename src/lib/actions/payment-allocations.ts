"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/db/prisma";
import { requireCurrentUserWithPermission } from "@/lib/auth/current-user";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { recordAudit } from "@/lib/audit/audit";
import { allocatePaymentSchema, removeAllocationSchema } from "@/lib/validation/payment";
import { validateAllocation, PaymentValidationError } from "@/lib/business/payment";
import { deriveInvoiceStatus } from "@/lib/business/invoice";
import { assertPeriodNotLocked } from "@/lib/data/period-lock";
import { ActionInputError, ok, toActionError, type ActionResult } from "./action-result";

async function recomputeInvoiceAfterAllocationChange(tx: Prisma.TransactionClient, invoiceId: string): Promise<void> {
  const invoice = await tx.invoice.findUniqueOrThrow({ where: { id: invoiceId } });
  const agg = await tx.paymentAllocation.aggregate({ where: { invoiceId }, _sum: { amountAllocated: true } });
  const amountPaid = new Prisma.Decimal(agg._sum.amountAllocated ?? 0);
  const status = deriveInvoiceStatus({
    isDraft: invoice.status === "DRAFT",
    isCancelled: invoice.status === "CANCELLED",
    sentAt: invoice.sentAt,
    totalAmount: invoice.totalAmount,
    amountAllocated: amountPaid,
    dueDate: invoice.dueDate,
  });
  await tx.invoice.update({ where: { id: invoiceId }, data: { amountPaid, status } });
}

/**
 * Allocates a payment across one or more invoices in a single
 * transaction. Both the payment row and each targeted invoice row are
 * locked (`SELECT ... FOR UPDATE`) before any balance is read, so two
 * concurrent allocation requests against the same payment or the same
 * invoice are serialized rather than racing — without this, two
 * requests could both read the same "unallocated" or "outstanding"
 * figure, both pass validation against it, and together over-allocate
 * past either limit. Every rule in validateAllocation (company/customer
 * match, cancelled-invoice block, payment/invoice balance limits) is
 * re-checked against the freshly locked figures, not the pre-transaction
 * read used only for the fast-path existence check.
 */
export async function allocatePayment(input: unknown): Promise<ActionResult> {
  try {
    const actor = await requireCurrentUserWithPermission(PERMISSIONS.PAYMENT_MANAGE);
    const data = allocatePaymentSchema.parse(input);

    const paymentExists = await prisma.payment.findFirst({ where: { id: data.paymentId, companyId: actor.companyId } });
    if (!paymentExists) return { success: false, message: "Payment not found." };

    const affectedInvoiceIds = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT id FROM "Payment" WHERE id = ${data.paymentId} FOR UPDATE`;
      const payment = await tx.payment.findUniqueOrThrow({ where: { id: data.paymentId } });
      if (payment.cancelledAt) throw new PaymentValidationError("This payment has been cancelled and cannot be allocated.");
      await assertPeriodNotLocked({ companyId: actor.companyId, actorId: actor.id, date: payment.paymentDate, entityType: "Payment", entityId: payment.id, action: "paymentAllocation.create" });

      const allocatedAgg = await tx.paymentAllocation.aggregate({ where: { paymentId: payment.id }, _sum: { amountAllocated: true } });
      let remainingUnallocated = payment.amount.minus(allocatedAgg._sum.amountAllocated ?? 0);

      // Lock invoices in a fixed order (sorted by id) regardless of the
      // order the client listed them in — two concurrent allocation
      // requests that both touch the same two invoices, in opposite
      // order, would otherwise be a classic deadlock (Postgres would
      // abort one with an error rather than corrupt anything, but a
      // consistent lock order avoids that failure mode entirely).
      const orderedAllocations = [...data.allocations].sort((a, b) => a.invoiceId.localeCompare(b.invoiceId));

      const touchedInvoiceIds: string[] = [];
      for (const line of orderedAllocations) {
        const amount = new Prisma.Decimal(line.amount);

        await tx.$executeRaw`SELECT id FROM "Invoice" WHERE id = ${line.invoiceId} FOR UPDATE`;
        const invoice = await tx.invoice.findFirst({ where: { id: line.invoiceId, companyId: actor.companyId } });
        if (!invoice) throw new ActionInputError("One of the selected invoices was not found.");
        await assertPeriodNotLocked({ companyId: actor.companyId, actorId: actor.id, date: invoice.issueDate, entityType: "Invoice", entityId: invoice.id, action: "paymentAllocation.create" });

        const invoiceAllocatedAgg = await tx.paymentAllocation.aggregate({ where: { invoiceId: invoice.id }, _sum: { amountAllocated: true } });
        const invoiceOutstanding = invoice.totalAmount.minus(invoiceAllocatedAgg._sum.amountAllocated ?? 0);

        validateAllocation(
          { invoiceId: invoice.id, amount },
          {
            paymentUnallocated: remainingUnallocated,
            invoiceCompanyId: invoice.companyId,
            invoiceCustomerId: invoice.customerId,
            paymentCompanyId: payment.companyId,
            paymentCustomerId: payment.customerId,
            invoiceStatus: invoice.status,
            invoiceOutstanding,
          },
        );

        await tx.paymentAllocation.upsert({
          where: { paymentId_invoiceId: { paymentId: payment.id, invoiceId: invoice.id } },
          create: { paymentId: payment.id, invoiceId: invoice.id, amountAllocated: amount },
          update: { amountAllocated: { increment: amount } },
        });

        await recomputeInvoiceAfterAllocationChange(tx, invoice.id);

        remainingUnallocated = remainingUnallocated.minus(amount);
        touchedInvoiceIds.push(invoice.id);
      }

      return touchedInvoiceIds;
    });

    for (const invoiceId of affectedInvoiceIds) {
      const line = data.allocations.find((a) => a.invoiceId === invoiceId);
      await recordAudit({
        companyId: actor.companyId,
        actorId: actor.id,
        action: "paymentAllocation.created",
        entityType: "Invoice",
        entityId: invoiceId,
        afterValue: { paymentId: data.paymentId, amount: line?.amount },
      });
    }

    revalidatePath("/finance/payments");
    revalidatePath("/finance/invoices");
    revalidatePath("/finance/outstanding");
    return ok("Payment allocated.");
  } catch (error) {
    return toActionError(error);
  }
}

export async function removeAllocation(input: unknown): Promise<ActionResult> {
  try {
    const actor = await requireCurrentUserWithPermission(PERMISSIONS.PAYMENT_MANAGE);
    const data = removeAllocationSchema.parse(input);

    const allocation = await prisma.paymentAllocation.findFirst({
      where: { id: data.allocationId, payment: { companyId: actor.companyId } },
      include: { payment: { select: { paymentDate: true } }, invoice: { select: { issueDate: true } } },
    });
    if (!allocation) return { success: false, message: "Allocation not found." };
    await assertPeriodNotLocked({ companyId: actor.companyId, actorId: actor.id, date: allocation.payment.paymentDate, entityType: "Payment", entityId: allocation.paymentId, action: "paymentAllocation.remove" });
    await assertPeriodNotLocked({ companyId: actor.companyId, actorId: actor.id, date: allocation.invoice.issueDate, entityType: "Invoice", entityId: allocation.invoiceId, action: "paymentAllocation.remove" });

    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT id FROM "Invoice" WHERE id = ${allocation.invoiceId} FOR UPDATE`;
      await tx.paymentAllocation.delete({ where: { id: allocation.id } });
      await recomputeInvoiceAfterAllocationChange(tx, allocation.invoiceId);
    });

    await recordAudit({
      companyId: actor.companyId,
      actorId: actor.id,
      action: "paymentAllocation.removed",
      entityType: "Invoice",
      entityId: allocation.invoiceId,
      beforeValue: { paymentId: allocation.paymentId, amount: allocation.amountAllocated.toString() },
    });

    revalidatePath("/finance/payments");
    revalidatePath("/finance/invoices");
    revalidatePath("/finance/outstanding");
    return ok("Allocation removed.");
  } catch (error) {
    return toActionError(error);
  }
}
