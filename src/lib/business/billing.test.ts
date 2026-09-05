import { describe, expect, it } from "vitest";
import {
  BillingValidationError,
  calculateDailyBilling,
  calculateFixedBilling,
  calculateHourlyBilling,
  calculateMonthlyBilling,
  computeBillingDraftTotals,
  computeBillingTax,
  sumAdditionalCharges,
  validateAdditionalCharge,
  validateBillingConfig,
} from "./billing";

describe("calculateHourlyBilling", () => {
  it("bills actual hours at the base rate with no minimum/overtime configured", () => {
    const result = calculateHourlyBilling(
      [
        { dailyLogId: "log-1", logDate: new Date("2026-01-01"), workingHours: 8 },
        { dailyLogId: "log-2", logDate: new Date("2026-01-02"), workingHours: 10 },
      ],
      { baseRate: 500 },
    );
    expect(result.quantity.toString()).toBe("18");
    expect(result.baseAmount.toString()).toBe("9000");
    expect(result.totalOvertimeHours.toString()).toBe("0");
  });

  it("applies the minimum guaranteed hours per day, independently per day", () => {
    const result = calculateHourlyBilling(
      [
        { dailyLogId: "log-1", logDate: new Date("2026-01-01"), workingHours: 2 }, // below minimum
        { dailyLogId: "log-2", logDate: new Date("2026-01-02"), workingHours: 9 }, // above minimum
      ],
      { baseRate: 500, minimumGuaranteedHours: 4 },
    );
    // Day 1 billed at the 4h minimum, day 2 at its actual 9h — a long day
    // does not "absorb" a short day's shortfall.
    expect(result.quantity.toString()).toBe("13");
    expect(result.baseAmount.toString()).toBe("6500");
    expect(result.perLog[0].billableHours).toBe("4");
    expect(result.perLog[1].billableHours).toBe("9");
  });

  it("splits hours beyond the overtime threshold at the overtime rate", () => {
    const result = calculateHourlyBilling(
      [{ dailyLogId: "log-1", logDate: new Date("2026-01-01"), workingHours: 12 }],
      { baseRate: 500, overtimeThresholdHours: 8, overtimeRate: 750 },
    );
    expect(result.totalNormalHours.toString()).toBe("8");
    expect(result.totalOvertimeHours.toString()).toBe("4");
    // 8*500 + 4*750 = 4000 + 3000 = 7000
    expect(result.baseAmount.toString()).toBe("7000");
  });

  it("combines minimum guarantee and overtime correctly", () => {
    const result = calculateHourlyBilling(
      [{ dailyLogId: "log-1", logDate: new Date("2026-01-01"), workingHours: 3 }],
      { baseRate: 500, minimumGuaranteedHours: 4, overtimeThresholdHours: 8, overtimeRate: 750 },
    );
    // Guaranteed up to 4h, all within the 8h threshold — no overtime.
    expect(result.perLog[0].billableHours).toBe("4");
    expect(result.perLog[0].overtimeHours).toBe("0");
    expect(result.baseAmount.toString()).toBe("2000");
  });

  it("rejects an empty source log list", () => {
    expect(() => calculateHourlyBilling([], { baseRate: 500 })).toThrow(BillingValidationError);
  });

  it("is Decimal-safe for values that lose precision under floating point", () => {
    const result = calculateHourlyBilling(
      [{ dailyLogId: "log-1", logDate: new Date("2026-01-01"), workingHours: "0.1" }],
      { baseRate: "3" },
    );
    expect(result.baseAmount.toString()).toBe("0.3");
  });
});

describe("calculateDailyBilling", () => {
  it("bills the eligible-day count at the daily rate", () => {
    const result = calculateDailyBilling(
      [
        { dailyLogId: "log-1", logDate: new Date("2026-01-01") },
        { dailyLogId: "log-2", logDate: new Date("2026-01-02") },
        { dailyLogId: "log-3", logDate: new Date("2026-01-03") },
      ],
      { baseRate: 12000 },
    );
    expect(result.quantity.toString()).toBe("3");
    expect(result.baseAmount.toString()).toBe("36000");
  });

  it("rejects a period with no eligible days", () => {
    expect(() => calculateDailyBilling([], { baseRate: 12000 })).toThrow(BillingValidationError);
  });
});

