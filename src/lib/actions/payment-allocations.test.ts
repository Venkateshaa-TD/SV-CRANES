// @vitest-environment node
import { describe, expect, it, vi, beforeEach } from "vitest";
import { Prisma } from "@prisma/client";

const paymentFindFirstMock = vi.fn();
const allocationFindFirstMock = vi.fn();
const transactionMock = vi.fn();
const userPermissionFindManyMock = vi.fn();
const closingPeriodFindFirstMock = vi.fn();
const requireCurrentUserWithPermissionMock = vi.fn();

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    payment: { findFirst: (...args: unknown[]) => paymentFindFirstMock(...args) },
    paymentAllocation: { findFirst: (...args: unknown[]) => allocationFindFirstMock(...args) },
    userPermission: { findMany: (...args: unknown[]) => userPermissionFindManyMock(...args) },
    // Not under test here — allocatePayment also asserts neither the
    // payment's nor the invoice's month is closed (see
    // period-lock-enforcement.test.ts); null keeps every period
    // implicitly OPEN so it never interferes.
    closingPeriod: { findFirst: (...args: unknown[]) => closingPeriodFindFirstMock(...args) },
    $transaction: (...args: unknown[]) => transactionMock(...args),
  },
}));

vi.mock("@/lib/auth/current-user", () => ({
  requireCurrentUserWithPermission: (...args: unknown[]) => requireCurrentUserWithPermissionMock(...args),
}));

