import type { StrengthKpiKey, StrengthKpiMeasurement, StrengthMesocycle } from '@/lib/api/types';
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

export interface ObjectiveInfo {
  title: string;
  focusLabel: string | null;
  weeks: number;
  sessionsPerWeek: number;
}

const EVENT_GROUP_LABELS: Record<string, string> = {
  sprint: 'Préparation sprint',
  fond: 'Préparation demi-fond / fond',
};

const BUCKET_FR: Record<string, string> = {
  upper_strength: 'Force du haut du corps',
  upper_power: 'Puissance du haut du corps',
  lower_strength: 'Force du bas du corps',
  lower_power: 'Puissance du bas du corps',
  core: 'Gainage / tronc',
};

/** Best-effort : tente d'extraire le seau prioritaire du JSONB ; null si forme inconnue. */
function extractFocusLabel(bp: StrengthMesocycle['bucket_priorities']): string | null {
  if (!bp || typeof bp !== 'object') return null;
  // forme attendue best-effort : { focus?: string[] } ou { priorities?: {bucket,score}[] }
  const focus = (bp as any).focus;
  if (Array.isArray(focus) && typeof focus[0] === 'string') {
    return BUCKET_FR[focus[0]] ?? null;
  }
  return null;
}

export function describeObjective(meso: StrengthMesocycle): ObjectiveInfo {
  return {
    title: EVENT_GROUP_LABELS[meso.event_group] ?? `Plan ${meso.event_group}`,
    focusLabel: extractFocusLabel(meso.bucket_priorities), // best-effort, peut être null
    weeks: meso.target_week_count,
    sessionsPerWeek: meso.sessions_per_week,
  };
}

export function hasEnoughWrappedData(d: {
  hasMeso: boolean; kpiCount: number; completedRuns: number;
}): boolean {
  return d.hasMeso || d.kpiCount >= 1 || d.completedRuns >= 3;
}

export type WrappedSlideKind =
  | 'cover' | 'objective' | 'forces' | 'potential'
  | 'progressions' | 'volume' | 'funstat' | 'outro';

export interface WrappedSlide { kind: WrappedSlideKind }

export interface WrappedData {
  objective: ObjectiveInfo | null;
  forces: RankedKpi[];
  potentialAxis: RankedKpi | null;
  progressions: ProgressionItem[];
  volume: VolumeStats | null;
}

export function buildWrappedSlides(data: WrappedData): WrappedSlide[] {
  const slides: WrappedSlide[] = [{ kind: 'cover' }];
  if (data.objective) slides.push({ kind: 'objective' });
  if (data.forces.length > 0) slides.push({ kind: 'forces' });
  if (data.potentialAxis) slides.push({ kind: 'potential' });
  if (data.progressions.length > 0) slides.push({ kind: 'progressions' });
  if (data.volume && data.volume.totalSets > 0) slides.push({ kind: 'volume' });
  if (data.volume && data.volume.topExerciseName) slides.push({ kind: 'funstat' });
  slides.push({ kind: 'outro' });
  return slides;
}
