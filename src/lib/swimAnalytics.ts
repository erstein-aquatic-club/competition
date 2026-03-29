// ────────────────────────────────────────────────────────────────────────────
// swimAnalytics.ts — Pure functions for swim volume aggregation
// ────────────────────────────────────────────────────────────────────────────

import type { SwimBlock } from "./swimTextParser";

// ── Types ──

export interface SwimVolumeEntry {
  date: string;
  totalMeters: number;
  byStroke: Record<string, number>;
  byType: Record<string, number>;
  byIntensity: Record<string, number>;
}

export interface WeeklySwimVolume {
  weekStart: string; // ISO date of Monday
  totalMeters: number;
  byStroke: Record<string, number>;
  byType: Record<string, number>;
  byIntensity: Record<string, number>;
}

// ── normalizeStroke ──

const STROKE_NORMALIZE_MAP: Record<string, string> = {
  crawl: "NL",
  nl: "NL",
  "nage libre": "NL",
  dos: "DOS",
  brasse: "BR",
  br: "BR",
  papillon: "PAP",
  pap: "PAP",
  "4n": "QN",
  qn: "QN",
  "quatre nages": "QN",
  "4 nages": "QN",
  educ: "EDU",
  "éducatif": "EDU",
  educatif: "EDU",
  spe: "NL",
  "spé": "NL",
};

/**
 * Map parser stroke values to display categories.
 * Parser emits: "crawl", "pap", "dos", "brasse", "4n", "spe"
 */
export function normalizeStroke(stroke: string): string {
  if (!stroke) return "MIXTE";
  const lower = stroke.trim().toLowerCase();
  return STROKE_NORMALIZE_MAP[lower] ?? "MIXTE";
}

// ── classifyWorkType ──

/**
 * Map intensity/strokeType to work type category.
 */
export function classifyWorkType(exercise: {
  intensity?: string;
  strokeType?: string;
}): string {
  const { intensity, strokeType } = exercise;

  // Check strokeType first — technique overrides intensity
  if (strokeType) {
    const lower = strokeType.toLowerCase();
    if (lower.includes("educ") || lower.includes("éduc") || lower.includes("technique")) {
      return "technique";
    }
  }

  if (intensity) {
    const upper = intensity.trim().toUpperCase();
    if (upper === "V0" || upper === "V1") return "endurance";
    if (upper === "V2" || upper === "PROG") return "mixte";
    if (upper === "V3" || upper === "MAX") return "vitesse";
  }

  return "mixte";
}

// ── computeSessionVolume ──

function addToRecord(record: Record<string, number>, key: string, value: number): void {
  record[key] = (record[key] ?? 0) + value;
}

/**
 * Compute aggregated volume from parsed SwimBlock[].
 */
export function computeSessionVolume(
  blocks: SwimBlock[],
): Omit<SwimVolumeEntry, "date"> {
  const byStroke: Record<string, number> = {};
  const byType: Record<string, number> = {};
  const byIntensity: Record<string, number> = {};
  let totalMeters = 0;

  for (const block of blocks) {
    const blockReps = block.repetitions ?? 1;

    for (const exercise of block.exercises) {
      const distance = (exercise.distance ?? 0) * (exercise.repetitions ?? 1) * blockReps;
      if (distance <= 0) continue;

      totalMeters += distance;

      const stroke = normalizeStroke(exercise.stroke);
      addToRecord(byStroke, stroke, distance);

      const workType = classifyWorkType(exercise);
      addToRecord(byType, workType, distance);

      const intensity = exercise.intensity || "V1";
      addToRecord(byIntensity, intensity, distance);
    }
  }

  return { totalMeters, byStroke, byType, byIntensity };
}

// ── aggregateByWeek ──

/**
 * Get the ISO Monday for a given date string (YYYY-MM-DD).
 * Uses pure arithmetic to avoid timezone issues with Date objects.
 */
function getMonday(dateStr: string): string {
  const date = new Date(dateStr + "T12:00:00"); // noon to avoid DST edge cases
  const day = date.getDay(); // 0=Sun, 1=Mon, ..., 6=Sat
  const diff = day === 0 ? -6 : 1 - day; // offset to Monday
  date.setDate(date.getDate() + diff);
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function mergeRecords(
  target: Record<string, number>,
  source: Record<string, number>,
): void {
  for (const [key, value] of Object.entries(source)) {
    target[key] = (target[key] ?? 0) + value;
  }
}

/**
 * Group SwimVolumeEntry[] by ISO week (Monday start) and sum all metrics.
 */
export function aggregateByWeek(entries: SwimVolumeEntry[]): WeeklySwimVolume[] {
  const weekMap = new Map<
    string,
    { totalMeters: number; byStroke: Record<string, number>; byType: Record<string, number>; byIntensity: Record<string, number> }
  >();

  for (const entry of entries) {
    const monday = getMonday(entry.date);

    if (!weekMap.has(monday)) {
      weekMap.set(monday, {
        totalMeters: 0,
        byStroke: {},
        byType: {},
        byIntensity: {},
      });
    }

    const week = weekMap.get(monday)!;
    week.totalMeters += entry.totalMeters;
    mergeRecords(week.byStroke, entry.byStroke);
    mergeRecords(week.byType, entry.byType);
    mergeRecords(week.byIntensity, entry.byIntensity);
  }

  return Array.from(weekMap.entries())
    .map(([weekStart, data]) => ({ weekStart, ...data }))
    .sort((a, b) => a.weekStart.localeCompare(b.weekStart));
}
