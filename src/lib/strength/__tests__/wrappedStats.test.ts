import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scoreToBand, rankKpis } from '../wrappedStats';
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
