// @vitest-environment node
import { describe, expect, it, vi, beforeEach } from "vitest";
import { Prisma } from "@prisma/client";

const billingDraftFindFirstMock = vi.fn();
const billingDraftUpdateManyMock = vi.fn();
const transactionMock = vi.fn();
const userPermissionFindManyMock = vi.fn();
const closingPeriodFindFirstMock = vi.fn();
const requireCurrentUserWithPermissionMock = vi.fn();

function makeTx(overrides: Record<string, unknown> = {}) {
  return {
    billingDraft: { updateMany: (...args: unknown[]) => billingDraftUpdateManyMock(...args) },
    $queryRaw: vi.fn().mockResolvedValue([{ lastNumber: 1 }]),
    invoice: { create: vi.fn().mockResolvedValue({ id: "invoice-1", invoiceNumber: "INV-2025-26-0001", totalAmount: { toString: () => "10000" } }) },
    ...overrides,
  };
}

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    billingDraft: {
      findFirst: (...args: unknown[]) => billingDraftFindFirstMock(...args),
      updateMany: (...args: unknown[]) => billingDraftUpdateManyMock(...args),
    },
    userPermission: { findMany: (...args: unknown[]) => userPermissionFindManyMock(...args) },
    closingPeriod: { findFirst: (...args: unknown[]) => closingPeriodFindFirstMock(...args) },
    $transaction: (...args: unknown[]) => transactionMock(...args),
  },
}));

vi.mock("@/lib/auth/current-user", () => ({
  requireCurrentUserWithPermission: (...args: unknown[]) => requireCurrentUserWithPermissionMock(...args),
}));

vi.mock("@/lib/audit/audit", () => ({ recordAudit: vi.fn().mockResolvedValue(undefined) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { reviewBillingDraft, generateInvoiceFromBillingDraft } from "./billing-drafts";

const ACCOUNTANT = { id: "acct-1", companyId: "company-1", role: "ACCOUNTANT", name: "Accountant", email: "accountant@svcranes.dev" };

beforeEach(() => {
  billingDraftFindFirstMock.mockReset();
  billingDraftUpdateManyMock.mockReset();
  transactionMock.mockReset();
  userPermissionFindManyMock.mockReset().mockResolvedValue([]);
  closingPeriodFindFirstMock.mockReset().mockResolvedValue(null);
  requireCurrentUserWithPermissionMock.mockReset().mockResolvedValue(ACCOUNTANT);
});

describe("reviewBillingDraft — double-approval prevention", () => {
  it("approves a draft genuinely awaiting review", async () => {
    billingDraftFindFirstMock.mockResolvedValue({ id: "draft-1", status: "REVIEW" });
    billingDraftUpdateManyMock.mockResolvedValue({ count: 1 });

    const result = await reviewBillingDraft({ billingDraftId: "draft-1", decision: "APPROVED" });

    expect(result.success).toBe(true);
    expect(billingDraftUpdateManyMock).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ id: "draft-1", status: "REVIEW" }) }),
    );
  });

  it("rejects a second, concurrent review attempt on the same draft", async () => {
    billingDraftFindFirstMock.mockResolvedValue({ id: "draft-1", status: "REVIEW" });
    billingDraftUpdateManyMock.mockResolvedValue({ count: 0 });

    const result = await reviewBillingDraft({ billingDraftId: "draft-1", decision: "APPROVED" });

    expect(result.success).toBe(false);
    expect(result.message).toMatch(/already reviewed/i);
  });

  it("requires a reason to reject", async () => {
    billingDraftFindFirstMock.mockResolvedValue({ id: "draft-1", status: "REVIEW" });

    const result = await reviewBillingDraft({ billingDraftId: "draft-1", decision: "REJECTED" });

    expect(result.success).toBe(false);
    expect(billingDraftUpdateManyMock).not.toHaveBeenCalled();
  });

  it("refuses to review a draft that isn't in REVIEW (fast-path check)", async () => {
    billingDraftFindFirstMock.mockResolvedValue({ id: "draft-1", status: "APPROVED" });

    const result = await reviewBillingDraft({ billingDraftId: "draft-1", decision: "APPROVED" });

    expect(result.success).toBe(false);
    expect(billingDraftUpdateManyMock).not.toHaveBeenCalled();
  });
});

describe("generateInvoiceFromBillingDraft — duplicate invoice generation prevention", () => {
  const approvedDraft = {
    id: "draft-1",
    companyId: "company-1",
    projectId: "project-1",
    customerId: "customer-1",
    status: "APPROVED",
    billingType: "FIXED",
    periodStart: new Date("2026-01-01"),
    periodEnd: new Date("2026-01-31"),
    quantity: new Prisma.Decimal(1),
    rate: new Prisma.Decimal(10000),
    baseAmount: new Prisma.Decimal(10000),
    additionalChargesAmount: new Prisma.Decimal(0),
    taxPercent: new Prisma.Decimal(0),
    taxAmount: new Prisma.Decimal(0),
    totalAmount: new Prisma.Decimal(10000),
    charges: [] as { id: string; description: string; amount: Prisma.Decimal }[],
    customer: { defaultDueDays: 30 },
  };

  it("refuses to invoice a draft that is not APPROVED (fast-path check)", async () => {
    billingDraftFindFirstMock.mockResolvedValue({ ...approvedDraft, status: "REVIEW" });

    const result = await generateInvoiceFromBillingDraft("draft-1");

    expect(result.success).toBe(false);
    expect(result.message).toMatch(/cannot be invoiced/i);
    expect(transactionMock).not.toHaveBeenCalled();
  });

  it("rejects a second, concurrent invoice-generation attempt on the same approved draft", async () => {
    billingDraftFindFirstMock.mockResolvedValue(approvedDraft);
    // Simulates another request winning the race: the atomic guard's
    // updateMany (status: APPROVED -> INVOICED) matches zero rows because
    // the other request already flipped it.
    transactionMock.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(makeTx({ billingDraft: { updateMany: vi.fn().mockResolvedValue({ count: 0 }) } })));

    const result = await generateInvoiceFromBillingDraft("draft-1");

    expect(result.success).toBe(false);
    expect(result.message).toMatch(/already invoiced|no longer approved/i);
  });

  it("generates the invoice when the atomic guard succeeds", async () => {
    billingDraftFindFirstMock.mockResolvedValue(approvedDraft);
    transactionMock.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(makeTx({ billingDraft: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) } })));

    const result = await generateInvoiceFromBillingDraft("draft-1");

    expect(result.success).toBe(true);
    expect(result.data).toEqual({ id: "invoice-1" });
  });

  it("refuses to generate an invoice when today's own month is CLOSED — the invoice is dated today, not the (historical) billing period", async () => {
    billingDraftFindFirstMock.mockResolvedValue(approvedDraft);
    closingPeriodFindFirstMock.mockResolvedValue({ id: "period-current", status: "CLOSED", year: 2026, month: 3 });

    const result = await generateInvoiceFromBillingDraft("draft-1");

    expect(result.success).toBe(false);
    expect(result.message).toMatch(/closed for editing/i);
    expect(transactionMock).not.toHaveBeenCalled();
  });
});
