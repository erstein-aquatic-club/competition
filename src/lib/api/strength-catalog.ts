/**
 * API Strength Catalog — projection « taggée » de `dim_exercices` (§291).
 *
 * Le legacy `Exercise` type expose les colonnes legacy. Le moteur de
 * génération du mésocycle (§293) consomme un sur-ensemble : `bucket`, `level`,
 * `contraindication_zones`, `is_core` ajoutés par migration 00164. Ce wrapper
 * lit ces colonnes et renvoie directement le type `CatalogExercise` consommé
 * par `mesocycleEngine.ts`.
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
  is_core: boolean | null;
  Nb_series_endurance: number | null;
  Nb_reps_endurance: number | null;
  pct_1rm_endurance: number | null;
  recup_endurance: number | null;
  Nb_series_force: number | null;
  Nb_reps_force: number | null;
  pct_1rm_force: number | null;
  recup_force: number | null;
}

function isStrengthBucket(value: unknown): value is StrengthBucket {
  return (
    value === 'lower_strength' ||
    value === 'lower_power' ||
    value === 'upper_strength' ||
    value === 'upper_power' ||
    value === 'mobility'
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
    isCore: row.is_core ?? false,
    nbSeriesEndurance: row.Nb_series_endurance,
    nbRepsEndurance: row.Nb_reps_endurance,
    pourcentageCharge1rmEndurance: row.pct_1rm_endurance,
    recupSeriesEndurance: row.recup_endurance,
    nbSeriesForce: row.Nb_series_force,
    nbRepsForce: row.Nb_reps_force,
    pourcentageCharge1rmForce: row.pct_1rm_force,
    recupSeriesForce: row.recup_force,
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
        'id, nom_exercice, bucket, level, contraindication_zones, is_core,' +
          ' Nb_series_endurance, Nb_reps_endurance, pct_1rm_endurance, recup_endurance,' +
          ' Nb_series_force, Nb_reps_force, pct_1rm_force, recup_force',
      )
      .not('bucket', 'is', null),
  );
  // Cast via `unknown` : les types Supabase générés ne reflètent pas encore les
  // colonnes ajoutées par mig 00164 (bucket / level / contraindication_zones /
  // is_core). On les SELECT explicitement et on les normalise via mapRow.
  return ((data ?? []) as unknown as DbRow[]).map(mapRow);
}
