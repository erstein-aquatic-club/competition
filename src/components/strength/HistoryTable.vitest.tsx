// §396 (audit muscu 2ᵉ passe, O5) — « Aucun historique » s'affichait pendant le
// chargement ET en cas d'échec réseau : le nageur croyait avoir perdu ses séances.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const getStrengthHistory = vi.fn();
vi.mock("@/lib/api", () => ({
  getStrengthHistory: (...a: unknown[]) => getStrengthHistory(...a),
  getExercises: async () => [],
}));

import { HistoryTable } from "@/components/strength/HistoryTable";

const EMPTY = { runs: [], pagination: { offset: 0, limit: 10, total: 0 } };

function renderTable() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <HistoryTable athleteName="Victoria" athleteId={7} athleteKey={7} />
    </QueryClientProvider>,
  );
}

describe("HistoryTable — états chargement / erreur / vide", () => {
  beforeEach(() => {
    getStrengthHistory.mockReset();
  });

  it("pendant le chargement : pas de « Aucun historique »", () => {
    getStrengthHistory.mockReturnValue(new Promise(() => {}));
    renderTable();
    expect(screen.queryByText("Aucun historique")).toBeNull();
    expect(screen.getByLabelText("Chargement de l'historique")).toBeTruthy();
  });

  it("échec réseau : message d'erreur + Réessayer, pas d'état vide", async () => {
    getStrengthHistory.mockRejectedValueOnce(new Error("Failed to fetch"));
    renderTable();
    expect(await screen.findByText("Historique indisponible")).toBeTruthy();
    expect(screen.queryByText("Aucun historique")).toBeNull();

    getStrengthHistory.mockResolvedValueOnce(EMPTY);
    fireEvent.click(screen.getByRole("button", { name: /Réessayer/ }));
    expect(await screen.findByText("Aucun historique")).toBeTruthy();
  });

  it("réponse vide confirmée → « Aucun historique »", async () => {
    getStrengthHistory.mockResolvedValue(EMPTY);
    renderTable();
    expect(await screen.findByText("Aucun historique")).toBeTruthy();
  });
});
