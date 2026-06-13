import type { ChronoSwimmer } from "./chrono-types";

/**
 * Layout helper for the mobile race view (§384).
 *
 * The desktop race renders a Lane × Wave matrix (CSS grid). On a phone that
 * matrix forces horizontal scrolling and is unusable, so the mobile view
 * collapses to a single vertical column grouped by wave (the timing unit:
 * a wave departs together, recovers together, relaunches together).
 *
 * This pure helper produces the ordered groups consumed by `ChronoRaceMobile`.
 */
export interface MobileWaveGroup {
  /** 1-based wave number */
  wave: number;
  /** Swimmers of this wave, sorted by lane then by display name (stable). */
  swimmers: ChronoSwimmer[];
}

/**
 * Group swimmers by wave (ascending), each group's swimmers sorted by lane
 * (ascending) then display name. Only waves that actually contain swimmers
 * appear in the result.
 */
export function groupSwimmersByWave(swimmers: ChronoSwimmer[]): MobileWaveGroup[] {
  const byWave = new Map<number, ChronoSwimmer[]>();
  for (const s of swimmers) {
    const list = byWave.get(s.wave);
    if (list) list.push(s);
    else byWave.set(s.wave, [s]);
  }
  return Array.from(byWave.keys())
    .sort((a, b) => a - b)
    .map((wave) => ({
      wave,
      swimmers: byWave
        .get(wave)!
        .slice()
        .sort((a, b) => a.lane - b.lane || a.displayName.localeCompare(b.displayName)),
    }));
}
