// @vitest-environment node
/**
 * End-to-end (mocked-Prisma) confirmation that every mutation path this
 * task lists — Daily Log, Fuel, Expense, Invoice, Payment — actually
 * calls the real assertPeriodNotLocked (src/lib/data/period-lock.ts)
 * before writing, and is rejected server-side when the target month is
 * CLOSED. The actor is SUPER_ADMIN throughout, deliberately: the lock is
 * documented as never bypassed for any role — reopening the period is
 * the only sanctioned way past it — so this also proves that claim.
 * period-lock.ts itself is NOT mocked here (see period-lock.test.ts for
 * its own isolated unit tests); only prisma.closingPeriod is mocked, so
 * the real lock logic runs against a synthetic CLOSED period.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";

const vehicleFindFirstMock = vi.fn();
const projectFindFirstMock = vi.fn();
const customerFindFirstMock = vi.fn();
const expenseCategoryFindFirstMock = vi.fn();
const closingPeriodFindFirstMock = vi.fn();
const dailyLogCreateMock = vi.fn();
const dailyLogFindFirstMock = vi.fn();
const fuelEntryCreateMock = vi.fn();
const expenseCreateMock = vi.fn();
const paymentCreateMock = vi.fn();
const transactionMock = vi.fn();
const recordAuditMock = vi.fn();
const requireCurrentUserMock = vi.fn();
const requireCurrentUserWithPermissionMock = vi.fn();

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    vehicle: { findFirst: (...args: unknown[]) => vehicleFindFirstMock(...args) },
    project: { findFirst: (...args: unknown[]) => projectFindFirstMock(...args) },
    customer: { findFirst: (...args: unknown[]) => customerFindFirstMock(...args) },
    expenseCategory: { findFirst: (...args: unknown[]) => expenseCategoryFindFirstMock(...args) },
    closingPeriod: { findFirst: (...args: unknown[]) => closingPeriodFindFirstMock(...args) },
    dailyLog: {
      create: (...args: unknown[]) => dailyLogCreateMock(...args),
      findFirst: (...args: unknown[]) => dailyLogFindFirstMock(...args),
    },
    fuelEntry: { create: (...args: unknown[]) => fuelEntryCreateMock(...args) },
    expense: { create: (...args: unknown[]) => expenseCreateMock(...args) },
    payment: { create: (...args: unknown[]) => paymentCreateMock(...args) },
    $transaction: (...args: unknown[]) => transactionMock(...args),
  },
}));
vi.mock("@/lib/auth/current-user", () => ({
  requireCurrentUser: (...args: unknown[]) => requireCurrentUserMock(...args),
  requireCurrentUserWithPermission: (...args: unknown[]) => requireCurrentUserWithPermissionMock(...args),
}));
vi.mock("@/lib/audit/audit", () => ({ recordAudit: (...args: unknown[]) => recordAuditMock(...args) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { createDailyLog, updateDailyLog } from "./daily-logs";
import { createFuelEntry } from "./fuel";
import { submitExpense } from "./expenses";
import { createManualInvoice } from "./invoices";
import { createPayment } from "./payments";

const SUPER_ADMIN = { id: "root-1", companyId: "company-1", role: "SUPER_ADMIN", name: "Root", email: "root@svcranes.dev" };
// Safely in the past regardless of the real system clock, so
// isAfterBusinessToday (checked by createDailyLog) never rejects it as a
// future-dated log.
const CLOSED_PERIOD = { id: "period-1", status: "CLOSED", year: 2020, month: 3 };
const IN_PERIOD_DATE = "2020-03-15";

beforeEach(() => {
  vehicleFindFirstMock.mockReset().mockResolvedValue({ id: "vehicle-1", currentHourMeter: null, currentOdometer: null });
  projectFindFirstMock.mockReset();
  customerFindFirstMock.mockReset().mockResolvedValue({ id: "customer-1" });
  expenseCategoryFindFirstMock.mockReset().mockResolvedValue({ id: "category-1" });
  closingPeriodFindFirstMock.mockReset().mockResolvedValue(CLOSED_PERIOD);
  dailyLogCreateMock.mockReset();
  dailyLogFindFirstMock.mockReset();
  fuelEntryCreateMock.mockReset();
  expenseCreateMock.mockReset();
  paymentCreateMock.mockReset();
  transactionMock.mockReset();
  recordAuditMock.mockReset().mockResolvedValue(undefined);
  requireCurrentUserMock.mockReset().mockResolvedValue(SUPER_ADMIN);
  requireCurrentUserWithPermissionMock.mockReset().mockResolvedValue(SUPER_ADMIN);
});

describe("closed-period lock enforcement — server-side, per module", () => {
  it("rejects creating a Daily Log dated inside a CLOSED month", async () => {
    const result = await createDailyLog({
      logDate: IN_PERIOD_DATE,
      vehicleId: "vehicle-1",
      startHourMeter: "10",
      endHourMeter: "12",
      startOdometer: "100",
      endOdometer: "110",
    });

    expect(result.success).toBe(false);
    expect(result.message).toMatch(/closed for editing/i);
    expect(transactionMock).not.toHaveBeenCalled();
    expect(dailyLogCreateMock).not.toHaveBeenCalled();
  });

  it("rejects editing an existing Daily Log that already sits in a CLOSED month", async () => {
    dailyLogFindFirstMock.mockResolvedValue({
      id: "log-1",
      vehicleId: "vehicle-1",
      operatorId: SUPER_ADMIN.id,
      createdById: SUPER_ADMIN.id,
      logDate: new Date(IN_PERIOD_DATE),
      createdAt: new Date(IN_PERIOD_DATE),
    });

    const result = await updateDailyLog("log-1", {
      logDate: IN_PERIOD_DATE,
      vehicleId: "vehicle-1",
      startHourMeter: "10",
      endHourMeter: "12",
      startOdometer: "100",
      endOdometer: "110",
    });

    expect(result.success).toBe(false);
    expect(result.message).toMatch(/closed for editing/i);
    expect(transactionMock).not.toHaveBeenCalled();
  });

  it("rejects creating a Fuel entry dated inside a CLOSED month", async () => {
    const result = await createFuelEntry({
      vehicleId: "vehicle-1",
      entryDate: IN_PERIOD_DATE,
      fuelType: "DIESEL",
      quantityLiters: "50",
      ratePerLiter: "90",
    });

    expect(result.success).toBe(false);
    expect(result.message).toMatch(/closed for editing/i);
    expect(fuelEntryCreateMock).not.toHaveBeenCalled();
  });

  it("rejects submitting an Expense dated inside a CLOSED month", async () => {
    const result = await submitExpense({
      expenseDate: IN_PERIOD_DATE,
      categoryId: "category-1",
      amount: "500",
    });

    expect(result.success).toBe(false);
    expect(result.message).toMatch(/closed for editing/i);
    expect(expenseCreateMock).not.toHaveBeenCalled();
  });

  it("rejects creating a manual Invoice issued inside a CLOSED month", async () => {
    const result = await createManualInvoice({
      customerId: "customer-1",
      issueDate: IN_PERIOD_DATE,
      lines: [{ description: "Crane hire", quantity: "1", unitPrice: "10000" }],
    });

    expect(result.success).toBe(false);
    expect(result.message).toMatch(/closed for editing/i);
    expect(transactionMock).not.toHaveBeenCalled();
  });

  it("rejects recording a Payment dated inside a CLOSED month", async () => {
    const result = await createPayment({
      customerId: "customer-1",
      paymentDate: IN_PERIOD_DATE,
      amount: "1000",
      method: "CASH",
    });

    expect(result.success).toBe(false);
    expect(result.message).toMatch(/closed for editing/i);
    expect(paymentCreateMock).not.toHaveBeenCalled();
  });

  it("records a locked_edit_attempt audit entry for the blocked attempt", async () => {
    await createPayment({ customerId: "customer-1", paymentDate: IN_PERIOD_DATE, amount: "1000", method: "CASH" });

    expect(recordAuditMock).toHaveBeenCalledWith(
      expect.objectContaining({ action: "closingPeriod.locked_edit_attempt", entityType: "Payment" }),
    );
  });

  it("allows the same mutations once the month is OPEN again (reopened)", async () => {
    closingPeriodFindFirstMock.mockResolvedValue({ ...CLOSED_PERIOD, status: "REOPENED" });
    paymentCreateMock.mockResolvedValue({ id: "payment-1", customerId: "customer-1", amount: { toString: () => "1000" } });

    const result = await createPayment({ customerId: "customer-1", paymentDate: IN_PERIOD_DATE, amount: "1000", method: "CASH" });

    expect(result.success).toBe(true);
    expect(paymentCreateMock).toHaveBeenCalled();
  });
});
