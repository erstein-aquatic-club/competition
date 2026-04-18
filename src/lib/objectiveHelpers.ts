/**
 * Shared helpers for objective display and input (used by both coach and swimmer views).
 */

export const FFN_EVENTS = [
  "50NL", "100NL", "200NL", "400NL", "800NL", "1500NL",
  "50DOS", "100DOS", "200DOS",
  "50BR", "100BR", "200BR",
  "50PAP", "100PAP", "200PAP",
  "200QN", "400QN",
];

export function eventLabel(code: string): string {
  const match = code.match(/^(\d+)(NL|DOS|BR|PAP|QN)$/);
  if (!match) return code;
  const names: Record<string, string> = {
    NL: "Nage Libre",
    DOS: "Dos",
    BR: "Brasse",
    PAP: "Papillon",
    QN: "4 Nages",
  };
  return `${match[1]}m ${names[match[2]] || match[2]}`;
}

export function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  const wholeSecs = Math.floor(secs);
  const centisecs = Math.round((secs - wholeSecs) * 100);
  return `${mins}:${String(wholeSecs).padStart(2, "0")}:${String(centisecs).padStart(2, "0")}`;
}

export function parseTime(display: string): number | null {
  const match = display.match(/^(\d+):(\d{2})[.::](\d{2})$/);
  if (!match) return null;
  return parseInt(match[1]) * 60 + parseInt(match[2]) + parseInt(match[3]) / 100;
}

/**
 * Mapping from objective event_code to possible swim_records event_name values.
 * swim_records.event_name comes from FFN import and varies in format.
 */
const EVENT_CODE_TO_NAMES: Record<string, string[]> = {
  "50NL": ["50 NL", "50 Nage Libre"],
  "100NL": ["100 NL", "100 Nage Libre"],
  "200NL": ["200 NL", "200 Nage Libre"],
  "400NL": ["400 NL", "400 Nage Libre"],
  "800NL": ["800 NL", "800 Nage Libre"],
  "1500NL": ["1500 NL", "1500 Nage Libre"],
  "50DOS": ["50 Dos"],
  "100DOS": ["100 Dos"],
  "200DOS": ["200 Dos"],
  "50BR": ["50 Brasse", "50 Bra."],
  "100BR": ["100 Brasse", "100 Bra."],
  "200BR": ["200 Brasse", "200 Bra."],
  "50PAP": ["50 Papillon", "50 Pap", "50 Pap."],
  "100PAP": ["100 Papillon", "100 Pap", "100 Pap."],
  "200PAP": ["200 Papillon", "200 Pap", "200 Pap."],
  "200QN": ["200 4 Nages", "200 4N", "200 4 N."],
  "400QN": ["400 4 Nages", "400 4N", "400 4 N."],
};

/**
 * Forward lookup: given a compact event_code (e.g. "50NL"), return the list of
 * FFN display names (e.g. ["50 NL", "50 Nage Libre"]) used in swimmer_performances.
 */
export function ffnNamesFromEventCode(code: string): string[] {
  return EVENT_CODE_TO_NAMES[code] ?? [];
}

/**
 * Reverse lookup: given a FFN display name (e.g. "100 NL", "50 Pap."),
 * return the compact objective event_code (e.g. "100NL", "50PAP") or null.
 */
export function eventCodeFromFfnName(ffnName: string): string | null {
  const lower = ffnName.toLowerCase();
  for (const [code, names] of Object.entries(EVENT_CODE_TO_NAMES)) {
    if (names.some((n) => n.toLowerCase() === lower)) return code;
  }
  return null;
}

/** Stroke color class (border-left) keyed by stroke suffix. */
export const STROKE_COLORS: Record<string, string> = {
  NL: "border-l-blue-500",
  DOS: "border-l-emerald-500",
  BR: "border-l-red-500",
  PAP: "border-l-violet-500",
  QN: "border-l-amber-500",
};

