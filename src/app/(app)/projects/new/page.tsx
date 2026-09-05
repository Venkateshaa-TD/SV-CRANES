import type { Metadata } from "next";

import { PermissionGate } from "@/components/layout/permission-gate";
import { PageHeader } from "@/components/layout/page-header";
import { ProjectForm } from "@/components/projects/project-form";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { requireCurrentUser } from "@/lib/auth/current-user";
import { listActiveCustomerOptions } from "@/lib/data/reference-data";

export const metadata: Metadata = { title: "New Project" };

export default function NewProjectPage() {
  return (
    <PermissionGate permission={PERMISSIONS.PROJECT_MANAGE}>
      <NewProjectPageContent />
    </PermissionGate>
  );
}

async function NewProjectPageContent() {
  const actor = await requireCurrentUser();
  const customerOptions = await listActiveCustomerOptions(actor.companyId);

  return (
    <div>
      <PageHeader title="New Project" description="Create a customer job." />
      <ProjectForm mode="create" customerOptions={customerOptions} />
    </div>
  );
}
