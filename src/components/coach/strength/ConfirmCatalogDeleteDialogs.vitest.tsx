// §394 (audit muscu 2ᵉ passe, R3/O1) — confirmations de suppression du catalogue.
// R3 : un exercice utilisé ne se supprime pas (cascade sur séries + 1RM de tous
// les nageurs) → on propose l'archivage. O1 : une séance se supprime, mais on
// annonce les créneaux/plans qu'elle vide.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const getExerciseUsage = vi.fn();
const getStrengthSessionUsage = vi.fn();
vi.mock("@/lib/api", () => ({
  getExerciseUsage: (...a: unknown[]) => getExerciseUsage(...a),
  getStrengthSessionUsage: (...a: unknown[]) => getStrengthSessionUsage(...a),
}));

import {
  ConfirmExerciseDeleteDialog,
  ConfirmSessionDeleteDialog,
} from "@/components/coach/strength/ConfirmCatalogDeleteDialogs";

function withQc(ui: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

const EX = { id: 12, nom_exercice: "Tractions lestées" };
const NONE = { sessions: 0, setLogs: 0, oneRms: 0, warmups: 0 };

describe("ConfirmExerciseDeleteDialog", () => {
  beforeEach(() => {
    getExerciseUsage.mockReset();
  });

  it("exercice utilisé → pas de suppression, archivage proposé avec les chiffres", async () => {
    getExerciseUsage.mockResolvedValue({ sessions: 3, setLogs: 120, oneRms: 4, warmups: 0 });
    const onDelete = vi.fn();
    const onArchive = vi.fn();
    withQc(
      <ConfirmExerciseDeleteDialog exercise={EX} onOpenChange={() => {}} onDelete={onDelete} onArchive={onArchive} />,
    );
    expect(await screen.findByText(/3 séances, 120 séries enregistrées et 4 1RM/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /^Supprimer/ })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Archiver l'exercice" }));
    expect(onArchive).toHaveBeenCalledWith(12);
    expect(onDelete).not.toHaveBeenCalled();
  });

  it("exercice jamais utilisé → suppression définitive possible", async () => {
    getExerciseUsage.mockResolvedValue(NONE);
    const onDelete = vi.fn();
    withQc(
      <ConfirmExerciseDeleteDialog exercise={EX} onOpenChange={() => {}} onDelete={onDelete} onArchive={vi.fn()} />,
    );
    fireEvent.click(await screen.findByRole("button", { name: "Supprimer l'exercice" }));
    expect(onDelete).toHaveBeenCalledWith(12);
  });

  it("usages inconnus (chargement / échec) → aucune action destructrice", async () => {
    getExerciseUsage.mockRejectedValue(new Error("Failed to fetch"));
    const onDelete = vi.fn();
    withQc(
      <ConfirmExerciseDeleteDialog exercise={EX} onOpenChange={() => {}} onDelete={onDelete} onArchive={vi.fn()} />,
    );
    expect(screen.queryByRole("button", { name: "Supprimer l'exercice" })).toBeNull();
    expect(await screen.findByText(/Impossible de vérifier/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Supprimer l'exercice" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Archiver l'exercice" })).toBeNull();
    expect(screen.getByRole("button", { name: /Réessayer/ })).toBeTruthy();
  });
});

describe("ConfirmSessionDeleteDialog", () => {
  beforeEach(() => {
    getStrengthSessionUsage.mockReset();
  });

  it("annonce les créneaux et plans vidés", async () => {
    getStrengthSessionUsage.mockResolvedValue({ planningSlots: 5, planSessions: 1 });
    const onDelete = vi.fn();
    withQc(
      <ConfirmSessionDeleteDialog session={{ id: 8, title: "Force A" }} onOpenChange={() => {}} onDelete={onDelete} />,
    );
    expect(await screen.findByText(/5 créneaux de planification et 1 plan d'entraînement/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Supprimer la séance" }));
    expect(onDelete).toHaveBeenCalledWith(8);
  });

  it("usages inconnus → suppression désactivée", async () => {
    getStrengthSessionUsage.mockRejectedValue(new Error("Failed to fetch"));
    withQc(
      <ConfirmSessionDeleteDialog session={{ id: 8, title: "Force A" }} onOpenChange={() => {}} onDelete={vi.fn()} />,
    );
    expect(await screen.findByText(/Impossible de vérifier/)).toBeTruthy();
    expect((screen.getByRole("button", { name: "Supprimer la séance" }) as HTMLButtonElement).disabled).toBe(true);
  });
});
