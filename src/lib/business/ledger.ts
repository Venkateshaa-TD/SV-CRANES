import { Prisma } from "@prisma/client";

/**
 * Pure customer-ledger construction: turns Invoice / Payment /
 * LedgerAdjustment records into a chronological debit/credit list with a
 * running balance — computed at read time, never stored as a mutable
 * balance column. See src/lib/data/finance-queries.ts for the query
 * layer that loads the source records this consumes.
 *
 * Sign convention (standard accounts-receivable subledger): an invoice
 * DEBITS the customer (increases what they owe); a payment CREDITS the
 * customer — using the full payment amount actually received, not just
 * the portion allocated so far, because the ledger reflects the
 * customer's real net position. An unallocated remainder on a payment
 * (the documented overpayment/credit mechanism — see
 * src/lib/business/payment.ts) is exactly what makes the ledger balance
 * more negative (more "in credit") than the sum of individual invoices'
 * outstanding balances shown on the Outstanding page — that is correct,
 * not a discrepancy: the Outstanding page is invoice-level and can never
 * show a negative balance for a single invoice, while the ledger is
 * customer-level and does reflect standing credit.
 */

export type DecimalInput = Prisma.Decimal | number | string;

function toDecimal(value: DecimalInput): Prisma.Decimal {
  return value instanceof Prisma.Decimal ? value : new Prisma.Decimal(value);
}

export type LedgerEntryType = "INVOICE" | "PAYMENT" | "ADJUSTMENT";

interface LedgerSourceBase {
  id: string;
  date: Date;
  reference: string;
  description: string;
}

export interface LedgerSourceInvoice extends LedgerSourceBase {
  type: "INVOICE";
  amount: DecimalInput;
}

export interface LedgerSourcePayment extends LedgerSourceBase {
  type: "PAYMENT";
  amount: DecimalInput;
}

export interface LedgerSourceAdjustment extends LedgerSourceBase {
  type: "ADJUSTMENT";
  adjustmentType: "DEBIT" | "CREDIT";
  amount: DecimalInput;
}

export type LedgerSourceEntry = LedgerSourceInvoice | LedgerSourcePayment | LedgerSourceAdjustment;

export interface LedgerEntry {
  id: string;
  date: Date;
  type: LedgerEntryType;
  reference: string;
  description: string;
  debit: Prisma.Decimal;
  credit: Prisma.Decimal;
  runningBalance: Prisma.Decimal;
}

/**
 * Sorts every source record chronologically (stable on ties — callers
 * should pass same-day records in a sensible pre-order, e.g. invoices
 * before payments) and folds a running balance across them. Callers
 * should exclude CANCELLED invoices and cancelled payments before
 * calling this — a cancelled record has no ledger effect.
 */
export function buildCustomerLedger(entries: LedgerSourceEntry[]): LedgerEntry[] {
  const sorted = [...entries].sort((a, b) => a.date.getTime() - b.date.getTime());

  let balance = new Prisma.Decimal(0);
  return sorted.map((entry) => {
    let debit = new Prisma.Decimal(0);
    let credit = new Prisma.Decimal(0);

    if (entry.type === "INVOICE") {
      debit = toDecimal(entry.amount).toDecimalPlaces(2);
    } else if (entry.type === "PAYMENT") {
      credit = toDecimal(entry.amount).toDecimalPlaces(2);
    } else {
      const amount = toDecimal(entry.amount).toDecimalPlaces(2);
      if (entry.adjustmentType === "DEBIT") debit = amount;
      else credit = amount;
    }

    balance = balance.plus(debit).minus(credit);

    return {
      id: entry.id,
      date: entry.date,
      type: entry.type,
      reference: entry.reference,
      description: entry.description,
      debit,
      credit,
      runningBalance: balance.toDecimalPlaces(2),
    };
  });
}

export class LedgerAdjustmentValidationError extends Error {}

export function validateLedgerAdjustment(params: { amount: DecimalInput; reason: string | null | undefined }): void {
  if (toDecimal(params.amount).lessThanOrEqualTo(0)) {
    throw new LedgerAdjustmentValidationError("Adjustment amount must be greater than zero.");
  }
  if (!params.reason || params.reason.trim().length === 0) {
    throw new LedgerAdjustmentValidationError("A reason is required for a ledger adjustment.");
  }
}
