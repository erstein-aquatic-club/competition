import type { StrengthKpiKey, StrengthKpiMeasurement } from '@/lib/api/types';
import { KPI_PROTOCOLS } from './kpiProtocols';
import { getBareme, kpiScore, type AgeBand } from './kpiBaremes';

export interface ScoreBand {
  /** Libellé affiché au nageur (jamais de valeur brute). */
  label: string;
  /** 0 = le plus fort, 4 = le plus faible (pour trier). */
  tier: number;
}

/** Mappe un score KPI 0-100 (ancré percentiles p10…p90) vers une bande. */
export function scoreToBand(score: number): ScoreBand {
  if (score >= 90) return { label: 'top 10%', tier: 0 };
  if (score >= 70) return { label: 'top 30%', tier: 1 };
  if (score >= 50) return { label: 'au-dessus de la moyenne', tier: 2 };
  if (score >= 30) return { label: 'dans la moyenne', tier: 3 };
  return { label: 'gros potentiel de gain', tier: 4 };
}

export interface RankedKpi {
  key: StrengthKpiKey;
  label: string;     // KPI_PROTOCOLS[key].label
  bucket: string;    // KPI_PROTOCOLS[key].bucket
  score: number;     // 0-100 vs population
  band: ScoreBand;
}

export interface WrappedAthlete {
  sex: 'M' | 'F' | null;
  ageBand: AgeBand | null;
}

const KPI_KEYS: StrengthKpiKey[] = [
  'vertical_jump', 'broad_jump', 'imtp', 'weighted_pullup', 'medball_vertical_throw',
];

export function rankKpis(
  latest: Partial<Record<StrengthKpiKey, StrengthKpiMeasurement | null>>,
  athlete: WrappedAthlete,
): RankedKpi[] {
  if (!athlete.sex || !athlete.ageBand) return [];
  const out: RankedKpi[] = [];
  for (const key of KPI_KEYS) {
    const m = latest[key];
    if (!m) continue;
    const bareme = getBareme(key, athlete.sex, athlete.ageBand);
    const score = kpiScore(bareme.anchors, m.value);
    out.push({
      key,
      label: KPI_PROTOCOLS[key].label,
      bucket: KPI_PROTOCOLS[key].bucket,
      score,
      band: scoreToBand(score),
    });
  }
  return out.sort((a, b) => b.score - a.score);
}
