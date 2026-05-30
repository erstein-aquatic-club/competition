import { test } from "node:test";
import assert from "node:assert/strict";

import {
  buildMobilityEvolution,
  MOBILITY_EVOLUTION_AXES,
  type MobilityEvolutionAxisKey,
} from "../mobilityEvolution.ts";
import type { StrengthAssessment } from "@/lib/api/types";

/** Minimal builder for a completed assessment with physical tests. */
function makeAssessment(
  overrides: Partial<StrengthAssessment>,
): StrengthAssessment {
  return {
    id: "a",
    athlete_id: 1,
    coach_id: 2,
    status: "completed",
    questionnaire: null,
    physical_tests: null,
    bucket_scores: null,
    data_confidence: "full",
    sessions_per_week: null,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

test("buildMobilityEvolution: 6 axes, old number-shape and v2 G/D, sorted asc, nulls skipped", () => {
  // Old (number-shape) bilan — earlier date.
  const oldBilan = makeAssessment({
    id: "old",
    created_at: "2026-01-10T08:00:00.000Z",
    physical_tests: {
      mobility: { shoulder_flexion: 2, t_spine: 1, hip: 3 },
      movement: { scapula_control: 2, trunk_neck_alignment: 1, hip_hinge: 2 },
      filled_at: "2026-01-10T08:00:00.000Z",
    },
  });

  // v2 bilan with asymmetric shoulder G=3 / D=1 — later date.
  const v2Bilan = makeAssessment({
    id: "v2",
    created_at: "2026-03-15T08:00:00.000Z",
    physical_tests: {
      mobility: {
        shoulder_flexion: { left: 3, right: 1 },
        t_spine: { left: 2, right: 2 },
        hip: { left: 3, right: 3 },
      },
      movement: {
        scapula_control: { left: 2, right: 2 },
        trunk_neck_alignment: { left: 1, right: 1 },
        hip_hinge: { left: 2, right: 2 },
      },
      filled_at: "2026-03-15T09:00:00.000Z",
    },
  });

  // Skipped — no physical tests at all.
  const noPhysical = makeAssessment({ id: "none", physical_tests: null });

  // Order in the input is deliberately reversed (API returns desc).
  const result = buildMobilityEvolution([v2Bilan, noPhysical, oldBilan]);

  // All 6 axes present.
  assert.deepEqual(
    new Set(Object.keys(result)),
    new Set(MOBILITY_EVOLUTION_AXES.map((a) => a.key)),
  );

  const shoulder = result.shoulder_flexion;
  // 2 points (null one skipped), sorted ascending by date.
  assert.equal(shoulder.length, 2);
  assert.ok(shoulder[0].date < shoulder[1].date, "points sorted ascending");

  // Old one: number-shape → left === right, effective = min.
  assert.deepEqual(
    { left: shoulder[0].left, right: shoulder[0].right, effective: shoulder[0].effective },
    { left: 2, right: 2, effective: 2 },
  );

  // v2 one: G=3 / D=1, effective (weak side) = 1.
  assert.deepEqual(
    { left: shoulder[1].left, right: shoulder[1].right, effective: shoulder[1].effective },
    { left: 3, right: 1, effective: 1 },
  );

  // The v2 point uses filled_at when present.
  assert.equal(shoulder[1].date, "2026-03-15T09:00:00.000Z");
});

test("buildMobilityEvolution: empty input → empty series for every axis", () => {
  const result = buildMobilityEvolution([]);
  for (const axis of MOBILITY_EVOLUTION_AXES) {
    const key: MobilityEvolutionAxisKey = axis.key;
    assert.deepEqual(result[key], []);
  }
});

test("buildMobilityEvolution: assessment with physical_tests but no filled_at falls back to created_at", () => {
  const a = makeAssessment({
    id: "nofill",
    created_at: "2026-02-02T00:00:00.000Z",
    physical_tests: {
      mobility: { shoulder_flexion: 1, t_spine: 1, hip: 1 },
      movement: { scapula_control: 1, trunk_neck_alignment: 1, hip_hinge: 1 },
      // filled_at intentionally empty string → fall back to created_at
      filled_at: "",
    },
  });
  const result = buildMobilityEvolution([a]);
  assert.equal(result.shoulder_flexion[0].date, "2026-02-02T00:00:00.000Z");
});
