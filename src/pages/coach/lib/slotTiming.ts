/**
 * Pure time & geometry helpers for the coach training-slots timeline.
 * Extracted from CoachTrainingSlotsScreen.tsx (§168) so that the timeline
 * maths survive the upcoming screen refactor with a test fence.
 */

/** Timeline range (06:00 → 22:00) rendered with 40px per hour → 640px total. */
export const TIMELINE_START = 6;
export const TIMELINE_END = 22;
export const TIMELINE_HOURS = TIMELINE_END - TIMELINE_START;
export const PX_PER_HOUR = 40;
export const TIMELINE_HEIGHT = TIMELINE_HOURS * PX_PER_HOUR;
export const HOUR_LABELS = Array.from(
  { length: TIMELINE_HOURS + 1 },
  (_, i) => TIMELINE_START + i,
);

/** `"08:00:00"` → `"08:00"` (tolerates already-short inputs). */
export function formatTime(t: string): string {
  return t.slice(0, 5);
}

/** Convert `"HH:MM"` or `"HH:MM:SS"` to minutes since midnight. */
export function timeToMinutes(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

/** Pixel offset from the top of the timeline grid (may be negative if < 06:00). */
export function timeToPx(t: string): number {
  const mins = timeToMinutes(t);
  return ((mins - TIMELINE_START * 60) / 60) * PX_PER_HOUR;
}

/** Vertical pixel span between two time strings. */
export function durationPx(start: string, end: string): number {
  return timeToPx(end) - timeToPx(start);
}

/** Human-readable duration `"1h30"`, `"45min"`, `"2h"`. */
export function durationLabel(start: string, end: string): string {
  const diff = timeToMinutes(end) - timeToMinutes(start);
  const h = Math.floor(diff / 60);
  const m = diff % 60;
  if (h === 0) return `${m}min`;
  if (m === 0) return `${h}h`;
  return `${h}h${String(m).padStart(2, "0")}`;
}
