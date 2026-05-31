/**
 * API Strength Warmup — routine articulaire commune (Bloc 1, §351).
 *
 * `warmup_common_routine` (migration 00214) liste les exercices d'échauffement
 * articulaire communs à toutes les séances, ordonnés par `ordre`. Le moteur
 * (`mesocycleEngine.ts`) consomme la liste ordonnée d'`exercise_id` via
 * `MesocycleInput.commonWarmupRoutine` pour composer le Bloc 1 de l'échauffement.
 *
 * §352 — `warmup_activation_routine` (migration 00215) liste, par seau, les exos
 * d'activation musculaire (Bloc 3), consommés via `MesocycleInput.activationRoutine`.
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

/**
 * §352 — routine d'activation (Bloc 3) regroupée par seau : `bucket → exercise_ids`
 * ordonnés par `ordre`. Alimente `MesocycleInput.activationRoutine`. `{}` si Supabase
 * indisponible.
 */
export async function getActivationRoutine(): Promise<Record<string, number[]>> {
  if (!canUseSupabase()) return {};
  const data = assertSupabase(
    await supabase
      .from('warmup_activation_routine')
      .select('bucket, exercise_id, ordre')
      .order('bucket')
      .order('ordre'),
  );
  const out: Record<string, number[]> = {};
  for (const r of (data ?? []) as { bucket: string; exercise_id: number }[]) {
    (out[r.bucket] ??= []).push(r.exercise_id);
  }
  return out;
}

/**
 * §354 — remplace la routine articulaire commune (Bloc 1) par la liste ordonnée
 * `ids` (RPC atomique delete+insert ; RLS écriture coach/admin). No-op si Supabase
 * indisponible.
 */
export async function setCommonWarmupRoutine(ids: number[]): Promise<void> {
  if (!canUseSupabase()) return;
  assertSupabase(await supabase.rpc('set_warmup_common_routine', { p_ids: ids }));
}

/**
 * §354 — remplace la routine d'activation (Bloc 3) d'un seau par la liste ordonnée
 * `ids` (RPC atomique delete+insert ; RLS écriture coach/admin). No-op si Supabase
 * indisponible.
 */
export async function setActivationRoutine(bucket: string, ids: number[]): Promise<void> {
  if (!canUseSupabase()) return;
  assertSupabase(await supabase.rpc('set_warmup_activation_routine', { p_bucket: bucket, p_ids: ids }));
}
