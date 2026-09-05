"use client";

import * as React from "react";
import { useForm } from "react-hook-form";
import { Check, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerClose } from "@/components/ui/drawer";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useActionForm } from "@/lib/hooks/use-action-form";
import { reviewExpense } from "@/lib/actions/expenses";

export function ExpenseReviewActions({ expenseId }: { expenseId: string }) {
  const [rejectOpen, setRejectOpen] = React.useState(false);
  const { run: runApprove, pending: approvePending } = useActionForm(
    () => reviewExpense({ expenseId, decision: "APPROVED" }),
  );

  return (
    <>
      <div className="flex gap-2">
        <Button type="button" size="sm" variant="outline" className="flex-1 text-destructive hover:text-destructive" onClick={() => setRejectOpen(true)}>
          <X /> Reject
        </Button>
        <Button type="button" size="sm" className="flex-1" onClick={() => runApprove()} disabled={approvePending}>
          <Check /> Approve
        </Button>
      </div>
      <RejectDrawer expenseId={expenseId} open={rejectOpen} onOpenChange={setRejectOpen} />
    </>
  );
}

function RejectDrawer({ expenseId, open, onOpenChange }: { expenseId: string; open: boolean; onOpenChange: (open: boolean) => void }) {
  const { register, handleSubmit, reset, formState: { errors } } = useForm<{ reviewNote: string }>({ defaultValues: { reviewNote: "" } });
  const { run, pending, fieldErrors, formError } = useActionForm(
    (input: { reviewNote: string }) => reviewExpense({ expenseId, decision: "REJECTED", reviewNote: input.reviewNote }),
    {
      onSuccess: () => {
        reset();
        onOpenChange(false);
      },
    },
  );

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>Reject expense</DrawerTitle>
        </DrawerHeader>
        <form onSubmit={handleSubmit((values) => run(values))} noValidate className="space-y-4 px-1 pb-2">
          <div className="space-y-1.5">
            <Label htmlFor="reviewNote">
              Reason <span className="text-destructive">*</span>
            </Label>
            <Textarea
              id="reviewNote"
              required
              aria-invalid={!!(errors.reviewNote || fieldErrors.reviewNote)}
              {...register("reviewNote", { required: "A reason is required to reject an expense." })}
            />
            {(errors.reviewNote?.message ?? fieldErrors.reviewNote) ? (
              <p role="alert" className="text-xs font-medium text-destructive">
                {errors.reviewNote?.message ?? fieldErrors.reviewNote}
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
                Cancel
              </Button>
            </DrawerClose>
            <Button type="submit" variant="destructive" disabled={pending}>
              {pending ? "Rejecting…" : "Reject Expense"}
            </Button>
          </div>
        </form>
      </DrawerContent>
    </Drawer>
  );
}
