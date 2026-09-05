import { Truck } from "lucide-react";
import { NavLink } from "./nav-link";
import type { NavGroup } from "@/lib/navigation";

interface SidebarProps {
  groups: NavGroup[];
  companyName: string;
}

/** Desktop/tablet navigation (md and up). Mobile uses BottomNav + More
 * drawer instead — this is never forced onto a phone screen. */
export function Sidebar({ groups, companyName }: SidebarProps) {
  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-sidebar-border bg-sidebar md:flex">
      <div className="flex h-16 items-center gap-2 border-b border-sidebar-border px-5">
        <div className="flex size-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
          <Truck className="size-4" aria-hidden="true" />
        </div>
        <span className="truncate text-sm font-semibold text-sidebar-foreground">{companyName}</span>
      </div>
      <nav aria-label="Primary" className="flex-1 space-y-5 overflow-y-auto px-3 py-4">
        {groups.map((group) => (
          <div key={group.label}>
            <p className="px-3 pb-1 text-xs font-semibold uppercase tracking-wide text-sidebar-foreground/50">
              {group.label}
            </p>
            <div className="space-y-0.5">
              {group.items.map((item) => (
                <NavLink key={item.href} href={item.href} label={item.label} iconKey={item.iconKey} />
              ))}
            </div>
          </div>
        ))}
      </nav>
    </aside>
  );
}
