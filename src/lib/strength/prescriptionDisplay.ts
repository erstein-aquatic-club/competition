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
  hold_seconds?: { min: number; max: number };
  duration_minutes?: { min: number; max: number };
  per_side?: boolean;
  assistance?: { mode?: string; log_actual?: boolean } | null;
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

export function formatSetTarget(item: StrengthSessionItem): string {
  const p = itemPrescription(item);
  const fmt = (r: { min: number; max: number } | undefined, fallback: number) =>
    r && r.max > r.min ? `${r.min}–${r.max}` : String(r?.min ?? fallback);
  if (p?.duration_minutes) return `${fmt(p.duration_minutes, 0)} min`;
  if (p?.hold_seconds) return `${fmt(p.hold_seconds, 0)} s`;
  return `${fmt(p?.reps_range, item.reps)} reps${p?.per_side ? " / côté" : ""}`;
}

export function formatRest(item: StrengthSessionItem): string | null {
  const p = itemPrescription(item) as (Prescription & {
    rest_seconds_range?: { min: number; max: number } | null;
  }) | null;
  const min = p?.rest_seconds_range?.min ?? item.rest_seconds;
  const max = p?.rest_seconds_range?.max ?? item.rest_seconds;
  if (!Number.isFinite(min) || min <= 0) return null;
  const label = (v: number) => v % 60 === 0 ? `${v / 60} min` : `${v} s`;
  if (min === max) return label(min);
  if (min % 60 === 0 && max % 60 === 0) return `${min / 60}–${max / 60} min`;
  return `${label(min)}–${label(max)}`;
}

export function formatWork(item: StrengthSessionItem): string {
  const p = itemPrescription(item);
  const range = (v: { min: number; max: number } | undefined, fallback: number) =>
    v && v.max > v.min ? `${v.min}–${v.max}` : String(v?.min ?? fallback);
  if (p?.duration_minutes) return `${range(p.duration_minutes, 0)} min · facultatif`;
  const sets = range(p?.sets_range, item.sets);
  const reps = p?.hold_seconds ? `${range(p.hold_seconds, 0)} s` : range(p?.reps_range, item.reps);
  const side = p?.per_side ? " / côté" : "";
  const pct = p?.pct_1rm_range
    ? ` · ${range(p.pct_1rm_range, item.percent_1rm)} % 1RM`
    : item.percent_1rm > 0 ? ` · ${item.percent_1rm} % 1RM` : "";
  return `${sets}×${reps}${side}${pct}`;
}
