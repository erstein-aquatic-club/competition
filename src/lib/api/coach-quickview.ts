import { supabase, canUseSupabase, assertSupabase } from './client';

export interface SwimmerBriefingProfile {
  id: number;
  display_name: string;
  avatar_url: string | null;
  group_name: string | null;
  age: number | null;
  sex: string | null;
}

export interface SwimmerBriefingWellness {
  readiness_score: number;
  fatigue: number;
  mood: number;
  logged_at: string;
}

export interface SwimmerBriefingPain {
  zones: string[];
  reports_7d: number;
}

export interface SwimmerBriefingLoad {
  volume_7d_km: number;
  volume_28d_km: number;
  sessions_7d: number;
  avg_rpe_7d: number;
}

export interface SwimmerBriefingObjective {
  id: string;
  event_code: string | null;
  target_time_seconds: number | null;
  text: string | null;
}

export interface SwimmerBriefingPerf {
  event_code: string;
  time_seconds: number;
  competition_date: string;
  competition_name: string | null;
  pool_length: number | null;
}

export interface SwimmerBriefingSession {
  assignment_id: number;
  catalog_id: number | null;
  time_slot: string | null;
  session_name: string | null;
  session_description: string | null;
  total_distance: number | null;
}

export interface SwimmerBriefing {
  profile: SwimmerBriefingProfile;
  wellness_today: SwimmerBriefingWellness | null;
  pain_summary: SwimmerBriefingPain | null;
  load_summary: SwimmerBriefingLoad | null;
  objectives_short: SwimmerBriefingObjective[];
  recent_perfs: SwimmerBriefingPerf[];
  today_session: SwimmerBriefingSession | null;
}

export async function getSwimmerBriefing(athleteId: number): Promise<SwimmerBriefing | null> {
  if (!canUseSupabase()) return null;
  const data = assertSupabase(await supabase.rpc('get_swimmer_quickview_briefing', { p_athlete_id: athleteId }));
  return data as SwimmerBriefing;
}

export type AttendanceStatus = 'present' | 'absent' | 'late';

export async function recordAttendanceAsSub(input: {
  dimSessionId: number;
  athleteId: number;
  status: AttendanceStatus;
  recordedBy: string;
  comment?: string;
}): Promise<void> {
  if (!canUseSupabase()) throw new Error('Supabase not configured');
  assertSupabase(
    await supabase
      .from('session_attendance')
      .upsert(
        {
          session_id: input.dimSessionId,
          athlete_id: input.athleteId,
          status: input.status,
          recorded_by: input.recordedBy,
          comment: input.comment ?? null,
        },
        { onConflict: 'session_id,athlete_id' },
      )
  );
}

export async function addSessionCommentAsSub(input: {
  dimSessionId: number;
  athleteId: number;
  body: string;
  authorUserId?: number;
}): Promise<void> {
  if (!canUseSupabase()) throw new Error('Supabase not configured');
  const { data: auth } = await supabase.auth.getUser();
  const recordedBy = auth.user?.id;
  assertSupabase(await supabase.from('session_comments').insert({
    dim_session_id: input.dimSessionId,
    athlete_id: input.athleteId,
    author_user_id: input.authorUserId ?? null,
    recorded_by: recordedBy,
    body: input.body,
  }));
}

export async function assignSessionToSlotAsSub(input: {
  slotId: number;
  athleteId: number;
  catalogSessionId: number;
  scheduledSlot?: string;
}): Promise<void> {
  if (!canUseSupabase()) throw new Error('Supabase not configured');
  const { data: auth } = await supabase.auth.getUser();
  const recordedBy = auth.user?.id;
  assertSupabase(await supabase.from('session_assignments').insert({
    assignment_type: 'swim',
    swim_catalog_id: input.catalogSessionId,
    target_user_id: input.athleteId,
    scheduled_date: new Date().toISOString().slice(0, 10),
    scheduled_slot: input.scheduledSlot ?? null,
    status: 'assigned',
    assigned_by: null,
    training_slot_id: null,
  }));
  // Record attribution on the slot override if slotId is provided
  if (input.slotId) {
    await supabase
      .from('swim_planning_slot_overrides')
      .update({ recorded_by: recordedBy })
      .eq('id', input.slotId);
  }
}
