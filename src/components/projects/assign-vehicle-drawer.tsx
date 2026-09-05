"use client";

import * as React from "react";
import { useForm } from "react-hook-form";
import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerClose } from "@/components/ui/drawer";
import { SelectInput } from "@/components/forms/select-input";
import { DateInput } from "@/components/forms/date-input";
import { TextInput } from "@/components/forms/text-input";
import { useActionForm } from "@/lib/hooks/use-action-form";
import { assignVehicleToProject } from "@/lib/actions/project-vehicle-assignments";
import type { ProjectVehicleAssignmentFormInput } from "@/lib/validation/project";

interface VehicleOption {
  id: string;
  name: string;
  code: string | null;
  registrationNumber: string;
  currentlyAssigned: boolean;
}

export function AssignVehicleDrawer({ projectId, vehicleOptions }: { projectId: string; vehicleOptions: VehicleOption[] }) {
  const [open, setOpen] = React.useState(false);
  const [vehicleId, setVehicleId] = React.useState("");
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<Pick<ProjectVehicleAssignmentFormInput, "assignedFrom" | "assignedTo" | "notes">>({
    defaultValues: { assignedFrom: "", assignedTo: "", notes: "" },
  });

  const { run, pending, fieldErrors, formError } = useActionForm(
    (input: ProjectVehicleAssignmentFormInput) => assignVehicleToProject(projectId, input),
    {
      onSuccess: () => {
        reset();
        setVehicleId("");
        setOpen(false);
      },
    },
  );

  function onSubmit(values: Pick<ProjectVehicleAssignmentFormInput, "assignedFrom" | "assignedTo" | "notes">) {
    run({ ...values, vehicleId });
  }

  return (
    <Drawer open={open} onOpenChange={setOpen}>
      <Button type="button" size="sm" onClick={() => setOpen(true)}>
        <Plus /> Assign Vehicle
      </Button>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>Assign a vehicle to this project</DrawerTitle>
        </DrawerHeader>
        <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4 px-1 pb-2">
          <SelectInput
            id="assignVehicleId"
            label="Vehicle"
            required
            value={vehicleId}
            onValueChange={setVehicleId}
            error={fieldErrors.vehicleId}
            options={vehicleOptions.map((v) => ({
              value: v.id,
              label: `${v.name} (${v.registrationNumber})${v.currentlyAssigned ? " — currently assigned elsewhere" : ""}`,
            }))}
          />
          <DateInput
            id="assignedFrom"
            label="From"
            required
            error={errors.assignedFrom?.message ?? fieldErrors.assignedFrom}
            {...register("assignedFrom", { required: "Start date is required" })}
          />
          <DateInput id="assignedTo" label="To" hint="Leave blank while ongoing" error={fieldErrors.assignedTo} {...register("assignedTo")} />
          <TextInput id="assignmentNotes" label="Notes" error={fieldErrors.notes} {...register("notes")} />
          {formError ? (
            <p role="alert" className="text-sm font-medium text-destructive">
              {formError}
            </p>
          ) : null}
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <DrawerClose asChild>
              <Button type="button" variant="outline">
                Cancel
              </Button>
            </DrawerClose>
            <Button type="submit" disabled={pending || !vehicleId}>
              {pending ? "Assigning…" : "Assign Vehicle"}
            </Button>
          </div>
        </form>
      </DrawerContent>
    </Drawer>
  );
}
