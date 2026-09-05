import type { Metadata } from "next";
import { PermissionGate } from "@/components/layout/permission-gate";
import { PageHeader } from "@/components/layout/page-header";
import { PhasePlaceholder } from "@/components/shared/phase-placeholder";
import { PERMISSIONS } from "@/lib/auth/permissions";

export const metadata: Metadata = { title: "Maintenance" };

export default function MaintenancePage() {
  return (
    <PermissionGate permission={PERMISSIONS.MAINTENANCE_VIEW}>
      <PageHeader title="Maintenance" description="Service history and upcoming maintenance due by vehicle." />
      <PhasePlaceholder moduleName="Maintenance tracking" />
    </PermissionGate>
  );
}
