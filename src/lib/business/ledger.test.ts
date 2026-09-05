import { describe, expect, it } from "vitest";
import { buildCustomerLedger, validateLedgerAdjustment, LedgerAdjustmentValidationError } from "./ledger";

describe("buildCustomerLedger", () => {
  it("debits invoices and credits payments, tracking a running balance", () => {
    const entries = buildCustomerLedger([
      { type: "INVOICE", id: "inv-1", date: new Date("2026-01-05"), reference: "INV-2025-26-0001", description: "Invoice", amount: 10000 },
      { type: "PAYMENT", id: "pay-1", date: new Date("2026-01-10"), reference: "PMT-1", description: "Payment", amount: 4000 },
      { type: "INVOICE", id: "inv-2", date: new Date("2026-01-15"), reference: "INV-2025-26-0002", description: "Invoice", amount: 5000 },
    ]);

    expect(entries.map((e) => e.runningBalance.toString())).toEqual(["10000", "6000", "11000"]);
    expect(entries[1].credit.toString()).toBe("4000");
    expect(entries[1].debit.toString()).toBe("0");
  });

  it("sorts entries chronologically regardless of input order", () => {
    const entries = buildCustomerLedger([
      { type: "PAYMENT", id: "pay-1", date: new Date("2026-02-01"), reference: "PMT-1", description: "Payment", amount: 1000 },
      { type: "INVOICE", id: "inv-1", date: new Date("2026-01-01"), reference: "INV-1", description: "Invoice", amount: 5000 },
    ]);
    expect(entries[0].type).toBe("INVOICE");
    expect(entries[1].type).toBe("PAYMENT");
  });

  it("applies DEBIT and CREDIT adjustments with the correct sign", () => {
    const entries = buildCustomerLedger([
      { type: "ADJUSTMENT", id: "adj-1", date: new Date("2026-01-01"), reference: "ADJ-1", description: "Write-off", adjustmentType: "CREDIT", amount: 500 },
      { type: "ADJUSTMENT", id: "adj-2", date: new Date("2026-01-02"), reference: "ADJ-2", description: "Manual charge", adjustmentType: "DEBIT", amount: 200 },
    ]);
    expect(entries[0].runningBalance.toString()).toBe("-500");
    expect(entries[1].runningBalance.toString()).toBe("-300");
  });

  it("a payment credit larger than allocated invoices produces a negative (in-credit) balance — the documented overpayment/credit mechanism", () => {
    const entries = buildCustomerLedger([
      { type: "INVOICE", id: "inv-1", date: new Date("2026-01-01"), reference: "INV-1", description: "Invoice", amount: 1000 },
      { type: "PAYMENT", id: "pay-1", date: new Date("2026-01-02"), reference: "PMT-1", description: "Payment", amount: 1500 },
    ]);
    expect(entries[1].runningBalance.toString()).toBe("-500");
  });
});

describe("validateLedgerAdjustment", () => {
  it("requires a positive amount and a non-empty reason", () => {
    expect(() => validateLedgerAdjustment({ amount: 0, reason: "test" })).toThrow(LedgerAdjustmentValidationError);
    expect(() => validateLedgerAdjustment({ amount: 100, reason: "" })).toThrow(LedgerAdjustmentValidationError);
    expect(() => validateLedgerAdjustment({ amount: 100, reason: undefined })).toThrow(LedgerAdjustmentValidationError);
  });

  it("accepts a valid adjustment", () => {
    expect(() => validateLedgerAdjustment({ amount: 100, reason: "Write-off per management approval" })).not.toThrow();
  });
});
