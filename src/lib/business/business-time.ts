/**
 * Day/week/month boundaries anchored to the business's own timezone
 * (India), not whatever timezone the Node.js server process happens to be
 * running in. Without this, "Today" on the dashboard, the missing-log
 * check, and the daily-log "date cannot be in the future" guard would all
 * silently use the server's local time — correct in dev on a machine set
 * to IST, but wrong (by up to many hours) the moment the app is deployed
 * to a host running in UTC or any other zone. IST has a fixed UTC+5:30
 * offset with no daylight saving, so this can be done with plain
 * arithmetic — no timezone database/library needed.
 */

export const BUSINESS_TIMEZONE = "Asia/Kolkata";
const BUSINESS_UTC_OFFSET_MS = 5.5 * 60 * 60 * 1000;

const businessDatePartsFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: BUSINESS_TIMEZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export interface DateParts {
  year: number;
  month: number; // 1-12
  day: number;
}

export function businessLocalDateParts(date: Date): DateParts {
  const parts = businessDatePartsFormatter.formatToParts(date);
  const map = Object.fromEntries(parts.filter((p) => p.type !== "literal").map((p) => [p.type, p.value]));
  return { year: Number(map.year), month: Number(map.month), day: Number(map.day) };
}

/** The UTC instant corresponding to 00:00 business-local time on the given
 * business-local calendar date. */
function businessMidnightUtc({ year, month, day }: DateParts): Date {
  return new Date(Date.UTC(year, month - 1, day, 0, 0, 0) - BUSINESS_UTC_OFFSET_MS);
}

export function startOfBusinessDay(date: Date = new Date()): Date {
  return businessMidnightUtc(businessLocalDateParts(date));
}

export function startOfBusinessWeek(date: Date = new Date()): Date {
  const { year, month, day } = businessLocalDateParts(date);
  // Pure calendar-day arithmetic on the business-local Y/M/D — represented
  // as a UTC-midnight Date purely as a calculation convenience, not a real
  // instant, so .getUTCDay()/.setUTCDate() give the right calendar answer
  // regardless of the server's own timezone.
  const calendarDate = new Date(Date.UTC(year, month - 1, day));
  const dayOfWeek = calendarDate.getUTCDay(); // 0 = Sunday
  const diffToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  calendarDate.setUTCDate(calendarDate.getUTCDate() - diffToMonday);
  return businessMidnightUtc({
    year: calendarDate.getUTCFullYear(),
    month: calendarDate.getUTCMonth() + 1,
    day: calendarDate.getUTCDate(),
  });
}

export function startOfBusinessMonth(date: Date = new Date()): Date {
  const { year, month } = businessLocalDateParts(date);
  return businessMidnightUtc({ year, month, day: 1 });
}

export function startOfNextBusinessDay(date: Date = new Date()): Date {
  const start = startOfBusinessDay(date);
  return new Date(start.getTime() + 24 * 60 * 60 * 1000);
}

/** True when `date` falls after the end of business-local "today" — used
 * to reject a daily log dated in the future without being fooled by a
 * server clock in a different timezone. */
export function isAfterBusinessToday(date: Date, now: Date = new Date()): boolean {
  return date.getTime() >= startOfNextBusinessDay(now).getTime();
}

/** A stable "YYYY-MM-DD" key for the business-local calendar date of
 * `date` — used to deduplicate records onto distinct calendar days (e.g.
 * DAILY billing's eligible-day count) regardless of what time of day
 * each record's timestamp carries. */
export function businessDateKey(date: Date): string {
  const { year, month, day } = businessLocalDateParts(date);
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** True when [periodStart, periodEnd] (both business-midnight instants)
 * exactly span one full calendar month — used by MONTHLY billing to
 * decide whether proration is even a question. */
export function isFullBusinessCalendarMonth(periodStart: Date, periodEnd: Date): boolean {
  const start = businessLocalDateParts(periodStart);
  const end = businessLocalDateParts(periodEnd);
  if (start.year !== end.year || start.month !== end.month) return false;
  if (start.day !== 1) return false;
  const lastDayOfMonth = new Date(Date.UTC(start.year, start.month, 0)).getUTCDate();
  return end.day === lastDayOfMonth;
}

export function businessDaysInMonth(date: Date): number {
  const { year, month } = businessLocalDateParts(date);
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/**
 * The [startDate, endDate] boundaries (both inclusive) for a given
 * business-calendar (year, month), for month-closing period locks and
 * checklist queries. Deliberately plain UTC-midnight calendar arithmetic
 * — NOT offset by BUSINESS_UTC_OFFSET_MS like startOfBusinessMonth above
 * — because every date-only field this is compared against (DailyLog.
 * logDate, FuelEntry.entryDate, Expense.expenseDate, Invoice.issueDate,
 * Payment.paymentDate, BillingDraft.periodStart/End) is itself stored as
 * a plain UTC-midnight instant of its calendar-date string (see
 * src/lib/actions/daily-logs.ts and billing-drafts.ts for the same
 * convention). Using the IST-offset "true instant" boundary here would
 * misalign by 5.5 hours and silently exclude the first/last day's
 * records from range queries.
 */
export function calendarMonthRange(year: number, month1to12: number): { startDate: Date; endDate: Date } {
  return {
    startDate: new Date(Date.UTC(year, month1to12 - 1, 1, 0, 0, 0, 0)),
    endDate: new Date(Date.UTC(year, month1to12, 0, 23, 59, 59, 999)),
  };
}
