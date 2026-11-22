import { describe, expect, it } from "vitest";
import type { StrengthSessionItem } from "@/lib/api/types";
import {
  expandContrastPlan, getContrastRound, contrastSetNumber, validContrastPair,
  validateContrastPlan, getTrainingIntent, isContrastRoundLogged,
} from "./contrast";

const make = (exercise_id: number, role?: "force" | "power", sets = 3): StrengthSessionItem => ({
  exercise_id, order_index: exercise_id, sets, reps: 3, rest_seconds: 180, percent_1rm: 0,
  raw_payload: role ? { contrast_pair_v1: { id: "test-pair", role, rest_seconds: 180 } } : {},
});

describe("contrast plan", () => {
  it("keeps ordinary sessions untouched", () => {
    const items = [make(1), make(2)];
    expect(expandContrastPlan(items)).toEqual(items);
  });
  it("interleaves force and plyometric series without rest between A and B", () => {
    const items = [make(1, "force"), make(2, "power"), make(3)];
    expect(validContrastPair(items[0], items[1])).toBe(true);
    const result = expandContrastPlan(items);
    expect(result).toHaveLength(7);
    expect(result.map((x) => x.exercise_id)).toEqual([1, 2, 1, 2, 1, 2, 3]);
    expect(result.map((x) => x.rest_seconds)).toEqual([0, 180, 0, 180, 0, 180, 180]);
    expect(result.slice(0, 6).map((x) => contrastSetNumber(x, 1))).toEqual([1, 1, 2, 2, 3, 3]);
    expect(getContrastRound(result[2])).toMatchObject({ round: 2, total: 3, role: "force" });
    expect(isContrastRoundLogged(result[2], [{ exercise_id: 1, set_index: 1 }])).toBe(false);
    expect(isContrastRoundLogged(result[2], [{ exercise_id: 1, set_number: 2 }])).toBe(true);
  });
  it("refuses incomplete, unmatched, or dangerous pairs", () => {
    const items = [make(1, "force"), make(2, "power", 2)];
    expect(validContrastPair(items[0], items[1])).toBe(false);
    expect(validateContrastPlan(items)).toHaveLength(2);
    expect(expandContrastPlan(items)).toEqual(items);
  });
  it("respects a prescribed 5-minute interval after A and 2-minute recovery after B", () => {
    const a = make(26, "force");
    const b = make(8, "power");
    const withGap = [a, b].map((item) => ({
      ...item,
      raw_payload: { ...item.raw_payload,
        contrast_pair_v1: {
          id: "test-pair", role: item.exercise_id === 26 ? "force" : "power",
          rest_seconds: 120, rest_before_power_seconds: 300,
        },
      },
    }));
    expect(validateContrastPlan(withGap)).toEqual([]);
    const result = expandContrastPlan(withGap);
    expect(result.map((i) => i.rest_seconds)).toEqual([300, 120, 300, 120, 300, 120]);
    expect(result.map((i) => i.exercise_id)).toEqual([26, 8, 26, 8, 26, 8]);
    const mismatched = [...withGap];
    mismatched[1] = { ...mismatched[1], raw_payload: { ...mismatched[1].raw_payload,
      contrast_pair_v1: { id: "test-pair", role: "power", rest_seconds: 120, rest_before_power_seconds: 180 },
    } };
    expect(validContrastPair(mismatched[0], mismatched[1])).toBe(false);
  });
  it("uses intent metadata first and infers useful defaults", () => {
    expect(getTrainingIntent({ ...make(1), exercise_name: "Bench Pull explosif" })).toBe("puissance");
    expect(getTrainingIntent({ ...make(1), reps: 8, exercise_name: "Tractions lestées" })).toBe("hypertrophie");
    expect(getTrainingIntent({ ...make(1), exercise_name: "Trap bar squat" })).toBe("force");
    expect(getTrainingIntent({ ...make(1), raw_payload: { training_intent: "puissance" }, exercise_name: "Trap bar squat" })).toBe("puissance");
  });
});
