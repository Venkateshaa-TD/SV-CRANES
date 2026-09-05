import type { Metadata } from "next";
import { CheckSquare } from "lucide-react";

import { PermissionGate } from "@/components/layout/permission-gate";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { AttachmentLink } from "@/components/shared/attachment-link";
import { ExpenseReviewActions } from "@/components/expenses/expense-review-actions";
import { Card, CardContent } from "@/components/ui/card";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { requireCurrentUser } from "@/lib/auth/current-user";
import { prisma } from "@/lib/db/prisma";

export const metadata: Metadata = { title: "Approvals" };

const dateFormatter = new Intl.DateTimeFormat("en-IN", { dateStyle: "medium" });
const currencyFormatter = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });

export default function ApprovalsPage() {
  return (
    <PermissionGate permission={PERMISSIONS.APPROVALS_VIEW}>
      <ApprovalsPageContent />
    </PermissionGate>
  );
}

async function ApprovalsPageContent() {
  const user = await requireCurrentUser();

  const pendingExpenses = await prisma.expense.findMany({
    where: { status: "PENDING", archivedAt: null, submittedBy: { companyId: user.companyId } },
    include: {
      category: { select: { name: true } },
      submittedBy: { select: { name: true } },
      vehicle: { select: { name: true } },
      receipt: { select: { storageKey: true } },
    },
    orderBy: { expenseDate: "desc" },
    take: 100,
  });

  return (
    <div>
      <PageHeader title="Approvals" description="Expenses waiting on your review." />

      {pendingExpenses.length === 0 ? (
        <EmptyState icon={CheckSquare} title="Nothing pending" description="Submitted expenses awaiting review will show up here." />
      ) : (
        <div className="space-y-3">
          {pendingExpenses.map((expense) => (
            <Card key={expense.id}>
              <CardContent className="space-y-3 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-medium text-foreground">{expense.submittedBy.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {dateFormatter.format(expense.expenseDate)} · {expense.category.name}
                      {expense.vehicle ? ` · ${expense.vehicle.name}` : ""}
                    </p>
                  </div>
                  <p className="shrink-0 text-lg font-semibold tabular-nums text-foreground">
                    {currencyFormatter.format(Number(expense.amount))}
                  </p>
                </div>
                {expense.description ? <p className="text-sm text-foreground">{expense.description}</p> : null}
                <AttachmentLink label="View receipt" storageKey={expense.receipt?.storageKey} emptyText="No receipt attached" />
                <ExpenseReviewActions expenseId={expense.id} />
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
