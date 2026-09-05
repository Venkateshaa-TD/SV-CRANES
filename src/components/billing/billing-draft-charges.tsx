"use client";

import * as React from "react";
import { useForm } from "react-hook-form";
import { Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { CurrencyInput } from "@/components/forms/currency-input";
import { TextInput } from "@/components/forms/text-input";
import { useActionForm } from "@/lib/hooks/use-action-form";
import { addBillingDraftCharge, removeBillingDraftCharge } from "@/lib/actions/billing-drafts";
import { formatCurrencyPrecise } from "@/lib/format";

interface Charge {
  id: string;
  description: string;
  amount: string;
}

export function BillingDraftCharges({ billingDraftId, charges, editable }: { billingDraftId: string; charges: Charge[]; editable: boolean }) {
  return (
    <div className="space-y-2">
      {charges.length === 0 ? (
        <p className="text-sm text-muted-foreground">No additional charges.</p>
      ) : (
        <ul className="space-y-1.5">
          {charges.map((charge) => (
            <ChargeRow key={charge.id} charge={charge} editable={editable} />
          ))}
        </ul>
      )}
      {editable ? <AddChargeForm billingDraftId={billingDraftId} /> : null}
    </div>
  );
}

function ChargeRow({ charge, editable }: { charge: Charge; editable: boolean }) {
  const { run, pending } = useActionForm(() => removeBillingDraftCharge(charge.id));
  return (
    <li className="flex items-center justify-between gap-2 rounded-md border border-border px-3 py-2 text-sm">
      <span className="min-w-0 truncate">{charge.description}</span>
      <div className="flex shrink-0 items-center gap-2">
        <span className="tabular-nums">{formatCurrencyPrecise(charge.amount)}</span>
        {editable ? (
          <Button type="button" variant="ghost" size="icon" onClick={() => run()} disabled={pending} aria-label="Remove charge">
            <Trash2 />
          </Button>
        ) : null}
      </div>
    </li>
  );
}

function AddChargeForm({ billingDraftId }: { billingDraftId: string }) {
  const [showForm, setShowForm] = React.useState(false);
  const { register, handleSubmit, reset } = useForm<{ description: string; amount: string }>({ defaultValues: { description: "", amount: "" } });
  const { run, pending, formError } = useActionForm(
    (input: { description: string; amount: string }) => addBillingDraftCharge(billingDraftId, input),
    { onSuccess: () => { reset(); setShowForm(false); } },
  );

  if (!showForm) {
    return (
      <Button type="button" variant="outline" size="sm" onClick={() => setShowForm(true)}>
        <Plus /> Add Charge
      </Button>
    );
  }

  return (
    <form onSubmit={handleSubmit((values) => run(values))} noValidate className="space-y-3 rounded-md border border-border p-3">
      <TextInput id="newChargeDescription" label="Description" required {...register("description", { required: true })} />
      <CurrencyInput id="newChargeAmount" label="Amount" required {...register("amount", { required: true })} />
      {formError ? (
        <p role="alert" className="text-xs font-medium text-destructive">
          {formError}
        </p>
      ) : null}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" size="sm" onClick={() => setShowForm(false)}>
          Cancel
        </Button>
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? "Adding…" : "Add"}
        </Button>
      </div>
    </form>
  );
}
