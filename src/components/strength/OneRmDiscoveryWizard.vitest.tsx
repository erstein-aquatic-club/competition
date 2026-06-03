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
    expect(screen.getByText(/qualité|sécurité|allég/i)).toBeTruthy();
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
