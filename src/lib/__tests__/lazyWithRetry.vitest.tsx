// §330 — un chunk lazy qui échoue à charger (cache PWA périmé pointant vers
// d'anciens noms hashés) doit s'auto-réparer : PURGER le cache du service worker
// PUIS recharger. Sans la purge (comportement d'avant §330), le reload re-servait
// les mêmes chunks périmés depuis le precache → 2ᵉ échec → crash de la route lazy
// (ex. /coach/swimmer/:id après confirmation d'un mésocycle).
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, waitFor } from "@testing-library/react";
import { Suspense } from "react";
import { lazyWithRetry } from "@/lib/lazyWithRetry";

describe("lazyWithRetry — §330 auto-réparation du cache PWA sur échec de chunk", () => {
  const originalLocation = window.location;
  let reload: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    sessionStorage.clear();
    reload = vi.fn();
    // jsdom : `location.reload` est non-configurable → on remplace tout l'objet.
    delete (window as { location?: Location }).location;
    (window as unknown as { location: { reload: typeof reload } }).location = { reload };
  });
  afterEach(() => {
    (window as unknown as { location: Location }).location = originalLocation;
    vi.unstubAllGlobals();
  });

  it("purge les caches PUIS recharge au 1er échec de chargement de chunk", async () => {
    const cacheDelete = vi.fn(async () => true);
    vi.stubGlobal("caches", {
      keys: vi.fn(async () => ["workbox-precache-v1", "assets"]),
      delete: cacheDelete,
    });

    const Lazy = lazyWithRetry(() =>
      Promise.reject(new Error("Failed to fetch dynamically imported module")),
    );
    render(
      <Suspense fallback={<div>loading</div>}>
        <Lazy />
      </Suspense>,
    );

    await waitFor(() =>
      expect(reload).toHaveBeenCalledTimes(1),
    );
    // Le precache workbox a été vidé AVANT le reload (sinon re-sert les chunks périmés).
    expect(cacheDelete).toHaveBeenCalledWith("workbox-precache-v1");
    expect(cacheDelete).toHaveBeenCalledWith("assets");
    expect(sessionStorage.getItem("chunk_reload")).toBe("1");
  });

  it("au 2ᵉ échec consécutif (reload déjà tenté), relance l'erreur au lieu de boucler", async () => {
    sessionStorage.setItem("chunk_reload", "1"); // un reload a déjà eu lieu
    vi.stubGlobal("caches", { keys: vi.fn(async () => []), delete: vi.fn() });
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const Lazy = lazyWithRetry(() => Promise.reject(new Error("boom")));
    render(
      <Suspense fallback={<div>loading</div>}>
        <Lazy />
      </Suspense>,
    );

    // Pas de boucle de reload : le flag est consommé et l'erreur repart (gérée
    // par l'ErrorBoundary applicatif en prod).
    await waitFor(() =>
      expect(sessionStorage.getItem("chunk_reload")).toBeNull(),
    );
    expect(reload).not.toHaveBeenCalled();
    errSpy.mockRestore();
  });
});
