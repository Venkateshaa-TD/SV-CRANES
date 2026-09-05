"use client";

import * as React from "react";
import { useForm } from "react-hook-form";
import { Check, X, RefreshCw, Send, FileText } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerClose } from "@/components/ui/drawer";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useActionForm } from "@/lib/hooks/use-action-form";
import { submitBillingDraftForReview, recalculateBillingDraft, reviewBillingDraft, generateInvoiceFromBillingDraft } from "@/lib/actions/billing-drafts";
import type { BillingDraftStatus } from "@prisma/client";

export function BillingDraftActions({ billingDraftId, status, canManageBilling, canManageInvoice }: { billingDraftId: string; status: BillingDraftStatus; canManageBilling: boolean; canManageInvoice: boolean }) {
  const [rejectOpen, setRejectOpen] = React.useState(false);

  const { run: runRecalculate, pending: recalculatePending } = useActionForm(() => recalculateBillingDraft(billingDraftId));
  const { run: runSubmit, pending: submitPending } = useActionForm(() => submitBillingDraftForReview(billingDraftId));
  const { run: runApprove, pending: approvePending } = useActionForm(() => reviewBillingDraft({ billingDraftId, decision: "APPROVED" }));
  const { run: runInvoice, pending: invoicePending } = useActionForm(
    () => generateInvoiceFromBillingDraft(billingDraftId),
    { redirectTo: (data) => (data ? `/finance/invoices/${data.id}` : "/finance/invoices") },
  );

  if (status === "DRAFT" && canManageBilling) {
    return (
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" onClick={() => runRecalculate()} disabled={recalculatePending}>
          <RefreshCw /> Recalculate
        </Button>
        <Button type="button" onClick={() => runSubmit()} disabled={submitPending}>
          <Send /> Submit for Review
        </Button>
      </div>
    );
  }

  if (status === "REVIEW" && canManageBilling) {
    return (
      <>
        <div className="flex gap-2">
          <Button type="button" variant="outline" className="flex-1 text-destructive hover:text-destructive" onClick={() => setRejectOpen(true)}>
            <X /> Reject
          </Button>
          <Button type="button" className="flex-1" onClick={() => runApprove()} disabled={approvePending}>
            <Check /> Approve
          </Button>
        </div>
        <RejectDrawer billingDraftId={billingDraftId} open={rejectOpen} onOpenChange={setRejectOpen} />
      </>
    );
  }

  if (status === "APPROVED" && canManageInvoice) {
    return (
      <Button type="button" onClick={() => runInvoice()} disabled={invoicePending}>
        <FileText /> {invoicePending ? "Generating…" : "Generate Invoice"}
      </Button>
    );
  }

  return null;
}

function RejectDrawer({ billingDraftId, open, onOpenChange }: { billingDraftId: string; open: boolean; onOpenChange: (open: boolean) => void }) {
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<{ reviewNote: string }>({ defaultValues: { reviewNote: "" } });
  const { run, pending, fieldErrors, formError } = useActionForm(
    (input: { reviewNote: string }) => reviewBillingDraft({ billingDraftId, decision: "REJECTED", reviewNote: input.reviewNote }),
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
          <DrawerTitle>Reject billing draft</DrawerTitle>
        </DrawerHeader>
        <form onSubmit={handleSubmit((values) => run(values))} noValidate className="space-y-4 px-1 pb-2">
          <div className="space-y-1.5">
            <Label htmlFor="billingReviewNote">
              Reason <span className="text-destructive">*</span>
            </Label>
            <Textarea
              id="billingReviewNote"
              required
              aria-invalid={!!(errors.reviewNote || fieldErrors.reviewNote)}
              {...register("reviewNote", { required: "A reason is required to reject a billing draft." })}
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
              {pending ? "Rejecting…" : "Reject Draft"}
            </Button>
          </div>
        </form>
      </DrawerContent>
    </Drawer>
  );
}
