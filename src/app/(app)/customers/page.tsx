import type { Metadata } from "next";
import { PermissionGate } from "@/components/layout/permission-gate";
import { PageHeader } from "@/components/layout/page-header";
import { PhasePlaceholder } from "@/components/shared/phase-placeholder";
import { PERMISSIONS } from "@/lib/auth/permissions";

export const metadata: Metadata = { title: "Customers" };

export default function CustomersPage() {
  return (
    <PermissionGate permission={PERMISSIONS.CUSTOMER_VIEW}>
      <PageHeader title="Customers" description="Customer accounts, contacts, and their projects." />
      <PhasePlaceholder moduleName="Customer management" />
    </PermissionGate>
  );
}
