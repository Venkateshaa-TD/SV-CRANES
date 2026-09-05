"use client";

import * as React from "react";
import { useForm } from "react-hook-form";

import { SelectInput } from "@/components/forms/select-input";
import { DateInput } from "@/components/forms/date-input";
import { CurrencyInput } from "@/components/forms/currency-input";
import { TextInput } from "@/components/forms/text-input";
import { FormSection } from "@/components/forms/form-section";
import { SubmitActionArea } from "@/components/forms/submit-action-area";
import type { Control, UseFormRegister } from "react-hook-form";
import { InvoiceLineEditor, type InvoiceLineFields } from "@/components/invoices/invoice-line-editor";
import { useActionForm } from "@/lib/hooks/use-action-form";
import { createManualInvoice } from "@/lib/actions/invoices";
import type { ManualInvoiceFormInput } from "@/lib/validation/invoice";

interface CustomerOption {
  id: string;
  name: string;
}
interface ProjectOption {
  id: string;
  name: string;
}
interface VehicleOption {
  id: string;
  name: string;
}

interface ManualInvoiceFormProps {
  customerOptions: CustomerOption[];
  projectOptions: ProjectOption[];
  vehicleOptions: VehicleOption[];
  defaultCustomerId?: string;
}

type FormFields = InvoiceLineFields & { issueDate: string; dueDate: string; discountAmount: string; notes: string };

export function ManualInvoiceForm({ customerOptions, projectOptions, vehicleOptions, defaultCustomerId }: ManualInvoiceFormProps) {
  const [customerId, setCustomerId] = React.useState(defaultCustomerId ?? "");
  const [projectId, setProjectId] = React.useState("");

  const { register, control, handleSubmit } = useForm<FormFields>({
    defaultValues: {
      issueDate: new Date().toISOString().slice(0, 10),
      dueDate: "",
      discountAmount: "",
      notes: "",
      lines: [{ vehicleId: "", description: "", quantity: "1", unitPrice: "", taxPercent: "" }],
    },
  });

  const { run, pending, fieldErrors, formError } = useActionForm(
    (input: ManualInvoiceFormInput) => createManualInvoice(input),
    { redirectTo: (data) => (data ? `/finance/invoices/${data.id}` : "/finance/invoices") },
  );

  function onSubmit(values: FormFields) {
    run({
      customerId,
      projectId: projectId || undefined,
      issueDate: values.issueDate,
      dueDate: values.dueDate || undefined,
      discountAmount: values.discountAmount || undefined,
      notes: values.notes || undefined,
      lines: values.lines.map((l) => ({ ...l, vehicleId: l.vehicleId || undefined })),
    });
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-6">
      <FormSection title="Customer & Dates">
        <SelectInput
          id="invoiceCustomerId"
          label="Customer"
          required
          value={customerId}
          onValueChange={setCustomerId}
          error={fieldErrors.customerId}
          options={customerOptions.map((c) => ({ value: c.id, label: c.name }))}
        />
        <SelectInput
          id="invoiceProjectId"
          label="Project (optional)"
          placeholder="None"
          value={projectId}
          onValueChange={setProjectId}
          options={projectOptions.map((p) => ({ value: p.id, label: p.name }))}
        />
        <DateInput id="invoiceIssueDate" label="Issue Date" required error={fieldErrors.issueDate} {...register("issueDate", { required: true })} />
        <DateInput id="invoiceDueDate" label="Due Date" error={fieldErrors.dueDate} {...register("dueDate")} />
      </FormSection>

      <FormSection title="Line Items">
        <InvoiceLineEditor
          control={control as unknown as Control<InvoiceLineFields>}
          register={register as unknown as UseFormRegister<InvoiceLineFields>}
          vehicleOptions={vehicleOptions}
          lineErrors={fieldErrors}
        />
      </FormSection>

      <FormSection title="Discount & Notes">
        <CurrencyInput id="invoiceDiscount" label="Discount" error={fieldErrors.discountAmount} {...register("discountAmount")} />
        <TextInput id="invoiceNotes" label="Notes" error={fieldErrors.notes} {...register("notes")} />
      </FormSection>

      {formError ? (
        <p role="alert" className="text-sm font-medium text-destructive">
          {formError}
        </p>
      ) : null}

      <SubmitActionArea submitLabel="Create Draft Invoice" loading={pending} disabled={!customerId} />
    </form>
  );
}
