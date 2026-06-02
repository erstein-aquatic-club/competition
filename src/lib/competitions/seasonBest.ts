import { findBestPerformance } from "../objectiveHelpers";

/** First day (YYYY-09-01) of the current FFN season (Sept→Aug). */
export function currentSeasonStart(todayIso: string): string {
  const year = Number(todayIso.slice(0, 4));
  const month = Number(todayIso.slice(5, 7));
  const seasonYear = month >= 9 ? year : year - 1;
  return `${seasonYear}-09-01`;
}

type Perf = {
  event_code: string;
  pool_length?: number | null;
  time_seconds?: number | null;
  competition_date?: string | null;
};

/**
 * Best perf for a compact event code, optionally within a date window (>= fromDate)
 * and/or restricted to a basin (poolLength = 25 or 50). When poolLength is given,
 * performances swum in another basin are ignored — so a 50 m competition shows the
 * swimmer's 50 m best, not a faster 25 m time.
 */
export function bestForEvent(
  perfs: Perf[],
  eventCode: string,
  opts?: { fromDate?: string; poolLength?: number | null },
): { time: number; date: string | null } | null {
  const scoped = opts?.fromDate
    ? perfs.filter((p) => (p.competition_date ?? "") >= opts.fromDate!)
    : perfs;
  return findBestPerformance(scoped, eventCode, opts?.poolLength ?? undefined);
}
