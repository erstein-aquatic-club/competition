// Pure assembly layer for the liveffn startlist feature.
// Combines parsed swimmers + matched user ids + each user's perfs + the
// competition's objectives into enriched rows. NO I/O — the component (Task 6)
// does the fetching and passes everything in. Reuses objectiveHelpers so the
// perf/objective numbers exactly match the existing "fiches objectifs".

import type { StartlistSwimmer } from "./parseStartlist.ts";
import { startlistKey } from "./matchSwimmers.ts";
import {
  eventCodeFromFfnName,
  eventLabel,
  findBestPerformance,
} from "../objectiveHelpers.ts";

/** Strip the French gender suffix from an FFN event name. */
export function stripGender(rawEvent: string): string {
  return rawEvent.replace(/\s+(Messieurs|Dames|Mixte)\s*$/i, "").trim();
}

export interface StartlistRow {
  key: string; // `${startlistKey}::${rawEvent}` — unique per race
  swimmerName: string; // matched athlete display_name, or "LASTNAME Firstname" if unlinked
  linked: boolean;
  rawEvent: string;
  eventLabel: string;
  eventCode: string | null; // compact (eventCodeFromFfnName(stripGender(rawEvent)))
  heat: number | null;
  lane: number | null;
  entryTimeSeconds: number | null;
  entryTimeDisplay: string;
  day: string;
  time: string;
  dayIndex: number; // sortable index derived from the date part of `day`
  minutes: number; // minutes-of-day derived from `time`
  bestPerf: { time: number; date: string | null } | null;
  objectiveTarget: number | null;
}

export interface BuildStartlistInput {
  swimmers: StartlistSwimmer[];
  matches: Record<string, number | null>; // startlistKey → userId | null
  athleteName: Record<number, string>; // userId → display_name
  perfsByUser: Record<
    number,
    Array<{
      event_code: string;
      pool_length?: number | null;
      time_seconds?: number | null;
      competition_date?: string | null;
    }>
  >;
  objectivesByUser: Record<
    number,
    Array<{ event_code: string; target_time_seconds?: number | null }>
  >;
}

// Sentinel pushed to the end of any chronological sort when day/time can't be parsed.
const SORT_SENTINEL = 999999;

const FRENCH_MONTHS: Record<string, number> = {
  janvier: 1, fevrier: 2, mars: 3, avril: 4, mai: 5, juin: 6,
  juillet: 7, aout: 8, septembre: 9, octobre: 10, novembre: 11, decembre: 12,
};

const FRENCH_WEEKDAYS: Record<string, number> = {
  lundi: 1, mardi: 2, mercredi: 3, jeudi: 4, vendredi: 5, samedi: 6, dimanche: 7,
};

