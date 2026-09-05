import "server-only";

import { ZodError } from "zod";
import { AuthorizationError } from "@/lib/auth/authorize";
import { DailyLogValidationError } from "@/lib/business/daily-log";
import { FuelValidationError } from "@/lib/business/fuel";
import { ExpenseValidationError } from "@/lib/business/expense";
import { BillingValidationError } from "@/lib/business/billing";
import { ProjectValidationError } from "@/lib/business/project";
import { InvoiceValidationError } from "@/lib/business/invoice";
import { PaymentValidationError } from "@/lib/business/payment";
import { LedgerAdjustmentValidationError } from "@/lib/business/ledger";
import { ClosingPeriodValidationError, PeriodLockedError } from "@/lib/business/closing-period";

/** Every domain-specific "validation failed, here's a user-facing
 * message" error recognized by toActionError. `class Foo extends Error
 * {}` does NOT set `.name` to "Foo" at runtime (it stays "Error" unless
 * the subclass constructor explicitly assigns it) — so matching on
 * `error.name` is unreliable. `instanceof` against the actual class is
 * the correct check regardless of that quirk. */
const KNOWN_VALIDATION_ERROR_CLASSES = [
  DailyLogValidationError,
  FuelValidationError,
  ExpenseValidationError,
  BillingValidationError,
  ProjectValidationError,
  InvoiceValidationError,
  PaymentValidationError,
  LedgerAdjustmentValidationError,
  ClosingPeriodValidationError,
  PeriodLockedError,
] as const;

export interface ActionResult<T = undefined> {
  success: boolean;
  message?: string;
  fieldErrors?: Record<string, string>;
  data?: T;
}

export function ok<T>(message?: string, data?: T): ActionResult<T> {
  return { success: true, message, data };
}

/**
 * A rejection whose message is already written for the end user — e.g.
 * "Selected vehicle was not found." Use this (never a plain `Error`) for
 * anything thrown out of input-resolution helpers that should reach the
 * user verbatim; toActionError only forwards messages from error types it
 * recognizes, and a plain Error is deliberately NOT one of them (so a
 * stray internal error doesn't accidentally leak its message to the
 * client) — a plain `throw new Error(...)` here would silently collapse
 * to the generic "Something went wrong" instead.
 */
export class ActionInputError extends Error {}

function fieldErrorsFromZod(error: ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "_form";
    if (!out[key]) out[key] = issue.message;
  }
  return out;
}

/**
 * Converts a caught error into a safe, user-facing ActionResult. Known
 * validation/authorization errors surface their message directly (they're
 * already written for end users); anything else collapses to a generic
 * message so internals/stack traces never reach the client.
 */
export function toActionError(error: unknown): ActionResult<never> {
  if (error instanceof ZodError) {
    return { success: false, message: "Please fix the highlighted fields.", fieldErrors: fieldErrorsFromZod(error) };
  }
  if (error instanceof AuthorizationError || error instanceof ActionInputError) {
    return { success: false, message: error.message };
  }
  if (KNOWN_VALIDATION_ERROR_CLASSES.some((ErrorClass) => error instanceof ErrorClass)) {
    return { success: false, message: (error as Error).message };
  }
  console.error(error);
  return { success: false, message: "Something went wrong. Please try again." };
}
