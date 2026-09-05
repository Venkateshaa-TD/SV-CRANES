import { Prisma } from "@prisma/client";

/**
 * Pure daily-log business rules: meter/odometer validation, working-hours
 * and distance calculation, suspicious-jump detection, and the
 * chronology-safe rule for advancing a vehicle's denormalized "current"
 * readings. None of this touches the database — see
 * src/lib/actions/daily-logs.ts for the transactional orchestration that
 * calls into these functions. Keeping the rules here (not in a React
 * component, and not inline in the server action) is what makes them
 * independently unit-testable and reusable from both create and edit
 * flows.
 */

export class DailyLogValidationError extends Error {}

/** A daily log's working hours exceeding this many hours in one day is
 * flagged for review rather than silently accepted. Not a hard limit —
 * genuinely long shifts happen — just a sanity check surfaced to
 * reviewers. */
export const SUSPICIOUS_WORKING_HOURS_THRESHOLD = 20;

/** A daily log's distance exceeding this many km in one day is flagged
 * for review. */
export const SUSPICIOUS_DISTANCE_THRESHOLD_KM = 500;

export type DecimalInput = Prisma.Decimal | number | string;

function toDecimal(value: DecimalInput): Prisma.Decimal {
  return value instanceof Prisma.Decimal ? value : new Prisma.Decimal(value);
}

export interface MeterReadings {
  startHourMeter: DecimalInput;
  endHourMeter: DecimalInput;
  startOdometer: DecimalInput;
  endOdometer: DecimalInput;
}

/**
 * Rejects structurally invalid readings: negative values, or an end
 * reading before its start reading. This is independent of any other
 * log's history — see `assertNoRollback` for the chronology check.
 */
export function validateMeterReadings(readings: MeterReadings): void {
  const startHour = toDecimal(readings.startHourMeter);
  const endHour = toDecimal(readings.endHourMeter);
  const startOdo = toDecimal(readings.startOdometer);
  const endOdo = toDecimal(readings.endOdometer);

  if (startHour.isNegative() || endHour.isNegative() || startOdo.isNegative() || endOdo.isNegative()) {
    throw new DailyLogValidationError("Meter and odometer readings cannot be negative.");
  }
  if (endHour.lessThan(startHour)) {
    throw new DailyLogValidationError("End hour meter cannot be less than the start hour meter.");
  }
  if (endOdo.lessThan(startOdo)) {
    throw new DailyLogValidationError("End odometer cannot be less than the start odometer.");
  }
}

export function computeWorkingHours(startHourMeter: DecimalInput, endHourMeter: DecimalInput): Prisma.Decimal {
  return toDecimal(endHourMeter).minus(toDecimal(startHourMeter));
}

export function computeDistance(startOdometer: DecimalInput, endOdometer: DecimalInput): Prisma.Decimal {
  return toDecimal(endOdometer).minus(toDecimal(startOdometer));
}

/**
 * Rejects a new log whose start reading regresses behind the
 * chronologically-preceding log's end reading (the "rollback" case — e.g.
 * a typo of 5420 entered after a log already ended at 6420). `priorLog`
 * should be the log immediately before this one by date for the same
 * vehicle (see findPriorChronologicalLog), or null if this is the
 * earliest log on record for the vehicle — in which case the vehicle's
 * baseline reading (set at vehicle creation/edit) is used instead, when
 * present.
 */
export function assertNoRollback(params: {
  newStartHourMeter: DecimalInput;
  newStartOdometer: DecimalInput;
  priorEndHourMeter: DecimalInput | null | undefined;
  priorEndOdometer: DecimalInput | null | undefined;
}): void {
  const newStartHour = toDecimal(params.newStartHourMeter);
  const newStartOdo = toDecimal(params.newStartOdometer);

  if (params.priorEndHourMeter != null && newStartHour.lessThan(toDecimal(params.priorEndHourMeter))) {
    throw new DailyLogValidationError(
      `Start hour meter (${newStartHour.toString()}) is below the previous recorded reading (${toDecimal(
        params.priorEndHourMeter,
      ).toString()}). Check for a data entry error, or use an authorized correction.`,
    );
  }
  if (params.priorEndOdometer != null && newStartOdo.lessThan(toDecimal(params.priorEndOdometer))) {
    throw new DailyLogValidationError(
      `Start odometer (${newStartOdo.toString()}) is below the previous recorded reading (${toDecimal(
        params.priorEndOdometer,
      ).toString()}). Check for a data entry error, or use an authorized correction.`,
    );
  }
}

