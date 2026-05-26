// Régression React #310 (§325) — après avoir confirmé une planification muscu,
// l'app navigue vers /coach/swimmer/:id et crashait avec « Rendered more hooks
// than during the previous render ». Cause : `useMemo(breadcrumbSegments)` était
// placé APRÈS le `return` anticipé `if (!athleteId) return …`. Quand `athleteId`
// passe de falsy → truthy entre deux rendus (cas exact de la navigation post-
// apply), ce useMemo s'exécute pour la 1re fois → un hook de plus que le rendu
// précédent → React #310. Ce test rend la vue sans nageur (early return), puis
// avec un nageur : avant le fix il lève #310, après il transitionne proprement.
//
// Astuce : le 2ᵉ rendu (athleteId truthy) throw AU useMemo, donc AVANT le sous-
// arbre complet (onglets/graphes) — inutile de mocker les composants enfants.
import { describe, it, expect, vi } from "vitest";
import React from "react";
import { render } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// Isole l'erreur testée (#310, levée DANS le composant) d'un éventuel throw du
// sous-arbre quand athleteId=truthy rend l'arbre complet avant résolution des
// queries (artefact de harness, p.ex. `.length` sur données async undefined).
// Le contrat du test = « aucune violation d'ordre des hooks », vérifié via le
// spy console.error ci-dessous, pas via l'absence totale d'erreur.
class Boundary extends React.Component<
  { children: React.ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

vi.mock("wouter", () => ({
  useRoute: () => [false, undefined], // pas de match → athleteId vient des props
  useLocation: () => ["/coach/swimmer/1", () => {}],
}));

vi.mock("@/lib/auth", () => ({
  useAuth: () => ({ selectedAthleteId: null, selectedAthleteName: null }),
}));

vi.mock("@/lib/api", () => ({
  getProfile: vi.fn(async () => null),
  getSessions: vi.fn(async () => []),
  getInterviews: vi.fn(async () => []),
  getTrainingCycles: vi.fn(async () => []),
  getObjectives: vi.fn(async () => []),
  getCompetitions: vi.fn(async () => []),
  getLatestAssessment: vi.fn(async () => null),
  getLatestKpiMeasurements: vi.fn(async () => ({})),
  getActiveMesocycle: vi.fn(async () => null),
}));

vi.mock("@/lib/supabase", () => ({
  supabase: { rpc: vi.fn(async () => ({ data: null, error: null })) },
}));

vi.mock("@/hooks/useSwimAnalytics", () => ({
  useSwimAnalytics: () => ({}),
}));

import CoachSwimmerFullView from "@/pages/coach/CoachSwimmerFullView";

describe("CoachSwimmerFullView — hooks order (régression #310)", () => {
  it("ne crashe pas quand athleteId passe de null → défini", () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    const { rerender } = render(
      <QueryClientProvider client={qc}>
        <Boundary>
          <CoachSwimmerFullView athleteId={null} />
        </Boundary>
      </QueryClientProvider>,
    );

    // Bascule null → 1 : avant le fix, `useMemo(breadcrumbSegments)` (placé sous
    // le return anticipé) s'exécute pour la 1re fois → un hook de plus → #310.
    rerender(
      <QueryClientProvider client={qc}>
        <Boundary>
          <CoachSwimmerFullView athleteId={1} />
        </Boundary>
      </QueryClientProvider>,
    );

    const hookErr = errSpy.mock.calls
      .flat()
      .map((a) => String(a))
      .find((m) => /Rendered (more|fewer) hooks|order of Hooks|#300|#310/i.test(m));
    errSpy.mockRestore();
    expect(hookErr, `Erreur d'ordre des hooks détectée : ${hookErr}`).toBeUndefined();
  });
});
