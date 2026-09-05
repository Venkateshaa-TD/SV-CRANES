import { Landmark } from "lucide-react";

import { EmptyState } from "@/components/shared/empty-state";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { ResponsiveDataView, type DataColumn } from "@/components/data/responsive-data-view";
import { formatCurrencyPrecise, formatDate } from "@/lib/format";
import type { LedgerEntry } from "@/lib/business/ledger";

const TYPE_LABELS: Record<LedgerEntry["type"], string> = { INVOICE: "Invoice", PAYMENT: "Payment", ADJUSTMENT: "Adjustment" };

/**
 * Mobile-first customer ledger: cards on phones (date/type/reference up
 * top, debit/credit/running-balance as a clear three-line block below —
 * never a squeezed spreadsheet), a real table at desktop widths. A
 * negative running balance reads as "customer is in credit" and is
 * called out explicitly rather than left as a bare negative number.
 */
export function CustomerLedgerView({ entries }: { entries: LedgerEntry[] }) {
  if (entries.length === 0) {
    return <EmptyState icon={Landmark} title="No ledger activity yet" description="Invoices, payments, and adjustments will appear here." />;
  }

  const columns: DataColumn<LedgerEntry>[] = [
    { header: "Date", cell: (e) => formatDate(e.date) },
    { header: "Type", cell: (e) => <Badge variant="secondary">{TYPE_LABELS[e.type]}</Badge> },
    { header: "Reference", cell: (e) => e.reference },
    { header: "Description", cell: (e) => <span className="text-muted-foreground">{e.description}</span> },
    { header: "Debit", cell: (e) => (e.debit.isZero() ? "—" : formatCurrencyPrecise(e.debit)), align: "right" },
    { header: "Credit", cell: (e) => (e.credit.isZero() ? "—" : formatCurrencyPrecise(e.credit)), align: "right" },
    {
      header: "Balance",
      cell: (e) => <BalanceValue balance={e.runningBalance} />,
      align: "right",
    },
  ];

  return (
    <ResponsiveDataView
      data={entries}
      keyField={(e) => `${e.type}-${e.id}`}
      columns={columns}
      emptyState={null}
      renderCard={(e) => (
        <Card>
          <CardContent className="space-y-2 p-4">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Badge variant="secondary">{TYPE_LABELS[e.type]}</Badge>
                <span className="text-xs text-muted-foreground">{formatDate(e.date)}</span>
              </div>
              <span className="truncate text-xs text-muted-foreground">{e.reference}</span>
            </div>
            <p className="truncate text-sm text-foreground">{e.description}</p>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
              {!e.debit.isZero() ? <span className="text-foreground">Debit: {formatCurrencyPrecise(e.debit)}</span> : null}
              {!e.credit.isZero() ? <span className="text-foreground">Credit: {formatCurrencyPrecise(e.credit)}</span> : null}
              <span className="ml-auto font-medium tabular-nums">
                <BalanceValue balance={e.runningBalance} />
              </span>
            </div>
          </CardContent>
        </Card>
      )}
    />
  );
}

function BalanceValue({ balance }: { balance: LedgerEntry["runningBalance"] }) {
  if (balance.isNegative()) {
    return <span className="text-success">{formatCurrencyPrecise(balance.abs())} in credit</span>;
  }
  return <span>{formatCurrencyPrecise(balance)}</span>;
}
