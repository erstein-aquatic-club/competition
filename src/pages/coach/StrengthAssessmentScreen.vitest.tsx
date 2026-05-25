// Régression React #310 (§316) — "Bilan muscu > sélection d'un nageur" crashait
// avec « Rendered more hooks than during the previous render » : `useBilanSteps`
// était appelé APRÈS les `return` anticipés (accès coach + sélection nageur), donc
// son hook interne (`useLocation`) ne tournait pas tant qu'aucun nageur n'était
// choisi → le passage null→nagear ajoutait un hook. Ce test rend l'écran sans
// nageur puis en sélectionne un : avant le fix il lève #310, après il transitionne.
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// IMPORTANT : le vrai `useLocation` de wouter CONSOMME un hook React en interne
// (souscription à la location). C'est précisément ce hook que `useBilanSteps`
// ajoute conditionnellement. Le mock doit donc consommer un vrai hook, sinon il
// efface le déclencheur du #310 (faux vert).
vi.mock("wouter", async () => {
  const React = await import("react");
  return {
    useLocation: () => {
      React.useState(0); // mime la consommation de hook du vrai useLocation
      return ["/coach/strength-assessment", () => {}];
    },
    useParams: () => ({}), // pas de :athleteId → démarre sur le sélecteur (selectedAthleteId null)
  };
});

vi.mock("@/lib/auth", () => ({
  useAuth: (selector: (s: { userId: number; role: string }) => unknown) =>
    selector({ userId: 7, role: "coach" }),
}));

vi.mock("@/lib/api", () => ({
  getAthletes: vi.fn(async () => [{ id: 1, display_name: "Alice", avatar_url: null }]),
  getLatestAssessment: vi.fn(async () => null),
  createAssessment: vi.fn(async () => ({ id: "a1" })),
  updateAssessmentPhysicalTests: vi.fn(async () => undefined),
  getLatestKpiMeasurements: vi.fn(async () => ({})),
  getPreviousCompletedPhysicalTests: vi.fn(async () => null),
  getActiveMesocycle: vi.fn(async () => null),
  getProfile: vi.fn(async () => null),
}));

// Stub du sélecteur (Radix Dialog) → un bouton qui sélectionne le nageur 1.
vi.mock("@/components/strength/kpi/KpiSwimmerPicker", () => ({
  KpiSwimmerPicker: ({ onSelect }: { onSelect: (id: number) => void }) => (
    <button data-testid="pick-swimmer" onClick={() => onSelect(1)}>
      pick
    </button>
  ),
}));

import StrengthAssessmentScreen from "@/pages/coach/StrengthAssessmentScreen";

describe("StrengthAssessmentScreen — hooks order (régression #310)", () => {
  it("ne crashe pas en sélectionnant un nageur (null → sélectionné)", async () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <StrengthAssessmentScreen />
      </QueryClientProvider>,
    );

    // Écran sélecteur affiché (aucun nageur).
    const pick = await screen.findByTestId("pick-swimmer");

    // Sélectionner : selectedAthleteId null → 1. Avant le fix, ce re-render
    // exécute `useBilanSteps` (placé sous les return anticipés) → un hook de plus
    // que le rendu précédent → React #310 (throw pendant le render).
    fireEvent.click(pick);

    // Transition propre attendue : le sélecteur disparaît…
    await waitFor(() => {
      expect(screen.queryByTestId("pick-swimmer")).toBeNull();
    });
    // …ET aucune erreur d'ordre des hooks loggée (un crash unmonte aussi le
    // sélecteur → l'assertion ci-dessus seule donnerait un faux vert).
    const hookErr = errSpy.mock.calls
      .flat()
      .map((a) => String(a))
      .find((m) => /Rendered (more|fewer) hooks|order of Hooks|#300|#310/i.test(m));
    errSpy.mockRestore();
    expect(hookErr, `Erreur d'ordre des hooks détectée : ${hookErr}`).toBeUndefined();
  });
});
