"use client";

import * as React from "react";
import { useForm } from "react-hook-form";
import { Check, Send, Ban } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerClose } from "@/components/ui/drawer";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useActionForm } from "@/lib/hooks/use-action-form";
import { approveInvoice, markInvoiceSent, cancelInvoice } from "@/lib/actions/invoices";
import type { InvoiceStatus } from "@prisma/client";

export function InvoiceStatusActions({
  invoiceId,
  status,
  canManageInvoice,
  canCancel,
}: {
  invoiceId: string;
  status: InvoiceStatus;
  canManageInvoice: boolean;
  canCancel: boolean;
}) {
  const [cancelOpen, setCancelOpen] = React.useState(false);
  const { run: runApprove, pending: approvePending } = useActionForm(() => approveInvoice(invoiceId));
  const { run: runSend, pending: sendPending } = useActionForm(() => markInvoiceSent(invoiceId));

  // Cancelling requires both INVOICE_MANAGE and CUSTOMER_FINANCIAL_EDIT
  // server-side (see cancelInvoice) — a user with only one of the two
  // would have the request rejected anyway, so don't show a button that
  // can only fail.
  const showCancel = canManageInvoice && canCancel && status !== "CANCELLED" && status !== "PAID";

  return (
    <div className="flex flex-wrap gap-2">
      {status === "DRAFT" && canManageInvoice ? (
        <Button type="button" onClick={() => runApprove()} disabled={approvePending}>
          <Check /> Approve Invoice
        </Button>
      ) : null}
      {status === "APPROVED" && canManageInvoice ? (
        <Button type="button" variant="outline" onClick={() => runSend()} disabled={sendPending}>
          <Send /> Mark as Sent
        </Button>
      ) : null}
      {showCancel ? (
        <Button type="button" variant="outline" className="text-destructive hover:text-destructive" onClick={() => setCancelOpen(true)}>
          <Ban /> Cancel Invoice
        </Button>
      ) : null}
      <CancelInvoiceDrawer invoiceId={invoiceId} open={cancelOpen} onOpenChange={setCancelOpen} />
    </div>
  );
}

function CancelInvoiceDrawer({ invoiceId, open, onOpenChange }: { invoiceId: string; open: boolean; onOpenChange: (open: boolean) => void }) {
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<{ reason: string }>({ defaultValues: { reason: "" } });
  const { run, pending, fieldErrors, formError } = useActionForm(
    (input: { reason: string }) => cancelInvoice({ invoiceId, reason: input.reason }),
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
          <DrawerTitle>Cancel this invoice?</DrawerTitle>
        </DrawerHeader>
        <form onSubmit={handleSubmit((values) => run(values))} noValidate className="space-y-4 px-1 pb-2">
          <p className="text-sm text-muted-foreground">
            This is the controlled correction workflow — the invoice is voided, never silently edited. Any existing payment
            allocations must be removed first.
          </p>
          <div className="space-y-1.5">
            <Label htmlFor="cancelReason">
              Reason <span className="text-destructive">*</span>
            </Label>
            <Textarea
              id="cancelReason"
              required
              aria-invalid={!!(errors.reason || fieldErrors.reason)}
              {...register("reason", { required: "A reason is required to cancel an invoice." })}
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
                Keep Invoice
              </Button>
            </DrawerClose>
            <Button type="submit" variant="destructive" disabled={pending}>
              {pending ? "Cancelling…" : "Cancel Invoice"}
            </Button>
          </div>
        </form>
      </DrawerContent>
    </Drawer>
  );
}
