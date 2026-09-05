"use client";

import * as React from "react";
import { ArchiveRestore, Archive } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerTrigger, DrawerClose } from "@/components/ui/drawer";
import { useActionForm } from "@/lib/hooks/use-action-form";
import { archiveCustomer, restoreCustomer } from "@/lib/actions/customers";

export function CustomerArchiveControl({ customerId, isArchived }: { customerId: string; isArchived: boolean }) {
  const [open, setOpen] = React.useState(false);
  const { run, pending } = useActionForm(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars -- signature must accept the hook's void input
    (_input: void) => (isArchived ? restoreCustomer(customerId) : archiveCustomer(customerId)),
    { onSuccess: () => setOpen(false) },
  );

  if (isArchived) {
    return (
      <Button type="button" variant="outline" onClick={() => run()} disabled={pending}>
        <ArchiveRestore /> Restore Customer
      </Button>
    );
  }

  return (
    <Drawer open={open} onOpenChange={setOpen}>
      <DrawerTrigger asChild>
        <Button type="button" variant="outline" className="text-destructive hover:text-destructive">
          <Archive /> Archive Customer
        </Button>
      </DrawerTrigger>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>Archive this customer?</DrawerTitle>
        </DrawerHeader>
        <p className="px-1 text-sm text-muted-foreground">
          Their full history (projects, invoices, payments) is kept — they will just be hidden from the active
          customer list. You can restore them at any time.
        </p>
        <div className="mt-4 flex flex-col gap-2">
          <Button type="button" variant="destructive" onClick={() => run()} disabled={pending}>
            {pending ? "Archiving…" : "Archive Customer"}
          </Button>
          <DrawerClose asChild>
            <Button type="button" variant="outline">
              Cancel
            </Button>
          </DrawerClose>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
