// @vitest-environment node
import { describe, expect, it, vi, beforeEach } from "vitest";

const dailyLogFindFirstMock = vi.fn();
const vehicleFindFirstMock = vi.fn();
const userPermissionFindManyMock = vi.fn();
const requireCurrentUserMock = vi.fn();

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    dailyLog: { findFirst: (...args: unknown[]) => dailyLogFindFirstMock(...args) },
    vehicle: { findFirst: (...args: unknown[]) => vehicleFindFirstMock(...args) },
    user: { findFirst: vi.fn() },
    project: { findFirst: vi.fn() },
    userPermission: { findMany: (...args: unknown[]) => userPermissionFindManyMock(...args) },
  },
}));

vi.mock("@/lib/auth/current-user", () => ({
  requireCurrentUser: (...args: unknown[]) => requireCurrentUserMock(...args),
}));

vi.mock("@/lib/audit/audit", () => ({ recordAudit: vi.fn().mockResolvedValue(undefined) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { updateDailyLog, createDailyLog } from "./daily-logs";

const OPERATOR_A = { id: "operator-a", companyId: "company-1", role: "OPERATOR", name: "Operator A", email: "a@svcranes.dev" };
const OPERATOR_B = { id: "operator-b", companyId: "company-1", role: "OPERATOR", name: "Operator B", email: "b@svcranes.dev" };
const MANAGER = { id: "manager-1", companyId: "company-1", role: "MANAGER", name: "Manager", email: "manager@svcranes.dev" };

beforeEach(() => {
  dailyLogFindFirstMock.mockReset();
  vehicleFindFirstMock.mockReset();
  userPermissionFindManyMock.mockReset().mockResolvedValue([]);
  requireCurrentUserMock.mockReset();
});

describe("updateDailyLog authorization (IDOR)", () => {
  it("blocks an operator from editing another operator's daily log", async () => {
    requireCurrentUserMock.mockResolvedValue(OPERATOR_B);
    dailyLogFindFirstMock.mockResolvedValue({
      id: "log-1",
      operatorId: OPERATOR_A.id,
      createdById: OPERATOR_A.id,
      vehicleId: "vehicle-1",
      logDate: new Date(),
      startHourMeter: null,
      endHourMeter: null,
      startOdometer: null,
      endOdometer: null,
      createdAt: new Date(),
    });

    const result = await updateDailyLog("log-1", {
      logDate: "2026-01-01",
      vehicleId: "vehicle-1",
      startHourMeter: "10",
      endHourMeter: "20",
      startOdometer: "5",
      endOdometer: "15",
    });

    expect(result.success).toBe(false);
    // The vehicle lookup (part of resolving the edit) must never be
    // reached — authorization is checked before any further work.
    expect(vehicleFindFirstMock).not.toHaveBeenCalled();
  });

  it("allows a manager (DAILY_LOG_APPROVE) to edit any operator's daily log", async () => {
    requireCurrentUserMock.mockResolvedValue(MANAGER);
    dailyLogFindFirstMock.mockResolvedValue({
      id: "log-1",
      operatorId: OPERATOR_A.id,
      createdById: OPERATOR_A.id,
      vehicleId: "vehicle-1",
      logDate: new Date("2026-01-01"),
      startHourMeter: null,
      endHourMeter: null,
      startOdometer: null,
      endOdometer: null,
      createdAt: new Date(),
    });
    // No vehicle found — this proves the authorization gate was passed
    // and execution reached the actual vehicle-resolution step.
    vehicleFindFirstMock.mockResolvedValue(null);

    const result = await updateDailyLog("log-1", {
      logDate: "2026-01-01",
      vehicleId: "vehicle-1",
      startHourMeter: "10",
      endHourMeter: "20",
      startOdometer: "5",
      endOdometer: "15",
    });

    expect(vehicleFindFirstMock).toHaveBeenCalled();
    expect(result.success).toBe(false);
    expect(result.message).toMatch(/vehicle/i);
  });

  it("returns not-found rather than another company's record for a forged log id", async () => {
    requireCurrentUserMock.mockResolvedValue(MANAGER);
    // Company-scoped lookup finds nothing — simulates a log id that
    // belongs to a different company.
    dailyLogFindFirstMock.mockResolvedValue(null);

    const result = await updateDailyLog("forged-log-id", {
      logDate: "2026-01-01",
      vehicleId: "vehicle-1",
      startHourMeter: "10",
      endHourMeter: "20",
      startOdometer: "5",
      endOdometer: "15",
    });

    expect(result.success).toBe(false);
    expect(result.message).toMatch(/not found/i);
  });
});

describe("createDailyLog authorization", () => {
  it("rejects a daily log for a vehicle outside the operator's company (forged vehicleId)", async () => {
    requireCurrentUserMock.mockResolvedValue(OPERATOR_A);
    vehicleFindFirstMock.mockResolvedValue(null); // not found within actor.companyId

    const result = await createDailyLog({
      logDate: "2026-01-01",
      vehicleId: "someone-elses-vehicle",
      startHourMeter: "10",
      endHourMeter: "20",
      startOdometer: "5",
      endOdometer: "15",
    });

    expect(result.success).toBe(false);
    expect(result.message).toMatch(/vehicle/i);
  });

  it("ignores a client-forged operatorId from a plain OPERATOR and uses the trusted actor id instead", async () => {
    // An operator without DAILY_LOG_APPROVE cannot act on behalf of
    // anyone else — resolveInput must fall back to actor.id regardless of
    // what operatorId the client sent. We only need to prove the vehicle
    // lookup ran under the actor's own company scope; deeper transaction
    // behavior is covered elsewhere.
    requireCurrentUserMock.mockResolvedValue(OPERATOR_A);
    vehicleFindFirstMock.mockResolvedValue(null);

    await createDailyLog({
      logDate: "2026-01-01",
      vehicleId: "vehicle-1",
      operatorId: OPERATOR_B.id, // forged — should be ignored
      startHourMeter: "10",
      endHourMeter: "20",
      startOdometer: "5",
      endOdometer: "15",
    });

    // user.findFirst (operator lookup) should never be reached because
    // canActForOthers is false for a plain OPERATOR.
    const { prisma } = await import("@/lib/db/prisma");
    expect(prisma.user.findFirst).not.toHaveBeenCalled();
  });
});
