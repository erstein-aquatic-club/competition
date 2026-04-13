// Shared helpers and types for dashboard sub-hooks. Extracted from the
// legacy monolithic useDashboardState so that each sub-hook can import only
// what it needs without dragging unrelated logic into its render.

import type { SwimExerciseLogInput } from "@/lib/api";

export type SlotKey = "AM" | "PM";
export type IndicatorKey = "difficulty" | "fatigue_end" | "performance" | "engagement";

export type StrokeDraft = { NL: string; DOS: string; BR: string; PAP: string; QN: string };
export const emptyStrokeDraft: StrokeDraft = { NL: "", DOS: "", BR: "", PAP: "", QN: "" };

export type DraftState = Record<IndicatorKey, number | null> & {
  comment: string;
  distanceMeters: number | null;
  showStrokeDetail: boolean;
  strokes: StrokeDraft;
  exerciseLogs: SwimExerciseLogInput[];
};

export type PlannedSession = {
  id: string;
  iso: string;
  slotKey: SlotKey;
  title: string;
  km: number | null;
  details: string[];
  assignmentId?: number;
  isEmpty: boolean;
  slotTime?: string;
  slotLocation?: string;
  assignmentSource?: "individual" | "subgroup" | "group" | "none";
  alternatives?: Array<{
    assignmentId: number;
    title: string;
    km: number | null;
    subgroupName?: string;
  }>;
  swimmerSlotId?: string;
};

export type PresenceDefaults = Record<number, Record<SlotKey, boolean>>;
export type AttendanceOverride = "present" | "absent";
export type AttendanceOverrides = Record<string, AttendanceOverride>;

export function pad2(n: number) {
  return String(n).padStart(2, "0");
}

export function toISODate(d: Date) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

export function startOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

export function addDays(d: Date, days: number) {
  const x = new Date(d);
  x.setDate(x.getDate() + days);
  return x;
}

export function weekdayMondayIndex(d: Date) {
  const js = d.getDay();
  return (js + 6) % 7;
}

export function metersToKm(m: number | string | null | undefined) {
  const n = Number(m);
  if (!Number.isFinite(n)) return 0;
  return Math.round((n / 1000) * 100) / 100;
}

export function kmToMeters(km: number | string | null | undefined) {
  const n = Number(km);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 1000);
}

export function safeLinesFromText(text: string | null | undefined): string[] {
  if (!text) return [];
  const raw = String(text)
    .replaceAll("\r\n", "\n")
    .split("\n")
    .map((x) => x.trim())
    .filter(Boolean);
  return raw.flatMap((line) => {
    const cleaned = line.replace(/^[•\\-–—]\\s*/, "").trim();
    return cleaned ? [cleaned] : [];
  });
}

export function extractDistanceKmFromText(text: string | null | undefined): number | null {
  if (!text) return null;
  const t = String(text);
  const m = t.match(/(\\d+(?:[\\.,]\\d+)?)\\s*(km|m)\\b/i);
  if (!m) return null;
  const val = Number(String(m[1]).replace(",", "."));
  if (!Number.isFinite(val)) return null;
  if (m[2].toLowerCase() === "m") return metersToKm(val);
  return val;
}

export function pickAssignmentSlotKey(a: Record<string, unknown>, fallbackIdx: number): SlotKey {
  const direct =
    a?.slot ??
    a?.session_slot ??
    a?.assigned_slot ??
    a?.time_slot ??
    a?.timeOfDay ??
    a?.slot_key ??
    a?.slotKey;

  const norm = String(direct || "").toLowerCase();
  if (norm.includes("mat") || norm.includes("morning") || norm === "am") return "AM";
  if (norm.includes("soir") || norm.includes("evening") || norm === "pm") return "PM";

  const hay = `${a?.title ?? ""} ${a?.description ?? ""}`.toLowerCase();
  if (hay.includes("matin") || hay.includes(" am ") || hay.includes("(am)")) return "AM";
  if (hay.includes("soir") || hay.includes(" pm ") || hay.includes("(pm)")) return "PM";

  return fallbackIdx === 0 ? "AM" : "PM";
}

