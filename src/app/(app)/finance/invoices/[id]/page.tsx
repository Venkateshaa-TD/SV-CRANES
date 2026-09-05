import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Pencil, Printer } from "lucide-react";

import { PermissionGate } from "@/components/layout/permission-gate";
import { StatusBadge } from "@/components/shared/status-badge";
import { InvoiceStatusActions } from "@/components/invoices/invoice-status-actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { can } from "@/lib/auth/authorize";
import { requireCurrentUser, getCurrentUser } from "@/lib/auth/current-user";
import { prisma } from "@/lib/db/prisma";
import { isInvoiceEditable } from "@/lib/business/invoice";
import { formatCurrencyPrecise, formatDate } from "@/lib/format";

interface InvoiceDetailPageProps {
  params: Promise<{ id: string }>;
}

/** Company-scoped: an id alone must never be enough to leak even an
 * invoice number across tenants via the page <title>. */
export async function generateMetadata({ params }: InvoiceDetailPageProps): Promise<Metadata> {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) return { title: "Invoice" };
  const invoice = await prisma.invoice.findFirst({ where: { id, companyId: user.companyId }, select: { invoiceNumber: true } });
  return { title: invoice?.invoiceNumber ?? "Invoice" };
}

export default function InvoiceDetailPage(props: InvoiceDetailPageProps) {
  return (
    <PermissionGate permission={PERMISSIONS.INVOICE_VIEW}>
      <InvoiceDetailContent {...props} />
    </PermissionGate>
  );
}

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-border py-2.5 text-sm last:border-0">
      <span className="text-muted-foreground">{label}</span>
      <span className="truncate text-right font-medium text-foreground">{value}</span>
    </div>
  );
}

async function InvoiceDetailContent({ params }: InvoiceDetailPageProps) {
  const { id } = await params;
  const actor = await requireCurrentUser();

  const invoice = await prisma.invoice.findFirst({
    where: { id, companyId: actor.companyId },
    include: {
      customer: { select: { id: true, name: true } },
      project: { select: { id: true, name: true } },
      lines: { orderBy: { sortOrder: "asc" } },
      paymentAllocations: { include: { payment: { select: { id: true, paymentDate: true, method: true, referenceNumber: true } } } },
    },
  });
  if (!invoice) notFound();

  const [canManageInvoice, canCancel] = await Promise.all([
    can(actor, PERMISSIONS.INVOICE_MANAGE),
    can(actor, PERMISSIONS.CUSTOMER_FINANCIAL_EDIT),
  ]);

  return (
    <div>
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="min-w-0 max-w-full truncate text-xl font-semibold tracking-tight text-foreground">{invoice.invoiceNumber}</h1>
            <StatusBadge status={invoice.status} className="shrink-0" />
          </div>
          <p className="text-sm text-muted-foreground">
            <Link href={`/customers/${invoice.customer.id}`} className="hover:underline">
              {invoice.customer.name}
            </Link>
            {invoice.project ? (
              <>
                {" · "}
                <Link href={`/projects/${invoice.project.id}`} className="hover:underline">
                  {invoice.project.name}
                </Link>
              </>
            ) : null}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <Button asChild variant="outline" size="sm">
            <Link href={`/invoices/${id}/print`} target="_blank">
              <Printer /> Print
            </Link>
          </Button>
          {canManageInvoice && isInvoiceEditable(invoice.status) ? (
            <Button asChild variant="outline" size="sm">
              <Link href={`/finance/invoices/${id}/edit`}>
                <Pencil /> Edit
              </Link>
            </Button>
          ) : null}
        </div>
      </div>

      <div className="space-y-4">
        <Card>
          <CardContent className="p-4 sm:p-5">
            <DetailRow label="Issue Date" value={formatDate(invoice.issueDate)} />
            <DetailRow label="Due Date" value={formatDate(invoice.dueDate)} />
            {invoice.billingPeriodStart ? (
              <DetailRow label="Billing Period" value={`${formatDate(invoice.billingPeriodStart)} – ${formatDate(invoice.billingPeriodEnd)}`} />
            ) : null}
            <DetailRow label="Subtotal" value={formatCurrencyPrecise(invoice.subtotal)} />
            {!invoice.discountAmount.isZero() ? <DetailRow label="Discount" value={`-${formatCurrencyPrecise(invoice.discountAmount)}`} /> : null}
            <DetailRow label="Tax" value={formatCurrencyPrecise(invoice.taxAmount)} />
            <div className="flex items-center justify-between gap-4 pt-2 text-base">
              <span className="font-semibold text-foreground">Total</span>
              <span className="font-semibold tabular-nums text-foreground">{formatCurrencyPrecise(invoice.totalAmount)}</span>
            </div>
            <DetailRow label="Paid" value={formatCurrencyPrecise(invoice.amountPaid)} />
            <DetailRow label="Balance" value={formatCurrencyPrecise(invoice.totalAmount.minus(invoice.amountPaid))} />
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4 sm:p-5">
            <h2 className="mb-3 text-sm font-semibold text-foreground">Line Items</h2>
            <ul className="space-y-2">
              {invoice.lines.map((line) => (
                <li key={line.id} className="flex items-start justify-between gap-3 border-b border-border pb-2 text-sm last:border-0">
                  <div className="min-w-0">
                    <p className="text-foreground">{line.description}</p>
                    <p className="text-xs text-muted-foreground">
                      {line.quantity.toString()} × {formatCurrencyPrecise(line.unitPrice)}
                      {!line.taxPercent.isZero() ? ` · Tax ${line.taxPercent.toString()}%` : ""}
                    </p>
                  </div>
                  <span className="shrink-0 tabular-nums font-medium text-foreground">{formatCurrencyPrecise(line.amount)}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        {invoice.paymentAllocations.length > 0 ? (
          <Card>
            <CardContent className="p-4 sm:p-5">
              <h2 className="mb-3 text-sm font-semibold text-foreground">Payments Applied</h2>
              <ul className="space-y-2">
                {invoice.paymentAllocations.map((a) => (
                  <li key={a.id} className="flex items-center justify-between gap-3 text-sm">
                    <Link href={`/finance/payments/${a.payment.id}`} className="min-w-0 truncate hover:underline">
                      {formatDate(a.payment.paymentDate)} · {a.payment.method.replace("_", " ")}
                      {a.payment.referenceNumber ? ` · ${a.payment.referenceNumber}` : ""}
                    </Link>
                    <span className="shrink-0 tabular-nums font-medium text-foreground">{formatCurrencyPrecise(a.amountAllocated)}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        ) : null}

        {invoice.notes || invoice.cancellationReason ? (
          <Card>
            <CardContent className="space-y-3 p-4 sm:p-5">
              {invoice.notes ? (
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Notes</p>
                  <p className="mt-1 whitespace-pre-wrap text-sm text-foreground">{invoice.notes}</p>
                </div>
              ) : null}
              {invoice.cancellationReason ? (
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Cancellation Reason</p>
                  <p className="mt-1 whitespace-pre-wrap text-sm text-foreground">{invoice.cancellationReason}</p>
                </div>
              ) : null}
            </CardContent>
          </Card>
        ) : null}

        <InvoiceStatusActions invoiceId={invoice.id} status={invoice.status} canManageInvoice={canManageInvoice} canCancel={canCancel} />
      </div>
    </div>
  );
}
