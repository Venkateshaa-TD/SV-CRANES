import { Prisma } from "@prisma/client";

export class ExpenseValidationError extends Error {}

type DecimalInput = Prisma.Decimal | number | string;

function toDecimal(value: DecimalInput): Prisma.Decimal {
  return value instanceof Prisma.Decimal ? value : new Prisma.Decimal(value);
}

export function validateExpenseAmount(amount: DecimalInput): void {
  const value = toDecimal(amount);
  if (!value.isPositive() || value.isZero()) {
    throw new ExpenseValidationError("Amount must be greater than zero.");
  }
}

/** Rejecting an expense without a reason leaves the submitter with no
 * actionable feedback — always require one. */
export function validateRejectionReason(reason: string | null | undefined): void {
  if (!reason || reason.trim().length === 0) {
    throw new ExpenseValidationError("A reason is required to reject an expense.");
  }
}
