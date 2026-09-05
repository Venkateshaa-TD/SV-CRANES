"use client";

import { useForm } from "react-hook-form";

import { Card, CardContent } from "@/components/ui/card";
import { CurrencyInput } from "@/components/forms/currency-input";
import { SubmitActionArea } from "@/components/forms/submit-action-area";
import { useActionForm } from "@/lib/hooks/use-action-form";
import { allocatePayment } from "@/lib/actions/payment-allocations";
import { formatCurrencyPrecise, formatDate } from "@/lib/format";

interface OpenInvoice {
  id: string;
  invoiceNumber: string;
  dueDate: Date | null;
  outstanding: string;
}

/**
 * Mobile-first allocation: one card per open invoice with a single
 * amount field, not a spreadsheet grid — the same list works unchanged
 * from a 320px phone up to desktop. The server re-validates every rule
 * (company/customer match, payment/invoice balance limits, cancelled
 * invoice) regardless of what this form submits.
 */
export function PaymentAllocationPanel({ paymentId, unallocatedAmount, openInvoices }: { paymentId: string; unallocatedAmount: string; openInvoices: OpenInvoice[] }) {
  const { register, handleSubmit } = useForm<Record<string, string>>({
    defaultValues: Object.fromEntries(openInvoices.map((inv) => [inv.id, ""])),
  });

  const { run, pending, formError } = useActionForm((input: { paymentId: string; allocations: { invoiceId: string; amount: string }[] }) =>
    allocatePayment(input),
  );

  function onSubmit(values: Record<string, string>) {
    const allocations = openInvoices
      .map((inv) => ({ invoiceId: inv.id, amount: values[inv.id] }))
      .filter((a) => a.amount && Number(a.amount) > 0);
    if (allocations.length === 0) return;
    run({ paymentId, allocations });
  }

  if (openInvoices.length === 0) {
    return <p className="text-sm text-muted-foreground">This customer has no open invoices to allocate against.</p>;
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Unallocated on this payment: <span className="font-medium text-foreground">{formatCurrencyPrecise(unallocatedAmount)}</span>
      </p>
      {openInvoices.map((inv) => (
        <Card key={inv.id}>
          <CardContent className="space-y-2 p-3">
            <div className="flex items-center justify-between gap-2 text-sm">
              <span className="font-medium text-foreground">{inv.invoiceNumber}</span>
              <span className="text-muted-foreground">Due {formatDate(inv.dueDate)}</span>
            </div>
            <p className="text-xs text-muted-foreground">Outstanding: {formatCurrencyPrecise(inv.outstanding)}</p>
            <CurrencyInput id={`allocate-${inv.id}`} label="Allocate" {...register(inv.id)} />
          </CardContent>
        </Card>
      ))}
      {formError ? (
        <p role="alert" className="text-sm font-medium text-destructive">
          {formError}
        </p>
      ) : null}
      <SubmitActionArea submitLabel="Allocate Payment" loading={pending} />
    </form>
  );
}
