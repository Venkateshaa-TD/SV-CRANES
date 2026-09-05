import Link from "next/link";
import { cn } from "@/lib/utils";

export interface UrlTabDef {
  key: string;
  label: string;
}

interface UrlTabsProps {
  tabs: UrlTabDef[];
  activeKey: string;
  basePath: string;
  paramName?: string;
}

/**
 * Server-rendered tab strip driven entirely by a URL search param — no
 * client JS, so it works identically with JS disabled and never causes a
 * hydration flash. Horizontally scrollable so it never overflows on a
 * narrow phone screen.
 */
export function UrlTabs({ tabs, activeKey, basePath, paramName = "tab" }: UrlTabsProps) {
  return (
    <div role="tablist" className="no-scrollbar mb-4 flex gap-1 overflow-x-auto border-b border-border">
      {tabs.map((tab) => {
        const isActive = tab.key === activeKey;
        const href = tab.key === tabs[0].key ? basePath : `${basePath}?${paramName}=${tab.key}`;
        return (
          <Link
            key={tab.key}
            href={href}
            role="tab"
            aria-selected={isActive}
            className={cn(
              "shrink-0 whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-medium transition-colors",
              isActive
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </div>
  );
}
