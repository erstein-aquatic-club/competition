import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { computeBilanProgress, nextBilanStep } from '../bilanProgress.ts';

// §302 — fil conducteur coach : état des 4 étapes (questionnaire / KPIs /
// bilan physique / génération) dérivé du statut de l'assessment et de la
// présence de mesures KPI (+ méso actif pour la 4e étape).
describe('computeBilanProgress', () => {
  it('aucun bilan : tout à faire', () => {
    assert.deepEqual(computeBilanProgress(null, false), {
      questionnaire: 'todo',
      kpis: 'todo',
      physical: 'todo',
      generation: 'todo',
    });
  });

  it('questionnaire_pending : questionnaire en cours, le reste à faire', () => {
    assert.deepEqual(computeBilanProgress('questionnaire_pending', false), {
      questionnaire: 'current',
      kpis: 'todo',
      physical: 'todo',
      generation: 'todo',
    });
  });

  it('bilan_pending + KPIs faits : questionnaire ok, KPIs ok, physique en cours', () => {
    assert.deepEqual(computeBilanProgress('bilan_pending', true), {
      questionnaire: 'done',
      kpis: 'done',
      physical: 'current',
      generation: 'todo',
    });
  });

  it('bilan_pending sans KPIs : KPIs encore à faire (indépendants)', () => {
    assert.deepEqual(computeBilanProgress('bilan_pending', false), {
      questionnaire: 'done',
      kpis: 'todo',
      physical: 'current',
      generation: 'todo',
    });
  });

  it('completed + KPIs : physique fait, génération en cours (pas de méso actif)', () => {
    assert.deepEqual(computeBilanProgress('completed', true), {
      questionnaire: 'done',
      kpis: 'done',
      physical: 'done',
      generation: 'current',
    });
  });

  it("computeBilanProgress expose l'étape génération", () => {
    assert.equal(computeBilanProgress('bilan_pending', true).generation, 'todo');
    assert.equal(computeBilanProgress('completed', true).generation, 'current');
    assert.equal(computeBilanProgress('completed', true, true).generation, 'done');
  });
});

describe('nextBilanStep', () => {
  it("pas d'assessment → start", () => {
    assert.equal(nextBilanStep(null, false), 'start');
  });
  it('questionnaire_pending → questionnaire', () => {
    assert.equal(nextBilanStep('questionnaire_pending', false), 'questionnaire');
    assert.equal(nextBilanStep('questionnaire_pending', true), 'questionnaire');
  });
  it('bilan_pending sans KPIs → kpis ; avec KPIs → physical', () => {
    assert.equal(nextBilanStep('bilan_pending', false), 'kpis');
    assert.equal(nextBilanStep('bilan_pending', true), 'physical');
  });
  it('completed → generate (done si méso actif)', () => {
    assert.equal(nextBilanStep('completed', true), 'generate');
    assert.equal(nextBilanStep('completed', true, true), 'done');
  });
});
