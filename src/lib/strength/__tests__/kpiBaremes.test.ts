import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  kpiScore,
  KPI_BAREMES,
  baremeConfidenceFor,
  ageBandFor,
  getBareme,
  type AgeBand,
  type Bareme,
  type BaremeConfidence,
  type BaremeSex,
} from '../kpiBaremes.ts';
import type { StrengthKpiKey } from '@/lib/api/types';

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

// Task 1 (muscu G1) — au-delà de la dernière ancre, kpiScore extrapole la pente
// du dernier segment (p90→100) au lieu de plafonner à 90 : les profils > p90
// restent discriminables.
describe('kpiScore — plafond extrapolé (Task 1)', () => {
  const wp1: Bareme = [[0, 10], [10, 50], [20, 90]]; // dernier segment slope = 4 pts/unité
  it('atteint 90 pile sur la dernière ancre', () => {
    assert.equal(kpiScore(wp1, 20), 90);
  });
  it('extrapole au-dessus de p90 au lieu de plafonner à 90', () => {
    assert.equal(kpiScore(wp1, 22.5), 100); // 90 + 2.5*4
  });
  it('clampe à 100 pour les valeurs très au-dessus', () => {
    assert.equal(kpiScore(wp1, 50), 100);
  });
  it('garde le plancher sous la première ancre', () => {
    assert.equal(kpiScore(wp1, -5), 10);
  });
});

// Task 2 (muscu G1) — bande 'adulte' (>=19 ans) dérivée des ancres 17-18
// (plateau de maturité), pour ne plus rabattre les adultes sur la population
// scolaire 17-18 sans le dire.
describe('bande adulte (Task 2)', () => {
  it('mappe 18 ans sur 17-18 et 19+ sur adulte', () => {
    assert.equal(ageBandFor(18), '17-18');
    assert.equal(ageBandFor(19), 'adulte');
    assert.equal(ageBandFor(27), 'adulte');
  });
  it('initialise adulte sur les ancres 17-18 pour chaque KPI×sexe', () => {
    assert.deepEqual(
      getBareme('weighted_pullup', 'F', 'adulte').anchors,
      getBareme('weighted_pullup', 'F', '17-18').anchors,
    );
    assert.deepEqual(
      getBareme('imtp', 'M', 'adulte').anchors,
      getBareme('imtp', 'M', '17-18').anchors,
    );
  });
});

describe('KPI_BAREMES — structure', () => {
  const KPI_KEYS: StrengthKpiKey[] = [
    'vertical_jump',
    'broad_jump',
    'imtp',
    'weighted_pullup',
    'medball_vertical_throw',
  ];
  const SEXES: BaremeSex[] = ['M', 'F'];
  const BANDS: AgeBand[] = ['13-14', '15-16', '17-18'];

  it('couvre les 5 KPIs × 2 sexes × 3 bandes (30 barèmes)', () => {
    let count = 0;
    for (const kpi of KPI_KEYS) {
      assert.ok(KPI_BAREMES[kpi], `KPI manquant : ${kpi}`);
      for (const sex of SEXES) {
        assert.ok(KPI_BAREMES[kpi][sex], `sexe manquant : ${kpi}/${sex}`);
        for (const band of BANDS) {
          assert.ok(
            KPI_BAREMES[kpi][sex][band],
            `barème manquant : ${kpi}/${sex}/${band}`,
          );
          count++;
        }
      }
    }
    assert.equal(count, 30);
    // Aucune clé KPI inattendue.
    assert.equal(Object.keys(KPI_BAREMES).length, KPI_KEYS.length);
  });

  for (const kpi of KPI_KEYS) {
    for (const sex of SEXES) {
      for (const band of BANDS) {
        it(`${kpi}/${sex}/${band} : ≥2 ancres triées strictement croissant`, () => {
          const entry = KPI_BAREMES[kpi][sex][band];
          const anchors: Bareme = entry.anchors;
          assert.ok(anchors.length >= 2, 'au moins 2 ancres');
          for (let i = 1; i < anchors.length; i++) {
            assert.ok(
              anchors[i][0] > anchors[i - 1][0],
              `valeurBrute non strictement croissante à l'index ${i} ` +
                `(${anchors[i - 1][0]} → ${anchors[i][0]})`,
            );
          }
          // Le flag de confiance est l'une des 3 valeurs admises.
          assert.ok(
            ['solid', 'transposed', 'placeholder'].includes(entry.confidence),
            `confidence invalide : ${entry.confidence}`,
          );
        });
      }
    }
  }
});

// §301 T3 — confiance du barème exposée par-KPI, pour l'afficher au moment de la
// mesure (le recap wizard) et pas seulement à l'aperçu mésocycle.
describe('baremeConfidenceFor', () => {
  const EXPECTED: Record<StrengthKpiKey, BaremeConfidence> = {
    broad_jump: 'solid',
    vertical_jump: 'transposed',
    imtp: 'transposed',
    weighted_pullup: 'transposed',
    medball_vertical_throw: 'placeholder',
  };

  for (const [kpi, confidence] of Object.entries(EXPECTED)) {
    it(`${kpi} → ${confidence}`, () => {
      assert.equal(baremeConfidenceFor(kpi as StrengthKpiKey), confidence);
    });
  }

  it('est invariante par sexe × bande (ne ment sur aucune entrée)', () => {
    const SEXES: BaremeSex[] = ['M', 'F'];
    const BANDS: AgeBand[] = ['13-14', '15-16', '17-18'];
    for (const kpi of Object.keys(EXPECTED) as StrengthKpiKey[]) {
      const expected = baremeConfidenceFor(kpi);
      for (const sex of SEXES) {
        for (const band of BANDS) {
          assert.equal(
            KPI_BAREMES[kpi][sex][band].confidence,
            expected,
            `${kpi}/${sex}/${band} diverge de baremeConfidenceFor`,
          );
        }
      }
    }
  });
});
