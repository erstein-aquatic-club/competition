import { describe, expect, it } from "vitest";
import { formatPrep, formatWork, itemPrescription } from "./prescriptionDisplay";
import type { StrengthSessionItem } from "@/lib/api/types";

const item = (raw_payload: Record<string, unknown> | null, over: Partial<StrengthSessionItem> = {}) => ({
  exercise_id: 60, order_index: 0, sets: 2, reps: 5,
  rest_seconds: 180, percent_1rm: 80, block: "main",
  raw_payload, ...over,
} as StrengthSessionItem);

describe("prescriptions individuelles", () => {
  it("80 kg de travail donnent 10 × 40 kg de chauffe", () => {
    const it = item({ prescription_v1: { preparation: { mode: "relative_work_load", reps: 10, factor: 0.5 } } });
    expect(formatPrep(it, 80, true)).toBe("10 reps · 40 kg");
    expect(it.sets).toBe(2);
    expect(it.reps).toBe(5);
  });

  it("aucune charge inventée si 1RM inconnue", () => {
    const it = item({ prescription_v1: { preparation: { mode: "relative_work_load", reps: 10, factor: 0.5 } } });
    expect(formatPrep(it, 0, true)).toBe("10 reps · 50 % charge de travail");
  });

  it("traction assistée : consigne sans calcul de demi-charge", () => {
    const it = item({ prescription_v1: { preparation: { mode: "more_assistance", label: "4–6 reps · aide accrue" } } });
    expect(formatPrep(it, 0, false)).toBe("4–6 reps · aide accrue");
  });

  it("la plage du PDF n'est pas remplacée par son minimum", () => {
    const it = item({ prescription_v1: {
      sets_range: { min: 2, max: 3 }, reps_range: { min: 4, max: 5 },
      pct_1rm_range: { min: 70, max: 75 },
    } });
    expect(formatWork(it)).toBe("2–3×4–5 · 70–75 % 1RM");
  });

  it("les jours de repos n'ont pas de préparation", () => {
    const it = item({ rest_day: true });
    expect(formatPrep(it, 0, true)).toBeNull();
  });

  it("le payload absent reste compatible", () => {
    expect(itemPrescription(item(null))).toBeNull();
  });
});
