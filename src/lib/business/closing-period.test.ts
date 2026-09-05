// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  buildClosingChecklist,
  canClosePeriod,
  canReopenPeriod,
  canStartReview,
  isPeriodLocked,
  validateCloseRequest,
  validateReopenReason,
  ClosingPeriodValidationError,
  type ClosingChecklistCounts,
} from "./closing-period";

const CLEAN_COUNTS: ClosingChecklistCounts = {
  flaggedDailyLogCount: 0,
  missingDailyLogVehicleCount: 0,
  pendingExpenseCount: 0,
  missingExpenseReceiptCount: 0,
  fuelAnomalyCount: 0,
  missingFuelReceiptCount: 0,
  projectsMissingBillingConfigCount: 0,
  unfinalizedBillingDraftCount: 0,
  draftInvoiceCount: 0,
};

describe("buildClosingChecklist", () => {
  it("a clean month has zero blockers/warnings and can close", () => {
    const result = buildClosingChecklist(CLEAN_COUNTS);
    expect(result.blockerCount).toBe(0);
    expect(result.warningCount).toBe(0);
    expect(result.canClose).toBe(true);
  });

  it("flagged daily logs are the only blocker source", () => {
    const result = buildClosingChecklist({ ...CLEAN_COUNTS, flaggedDailyLogCount: 2 });
    expect(result.blockerCount).toBe(2);
    expect(result.canClose).toBe(false);
    const flaggedItem = result.items.find((i) => i.key === "flaggedDailyLogs")!;
    expect(flaggedItem.severity).toBe("BLOCKER");
  });

  it("every other count contributes to warnings, never blockers", () => {
    const result = buildClosingChecklist({
      ...CLEAN_COUNTS,
      missingDailyLogVehicleCount: 1,
      pendingExpenseCount: 1,
      missingExpenseReceiptCount: 1,
      fuelAnomalyCount: 1,
      missingFuelReceiptCount: 1,
      projectsMissingBillingConfigCount: 1,
      unfinalizedBillingDraftCount: 1,
      draftInvoiceCount: 1,
    });
    expect(result.blockerCount).toBe(0);
    expect(result.warningCount).toBe(8);
    // canClose is true even with warnings — only blockers gate closing
    // outright; warnings require an override reason, checked separately.
    expect(result.canClose).toBe(true);
  });

  it("groups items into the four checklist groups", () => {
    const result = buildClosingChecklist(CLEAN_COUNTS);
    const groups = new Set(result.items.map((i) => i.group));
    expect(groups).toEqual(new Set(["OPERATIONS", "EXPENSES", "BILLING", "INVOICES"]));
  });
});

describe("status transition predicates", () => {
  it("isPeriodLocked is true only for CLOSED, including no-row-yet (null)", () => {
    expect(isPeriodLocked(null)).toBe(false);
    expect(isPeriodLocked(undefined)).toBe(false);
    expect(isPeriodLocked("OPEN")).toBe(false);
    expect(isPeriodLocked("REVIEW")).toBe(false);
    expect(isPeriodLocked("REOPENED")).toBe(false);
    expect(isPeriodLocked("CLOSED")).toBe(true);
  });

  it("canStartReview only from OPEN", () => {
    expect(canStartReview("OPEN")).toBe(true);
    expect(canStartReview("REVIEW")).toBe(false);
    expect(canStartReview("CLOSED")).toBe(false);
    expect(canStartReview("REOPENED")).toBe(false);
  });

  it("canClosePeriod from OPEN, REVIEW, or REOPENED — never from CLOSED", () => {
    expect(canClosePeriod("OPEN")).toBe(true);
    expect(canClosePeriod("REVIEW")).toBe(true);
    expect(canClosePeriod("REOPENED")).toBe(true);
    expect(canClosePeriod("CLOSED")).toBe(false);
  });

  it("canReopenPeriod only from CLOSED", () => {
    expect(canReopenPeriod("CLOSED")).toBe(true);
    expect(canReopenPeriod("OPEN")).toBe(false);
    expect(canReopenPeriod("REVIEW")).toBe(false);
    expect(canReopenPeriod("REOPENED")).toBe(false);
  });
});

describe("validateCloseRequest", () => {
  it("throws when any blocker remains, regardless of an override reason", () => {
    expect(() => validateCloseRequest({ blockerCount: 1, warningCount: 0, overrideReason: "please" })).toThrow(
      ClosingPeriodValidationError,
    );
  });

  it("throws when warnings remain and no reason is given", () => {
    expect(() => validateCloseRequest({ blockerCount: 0, warningCount: 3, overrideReason: undefined })).toThrow(
      ClosingPeriodValidationError,
    );
    expect(() => validateCloseRequest({ blockerCount: 0, warningCount: 3, overrideReason: "   " })).toThrow(
      ClosingPeriodValidationError,
    );
  });

  it("passes when warnings remain but a non-empty reason is given", () => {
    expect(() => validateCloseRequest({ blockerCount: 0, warningCount: 3, overrideReason: "Month-end sign-off, minor gaps accepted" })).not.toThrow();
  });

  it("passes cleanly with zero blockers and zero warnings and no reason", () => {
    expect(() => validateCloseRequest({ blockerCount: 0, warningCount: 0, overrideReason: undefined })).not.toThrow();
  });
});

describe("validateReopenReason", () => {
  it("throws on missing/blank reason", () => {
    expect(() => validateReopenReason(undefined)).toThrow(ClosingPeriodValidationError);
    expect(() => validateReopenReason(null)).toThrow(ClosingPeriodValidationError);
    expect(() => validateReopenReason("   ")).toThrow(ClosingPeriodValidationError);
  });

  it("passes with a real reason", () => {
    expect(() => validateReopenReason("Customer disputed an invoice amount, correcting the source records")).not.toThrow();
  });
});
