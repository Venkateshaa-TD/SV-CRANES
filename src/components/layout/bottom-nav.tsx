"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { NAV_ICONS } from "./nav-icons";
import type { NavItem, NavGroup, NavIconKey } from "@/lib/navigation";
import { MoreDrawer } from "./more-drawer";

interface BottomNavProps {
  primaryItems: NavItem[];
  moreGroups: NavGroup[];
}

function BottomNavLink({ href, label, iconKey }: { href: string; label: string; iconKey: NavIconKey }) {
  const pathname = usePathname();
  const active = pathname === href || pathname.startsWith(`${href}/`);
  const Icon = NAV_ICONS[iconKey];

  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex flex-1 flex-col items-center justify-center gap-0.5 py-2 text-[11px] font-medium",
        active ? "text-primary" : "text-muted-foreground",
      )}
    >
      <Icon className={cn("size-5", active && "text-primary")} aria-hidden="true" />
      <span className="truncate">{label}</span>
    </Link>
  );
}

/**
 * Fixed bottom navigation for phones: the ≤4 most-used destinations plus a
 * "More" entry that opens a bottom drawer with everything else, grouped and
 * already filtered to what this user is permitted to see. Hidden at md+
 * where the sidebar takes over.
 */
export function BottomNav({ primaryItems, moreGroups }: BottomNavProps) {
  const hasMore = moreGroups.some((group) => group.items.length > 0);
  const MoreIcon = NAV_ICONS.more;

  return (
    <nav
      aria-label="Primary"
      className="safe-bottom fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 backdrop-blur md:hidden"
    >
      <div className="mx-auto flex max-w-lg items-stretch">
        {primaryItems.map((item) => (
          <BottomNavLink key={item.href} href={item.href} label={item.label} iconKey={item.iconKey} />
        ))}
        {hasMore ? (
          <MoreDrawer groups={moreGroups}>
            <button
              type="button"
              className="flex flex-1 flex-col items-center justify-center gap-0.5 py-2 text-[11px] font-medium text-muted-foreground"
            >
              <MoreIcon className="size-5" aria-hidden="true" />
              <span>More</span>
            </button>
          </MoreDrawer>
        ) : null}
      </div>
    </nav>
  );
}
