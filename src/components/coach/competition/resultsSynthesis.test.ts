import { test } from "node:test";
import assert from "node:assert/strict";

import { buildResultsSynthesis } from "./resultsSynthesis";
import type {
  ResultsSnapshot,
  ResultsSnapshotRace,
  ResultsSnapshotSwimmer,
} from "../../../lib/api/types";

// ── Fixtures helpers ──────────────────────────────────────────────────────

function race(over: Partial<ResultsSnapshotRace> = {}): ResultsSnapshotRace {
  return {
    rawEvent: "50 Nage Libre Messieurs Séries",
    eventCode: "50NL",
    phase: "series",
    place: null,
    timeSeconds: 25.0,
    timeDisplay: "25.00",
    points: null,
    splits: [],
    ...over,
  };
}

function swimmer(over: Partial<ResultsSnapshotSwimmer> = {}): ResultsSnapshotSwimmer {
  return {
    key: "K1",
    lastName: "DUPONT",
    firstName: "Jean",
    birthYear: 2005,
    races: [race()],
    ...over,
  };
}

function snapshot(
  swimmers: ResultsSnapshotSwimmer[],
  athleteMap: Record<string, number | null>,
): ResultsSnapshot {
  return {
    structureCode: "ABC",
    clubName: "EAC",
    athleteMap,
    swimmers,
  };
}

const COMP_DATE = "2026-06-01";

// ── 1. linked swimmer, new best ───────────────────────────────────────────

test("linked swimmer with a new-best event → newBests=1, verdict present", () => {
  const sw = swimmer({ key: "K1", races: [race({ timeSeconds: 24.0 })] });
  const out = buildResultsSynthesis({
    snapshot: snapshot([sw], { K1: 7 }),
    athleteName: { 7: "Jean Dupont" },
    perfsByUser: {
      7: [
        {
          event_code: "50NL",
          pool_length: 25,
          time_seconds: 24.5,
          competition_date: "2026-01-01",
        },
      ],
    },
    objectivesByUser: {},
    poolLength: 25,
    compDate: COMP_DATE,
  });

  assert.equal(out.swimmers.length, 1);
  const s = out.swimmers[0];
  assert.equal(s.linked, true);
  assert.equal(s.userId, 7);
  assert.equal(s.name, "Jean Dupont");
  assert.equal(s.events.length, 1);
  assert.ok(s.events[0].verdict);
  assert.equal(s.events[0].verdict?.isNewBest, true);
  assert.equal(out.totals.newBests, 1);
  assert.equal(out.unmatchedCount, 0);
});

// ── 2. podium counting (1 and 3 count, 4 doesn't) ─────────────────────────

test("podiums count finalPlace 1 and 3 but not 4", () => {
  const sw = swimmer({
    key: "K1",
    races: [
      race({ eventCode: "50NL", phase: "finaleA", place: 1, timeSeconds: 24 }),
      race({ eventCode: "100NL", phase: "finaleA", place: 3, timeSeconds: 54 }),
      race({ eventCode: "200NL", phase: "finaleA", place: 4, timeSeconds: 120 }),
    ],
  });
  const out = buildResultsSynthesis({
    snapshot: snapshot([sw], { K1: 7 }),
    athleteName: { 7: "Jean Dupont" },
    perfsByUser: {},
    objectivesByUser: {},
    poolLength: 25,
    compDate: COMP_DATE,
  });
  assert.equal(out.totals.podiums, 2);
});

// ── 3. qualifiedFinal "A" → finalsA ───────────────────────────────────────

test("qualifiedFinal A counts toward finalsA", () => {
  const sw = swimmer({
    key: "K1",
    races: [
      race({ eventCode: "50NL", phase: "finaleA", place: 5, timeSeconds: 24 }),
      race({ eventCode: "100NL", phase: "finaleB", place: 2, timeSeconds: 54 }),
    ],
  });
  const out = buildResultsSynthesis({
    snapshot: snapshot([sw], { K1: 7 }),
    athleteName: { 7: "Jean Dupont" },
    perfsByUser: {},
    objectivesByUser: {},
    poolLength: 25,
    compDate: COMP_DATE,
  });
  assert.equal(out.totals.finalsA, 1);
});

// ── 4. objectivesMet ──────────────────────────────────────────────────────

test("objectivesMet counts a met objective", () => {
  const sw = swimmer({ key: "K1", races: [race({ eventCode: "50NL", timeSeconds: 23.0 })] });
  const out = buildResultsSynthesis({
    snapshot: snapshot([sw], { K1: 7 }),
    athleteName: { 7: "Jean Dupont" },
    perfsByUser: {},
    objectivesByUser: {
      7: [{ event_code: "50NL", pool_length: 25, target_time_seconds: 23.5 }],
    },
    poolLength: 25,
    compDate: COMP_DATE,
  });
  assert.ok(out.swimmers[0].events[0].verdict?.objective?.met);
  assert.equal(out.totals.objectivesMet, 1);
});

