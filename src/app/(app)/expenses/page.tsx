import type { Metadata } from "next";
import Link from "next/link";
import { Plus, Receipt } from "lucide-react";

import { PermissionGate } from "@/components/layout/permission-gate";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { StatusBadge } from "@/components/shared/status-badge";
import { ListFilterBar } from "@/components/data/list-filter-bar";
import { ResponsiveDataView, type DataColumn } from "@/components/data/responsive-data-view";
import { AttachmentLink } from "@/components/shared/attachment-link";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { can } from "@/lib/auth/authorize";
import { requireCurrentUser } from "@/lib/auth/current-user";
import { prisma } from "@/lib/db/prisma";
import { listActiveExpenseCategoryOptions } from "@/lib/data/reference-data";

export const metadata: Metadata = { title: "Expenses" };

const dateFormatter = new Intl.DateTimeFormat("en-IN", { dateStyle: "medium" });
const currencyFormatter = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });

type ExpenseRow = Awaited<ReturnType<typeof loadExpenses>>[number];

async function loadExpenses(companyId: string, viewerId: string, canViewAll: boolean, params: { status?: string; categoryId?: string }) {
  return prisma.expense.findMany({
    where: {
      archivedAt: null,
      // Expense has no direct companyId — an expense may have neither a
      // vehicle nor a project, so scope through the always-present
      // submitter relation instead.
      submittedBy: { companyId },
      // Ordinary submitters only see their own expenses; approvers/managers
      // see everyone's — enforced here, not just hidden in the UI.
      submittedById: canViewAll ? undefined : viewerId,
      status: params.status && params.status !== "all" ? (params.status as never) : undefined,
      categoryId: params.categoryId && params.categoryId !== "all" ? params.categoryId : undefined,
    },
    include: {
      category: { select: { name: true } },
      submittedBy: { select: { name: true } },
      vehicle: { select: { name: true } },
      receipt: { select: { storageKey: true } },
    },
    orderBy: { expenseDate: "desc" },
    take: 100,
  });
}

interface ExpensesPageProps {
  searchParams: Promise<{ status?: string; categoryId?: string }>;
}

export default function ExpensesPage(props: ExpensesPageProps) {
  return (
    <PermissionGate permission={PERMISSIONS.EXPENSE_VIEW}>
      <ExpensesPageContent {...props} />
    </PermissionGate>
  );
}

async function ExpensesPageContent({ searchParams }: ExpensesPageProps) {
  const user = await requireCurrentUser();
  const params = await searchParams;
  const canViewAll = await can(user, PERMISSIONS.EXPENSE_APPROVE);
  const [expenses, categories, canCreate] = await Promise.all([
    loadExpenses(user.companyId, user.id, canViewAll, params),
    listActiveExpenseCategoryOptions(user.companyId),
    can(user, PERMISSIONS.EXPENSE_CREATE),
  ]);

  const columns: DataColumn<ExpenseRow>[] = [
    {
      header: "Date",
      cell: (e) => (
        <Link href={`/expenses/${e.id}/edit`} className="font-medium hover:underline">
          {dateFormatter.format(e.expenseDate)}
        </Link>
      ),
    },
    { header: "Category", cell: (e) => e.category.name },
    { header: "Submitted By", cell: (e) => e.submittedBy.name },
    { header: "Vehicle", cell: (e) => e.vehicle?.name ?? "—" },
    { header: "Amount", cell: (e) => currencyFormatter.format(Number(e.amount)), align: "right" },
    { header: "Status", cell: (e) => <StatusBadge status={e.status} /> },
    { header: "Receipt", cell: (e) => <AttachmentLink label="View" storageKey={e.receipt?.storageKey} /> },
  ];

  return (
    <div>
      <PageHeader
        title="Expenses"
        description="Operational expenses submitted for review and approval."
        action={
          canCreate ? (
            <Button asChild>
              <Link href="/expenses/new">
                <Plus /> Submit Expense
              </Link>
            </Button>
          ) : undefined
        }
      />

      <div className="mb-4">
        <ListFilterBar
          hideSearch
          filters={[
            {
              paramKey: "status",
              label: "Status",
              options: [
                { value: "PENDING", label: "Pending" },
                { value: "APPROVED", label: "Approved" },
                { value: "REJECTED", label: "Rejected" },
              ],
            },
            { paramKey: "categoryId", label: "Category", options: categories.map((c) => ({ value: c.id, label: c.name })) },
          ]}
        />
      </div>

      <ResponsiveDataView
        data={expenses}
        keyField={(e) => e.id}
        columns={columns}
        emptyState={
          <EmptyState
            icon={Receipt}
            title="No expenses yet"
            description={canCreate ? "Submit your first expense to get started." : "No expenses match your filters."}
            action={
              canCreate ? (
                <Button asChild size="sm">
                  <Link href="/expenses/new">
                    <Plus /> Submit Expense
                  </Link>
                </Button>
              ) : undefined
            }
          />
        }
        renderCard={(e) => (
          <Card className="transition-colors hover:bg-accent/40">
            <CardContent className="space-y-1 p-4">
              <Link href={`/expenses/${e.id}/edit`} className="block space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <p className="min-w-0 truncate font-medium text-foreground">{e.category.name}</p>
                  <StatusBadge status={e.status} className="shrink-0" />
                </div>
                <p className="text-sm tabular-nums text-foreground">{currencyFormatter.format(Number(e.amount))}</p>
                <p className="text-xs text-muted-foreground">
                  {dateFormatter.format(e.expenseDate)} · {e.submittedBy.name}
                  {e.vehicle ? ` · ${e.vehicle.name}` : ""}
                </p>
              </Link>
              {e.receipt ? (
                <div className="pt-1">
                  <AttachmentLink label="View receipt" storageKey={e.receipt.storageKey} />
                </div>
              ) : null}
            </CardContent>
          </Card>
        )}
      />
    </div>
  );
}
