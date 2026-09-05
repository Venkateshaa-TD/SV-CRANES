"use client";

import * as React from "react";
import { useForm } from "react-hook-form";
import { ShieldCheck, ShieldOff } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerClose } from "@/components/ui/drawer";
import { TextInput } from "@/components/forms/text-input";
import { useActionForm } from "@/lib/hooks/use-action-form";
import { setUserPermissionOverride } from "@/lib/actions/user-permissions";
import { PERMISSIONS } from "@/lib/auth/permissions";

/**
 * The UI surface for the "~3 trusted users" CUSTOMER_FINANCIAL_EDIT
 * requirement — grants/revokes it as an individual UserPermission
 * override, never by role. Revoking asks for a reason for the audit
 * trail; granting is a single click since it's additive and low-risk to
 * reverse.
 */
export function FinancialPermissionToggle({ userId, granted }: { userId: string; granted: boolean }) {
  const [revokeOpen, setRevokeOpen] = React.useState(false);
  const { run: runGrant, pending: grantPending } = useActionForm(
    () => setUserPermissionOverride({ userId, permission: PERMISSIONS.CUSTOMER_FINANCIAL_EDIT, granted: true }),
  );

  return (
    <Card>
      <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-medium text-foreground">Customer Financial Edit</p>
          <p className="text-xs text-muted-foreground">
            Lets this user edit customer financial terms, correct/cancel invoices and payments, and record ledger
            adjustments — the small trusted-user override, independent of role.
          </p>
        </div>
        {granted ? (
          <Button type="button" variant="outline" className="w-fit shrink-0 text-destructive hover:text-destructive" onClick={() => setRevokeOpen(true)}>
            <ShieldOff /> Revoke
          </Button>
        ) : (
          <Button type="button" variant="outline" className="w-fit shrink-0" onClick={() => runGrant()} disabled={grantPending}>
            <ShieldCheck /> Grant
          </Button>
        )}
      </CardContent>
      <RevokeDrawer userId={userId} open={revokeOpen} onOpenChange={setRevokeOpen} />
    </Card>
  );
}

function RevokeDrawer({ userId, open, onOpenChange }: { userId: string; open: boolean; onOpenChange: (open: boolean) => void }) {
  const { register, handleSubmit, reset } = useForm<{ reason: string }>({ defaultValues: { reason: "" } });
  const { run, pending, formError } = useActionForm(
    (input: { reason: string }) => setUserPermissionOverride({ userId, permission: PERMISSIONS.CUSTOMER_FINANCIAL_EDIT, granted: false, reason: input.reason }),
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
          <DrawerTitle>Revoke Customer Financial Edit</DrawerTitle>
        </DrawerHeader>
        <form onSubmit={handleSubmit((values) => run(values))} noValidate className="space-y-4 px-1 pb-2">
          <TextInput id="revokeReason" label="Reason (optional)" {...register("reason")} />
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
              {pending ? "Revoking…" : "Revoke"}
            </Button>
          </div>
        </form>
      </DrawerContent>
    </Drawer>
  );
}
