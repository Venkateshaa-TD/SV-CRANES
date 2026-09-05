"use client";

import * as React from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export interface FilterOption {
  value: string;
  label: string;
}

export interface FilterDef {
  paramKey: string;
  label: string;
  options: FilterOption[];
  /** Falls back to "All" when unset. */
  allLabel?: string;
}

interface ListFilterBarProps {
  searchParamKey?: string;
  searchPlaceholder?: string;
  filters?: FilterDef[];
  hideSearch?: boolean;
}

/**
 * Search box + dropdown filters that drive server-side filtering entirely
 * through the URL — the list page itself stays a plain Server Component
 * reading `searchParams`. Debounces text search; filter selects apply
 * immediately. Resets to page 1 on any change.
 */
export function ListFilterBar({
  searchParamKey = "q",
  searchPlaceholder = "Search…",
  filters = [],
  hideSearch = false,
}: ListFilterBarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [searchValue, setSearchValue] = React.useState(searchParams.get(searchParamKey) ?? "");
  const debounceRef = React.useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  function pushParams(updates: Record<string, string | undefined>) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(updates)) {
      if (value && value !== "all") params.set(key, value);
      else params.delete(key);
    }
    params.delete("page");
    router.push(`${pathname}?${params.toString()}`);
  }

  function handleSearchChange(value: string) {
    setSearchValue(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => pushParams({ [searchParamKey]: value }), 350);
  }

  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
      {hideSearch ? null : (
        <div className="relative flex-1 sm:max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input
            type="search"
            placeholder={searchPlaceholder}
            value={searchValue}
            onChange={(e) => handleSearchChange(e.target.value)}
            className="pl-9"
            aria-label={searchPlaceholder}
          />
        </div>
      )}
      {filters.map((filter) => (
        <Select
          key={filter.paramKey}
          value={searchParams.get(filter.paramKey) ?? "all"}
          onValueChange={(value) => pushParams({ [filter.paramKey]: value })}
        >
          <SelectTrigger className="sm:w-44" aria-label={filter.label}>
            <SelectValue placeholder={filter.label} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{filter.allLabel ?? `All ${filter.label}`}</SelectItem>
            {filter.options.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ))}
    </div>
  );
}
