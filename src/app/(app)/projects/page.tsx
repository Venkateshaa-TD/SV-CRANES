import type { Metadata } from "next";
import { PermissionGate } from "@/components/layout/permission-gate";
import { PageHeader } from "@/components/layout/page-header";
import { PhasePlaceholder } from "@/components/shared/phase-placeholder";
import { PERMISSIONS } from "@/lib/auth/permissions";

export const metadata: Metadata = { title: "Projects" };

export default function ProjectsPage() {
  return (
    <PermissionGate permission={PERMISSIONS.PROJECT_VIEW}>
      <PageHeader title="Projects / Jobs" description="Customer jobs and the vehicles assigned to them over time." />
      <PhasePlaceholder moduleName="Project management" />
    </PermissionGate>
  );
}
