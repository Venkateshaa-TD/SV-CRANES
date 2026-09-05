"use client";

import { useForm } from "react-hook-form";

import { TextInput } from "@/components/forms/text-input";
import { NumberInput } from "@/components/forms/number-input";
import { FormSection } from "@/components/forms/form-section";
import { SubmitActionArea } from "@/components/forms/submit-action-area";
import { useActionForm } from "@/lib/hooks/use-action-form";
import { createCustomer, updateCustomer } from "@/lib/actions/customers";
import type { CustomerCombinedFormInput } from "@/lib/validation/customer";

interface CustomerFormProps {
  mode: "create" | "edit";
  customerId?: string;
  defaultValues?: Partial<CustomerCombinedFormInput>;
  /** Progressive disclosure: only a CUSTOMER_FINANCIAL_EDIT holder sees
   * the financial-terms section at all — never a disabled/read-only
   * version of it, since a hidden field can't be tampered with client-side
   * and the server independently re-enforces the same permission. */
  canEditFinancials: boolean;
}

export function CustomerForm({ mode, customerId, defaultValues, canEditFinancials }: CustomerFormProps) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<CustomerCombinedFormInput>({
    defaultValues: {
      name: defaultValues?.name ?? "",
      customerCode: defaultValues?.customerCode ?? "",
      contactPerson: defaultValues?.contactPerson ?? "",
      phone: defaultValues?.phone ?? "",
      email: defaultValues?.email ?? "",
      gstNumber: defaultValues?.gstNumber ?? "",
      address: defaultValues?.address ?? "",
      notes: defaultValues?.notes ?? "",
      paymentTerms: defaultValues?.paymentTerms ?? "",
      defaultDueDays: defaultValues?.defaultDueDays ?? 30,
    },
  });

  const { run, pending, fieldErrors, formError } = useActionForm(
    (input: CustomerCombinedFormInput) => (mode === "create" ? createCustomer(input) : updateCustomer(customerId!, input)),
    { redirectTo: (data) => (mode === "create" && data ? `/customers/${data.id}` : `/customers/${customerId}`) },
  );

  function onSubmit(values: CustomerCombinedFormInput) {
    const payload: CustomerCombinedFormInput = canEditFinancials
      ? values
      : { ...values, paymentTerms: undefined, defaultDueDays: undefined };
    run(payload);
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-6">
      <FormSection title="Company">
        <TextInput
          id="name"
          label="Company Name"
          required
          error={errors.name?.message ?? fieldErrors.name}
          {...register("name", { required: "Company name is required" })}
        />
        <TextInput id="customerCode" label="Customer Code" hint="e.g. CUST-004" error={fieldErrors.customerCode} {...register("customerCode")} />
        <TextInput id="gstNumber" label="GST / Tax Number" error={fieldErrors.gstNumber} {...register("gstNumber")} />
      </FormSection>

      <FormSection title="Contact">
        <TextInput id="contactPerson" label="Contact Person" error={fieldErrors.contactPerson} {...register("contactPerson")} />
        <TextInput id="phone" label="Phone" type="tel" inputMode="tel" error={fieldErrors.phone} {...register("phone")} />
        <TextInput id="email" label="Email" type="email" error={errors.email?.message ?? fieldErrors.email} {...register("email")} />
        <TextInput id="address" label="Billing Address" error={fieldErrors.address} {...register("address")} />
      </FormSection>

      {canEditFinancials ? (
        <FormSection title="Financial Terms" description="Governs invoice due dates. Restricted to authorized users.">
          <TextInput
            id="paymentTerms"
            label="Payment Terms"
            hint='Free text shown on invoices, e.g. "50% advance, balance on completion"'
            error={fieldErrors.paymentTerms}
            {...register("paymentTerms")}
          />
          <NumberInput
            id="defaultDueDays"
            label="Default Due Days"
            mode="integer"
            hint="Used to compute each invoice's due date"
            error={fieldErrors.defaultDueDays}
            {...register("defaultDueDays")}
          />
        </FormSection>
      ) : null}

      <FormSection title="Notes">
        <TextInput id="notes" label="Notes" error={fieldErrors.notes} {...register("notes")} />
      </FormSection>

      {formError ? (
        <p role="alert" className="text-sm font-medium text-destructive">
          {formError}
        </p>
      ) : null}

      <SubmitActionArea submitLabel={mode === "create" ? "Add Customer" : "Save Changes"} loading={pending} />
    </form>
  );
}