/**
 * Rejects a log whose END reading exceeds the chronologically-following
 * log's START reading (the "forward overrun" case — inserting or editing
 * a historical entry so that it ends higher than what the vehicle was
 * already recorded at afterward, which is chronologically impossible
 * since meters only increase). `nextLog` should be the nearest log after
 * this one by date for the same vehicle (see findNextChronologicalLog),
 * or null if this is the latest log on record — in which case there is no
 * upper bound to check.
 */
export function assertNoForwardOverrun(params: {
  newEndHourMeter: DecimalInput;
  newEndOdometer: DecimalInput;
  nextStartHourMeter: DecimalInput | null | undefined;
  nextStartOdometer: DecimalInput | null | undefined;
}): void {
  const newEndHour = toDecimal(params.newEndHourMeter);
  const newEndOdo = toDecimal(params.newEndOdometer);

  if (params.nextStartHourMeter != null && newEndHour.greaterThan(toDecimal(params.nextStartHourMeter))) {
    throw new DailyLogValidationError(
      `End hour meter (${newEndHour.toString()}) is above the next recorded reading (${toDecimal(
        params.nextStartHourMeter,
      ).toString()}). A historical entry cannot end higher than a reading already logged after it.`,
    );
  }
  if (params.nextStartOdometer != null && newEndOdo.greaterThan(toDecimal(params.nextStartOdometer))) {
    throw new DailyLogValidationError(
      `End odometer (${newEndOdo.toString()}) is above the next recorded reading (${toDecimal(
        params.nextStartOdometer,
      ).toString()}). A historical entry cannot end higher than a reading already logged after it.`,
    );
  }
}

export interface SuspiciousJumpResult {
  flagged: boolean;
  reason: string | null;
}

/**
 * Flags (rather than blocks) a log whose working hours or distance are
 * implausibly large for a single day — e.g. 5420 → 6420 in one day. This
 * is a review signal, not a hard rejection: real long shifts and long
 * transport days do happen.
 */
export function checkSuspiciousJump(workingHours: DecimalInput, distance: DecimalInput): SuspiciousJumpResult {
  const hours = toDecimal(workingHours);
  const km = toDecimal(distance);
  const reasons: string[] = [];

  if (hours.greaterThan(SUSPICIOUS_WORKING_HOURS_THRESHOLD)) {
    reasons.push(`Working hours (${hours.toString()}) exceed the ${SUSPICIOUS_WORKING_HOURS_THRESHOLD}h/day threshold.`);
  }
  if (km.greaterThan(SUSPICIOUS_DISTANCE_THRESHOLD_KM)) {
    reasons.push(`Distance (${km.toString()} km) exceeds the ${SUSPICIOUS_DISTANCE_THRESHOLD_KM}km/day threshold.`);
  }

  return { flagged: reasons.length > 0, reason: reasons.length > 0 ? reasons.join(" ") : null };
}

/**
 * The chronology-safe rule for advancing a vehicle's denormalized
 * "current" readings: always the MAX of what's already recorded and this
 * log's end reading. A forward-dated log naturally raises the current
 * reading; a backdated/historical log — whose end reading is, by
 * definition, lower than what later logs already pushed the vehicle to —
 * leaves it untouched. Never decreases either field.
 */
export function computeAdvancedVehicleMeters(params: {
  currentHourMeter: DecimalInput | null | undefined;
  currentOdometer: DecimalInput | null | undefined;
  logEndHourMeter: DecimalInput;
  logEndOdometer: DecimalInput;
}): { hourMeter: Prisma.Decimal; odometer: Prisma.Decimal } {
  const currentHour = params.currentHourMeter != null ? toDecimal(params.currentHourMeter) : null;
  const currentOdo = params.currentOdometer != null ? toDecimal(params.currentOdometer) : null;
  const logEndHour = toDecimal(params.logEndHourMeter);
  const logEndOdo = toDecimal(params.logEndOdometer);

  return {
    hourMeter: currentHour == null ? logEndHour : Prisma.Decimal.max(currentHour, logEndHour),
    odometer: currentOdo == null ? logEndOdo : Prisma.Decimal.max(currentOdo, logEndOdo),
  };
}
