import { intensityScale } from "@/components/swim/IntensityDots";
import type { SwimSessionItem } from "@/lib/api";
import type { SwimPayloadFields } from "@/lib/types";

// ---------------------------------------------------------------------------
// BlockGroup — groups of exercises within a swim session
// ---------------------------------------------------------------------------
export interface BlockGroup {
  key: string;
  title: string;
  description?: string | null;
  modalities?: string | null;
  equipment?: string[] | null;
  order: number;
  repetitions?: number | null;
  items: SwimSessionItem[];
}

// ---------------------------------------------------------------------------
// SwimExerciseDetail — structured detail for a single exercise
// ---------------------------------------------------------------------------
export type SwimExerciseDetail = {
  label: string;
  distance?: number | null;
  repetitions?: number | null;
  rest?: number | null;
  stroke?: string | null;
  strokeType?: string | null;
  intensity?: string | null;
  modalities?: string | null;
  restType?: "departure" | "rest" | null;
  equipment?: string[];
  blockTitle?: string;
  blockIndex?: number;
};

// ---------------------------------------------------------------------------
// Lookup maps
// ---------------------------------------------------------------------------
const legacyIntensityMap: Record<string, (typeof intensityScale)[number]> = {
  souple: "V0",
  facile: "V0",
  relache: "V0",
  "relâché": "V0",
};

export const strokeLabelMap: Record<string, string> = {
  pap: "Pap",
  papillon: "Pap",
  crawl: "NL",
  dos: "Dos",
  brasse: "Brasse",
  "4n": "4 nages",
  "4 nages": "4 nages",
  nac: "NAC",
  spe: "Spé",
  "spé": "Spé",
};

export const strokeTypeLabels: Record<string, string> = {
  nc: "NC",
  educ: "Éducatif",
  jambes: "Jambes",
};

export const strokeTypeTone: Record<string, string> = {
  nc: "bg-sky-100 text-sky-900 ring-sky-200",
  educ: "bg-violet-100 text-violet-900 ring-violet-200",
  jambes: "bg-teal-100 text-teal-900 ring-teal-200",
};

// ---------------------------------------------------------------------------
// Helper functions
// ---------------------------------------------------------------------------

export const getStrokeLabel = (stroke?: string | null) => {
  if (!stroke) {
    return null;
  }
  return strokeLabelMap[stroke] ?? stroke;
};

export const normalizeIntensity = (intensity?: string | null) => {
  if (!intensity) {
    return null;
  }
  const trimmed = intensity.trim();
  if (!trimmed) {
    return null;
  }
  const lower = trimmed.toLowerCase();
  if (lower === "prog" || lower === "progressif") {
    return "Prog";
  }
  if (legacyIntensityMap[lower]) {
    return legacyIntensityMap[lower];
  }
  const upper = trimmed.toUpperCase();
  if (upper === "MAX") {
    return "Max";
  }
  if (upper.startsWith("V")) {
    const levelValue = Number.parseInt(upper.slice(1), 10);
    if (Number.isFinite(levelValue) && levelValue >= 4) {
      return "Max";
    }
    if (intensityScale.includes(upper as (typeof intensityScale)[number])) {
      return upper;
    }
  }
  return trimmed;
};

export const formatRecoveryDisplay = (seconds?: number | null) => {
  if (!seconds) return "";
  const min = Math.floor(seconds / 60);
  const sec = seconds % 60;
  if (min > 0 && sec > 0) return `${min}'${sec.toString().padStart(2, "0")}`;
  if (min > 0) return `${min}'00`;
  return `${sec}s`;
};

// ---------------------------------------------------------------------------
// Swim time formatting — min:sec:centièmes
// ---------------------------------------------------------------------------

/**
 * Format a time in seconds to the swim notation "m:ss:cc" or "ss:cc".
 * Examples: 83.45 → "1:23:45", 32.05 → "32:05", 0 → ""
 */
export function formatSwimTime(seconds: number | null | undefined): string {
  if (!seconds || !Number.isFinite(seconds) || seconds <= 0) return "";
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  const hundredths = Math.round((seconds % 1) * 100);
  if (mins > 0) {
    return `${mins}:${String(secs).padStart(2, "0")}:${String(hundredths).padStart(2, "0")}`;
  }
  return `${secs}:${String(hundredths).padStart(2, "0")}`;
}

