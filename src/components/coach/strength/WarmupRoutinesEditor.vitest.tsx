// Tests vitest jsdom de l'éditeur de routines d'échauffement (§354).
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const setCommon = vi.fn(async (_ids: number[]) => {});
const setActivation = vi.fn(async (_bucket: string, _ids: number[]) => {});

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const CATALOG = [
  { id: 97, nomExercice: "Mise en route" },
  { id: 87, nomExercice: "Cat-Cow" },
  { id: 50, nomExercice: "Rotation externe épaule" },
];
const getCommon = vi.fn(async (): Promise<number[]> => [97, 87]);
const getActivation = vi.fn(async (): Promise<Record<string, number[]>> => ({}));
const listCatalog = vi.fn(async () => CATALOG);

vi.mock("@/lib/api", () => ({
  getCommonWarmupRoutine: () => getCommon(),
  getActivationRoutine: () => getActivation(),
  listCatalogExercisesTagged: () => listCatalog(),
  setCommonWarmupRoutine: (ids: number[]) => setCommon(ids),
  setActivationRoutine: (bucket: string, ids: number[]) => setActivation(bucket, ids),
}));

import { WarmupRoutinesEditor } from "@/components/coach/strength/WarmupRoutinesEditor";

function renderEditor() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <WarmupRoutinesEditor />
    </QueryClientProvider>,
  );
}

describe("WarmupRoutinesEditor — §354", () => {
  beforeEach(() => {
    setCommon.mockClear();
    setActivation.mockClear();
    getCommon.mockReset().mockResolvedValue([97, 87]);
    getActivation.mockReset().mockResolvedValue({});
    listCatalog.mockReset().mockResolvedValue(CATALOG);
  });

  it("résout les noms + réordonne + enregistre la liste à jour", async () => {
    renderEditor();
    // Chargement : les exos de la routine commune apparaissent (noms résolus).
    expect(await screen.findByText("Mise en route")).toBeTruthy();
    expect(screen.getByText("Cat-Cow")).toBeTruthy();

    // Les 4 seaux d'activation sont vides → seuls les items de la commune ont ↑↓.
    // Descendre le 1er item (Mise en route) → ordre [87, 97].
    fireEvent.click(screen.getAllByLabelText("Descendre")[0]);

    // Le bouton « Enregistrer » de la commune devient actif (dirty) → cliquer.
    const saveBtns = screen.getAllByRole("button", { name: "Enregistrer" });
    const enabled = saveBtns.find((b) => !(b as HTMLButtonElement).disabled)!;
    fireEvent.click(enabled);

    await waitFor(() => expect(setCommon).toHaveBeenCalledWith([87, 97]));
  });

  it("retirer enlève un exercice de la liste locale", async () => {
    renderEditor();
    expect(await screen.findByText("Mise en route")).toBeTruthy();
    // Retirer le 1er item.
    fireEvent.click(screen.getAllByLabelText("Retirer")[0]);
    expect(screen.queryByText("Mise en route")).toBeNull();
    // Enregistrer → la liste ne contient plus que [87].
    const enabled = screen.getAllByRole("button", { name: "Enregistrer" }).find((b) => !(b as HTMLButtonElement).disabled)!;
    fireEvent.click(enabled);
    await waitFor(() => expect(setCommon).toHaveBeenCalledWith([87]));
  });

  // §394 (R2) — un échec de chargement s'affichait « Aucun exercice » ; ajouter
  // un exo puis Enregistrer REMPLAÇAIT toute la routine (RPC delete+insert).
  it.each([
    ["la routine commune", () => getCommon.mockRejectedValue(new Error("Failed to fetch"))],
    ["l'activation", () => getActivation.mockRejectedValue(new Error("Failed to fetch"))],
    ["le catalogue", () => listCatalog.mockRejectedValue(new Error("Failed to fetch"))],
  ])("échec de chargement de %s → aucun éditeur, Réessayer", async (_label, fail) => {
    fail();
    renderEditor();
    expect(await screen.findByText("Routines indisponibles")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Enregistrer" })).toBeNull();
    expect(screen.queryByText("Aucun exercice.")).toBeNull();

    getCommon.mockResolvedValue([97, 87]);
    getActivation.mockResolvedValue({});
    listCatalog.mockResolvedValue(CATALOG);
    fireEvent.click(screen.getByRole("button", { name: /Réessayer/ }));
    expect(await screen.findByText("Mise en route")).toBeTruthy();
    expect(setCommon).not.toHaveBeenCalled();
  });
});
