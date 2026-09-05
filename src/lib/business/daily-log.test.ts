import { describe, expect, it } from "vitest";
import { Prisma } from "@prisma/client";
import {
  DailyLogValidationError,
  assertNoForwardOverrun,
  assertNoRollback,
  checkSuspiciousJump,
  computeAdvancedVehicleMeters,
  computeDistance,
  computeWorkingHours,
  validateMeterReadings,
} from "./daily-log";

describe("computeWorkingHours", () => {
  it("subtracts start from end", () => {
    expect(computeWorkingHours(100, 108.5).toString()).toBe("8.5");
  });
});

describe("computeDistance", () => {
  it("subtracts start odometer from end odometer", () => {
    expect(computeDistance(1000, 1120).toString()).toBe("120");
  });
});

describe("validateMeterReadings", () => {
  const base = { startHourMeter: 100, endHourMeter: 108, startOdometer: 500, endOdometer: 550 };

  it("accepts a structurally valid reading", () => {
    expect(() => validateMeterReadings(base)).not.toThrow();
  });

  it("rejects end hour meter less than start hour meter", () => {
    expect(() => validateMeterReadings({ ...base, endHourMeter: 90 })).toThrow(DailyLogValidationError);
  });

  it("rejects end odometer less than start odometer", () => {
    expect(() => validateMeterReadings({ ...base, endOdometer: 400 })).toThrow(DailyLogValidationError);
  });

  it("rejects negative readings", () => {
    expect(() => validateMeterReadings({ ...base, startHourMeter: -5 })).toThrow(DailyLogValidationError);
  });
});

describe("assertNoRollback", () => {
  it("rejects a start hour meter below the prior log's end reading (rollback)", () => {
    // e.g. a prior log ended at 6420, and someone mistakenly enters 5420.
    expect(() =>
      assertNoRollback({
        newStartHourMeter: 5420,
        newStartOdometer: 100,
        priorEndHourMeter: 6420,
        priorEndOdometer: 100,
      }),
    ).toThrow(DailyLogValidationError);
  });

  it("accepts a start hour meter equal to or above the prior end reading", () => {
    expect(() =>
      assertNoRollback({ newStartHourMeter: 6420, newStartOdometer: 100, priorEndHourMeter: 6420, priorEndOdometer: 100 }),
    ).not.toThrow();
    expect(() =>
      assertNoRollback({ newStartHourMeter: 6500, newStartOdometer: 100, priorEndHourMeter: 6420, priorEndOdometer: 100 }),
    ).not.toThrow();
  });

  it("skips the check when there is no prior reading", () => {
    expect(() =>
      assertNoRollback({ newStartHourMeter: 10, newStartOdometer: 10, priorEndHourMeter: null, priorEndOdometer: null }),
    ).not.toThrow();
  });
});

describe("assertNoForwardOverrun", () => {
  it("rejects an end reading above the next known reading (impossible chronology)", () => {
    // A historical entry ending at 7000 can't be right if the vehicle was
    // already logged starting at 6800 on a later date.
    expect(() =>
      assertNoForwardOverrun({
        newEndHourMeter: 7000,
        newEndOdometer: 100,
        nextStartHourMeter: 6800,
        nextStartOdometer: 200,
      }),
    ).toThrow(DailyLogValidationError);
  });

  it("accepts an end reading at or below the next known reading", () => {
    expect(() =>
      assertNoForwardOverrun({
        newEndHourMeter: 6800,
        newEndOdometer: 200,
        nextStartHourMeter: 6800,
        nextStartOdometer: 200,
      }),
    ).not.toThrow();
    expect(() =>
      assertNoForwardOverrun({
        newEndHourMeter: 6500,
        newEndOdometer: 150,
        nextStartHourMeter: 6800,
        nextStartOdometer: 200,
      }),
    ).not.toThrow();
  });

  it("skips the check when there is no next reading (this is the latest log)", () => {
    expect(() =>
      assertNoForwardOverrun({
        newEndHourMeter: 999999,
        newEndOdometer: 999999,
        nextStartHourMeter: null,
        nextStartOdometer: null,
      }),
    ).not.toThrow();
  });
});

