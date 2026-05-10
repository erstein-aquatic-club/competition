import { supabase, canUseSupabase, assertSupabase } from "./client";
import type { SwimmerRef } from "./pace-targets";
import type { ZoneConfig } from "../paceCalculator";
import type { PaceTarget } from "./pace-targets";
import type { Sex } from "../poolConversion";

/** Pure helper — exported for testing. Preserves the full base path (needed for GitHub Pages subdirectory). */
export function buildShareUrl(token: string, base?: string): string {
  const b = base ?? (typeof window !== "undefined" ? window.location.href.split("#")[0] : "");
  return `${b}#/share/pace/${token}`;
}

export interface PaceSharePayload {
  swimmer_name: string;
  swimmer_sex?: Sex | null;
  zones?: ZoneConfig;
  zones_v2?: Record<string, Record<string, number>>;
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

  const data = assertSupabase(
    await supabase
      .from("pace_share_links")
      .insert(row)
      .select("token")
      .single()
  );

  const token = (data as { token: string }).token;
  const url = buildShareUrl(token);
  return { token, url };
}

export async function getPaceSharePayload(
  token: string,
): Promise<PaceSharePayload | null> {
  if (!canUseSupabase()) return null;
  const data = assertSupabase(await supabase.rpc("get_pace_share_payload", { token_in: token }));
  return data as PaceSharePayload | null;
}
