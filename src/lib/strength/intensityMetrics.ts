export type IntensityMetric = "weight_kg" | "height_cm" | "distance_cm" | "time_s";

interface MetricConfig {
  label: string;        // libellé tile runner / champ
  unit: string;         // suffixe affiché
  tracksOneRm: boolean; // déclenche la calibration 1RM inline ?
  hasBodyweight: boolean; // propose le bouton PDC ?
  selectLabel: string;  // libellé dans le Select coach
  max: number;          // borne haute de saisie (numpad)
}

export const INTENSITY_METRICS: Record<IntensityMetric, MetricConfig> = {
  weight_kg:   { label: "Charge",   unit: "kg", tracksOneRm: true,  hasBodyweight: true,  selectLabel: "Charge (kg)",   max: 1000 },
  height_cm:   { label: "Hauteur",  unit: "cm", tracksOneRm: false, hasBodyweight: false, selectLabel: "Hauteur (cm)",  max: 300  },
  distance_cm: { label: "Distance", unit: "cm", tracksOneRm: false, hasBodyweight: false, selectLabel: "Distance (cm)", max: 500  },
  time_s:      { label: "Temps",    unit: "s",  tracksOneRm: false, hasBodyweight: false, selectLabel: "Temps (s)",     max: 3600 },
};

export const DEFAULT_INTENSITY_METRIC: IntensityMetric = "weight_kg";

export function normalizeIntensityMetric(v: unknown): IntensityMetric {
  return v === "height_cm" || v === "distance_cm" || v === "time_s" ? v : "weight_kg";
}

export function formatIntensity(value: number | null | undefined, metric: IntensityMetric): string {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return "—";
  return `${n} ${INTENSITY_METRICS[metric].unit}`;
}
