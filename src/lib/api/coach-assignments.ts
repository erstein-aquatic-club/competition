/**
 * API Coach Assignments — coach ↔ swimmer assignment management
 */

import { supabase, canUseSupabase } from './client';
import type { CoachSwimmerAssignment, CoachSwimmerHistory } from './types';

/**
 * Returns swimmer IDs assigned to the current coach (based on JWT app_user_id).
 */
export async function getMySwimmers(): Promise<number[]> {
  if (!canUseSupabase()) return [];

  const { data: sessionData } = await supabase.auth.getSession();
  const appUserId =
    sessionData?.session?.user?.app_metadata?.app_user_id as number | undefined;
  if (!appUserId) return [];

  const { data, error } = await supabase
    .from('coach_swimmer_assignments')
    .select('swimmer_id')
    .eq('coach_id', appUserId);

  if (error) throw new Error(error.message);
  return (data ?? []).map((row: any) => row.swimmer_id as number);
}

/**
 * Fetches all coach ↔ swimmer assignments.
 */
export async function getAllAssignments(): Promise<CoachSwimmerAssignment[]> {
  if (!canUseSupabase()) return [];

  const { data, error } = await supabase
    .from('coach_swimmer_assignments')
    .select('*');

  if (error) throw new Error(error.message);
  return (data ?? []) as CoachSwimmerAssignment[];
}

/**
 * Assigns a swimmer to a coach.
 */
export async function assignSwimmer(
  swimmerId: number,
  coachId: number,
  assignedBy: number,
): Promise<void> {
  if (!canUseSupabase()) return;

  const { error } = await supabase
    .from('coach_swimmer_assignments')
    .insert({ swimmer_id: swimmerId, coach_id: coachId, assigned_by: assignedBy });

  if (error) throw new Error(error.message);
}

/**
 * Removes the assignment for a swimmer (unassign from any coach).
 */
export async function unassignSwimmer(swimmerId: number): Promise<void> {
  if (!canUseSupabase()) return;

  const { error } = await supabase
    .from('coach_swimmer_assignments')
    .delete()
    .eq('swimmer_id', swimmerId);

  if (error) throw new Error(error.message);
}

/**
 * Reassigns a swimmer to a different coach.
 */
export async function reassignSwimmer(
  swimmerId: number,
  newCoachId: number,
  assignedBy: number,
): Promise<void> {
  if (!canUseSupabase()) return;

  const { error } = await supabase
    .from('coach_swimmer_assignments')
    .update({ coach_id: newCoachId, assigned_by: assignedBy })
    .eq('swimmer_id', swimmerId);

  if (error) throw new Error(error.message);
}

/**
 * Returns the coach assignment history for a swimmer, most recent removal first.
 */
export async function getSwimmerCoachHistory(
  swimmerId: number,
): Promise<CoachSwimmerHistory[]> {
  if (!canUseSupabase()) return [];

  const { data, error } = await supabase
    .from('coach_swimmer_history')
    .select('*')
    .eq('swimmer_id', swimmerId)
    .order('removed_at', { ascending: false });

  if (error) throw new Error(error.message);
  return (data ?? []) as CoachSwimmerHistory[];
}
