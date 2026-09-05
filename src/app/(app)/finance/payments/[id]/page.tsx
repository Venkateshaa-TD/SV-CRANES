import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { PermissionGate } from "@/components/layout/permission-gate";
import { StatusBadge } from "@/components/shared/status-badge";
import { PaymentAllocationPanel } from "@/components/payments/payment-allocation-panel";
import { PaymentCancelControl } from "@/components/payments/payment-cancel-control";
import { RemoveAllocationButton } from "@/components/payments/remove-allocation-button";
import { Card, CardContent } from "@/components/ui/card";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { can } from "@/lib/auth/authorize";
import { requireCurrentUser } from "@/lib/auth/current-user";
import { prisma } from "@/lib/db/prisma";
import { computeUnallocatedAmount, computeInvoiceOutstanding } from "@/lib/business/payment";
import { formatCurrencyPrecise, formatDate } from "@/lib/format";

interface PaymentDetailPageProps {
  params: Promise<{ id: string }>;
}

export const metadata: Metadata = { title: "Payment" };

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-border py-2.5 text-sm last:border-0">
      <span className="text-muted-foreground">{label}</span>
      <span className="truncate text-right font-medium text-foreground">{value}</span>
    </div>
  );
}

export default function PaymentDetailPage(props: PaymentDetailPageProps) {
  return (
    <PermissionGate permission={PERMISSIONS.PAYMENT_VIEW}>
      <PaymentDetailContent {...props} />
    </PermissionGate>
  );
}

async function PaymentDetailContent({ params }: PaymentDetailPageProps) {
  const { id } = await params;
  const actor = await requireCurrentUser();

  const payment = await prisma.payment.findFirst({
    where: { id, companyId: actor.companyId },
    include: {
      customer: { select: { id: true, name: true } },
      allocations: { include: { invoice: { select: { id: true, invoiceNumber: true } } } },
    },
  });
  if (!payment) notFound();

  const [canManage, canCancel] = await Promise.all([can(actor, PERMISSIONS.PAYMENT_MANAGE), can(actor, PERMISSIONS.CUSTOMER_FINANCIAL_EDIT)]);

  const unallocated = computeUnallocatedAmount(
    payment.amount,
    payment.allocations.map((a) => a.amountAllocated),
  );

  let openInvoices: { id: string; invoiceNumber: string; dueDate: Date | null; outstanding: string }[] = [];
  if (canManage && !payment.cancelledAt && unallocated.greaterThan(0)) {
    const candidateInvoices = await prisma.invoice.findMany({
      where: { companyId: actor.companyId, customerId: payment.customerId, archivedAt: null, status: { notIn: ["DRAFT", "CANCELLED"] } },
      include: { paymentAllocations: { select: { amountAllocated: true } } },
    });
    openInvoices = candidateInvoices
      .map((inv) => ({
        id: inv.id,
        invoiceNumber: inv.invoiceNumber,
        dueDate: inv.dueDate,
        outstanding: computeInvoiceOutstanding(inv.totalAmount, inv.paymentAllocations.map((a) => a.amountAllocated)),
      }))
      .filter((inv) => inv.outstanding.greaterThan(0))
      .map((inv) => ({ ...inv, outstanding: inv.outstanding.toString() }));
  }

  return (
    <div>
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="min-w-0 max-w-full truncate text-xl font-semibold tracking-tight text-foreground">{formatCurrencyPrecise(payment.amount)}</h1>
            {payment.cancelledAt ? <StatusBadge status="CANCELLED" className="shrink-0" /> : null}
          </div>
          <p className="text-sm text-muted-foreground">
            <Link href={`/customers/${payment.customer.id}`} className="hover:underline">
              {payment.customer.name}
            </Link>
            {" · "}
            {formatDate(payment.paymentDate)}
          </p>
        </div>
        {canManage && canCancel && !payment.cancelledAt ? <PaymentCancelControl paymentId={payment.id} /> : null}
      </div>

      <div className="space-y-4">
        <Card>
          <CardContent className="p-4 sm:p-5">
            <DetailRow label="Method" value={payment.method.replace("_", " ")} />
            <DetailRow label="Reference" value={payment.referenceNumber ?? "—"} />
            <DetailRow label="Unallocated" value={formatCurrencyPrecise(unallocated)} />
            {payment.notes ? <DetailRow label="Notes" value={payment.notes} /> : null}
            {payment.cancellationReason ? <DetailRow label="Cancellation Reason" value={payment.cancellationReason} /> : null}
          </CardContent>
        </Card>

        {payment.allocations.length > 0 ? (
          <Card>
            <CardContent className="p-4 sm:p-5">
              <h2 className="mb-3 text-sm font-semibold text-foreground">Allocated To</h2>
              <ul className="space-y-2">
                {payment.allocations.map((a) => (
                  <li key={a.id} className="flex items-center justify-between gap-3 text-sm">
                    <Link href={`/finance/invoices/${a.invoice.id}`} className="min-w-0 truncate hover:underline">
                      {a.invoice.invoiceNumber}
                    </Link>
                    <div className="flex shrink-0 items-center gap-2">
                      <span className="tabular-nums font-medium text-foreground">{formatCurrencyPrecise(a.amountAllocated)}</span>
                      {canManage && !payment.cancelledAt ? <RemoveAllocationButton allocationId={a.id} /> : null}
                    </div>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        ) : null}

        {canManage && !payment.cancelledAt && unallocated.greaterThan(0) ? (
          <Card>
            <CardContent className="p-4 sm:p-5">
              <h2 className="mb-3 text-sm font-semibold text-foreground">Allocate Remaining Balance</h2>
              <PaymentAllocationPanel paymentId={payment.id} unallocatedAmount={unallocated.toString()} openInvoices={openInvoices} />
            </CardContent>
          </Card>
        ) : null}
      </div>
    </div>
  );
}
