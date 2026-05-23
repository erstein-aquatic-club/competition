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
  // §301 T4 — on retient la MOYENNE des temps de vol (et non le max) : le max
  // sélectionne l'essai au plus grand bruit de chrono → biais vers le haut. La
  // moyenne est plus répétable. Un écart-type est renvoyé pour signaler un set
  // d'essais incohérent.
  it('retient la MOYENNE des temps de vol (pas le max)', () => {
    // poids 70 kg, [0,48 ; 0,52 ; 0,50] → moyenne 0,50 s (max serait 0,52)
    // h = 9,81·0,50²/8 ·100 = 30,656 cm
    // P = 60,7·30,656 + 45,3·70 − 2055 = 2976,8 W ; P/kg = 42,53
    const r = verticalJumpResult(70, [0.48, 0.52, 0.5]);
    close(r.meanFlightTimeSec, 0.5, 1e-9);
    close(r.value, 42.5, 0.05);
    close(r.heightCm, 30.7, 0.05);
    assert.equal(r.peakPowerW, 2977);
    assert.equal(r.weightKg, 70);
    assert.deepEqual(r.flightTimes, [0.48, 0.52, 0.5]);
  });

  it('ne prend PAS le max : [0,4 ; 0,6] → moyenne 0,5', () => {
    const r = verticalJumpResult(70, [0.4, 0.6]);
    close(r.meanFlightTimeSec, 0.5, 1e-9);
  });

  it('renvoie l’écart-type (échantillon) des temps de vol', () => {
    // [0,48 ; 0,52 ; 0,50] : moyenne 0,50 ; var échantillon = 0,0008/2 = 0,0004
    // → écart-type = 0,02 s
    const r = verticalJumpResult(70, [0.48, 0.52, 0.5]);
    close(r.flightTimeStdevSec, 0.02, 1e-9);
  });

  it('écart-type nul pour un seul essai', () => {
    const r = verticalJumpResult(60, [0.5]);
    assert.equal(r.flightTimeStdevSec, 0);
    // un seul essai : la moyenne EST cette valeur → calcul inchangé
    close(r.value, 42.1, 0.05);
    close(r.meanFlightTimeSec, 0.5, 1e-9);
  });

  it('throw si le poids est nul ou négatif', () => {
    assert.throws(() => verticalJumpResult(0, [0.5]), /poids/);
  });

  it('throw si aucun temps de vol', () => {
    assert.throws(() => verticalJumpResult(70, []), /temps de vol/);
  });
});
