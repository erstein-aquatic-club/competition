// §347 — Slice B : historique des bilans + courbe d'évolution mobilité.
//
// Tests légers (la logique lourde est dans le helper pur `mobilityEvolution`,
// couvert par node:test) :
//  (1) la liste rend N lignes pour N bilans ;
//  (2) la ligne d'un bilan noté est dépliable et révèle les scores G/D ;
//  (3) la courbe affiche son état vide avec < 2 points.
import { describe, it, expect, vi, beforeAll } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

import { BilanHistorySection } from "@/components/strength/assessment/BilanHistorySection";
import { MobilityEvolutionChart } from "@/components/strength/assessment/MobilityEvolutionChart";
import type { StrengthAssessment } from "@/lib/api/types";

// recharts s'appuie sur ResizeObserver, absent de jsdom.
beforeAll(() => {
  global.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
});

function makeAssessment(o: Partial<StrengthAssessment>): StrengthAssessment {
  return {
    id: "a",
    athlete_id: 1,
    coach_id: 2,
    status: "completed",
    questionnaire: null,
    physical_tests: null,
    bucket_scores: null,
    data_confidence: "full",
    sessions_per_week: null,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    ...o,
  };
}

describe("BilanHistorySection (§347)", () => {
  it("rend une ligne par bilan", () => {
    const list = [
      makeAssessment({ id: "1", created_at: "2026-03-01T00:00:00.000Z" }),
      makeAssessment({
        id: "2",
        status: "bilan_pending",
        created_at: "2026-02-01T00:00:00.000Z",
      }),
      makeAssessment({
        id: "3",
        status: "questionnaire_pending",
        created_at: "2026-01-01T00:00:00.000Z",
      }),
    ];
    render(<BilanHistorySection assessments={list} />);
    // Un badge de statut par ligne.
    expect(screen.getByText("Complété")).toBeTruthy();
    expect(screen.getByText("À noter")).toBeTruthy();
    expect(screen.getByText("Questionnaire")).toBeTruthy();
  });

  it("déplie un bilan noté et montre les scores G/D + synthèse", () => {
    const list = [
      makeAssessment({
        id: "scored",
        physical_tests: {
          mobility: {
            shoulder_flexion: { left: 3, right: 1, note: "asymétrie" },
            t_spine: 2,
            hip: 2,
          },
          movement: {
            scapula_control: 2,
            trunk_neck_alignment: 2,
            hip_hinge: 2,
          },
          note: "bon bilan",
          filled_at: "2026-03-01T00:00:00.000Z",
        },
      }),
    ];
    render(<BilanHistorySection assessments={list} />);
    fireEvent.click(screen.getByText("Voir la notation"));
    expect(screen.getByText("G 3")).toBeTruthy();
    expect(screen.getByText("D 1")).toBeTruthy();
    expect(screen.getByText("asymétrie")).toBeTruthy();
    expect(screen.getByText("bon bilan")).toBeTruthy();
  });

  it("appelle onStartNew au clic sur le CTA", () => {
    const onStartNew = vi.fn();
    render(<BilanHistorySection assessments={[]} onStartNew={onStartNew} />);
    fireEvent.click(screen.getByText(/Démarrer un nouveau bilan/i));
    expect(onStartNew).toHaveBeenCalledTimes(1);
  });
});

describe("MobilityEvolutionChart (§347)", () => {
  it("affiche l'état vide avec < 2 points", () => {
    const list = [
      makeAssessment({
        id: "only-one",
        physical_tests: {
          mobility: { shoulder_flexion: 2, t_spine: 2, hip: 2 },
          movement: {
            scapula_control: 2,
            trunk_neck_alignment: 2,
            hip_hinge: 2,
          },
          filled_at: "2026-03-01T00:00:00.000Z",
        },
      }),
    ];
    render(<MobilityEvolutionChart assessments={list} />);
    expect(screen.getByText(/Pas assez de données/i)).toBeTruthy();
  });
});
