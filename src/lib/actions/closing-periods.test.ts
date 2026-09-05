// @vitest-environment node
import { describe, expect, it, vi, beforeEach } from "vitest";

const closingPeriodFindFirstMock = vi.fn();
const closingPeriodUpsertMock = vi.fn();
const closingPeriodUpdateManyMock = vi.fn();
const requireCurrentUserWithPermissionMock = vi.fn();
const recordAuditMock = vi.fn();
const getClosingChecklistCountsMock = vi.fn();

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    closingPeriod: {
      findFirst: (...args: unknown[]) => closingPeriodFindFirstMock(...args),
      upsert: (...args: unknown[]) => closingPeriodUpsertMock(...args),
      updateMany: (...args: unknown[]) => closingPeriodUpdateManyMock(...args),
    },
  },
}));
vi.mock("@/lib/auth/current-user", () => ({
  requireCurrentUserWithPermission: (...args: unknown[]) => requireCurrentUserWithPermissionMock(...args),
}));
vi.mock("@/lib/audit/audit", () => ({ recordAudit: (...args: unknown[]) => recordAuditMock(...args) }));
vi.mock("@/lib/data/closing-queries", () => ({
  getClosingChecklistCounts: (...args: unknown[]) => getClosingChecklistCountsMock(...args),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { getOrCreateClosingPeriod, markPeriodInReview, closeMonth, reopenMonth } from "./closing-periods";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { AuthorizationError } from "@/lib/auth/authorize";

const MANAGER = { id: "mgr-1", companyId: "company-1", role: "MANAGER", name: "Manager", email: "manager@svcranes.dev" };

const CLEAN_COUNTS = {
  flaggedDailyLogCount: 0,
  missingDailyLogVehicleCount: 0,
  pendingExpenseCount: 0,
  missingExpenseReceiptCount: 0,
  fuelAnomalyCount: 0,
  missingFuelReceiptCount: 0,
  projectsMissingBillingConfigCount: 0,
  unfinalizedBillingDraftCount: 0,
  draftInvoiceCount: 0,
};

const OPEN_PERIOD = {
  id: "period-1",
  companyId: "company-1",
  year: 2026,
  month: 3,
  startDate: new Date("2026-03-01"),
  endDate: new Date("2026-03-31T23:59:59.999Z"),
  status: "OPEN",
};

beforeEach(() => {
  closingPeriodFindFirstMock.mockReset();
  closingPeriodUpsertMock.mockReset();
  closingPeriodUpdateManyMock.mockReset();
  requireCurrentUserWithPermissionMock.mockReset().mockResolvedValue(MANAGER);
  recordAuditMock.mockReset().mockResolvedValue(undefined);
  getClosingChecklistCountsMock.mockReset().mockResolvedValue(CLEAN_COUNTS);
});

describe("getOrCreateClosingPeriod", () => {
  it("upserts scoped to the caller's own company", async () => {
    closingPeriodUpsertMock.mockResolvedValue({ id: "period-1" });

    const result = await getOrCreateClosingPeriod({ year: 2026, month: 3 });

    expect(result.success).toBe(true);
    expect(result.data).toEqual({ id: "period-1" });
    expect(closingPeriodUpsertMock).toHaveBeenCalledWith(
      expect.objectContaining({ where: { companyId_year_month: { companyId: "company-1", year: 2026, month: 3 } } }),
    );
  });
});

describe("markPeriodInReview", () => {
  it("moves an OPEN period to REVIEW and audits it", async () => {
    closingPeriodFindFirstMock.mockResolvedValue(OPEN_PERIOD);
    closingPeriodUpdateManyMock.mockResolvedValue({ count: 1 });

    const result = await markPeriodInReview("period-1");

    expect(result.success).toBe(true);
    expect(closingPeriodUpdateManyMock).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "period-1", status: "OPEN" }, data: { status: "REVIEW" } }),
    );
    expect(recordAuditMock).toHaveBeenCalledWith(expect.objectContaining({ action: "closingPeriod.review_started" }));
  });

  it("refuses a period that is not OPEN", async () => {
    closingPeriodFindFirstMock.mockResolvedValue({ ...OPEN_PERIOD, status: "CLOSED" });

    const result = await markPeriodInReview("period-1");

    expect(result.success).toBe(false);
    expect(closingPeriodUpdateManyMock).not.toHaveBeenCalled();
  });

  it("returns not-found for a period id scoped to another company", async () => {
    closingPeriodFindFirstMock.mockResolvedValue(null);

    const result = await markPeriodInReview("someone-elses-period");

    expect(result.success).toBe(false);
    expect(result.message).toMatch(/not found/i);
  });
});

