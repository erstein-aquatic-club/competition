/**
 * API Achievements - Badge / achievement CRUD
 */

import { supabase, canUseSupabase } from './client';
import type { Achievement } from './types';

/**
 * Fetch all achievements for a given user.
 */
export async function getUserAchievements(userId: number): Promise<Achievement[]> {
  if (!canUseSupabase()) return [];

  const { data, error } = await supabase
    .from('achievements')
    .select('*')
    .eq('user_id', userId)
    .order('unlocked_at', { ascending: false });

  if (error) {
    console.error('[achievements] getUserAchievements error', error);
    return [];
  }
  return (data ?? []) as Achievement[];
}

/**
 * Unlock a badge for a user (upsert — silently ignores if already exists).
 */
export async function unlockAchievement(
  userId: number,
  key: string,
  type: string,
  metadata: Record<string, unknown> = {},
): Promise<Achievement | null> {
  if (!canUseSupabase()) return null;

  const { data, error } = await supabase
    .from('achievements')
    .upsert(
      { user_id: userId, key, type, metadata },
      { onConflict: 'user_id,key', ignoreDuplicates: true },
    )
    .select()
    .single();

  if (error) {
    // 23505 = unique violation (already exists) — expected for ignoreDuplicates
    if (error.code === '23505') return null;
    console.error('[achievements] unlockAchievement error', error);
    return null;
  }

  return data as Achievement;
}
