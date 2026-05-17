import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { kpiScore, type Bareme } from '../kpiBaremes.ts';

const bareme: Bareme = [
  [20, 0],   // 20 cm → score 0
  [35, 50],  // 35 cm → score 50
  [50, 100], // 50 cm → score 100
];

describe('kpiScore', () => {
  it('interpole linéairement entre deux ancres', () => {
    assert.equal(kpiScore(bareme, 27.5), 25); // milieu de [20,35]
  });
  it('rend la valeur exacte sur une ancre', () => {
    assert.equal(kpiScore(bareme, 35), 50);
  });
  it('borne à 0 sous la première ancre', () => {
    assert.equal(kpiScore(bareme, 10), 0);
  });
  it('borne à 100 au-dessus de la dernière ancre', () => {
    assert.equal(kpiScore(bareme, 80), 100);
  });
  it('throw si le barème a moins de 2 ancres', () => {
    assert.throws(() => kpiScore([[10, 0]], 10), /at least 2/);
  });
});
