import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";
import { corsHeaders } from "../_shared/cors.ts";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

webpush.setVapidDetails(
  Deno.env.get("VAPID_SUBJECT") || "mailto:contact@eac-erstein.fr",
  Deno.env.get("VAPID_PUBLIC_KEY")!,
  Deno.env.get("VAPID_PRIVATE_KEY")!
);

function resolveNotificationUrl(payload: {
  type?: string | null;
  title?: string | null;
  body?: string | null;
  metadata?: Record<string, unknown> | null;
}): string {
  const metadataUrl = payload.metadata?.url;
  if (typeof metadataUrl === "string" && metadataUrl.trim()) {
    // Ensure push URLs always start with # for the service worker push-handler
    const cleaned = metadataUrl.trim();
    return cleaned.startsWith("#") ? cleaned : `#${cleaned}`;
  }

  const type = String(payload.type || "").toLowerCase();
  const title = String(payload.title || "").toLowerCase();
  const body = String(payload.body || "").toLowerCase();
  const haystack = `${title} ${body}`;

  if (type === "interview" || haystack.includes("entretien")) {
    return "#/suivi/entretiens";
  }

  if (type === "assignment") {
    return "#/";
  }

  if (type === "objective" || haystack.includes("objectif")) {
    return "#/suivi/objectifs";
  }

  if (type === "wellness" || haystack.includes("bien-être") || haystack.includes("te sens-tu")) {
    return "#/?wellness=open";
  }

  return "#/profile?section=messages";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "POST only" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // --- Authentication gate ----------------------------------------------------
  // §194 Vague C — refactor : on décode le payload JWT pour lire le claim
  // `role`, au lieu de comparer le token à `SUPABASE_SERVICE_ROLE_KEY` env.
  // L'ancienne approche cassait dès que la vault key (utilisée par le trigger
  // pg_net 00044) divergait de l'env service_role (rotation, set initial
  // distinct, etc.) → toutes les notifs auto silencieusement en 401.
  //
  // Avec `verify_jwt: true` au niveau function, Supabase a déjà validé la
  // signature du token avant qu'on arrive ici → on peut faire confiance au
  // payload. Deux cas :
  //   1) role = 'service_role' → webhook trigger.
  //   2) role = 'authenticated' → user JWT, on vérifie ensuite coach/admin.
  const authHeader = req.headers.get("authorization") ?? "";
  if (!authHeader.toLowerCase().startsWith("bearer ")) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const token = authHeader.slice("bearer ".length).trim();

  function decodeJwtPayload(jwt: string): Record<string, unknown> | null {
    try {
      const parts = jwt.split(".");
      if (parts.length !== 3) return null;
      const padded = parts[1] + "===".slice(0, (4 - (parts[1].length % 4)) % 4);
      const decoded = atob(padded.replace(/-/g, "+").replace(/_/g, "/"));
      return JSON.parse(decoded);
    } catch {
      return null;
    }
  }

  const jwtPayload = decodeJwtPayload(token);
  const jwtRole = (jwtPayload?.role as string | undefined) ?? null;
  const isWebhookCall = jwtRole === "service_role";

  let isAuthorizedManualCaller = false;
  if (!isWebhookCall) {
    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: `Bearer ${token}` } } }
    );
    const { data: userData, error: userErr } = await userClient.auth.getUser(
      token
    );
    if (userErr || !userData?.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    let role =
      (userData.user.app_metadata?.app_user_role as string | undefined) ??
      null;
    if (!role) {
      const { data: profile } = await userClient
        .from("users")
        .select("role")
        .eq("auth_user_id", userData.user.id)
        .maybeSingle();
      role = (profile?.role as string | undefined) ?? null;
    }
    if (!role || !["coach", "admin"].includes(role)) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    isAuthorizedManualCaller = true;
  }

  try {
    const payload = await req.json();

    let title: string;
    let body: string;
    let url: string | undefined;
    let targetUserIds: number[] = [];
    // §194 Vague C — tag unique par notif pour empêcher l'OS d'écraser les
    // pushs rapprochées dans le tray (tag partagé 'eac-notification' avant).
    let tag: string;

    if (payload.type === "INSERT" && payload.record) {
      const target = payload.record;
      const notifId = target.notification_id;

      const { data: notif } = await supabase
        .from("notifications")
        .select("title, body, type, metadata")
        .eq("id", notifId)
        .single();

      if (!notif) {
        return new Response(JSON.stringify({ error: "notification not found" }), {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      title = notif.title;
      body = notif.body || "";
      url = resolveNotificationUrl(notif);
      tag = `eac-notif-${notifId}`;

      if (target.target_user_id) {
        targetUserIds = [target.target_user_id];
      } else if (target.target_group_id) {
        const { data: members } = await supabase
          .from("group_members")
          .select("user_id")
          .eq("group_id", target.target_group_id);
        targetUserIds = (members || []).map((m: any) => m.user_id);
      }
    } else {
      // Manual payload path — only coach/admin JWT allowed (webhook path goes
      // through the `INSERT` branch above).
      if (!isAuthorizedManualCaller) {
        return new Response(JSON.stringify({ error: "Forbidden" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      title = payload.title || "EAC Natation";
      body = payload.body || "";
      url = payload.url || resolveNotificationUrl(payload);
      targetUserIds = payload.target_user_ids || [];
      tag = `eac-manual-${Date.now()}`;
    }

    if (targetUserIds.length === 0) {
      return new Response(JSON.stringify({ sent: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: subscriptions } = await supabase
      .from("push_subscriptions")
      .select("id, user_id, endpoint, p256dh, auth")
      .in("user_id", targetUserIds);

    if (!subscriptions || subscriptions.length === 0) {
      return new Response(JSON.stringify({ sent: 0, reason: "no subscriptions" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const pushPayload = JSON.stringify({ title, body, url: url || "#/", tag });
    const expiredIds: string[] = [];

    const results = await Promise.allSettled(
      subscriptions.map((sub) =>
        webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh, auth: sub.auth },
          },
          pushPayload
        )
      )
    );

    let sent = 0;
    results.forEach((res, idx) => {
      if (res.status === "fulfilled") {
        sent++;
      } else {
        const sub = subscriptions[idx];
        const err = res.reason as any;
        console.error(`[push] Error sending to ${sub.endpoint}:`, err?.statusCode || err?.message);
        if (err?.statusCode === 404 || err?.statusCode === 410) {
          expiredIds.push(sub.id);
        }
      }
    });

    if (expiredIds.length > 0) {
      await supabase.from("push_subscriptions").delete().in("id", expiredIds);
      console.log(`[push] Cleaned ${expiredIds.length} expired subscriptions`);
    }

    return new Response(
      JSON.stringify({ sent, total: subscriptions.length, expired: expiredIds.length }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error("[push] Error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