vi.mock("@/lib/audit/audit", () => ({ recordAudit: vi.fn().mockResolvedValue(undefined) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { allocatePayment } from "./payment-allocations";

const ACCOUNTANT = { id: "acct-1", companyId: "company-1", role: "ACCOUNTANT", name: "Accountant", email: "accountant@svcranes.dev" };

interface FakePayment {
  id: string;
  companyId: string;
  customerId: string;
  amount: Prisma.Decimal;
  cancelledAt: Date | null;
}

interface FakeInvoice {
  id: string;
  companyId: string;
  customerId: string;
  status: string;
  totalAmount: Prisma.Decimal;
  amountPaid: Prisma.Decimal;
  sentAt: Date | null;
  dueDate: Date | null;
}

/** Builds a mock Prisma transaction client backing one payment and a set
 * of invoices, with allocation aggregates derived from `existingAllocated`
 * (invoiceId -> already-allocated amount) — enough surface for
 * allocatePayment's transactional logic to run against real business
 * rules (validateAllocation, deriveInvoiceStatus are NOT mocked). */
function makeTx(payment: FakePayment, invoices: FakeInvoice[], existingAllocated: Record<string, number> = {}) {
  const invoiceById = new Map(invoices.map((i) => [i.id, i]));
  // Mutable, updated by the upsert mock below — mirrors how a real
  // Postgres aggregate would reflect a just-inserted/updated row within
  // the same transaction, which a static fixture would not.
  const allocated: Record<string, number> = { ...existingAllocated };

  return {
    $executeRaw: vi.fn().mockResolvedValue(undefined),
    payment: { findUniqueOrThrow: vi.fn().mockResolvedValue(payment) },
    invoice: {
      findFirst: vi.fn(async ({ where }: { where: { id: string; companyId: string } }) => {
        const invoice = invoiceById.get(where.id);
        return invoice && invoice.companyId === where.companyId ? invoice : null;
      }),
      findUniqueOrThrow: vi.fn(async ({ where }: { where: { id: string } }) => invoiceById.get(where.id)),
      update: vi.fn().mockResolvedValue(undefined),
    },
    paymentAllocation: {
      aggregate: vi.fn(async ({ where }: { where: { paymentId?: string; invoiceId?: string } }) => {
        if (where.paymentId) {
          const total = Object.values(allocated).reduce((sum, v) => sum + v, 0);
          return { _sum: { amountAllocated: total } };
        }
        return { _sum: { amountAllocated: allocated[where.invoiceId!] ?? 0 } };
      }),
      upsert: vi.fn(async ({ where, create, update }: { where: { paymentId_invoiceId: { invoiceId: string } }; create: { amountAllocated: Prisma.Decimal }; update: { amountAllocated: { increment: Prisma.Decimal } } }) => {
        const invoiceId = where.paymentId_invoiceId.invoiceId;
        const delta = (create?.amountAllocated ?? update.amountAllocated.increment).toNumber();
        allocated[invoiceId] = (allocated[invoiceId] ?? 0) + delta;
      }),
    },
  };
}

beforeEach(() => {
  paymentFindFirstMock.mockReset();
  allocationFindFirstMock.mockReset();
  transactionMock.mockReset();
  userPermissionFindManyMock.mockReset().mockResolvedValue([]);
  closingPeriodFindFirstMock.mockReset().mockResolvedValue(null);
  requireCurrentUserWithPermissionMock.mockReset().mockResolvedValue(ACCOUNTANT);
});

describe("allocatePayment — business-rule enforcement under transaction", () => {
  const payment: FakePayment = { id: "pay-1", companyId: "company-1", customerId: "cust-1", amount: new Prisma.Decimal(100000), cancelledAt: null };

  it("allocates within both the payment and invoice balances", async () => {
    paymentFindFirstMock.mockResolvedValue(payment);
    const invoice: FakeInvoice = {
      id: "inv-1",
      companyId: "company-1",
      customerId: "cust-1",
      status: "APPROVED",
      totalAmount: new Prisma.Decimal(60000),
      amountPaid: new Prisma.Decimal(0),
      sentAt: null,
      dueDate: null,
    };
    const tx = makeTx(payment, [invoice]);
    transactionMock.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(tx));

    const result = await allocatePayment({ paymentId: "pay-1", allocations: [{ invoiceId: "inv-1", amount: 60000 }] });

    expect(result.success).toBe(true);
    expect(tx.invoice.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "PAID" }) }));
  });

  it("rejects an allocation exceeding the invoice's outstanding balance", async () => {
    paymentFindFirstMock.mockResolvedValue(payment);
    const invoice: FakeInvoice = {
      id: "inv-1",
      companyId: "company-1",
      customerId: "cust-1",
      status: "APPROVED",
      totalAmount: new Prisma.Decimal(50000),
      amountPaid: new Prisma.Decimal(0),
      sentAt: null,
      dueDate: null,
    };
    const tx = makeTx(payment, [invoice]);
    transactionMock.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(tx));

    const result = await allocatePayment({ paymentId: "pay-1", allocations: [{ invoiceId: "inv-1", amount: 90000 }] });

    expect(result.success).toBe(false);
    expect(result.message).toMatch(/exceeds the invoice/i);
    expect(tx.invoice.update).not.toHaveBeenCalled();
  });

  it("rejects a company/customer mismatch between payment and invoice", async () => {
    paymentFindFirstMock.mockResolvedValue(payment);
    const otherCompanyInvoice: FakeInvoice = {
      id: "inv-1",
      companyId: "company-2",
      customerId: "cust-1",
      status: "APPROVED",
      totalAmount: new Prisma.Decimal(50000),
      amountPaid: new Prisma.Decimal(0),
      sentAt: null,
      dueDate: null,
    };
    const tx = makeTx(payment, [otherCompanyInvoice]);
    transactionMock.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(tx));

    const result = await allocatePayment({ paymentId: "pay-1", allocations: [{ invoiceId: "inv-1", amount: 1000 }] });

    // The invoice.findFirst inside the transaction is itself
    // company-scoped, so a cross-company invoice id resolves to "not
    // found" before validateAllocation's own company check would apply —
    // both layers independently block the forged id.
    expect(result.success).toBe(false);
  });

  it("rejects allocating to a cancelled invoice", async () => {
    paymentFindFirstMock.mockResolvedValue(payment);
    const cancelledInvoice: FakeInvoice = {
      id: "inv-1",
      companyId: "company-1",
      customerId: "cust-1",
      status: "CANCELLED",
      totalAmount: new Prisma.Decimal(50000),
      amountPaid: new Prisma.Decimal(0),
      sentAt: null,
      dueDate: null,
    };
    const tx = makeTx(payment, [cancelledInvoice]);
    transactionMock.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(tx));

    const result = await allocatePayment({ paymentId: "pay-1", allocations: [{ invoiceId: "inv-1", amount: 1000 }] });

    expect(result.success).toBe(false);
    expect(result.message).toMatch(/cancelled invoice/i);
  });

  it("rejects allocating more than the payment's unallocated remainder across multiple lines in one request", async () => {
    paymentFindFirstMock.mockResolvedValue(payment); // amount = 100000
    const invoiceA: FakeInvoice = { id: "inv-a", companyId: "company-1", customerId: "cust-1", status: "APPROVED", totalAmount: new Prisma.Decimal(60000), amountPaid: new Prisma.Decimal(0), sentAt: null, dueDate: null };
    const invoiceB: FakeInvoice = { id: "inv-b", companyId: "company-1", customerId: "cust-1", status: "APPROVED", totalAmount: new Prisma.Decimal(60000), amountPaid: new Prisma.Decimal(0), sentAt: null, dueDate: null };
    const tx = makeTx(payment, [invoiceA, invoiceB]);
    transactionMock.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(tx));

    // 60000 + 60000 = 120000 > payment.amount (100000).
    const result = await allocatePayment({
      paymentId: "pay-1",
      allocations: [
        { invoiceId: "inv-a", amount: 60000 },
        { invoiceId: "inv-b", amount: 60000 },
      ],
    });

    expect(result.success).toBe(false);
    expect(result.message).toMatch(/exceeds the payment/i);
  });

  it("rejects a cancelled payment", async () => {
    const cancelled: FakePayment = { ...payment, cancelledAt: new Date() };
    paymentFindFirstMock.mockResolvedValue(cancelled);
    const tx = makeTx(cancelled, []);
    transactionMock.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(tx));

    const result = await allocatePayment({ paymentId: "pay-1", allocations: [{ invoiceId: "inv-1", amount: 1000 }] });

    expect(result.success).toBe(false);
    expect(result.message).toMatch(/cancelled/i);
  });
});
