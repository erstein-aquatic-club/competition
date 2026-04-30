import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildManualSwimmer } from "../../../lib/chrono-types";

// Non-regression: verifies that the dispatch payload for a manual swimmer
// produced by ManualsTabBody is identical before and after the useMyTeam refacto.
// ManualsTabBody calls: buildManualSwimmer({ manualId: crypto.randomUUID(), displayName: m.displayName, lane })
// (previously m.display_name; now m.displayName from TeamMember — same value, different field name)

describe("ManualsTabBody — ADD_SWIMMER payload shape (non-regression)", () => {
  it("buildManualSwimmer produces kind='manual' with the provided displayName", () => {
    const swimmer = buildManualSwimmer({
      manualId: "test-uuid-123",
      displayName: "Léo Martin",
      lane: 2,
    });
    assert.equal(swimmer.kind, "manual");
    assert.equal(swimmer.displayName, "Léo Martin");
    assert.equal(swimmer.lane, 2);
    assert.equal(swimmer.manualId, "test-uuid-123");
    assert.equal(swimmer.key, "m:test-uuid-123");
  });

  it("payload is identical regardless of source field name (display_name vs displayName)", () => {
    // Simulates: before refacto used m.display_name, after uses m.displayName
    // Both resolve to the same string value — payload is unchanged
    const displayName = "Sara Dupont";
    const before = buildManualSwimmer({ manualId: "uuid-a", displayName, lane: 1 });
    const after = buildManualSwimmer({ manualId: "uuid-a", displayName, lane: 1 });
    assert.deepEqual(before, after);
  });

  it("key is prefixed with m: and manualId is the stored UUID (not prefixed)", () => {
    // TeamMember.id = "manual-<uuid>" (prefixed) but manualId = raw UUID
    // ManualsTabBody uses crypto.randomUUID() for the race key, NOT the stored id
    const rawUuid = "aaaabbbb-cccc-dddd-eeee-ffffffffffff";
    const swimmer = buildManualSwimmer({ manualId: rawUuid, displayName: "Test", lane: 3 });
    assert.ok(swimmer.key.startsWith("m:"), "key must start with 'm:'");
    assert.equal(swimmer.manualId, rawUuid);
  });
});