export function assignmentIso(a: Record<string, unknown>): string | null {
  const raw = a?.assigned_date ?? a?.date ?? a?.day ?? a?.scheduled_for ?? a?.scheduledAt ?? null;
  if (!raw) return null;
  const s = String(raw);
  const iso = s.length >= 10 ? s.slice(0, 10) : s;
  return /\d{4}-\d{2}-\d{2}/.test(iso) ? iso : null;
}

export function assignmentPlannedKm(a: Record<string, unknown>): number | null {
  if (Array.isArray(a?.items)) {
    let totalMeters = 0;
    for (const item of a.items as any[]) {
      const dist = Number(item?.distance);
      if (!Number.isFinite(dist) || dist <= 0) continue;

      const payload = item?.raw_payload as Record<string, any> | null | undefined;
      const exerciseReps = Number(payload?.exercise_repetitions);
      const blockReps = Number(payload?.block_repetitions);

      const reps = Number.isFinite(exerciseReps) && exerciseReps > 0 ? exerciseReps : 1;
      const blockMultiplier = Number.isFinite(blockReps) && blockReps > 0 ? blockReps : 1;

      totalMeters += dist * reps * blockMultiplier;
    }
    if (totalMeters > 0) {
      return metersToKm(totalMeters);
    }
  }

  const meters =
    a?.distance_meters ??
    a?.distanceMeters ??
    a?.meters ??
    a?.planned_meters ??
    a?.plannedMeters ??
    a?.distance ??
    null;

  if (meters != null && Number.isFinite(Number(meters))) {
    const n = Number(meters);
    if (n > 0 && n <= 50) return n;
    return metersToKm(n);
  }

  const km =
    a?.km ??
    a?.distance_km ??
    a?.distanceKm ??
    a?.planned_km ??
    a?.plannedKm ??
    null;

  if (km != null && Number.isFinite(Number(km))) return Number(km);

  const fromText = extractDistanceKmFromText(`${a?.title ?? ""} ${a?.description ?? ""}`);
  if (fromText != null) return fromText;

  return null;
}

export function assignmentPlannedStrokes(items: any[] | null | undefined): Record<string, number> | null {
  if (!Array.isArray(items) || items.length === 0) return null;

  const strokeMap: Record<string, string> = {
    crawl: "NL",
    dos: "DOS",
    brasse: "BR",
    pap: "PAP",
    "4n": "QN",
  };

  const strokes: Record<string, number> = { NL: 0, DOS: 0, BR: 0, PAP: 0, QN: 0 };

  for (const item of items) {
    const distance = Number(item?.distance);
    if (!Number.isFinite(distance) || distance <= 0) continue;

    const payload = item?.raw_payload as Record<string, any> | null | undefined;
    const exerciseReps = Number(payload?.exercise_repetitions);
    const blockReps = Number(payload?.block_repetitions);
    const reps = Number.isFinite(exerciseReps) && exerciseReps > 0 ? exerciseReps : 1;
    const blockMultiplier = Number.isFinite(blockReps) && blockReps > 0 ? blockReps : 1;
    const totalDistance = distance * reps * blockMultiplier;

    const exerciseStroke = payload?.exercise_stroke ?? payload?.stroke ?? "crawl";
    const strokeCode = strokeMap[String(exerciseStroke).toLowerCase()];

    if (strokeCode) {
      strokes[strokeCode] += totalDistance;
    } else {
      strokes.NL += totalDistance;
    }
  }

  const hasStrokes = Object.values(strokes).some((d) => d > 0);
  return hasStrokes ? strokes : null;
}

export function fmtKm(km: number | string | null | undefined) {
  const n = Number(km);
  if (!Number.isFinite(n)) return "—";
  const rounded = Math.round(n * 100) / 100;
  const str = String(rounded);
  return str.endsWith(".0") ? str.slice(0, -2) : str;
}

export function initPresenceDefaults(): PresenceDefaults {
  const init: PresenceDefaults = {};
  for (let i = 0; i < 7; i++) init[i] = { AM: true, PM: true };
  return init;
}

export function safeJsonParse<T>(value: string | null): T | null {
  if (!value) return null;
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}
