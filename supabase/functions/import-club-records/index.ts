// supabase/functions/import-club-records/index.ts
// Edge Function: Bulk import FFN performances for all active club swimmers,
// then recalculate club records.
// Supports mode: "full" (default) or "recalculate" (skip FFN fetch).
// Requires coach or admin role (verified via JWT).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { fetchAllPerformances, formatTimeDisplay } from "../_shared/ffn-parser.ts";
import { normalizeEventCode, EVENT_LABELS } from "../_shared/ffn-event-map.ts";
import { corsHeaders } from "../_shared/cors.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

function jsonResponse(
  data: Record<string, unknown>,
  status = 200,
): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function errorResponse(message: string, status = 400): Response {
  return jsonResponse({ error: message }, status);
}

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function calculateAge(birthdate: string, competitionDate: string): number {
  const birth = new Date(birthdate);
  const comp = new Date(competitionDate);
  let age = comp.getFullYear() - birth.getFullYear();
  if (
    comp.getMonth() < birth.getMonth() ||
    (comp.getMonth() === birth.getMonth() &&
      comp.getDate() < birth.getDate())
  ) {
    age--;
  }
  return age;
}

// --- Auth check: verify caller JWT and extract role (coach or admin) ---

async function verifyCallerRole(
  req: Request,
): Promise<{ role: string; userId: number } | Response> {
  const authHeader = req.headers.get("authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return errorResponse("Missing or invalid Authorization header", 401);
  }

  const token = authHeader.replace("Bearer ", "");

  // Detect service_role token by decoding JWT payload
  try {
    const parts = token.split(".");
    if (parts.length === 3) {
      const payload = JSON.parse(atob(parts[1]));
      if (payload.role === "service_role") {
        // Service role token: bypass user auth, return admin privileges
        return { role: "admin", userId: 0 }; // userId 0 = system/service
      }
    }
  } catch (e) {
    // Invalid JWT format, continue to user auth check
  }

  const callerClient = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });

  const {
    data: { user },
    error,
  } = await callerClient.auth.getUser(token);
  if (error || !user) {
    return errorResponse("Invalid or expired token", 401);
  }

  const appRole = user.app_metadata?.app_user_role as string | undefined;
  const appUserId = user.app_metadata?.app_user_id as number | undefined;

  if (!appRole || !appUserId) {
    return errorResponse("User has no app role assigned", 403);
  }

  if (appRole !== "coach" && appRole !== "admin") {
    return errorResponse("Forbidden: coach or admin only", 403);
  }

  return { role: appRole, userId: appUserId };
}

/** Check monthly rate limit for coach role (admin unlimited) */
async function checkRateLimit(userId: number, role: string): Promise<{ allowed: boolean; message?: string }> {
  if (role === "admin") return { allowed: true };

  const { data: settings } = await supabaseAdmin.from("app_settings").select("value").eq("key", "import_rate_limits").single();
  const limits = settings?.value as Record<string, number> | null;
  const monthlyLimit = role === "coach"
    ? (limits?.coach_monthly ?? 3)
    : (limits?.athlete_monthly ?? 1);
  if (monthlyLimit < 0) return { allowed: true };

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const { count } = await supabaseAdmin
    .from("import_logs")
    .select("id", { count: "exact", head: true })
    .eq("triggered_by", userId)
    .gte("started_at", monthStart);

  if ((count ?? 0) >= monthlyLimit) {
    return { allowed: false, message: `Limite d'imports atteinte (${monthlyLimit}/mois).` };
  }
  return { allowed: true };
}

// --- Recalculate club records from swimmer_performances ---

interface PerSwimmerBest {
  time_seconds: number;
  time_ms: number;
  athlete_name: string;
  swimmer_iuf: string;
  record_date: string | null;
  event_code: string;
  event_label: string;
  pool_m: number;
  sex: string;
  age: number;
  actual_age: number;
  original_age?: number; // Track original age before cascade
}

/** Extract age from competition_name like "(12 ans)" */
function extractAgeFromText(text: string | null): number | null {
  if (!text) return null;
  const m = text.match(/\((\d+)\s*ans?\)/i);
  return m ? Number(m[1]) : null;
}

interface RecalcStats {
  active_swimmers: number;
  swimmers_with_sex: number;
  total_performances: number;
  skipped_no_swimmer: number;
  skipped_no_event_code: number;
  skipped_no_age: number;
  processed: number;
  per_swimmer_bests: number;
  club_records_upserted: number;
  unmapped_event_codes: string[];
}

