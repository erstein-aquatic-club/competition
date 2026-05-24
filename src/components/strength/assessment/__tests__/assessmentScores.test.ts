import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  MOBILITY_SCORES,
  MOVEMENT_SCORES,
} from '../assessmentScores.ts';

// §301 T5 — la rubrique doit définir CHAQUE niveau 0-3 par axe (pas seulement
// les extrêmes) pour être reproductible d'un coach à l'autre, + un repère
// chiffré / protocole de mesure.
describe('assessmentScores — rubrique 0-3 complète', () => {
  const ALL = [...MOBILITY_SCORES, ...MOVEMENT_SCORES];

  it('couvre 6 axes (3 mobilité + 3 mouvement)', () => {
    assert.equal(MOBILITY_SCORES.length, 3);
    assert.equal(MOVEMENT_SCORES.length, 3);
  });

  for (const item of ALL) {
    it(`${item.key} : descripteur non vide pour chaque niveau 0-3 + gauge`, () => {
      for (const level of [0, 1, 2, 3] as const) {
        const desc = item.levels[level];
        assert.equal(
          typeof desc,
          'string',
          `${item.key} niveau ${level} manquant`,
        );
        assert.ok(
          desc.trim().length > 0,
          `${item.key} niveau ${level} vide`,
        );
      }
      assert.ok(
        typeof item.gauge === 'string' && item.gauge.trim().length > 0,
        `${item.key} : repère chiffré (gauge) manquant`,
      );
    });
  }
});
