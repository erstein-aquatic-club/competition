/**
 * Formats a duration in seconds for display in the pace calculator.
 *
 * - `s <= 0`  → "—"
 * - `s < 60`  → `ss.d`   (e.g. "23.6")
 * - `s >= 60` → `m:ss.d` with zero-padded seconds (e.g. "1:23.6")
 *
 * `decimals` sets the fractional digits — default 1; 2 for race / MAX-column
 * times where the centième matters.
 */
export function fmtTime(s: number, decimals = 1): string {
  if (s <= 0) return "—";
  if (s < 60) return s.toFixed(decimals);
  const m = Math.floor(s / 60);
  const rem = (s - m * 60).toFixed(decimals).padStart(3 + decimals, "0");
  return `${m}:${rem}`;
}
