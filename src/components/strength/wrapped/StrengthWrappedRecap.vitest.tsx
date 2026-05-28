// Test du MOTEUR de stories StrengthWrappedRecap (Task 7) — on mocke le HOOK
// `useStrengthWrapped` (pas l'API) pour rester unitaire et déterministe.
//
// Couvre : (1) nb de barres == slides.length ; (2) tap droite avance ; (3) tap au-delà
// de la dernière slide → onClose ; (4) clic croix → onClose.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

const SLIDES = [
  { kind: "cover" },
  { kind: "objective" },
  { kind: "volume" },
  { kind: "outro" },
] as const;

const MOCK_DATA = {
  objective: { title: "Préparation sprint", focusLabel: null, weeks: 8, sessionsPerWeek: 3 },
  forces: [],
  potentialAxis: null,
  progressions: [],
  volume: {
    totalTonnageKg: 700,
    totalSets: 40,
    totalReps: 200,
    sessions: 12,
    topExerciseName: "Tractions",
  },
};

vi.mock("@/hooks/useStrengthWrapped", () => ({
  useStrengthWrapped: () => ({
    enabled: true,
    isLoading: false,
    athleteName: "Test",
    slides: SLIDES,
    data: MOCK_DATA,
  }),
}));

import { StrengthWrappedRecap } from "@/components/strength/wrapped/StrengthWrappedRecap";

/** Stub matchMedia (jsdom n'en fournit pas) → prefers-reduced-motion false. */
beforeEach(() => {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })) as unknown as typeof window.matchMedia;
});

function tapRight() {
  // La zone interactive plein écran : on tape à droite (clientX > moitié largeur).
  const zone = document.querySelector(".touch-none") as HTMLElement;
  expect(zone).toBeTruthy();
  Object.defineProperty(zone, "clientWidth", { value: 400, configurable: true });
  fireEvent.pointerDown(zone, { clientX: 350, clientY: 300 });
  fireEvent.pointerUp(zone, { clientX: 350, clientY: 300 });
}

describe("StrengthWrappedRecap — moteur de stories", () => {
  it("rend autant de barres de progression que de slides", () => {
    render(
      <StrengthWrappedRecap athleteId={1} open onClose={() => {}} viewerContext="self" />,
    );
    expect(screen.getAllByTestId("wrapped-progress-segment")).toHaveLength(SLIDES.length);
  });

  it("rend null si open=false", () => {
    const { container } = render(
      <StrengthWrappedRecap athleteId={1} open={false} onClose={() => {}} viewerContext="self" />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("un tap à droite avance à la slide suivante", () => {
    render(
      <StrengthWrappedRecap athleteId={1} open onClose={() => {}} viewerContext="self" />,
    );
    // Slide 0 = cover → titre "Ton récap muscu".
    expect(screen.getByText("Ton récap muscu")).toBeTruthy();
    tapRight();
    // Slide 1 = objective → titre du plan.
    expect(screen.getByText("Préparation sprint")).toBeTruthy();
  });

  it("dépasser la dernière slide appelle onClose", () => {
    const onClose = vi.fn();
    render(
      <StrengthWrappedRecap athleteId={1} open onClose={onClose} viewerContext="self" />,
    );
    // 4 slides (index 0..3) : il faut 4 taps droite pour dépasser la dernière.
    tapRight(); // → 1
    tapRight(); // → 2
    tapRight(); // → 3 (dernière)
    expect(onClose).not.toHaveBeenCalled();
    tapRight(); // dépasse → onClose
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("clic sur la croix appelle onClose", () => {
    const onClose = vi.fn();
    render(
      <StrengthWrappedRecap athleteId={1} open onClose={onClose} viewerContext="self" />,
    );
    fireEvent.click(screen.getByLabelText("Fermer le récap"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
