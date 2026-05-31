// Tests vitest jsdom du marquage d'échauffement dans « Mon plan » (§353).
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";

import { MyPlanSessionSheet } from "@/components/strength/MyPlanSessionSheet";
import type { StrengthSessionItem, StrengthSessionTemplate } from "@/lib/api/types";

function item(
  over: Partial<StrengthSessionItem> & { exercise_id: number; exercise_name: string },
): StrengthSessionItem {
  return {
    order_index: over.order_index ?? 0,
    sets: 3,
    reps: 10,
    rest_seconds: 30,
    percent_1rm: 0,
    ...over,
  };
}

function sessionOf(items: StrengthSessionItem[]): StrengthSessionTemplate {
  return { id: "s1", name: "Séance test", items } as unknown as StrengthSessionTemplate;
}

describe("MyPlanSessionSheet — marquage échauffement §353", () => {
  it("scinde l'échauffement en sous-sections + pastille axe·côté sur le correctif", () => {
    const items = [
      item({ exercise_id: 87, exercise_name: "Cat-Cow", block: "warmup", raw_payload: { warmup_kind: "common" } }),
      item({ exercise_id: 59, exercise_name: "Hip Airplane", block: "warmup", raw_payload: { warmup_kind: "corrective", corrective_axis: "hip", corrective_side: "left" } }),
      item({ exercise_id: 49, exercise_name: "Face Pull", block: "warmup", raw_payload: { warmup_kind: "activation" } }),
      item({ exercise_id: 13, exercise_name: "Tractions lestées", block: "main", raw_payload: { warmup_kind: null } }),
    ];
    render(<MyPlanSessionSheet session={sessionOf(items)} phase={null} onClose={() => {}} readOnly />);

    expect(screen.getByText("Échauffement articulaire")).toBeTruthy();
    expect(screen.getByText("Mobilité corrective")).toBeTruthy();
    expect(screen.getByText("Activation musculaire")).toBeTruthy();
    expect(screen.getByText("Mobilité de hanche · côté gauche")).toBeTruthy();
    expect(screen.getByText("Bloc principal")).toBeTruthy();
  });

  it("legacy (block warmup sans warmup_kind) → en-tête unique « Échauffement · Mobilité »", () => {
    const items = [
      item({ exercise_id: 87, exercise_name: "Cat-Cow", block: "warmup" }),
      item({ exercise_id: 13, exercise_name: "Tractions lestées", block: "main" }),
    ];
    render(<MyPlanSessionSheet session={sessionOf(items)} phase={null} onClose={() => {}} readOnly />);

    expect(screen.getByText("Échauffement · Mobilité")).toBeTruthy();
    expect(screen.queryByText("Activation musculaire")).toBeNull();
    expect(screen.queryByText("Mobilité corrective")).toBeNull();
  });
});
