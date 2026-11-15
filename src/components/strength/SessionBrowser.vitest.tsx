// §396 (audit muscu 2ᵉ passe, O8) — assignations, catalogue ou « séance en
// cours » en échec donnaient une liste vide SANS message (et faisaient
// disparaître la carte « Reprendre » d'une séance commencée).
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const { api } = vi.hoisted(() => {
  const fail = (): Promise<unknown> => Promise.reject(new Error("Failed to fetch"));
  return {
    api: {
      getAssignments: vi.fn(fail),
      getStrengthSessions: vi.fn(fail),
      getExercises: vi.fn(async (): Promise<unknown> => []),
      getStrengthHistory: vi.fn(fail),
      getStrengthFolders: vi.fn(async (): Promise<unknown> => []),
    },
  };
});
vi.mock("@/lib/api", () => api);
vi.mock("@/components/strength/TeamPlansSection", () => ({ TeamPlansSection: () => null }));
vi.mock("@/components/strength/InProgressCard", () => ({ InProgressCard: () => null }));

import { SessionBrowser } from "@/components/strength/SessionBrowser";

function renderBrowser() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <SessionBrowser
        user="Victoria"
        userId={7}
        athleteName="Victoria"
        athleteId={7}
        athleteKey={7}
        cycleType="force"
        searchQuery=""
        isLoading={false}
        setSaveState={vi.fn()}
        onCycleChange={vi.fn()}
        onSearchChange={vi.fn()}
        onStartAssignment={vi.fn()}
        onStartCatalog={vi.fn()}
        onStartPlanSession={vi.fn()}
        onResumeInProgress={vi.fn()}
      />
    </QueryClientProvider>,
  );
}

describe("SessionBrowser — échecs de chargement", () => {
  beforeEach(() => {
    api.getAssignments.mockClear();
    api.getStrengthSessions.mockClear();
    api.getStrengthHistory.mockClear();
  });

  it("affiche « Séances indisponibles » + Réessayer qui relance les requêtes en échec", async () => {
    renderBrowser();
    expect(await screen.findByText("Séances indisponibles")).toBeTruthy();
    const before = api.getStrengthSessions.mock.calls.length;
    fireEvent.click(screen.getByRole("button", { name: /Réessayer/ }));
    await vi.waitFor(() => expect(api.getStrengthSessions.mock.calls.length).toBeGreaterThan(before));
  });
});
