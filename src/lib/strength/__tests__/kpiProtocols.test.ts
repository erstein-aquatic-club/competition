import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { KPI_PROTOCOLS, KPI_DEMO_EXERCISE_ID } from '../kpiProtocols.ts';
import type { StrengthKpiKey } from '@/lib/api/types';

// §301 T2 — câblage des démos KPI : seuls les mouvements ayant un GIF catalogue
// EXACT sont mappés (saut en longueur, traction lestée). Les autres restent sur
// l'illustration SVG (un GIF d'un mouvement voisin serait trompeur).
describe('KPI_DEMO_EXERCISE_ID', () => {
  it('mappe les KPIs avec un GIF catalogue exact', () => {
    assert.equal(KPI_DEMO_EXERCISE_ID.broad_jump, 21); // "Saut en longueur"
    assert.equal(KPI_DEMO_EXERCISE_ID.weighted_pullup, 13); // "Tractions lestées"
  });

  it('laisse null les KPIs sans match exact (SVG conservé)', () => {
    assert.equal(KPI_DEMO_EXERCISE_ID.imtp, null);
    assert.equal(KPI_DEMO_EXERCISE_ID.vertical_jump, null);
    assert.equal(KPI_DEMO_EXERCISE_ID.medball_vertical_throw, null);
  });

  it('couvre exactement les 5 KPIs', () => {
    const keys = (k: Record<string, unknown>) => Object.keys(k).sort();
    assert.deepEqual(
      keys(KPI_DEMO_EXERCISE_ID),
      keys(KPI_PROTOCOLS) as StrengthKpiKey[],
    );
  });
});
