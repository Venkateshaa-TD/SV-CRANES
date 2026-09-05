// @vitest-environment node
import { describe, expect, it, vi, beforeEach } from "vitest";

const createMock = vi.fn();

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    auditLog: {
      create: (...args: unknown[]) => createMock(...args),
    },
  },
}));

import { recordAudit } from "./audit";

beforeEach(() => {
  createMock.mockReset();
  createMock.mockResolvedValue({});
});

describe("recordAudit", () => {
  it("writes an audit row for a critical action (e.g. expense approval)", async () => {
    await recordAudit({
      companyId: "company-1",
      actorId: "user-1",
      action: "expense.approved",
      entityType: "Expense",
      entityId: "expense-1",
      afterValue: { status: "APPROVED" },
    });

    expect(createMock).toHaveBeenCalledTimes(1);
    const payload = createMock.mock.calls[0][0].data;
    expect(payload.action).toBe("expense.approved");
    expect(payload.entityType).toBe("Expense");
    expect(payload.entityId).toBe("expense-1");
    expect(payload.afterValue).toEqual({ status: "APPROVED" });
  });

  it("strips password-like fields from before/after payloads", async () => {
    await recordAudit({
      companyId: "company-1",
      actorId: "admin-1",
      action: "employee.password_reset",
      entityType: "User",
      entityId: "user-2",
      beforeValue: { passwordHash: "should-never-be-logged", name: "Ajay Singh" },
      afterValue: { passwordHash: "also-should-never-be-logged", name: "Ajay Singh" },
    });

    const payload = createMock.mock.calls[0][0].data;
    expect(payload.beforeValue).not.toHaveProperty("passwordHash");
    expect(payload.afterValue).not.toHaveProperty("passwordHash");
    expect(payload.beforeValue).toEqual({ name: "Ajay Singh" });
  });
});
