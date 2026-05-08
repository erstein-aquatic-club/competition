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
 * §194 (Vague C) — Extrait le chemin (sans query) à partir d'une URL ou
 * d'une route hash. Utilisé pour comparer la page courante d'un client SW
 * avec la cible d'une notification.
 *
 * Entrées tolérées :
 *   - URL complète avec hash : "https://x.fr/competition/#/profile?s=msg"
 *   - URL complète sans hash : "https://x.fr/competition/"
 *   - Hash seul : "#/profile"
 *   - Hash sans `#` : "/profile" ou "/?wellness=open"
 *
 * Retourne le chemin (slash inclus) sans la query, ou chaîne vide si pas
 * de hash dans une URL pleine.
 */
export function extractHashPath(url: string): string {
  if (!url) return "";
  let hashPart: string;
  const hashIndex = url.indexOf("#");
  if (hashIndex >= 0) {
    hashPart = url.substring(hashIndex + 1);
  } else if (url.startsWith("/")) {
    hashPart = url;
  } else {
    return "";
  }
  const queryIndex = hashPart.indexOf("?");
  return queryIndex >= 0 ? hashPart.substring(0, queryIndex) : hashPart;
}

/**
 * §194 (Vague C) — Décide si la page courante d'un client SW correspond
 * déjà à la cible d'une notification push.
 *
 * Avant : le SW supprimait la notif OS dès qu'**un** client était `focused`,
 * peu importe sur quelle page. Si l'utilisateur naviguait ailleurs dans
 * l'app, il pouvait rater une notif (toast in-app §180 disparaît en 5 s).
 * Désormais on ne supprime QUE si le client focused est exactement sur la
 * page ciblée — la notif s'affiche dans tous les autres cas.
 *
 * Comparaison : path du hash (sans query, sans trailing slash sauf root).
 */
export function pushTargetMatchesClient(
  clientUrl: string,
  targetUrl: string,
): boolean {
  const clientPath = extractHashPath(clientUrl);
  const targetPath = extractHashPath(targetUrl);
  if (!clientPath || !targetPath) return false;
  const norm = (p: string) =>
    p.length > 1 && p.endsWith("/") ? p.slice(0, -1) : p;
  return norm(clientPath) === norm(targetPath);
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
