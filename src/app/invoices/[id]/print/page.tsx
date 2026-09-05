import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/auth/current-user";
import { can } from "@/lib/auth/authorize";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { prisma } from "@/lib/db/prisma";
import { PrintButton } from "@/components/invoices/print-button";
import { StatusBadge } from "@/components/shared/status-badge";
import { formatCurrencyPrecise, formatDate } from "@/lib/format";

interface InvoicePrintPageProps {
  params: Promise<{ id: string }>;
}

export const metadata: Metadata = { title: "Invoice" };

/**
 * Deliberately outside the (app) route group — this renders without the
 * AppShell (no header, sidebar, or bottom nav) so the printed page is a
 * clean document, not a cropped view of the app chrome. Since it bypasses
 * the (app) layout's auth redirect, auth and company-scoped authorization
 * are re-checked here directly, same as the (auth) route group's login
 * page.
 */
export default async function InvoicePrintPage({ params }: InvoicePrintPageProps) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const allowed = await can(user, PERMISSIONS.INVOICE_VIEW);
  if (!allowed) notFound();

  const invoice = await prisma.invoice.findFirst({
    where: { id, companyId: user.companyId },
    include: {
      company: true,
      customer: true,
      project: { select: { name: true, code: true } },
      lines: { orderBy: { sortOrder: "asc" } },
    },
  });
  if (!invoice) notFound();

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 print:max-w-none print:p-0">
      <div className="mb-6 flex justify-end print:hidden">
        <PrintButton />
      </div>

      <div className="rounded-lg border border-border bg-card p-6 shadow-sm print:rounded-none print:border-0 print:p-0 print:shadow-none">
        <header className="mb-8 flex flex-col justify-between gap-4 border-b border-border pb-6 sm:flex-row">
          <div>
            <h1 className="text-lg font-bold text-foreground">{invoice.company.name}</h1>
            {invoice.company.address ? <p className="whitespace-pre-line text-sm text-muted-foreground">{invoice.company.address}</p> : null}
            <p className="text-sm text-muted-foreground">
              {[invoice.company.phone, invoice.company.email].filter(Boolean).join(" · ")}
            </p>
          </div>
          <div className="sm:text-right">
            <h2 className="text-2xl font-bold uppercase tracking-wide text-foreground">Invoice</h2>
            <p className="font-mono text-sm text-muted-foreground">{invoice.invoiceNumber}</p>
            <div className="mt-1">
              <StatusBadge status={invoice.status} />
            </div>
          </div>
        </header>

        <section className="mb-8 grid grid-cols-1 gap-6 sm:grid-cols-2">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Billed To</p>
            <p className="mt-1 font-medium text-foreground">{invoice.customer.name}</p>
            {invoice.customer.address ? <p className="whitespace-pre-line text-sm text-muted-foreground">{invoice.customer.address}</p> : null}
            {invoice.customer.gstNumber ? <p className="text-sm text-muted-foreground">GSTIN: {invoice.customer.gstNumber}</p> : null}
          </div>
          <div className="space-y-1 text-sm sm:text-right">
            <p>
              <span className="text-muted-foreground">Issue Date: </span>
              <span className="font-medium text-foreground">{formatDate(invoice.issueDate)}</span>
            </p>
            <p>
              <span className="text-muted-foreground">Due Date: </span>
              <span className="font-medium text-foreground">{formatDate(invoice.dueDate)}</span>
            </p>
            {invoice.project ? (
              <p>
                <span className="text-muted-foreground">Project: </span>
                <span className="font-medium text-foreground">{invoice.project.name}</span>
              </p>
            ) : null}
            {invoice.billingPeriodStart ? (
              <p>
                <span className="text-muted-foreground">Billing Period: </span>
                <span className="font-medium text-foreground">
                  {formatDate(invoice.billingPeriodStart)} – {formatDate(invoice.billingPeriodEnd)}
                </span>
              </p>
            ) : null}
          </div>
        </section>

        {/* Wrapped in its own horizontal scroller for the on-screen phone
            view (the 320px target this app is built around) — print
            media renders the table at the page's full width regardless,
            since a printed page is never viewport-constrained. */}
        <div className="mb-6 overflow-x-auto print:overflow-visible">
          <table className="w-full min-w-[420px] text-sm print:min-w-0">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="py-2">Description</th>
                <th className="py-2 text-right">Qty</th>
                <th className="py-2 text-right">Rate</th>
                <th className="py-2 text-right">Tax</th>
                <th className="py-2 text-right">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {invoice.lines.map((line) => (
                <tr key={line.id}>
                  <td className="py-2 pr-2">{line.description}</td>
                  <td className="py-2 text-right tabular-nums">{line.quantity.toString()}</td>
                  <td className="py-2 text-right tabular-nums">{formatCurrencyPrecise(line.unitPrice)}</td>
                  <td className="py-2 text-right tabular-nums">{formatCurrencyPrecise(line.taxAmount)}</td>
                  <td className="py-2 text-right tabular-nums">{formatCurrencyPrecise(line.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <section className="ml-auto mb-8 w-full max-w-xs space-y-1.5 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Subtotal</span>
            <span className="tabular-nums">{formatCurrencyPrecise(invoice.subtotal)}</span>
          </div>
          {!invoice.discountAmount.isZero() ? (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Discount</span>
              <span className="tabular-nums">-{formatCurrencyPrecise(invoice.discountAmount)}</span>
            </div>
          ) : null}
          <div className="flex justify-between">
            <span className="text-muted-foreground">Tax</span>
            <span className="tabular-nums">{formatCurrencyPrecise(invoice.taxAmount)}</span>
          </div>
          <div className="flex justify-between border-t border-border pt-1.5 text-base font-semibold">
            <span>Total</span>
            <span className="tabular-nums">{formatCurrencyPrecise(invoice.totalAmount)}</span>
          </div>
          {!invoice.amountPaid.isZero() ? (
            <>
              <div className="flex justify-between text-success">
                <span>Paid</span>
                <span className="tabular-nums">{formatCurrencyPrecise(invoice.amountPaid)}</span>
              </div>
              <div className="flex justify-between font-semibold">
                <span>Balance Due</span>
                <span className="tabular-nums">{formatCurrencyPrecise(invoice.totalAmount.minus(invoice.amountPaid))}</span>
              </div>
            </>
          ) : null}
        </section>

        {invoice.notes ? (
          <section className="border-t border-border pt-4 text-sm">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Notes</p>
            <p className="mt-1 whitespace-pre-wrap text-foreground">{invoice.notes}</p>
          </section>
        ) : null}
      </div>
    </div>
  );
}
