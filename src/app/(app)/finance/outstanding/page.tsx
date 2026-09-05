import type { Metadata } from "next";
import Link from "next/link";
import { Landmark, AlertTriangle, Wallet } from "lucide-react";

import { PermissionGate } from "@/components/layout/permission-gate";
import { PageHeader } from "@/components/layout/page-header";
import { StatCard } from "@/components/dashboard/stat-card";
import { EmptyState } from "@/components/shared/empty-state";
import { StatusBadge } from "@/components/shared/status-badge";
import { ListFilterBar } from "@/components/data/list-filter-bar";
import { DateRangeFilter } from "@/components/data/date-range-filter";
import { ResponsiveDataView, type DataColumn } from "@/components/data/responsive-data-view";
import { OverdueOnlyToggle } from "@/components/finance/overdue-only-toggle";
import { Card, CardContent } from "@/components/ui/card";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { requireCurrentUser } from "@/lib/auth/current-user";
import { listOutstandingInvoices, getOutstandingSummary } from "@/lib/data/finance-queries";
import { listActiveCustomerOptions } from "@/lib/data/reference-data";
import { formatCurrency, formatCurrencyPrecise, formatDate } from "@/lib/format";

export const metadata: Metadata = { title: "Outstanding" };

interface OutstandingPageProps {
  searchParams: Promise<{ customerId?: string; overdue?: string; from?: string; to?: string }>;
}

export default function OutstandingPage(props: OutstandingPageProps) {
  return (
    <PermissionGate permission={PERMISSIONS.FINANCE_OUTSTANDING_VIEW}>
      <OutstandingPageContent {...props} />
    </PermissionGate>
  );
}

type Row = Awaited<ReturnType<typeof listOutstandingInvoices>>[number];

async function OutstandingPageContent({ searchParams }: OutstandingPageProps) {
  const actor = await requireCurrentUser();
  const params = await searchParams;
  const filters = {
    customerId: params.customerId && params.customerId !== "all" ? params.customerId : undefined,
    overdueOnly: params.overdue === "1",
    from: params.from ? new Date(params.from) : undefined,
    to: params.to ? new Date(params.to) : undefined,
  };

  const [rows, summary, customerOptions] = await Promise.all([
    listOutstandingInvoices(actor.companyId, filters),
    getOutstandingSummary(actor.companyId, filters),
    listActiveCustomerOptions(actor.companyId),
  ]);

  const columns: DataColumn<Row>[] = [
    {
      header: "Customer",
      cell: (r) => (
        <Link href={`/customers/${r.invoice.customerId}`} className="hover:underline">
          {r.invoice.customer.name}
        </Link>
      ),
    },
    {
      header: "Invoice",
      cell: (r) => (
        <Link href={`/finance/invoices/${r.invoice.id}`} className="font-medium hover:underline">
          {r.invoice.invoiceNumber}
        </Link>
      ),
    },
    { header: "Issue Date", cell: (r) => formatDate(r.invoice.issueDate) },
    { header: "Due Date", cell: (r) => formatDate(r.invoice.dueDate) },
    { header: "Total", cell: (r) => formatCurrencyPrecise(r.invoice.totalAmount), align: "right" },
    { header: "Paid", cell: (r) => formatCurrencyPrecise(r.invoice.amountPaid), align: "right" },
    { header: "Balance", cell: (r) => formatCurrencyPrecise(r.outstanding), align: "right" },
    { header: "Days Overdue", cell: (r) => (r.overdue ? r.daysOverdue : "—"), align: "right" },
    { header: "Status", cell: (r) => <StatusBadge status={r.overdue ? "OVERDUE" : r.invoice.status} /> },
  ];

  return (
    <div>
      <PageHeader title="Outstanding" description="Customer balances still due across all invoices." />

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <StatCard label="Total Receivables" value={formatCurrency(summary.totalReceivables)} icon={Wallet} />
        <StatCard label="Current Outstanding" value={formatCurrency(summary.currentOutstanding)} icon={Landmark} />
        <StatCard label="Overdue Outstanding" value={formatCurrency(summary.overdueOutstanding)} icon={AlertTriangle} tone={summary.overdueOutstanding.isZero() ? "default" : "destructive"} />
      </div>

      <div className="mb-4 space-y-3">
        <ListFilterBar
          hideSearch
          filters={[{ paramKey: "customerId", label: "Customer", options: customerOptions.map((c) => ({ value: c.id, label: c.name })) }]}
        />
        <div className="flex flex-wrap items-center gap-3">
          <DateRangeFilter />
          <OverdueOnlyToggle />
        </div>
      </div>

      <ResponsiveDataView
        data={rows}
        keyField={(r) => r.invoice.id}
        columns={columns}
        emptyState={<EmptyState icon={Landmark} title="No outstanding invoices" description="Every invoice matching your filters is fully paid." />}
        renderCard={(r) => (
          <Link href={`/finance/invoices/${r.invoice.id}`}>
            <Card className="transition-colors hover:bg-accent/40">
              <CardContent className="space-y-2 p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-medium text-foreground">{r.invoice.customer.name}</p>
                    <p className="truncate text-xs text-muted-foreground">{r.invoice.invoiceNumber}</p>
                  </div>
                  <StatusBadge status={r.overdue ? "OVERDUE" : r.invoice.status} className="shrink-0" />
                </div>
                <div className="flex flex-wrap items-center justify-between gap-1 text-xs text-muted-foreground">
                  <span>Due {formatDate(r.invoice.dueDate)}</span>
                  {r.overdue ? <span className="font-medium text-destructive">{r.daysOverdue} days overdue</span> : null}
                </div>
                <p className="text-sm font-medium tabular-nums text-foreground">Balance: {formatCurrencyPrecise(r.outstanding)}</p>
              </CardContent>
            </Card>
          </Link>
        )}
      />
    </div>
  );
}
