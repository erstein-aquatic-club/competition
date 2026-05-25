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
  /**
   * §314 (#3 Slice B) — clé d'idempotence générée côté client (UUID), stable
   * par mesure. Quand fournie, l'écriture devient un UPSERT `ON CONFLICT
   * (client_dedup_key)` → un replay de la file offline (ACK perdu) ne crée pas
   * de doublon. Absente (autres appelants) → INSERT classique inchangé.
   */
  client_dedup_key?: string;
}

export async function recordKpiMeasurement(
  input: RecordKpiInput,
): Promise<StrengthKpiMeasurement> {
  if (!canUseSupabase()) throw new Error('Supabase not available');
  const row = {
    athlete_id: input.athlete_id,
    kpi_key: input.kpi_key,
    value: input.value,
    unit: input.unit,
    attempts: input.attempts ?? null,
    measured_by: input.measured_by,
    assisted_by: input.assisted_by ?? null,
    source: input.source,
    notes: input.notes ?? null,
    client_dedup_key: input.client_dedup_key ?? null,
  };
  const table = supabase.from('strength_kpi_measurements');
  // §314 (#3 Slice B) — avec une clé de dédup, UPSERT ON CONFLICT
  // (client_dedup_key) : un replay de la file offline après ACK perdu ne
  // duplique pas la mesure (l'index unique sur client_dedup_key, mig 00205,
  // ignore les NULL → les écritures sans clé restent un INSERT normal).
  const builder = input.client_dedup_key
    ? table.upsert(row, { onConflict: 'client_dedup_key' })
    : table.insert(row);
  const data = assertSupabase(await builder.select().single());
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
