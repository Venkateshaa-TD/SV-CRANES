import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Pencil, Wallet, PiggyBank, Landmark, AlertTriangle, Briefcase, FileText, CreditCard } from "lucide-react";

import { PermissionGate } from "@/components/layout/permission-gate";
import { StatCard } from "@/components/dashboard/stat-card";
import { StatusBadge } from "@/components/shared/status-badge";
import { UrlTabs } from "@/components/shared/url-tabs";
import { EmptyState } from "@/components/shared/empty-state";
import { ResponsiveDataView, type DataColumn } from "@/components/data/responsive-data-view";
import { DateRangeFilter } from "@/components/data/date-range-filter";
import { CustomerLedgerView } from "@/components/finance/customer-ledger-view";
import { LedgerAdjustmentDrawer } from "@/components/finance/ledger-adjustment-drawer";
import { CustomerArchiveControl } from "@/components/customers/customer-archive-control";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { can } from "@/lib/auth/authorize";
import { requireCurrentUser, getCurrentUser } from "@/lib/auth/current-user";
import { prisma } from "@/lib/db/prisma";
import { getCustomerFinancialSummary, getCustomerLedgerEntries } from "@/lib/data/finance-queries";
import { formatCurrency, formatCurrencyPrecise, formatDate } from "@/lib/format";

interface CustomerDetailPageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string; from?: string; to?: string }>;
}

/** Company-scoped: an id alone must never be enough to leak even a
 * customer's name across tenants via the page <title>. */
export async function generateMetadata({ params }: CustomerDetailPageProps): Promise<Metadata> {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) return { title: "Customer" };
  const customer = await prisma.customer.findFirst({ where: { id, companyId: user.companyId }, select: { name: true } });
  return { title: customer?.name ?? "Customer" };
}

export default function CustomerDetailPage(props: CustomerDetailPageProps) {
  return (
    <PermissionGate permission={PERMISSIONS.CUSTOMER_VIEW}>
      <CustomerDetailContent {...props} />
    </PermissionGate>
  );
}

