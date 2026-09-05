"use client";

import { useForm } from "react-hook-form";

import { DateInput } from "@/components/forms/date-input";
import { CurrencyInput } from "@/components/forms/currency-input";
import { TextInput } from "@/components/forms/text-input";
import { FormSection } from "@/components/forms/form-section";
import { SubmitActionArea } from "@/components/forms/submit-action-area";
import type { Control, UseFormRegister } from "react-hook-form";
import { InvoiceLineEditor, type InvoiceLineFields } from "@/components/invoices/invoice-line-editor";
import { useActionForm } from "@/lib/hooks/use-action-form";
import { updateInvoiceDraft } from "@/lib/actions/invoices";
import type { UpdateInvoiceDraftInput } from "@/lib/validation/invoice";
import { toDateInputValue } from "@/lib/format";

interface VehicleOption {
  id: string;
  name: string;
}

interface InvoiceLineDefault {
  vehicleId: string | null;
  description: string;
  quantity: string;
  unitPrice: string;
  taxPercent: string;
}

interface EditInvoiceDraftFormProps {
  invoiceId: string;
  isManual: boolean;
  vehicleOptions: VehicleOption[];
  defaultValues: {
    dueDate: Date | null;
    discountAmount: string;
    notes: string;
    lines: InvoiceLineDefault[];
  };
}

type FormFields = InvoiceLineFields & { dueDate: string; discountAmount: string; notes: string };

/** DRAFT invoices only. A billing-engine-generated invoice (isManual =
 * false) can only have notes/due date/discount edited — its line
 * amounts are a reviewed, approved snapshot and stay locked even before
 * approval, per the invoice-immutability rules for billing-sourced
 * invoices. A manual invoice's lines remain fully editable while DRAFT. */
export function EditInvoiceDraftForm({ invoiceId, isManual, vehicleOptions, defaultValues }: EditInvoiceDraftFormProps) {
  const { register, control, handleSubmit } = useForm<FormFields>({
    defaultValues: {
      dueDate: toDateInputValue(defaultValues.dueDate),
      discountAmount: defaultValues.discountAmount,
      notes: defaultValues.notes,
      lines: defaultValues.lines.map((l) => ({ ...l, vehicleId: l.vehicleId ?? "" })),
    },
  });

  const { run, pending, fieldErrors, formError } = useActionForm(
    (input: UpdateInvoiceDraftInput) => updateInvoiceDraft(invoiceId, input),
    { redirectTo: `/finance/invoices/${invoiceId}` },
  );

  function onSubmit(values: FormFields) {
    run({
      dueDate: values.dueDate || undefined,
      discountAmount: values.discountAmount || undefined,
      notes: values.notes || undefined,
      lines: isManual ? values.lines.map((l) => ({ ...l, vehicleId: l.vehicleId || undefined })) : undefined,
    });
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-6">
      <FormSection title="Dates & Discount">
        <DateInput id="editInvoiceDueDate" label="Due Date" error={fieldErrors.dueDate} {...register("dueDate")} />
        <CurrencyInput id="editInvoiceDiscount" label="Discount" error={fieldErrors.discountAmount} {...register("discountAmount")} />
      </FormSection>

      {isManual ? (
        <FormSection title="Line Items">
          <InvoiceLineEditor
            control={control as unknown as Control<InvoiceLineFields>}
            register={register as unknown as UseFormRegister<InvoiceLineFields>}
            vehicleOptions={vehicleOptions}
            lineErrors={fieldErrors}
          />
        </FormSection>
      ) : (
        <p className="rounded-md border border-dashed border-border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
          This invoice was generated from an approved billing draft — its line amounts are locked and can only be changed through
          the billing correction workflow.
        </p>
      )}

      <FormSection title="Notes">
        <TextInput id="editInvoiceNotes" label="Notes" error={fieldErrors.notes} {...register("notes")} />
      </FormSection>

      {formError ? (
        <p role="alert" className="text-sm font-medium text-destructive">
          {formError}
        </p>
      ) : null}

      <SubmitActionArea submitLabel="Save Changes" loading={pending} />
    </form>
  );
}
