import { NAV_GROUPS, getPrimaryNavItems } from "@/lib/navigation";
import { getEffectivePermissions } from "@/lib/auth/authorize";
import type { CurrentUser } from "@/lib/auth/current-user";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { Sidebar } from "./sidebar";
import { Header } from "./header";
import { BottomNav } from "./bottom-nav";

interface AppShellProps {
  user: CurrentUser;
  children: React.ReactNode;
}

const COMPANY_NAME = "FleetView";

/**
 * The authenticated application shell: desktop sidebar, mobile bottom nav
 * + More drawer, and the sticky header — all filtered to the signed-in
 * user's permissions here, once, server-side. Every route under (app)
 * renders inside this.
 */
export async function AppShell({ user, children }: AppShellProps) {
  const permissions = await getEffectivePermissions(user);

  const permittedGroups = NAV_GROUPS.map((group) => ({
    ...group,
    items: group.items.filter((item) => permissions.has(item.permission)),
  })).filter((group) => group.items.length > 0);

  const primaryItems = getPrimaryNavItems().filter((item) => permissions.has(item.permission));
  const primaryHrefs = new Set(primaryItems.map((item) => item.href));
  const moreGroups = permittedGroups
    .map((group) => ({ ...group, items: group.items.filter((item) => !primaryHrefs.has(item.href)) }))
    .filter((group) => group.items.length > 0);

  return (
    <div className="min-h-dvh bg-background">
      <Sidebar groups={permittedGroups} companyName={COMPANY_NAME} />
      <div className="flex min-h-dvh flex-col md:pl-64">
        <Header
          name={user.name}
          email={user.email}
          role={user.role}
          showNotifications={permissions.has(PERMISSIONS.NOTIFICATION_VIEW)}
        />
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-4 pb-24 sm:px-6 md:pb-8 md:pt-6">{children}</main>
      </div>
      <BottomNav primaryItems={primaryItems} moreGroups={moreGroups} />
    </div>
  );
}