async function CustomerDetailContent({ params, searchParams }: CustomerDetailPageProps) {
  const { id } = await params;
  const { tab = "overview", from, to } = await searchParams;
  const actor = await requireCurrentUser();

  const customer = await prisma.customer.findFirst({ where: { id, companyId: actor.companyId } });
  if (!customer) notFound();

  const [canManage, canEditFinancials, canViewInvoices, canViewPayments, canViewLedger, canViewProjects] = await Promise.all([
    can(actor, PERMISSIONS.CUSTOMER_MANAGE),
    can(actor, PERMISSIONS.CUSTOMER_FINANCIAL_EDIT),
    can(actor, PERMISSIONS.INVOICE_VIEW),
    can(actor, PERMISSIONS.PAYMENT_VIEW),
    can(actor, PERMISSIONS.FINANCE_LEDGER_VIEW),
    can(actor, PERMISSIONS.PROJECT_VIEW),
  ]);

  const summary = await getCustomerFinancialSummary(actor.companyId, id);

  const tabs = [
    { key: "overview", label: "Overview" },
    ...(canViewProjects ? [{ key: "projects", label: "Projects" }] : []),
    ...(canViewInvoices ? [{ key: "invoices", label: "Invoices" }] : []),
    ...(canViewPayments ? [{ key: "payments", label: "Payments" }] : []),
    ...(canViewLedger ? [{ key: "ledger", label: "Ledger" }] : []),
  ];
  const activeTab = tabs.some((t) => t.key === tab) ? tab : "overview";

  return (
    <div>
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="min-w-0 max-w-full truncate text-xl font-semibold tracking-tight text-foreground">{customer.name}</h1>
            {customer.archivedAt ? <StatusBadge status="CANCELLED" className="shrink-0" /> : null}
          </div>
          <p className="text-sm text-muted-foreground">
            {customer.customerCode ?? "No code"}
            {customer.contactPerson ? ` · ${customer.contactPerson}` : ""}
            {customer.phone ? ` · ${customer.phone}` : ""}
          </p>
        </div>
        {canManage ? (
          <div className="flex shrink-0 flex-wrap gap-2">
            {canEditFinancials ? <LedgerAdjustmentDrawer customerId={customer.id} /> : null}
            <Button asChild variant="outline" size="sm" className="w-fit">
              <Link href={`/customers/${id}/edit`}>
                <Pencil /> Edit
              </Link>
            </Button>
            <CustomerArchiveControl customerId={customer.id} isArchived={!!customer.archivedAt} />
          </div>
        ) : null}
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Total Billed" value={formatCurrency(summary.totalBilled)} icon={Wallet} />
        <StatCard label="Total Paid" value={formatCurrency(summary.totalPaid)} icon={PiggyBank} tone="success" />
        <StatCard label="Outstanding" value={formatCurrency(summary.outstanding)} icon={Landmark} tone={summary.outstanding.greaterThan(0) ? "warning" : "default"} />
        <StatCard label="Overdue" value={formatCurrency(summary.overdue)} icon={AlertTriangle} tone={summary.overdue.isZero() ? "default" : "destructive"} />
      </div>

      <UrlTabs basePath={`/customers/${id}`} activeKey={activeTab} tabs={tabs} />

      {activeTab === "projects" ? (
        <CustomerProjectsTab customerId={id} companyId={actor.companyId} />
      ) : activeTab === "invoices" ? (
        <CustomerInvoicesTab customerId={id} companyId={actor.companyId} />
      ) : activeTab === "payments" ? (
        <CustomerPaymentsTab customerId={id} companyId={actor.companyId} />
      ) : activeTab === "ledger" ? (
        <CustomerLedgerTab customerId={id} companyId={actor.companyId} from={from} to={to} />
      ) : (
        <CustomerOverviewTab customer={customer} />
      )}
    </div>
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

function CustomerOverviewTab({ customer }: { customer: NonNullable<Awaited<ReturnType<typeof prisma.customer.findFirst>>> }) {
  return (
    <Card>
      <CardContent className="p-4 sm:p-5">
        <DetailRow label="Contact Person" value={customer.contactPerson ?? "—"} />
        <DetailRow label="Phone" value={customer.phone ?? "—"} />
        <DetailRow label="Email" value={customer.email ?? "—"} />
        <DetailRow label="GST / Tax Number" value={customer.gstNumber ?? "—"} />
        <DetailRow label="Billing Address" value={customer.address ?? "—"} />
        <DetailRow label="Payment Terms" value={customer.paymentTerms ?? "—"} />
        <DetailRow label="Default Due Days" value={customer.defaultDueDays ?? "—"} />
        {customer.notes ? (
          <div className="pt-3">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Notes</p>
            <p className="mt-1 whitespace-pre-wrap text-sm text-foreground">{customer.notes}</p>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

async function CustomerProjectsTab({ customerId, companyId }: { customerId: string; companyId: string }) {
  const projects = await prisma.project.findMany({
    where: { customerId, companyId, archivedAt: null },
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    take: 50,
  });

  const columns: DataColumn<(typeof projects)[number]>[] = [
    {
      header: "Project",
      cell: (p) => (
        <Link href={`/projects/${p.id}`} className="font-medium hover:underline">
          {p.name}
        </Link>
      ),
    },
    { header: "Job No.", cell: (p) => p.code ?? "—" },
    { header: "Site", cell: (p) => p.siteLocation ?? "—" },
    { header: "Status", cell: (p) => <StatusBadge status={p.status} /> },
  ];

  return (
    <ResponsiveDataView
      data={projects}
      keyField={(p) => p.id}
      columns={columns}
      emptyState={<EmptyState icon={Briefcase} title="No projects yet" description="Projects for this customer will appear here." />}
      renderCard={(p) => (
        <Link href={`/projects/${p.id}`}>
          <Card className="transition-colors hover:bg-accent/40">
            <CardContent className="space-y-1 p-4">
              <div className="flex items-center justify-between gap-2">
                <p className="min-w-0 truncate font-medium text-foreground">{p.name}</p>
                <StatusBadge status={p.status} className="shrink-0" />
              </div>
              <p className="text-xs text-muted-foreground">
                {p.code ?? "No job number"} {p.siteLocation ? `· ${p.siteLocation}` : ""}
              </p>
            </CardContent>
          </Card>
        </Link>
      )}
    />
  );
}

async function CustomerInvoicesTab({ customerId, companyId }: { customerId: string; companyId: string }) {
  const invoices = await prisma.invoice.findMany({
    where: { customerId, companyId, archivedAt: null },
    orderBy: { issueDate: "desc" },
    take: 50,
  });

  const columns: DataColumn<(typeof invoices)[number]>[] = [
    {
      header: "Invoice",
      cell: (inv) => (
        <Link href={`/finance/invoices/${inv.id}`} className="font-medium hover:underline">
          {inv.invoiceNumber}
        </Link>
      ),
    },
    { header: "Issue Date", cell: (inv) => formatDate(inv.issueDate) },
    { header: "Due Date", cell: (inv) => formatDate(inv.dueDate) },
    { header: "Total", cell: (inv) => formatCurrencyPrecise(inv.totalAmount), align: "right" },
    { header: "Status", cell: (inv) => <StatusBadge status={inv.status} /> },
  ];

  return (
    <ResponsiveDataView
      data={invoices}
      keyField={(inv) => inv.id}
      columns={columns}
      emptyState={<EmptyState icon={FileText} title="No invoices yet" description="Invoices for this customer will appear here." />}
      renderCard={(inv) => (
        <Link href={`/finance/invoices/${inv.id}`}>
          <Card className="transition-colors hover:bg-accent/40">
            <CardContent className="space-y-1 p-4">
              <div className="flex items-center justify-between gap-2">
                <p className="min-w-0 truncate font-medium text-foreground">{inv.invoiceNumber}</p>
                <StatusBadge status={inv.status} className="shrink-0" />
              </div>
              <p className="text-xs text-muted-foreground">
                {formatDate(inv.issueDate)} · Due {formatDate(inv.dueDate)}
              </p>
              <p className="text-sm font-medium tabular-nums text-foreground">{formatCurrencyPrecise(inv.totalAmount)}</p>
            </CardContent>
          </Card>
        </Link>
      )}
    />
  );
}

async function CustomerPaymentsTab({ customerId, companyId }: { customerId: string; companyId: string }) {
  const payments = await prisma.payment.findMany({
    where: { customerId, companyId, archivedAt: null },
    orderBy: { paymentDate: "desc" },
    take: 50,
  });

  const columns: DataColumn<(typeof payments)[number]>[] = [
    { header: "Date", cell: (p) => formatDate(p.paymentDate) },
    { header: "Amount", cell: (p) => formatCurrencyPrecise(p.amount), align: "right" },
    { header: "Method", cell: (p) => p.method.replace("_", " ") },
    { header: "Reference", cell: (p) => p.referenceNumber ?? "—" },
    { header: "Status", cell: (p) => (p.cancelledAt ? <StatusBadge status="CANCELLED" /> : <StatusBadge status="APPROVED" />) },
  ];

  return (
    <ResponsiveDataView
      data={payments}
      keyField={(p) => p.id}
      columns={columns}
      emptyState={<EmptyState icon={CreditCard} title="No payments yet" description="Payments from this customer will appear here." />}
      renderCard={(p) => (
        <Link href={`/finance/payments/${p.id}`}>
          <Card className="transition-colors hover:bg-accent/40">
            <CardContent className="space-y-1 p-4">
              <div className="flex items-center justify-between gap-2">
                <p className="font-medium tabular-nums text-foreground">{formatCurrencyPrecise(p.amount)}</p>
                {p.cancelledAt ? <StatusBadge status="CANCELLED" className="shrink-0" /> : null}
              </div>
              <p className="text-xs text-muted-foreground">
                {formatDate(p.paymentDate)} · {p.method.replace("_", " ")}
                {p.referenceNumber ? ` · ${p.referenceNumber}` : ""}
              </p>
            </CardContent>
          </Card>
        </Link>
      )}
    />
  );
}

async function CustomerLedgerTab({ customerId, companyId, from, to }: { customerId: string; companyId: string; from?: string; to?: string }) {
  const fromDate = from ? new Date(from) : undefined;
  const toDate = to ? new Date(to) : undefined;
  const entries = await getCustomerLedgerEntries(companyId, customerId, { from: fromDate, to: toDate });

  return (
    <div className="space-y-3">
      <DateRangeFilter />
      <CustomerLedgerView entries={entries} />
    </div>
  );
}
