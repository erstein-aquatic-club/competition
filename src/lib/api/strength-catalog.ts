/**
 * API Strength Catalog — projection « taggée » de `dim_exercices` (§291).
 *
 * Le legacy `Exercise` type expose les colonnes legacy. Le moteur de
 * génération du mésocycle (§293) consomme un sur-ensemble : `bucket`, `level`,
 * `contraindication_zones`, `is_core` ajoutés par migration 00164. Ce wrapper
 * lit ces colonnes et renvoie directement le type `CatalogExercise` consommé
 * par `mesocycleEngine.ts`.
 *
 * Noms de colonnes DB (vérifiés via `information_schema.columns` sur prod) :
 *   nb_series_endurance, nb_reps_endurance, pourcentage_charge_1rm_endurance,
 *   recup_series_endurance — idem _force.
 */
import { supabase, canUseSupabase, assertSupabase } from './client';
import type { CatalogExercise } from '@/lib/strength/mesocycleEngine.types';
import type { StrengthBucket } from './types';

interface DbRow {
  id: number;
  nom_exercice: string;
  bucket: string | null;
  level: string | null;
  contraindication_zones: string[] | null;
  stroke_prehab_affinity: string[] | null;
  corrective_axes: string[] | null;
  supports_unilateral: boolean | null;
  is_core: boolean | null;
  selection_priority: number | null;
  illustration_gif: string | null;
  nb_series_endurance: number | null;
  nb_reps_endurance: number | null;
  pourcentage_charge_1rm_endurance: number | null;
  recup_series_endurance: number | null;
  nb_series_force: number | null;
  nb_reps_force: number | null;
  pourcentage_charge_1rm_force: number | null;
  recup_series_force: number | null;
}

function isStrengthBucket(value: unknown): value is StrengthBucket {
  return (
    value === 'lower_strength' ||
    value === 'lower_power' ||
    value === 'upper_strength' ||
    value === 'upper_power' ||
    value === 'mobility' ||
    // §R5 — `core` accepté dès que la migration 00204 re-tag les exercices.
    value === 'core'
  );
}

function isLevel(value: unknown): value is 'beginner' | 'intermediate' | 'advanced' {
  return value === 'beginner' || value === 'intermediate' || value === 'advanced';
}

function mapRow(row: DbRow): CatalogExercise {
  return {
    id: row.id,
    nomExercice: row.nom_exercice,
    bucket: isStrengthBucket(row.bucket) ? row.bucket : null,
    level: isLevel(row.level) ? row.level : null,
    contraindicationZones: row.contraindication_zones ?? [],
    strokePrehabAffinity: row.stroke_prehab_affinity ?? [],
    correctiveAxes: row.corrective_axes ?? [],
    supportsUnilateral: row.supports_unilateral ?? false,
    isCore: row.is_core ?? false,
    selectionPriority: row.selection_priority ?? 0,
    illustrationGif: row.illustration_gif ?? null,
    nbSeriesEndurance: row.nb_series_endurance,
    nbRepsEndurance: row.nb_reps_endurance,
    pourcentageCharge1rmEndurance: row.pourcentage_charge_1rm_endurance,
    recupSeriesEndurance: row.recup_series_endurance,
    nbSeriesForce: row.nb_series_force,
    nbRepsForce: row.nb_reps_force,
    pourcentageCharge1rmForce: row.pourcentage_charge_1rm_force,
    recupSeriesForce: row.recup_series_force,
  };
}

/**
 * Liste le catalogue d'exercices avec les tags §291 (bucket / level /
 * contraindication_zones / is_core), prêt à être consommé par le moteur.
 *
 * Filtre serveur : `bucket IS NOT NULL` — les exercices non taggés sont
 * exclus (ils sont muets pour le moteur de toute façon).
 */
export async function listCatalogExercisesTagged(): Promise<CatalogExercise[]> {
  if (!canUseSupabase()) return [];
  const data = assertSupabase(
    await supabase
      .from('dim_exercices')
      .select(
        'id, nom_exercice, bucket, level, contraindication_zones, stroke_prehab_affinity, corrective_axes, supports_unilateral, is_core, selection_priority, illustration_gif,' +
          ' nb_series_endurance, nb_reps_endurance, pourcentage_charge_1rm_endurance, recup_series_endurance,' +
          ' nb_series_force, nb_reps_force, pourcentage_charge_1rm_force, recup_series_force',
      )
      .not('bucket', 'is', null),
  );
  // Cast via `unknown` : les types Supabase générés ne reflètent pas encore les
  // colonnes ajoutées par mig 00164 (bucket / level / contraindication_zones /
  // is_core). On les SELECT explicitement et on les normalise via mapRow.
  return ((data ?? []) as unknown as DbRow[]).map(mapRow);
}

/**
 * Résout le `illustration_gif` d'un ensemble d'exercices par id. §301 T2 — sert
 * à câbler les démos KPI sur les GIFs déjà présents dans le catalogue
 * (`KPI_DEMO_EXERCISE_ID`). Renvoie une map `id → url | null` ; entrée absente =
 * exercice introuvable. Tableau vide ou Supabase indisponible → `{}` (le wizard
 * retombe alors sur l'illustration SVG).
 */
export async function getExerciseGifs(
  ids: number[],
): Promise<Record<number, string | null>> {
  if (!canUseSupabase() || ids.length === 0) return {};
  const data = assertSupabase(
    await supabase.from('dim_exercices').select('id, illustration_gif').in('id', ids),
  );
  const out: Record<number, string | null> = {};
  for (const row of (data ?? []) as { id: number; illustration_gif: string | null }[]) {
    out[row.id] = row.illustration_gif ?? null;
  }
  return out;
}
