import type { Metadata } from "next";

import { PermissionGate } from "@/components/layout/permission-gate";
import { PageHeader } from "@/components/layout/page-header";
import { CreateBillingDraftForm } from "@/components/billing/create-billing-draft-form";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { requireCurrentUser } from "@/lib/auth/current-user";
import { prisma } from "@/lib/db/prisma";

export const metadata: Metadata = { title: "Prepare Billing" };

interface NewBillingDraftPageProps {
  searchParams: Promise<{ projectId?: string }>;
}

export default function NewBillingDraftPage(props: NewBillingDraftPageProps) {
  return (
    <PermissionGate permission={PERMISSIONS.BILLING_MANAGE}>
      <NewBillingDraftPageContent {...props} />
    </PermissionGate>
  );
}

async function NewBillingDraftPageContent({ searchParams }: NewBillingDraftPageProps) {
  const actor = await requireCurrentUser();
  const { projectId } = await searchParams;

  const projects = await prisma.project.findMany({
    where: { companyId: actor.companyId, archivedAt: null, billingConfig: { isNot: null } },
    include: { customer: { select: { name: true } }, billingConfig: true },
    orderBy: { name: "asc" },
  });

  const projectOptions = projects.map((p) => ({
    id: p.id,
    name: p.name,
    code: p.code,
    customerName: p.customer.name,
    billingType: p.billingConfig!.billingType,
    mobilisationCharge: p.billingConfig!.mobilisationCharge?.toString() ?? null,
    demobilisationCharge: p.billingConfig!.demobilisationCharge?.toString() ?? null,
  }));

  return (
    <div>
      <PageHeader title="Prepare Billing" description="Generate a billing draft from operational data for review and approval." />
      <CreateBillingDraftForm projectOptions={projectOptions} defaultProjectId={projectId} />
    </div>
  );
}
