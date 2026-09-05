import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PermissionGate } from "@/components/layout/permission-gate";
import { PageHeader } from "@/components/layout/page-header";
import { EmployeeForm } from "@/components/employees/employee-form";
import { FinancialPermissionToggle } from "@/components/employees/financial-permission-toggle";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { can } from "@/lib/auth/authorize";
import { requireCurrentUser } from "@/lib/auth/current-user";
import { prisma } from "@/lib/db/prisma";

export const metadata: Metadata = { title: "Edit Employee" };

interface EditEmployeePageProps {
  params: Promise<{ id: string }>;
}

export default function EditEmployeePage(props: EditEmployeePageProps) {
  return (
    <PermissionGate permission={PERMISSIONS.ADMIN_USERS_MANAGE}>
      <EditEmployeePageContent {...props} />
    </PermissionGate>
  );
}

async function EditEmployeePageContent({ params }: EditEmployeePageProps) {
  const { id } = await params;
  const actor = await requireCurrentUser();
  const employee = await prisma.user.findFirst({ where: { id, companyId: actor.companyId } });
  if (!employee) notFound();

  const hasFinancialEdit = await can(employee, PERMISSIONS.CUSTOMER_FINANCIAL_EDIT);

  return (
    <div className="space-y-6">
      <div>
        <PageHeader title="Edit Employee" description={employee.name} />
        <EmployeeForm
          mode="edit"
          employeeId={employee.id}
          defaultValues={{
            name: employee.name,
            email: employee.email,
            phone: employee.phone ?? undefined,
            employeeCode: employee.employeeCode ?? undefined,
            role: employee.role,
            notes: employee.notes ?? undefined,
          }}
        />
      </div>

      {employee.role !== "SUPER_ADMIN" ? <FinancialPermissionToggle userId={employee.id} granted={hasFinancialEdit} /> : null}
    </div>
  );
}
