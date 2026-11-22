import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ContrastPairPreviewCard } from "./ContrastPairPreviewCard";
import type { StrengthSessionItem } from "@/lib/api/types";

const item = (id: number, role: "force" | "power", before = 0): StrengthSessionItem => ({
  exercise_id: id, exercise_name: id === 26 ? "Squat arrière" : "Box Jump",
  order_index: id, sets: 3, reps: id === 26 ? 3 : 2, rest_seconds: 120, percent_1rm: id === 26 ? 70 : 0,
  block: "main", raw_payload: {
    training_intent: role === "force" ? "force" : "puissance",
    contrast_pair_v1: { id: "squat-jump", role, rest_seconds: 120, rest_before_power_seconds: before },
  },
});

describe("aperçu d'une paire de contraste", () => {
  it("regroupe les deux exercices, les séries et la récupération dans une carte", () => {
    render(<ContrastPairPreviewCard first={item(26, "force")} second={item(8, "power")} />);
    expect(screen.getByRole("region", { name: /bloc de contraste/i })).toBeTruthy();
    expect(screen.getByText("Squat arrière")).toBeTruthy();
    expect(screen.getByText("Box Jump")).toBeTruthy();
    expect(screen.getByText(/rappel explosif/i)).toBeTruthy();
    expect(screen.getByText("3 tours")).toBeTruthy();
    expect(screen.getByText(/enchaîner B sans pause/i)).toBeTruthy();
    expect(screen.getByText(/après le rappel : 2 min de récupération/i)).toBeTruthy();
  });
  it("annonce une transition retardée lorsque celle-ci est prescrite", () => {
    render(<ContrastPairPreviewCard first={item(26, "force", 300)} second={item(8, "power", 300)} />);
    expect(screen.getByText(/récupération 5 min avant B/i)).toBeTruthy();
    expect(screen.queryByText(/enchaîner B sans pause/i)).toBeNull();
  });
  it("préserve les commandes de remplacement pour chaque exercice", () => {
    const first = vi.fn(), second = vi.fn();
    render(<ContrastPairPreviewCard first={item(26, "force")} second={item(8, "power")}
      detailed onReplaceFirst={first} onReplaceSecond={second} />);
    fireEvent.click(screen.getByRole("button", { name: /remplacer squat arrière/i }));
    fireEvent.click(screen.getByRole("button", { name: /remplacer box jump/i }));
    expect(first).toHaveBeenCalledOnce();
    expect(second).toHaveBeenCalledOnce();
  });
});
