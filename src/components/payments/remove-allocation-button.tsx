"use client";

import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useActionForm } from "@/lib/hooks/use-action-form";
import { removeAllocation } from "@/lib/actions/payment-allocations";

export function RemoveAllocationButton({ allocationId }: { allocationId: string }) {
  const { run, pending } = useActionForm(() => removeAllocation({ allocationId }));
  return (
    <Button type="button" variant="ghost" size="icon" onClick={() => run()} disabled={pending} aria-label="Remove allocation">
      <X />
    </Button>
  );
}
