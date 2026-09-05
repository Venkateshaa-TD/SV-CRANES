"use client";

import * as React from "react";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerTrigger } from "@/components/ui/drawer";
import { NavLink } from "./nav-link";
import type { NavGroup } from "@/lib/navigation";

interface MoreDrawerProps {
  groups: NavGroup[];
  children: React.ReactNode;
}

/** Bottom sheet listing every secondary navigation destination, grouped
 * the same way as the desktop sidebar. Chosen over a full-screen modal or
 * a separate page so it stays fast to open/close with one thumb. */
export function MoreDrawer({ groups, children }: MoreDrawerProps) {
  const [open, setOpen] = React.useState(false);

  return (
    <Drawer open={open} onOpenChange={setOpen}>
      <DrawerTrigger asChild>{children}</DrawerTrigger>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>More</DrawerTitle>
        </DrawerHeader>
        <div className="space-y-4 pb-2">
          {groups.map((group) => (
            <div key={group.label}>
              <p className="px-3 pb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {group.label}
              </p>
              <div className="space-y-0.5">
                {group.items.map((item) => (
                  <NavLink
                    key={item.href}
                    href={item.href}
                    label={item.label}
                    iconKey={item.iconKey}
                    variant="list"
                    onNavigate={() => setOpen(false)}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      </DrawerContent>
    </Drawer>
  );
}
