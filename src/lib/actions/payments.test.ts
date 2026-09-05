// @vitest-environment node
import { describe, expect, it, vi, beforeEach } from "vitest";
import { Prisma } from "@prisma/client";

const paymentFindFirstMock = vi.fn();
const closingPeriodFindFirstMock = vi.fn();
const transactionMock = vi.fn();
const requireCurrentUserWithPermissionMock = vi.fn();
const recordAuditMock = vi.fn();

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    payment: { findFirst: (...args: unknown[]) => paymentFindFirstMock(...args) },
    closingPeriod: { findFirst: (...args: unknown[]) => closingPeriodFindFirstMock(...args) },
    $transaction: (...args: unknown[]) => transactionMock(...args),
  },
}));
vi.mock("@/lib/auth/current-user", () => ({
  requireCurrentUserWithPermission: (...args: unknown[]) => requireCurrentUserWithPermissionMock(...args),
}));
vi.mock("@/lib/audit/audit", () => ({ recordAudit: (...args: unknown[]) => recordAuditMock(...args) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { cancelPayment } from "./payments";

// SUPER_ADMIN so the real `can(actor, CUSTOMER_FINANCIAL_EDIT)` check
// (imported for real, not mocked) short-circuits true without needing a
// userPermission lookup.
const SUPER_ADMIN = { id: "root-1", companyId: "company-1", role: "SUPER_ADMIN", name: "Root", email: "root@svcranes.dev" };

const PAYMENT = {
  id: "payment-1",
  companyId: "company-1",
  customerId: "customer-1",
  amount: new Prisma.Decimal(5000),
  cancelledAt: null,
  paymentDate: new Date("2026-02-10T00:00:00.000Z"), // February — open
};

const INVOICE_IN_CLOSED_JANUARY = {
  id: "invoice-jan",
  status: "PARTIALLY_PAID",
  sentAt: new Date("2026-01-05T00:00:00.000Z"),
  totalAmount: new Prisma.Decimal(5000),
  dueDate: new Date("2026-02-04T00:00:00.000Z"),
  issueDate: new Date("2026-01-15T00:00:00.000Z"), // January — CLOSED
};

const INVOICE_IN_OPEN_FEBRUARY = {
  ...INVOICE_IN_CLOSED_JANUARY,
  id: "invoice-feb",
  issueDate: new Date("2026-02-15T00:00:00.000Z"), // February — open
};

/** Only January (month index 0) has a CLOSED ClosingPeriod row; every
 * other month resolves as implicitly OPEN. */
function mockClosingPeriodLookup() {
  closingPeriodFindFirstMock.mockImplementation(({ where }: { where: { startDate: { lte: Date } } }) => {
    const date = where.startDate.lte;
    if (date.getUTCFullYear() === 2026 && date.getUTCMonth() === 0) {
      return Promise.resolve({ id: "period-jan-2026", status: "CLOSED", year: 2026, month: 1 });
    }
    return Promise.resolve(null);
  });
}

function makeTx(invoice: typeof INVOICE_IN_CLOSED_JANUARY) {
  return {
    $executeRaw: vi.fn(),
    paymentAllocation: {
      findMany: vi.fn().mockResolvedValue([{ id: "alloc-1", paymentId: PAYMENT.id, invoiceId: invoice.id, amountAllocated: new Prisma.Decimal(5000) }]),
      delete: vi.fn(),
      aggregate: vi.fn().mockResolvedValue({ _sum: { amountAllocated: null } }),
    },
    invoice: {
      findUniqueOrThrow: vi.fn().mockResolvedValue(invoice),
      update: vi.fn(),
    },
    payment: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
  };
}

beforeEach(() => {
  paymentFindFirstMock.mockReset().mockResolvedValue(PAYMENT);
  transactionMock.mockReset();
  requireCurrentUserWithPermissionMock.mockReset().mockResolvedValue(SUPER_ADMIN);
  recordAuditMock.mockReset().mockResolvedValue(undefined);
  mockClosingPeriodLookup();
});

describe("cancelPayment — reversing an allocation must respect the INVOICE's own period lock", () => {
  it("rejects cancellation when the payment's own month is open but an allocated invoice's month is CLOSED", async () => {
    const tx = makeTx(INVOICE_IN_CLOSED_JANUARY);
    transactionMock.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(tx));

    const result = await cancelPayment({ paymentId: PAYMENT.id, reason: "Customer disputed the payment" });

    expect(result.success).toBe(false);
    expect(result.message).toMatch(/closed for editing/i);
    // Nothing should have been mutated once the lock check failed.
    expect(tx.paymentAllocation.delete).not.toHaveBeenCalled();
    expect(tx.invoice.update).not.toHaveBeenCalled();
    expect(tx.payment.updateMany).not.toHaveBeenCalled();
  });

  it("succeeds when both the payment's and the invoice's months are open", async () => {
    const tx = makeTx(INVOICE_IN_OPEN_FEBRUARY);
    transactionMock.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(tx));

    const result = await cancelPayment({ paymentId: PAYMENT.id, reason: "Customer disputed the payment" });

    expect(result.success).toBe(true);
    expect(tx.paymentAllocation.delete).toHaveBeenCalledWith({ where: { id: "alloc-1" } });
    expect(tx.invoice.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "invoice-feb" } }));
    expect(tx.payment.updateMany).toHaveBeenCalled();
  });
});
