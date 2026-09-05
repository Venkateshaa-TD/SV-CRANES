"use client";

import * as React from "react";
import { useForm } from "react-hook-form";

import { CurrencyInput } from "@/components/forms/currency-input";
import { NumberInput } from "@/components/forms/number-input";
import { SelectInput } from "@/components/forms/select-input";
import { TextInput } from "@/components/forms/text-input";
import { FormSection } from "@/components/forms/form-section";
import { SubmitActionArea } from "@/components/forms/submit-action-area";
import { useActionForm } from "@/lib/hooks/use-action-form";
import { upsertBillingConfiguration } from "@/lib/actions/billing-configurations";
import { BILLING_TYPE_OPTIONS, type BillingConfigurationFormInput } from "@/lib/validation/billing-configuration";

const BILLING_TYPE_LABELS: Record<(typeof BILLING_TYPE_OPTIONS)[number], string> = {
  HOURLY: "Hourly",
  DAILY: "Daily",
  MONTHLY: "Monthly",
  FIXED: "Fixed",
};

const BILLING_TYPE_HINTS: Record<(typeof BILLING_TYPE_OPTIONS)[number], string> = {
  HOURLY: "Rate applied per working hour, from approved daily logs.",
  DAILY: "Rate applied per eligible operational day (a day with an approved daily log).",
  MONTHLY: "Rate applied per full calendar month billed.",
  FIXED: "One agreed lump sum amount.",
};

interface BillingConfigurationFormProps {
  projectId: string;
  defaultValues?: Partial<BillingConfigurationFormInput>;
  onSaved?: () => void;
}

type TextFields = Pick<
  BillingConfigurationFormInput,
  "baseRate" | "minimumGuaranteedHours" | "overtimeThresholdHours" | "overtimeRate" | "mobilisationCharge" | "demobilisationCharge" | "taxPercent" | "billingNotes"
>;

export function BillingConfigurationForm({ projectId, defaultValues, onSaved }: BillingConfigurationFormProps) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<TextFields>({
    defaultValues: {
      baseRate: defaultValues?.baseRate ?? "",
      minimumGuaranteedHours: defaultValues?.minimumGuaranteedHours ?? "",
      overtimeThresholdHours: defaultValues?.overtimeThresholdHours ?? "",
      overtimeRate: defaultValues?.overtimeRate ?? "",
      mobilisationCharge: defaultValues?.mobilisationCharge ?? "",
      demobilisationCharge: defaultValues?.demobilisationCharge ?? "",
      taxPercent: defaultValues?.taxPercent ?? "",
      billingNotes: defaultValues?.billingNotes ?? "",
    },
  });

  const [billingType, setBillingType] = React.useState<string>(defaultValues?.billingType ?? "HOURLY");

  const { run, pending, fieldErrors, formError } = useActionForm(
    (input: BillingConfigurationFormInput) => upsertBillingConfiguration(projectId, input),
    { onSuccess: onSaved },
  );

  function onSubmit(values: TextFields) {
    run({ ...values, billingType: billingType as BillingConfigurationFormInput["billingType"] });
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-6">
      <FormSection title="Billing Type">
        <SelectInput
          id="billingType"
          label="Billing Type"
          required
          value={billingType}
          onValueChange={setBillingType}
          options={BILLING_TYPE_OPTIONS.map((t) => ({ value: t, label: BILLING_TYPE_LABELS[t] }))}
          hint={BILLING_TYPE_HINTS[billingType as (typeof BILLING_TYPE_OPTIONS)[number]]}
        />
        <CurrencyInput
          id="baseRate"
          label={billingType === "FIXED" ? "Fixed Amount" : `Base Rate (per ${billingType === "HOURLY" ? "hour" : billingType === "DAILY" ? "day" : "month"})`}
          required
          error={errors.baseRate?.message ?? fieldErrors.baseRate}
          {...register("baseRate", { required: "Base rate is required" })}
        />
      </FormSection>

      {billingType === "HOURLY" ? (
        <FormSection title="Hourly Rules" description="Both fields optional — leave blank to skip.">
          <NumberInput
            id="minimumGuaranteedHours"
            label="Minimum Guaranteed Hours / Day"
            error={fieldErrors.minimumGuaranteedHours}
            {...register("minimumGuaranteedHours")}
          />
          <NumberInput
            id="overtimeThresholdHours"
            label="Overtime Threshold Hours / Day"
            hint="Must be set together with the overtime rate below"
            error={fieldErrors.overtimeThresholdHours}
            {...register("overtimeThresholdHours")}
          />
          <CurrencyInput id="overtimeRate" label="Overtime Rate (per hour)" error={fieldErrors.overtimeRate} {...register("overtimeRate")} />
        </FormSection>
      ) : null}

      <FormSection title="Additional Charges & Tax">
        <CurrencyInput
          id="mobilisationCharge"
          label="Mobilisation Charge"
          hint="Suggested default — added as a line item when preparing billing"
          error={fieldErrors.mobilisationCharge}
          {...register("mobilisationCharge")}
        />
        <CurrencyInput id="demobilisationCharge" label="Demobilisation Charge" error={fieldErrors.demobilisationCharge} {...register("demobilisationCharge")} />
        <NumberInput id="taxPercent" label="Tax %" hint="e.g. 18 for 18% GST" error={fieldErrors.taxPercent} {...register("taxPercent")} />
      </FormSection>

      <FormSection title="Notes">
        <TextInput id="billingNotes" label="Billing Notes" error={fieldErrors.billingNotes} {...register("billingNotes")} />
      </FormSection>

      {formError ? (
        <p role="alert" className="text-sm font-medium text-destructive">
          {formError}
        </p>
      ) : null}

      <SubmitActionArea submitLabel="Save Billing Configuration" loading={pending} />
    </form>
  );
}
