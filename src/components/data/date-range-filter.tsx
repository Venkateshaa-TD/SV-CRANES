"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface DateRangeFilterProps {
  fromParam?: string;
  toParam?: string;
}

/** Two native date inputs driving `from`/`to` URL search params — server
 * component list pages read these directly, no client state to sync. */
export function DateRangeFilter({ fromParam = "from", toParam = "to" }: DateRangeFilterProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function update(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set(key, value);
    else params.delete(key);
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
      <div className="flex min-w-0 items-center gap-1.5">
        <Label htmlFor="date-from" className="shrink-0 text-xs text-muted-foreground">
          From
        </Label>
        <Input
          id="date-from"
          type="date"
          className="h-9 min-w-0 flex-1 text-sm"
          defaultValue={searchParams.get(fromParam) ?? ""}
          onChange={(e) => update(fromParam, e.target.value)}
        />
      </div>
      <div className="flex min-w-0 items-center gap-1.5">
        <Label htmlFor="date-to" className="shrink-0 text-xs text-muted-foreground">
          To
        </Label>
        <Input
          id="date-to"
          type="date"
          className="h-9 min-w-0 flex-1 text-sm"
          defaultValue={searchParams.get(toParam) ?? ""}
          onChange={(e) => update(toParam, e.target.value)}
        />
      </div>
    </div>
  );
}
