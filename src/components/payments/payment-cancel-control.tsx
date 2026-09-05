"use client";

import * as React from "react";
import { useForm } from "react-hook-form";
import { Ban } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerClose } from "@/components/ui/drawer";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useActionForm } from "@/lib/hooks/use-action-form";
import { cancelPayment } from "@/lib/actions/payments";

export function PaymentCancelControl({ paymentId }: { paymentId: string }) {
  const [open, setOpen] = React.useState(false);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<{ reason: string }>({ defaultValues: { reason: "" } });
  const { run, pending, fieldErrors, formError } = useActionForm(
    (input: { reason: string }) => cancelPayment({ paymentId, reason: input.reason }),
    {
      onSuccess: () => {
        reset();
        setOpen(false);
      },
    },
  );

  return (
    <Drawer open={open} onOpenChange={setOpen}>
      <Button type="button" variant="outline" className="text-destructive hover:text-destructive" onClick={() => setOpen(true)}>
        <Ban /> Cancel Payment
      </Button>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>Cancel this payment?</DrawerTitle>
        </DrawerHeader>
        <form onSubmit={handleSubmit((values) => run(values))} noValidate className="space-y-4 px-1 pb-2">
          <p className="text-sm text-muted-foreground">
            Any invoice allocations this payment made will be reversed and each affected invoice&apos;s balance recalculated.
          </p>
          <div className="space-y-1.5">
            <Label htmlFor="cancelPaymentReason">
              Reason <span className="text-destructive">*</span>
            </Label>
            <Textarea
              id="cancelPaymentReason"
              required
              aria-invalid={!!(errors.reason || fieldErrors.reason)}
              {...register("reason", { required: "A reason is required to cancel a payment." })}
            />
            {(errors.reason?.message ?? fieldErrors.reason) ? (
              <p role="alert" className="text-xs font-medium text-destructive">
                {errors.reason?.message ?? fieldErrors.reason}
              </p>
            ) : null}
          </div>
          {formError ? (
            <p role="alert" className="text-sm font-medium text-destructive">
              {formError}
            </p>
          ) : null}
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <DrawerClose asChild>
              <Button type="button" variant="outline">
                Keep Payment
              </Button>
            </DrawerClose>
            <Button type="submit" variant="destructive" disabled={pending}>
              {pending ? "Cancelling…" : "Cancel Payment"}
            </Button>
          </div>
        </form>
      </DrawerContent>
    </Drawer>
  );
}