/**
 * Parse a swim time string to seconds.
 * Accepts: "1:23:45" (min:sec:cc) → 83.45, "32:45" (sec:cc) → 32.45,
 *          "32" → 32, also supports "." as separator for hundredths.
 */
export function parseSwimTime(input: string): number {
  const trimmed = input.trim();
  if (!trimmed) return 0;
  // Split on ":" to get parts
  const parts = trimmed.split(":");
  if (parts.length === 3) {
    // min:sec:hundredths
    const min = parseInt(parts[0], 10) || 0;
    const sec = parseInt(parts[1], 10) || 0;
    const cc = parseInt(parts[2], 10) || 0;
    return min * 60 + sec + cc / 100;
  }
  if (parts.length === 2) {
    // sec:hundredths
    const sec = parseInt(parts[0], 10) || 0;
    const cc = parseInt(parts[1], 10) || 0;
    return sec + cc / 100;
  }
  // Single number — try as seconds (could contain dot)
  const n = parseFloat(trimmed);
  return Number.isFinite(n) ? n : 0;
}

// ---------------------------------------------------------------------------
// groupItemsByBlock — organises flat session items into block groups
// ---------------------------------------------------------------------------
export const groupItemsByBlock = (items: SwimSessionItem[] = []): BlockGroup[] => {
  const blocks = new Map<string, BlockGroup>();
  items.forEach((item, index) => {
    const payload = item.raw_payload ?? {};
    const payloadObject = typeof payload === "object" ? payload : {};
    const blockTitle =
      (payloadObject as SwimPayloadFields).block_title ||
      (payloadObject as SwimPayloadFields).section ||
      "Bloc";
    const blockOrder = Number((payloadObject as SwimPayloadFields).block_order ?? 0);
    const key = `${blockOrder}-${blockTitle}`;
    const blockEquipmentRaw =
      (payloadObject as SwimPayloadFields).block_equipment ??
      (payloadObject as SwimPayloadFields).equipment;
    const blockModalities =
      (payloadObject as SwimPayloadFields).block_modalities ??
      (payloadObject as SwimPayloadFields).modalities ??
      null;
    const blockEquipment = Array.isArray(blockEquipmentRaw)
      ? blockEquipmentRaw
      : blockEquipmentRaw
        ? String(blockEquipmentRaw).split(",").map((entry) => entry.trim()).filter(Boolean)
        : [];
    if (!blocks.has(key)) {
      blocks.set(key, {
        key,
        title: blockTitle,
        description: (payloadObject as SwimPayloadFields).block_description ?? null,
        modalities: blockModalities,
        equipment: blockEquipment.length ? blockEquipment : null,
        order: Number.isFinite(blockOrder) ? blockOrder : 0,
        repetitions: (payloadObject as SwimPayloadFields).block_repetitions ?? null,
        items: [],
      });
    }
    const block = blocks.get(key)!;
    const exerciseRepetitions = (payloadObject as SwimPayloadFields).exercise_repetitions ?? null;
    const exerciseDistance = item.distance ?? null;
    const exerciseLabel =
      item.label ||
      (exerciseRepetitions && exerciseDistance ? `${exerciseRepetitions}x${exerciseDistance}m` : null) ||
      (exerciseDistance ? `${exerciseDistance}m` : null);
    const exerciseModalities = (payloadObject as SwimPayloadFields).exercise_modalities ?? item.notes ?? null;
    const exerciseEquipmentRaw =
      (payloadObject as SwimPayloadFields).exercise_equipment ??
      (payloadObject as SwimPayloadFields).equipment;
    const exerciseEquipment = Array.isArray(exerciseEquipmentRaw)
      ? exerciseEquipmentRaw
      : exerciseEquipmentRaw
        ? String(exerciseEquipmentRaw).split(",").map((entry) => entry.trim()).filter(Boolean)
        : [];
    block.items.push({
      ...item,
      label:
        exerciseLabel ||
        (payloadObject as SwimPayloadFields).exercise_label ||
        `Exercice ${index + 1}`,
      notes: exerciseModalities,
      raw_payload: {
        ...payloadObject,
        exercise_modalities: exerciseModalities,
        exercise_equipment: exerciseEquipment,
      },
    });
  });

  return Array.from(blocks.values()).sort((a, b) => {
    if (a.order !== b.order) {
      return a.order - b.order;
    }
    return a.title.localeCompare(b.title);
  });
};
