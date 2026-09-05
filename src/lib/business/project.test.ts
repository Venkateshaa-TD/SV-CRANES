import { describe, expect, it } from "vitest";
import { ProjectValidationError, assertNoOverlappingAssignment, assertValidProjectDates } from "./project";

describe("assertNoOverlappingAssignment", () => {
  it("allows a new assignment when the vehicle has no other assignments", () => {
    expect(() =>
      assertNoOverlappingAssignment({ assignedFrom: new Date("2026-02-01"), assignedTo: null }, []),
    ).not.toThrow();
  });

  it("allows a new assignment strictly after a closed prior assignment", () => {
    expect(() =>
      assertNoOverlappingAssignment(
        { assignedFrom: new Date("2026-02-01"), assignedTo: null },
        [{ id: "a1", assignedFrom: new Date("2026-01-01"), assignedTo: new Date("2026-01-31") }],
      ),
    ).not.toThrow();
  });

  it("rejects a new open-ended assignment while another open assignment exists for the same vehicle", () => {
    expect(() =>
      assertNoOverlappingAssignment(
        { assignedFrom: new Date("2026-02-01"), assignedTo: null },
        [{ id: "a1", assignedFrom: new Date("2026-01-01"), assignedTo: null }],
      ),
    ).toThrow(ProjectValidationError);
  });

  it("rejects a new assignment whose window overlaps a closed prior assignment", () => {
    expect(() =>
      assertNoOverlappingAssignment(
        { assignedFrom: new Date("2026-01-15"), assignedTo: new Date("2026-02-15") },
        [{ id: "a1", assignedFrom: new Date("2026-01-01"), assignedTo: new Date("2026-01-31") }],
      ),
    ).toThrow(ProjectValidationError);
  });

  it("excludes the assignment's own id when editing it in place", () => {
    expect(() =>
      assertNoOverlappingAssignment(
        { id: "a1", assignedFrom: new Date("2026-01-01"), assignedTo: null },
        [{ id: "a1", assignedFrom: new Date("2026-01-01"), assignedTo: null }],
      ),
    ).not.toThrow();
  });

  it("rejects an end date on or before the start date", () => {
    expect(() =>
      assertNoOverlappingAssignment({ assignedFrom: new Date("2026-02-01"), assignedTo: new Date("2026-01-01") }, []),
    ).toThrow(ProjectValidationError);
  });
});

describe("assertValidProjectDates", () => {
  it("accepts a null end date (still ongoing)", () => {
    expect(() => assertValidProjectDates(new Date("2026-01-01"), null)).not.toThrow();
  });

  it("rejects an end date before the start date", () => {
    expect(() => assertValidProjectDates(new Date("2026-02-01"), new Date("2026-01-01"))).toThrow();
  });
});
