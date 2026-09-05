/**
 * Shared display formatters for Phase 2 finance screens. Centralized so
 * every money/date value in the app renders identically instead of each
 * page re-declaring its own Intl.NumberFormat/DateTimeFormat instance —
 * purely presentational, never used for calculation (all financial math
 * stays in src/lib/business/*.ts on Decimal values).
 */

const currencyFormatter = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });
const preciseCurrencyFormatter = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", minimumFractionDigits: 2, maximumFractionDigits: 2 });
const dateFormatter = new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeZone: "Asia/Kolkata" });
const dateTimeFormatter = new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" });
// UTC, not Asia/Kolkata — year/month here are plain calendar values (e.g.
// from ClosingPeriod), not an instant that needs zone conversion; using the
// business timezone here could shift the displayed month at the boundary.
const monthYearFormatter = new Intl.DateTimeFormat("en-IN", { month: "long", year: "numeric", timeZone: "UTC" });

type MoneyInput = { toString(): string } | number | string | null | undefined;

function toNumber(value: MoneyInput): number {
  if (value === null || value === undefined) return 0;
  return typeof value === "number" ? value : Number(value.toString());
}

/** Whole-rupee display for compact contexts (stat cards, list rows). */
export function formatCurrency(value: MoneyInput): string {
  return currencyFormatter.format(toNumber(value));
}

/** Paise-precise display for line items and totals where exactness
 * matters (invoice lines, ledger rows). */
export function formatCurrencyPrecise(value: MoneyInput): string {
  return preciseCurrencyFormatter.format(toNumber(value));
}

export function formatDate(value: Date | string | null | undefined): string {
  if (!value) return "—";
  const date = typeof value === "string" ? new Date(value) : value;
  return Number.isNaN(date.getTime()) ? "—" : dateFormatter.format(date);
}

export function formatDateTime(value: Date | string | null | undefined): string {
  if (!value) return "—";
  const date = typeof value === "string" ? new Date(value) : value;
  return Number.isNaN(date.getTime()) ? "—" : dateTimeFormatter.format(date);
}

/** "January 2026" for a plain (year, month 1-12) calendar pair — e.g. a
 * ClosingPeriod's own year/month, not a Date instant. */
export function formatMonthYear(year: number, month1to12: number): string {
  return monthYearFormatter.format(new Date(Date.UTC(year, month1to12 - 1, 1)));
}

/** "YYYY-MM-DD" for native <input type="date"> defaultValue props. */
export function toDateInputValue(value: Date | string | null | undefined): string {
  if (!value) return "";
  const date = typeof value === "string" ? new Date(value) : value;
  return Number.isNaN(date.getTime()) ? "" : date.toISOString().slice(0, 10);
}
