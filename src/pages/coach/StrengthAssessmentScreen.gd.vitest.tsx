// §346 — saisie bilan mobilité Gauche/Droite + notes.
//
// (1) Test unitaire pur du builder de payload (`buildPhysicalTestsPayload`) :
//     axe G/D → { left, right, note }, axe unique (trunk_neck_alignment) →
//     { left:n, right:n }, note de synthèse → racine `note`.
// (2) Test composant : pilote le vrai formulaire (statut bilan_pending),
//     règle l'épaule à Gauche=3 / Droite=0 + une note, note tous les autres
//     axes, envoie, et vérifie le payload passé à
//     `updateAssessmentPhysicalTests`.
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import {
  buildPhysicalTestsPayload,
  emptyScores,
} from "@/pages/coach/strengthAssessmentPayload";

// ── (1) Builder pur ──────────────────────────────────────────────────────────
describe("buildPhysicalTestsPayload (§346)", () => {
  it("axe G/D → {left,right,note} ; trunk_neck_alignment → {left:n,right:n} ; note de synthèse → racine", () => {
    const st = emptyScores();
    st.axes.shoulder_flexion = { left: 3, right: 0, note: "  épaule G ok  " };
    st.axes.t_spine = { left: 2, right: 2, note: "" };
    st.axes.hip = { left: 1, right: 1, note: "" };
    st.axes.scapula_control = { left: 2, right: 3, note: "" };
    st.axes.trunk_neck_alignment = { left: 2, right: -1, note: "  " };
    st.axes.hip_hinge = { left: 1, right: 1, note: "" };
    st.note = "  synthèse globale  ";

    const out = buildPhysicalTestsPayload(st, "2026-05-30T00:00:00.000Z");

    expect(out.mobility.shoulder_flexion).toEqual({
      left: 3,
      right: 0,
      note: "épaule G ok",
    });
    // axe unique : right miroir de left, note vide → undefined
    expect(out.movement.trunk_neck_alignment).toEqual({
      left: 2,
      right: 2,
      note: undefined,
    });
    // note vide (whitespace) → undefined
    expect(out.mobility.t_spine).toEqual({ left: 2, right: 2, note: undefined });
    expect(out.note).toBe("synthèse globale");
    expect(out.filled_at).toBe("2026-05-30T00:00:00.000Z");
  });
});

// ── (2) Drive du formulaire ──────────────────────────────────────────────────
vi.mock("wouter", async () => {
  const React = await import("react");
  return {
    useLocation: () => {
      React.useState(0);
      return ["/coach/strength-assessment/1", () => {}];
    },
    useParams: () => ({ athleteId: "1" }), // cible pré-sélectionnée → écran de scoring
  };
});

vi.mock("@/lib/auth", () => ({
  useAuth: (selector: (s: { userId: number; role: string }) => unknown) =>
    selector({ userId: 7, role: "coach" }),
}));

const updateSpy = vi.fn(
  async (..._args: unknown[]): Promise<void> => undefined,
);
vi.mock("@/lib/api", () => ({
  getAthletes: vi.fn(async () => [{ id: 1, display_name: "Alice", avatar_url: null }]),
  getLatestAssessment: vi.fn(async () => ({
    id: "a1",
    athlete_id: 1,
    coach_id: 7,
    status: "bilan_pending",
    questionnaire: null,
    physical_tests: null,
    bucket_scores: null,
    data_confidence: "high",
  })),
  createAssessment: vi.fn(async () => ({ id: "a1" })),
  listAssessments: vi.fn(async () => []),
  updateAssessmentPhysicalTests: (...args: unknown[]) => updateSpy(...args),
  getLatestKpiMeasurements: vi.fn(async () => ({})),
  getPreviousCompletedPhysicalTests: vi.fn(async () => null),
  getActiveMesocycle: vi.fn(async () => null),
  getProfile: vi.fn(async () => ({ sex: "M", birthdate: "2000-01-01" })),
}));

// offlineQueue : on exécute directement la mutation, pas de file.
vi.mock("@/lib/offlineQueue", () => ({
  tryWithOfflineQueue: async (
    _key: string,
    _payload: unknown,
    run: () => Promise<unknown>,
  ) => run(),
  isOfflineQueuedResult: () => false,
}));

import StrengthAssessmentScreen from "@/pages/coach/StrengthAssessmentScreen";

describe("StrengthAssessmentScreen — saisie G/D (§346)", () => {
  it("règle épaule G=3/D=0 + note, note les autres axes, envoie le payload v2", async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <StrengthAssessmentScreen />
      </QueryClientProvider>,
    );

    // Le formulaire de scoring apparaît (titre « Bilan physique » + bouton).
    await screen.findByRole("button", { name: /Enregistrer le bilan/i });

    // Helper : clique le pilule `n` du sélecteur labellé `label` (ScaleField
    // pose aria-label "<label> : <n>").
    const setScale = (label: string, n: number) => {
      const btn = screen.getByLabelText(`${label} : ${n}`);
      fireEvent.click(btn);
    };

    // Épaule : Gauche=3, Droite=0.
    setScale("Flexion d'épaule — Gauche", 3);
    setScale("Flexion d'épaule — Droite", 0);

    // Note de l'épaule : déplier le champ note puis saisir.
    const noteToggle = screen.getByRole("button", {
      name: /Ajouter une note.*Flexion d'épaule/i,
    });
    fireEvent.click(noteToggle);
    const noteInput = (await screen.findByLabelText(
      /Note.*Flexion d'épaule/i,
    )) as HTMLTextAreaElement;
    fireEvent.change(noteInput, { target: { value: "asymétrie nette" } });

    // Les autres axes bilatéraux : G et D à 2.
    for (const label of [
      "Mobilité thoracique",
      "Mobilité de hanche",
      "Contrôle scapulaire",
      "Charnière de hanche",
    ]) {
      setScale(`${label} — Gauche`, 2);
      setScale(`${label} — Droite`, 2);
    }
    // Axe unique : alignement tronc/nuque (un seul sélecteur).
    setScale("Alignement tronc / nuque", 2);

    // Note de synthèse globale.
    const synth = screen.getByLabelText(/Note de synthèse/i) as HTMLTextAreaElement;
    fireEvent.change(synth, { target: { value: "bilan correct" } });

    // Envoyer (le bouton est actif une fois tous les axes notés).
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
    expect(assessmentId).toBe("a1");
    expect(payload.mobility.shoulder_flexion).toEqual({
      left: 3,
      right: 0,
      note: "asymétrie nette",
    });
    // axe unique → left === right
    expect(payload.movement.trunk_neck_alignment).toMatchObject({
      left: 2,
      right: 2,
    });
    expect(payload.note).toBe("bilan correct");
  });
});

// (sanity) emptyScores forme attendue
describe("emptyScores", () => {
  it("a un axe par clé + note vide", () => {
    const st = emptyScores();
    expect(st.note).toBe("");
    expect(st.axes.shoulder_flexion).toEqual({ left: -1, right: -1, note: "" });
  });
});
