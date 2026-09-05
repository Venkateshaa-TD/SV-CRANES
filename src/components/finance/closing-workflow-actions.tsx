"use client";

import * as React from "react";
import { useForm } from "react-hook-form";
import { ClipboardCheck, Lock, LockOpen } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerClose } from "@/components/ui/drawer";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useActionForm } from "@/lib/hooks/use-action-form";
import { markPeriodInReview, closeMonth, reopenMonth } from "@/lib/actions/closing-periods";
import type { ClosingPeriodStatus } from "@prisma/client";

interface ClosingWorkflowActionsProps {
  periodId: string;
  status: ClosingPeriodStatus;
  blockerCount: number;
  warningCount: number;
  canManage: boolean;
  canReopen: boolean;
}

/** Select Month -> Validate -> Resolve Issues -> Review -> Final
 * Validation -> Close Month, plus the separate, explicit Reopen path.
 * The checklist counts shown here always come from the page's own fresh
 * server-side read; closeMonth/reopenMonth re-validate everything again
 * atomically server-side regardless, so a stale client view can never
 * force a bad close — it can only make the drawer's summary look wrong
 * until the user retries. */
export function ClosingWorkflowActions({ periodId, status, blockerCount, warningCount, canManage, canReopen }: ClosingWorkflowActionsProps) {
  const [closeOpen, setCloseOpen] = React.useState(false);
  const [reopenOpen, setReopenOpen] = React.useState(false);
  const { run: runReview, pending: reviewPending } = useActionForm(() => markPeriodInReview(periodId));

  const canStartReview = status === "OPEN" && canManage;
  const canAttemptClose = canManage && (status === "OPEN" || status === "REVIEW" || status === "REOPENED");
  const canAttemptReopen = status === "CLOSED" && canReopen;

  if (!canStartReview && !canAttemptClose && !canAttemptReopen) return null;

  return (
    <div className="flex flex-wrap gap-2">
      {canStartReview ? (
        <Button type="button" variant="outline" onClick={() => runReview()} disabled={reviewPending}>
          <ClipboardCheck /> Move to Review
        </Button>
      ) : null}
      {canAttemptClose ? (
        <Button type="button" onClick={() => setCloseOpen(true)}>
          <Lock /> Close Month
        </Button>
      ) : null}
      {canAttemptReopen ? (
        <Button type="button" variant="outline" onClick={() => setReopenOpen(true)}>
          <LockOpen /> Reopen Month
        </Button>
      ) : null}
      <CloseMonthDrawer periodId={periodId} open={closeOpen} onOpenChange={setCloseOpen} blockerCount={blockerCount} warningCount={warningCount} />
      <ReopenMonthDrawer periodId={periodId} open={reopenOpen} onOpenChange={setReopenOpen} />
    </div>
  );
}

function CloseMonthDrawer({
  periodId,
  open,
  onOpenChange,
  blockerCount,
  warningCount,
}: {
  periodId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  blockerCount: number;
  warningCount: number;
}) {
  const requiresReason = warningCount > 0;
  const blocked = blockerCount > 0;
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<{ overrideReason: string }>({ defaultValues: { overrideReason: "" } });
  const { run, pending, fieldErrors, formError } = useActionForm(
    (input: { overrideReason: string }) => closeMonth({ periodId, overrideReason: input.overrideReason || undefined }),
    { onSuccess: () => { reset(); onOpenChange(false); } },
  );

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>Close this month?</DrawerTitle>
        </DrawerHeader>
        <div className="space-y-4 px-1 pb-2">
          {blocked ? (
            <p role="alert" className="text-sm font-medium text-destructive">
              This month has {blockerCount} critical blocker{blockerCount === 1 ? "" : "s"}. Resolve every flagged daily log
              before it can be closed.
            </p>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">
                Once closed, Daily Logs, Fuel, Expenses, Invoices, and Payments dated in this month can no longer be edited —
                only a SUPER_ADMIN (or a user granted the reopen permission) can reopen it, with a reason.
              </p>
              {requiresReason ? (
                <form onSubmit={handleSubmit((values) => run(values))} noValidate className="space-y-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="overrideReason">
                      This month has {warningCount} outstanding warning{warningCount === 1 ? "" : "s"} — reason to close anyway{" "}
                      <span className="text-destructive">*</span>
                    </Label>
                    <Textarea
                      id="overrideReason"
                      required
                      aria-invalid={!!(errors.overrideReason || fieldErrors.overrideReason)}
                      {...register("overrideReason", { required: "A reason is required to close over outstanding warnings." })}
                    />
                    {(errors.overrideReason?.message ?? fieldErrors.overrideReason) ? (
                      <p role="alert" className="text-xs font-medium text-destructive">
                        {errors.overrideReason?.message ?? fieldErrors.overrideReason}
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
                    <Button type="submit" disabled={pending}>
                      {pending ? "Closing…" : "Close Anyway"}
                    </Button>
                  </div>
                </form>
              ) : (
                <>
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
                    <Button type="button" disabled={pending} onClick={() => run({ overrideReason: "" })}>
                      {pending ? "Closing…" : "Close Month"}
                    </Button>
                  </div>
                </>
              )}
            </>
          )}
        </div>
      </DrawerContent>
    </Drawer>
  );
}

function ReopenMonthDrawer({ periodId, open, onOpenChange }: { periodId: string; open: boolean; onOpenChange: (open: boolean) => void }) {
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<{ reason: string }>({ defaultValues: { reason: "" } });
  const { run, pending, fieldErrors, formError } = useActionForm(
    (input: { reason: string }) => reopenMonth({ periodId, reason: input.reason }),
    { onSuccess: () => { reset(); onOpenChange(false); } },
  );

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>Reopen this closed month?</DrawerTitle>
        </DrawerHeader>
        <form onSubmit={handleSubmit((values) => run(values))} noValidate className="space-y-4 px-1 pb-2">
          <p className="text-sm text-muted-foreground">
            This is a deliberate, audited exception — records dated in this month become editable again until it is closed a
            second time.
          </p>
          <div className="space-y-1.5">
            <Label htmlFor="reopenReason">
              Reason <span className="text-destructive">*</span>
            </Label>
            <Textarea
              id="reopenReason"
              required
              aria-invalid={!!(errors.reason || fieldErrors.reason)}
              {...register("reason", { required: "A reason is required to reopen a closed month." })}
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
                Keep Closed
              </Button>
            </DrawerClose>
            <Button type="submit" variant="destructive" disabled={pending}>
              {pending ? "Reopening…" : "Reopen Month"}
            </Button>
          </div>
        </form>
      </DrawerContent>
    </Drawer>
  );
}
