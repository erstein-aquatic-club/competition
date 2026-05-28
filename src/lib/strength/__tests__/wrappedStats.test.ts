import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scoreToBand, rankKpis, computeProgressions, computeVolumeStats, describeObjective, hasEnoughWrappedData, buildWrappedSlides, type SetEntry } from '../wrappedStats';
import type { StrengthKpiMeasurement } from '@/lib/api/types';

test('scoreToBand: paliers percentiles', () => {
  assert.equal(scoreToBand(95).label, 'top 10%');
  assert.equal(scoreToBand(90).label, 'top 10%');
  assert.equal(scoreToBand(80).label, 'top 30%');
  assert.equal(scoreToBand(60).label, 'au-dessus de la moyenne');
  assert.equal(scoreToBand(40).label, 'dans la moyenne');
  assert.equal(scoreToBand(10).label, 'gros potentiel de gain');
});

test('scoreToBand: tier ordonné (0=plus fort)', () => {
  assert.ok(scoreToBand(95).tier < scoreToBand(10).tier);
});

function meas(kpi: any, value: number): StrengthKpiMeasurement {
  return {
    id: kpi, athlete_id: 1, kpi_key: kpi, value, unit: 'kg', attempts: null,
    measured_at: '2026-05-01', measured_by: null, assisted_by: null,
    source: 'wizard_coach', coach_reviewed: true, notes: null, created_at: '2026-05-01',
  };
}

test('rankKpis: trie fort→faible, saute les absents', () => {
  const ranked = rankKpis(
    { weighted_pullup: meas('weighted_pullup', 30), imtp: meas('imtp', 60),
      vertical_jump: null, broad_jump: null, medball_vertical_throw: null },
    { sex: 'M', ageBand: 'adulte' },
  );
  assert.ok(ranked.length === 2);
  assert.ok(ranked[0].score >= ranked[1].score);
  assert.ok(ranked[0].label.length > 0);
  assert.ok('band' in ranked[0]);
});

test('rankKpis: profil incomplet → vide', () => {
  const ranked = rankKpis(
    { weighted_pullup: meas('weighted_pullup', 30) } as any,
    { sex: null, ageBand: 'adulte' },
  );
  assert.equal(ranked.length, 0);
});

const NOW = Date.parse('2026-05-28T00:00:00Z');
const d = (daysAgo: number) => NOW - daysAgo * 86400_000;

test('computeProgressions: Δ% best 1RM 90j vs 90j précédents, top 3', () => {
  const sets: SetEntry[] = [
    // Traction : 90j prec best ~ 1RM(100,1)=100 ; recent best ~ 1RM(112,1)=112 → +12%
    { exerciseId: 1, exerciseName: 'Tractions lestées', reps: 1, weight: 100, ts: d(120) },
    { exerciseId: 1, exerciseName: 'Tractions lestées', reps: 1, weight: 112, ts: d(10) },
    // DC : prec 80 → recent 88 = +10%
    { exerciseId: 2, exerciseName: 'Développé couché', reps: 1, weight: 80, ts: d(100) },
    { exerciseId: 2, exerciseName: 'Développé couché', reps: 1, weight: 88, ts: d(5) },
  ];
  const prog = computeProgressions(sets, NOW);
  assert.equal(prog[0].exerciseName, 'Tractions lestées');
  assert.equal(prog[0].deltaPct, 12);
  assert.equal(prog[1].deltaPct, 10);
  assert.ok(prog.length <= 3);
});

test('computeProgressions: ignore exos sans base précédente', () => {
  const sets: SetEntry[] = [
    { exerciseId: 9, exerciseName: 'Squat', reps: 1, weight: 100, ts: d(3) },
  ];
  assert.equal(computeProgressions(sets, NOW).length, 0);
});

test('computeVolumeStats: tonnage/séries/reps + exo le plus pratiqué', () => {
  const NOW2 = Date.parse('2026-05-28T00:00:00Z');
  const day = (n: number) => NOW2 - n * 86400_000;
  const sets = [
    { exerciseId: 1, exerciseName: 'Tractions', reps: 5, weight: 20, ts: day(1), runKey: 'A' },
    { exerciseId: 1, exerciseName: 'Tractions', reps: 5, weight: 20, ts: day(1), runKey: 'A' },
    { exerciseId: 2, exerciseName: 'Squat', reps: 3, weight: 100, ts: day(2), runKey: 'B' },
    { exerciseId: 9, exerciseName: 'Vieux', reps: 5, weight: 50, ts: day(200), runKey: 'Z' },
  ];
  const v = computeVolumeStats(sets as any, NOW2);
  assert.equal(v.totalTonnageKg, 5*20 + 5*20 + 3*100); // 500, l'ancien exclu
  assert.equal(v.totalSets, 3);
  assert.equal(v.totalReps, 13);
  assert.equal(v.sessions, 2);
  assert.equal(v.topExerciseName, 'Tractions');
});

