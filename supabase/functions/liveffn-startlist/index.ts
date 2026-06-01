import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

/**
 * Resolve the caller's app role from their JWT. Returns `{ role }` on success,
 * or `{ error }` (distinguishing "no/invalid token" from "wrong role" so the
 * client can show an actionable message). Deployed with verify_jwt=false — this
 * function owns its own auth (same pattern as admin-user) so a missing/expired
 * token yields a friendly French message instead of an opaque gateway 401.
 */
async function resolveRole(req: Request): Promise<{ role: string | null; authError: boolean }> {
  const auth = req.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) return { role: null, authError: true };
  const token = auth.replace("Bearer ", "");
  try {
    const c = createClient(supabaseUrl, supabaseAnonKey, { global: { headers: { Authorization: `Bearer ${token}` } } });
    const { data: { user }, error } = await c.auth.getUser(token);
    if (error || !user) return { role: null, authError: true };
    return { role: (user.app_metadata?.app_user_role as string) ?? null, authError: false };
  } catch {
    return { role: null, authError: true };
  }
}

function isAllowedUrl(raw: string): boolean {
  try {
    const u = new URL(raw);
    return /(^|\.)liveffn\.com$/.test(u.hostname) && /startlist\.php$/.test(u.pathname);
  } catch { return false; }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  const { role, authError } = await resolveRole(req);
  if (authError) return json({ error: "Session expirée ou absente — reconnecte-toi puis réessaie." }, 401);
  if (role !== "coach" && role !== "admin") return json({ error: "Accès réservé aux entraîneurs et admins." }, 403);

  let url = "";
  try { ({ url } = await req.json()); } catch { return json({ error: "Corps de requête invalide." }, 400); }
  if (!isAllowedUrl(url)) return json({ error: "URL liveffn invalide (attendu …liveffn.com/…/startlist.php)." }, 400);

  let html = "";
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; suivi-natation/1.0; +https://erstein-aquatic-club.github.io)" },
    });
    if (!res.ok) return json({ error: `liveffn a répondu HTTP ${res.status}.` }, 502);
    html = await res.text();
  } catch (e) { return json({ error: `Échec de récupération depuis liveffn : ${String(e)}` }, 502); }

  return json({ html });
});
