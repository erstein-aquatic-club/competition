import { createRoot } from "react-dom/client";
import { registerSW } from 'virtual:pwa-register';
import { shouldAnnounceSwUpdate, type ServerVersion } from "./lib/swUpdateGate";
import App from "./App";
import "./index.css";

declare const __BUILD_TIMESTAMP__: string;
console.log(`[EAC] Build: ${__BUILD_TIMESTAMP__}`);
(window as any).__eacBuildTimestamp = __BUILD_TIMESTAMP__;

// vite-plugin-pwa: gated update mode — new SW waits until user accepts via UpdateNotification.
// Periodic check every hour (only) — do NOT check on visibilitychange:
// would activate a new version mid-session, risking blank pages on iOS PWA.
const UPDATE_INTERVAL_MS = 60 * 60 * 1000; // 1 hour

const updateSW = registerSW({
  immediate: false,
  onRegistered(r) {
    if (r) {
      (window as any).__pwaRegistration = r;
      setInterval(() => {
        r.update().catch(() => {});
      }, UPDATE_INTERVAL_MS);
    }
  },
  onNeedRefresh() {
    // §381 — un SW en attente n'implique pas que l'APP soit périmée : le
    // fallback version.json (useVersionCheck) ou lazyWithRetry (§330) ont pu
    // déjà recharger l'app à jour via le réseau sans activer le nouveau SW.
    // Dans ce cas, pas de bannière : le SW s'activera seul au prochain
    // démarrage à froid.
    void shouldAnnounceSwUpdate(__BUILD_TIMESTAMP__, fetchServerVersion).then((stale) => {
      if (stale) {
        window.dispatchEvent(new CustomEvent('pwa-update-available'));
      } else {
        console.log('[EAC] SW en attente ignoré : app déjà sur le build serveur');
      }
    });
  },
});

// Lit le build serveur (cache-busted, hors SW — version.json est denylisted).
async function fetchServerVersion(): Promise<ServerVersion> {
  const res = await fetch(`${import.meta.env.BASE_URL}version.json?_=${Date.now()}`, {
    cache: 'no-store',
  });
  if (!res.ok) return null;
  return res.json();
}

async function applyUpdate() {
  try {
    // Clear all caches to avoid stale resources from previous SW
    if ('caches' in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    }
  } catch { /* best-effort */ }
  // Activate the waiting SW (skipWaiting + reload in one shot)
  await updateSW(true);
}

(window as any).__pwaUpdateSW = updateSW;
(window as any).__pwaApplyUpdate = applyUpdate;

createRoot(document.getElementById("root")!).render(<App />);
