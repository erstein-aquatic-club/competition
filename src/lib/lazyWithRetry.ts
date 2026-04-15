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
    factory().catch((err: unknown) => {
      // Si le chargement de chunk échoue (ex: stale cache pointant vers un
      // ancien filename), tenter un full reload une fois pour récupérer un
      // index.html frais.
      const hasReloaded = sessionStorage.getItem("chunk_reload");
      if (!hasReloaded) {
        sessionStorage.setItem("chunk_reload", "1");
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
