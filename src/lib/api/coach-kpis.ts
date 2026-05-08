/**
 * Coach KPI aggregation API.
 *
 * §223 — RPC `get_coach_kpis` : 1 round-trip pour récupérer les valeurs de
 * fatigue (sessions + strength runs) de plusieurs athlètes sur une fenêtre.
 * Remplace les 2N requêtes REST de Coach.tsx coachKpisQuery.
 *
 * Le client agrège ensuite via `buildFatigueRating`/`normalizeFatigueValue`
 * (Coach.tsx) — la logique seuils + sort + filter reste TS-side.
 *
 * Sécurité : la fonction Postgres est `security invoker`, les RLS existantes
 * sur `dim_sessions` et `strength_session_runs` s'appliquent. Pas de bypass —
 * un coach ne voit que les athlètes qu'il peut déjà lire individuellement.
 */

import { canUseSupabase, supabase } from "./client";

export interface CoachKpiRow {
  athlete_id: number;
  /** Valeurs brutes (DB scale 1-10). Le client normalise via normalizeFatigueValue. */
  fatigue_values: number[];
}

/**
 * Retourne une Map athleteId → fatigue values pour la fenêtre [fromDate, toDate].
 * Un athlète sans sessions/runs apparaît avec un array vide.
 *
 * @param athleteIds  Liste d'IDs d'athlètes (typiquement 1-5 = topAthletes coach home).
 * @param fromDate    Date ISO YYYY-MM-DD inclusive.
 * @param toDate      Date ISO YYYY-MM-DD inclusive.
 */
export async function getCoachKpis(
  athleteIds: number[],
  fromDate: string,
  toDate: string,
): Promise<Map<number, number[]>> {
  // Préserve le contrat hybride Supabase/localStorage du projet : sans
  // backend (offline / mauvaise config), retourne une Map vide plutôt que
  // de throw — pattern aligné avec swimmerSessions.ts:21.
  if (!canUseSupabase() || athleteIds.length === 0) return new Map();

  const { data, error } = await supabase.rpc("get_coach_kpis", {
    athlete_ids: athleteIds,
    from_date: fromDate,
    to_date: toDate,
  });

  if (error) {
    throw new Error(`getCoachKpis failed: ${error.message}`);
  }

  const map = new Map<number, number[]>();
  for (const row of (data ?? []) as CoachKpiRow[]) {
    map.set(row.athlete_id, row.fatigue_values ?? []);
  }
  return map;
}
