"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { NAV_ICONS } from "./nav-icons";
import type { NavIconKey } from "@/lib/navigation";

interface NavLinkProps {
  href: string;
  label: string;
  iconKey: NavIconKey;
  onNavigate?: () => void;
  variant?: "sidebar" | "list";
}

function isActivePath(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function NavLink({ href, label, iconKey, onNavigate, variant = "sidebar" }: NavLinkProps) {
  const pathname = usePathname();
  const active = isActivePath(pathname, href);
  const Icon = NAV_ICONS[iconKey];

  return (
    <Link
      href={href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex items-center gap-3 rounded-md px-3 text-sm font-medium transition-colors",
        variant === "sidebar" ? "py-2.5" : "min-h-12 py-3",
        active
          ? "bg-sidebar-accent text-sidebar-accent-foreground"
          : "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
      )}
    >
      <Icon className="size-5 shrink-0" aria-hidden="true" />
      <span className="truncate">{label}</span>
    </Link>
  );
}
