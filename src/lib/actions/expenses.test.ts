// @vitest-environment node
import { describe, expect, it, vi, beforeEach } from "vitest";

const expenseFindFirstMock = vi.fn();
const expenseUpdateManyMock = vi.fn();
const userPermissionFindManyMock = vi.fn();
const requireCurrentUserWithPermissionMock = vi.fn();

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    expense: {
      findFirst: (...args: unknown[]) => expenseFindFirstMock(...args),
      updateMany: (...args: unknown[]) => expenseUpdateManyMock(...args),
    },
    userPermission: { findMany: (...args: unknown[]) => userPermissionFindManyMock(...args) },
  },
}));

vi.mock("@/lib/auth/current-user", () => ({
  requireCurrentUserWithPermission: (...args: unknown[]) => requireCurrentUserWithPermissionMock(...args),
  requireCurrentUser: vi.fn(),
}));

vi.mock("@/lib/audit/audit", () => ({ recordAudit: vi.fn().mockResolvedValue(undefined) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { reviewExpense } from "./expenses";

const MANAGER = { id: "manager-1", companyId: "company-1", role: "MANAGER", name: "Manager", email: "manager@svcranes.dev" };

beforeEach(() => {
  expenseFindFirstMock.mockReset();
  expenseUpdateManyMock.mockReset();
  userPermissionFindManyMock.mockReset().mockResolvedValue([]);
  requireCurrentUserWithPermissionMock.mockReset().mockResolvedValue(MANAGER);
});

describe("reviewExpense — double-approval prevention", () => {
  it("approves a genuinely pending expense", async () => {
    expenseFindFirstMock.mockResolvedValue({ id: "expense-1", status: "PENDING" });
    expenseUpdateManyMock.mockResolvedValue({ count: 1 });

    const result = await reviewExpense({ expenseId: "expense-1", decision: "APPROVED" });

    expect(result.success).toBe(true);
    // The atomic guard re-asserts PENDING in the same UPDATE, not just in
    // an earlier read.
    expect(expenseUpdateManyMock).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ id: "expense-1", status: "PENDING" }) }),
    );
  });

  it("rejects a second, concurrent review attempt on the same expense", async () => {
    // The friendly pre-check still sees PENDING (it raced with another
    // reviewer's request)...
    expenseFindFirstMock.mockResolvedValue({ id: "expense-1", status: "PENDING" });
    // ...but by the time the atomic updateMany runs, the other reviewer's
    // request already flipped the row, so the WHERE (id, status: PENDING)
    // matches zero rows. This is the real safety net, not the pre-check.
    expenseUpdateManyMock.mockResolvedValue({ count: 0 });

    const result = await reviewExpense({ expenseId: "expense-1", decision: "REJECTED", reviewNote: "no receipt" });

    expect(result.success).toBe(false);
    expect(result.message).toMatch(/already reviewed/i);
  });

  it("refuses to review an expense that is already approved (fast-path check)", async () => {
    expenseFindFirstMock.mockResolvedValue({ id: "expense-1", status: "APPROVED" });

    const result = await reviewExpense({ expenseId: "expense-1", decision: "REJECTED", reviewNote: "changed my mind" });

    expect(result.success).toBe(false);
    expect(expenseUpdateManyMock).not.toHaveBeenCalled();
  });

  it("requires a reason to reject", async () => {
    expenseFindFirstMock.mockResolvedValue({ id: "expense-1", status: "PENDING" });

    const result = await reviewExpense({ expenseId: "expense-1", decision: "REJECTED" });

    expect(result.success).toBe(false);
    expect(expenseUpdateManyMock).not.toHaveBeenCalled();
  });
});
