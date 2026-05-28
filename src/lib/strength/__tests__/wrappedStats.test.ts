import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scoreToBand, rankKpis, computeProgressions, computeVolumeStats, type SetEntry } from '../wrappedStats';
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
