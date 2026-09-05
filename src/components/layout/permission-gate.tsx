import { requireCurrentUser } from "@/lib/auth/current-user";
import { can } from "@/lib/auth/authorize";
import { ForbiddenState } from "@/components/shared/forbidden-state";
import type { Permission } from "@/lib/auth/permissions";

interface PermissionGateProps {
  permission: Permission;
  children: React.ReactNode;
}

/**
 * Wrap a page's content with the permission it requires. This is the
 * server-side check that actually matters — the nav already hides links
 * the user can't use, but a hidden link is not access control, so every
 * route re-asserts its own permission here regardless of how it was
 * reached.
 */
export async function PermissionGate({ permission, children }: PermissionGateProps) {
  const user = await requireCurrentUser();
  const allowed = await can(user, permission);
  if (!allowed) {
    return <ForbiddenState />;
  }
  return <>{children}</>;
}
