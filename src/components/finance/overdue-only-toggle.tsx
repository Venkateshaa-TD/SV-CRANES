"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

/** A single boolean filter toggle that preserves every other active
 * search param (customer, date range, etc.) — a plain relative-query
 * <Link href="?overdue=1"> would silently drop them. */
export function OverdueOnlyToggle() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const active = searchParams.get("overdue") === "1";

  function toggle() {
    const params = new URLSearchParams(searchParams.toString());
    if (active) params.delete("overdue");
    else params.set("overdue", "1");
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <button
      type="button"
      onClick={toggle}
      className={cn(
        "inline-flex h-9 items-center rounded-md border px-3 text-sm font-medium transition-colors",
        active ? "border-primary bg-primary/10 text-primary" : "border-input text-foreground hover:bg-accent",
      )}
      aria-pressed={active}
    >
      Overdue only
    </button>
  );
}
