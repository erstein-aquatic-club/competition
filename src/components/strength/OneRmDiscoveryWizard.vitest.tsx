// Tests vitest jsdom du wizard de calibration 1RM — étape mouvement à vide (Task 5).
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

import { OneRmDiscoveryWizard } from "@/components/strength/OneRmDiscoveryWizard";

describe("OneRmDiscoveryWizard — étape mouvement à vide", () => {
  it("affiche les 3 cases de retex à l'étape à vide", () => {
    render(
      <OneRmDiscoveryWizard
        exerciseName="Squat"
        known1rm={null}
        onComputed={vi.fn()}
        onPainAbort={vi.fn()}
      />,
    );
    expect(screen.getByText(/à vide/i)).toBeTruthy();
    expect(screen.getByText(/douleur/i)).toBeTruthy();
    expect(screen.getByText(/recharger/i)).toBeTruthy();
  });

  it("douleur=oui à l'étape à vide propose la branche sécurité (alléger/substituer/passer)", () => {
    const onPainAbort = vi.fn();
    render(
      <OneRmDiscoveryWizard
        exerciseName="Squat"
        known1rm={null}
        onComputed={vi.fn()}
        onPainAbort={onPainAbort}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /douleur.*oui/i }));
    // Cible une phrase distinctive du paragraphe sécurité (indépendante d'un label de bouton).
    expect(screen.getByText(/montée en charge|série lourde|gêne/i)).toBeTruthy();
  });

  it("une pastille de retex bascule son aria-pressed à la sélection", () => {
    render(
      <OneRmDiscoveryWizard
        exerciseName="Squat"
        known1rm={null}
        onComputed={vi.fn()}
        onPainAbort={vi.fn()}
      />,
    );
    const moyen = screen.getByRole("button", { name: /recharger.*moyen/i });
    expect(moyen.getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(moyen);
    expect(moyen.getAttribute("aria-pressed")).toBe("true");
  });

  it("la branche sécurité câble les 3 actions onPainAbort (alléger/substituer/passer)", () => {
    const onPainAbort = vi.fn();
    render(
      <OneRmDiscoveryWizard
        exerciseName="Squat"
        known1rm={null}
        onComputed={vi.fn()}
        onPainAbort={onPainAbort}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /douleur.*oui/i }));

    fireEvent.click(screen.getByRole("button", { name: /allég/i }));
    expect(onPainAbort).toHaveBeenCalledWith("lighten");

    fireEvent.click(screen.getByRole("button", { name: /substitu/i }));
    expect(onPainAbort).toHaveBeenCalledWith("substitute");

    fireEvent.click(screen.getByRole("button", { name: /passer/i }));
    expect(onPainAbort).toHaveBeenCalledWith("skip");
  });
});
