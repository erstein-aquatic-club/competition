import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { fetchAllPerformances, formatTimeDisplay } from "../_shared/ffn-parser.ts";
import { corsHeaders } from "../_shared/cors.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

/** Extract calling user's app_user_id + role from JWT (returns nulls if missing) */
async function getCallerIdentity(req: Request): Promise<{ userId: number | null; role: string | null }> {
  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) return { userId: null, role: null };
  const token = authHeader.replace("Bearer ", "");
  const callerClient = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data: { user } } = await callerClient.auth.getUser(token);
  const userId = (user?.app_metadata?.app_user_id as number) ?? null;
  const role = (user?.app_metadata?.app_user_role as string) ?? null;
  return { userId, role };
}

/** Check monthly rate limit for a user based on their role */
async function checkRateLimit(triggeredBy: number | null): Promise<{ allowed: boolean; message?: string }> {
  if (!triggeredBy) return { allowed: true };

  // Get user role
  const { data: userData } = await supabase.from("users").select("role").eq("id", triggeredBy).single();
  const role = userData?.role ?? "athlete";

  // Admin has no limits
  if (role === "admin") return { allowed: true };

  // Get rate limit settings
  const { data: settings } = await supabase.from("app_settings").select("value").eq("key", "import_rate_limits").single();
  const limits = settings?.value as Record<string, number> | null;
  const monthlyLimit = role === "coach"
    ? (limits?.coach_monthly ?? 3)
    : (limits?.athlete_monthly ?? 1);
  if (monthlyLimit < 0) return { allowed: true };

  // Count imports this month
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const { count } = await supabase
    .from("import_logs")
    .select("id", { count: "exact", head: true })
    .eq("triggered_by", triggeredBy)
    .gte("started_at", monthStart);

  if ((count ?? 0) >= monthlyLimit) {
    return { allowed: false, message: `Limite d'imports atteinte (${monthlyLimit}/mois). Contactez un administrateur.` };
  }
  return { allowed: true };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return new Response(JSON.stringify({ error: "POST only" }), { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  let logId: number | null = null;

  try {
    const { swimmer_iuf, user_id: requestedUserId, swimmer_name } = await req.json();
    if (!swimmer_iuf) return new Response(JSON.stringify({ error: "Missing swimmer_iuf" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const { userId: triggeredBy, role: callerRole } = await getCallerIdentity(req);
    if (!triggeredBy) {
      return new Response(JSON.stringify({ error: "Unauthenticated" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // SECURITY: derive user_id attached to performances from the authenticated caller.
    // - admin / coach may attribute performances to an arbitrary user_id (bulk / on-behalf imports)
    //   OR leave it null (admin import sans assignation directe).
    // - athletes (and anyone else) can only attribute performances to themselves — any client-supplied
    //   user_id is ignored.
    const canAttributeToOthers = callerRole === "admin" || callerRole === "coach";
    const effectiveUserId: number | null = canAttributeToOthers
      ? ((typeof requestedUserId === "number" ? requestedUserId : null))
      : triggeredBy;

    // Rate limit check
    const rateCheck = await checkRateLimit(triggeredBy);
    if (!rateCheck.allowed) {
      return new Response(JSON.stringify({ error: rateCheck.message }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Create import log entry
    const { data: logEntry } = await supabase
      .from("import_logs")
      .insert({
        triggered_by: triggeredBy,
        swimmer_iuf,
        swimmer_name: swimmer_name ?? null,
        import_type: "performances",
        status: "running",
      })
      .select("id")
      .single();
    logId = logEntry?.id ?? null;

    // Fetch ALL performances (25m + 50m) using the PRF mode
    const performances = await fetchAllPerformances(swimmer_iuf);
    const totalFound = performances.length;

    const rows = performances.map(p => ({
      user_id: effectiveUserId,
      swimmer_iuf,
      event_code: p.event_name,
      pool_length: p.pool_length,
      time_seconds: p.time_seconds,
      time_display: formatTimeDisplay(p.time_seconds),
      competition_name: p.swimmer_age != null
        ? (p.competition_name ? `(${p.swimmer_age} ans) ${p.competition_name}` : `(${p.swimmer_age} ans)`)
        : p.competition_name,
      competition_date: p.record_date,
      competition_location: p.competition_location,
      ffn_points: p.ffn_points,
      club_name: p.club_name,
      source: "ffn",
    }));

    let newImported = 0;
    const upsertErrors: string[] = [];
    if (rows.length > 0) {
      for (let i = 0; i < rows.length; i += 100) {
        const chunk = rows.slice(i, i + 100);
        const { data, error } = await supabase
          .from("swimmer_performances")
          .upsert(chunk, { onConflict: "swimmer_iuf,event_code,pool_length,competition_date,time_seconds" })
          .select("id");
        if (error) {
          console.error("[ffn-performances] upsert error:", error.message);
          upsertErrors.push(`chunk ${Math.floor(i / 100) + 1}: ${error.message}`);
        } else {
          newImported += (data?.length ?? 0);
        }
      }
    }

    // Update last_imported_at on club_record_swimmers
    await supabase
      .from("club_record_swimmers")
      .update({ last_imported_at: new Date().toISOString() })
      .eq("iuf", swimmer_iuf);

    // Update import log with success
    if (logId) {
      await supabase.from("import_logs").update({
        status: "success",
        performances_found: totalFound,
        performances_imported: newImported,
        completed_at: new Date().toISOString(),
      }).eq("id", logId);
    }

    const allChunksFailed = upsertErrors.length > 0 && rows.length > 0 && newImported === 0;
    const responseBody: Record<string, unknown> = {
      status: allChunksFailed ? "error" : "ok",
      total_found: totalFound,
      new_imported: newImported,
      already_existed: totalFound - newImported,
    };
    if (upsertErrors.length > 0) responseBody.upsert_errors = upsertErrors;
    return new Response(JSON.stringify(responseBody), {
      status: allChunksFailed ? 207 : 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    // Update import log with error
    if (logId) {
      await supabase.from("import_logs").update({
        status: "error",
        error_message: String(e),
        completed_at: new Date().toISOString(),
      }).eq("id", logId);
    }
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
