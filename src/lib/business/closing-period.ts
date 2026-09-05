import type { ClosingPeriodStatus } from "@prisma/client";

/**
 * Pure month-end closing rules: checklist construction, status
 * transitions, and reason validation. None of this touches the database
 * — see src/lib/data/period-lock.ts for the query that decides whether a
 * given date falls in a CLOSED period, and src/lib/actions/closing-periods.ts
 * for the transactional orchestration that calls into this.
 */

export class ClosingPeriodValidationError extends Error {}

/** Thrown by assertPeriodNotLocked (src/lib/data/period-lock.ts) when a
 * mutation targets a date inside a CLOSED accounting period. Every
 * caller passes this straight through to toActionError, which already
 * forwards its message verbatim to the user. */
export class PeriodLockedError extends Error {}

export type ChecklistGroup = "OPERATIONS" | "EXPENSES" | "BILLING" | "INVOICES";
export type ChecklistSeverity = "BLOCKER" | "WARNING";

export interface ChecklistItem {
  key: string;
  group: ChecklistGroup;
  severity: ChecklistSeverity;
  label: string;
  count: number;
}

export interface ClosingChecklistCounts {
  /** BLOCKER — DailyLog rows flagged for review (suspicious jump /
   * meter-chronology issue) within the period. */
  flaggedDailyLogCount: number;
  /** WARNING — currently-WORKING vehicles with at least one business day
   * in the period that has no DailyLog at all. */
  missingDailyLogVehicleCount: number;
  /** WARNING — Expense rows still PENDING within the period. */
  pendingExpenseCount: number;
  /** WARNING — Expense rows within the period with no receipt attached. */
  missingExpenseReceiptCount: number;
  /** WARNING — FuelEntry rows within the period whose quantity is
   * flagged as unusually large (see business/fuel.ts). */
  fuelAnomalyCount: number;
  /** WARNING — FuelEntry rows within the period with no receipt. */
  missingFuelReceiptCount: number;
  /** WARNING — ACTIVE projects with daily-log activity in the period but
   * no BillingConfiguration set up at all. */
  projectsMissingBillingConfigCount: number;
  /** WARNING — BillingDraft rows whose period overlaps this month and
   * are still DRAFT/REVIEW (not yet APPROVED/REJECTED/INVOICED). */
  unfinalizedBillingDraftCount: number;
  /** WARNING — Invoice rows issued within the period still in DRAFT. */
  draftInvoiceCount: number;
}

export interface ClosingChecklistResult {
  items: ChecklistItem[];
  blockerCount: number;
  warningCount: number;
  /** True only when there are zero blockers — warnings never prevent
   * closing outright, they just require an authorized override+reason. */
  canClose: boolean;
}

/** Builds the full grouped checklist from raw counts. Blocker vs. warning
 * is a deliberate, documented split: only actual data-integrity problems
 * (flagged/chronology-broken logs) are hard blockers; everything else is
 * incomplete-but-not-invalid work that an authorized user may
 * consciously close over, with a reason. */
export function buildClosingChecklist(counts: ClosingChecklistCounts): ClosingChecklistResult {
  const items: ChecklistItem[] = [
    { key: "flaggedDailyLogs", group: "OPERATIONS", severity: "BLOCKER", label: "Daily logs flagged for review (meter chronology issues)", count: counts.flaggedDailyLogCount },
    { key: "missingDailyLogs", group: "OPERATIONS", severity: "WARNING", label: "Working vehicles with a day missing a daily log", count: counts.missingDailyLogVehicleCount },
    { key: "pendingExpenses", group: "EXPENSES", severity: "WARNING", label: "Expenses still pending approval", count: counts.pendingExpenseCount },
    { key: "missingExpenseReceipts", group: "EXPENSES", severity: "WARNING", label: "Expenses missing a receipt", count: counts.missingExpenseReceiptCount },
    { key: "fuelAnomalies", group: "EXPENSES", severity: "WARNING", label: "Fuel entries flagged as unusually large", count: counts.fuelAnomalyCount },
    { key: "missingFuelReceipts", group: "EXPENSES", severity: "WARNING", label: "Fuel entries missing a receipt", count: counts.missingFuelReceiptCount },
    { key: "projectsMissingBillingConfig", group: "BILLING", severity: "WARNING", label: "Active projects with no billing configuration", count: counts.projectsMissingBillingConfigCount },
    { key: "unfinalizedBillingDrafts", group: "BILLING", severity: "WARNING", label: "Billing drafts not yet finalized", count: counts.unfinalizedBillingDraftCount },
    { key: "draftInvoices", group: "INVOICES", severity: "WARNING", label: "Draft, unapproved invoices", count: counts.draftInvoiceCount },
  ];

  const blockerCount = items.filter((i) => i.severity === "BLOCKER").reduce((sum, i) => sum + i.count, 0);
  const warningCount = items.filter((i) => i.severity === "WARNING").reduce((sum, i) => sum + i.count, 0);

  return { items, blockerCount, warningCount, canClose: blockerCount === 0 };
}

/** A month with no ClosingPeriod row at all is implicitly OPEN. */
export function isPeriodLocked(status: ClosingPeriodStatus | null | undefined): boolean {
  return status === "CLOSED";
}

export function canStartReview(status: ClosingPeriodStatus): boolean {
  return status === "OPEN";
}

/** Closing is allowed from OPEN, REVIEW, or REOPENED — REVIEW is an
 * optional, purely informational waypoint (see markPeriodInReview), not
 * a mandatory gate; the real gate is the checklist itself, re-validated
 * atomically inside closeMonth. */
export function canClosePeriod(status: ClosingPeriodStatus): boolean {
  return status === "OPEN" || status === "REVIEW" || status === "REOPENED";
}

export function canReopenPeriod(status: ClosingPeriodStatus): boolean {
  return status === "CLOSED";
}

/** Throws with a user-facing message if the checklist doesn't permit
 * closing: any blocker always prevents it; any warning requires a
 * non-empty override reason. */
export function validateCloseRequest(params: { blockerCount: number; warningCount: number; overrideReason: string | null | undefined }): void {
  if (params.blockerCount > 0) {
    throw new ClosingPeriodValidationError(
      `This month has ${params.blockerCount} critical blocker${params.blockerCount === 1 ? "" : "s"} that must be resolved before it can be closed.`,
    );
  }
  if (params.warningCount > 0 && (!params.overrideReason || params.overrideReason.trim().length === 0)) {
    throw new ClosingPeriodValidationError(
      `This month has ${params.warningCount} outstanding warning${params.warningCount === 1 ? "" : "s"} — provide a reason to close it anyway.`,
    );
  }
}

export function validateReopenReason(reason: string | null | undefined): void {
  if (!reason || reason.trim().length === 0) {
    throw new ClosingPeriodValidationError("A reason is required to reopen a closed month.");
  }
}
