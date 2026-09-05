"use client";

import { useRouter, usePathname } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { formatMonthYear } from "@/lib/format";

interface MonthSelectorProps {
  year: number;
  month: number;
}

/** Prev/next month navigation for the Month Closing page, driving plain
 * `year`/`month` URL search params — the page itself resolves (and
 * upserts) the ClosingPeriod row for whatever month is selected. */
export function MonthSelector({ year, month }: MonthSelectorProps) {
  const router = useRouter();
  const pathname = usePathname();

  function go(deltaMonths: number) {
    const total = year * 12 + (month - 1) + deltaMonths;
    const nextYear = Math.floor(total / 12);
    const nextMonth = (total % 12) + 1;
    router.push(`${pathname}?year=${nextYear}&month=${nextMonth}`);
  }

  return (
    <div className="flex items-center justify-between gap-2 rounded-lg border border-border bg-card p-2">
      <Button type="button" variant="ghost" size="icon" aria-label="Previous month" onClick={() => go(-1)}>
        <ChevronLeft />
      </Button>
      <p className="text-sm font-semibold text-foreground">{formatMonthYear(year, month)}</p>
      <Button type="button" variant="ghost" size="icon" aria-label="Next month" onClick={() => go(1)}>
        <ChevronRight />
      </Button>
    </div>
  );
}
