import type { Metadata } from "next";
import { PermissionGate } from "@/components/layout/permission-gate";
import { PageHeader } from "@/components/layout/page-header";
import { PhasePlaceholder } from "@/components/shared/phase-placeholder";
import { PERMISSIONS } from "@/lib/auth/permissions";

export const metadata: Metadata = { title: "Billing" };

export default function BillingPage() {
  return (
    <PermissionGate permission={PERMISSIONS.BILLING_VIEW}>
      <PageHeader title="Billing" description="Generate billable line items from approved daily logs and expenses." />
      <PhasePlaceholder moduleName="Billing" />
    </PermissionGate>
  );
}
