/**
 * API Interviews - Multi-phase interview workflow
 *
 * Flow: coach creates (draft_athlete) -> athlete fills & submits (draft_coach)
 *       -> coach fills & sends (sent) -> athlete signs (signed)
 */

import { supabase, canUseSupabase, assertSupabase } from "./client";
import type {
  Interview,
  InterviewCreateInput,
  InterviewAthleteInput,
  InterviewCoachInput,
} from "./types";

export async function getInterviews(athleteId: number): Promise<Interview[]> {
  if (!canUseSupabase()) return [];
  const data = assertSupabase(
    await supabase
      .from("interviews")
      .select("*")
      .eq("athlete_id", athleteId)
      .order("date", { ascending: false })
  );
  return (data ?? []) as Interview[];
}

export async function getMyInterviews(): Promise<Interview[]> {
  if (!canUseSupabase()) return [];
  // RLS handles filtering: athlete sees only draft_athlete, sent, signed
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];
  const appUserId = (user.app_metadata as any)?.app_user_id;
  if (!appUserId) return [];
  const data = assertSupabase(
    await supabase
      .from("interviews")
      .select("*")
      .eq("athlete_id", appUserId)
      .order("date", { ascending: false })
  );
  return (data ?? []) as Interview[];
}

export async function createInterview(input: InterviewCreateInput): Promise<Interview> {
  if (!canUseSupabase()) throw new Error("Supabase not available");
  const { data: { user } } = await supabase.auth.getUser();
  const data = assertSupabase(
    await supabase
      .from("interviews")
      .insert({
        athlete_id: input.athlete_id,
        date: input.date ?? new Date().toISOString().slice(0, 10),
        current_cycle_id: input.current_cycle_id ?? null,
        status: "draft_athlete",
        created_by: user?.id,
      })
      .select()
      .single()
  );
  return data as Interview;
}

/** Athlete updates their sections (phase 1) */
export async function updateInterviewAthleteSections(
  id: string,
  input: InterviewAthleteInput,
): Promise<Interview> {
  if (!canUseSupabase()) throw new Error("Supabase not available");
  const data = assertSupabase(
    await supabase
      .from("interviews")
      .update(input)
      .eq("id", id)
      .eq("status", "draft_athlete")
      .select()
      .single()
  );
  return data as Interview;
}

/** Athlete submits their preparation -> moves to draft_coach (via RPC to bypass SELECT RLS) */
export async function submitInterviewToCoach(id: string): Promise<void> {
  if (!canUseSupabase()) throw new Error("Supabase not available");
  assertSupabase(await supabase.rpc("submit_interview_to_coach", {
    p_interview_id: id,
  }));
}

/** Coach updates their sections (phase 2) */
export async function updateInterviewCoachSections(
  id: string,
  input: InterviewCoachInput,
): Promise<Interview> {
  if (!canUseSupabase()) throw new Error("Supabase not available");
  const data = assertSupabase(
    await supabase
      .from("interviews")
      .update(input)
      .eq("id", id)
      .eq("status", "draft_coach")
      .select()
      .single()
  );
  return data as Interview;
}

/** Coach sends the interview to athlete for review -> moves to sent */
export async function sendInterviewToAthlete(id: string): Promise<Interview> {
  if (!canUseSupabase()) throw new Error("Supabase not available");
  const data = assertSupabase(
    await supabase
      .from("interviews")
      .update({ status: "sent", sent_at: new Date().toISOString() })
      .eq("id", id)
      .eq("status", "draft_coach")
      .select()
      .single()
  );
  return data as Interview;
}

/** Athlete signs the interview -> moves to signed (via RPC to bypass SELECT RLS) */
export async function signInterview(id: string): Promise<void> {
  if (!canUseSupabase()) throw new Error("Supabase not available");
  assertSupabase(await supabase.rpc("sign_interview", {
    p_interview_id: id,
  }));
}

/** Get the previous signed interview for an athlete (before or on the same date, excluding current) */
export async function getPreviousInterview(
  athleteId: number,
  beforeDate: string,
  excludeId?: string,
): Promise<Interview | null> {
  if (!canUseSupabase()) return null;
  let query = supabase
    .from("interviews")
    .select("*")
    .eq("athlete_id", athleteId)
    .eq("status", "signed")
    .lte("date", beforeDate)
    .order("date", { ascending: false })
    .limit(1);
  if (excludeId) query = query.neq("id", excludeId);
  const data = assertSupabase(await query.maybeSingle());
  return (data as Interview) ?? null;
}

/** Coach deletes an interview */
export async function deleteInterview(id: string): Promise<void> {
  if (!canUseSupabase()) throw new Error("Supabase not available");
  assertSupabase(
    await supabase
      .from("interviews")
      .delete()
      .eq("id", id)
  );
}

/** Coach: get all interviews not yet signed, with athlete display_name */
export async function getAllPendingInterviews(): Promise<
  (Interview & { athlete_name: string })[]
> {
  if (!canUseSupabase()) return [];
  const data = assertSupabase(
    await supabase
      .from("interviews")
      .select("*, athlete:users!athlete_id(display_name)")
      .neq("status", "signed")
      .order("date", { ascending: true })
  );
  return (data ?? []).map((row: any) => ({
    ...row,
    athlete_name: row.athlete?.display_name ?? "?",
    athlete: undefined,
  }));
}
