import type { Metadata } from "next";

import { PermissionGate } from "@/components/layout/permission-gate";
import { PageHeader } from "@/components/layout/page-header";
import { PaymentForm } from "@/components/payments/payment-form";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { requireCurrentUser } from "@/lib/auth/current-user";
import { listActiveCustomerOptions } from "@/lib/data/reference-data";

export const metadata: Metadata = { title: "Record Payment" };

interface NewPaymentPageProps {
  searchParams: Promise<{ customerId?: string }>;
}

export default function NewPaymentPage(props: NewPaymentPageProps) {
  return (
    <PermissionGate permission={PERMISSIONS.PAYMENT_MANAGE}>
      <NewPaymentPageContent {...props} />
    </PermissionGate>
  );
}

async function NewPaymentPageContent({ searchParams }: NewPaymentPageProps) {
  const actor = await requireCurrentUser();
  const { customerId } = await searchParams;
  const customerOptions = await listActiveCustomerOptions(actor.companyId);

  return (
    <div>
      <PageHeader title="Record Payment" description="Record a payment received from a customer." />
      <PaymentForm customerOptions={customerOptions} defaultCustomerId={customerId} />
    </div>
  );
}
