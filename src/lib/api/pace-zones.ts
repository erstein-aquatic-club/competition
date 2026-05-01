import { supabase, canUseSupabase } from "./client";
import {
  ZONE_COEFFICIENTS,
  type EventFamily,
  type Zone,
  type FamilyCoefficients,
} from "@/lib/paceData";

export interface ZoneRow {
  coach_id: string;
  event_family: EventFamily;
  zone: Zone;
  k_value: number;
  updated_at: string;
}

// 27 default rows: 50m+100m include V4 (6 zones), 200m/400m/800m_1500m don't (5 zones each)
function buildDefaultRows(coachId: string): Omit<ZoneRow, "updated_at">[] {
  const rows: Omit<ZoneRow, "updated_at">[] = [];
  const families: EventFamily[] = ["50m", "100m", "200m", "400m", "800m_1500m"];
  for (const family of families) {
    const coeffs = ZONE_COEFFICIENTS[family];
    const zones: Zone[] = ["V0", "V1", "V2", "V3", "MAX"];
    if (coeffs.V4 !== null && (family === "50m" || family === "100m")) {
      zones.splice(4, 0, "V4");
    }
    for (const zone of zones) {
      const k = coeffs[zone as keyof FamilyCoefficients] as number | null;
      if (k === null) continue;
      rows.push({ coach_id: coachId, event_family: family, zone, k_value: k });
    }
  }
  return rows;
}

/** Returns nested map family→zone→k. Empty if no rows exist (init is hook's responsibility). */
export async function getMyPaceZonesV2(): Promise<
  Partial<Record<EventFamily, Partial<Record<Zone, number>>>>
> {
  if (!canUseSupabase()) return {};
  const { data, error } = await supabase
    .from("coach_pace_zones")
    .select("event_family, zone, k_value");
  if (error) throw new Error(error.message);
  if (!data || data.length === 0) return {};
  const result: Partial<Record<EventFamily, Partial<Record<Zone, number>>>> = {};
  for (const row of data) {
    const fam = row.event_family as EventFamily;
    const z = row.zone as Zone;
    if (!result[fam]) result[fam] = {};
    result[fam]![z] = row.k_value;
  }
  return result;
}

/** Upserts a single (family, zone, k) cell for the current coach. */
export async function upsertPaceZoneCell(args: {
  event_family: EventFamily;
  zone: Zone;
  k_value: number;
}): Promise<void> {
  if (!canUseSupabase()) throw new Error("Supabase not available");
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Non authentifié");
  const { error } = await supabase.from("coach_pace_zones").upsert(
    { coach_id: user.id, ...args, updated_at: new Date().toISOString() },
    { onConflict: "coach_id,event_family,zone" },
  );
  if (error) throw new Error(error.message);
}

/** Resets all zones to doc defaults (DELETE all + bulk INSERT 27 rows). */
export async function resetMyPaceZonesToDefaults(): Promise<void> {
  if (!canUseSupabase()) throw new Error("Supabase not available");
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Non authentifié");
  const { error: delErr } = await supabase
    .from("coach_pace_zones")
    .delete()
    .eq("coach_id", user.id);
  if (delErr) throw new Error(delErr.message);
  const rows = buildDefaultRows(user.id);
  const { error: insErr } = await supabase.from("coach_pace_zones").insert(rows);
  if (insErr) throw new Error(insErr.message);
}

/** Initialises defaults if no zones exist for the current coach. Idempotent. */
export async function initMyPaceZonesIfMissing(): Promise<boolean> {
  if (!canUseSupabase()) return false;
  const { count, error } = await supabase
    .from("coach_pace_zones")
    .select("*", { count: "exact", head: true });
  if (error) throw new Error(error.message);
  if ((count ?? 0) > 0) return false;
  await resetMyPaceZonesToDefaults();
  return true;
}

// ─── Deprecated v1 stubs — à supprimer quand CoachPaceCalculatorScreen est refondu (Phase 6) ──

/** @deprecated Phase 6 refond CoachPaceCalculatorScreen — use getMyPaceZonesV2 + hook. */
export async function getMyPaceZones(): Promise<never> {
  throw new Error("getMyPaceZones supprimé §186 v2 — use getMyPaceZonesV2");
}

/** @deprecated Phase 6 refond CoachPaceCalculatorScreen — use upsertPaceZoneCell instead. */
export async function upsertMyPaceZones(_zones: unknown): Promise<never> {
  throw new Error("upsertMyPaceZones supprimé §186 v2 — use upsertPaceZoneCell");
}
