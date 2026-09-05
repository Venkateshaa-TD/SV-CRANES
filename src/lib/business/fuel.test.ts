import { describe, expect, it } from "vitest";
import {
  FuelValidationError,
  computeFuelEfficiency,
  computeFuelTotal,
  computeKmPerLitre,
  computeLitresPerHour,
  isSuspiciousFuelQuantity,
  validateFuelQuantities,
} from "./fuel";

describe("computeFuelTotal", () => {
  it("multiplies quantity by rate", () => {
    expect(computeFuelTotal(50, 95).toString()).toBe("4750");
  });

  it("is Decimal-safe for values that lose precision under floating point", () => {
    // 0.1 * 3 === 0.30000000000000004 in IEEE754 float arithmetic.
    expect(computeFuelTotal("0.1", "3").toString()).toBe("0.3");
    // 19.9 * 101.35 = 2016.865 exactly; rounded to 2dp this must be a
    // clean 2016.87, not a float artifact like 2016.8650000000002.
    expect(computeFuelTotal("19.9", "101.35").toString()).toBe("2016.87");
  });

  it("rounds to 2 decimal places", () => {
    expect(computeFuelTotal("10", "1.005").toString()).toBe("10.05");
  });
});

describe("validateFuelQuantities", () => {
  it("accepts a positive quantity and rate", () => {
    expect(() => validateFuelQuantities({ quantityLiters: 50, ratePerLiter: 95 })).not.toThrow();
  });

  it("rejects zero or negative quantity", () => {
    expect(() => validateFuelQuantities({ quantityLiters: 0, ratePerLiter: 95 })).toThrow(FuelValidationError);
    expect(() => validateFuelQuantities({ quantityLiters: -10, ratePerLiter: 95 })).toThrow(FuelValidationError);
  });

  it("rejects zero or negative rate", () => {
    expect(() => validateFuelQuantities({ quantityLiters: 50, ratePerLiter: 0 })).toThrow(FuelValidationError);
  });
});

describe("isSuspiciousFuelQuantity", () => {
  it("does not flag a normal fill", () => {
    expect(isSuspiciousFuelQuantity(80)).toBe(false);
  });

  it("flags an unusually large quantity", () => {
    expect(isSuspiciousFuelQuantity(1500)).toBe(true);
  });
});

describe("computeLitresPerHour / computeKmPerLitre", () => {
  it("computes efficiency when there is valid data", () => {
    const result = computeLitresPerHour(80, 20);
    expect(result.available).toBe(true);
    if (result.available) expect(result.value.toString()).toBe("4");
  });

  it("reports insufficient data instead of NaN/Infinity when the denominator is zero", () => {
    const byHour = computeLitresPerHour(80, 0);
    expect(byHour.available).toBe(false);
    if (!byHour.available) expect(byHour.reason).toBe("Not enough data");

    const byDistance = computeKmPerLitre(100, 0);
    expect(byDistance.available).toBe(false);
  });
});

describe("computeFuelEfficiency", () => {
  it("uses litres/hour for cranes", () => {
    const result = computeFuelEfficiency({ category: "CRANE", totalLiters: 40, totalWorkingHours: 10, totalDistanceKm: 0 });
    expect(result.available).toBe(true);
    if (result.available) expect(result.unit).toBe("L/hr");
  });

  it("uses km/litre for road vehicles", () => {
    const result = computeFuelEfficiency({ category: "TRUCK", totalLiters: 40, totalWorkingHours: 0, totalDistanceKm: 400 });
    expect(result.available).toBe(true);
    if (result.available) expect(result.unit).toBe("km/L");
  });

  it("never returns NaN or Infinity when there is no source data", () => {
    const result = computeFuelEfficiency({ category: "CRANE", totalLiters: 0, totalWorkingHours: 0, totalDistanceKm: 0 });
    expect(result.available).toBe(false);
  });
});
