import type { Metadata } from "next";
import { PermissionGate } from "@/components/layout/permission-gate";
import { PageHeader } from "@/components/layout/page-header";
import { PhasePlaceholder } from "@/components/shared/phase-placeholder";
import { PERMISSIONS } from "@/lib/auth/permissions";

export const metadata: Metadata = { title: "Payments" };

export default function PaymentsPage() {
  return (
    <PermissionGate permission={PERMISSIONS.PAYMENT_VIEW}>
      <PageHeader title="Payments" description="Payments received from customers, including partial payments." />
      <PhasePlaceholder moduleName="Payment recording" />
    </PermissionGate>
  );
}
