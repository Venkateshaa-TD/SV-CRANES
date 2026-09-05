"use client";

import * as React from "react";
import { useForm } from "react-hook-form";

import { DateInput } from "@/components/forms/date-input";
import { NumberInput } from "@/components/forms/number-input";
import { CurrencyInput } from "@/components/forms/currency-input";
import { TextInput } from "@/components/forms/text-input";
import { SelectInput } from "@/components/forms/select-input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { FormSection } from "@/components/forms/form-section";
import { SubmitActionArea } from "@/components/forms/submit-action-area";
import { PhotoUploadField } from "@/components/forms/photo-upload-field";
import { useActionForm } from "@/lib/hooks/use-action-form";
import { createFuelEntry, updateFuelEntry } from "@/lib/actions/fuel";
import type { FuelFormInput } from "@/lib/validation/fuel";

interface SelectOption {
  id: string;
  label: string;
}

interface FuelFormProps {
  mode?: "create" | "edit";
  entryId?: string;
  vehicleOptions: SelectOption[];
  projectOptions: SelectOption[];
  defaultVehicleId?: string;
  defaultValues?: Partial<FuelFormInput>;
}

type TextFields = Pick<
  FuelFormInput,
  "entryDate" | "entryTime" | "quantityLiters" | "ratePerLiter" | "vendorName" | "odometerAtFill" | "hourMeterAtFill" | "notes"
>;

function toNumber(value: string | undefined): number | null {
  if (value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isNaN(n) ? null : n;
}

const currencyFormatter = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" });

export function FuelForm({ mode = "create", entryId, vehicleOptions, projectOptions, defaultVehicleId, defaultValues }: FuelFormProps) {
  const now = new Date();
  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<TextFields>({
    defaultValues: {
      entryDate: defaultValues?.entryDate ?? now.toISOString().slice(0, 10),
      entryTime: defaultValues?.entryTime ?? now.toTimeString().slice(0, 5),
      quantityLiters: defaultValues?.quantityLiters ?? "",
      ratePerLiter: defaultValues?.ratePerLiter ?? "",
      vendorName: defaultValues?.vendorName ?? "",
      odometerAtFill: defaultValues?.odometerAtFill ?? "",
      hourMeterAtFill: defaultValues?.hourMeterAtFill ?? "",
      notes: defaultValues?.notes ?? "",
    },
  });

  const [vehicleId, setVehicleId] = React.useState(defaultValues?.vehicleId ?? defaultVehicleId ?? "");
  const [fuelType, setFuelType] = React.useState<string>(defaultValues?.fuelType ?? "DIESEL");
  const [projectId, setProjectId] = React.useState(defaultValues?.projectId ?? "");
  const [receiptFileId, setReceiptFileId] = React.useState<string | undefined>(defaultValues?.receiptFileId);

  const quantityLiters = watch("quantityLiters");
  const ratePerLiter = watch("ratePerLiter");

  const totalPreview = React.useMemo(() => {
    const qty = toNumber(quantityLiters);
    const rate = toNumber(ratePerLiter);
    if (qty === null || rate === null) return null;
    return qty * rate;
  }, [quantityLiters, ratePerLiter]);

  const { run, pending, fieldErrors, formError } = useActionForm(
    (values: FuelFormInput) => (mode === "create" ? createFuelEntry(values) : updateFuelEntry(entryId!, values)),
    { redirectTo: "/fuel" },
  );

  function onSubmit(values: TextFields) {
    run({
      ...values,
      vehicleId,
      fuelType: fuelType as FuelFormInput["fuelType"],
      projectId: projectId || undefined,
      receiptFileId,
    });
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-6">
      <FormSection title="Vehicle & Fuel">
        <SelectInput
          id="vehicleId"
          label="Vehicle"
          required
          value={vehicleId}
          onValueChange={setVehicleId}
          placeholder="Select a vehicle"
          error={fieldErrors.vehicleId}
          options={vehicleOptions.map((v) => ({ value: v.id, label: v.label }))}
        />
        <SelectInput
          id="fuelType"
          label="Fuel Type"
          required
          value={fuelType}
          onValueChange={setFuelType}
          options={[
            { value: "DIESEL", label: "Diesel" },
            { value: "PETROL", label: "Petrol" },
            { value: "OTHER", label: "Other" },
          ]}
        />
        {projectOptions.length > 0 ? (
          <SelectInput
            id="projectId"
            label="Project / Site"
            value={projectId}
            onValueChange={setProjectId}
            placeholder="None"
            options={projectOptions.map((p) => ({ value: p.id, label: p.label }))}
          />
        ) : null}
      </FormSection>

      <FormSection title="Date & Time">
        <DateInput id="entryDate" label="Date" required error={errors.entryDate?.message ?? fieldErrors.entryDate} {...register("entryDate", { required: "Date is required" })} />
        <TextInput id="entryTime" label="Time" type="time" error={fieldErrors.entryTime} {...register("entryTime")} />
      </FormSection>

      <FormSection title="Quantity & Cost">
        <NumberInput
          id="quantityLiters"
          label="Litres"
          required
          error={errors.quantityLiters?.message ?? fieldErrors.quantityLiters}
          {...register("quantityLiters", { required: "Litres is required" })}
        />
        <CurrencyInput
          id="ratePerLiter"
          label="Price per Litre"
          required
          error={errors.ratePerLiter?.message ?? fieldErrors.ratePerLiter}
          {...register("ratePerLiter", { required: "Rate is required" })}
        />
        <p className="text-sm text-muted-foreground">
          Total: <span className="font-medium tabular-nums text-foreground">{totalPreview === null ? "—" : currencyFormatter.format(totalPreview)}</span>
        </p>
      </FormSection>

      <FormSection title="Vendor & Readings">
        <TextInput id="vendorName" label="Vendor / Fuel Station" error={fieldErrors.vendorName} {...register("vendorName")} />
        <NumberInput id="hourMeterAtFill" label="Hour Meter" error={fieldErrors.hourMeterAtFill} {...register("hourMeterAtFill")} />
        <NumberInput id="odometerAtFill" label="Odometer (km)" error={fieldErrors.odometerAtFill} {...register("odometerAtFill")} />
      </FormSection>

      <FormSection title="Receipt & Notes">
        <PhotoUploadField id="receiptFileId" label="Receipt" category="fuel-receipts" value={receiptFileId} onChange={setReceiptFileId} />
        <div className="space-y-1.5">
          <Label htmlFor="notes">Notes</Label>
          <Textarea id="notes" {...register("notes")} />
        </div>
      </FormSection>

      {formError ? (
        <p role="alert" className="text-sm font-medium text-destructive">
          {formError}
        </p>
      ) : null}

      <SubmitActionArea submitLabel={mode === "create" ? "Save Fuel Entry" : "Save Changes"} loading={pending} />
    </form>
  );
}
