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

/**
 * Mésocycle actif enrichi avec le nom du nageur — pour les vues coach
 * « tous les mésocycles actifs du club » (§296).
 *
 * Le coach voit tous les mésocycles `active` (RLS club-wide depuis mig
 * 00171) ; le nageur lui-même ne voit que les siens.
 */
export interface ActiveMesocycleWithAthlete {
  id: string;
  athlete_id: number;
  athlete_name: string;
  event_group: string;
  kind: string;
  target_week_count: number;
  sessions_per_week: number;
  generated_at: string;
  engine_version: string;
}

/**
 * Liste tous les mésocycles `active` visibles par l'appelant, avec le
 * nom du nageur jointé. Coach club-wide / admin → tous ; nageur → les
 * siens uniquement (RLS).
 *
 * Trié par date de génération décroissante (plus récents en tête).
 */
export async function listActiveMesocyclesWithAthletes(): Promise<
  ActiveMesocycleWithAthlete[]
> {
  if (!canUseSupabase()) return [];
  const data = assertSupabase(
    await supabase
      .from('strength_mesocycles')
      .select(
        'id, athlete_id, event_group, kind, target_week_count, sessions_per_week, generated_at, engine_version,' +
          ' users:athlete_id (display_name)',
      )
      .eq('status', 'active')
      .order('generated_at', { ascending: false }),
  );
  type Row = {
    id: string;
    athlete_id: number;
    event_group: string;
    kind: string;
    target_week_count: number;
    sessions_per_week: number;
    generated_at: string;
    engine_version: string;
    users:
      | { display_name: string | null }
      | { display_name: string | null }[]
      | null;
  };
  const rows = ((data ?? []) as unknown as Row[]).map((r) => {
    const u = Array.isArray(r.users) ? r.users[0] : r.users;
    return {
      id: r.id,
      athlete_id: r.athlete_id,
      athlete_name: u?.display_name ?? `#${r.athlete_id}`,
      event_group: r.event_group,
      kind: r.kind,
      target_week_count: r.target_week_count,
      sessions_per_week: r.sessions_per_week,
      generated_at: r.generated_at,
      engine_version: r.engine_version,
    } satisfies ActiveMesocycleWithAthlete;
  });
  return rows;
}

// ── Lecture du contenu d'un mésocycle persisté ───────────────────────────────

/**
 * Détail d'un exercice tel que persisté dans une séance d'un mésocycle.
 * Reconstitué depuis `strength_session_items` + `raw_payload` posé par la
 * RPC `apply_strength_mesocycle` (mig 00172).
 */
export interface MesocycleSessionExerciseContent {
  exerciseId: number;
  nomExercice: string;
  bucket: string;
  isCore: boolean;
  sets: number | null;
  reps: number | null;
  intensityPct1rm: number | null;
  restSeconds: number | null;
  intention: string | null;
  substituted: boolean;
  originalExerciseId: number | null;
  illustrationGif: string | null;
}

/** Une séance d'un mésocycle persisté (groupement d'items + métadonnées
 *  reconstituées depuis `raw_payload`). */
export interface MesocycleSessionContent {
  weekNumber: number;
  sessionNumber: number;
  /** PeriodizationCycle string : `'prepa_generale'` | `'force_max'` | … */
  cycle: string;
  /** Seaux travaillés (dérivés des items de la séance, dédoublonnés). */
  buckets: string[];
  exercises: MesocycleSessionExerciseContent[];
}

/**
 * Récupère le contenu détaillé d'un mésocycle persisté — toutes les séances
 * avec leurs exercices, ordonnées par (semaine, session, ordre).
 *
 * Utilisée par le panneau coach pour offrir une vue auditable « en miroir »
 * de l'aperçu nageur, sans relancer le moteur. Les exercices viennent de
 * `strength_session_items.raw_payload` (posé par la RPC apply, §293) qui
 * conserve `mesocycle_id`, `week_number`, `session_number`, `bucket`,
 * `is_core`, `periodization_cycle`, `intention`, `substituted`,
 * `original_exercise_id` à côté des paramètres de charge classiques.
 *
 * Retourne `[]` si Supabase indispo ou si aucun item n'a été posé pour ce
 * mésocycle (rare — un mésocycle `reverted` aurait ses items supprimés).
 */
export async function getMesocycleSessionsContent(
  mesocycleId: string,
): Promise<MesocycleSessionContent[]> {
  if (!canUseSupabase()) return [];

  const data = assertSupabase(
    await supabase
      .from('strength_session_items')
      .select(
        'session_id, ordre, exercise_id, sets, reps, pct_1rm, rest_series_s, notes, raw_payload,' +
          ' dim_exercices ( nom_exercice, illustration_gif )',
      )
      // Filtre via la clé JSON — pose par apply_strength_mesocycle.
      .eq('raw_payload->>mesocycle_id', mesocycleId)
      .order('id'),
  );

  // Rows arrivent à plat. Regroupe par (week_number, session_number).
  type Row = {
    session_id: number;
    ordre: number;
    exercise_id: number;
    sets: number | null;
    reps: number | null;
    pct_1rm: number | null;
    rest_series_s: number | null;
    notes: string | null;
    raw_payload: Record<string, unknown> | null;
    dim_exercices:
      | { nom_exercice: string; illustration_gif: string | null }
      | { nom_exercice: string; illustration_gif: string | null }[]
      | null;
  };

  const rows = ((data ?? []) as unknown as Row[]).filter((r) => r.raw_payload);
  const byKey = new Map<string, MesocycleSessionContent>();

  for (const r of rows) {
    const p = r.raw_payload!;
    const weekNumber = Number(p.week_number ?? 0);
    const sessionNumber = Number(p.session_number ?? 0);
    if (!weekNumber || !sessionNumber) continue;

    const key = `${weekNumber}-${sessionNumber}`;
    let session = byKey.get(key);
    if (!session) {
      session = {
        weekNumber,
        sessionNumber,
        cycle: String(p.periodization_cycle ?? ''),
        buckets: [],
        exercises: [],
      };
      byKey.set(key, session);
    }

    const bucket = String(p.bucket ?? '');
    if (bucket && !session.buckets.includes(bucket)) {
      session.buckets.push(bucket);
    }

    const dimEx = Array.isArray(r.dim_exercices) ? r.dim_exercices[0] : r.dim_exercices;
    const nomExercice = dimEx?.nom_exercice ?? `#${r.exercise_id}`;
    const illustrationGif = dimEx?.illustration_gif ?? null;

    session.exercises.push({
      exerciseId: r.exercise_id,
      nomExercice,
      bucket,
      isCore: Boolean(p.is_core),
      sets: r.sets,
      reps: r.reps,
      intensityPct1rm: r.pct_1rm,
      restSeconds: r.rest_series_s,
      intention: r.notes,
      substituted: Boolean(p.substituted),
      originalExerciseId:
        p.original_exercise_id != null ? Number(p.original_exercise_id) : null,
      illustrationGif,
    });
  }

  // Tri stable : semaine asc, séance asc.
  return Array.from(byKey.values()).sort((a, b) => {
    if (a.weekNumber !== b.weekNumber) return a.weekNumber - b.weekNumber;
    return a.sessionNumber - b.sessionNumber;
  });
}
