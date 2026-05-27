import React, { lazy } from "react";

/**
 * lazy() wrapper qui retente automatiquement une fois en cas d'échec de
 * chargement de chunk (typique sur PWA après un déploiement : index.html
 * cache pointe vers d'anciens noms de fichiers hashés).
 *
 * Utilisé à la fois pour les routes (App.tsx) et les composants lourds
 * lazy-loadés depuis l'intérieur d'une page (modals, sheets).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function lazyWithRetry(factory: () => Promise<{ default: React.ComponentType<any> }>) {
  return lazy(() =>
    factory().catch(async (err: unknown) => {
      // Si le chargement de chunk échoue (ex: stale cache PWA pointant vers
      // d'anciens noms de fichiers hashés), tenter un full reload une fois.
      const hasReloaded = sessionStorage.getItem("chunk_reload");
      if (!hasReloaded) {
        sessionStorage.setItem("chunk_reload", "1");
        // §330 — PURGE le cache du service worker AVANT le reload. Sans ça, le
        // reload re-servait les MÊMES chunks périmés depuis le precache workbox
        // (skipWaiting:false → l'ancien SW reste actif) → 2ᵉ échec → crash. On
        // vide les caches pour forcer un re-fetch réseau (même geste que
        // `applyUpdate` dans main.tsx). Best-effort : un échec de purge ne doit
        // pas empêcher le reload.
        try {
          if (typeof caches !== "undefined") {
            const keys = await caches.keys();
            await Promise.all(keys.map((k) => caches.delete(k)));
          }
        } catch {
          /* purge best-effort */
        }
        window.location.reload();
        // Promise jamais résolue pour bloquer le rendu pendant le reload
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return new Promise<{ default: React.ComponentType<any> }>(() => {});
      }
      sessionStorage.removeItem("chunk_reload");
      throw err;
    }),
  );
}
