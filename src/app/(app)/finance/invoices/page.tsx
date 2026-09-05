import type { Metadata } from "next";
import { PermissionGate } from "@/components/layout/permission-gate";
import { PageHeader } from "@/components/layout/page-header";
import { PhasePlaceholder } from "@/components/shared/phase-placeholder";
import { PERMISSIONS } from "@/lib/auth/permissions";

export const metadata: Metadata = { title: "Invoices" };

export default function InvoicesPage() {
  return (
    <PermissionGate permission={PERMISSIONS.INVOICE_VIEW}>
      <PageHeader title="Invoices" description="Customer invoices, from draft through paid." />
      <PhasePlaceholder moduleName="Invoicing" />
    </PermissionGate>
  );
}
