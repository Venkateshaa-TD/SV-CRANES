import { Prisma } from "@prisma/client";

/**
 * Pure billing-calculation rules for all four billing types (HOURLY,
 * DAILY, MONTHLY, FIXED). None of this touches the database — the
 * calling action (src/lib/actions/billing-drafts.ts) is responsible for
 * loading the eligible source records (DailyLogs) and persisting the
 * resulting BillingDraft snapshot. Keeping the arithmetic here, isolated
 * from Prisma/queries, is what makes it independently unit-testable.
 *
 * Every function returns Decimal values only — never a JS number — so a
 * caller can persist the result directly without a floating-point
 * round-trip.
 */

export class BillingValidationError extends Error {}

export type DecimalInput = Prisma.Decimal | number | string;

function toDecimal(value: DecimalInput): Prisma.Decimal {
  return value instanceof Prisma.Decimal ? value : new Prisma.Decimal(value);
}

// ---------------------------------------------------------------------
// Billing configuration validation
// ---------------------------------------------------------------------

export interface BillingConfigInput {
  billingType: "HOURLY" | "DAILY" | "MONTHLY" | "FIXED";
  baseRate: DecimalInput;
  minimumGuaranteedHours?: DecimalInput | null;
  overtimeThresholdHours?: DecimalInput | null;
  overtimeRate?: DecimalInput | null;
  taxPercent?: DecimalInput | null;
}

/** Keeps a project's billing terms internally consistent — e.g. an
 * overtime rate with no threshold (or vice versa) would silently never
 * apply, which is worse than rejecting it up front. */
export function validateBillingConfig(config: BillingConfigInput): void {
  if (toDecimal(config.baseRate).lessThanOrEqualTo(0)) {
    throw new BillingValidationError("Base rate must be greater than zero.");
  }
  if (config.taxPercent != null) {
    const tax = toDecimal(config.taxPercent);
    if (tax.isNegative() || tax.greaterThan(100)) {
      throw new BillingValidationError("Tax percent must be between 0 and 100.");
    }
  }
  if (config.billingType !== "HOURLY") {
    if (config.minimumGuaranteedHours != null || config.overtimeThresholdHours != null || config.overtimeRate != null) {
      throw new BillingValidationError("Minimum hours and overtime rules only apply to HOURLY billing.");
    }
    return;
  }
  if (config.minimumGuaranteedHours != null && toDecimal(config.minimumGuaranteedHours).isNegative()) {
    throw new BillingValidationError("Minimum guaranteed hours cannot be negative.");
  }
  const hasThreshold = config.overtimeThresholdHours != null;
  const hasRate = config.overtimeRate != null;
  if (hasThreshold !== hasRate) {
    throw new BillingValidationError("Overtime rate and overtime threshold hours must be set together.");
  }
  if (hasThreshold && toDecimal(config.overtimeThresholdHours!).lessThanOrEqualTo(0)) {
    throw new BillingValidationError("Overtime threshold hours must be greater than zero.");
  }
  if (hasRate && toDecimal(config.overtimeRate!).lessThanOrEqualTo(0)) {
    throw new BillingValidationError("Overtime rate must be greater than zero.");
  }
}

// ---------------------------------------------------------------------
// HOURLY
// ---------------------------------------------------------------------

export interface HourlyLogInput {
  dailyLogId: string;
  logDate: Date;
  workingHours: DecimalInput;
}

export interface HourlyBillingConfig {
  baseRate: DecimalInput;
  /** A day with valid activity is billed for at least this many hours,
   * even if actual working hours were lower. */
  minimumGuaranteedHours?: DecimalInput | null;
  /** Hours beyond this many in a single day are billed at overtimeRate.
   * Must be set together with overtimeRate, or not at all. */
  overtimeThresholdHours?: DecimalInput | null;
  overtimeRate?: DecimalInput | null;
}

export interface HourlyLogBreakdown {
  dailyLogId: string;
  logDate: Date;
  actualHours: string;
  billableHours: string;
  normalHours: string;
  overtimeHours: string;
  amount: string;
}

export interface HourlyBillingResult {
  /** Total billable hours (normal + overtime) — the draft's `quantity`. */
  quantity: Prisma.Decimal;
  baseAmount: Prisma.Decimal;
  totalNormalHours: Prisma.Decimal;
  totalOvertimeHours: Prisma.Decimal;
  perLog: HourlyLogBreakdown[];
}

