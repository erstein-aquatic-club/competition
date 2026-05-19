import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  flightTimeToHeight,
  sayersPeakPower,
  relativePower,
  verticalJumpResult,
} from '../jumpPower.ts';

/** Égalité à tolérance — les calculs sont en flottants. */
const close = (actual: number, expected: number, tol = 1e-6): void => {
  assert.ok(
    Math.abs(actual - expected) < tol,
    `attendu ≈ ${expected}, obtenu ${actual}`,
  );
};

describe('flightTimeToHeight', () => {
  it('convertit un temps de vol en hauteur (h = g·t²/8, en cm)', () => {
    // 9,81 · 0,5² / 8 = 0,3065625 m = 30,65625 cm
    close(flightTimeToHeight(0.5), 30.65625);
  });

  it('croît avec le carré du temps de vol', () => {
    // doubler le temps de vol quadruple la hauteur
    close(flightTimeToHeight(0.6), 4 * flightTimeToHeight(0.3), 1e-9);
  });

  it('throw si le temps de vol est nul ou négatif', () => {
    assert.throws(() => flightTimeToHeight(0), /temps de vol/);
    assert.throws(() => flightTimeToHeight(-0.3), /temps de vol/);
  });
});

describe('sayersPeakPower', () => {
  it('applique l’équation de Sayers (squat jump) : 60,7·h + 45,3·m − 2055', () => {
    // 60,7·40 + 45,3·70 − 2055 = 2428 + 3171 − 2055 = 3544 W
    close(sayersPeakPower(40, 70), 3544);
  });

  it('throw si le poids est nul ou négatif', () => {
    assert.throws(() => sayersPeakPower(40, 0), /poids/);
    assert.throws(() => sayersPeakPower(40, -5), /poids/);
  });
});

describe('relativePower', () => {
  it('normalise la puissance de pic par le poids (W/kg)', () => {
    // 3544 W / 70 kg = 50,6285… W/kg
    close(relativePower(3544, 70), 50.6285714, 1e-5);
  });

  it('throw si le poids est nul ou négatif', () => {
    assert.throws(() => relativePower(3544, 0), /poids/);
    assert.throws(() => relativePower(3544, -1), /poids/);
  });
});

describe('verticalJumpResult', () => {
  it('retient le meilleur saut et calcule la puissance relative', () => {
    // poids 70 kg, temps de vol [0,48 ; 0,52 ; 0,50] → meilleur 0,52 s
    // h = 9,81·0,52²/8 ·100 = 33,158 cm
    // P = 60,7·33,158 + 45,3·70 − 2055 = 3128,7 W
    // P/kg = 3128,7 / 70 = 44,70 W/kg
    const r = verticalJumpResult(70, [0.48, 0.52, 0.5]);
    close(r.value, 44.7, 0.05);
    close(r.heightCm, 33.2, 0.05);
    assert.equal(r.peakPowerW, 3129);
    assert.equal(r.weightKg, 70);
    assert.deepEqual(r.flightTimes, [0.48, 0.52, 0.5]);
  });

  it('fonctionne avec un seul essai', () => {
    // h = 30,656 cm ; P = 2523,8 W ; P/kg = 42,06
    const r = verticalJumpResult(60, [0.5]);
    close(r.value, 42.1, 0.05);
  });

  it('throw si le poids est nul ou négatif', () => {
    assert.throws(() => verticalJumpResult(0, [0.5]), /poids/);
  });

  it('throw si aucun temps de vol', () => {
    assert.throws(() => verticalJumpResult(70, []), /temps de vol/);
  });
});
