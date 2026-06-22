import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  populationComparison,
  buildPhysicalStatsSummary,
  formatKpiValue,
  formatNumber,
  summarizeAttempts,
  buildKpiHistoryRows,
} from '../physicalStats';
import type { RankedKpi } from '../wrappedStats';
import { scoreToBand } from '../wrappedStats';
import type { StrengthKpiKey, StrengthKpiMeasurement, KpiAttempts } from '@/lib/api/types';

function fullMeas(
  over: Partial<StrengthKpiMeasurement> & { kpi_key: StrengthKpiKey },
): StrengthKpiMeasurement {
  return {
    id: over.id ?? 'm1',
    athlete_id: 1,
    kpi_key: over.kpi_key,
    value: over.value ?? 0,
    unit: over.unit ?? 'kg',
    attempts: (over.attempts ?? null) as KpiAttempts | null,
    measured_at: over.measured_at ?? '2026-05-01',
    measured_by: over.measured_by ?? 2,
    assisted_by: null,
    source: over.source ?? 'wizard_coach',
    coach_reviewed: over.coach_reviewed ?? true,
    notes: over.notes ?? null,
    created_at: over.measured_at ?? '2026-05-01',
  };
}

function rk(key: StrengthKpiKey, score: number): RankedKpi {
  return {
    key,
    label: key,
    bucket: 'b',
    score,
    band: scoreToBand(score),
  };
}

test('populationComparison: score = rang centile, top = complément', () => {
  const c = populationComparison(90);
  assert.equal(c.percentile, 90);
  assert.equal(c.topPct, 10);
  assert.equal(c.topLabel, 'top 10 %');
  assert.equal(c.betterThanLabel, 'Mieux que 90 %');
});

test('populationComparison: résolution fine au sommet (élite → top 0,01 %)', () => {
  assert.equal(populationComparison(95).topLabel, 'top 5 %');
  assert.equal(populationComparison(99).topLabel, 'top 1 %');
  assert.equal(populationComparison(99.9).topLabel, 'top 0,1 %');
  // Le score est borné < 100 → plancher 0,01 % pour le profil d'exception.
  assert.equal(populationComparison(100).topLabel, 'top 0,01 %');
});

test('populationComparison: bornes [0,100]', () => {
  assert.equal(populationComparison(-10).percentile, 0);
  assert.equal(populationComparison(140).percentile, 100);
});

test('buildPhysicalStatsSummary: aucune mesure → vide, global null', () => {
  const s = buildPhysicalStatsSummary([]);
  assert.deepEqual(s.measured, []);
  assert.deepEqual(s.strengths, []);
  assert.deepEqual(s.improvements, []);
  assert.equal(s.globalScore, null);
  assert.equal(s.globalComparison, null);
});

test('buildPhysicalStatsSummary: trie, sépare forts (≥70) et axes (<50)', () => {
  const s = buildPhysicalStatsSummary([
    rk('imtp', 40),
    rk('broad_jump', 92),
    rk('weighted_pullup', 75),
    rk('vertical_jump', 30),
  ]);
  assert.deepEqual(s.measured.map((k) => k.key), [
    'broad_jump', 'weighted_pullup', 'imtp', 'vertical_jump',
  ]);
  assert.deepEqual(s.strengths.map((k) => k.key), ['broad_jump', 'weighted_pullup']);
  // axes : plus faible d'abord
  assert.deepEqual(s.improvements.map((k) => k.key), ['vertical_jump', 'imtp']);
  // un KPI n'apparaît jamais dans les deux listes
  const sk = new Set(s.strengths.map((k) => k.key));
  assert.ok(s.improvements.every((k) => !sk.has(k.key)));
});

test('buildPhysicalStatsSummary: indice global = moyenne des scores', () => {
  const s = buildPhysicalStatsSummary([rk('imtp', 40), rk('broad_jump', 60)]);
  assert.equal(s.globalScore, 50);
  assert.equal(s.globalComparison?.topPct, 50);
});

test('buildPhysicalStatsSummary: fallback relatif si aucun seuil franchi', () => {
  // Tous entre 50 et 70 : aucun fort (≥70) ni axe (<50) absolu → fallbacks.
  const s = buildPhysicalStatsSummary([rk('imtp', 65), rk('broad_jump', 55)]);
  assert.deepEqual(s.strengths.map((k) => k.key), ['imtp']);
  assert.deepEqual(s.improvements.map((k) => k.key), ['broad_jump']);
});

