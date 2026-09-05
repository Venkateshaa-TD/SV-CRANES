import type { Metadata } from "next";
import { PermissionGate } from "@/components/layout/permission-gate";
import { PageHeader } from "@/components/layout/page-header";
import { PhasePlaceholder } from "@/components/shared/phase-placeholder";
import { PERMISSIONS } from "@/lib/auth/permissions";

export const metadata: Metadata = { title: "Notifications" };

export default function NotificationsPage() {
  return (
    <PermissionGate permission={PERMISSIONS.NOTIFICATION_VIEW}>
      <PageHeader title="Notifications" description="In-app alerts and reminders addressed to you." />
      <PhasePlaceholder moduleName="Notifications" />
    </PermissionGate>
  );
}
