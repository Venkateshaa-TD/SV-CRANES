import "server-only";

import { prisma } from "@/lib/db/prisma";
import { ROLE_PERMISSIONS, type Permission } from "@/lib/auth/permissions";
import type { UserRole } from "@prisma/client";

export class AuthorizationError extends Error {
  constructor(message = "You do not have permission to perform this action.") {
    super(message);
    this.name = "AuthorizationError";
  }
}

export interface AuthorizableUser {
  id: string;
  role: UserRole;
}

/**
 * Resolves the effective permission set for a user: role defaults, plus any
 * individual UserPermission grants, minus any individual revokes. This is
 * the single place override logic lives — nothing else should special-case
 * a user by id or role.
 */
export async function getEffectivePermissions(
  user: AuthorizableUser,
): Promise<Set<Permission>> {
  const rolePermissions = new Set<Permission>(ROLE_PERMISSIONS[user.role]);

  const overrides = await prisma.userPermission.findMany({
    where: { userId: user.id },
    select: { permission: true, granted: true },
  });

  for (const override of overrides) {
    if (override.granted) {
      rolePermissions.add(override.permission as Permission);
    } else {
      rolePermissions.delete(override.permission as Permission);
    }
  }

  return rolePermissions;
}

/** Non-throwing permission check. Prefer this in UI code that needs to
 * conditionally render (e.g. hiding a nav item). */
export async function can(
  user: AuthorizableUser,
  permission: Permission,
): Promise<boolean> {
  if (user.role === "SUPER_ADMIN") return true;
  const permissions = await getEffectivePermissions(user);
  return permissions.has(permission);
}

/**
 * Throws AuthorizationError if the user lacks the permission. Call this at
 * the top of every server action / route handler that performs a sensitive
 * operation — never rely on the client having hidden the triggering button.
 */
export async function requirePermission(
  user: AuthorizableUser | null | undefined,
  permission: Permission,
): Promise<void> {
  if (!user) {
    throw new AuthorizationError("You must be signed in to do that.");
  }
  const allowed = await can(user, permission);
  if (!allowed) {
    throw new AuthorizationError();
  }
}
