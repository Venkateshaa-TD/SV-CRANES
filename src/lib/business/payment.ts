import { Prisma, type InvoiceStatus } from "@prisma/client";

/**
 * Pure payment/allocation rules. None of this touches the database — see
 * src/lib/actions/payments.ts for the transactional orchestration
 * (row locking, atomic recompute) that calls into these functions.
 */

export class PaymentValidationError extends Error {}

export type DecimalInput = Prisma.Decimal | number | string;

function toDecimal(value: DecimalInput): Prisma.Decimal {
  return value instanceof Prisma.Decimal ? value : new Prisma.Decimal(value);
}

export function validatePaymentAmount(amount: DecimalInput): void {
  if (toDecimal(amount).lessThanOrEqualTo(0)) {
    throw new PaymentValidationError("Payment amount must be greater than zero.");
  }
}

/** A payment's unallocated remainder — the portion still available to
 * allocate to any invoice (including a future one). This IS the
 * documented overpayment/credit mechanism: an amount left unallocated on
 * a payment is never lost and never distorts any invoice's total; it
 * simply remains available until allocated. */
export function computeUnallocatedAmount(paymentAmount: DecimalInput, existingAllocations: DecimalInput[]): Prisma.Decimal {
  const allocated = existingAllocations.reduce<Prisma.Decimal>((sum, a) => sum.plus(toDecimal(a)), new Prisma.Decimal(0));
  return toDecimal(paymentAmount).minus(allocated).toDecimalPlaces(2);
}

/** An invoice's outstanding balance — always DERIVED from
 * totalAmount minus allocated payments, never a stored, independently
 * editable field. */
export function computeInvoiceOutstanding(totalAmount: DecimalInput, existingAllocations: DecimalInput[]): Prisma.Decimal {
  const allocated = existingAllocations.reduce<Prisma.Decimal>((sum, a) => sum.plus(toDecimal(a)), new Prisma.Decimal(0));
  return toDecimal(totalAmount).minus(allocated).toDecimalPlaces(2);
}

export interface AllocationRequest {
  invoiceId: string;
  amount: DecimalInput;
}

export interface AllocationValidationContext {
  paymentUnallocated: DecimalInput;
  invoiceCompanyId: string;
  invoiceCustomerId: string;
  paymentCompanyId: string;
  paymentCustomerId: string;
  invoiceStatus: InvoiceStatus;
  invoiceOutstanding: DecimalInput;
}

/**
 * Validates one proposed allocation against every documented business
 * rule before it is persisted:
 *  - positive amount
 *  - cannot exceed the payment's remaining unallocated amount
 *  - cannot exceed the invoice's own outstanding balance (no overpayment
 *    distorting a single invoice's total — the excess stays unallocated
 *    on the payment instead)
 *  - company and customer must match between payment and invoice
 *  - a cancelled invoice can never receive an allocation
 *  - a DRAFT invoice (not yet approved/issued, still freely editable —
 *    see isInvoiceEditable) can never receive an allocation either: its
 *    amount can still change, so recording a payment against it first
 *    would let a later edit silently push the invoice's outstanding
 *    negative
 *  - a fully paid invoice (zero outstanding) can never receive a further
 *    allocation
 * Throws PaymentValidationError with a user-facing message on the first
 * rule violated. The UI's own candidate-invoice list already excludes
 * DRAFT/CANCELLED invoices, but this check is the real enforcement —
 * never rely on the client having hidden the option.
 */
export function validateAllocation(request: AllocationRequest, context: AllocationValidationContext): void {
  const amount = toDecimal(request.amount);
  if (amount.lessThanOrEqualTo(0)) {
    throw new PaymentValidationError("Allocation amount must be greater than zero.");
  }
  if (context.paymentCompanyId !== context.invoiceCompanyId) {
    throw new PaymentValidationError("This invoice does not belong to the same company as the payment.");
  }
  if (context.paymentCustomerId !== context.invoiceCustomerId) {
    throw new PaymentValidationError("This invoice does not belong to the same customer as the payment.");
  }
  if (context.invoiceStatus === "CANCELLED") {
    throw new PaymentValidationError("A cancelled invoice cannot receive a payment allocation.");
  }
  if (context.invoiceStatus === "DRAFT") {
    throw new PaymentValidationError("A draft invoice must be approved before it can receive a payment allocation.");
  }
  const unallocated = toDecimal(context.paymentUnallocated);
  if (amount.greaterThan(unallocated)) {
    throw new PaymentValidationError(
      `Allocation amount (${amount.toString()}) exceeds the payment's unallocated balance (${unallocated.toString()}).`,
    );
  }
  const outstanding = toDecimal(context.invoiceOutstanding);
  if (outstanding.lessThanOrEqualTo(0)) {
    throw new PaymentValidationError("This invoice is already fully paid and cannot receive a further allocation.");
  }
  if (amount.greaterThan(outstanding)) {
    throw new PaymentValidationError(
      `Allocation amount (${amount.toString()}) exceeds the invoice's outstanding balance (${outstanding.toString()}).`,
    );
  }
}

/** True once due date has passed and a positive balance remains. Never
 * inferred from a stored flag. */
export function isOverdue(params: { dueDate: Date | null; outstanding: DecimalInput; now?: Date }): boolean {
  if (!params.dueDate) return false;
  const now = params.now ?? new Date();
  return params.dueDate.getTime() < now.getTime() && toDecimal(params.outstanding).greaterThan(0);
}

export function daysOverdue(dueDate: Date | null, now: Date = new Date()): number {
  if (!dueDate) return 0;
  const diff = now.getTime() - dueDate.getTime();
  return diff > 0 ? Math.floor(diff / (24 * 60 * 60 * 1000)) : 0;
}
