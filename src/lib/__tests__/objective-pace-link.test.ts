import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseObjectiveForPace, shouldAutoSyncToPaceTarget } from "../objective-pace-link";

describe("parseObjectiveForPace", () => {
  it("parses 100NL with pool_length=50 → 100m NL 50m", () => {
    const res = parseObjectiveForPace("100NL", 50);
    assert.deepEqual(res, { stroke: "NL", distance: 100, pool_size: "50m" });
  });

  it("maps DOS → Dos, BR → Brasse, PAP → Pap, QN → 4N", () => {
    assert.equal(parseObjectiveForPace("100DOS", 50)?.stroke, "Dos");
    assert.equal(parseObjectiveForPace("50BR", 25)?.stroke, "Brasse");
    assert.equal(parseObjectiveForPace("200PAP", 50)?.stroke, "Pap");
    assert.equal(parseObjectiveForPace("400QN", 25)?.stroke, "4N");
  });

  it("uses pool_length=25 → '25m', any other → '50m'", () => {
    assert.equal(parseObjectiveForPace("100NL", 25)?.pool_size, "25m");
    assert.equal(parseObjectiveForPace("100NL", 50)?.pool_size, "50m");
    assert.equal(parseObjectiveForPace("100NL", null)?.pool_size, "50m");
    assert.equal(parseObjectiveForPace("100NL", undefined)?.pool_size, "50m");
  });

  it("returns null on invalid event_code", () => {
    assert.equal(parseObjectiveForPace(null, 50), null);
    assert.equal(parseObjectiveForPace("", 50), null);
    assert.equal(parseObjectiveForPace("WTF", 50), null);
    assert.equal(parseObjectiveForPace("100XYZ", 50), null);
    assert.equal(parseObjectiveForPace("100", 50), null);
  });

  it("preserves distance for the long-distance codes", () => {
    assert.equal(parseObjectiveForPace("800NL", 50)?.distance, 800);
    assert.equal(parseObjectiveForPace("1500NL", 50)?.distance, 1500);
  });
});

const parsed = { stroke: "NL" as const, distance: 100, pool_size: "50m" as const };
const target = { swimmer_account_id: 42, stroke: "NL", target_distance_m: 100, target_pool_size: "50m" };

describe("shouldAutoSyncToPaceTarget", () => {
  it("returns false when parsed is null", () => {
    assert.equal(shouldAutoSyncToPaceTarget({ target_time_seconds: 60 }, null, [], 42), false);
  });
  it("returns false when target_time_seconds is null", () => {
    assert.equal(shouldAutoSyncToPaceTarget({ target_time_seconds: null }, parsed, [], 42), false);
  });
  it("returns false when matching target already exists for this athlete", () => {
    assert.equal(shouldAutoSyncToPaceTarget({ target_time_seconds: 60 }, parsed, [target], 42), false);
  });
  it("returns true when no matching target exists", () => {
    assert.equal(shouldAutoSyncToPaceTarget({ target_time_seconds: 60 }, parsed, [], 42), true);
  });
  it("returns true when existing target belongs to a different athlete", () => {
    const other = { ...target, swimmer_account_id: 99 };
    assert.equal(shouldAutoSyncToPaceTarget({ target_time_seconds: 60 }, parsed, [other], 42), true);
  });
});