/**
 * Full chronology scenarios combining assertNoRollback (lower bound) and
 * assertNoForwardOverrun (upper bound) the way src/lib/actions/daily-logs.ts
 * applies them together for both create and edit.
 */
describe("chronology-consistent insert/edit scenarios", () => {
  function assertChronology(params: {
    start: number;
    end: number;
    priorEnd?: number | null;
    nextStart?: number | null;
  }) {
    assertNoRollback({
      newStartHourMeter: params.start,
      newStartOdometer: params.start,
      priorEndHourMeter: params.priorEnd ?? null,
      priorEndOdometer: params.priorEnd ?? null,
    });
    assertNoForwardOverrun({
      newEndHourMeter: params.end,
      newEndOdometer: params.end,
      nextStartHourMeter: params.nextStart ?? null,
      nextStartOdometer: params.nextStart ?? null,
    });
  }

  it("accepts the earliest historical insert when its end is below the next known reading", () => {
    // No prior log exists yet; the next log already on record starts at 500.
    expect(() => assertChronology({ start: 100, end: 400, priorEnd: null, nextStart: 500 })).not.toThrow();
  });

  it("rejects the earliest historical insert when its end is above the next known reading", () => {
    expect(() => assertChronology({ start: 100, end: 600, priorEnd: null, nextStart: 500 })).toThrow(
      DailyLogValidationError,
    );
  });

  it("accepts a middle historical insert that fits cleanly between two existing readings", () => {
    // Prior log ended at 500; next log starts at 800. This entry runs 500→750.
    expect(() => assertChronology({ start: 500, end: 750, priorEnd: 500, nextStart: 800 })).not.toThrow();
  });

  it("rejects a middle historical insert that contradicts either neighbor", () => {
    // Starts below the prior log's end.
    expect(() => assertChronology({ start: 450, end: 750, priorEnd: 500, nextStart: 800 })).toThrow(
      DailyLogValidationError,
    );
    // Ends above the next log's start.
    expect(() => assertChronology({ start: 500, end: 850, priorEnd: 500, nextStart: 800 })).toThrow(
      DailyLogValidationError,
    );
  });

  it("rejects a historical edit that would contradict the (unedited) next log", () => {
    // Editing an old log to now claim it ended at 900, while a later log on
    // record already starts at 800, is a contradiction — meters can't run
    // backwards between two already-recorded points.
    expect(() => assertChronology({ start: 500, end: 900, priorEnd: 500, nextStart: 800 })).toThrow(
      DailyLogValidationError,
    );
  });
});

describe("checkSuspiciousJump", () => {
  it("does not flag a normal working day", () => {
    const result = checkSuspiciousJump(8, 120);
    expect(result.flagged).toBe(false);
  });

  it("flags an implausible working-hours jump in one day", () => {
    // 5420 -> 6420 in a single day, as called out in the spec.
    const result = checkSuspiciousJump(1000, 0);
    expect(result.flagged).toBe(true);
    expect(result.reason).toContain("Working hours");
  });

  it("flags an implausible distance jump in one day", () => {
    const result = checkSuspiciousJump(2, 5000);
    expect(result.flagged).toBe(true);
    expect(result.reason).toContain("Distance");
  });
});

