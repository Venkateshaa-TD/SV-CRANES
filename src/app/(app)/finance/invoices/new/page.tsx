import type { Metadata } from "next";

import { PermissionGate } from "@/components/layout/permission-gate";
import { PageHeader } from "@/components/layout/page-header";
import { ManualInvoiceForm } from "@/components/invoices/manual-invoice-form";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { requireCurrentUser } from "@/lib/auth/current-user";
import { listActiveCustomerOptions, listActiveProjectOptions, listActiveVehicleOptions } from "@/lib/data/reference-data";

export const metadata: Metadata = { title: "New Invoice" };

interface NewInvoicePageProps {
  searchParams: Promise<{ customerId?: string }>;
}

export default function NewInvoicePage(props: NewInvoicePageProps) {
  return (
    <PermissionGate permission={PERMISSIONS.INVOICE_MANAGE}>
      <NewInvoicePageContent {...props} />
    </PermissionGate>
  );
}

async function NewInvoicePageContent({ searchParams }: NewInvoicePageProps) {
  const actor = await requireCurrentUser();
  const { customerId } = await searchParams;
  const [customerOptions, projectOptions, vehicleOptions] = await Promise.all([
    listActiveCustomerOptions(actor.companyId),
    listActiveProjectOptions(actor.companyId),
    listActiveVehicleOptions(actor.companyId),
  ]);

  return (
    <div>
      <PageHeader title="New Invoice" description="Create a manual, ad-hoc draft invoice." />
      <ManualInvoiceForm
        customerOptions={customerOptions}
        projectOptions={projectOptions}
        vehicleOptions={vehicleOptions}
        defaultCustomerId={customerId}
      />
    </div>
  );
}
