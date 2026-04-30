import { supabase, canUseSupabase } from "./client";
import type { SwimmerRef } from "./pace-targets";
import type { ZoneConfig } from "../paceCalculator";
import type { PaceTarget } from "./pace-targets";

export interface PaceSharePayload {
  swimmer_name: string;
  zones: ZoneConfig;
  targets: PaceTarget[];
}

export async function createPaceShareLink(
  swimmer: SwimmerRef,
): Promise<{ token: string; url: string }> {
  if (!canUseSupabase()) throw new Error("Supabase not available");
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Non authentifié");

  const row = {
    coach_id: user.id,
    swimmer_account_id: swimmer.kind === "account" ? swimmer.accountId : null,
    swimmer_manual_id: swimmer.kind === "manual" ? swimmer.manualId : null,
  };

  const { data, error } = await supabase
    .from("pace_share_links")
    .insert(row)
    .select("token")
    .single();
  if (error) throw new Error(error.message);

  const token = (data as { token: string }).token;
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const url = `${origin}/#/share/pace/${token}`;
  return { token, url };
}

export async function getPaceSharePayload(
  token: string,
): Promise<PaceSharePayload | null> {
  if (!canUseSupabase()) return null;
  const { data, error } = await supabase.rpc("get_pace_share_payload", { token_in: token });
  if (error) throw new Error(error.message);
  return data as PaceSharePayload | null;
}
