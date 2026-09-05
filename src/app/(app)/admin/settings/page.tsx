import type { Metadata } from "next";
import { PermissionGate } from "@/components/layout/permission-gate";
import { PageHeader } from "@/components/layout/page-header";
import { PhasePlaceholder } from "@/components/shared/phase-placeholder";
import { PERMISSIONS } from "@/lib/auth/permissions";

export const metadata: Metadata = { title: "Settings" };

export default function AdminSettingsPage() {
  return (
    <PermissionGate permission={PERMISSIONS.ADMIN_SETTINGS_MANAGE}>
      <PageHeader title="Settings" description="Company details and application configuration." />
      <PhasePlaceholder moduleName="Settings" />
    </PermissionGate>
  );
}
