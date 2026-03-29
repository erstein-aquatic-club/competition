/**
 * API Wellness - Daily wellness check CRUD
 */

import { supabase, canUseSupabase } from './client';
import type { WellnessCheck } from './types';

// --- Readiness score computation ---

export function computeReadinessScore(data: {
  sleep_quality: number;
  fatigue: number;
  soreness: number;
  mood: number;
  stress: number;
}): number {
  const raw =
    (data.sleep_quality +
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
