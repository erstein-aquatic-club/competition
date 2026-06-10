// Tests UI (vitest jsdom) de CompetitionDetail.
//
// Comportement clé à protéger :
//  - isLoading → skeleton affiché (PageSkeleton), jamais « introuvable »
//  - fetch réussi + id absent → « Compétition introuvable »
//  - fetch réussi + id présent → titre de la compétition affiché
//  - isError → message d'erreur + bouton Réessayer
import { describe, it, expect, vi } from "vitest";
import React from "react";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// ── Mocks (hoistés par vitest avant les imports) ───────────────────────────────

vi.mock("wouter", () => ({
  useRoute: () => [true, { id: "comp-1" }],
  useLocation: () => ["/competition/comp-1", vi.fn()],
}));

vi.mock("@/lib/auth", () => ({
  useAuth: (selector: (s: { userId: string | null; role: string; authUid: string | null }) => unknown) =>
    selector({ userId: "user-1", role: "athlete", authUid: "auth-1" }),
}));

vi.mock("@/components/competition/InfoMyObjectives", () => ({
  default: () => <div data-testid="info-my-objectives" />,
}));
vi.mock("@/components/competition/InfoParticipants", () => ({
  default: () => <div data-testid="info-participants" />,
}));

vi.mock("@/lib/api", () => ({
  getCompetitions: vi.fn(async () => []),
}));

// ── Imports après les vi.mock (hoisting garantit que les mocks sont actifs) ────

import CompetitionDetail from "@/pages/CompetitionDetail";
import { getCompetitions } from "@/lib/api";

// ── Helpers ────────────────────────────────────────────────────────────────────

function makeClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
}

function Wrapper({ client }: { client: QueryClient }) {
  return (
    <QueryClientProvider client={client}>
      <CompetitionDetail />
    </QueryClientProvider>
  );
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe("CompetitionDetail — états de chargement et d'erreur", () => {
  it("affiche un skeleton (pas « introuvable ») pendant le chargement initial", async () => {
    // getCompetitions ne résout jamais → isLoading reste true.
    vi.mocked(getCompetitions).mockReturnValueOnce(new Promise(() => {}));

    const client = makeClient();
    const { container } = render(<Wrapper client={client} />);

    // PageSkeleton rend un div avec animate-pulse.
    expect(container.querySelector(".animate-pulse")).not.toBeNull();
    // « introuvable » ne doit PAS apparaître pendant le chargement.
    expect(screen.queryByText(/introuvable/i)).toBeNull();
  });

  it("affiche « introuvable » uniquement après un fetch réussi sans correspondance", async () => {
    // Fetch réussi mais liste vide → id « comp-1 » absent.
    vi.mocked(getCompetitions).mockResolvedValueOnce([]);

    const client = makeClient();
    render(<Wrapper client={client} />);

    await screen.findByText(/introuvable/i);
  });

  it("affiche le titre quand la compétition est trouvée", async () => {
    vi.mocked(getCompetitions).mockResolvedValueOnce([
      {
        id: "comp-1",
        name: "Championnats de Région",
        date: "2026-09-15",
        end_date: null,
        location: "Strasbourg",
        description: null,
        status: "upcoming",
        competition_type: null,
        pool_size: null,
        group_id: null,
      } as any,
    ]);

    const client = makeClient();
    render(<Wrapper client={client} />);

    await screen.findByText("Championnats de Région");
    expect(screen.queryByText(/introuvable/i)).toBeNull();
  });

  it("affiche un message d'erreur + bouton Réessayer quand le fetch échoue", async () => {
    vi.mocked(getCompetitions).mockRejectedValueOnce(new Error("network error"));

    const client = makeClient();
    render(<Wrapper client={client} />);

    await screen.findByText(/impossible de charger/i);
    expect(screen.getByRole("button", { name: /réessayer/i })).toBeDefined();
    expect(screen.queryByText(/introuvable/i)).toBeNull();
  });
});