describe("closeMonth", () => {
  it("blocks closing when critical blockers remain, even with a reason supplied", async () => {
    closingPeriodFindFirstMock.mockResolvedValue(OPEN_PERIOD);
    getClosingChecklistCountsMock.mockResolvedValue({ ...CLEAN_COUNTS, flaggedDailyLogCount: 2 });

    const result = await closeMonth({ periodId: "period-1", overrideReason: "please close anyway" });

    expect(result.success).toBe(false);
    expect(result.message).toMatch(/blocker/i);
    expect(closingPeriodUpdateManyMock).not.toHaveBeenCalled();
  });

  it("closes a clean month with no blockers or warnings", async () => {
    closingPeriodFindFirstMock.mockResolvedValue(OPEN_PERIOD);
    getClosingChecklistCountsMock.mockResolvedValue(CLEAN_COUNTS);
    closingPeriodUpdateManyMock.mockResolvedValue({ count: 1 });

    const result = await closeMonth({ periodId: "period-1" });

    expect(result.success).toBe(true);
    expect(closingPeriodUpdateManyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "period-1", status: "OPEN" },
        data: expect.objectContaining({ status: "CLOSED", closedById: "mgr-1", overrideReason: null }),
      }),
    );
    expect(recordAuditMock).toHaveBeenCalledWith(expect.objectContaining({ action: "closingPeriod.closed" }));
    // No warnings, so no override-audit entry should be recorded.
    expect(recordAuditMock).not.toHaveBeenCalledWith(expect.objectContaining({ action: "closingPeriod.validation_overridden" }));
  });

  it("requires a reason when warnings remain, and records an override audit entry when one is given", async () => {
    closingPeriodFindFirstMock.mockResolvedValue(OPEN_PERIOD);
    getClosingChecklistCountsMock.mockResolvedValue({ ...CLEAN_COUNTS, pendingExpenseCount: 3 });

    const withoutReason = await closeMonth({ periodId: "period-1" });
    expect(withoutReason.success).toBe(false);
    expect(closingPeriodUpdateManyMock).not.toHaveBeenCalled();

    closingPeriodUpdateManyMock.mockResolvedValue({ count: 1 });
    const withReason = await closeMonth({ periodId: "period-1", overrideReason: "Month-end sign-off, pending expenses accepted" });

    expect(withReason.success).toBe(true);
    expect(recordAuditMock).toHaveBeenCalledWith(
      expect.objectContaining({ action: "closingPeriod.validation_overridden", reason: "Month-end sign-off, pending expenses accepted" }),
    );
  });

  it("rejects a concurrent close race (status changed between read and write)", async () => {
    closingPeriodFindFirstMock.mockResolvedValue(OPEN_PERIOD);
    getClosingChecklistCountsMock.mockResolvedValue(CLEAN_COUNTS);
    closingPeriodUpdateManyMock.mockResolvedValue({ count: 0 });

    const result = await closeMonth({ periodId: "period-1" });

    expect(result.success).toBe(false);
    expect(result.message).toMatch(/retry/i);
  });

  it("refuses to close a month that is already CLOSED", async () => {
    closingPeriodFindFirstMock.mockResolvedValue({ ...OPEN_PERIOD, status: "CLOSED" });

    const result = await closeMonth({ periodId: "period-1" });

    expect(result.success).toBe(false);
    expect(closingPeriodUpdateManyMock).not.toHaveBeenCalled();
  });

  it("returns not-found for a period id scoped to another company (IDOR)", async () => {
    closingPeriodFindFirstMock.mockResolvedValue(null);

    const result = await closeMonth({ periodId: "forged-id-from-another-company" });

    expect(result.success).toBe(false);
    expect(result.message).toMatch(/not found/i);
  });
});

