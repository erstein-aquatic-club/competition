import { supabase, canUseSupabase } from "./client";

export type AuditEntry = {
  id: number;
  actor_id: number;
  actor_name?: string;
  action: string;
  target_user_id: number | null;
  target_name?: string;
  details: Record<string, unknown>;
  created_at: string;
};

export async function getAuditLog(limit = 50, offset = 0): Promise<AuditEntry[]> {
  if (!canUseSupabase()) return [];
  const { data, error } = await supabase
    .from("admin_audit_log")
    .select("*, actor:users!actor_id(display_name), target:users!target_user_id(display_name)")
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);
  if (error) throw new Error(error.message);
  return (data ?? []).map((row: any) => ({
    id: row.id,
    actor_id: row.actor_id,
    actor_name: row.actor?.display_name ?? "—",
    action: row.action,
    target_user_id: row.target_user_id,
    target_name: row.target?.display_name ?? "—",
    details: row.details ?? {},
    created_at: row.created_at,
  }));
}
