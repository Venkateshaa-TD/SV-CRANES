// @vitest-environment node
import { describe, expect, it, vi, beforeEach } from "vitest";

const invoiceFindFirstMock = vi.fn();
const invoiceUpdateManyMock = vi.fn();
const userPermissionFindManyMock = vi.fn();
const closingPeriodFindFirstMock = vi.fn();
const requireCurrentUserWithPermissionMock = vi.fn();
const canMock = vi.fn();

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    invoice: {
      findFirst: (...args: unknown[]) => invoiceFindFirstMock(...args),
      updateMany: (...args: unknown[]) => invoiceUpdateManyMock(...args),
    },
    userPermission: { findMany: (...args: unknown[]) => userPermissionFindManyMock(...args) },
    // Not under test here — these actions also assert the month isn't
    // closed (see period-lock-enforcement.test.ts for that behavior);
    // null keeps every period implicitly OPEN so it never interferes.
    closingPeriod: { findFirst: (...args: unknown[]) => closingPeriodFindFirstMock(...args) },
  },
}));

vi.mock("@/lib/auth/current-user", () => ({
  requireCurrentUserWithPermission: (...args: unknown[]) => requireCurrentUserWithPermissionMock(...args),
}));

vi.mock("@/lib/auth/authorize", async () => {
  const actual = await vi.importActual<typeof import("@/lib/auth/authorize")>("@/lib/auth/authorize");
  return { ...actual, can: (...args: unknown[]) => canMock(...args) };
});

vi.mock("@/lib/audit/audit", () => ({ recordAudit: vi.fn().mockResolvedValue(undefined) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { approveInvoice, cancelInvoice } from "./invoices";

const ACCOUNTANT = { id: "acct-1", companyId: "company-1", role: "ACCOUNTANT", name: "Accountant", email: "accountant@svcranes.dev" };

beforeEach(() => {
  invoiceFindFirstMock.mockReset();
  invoiceUpdateManyMock.mockReset();
  userPermissionFindManyMock.mockReset().mockResolvedValue([]);
  closingPeriodFindFirstMock.mockReset().mockResolvedValue(null);
  requireCurrentUserWithPermissionMock.mockReset().mockResolvedValue(ACCOUNTANT);
  canMock.mockReset();
});

describe("approveInvoice — double-approval prevention", () => {
  it("approves a genuinely DRAFT invoice", async () => {
    invoiceFindFirstMock.mockResolvedValue({ id: "inv-1", status: "DRAFT" });
    invoiceUpdateManyMock.mockResolvedValue({ count: 1 });

    const result = await approveInvoice("inv-1");

    expect(result.success).toBe(true);
    expect(invoiceUpdateManyMock).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ id: "inv-1", status: "DRAFT" }) }));
  });

  it("rejects a second, concurrent approval attempt", async () => {
    invoiceFindFirstMock.mockResolvedValue({ id: "inv-1", status: "DRAFT" });
    invoiceUpdateManyMock.mockResolvedValue({ count: 0 });

    const result = await approveInvoice("inv-1");

    expect(result.success).toBe(false);
    expect(result.message).toMatch(/already approved/i);
  });

  it("returns not-found for a forged invoice id (IDOR)", async () => {
    invoiceFindFirstMock.mockResolvedValue(null);

    const result = await approveInvoice("someone-elses-invoice");

    expect(result.success).toBe(false);
    expect(result.message).toMatch(/not found/i);
    expect(invoiceUpdateManyMock).not.toHaveBeenCalled();
  });
});

describe("cancelInvoice — controlled correction workflow", () => {
  it("rejects a user without CUSTOMER_FINANCIAL_EDIT even though they have INVOICE_MANAGE", async () => {
    canMock.mockResolvedValue(false);

    const result = await cancelInvoice({ invoiceId: "inv-1", reason: "Duplicate invoice" });

    expect(result.success).toBe(false);
    expect(invoiceFindFirstMock).not.toHaveBeenCalled();
  });

  it("requires a non-empty reason", async () => {
    canMock.mockResolvedValue(true);

    const result = await cancelInvoice({ invoiceId: "inv-1", reason: "" });

    expect(result.success).toBe(false);
    expect(invoiceFindFirstMock).not.toHaveBeenCalled();
  });

  it("refuses to cancel a PAID invoice", async () => {
    canMock.mockResolvedValue(true);
    invoiceFindFirstMock.mockResolvedValue({ id: "inv-1", status: "PAID", paymentAllocations: [] });

    const result = await cancelInvoice({ invoiceId: "inv-1", reason: "Client dispute" });

    expect(result.success).toBe(false);
    expect(invoiceUpdateManyMock).not.toHaveBeenCalled();
  });

  it("refuses to cancel an invoice that still has payment allocations", async () => {
    canMock.mockResolvedValue(true);
    invoiceFindFirstMock.mockResolvedValue({ id: "inv-1", status: "PARTIALLY_PAID", paymentAllocations: [{ id: "alloc-1" }] });

    const result = await cancelInvoice({ invoiceId: "inv-1", reason: "Client dispute" });

    expect(result.success).toBe(false);
    expect(result.message).toMatch(/remove.*allocation/i);
    expect(invoiceUpdateManyMock).not.toHaveBeenCalled();
  });

  it("cancels an APPROVED invoice with no allocations, recording the reason", async () => {
    canMock.mockResolvedValue(true);
    invoiceFindFirstMock.mockResolvedValue({ id: "inv-1", status: "APPROVED", paymentAllocations: [] });
    invoiceUpdateManyMock.mockResolvedValue({ count: 1 });

    const result = await cancelInvoice({ invoiceId: "inv-1", reason: "Client dispute" });

    expect(result.success).toBe(true);
    expect(invoiceUpdateManyMock).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "CANCELLED", cancellationReason: "Client dispute" }) }),
    );
  });
});
