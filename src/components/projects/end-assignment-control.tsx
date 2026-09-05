"use client";

import * as React from "react";
import { useForm } from "react-hook-form";
import { CalendarOff } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerClose } from "@/components/ui/drawer";
import { DateInput } from "@/components/forms/date-input";
import { useActionForm } from "@/lib/hooks/use-action-form";
import { endVehicleAssignment } from "@/lib/actions/project-vehicle-assignments";

export function EndAssignmentControl({ assignmentId }: { assignmentId: string }) {
  const [open, setOpen] = React.useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<{ assignedTo: string }>({ defaultValues: { assignedTo: "" } });

  const { run, pending, fieldErrors, formError } = useActionForm(
    (input: { assignmentId: string; assignedTo: string }) => endVehicleAssignment(input),
    { onSuccess: () => setOpen(false) },
  );

  return (
    <Drawer open={open} onOpenChange={setOpen}>
      <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(true)}>
        <CalendarOff /> End Assignment
      </Button>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>End this vehicle assignment</DrawerTitle>
        </DrawerHeader>
        <form onSubmit={handleSubmit((values) => run({ assignmentId, ...values }))} noValidate className="space-y-4 px-1 pb-2">
          <DateInput
            id="assignmentEndDate"
            label="End Date"
            required
            error={errors.assignedTo?.message ?? fieldErrors.assignedTo}
            {...register("assignedTo", { required: "End date is required" })}
          />
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
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : "End Assignment"}
            </Button>
          </div>
        </form>
      </DrawerContent>
    </Drawer>
  );
}
