import { supabase, canUseSupabase } from "./client";
import type { EventFamily } from "@/lib/paceData";

type SingleStroke = "crawl" | "dos" | "brasse" | "papillon";

export interface StrokeAdjustmentRow {
  coach_id: string;
  stroke: SingleStroke;
  event_family: EventFamily;
  m_value: number;
}

/** Returns the coach's stroke adjustment overrides. Empty = use STROKE_ADJUSTMENTS_DEFAULT. */
export async function getMyStrokeAdjustments(): Promise<StrokeAdjustmentRow[]> {
  if (!canUseSupabase()) return [];
  const { data, error } = await supabase
    .from("coach_stroke_adjustments")
    .select("coach_id, stroke, event_family, m_value");
  if (error) throw new Error(error.message);
  return (data ?? []) as StrokeAdjustmentRow[];
}

/** Upserts a single (stroke, event_family, m_value) override for the current coach. */
export async function upsertStrokeAdjustment(args: {
  stroke: SingleStroke;
  event_family: EventFamily;
  m_value: number;
}): Promise<void> {
  if (!canUseSupabase()) throw new Error("Supabase not available");
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Non authentifié");
  const { error } = await supabase.from("coach_stroke_adjustments").upsert(
    { coach_id: user.id, ...args, updated_at: new Date().toISOString() },
    { onConflict: "coach_id,stroke,event_family" },
  );
  if (error) throw new Error(error.message);
}

/** Deletes all overrides for the current coach (falls back to STROKE_ADJUSTMENTS_DEFAULT). */
export async function resetMyStrokeAdjustments(): Promise<void> {
  if (!canUseSupabase()) throw new Error("Supabase not available");
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Non authentifié");
  const { error } = await supabase
    .from("coach_stroke_adjustments")
    .delete()
    .eq("coach_id", user.id);
  if (error) throw new Error(error.message);
}
