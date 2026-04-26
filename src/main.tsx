import { createRoot } from "react-dom/client";
import { registerSW } from 'virtual:pwa-register';
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
    // The new SW is waiting. Notify the UI so the user can accept the update.
    window.dispatchEvent(new CustomEvent('pwa-update-available'));
  },
});

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
