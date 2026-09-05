import "server-only";
import { cache } from "react";

import { auth } from "@/lib/auth/auth";
import { prisma } from "@/lib/db/prisma";
import { can, requirePermission, type AuthorizableUser } from "@/lib/auth/authorize";
import type { Permission } from "@/lib/auth/permissions";

export type CurrentUser = AuthorizableUser & {
  companyId: string;
  name: string;
  email: string;
};

/**
 * Reads the current session on the server AND re-validates it against the
 * live User row. Sessions are JWTs (see src/lib/auth/auth.ts) — the token
 * itself keeps working, unmodified, for its whole lifetime regardless of
 * what happens to the account afterward, so without this check a
 * deactivated employee or a role change (e.g. revoking VEHICLE_MANAGE)
 * would not take effect until the token naturally expired. This runs on
 * every call, in the Node runtime only (Server Components / Server
 * Actions) — deliberately NOT hooked into the shared Auth.js `session`
 * callback, since that also runs from the Edge-runtime `proxy.ts`
 * middleware, where a Prisma/Postgres call is not available. Wrapped in
 * `React.cache` so multiple calls within one request/render pass reuse a
 * single DB round trip instead of one per caller.
 *
 * Returns null when signed out, deactivated, archived, or the account no
 * longer exists — callers decide whether that's an error
 * (requireCurrentUser) or a valid state (public/marketing pages, login
 * page).
 */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const session = await auth();
  if (!session?.user) return null;

  const record = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, companyId: true, role: true, name: true, email: true, isActive: true, archivedAt: true },
  });
  if (!record || !record.isActive || record.archivedAt) return null;

  return {
    id: record.id,
    companyId: record.companyId,
    role: record.role,
    name: record.name,
    email: record.email,
  };
});

/** Use in server components/actions that must not run unauthenticated. */
export async function requireCurrentUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) {
    throw new Error("UNAUTHENTICATED");
  }
  return user;
}

/** Convenience wrapper: loads the current user and asserts a permission in
 * one call, for use at the top of server actions. */
export async function requireCurrentUserWithPermission(
  permission: Permission,
): Promise<CurrentUser> {
  const user = await requireCurrentUser();
  await requirePermission(user, permission);
  return user;
}

export { can };
