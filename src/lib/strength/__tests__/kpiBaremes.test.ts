import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  kpiScore,
  KPI_BAREMES,
  type AgeBand,
  type Bareme,
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
