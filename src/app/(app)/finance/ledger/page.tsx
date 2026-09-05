import type { Metadata } from "next";

import { PermissionGate } from "@/components/layout/permission-gate";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { CustomerLedgerView } from "@/components/finance/customer-ledger-view";
import { CustomerPicker } from "@/components/finance/customer-picker";
import { DateRangeFilter } from "@/components/data/date-range-filter";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { requireCurrentUser } from "@/lib/auth/current-user";
import { listActiveCustomerOptions } from "@/lib/data/reference-data";
import { getCustomerLedgerEntries } from "@/lib/data/finance-queries";
import { BookOpen } from "lucide-react";

export const metadata: Metadata = { title: "Customer Ledger" };

interface LedgerPageProps {
  searchParams: Promise<{ customerId?: string; from?: string; to?: string }>;
}

export default function CustomerLedgerPage(props: LedgerPageProps) {
  return (
    <PermissionGate permission={PERMISSIONS.FINANCE_LEDGER_VIEW}>
      <CustomerLedgerPageContent {...props} />
    </PermissionGate>
  );
}

async function CustomerLedgerPageContent({ searchParams }: LedgerPageProps) {
  const actor = await requireCurrentUser();
  const { customerId, from, to } = await searchParams;
  const customerOptions = await listActiveCustomerOptions(actor.companyId);

  return (
    <div>
      <PageHeader title="Customer Ledger" description="Full invoice and payment history per customer." />

      <div className="mb-4 space-y-3">
        <CustomerPicker customerOptions={customerOptions} />
        {customerId ? <DateRangeFilter /> : null}
      </div>

      {!customerId ? (
        <EmptyState icon={BookOpen} title="Select a customer" description="Choose a customer above to view their ledger." />
      ) : (
        <LedgerForCustomer companyId={actor.companyId} customerId={customerId} from={from} to={to} />
      )}
    </div>
  );
}

async function LedgerForCustomer({ companyId, customerId, from, to }: { companyId: string; customerId: string; from?: string; to?: string }) {
  const entries = await getCustomerLedgerEntries(companyId, customerId, {
    from: from ? new Date(from) : undefined,
    to: to ? new Date(to) : undefined,
  });
  return <CustomerLedgerView entries={entries} />;
}
