import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  populationComparison,
  buildPhysicalStatsSummary,
  formatKpiValue,
} from '../physicalStats';
import type { RankedKpi } from '../wrappedStats';
import { scoreToBand } from '../wrappedStats';
import type { StrengthKpiKey } from '@/lib/api/types';

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
