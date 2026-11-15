// §395 (audit muscu 2ᵉ passe, O4) — retirer un plan d'un nageur/groupe se
// faisait en UN tap, sans confirmation, avec un bouton invisible au toucher
// (`opacity-0 group-hover`).
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const deleteApp = vi.fn();
vi.mock("@/lib/api", () => ({
  getTrainingPlanApplications: async () => [
    { id: 41, plan_id: 3, target_user_id: 7, target_group_id: null, start_date: "2026-11-16", end_date: null },
  ],
  getAthletes: async () => [{ id: 7, display_name: "Victoria" }],
  getGroups: async () => [],
  deleteTrainingPlanApplication: (id: number) => deleteApp(id),
}));
vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }) }));

import { PlanApplicationsList } from "@/components/coach/strength/TrainingPlansBrowser";

function renderList() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <PlanApplicationsList planId={3} planNumWeeks={6} />
    </QueryClientProvider>,
  );
}

describe("PlanApplicationsList — retrait d'une application", () => {
  beforeEach(() => {
    deleteApp.mockReset();
    deleteApp.mockResolvedValue(undefined);
  });

  it("le bouton est visible sans survol", async () => {
    renderList();
    const btn = await screen.findByRole("button", { name: /Retirer le plan de Victoria/ });
    expect(btn.className).not.toMatch(/(^|\s)opacity-0(\s|$)/);
  });

  it("demande confirmation avant de retirer", async () => {
    renderList();
    fireEvent.click(await screen.findByRole("button", { name: /Retirer le plan de Victoria/ }));
    expect(deleteApp).not.toHaveBeenCalled();
    expect(await screen.findByText(/Retirer le plan de Victoria \?/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Retirer le plan" }));
    await waitFor(() => expect(deleteApp).toHaveBeenCalledWith(41));
  });

  it("Annuler ne retire rien", async () => {
    renderList();
    fireEvent.click(await screen.findByRole("button", { name: /Retirer le plan de Victoria/ }));
    fireEvent.click(await screen.findByRole("button", { name: "Annuler" }));
    expect(deleteApp).not.toHaveBeenCalled();
  });
});
