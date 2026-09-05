import type { Metadata } from "next";
import Link from "next/link";
import { Plus, Users, Archive } from "lucide-react";

import { PermissionGate } from "@/components/layout/permission-gate";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { Badge } from "@/components/ui/badge";
import { ListFilterBar } from "@/components/data/list-filter-bar";
import { ResponsiveDataView, type DataColumn } from "@/components/data/responsive-data-view";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { can } from "@/lib/auth/authorize";
import { requireCurrentUser } from "@/lib/auth/current-user";
import { prisma } from "@/lib/db/prisma";
import { getOutstandingAmountsByCustomer } from "@/lib/data/finance-queries";
import { formatCurrency } from "@/lib/format";

export const metadata: Metadata = { title: "Customers" };

type CustomerRow = Awaited<ReturnType<typeof loadCustomers>>[number];

async function loadCustomers(companyId: string, params: { q?: string; archived?: string }) {
  const showArchived = params.archived === "1";
  return prisma.customer.findMany({
    where: {
      companyId,
      archivedAt: showArchived ? { not: null } : null,
      ...(params.q
        ? {
            OR: [
              { name: { contains: params.q, mode: "insensitive" } },
              { customerCode: { contains: params.q, mode: "insensitive" } },
              { contactPerson: { contains: params.q, mode: "insensitive" } },
            ],
          }
        : {}),
    },
    orderBy: { name: "asc" },
    take: 200,
  });
}

interface CustomersPageProps {
  searchParams: Promise<{ q?: string; archived?: string }>;
}

export default function CustomersPage(props: CustomersPageProps) {
  return (
    <PermissionGate permission={PERMISSIONS.CUSTOMER_VIEW}>
      <CustomersPageContent {...props} />
    </PermissionGate>
  );
}

async function CustomersPageContent({ searchParams }: CustomersPageProps) {
  const actor = await requireCurrentUser();
  const params = await searchParams;
  const showArchived = params.archived === "1";

  const [customers, canManage, canViewOutstanding] = await Promise.all([
    loadCustomers(actor.companyId, params),
    can(actor, PERMISSIONS.CUSTOMER_MANAGE),
    can(actor, PERMISSIONS.FINANCE_OUTSTANDING_VIEW),
  ]);
  const outstandingByCustomer = canViewOutstanding ? await getOutstandingAmountsByCustomer(actor.companyId) : new Map();

  const columns: DataColumn<CustomerRow>[] = [
    {
      header: "Customer",
      cell: (c) => (
        <Link href={`/customers/${c.id}`} className="block min-w-0 hover:underline">
          <p className="truncate font-medium text-foreground">{c.name}</p>
          <p className="truncate text-xs text-muted-foreground">{c.customerCode ?? "No code"}</p>
        </Link>
      ),
    },
    { header: "Contact", cell: (c) => c.contactPerson ?? "—" },
    { header: "Phone", cell: (c) => c.phone ?? "—" },
    ...(canViewOutstanding
      ? [{ header: "Outstanding", cell: (c: CustomerRow) => formatCurrency(outstandingByCustomer.get(c.id) ?? 0), align: "right" as const }]
      : []),
    { header: "Status", cell: (c) => <Badge variant={c.archivedAt ? "secondary" : "success"}>{c.archivedAt ? "Archived" : "Active"}</Badge> },
  ];

  return (
    <div>
      <PageHeader
        title="Customers"
        description={showArchived ? "Archived customer accounts." : "Customer accounts, contacts, and their projects."}
        action={
          canManage ? (
            <Button asChild>
              <Link href="/customers/new">
                <Plus /> Add Customer
              </Link>
            </Button>
          ) : undefined
        }
      />

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <ListFilterBar searchPlaceholder="Search name, code, contact…" />
        <Button asChild variant="outline" size="sm" className="w-fit">
          <Link href={showArchived ? "/customers" : "/customers?archived=1"}>
            <Archive /> {showArchived ? "View active" : "View archived"}
          </Link>
        </Button>
      </div>

      <ResponsiveDataView
        data={customers}
        keyField={(c) => c.id}
        columns={columns}
        emptyState={
          <EmptyState
            icon={showArchived ? Archive : Users}
            title={showArchived ? "No archived customers" : "No customers yet"}
            description={
              showArchived
                ? "Archived customers will show up here."
                : canManage
                  ? "Add your first customer to start creating projects and invoices."
                  : "No customers match your filters yet."
            }
            action={
              !showArchived && canManage ? (
                <Button asChild size="sm">
                  <Link href="/customers/new">
                    <Plus /> Add Customer
                  </Link>
                </Button>
              ) : undefined
            }
          />
        }
        renderCard={(c) => (
          <Link href={`/customers/${c.id}`}>
            <Card className="transition-colors hover:bg-accent/40">
              <CardContent className="space-y-2 p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-medium text-foreground">{c.name}</p>
                    <p className="truncate text-xs text-muted-foreground">{c.customerCode ?? "No code"}</p>
                  </div>
                  <Badge variant={c.archivedAt ? "secondary" : "success"} className="shrink-0">
                    {c.archivedAt ? "Archived" : "Active"}
                  </Badge>
                </div>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                  <span className="truncate">{c.contactPerson ?? "No contact set"}</span>
                  {c.phone ? <span>{c.phone}</span> : null}
                </div>
                {canViewOutstanding ? (
                  <p className="text-sm font-medium tabular-nums text-foreground">
                    Outstanding: {formatCurrency(outstandingByCustomer.get(c.id) ?? 0)}
                  </p>
                ) : null}
              </CardContent>
            </Card>
          </Link>
        )}
      />
    </div>
  );
}
