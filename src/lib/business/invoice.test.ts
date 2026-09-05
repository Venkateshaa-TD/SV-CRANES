import { describe, expect, it } from "vitest";
import {
  InvoiceValidationError,
  computeInvoiceLine,
  computeInvoiceTotals,
  deriveInvoiceStatus,
  fiscalYearFor,
  formatInvoiceNumber,
  isInvoiceEditable,
} from "./invoice";

describe("fiscalYearFor / formatInvoiceNumber", () => {
  it("assigns Jan-Mar dates to the fiscal year that started the previous April", () => {
    expect(fiscalYearFor({ year: 2026, month: 2 })).toBe(2025);
  });

  it("assigns Apr-Dec dates to the fiscal year starting that same April", () => {
    expect(fiscalYearFor({ year: 2026, month: 6 })).toBe(2026);
  });

  it("formats a stable, human-readable invoice number", () => {
    expect(formatInvoiceNumber(2025, 7)).toBe("INV-2025-26-0007");
    expect(formatInvoiceNumber(2025, 12345)).toBe("INV-2025-26-12345");
  });
});

describe("computeInvoiceLine", () => {
  it("computes amount and tax from quantity/rate/tax%, never trusting a submitted total", () => {
    const line = computeInvoiceLine({ quantity: 10, unitPrice: 500, taxPercent: 18 });
    expect(line.amount.toString()).toBe("5000");
    expect(line.taxAmount.toString()).toBe("900");
  });

  it("rejects a non-positive quantity", () => {
    expect(() => computeInvoiceLine({ quantity: 0, unitPrice: 500 })).toThrow(InvoiceValidationError);
  });

  it("rejects a negative rate", () => {
    expect(() => computeInvoiceLine({ quantity: 1, unitPrice: -1 })).toThrow(InvoiceValidationError);
  });
});

describe("computeInvoiceTotals", () => {
  it("sums subtotal and tax across lines, then applies discount", () => {
    const lines = [computeInvoiceLine({ quantity: 10, unitPrice: 500, taxPercent: 18 }), computeInvoiceLine({ quantity: 2, unitPrice: 1000, taxPercent: 18 })];
    const totals = computeInvoiceTotals({ lines, discountAmount: 500 });
    expect(totals.subtotal.toString()).toBe("7000");
    expect(totals.taxAmount.toString()).toBe("1260");
    // 7000 - 500 + 1260 = 7760
    expect(totals.totalAmount.toString()).toBe("7760");
  });

  it("rejects a discount larger than the subtotal", () => {
    const lines = [computeInvoiceLine({ quantity: 1, unitPrice: 100 })];
    expect(() => computeInvoiceTotals({ lines, discountAmount: 200 })).toThrow(InvoiceValidationError);
  });
});

describe("isInvoiceEditable", () => {
  it("only DRAFT invoices are freely editable", () => {
    expect(isInvoiceEditable("DRAFT")).toBe(true);
    expect(isInvoiceEditable("APPROVED")).toBe(false);
    expect(isInvoiceEditable("SENT")).toBe(false);
    expect(isInvoiceEditable("PAID")).toBe(false);
  });
});

describe("deriveInvoiceStatus", () => {
  const base = { isDraft: false, isCancelled: false, sentAt: null, dueDate: null, totalAmount: 1000 };

  it("returns DRAFT/CANCELLED verbatim regardless of payment state", () => {
    expect(deriveInvoiceStatus({ ...base, isDraft: true, amountAllocated: 500 })).toBe("DRAFT");
    expect(deriveInvoiceStatus({ ...base, isCancelled: true, amountAllocated: 0 })).toBe("CANCELLED");
  });

  it("is APPROVED with nothing allocated and not yet sent", () => {
    expect(deriveInvoiceStatus({ ...base, amountAllocated: 0 })).toBe("APPROVED");
  });

  it("is SENT once marked sent, with nothing allocated", () => {
    expect(deriveInvoiceStatus({ ...base, sentAt: new Date("2026-01-01"), amountAllocated: 0 })).toBe("SENT");
  });

  it("is PARTIALLY_PAID with a partial allocation", () => {
    expect(deriveInvoiceStatus({ ...base, amountAllocated: 400 })).toBe("PARTIALLY_PAID");
  });

  it("is PAID once allocated meets or exceeds the total", () => {
    expect(deriveInvoiceStatus({ ...base, amountAllocated: 1000 })).toBe("PAID");
    expect(deriveInvoiceStatus({ ...base, amountAllocated: 1200 })).toBe("PAID");
  });

  it("is OVERDUE when the due date has passed and a balance remains, but never for a fully paid invoice", () => {
    const overdueDate = new Date("2020-01-01");
    const now = new Date("2026-01-01");
    expect(deriveInvoiceStatus({ ...base, dueDate: overdueDate, amountAllocated: 0, now })).toBe("OVERDUE");
    expect(deriveInvoiceStatus({ ...base, dueDate: overdueDate, amountAllocated: 400, now })).toBe("OVERDUE");
    expect(deriveInvoiceStatus({ ...base, dueDate: overdueDate, amountAllocated: 1000, now })).toBe("PAID");
  });

  it("is not overdue while the due date is still in the future", () => {
    const futureDate = new Date("2099-01-01");
    expect(deriveInvoiceStatus({ ...base, dueDate: futureDate, amountAllocated: 0 })).toBe("APPROVED");
  });
});