/**
 * HOURLY billing: sums per-day billable hours (each day independently
 * subject to the minimum-guarantee and overtime-threshold rules — a
 * short day on one date doesn't borrow hours from a long day on
 * another) and prices normal vs. overtime hours separately.
 */
export function calculateHourlyBilling(logs: HourlyLogInput[], config: HourlyBillingConfig): HourlyBillingResult {
  if (logs.length === 0) {
    throw new BillingValidationError("No eligible daily logs were found in this billing period.");
  }
  const baseRate = toDecimal(config.baseRate);
  const minHours = config.minimumGuaranteedHours != null ? toDecimal(config.minimumGuaranteedHours) : null;
  const otThreshold = config.overtimeThresholdHours != null ? toDecimal(config.overtimeThresholdHours) : null;
  const otRate = config.overtimeRate != null ? toDecimal(config.overtimeRate) : baseRate;

  let totalNormal = new Prisma.Decimal(0);
  let totalOvertime = new Prisma.Decimal(0);
  let baseAmount = new Prisma.Decimal(0);
  const perLog: HourlyLogBreakdown[] = [];

  for (const log of logs) {
    const actual = toDecimal(log.workingHours);
    const billable = minHours != null && actual.lessThan(minHours) ? minHours : actual;

    let normal = billable;
    let overtime = new Prisma.Decimal(0);
    if (otThreshold != null && billable.greaterThan(otThreshold)) {
      normal = otThreshold;
      overtime = billable.minus(otThreshold);
    }

    const amount = normal.times(baseRate).plus(overtime.times(otRate)).toDecimalPlaces(2);
    totalNormal = totalNormal.plus(normal);
    totalOvertime = totalOvertime.plus(overtime);
    baseAmount = baseAmount.plus(amount);

    perLog.push({
      dailyLogId: log.dailyLogId,
      logDate: log.logDate,
      actualHours: actual.toString(),
      billableHours: billable.toString(),
      normalHours: normal.toString(),
      overtimeHours: overtime.toString(),
      amount: amount.toString(),
    });
  }

  return {
    quantity: totalNormal.plus(totalOvertime).toDecimalPlaces(2),
    baseAmount: baseAmount.toDecimalPlaces(2),
    totalNormalHours: totalNormal.toDecimalPlaces(2),
    totalOvertimeHours: totalOvertime.toDecimalPlaces(2),
    perLog,
  };
}

// ---------------------------------------------------------------------
// DAILY
// ---------------------------------------------------------------------

export interface DailyEligibleDay {
  /** One representative DailyLog id for this calendar day (for
   * drill-down) — see findEligibleBillingDays for how a day qualifies. */
  dailyLogId: string;
  logDate: Date;
}

export interface DailyBillingConfig {
  baseRate: DecimalInput;
}

export interface DailyBillingResult {
  quantity: Prisma.Decimal;
  baseAmount: Prisma.Decimal;
  eligibleDays: DailyEligibleDay[];
}

/**
 * DAILY billing rule (documented per Phase 2 spec — not a blind calendar
 * count): a day is "eligible" when the project has at least one
 * non-archived, APPROVED DailyLog on that business-local calendar date
 * with positive working hours. Callers pass in the already-deduplicated
 * list of qualifying days (one row per calendar day) — see
 * src/lib/data/finance-queries.ts#findEligibleBillingDays for how that
 * list is produced from raw DailyLog rows.
 */
export function calculateDailyBilling(eligibleDays: DailyEligibleDay[], config: DailyBillingConfig): DailyBillingResult {
  if (eligibleDays.length === 0) {
    throw new BillingValidationError("No eligible operational days were found in this billing period.");
  }
  const rate = toDecimal(config.baseRate);
  const quantity = new Prisma.Decimal(eligibleDays.length);
  return { quantity, baseAmount: quantity.times(rate).toDecimalPlaces(2), eligibleDays };
}

// ---------------------------------------------------------------------
// MONTHLY
// ---------------------------------------------------------------------

export interface MonthlyBillingConfig {
  baseRate: DecimalInput;
}

export interface MonthlyBillingResult {
  quantity: Prisma.Decimal;
  baseAmount: Prisma.Decimal;
  prorated: boolean;
}

/**
 * MONTHLY billing: bills the full configured monthly rate for a period
 * that is exactly one full calendar month. A partial period is only
 * billed via explicit, caller-opted-in proration (allowProration) —
 * proration is never invented silently. When prorating, the rate is
 * split by calendar days in the period over calendar days in that month.
 */
