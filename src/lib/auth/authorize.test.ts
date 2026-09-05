// @vitest-environment node
import { describe, expect, it, vi, beforeEach } from "vitest";
import { PERMISSIONS } from "./permissions";

const findManyMock = vi.fn();

// vi.mock calls are hoisted above imports by Vitest, so authorize.ts picks
// up this mocked prisma client when it's imported below.
vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    userPermission: {
      findMany: (...args: unknown[]) => findManyMock(...args),
    },
  },
}));

import { can, requirePermission, getEffectivePermissions, AuthorizationError } from "./authorize";

beforeEach(() => {
  findManyMock.mockReset();
  findManyMock.mockResolvedValue([]);
});

describe("can", () => {
  it("always allows SUPER_ADMIN without querying overrides", async () => {
    const allowed = await can({ id: "u1", role: "SUPER_ADMIN" }, PERMISSIONS.ADMIN_USERS_MANAGE);
    expect(allowed).toBe(true);
    expect(findManyMock).not.toHaveBeenCalled();
  });

  it("denies a permission not in the role's default set", async () => {
    const allowed = await can({ id: "u2", role: "OPERATOR" }, PERMISSIONS.INVOICE_MANAGE);
    expect(allowed).toBe(false);
  });

  it("allows a permission granted individually via UserPermission override", async () => {
    findManyMock.mockResolvedValueOnce([
      { permission: PERMISSIONS.CUSTOMER_FINANCIAL_EDIT, granted: true },
    ]);
    const allowed = await can({ id: "u3", role: "ACCOUNTANT" }, PERMISSIONS.CUSTOMER_FINANCIAL_EDIT);
    expect(allowed).toBe(true);
  });

  it("revokes a role-granted permission when overridden with granted: false", async () => {
    findManyMock.mockResolvedValueOnce([{ permission: PERMISSIONS.INVOICE_MANAGE, granted: false }]);
    const allowed = await can({ id: "u4", role: "ACCOUNTANT" }, PERMISSIONS.INVOICE_MANAGE);
    expect(allowed).toBe(false);
  });
});

describe("requirePermission", () => {
  it("throws AuthorizationError for an unauthenticated user", async () => {
    await expect(requirePermission(null, PERMISSIONS.DASHBOARD_VIEW)).rejects.toThrow(AuthorizationError);
  });

  it("throws AuthorizationError when the user lacks the permission", async () => {
    await expect(
      requirePermission({ id: "u5", role: "OPERATOR" }, PERMISSIONS.ADMIN_SETTINGS_MANAGE),
    ).rejects.toThrow(AuthorizationError);
  });

  it("resolves without throwing when the user has the permission", async () => {
    await expect(
      requirePermission({ id: "u6", role: "OPERATOR" }, PERMISSIONS.DAILY_LOG_CREATE),
    ).resolves.toBeUndefined();
  });
});

describe("getEffectivePermissions", () => {
  it("combines role defaults with individual overrides", async () => {
    findManyMock.mockResolvedValueOnce([{ permission: PERMISSIONS.CUSTOMER_FINANCIAL_EDIT, granted: true }]);
    const permissions = await getEffectivePermissions({ id: "u7", role: "MANAGER" });
    expect(permissions.has(PERMISSIONS.CUSTOMER_FINANCIAL_EDIT)).toBe(true);
    expect(permissions.has(PERMISSIONS.VEHICLE_VIEW)).toBe(true);
  });
});
