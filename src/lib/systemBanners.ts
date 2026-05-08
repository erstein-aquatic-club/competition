import { useEffect, useSyncExternalStore } from "react";

/**
 * §210 — System banner queue.
 *
 * Coordonne les 4 bandeaux système (offline, update, push, install) pour
 * n'en afficher qu'**un seul à la fois**, avec priorité fixe.
 *
 * Priorités (le plus petit = plus haut) :
 *   1. offline   — connectivité perdue, le plus critique
 *   2. update    — nouveau build PWA disponible
 *   3. push      — onboarding notifications (permission)
 *   4. install   — onboarding A2HS (Add To Home Screen)
 *
 * Architecture : module state (Set d'actives) + `useSyncExternalStore` pour
 * subscribe au render. Chaque banner appelle `useSystemBanner(key, isActive)`
 * et reçoit un boolean indiquant s'il doit être rendu.
 *
 * Avant ce module : 4 banners posaient `position: fixed` indépendamment, avec
 * conflits visuels (UpdateNotification + InstallPrompt même slot top-3) et
 * empilements multiples.
 */

export type SystemBannerKey = "offline" | "update" | "push" | "install";

const PRIORITIES: Record<SystemBannerKey, number> = {
  offline: 1,
  update: 2,
  push: 3,
  install: 4,
};

const activeBanners = new Set<SystemBannerKey>();
const listeners = new Set<() => void>();

function emit(): void {
  for (const l of listeners) l();
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

/** Returns the highest-priority banner currently active, or null if none. */
function getVisibleBanner(): SystemBannerKey | null {
  let best: SystemBannerKey | null = null;
  let bestPrio = Number.POSITIVE_INFINITY;
  for (const k of activeBanners) {
    const p = PRIORITIES[k];
    if (p < bestPrio) {
      bestPrio = p;
      best = k;
    }
  }
  return best;
}

/**
 * Hook to register a banner in the system queue.
 *
 * @param key       Banner identifier (offline | update | push | install).
 * @param isActive  Whether the banner *wants* to be visible based on its own
 *                  state (network down, update available, etc.).
 *
 * @returns true if this banner should be rendered now (i.e. it is active AND
 *          it is the highest-priority banner currently in the queue).
 *
 * Usage:
 *   const isOffline = !navigator.onLine;
 *   const shouldRender = useSystemBanner("offline", isOffline);
 *   if (!shouldRender) return null;
 *   return <div className="fixed top-3 ...">...</div>;
 */
export function useSystemBanner(key: SystemBannerKey, isActive: boolean): boolean {
  useEffect(() => {
    if (!isActive) return;
    activeBanners.add(key);
    emit();
    return () => {
      activeBanners.delete(key);
      emit();
    };
  }, [key, isActive]);

  const visibleKey = useSyncExternalStore(
    subscribe,
    getVisibleBanner,
    () => null,
  );
  return isActive && visibleKey === key;
}

// ── Test helpers (exposed for unit tests, not for runtime use) ─────────────

/** @internal Pour tests uniquement. */
export function _resetSystemBannerState(): void {
  activeBanners.clear();
  listeners.clear();
}

/** @internal Pour tests uniquement — snapshot read-only. */
export function _getActiveBanners(): ReadonlySet<SystemBannerKey> {
  return activeBanners;
}
