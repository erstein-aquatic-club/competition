/**
 * Tests node:test pour KpiStopwatch — §295.
 *
 * Le projet utilise `node --test --import tsx` (pas vitest pour `npm test`).
 * On teste uniquement `formatStopwatchSeconds` (helper pur, DOM-agnostique) ici.
 * Les tests d'interaction du composant React seraient idéalement RTL/userEvent
 * mais nécessitent jsdom — non configuré pour le runner node:test du projet.
 * La validation de la state machine se fait par revue de code + smoke manuel.
 */
import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';

import { formatStopwatchSeconds } from '../KpiStopwatch';

describe('formatStopwatchSeconds', () => {
  it('renvoie 2 décimales pour une valeur entière', () => {
    assert.equal(formatStopwatchSeconds(0.5), '0.50');
  });

  it('arrondit correctement à 2 décimales (sous)', () => {
    assert.equal(formatStopwatchSeconds(0.523), '0.52');
  });

  it('arrondit correctement à 2 décimales (sur)', () => {
    assert.equal(formatStopwatchSeconds(0.527), '0.53');
  });

  it('clamp à 0 si négatif (jamais NaN, jamais -0.10)', () => {
    assert.equal(formatStopwatchSeconds(-0.1), '0.00');
  });

  it('renvoie 0.00 pour 0', () => {
    assert.equal(formatStopwatchSeconds(0), '0.00');
  });

  it('arrondit 1.999 à 2.00', () => {
    assert.equal(formatStopwatchSeconds(1.999), '2.00');
  });
});
