import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PageHeader } from "@/components/layout/page-header";
import { ForbiddenState } from "@/components/shared/forbidden-state";
import { ExpenseForm } from "@/components/expenses/expense-form";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { can } from "@/lib/auth/authorize";
import { requireCurrentUser } from "@/lib/auth/current-user";
import { prisma } from "@/lib/db/prisma";
import { listActiveExpenseCategoryOptions, listActiveProjectOptions, listActiveVehicleOptions } from "@/lib/data/reference-data";

export const metadata: Metadata = { title: "Edit Expense" };

interface EditExpensePageProps {
  params: Promise<{ id: string }>;
}

export default async function EditExpensePage({ params }: EditExpensePageProps) {
  const { id } = await params;
  const user = await requireCurrentUser();

  const expense = await prisma.expense.findFirst({ where: { id, submittedBy: { companyId: user.companyId } } });
  if (!expense) notFound();

  const canApprove = await can(user, PERMISSIONS.EXPENSE_APPROVE);
  const isOwner = expense.submittedById === user.id;

  if (expense.status === "APPROVED" && !canApprove) {
    return <ForbiddenState />;
  }
  if (!isOwner && !canApprove) {
    return <ForbiddenState />;
  }

  const [categories, vehicles, projects] = await Promise.all([
    listActiveExpenseCategoryOptions(user.companyId),
    listActiveVehicleOptions(user.companyId),
    listActiveProjectOptions(user.companyId),
  ]);

  return (
    <div>
      <PageHeader title="Edit Expense" description={expense.status === "APPROVED" ? "This expense has already been approved — changes are audited." : undefined} />
      <ExpenseForm
        mode="edit"
        expenseId={expense.id}
        categoryOptions={categories.map((c) => ({ id: c.id, label: c.name }))}
        vehicleOptions={vehicles.map((v) => ({ id: v.id, label: v.name }))}
        projectOptions={projects.map((p) => ({ id: p.id, label: p.name }))}
        defaultValues={{
          expenseDate: expense.expenseDate.toISOString().slice(0, 10),
          categoryId: expense.categoryId,
          amount: expense.amount.toString(),
          vendorName: expense.vendorName ?? undefined,
          description: expense.description ?? undefined,
          vehicleId: expense.vehicleId ?? undefined,
          projectId: expense.projectId ?? undefined,
          receiptFileId: expense.receiptFileId ?? undefined,
        }}
      />
    </div>
  );
}