describe("computeAdvancedVehicleMeters", () => {
  it("advances the vehicle's current reading for a forward-dated log", () => {
    const result = computeAdvancedVehicleMeters({
      currentHourMeter: 6420,
      currentOdometer: 1000,
      logEndHourMeter: 6500,
      logEndOdometer: 1100,
    });
    expect(result.hourMeter.toString()).toBe("6500");
    expect(result.odometer.toString()).toBe("1100");
  });

  it("never reduces the vehicle's current reading for a backdated/historical log", () => {
    // The vehicle is already at 6420 from a later log; entering an earlier
    // historical log ending at 6000 must not roll the vehicle back.
    const result = computeAdvancedVehicleMeters({
      currentHourMeter: 6420,
      currentOdometer: 1000,
      logEndHourMeter: 6000,
      logEndOdometer: 900,
    });
    expect(result.hourMeter.toString()).toBe("6420");
    expect(result.odometer.toString()).toBe("1000");
  });

  it("uses the log's reading as the baseline when the vehicle has none yet", () => {
    const result = computeAdvancedVehicleMeters({
      currentHourMeter: null,
      currentOdometer: undefined,
      logEndHourMeter: 50,
      logEndOdometer: 25,
    });
    expect(result.hourMeter.toString()).toBe("50");
    expect(result.odometer.toString()).toBe("25");
  });

  it("works with Prisma.Decimal inputs directly", () => {
    const result = computeAdvancedVehicleMeters({
      currentHourMeter: new Prisma.Decimal("100.25"),
      currentOdometer: new Prisma.Decimal("500.5"),
      logEndHourMeter: new Prisma.Decimal("99.00"),
      logEndOdometer: new Prisma.Decimal("600.75"),
    });
    expect(result.hourMeter.toString()).toBe("100.25");
    expect(result.odometer.toString()).toBe("600.75");
  });

  it("preserves the vehicle's current meter across a historical insert regardless of insert order", () => {
    // Simulates: the vehicle is at 1050 from today's log. A historical
    // backfill for last week (ending at 1020) is inserted afterward — the
    // current reading must still read 1050, not drop to 1020.
    const afterBackfill = computeAdvancedVehicleMeters({
      currentHourMeter: 1050,
      currentOdometer: 50,
      logEndHourMeter: 1020,
      logEndOdometer: 40,
    });
    expect(afterBackfill.hourMeter.toString()).toBe("1050");
    expect(afterBackfill.odometer.toString()).toBe("50");
  });

  it("is order-independent (commutative) — a concurrency-relevant property", () => {
    // Two logs for the same vehicle, applied in either order, must land on
    // the same final "current" reading. This is what makes the MAX-based
    // update safe under the vehicle-row lock even though only one write
    // actually happens at a time: whichever of two nearly-simultaneous
    // submissions is serialized second still computes the correct result
    // from whatever the first one committed, in either arrival order.
    const logA = { end: 500, odo: 50 };
    const logB = { end: 480, odo: 45 };

    const aThenB = computeAdvancedVehicleMeters({
      currentHourMeter: computeAdvancedVehicleMeters({
        currentHourMeter: null,
        currentOdometer: null,
        logEndHourMeter: logA.end,
        logEndOdometer: logA.odo,
      }).hourMeter,
      currentOdometer: computeAdvancedVehicleMeters({
        currentHourMeter: null,
        currentOdometer: null,
        logEndHourMeter: logA.end,
        logEndOdometer: logA.odo,
      }).odometer,
      logEndHourMeter: logB.end,
      logEndOdometer: logB.odo,
    });

    const bThenA = computeAdvancedVehicleMeters({
      currentHourMeter: computeAdvancedVehicleMeters({
        currentHourMeter: null,
        currentOdometer: null,
        logEndHourMeter: logB.end,
        logEndOdometer: logB.odo,
      }).hourMeter,
      currentOdometer: computeAdvancedVehicleMeters({
        currentHourMeter: null,
        currentOdometer: null,
        logEndHourMeter: logB.end,
        logEndOdometer: logB.odo,
      }).odometer,
      logEndHourMeter: logA.end,
      logEndOdometer: logA.odo,
    });

    expect(aThenB.hourMeter.toString()).toBe(bThenA.hourMeter.toString());
    expect(aThenB.odometer.toString()).toBe(bThenA.odometer.toString());
    expect(aThenB.hourMeter.toString()).toBe("500");
  });
});
