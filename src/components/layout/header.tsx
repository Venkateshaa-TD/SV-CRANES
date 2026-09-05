import Link from "next/link";
import { Bell, Truck } from "lucide-react";
import { UserMenu } from "./user-menu";

interface HeaderProps {
  name: string;
  email: string;
  role: string;
  showNotifications: boolean;
}

/** Sticky top bar. On mobile it also carries the brand mark since the
 * sidebar (which normally shows it) is hidden below md. */
export function Header({ name, email, role, showNotifications }: HeaderProps) {
  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-border bg-background/95 px-4 backdrop-blur md:h-16 md:px-6">
      <Link href="/dashboard" className="flex items-center gap-2 md:hidden">
        <div className="flex size-7 items-center justify-center rounded-md bg-primary text-primary-foreground">
          <Truck className="size-3.5" aria-hidden="true" />
        </div>
        <span className="text-sm font-semibold text-foreground">FleetView</span>
      </Link>

      <div className="ml-auto flex items-center gap-1">
        {showNotifications ? (
          <Link
            href="/notifications"
            aria-label="Notifications"
            className="flex size-11 items-center justify-center rounded-full text-muted-foreground hover:bg-accent hover:text-accent-foreground"
          >
            <Bell className="size-5" aria-hidden="true" />
          </Link>
        ) : null}
        <UserMenu name={name} email={email} role={role} />
      </div>
    </header>
  );
}
