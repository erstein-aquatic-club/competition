// §394 (R3) — un exercice archivé n'est plus proposé dans le sélecteur
// d'échange d'exercice (il reste lisible dans l'historique).
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("@/hooks/useOnlineStatus", () => ({ useOnlineStatus: () => true }));

import { ExercisePicker } from "@/components/strength/ExercisePicker";
import type { Exercise } from "@/lib/api";

const ex = (id: number, nom: string, archived_at: string | null = null) =>
  ({ id, nom_exercice: nom, exercise_type: "strength", archived_at }) as Exercise;

describe("ExercisePicker", () => {
  it("masque les exercices archivés", () => {
    render(
      <ExercisePicker
        open
        onOpenChange={() => {}}
        onSelect={() => {}}
        exercises={[ex(1, "Tractions lestées"), ex(2, "Rowing ancien", "2026-11-15T10:00:00Z")]}
      />,
    );
    expect(screen.getByText("Tractions lestées")).toBeTruthy();
    expect(screen.queryByText("Rowing ancien")).toBeNull();
  });
});
