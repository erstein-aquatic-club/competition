import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

async function getRole(req: Request): Promise<string | null> {
  const auth = req.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) return null;
  const token = auth.replace("Bearer ", "");
  const c = createClient(supabaseUrl, supabaseAnonKey, { global: { headers: { Authorization: `Bearer ${token}` } } });
  const { data: { user } } = await c.auth.getUser(token);
  return (user?.app_metadata?.app_user_role as string) ?? null;
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

  const role = await getRole(req);
  if (role !== "coach" && role !== "admin") return json({ error: "Accès réservé aux entraîneurs." }, 403);

  let url = "";
  try { ({ url } = await req.json()); } catch { return json({ error: "Corps invalide." }, 400); }
  if (!isAllowedUrl(url)) return json({ error: "URL liveffn invalide (attendu …liveffn.com/…/startlist.php)." }, 400);

  let html = "";
  try {
    const res = await fetch(url, { headers: { "User-Agent": "suivi-natation/1.0" } });
    if (!res.ok) return json({ error: `liveffn a répondu HTTP ${res.status}.` }, 502);
    html = await res.text();
  } catch (e) { return json({ error: `Échec de récupération: ${String(e)}` }, 502); }

  return json({ html });
});
