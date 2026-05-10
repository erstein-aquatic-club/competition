/**
 * API Coach Comments — Read/unread tracking for swimmer session comments
 */

import {
  supabase,
  canUseSupabase,
  normalizeScaleToFive,
  assertSupabase,
} from './client';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SwimmerComment {
  session_id: number;
  athlete_id: number;
  athlete_name: string;
  avatar_url: string | null;
  session_date: string;
  time_slot: string | null;
  comments: string;
  rpe: number | null;
  fatigue: number | null;
  performance: number | null;
  engagement: number | null;
  created_at: string;
  is_read: boolean;
}

export interface GetSwimmerCommentsOptions {
  limit?: number;
  offset?: number;
  /** Only unread comments */
  unreadOnly?: boolean;
}

// ---------------------------------------------------------------------------
// getSwimmerComments
// ---------------------------------------------------------------------------

export async function getSwimmerComments(
  coachUserId: number,
  options?: GetSwimmerCommentsOptions,
): Promise<SwimmerComment[]> {
  if (!canUseSupabase()) return [];

  const limit = options?.limit ?? 100;
  const offset = options?.offset ?? 0;

  // Step 1: Fetch sessions with non-empty comments
  const { data: sessions, error: sessErr } = await supabase
    .from('dim_sessions')
    .select(`
      id,
      athlete_id,
      athlete_name,
      session_date,
      time_slot,
      comments,
      rpe,
      fatigue,
      performance,
      engagement,
      created_at
    `)
    .not('comments', 'is', null)
    .neq('comments', '')
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (sessErr || !sessions || sessions.length === 0) return [];

  // Step 2: Fetch read state for these sessions
  const sessionIds = sessions.map((s: any) => s.id);
  const { data: reads } = await supabase
    .from('coach_comment_reads')
    .select('session_id')
    .eq('coach_user_id', coachUserId)
    .in('session_id', sessionIds);

  const readSet = new Set((reads ?? []).map((r: any) => r.session_id));

  // If unreadOnly filter, remove read ones
  const filtered = options?.unreadOnly
    ? sessions.filter((s: any) => !readSet.has(s.id))
    : sessions;

  // Step 3: Fetch avatars for unique athlete_ids
  const athleteIds = [...new Set(filtered.map((s: any) => s.athlete_id as number))];
  const avatarMap = new Map<number, string | null>();
  if (athleteIds.length > 0) {
    const { data: profiles } = await supabase
      .from('user_profiles')
      .select('user_id, avatar_url')
      .in('user_id', athleteIds);
    for (const p of profiles ?? []) {
      avatarMap.set((p as any).user_id, (p as any).avatar_url ?? null);
    }
  }

  return filtered.map((s: any) => ({
    session_id: s.id,
    athlete_id: s.athlete_id,
    athlete_name: s.athlete_name ?? '',
    avatar_url: avatarMap.get(s.athlete_id) ?? null,
    session_date: s.session_date ?? '',
    time_slot: s.time_slot ?? null,
    comments: s.comments ?? '',
    rpe: normalizeScaleToFive(s.rpe),
    fatigue: normalizeScaleToFive(s.fatigue),
    performance: normalizeScaleToFive(s.performance),
    engagement: normalizeScaleToFive(s.engagement),
    created_at: s.created_at ?? '',
    is_read: readSet.has(s.id),
  }));
}

// ---------------------------------------------------------------------------
// markCommentsRead
// ---------------------------------------------------------------------------

export async function markCommentsRead(
  coachUserId: number,
  sessionIds: number[],
): Promise<void> {
  if (!canUseSupabase() || sessionIds.length === 0) return;

  const now = new Date().toISOString();
  const rows = sessionIds.map((sid) => ({
    coach_user_id: coachUserId,
    session_id: sid,
    read_at: now,
  }));

  assertSupabase(
    await supabase
      .from('coach_comment_reads')
      .upsert(rows, { onConflict: 'coach_user_id,session_id' })
  );
}

// ---------------------------------------------------------------------------
// countUnreadComments48h
// ---------------------------------------------------------------------------

export async function countUnreadComments48h(
  coachUserId: number,
): Promise<number> {
  if (!canUseSupabase()) return 0;

  const since = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();

  // Count sessions with comments in last 48h
  const { data: sessions, error: sessErr } = await supabase
    .from('dim_sessions')
    .select('id')
    .not('comments', 'is', null)
    .neq('comments', '')
    .gte('created_at', since);

  if (sessErr || !sessions || sessions.length === 0) return 0;

  const sessionIds = sessions.map((s: any) => s.id);

  // Subtract those already read
  const { data: reads } = await supabase
    .from('coach_comment_reads')
    .select('session_id')
    .eq('coach_user_id', coachUserId)
    .in('session_id', sessionIds);

  const readCount = (reads ?? []).length;
  return Math.max(0, sessions.length - readCount);
}
