"use client";

import * as React from "react";
import { useForm } from "react-hook-form";
import { ScaleIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerClose } from "@/components/ui/drawer";
import { CurrencyInput } from "@/components/forms/currency-input";
import { SelectInput } from "@/components/forms/select-input";
import { TextInput } from "@/components/forms/text-input";
import { useActionForm } from "@/lib/hooks/use-action-form";
import { createLedgerAdjustment } from "@/lib/actions/ledger-adjustments";

interface LedgerAdjustmentDrawerProps {
  customerId: string;
}

/** CUSTOMER_FINANCIAL_EDIT-only control for an explicit, reasoned ledger
 * correction — never a generic "edit balance" field. Only rendered for
 * users who already hold the permission (see the customer dashboard
 * page); the server independently re-enforces it regardless. */
export function LedgerAdjustmentDrawer({ customerId }: LedgerAdjustmentDrawerProps) {
  const [open, setOpen] = React.useState(false);
  const [type, setType] = React.useState<"DEBIT" | "CREDIT">("CREDIT");
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<{ amount: string; reason: string }>({ defaultValues: { amount: "", reason: "" } });

  const { run, pending, fieldErrors, formError } = useActionForm(
    (input: { customerId: string; type: "DEBIT" | "CREDIT"; amount: string; reason: string }) => createLedgerAdjustment(input),
    {
      onSuccess: () => {
        reset();
        setOpen(false);
      },
    },
  );

  function onSubmit(values: { amount: string; reason: string }) {
    run({ customerId, type, ...values });
  }

  return (
    <Drawer open={open} onOpenChange={setOpen}>
      <Button type="button" variant="outline" onClick={() => setOpen(true)}>
        <ScaleIcon /> Ledger Adjustment
      </Button>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>Record a ledger adjustment</DrawerTitle>
        </DrawerHeader>
        <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4 px-1 pb-2">
          <SelectInput
            id="adjustmentType"
            label="Type"
            required
            value={type}
            onValueChange={(v) => setType(v as "DEBIT" | "CREDIT")}
            options={[
              { value: "CREDIT", label: "Credit (reduces what they owe)" },
              { value: "DEBIT", label: "Debit (increases what they owe)" },
            ]}
          />
          <CurrencyInput
            id="adjustmentAmount"
            label="Amount"
            required
            error={errors.amount?.message ?? fieldErrors.amount}
            {...register("amount", { required: "Amount is required" })}
          />
          <TextInput
            id="adjustmentReason"
            label="Reason"
            required
            hint="Required — shown on the customer ledger"
            error={errors.reason?.message ?? fieldErrors.reason}
            {...register("reason", { required: "A reason is required" })}
          />
          {formError ? (
            <p role="alert" className="text-sm font-medium text-destructive">
              {formError}
            </p>
          ) : null}
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <DrawerClose asChild>
              <Button type="button" variant="outline">
                Cancel
              </Button>
            </DrawerClose>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : "Record Adjustment"}
            </Button>
          </div>
        </form>
      </DrawerContent>
    </Drawer>
  );
}
