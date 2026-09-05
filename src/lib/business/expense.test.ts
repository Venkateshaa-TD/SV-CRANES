import { describe, expect, it } from "vitest";
import { ExpenseValidationError, validateExpenseAmount, validateRejectionReason } from "./expense";

describe("validateExpenseAmount", () => {
  it("accepts a positive amount", () => {
    expect(() => validateExpenseAmount(500)).not.toThrow();
  });

  it("rejects zero or negative amounts", () => {
    expect(() => validateExpenseAmount(0)).toThrow(ExpenseValidationError);
    expect(() => validateExpenseAmount(-1)).toThrow(ExpenseValidationError);
  });
});

describe("validateRejectionReason", () => {
  it("requires a non-empty reason", () => {
    expect(() => validateRejectionReason(undefined)).toThrow(ExpenseValidationError);
    expect(() => validateRejectionReason("")).toThrow(ExpenseValidationError);
    expect(() => validateRejectionReason("   ")).toThrow(ExpenseValidationError);
  });

  it("accepts a real reason", () => {
    expect(() => validateRejectionReason("Missing receipt")).not.toThrow();
  });
});
