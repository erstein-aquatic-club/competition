/**
 * API Wellness - Daily wellness check CRUD
 */

import { supabase, canUseSupabase } from './client';
import type { WellnessCheck } from './types';

// --- Readiness score computation ---

/**
 * Convertit une durée de sommeil en score subjectif 1-5.
 * Pic à 8h (score 5), pénalité progressive en dessous et au-dessus.
 * - ≤4h → 1, 5h → 2, 6h → 3, 7h → 4, 8h → 5 (pic)
 * - 9h → 4, 10h → 3, 11h → 2, ≥12h → 1
 */
export function sleepDurationScore(hours: number): number {
  if (!Number.isFinite(hours) || hours <= 0) return 1;
  const score = hours <= 8 ? 1 + (hours - 4) : 5 - (hours - 8);
  return Math.max(1, Math.min(5, score));
}

export function computeReadinessScore(data: {
  sleep_quality: number;
  sleep_hours?: number | null;
  fatigue: number;
  soreness: number;
  mood: number;
  stress: number;
}): number {
  // Sommeil combiné : qualité ressentie (50%) + durée objective (50%)
  // Fallback sur la seule qualité si la durée n'est pas renseignée.
  const effectiveSleep =
    data.sleep_hours != null
      ? (data.sleep_quality + sleepDurationScore(data.sleep_hours)) / 2
      : data.sleep_quality;

  const raw =
    (effectiveSleep +
      (11 - data.fatigue * 2) +
      (11 - data.soreness * 2) +
      data.mood +
      (11 - data.stress * 2)) /
    25;
  return Math.round(Math.max(0, Math.min(100, raw * 100)));
}

// --- CRUD ---

export async function getWellnessForDate(
  userId: number,
  date: string,
): Promise<WellnessCheck | null> {
  if (!canUseSupabase()) return null;
  const { data, error } = await supabase
    .from('wellness_checks')
    .select('*')
    .eq('user_id', userId)
    .eq('date', date)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data as WellnessCheck | null;
}

export async function getWellnessRange(
  userId: number,
  startDate: string,
  endDate: string,
): Promise<WellnessCheck[]> {
  if (!canUseSupabase()) return [];
  const { data, error } = await supabase
    .from('wellness_checks')
    .select('*')
    .eq('user_id', userId)
    .gte('date', startDate)
    .lte('date', endDate)
    .order('date', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as WellnessCheck[];
}

export async function getGroupWellnessForDate(
  date: string,
): Promise<WellnessCheck[]> {
  if (!canUseSupabase()) return [];
  const { data, error } = await supabase
    .from('wellness_checks')
    .select('*')
    .eq('date', date);
  if (error) throw new Error(error.message);
  return (data ?? []) as WellnessCheck[];
}

export async function upsertWellness(
  input: Omit<WellnessCheck, 'id' | 'created_at'>,
): Promise<WellnessCheck> {
  if (!canUseSupabase()) throw new Error('Supabase not available');
  const { data, error } = await supabase
    .from('wellness_checks')
    .upsert(input, { onConflict: 'user_id,date' })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as WellnessCheck;
}
