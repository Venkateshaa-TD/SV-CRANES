"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface CustomerOption {
  id: string;
  name: string;
}

export function CustomerPicker({ customerOptions }: { customerOptions: CustomerOption[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function onChange(customerId: string) {
    const params = new URLSearchParams();
    params.set("customerId", customerId);
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <Select value={searchParams.get("customerId") ?? undefined} onValueChange={onChange}>
      <SelectTrigger className="sm:w-72" aria-label="Customer">
        <SelectValue placeholder="Select a customer" />
      </SelectTrigger>
      <SelectContent>
        {customerOptions.map((c) => (
          <SelectItem key={c.id} value={c.id}>
            {c.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
