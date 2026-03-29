/**
 * API Pain Reports - Body zone pain tracking CRUD
 */

import { supabase, canUseSupabase } from './client';
import type { PainReport } from './types';

export async function getPainReportsForDate(
  userId: number,
  date: string,
): Promise<PainReport[]> {
  if (!canUseSupabase()) return [];
  const { data, error } = await supabase
    .from('pain_reports')
    .select('*')
    .eq('user_id', userId)
    .eq('date', date)
    .order('body_zone');
  if (error) throw new Error(error.message);
  return (data ?? []) as PainReport[];
}

export async function getPainReportsRange(
  userId: number,
  startDate: string,
  endDate: string,
): Promise<PainReport[]> {
  if (!canUseSupabase()) return [];
  const { data, error } = await supabase
    .from('pain_reports')
    .select('*')
    .eq('user_id', userId)
    .gte('date', startDate)
    .lte('date', endDate)
    .order('date', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as PainReport[];
}

export async function upsertPainReports(
  userId: number,
  date: string,
  reports: { body_zone: string; intensity: number }[],
): Promise<void> {
  if (!canUseSupabase()) return;

  // Delete existing reports for that date
  const { error: delError } = await supabase
    .from('pain_reports')
    .delete()
    .eq('user_id', userId)
    .eq('date', date);
  if (delError) throw new Error(delError.message);

  // Insert new ones (if any)
  if (reports.length === 0) return;

  const rows = reports.map((r) => ({
    user_id: userId,
    date,
    body_zone: r.body_zone,
    intensity: r.intensity,
  }));

  const { error: insError } = await supabase
    .from('pain_reports')
    .insert(rows);
  if (insError) throw new Error(insError.message);
}
