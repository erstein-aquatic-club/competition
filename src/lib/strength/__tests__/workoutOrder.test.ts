import { describe, expect, it } from "vitest";
import {
  canMoveWorkoutItemUp,
  moveWorkoutItemUp,
  normalizeWorkoutOrder,
  workoutOrderStorageKey,
} from "@/lib/strength/workoutOrder";

const items = [
  { exercise_id: 10, block: "warmup" },
  { exercise_id: 20, block: "main" },
  { exercise_id: 30, block: "main" },
  { exercise_id: 40, block: "main" },
];

describe("réorganisation locale du mode focus", () => {
  it("normalise une ancienne séquence, ignore les indices invalides et ajoute les nouveaux exercices", () => {
    expect(normalizeWorkoutOrder([0, 2, 2, 99, -1, 1], 4)).toEqual([0, 2, 1, 3]);
    expect(normalizeWorkoutOrder("corrompu", 3)).toEqual([0, 1, 2]);
    expect(normalizeWorkoutOrder(null, 0)).toEqual([]);
  });

  it("échange uniquement les positions, sans modifier le plan initial", () => {
    const original = [0, 1, 2, 3];
    expect(moveWorkoutItemUp(original, 2)).toEqual([0, 2, 1, 3]);
    expect(original).toEqual([0, 1, 2, 3]);
  });

  it("autorise le 5e avant le 4e quand les deux n'ont pas commencé", () => {
    expect(canMoveWorkoutItemUp(items, 3, 2, new Set(), false)).toBe(true);
  });

  it("refuse le retour vers un exercice terminé et le changement de chapitre", () => {
    expect(canMoveWorkoutItemUp(items, 1, 0, new Set(), false)).toBe(false);
    expect(canMoveWorkoutItemUp(items, 2, 2, new Set(), false)).toBe(false);
    expect(canMoveWorkoutItemUp(items, 1, 1, new Set(), false)).toBe(false);
    expect(canMoveWorkoutItemUp(items, 2, 1, new Set([20]), false)).toBe(false);
    expect(canMoveWorkoutItemUp(items, 2, 1, new Set([30]), false)).toBe(false);
    expect(canMoveWorkoutItemUp(items, 2, 1, new Set(), true)).toBe(false);
  });

  it("scinde l'ordre par athlète et exécution, pas par programme", () => {
    expect(workoutOrderStorageKey(1, 55)).toBe("strength-exercise-order:1:55");
    expect(workoutOrderStorageKey(2, 55)).not.toBe(workoutOrderStorageKey(1, 55));
    expect(workoutOrderStorageKey(1, null)).toBeNull();
  });
});
