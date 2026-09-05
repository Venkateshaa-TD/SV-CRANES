"use client";

import * as React from "react";
import { useForm } from "react-hook-form";

import { TextInput } from "@/components/forms/text-input";
import { NumberInput } from "@/components/forms/number-input";
import { CurrencyInput } from "@/components/forms/currency-input";
import { DateInput } from "@/components/forms/date-input";
import { SelectInput } from "@/components/forms/select-input";
import { FormSection } from "@/components/forms/form-section";
import { SubmitActionArea } from "@/components/forms/submit-action-area";
import { PhotoUploadField } from "@/components/forms/photo-upload-field";
import { useActionForm } from "@/lib/hooks/use-action-form";
import { createVehicle, updateVehicle } from "@/lib/actions/vehicles";
import type { VehicleFormInput } from "@/lib/validation/vehicle";

interface OperatorOption {
  id: string;
  name: string;
}

interface VehicleFormProps {
  mode: "create" | "edit";
  vehicleId?: string;
  defaultValues?: Partial<VehicleFormInput>;
  operatorOptions: OperatorOption[];
}

type TextFields = Pick<
  VehicleFormInput,
  "name" | "registrationNumber" | "code" | "make" | "model" | "year" | "capacityTons" | "currentHourMeter" | "currentOdometer" | "purchaseDate" | "purchaseAmount" | "notes"
>;

export function VehicleForm({ mode, vehicleId, defaultValues, operatorOptions }: VehicleFormProps) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<TextFields>({
    defaultValues: {
      name: defaultValues?.name ?? "",
      registrationNumber: defaultValues?.registrationNumber ?? "",
      code: defaultValues?.code ?? "",
      make: defaultValues?.make ?? "",
      model: defaultValues?.model ?? "",
      year: defaultValues?.year,
      capacityTons: defaultValues?.capacityTons ?? "",
      currentHourMeter: defaultValues?.currentHourMeter ?? "",
      currentOdometer: defaultValues?.currentOdometer ?? "",
      purchaseDate: defaultValues?.purchaseDate ?? "",
      purchaseAmount: defaultValues?.purchaseAmount ?? "",
      notes: defaultValues?.notes ?? "",
    },
  });

  const [category, setCategory] = React.useState<string>(defaultValues?.category ?? "CRANE");
  const [status, setStatus] = React.useState<string>(defaultValues?.status ?? "IDLE");
  const [fuelType, setFuelType] = React.useState<string>(defaultValues?.fuelType ?? "");
  const [assignedOperatorId, setAssignedOperatorId] = React.useState<string>(defaultValues?.assignedOperatorId ?? "");
  const [imageFileId, setImageFileId] = React.useState<string | undefined>(defaultValues?.imageFileId);

  const { run, pending, fieldErrors, formError } = useActionForm(
    (input: VehicleFormInput) => (mode === "create" ? createVehicle(input) : updateVehicle(vehicleId!, input)),
    { redirectTo: (data) => (mode === "create" && data ? `/vehicles/${data.id}` : `/vehicles/${vehicleId}`) },
  );

  function onSubmit(values: TextFields) {
    run({
      ...values,
      category: category as VehicleFormInput["category"],
      status: status as VehicleFormInput["status"],
      fuelType: (fuelType || undefined) as VehicleFormInput["fuelType"],
      assignedOperatorId: assignedOperatorId || undefined,
      imageFileId,
    });
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-6">
      <FormSection title="Identification">
        <TextInput id="name" label="Display Name" required error={errors.name?.message ?? fieldErrors.name} {...register("name", { required: "Display name is required" })} />
        <TextInput
          id="registrationNumber"
          label="Registration Number"
          required
          hint="Government registration/plate number"
          error={errors.registrationNumber?.message ?? fieldErrors.registrationNumber}
          {...register("registrationNumber", { required: "Registration number is required" })}
        />
        <TextInput id="code" label="Internal Code" hint="e.g. CR-01" error={fieldErrors.code} {...register("code")} />
        <SelectInput
          id="category"
          label="Vehicle Type"
          required
          value={category}
          onValueChange={setCategory}
          options={[
            { value: "CRANE", label: "Crane" },
            { value: "TRUCK", label: "Truck" },
            { value: "TRAILER", label: "Trailer" },
            { value: "PICKUP", label: "Pickup" },
            { value: "OTHER", label: "Other" },
          ]}
        />
        <SelectInput
          id="status"
          label="Status"
          required
          value={status}
          onValueChange={setStatus}
          options={[
            { value: "WORKING", label: "Working" },
            { value: "IDLE", label: "Idle" },
            { value: "MAINTENANCE", label: "Maintenance" },
            { value: "OUT_OF_SERVICE", label: "Out of Service" },
          ]}
        />
      </FormSection>

      <FormSection title="Specifications">
        <TextInput id="make" label="Make" error={fieldErrors.make} {...register("make")} />
        <TextInput id="model" label="Model" error={fieldErrors.model} {...register("model")} />
        <NumberInput id="year" label="Year" mode="integer" error={fieldErrors.year} {...register("year")} />
        <NumberInput id="capacityTons" label="Capacity (tons)" hint="For cranes" error={fieldErrors.capacityTons} {...register("capacityTons")} />
        <SelectInput
          id="fuelType"
          label="Fuel Type"
          value={fuelType}
          onValueChange={setFuelType}
          options={[
            { value: "DIESEL", label: "Diesel" },
            { value: "PETROL", label: "Petrol" },
            { value: "OTHER", label: "Other" },
          ]}
        />
      </FormSection>

      <FormSection title="Current Readings" description="Baseline readings. Daily logs advance these automatically afterward.">
        <NumberInput id="currentHourMeter" label="Current Hour Meter" error={fieldErrors.currentHourMeter} {...register("currentHourMeter")} />
        <NumberInput id="currentOdometer" label="Current Odometer (km)" error={fieldErrors.currentOdometer} {...register("currentOdometer")} />
      </FormSection>

      <FormSection title="Assignment">
        <SelectInput
          id="assignedOperatorId"
          label="Assigned Operator"
          value={assignedOperatorId}
          onValueChange={setAssignedOperatorId}
          placeholder="Unassigned"
          options={operatorOptions.map((o) => ({ value: o.id, label: o.name }))}
        />
      </FormSection>

      <FormSection title="Purchase (optional)">
        <DateInput id="purchaseDate" label="Purchase Date" error={fieldErrors.purchaseDate} {...register("purchaseDate")} />
        <CurrencyInput id="purchaseAmount" label="Purchase Amount" error={fieldErrors.purchaseAmount} {...register("purchaseAmount")} />
      </FormSection>

      <FormSection title="Photo & Notes">
        <PhotoUploadField id="imageFileId" label="Vehicle Photo" category="vehicle-images" value={imageFileId} onChange={setImageFileId} />
        <TextInput id="notes" label="Notes" error={fieldErrors.notes} {...register("notes")} />
      </FormSection>

      {formError ? (
        <p role="alert" className="text-sm font-medium text-destructive">
          {formError}
        </p>
      ) : null}

      <SubmitActionArea submitLabel={mode === "create" ? "Add Vehicle" : "Save Changes"} loading={pending} />
    </form>
  );
}
