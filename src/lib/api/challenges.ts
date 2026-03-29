/**
 * API Challenges — Team challenge CRUD (gamification)
 */

import { supabase, canUseSupabase } from './client';
import type { Challenge } from './types';

/**
 * Fetch active challenges (end_date >= today).
 * If groupId is provided, returns challenges for that group + club-wide (group_id IS NULL).
 * Otherwise returns only club-wide challenges.
 */
export async function getActiveChallenges(groupId?: number | null): Promise<Challenge[]> {
  if (!canUseSupabase()) return [];

  const today = new Date().toISOString().slice(0, 10);

  let query = supabase
    .from('challenges')
    .select('*')
    .gte('end_date', today)
    .order('end_date', { ascending: true });

  if (groupId) {
    // group challenges + club-wide
    query = query.or(`group_id.eq.${groupId},group_id.is.null`);
  } else {
    query = query.is('group_id', null);
  }

  const { data, error } = await query;

  if (error) {
    console.error('[challenges] getActiveChallenges error', error);
    return [];
  }
  return (data ?? []) as Challenge[];
}

/**
 * Fetch all challenges (active + past), for coach management.
 */
export async function getAllChallenges(groupId?: number | null): Promise<Challenge[]> {
  if (!canUseSupabase()) return [];

  let query = supabase
    .from('challenges')
    .select('*')
    .order('created_at', { ascending: false });

  if (groupId) {
    query = query.or(`group_id.eq.${groupId},group_id.is.null`);
  }

  const { data, error } = await query;

  if (error) {
    console.error('[challenges] getAllChallenges error', error);
    return [];
  }
  return (data ?? []) as Challenge[];
}

/**
 * Create a new challenge.
 */
export async function createChallenge(
  data: Omit<Challenge, 'id' | 'current_value' | 'created_at'>,
): Promise<Challenge | null> {
  if (!canUseSupabase()) return null;

  const { data: row, error } = await supabase
    .from('challenges')
    .insert(data)
    .select()
    .single();

  if (error) {
    console.error('[challenges] createChallenge error', error);
    return null;
  }
  return row as Challenge;
}

/**
 * Update the progress of a challenge.
 */
export async function updateChallengeProgress(
  id: string,
  currentValue: number,
): Promise<void> {
  if (!canUseSupabase()) return;

  const { error } = await supabase
    .from('challenges')
    .update({ current_value: currentValue })
    .eq('id', id);

  if (error) {
    console.error('[challenges] updateChallengeProgress error', error);
  }
}

/**
 * Delete a challenge.
 */
export async function deleteChallenge(id: string): Promise<void> {
  if (!canUseSupabase()) return;

  const { error } = await supabase
    .from('challenges')
    .delete()
    .eq('id', id);

  if (error) {
    console.error('[challenges] deleteChallenge error', error);
  }
}
