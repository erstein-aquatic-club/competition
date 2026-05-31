/**
 * API Strength Warmup — routine articulaire commune (Bloc 1, §351).
 *
 * `warmup_common_routine` (migration 00214) liste les exercices d'échauffement
 * articulaire communs à toutes les séances, ordonnés par `ordre`. Le moteur
 * (`mesocycleEngine.ts`) consomme la liste ordonnée d'`exercise_id` via
 * `MesocycleInput.commonWarmupRoutine` pour composer le Bloc 1 de l'échauffement.
 */
import { supabase, canUseSupabase, assertSupabase } from './client';

/** §351 — ids ordonnés de la routine articulaire commune (Bloc 1). */
export async function getCommonWarmupRoutine(): Promise<number[]> {
  if (!canUseSupabase()) return [];
  const data = assertSupabase(
    await supabase.from('warmup_common_routine').select('exercise_id, ordre').order('ordre'),
  );
  return ((data ?? []) as { exercise_id: number }[]).map((r) => r.exercise_id);
}
