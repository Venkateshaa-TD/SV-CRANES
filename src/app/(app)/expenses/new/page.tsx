import type { Metadata } from "next";
import { PermissionGate } from "@/components/layout/permission-gate";
import { PageHeader } from "@/components/layout/page-header";
import { ExpenseForm } from "@/components/expenses/expense-form";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { requireCurrentUser } from "@/lib/auth/current-user";
import { listActiveExpenseCategoryOptions, listActiveProjectOptions, listActiveVehicleOptions } from "@/lib/data/reference-data";

export const metadata: Metadata = { title: "Submit Expense" };

interface NewExpensePageProps {
  searchParams: Promise<{ vehicleId?: string }>;
}

export default function NewExpensePage(props: NewExpensePageProps) {
  return (
    <PermissionGate permission={PERMISSIONS.EXPENSE_CREATE}>
      <NewExpensePageContent {...props} />
    </PermissionGate>
  );
}

async function NewExpensePageContent({ searchParams }: NewExpensePageProps) {
  const user = await requireCurrentUser();
  const params = await searchParams;
  const [categories, vehicles, projects] = await Promise.all([
    listActiveExpenseCategoryOptions(user.companyId),
    listActiveVehicleOptions(user.companyId),
    listActiveProjectOptions(user.companyId),
  ]);

  return (
    <div>
      <PageHeader title="Submit Expense" description="Submit an expense for approval." />
      <ExpenseForm
        categoryOptions={categories.map((c) => ({ id: c.id, label: c.name }))}
        vehicleOptions={vehicles.map((v) => ({ id: v.id, label: v.name }))}
        projectOptions={projects.map((p) => ({ id: p.id, label: p.name }))}
        defaultVehicleId={params.vehicleId}
      />
    </div>
  );
}
