/** API Strength KPI — mesures du wizard KPIs (Chantier B). */
import { supabase, canUseSupabase, assertSupabase } from './client';
import type {
  KpiAttempts,
  StrengthKpiKey,
  StrengthKpiMeasurement,
} from './types';

const ALL_KPI_KEYS: StrengthKpiKey[] = [
  'vertical_jump', 'broad_jump', 'imtp', 'weighted_pullup', 'medball_vertical_throw',
];

export interface RecordKpiInput {
  athlete_id: number;
  kpi_key: StrengthKpiKey;
  value: number;
  unit: string;
  attempts?: KpiAttempts;
  measured_by: number;
  assisted_by?: number | null;
  source: 'wizard_athlete' | 'wizard_coach';
  notes?: string | null;
}

export async function recordKpiMeasurement(
  input: RecordKpiInput,
): Promise<StrengthKpiMeasurement> {
  if (!canUseSupabase()) throw new Error('Supabase not available');
  const data = assertSupabase(
    await supabase
      .from('strength_kpi_measurements')
      .insert({
        athlete_id: input.athlete_id,
        kpi_key: input.kpi_key,
        value: input.value,
        unit: input.unit,
        attempts: input.attempts ?? null,
        measured_by: input.measured_by,
        assisted_by: input.assisted_by ?? null,
        source: input.source,
        notes: input.notes ?? null,
      })
      .select()
      .single(),
  );
  return data as StrengthKpiMeasurement;
}

export async function getKpiHistory(
  athleteId: number,
  kpiKey: StrengthKpiKey,
): Promise<StrengthKpiMeasurement[]> {
  if (!canUseSupabase()) return [];
  const data = assertSupabase(
    await supabase
      .from('strength_kpi_measurements')
      .select('*')
      .eq('athlete_id', athleteId)
      .eq('kpi_key', kpiKey)
      .order('measured_at', { ascending: false }),
  );
  return (data ?? []) as StrengthKpiMeasurement[];
}

export async function getLatestKpiMeasurements(
  athleteId: number,
): Promise<Record<StrengthKpiKey, StrengthKpiMeasurement | null>> {
  const result = Object.fromEntries(
    ALL_KPI_KEYS.map((k) => [k, null]),
  ) as Record<StrengthKpiKey, StrengthKpiMeasurement | null>;
  if (!canUseSupabase()) return result;
  const data = assertSupabase(
    await supabase
      .from('strength_kpi_measurements')
      .select('*')
      .eq('athlete_id', athleteId)
      .order('measured_at', { ascending: false }),
  );
  for (const row of (data ?? []) as StrengthKpiMeasurement[]) {
    if (result[row.kpi_key] === null) result[row.kpi_key] = row;
  }
  return result;
}

export async function markKpiReviewed(id: string): Promise<void> {
  if (!canUseSupabase()) throw new Error('Supabase not available');
  // Use RETURNING id via .select() to detect §113-style silent no-op.
  const data = assertSupabase(
    await supabase
      .from('strength_kpi_measurements')
      .update({ coach_reviewed: true })
      .eq('id', id)
      .select('id'),
  );
  if (!data || data.length === 0) {
    throw new Error('KPI measurement not found or not allowed to update');
  }
}
