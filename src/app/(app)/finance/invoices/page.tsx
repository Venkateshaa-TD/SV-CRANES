import type { Metadata } from "next";
import Link from "next/link";
import { Plus, FileText } from "lucide-react";

import { PermissionGate } from "@/components/layout/permission-gate";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { StatusBadge } from "@/components/shared/status-badge";
import { ListFilterBar } from "@/components/data/list-filter-bar";
import { DateRangeFilter } from "@/components/data/date-range-filter";
import { ResponsiveDataView, type DataColumn } from "@/components/data/responsive-data-view";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { can } from "@/lib/auth/authorize";
import { requireCurrentUser } from "@/lib/auth/current-user";
import { prisma } from "@/lib/db/prisma";
import { formatCurrencyPrecise, formatDate } from "@/lib/format";

export const metadata: Metadata = { title: "Invoices" };

const STATUS_OPTIONS = [
  { value: "DRAFT", label: "Draft" },
  { value: "APPROVED", label: "Approved" },
  { value: "SENT", label: "Sent" },
  { value: "PARTIALLY_PAID", label: "Partially Paid" },
  { value: "PAID", label: "Paid" },
  { value: "OVERDUE", label: "Overdue" },
  { value: "CANCELLED", label: "Cancelled" },
];

type InvoiceRow = Awaited<ReturnType<typeof loadInvoices>>[number];

async function loadInvoices(companyId: string, params: { q?: string; status?: string; from?: string; to?: string }) {
  return prisma.invoice.findMany({
    where: {
      companyId,
      archivedAt: null,
      status: params.status && params.status !== "all" ? (params.status as never) : undefined,
      ...(params.from || params.to ? { issueDate: { gte: params.from ? new Date(params.from) : undefined, lte: params.to ? new Date(params.to) : undefined } } : {}),
      ...(params.q
        ? { OR: [{ invoiceNumber: { contains: params.q, mode: "insensitive" } }, { customer: { name: { contains: params.q, mode: "insensitive" } } }] }
        : {}),
    },
    include: { customer: { select: { name: true } }, project: { select: { name: true } } },
    orderBy: { issueDate: "desc" },
    take: 200,
  });
}

interface InvoicesPageProps {
  searchParams: Promise<{ q?: string; status?: string; from?: string; to?: string }>;
}

export default function InvoicesPage(props: InvoicesPageProps) {
  return (
    <PermissionGate permission={PERMISSIONS.INVOICE_VIEW}>
      <InvoicesPageContent {...props} />
    </PermissionGate>
  );
}

async function InvoicesPageContent({ searchParams }: InvoicesPageProps) {
  const actor = await requireCurrentUser();
  const params = await searchParams;
  const [invoices, canManage] = await Promise.all([loadInvoices(actor.companyId, params), can(actor, PERMISSIONS.INVOICE_MANAGE)]);

  const columns: DataColumn<InvoiceRow>[] = [
    {
      header: "Invoice",
      cell: (inv) => (
        <Link href={`/finance/invoices/${inv.id}`} className="block min-w-0 hover:underline">
          <p className="truncate font-medium text-foreground">{inv.invoiceNumber}</p>
          <p className="truncate text-xs text-muted-foreground">{inv.customer.name}</p>
        </Link>
      ),
    },
    { header: "Project", cell: (inv) => inv.project?.name ?? "—" },
    { header: "Issue Date", cell: (inv) => formatDate(inv.issueDate) },
    { header: "Due Date", cell: (inv) => formatDate(inv.dueDate) },
    { header: "Total", cell: (inv) => formatCurrencyPrecise(inv.totalAmount), align: "right" },
    { header: "Status", cell: (inv) => <StatusBadge status={inv.status} /> },
  ];

  return (
    <div>
      <PageHeader
        title="Invoices"
        description="Customer invoices, from draft through paid."
        action={
          canManage ? (
            <Button asChild>
              <Link href="/finance/invoices/new">
                <Plus /> New Invoice
              </Link>
            </Button>
          ) : undefined
        }
      />

      <div className="mb-4 space-y-3">
        <ListFilterBar searchPlaceholder="Search invoice #, customer…" filters={[{ paramKey: "status", label: "Status", options: STATUS_OPTIONS }]} />
        <DateRangeFilter />
      </div>

      <ResponsiveDataView
        data={invoices}
        keyField={(inv) => inv.id}
        columns={columns}
        emptyState={
          <EmptyState
            icon={FileText}
            title="No invoices yet"
            description={canManage ? "Generate one from an approved billing draft, or create a manual invoice." : "No invoices match your filters yet."}
            action={
              canManage ? (
                <Button asChild size="sm">
                  <Link href="/finance/invoices/new">
                    <Plus /> New Invoice
                  </Link>
                </Button>
              ) : undefined
            }
          />
        }
        renderCard={(inv) => (
          <Link href={`/finance/invoices/${inv.id}`}>
            <Card className="transition-colors hover:bg-accent/40">
              <CardContent className="space-y-2 p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-medium text-foreground">{inv.invoiceNumber}</p>
                    <p className="truncate text-xs text-muted-foreground">{inv.customer.name}</p>
                  </div>
                  <StatusBadge status={inv.status} className="shrink-0" />
                </div>
                <div className="flex flex-wrap items-center justify-between gap-1 text-xs text-muted-foreground">
                  <span>
                    {formatDate(inv.issueDate)} · Due {formatDate(inv.dueDate)}
                  </span>
                </div>
                <p className="text-sm font-medium tabular-nums text-foreground">{formatCurrencyPrecise(inv.totalAmount)}</p>
              </CardContent>
            </Card>
          </Link>
        )}
      />
    </div>
  );
}
