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
  // Two allowed callers:
  //   1) DB webhook trigger (00044_push_webhook_trigger.sql) → Bearer token
  //      equals the project service_role key (pg_net pulls it from vault)
  //   2) Authenticated coach/admin via supabase.functions.invoke (user JWT)
  // Anonymous callers and athletes are rejected.
  const authHeader = req.headers.get("authorization") ?? "";
  if (!authHeader.toLowerCase().startsWith("bearer ")) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const token = authHeader.slice("bearer ".length).trim();
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const isWebhookCall = serviceRoleKey.length > 0 && token === serviceRoleKey;

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
    // Primary source of role: JWT app_metadata.app_user_role (set by
    // handle_new_auth_user trigger). Fallback: query users table in case of
    // legacy accounts whose JWT has not been refreshed.
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

    const pushPayload = JSON.stringify({ title, body, url: url || "#/" });
    let sent = 0;
    const expiredIds: string[] = [];

    for (const sub of subscriptions) {
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh, auth: sub.auth },
          },
          pushPayload
        );
        sent++;
      } catch (err: any) {
        console.error(`[push] Error sending to ${sub.endpoint}:`, err.statusCode || err.message);
        if (err.statusCode === 404 || err.statusCode === 410) {
          expiredIds.push(sub.id);
        }
      }
    }

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
