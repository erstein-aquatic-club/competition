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
    return "#/suivi?tab=entretiens";
  }

  if (type === "assignment") {
    return "#/";
  }

  if (type === "objective" || haystack.includes("objectif")) {
    return "#/suivi?tab=objectifs";
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
