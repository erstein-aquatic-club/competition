import { createRoot } from "react-dom/client";
import { registerSW } from 'virtual:pwa-register';
import App from "./App";
import "./index.css";

declare const __BUILD_TIMESTAMP__: string;
console.log(`[EAC] Build: ${__BUILD_TIMESTAMP__}`);
(window as any).__eacBuildTimestamp = __BUILD_TIMESTAMP__;

// vite-plugin-pwa: autoUpdate mode – SW activates immediately (skipWaiting + clientsClaim)
// Extra safety: periodic check every hour + check on visibility change
const UPDATE_INTERVAL_MS = 60 * 60 * 1000; // 1 hour

const updateSW = registerSW({
  immediate: true,
  onRegistered(r) {
    if (r) {
      (window as any).__pwaRegistration = r;

      // Periodic update check every hour (only) — do NOT check on visibilitychange:
      // calling r.update() every time the app comes back from background causes
      // the SW to activate a new version mid-session, which blanks the page on iOS PWA.
      setInterval(() => {
        r.update().catch(() => {});
      }, UPDATE_INTERVAL_MS);
    }
  },
  onNeedRefresh() {
    // In autoUpdate mode the new SW is already active.
    // Notify the UI so we can reload with a brief countdown.
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
  window.location.reload();
}

(window as any).__pwaUpdateSW = updateSW;
(window as any).__pwaApplyUpdate = applyUpdate;

createRoot(document.getElementById("root")!).render(<App />);
