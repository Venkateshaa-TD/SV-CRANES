"use client";

import * as React from "react";
import { useForm } from "react-hook-form";

import { TextInput } from "@/components/forms/text-input";
import { DateInput } from "@/components/forms/date-input";
import { SelectInput } from "@/components/forms/select-input";
import { FormSection } from "@/components/forms/form-section";
import { SubmitActionArea } from "@/components/forms/submit-action-area";
import { useActionForm } from "@/lib/hooks/use-action-form";
import { createProject, updateProject } from "@/lib/actions/projects";
import { PROJECT_STATUS_OPTIONS, type ProjectFormInput } from "@/lib/validation/project";

const STATUS_LABELS: Record<(typeof PROJECT_STATUS_OPTIONS)[number], string> = {
  UPCOMING: "Upcoming",
  ACTIVE: "Active",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
};

interface CustomerOption {
  id: string;
  name: string;
  customerCode: string | null;
}

interface ProjectFormProps {
  mode: "create" | "edit";
  projectId?: string;
  defaultValues?: Partial<ProjectFormInput>;
  customerOptions: CustomerOption[];
}

type TextFields = Pick<ProjectFormInput, "name" | "code" | "siteLocation" | "startDate" | "endDate" | "notes">;

export function ProjectForm({ mode, projectId, defaultValues, customerOptions }: ProjectFormProps) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<TextFields>({
    defaultValues: {
      name: defaultValues?.name ?? "",
      code: defaultValues?.code ?? "",
      siteLocation: defaultValues?.siteLocation ?? "",
      startDate: defaultValues?.startDate ?? "",
      endDate: defaultValues?.endDate ?? "",
      notes: defaultValues?.notes ?? "",
    },
  });

  const [customerId, setCustomerId] = React.useState(defaultValues?.customerId ?? "");
  const [status, setStatus] = React.useState<string>(defaultValues?.status ?? "UPCOMING");

  const { run, pending, fieldErrors, formError } = useActionForm(
    (input: ProjectFormInput) => (mode === "create" ? createProject(input) : updateProject(projectId!, input)),
    { redirectTo: (data) => (mode === "create" && data ? `/projects/${data.id}` : `/projects/${projectId}`) },
  );

  function onSubmit(values: TextFields) {
    run({ ...values, customerId, status: status as ProjectFormInput["status"] });
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-6">
      <FormSection title="Project">
        <SelectInput
          id="customerId"
          label="Customer"
          required
          value={customerId}
          onValueChange={setCustomerId}
          error={fieldErrors.customerId}
          options={customerOptions.map((c) => ({ value: c.id, label: c.customerCode ? `${c.name} (${c.customerCode})` : c.name }))}
        />
        <TextInput
          id="name"
          label="Project Name"
          required
          error={errors.name?.message ?? fieldErrors.name}
          {...register("name", { required: "Project name is required" })}
        />
        <TextInput id="code" label="Job Number" hint="e.g. JOB-2026-014" error={fieldErrors.code} {...register("code")} />
        <TextInput id="siteLocation" label="Site / Location" error={fieldErrors.siteLocation} {...register("siteLocation")} />
        <SelectInput
          id="status"
          label="Status"
          required
          value={status}
          onValueChange={setStatus}
          options={PROJECT_STATUS_OPTIONS.map((s) => ({ value: s, label: STATUS_LABELS[s] }))}
        />
      </FormSection>

      <FormSection title="Schedule">
        <DateInput id="startDate" label="Start Date" error={fieldErrors.startDate} {...register("startDate")} />
        <DateInput id="endDate" label="End Date" hint="Optional — leave blank while ongoing" error={fieldErrors.endDate} {...register("endDate")} />
      </FormSection>

      <FormSection title="Notes">
        <TextInput id="notes" label="Notes" error={fieldErrors.notes} {...register("notes")} />
      </FormSection>

      {formError ? (
        <p role="alert" className="text-sm font-medium text-destructive">
          {formError}
        </p>
      ) : null}

      <SubmitActionArea submitLabel={mode === "create" ? "Create Project" : "Save Changes"} loading={pending} />
    </form>
  );
}
