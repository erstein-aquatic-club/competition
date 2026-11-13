import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  cycleCoversWeek,
  resolveStrengthWeeks,
} from "../resolveStrengthWeeks";

type W = { week: { weekKey: string }; source: string; sessions: string[] };
const week = (weekKey: string, source: string, sessions: string[] = ["séance"]): W =>
  ({ week: { weekKey }, source, sessions });
const cycle = { start_week_monday: "2026-11-09", target_week_count: 6 };

describe("cycleCoversWeek", () => {
  it("protects precisely S46 to S51 (including an empty/rest week)", () => {
    assert.equal(cycleCoversWeek("2026-11-02", cycle), false);
    assert.equal(cycleCoversWeek("2026-11-09", cycle), true);
    assert.equal(cycleCoversWeek("2026-12-14", cycle), true);
    assert.equal(cycleCoversWeek("2026-12-21", cycle), false);
  });

  it("uses UTC calendar Mondays across a year/DST boundary", () => {
    const winter = { start_week_monday: "2026-12-28", target_week_count: 2 };
    assert.equal(cycleCoversWeek("2027-01-04", winter), true);
    assert.equal(cycleCoversWeek("2027-01-11", winter), false);
    assert.equal(cycleCoversWeek("2026-11-10", cycle), false); // Tuesday
  });

  it("rejects invalid dates and incomplete cycles", () => {
    assert.equal(cycleCoversWeek("2026-11-09", null), false);
    assert.equal(cycleCoversWeek("2026-11-09", { start_week_monday: null, target_week_count: 6 }), false);
    assert.equal(cycleCoversWeek("2026-11-09", { start_week_monday: "2026-11-09", target_week_count: 0 }), false);
    assert.equal(cycleCoversWeek("2026-11-09", { start_week_monday: "2026-11-31", target_week_count: 6 }), false);
  });
});

describe("resolveStrengthWeeks", () => {
  it("does not display a stale application inside an active imported cycle", () => {
    const w = "2026-11-09";
    const resolved = resolveStrengthWeeks({
      weekKeys: [w], activeCycle: cycle,
      dated: [week(w, "PDF")],
      applications: [week(w, "ancien plan")],
      folders: [week(w, "ancien dossier")],
    });
    assert.equal(resolved.length, 1);
    assert.equal(resolved[0].source, "PDF");
  });

  it("keeps a deliberately empty active-cycle week empty", () => {
    const w = "2026-11-16";
    const resolved = resolveStrengthWeeks({
      weekKeys: [w], activeCycle: cycle,
      dated: [week(w, "repos", [])],
      applications: [week(w, "ancien plan")], folders: [],
    });
    assert.deepEqual(resolved, [week(w, "repos", [])]);
  });

  it("never falls through to an old plan when the active-cycle slot is missing", () => {
    const w = "2026-11-23";
    const resolved = resolveStrengthWeeks({
      weekKeys: [w], activeCycle: cycle,
      dated: [], applications: [week(w, "ancien plan")], folders: [],
    });
    assert.equal(resolved.length, 0);
  });

  it("can display a new application after the active cycle ends", () => {
    const w = "2026-12-21";
    const resolved = resolveStrengthWeeks({
      weekKeys: [w], activeCycle: cycle,
      dated: [week(w, "slot groupe")],
      applications: [week(w, "nouveau plan")],
      folders: [],
    });
    assert.equal(resolved[0].source, "nouveau plan");
  });

  it("falls back to dated slots, then folders, without an active cycle", () => {
    const keys = ["2026-12-21", "2026-12-28", "2027-01-04"];
    const resolved = resolveStrengthWeeks({
      weekKeys: keys, activeCycle: null,
      dated: [week(keys[0], "créneau")],
      applications: [week(keys[2], "application")],
      folders: [week(keys[1], "dossier"), week(keys[0], "dossier")],
    });
    assert.deepEqual(resolved.map((w) => w.source), ["créneau", "dossier", "application"]);
  });

  it("keeps ISO order and never duplicates weeks", () => {
    const keys = ["2026-11-09", "2026-11-16", "2026-11-23"];
    const resolved = resolveStrengthWeeks({
      weekKeys: keys, activeCycle: cycle,
      dated: [week(keys[2], "pdf"), week(keys[0], "pdf"), week(keys[1], "pdf")],
      applications: [week(keys[0], "legacy")], folders: [],
    });
    assert.deepEqual(resolved.map((w) => w.week.weekKey), keys);
  });
});
