export interface MatchCandidate { id: number; display_name: string; birthYear?: number | null; }
export interface ParsedSwimmerLite { lastName: string; firstName: string; birthYear: number | null; }

export function normalizeName(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "")   // strip accents
    .toLowerCase().replace(/[^a-z\s-]/g, " ")
    .split(/[\s-]+/).filter(Boolean).sort().join(" ");          // token-set, order-independent
}

export function startlistKey(s: ParsedSwimmerLite): string {
  return `${s.lastName}-${s.firstName}-${s.birthYear ?? "null"}`
    .normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, "-");
}

export function autoMatch(
  swimmers: ParsedSwimmerLite[],
  athletes: MatchCandidate[],
  overrides: Record<string, number | null>,
): Record<string, number | null> {
  const result: Record<string, number | null> = {};
  for (const s of swimmers) {
    const key = startlistKey(s);
    if (key in overrides) { result[key] = overrides[key]; continue; }       // manual wins (incl null)
    const norm = normalizeName(`${s.lastName} ${s.firstName}`);
    let hits = athletes.filter((a) => normalizeName(a.display_name) === norm);
    if (hits.length > 1 && s.birthYear != null) {                           // birth-year tiebreak
      const byYear = hits.filter((a) => a.birthYear === s.birthYear);
      if (byYear.length === 1) hits = byYear;
    }
    result[key] = hits.length === 1 ? hits[0].id : null;                    // ambiguous/none → null
  }
  return result;
}
