import { supabase, canUseSupabase } from "./client";

export type NotificationLogEntry = {
  id: number;
  sender_id: number;
  title: string;
  body: string | null;
  target_type: string;
  target_ids: number[];
  recipient_count: number;
  created_at: string;
};

export async function getNotificationLog(
  limit = 30,
  offset = 0,
): Promise<NotificationLogEntry[]> {
  if (!canUseSupabase()) return [];
  const { data, error } = await supabase
    .from("notification_log")
    .select("*")
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);
  if (error) throw new Error(error.message);
  return (data ?? []) as NotificationLogEntry[];
}
