"use client";

import * as React from "react";
import { useFieldArray, useForm } from "react-hook-form";
import { Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { SelectInput } from "@/components/forms/select-input";
import { DateInput } from "@/components/forms/date-input";
import { CurrencyInput } from "@/components/forms/currency-input";
import { TextInput } from "@/components/forms/text-input";
import { FormSection } from "@/components/forms/form-section";
import { SubmitActionArea } from "@/components/forms/submit-action-area";
import { useActionForm } from "@/lib/hooks/use-action-form";
import { generateBillingDraft } from "@/lib/actions/billing-drafts";
import type { CreateBillingDraftInput } from "@/lib/validation/billing-draft";

interface ProjectOption {
  id: string;
  name: string;
  code: string | null;
  customerName: string;
  billingType: "HOURLY" | "DAILY" | "MONTHLY" | "FIXED";
  mobilisationCharge: string | null;
  demobilisationCharge: string | null;
}

interface CreateBillingDraftFormProps {
  projectOptions: ProjectOption[];
  defaultProjectId?: string;
}

type FormFields = { periodStart: string; periodEnd: string; notes: string; charges: { description: string; amount: string }[] };

export function CreateBillingDraftForm({ projectOptions, defaultProjectId }: CreateBillingDraftFormProps) {
  const [projectId, setProjectId] = React.useState(defaultProjectId ?? "");
  const [allowProration, setAllowProration] = React.useState(false);
  const selectedProject = projectOptions.find((p) => p.id === projectId);

  const { register, control, handleSubmit } = useForm<FormFields>({
    defaultValues: { periodStart: "", periodEnd: "", notes: "", charges: [] },
  });
  const { fields, append, remove } = useFieldArray({ control, name: "charges" });

  const { run, pending, fieldErrors, formError } = useActionForm(
    (input: CreateBillingDraftInput) => generateBillingDraft(input),
    { redirectTo: (data) => (data ? `/finance/billing/${data.id}` : "/finance/billing") },
  );

  function onSubmit(values: FormFields) {
    run({ projectId, periodStart: values.periodStart, periodEnd: values.periodEnd, allowProration, notes: values.notes, charges: values.charges });
  }

  function addSuggestedCharge(description: string, amount: string | null) {
    if (!amount) return;
    append({ description, amount });
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-6">
      <FormSection title="Project & Period">
        <SelectInput
          id="billingProjectId"
          label="Project"
          required
          value={projectId}
          onValueChange={setProjectId}
          error={fieldErrors.projectId}
          placeholder="Select a project with billing configured"
          options={projectOptions.map((p) => ({ value: p.id, label: `${p.name} — ${p.customerName} (${p.billingType})` }))}
        />
        <DateInput id="periodStart" label="Period Start" required error={fieldErrors.periodStart} {...register("periodStart", { required: true })} />
        <DateInput id="periodEnd" label="Period End" required error={fieldErrors.periodEnd} {...register("periodEnd", { required: true })} />
        {selectedProject?.billingType === "MONTHLY" ? (
          <div className="flex items-start gap-2">
            <Checkbox id="allowProration" checked={allowProration} onCheckedChange={(v) => setAllowProration(v === true)} className="mt-0.5" />
            <Label htmlFor="allowProration" className="text-sm font-normal text-muted-foreground">
              This period is not a full calendar month — explicitly prorate the monthly rate for it. Otherwise, a partial period is rejected
              rather than silently prorated.
            </Label>
          </div>
        ) : null}
      </FormSection>

      <FormSection title="Additional Charges" description="Mobilisation, demobilisation, or other one-off approved charges for this period.">
        {selectedProject && (selectedProject.mobilisationCharge || selectedProject.demobilisationCharge) ? (
          <div className="flex flex-wrap gap-2">
            {selectedProject.mobilisationCharge ? (
              <Button type="button" variant="outline" size="sm" onClick={() => addSuggestedCharge("Mobilisation charge", selectedProject.mobilisationCharge)}>
                + Mobilisation ({selectedProject.mobilisationCharge})
              </Button>
            ) : null}
            {selectedProject.demobilisationCharge ? (
              <Button type="button" variant="outline" size="sm" onClick={() => addSuggestedCharge("Demobilisation charge", selectedProject.demobilisationCharge)}>
                + Demobilisation ({selectedProject.demobilisationCharge})
              </Button>
            ) : null}
          </div>
        ) : null}

        <div className="space-y-3">
          {fields.map((field, index) => (
            <Card key={field.id}>
              <CardContent className="space-y-3 p-3">
                <div className="flex items-start justify-between gap-2">
                  <span className="text-xs font-medium text-muted-foreground">Charge {index + 1}</span>
                  <Button type="button" variant="ghost" size="icon" onClick={() => remove(index)} aria-label="Remove charge">
                    <Trash2 />
                  </Button>
                </div>
                <TextInput id={`charge-desc-${index}`} label="Description" required {...register(`charges.${index}.description`, { required: true })} />
                <CurrencyInput id={`charge-amount-${index}`} label="Amount" required {...register(`charges.${index}.amount`, { required: true })} />
              </CardContent>
            </Card>
          ))}
          <Button type="button" variant="outline" size="sm" onClick={() => append({ description: "", amount: "" })}>
            <Plus /> Add Charge
          </Button>
        </div>
      </FormSection>

      <FormSection title="Notes">
        <TextInput id="billingDraftNotes" label="Notes" {...register("notes")} />
      </FormSection>

      {formError ? (
        <p role="alert" className="text-sm font-medium text-destructive">
          {formError}
        </p>
      ) : null}

      <SubmitActionArea submitLabel="Generate Billing Draft" loading={pending} disabled={!projectId} />
    </form>
  );
}
