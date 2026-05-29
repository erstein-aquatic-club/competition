// §337 — robustesse fiche nageur. Le boundary `inline` confine un crash d'un
// sous-arbre (onglet Planning / panneau mésocycle) sans écran-blanchir tout le
// shell, et `resetKeys` récupère automatiquement quand on change de nageur.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { useState } from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { ErrorBoundary } from "@/components/shared/ErrorBoundary";

function Boom({ explode }: { explode: boolean }) {
  if (explode) throw new Error("kaboom");
  return <div>contenu sain</div>;
}

describe("ErrorBoundary — variante inline (§337)", () => {
  beforeEach(() => {
    // Le boundary logue toujours (dev + prod) : on mute pour garder la sortie
    // de test propre, tout en vérifiant qu'il a bien logué.
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("affiche un repli compact et logue quand un enfant throw", () => {
    render(
      <ErrorBoundary variant="inline" title="Section KO" context="Test">
        <Boom explode />
      </ErrorBoundary>,
    );
    expect(screen.getByText("Section KO")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Réessayer/i })).toBeTruthy();
    // Trace prod exploitable : le log doit porter le préfixe + contexte.
    expect(console.error).toHaveBeenCalled();
    const logged = (console.error as unknown as { mock: { calls: unknown[][] } })
      .mock.calls.flat().map(String).join(" ");
    expect(logged).toMatch(/EAC ErrorBoundary/);
    expect(logged).toMatch(/Test/);
  });

  it("récupère automatiquement quand resetKeys change (changement de nageur)", () => {
    const { rerender } = render(
      <ErrorBoundary variant="inline" resetKeys={[1]}>
        <Boom explode />
      </ErrorBoundary>,
    );
    // En erreur sur le nageur 1
    expect(screen.queryByText("contenu sain")).toBeNull();

    // Navigue vers le nageur 2 (resetKeys change) + enfant sain → récupère seul
    rerender(
      <ErrorBoundary variant="inline" resetKeys={[2]}>
        <Boom explode={false} />
      </ErrorBoundary>,
    );
    expect(screen.getByText("contenu sain")).toBeTruthy();
  });

  it("« Réessayer » (inline) NE recharge PAS la page + appelle onReset", () => {
    // Contrat inline : on re-rend le sous-arbre en place (pas de reload dur,
    // contrairement à la variante fullscreen). On vérifie le contrat observable :
    // pas de window.location.reload, et onReset appelé pour laisser l'hôte
    // re-piloter ses props/queries.
    const reloadSpy = vi.fn();
    const orig = window.location;
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { ...orig, reload: reloadSpy },
    });
    const onReset = vi.fn();
    try {
      render(
        <ErrorBoundary variant="inline" onReset={onReset}>
          <Boom explode />
        </ErrorBoundary>,
      );
      fireEvent.click(screen.getByRole("button", { name: /Réessayer/i }));
      expect(reloadSpy).not.toHaveBeenCalled();
      expect(onReset).toHaveBeenCalledTimes(1);
    } finally {
      Object.defineProperty(window, "location", { configurable: true, value: orig });
    }
  });

  it("récupère après « Réessayer » quand la cause a disparu (parent re-render)", () => {
    // Cas réaliste : la cause du throw vient des props/données. Après reset, si le
    // parent re-rend avec un enfant sain, le sous-arbre s'affiche (sans reload).
    let explode = true;
    const onReset = () => { explode = false; };
    function Wrapper() {
      const [, force] = useState(0);
      return (
        <ErrorBoundary variant="inline" onReset={() => { onReset(); force((n) => n + 1); }}>
          <Boom explode={explode} />
        </ErrorBoundary>
      );
    }
    render(<Wrapper />);
    expect(screen.queryByText("contenu sain")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Réessayer/i }));
    expect(screen.getByText("contenu sain")).toBeTruthy();
  });
});