test('buildPhysicalStatsSummary: une seule mesure → fort, pas d\'axe', () => {
  const s = buildPhysicalStatsSummary([rk('imtp', 65)]);
  assert.deepEqual(s.strengths.map((k) => k.key), ['imtp']);
  assert.deepEqual(s.improvements, []);
});

test('formatKpiValue: 1 décimale max, sans zéro inutile', () => {
  assert.equal(formatKpiValue(51.234), '51.2');
  assert.equal(formatKpiValue(40), '40');
  assert.equal(formatKpiValue(12.5), '12.5');
});

test('formatNumber: décimales paramétrables, sans zéro de bord', () => {
  assert.equal(formatNumber(0.654, 2), '0.65');
  assert.equal(formatNumber(0.6, 2), '0.6');
  assert.equal(formatNumber(5, 0), '5');
});

test('summarizeAttempts: number[] → une ligne d\'essais bruts', () => {
  const d = summarizeAttempts(fullMeas({ kpi_key: 'imtp', unit: 'kg', attempts: [70, 72.5] }));
  assert.equal(d?.label, 'Essais');
  assert.equal(d?.value, '70 · 72.5 kg');
});

test('summarizeAttempts: détente → temps de vol SANS le poids du nageur', () => {
  const d = summarizeAttempts(
    fullMeas({
      kpi_key: 'vertical_jump',
      unit: 'W/kg',
      attempts: { weight_kg: 65, flight_times: [0.52, 0.55], height_cm: 37.1, peak_power_w: 3520 },
    }),
  );
  assert.equal(d?.label, 'Temps de vol');
  assert.equal(d?.value, '0.52 · 0.55 s');
  // le poids du nageur (65 kg) ne doit JAMAIS apparaître
  assert.ok(!/65/.test(d?.value ?? ''));
});

test('summarizeAttempts: médecine-ball → distances + masse du ballon', () => {
  const d = summarizeAttempts(
    fullMeas({
      kpi_key: 'medball_vertical_throw',
      unit: 'kg·m',
      attempts: { ball_mass_kg: 2, distances_cm: [430, 460], best_distance_cm: 460, index_kg_m: 9.2 },
    }),
  );
  assert.equal(d?.label, 'Distances');
  assert.equal(d?.value, '4.3 · 4.6 m · ballon 2 kg');
});

test('summarizeAttempts: attempts null → null', () => {
  assert.equal(summarizeAttempts(fullMeas({ kpi_key: 'imtp', attempts: null })), null);
});

test('buildKpiHistoryRows: tri desc + Δ vs précédent comparable', () => {
  const rows = buildKpiHistoryRows([
    fullMeas({ id: 'a', kpi_key: 'imtp', unit: 'kg', value: 60, measured_at: '2026-01-01' }),
    fullMeas({ id: 'c', kpi_key: 'imtp', unit: 'kg', value: 75, measured_at: '2026-05-01' }),
    fullMeas({ id: 'b', kpi_key: 'imtp', unit: 'kg', value: 70, measured_at: '2026-03-01' }),
  ]);
  assert.deepEqual(rows.map((r) => r.id), ['c', 'b', 'a']);
  assert.equal(rows[0].deltaVsPrev, 5); // 75 - 70
  assert.equal(rows[1].deltaVsPrev, 10); // 70 - 60
  assert.equal(rows[2].deltaVsPrev, null); // plus ancien
});

test('buildKpiHistoryRows: Δ ignore les unités différentes (cm vs W/kg §293)', () => {
  const rows = buildKpiHistoryRows([
    fullMeas({ id: 'new', kpi_key: 'vertical_jump', unit: 'W/kg', value: 45, measured_at: '2026-05-01' }),
    fullMeas({ id: 'old', kpi_key: 'vertical_jump', unit: 'cm', value: 38, measured_at: '2026-01-01' }),
  ]);
  // pas de mesure W/kg plus ancienne → pas de Δ malgré une mesure cm antérieure
  assert.equal(rows[0].deltaVsPrev, null);
});
