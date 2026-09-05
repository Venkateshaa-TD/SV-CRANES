import { Prisma, type InvoiceStatus } from "@prisma/client";

/**
 * Pure invoice rules: number formatting, totals-from-lines, and status
 * derivation. None of this touches the database — see
 * src/lib/actions/invoices.ts and src/lib/actions/billing-drafts.ts for
 * the transactional orchestration (including the actual concurrency-safe
 * number issuance, which lives in the DB via InvoiceSequence — see
 * generateInvoiceNumber there).
 */

export class InvoiceValidationError extends Error {}

export type DecimalInput = Prisma.Decimal | number | string;

function toDecimal(value: DecimalInput): Prisma.Decimal {
  return value instanceof Prisma.Decimal ? value : new Prisma.Decimal(value);
}

/**
 * India's fiscal year runs April-June through March: a business-local
 * date in Jan-Mar belongs to the fiscal year that started the previous
 * calendar April. Returns the starting calendar year (e.g. 2025 for
 * FY2025-26).
 */
export function fiscalYearFor(businessLocalDate: { year: number; month: number }): number {
  return businessLocalDate.month >= 4 ? businessLocalDate.year : businessLocalDate.year - 1;
}

/** e.g. fiscalYear 2025 -> "2025-26". */
export function formatFiscalYearLabel(fiscalYear: number): string {
  return `${fiscalYear}-${String((fiscalYear + 1) % 100).padStart(2, "0")}`;
}

/** e.g. fiscalYear 2025, sequence 7 -> "INV-2025-26-0007". Purely a
 * formatting function — the sequence number itself must come from the
 * concurrency-safe InvoiceSequence counter, never generated client-side
 * or by counting existing rows. */
export function formatInvoiceNumber(fiscalYear: number, sequence: number): string {
  return `INV-${formatFiscalYearLabel(fiscalYear)}-${String(sequence).padStart(4, "0")}`;
}

export function formatDateOnly(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export interface InvoiceLineInput {
  quantity: DecimalInput;
  unitPrice: DecimalInput;
  taxPercent?: DecimalInput | null;
}

export interface InvoiceLineComputed {
  quantity: Prisma.Decimal;
  unitPrice: Prisma.Decimal;
  amount: Prisma.Decimal;
  taxPercent: Prisma.Decimal;
  taxAmount: Prisma.Decimal;
}

/** Server-authoritative per-line amount/tax — never trust a
 * client-submitted line total. */
export function computeInvoiceLine(line: InvoiceLineInput): InvoiceLineComputed {
  const quantity = toDecimal(line.quantity);
  const unitPrice = toDecimal(line.unitPrice);
  if (quantity.lessThanOrEqualTo(0)) {
    throw new InvoiceValidationError("Line quantity must be greater than zero.");
  }
  if (unitPrice.isNegative()) {
    throw new InvoiceValidationError("Line rate cannot be negative.");
  }
  const amount = quantity.times(unitPrice).toDecimalPlaces(2);
  const taxPercent = toDecimal(line.taxPercent ?? 0);
  const taxAmount = amount.times(taxPercent).dividedBy(100).toDecimalPlaces(2);
  return { quantity, unitPrice, amount, taxPercent, taxAmount };
}

export interface InvoiceTotals {
  subtotal: Prisma.Decimal;
  taxAmount: Prisma.Decimal;
  totalAmount: Prisma.Decimal;
}

/** Server-authoritative grand total, always recomputed from line data —
 * never accepted as a submitted top-level figure. */
export function computeInvoiceTotals(params: { lines: InvoiceLineComputed[]; discountAmount?: DecimalInput }): InvoiceTotals {
  const subtotal = params.lines.reduce((sum, l) => sum.plus(l.amount), new Prisma.Decimal(0)).toDecimalPlaces(2);
  const taxAmount = params.lines.reduce((sum, l) => sum.plus(l.taxAmount), new Prisma.Decimal(0)).toDecimalPlaces(2);
  const discount = toDecimal(params.discountAmount ?? 0);
  if (discount.isNegative()) {
    throw new InvoiceValidationError("Discount cannot be negative.");
  }
  if (discount.greaterThan(subtotal)) {
    throw new InvoiceValidationError("Discount cannot exceed the invoice subtotal.");
  }
  const totalAmount = subtotal.minus(discount).plus(taxAmount).toDecimalPlaces(2);
  return { subtotal, taxAmount, totalAmount };
}

/** Editable-in-place statuses — DRAFT invoices only. Every other status
 * requires the controlled correction/cancellation workflow. */
export function isInvoiceEditable(status: InvoiceStatus): boolean {
  return status === "DRAFT";
}

export function canCancelInvoice(status: InvoiceStatus): boolean {
  return status !== "CANCELLED" && status !== "PAID";
}

/**
 * Derives the invoice's payment-facing status from its allocated-payment
 * total — never a manually editable "paid" flag. `isDraft`/`isCancelled`
 * are the two statuses set explicitly by their own actions (create /
 * cancel) and are never overridden here regardless of payment state.
 * `sentAt` (not a stored "SENT" status flag) is what distinguishes
 * APPROVED from SENT once nothing is allocated yet — using the
 * timestamp rather than the last-known enum value means this function
 * gives the same answer whether it's called right after approval or
 * re-derived later after an allocation is added and then removed again.
 */
export function deriveInvoiceStatus(params: {
  isDraft: boolean;
  isCancelled: boolean;
  sentAt: Date | null;
  totalAmount: DecimalInput;
  amountAllocated: DecimalInput;
  dueDate: Date | null;
  now?: Date;
}): InvoiceStatus {
  if (params.isDraft) return "DRAFT";
  if (params.isCancelled) return "CANCELLED";

  const total = toDecimal(params.totalAmount);
  const allocated = toDecimal(params.amountAllocated);
  const now = params.now ?? new Date();

  let status: InvoiceStatus;
  if (allocated.greaterThanOrEqualTo(total) && total.greaterThan(0)) {
    status = "PAID";
  } else if (allocated.greaterThan(0)) {
    status = "PARTIALLY_PAID";
  } else {
    status = params.sentAt != null ? "SENT" : "APPROVED";
  }

  const isOverdue = status !== "PAID" && params.dueDate != null && params.dueDate.getTime() < now.getTime() && allocated.lessThan(total);
  return isOverdue ? "OVERDUE" : status;
}
