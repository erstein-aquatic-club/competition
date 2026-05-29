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
 *   3. UI confirme → `applyMesocycle(input, generated, startDate)` →
 *      RPC matérialise + retourne l'UUID du mésocycle persisté.
 *   4. Coach (ou nageur) peut appeler `revertMesocycle(id)` pour annuler.
 */
import { supabase, canUseSupabase, assertSupabase, withTimeout } from './client';
import { getMonday, toISODate } from '@/lib/date';
import {
  generateMesocycle as runEngine,
} from '@/lib/strength/mesocycleEngine';
import type {
  DistanceProfile,
  GeneratedMesocycle,
  MesocycleExercise,
  MesocycleInput,
  MesocycleSession,
  MesocycleWeek,
  StrokeSignature,
} from '@/lib/strength/mesocycleEngine.types';
import type {
  PeriodizationCycle,
  StrengthMesocycle,
  StrengthPeriodizationTemplate,
} from './types';
import { phaseAtWeek } from '@/lib/strength/phaseAtWeek';

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
    weekday: s.weekday,
    role: s.role,
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
 * Lundi (`YYYY-MM-DD`, date locale) de la semaine contenant `d`.
 *
 * Réutilise `getMonday`/`toISODate` de `src/lib/date.ts` — même convention
 * que `toDateString` (date LOCALE, lundi = début de semaine), donc pas de
 * dérive de fuseau horaire. Pour une date `string`, on l'ancre à minuit local
 * (`T00:00:00`) avant de la passer à `getMonday`.
 */
