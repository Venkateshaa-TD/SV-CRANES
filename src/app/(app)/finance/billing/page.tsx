import type { Metadata } from "next";
import Link from "next/link";
import { Plus, Wallet } from "lucide-react";

import { PermissionGate } from "@/components/layout/permission-gate";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { StatusBadge } from "@/components/shared/status-badge";
import { ListFilterBar } from "@/components/data/list-filter-bar";
import { ResponsiveDataView, type DataColumn } from "@/components/data/responsive-data-view";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { can } from "@/lib/auth/authorize";
import { requireCurrentUser } from "@/lib/auth/current-user";
import { prisma } from "@/lib/db/prisma";
import { formatCurrencyPrecise, formatDate } from "@/lib/format";

export const metadata: Metadata = { title: "Billing" };

const STATUS_OPTIONS = [
  { value: "DRAFT", label: "Draft" },
  { value: "REVIEW", label: "In Review" },
  { value: "APPROVED", label: "Approved" },
  { value: "REJECTED", label: "Rejected" },
  { value: "INVOICED", label: "Invoiced" },
];

type BillingDraftRow = Awaited<ReturnType<typeof loadDrafts>>[number];

async function loadDrafts(companyId: string, params: { status?: string }) {
  return prisma.billingDraft.findMany({
    where: { companyId, status: params.status && params.status !== "all" ? (params.status as never) : undefined },
    include: { project: { select: { name: true } }, customer: { select: { name: true } } },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
}

interface BillingPageProps {
  searchParams: Promise<{ status?: string }>;
}

export default function BillingPage(props: BillingPageProps) {
  return (
    <PermissionGate permission={PERMISSIONS.BILLING_VIEW}>
      <BillingPageContent {...props} />
    </PermissionGate>
  );
}

async function BillingPageContent({ searchParams }: BillingPageProps) {
  const actor = await requireCurrentUser();
  const params = await searchParams;
  const [drafts, canManage] = await Promise.all([loadDrafts(actor.companyId, params), can(actor, PERMISSIONS.BILLING_MANAGE)]);

  const columns: DataColumn<BillingDraftRow>[] = [
    {
      header: "Project",
      cell: (d) => (
        <Link href={`/finance/billing/${d.id}`} className="block min-w-0 hover:underline">
          <p className="truncate font-medium text-foreground">{d.project.name}</p>
          <p className="truncate text-xs text-muted-foreground">{d.customer.name}</p>
        </Link>
      ),
    },
    { header: "Period", cell: (d) => `${formatDate(d.periodStart)} – ${formatDate(d.periodEnd)}` },
    { header: "Type", cell: (d) => d.billingType },
    { header: "Total", cell: (d) => formatCurrencyPrecise(d.totalAmount), align: "right" },
    { header: "Status", cell: (d) => <StatusBadge status={d.status} /> },
  ];

  return (
    <div>
      <PageHeader
        title="Billing"
        description="Generate billable amounts from approved daily logs, then review and approve before invoicing."
        action={
          canManage ? (
            <Button asChild>
              <Link href="/finance/billing/new">
                <Plus /> Prepare Billing
              </Link>
            </Button>
          ) : undefined
        }
      />

      <div className="mb-4">
        <ListFilterBar hideSearch filters={[{ paramKey: "status", label: "Status", options: STATUS_OPTIONS }]} />
      </div>

      <ResponsiveDataView
        data={drafts}
        keyField={(d) => d.id}
        columns={columns}
        emptyState={
          <EmptyState
            icon={Wallet}
            title="Nothing ready for billing"
            description={canManage ? "Prepare a billing draft from a project's operational data to get started." : "No billing drafts match your filters yet."}
            action={
              canManage ? (
                <Button asChild size="sm">
                  <Link href="/finance/billing/new">
                    <Plus /> Prepare Billing
                  </Link>
                </Button>
              ) : undefined
            }
          />
        }
        renderCard={(d) => (
          <Link href={`/finance/billing/${d.id}`}>
            <Card className="transition-colors hover:bg-accent/40">
              <CardContent className="space-y-2 p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-medium text-foreground">{d.project.name}</p>
                    <p className="truncate text-xs text-muted-foreground">{d.customer.name}</p>
                  </div>
                  <StatusBadge status={d.status} className="shrink-0" />
                </div>
                <div className="flex flex-wrap items-center justify-between gap-1 text-xs text-muted-foreground">
                  <span>
                    {d.billingType} · {formatDate(d.periodStart)} – {formatDate(d.periodEnd)}
                  </span>
                </div>
                <p className="text-sm font-medium tabular-nums text-foreground">{formatCurrencyPrecise(d.totalAmount)}</p>
              </CardContent>
            </Card>
          </Link>
        )}
      />
    </div>
  );
}
