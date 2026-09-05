import type { Metadata } from "next";
import { PermissionGate } from "@/components/layout/permission-gate";
import { PageHeader } from "@/components/layout/page-header";
import { PhasePlaceholder } from "@/components/shared/phase-placeholder";
import { PERMISSIONS } from "@/lib/auth/permissions";

export const metadata: Metadata = { title: "Reports" };

export default function ReportsPage() {
  return (
    <PermissionGate permission={PERMISSIONS.REPORT_VIEW}>
      <PageHeader title="Reports" description="Monthly operational and financial summaries." />
      <PhasePlaceholder moduleName="Reporting" />
    </PermissionGate>
  );
}
