/**
 * API Strength Mesocycles — Chantier C+D (§293).
 *
 * Wrappers fins autour du moteur pur (`mesocycleEngine.ts`) et des RPC
 * `apply_strength_mesocycle` / `revert_strength_mesocycle` (migrations 00172
 * / 00173). Le moteur tourne côté client ; les RPC matérialisent le mésocycle
 * en base.
 *
 * Pipeline complet du nageur :
 *   1. UI rassemble `MesocycleInput` (évaluation, KPI, athlète, template,
 *      durée, sessions/semaine, catalogue).
 *   2. UI appelle `generateMesocyclePreview(input)` → aperçu local.
 *   3. UI confirme → `applyMesocycle(input, generated, startWeekMonday)` →
 *      RPC matérialise + retourne l'UUID du mésocycle persisté.
 *   4. Coach (ou nageur) peut appeler `revertMesocycle(id)` pour annuler.
 */
import { supabase, canUseSupabase, assertSupabase } from './client';
import {
  generateMesocycle as runEngine,
} from '@/lib/strength/mesocycleEngine';
import type {
  GeneratedMesocycle,
  MesocycleExercise,
  MesocycleInput,
  MesocycleSession,
  MesocycleWeek,
} from '@/lib/strength/mesocycleEngine.types';
import type { StrengthMesocycle } from './types';

/**
 * Exécute le moteur de génération localement, sans aucun appel réseau.
 *
 * Sert à l'écran d'aperçu : le nageur ajuste sa durée/épreuve, on recalcule
 * un `GeneratedMesocycle` instantanément. Aucune persistance ; le mésocycle
 * n'existe que dans la mémoire de l'onglet jusqu'à `applyMesocycle`.
 */
export function generateMesocyclePreview(
  input: MesocycleInput,
): GeneratedMesocycle {
  return runEngine(input);
}

/** Sérialise un exercice du moteur (camelCase) au format attendu par la RPC (snake_case). */
function serializeExercise(ex: MesocycleExercise): Record<string, unknown> {
  return {
    exercise_id: ex.exerciseId,
    bucket: ex.bucket,
    is_core: ex.isCore,
    sets: ex.sets,
    reps: ex.reps,
    intensity_pct_1rm: ex.intensityPct1rm,
    rest_seconds: ex.restSeconds,
    intention: ex.intention,
    substituted: ex.substituted,
    original_exercise_id: ex.originalExerciseId,
  };
}

function serializeSession(s: MesocycleSession): Record<string, unknown> {
  return {
    session_number: s.sessionNumber,
    buckets: s.buckets,
    exercises: s.exercises.map(serializeExercise),
  };
}

function serializeWeek(w: MesocycleWeek): Record<string, unknown> {
  return {
    week_number: w.weekNumber,
    cycle: w.cycle,
    sessions: w.sessions.map(serializeSession),
  };
}

function serializeWeeks(weeks: MesocycleWeek[]): Record<string, unknown>[] {
  return weeks.map(serializeWeek);
}

/**
 * Date au format `YYYY-MM-DD` attendu par Postgres pour `p_start_week_monday`.
 * Accepte une chaîne déjà formatée ou un `Date`.
 */
function toDateString(d: string | Date): string {
  if (typeof d === 'string') return d;
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * Matérialise un mésocycle généré sur la timeline `strength_planning_*` du
 * nageur, via la RPC `apply_strength_mesocycle` (migration 00172).
 *
 * Effets côté serveur (transactionnels — voir
 * `docs/plans/bilan-muscu-mapping-mesocycle-planning.md`) :
 * - INSERT `strength_mesocycles` + `strength_planning_snapshots`
 * - Snapshot des `slot_overrides` + `week_overrides` existants en fenêtre
 * - Création des `strength_sessions` (templates) + `strength_session_items`
 * - UPSERT des `strength_planning_slot_overrides` + `_week_overrides`
 * - Supersede des mésocycles `active` précédents du même athlète
 * - Notification ciblée sur le groupe du nageur
 *
 * @param input          Données ayant servi à `generateMesocyclePreview`
 * @param generated      Mésocycle produit par le moteur (à confirmer)
 * @param startWeekMonday Lundi de la première semaine (Date ou 'YYYY-MM-DD')
 * @returns L'UUID du mésocycle persisté.
 */
export async function applyMesocycle(
  input: MesocycleInput,
  generated: GeneratedMesocycle,
  startWeekMonday: string | Date,
): Promise<string> {
  if (!canUseSupabase()) throw new Error('Supabase not available');

  const data = assertSupabase(
    await supabase.rpc('apply_strength_mesocycle', {
      p_athlete_id: input.assessment.athlete_id,
      p_assessment_id: input.assessment.id,
      p_template_id: input.template.id,
      p_event_group: input.template.event_group,
      p_kind: input.template.kind,
      p_target_week_count: input.targetWeekCount,
      p_sessions_per_week: input.sessionsPerWeek,
      p_start_week_monday: toDateString(startWeekMonday),
      p_bucket_priorities: generated.reasoning,
      p_engine_version: generated.engineVersion,
      p_weeks: serializeWeeks(generated.weeks),
    }),
  );

  if (typeof data !== 'string') {
    throw new Error(
      `apply_strength_mesocycle: unexpected RPC return type ${typeof data}`,
    );
  }
  return data;
}

/**
 * Annule un mésocycle `active` et restaure le planning d'avant son
 * application, via la RPC `revert_strength_mesocycle` (migration 00173).
 *
 * Autorisé au nageur lui-même OU à un coach/admin. Lève une exception si
 * le mésocycle n'existe pas ou s'il n'est plus `active`.
 */
export async function revertMesocycle(mesocycleId: string): Promise<void> {
  if (!canUseSupabase()) throw new Error('Supabase not available');
  assertSupabase(
    await supabase.rpc('revert_strength_mesocycle', {
      p_mesocycle_id: mesocycleId,
    }),
  );
}

/**
 * Récupère un mésocycle par id, ou `null` si introuvable / RLS refuse.
 */
export async function getMesocycle(
  mesocycleId: string,
): Promise<StrengthMesocycle | null> {
  if (!canUseSupabase()) return null;
  const data = assertSupabase(
    await supabase
      .from('strength_mesocycles')
      .select('*')
      .eq('id', mesocycleId)
      .maybeSingle(),
  );
  return (data as StrengthMesocycle | null) ?? null;
}

/**
 * Récupère le mésocycle `active` courant du nageur, ou `null` s'il n'en a
 * pas. Sert au point d'entrée Strength.tsx pour basculer entre génération
 * et affichage du mésocycle existant.
 */
export async function getActiveMesocycle(
  athleteId: number,
): Promise<StrengthMesocycle | null> {
  if (!canUseSupabase()) return null;
  const data = assertSupabase(
    await supabase
      .from('strength_mesocycles')
      .select('*')
      .eq('athlete_id', athleteId)
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .limit(1),
  );
  const rows = (data ?? []) as StrengthMesocycle[];
  return rows[0] ?? null;
}

/**
 * Liste l'historique des mésocycles d'un nageur (du plus récent au plus
 * ancien), tous statuts confondus.
 */
export async function listMesocycles(
  athleteId: number,
): Promise<StrengthMesocycle[]> {
  if (!canUseSupabase()) return [];
  const data = assertSupabase(
    await supabase
      .from('strength_mesocycles')
      .select('*')
      .eq('athlete_id', athleteId)
      .order('created_at', { ascending: false }),
  );
  return (data ?? []) as StrengthMesocycle[];
}
