import { describe, expect, it } from "vitest";
import {
  PaymentValidationError,
  computeInvoiceOutstanding,
  computeUnallocatedAmount,
  daysOverdue,
  isOverdue,
  validateAllocation,
  validatePaymentAmount,
} from "./payment";

const baseContext = {
  paymentUnallocated: 100000,
  invoiceCompanyId: "company-1",
  invoiceCustomerId: "customer-1",
  paymentCompanyId: "company-1",
  paymentCustomerId: "customer-1",
  invoiceStatus: "APPROVED" as const,
  invoiceOutstanding: 60000,
};

describe("validatePaymentAmount", () => {
  it("rejects a non-positive amount", () => {
    expect(() => validatePaymentAmount(0)).toThrow(PaymentValidationError);
    expect(() => validatePaymentAmount(-100)).toThrow(PaymentValidationError);
  });
});

describe("computeUnallocatedAmount / computeInvoiceOutstanding", () => {
  it("is the payment amount minus its existing allocations", () => {
    expect(computeUnallocatedAmount(100000, [60000, 10000]).toString()).toBe("30000");
  });

  it("is the invoice total minus its existing allocations", () => {
    expect(computeInvoiceOutstanding(50000, [20000]).toString()).toBe("30000");
  });
});

describe("validateAllocation", () => {
  it("accepts a valid partial allocation within both the payment and invoice balances", () => {
    expect(() => validateAllocation({ invoiceId: "inv-1", amount: 60000 }, baseContext)).not.toThrow();
  });

  it("rejects a zero or negative allocation", () => {
    expect(() => validateAllocation({ invoiceId: "inv-1", amount: 0 }, baseContext)).toThrow(PaymentValidationError);
  });

  it("rejects an allocation exceeding the payment's unallocated amount", () => {
    expect(() => validateAllocation({ invoiceId: "inv-1", amount: 200000 }, { ...baseContext, invoiceOutstanding: 500000 })).toThrow(
      /exceeds the payment/i,
    );
  });

  it("rejects an allocation exceeding the invoice's outstanding balance", () => {
    expect(() => validateAllocation({ invoiceId: "inv-1", amount: 90000 }, baseContext)).toThrow(/exceeds the invoice/i);
  });

  it("rejects a company mismatch between payment and invoice", () => {
    expect(() => validateAllocation({ invoiceId: "inv-1", amount: 100 }, { ...baseContext, invoiceCompanyId: "company-2" })).toThrow(
      /same company/i,
    );
  });

  it("rejects a customer mismatch between payment and invoice", () => {
    expect(() => validateAllocation({ invoiceId: "inv-1", amount: 100 }, { ...baseContext, invoiceCustomerId: "customer-2" })).toThrow(
      /same customer/i,
    );
  });

  it("rejects allocating to a cancelled invoice", () => {
    expect(() => validateAllocation({ invoiceId: "inv-1", amount: 100 }, { ...baseContext, invoiceStatus: "CANCELLED" })).toThrow(
      /cancelled invoice/i,
    );
  });

  it("rejects allocating to a DRAFT invoice (not yet approved/issued) even if the client forges the request", () => {
    expect(() => validateAllocation({ invoiceId: "inv-1", amount: 100 }, { ...baseContext, invoiceStatus: "DRAFT" })).toThrow(
      /draft invoice/i,
    );
  });

  it("rejects allocating to an invoice with zero outstanding (already fully paid)", () => {
    expect(() => validateAllocation({ invoiceId: "inv-1", amount: 100 }, { ...baseContext, invoiceOutstanding: 0 })).toThrow(
      /already fully paid/i,
    );
  });
});

describe("isOverdue / daysOverdue", () => {
  const now = new Date("2026-06-15");

  it("is not overdue with no due date", () => {
    expect(isOverdue({ dueDate: null, outstanding: 100, now })).toBe(false);
  });

  it("is not overdue once the balance is fully paid, even past the due date", () => {
    expect(isOverdue({ dueDate: new Date("2026-01-01"), outstanding: 0, now })).toBe(false);
  });

  it("is overdue when the due date has passed and a balance remains", () => {
    expect(isOverdue({ dueDate: new Date("2026-01-01"), outstanding: 500, now })).toBe(true);
  });

  it("computes whole days overdue, floored, and zero when not overdue", () => {
    expect(daysOverdue(new Date("2026-06-01"), now)).toBe(14);
    expect(daysOverdue(new Date("2026-07-01"), now)).toBe(0);
    expect(daysOverdue(null, now)).toBe(0);
  });
});
