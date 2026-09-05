"use server";

import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/db/prisma";
import { requireCurrentUserWithPermission } from "@/lib/auth/current-user";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { recordAudit } from "@/lib/audit/audit";
import { setUserPermissionOverrideSchema } from "@/lib/validation/user-permission";
import { ok, toActionError, type ActionResult } from "./action-result";

/**
 * Grants or revokes an individual permission override for a user — the
 * UI surface for the "~3 trusted users" CUSTOMER_FINANCIAL_EDIT
 * requirement, without hardcoding names or user counts. Layered on top
 * of the existing UserPermission override architecture (see
 * src/lib/auth/authorize.ts#getEffectivePermissions); no new permission
 * plumbing needed.
 */
export async function setUserPermissionOverride(input: unknown): Promise<ActionResult> {
  try {
    const actor = await requireCurrentUserWithPermission(PERMISSIONS.ADMIN_USERS_MANAGE);
    const data = setUserPermissionOverrideSchema.parse(input);

    const user = await prisma.user.findFirst({ where: { id: data.userId, companyId: actor.companyId } });
    if (!user) return { success: false, message: "User not found." };

    await prisma.userPermission.upsert({
      where: { userId_permission: { userId: user.id, permission: data.permission } },
      create: { userId: user.id, permission: data.permission, granted: data.granted, reason: data.reason ?? null, createdById: actor.id },
      update: { granted: data.granted, reason: data.reason ?? null, createdById: actor.id },
    });

    await recordAudit({
      companyId: actor.companyId,
      actorId: actor.id,
      action: data.granted ? "userPermission.granted" : "userPermission.revoked",
      entityType: "User",
      entityId: user.id,
      reason: data.reason ?? null,
      afterValue: { permission: data.permission, granted: data.granted },
    });

    revalidatePath(`/admin/users/${user.id}/edit`);
    return ok(data.granted ? "Permission granted." : "Permission revoked.");
  } catch (error) {
    return toActionError(error);
  }
}
