import { test } from 'node:test';
import assert from 'node:assert/strict';

import { detectPhase, shortPhaseLabel } from '../strengthPhaseStyles.ts';

// V3 — un libellé vide ne doit PAS retomber sur "force" (badge rouge trompeur).
test('detectPhase: chaîne vide → neutre (reprise), pas force', () => {
  assert.equal(detectPhase(''), 'reprise');
  assert.equal(detectPhase('   '), 'reprise');
});

test('detectPhase: libellés mésocycle reconnus', () => {
  assert.equal(detectPhase('Force max'), 'force');
  assert.equal(detectPhase('Puissance / vitesse'), 'puissance');
  assert.equal(detectPhase('Maintien'), 'taper');
  assert.equal(detectPhase('Affûtage'), 'taper');
  assert.equal(detectPhase('Pic'), 'compétition');
});

// V6 — badge compact et DISTINCT (Maintien ≠ Affûtage), pas la clé enum brute.
test('shortPhaseLabel: raccourcit les libellés longs, garde les distincts', () => {
  assert.equal(shortPhaseLabel('Préparation générale'), 'Prépa');
  assert.equal(shortPhaseLabel('Puissance / vitesse'), 'Puissance');
  assert.equal(shortPhaseLabel('Force max'), 'Force max');
  assert.equal(shortPhaseLabel('Maintien'), 'Maintien');
  assert.equal(shortPhaseLabel('Affûtage'), 'Affûtage');
  assert.equal(shortPhaseLabel('Pic'), 'Pic');
});

test('shortPhaseLabel: libellé inconnu → inchangé', () => {
  assert.equal(shortPhaseLabel('Bloc custom coach'), 'Bloc custom coach');
  assert.equal(shortPhaseLabel(''), '');
});
