import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { COACH_SECTIONS, buildCoachHash } from "../coach/coachRouteState";

describe("Coach Home — pace calculator card", () => {
  it("'pace-calculator' section is registered in COACH_SECTIONS", () => {
    assert.ok(
      (COACH_SECTIONS as readonly string[]).includes("pace-calculator"),
      "pace-calculator must be in COACH_SECTIONS for the card to navigate correctly",
    );
  });

  it("navigates to ?section=pace-calculator on click", () => {
    const hash = buildCoachHash({ section: "pace-calculator" });
    assert.ok(hash.includes("section=pace-calculator"), `hash should contain pace-calculator, got: ${hash}`);
  });

  it("buildCoachHash round-trips back to home from pace-calculator", () => {
    const hash = buildCoachHash({ section: "home" });
    // home section omits the param — URL stays clean
    assert.ok(!hash.includes("section="), `home should not set section param, got: ${hash}`);
  });
});
