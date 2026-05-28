import type { StrengthKpiKey, StrengthKpiMeasurement } from '@/lib/api/types';
import { KPI_PROTOCOLS } from './kpiProtocols';
import { getBareme, kpiScore, type AgeBand } from './kpiBaremes';
import { estimateOneRm } from '@/lib/api/client';

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

export interface SetEntry {
  exerciseId: number;
  exerciseName: string;
  reps: number | null;
  weight: number | null;
  ts: number; // epoch ms de la séance
  runKey?: string;
}

export interface ProgressionItem {
  exerciseId: number;
  exerciseName: string;
  deltaPct: number;   // arrondi
}

const WINDOW_MS = 90 * 86400_000;

export function computeProgressions(sets: SetEntry[], now: number): ProgressionItem[] {
  // best 1RM estimé par exo, par fenêtre (recent = [now-90j, now], prev = [now-180j, now-90j])
  const best = new Map<number, { name: string; recent: number; prev: number }>();
  for (const s of sets) {
    const est = estimateOneRm(s.weight, s.reps);
    if (est == null) continue; // bodyweight / invalide
    const age = now - s.ts;
    const slot = age <= WINDOW_MS ? 'recent' : age <= 2 * WINDOW_MS ? 'prev' : null;
    if (!slot) continue;
    const cur = best.get(s.exerciseId) ?? { name: s.exerciseName, recent: 0, prev: 0 };
    cur[slot] = Math.max(cur[slot], est);
    best.set(s.exerciseId, cur);
  }
  const items: ProgressionItem[] = [];
  for (const [exerciseId, b] of best) {
    if (b.prev <= 0 || b.recent <= 0) continue;
    const deltaPct = Math.round(((b.recent - b.prev) / b.prev) * 100);
    if (deltaPct <= 0) continue; // on ne montre que les progressions
    items.push({ exerciseId, exerciseName: b.name, deltaPct });
  }
  return items.sort((a, b) => b.deltaPct - a.deltaPct).slice(0, 3);
}

export interface VolumeStats {
  totalTonnageKg: number;
  totalSets: number;
  totalReps: number;
  sessions: number;       // séances distinctes (runKey)
  topExerciseName: string | null;
}

export function computeVolumeStats(sets: SetEntry[], now: number): VolumeStats {
  let tonnage = 0, totalSets = 0, totalReps = 0;
  const runs = new Set<string>();
  const setsByExo = new Map<number, { name: string; n: number }>();
  for (const s of sets) {
    if (now - s.ts > WINDOW_MS) continue;
    const reps = Number(s.reps ?? 0) || 0;
    const w = Number.isFinite(s.weight) && (s.weight ?? 0) > 0 ? (s.weight as number) : 0;
    tonnage += reps * w;
    totalSets += 1;
    totalReps += reps;
    if (s.runKey) runs.add(s.runKey);
    const e = setsByExo.get(s.exerciseId) ?? { name: s.exerciseName, n: 0 };
    e.n += 1;
    setsByExo.set(s.exerciseId, e);
  }
  let top: { name: string; n: number } | null = null;
  for (const e of setsByExo.values()) if (!top || e.n > top.n) top = e;
  return {
    totalTonnageKg: Math.round(tonnage),
    totalSets, totalReps,
    sessions: runs.size,
    topExerciseName: top?.name ?? null,
  };
}