test('describeObjective: libellé lisible', () => {
  const o = describeObjective({ event_group: 'sprint', target_week_count: 8, sessions_per_week: 3 } as any);
  assert.ok(o.title.length > 0);
  assert.equal(o.weeks, 8);
  assert.equal(o.sessionsPerWeek, 3);
});

test('hasEnoughWrappedData: vrai si au moins une source', () => {
  assert.equal(hasEnoughWrappedData({ hasMeso: false, kpiCount: 0, completedRuns: 0 }), false);
  assert.equal(hasEnoughWrappedData({ hasMeso: true, kpiCount: 0, completedRuns: 0 }), true);
  assert.equal(hasEnoughWrappedData({ hasMeso: false, kpiCount: 1, completedRuns: 0 }), true);
  assert.equal(hasEnoughWrappedData({ hasMeso: false, kpiCount: 0, completedRuns: 3 }), true);
  assert.equal(hasEnoughWrappedData({ hasMeso: false, kpiCount: 0, completedRuns: 2 }), false);
});

test('buildWrappedSlides: saute les sections vides, garde cover+outro', () => {
  const slides = buildWrappedSlides({
    objective: null, forces: [], potentialAxis: null,
    progressions: [], volume: null,
  });
  // cover + outro toujours présents
  assert.deepEqual(slides.map(s => s.kind), ['cover', 'outro']);
});

test('buildWrappedSlides: ordre complet quand tout présent', () => {
  const slides = buildWrappedSlides({
    objective: { title: 'Sprint', focusLabel: null, weeks: 8, sessionsPerWeek: 3 },
    forces: [{ key: 'imtp', label: 'X', bucket: 'B', score: 80, band: scoreToBand(80) }],
    potentialAxis: { key: 'weighted_pullup', label: 'Y', bucket: 'B', score: 20, band: scoreToBand(20) },
    progressions: [{ exerciseId: 1, exerciseName: 'Tractions', deltaPct: 12 }],
    volume: { totalTonnageKg: 700, totalSets: 40, totalReps: 200, sessions: 12, topExerciseName: 'Tractions' },
  });
  assert.deepEqual(slides.map(s => s.kind),
    ['cover', 'objective', 'forces', 'potential', 'progressions', 'volume', 'funstat', 'outro']);
});

test('describeObjective: focus = top trainable bucket (mobility sautée)', () => {
  const o = describeObjective({
    event_group: 'sprint', target_week_count: 8, sessions_per_week: 3,
    bucket_priorities: {
      bucketScores: {},
      bucketPriorities: [
        { bucket: 'mobility', rank: 1, score: 0, rationale: '', overrideApplied: true },
        { bucket: 'upper_power', rank: 2, score: 50, rationale: '', overrideApplied: false },
      ],
    },
  } as any);
  assert.equal(o.focusLabel, 'Puissance du haut du corps');
});

test('describeObjective: focus = bucket de rank 1 si entraînable', () => {
  const o = describeObjective({
    event_group: 'sprint', target_week_count: 8, sessions_per_week: 3,
    bucket_priorities: {
      bucketPriorities: [{ bucket: 'upper_strength', rank: 1, score: 10, rationale: '', overrideApplied: false }],
    },
  } as any);
  assert.equal(o.focusLabel, 'Force du haut du corps');
});

test('describeObjective: bucket_priorities null ou forme inconnue → focusLabel null', () => {
  assert.equal(describeObjective({ event_group: 'sprint', target_week_count: 8, sessions_per_week: 3, bucket_priorities: null } as any).focusLabel, null);
  assert.equal(describeObjective({ event_group: 'sprint', target_week_count: 8, sessions_per_week: 3, bucket_priorities: { garbage: true } } as any).focusLabel, null);
});

test('computeVolumeStats: fallback session par jour quand runKey absent', () => {
  const NOW3 = Date.parse('2026-05-28T00:00:00Z');
  const day = (n: number) => NOW3 - n * 86400_000;
  const sameDay = [
    { exerciseId: 1, exerciseName: 'A', reps: 5, weight: 20, ts: day(1) },
    { exerciseId: 2, exerciseName: 'B', reps: 5, weight: 20, ts: day(1) },
  ];
  assert.equal(computeVolumeStats(sameDay as any, NOW3).sessions, 1);
  const diffDays = [
    { exerciseId: 1, exerciseName: 'A', reps: 5, weight: 20, ts: day(1) },
    { exerciseId: 2, exerciseName: 'B', reps: 5, weight: 20, ts: day(2) },
  ];
  assert.equal(computeVolumeStats(diffDays as any, NOW3).sessions, 2);
});