describe("reopenMonth", () => {
  it("requires the dedicated CLOSING_REOPEN permission, not CLOSING_MANAGE", async () => {
    closingPeriodFindFirstMock.mockResolvedValue({ ...OPEN_PERIOD, status: "CLOSED" });
    closingPeriodUpdateManyMock.mockResolvedValue({ count: 1 });

    await reopenMonth({ periodId: "period-1", reason: "Customer disputed an invoice, correcting source records" });

    expect(requireCurrentUserWithPermissionMock).toHaveBeenCalledWith(PERMISSIONS.CLOSING_REOPEN);
  });

  it("propagates an authorization failure when the actor lacks CLOSING_REOPEN", async () => {
    requireCurrentUserWithPermissionMock.mockRejectedValue(new AuthorizationError());

    const result = await reopenMonth({ periodId: "period-1", reason: "Some reason" });

    expect(result.success).toBe(false);
    expect(closingPeriodUpdateManyMock).not.toHaveBeenCalled();
  });

  it("rejects a missing/blank reason before touching the database", async () => {
    const result = await reopenMonth({ periodId: "period-1", reason: "   " });

    expect(result.success).toBe(false);
    expect(closingPeriodFindFirstMock).not.toHaveBeenCalled();
    expect(closingPeriodUpdateManyMock).not.toHaveBeenCalled();
  });

  it("refuses to reopen a period that is not CLOSED", async () => {
    closingPeriodFindFirstMock.mockResolvedValue({ ...OPEN_PERIOD, status: "OPEN" });

    const result = await reopenMonth({ periodId: "period-1", reason: "Some reason" });

    expect(result.success).toBe(false);
    expect(closingPeriodUpdateManyMock).not.toHaveBeenCalled();
  });

  it("reopens a CLOSED period, sets REOPENED, and audits it with the reason", async () => {
    closingPeriodFindFirstMock.mockResolvedValue({ ...OPEN_PERIOD, status: "CLOSED" });
    closingPeriodUpdateManyMock.mockResolvedValue({ count: 1 });

    const result = await reopenMonth({ periodId: "period-1", reason: "Customer disputed an invoice amount" });

    expect(result.success).toBe(true);
    expect(closingPeriodUpdateManyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "period-1", status: "CLOSED" },
        data: expect.objectContaining({ status: "REOPENED", reopenedById: "mgr-1", reopenReason: "Customer disputed an invoice amount" }),
      }),
    );
    expect(recordAuditMock).toHaveBeenCalledWith(
      expect.objectContaining({ action: "closingPeriod.reopened", reason: "Customer disputed an invoice amount" }),
    );
  });

  it("rejects a concurrent reopen race", async () => {
    closingPeriodFindFirstMock.mockResolvedValue({ ...OPEN_PERIOD, status: "CLOSED" });
    closingPeriodUpdateManyMock.mockResolvedValue({ count: 0 });

    const result = await reopenMonth({ periodId: "period-1", reason: "Some reason" });

    expect(result.success).toBe(false);
  });

  it("returns not-found for a period id scoped to another company (IDOR)", async () => {
    closingPeriodFindFirstMock.mockResolvedValue(null);

    const result = await reopenMonth({ periodId: "forged-id", reason: "Some reason" });

    expect(result.success).toBe(false);
    expect(result.message).toMatch(/not found/i);
  });
});
