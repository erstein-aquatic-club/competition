import { useEffect, useRef } from "react";
import { useAuth } from "@/lib/auth";
import { refreshPushSubscription } from "@/lib/push";
import { shouldRefreshPushSubscription } from "@/lib/pushHelpers";

const LAST_REFRESH_KEY = "eac-push-last-refresh";
const REFRESH_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * §194 (Vague B) — Refresh silencieux de la push subscription au boot.
 *
 * Idempotent : pas de re-run dans la même session (`hasRunRef`), et ne
 * frappe la DB que si `shouldRefreshPushSubscription` le demande (cooldown
 * 7j stocké dans localStorage). Ne prompt JAMAIS la permission.
 *
 * Empêche la disparition silencieuse des subscriptions après 90j
 * (`cleanup_expired_notifications`, migration 00085) et synchronise les
 * rotations d'endpoint Chrome/Firefox.
 */
export function usePushSubscriptionRefresh() {
  const userId = useAuth((s) => s.userId);
  const hasRunRef = useRef(false);

  useEffect(() => {
    if (!userId) return;
    if (typeof window === "undefined") return;
    if (hasRunRef.current) return;
    hasRunRef.current = true;

    let lastRefreshAt: number | null = null;
    try {
      const raw = window.localStorage.getItem(LAST_REFRESH_KEY);
      lastRefreshAt = raw ? Number.parseInt(raw, 10) : null;
    } catch {
      // localStorage indisponible (mode privé, quota, etc.) — refresh quand même
      lastRefreshAt = null;
    }

    if (!shouldRefreshPushSubscription(Date.now(), lastRefreshAt, REFRESH_INTERVAL_MS)) {
      return;
    }

    refreshPushSubscription(userId)
      .then((result) => {
        if (!result.refreshed) return;
        try {
          window.localStorage.setItem(LAST_REFRESH_KEY, String(Date.now()));
        } catch {
          // best-effort
        }
      })
      .catch((err) => {
        console.warn("[push] refresh failed:", err);
      });
  }, [userId]);
}
