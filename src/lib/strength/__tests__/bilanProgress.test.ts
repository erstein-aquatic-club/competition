import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { computeBilanProgress } from '../bilanProgress.ts';

// §302 — fil conducteur coach : état des 3 étapes (questionnaire / KPIs /
// bilan physique) dérivé du statut de l'assessment + présence de KPIs.
describe('computeBilanProgress', () => {
  it('aucun bilan : tout à faire', () => {
    assert.deepEqual(computeBilanProgress(null, false), {
      questionnaire: 'todo',
      kpis: 'todo',
      physical: 'todo',
    });
  });

  it('questionnaire_pending : questionnaire en cours, le reste à faire', () => {
    assert.deepEqual(computeBilanProgress('questionnaire_pending', false), {
      questionnaire: 'current',
      kpis: 'todo',
      physical: 'todo',
    });
  });

  it('bilan_pending + KPIs faits : questionnaire ok, KPIs ok, physique en cours', () => {
    assert.deepEqual(computeBilanProgress('bilan_pending', true), {
      questionnaire: 'done',
      kpis: 'done',
      physical: 'current',
    });
  });

  it('bilan_pending sans KPIs : KPIs encore à faire (indépendants)', () => {
    assert.deepEqual(computeBilanProgress('bilan_pending', false), {
      questionnaire: 'done',
      kpis: 'todo',
      physical: 'current',
    });
  });

  it('completed + KPIs : tout fait', () => {
    assert.deepEqual(computeBilanProgress('completed', true), {
      questionnaire: 'done',
      kpis: 'done',
      physical: 'done',
    });
  });
});