function mondayOf(d: string | Date): string {
  const dateObj = typeof d === 'string' ? new Date(d + 'T00:00:00') : d;
  return toISODate(getMonday(dateObj));
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
 * §307 — Le 3ᵉ paramètre est désormais la **date de départ réelle** du
 * mésocycle (et non plus le lundi de la semaine 1). On en dérive le lundi de
 * la première semaine (`p_start_week_monday = mondayOf(startDate)`) et on
 * transmet la date exacte (`p_start_date`) à la RPC, qui peut alors ignorer
 * les séances tombant avant cette date (première semaine partielle si départ
 * en milieu de semaine). Rétro-compatible : un appelant qui passe déjà un
 * lundi obtient `mondayOf(lundi) = lundi`, donc aucune séance écartée.
 *
 * @param input     Données ayant servi à `generateMesocyclePreview`
 * @param generated Mésocycle produit par le moteur (à confirmer)
 * @param startDate Date de départ réelle (Date ou 'YYYY-MM-DD'). Peut tomber
 *                  en milieu de semaine — la 1re semaine sera alors partielle.
 * @returns L'UUID du mésocycle persisté.
 */
export async function applyMesocycle(
  input: MesocycleInput,
  generated: GeneratedMesocycle,
  startDate: string | Date,
): Promise<string> {
  if (!canUseSupabase()) throw new Error('Supabase not available');

  // Audit 2026-05-26 — borne réseau (invariant §298 : tout await apply/revert
  // doit être `withTimeout`-borné). Sans ça, une RPC qui traîne sur connexion
  // coupée (bord du bassin) pendait le spinner indéfiniment. 30 s : l'apply
  // matérialise N semaines (RPC potentiellement longue), borne généreuse.
  const data = assertSupabase(
    await withTimeout(
      supabase.rpc('apply_strength_mesocycle', {
        p_athlete_id: input.assessment.athlete_id,
        p_assessment_id: input.assessment.id,
        // §305 : l'id du template composé (nage×distance) est synthétique
        // (ex. 'freestyle_100_season'), pas un uuid. La colonne est nullable.
        p_template_id: null,
        p_event_group: input.template.event_group,
        p_kind: input.template.kind,
        p_target_week_count: input.targetWeekCount,
        p_sessions_per_week: input.sessionsPerWeek,
        p_start_week_monday: mondayOf(startDate),
        p_start_date: toDateString(startDate),
        p_bucket_priorities: generated.reasoning,
        p_engine_version: generated.engineVersion,
        p_weeks: serializeWeeks(generated.weeks),
      }),
      30_000,
      'apply_strength_mesocycle',
    ),
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
  // Audit 2026-05-26 — borne réseau (invariant §298), cf. applyMesocycle.
  assertSupabase(
    await withTimeout(
      supabase.rpc('revert_strength_mesocycle', {
        p_mesocycle_id: mesocycleId,
      }),
      15_000,
      'revert_strength_mesocycle',
    ),
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

// ── Taxonomie nage × distance (§305) ─────────────────────────────────────────

/**
 * Liste les signatures de nage — multiplicateur par seau vs crawl (crawl ≡ 1.0).
 *
 * Lecture seule (5 lignes en seed §305). Sert à composer un template via
 * `composeTemplate(profile, signature, kind)` sans relire de table de templates.
 * Le champ `mult` est stocké en jsonb keyé par `StrengthBucket`.
 */
export async function getStrokeSignatures(): Promise<StrokeSignature[]> {
  if (!canUseSupabase()) return [];
  const data = assertSupabase(
    await supabase.from('strength_stroke_signatures').select('*'),
  );
  type Row = {
    stroke_key: StrokeSignature['stroke_key'];
    label: string;
    mult: StrokeSignature['mult'];
    forced_focus?: StrokeSignature['forcedFocus'];
  };
  return ((data ?? []) as Row[]).map((r) => ({
    stroke_key: r.stroke_key,
    label: r.label,
    mult: r.mult as StrokeSignature['mult'],
    // §323 — focus forcé stroke-aware (sprints) ; absent → undefined (= aucun).
    forcedFocus: r.forced_focus ?? undefined,
  }));
}

/**
 * Liste les profils de distance — emphase canonique ancrée crawl + arc de
 * périodisation par famille (`season` / `inter_competition`).
 *
 * Lecture seule (8 lignes en seed §305). Les champs `emphasis` et `structure`
 * sont stockés en jsonb. Sert à composer un template via `composeTemplate`.
 */
/**
 * Info de phase calculée pour un lundi pivot donné, par rapport au mésocycle
 * actif. Sert à l'écran d'ajustement mi-cycle (pas d'appel réseau).
 */
export interface MesocyclePhaseInfo {
  /** Index 0-based de la semaine du pivot dans le méso. */
  weekIndex: number;
  /** totalWeeks - weekIndex, borné ≥ 0. */
  weeksRemaining: number;
  /** Cycle de la phase au weekIndex, ou null s'il ne reste aucune semaine. */
  phaseKey: PeriodizationCycle | null;
}

/** Parse une date ISO 'YYYY-MM-DD' en UTC stable (évite la dérive de fuseau). */
function parseISOUtc(iso: string): number {
  return new Date(`${iso}T00:00:00Z`).getTime();
}

const MS_PER_WEEK = 7 * 24 * 60 * 60 * 1000;

/**
 * Détermine, pour un lundi pivot, l'index de semaine dans le méso, le nombre
 * de semaines restantes, et la phase de périodisation en cours.
 *
 * Helper PUR (aucun appel Supabase). Pivot avant le départ → index 0 ; pivot
 * après la fin → restantes 0 / phaseKey null.
 */
export function getCurrentMesocyclePhaseInfo(args: {
  startMonday: string;
  totalWeeks: number;
  template: StrengthPeriodizationTemplate;
  pivotMonday: string;
}): MesocyclePhaseInfo {
  const { startMonday, totalWeeks, template, pivotMonday } = args;
  // Le floor ramène un pivot en milieu de semaine (non-lundi) à l'index de sa
  // semaine contenante — contrat implicite pour l'appelant côté UI.
  const diffWeeks = Math.floor(
    (parseISOUtc(pivotMonday) - parseISOUtc(startMonday)) / MS_PER_WEEK,
  );
  const weekIndex = Math.min(Math.max(diffWeeks, 0), totalWeeks);
  const weeksRemaining = Math.max(0, totalWeeks - weekIndex);
  const phaseKey =
    weeksRemaining > 0 ? phaseAtWeek(template, weekIndex) : null;
  return { weekIndex, weeksRemaining, phaseKey };
}

export async function getDistanceProfiles(): Promise<DistanceProfile[]> {
  if (!canUseSupabase()) return [];
  const data = assertSupabase(
    await supabase.from('strength_distance_profiles').select('*'),
  );
  type Row = {
    distance_key: DistanceProfile['distance_key'];
    kind: DistanceProfile['kind'];
    label: string;
    emphasis: DistanceProfile['emphasis'];
    structure: DistanceProfile['structure'];
    min_week_count: number;
    max_week_count: number;
  };
  return ((data ?? []) as Row[]).map((r) => ({
    distance_key: r.distance_key,
    kind: r.kind,
    label: r.label,
    emphasis: r.emphasis as DistanceProfile['emphasis'],
    structure: r.structure as DistanceProfile['structure'],
    min_week_count: r.min_week_count,
    max_week_count: r.max_week_count,
  }));
}
