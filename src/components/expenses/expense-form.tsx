"use client";

import * as React from "react";
import { useForm } from "react-hook-form";

import { DateInput } from "@/components/forms/date-input";
import { CurrencyInput } from "@/components/forms/currency-input";
import { TextInput } from "@/components/forms/text-input";
import { SelectInput } from "@/components/forms/select-input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { FormSection } from "@/components/forms/form-section";
import { SubmitActionArea } from "@/components/forms/submit-action-area";
import { PhotoUploadField } from "@/components/forms/photo-upload-field";
import { useActionForm } from "@/lib/hooks/use-action-form";
import { submitExpense, updateExpense } from "@/lib/actions/expenses";
import type { ExpenseFormInput } from "@/lib/validation/expense";

interface SelectOption {
  id: string;
  label: string;
}

interface ExpenseFormProps {
  mode?: "create" | "edit";
  expenseId?: string;
  categoryOptions: SelectOption[];
  vehicleOptions: SelectOption[];
  projectOptions: SelectOption[];
  defaultVehicleId?: string;
  defaultValues?: Partial<ExpenseFormInput>;
}

type TextFields = Pick<ExpenseFormInput, "expenseDate" | "amount" | "vendorName" | "description">;

export function ExpenseForm({
  mode = "create",
  expenseId,
  categoryOptions,
  vehicleOptions,
  projectOptions,
  defaultVehicleId,
  defaultValues,
}: ExpenseFormProps) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<TextFields>({
    defaultValues: {
      expenseDate: defaultValues?.expenseDate ?? new Date().toISOString().slice(0, 10),
      amount: defaultValues?.amount ?? "",
      vendorName: defaultValues?.vendorName ?? "",
      description: defaultValues?.description ?? "",
    },
  });

  const [categoryId, setCategoryId] = React.useState(defaultValues?.categoryId ?? "");
  const [vehicleId, setVehicleId] = React.useState(defaultValues?.vehicleId ?? defaultVehicleId ?? "");
  const [projectId, setProjectId] = React.useState(defaultValues?.projectId ?? "");
  const [receiptFileId, setReceiptFileId] = React.useState<string | undefined>(defaultValues?.receiptFileId);

  const { run, pending, fieldErrors, formError } = useActionForm(
    (values: ExpenseFormInput) => (mode === "create" ? submitExpense(values) : updateExpense(expenseId!, values)),
    { redirectTo: "/expenses" },
  );

  function onSubmit(values: TextFields) {
    run({
      ...values,
      categoryId,
      vehicleId: vehicleId || undefined,
      projectId: projectId || undefined,
      receiptFileId,
    });
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-6">
      <FormSection title="Expense">
        <DateInput id="expenseDate" label="Date" required error={errors.expenseDate?.message ?? fieldErrors.expenseDate} {...register("expenseDate", { required: "Date is required" })} />
        <SelectInput
          id="categoryId"
          label="Category"
          required
          value={categoryId}
          onValueChange={setCategoryId}
          placeholder="Select a category"
          error={fieldErrors.categoryId}
          options={categoryOptions.map((c) => ({ value: c.id, label: c.label }))}
        />
        <CurrencyInput id="amount" label="Amount" required error={errors.amount?.message ?? fieldErrors.amount} {...register("amount", { required: "Amount is required" })} />
        <TextInput id="vendorName" label="Vendor" error={fieldErrors.vendorName} {...register("vendorName")} />
      </FormSection>

      <FormSection title="Related To (optional)">
        {vehicleOptions.length > 0 ? (
          <SelectInput id="vehicleId" label="Vehicle" value={vehicleId} onValueChange={setVehicleId} placeholder="None" options={vehicleOptions.map((v) => ({ value: v.id, label: v.label }))} />
        ) : null}
        {projectOptions.length > 0 ? (
          <SelectInput id="projectId" label="Project / Site" value={projectId} onValueChange={setProjectId} placeholder="None" options={projectOptions.map((p) => ({ value: p.id, label: p.label }))} />
        ) : null}
      </FormSection>

      <FormSection title="Details">
        <div className="space-y-1.5">
          <Label htmlFor="description">Description / Notes</Label>
          <Textarea id="description" {...register("description")} />
        </div>
        <PhotoUploadField id="receiptFileId" label="Receipt" category="expense-receipts" value={receiptFileId} onChange={setReceiptFileId} />
      </FormSection>

      {formError ? (
        <p role="alert" className="text-sm font-medium text-destructive">
          {formError}
        </p>
      ) : null}

      <SubmitActionArea submitLabel={mode === "create" ? "Submit Expense" : "Save Changes"} loading={pending} />
    </form>
  );
}
