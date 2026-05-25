import { test } from 'node:test';
import assert from 'node:assert/strict';
import { medballThrowResult } from '../medballPower.ts';

/**
 * Indice balistique du lancer médecine-ball assis (§309).
 * index (kg·m) = masse_ballon × distance_m ; ∝ travail imparti au ballon.
 * Permet de choisir la masse adaptée à l'athlète tout en scorant sur une échelle
 * unique. Meilleur de N essais.
 */

test('medballThrowResult: index = masse × distance(m), meilleur essai retenu', () => {
  const r = medballThrowResult(2, [380, 410, 405]);
  assert.equal(r.ballMassKg, 2);
  assert.equal(r.bestDistanceCm, 410);
  // 2 kg × 4.10 m = 8.2 kg·m
  assert.equal(Math.round(r.value * 100) / 100, 8.2);
});

test('medballThrowResult: une masse plus lourde sur une distance plus courte peut dépasser (énergie)', () => {
  const light = medballThrowResult(2, [410]); // 8.2 kg·m
  const heavy = medballThrowResult(5, [250]); // 12.5 kg·m
  assert.ok(heavy.value > light.value, 'le travail imparti croît avec la masse (force-vitesse)');
});

test('medballThrowResult: masse ≤ 0 → throw', () => {
  assert.throws(() => medballThrowResult(0, [400]), /masse/i);
  assert.throws(() => medballThrowResult(-3, [400]), /masse/i);
});

test('medballThrowResult: aucune distance positive → throw', () => {
  assert.throws(() => medballThrowResult(3, []), /distance/i);
  assert.throws(() => medballThrowResult(3, [0, -10]), /distance/i);
});
