// @vitest-environment node
import { describe, expect, it, vi, beforeEach } from "vitest";

const closingPeriodFindFirstMock = vi.fn();
const recordAuditMock = vi.fn();

vi.mock("@/lib/db/prisma", () => ({
  prisma: { closingPeriod: { findFirst: (...args: unknown[]) => closingPeriodFindFirstMock(...args) } },
}));
vi.mock("@/lib/audit/audit", () => ({ recordAudit: (...args: unknown[]) => recordAuditMock(...args) }));

import { assertPeriodNotLocked } from "./period-lock";
import { PeriodLockedError } from "@/lib/business/closing-period";

const COMPANY_A = "company-a";
const COMPANY_B = "company-b";

beforeEach(() => {
  closingPeriodFindFirstMock.mockReset();
  recordAuditMock.mockReset().mockResolvedValue(undefined);
});

describe("assertPeriodNotLocked", () => {
  it("allows the mutation when no ClosingPeriod row exists for the date (implicitly OPEN)", async () => {
    closingPeriodFindFirstMock.mockResolvedValue(null);

    await expect(
      assertPeriodNotLocked({ companyId: COMPANY_A, actorId: "user-1", date: new Date("2026-03-15"), entityType: "DailyLog", action: "dailyLog.create" }),
    ).resolves.toBeUndefined();
    expect(recordAuditMock).not.toHaveBeenCalled();
  });

  it.each(["OPEN", "REVIEW", "REOPENED"])("allows the mutation when the period status is %s", async (status) => {
    closingPeriodFindFirstMock.mockResolvedValue({ id: "period-1", status, year: 2026, month: 3 });

    await expect(
      assertPeriodNotLocked({ companyId: COMPANY_A, actorId: "user-1", date: new Date("2026-03-15"), entityType: "DailyLog", action: "dailyLog.create" }),
    ).resolves.toBeUndefined();
  });

  it("blocks the mutation and records an audit entry when the period is CLOSED", async () => {
    closingPeriodFindFirstMock.mockResolvedValue({ id: "period-1", status: "CLOSED", year: 2026, month: 3 });

    await expect(
      assertPeriodNotLocked({ companyId: COMPANY_A, actorId: "user-1", date: new Date("2026-03-15"), entityType: "DailyLog", entityId: "log-1", action: "dailyLog.update" }),
    ).rejects.toThrow(PeriodLockedError);

    expect(recordAuditMock).toHaveBeenCalledWith(
      expect.objectContaining({
        companyId: COMPANY_A,
        actorId: "user-1",
        action: "closingPeriod.locked_edit_attempt",
        entityType: "DailyLog",
        entityId: "log-1",
      }),
    );
  });

  it("looks up the period scoped to the caller's own company (no cross-company leakage)", async () => {
    closingPeriodFindFirstMock.mockResolvedValue(null);

    await assertPeriodNotLocked({ companyId: COMPANY_B, actorId: "user-2", date: new Date("2026-03-15"), entityType: "Invoice", action: "invoice.create" });

    expect(closingPeriodFindFirstMock).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ companyId: COMPANY_B }) }),
    );
  });
});
