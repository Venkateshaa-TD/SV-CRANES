import "server-only";

import { prisma } from "@/lib/db/prisma";
import type { Prisma } from "@prisma/client";

export interface AuditEntry {
  companyId?: string | null;
  actorId?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  reason?: string | null;
  /** Prior state of the changed fields only — never the whole row, and
   * never secrets (passwords, tokens). */
  beforeValue?: Prisma.InputJsonValue | null;
  /** New state of the changed fields only. */
  afterValue?: Prisma.InputJsonValue | null;
}

const SENSITIVE_KEYS = new Set([
  "password",
  "passwordHash",
  "token",
  "secret",
  "accessToken",
  "refreshToken",
]);

function stripSensitive(value: unknown): unknown {
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(stripSensitive);
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([key]) => !SENSITIVE_KEYS.has(key))
      .map(([key, val]) => [key, stripSensitive(val)]),
  );
}

/**
 * Records a single audit entry. Call this from server actions/route
 * handlers immediately after a sensitive write succeeds — never from
 * client code. Defensively strips common secret field names from
 * before/after payloads so a careless caller can't leak credentials into
 * the log.
 */
export async function recordAudit(entry: AuditEntry): Promise<void> {
  await prisma.auditLog.create({
    data: {
      companyId: entry.companyId ?? null,
      actorId: entry.actorId ?? null,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId ?? null,
      reason: entry.reason ?? null,
      beforeValue: (stripSensitive(entry.beforeValue ?? null) ??
        undefined) as Prisma.InputJsonValue | undefined,
      afterValue: (stripSensitive(entry.afterValue ?? null) ??
        undefined) as Prisma.InputJsonValue | undefined,
    },
  });
}
