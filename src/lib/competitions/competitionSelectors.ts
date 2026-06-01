export interface CompetitionLike { id: string; name: string; date: string; end_date?: string | null }

/** The soonest competition not yet finished (end_date — or date — >= today). null if none. */
export function nextCompetition<T extends CompetitionLike>(competitions: T[], todayIso: string): T | null {
  const upcoming = competitions
    .filter((c) => (c.end_date ?? c.date) >= todayIso)
    .sort((a, b) => a.date.localeCompare(b.date));
  return upcoming[0] ?? null;
}