// ── 5. unlinked swimmer ───────────────────────────────────────────────────

test("unlinked swimmer: linked=false, verdicts null, counts to unmatchedCount; podiums/finalsA count it but not newBests/objectivesMet", () => {
  const sw = swimmer({
    key: "K9",
    lastName: "MARTIN",
    firstName: "Lea",
    races: [race({ eventCode: "50NL", phase: "finaleA", place: 1, timeSeconds: 24 })],
  });
  const out = buildResultsSynthesis({
    snapshot: snapshot([sw], { K9: null }),
    athleteName: {},
    perfsByUser: {},
    objectivesByUser: {},
    poolLength: 25,
    compDate: COMP_DATE,
  });
  const s = out.swimmers[0];
  assert.equal(s.linked, false);
  assert.equal(s.userId, null);
  assert.equal(s.name, "MARTIN Lea");
  assert.equal(s.events[0].verdict, null);
  assert.equal(out.unmatchedCount, 1);
  // place-based stats count ALL swimmers (place/final come from the page)
  assert.equal(out.totals.podiums, 1);
  assert.equal(out.totals.finalsA, 1);
  // DB-derived stats count only linked swimmers
  assert.equal(out.totals.newBests, 0);
  assert.equal(out.totals.objectivesMet, 0);
});

// ── 6. ordering: linked before unlinked, preserving input order ───────────

test("ordering: linked swimmers first, then unlinked, preserving input order", () => {
  const u1 = swimmer({ key: "U1", lastName: "AAA", firstName: "a" }); // unlinked
  const l1 = swimmer({ key: "L1", lastName: "BBB", firstName: "b" }); // linked
  const u2 = swimmer({ key: "U2", lastName: "CCC", firstName: "c" }); // unlinked
  const l2 = swimmer({ key: "L2", lastName: "DDD", firstName: "d" }); // linked
  const out = buildResultsSynthesis({
    snapshot: snapshot([u1, l1, u2, l2], { U1: null, L1: 1, U2: null, L2: 2 }),
    athleteName: { 1: "B B", 2: "D D" },
    perfsByUser: {},
    objectivesByUser: {},
    poolLength: 25,
    compDate: COMP_DATE,
  });
  assert.deepEqual(
    out.swimmers.map((s) => s.key),
    ["L1", "L2", "U1", "U2"],
  );
  assert.equal(out.unmatchedCount, 2);
});

// ── 7. null eventCode (collapse sentinel "?...") on a linked swimmer ──────

test("event with null eventCode (sentinel) on linked swimmer → verdict null, no crash", () => {
  const sw = swimmer({
    key: "K1",
    races: [
      race({ eventCode: null, rawEvent: "Relais 4x50", timeSeconds: 90, place: 2, phase: "finaleA" }),
    ],
  });
  const out = buildResultsSynthesis({
    snapshot: snapshot([sw], { K1: 7 }),
    athleteName: { 7: "Jean Dupont" },
    perfsByUser: {
      7: [{ event_code: "50NL", pool_length: 25, time_seconds: 24, competition_date: "2026-01-01" }],
    },
    objectivesByUser: {},
    poolLength: 25,
    compDate: COMP_DATE,
  });
  const s = out.swimmers[0];
  assert.equal(s.linked, true);
  assert.equal(s.events.length, 1);
  assert.equal(s.events[0].verdict, null); // sentinel "?..." → no verdict
  assert.ok(s.events[0].collapsed.eventCode.startsWith("?"));
  assert.equal(out.totals.newBests, 0);
  // place-based still counts (finalPlace 2 + finaleA)
  assert.equal(out.totals.podiums, 1);
  assert.equal(out.totals.finalsA, 1);
});

// ── 8. athleteMap missing key (undefined) → treated as unlinked ───────────

test("missing athleteMap entry (undefined) → unlinked, no crash", () => {
  const sw = swimmer({ key: "KX", lastName: "ZED", firstName: "z" });
  const out = buildResultsSynthesis({
    snapshot: snapshot([sw], {}),
    athleteName: {},
    perfsByUser: {},
    objectivesByUser: {},
    poolLength: 25,
    compDate: COMP_DATE,
  });
  assert.equal(out.swimmers[0].linked, false);
  assert.equal(out.swimmers[0].userId, null);
  assert.equal(out.swimmers[0].name, "ZED z");
  assert.equal(out.unmatchedCount, 1);
});

// ── 9. linked but athleteName missing → fallback to LASTNAME Firstname ────

test("linked swimmer with missing athleteName → fallback name", () => {
  const sw = swimmer({ key: "K1", lastName: "NONAME", firstName: "Bob" });
  const out = buildResultsSynthesis({
    snapshot: snapshot([sw], { K1: 7 }),
    athleteName: {},
    perfsByUser: {},
    objectivesByUser: {},
    poolLength: 25,
    compDate: COMP_DATE,
  });
  assert.equal(out.swimmers[0].linked, true);
  assert.equal(out.swimmers[0].name, "NONAME Bob");
});
