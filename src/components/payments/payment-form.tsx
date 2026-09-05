"use client";

import * as React from "react";
import { useForm } from "react-hook-form";

import { SelectInput } from "@/components/forms/select-input";
import { DateInput } from "@/components/forms/date-input";
import { CurrencyInput } from "@/components/forms/currency-input";
import { TextInput } from "@/components/forms/text-input";
import { FormSection } from "@/components/forms/form-section";
import { SubmitActionArea } from "@/components/forms/submit-action-area";
import { useActionForm } from "@/lib/hooks/use-action-form";
import { createPayment } from "@/lib/actions/payments";
import { PAYMENT_METHOD_OPTIONS, type PaymentFormInput } from "@/lib/validation/payment";

const METHOD_LABELS: Record<(typeof PAYMENT_METHOD_OPTIONS)[number], string> = {
  CASH: "Cash",
  BANK_TRANSFER: "Bank Transfer",
  CHEQUE: "Cheque",
  UPI: "UPI",
  CARD: "Card",
  OTHER: "Other",
};

interface CustomerOption {
  id: string;
  name: string;
}

type TextFields = Pick<PaymentFormInput, "paymentDate" | "amount" | "referenceNumber" | "notes">;

export function PaymentForm({ customerOptions, defaultCustomerId }: { customerOptions: CustomerOption[]; defaultCustomerId?: string }) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<TextFields>({
    defaultValues: { paymentDate: new Date().toISOString().slice(0, 10), amount: "", referenceNumber: "", notes: "" },
  });

  const [customerId, setCustomerId] = React.useState(defaultCustomerId ?? "");
  const [method, setMethod] = React.useState<string>("BANK_TRANSFER");

  const { run, pending, fieldErrors, formError } = useActionForm(
    (input: PaymentFormInput) => createPayment(input),
    { redirectTo: (data) => (data ? `/finance/payments/${data.id}` : "/finance/payments") },
  );

  function onSubmit(values: TextFields) {
    run({ ...values, customerId, method: method as PaymentFormInput["method"] });
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-6">
      <FormSection title="Payment Details">
        <SelectInput
          id="paymentCustomerId"
          label="Customer"
          required
          value={customerId}
          onValueChange={setCustomerId}
          error={fieldErrors.customerId}
          options={customerOptions.map((c) => ({ value: c.id, label: c.name }))}
        />
        <DateInput
          id="paymentDate"
          label="Payment Date"
          required
          error={errors.paymentDate?.message ?? fieldErrors.paymentDate}
          {...register("paymentDate", { required: "Payment date is required" })}
        />
        <CurrencyInput
          id="paymentAmount"
          label="Amount"
          required
          error={errors.amount?.message ?? fieldErrors.amount}
          {...register("amount", { required: "Amount is required" })}
        />
        <SelectInput
          id="paymentMethod"
          label="Payment Mode"
          required
          value={method}
          onValueChange={setMethod}
          options={PAYMENT_METHOD_OPTIONS.map((m) => ({ value: m, label: METHOD_LABELS[m] }))}
        />
        <TextInput id="paymentReference" label="Bank / Reference Number" error={fieldErrors.referenceNumber} {...register("referenceNumber")} />
        <TextInput id="paymentNotes" label="Notes" error={fieldErrors.notes} {...register("notes")} />
      </FormSection>

      {formError ? (
        <p role="alert" className="text-sm font-medium text-destructive">
          {formError}
        </p>
      ) : null}

      <SubmitActionArea submitLabel="Record Payment" loading={pending} disabled={!customerId} />
    </form>
  );
}
