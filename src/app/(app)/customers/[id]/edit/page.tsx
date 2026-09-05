import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PermissionGate } from "@/components/layout/permission-gate";
import { PageHeader } from "@/components/layout/page-header";
import { CustomerForm } from "@/components/customers/customer-form";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { can } from "@/lib/auth/authorize";
import { requireCurrentUser } from "@/lib/auth/current-user";
import { prisma } from "@/lib/db/prisma";

export const metadata: Metadata = { title: "Edit Customer" };

interface EditCustomerPageProps {
  params: Promise<{ id: string }>;
}

export default function EditCustomerPage(props: EditCustomerPageProps) {
  return (
    <PermissionGate permission={PERMISSIONS.CUSTOMER_MANAGE}>
      <EditCustomerPageContent {...props} />
    </PermissionGate>
  );
}

async function EditCustomerPageContent({ params }: EditCustomerPageProps) {
  const { id } = await params;
  const actor = await requireCurrentUser();
  // Company-scoped: an id alone must never be enough to reach another
  // company's record.
  const customer = await prisma.customer.findFirst({ where: { id, companyId: actor.companyId } });
  if (!customer) notFound();

  const canEditFinancials = await can(actor, PERMISSIONS.CUSTOMER_FINANCIAL_EDIT);

  return (
    <div>
      <PageHeader title="Edit Customer" description={customer.name} />
      <CustomerForm
        mode="edit"
        customerId={customer.id}
        canEditFinancials={canEditFinancials}
        defaultValues={{
          name: customer.name,
          customerCode: customer.customerCode ?? undefined,
          contactPerson: customer.contactPerson ?? undefined,
          phone: customer.phone ?? undefined,
          email: customer.email ?? undefined,
          gstNumber: customer.gstNumber ?? undefined,
          address: customer.address ?? undefined,
          notes: customer.notes ?? undefined,
          paymentTerms: customer.paymentTerms ?? undefined,
          defaultDueDays: customer.defaultDueDays ?? 30,
        }}
      />
    </div>
  );
}
