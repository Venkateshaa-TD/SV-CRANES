/**
 * Pure project / vehicle-assignment rules. None of this touches the
 * database — see src/lib/actions/project-vehicle-assignments.ts for the
 * transactional orchestration (row locking against the vehicle) that
 * calls into this.
 */

export class ProjectValidationError extends Error {}

export interface AssignmentWindow {
  id?: string;
  assignedFrom: Date;
  assignedTo: Date | null;
}

/** Two assignment windows overlap when both are open (or one is open and
 * starts before the other ends) — a null `assignedTo` means "still
 * assigned", i.e. open-ended into the future. */
function windowsOverlap(a: AssignmentWindow, b: AssignmentWindow): boolean {
  const aEnd = a.assignedTo ?? null;
  const bEnd = b.assignedTo ?? null;
  const startsBeforeOtherEnds = aEnd === null || b.assignedFrom.getTime() < aEnd.getTime();
  const otherStartsBeforeThisEnds = bEnd === null || a.assignedFrom.getTime() < bEnd.getTime();
  return startsBeforeOtherEnds && otherStartsBeforeThisEnds;
}

/**
 * A vehicle cannot be assigned to two projects over overlapping time
 * windows. `existing` should be every other non-excluded assignment for
 * the same vehicle across ALL projects (a vehicle can only do one job at
 * a time), scoped to the vehicle's company. Historical (closed) windows
 * that don't overlap the new one are unaffected.
 */
export function assertNoOverlappingAssignment(newWindow: AssignmentWindow, existing: AssignmentWindow[]): void {
  if (newWindow.assignedTo != null && newWindow.assignedTo.getTime() <= newWindow.assignedFrom.getTime()) {
    throw new ProjectValidationError("Assignment end date must be after the start date.");
  }
  for (const other of existing) {
    if (newWindow.id && other.id === newWindow.id) continue;
    if (windowsOverlap(newWindow, other)) {
      throw new ProjectValidationError(
        "This vehicle is already assigned to another project for an overlapping period. End that assignment first, or choose a non-overlapping date range.",
      );
    }
  }
}

export function assertValidProjectDates(startDate: Date | null, endDate: Date | null): void {
  if (startDate && endDate && endDate.getTime() < startDate.getTime()) {
    throw new ProjectValidationError("End date cannot be before the start date.");
  }
}