/** Extract stroke suffix from event_code (e.g. "100DOS" → "DOS"). */
export function strokeFromCode(code: string): string | null {
  const match = code.match(/^(\d+)(NL|DOS|BR|PAP|QN)$/);
  return match ? match[2] : null;
}

/**
 * Find the best (lowest) time_seconds from swimmer_performances matching
 * an objective event_code. Performances use the FFN event_code format
 * (e.g. "50 NL", "100 Bra.") which is matched via EVENT_CODE_TO_NAMES.
 * The caller should pre-filter to the last 360 days via the API query.
 * Returns null if no matching performance exists.
 */
export function findBestTime(
  performances: Array<{ event_code: string; pool_length?: number | null; time_seconds?: number | null }>,
  objectiveEventCode: string,
  poolLength?: number | null,
): number | null {
  const names = EVENT_CODE_TO_NAMES[objectiveEventCode];
  if (!names) return null;
  const lowerNames = names.map((n) => n.toLowerCase());
  let best: number | null = null;
  for (const p of performances) {
    if (p.time_seconds == null) continue;
    if (!lowerNames.includes(p.event_code.toLowerCase())) continue;
    if (poolLength != null && p.pool_length != null && p.pool_length !== poolLength) continue;
    if (best === null || p.time_seconds < best) best = p.time_seconds;
  }
  return best;
}

/**
 * Maximum gap (in seconds) between target and current time used as
 * baseline for the progress gauge, keyed by race distance.
 */
const GAUGE_BASELINE_BY_DISTANCE: Record<number, number> = {
  50: 1,
  100: 4,
  200: 10,
  400: 15,
  800: 30,
  1500: 45,
};

/** Extract race distance from event_code (e.g. "200PAP" → 200). */
export function distanceFromCode(code: string): number | null {
  const match = code.match(/^(\d+)(NL|DOS|BR|PAP|QN)$/);
  return match ? Number(match[1]) : null;
}

/**
 * Compute progress percentage for the objective gauge.
 * baseline = target + GAUGE_BASELINE seconds for the distance.
 * 100% = target reached, 0% = current >= baseline.
 */
export function computeProgress(
  bestTime: number,
  targetTime: number,
  eventCode: string,
): number {
  if (bestTime <= targetTime) return 100;
  const distance = distanceFromCode(eventCode);
  const baselineGap = distance ? (GAUGE_BASELINE_BY_DISTANCE[distance] ?? 10) : 10;
  const baseline = targetTime + baselineGap;
  if (bestTime >= baseline) return 0;
  return Math.round(((baseline - bestTime) / (baseline - targetTime)) * 100);
}

/**
 * Like findBestTime but also returns the competition date of the best performance.
 */
export function findBestPerformance(
  performances: Array<{ event_code: string; pool_length?: number | null; time_seconds?: number | null; competition_date?: string | null }>,
  objectiveEventCode: string,
  poolLength?: number | null,
): { time: number; date: string | null } | null {
  const names = EVENT_CODE_TO_NAMES[objectiveEventCode];
  if (!names) return null;
  const lowerNames = names.map((n) => n.toLowerCase());
  let best: { time: number; date: string | null } | null = null;
  for (const p of performances) {
    if (p.time_seconds == null) continue;
    if (!lowerNames.includes(p.event_code.toLowerCase())) continue;
    if (poolLength != null && p.pool_length != null && p.pool_length !== poolLength) continue;
    if (best === null || p.time_seconds < best.time) {
      best = { time: p.time_seconds, date: p.competition_date ?? null };
    }
  }
  return best;
}

/** Color class for the progress gauge based on fill percentage. */
export function progressBarColor(pct: number): string {
  if (pct >= 100) return "bg-emerald-500";
  if (pct >= 75) return "bg-green-500";
  if (pct >= 50) return "bg-yellow-500";
  if (pct >= 25) return "bg-orange-500";
  return "bg-red-500";
}

/** Days until a date string (YYYY-MM-DD). Negative if past. */
export function daysUntil(dateStr: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(dateStr + "T00:00:00");
  return Math.ceil((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}
