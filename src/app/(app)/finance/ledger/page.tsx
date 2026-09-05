import type { Metadata } from "next";
import { PermissionGate } from "@/components/layout/permission-gate";
import { PageHeader } from "@/components/layout/page-header";
import { PhasePlaceholder } from "@/components/shared/phase-placeholder";
import { PERMISSIONS } from "@/lib/auth/permissions";

export const metadata: Metadata = { title: "Customer Ledger" };

export default function CustomerLedgerPage() {
  return (
    <PermissionGate permission={PERMISSIONS.FINANCE_LEDGER_VIEW}>
      <PageHeader title="Customer Ledger" description="Full invoice and payment history per customer." />
      <PhasePlaceholder moduleName="Customer ledger" />
    </PermissionGate>
  );
}
