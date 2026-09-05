import "server-only";

import { ZodError } from "zod";
import { AuthorizationError } from "@/lib/auth/authorize";

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
  if (
    error instanceof Error &&
    (error.name === "DailyLogValidationError" ||
      error.name === "FuelValidationError" ||
      error.name === "ExpenseValidationError")
  ) {
    return { success: false, message: error.message };
  }
  console.error(error);
  return { success: false, message: "Something went wrong. Please try again." };
}
