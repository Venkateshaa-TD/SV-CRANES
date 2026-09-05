import type { Metadata } from "next";
import { PermissionGate } from "@/components/layout/permission-gate";
import { PageHeader } from "@/components/layout/page-header";
import { PhasePlaceholder } from "@/components/shared/phase-placeholder";
import { PERMISSIONS } from "@/lib/auth/permissions";

export const metadata: Metadata = { title: "Outstanding" };

export default function OutstandingPage() {
  return (
    <PermissionGate permission={PERMISSIONS.FINANCE_OUTSTANDING_VIEW}>
      <PageHeader title="Outstanding" description="Customer balances still due across all invoices." />
      <PhasePlaceholder moduleName="Outstanding balances" />
    </PermissionGate>
  );
}
