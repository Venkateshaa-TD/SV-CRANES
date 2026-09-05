import type { Metadata } from "next";
import { PermissionGate } from "@/components/layout/permission-gate";
import { PageHeader } from "@/components/layout/page-header";
import { EmployeeForm } from "@/components/employees/employee-form";
import { PERMISSIONS } from "@/lib/auth/permissions";

export const metadata: Metadata = { title: "Add Employee" };

export default function NewEmployeePage() {
  return (
    <PermissionGate permission={PERMISSIONS.ADMIN_USERS_MANAGE}>
      <PageHeader title="Add Employee" description="Create a new account and assign a role." />
      <EmployeeForm mode="create" />
    </PermissionGate>
  );
}
