import type { Metadata } from "next";

import { PermissionGate } from "@/components/layout/permission-gate";
import { PageHeader } from "@/components/layout/page-header";
import { CustomerForm } from "@/components/customers/customer-form";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { can } from "@/lib/auth/authorize";
import { requireCurrentUser } from "@/lib/auth/current-user";

export const metadata: Metadata = { title: "Add Customer" };

export default function NewCustomerPage() {
  return (
    <PermissionGate permission={PERMISSIONS.CUSTOMER_MANAGE}>
      <NewCustomerPageContent />
    </PermissionGate>
  );
}

async function NewCustomerPageContent() {
  const actor = await requireCurrentUser();
  const canEditFinancials = await can(actor, PERMISSIONS.CUSTOMER_FINANCIAL_EDIT);

  return (
    <div>
      <PageHeader title="Add Customer" description="Create a new customer account." />
      <CustomerForm mode="create" canEditFinancials={canEditFinancials} />
    </div>
  );
}