function deaccent(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

/**
 * Derive a sortable index from a French day string like "Dimanche 24 Mai".
 * Prefer the DATE part: monthNum*100 + dayOfMonth (so 22 May < 24 May, and
 * months are correctly ordered). Fall back to weekday order [Lundi..Dimanche]
 * if there is no parseable date. Missing/garbled → large sentinel (sorts last).
 */
export function dayIndexOf(day: string): number {
  const norm = deaccent(day);
  const dom = norm.match(/\b(\d{1,2})\b/);
  const monthName = Object.keys(FRENCH_MONTHS).find((mn) => norm.includes(mn));
  if (dom && monthName) {
    return FRENCH_MONTHS[monthName] * 100 + parseInt(dom[1], 10);
  }
  const weekday = Object.keys(FRENCH_WEEKDAYS).find((wd) => norm.includes(wd));
  if (weekday) return FRENCH_WEEKDAYS[weekday]; // 1..7, all below any month*100
  return SORT_SENTINEL;
}

/**
 * Parse "10h59" → 659, "16h41" → 1001 (hours*60 + minutes).
 * Missing/garbled → large sentinel (sorts last).
 */
export function minutesOf(time: string): number {
  const m = time.match(/(\d{1,2})\s*h\s*(\d{0,2})/i);
  if (!m) return SORT_SENTINEL;
  const h = parseInt(m[1], 10);
  const min = m[2] ? parseInt(m[2], 10) : 0;
  return h * 60 + min;
}

/** Lowest target_time_seconds among objectives matching the compact eventCode. */
function lowestObjectiveTarget(
  objectives: Array<{ event_code: string; target_time_seconds?: number | null }>,
  eventCode: string,
): number | null {
  let best: number | null = null;
  for (const o of objectives) {
    if (o.event_code !== eventCode) continue;
    if (o.target_time_seconds == null) continue;
    if (best === null || o.target_time_seconds < best) best = o.target_time_seconds;
  }
  return best;
}

export function buildStartlistRows(input: BuildStartlistInput): StartlistRow[] {
  const { swimmers, matches, athleteName, perfsByUser, objectivesByUser } = input;
  const rows: StartlistRow[] = [];

  for (const swimmer of swimmers) {
    const key = startlistKey(swimmer);
    const userId = matches[key];
    const linked = typeof userId === "number";
    const swimmerName = linked
      ? athleteName[userId as number] ?? `${swimmer.lastName} ${swimmer.firstName}`.trim()
      : `${swimmer.lastName} ${swimmer.firstName}`.trim();

    for (const race of swimmer.races) {
      const stripped = stripGender(race.rawEvent);
      const eventCode = eventCodeFromFfnName(stripped);

      let bestPerf: { time: number; date: string | null } | null = null;
      let objectiveTarget: number | null = null;
      if (linked && eventCode) {
        const uid = userId as number;
        bestPerf = findBestPerformance(perfsByUser[uid] ?? [], eventCode);
        objectiveTarget = lowestObjectiveTarget(objectivesByUser[uid] ?? [], eventCode);
      }

      rows.push({
        key: `${key}::${race.rawEvent}`,
        swimmerName,
        linked,
        rawEvent: race.rawEvent,
        eventLabel: eventCode ? eventLabel(eventCode) : stripped,
        eventCode,
        heat: race.heat,
        lane: race.lane,
        entryTimeSeconds: race.entryTimeSeconds,
        entryTimeDisplay: race.entryTimeDisplay,
        day: race.day,
        time: race.time,
        dayIndex: dayIndexOf(race.day),
        minutes: minutesOf(race.time),
        bestPerf,
        objectiveTarget,
      });
    }
  }

  return rows;
}

/**
 * Group rows by swimmer. Linked groups come first (preserving input order
 * within each partition), then unlinked groups (also input order). Rows within
 * a group preserve their input order.
 */
export function bySwimmer(
  rows: StartlistRow[],
): Array<{ swimmerName: string; linked: boolean; rows: StartlistRow[] }> {
  const groups: Array<{ swimmerName: string; linked: boolean; rows: StartlistRow[] }> = [];
  const index = new Map<string, number>();

  for (const row of rows) {
    // Group key derived from the row key prefix (startlistKey, unique per swimmer).
    const gkey = row.key.split("::")[0];
    let pos = index.get(gkey);
    if (pos === undefined) {
      pos = groups.length;
      index.set(gkey, pos);
      groups.push({ swimmerName: row.swimmerName, linked: row.linked, rows: [] });
    }
    groups[pos].rows.push(row);
  }

  // Stable partition: linked first, then unlinked, preserving discovery order.
  return groups
    .map((g, i) => ({ g, i }))
    .sort((a, b) => {
      if (a.g.linked !== b.g.linked) return a.g.linked ? -1 : 1;
      return a.i - b.i;
    })
    .map((x) => x.g);
}

/** Sort rows chronologically by dayIndex then minutes (stable on ties). */
export function chronological(rows: StartlistRow[]): StartlistRow[] {
  return rows
    .map((row, i) => ({ row, i }))
    .sort((a, b) => {
      if (a.row.dayIndex !== b.row.dayIndex) return a.row.dayIndex - b.row.dayIndex;
      if (a.row.minutes !== b.row.minutes) return a.row.minutes - b.row.minutes;
      return a.i - b.i;
    })
    .map((x) => x.row);
}
