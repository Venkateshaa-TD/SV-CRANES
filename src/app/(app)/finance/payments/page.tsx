import type { Metadata } from "next";
import Link from "next/link";
import { Plus, CreditCard } from "lucide-react";

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

export const metadata: Metadata = { title: "Payments" };

type PaymentRow = Awaited<ReturnType<typeof loadPayments>>[number];

async function loadPayments(companyId: string, params: { q?: string; from?: string; to?: string }) {
  return prisma.payment.findMany({
    where: {
      companyId,
      archivedAt: null,
      ...(params.from || params.to ? { paymentDate: { gte: params.from ? new Date(params.from) : undefined, lte: params.to ? new Date(params.to) : undefined } } : {}),
      ...(params.q ? { OR: [{ customer: { name: { contains: params.q, mode: "insensitive" } } }, { referenceNumber: { contains: params.q, mode: "insensitive" } }] } : {}),
    },
    include: { customer: { select: { name: true } } },
    orderBy: { paymentDate: "desc" },
    take: 200,
  });
}

interface PaymentsPageProps {
  searchParams: Promise<{ q?: string; from?: string; to?: string }>;
}

export default function PaymentsPage(props: PaymentsPageProps) {
  return (
    <PermissionGate permission={PERMISSIONS.PAYMENT_VIEW}>
      <PaymentsPageContent {...props} />
    </PermissionGate>
  );
}

async function PaymentsPageContent({ searchParams }: PaymentsPageProps) {
  const actor = await requireCurrentUser();
  const params = await searchParams;
  const [payments, canManage] = await Promise.all([loadPayments(actor.companyId, params), can(actor, PERMISSIONS.PAYMENT_MANAGE)]);

  const columns: DataColumn<PaymentRow>[] = [
    {
      header: "Customer",
      cell: (p) => (
        <Link href={`/finance/payments/${p.id}`} className="block min-w-0 hover:underline">
          <p className="truncate font-medium text-foreground">{p.customer.name}</p>
          <p className="truncate text-xs text-muted-foreground">{p.referenceNumber ?? "No reference"}</p>
        </Link>
      ),
    },
    { header: "Date", cell: (p) => formatDate(p.paymentDate) },
    { header: "Amount", cell: (p) => formatCurrencyPrecise(p.amount), align: "right" },
    { header: "Method", cell: (p) => p.method.replace("_", " ") },
    { header: "Status", cell: (p) => (p.cancelledAt ? <StatusBadge status="CANCELLED" /> : <StatusBadge status="APPROVED" />) },
  ];

  return (
    <div>
      <PageHeader
        title="Payments"
        description="Payments received from customers, including partial payments."
        action={
          canManage ? (
            <Button asChild>
              <Link href="/finance/payments/new">
                <Plus /> Record Payment
              </Link>
            </Button>
          ) : undefined
        }
      />

      <div className="mb-4 space-y-3">
        <ListFilterBar searchPlaceholder="Search customer, reference…" />
        <DateRangeFilter />
      </div>

      <ResponsiveDataView
        data={payments}
        keyField={(p) => p.id}
        columns={columns}
        emptyState={
          <EmptyState
            icon={CreditCard}
            title="No payments yet"
            description={canManage ? "Record a payment to start tracking collections." : "No payments match your filters yet."}
            action={
              canManage ? (
                <Button asChild size="sm">
                  <Link href="/finance/payments/new">
                    <Plus /> Record Payment
                  </Link>
                </Button>
              ) : undefined
            }
          />
        }
        renderCard={(p) => (
          <Link href={`/finance/payments/${p.id}`}>
            <Card className="transition-colors hover:bg-accent/40">
              <CardContent className="space-y-2 p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-medium text-foreground">{p.customer.name}</p>
                    <p className="truncate text-xs text-muted-foreground">{formatDate(p.paymentDate)} · {p.method.replace("_", " ")}</p>
                  </div>
                  {p.cancelledAt ? <StatusBadge status="CANCELLED" className="shrink-0" /> : null}
                </div>
                <p className="text-sm font-medium tabular-nums text-foreground">{formatCurrencyPrecise(p.amount)}</p>
              </CardContent>
            </Card>
          </Link>
        )}
      />
    </div>
  );
}
