// @vitest-environment node
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

const vehicleFindManyMock = vi.fn();
const dailyLogFindManyMock = vi.fn();
const dailyLogCountMock = vi.fn();
const expenseCountMock = vi.fn();
const fuelEntryFindManyMock = vi.fn();
const fuelEntryCountMock = vi.fn();
const projectCountMock = vi.fn();
const billingDraftCountMock = vi.fn();
const invoiceCountMock = vi.fn();

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    vehicle: { findMany: (...args: unknown[]) => vehicleFindManyMock(...args) },
    dailyLog: {
      findMany: (...args: unknown[]) => dailyLogFindManyMock(...args),
      count: (...args: unknown[]) => dailyLogCountMock(...args),
    },
    expense: { count: (...args: unknown[]) => expenseCountMock(...args) },
    fuelEntry: {
      findMany: (...args: unknown[]) => fuelEntryFindManyMock(...args),
      count: (...args: unknown[]) => fuelEntryCountMock(...args),
    },
    project: { count: (...args: unknown[]) => projectCountMock(...args) },
    billingDraft: { count: (...args: unknown[]) => billingDraftCountMock(...args) },
    invoice: { count: (...args: unknown[]) => invoiceCountMock(...args) },
  },
}));

import { getClosingChecklistCounts } from "./closing-queries";

const COMPANY_A = "company-a";

beforeEach(() => {
  vehicleFindManyMock.mockReset().mockResolvedValue([{ id: "vehicle-1" }]);
  dailyLogFindManyMock.mockReset();
  dailyLogCountMock.mockReset().mockResolvedValue(0);
  expenseCountMock.mockReset().mockResolvedValue(0);
  fuelEntryFindManyMock.mockReset().mockResolvedValue([]);
  fuelEntryCountMock.mockReset().mockResolvedValue(0);
  projectCountMock.mockReset().mockResolvedValue(0);
  billingDraftCountMock.mockReset().mockResolvedValue(0);
  invoiceCountMock.mockReset().mockResolvedValue(0);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("missing-daily-log cutoff — Asia/Kolkata business day, not UTC", () => {
  const marchRange = { startDate: new Date("2026-03-01T00:00:00.000Z"), endDate: new Date("2026-03-31T23:59:59.999Z") };

  it("requires a log for the IST-current day even while the UTC calendar date is still the day before", async () => {
    // 2026-03-01T20:00:00Z is 2026-03-02 01:30 IST — the IST business day
    // has already rolled over to March 2nd, even though UTC still reads
    // March 1st. A vehicle logged for March 1st but not March 2nd must be
    // flagged as missing a log for the (IST) current day.
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-01T20:00:00.000Z"));

    dailyLogFindManyMock.mockResolvedValue([{ vehicleId: "vehicle-1", logDate: new Date("2026-03-01T00:00:00.000Z") }]);

    const counts = await getClosingChecklistCounts(COMPANY_A, marchRange);

    expect(counts.missingDailyLogVehicleCount).toBe(1);
  });

  it("does not require a log for a day that hasn't started yet in IST", async () => {
    // 2026-03-01T10:00:00Z is 2026-03-01 15:30 IST — still March 1st in
    // both zones. Only March 1st should be required; the vehicle has
    // logged it, so nothing should be flagged as missing.
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-01T10:00:00.000Z"));

    dailyLogFindManyMock.mockResolvedValue([{ vehicleId: "vehicle-1", logDate: new Date("2026-03-01T00:00:00.000Z") }]);

    const counts = await getClosingChecklistCounts(COMPANY_A, marchRange);

    expect(counts.missingDailyLogVehicleCount).toBe(0);
  });
});