describe("calculateMonthlyBilling", () => {
  it("bills the full monthly rate for a full calendar month", () => {
    const result = calculateMonthlyBilling({
      config: { baseRate: 150000 },
      isFullCalendarMonth: true,
      daysInPeriod: 31,
      daysInMonth: 31,
      allowProration: false,
    });
    expect(result.prorated).toBe(false);
    expect(result.baseAmount.toString()).toBe("150000");
  });

  it("refuses to silently prorate a partial period", () => {
    expect(() =>
      calculateMonthlyBilling({
        config: { baseRate: 150000 },
        isFullCalendarMonth: false,
        daysInPeriod: 15,
        daysInMonth: 30,
        allowProration: false,
      }),
    ).toThrow(BillingValidationError);
  });

  it("prorates a partial period only when explicitly allowed", () => {
    const result = calculateMonthlyBilling({
      config: { baseRate: 150000 },
      isFullCalendarMonth: false,
      daysInPeriod: 15,
      daysInMonth: 30,
      allowProration: true,
    });
    expect(result.prorated).toBe(true);
    expect(result.baseAmount.toString()).toBe("75000");
  });
});

describe("calculateFixedBilling", () => {
  it("returns the configured fixed amount as a quantity-of-1 charge", () => {
    const result = calculateFixedBilling({ baseRate: 50000 });
    expect(result.quantity.toString()).toBe("1");
    expect(result.baseAmount.toString()).toBe("50000");
  });

  it("rejects a non-positive fixed amount", () => {
    expect(() => calculateFixedBilling({ baseRate: 0 })).toThrow(BillingValidationError);
  });
});

describe("additional charges and tax", () => {
  it("sums additional charges", () => {
    expect(
      sumAdditionalCharges([
        { description: "Mobilisation", amount: 5000 },
        { description: "Demobilisation", amount: 3000 },
      ]).toString(),
    ).toBe("8000");
  });

  it("rejects a charge with no description or non-positive amount", () => {
    expect(() => validateAdditionalCharge({ description: "", amount: 100 })).toThrow();
    expect(() => validateAdditionalCharge({ description: "Extra", amount: 0 })).toThrow();
  });

  it("computes tax on the full taxable base", () => {
    expect(computeBillingTax(10000, 18).toString()).toBe("1800");
  });

  it("computes full draft totals: base + charges + tax", () => {
    const totals = computeBillingDraftTotals({ baseAmount: 10000, additionalChargesAmount: 2000, taxPercent: 18 });
    expect(totals.taxAmount.toString()).toBe("2160"); // 18% of 12000
    expect(totals.totalAmount.toString()).toBe("14160");
  });
});

describe("validateBillingConfig", () => {
  it("accepts a valid HOURLY config with matched overtime rate/threshold", () => {
    expect(() =>
      validateBillingConfig({ billingType: "HOURLY", baseRate: 500, overtimeThresholdHours: 8, overtimeRate: 750 }),
    ).not.toThrow();
  });

  it("rejects an overtime rate without a threshold, or vice versa", () => {
    expect(() => validateBillingConfig({ billingType: "HOURLY", baseRate: 500, overtimeRate: 750 })).toThrow();
    expect(() => validateBillingConfig({ billingType: "HOURLY", baseRate: 500, overtimeThresholdHours: 8 })).toThrow();
  });

  it("rejects minimum/overtime fields on a non-HOURLY billing type", () => {
    expect(() => validateBillingConfig({ billingType: "DAILY", baseRate: 500, minimumGuaranteedHours: 4 })).toThrow();
  });

  it("rejects a non-positive base rate", () => {
    expect(() => validateBillingConfig({ billingType: "FIXED", baseRate: 0 })).toThrow();
  });

  it("rejects a tax percent outside 0-100", () => {
    expect(() => validateBillingConfig({ billingType: "FIXED", baseRate: 100, taxPercent: 150 })).toThrow();
  });
});
