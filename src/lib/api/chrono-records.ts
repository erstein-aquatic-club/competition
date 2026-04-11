import { supabase, canUseSupabase } from "./client";
import type { ChronoRecord, ChronoRecordInput } from "./types";

export async function getChronoRecords(): Promise<ChronoRecord[]> {
  if (!canUseSupabase()) return [];
  const { data, error } = await supabase
    .from("chrono_records")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as ChronoRecord[];
}

export async function createChronoRecord(input: ChronoRecordInput): Promise<ChronoRecord> {
  if (!canUseSupabase()) throw new Error("Supabase not available");
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Non authentifié");
  const { data, error } = await supabase
    .from("chrono_records")
    .insert({
      coach_id: user.id,
      status: input.status,
      label: input.label,
      config: input.config,
      swimmers: input.swimmers,
    })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as ChronoRecord;
}

export async function updateChronoRecord(
  id: string,
  patch: Partial<ChronoRecordInput>,
): Promise<void> {
  if (!canUseSupabase()) throw new Error("Supabase not available");
  const row: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.status !== undefined) row.status = patch.status;
  if (patch.label !== undefined) row.label = patch.label;
  if (patch.config !== undefined) row.config = patch.config;
  if (patch.swimmers !== undefined) row.swimmers = patch.swimmers;
  const { error } = await supabase
    .from("chrono_records")
    .update(row)
    .eq("id", id);
  if (error) throw new Error(error.message);
}

export async function deleteChronoRecord(id: string): Promise<void> {
  if (!canUseSupabase()) throw new Error("Supabase not available");
  const { error } = await supabase
    .from("chrono_records")
    .delete()
    .eq("id", id);
  if (error) throw new Error(error.message);
}
