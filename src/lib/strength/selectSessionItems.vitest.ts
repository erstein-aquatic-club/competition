import { describe, expect, it } from "vitest";
import type { StrengthSessionItem, StrengthSessionTemplate } from "@/lib/api/types";
import { countPrimaryExercises, countPowerReminders, expandContrastPlan, validContrastPair } from "./contrast";
import { estimateStrengthSessionDurationSeconds } from "./sessionDuration";
import { isPrescribedPlanSession, selectSessionItems } from "./selectSessionItems";

const item = (id: number, order: number, cycle: "endurance" | "force",
  role?: "force" | "power"): StrengthSessionItem => ({
  exercise_id: id, order_index: order, cycle_type: cycle, sets: id === 60 || id === 72 ? 2 : 3,
  reps: id === 72 ? 5 : id === 60 ? 3 : 2,
  rest_seconds: role === "force" ? 0 : 180,
  percent_1rm: 0,
  raw_payload: role ? { contrast_pair_v1: { id: "mardi-2026-11-24", role, rest_seconds: 180, rest_before_power_seconds: 0 } } : {},
});

describe("séance Mon plan à cycles mixtes", () => {
  const prescribed = [
    item(7, 0, "force", "force"),
    item(123, 1, "endurance", "power"),
    item(60, 2, "endurance"),
    item(72, 3, "endurance"),
  ];

  it("conserve tous les exercices prescrits, même si leur cycle_type diffère", () => {
    const result = selectSessionItems(prescribed, "force", true);
    expect(result.map((i) => i.exercise_id)).toEqual([7, 123, 60, 72]);
    expect(validContrastPair(result[0], result[1])).toBe(true);
    expect(countPrimaryExercises(result)).toBe(3);
    expect(countPowerReminders(result)).toBe(1);
    expect(expandContrastPlan(result).map((i) => i.exercise_id)).toEqual([
      7, 123, 7, 123, 7, 123, 60, 72,
    ]);
    // Le temps ne peut pas être celui de la trap bar seule (~3 min).
    expect(estimateStrengthSessionDurationSeconds(result)).toBeGreaterThan(600);
  });

  it("conserve le comportement historique des variantes de cycle du catalogue", () => {
    expect(selectSessionItems(prescribed, "force", false).map((i) => i.exercise_id)).toEqual([7]);
    expect(selectSessionItems(prescribed, "endurance", false).map((i) => i.exercise_id)).toEqual([123, 60, 72]);
  });

  it("préserve le marqueur Mon plan dans une session sérialisée pour reprise PWA", () => {
    const session = { id: 505, title: "Force jambes + CMJ", description: "",
      cycle: "force", items: prescribed, is_prescribed_plan: true } satisfies StrengthSessionTemplate;
    const restored = JSON.parse(JSON.stringify(session)) as StrengthSessionTemplate;
    expect(isPrescribedPlanSession(restored)).toBe(true);
    expect(selectSessionItems(restored.items, restored.cycle, isPrescribedPlanSession(restored))).toHaveLength(4);
  });
});
