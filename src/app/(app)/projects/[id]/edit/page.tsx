import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PermissionGate } from "@/components/layout/permission-gate";
import { PageHeader } from "@/components/layout/page-header";
import { ProjectForm } from "@/components/projects/project-form";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { requireCurrentUser } from "@/lib/auth/current-user";
import { prisma } from "@/lib/db/prisma";
import { listActiveCustomerOptions } from "@/lib/data/reference-data";
import { toDateInputValue } from "@/lib/format";

export const metadata: Metadata = { title: "Edit Project" };

interface EditProjectPageProps {
  params: Promise<{ id: string }>;
}

export default function EditProjectPage(props: EditProjectPageProps) {
  return (
    <PermissionGate permission={PERMISSIONS.PROJECT_MANAGE}>
      <EditProjectPageContent {...props} />
    </PermissionGate>
  );
}

async function EditProjectPageContent({ params }: EditProjectPageProps) {
  const { id } = await params;
  const actor = await requireCurrentUser();
  const project = await prisma.project.findFirst({ where: { id, companyId: actor.companyId } });
  if (!project) notFound();

  const customerOptions = await listActiveCustomerOptions(actor.companyId);

  return (
    <div>
      <PageHeader title="Edit Project" description={project.name} />
      <ProjectForm
        mode="edit"
        projectId={project.id}
        customerOptions={customerOptions}
        defaultValues={{
          customerId: project.customerId,
          name: project.name,
          code: project.code ?? undefined,
          siteLocation: project.siteLocation ?? undefined,
          status: project.status,
          startDate: toDateInputValue(project.startDate),
          endDate: toDateInputValue(project.endDate),
          notes: project.notes ?? undefined,
        }}
      />
    </div>
  );
}
