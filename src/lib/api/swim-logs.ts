/**
 * API Swim Logs - Technical notes per swim exercise
 */

import { supabase, canUseSupabase, assertSupabase } from './client';
import type { SwimExerciseLog, SwimExerciseLogInput } from './types';

export async function getSwimExerciseLogs(sessionId: number): Promise<SwimExerciseLog[]> {
  if (!canUseSupabase()) return [];

  const data = assertSupabase(
    await supabase
      .from('swim_exercise_logs')
      .select('id, session_id, user_id, exercise_label, source_item_id, split_times, tempo, stroke_count, notes, event_code, pool_length, equipment, created_at, updated_at')
      .eq('session_id', sessionId)
      .order('created_at', { ascending: true })
  );

  return (data ?? []).map(mapFromDb);
}

export async function getSwimExerciseLogsHistory(
  userId: string,
  limit = 50,
): Promise<SwimExerciseLog[]> {
  if (!canUseSupabase()) return [];

  const data = assertSupabase(
    await supabase
      .from('swim_exercise_logs')
      .select('id, session_id, user_id, exercise_label, source_item_id, split_times, tempo, stroke_count, notes, event_code, pool_length, equipment, created_at, updated_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(limit)
  );

  return (data ?? []).map(mapFromDb);
}

export async function saveSwimExerciseLogs(
  sessionId: number,
  userId: string,
  logs: SwimExerciseLogInput[],
): Promise<void> {
  if (!canUseSupabase()) return;

  // Delete existing logs for this session+user, then insert new ones
  const { error: delError } = await supabase
    .from('swim_exercise_logs')
    .delete()
    .eq('session_id', sessionId)
    .eq('user_id', userId);

  if (delError) throw new Error(delError.message);

  if (logs.length === 0) return;

  const rows = logs.map((log) => ({
    session_id: sessionId,
    user_id: userId,
    exercise_label: log.exercise_label,
    source_item_id: log.source_item_id ?? null,
    split_times: log.split_times ?? [],
    tempo: log.tempo ?? null,
    stroke_count: log.stroke_count ?? [],
    notes: log.notes ?? null,
    event_code: log.event_code ?? null,
    pool_length: log.pool_length ?? null,
    equipment: log.equipment ?? ['aucun'],
  }));

  assertSupabase(await supabase.from('swim_exercise_logs').insert(rows));
}

export async function createStandaloneSwimLog(
  userId: string,
  log: SwimExerciseLogInput,
): Promise<string> {
  if (!canUseSupabase()) return '';

  const data = assertSupabase(
    await supabase
      .from('swim_exercise_logs')
      .insert({
        user_id: userId,
        session_id: null,
        exercise_label: log.exercise_label,
        source_item_id: null,
        split_times: log.split_times ?? [],
        tempo: log.tempo ?? null,
        stroke_count: log.stroke_count ?? [],
        notes: log.notes ?? null,
        event_code: log.event_code ?? null,
        pool_length: log.pool_length ?? null,
        equipment: log.equipment ?? ['aucun'],
      })
      .select('id')
      .single()
  );
  return data?.id ?? '';
}

export async function updateSwimExerciseLog(
  logId: string,
  patch: Partial<SwimExerciseLogInput>,
): Promise<void> {
  if (!canUseSupabase()) return;

  const row: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.exercise_label !== undefined) row.exercise_label = patch.exercise_label;
  if (patch.split_times !== undefined) row.split_times = patch.split_times;
  if (patch.tempo !== undefined) row.tempo = patch.tempo;
  if (patch.stroke_count !== undefined) row.stroke_count = patch.stroke_count;
  if (patch.notes !== undefined) row.notes = patch.notes;
  if (patch.event_code !== undefined) row.event_code = patch.event_code;
  if (patch.pool_length !== undefined) row.pool_length = patch.pool_length;
  if (patch.equipment !== undefined) row.equipment = patch.equipment;

  assertSupabase(
    await supabase
      .from('swim_exercise_logs')
      .update(row)
      .eq('id', logId)
  );
}

export async function deleteSwimExerciseLog(logId: string): Promise<void> {
  if (!canUseSupabase()) return;

  assertSupabase(
    await supabase
      .from('swim_exercise_logs')
      .delete()
      .eq('id', logId)
  );
}

function mapFromDb(row: Record<string, unknown>): SwimExerciseLog {
  return {
    id: String(row.id),
    session_id: row.session_id != null ? Number(row.session_id) : null,
    user_id: String(row.user_id),
    exercise_label: String(row.exercise_label ?? ''),
    source_item_id: row.source_item_id != null ? Number(row.source_item_id) : null,
    split_times: Array.isArray(row.split_times) ? row.split_times as SwimExerciseLog['split_times'] : [],
    tempo: row.tempo != null ? Number(row.tempo) : null,
    stroke_count: Array.isArray(row.stroke_count) ? row.stroke_count as SwimExerciseLog['stroke_count'] : [],
    notes: row.notes != null ? String(row.notes) : null,
    event_code: row.event_code != null ? String(row.event_code) : null,
    pool_length: row.pool_length != null ? Number(row.pool_length) : null,
    equipment: Array.isArray(row.equipment) ? (row.equipment as string[]) : [],
    created_at: String(row.created_at ?? ''),
    updated_at: String(row.updated_at ?? ''),
  };
}
