import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { PaceTargetForm, DISTANCES_BY_STROKE } from "../PaceTargetForm";
import { parsePaceTime, formatPaceTime } from "../../../../lib/paceCalculator";

describe("PaceTargetForm — DISTANCES_BY_STROKE config", () => {
  it("4N only has 100, 200, 400", () => {
    assert.deepEqual(DISTANCES_BY_STROKE["4N"], [100, 200, 400]);
    assert.ok(!DISTANCES_BY_STROKE["4N"].includes(50), "4N has no 50m");
  });

  it("NL has 6 options including 1500", () => {
    assert.deepEqual(DISTANCES_BY_STROKE["NL"], [50, 100, 200, 400, 800, 1500]);
  });

  it("Dos/Brasse/Pap limited to 50, 100, 200", () => {
    for (const s of ["Dos", "Brasse", "Pap"] as const) {
      assert.deepEqual(DISTANCES_BY_STROKE[s], [50, 100, 200], `${s} distances`);
    }
  });
});

describe("PaceTargetForm — time validation logic (parsePaceTime)", () => {
  it("'abc' → null (invalid, submit would be disabled)", () => {
    assert.equal(parsePaceTime("abc"), null);
  });

  it("'1:05.4' → 65400ms (valid, submit enabled)", () => {
    assert.equal(parsePaceTime("1:05.4"), 65400);
  });

  it("'65.4' → 65400ms (shorthand accepted)", () => {
    assert.equal(parsePaceTime("65.4"), 65400);
  });

  it("empty string → null", () => {
    assert.equal(parsePaceTime(""), null);
  });

  it("formatPaceTime round-trips: 65400 → '1:05.4'", () => {
    assert.equal(formatPaceTime(65400), "1:05.4");
  });
});

describe("PaceTargetForm — static render", () => {
  it("submit is disabled when form is empty", () => {
    const html = renderToStaticMarkup(
      createElement(PaceTargetForm, { onSubmit: () => {}, onCancel: () => {} }),
    );
    assert.ok(html.includes("disabled"), "submit button has disabled attribute");
  });

  it("submit is enabled and initial time shown when all initial values provided", () => {
    const html = renderToStaticMarkup(
      createElement(PaceTargetForm, {
        initial: { stroke: "NL", target_distance_m: 100, target_time_ms: 65400 },
        onSubmit: () => {},
        onCancel: () => {},
      }),
    );
    assert.ok(html.includes("1:05.4"), "initial time value rendered");
    // When all fields valid, submit button should not be disabled
    // The disabled attr only appears on the empty-form render
    const buttonIdx = html.lastIndexOf("<button");
    const submitChunk = html.slice(buttonIdx);
    assert.ok(!submitChunk.startsWith('<button disabled'), "submit not disabled with valid initial");
  });
});
