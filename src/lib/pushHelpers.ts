/**
 * Pure helper functions for Web Push subscriptions.
 * These have zero browser / Supabase dependencies so they can be unit-tested
 * under Node without mocking.
 */

/**
 * Convert a VAPID public key from URL-safe Base64 to a Uint8Array
 * suitable for `pushManager.subscribe({ applicationServerKey })`.
 */
export function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

/**
 * Flatten a PushSubscription into a plain object with endpoint, p256dh and
 * auth — ready to be persisted server-side.
 */
export function serializeSubscription(sub: PushSubscription): {
  endpoint: string;
  p256dh: string;
  auth: string;
} {
  const json = sub.toJSON();
  return {
    endpoint: json.endpoint!,
    p256dh: json.keys!.p256dh!,
    auth: json.keys!.auth!,
  };
}

/**
 * §194 (Vague B) — décide si on doit refresh le push subscription en DB.
 *
 * Le cron `cleanup_expired_notifications` (00085) supprime les
 * `push_subscriptions` dont `updated_at < now - 90j`. Sans refresh
 * périodique, un user qui n'ouvre pas Profile ni le banner perd sa
 * subscription silencieusement → push muet. On rafraîchit donc
 * `updated_at` toutes les `intervalMs` (7j par défaut, large marge).
 *
 * Le refresh est aussi l'occasion de detecter une rotation d'endpoint
 * (Chrome/Firefox renouvellent parfois) et de resync.
 */
export function shouldRefreshPushSubscription(
  now: number,
  lastRefreshAtMs: number | null,
  intervalMs: number,
): boolean {
  if (!lastRefreshAtMs || lastRefreshAtMs <= 0) return true;
  if (!Number.isFinite(lastRefreshAtMs)) return true;
  return now - lastRefreshAtMs >= intervalMs;
}

/**
 * §194 (Vague B) — décide si on affiche le banner d'activation des pushs.
 *
 * Avant : un dismiss = silence définitif (`localStorage.eac-push-banner-dismissed`
 * jamais reset). Si l'utilisateur perd ensuite sa subscription (cleanup
 * 90j, rotation endpoint, désinstall PWA), il n'a aucun moyen de re-prompt
 * sauf à passer manuellement par Profile → toggle.
 *
 * Désormais on re-propose le banner après `reproposeAfterMs` (60j par défaut).
 * Les anciens dismiss "legacy" (clé présente mais sans timestamp = `0`) sont
 * traités comme expirés → re-prompt immédiat.
 */
export function shouldShowPushBanner(
  now: number,
  dismissedAtMs: number | null,
  reproposeAfterMs: number,
): boolean {
  if (dismissedAtMs == null) return true;
  if (dismissedAtMs <= 0) return true;
  if (!Number.isFinite(dismissedAtMs)) return true;
  return now - dismissedAtMs >= reproposeAfterMs;
}
