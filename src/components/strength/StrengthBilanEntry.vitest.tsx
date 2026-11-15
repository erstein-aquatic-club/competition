// §394 (audit muscu 2ᵉ passe, R1) — la tuile « Démarrer mon bilan » ne doit
// JAMAIS être tapable tant que l'état du dernier bilan n'est pas connu : sinon un
// chargement lent ou un échec réseau laisse créer un 2ᵉ bilan par-dessus celui
// en cours (aucun index unique côté base).
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const getLatestAssessment = vi.fn();
const createAssessment = vi.fn();
vi.mock("@/lib/api", () => ({
  getLatestAssessment: (...a: unknown[]) => getLatestAssessment(...a),
  createAssessment: (...a: unknown[]) => createAssessment(...a),
}));
vi.mock("wouter", () => ({ useLocation: () => ["/strength", vi.fn()] }));
vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }) }));

import { StartBilanEntry } from "@/components/strength/StrengthBilanEntry";

function renderEntry() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <StartBilanEntry userId={7} />
    </QueryClientProvider>,
  );
}

describe("StartBilanEntry", () => {
  beforeEach(() => {
    getLatestAssessment.mockReset();
    createAssessment.mockReset();
  });

  it("n'affiche pas le CTA pendant le chargement du dernier bilan", () => {
    getLatestAssessment.mockReturnValue(new Promise(() => {}));
    renderEntry();
    expect(screen.queryByText("Démarrer mon bilan muscu")).toBeNull();
  });

  // La relance est portée par `MesocycleEntry` (même clé de cache, tuile
  // « Mésocycle indisponible · Réessayer » juste en dessous) : pas de doublon ici.
  it("échec réseau → aucun CTA de création", async () => {
    getLatestAssessment.mockRejectedValue(new Error("Failed to fetch"));
    renderEntry();
    await waitFor(() => expect(getLatestAssessment).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 0));
    expect(screen.queryByText("Démarrer mon bilan muscu")).toBeNull();
    expect(createAssessment).not.toHaveBeenCalled();
  });

  it("aucun bilan (réponse confirmée) → CTA affiché", async () => {
    getLatestAssessment.mockResolvedValue(null);
    renderEntry();
    await screen.findByText("Démarrer mon bilan muscu");
  });

  it("bilan en cours → rien à amorcer", async () => {
    getLatestAssessment.mockResolvedValue({ id: "a", status: "bilan_pending" });
    renderEntry();
    await waitFor(() => expect(getLatestAssessment).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 0));
    expect(screen.queryByText("Démarrer mon bilan muscu")).toBeNull();
  });
});