async function recalculateClubRecords(): Promise<RecalcStats> {
  const stats: RecalcStats = {
    active_swimmers: 0,
    swimmers_with_sex: 0,
    total_performances: 0,
    skipped_no_swimmer: 0,
    skipped_no_event_code: 0,
    skipped_no_age: 0,
    processed: 0,
    per_swimmer_bests: 0,
    club_records_upserted: 0,
    unmapped_event_codes: [],
  };

  // Load ALL swimmers (active + inactive) for record calculation
  // Note: is_active only controls FFN import, not record eligibility
  const { data: allSwimmers } = await supabaseAdmin
    .from("club_record_swimmers")
    .select("iuf, sex, birthdate, display_name, is_active")
    .not("iuf", "is", null);

  const activeCount = allSwimmers?.filter((s) => s.is_active).length ?? 0;
  stats.active_swimmers = activeCount;

  const swimmerMap = new Map<
    string,
    { sex: string; birthdate: string | null; name: string }
  >();
  for (const s of allSwimmers ?? []) {
    if (s.iuf && s.sex) {
      swimmerMap.set(s.iuf, {
        sex: s.sex,
        birthdate: s.birthdate ?? null,
        name: s.display_name,
      });
    }
  }
  stats.swimmers_with_sex = swimmerMap.size;

  // Fetch all performances (paginated to avoid Supabase default 1000-row limit)
  const allPerfs: any[] = [];
  const PAGE_SIZE = 1000;
  let from = 0;
  while (true) {
    const { data: page } = await supabaseAdmin
      .from("swimmer_performances")
      .select("*")
      .range(from, from + PAGE_SIZE - 1);
    if (!page || page.length === 0) break;
    allPerfs.push(...page);
    if (page.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  stats.total_performances = allPerfs.length;
  if (allPerfs.length === 0) return stats;

  // Track unmapped event codes (collect unique ones, max 20)
  const unmappedCodes = new Set<string>();

  const perSwimmerBests = new Map<string, PerSwimmerBest>();

  for (const perf of allPerfs) {
    const swimmerInfo = swimmerMap.get(perf.swimmer_iuf);
    if (!swimmerInfo) {
      stats.skipped_no_swimmer++;
      continue;
    }

    const normalizedCode = normalizeEventCode(perf.event_code);
    if (!normalizedCode) {
      stats.skipped_no_event_code++;
      if (unmappedCodes.size < 20) unmappedCodes.add(perf.event_code);
      continue;
    }

    // Extract age from competition_name "(XX ans)", fall back to birthdate calculation
    let age = extractAgeFromText(perf.competition_name);
    if (age === null && swimmerInfo.birthdate && perf.competition_date) {
      age = calculateAge(swimmerInfo.birthdate, perf.competition_date);
    }
    if (age === null) {
      stats.skipped_no_age++;
      continue;
    }

    stats.processed++;

    // Clamp age: 8 means "8 and under", 17 means "17 and over"
    const clampedAge = Math.max(8, Math.min(17, age));

    const key = `${normalizedCode}__${perf.pool_length}__${swimmerInfo.sex}__${clampedAge}__${perf.swimmer_iuf}`;
    const existing = perSwimmerBests.get(key);

    if (!existing || perf.time_seconds < existing.time_seconds) {
      perSwimmerBests.set(key, {
        time_seconds: perf.time_seconds,
        time_ms: Math.round(perf.time_seconds * 1000),
        athlete_name: swimmerInfo.name,
        swimmer_iuf: perf.swimmer_iuf,
        record_date: perf.competition_date,
        event_code: normalizedCode,
        event_label: EVENT_LABELS[normalizedCode] ?? normalizedCode,
        pool_m: perf.pool_length,
        sex: swimmerInfo.sex,
        age: clampedAge,
        actual_age: age,
      });
    }
  }

  stats.per_swimmer_bests = perSwimmerBests.size;
  stats.unmapped_event_codes = [...unmappedCodes];

  // Clear old club_performances before reinserting (prevent duplicates)
  await supabaseAdmin.from("club_performances").delete().neq("id", 0);

  // Insert all per-swimmer bests into club_performances (for ranking support)
  const allBests = [...perSwimmerBests.values()];
  for (let i = 0; i < allBests.length; i += 100) {
    const chunk = allBests.slice(i, i + 100).map((r) => ({
      athlete_name: r.athlete_name,
      swimmer_iuf: r.swimmer_iuf,
      sex: r.sex,
      pool_m: r.pool_m,
      event_code: r.event_code,
      event_label: r.event_label,
      age: r.age,
      actual_age: r.actual_age,
      time_ms: r.time_ms,
      record_date: r.record_date,
      source: "ffn",
    }));
    await supabaseAdmin.from("club_performances").insert(chunk);
  }

  // Now find overall best per (event_code, pool_m, sex, age) for club_records
  const overallBests = new Map<string, PerSwimmerBest>();
  for (const entry of allBests) {
    const key = `${entry.event_code}__${entry.pool_m}__${entry.sex}__${entry.age}`;
    const existing = overallBests.get(key);
    if (!existing || entry.time_seconds < existing.time_seconds) {
      overallBests.set(key, entry);
    }
  }

  // Apply age cascade: if a younger age has a better time than an older age,
  // the older age should also hold that record
  // Example: if 15 ans has 1:30 and 16 ans has 1:35 (or no record),
  // then 16 ans should also get 1:30
  const eventCombinations = new Set<string>();
  for (const [key] of overallBests) {
    const [eventCode, poolM, sex] = key.split("__");
    eventCombinations.add(`${eventCode}__${poolM}__${sex}`);
  }

  for (const combo of eventCombinations) {
    const [eventCode, poolM, sex] = combo.split("__");

    // For each age from 8 to 16, check if the record should cascade to older ages
    for (let age = 8; age < 17; age++) {
      const currentKey = `${eventCode}__${poolM}__${sex}__${age}`;
      const currentRecord = overallBests.get(currentKey);

      if (!currentRecord) continue; // No record for this age, skip

      // Check all older ages and update if current age has a better time
      for (let olderAge = age + 1; olderAge <= 17; olderAge++) {
        const olderKey = `${eventCode}__${poolM}__${sex}__${olderAge}`;
        const olderRecord = overallBests.get(olderKey);

        // If no record exists for older age, or younger age has better time
        if (!olderRecord || currentRecord.time_seconds < olderRecord.time_seconds) {
          // Cascade the record to the older age category
          overallBests.set(olderKey, {
            ...currentRecord,
            age: olderAge, // Update age to reflect the category
            original_age: currentRecord.original_age ?? age, // Preserve original age
          });
        }
      }
    }
  }

  // Upsert club_records with the overall best (including cascaded records)
  for (const [, record] of overallBests) {
    // Find performance_id using original_age (not cascaded age)
    const lookupAge = record.original_age ?? record.age;
    const { data: perfRow } = await supabaseAdmin
      .from("club_performances")
      .select("id")
      .eq("event_code", record.event_code)
      .eq("pool_m", record.pool_m)
      .eq("sex", record.sex)
      .eq("age", lookupAge)
      .eq("time_ms", record.time_ms)
      .limit(1)
      .single();

    await supabaseAdmin.from("club_records").upsert(
      {
        performance_id: perfRow?.id ?? 0,
        athlete_name: record.athlete_name,
        swimmer_iuf: record.swimmer_iuf,
        sex: record.sex,
        pool_m: record.pool_m,
        event_code: record.event_code,
        event_label: record.event_label,
        age: record.age,
        original_age: record.original_age ?? record.age, // Track original age
        time_ms: record.time_ms,
        record_date: record.record_date,
      },
      { onConflict: "pool_m,sex,age,event_code" },
    );
  }

  stats.club_records_upserted = overallBests.size;
  return stats;
}

// --- Main handler ---

Deno.serve(async (req) => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return errorResponse("Method not allowed. Use POST.", 405);
  }

  // Verify caller authentication and role
  const callerResult = await verifyCallerRole(req);
  if (callerResult instanceof Response) {
    return callerResult;
  }

  const { role, userId: triggeredBy } = callerResult;

  try {
    // Parse request body for mode
    let mode = "full";
    try {
      const body = await req.json();
      if (body?.mode === "recalculate") mode = "recalculate";
    } catch {
      // No body or invalid JSON: default to full mode
    }

    // Rate limit check (only for full mode which fetches from FFN)
    if (mode === "full") {
      const rateCheck = await checkRateLimit(triggeredBy, role);
      if (!rateCheck.allowed) {
        return errorResponse(rateCheck.message ?? "Rate limit exceeded", 429);
      }
    }

    if (mode === "recalculate") {
      // Recalculate-only: skip FFN fetch, just rebuild club records
      const recalcStats = await recalculateClubRecords();
      return jsonResponse({
        summary: { imported: 0, errors: 0, swimmers_processed: 0, mode: "recalculate" },
        recalc_stats: recalcStats,
      });
    }

    // Full mode: fetch FFN + recalculate
    // 1. Get all active swimmers with IUF
    const { data: swimmers, error: swErr } = await supabaseAdmin
      .from("club_record_swimmers")
      .select("*")
      .eq("is_active", true)
      .not("iuf", "is", null);

    if (swErr) throw new Error(`Failed to fetch swimmers: ${swErr.message}`);

    if (!swimmers || swimmers.length === 0) {
      return jsonResponse({
        summary: { imported: 0, errors: 0, swimmers_processed: 0 },
      });
    }

    // Build IUF → user_id mapping from user_profiles so bulk imports link performances
    const { data: profiles } = await supabaseAdmin
      .from("user_profiles")
      .select("user_id, ffn_iuf")
      .not("ffn_iuf", "is", null);
    const iufToUserId = new Map<string, number>();
    for (const p of profiles ?? []) {
      if (p.ffn_iuf) iufToUserId.set(p.ffn_iuf, p.user_id);
    }

    let totalImported = 0;
    let totalErrors = 0;

    // 2. Import performances for each swimmer
    for (const swimmer of swimmers) {
      const iuf = swimmer.iuf;
      if (!iuf) continue;

      // Create import log entry
      const { data: logEntry } = await supabaseAdmin
        .from("import_logs")
        .insert({
          triggered_by: triggeredBy,
          swimmer_iuf: iuf,
          swimmer_name: swimmer.display_name,
          import_type: "performances",
          status: "running",
        })
        .select("id")
        .single();

      try {
        // Fetch ALL FFN performances (25m + 50m)
        const perfs = await fetchAllPerformances(iuf);

        // Build rows for upsert into swimmer_performances
        const linkedUserId = iufToUserId.get(iuf) ?? null;
        const rows = perfs.map((p) => ({
          user_id: linkedUserId,
          swimmer_iuf: iuf,
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
          source: "ffn",
        }));

        // Upsert in chunks of 100 (ON CONFLICT DO UPDATE)
        let imported = 0;
        for (let i = 0; i < rows.length; i += 100) {
          const chunk = rows.slice(i, i + 100);
          const { data, error: upsertErr } = await supabaseAdmin
            .from("swimmer_performances")
            .upsert(chunk, {
              onConflict:
                "swimmer_iuf,event_code,pool_length,competition_date,time_seconds",
            })
            .select("id");
          if (upsertErr) {
            console.error(`[import-club-records] upsert error for ${iuf} chunk ${i}: ${upsertErr.message}`);
          }
          imported += data?.length ?? 0;
        }

        totalImported += imported;

        // Update last_imported_at on club_record_swimmers
        await supabaseAdmin
          .from("club_record_swimmers")
          .update({ last_imported_at: new Date().toISOString() })
          .eq("iuf", iuf);

        // Update log entry with success
        if (logEntry?.id) {
          await supabaseAdmin
            .from("import_logs")
            .update({
              status: "success",
              performances_found: perfs.length,
              performances_imported: imported,
              completed_at: new Date().toISOString(),
            })
            .eq("id", logEntry.id);
        }
      } catch (err) {
        totalErrors++;
        if (logEntry?.id) {
          await supabaseAdmin
            .from("import_logs")
            .update({
              status: "error",
              error_message: String(err),
              completed_at: new Date().toISOString(),
            })
            .eq("id", logEntry.id);
        }
        console.error(
          `[import-club-records] Error for swimmer ${iuf}:`,
          err,
        );
      }

      // Delay between swimmers to avoid hammering FFN
      await delay(1500);
    }

    // 3. Recalculate club records from all swimmer_performances
    const recalcStats = await recalculateClubRecords();

    return jsonResponse({
      summary: {
        imported: totalImported,
        errors: totalErrors,
        swimmers_processed: swimmers.length,
      },
      recalc_stats: recalcStats,
    });
  } catch (e) {
    console.error("[import-club-records] Fatal error:", e);
    return errorResponse(
      `Internal error: ${e instanceof Error ? e.message : String(e)}`,
      500,
    );
  }
});
