// Tests vitest jsdom de l'éditeur de routines d'échauffement (§354).
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const setCommon = vi.fn(async (_ids: number[]) => {});
const setActivation = vi.fn(async (_bucket: string, _ids: number[]) => {});

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

vi.mock("@/lib/api", () => ({
  getCommonWarmupRoutine: vi.fn(async () => [97, 87]),
  getActivationRoutine: vi.fn(async () => ({})),
  listCatalogExercisesTagged: vi.fn(async () => [
    { id: 97, nomExercice: "Mise en route" },
    { id: 87, nomExercice: "Cat-Cow" },
    { id: 50, nomExercice: "Rotation externe épaule" },
  ]),
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
});
