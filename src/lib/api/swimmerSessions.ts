import { supabase, canUseSupabase } from "./client";
import type { SwimmerSession } from "./types";

/**
 * Canonical fetch for what a swimmer should see on a given date range.
 * Unifies inheritance (group → swimmer), individual/subgroup/group precedence,
 * and granular absences. Backed by the `get_swimmer_sessions` Postgres RPC.
 *
 * @param userId         Swimmer user id (integer from users.id)
 * @param from           ISO date YYYY-MM-DD inclusive
 * @param to             ISO date YYYY-MM-DD inclusive
 * @param includeDrafts  If true (coach only), returns assignments with
 *                       `visible_from > today` still in draft state.
 */
export async function getSwimmerSessions(
  userId: number,
  from: string,
  to: string,
  includeDrafts = false,
): Promise<SwimmerSession[]> {
  if (!canUseSupabase()) return [];
  const { data, error } = await supabase.rpc("get_swimmer_sessions", {
    p_user_id: userId,
    p_from: from,
    p_to: to,
    p_include_drafts: includeDrafts,
  });
  if (error) throw new Error(error.message);
  return (data ?? []) as SwimmerSession[];
}
