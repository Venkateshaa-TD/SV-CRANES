"use client";

import { useForm } from "react-hook-form";
import * as React from "react";

import { TextInput } from "@/components/forms/text-input";
import { SelectInput } from "@/components/forms/select-input";
import { FormSection } from "@/components/forms/form-section";
import { SubmitActionArea } from "@/components/forms/submit-action-area";
import { useActionForm } from "@/lib/hooks/use-action-form";
import { createEmployee, updateEmployee } from "@/lib/actions/employees";
import { ROLE_OPTIONS, type EmployeeFormInput } from "@/lib/validation/employee";

const ROLE_LABELS: Record<(typeof ROLE_OPTIONS)[number], string> = {
  SUPER_ADMIN: "Super Admin",
  MANAGER: "Manager",
  ACCOUNTANT: "Accountant",
  SUPERVISOR: "Supervisor",
  OPERATOR: "Operator",
};

interface EmployeeFormProps {
  mode: "create" | "edit";
  employeeId?: string;
  defaultValues?: Partial<EmployeeFormInput>;
}

type TextFields = Pick<EmployeeFormInput, "name" | "email" | "phone" | "employeeCode" | "notes">;

export function EmployeeForm({ mode, employeeId, defaultValues }: EmployeeFormProps) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<TextFields & { password?: string }>({
    defaultValues: {
      name: defaultValues?.name ?? "",
      email: defaultValues?.email ?? "",
      phone: defaultValues?.phone ?? "",
      employeeCode: defaultValues?.employeeCode ?? "",
      notes: defaultValues?.notes ?? "",
      password: "",
    },
  });

  const [role, setRole] = React.useState<string>(defaultValues?.role ?? "OPERATOR");

  const { run, pending, fieldErrors, formError } = useActionForm(
    (input: EmployeeFormInput & { password?: string }) =>
      mode === "create" ? createEmployee(input) : updateEmployee(employeeId!, input),
    { redirectTo: "/admin/users" },
  );

  function onSubmit(values: TextFields & { password?: string }) {
    run({ ...values, role: role as EmployeeFormInput["role"] });
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-6">
      <FormSection title="Profile">
        <TextInput id="name" label="Name" required error={errors.name?.message ?? fieldErrors.name} {...register("name", { required: "Name is required" })} />
        <TextInput
          id="email"
          label="Email"
          type="email"
          required
          autoComplete="off"
          error={errors.email?.message ?? fieldErrors.email}
          {...register("email", { required: "Email is required" })}
        />
        <TextInput id="phone" label="Phone" type="tel" inputMode="tel" error={fieldErrors.phone} {...register("phone")} />
        <TextInput id="employeeCode" label="Employee Code" hint="Optional short staff code" error={fieldErrors.employeeCode} {...register("employeeCode")} />
        <SelectInput
          id="role"
          label="Role"
          required
          value={role}
          onValueChange={setRole}
          options={ROLE_OPTIONS.map((r) => ({ value: r, label: ROLE_LABELS[r] }))}
        />
        <TextInput id="notes" label="Notes" error={fieldErrors.notes} {...register("notes")} />
      </FormSection>

      {mode === "create" ? (
        <FormSection title="Account" description="They can sign in with this email and password immediately.">
          <TextInput
            id="password"
            label="Temporary Password"
            type="password"
            autoComplete="new-password"
            required
            hint="At least 8 characters"
            error={errors.password?.message ?? fieldErrors.password}
            {...register("password", { required: "Password is required" })}
          />
        </FormSection>
      ) : null}

      {formError ? (
        <p role="alert" className="text-sm font-medium text-destructive">
          {formError}
        </p>
      ) : null}

      <SubmitActionArea submitLabel={mode === "create" ? "Create Employee" : "Save Changes"} loading={pending} />
    </form>
  );
}
