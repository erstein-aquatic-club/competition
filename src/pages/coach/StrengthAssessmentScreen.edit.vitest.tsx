// §348 — édition coach des scores physiques (G/D) d'un ancien bilan.
//
// Drive du formulaire en mode édition : depuis l'historique, le coach ouvre un
// bilan COMPLÉTÉ ancien via « Éditer », le formulaire se préremplit avec ses
// scores, le coach modifie l'épaule Droite à 0, enregistre — et le payload est
// poussé sur l'ID de l'ANCIEN bilan (pas sur le dernier).
import { describe, it, expect, vi, beforeAll } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// recharts s'appuie sur ResizeObserver, absent de jsdom (la section historique
// peut monter la courbe d'évolution).
beforeAll(() => {
  global.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
});

vi.mock("wouter", async () => {
  const React = await import("react");
  return {
    useLocation: () => {
      React.useState(0);
      return ["/coach/strength-assessment/1", () => {}];
    },
    useParams: () => ({ athleteId: "1" }),
  };
});

vi.mock("@/lib/auth", () => ({
  useAuth: (selector: (s: { userId: number; role: string }) => unknown) =>
    selector({ userId: 7, role: "coach" }),
}));

// Un ancien bilan complété, noté en v2, avec tous les axes remplis.
const OLD_BILAN = {
  id: "old-1",
  athlete_id: 1,
  coach_id: 7,
  status: "completed",
  questionnaire: null,
  physical_tests: {
    mobility: {
      shoulder_flexion: { left: 3, right: 3, note: "" },
      t_spine: { left: 2, right: 2, note: "" },
      hip: { left: 2, right: 2, note: "" },
    },
    movement: {
      scapula_control: { left: 2, right: 2, note: "" },
      trunk_neck_alignment: { left: 2, right: 2, note: "" },
      hip_hinge: { left: 2, right: 2, note: "" },
    },
    note: "ancien bilan",
    filled_at: "2026-01-01T00:00:00.000Z",
  },
  bucket_scores: null,
  data_confidence: "high",
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
};

// Le « dernier » bilan résolu par getLatestAssessment : ici, lui aussi complété
// (canStartNew → branche start, qui monte aussi l'historique).
const LATEST_BILAN = {
  ...OLD_BILAN,
  id: "latest-1",
  physical_tests: {
    mobility: {
      shoulder_flexion: { left: 1, right: 1, note: "" },
      t_spine: { left: 1, right: 1, note: "" },
      hip: { left: 1, right: 1, note: "" },
    },
    movement: {
      scapula_control: { left: 1, right: 1, note: "" },
      trunk_neck_alignment: { left: 1, right: 1, note: "" },
      hip_hinge: { left: 1, right: 1, note: "" },
    },
    note: "dernier bilan",
    filled_at: "2026-04-01T00:00:00.000Z",
  },
  created_at: "2026-04-01T00:00:00.000Z",
  updated_at: "2026-04-01T00:00:00.000Z",
};

const updateSpy = vi.fn(
  async (..._args: unknown[]): Promise<void> => undefined,
);
vi.mock("@/lib/api", () => ({
  getAthletes: vi.fn(async () => [
    { id: 1, display_name: "Alice", avatar_url: null },
  ]),
  getLatestAssessment: vi.fn(async () => LATEST_BILAN),
  createAssessment: vi.fn(async () => ({ id: "x" })),
  listAssessments: vi.fn(async () => [LATEST_BILAN, OLD_BILAN]),
  updateAssessmentPhysicalTests: (...args: unknown[]) => updateSpy(...args),
  getLatestKpiMeasurements: vi.fn(async () => ({})),
  getPreviousCompletedPhysicalTests: vi.fn(async () => null),
  getActiveMesocycle: vi.fn(async () => null),
  getProfile: vi.fn(async () => ({ sex: "M", birthdate: "2000-01-01" })),
}));

vi.mock("@/lib/offlineQueue", () => ({
  tryWithOfflineQueue: async (
    _key: string,
    _payload: unknown,
    run: () => Promise<unknown>,
  ) => run(),
  isOfflineQueuedResult: () => false,
}));

import StrengthAssessmentScreen from "@/pages/coach/StrengthAssessmentScreen";

describe("StrengthAssessmentScreen — édition d'un ancien bilan (§348)", () => {
  it("ouvre l'édition d'old-1, préremplit G=3/D=3, met D=0 et enregistre sur old-1", async () => {
    const qc = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    render(
      <QueryClientProvider client={qc}>
        <StrengthAssessmentScreen />
      </QueryClientProvider>,
    );

    // L'historique s'affiche (branche start, le dernier bilan est complété).
    await screen.findByText("Historique des bilans");

    // Trouver la ligne old-1 (1 janv. 2026) et cliquer son « Éditer ».
    const editButtons = await screen.findAllByRole("button", {
      name: /Éditer les scores du bilan/i,
    });
    // Deux bilans notés → deux boutons « Éditer ». On édite le plus ancien
    // (old-1) : sa ligne porte la date "1 janv. 2026".
    const oldRow = screen.getByText("1 janv. 2026").closest(".rounded-xl");
    const oldEdit =
      editButtons.find((b) => oldRow?.contains(b)) ?? editButtons[0];
    fireEvent.click(oldEdit);

    // Le bandeau d'édition apparaît + le formulaire est monté.
    await screen.findByText(/Édition du bilan/i);
    await screen.findByRole("button", { name: /Enregistrer le bilan/i });

    // Préremplissage : l'épaule est à G=3 / D=3 (pilule active aria-pressed).
    const shoulderG3 = screen.getByLabelText("Flexion d'épaule — Gauche : 3");
    expect(shoulderG3.getAttribute("aria-pressed")).toBe("true");
    const shoulderD3 = screen.getByLabelText("Flexion d'épaule — Droite : 3");
    expect(shoulderD3.getAttribute("aria-pressed")).toBe("true");

    // Modifier l'épaule Droite → 0.
    fireEvent.click(screen.getByLabelText("Flexion d'épaule — Droite : 0"));

    // Enregistrer.
    const submit = screen.getByRole("button", {
      name: /Enregistrer le bilan/i,
    }) as HTMLButtonElement;
    await waitFor(() => expect(submit.disabled).toBe(false));
    fireEvent.click(submit);

    await waitFor(() => expect(updateSpy).toHaveBeenCalledTimes(1));
    const [assessmentId, payload] = updateSpy.mock.calls[0] as unknown as [
      string,
      import("@/lib/api/types").StrengthPhysicalTests,
    ];
    // Cible = l'ANCIEN bilan, pas le dernier.
    expect(assessmentId).toBe("old-1");
    expect(payload.mobility.shoulder_flexion).toMatchObject({
      left: 3,
      right: 0,
    });
  });
});
