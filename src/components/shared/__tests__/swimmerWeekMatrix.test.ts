import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  classifyCell,
  foldCellStates,
  type CellState,
  type ClassifyInput,
} from "../swimmerWeekMatrix";

function input(p: Partial<ClassifyInput>): ClassifyInput {
  return {
    state: "empty",
    hasAssignment: false,
    hasFeedback: false,
    isPast: false,
    isToday: false,
    ...p,
  };
}

describe("classifyCell", () => {
  it("returns 'unassigned' when slot is empty and not past", () => {
    assert.equal(classifyCell(input({ state: "empty", isPast: false })), "unassigned");
  });

  it("returns 'past-no-session' when slot is empty and past", () => {
    assert.equal(classifyCell(input({ state: "empty", isPast: true })), "past-no-session");
  });

  it("returns 'assigned-future' for published+assigned slot in the future", () => {
    assert.equal(
      classifyCell(input({ state: "published", hasAssignment: true })),
      "assigned-future",
    );
  });

  it("returns 'assigned-today' for published+assigned slot today (not past)", () => {
    assert.equal(
      classifyCell(
        input({ state: "published", hasAssignment: true, isToday: true, isPast: false }),
      ),
      "assigned-today",
    );
  });

  it("returns 'done' for past+assigned+feedback", () => {
    assert.equal(
      classifyCell(
        input({ state: "published", hasAssignment: true, isPast: true, hasFeedback: true }),
      ),
      "done",
    );
  });

  it("returns 'missed-feedback' for past+assigned+no feedback", () => {
    assert.equal(
      classifyCell(
        input({ state: "published", hasAssignment: true, isPast: true, hasFeedback: false }),
      ),
      "missed-feedback",
    );
  });

  it("treats draft assignments as no-session (unassigned/past-no-session)", () => {
    assert.equal(classifyCell(input({ state: "draft", isPast: false })), "unassigned");
    assert.equal(classifyCell(input({ state: "draft", isPast: true })), "past-no-session");
  });

  it("treats cancelled instances as no-session", () => {
    assert.equal(classifyCell(input({ state: "cancelled", isPast: false })), "unassigned");
    assert.equal(classifyCell(input({ state: "cancelled", isPast: true })), "past-no-session");
  });

  it("returns 'none' when no slot exists at all (state undefined)", () => {
    assert.equal(classifyCell(input({ state: undefined })), "none");
  });
});

describe("foldCellStates", () => {
  it("returns 'none' for an empty array", () => {
    assert.equal(foldCellStates([]), "none");
  });

  it("returns the only state for a single slot", () => {
    const states: CellState[] = ["assigned-future"];
    assert.equal(foldCellStates(states), "assigned-future");
  });

  it("prioritises missed-feedback over everything", () => {
    assert.equal(foldCellStates(["done", "missed-feedback", "assigned-future"]), "missed-feedback");
  });

  it("prioritises unassigned over assigned states", () => {
    assert.equal(foldCellStates(["assigned-future", "unassigned"]), "unassigned");
  });

  it("prioritises assigned-today over assigned-future", () => {
    assert.equal(foldCellStates(["assigned-future", "assigned-today"]), "assigned-today");
  });

  it("prioritises done over past-no-session", () => {
    assert.equal(foldCellStates(["past-no-session", "done"]), "done");
  });

  it("never falls back to 'none' if any real state is present", () => {
    assert.equal(foldCellStates(["past-no-session", "none"]), "past-no-session");
  });
});
