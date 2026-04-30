import { supabase, canUseSupabase } from "./client";
import { DEFAULT_ZONES, type ZoneConfig } from "../paceCalculator";

export async function getMyPaceZones(): Promise<ZoneConfig> {
  if (!canUseSupabase()) return DEFAULT_ZONES;
  const { data, error } = await supabase
    .from("coach_pace_zones")
    .select("v0_pct, v1_pct, v2_pct, v3_pct, max_pct")
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? (data as ZoneConfig) : DEFAULT_ZONES;
}

export async function upsertMyPaceZones(zones: ZoneConfig): Promise<void> {
  if (!canUseSupabase()) throw new Error("Supabase not available");
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Non authentifié");
  const { error } = await supabase
    .from("coach_pace_zones")
    .upsert(
      { coach_id: user.id, ...zones, updated_at: new Date().toISOString() },
      { onConflict: "coach_id" },
    )
    .select()
    .single();
  if (error) throw new Error(error.message);
}
