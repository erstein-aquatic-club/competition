import type { StrengthSessionItem } from "@/lib/api/types";

// Prescription de chauffe : indépendante des séries de travail et des 1RM.
type Prep = {
  mode?: string;
  reps?: number;
  label?: string;
  factor?: number;
  optional?: boolean;
};
type Prescription = {
  preparation?: Prep;
  sets_range?: { min: number; max: number };
  reps_range?: { min: number; max: number };
  pct_1rm_range?: { min: number; max: number };
};
export function itemPrescription(item: StrengthSessionItem | null | undefined): Prescription | null {
  const value = item?.raw_payload?.prescription_v1;
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Prescription : null;
}

export function formatPrep(item: StrengthSessionItem, workWeightKg: number, weightMetric: boolean): string | null {
  if (item.raw_payload?.rest_day === true) return null;
  const prep = itemPrescription(item)?.preparation;
  if (prep?.mode === "none") return null;
  if (prep?.mode === "relative_work_load") {
    const reps = prep.reps ?? 10;
    const factor = prep.factor ?? 0.5;
    if (weightMetric && Number.isFinite(workWeightKg) && workWeightKg > 0) {
      const kg = Math.max(0.5, Math.round(workWeightKg * factor * 2) / 2);
      return `${reps} reps · ${kg.toLocaleString("fr-FR")} kg`;
    }
    return `${reps} reps · ${Math.round(factor * 100)} % charge de travail`;
  }
  if (prep?.label) return prep.label;
  // Fallback pour les séances historiques : jamais de charge inventée.
  if (item.block === "warmup") return null;
  if (weightMetric && Number.isFinite(workWeightKg) && workWeightKg > 0) {
    return `10 reps · ${(Math.round(workWeightKg * 0.5 * 2) / 2).toLocaleString("fr-FR")} kg`;
  }
  return "Quelques reps faciles";
}

export function formatWork(item: StrengthSessionItem): string {
  const p = itemPrescription(item);
  const range = (v: { min: number; max: number } | undefined, fallback: number) =>
    v && v.max > v.min ? `${v.min}–${v.max}` : String(v?.min ?? fallback);
  const sets = range(p?.sets_range, item.sets);
  const reps = range(p?.reps_range, item.reps);
  const pct = p?.pct_1rm_range
    ? ` · ${range(p.pct_1rm_range, item.percent_1rm)} % 1RM`
    : item.percent_1rm > 0 ? ` · ${item.percent_1rm} % 1RM` : "";
  return `${sets}×${reps}${pct}`;
}