export function calculateMonthlyBilling(params: {
  config: MonthlyBillingConfig;
  isFullCalendarMonth: boolean;
  daysInPeriod: number;
  daysInMonth: number;
  allowProration: boolean;
}): MonthlyBillingResult {
  const rate = toDecimal(params.config.baseRate);
  if (params.isFullCalendarMonth) {
    return { quantity: new Prisma.Decimal(1), baseAmount: rate.toDecimalPlaces(2), prorated: false };
  }
  if (!params.allowProration) {
    throw new BillingValidationError(
      "The selected period is not a full calendar month. Select a full calendar month, or explicitly enable proration for this partial period.",
    );
  }
  const fraction = new Prisma.Decimal(params.daysInPeriod).dividedBy(params.daysInMonth);
  return {
    quantity: fraction.toDecimalPlaces(4),
    baseAmount: rate.times(fraction).toDecimalPlaces(2),
    prorated: true,
  };
}

// ---------------------------------------------------------------------
// FIXED
// ---------------------------------------------------------------------

export interface FixedBillingConfig {
  baseRate: DecimalInput;
}

export interface FixedBillingResult {
  quantity: Prisma.Decimal;
  baseAmount: Prisma.Decimal;
}

/** FIXED billing: the agreed lump sum, always subject to the same
 * draft -> review -> approval gate as every other billing type — never
 * issued automatically. */
export function calculateFixedBilling(config: FixedBillingConfig): FixedBillingResult {
  const amount = toDecimal(config.baseRate);
  if (amount.lessThanOrEqualTo(0)) {
    throw new BillingValidationError("Fixed billing amount must be greater than zero.");
  }
  return { quantity: new Prisma.Decimal(1), baseAmount: amount.toDecimalPlaces(2) };
}

// ---------------------------------------------------------------------
// Additional charges, tax, and draft totals — shared by every type
// ---------------------------------------------------------------------

export interface BillingChargeInput {
  description: string;
  amount: DecimalInput;
}

export function validateAdditionalCharge(charge: BillingChargeInput): void {
  if (!charge.description.trim()) {
    throw new BillingValidationError("Each additional charge needs a description.");
  }
  if (toDecimal(charge.amount).lessThanOrEqualTo(0)) {
    throw new BillingValidationError("Each additional charge amount must be greater than zero.");
  }
}

export function sumAdditionalCharges(charges: BillingChargeInput[]): Prisma.Decimal {
  return charges.reduce((sum, c) => sum.plus(toDecimal(c.amount)), new Prisma.Decimal(0)).toDecimalPlaces(2);
}

export function computeBillingTax(taxableAmount: DecimalInput, taxPercent: DecimalInput): Prisma.Decimal {
  return toDecimal(taxableAmount).times(toDecimal(taxPercent)).dividedBy(100).toDecimalPlaces(2);
}

export interface BillingDraftTotals {
  baseAmount: Prisma.Decimal;
  additionalChargesAmount: Prisma.Decimal;
  taxAmount: Prisma.Decimal;
  totalAmount: Prisma.Decimal;
}

/** Combines base amount + additional charges + tax into the draft's
 * final proposed total. Tax is applied to (base + additional charges) —
 * the whole taxable base, not just the recurring rate portion. */
export function computeBillingDraftTotals(params: {
  baseAmount: DecimalInput;
  additionalChargesAmount: DecimalInput;
  taxPercent: DecimalInput;
}): BillingDraftTotals {
  const base = toDecimal(params.baseAmount).toDecimalPlaces(2);
  const charges = toDecimal(params.additionalChargesAmount).toDecimalPlaces(2);
  const taxable = base.plus(charges);
  const tax = computeBillingTax(taxable, params.taxPercent);
  return { baseAmount: base, additionalChargesAmount: charges, taxAmount: tax, totalAmount: taxable.plus(tax).toDecimalPlaces(2) };
}

// ---------------------------------------------------------------------
// Billing period helpers
// ---------------------------------------------------------------------

/** Whole calendar days spanned by [start, end], both inclusive, as pure
 * Y/M/D arithmetic on business-local dates — callers pass in dates
 * already normalized to business-local midnight (see business-time.ts). */
export function daysBetweenInclusive(start: Date, end: Date): number {
  const MS_PER_DAY = 24 * 60 * 60 * 1000;
  return Math.round((end.getTime() - start.getTime()) / MS_PER_DAY) + 1;
}

export function daysInMonth(year: number, month1to12: number): number {
  return new Date(Date.UTC(year, month1to12, 0)).getUTCDate();
}
