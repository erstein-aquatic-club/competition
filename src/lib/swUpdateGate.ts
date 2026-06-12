/**
 * §381 — Gate anti-faux-positif de la bannière "Mise à jour disponible".
 *
 * Deux canaux de mise à jour coexistent :
 *  1. le flux SW (vite-plugin-pwa `prompt`) → bannière UpdateNotification ;
 *  2. le fallback `useVersionCheck` (App.tsx) et `lazyWithRetry` (§330), qui
 *     purgent les caches puis rechargent — l'app charge alors le DERNIER build
 *     depuis le réseau pendant que l'ANCIEN SW reste actif.
 *
 * Après le canal 2, le check SW suivant installe le nouveau SW en attente et
 * déclenche `onNeedRefresh` alors que l'app tourne déjà sur le build serveur →
 * bannière en faux positif, ré-affichée à chaque lancement tant que le SW
 * attend. Ce gate compare le build courant au build serveur (version.json) :
 * s'ils sont identiques, on n'annonce rien — le SW en attente s'activera seul
 * au prochain démarrage à froid.
 *
 * En cas de doute (offline, version.json illisible), on annonce : une vraie
 * mise à jour ne doit jamais être perdue (status quo).
 */
export type ServerVersion = { build?: string } | null;

export async function shouldAnnounceSwUpdate(
  currentBuild: string | undefined,
  fetchServerVersion: () => Promise<ServerVersion>,
): Promise<boolean> {
  if (!currentBuild) return true;
  try {
    const version = await fetchServerVersion();
    const serverBuild = version?.build;
    if (!serverBuild) return true;
    return serverBuild !== currentBuild;
  } catch {
    return true;
  }
}
