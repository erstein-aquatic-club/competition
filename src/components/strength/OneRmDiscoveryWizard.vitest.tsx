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

describe("OneRmDiscoveryWizard — paliers de chauffe suggérés (Task 6)", () => {
  function advanceToWarmup(appetite: RegExp) {
    fireEvent.click(screen.getByRole("button", { name: /douleur.*non/i }));
    fireEvent.click(screen.getByRole("button", { name: appetite }));
    fireEvent.click(
      screen.getByRole("button", { name: /palier|suivant|continuer/i }),
    );
  }

  it("propose une charge suggérée au 1er palier quand une 1RM est connue", () => {
    render(
      <OneRmDiscoveryWizard
        exerciseName="Squat"
        known1rm={100}
        onComputed={vi.fn()}
        onPainAbort={vi.fn()}
      />,
    );
    advanceToWarmup(/recharger.*un peu/i);
    // 45% de 100 = 45 kg suggéré, pré-rempli dans un champ éditable
    expect(screen.getByDisplayValue("45")).toBeTruthy();
  });

  it("« + palier suivant » incrémente la suggestion selon l'appétit (45 → 47,5 en 'un peu')", () => {
    render(
      <OneRmDiscoveryWizard
        exerciseName="Squat"
        known1rm={100}
        onComputed={vi.fn()}
        onPainAbort={vi.fn()}
      />,
    );
    advanceToWarmup(/recharger.*un peu/i);
    // 1er palier suggéré à 45
    expect(screen.getByDisplayValue("45")).toBeTruthy();
    // recharge "un peu" (+2.5) au palier de chauffe
    fireEvent.click(screen.getByRole("button", { name: /recharger.*un peu/i }));
    fireEvent.click(screen.getByRole("button", { name: /\+ palier suivant/i }));
    // 45 + 2.5 = 47.5
    expect(screen.getByDisplayValue("47.5")).toBeTruthy();
  });

  it("la charge suggérée est éditable (le nageur peut corriger)", () => {
    render(
      <OneRmDiscoveryWizard
        exerciseName="Squat"
        known1rm={100}
        onComputed={vi.fn()}
        onPainAbort={vi.fn()}
      />,
    );
    advanceToWarmup(/recharger.*un peu/i);
    const chargeInput = screen.getByDisplayValue("45") as HTMLInputElement;
    fireEvent.change(chargeInput, { target: { value: "50" } });
    expect(chargeInput.value).toBe("50");
  });

  it("shortMode démarre directement à la série de travail (saute à vide + chauffe)", () => {
    render(
      <OneRmDiscoveryWizard
        exerciseName="Squat"
        known1rm={100}
        shortMode
        onComputed={vi.fn()}
        onPainAbort={vi.fn()}
      />,
    );
    // pas d'étape à vide
    expect(screen.queryByText(/à vide/i)).toBeNull();
    // étape de travail visible
    expect(screen.getByText(/série de travail/i)).toBeTruthy();
  });
});
