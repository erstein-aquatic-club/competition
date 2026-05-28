import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  getProfile, getActiveMesocycle, getLatestKpiMeasurements,
  getStrengthHistory, getExercises,
} from '@/lib/api';
import { ageBandFor } from '@/lib/strength/kpiBaremes';
import {
  rankKpis, computeProgressions, computeVolumeStats, describeObjective,
  hasEnoughWrappedData, buildWrappedSlides,
  type SetEntry, type WrappedData, type WrappedSlide,
} from '@/lib/strength/wrappedStats';

const DAYS_180 = 180;

function ageFromBirthdate(birthdate: string | null | undefined): number | null {
  if (!birthdate) return null;
  const b = new Date(birthdate + 'T00:00:00');
  if (Number.isNaN(b.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - b.getFullYear();
  const m = now.getMonth() - b.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < b.getDate())) age--;
  return age;
}

/** Aplati les runs (Supabase: strength_set_logs / localStorage: logs) en SetEntry[]. */
function flattenRuns(runs: any[], nameById: Map<number, string>): SetEntry[] {
  const out: SetEntry[] = [];
  for (const run of runs) {
    const logs = run.strength_set_logs ?? run.logs ?? [];
    const ts = new Date(run.started_at ?? run.date ?? run.created_at ?? 0).getTime();
    const runKey = String(run.id ?? run.started_at ?? Math.random());
    for (const log of logs) {
      const exerciseId = Number(log.exercise_id);
      if (!Number.isFinite(exerciseId)) continue;
      out.push({
        exerciseId,
        exerciseName: nameById.get(exerciseId) ?? `Exercice ${exerciseId}`,
        reps: log.reps != null ? Number(log.reps) : null,
        weight: log.weight != null ? Number(log.weight) : null,
        ts,
        runKey,
      });
    }
  }
  return out;
}

export interface UseStrengthWrappedResult {
  enabled: boolean;          // assez de données → bouton visible
  isLoading: boolean;
  athleteName: string;
  slides: WrappedSlide[];
  data: WrappedData;
}

export function useStrengthWrapped(athleteId: number | null): UseStrengthWrappedResult {
  const { data: profile, isLoading: lp } = useQuery({
    queryKey: ['profile', athleteId],
    queryFn: () => getProfile({ userId: athleteId! }),
    enabled: athleteId != null,
  });
  const { data: meso, isLoading: lm } = useQuery({
    queryKey: ['active-mesocycle', athleteId],
    queryFn: () => getActiveMesocycle(athleteId!),
    enabled: athleteId != null,
  });
  const { data: kpis, isLoading: lk } = useQuery({
    queryKey: ['kpi-latest', athleteId],
    queryFn: () => getLatestKpiMeasurements(athleteId!),
    enabled: athleteId != null,
  });
  const athleteName = profile?.display_name ?? '';
  const fromISO = useMemo(() => {
    const d = new Date(); d.setDate(d.getDate() - DAYS_180);
    return d.toISOString().slice(0, 10);
  }, []);
  const { data: history, isLoading: lh } = useQuery({
    queryKey: ['strength-wrapped-history', athleteId, fromISO],
    queryFn: () => getStrengthHistory(athleteName, {
      athleteId: athleteId!, status: 'completed', from: fromISO, limit: 200, order: 'desc',
    }),
    enabled: athleteId != null,
  });
  const { data: exercises } = useQuery({
    queryKey: ['exercises'],
    queryFn: () => getExercises(),
  });

  return useMemo(() => {
    const now = Date.now();
    const nameById = new Map<number, string>(
      (exercises ?? []).map((e: any) => [Number(e.id), e.nom_exercice ?? e.name ?? `Exercice ${e.id}`]),
    );
    const sets = flattenRuns(history?.runs ?? [], nameById);
    const age = ageFromBirthdate(profile?.birthdate);
    const ageBand = age != null ? ageBandFor(age) : null;
    const ranked = rankKpis(kpis ?? {}, { sex: profile?.sex ?? null, ageBand });
    const forces = ranked.slice(0, 2);
    const last = ranked[ranked.length - 1];
    const potentialAxis = last && last.band.tier >= 3 && !forces.includes(last) ? last : null;
    const progressions = computeProgressions(sets, now);
    const volume = sets.length > 0 ? computeVolumeStats(sets, now) : null;
    const objective = meso ? describeObjective(meso) : null;

    const data: WrappedData = { objective, forces, potentialAxis, progressions, volume };
    const completedRuns = (history?.runs ?? []).length;
    const kpiCount = Object.values(kpis ?? {}).filter(Boolean).length;
    const enabled = hasEnoughWrappedData({ hasMeso: !!meso, kpiCount, completedRuns });

    return {
      enabled,
      isLoading: lp || lm || lk || lh,
      athleteName,
      slides: buildWrappedSlides(data),
      data,
    };
  }, [profile, meso, kpis, history, exercises, athleteName, lp, lm, lk, lh]);
}
