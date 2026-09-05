// @vitest-environment node
import { describe, expect, it, vi, beforeEach } from "vitest";

const customerFindFirstMock = vi.fn();
const customerCreateMock = vi.fn();
const customerUpdateMock = vi.fn();
const userPermissionFindManyMock = vi.fn();
const requireCurrentUserWithPermissionMock = vi.fn();

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    customer: {
      findFirst: (...args: unknown[]) => customerFindFirstMock(...args),
      create: (...args: unknown[]) => customerCreateMock(...args),
      update: (...args: unknown[]) => customerUpdateMock(...args),
    },
    userPermission: { findMany: (...args: unknown[]) => userPermissionFindManyMock(...args) },
  },
}));

vi.mock("@/lib/auth/current-user", () => ({
  requireCurrentUserWithPermission: (...args: unknown[]) => requireCurrentUserWithPermissionMock(...args),
}));

vi.mock("@/lib/audit/audit", () => ({ recordAudit: vi.fn().mockResolvedValue(undefined) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { createCustomer, updateCustomer } from "./customers";

const MANAGER_NO_FINANCE = { id: "manager-1", companyId: "company-1", role: "MANAGER", name: "Manager", email: "manager@svcranes.dev" };
const TRUSTED_ACCOUNTANT = { id: "acct-1", companyId: "company-1", role: "ACCOUNTANT", name: "Accountant", email: "accountant@svcranes.dev" };

beforeEach(() => {
  customerFindFirstMock.mockReset();
  customerCreateMock.mockReset();
  customerUpdateMock.mockReset();
  userPermissionFindManyMock.mockReset().mockResolvedValue([]);
  requireCurrentUserWithPermissionMock.mockReset();
});

describe("createCustomer — CUSTOMER_FINANCIAL_EDIT enforcement", () => {
  it("rejects a CUSTOMER_MANAGE-only user attempting to set financial terms (forged request)", async () => {
    requireCurrentUserWithPermissionMock.mockResolvedValue(MANAGER_NO_FINANCE);
    userPermissionFindManyMock.mockResolvedValue([]); // no override -> MANAGER lacks CUSTOMER_FINANCIAL_EDIT

    const result = await createCustomer({ name: "Acme Ltd", paymentTerms: "Net 60", defaultDueDays: 60 });

    expect(result.success).toBe(false);
    expect(customerCreateMock).not.toHaveBeenCalled();
  });

  it("allows a user with the CUSTOMER_FINANCIAL_EDIT override to set financial terms", async () => {
    requireCurrentUserWithPermissionMock.mockResolvedValue(TRUSTED_ACCOUNTANT);
    userPermissionFindManyMock.mockResolvedValue([{ permission: "customer:financial:edit", granted: true }]);
    customerFindFirstMock.mockResolvedValue(null); // no duplicate name/code
    customerCreateMock.mockResolvedValue({ id: "cust-1", name: "Acme Ltd", customerCode: null });

    const result = await createCustomer({ name: "Acme Ltd", paymentTerms: "Net 60", defaultDueDays: 60 });

    expect(result.success).toBe(true);
    expect(customerCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ paymentTerms: "Net 60", defaultDueDays: 60 }) }),
    );
  });

  it("allows a CUSTOMER_MANAGE-only user to create a customer without touching financial fields", async () => {
    requireCurrentUserWithPermissionMock.mockResolvedValue(MANAGER_NO_FINANCE);
    userPermissionFindManyMock.mockResolvedValue([]);
    customerFindFirstMock.mockResolvedValue(null);
    customerCreateMock.mockResolvedValue({ id: "cust-1", name: "Acme Ltd", customerCode: null });

    const result = await createCustomer({ name: "Acme Ltd" });

    expect(result.success).toBe(true);
    expect(customerCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ paymentTerms: null, defaultDueDays: 30 }) }),
    );
  });
});

describe("updateCustomer — company scoping (IDOR) and financial-edit enforcement", () => {
  it("returns not-found rather than another company's record for a forged customer id", async () => {
    requireCurrentUserWithPermissionMock.mockResolvedValue(MANAGER_NO_FINANCE);
    customerFindFirstMock.mockResolvedValue(null);

    const result = await updateCustomer("forged-customer-id", { name: "Acme Ltd" });

    expect(result.success).toBe(false);
    expect(result.message).toMatch(/not found/i);
    expect(customerUpdateMock).not.toHaveBeenCalled();
  });

  it("allows a CUSTOMER_MANAGE-only user to edit contact info without touching existing financial terms", async () => {
    requireCurrentUserWithPermissionMock.mockResolvedValue(MANAGER_NO_FINANCE);
    userPermissionFindManyMock.mockResolvedValue([]);
    customerFindFirstMock
      .mockResolvedValueOnce({ id: "cust-1", companyId: "company-1", name: "Acme Ltd", paymentTerms: "Net 45", defaultDueDays: 45 })
      .mockResolvedValue(null); // no duplicate code/name
    customerUpdateMock.mockResolvedValue({ id: "cust-1", paymentTerms: "Net 45", defaultDueDays: 45 });

    const result = await updateCustomer("cust-1", { name: "Acme Ltd Updated", phone: "+91 90000 00000" });

    expect(result.success).toBe(true);
    // Financial fields must not appear in the update payload at all when
    // the actor lacks the override — existing values stay untouched.
    const updateArg = customerUpdateMock.mock.calls[0][0];
    expect(updateArg.data).not.toHaveProperty("paymentTerms");
    expect(updateArg.data).not.toHaveProperty("defaultDueDays");
  });

  it("rejects a CUSTOMER_MANAGE-only user explicitly trying to change financial terms to a different value", async () => {
    requireCurrentUserWithPermissionMock.mockResolvedValue(MANAGER_NO_FINANCE);
    userPermissionFindManyMock.mockResolvedValue([]);
    customerFindFirstMock.mockResolvedValue({ id: "cust-1", companyId: "company-1", name: "Acme Ltd", paymentTerms: "Net 45", defaultDueDays: 45 });

    const result = await updateCustomer("cust-1", { name: "Acme Ltd", paymentTerms: "Net 90", defaultDueDays: 90 });

    expect(result.success).toBe(false);
    expect(customerUpdateMock).not.toHaveBeenCalled();
  });
});
