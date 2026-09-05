"use client";

import * as React from "react";
import { useForm } from "react-hook-form";

import { DateInput } from "@/components/forms/date-input";
import { NumberInput } from "@/components/forms/number-input";
import { SelectInput } from "@/components/forms/select-input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { FormSection } from "@/components/forms/form-section";
import { SubmitActionArea } from "@/components/forms/submit-action-area";
import { PhotoUploadField } from "@/components/forms/photo-upload-field";
import { useActionForm } from "@/lib/hooks/use-action-form";
import { createDailyLog, updateDailyLog } from "@/lib/actions/daily-logs";
import type { DailyLogFormInput } from "@/lib/validation/daily-log";

interface SelectOption {
  id: string;
  label: string;
}

interface DailyLogFormProps {
  mode: "create" | "edit";
  logId?: string;
  defaultValues?: Partial<DailyLogFormInput>;
  vehicleOptions: SelectOption[];
  projectOptions: SelectOption[];
  /** Only provided (and only shown) when the signed-in user is allowed to
   * log on behalf of other operators. */
  operatorOptions?: SelectOption[];
  currentUserName: string;
}

type TextFields = Pick<
  DailyLogFormInput,
  "logDate" | "startHourMeter" | "endHourMeter" | "startOdometer" | "endOdometer" | "workDescription" | "breakdownNotes" | "remarks"
>;

function toNumber(value: string | undefined): number | null {
  if (value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isNaN(n) ? null : n;
}

export function DailyLogForm({
  mode,
  logId,
  defaultValues,
  vehicleOptions,
  projectOptions,
  operatorOptions,
  currentUserName,
}: DailyLogFormProps) {
  const today = new Date().toISOString().slice(0, 10);
  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<TextFields>({
    defaultValues: {
      logDate: defaultValues?.logDate ?? today,
      startHourMeter: defaultValues?.startHourMeter ?? "",
      endHourMeter: defaultValues?.endHourMeter ?? "",
      startOdometer: defaultValues?.startOdometer ?? "",
      endOdometer: defaultValues?.endOdometer ?? "",
      workDescription: defaultValues?.workDescription ?? "",
      breakdownNotes: defaultValues?.breakdownNotes ?? "",
      remarks: defaultValues?.remarks ?? "",
    },
  });

  const [vehicleId, setVehicleId] = React.useState(defaultValues?.vehicleId ?? "");
  const [projectId, setProjectId] = React.useState(defaultValues?.projectId ?? "");
  const [operatorId, setOperatorId] = React.useState(defaultValues?.operatorId ?? "");
  const [meterPhotoFileId, setMeterPhotoFileId] = React.useState<string | undefined>(defaultValues?.meterPhotoFileId);
  const [sitePhotoFileId, setSitePhotoFileId] = React.useState<string | undefined>(defaultValues?.sitePhotoFileId);

  const startHourMeter = watch("startHourMeter");
  const endHourMeter = watch("endHourMeter");
  const startOdometer = watch("startOdometer");
  const endOdometer = watch("endOdometer");

  const workingHoursPreview = React.useMemo(() => {
    const start = toNumber(startHourMeter);
    const end = toNumber(endHourMeter);
    if (start === null || end === null) return null;
    return end - start;
  }, [startHourMeter, endHourMeter]);

  const distancePreview = React.useMemo(() => {
    const start = toNumber(startOdometer);
    const end = toNumber(endOdometer);
    if (start === null || end === null) return null;
    return end - start;
  }, [startOdometer, endOdometer]);

  const { run, pending, fieldErrors, formError } = useActionForm(
    (input: DailyLogFormInput) => (mode === "create" ? createDailyLog(input) : updateDailyLog(logId!, input)),
    { redirectTo: "/daily-logs" },
  );

  function onSubmit(values: TextFields) {
    run({
      ...values,
      vehicleId,
      projectId: projectId || undefined,
      operatorId: operatorId || undefined,
      meterPhotoFileId,
      sitePhotoFileId,
    });
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-6">
      <FormSection title="Date & Vehicle">
        <DateInput
          id="logDate"
          label="Date"
          required
          max={today}
          error={errors.logDate?.message ?? fieldErrors.logDate}
          {...register("logDate", { required: "Date is required" })}
        />
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
        {operatorOptions ? (
          <SelectInput
            id="operatorId"
            label="Operator"
            value={operatorId}
            onValueChange={setOperatorId}
            placeholder={currentUserName}
            options={operatorOptions.map((o) => ({ value: o.id, label: o.label }))}
          />
        ) : (
          <div className="space-y-1.5">
            <Label>Operator</Label>
            <p className="flex h-11 items-center rounded-md border border-input bg-muted px-3 text-base text-muted-foreground sm:text-sm">
              {currentUserName}
            </p>
          </div>
        )}
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

      <FormSection title="Hour Meter">
        <div className="grid grid-cols-2 gap-3">
          <NumberInput
            id="startHourMeter"
            label="Start"
            required
            error={errors.startHourMeter?.message ?? fieldErrors.startHourMeter}
            {...register("startHourMeter", { required: "Required" })}
          />
          <NumberInput
            id="endHourMeter"
            label="End"
            required
            error={errors.endHourMeter?.message ?? fieldErrors.endHourMeter}
            {...register("endHourMeter", { required: "Required" })}
          />
        </div>
        <p className="text-sm text-muted-foreground">
          Working hours:{" "}
          <span className="font-medium tabular-nums text-foreground">
            {workingHoursPreview === null ? "—" : workingHoursPreview < 0 ? "Invalid" : `${workingHoursPreview.toFixed(2)} hrs`}
          </span>
        </p>
      </FormSection>

      <FormSection title="Odometer">
        <div className="grid grid-cols-2 gap-3">
          <NumberInput
            id="startOdometer"
            label="Start"
            required
            error={errors.startOdometer?.message ?? fieldErrors.startOdometer}
            {...register("startOdometer", { required: "Required" })}
          />
          <NumberInput
            id="endOdometer"
            label="End"
            required
            error={errors.endOdometer?.message ?? fieldErrors.endOdometer}
            {...register("endOdometer", { required: "Required" })}
          />
        </div>
        <p className="text-sm text-muted-foreground">
          Distance:{" "}
          <span className="font-medium tabular-nums text-foreground">
            {distancePreview === null ? "—" : distancePreview < 0 ? "Invalid" : `${distancePreview.toFixed(2)} km`}
          </span>
        </p>
      </FormSection>

      <FormSection title="Work Details">
        <div className="space-y-1.5">
          <Label htmlFor="workDescription">Work Description</Label>
          <Textarea id="workDescription" {...register("workDescription")} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="breakdownNotes">Breakdown / Problem</Label>
          <Textarea id="breakdownNotes" placeholder="Leave blank if none" {...register("breakdownNotes")} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="remarks">Notes</Label>
          <Textarea id="remarks" {...register("remarks")} />
        </div>
      </FormSection>

      <FormSection title="Photos">
        <PhotoUploadField id="meterPhotoFileId" label="Meter Photo" category="meter-photos" value={meterPhotoFileId} onChange={setMeterPhotoFileId} />
        <PhotoUploadField id="sitePhotoFileId" label="Site Photo" category="site-photos" value={sitePhotoFileId} onChange={setSitePhotoFileId} />
      </FormSection>

      {formError ? (
        <p role="alert" className="text-sm font-medium text-destructive">
          {formError}
        </p>
      ) : null}

      <SubmitActionArea submitLabel={mode === "create" ? "Save Daily Report" : "Save Changes"} loading={pending} />
    </form>
  );
}
