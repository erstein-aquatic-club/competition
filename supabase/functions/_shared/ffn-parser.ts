export function clean(v: string): string {
  return v.replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
}

export function parseTime(s: string): number | null {
  const m = s.match(/(\d+):(\d+)\.(\d+)|(\d+)\.(\d+)/);
  if (!m) return null;
  if (m[1]) return Number(m[1]) * 60 + Number(m[2]) + Number(m[3].padEnd(2, "0")) / 100;
  if (m[4]) return Number(m[4]) + Number(m[5].padEnd(2, "0")) / 100;
  return null;
}

export function parseDate(s: string): string | null {
  const m = s.match(/(\d{2})\/(\d{2})\/(\d{4})/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
}

export function formatTimeDisplay(seconds: number): string {
  const min = Math.floor(seconds / 60);
  const sec = Math.floor(seconds % 60);
  const cs = Math.round((seconds % 1) * 100);
  const pad2 = (n: number) => String(n).padStart(2, "0");
  return min > 0 ? `${min}:${pad2(sec)}.${pad2(cs)}` : `${sec}.${pad2(cs)}`;
}

export interface Rec {
  event_name: string;
  pool_length: number;
  time_seconds: number;
  record_date: string | null;
  ffn_points: number | null;
}

export interface RecFull extends Rec {
  competition_name: string | null;
  competition_location: string | null;
  swimmer_age: number | null;
}

export function parseHtmlFull(html: string, defaultPool?: number): RecFull[] {
  const results: RecFull[] = [];
  const parts = html.split(/Bassin\s*:\s*(25|50)\s*m/gi);
  let pool: number | null = defaultPool ?? null;

  for (const part of parts) {
    if (/^(25|50)$/.test(part.trim())) { pool = Number(part); continue; }
    if (!pool) continue;

    const rows = part.match(/<tr[^>]*>[\s\S]*?<\/tr>/gi) || [];
    for (const row of rows) {
      const cells = (row.match(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi) || []).map(c => clean(c.replace(/<[^>]*>/g, "")));
      if (cells.length < 2) continue;
      const time = parseTime(cells[1]);
      if (!time || /^[ée]preuve$/i.test(cells[0]) || /^nage$/i.test(cells[0])) continue;

      let date: string | null = null, pts: number | null = null;
      let competitionName: string | null = null;
      let swimmerAge: number | null = null;
      for (const c of cells.slice(2)) {
        if (!date) date = parseDate(c);
        if (!pts && /pts/i.test(c)) { const m2 = c.match(/(\d+)/); if (m2) pts = Number(m2[1]); }
        // Extract age from "(XX ans)" cells
        const ageMatch = c.match(/^\((\d+)\s*ans?\)$/i);
        if (ageMatch) { swimmerAge = Number(ageMatch[1]); continue; }
        if (!competitionName && c.length > 3 && !parseDate(c) && !/pts/i.test(c) && !/^\d+$/.test(c)) {
          competitionName = c;
        }
      }
      results.push({ event_name: cells[0], pool_length: pool, time_seconds: time, record_date: date, ffn_points: pts, competition_name: competitionName, competition_location: null, swimmer_age: swimmerAge });
    }
  }
  return results;
}

/** Fetch ALL performances for a swimmer from FFN (both 25m and 50m pools) */
export async function fetchAllPerformances(iuf: string): Promise<RecFull[]> {
  const results: RecFull[] = [];
  for (const poolSize of [25, 50] as const) {
    const url = `https://ffn.extranat.fr/webffn/nat_recherche.php?idrch_id=${iuf}&idopt=prf&idbas=${poolSize}`;
    const res = await fetch(url, { headers: { "User-Agent": "suivi-natation/1.0" } });
    if (!res.ok) {
      console.error(`[ffn-parser] Failed to fetch pool=${poolSize} for IUF=${iuf}: HTTP ${res.status}`);
      continue;
    }
    const html = await res.text();
    const parsed = parseHtmlFull(html, poolSize);
    results.push(...parsed);
  }
  // Deduplicate: FFN HTML repeats "Bassin" headers per event, causing the
  // split-based parser to emit the same row twice when a performance sits at
  // a section boundary.  PostgreSQL rejects an entire upsert batch if two
  // rows share the same conflict key, so duplicates here silently drop the
  // whole chunk (including unrelated new performances).
  const seen = new Set<string>();
  return results.filter((r) => {
    const key = `${r.event_name}|${r.pool_length}|${r.record_date}|${r.time_seconds}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function parseHtmlBests(html: string): Rec[] {
  const all = parseHtmlFull(html);
  const best = new Map<string, Rec>();
  for (const r of all) {
    const k = `${r.event_name}__${r.pool_length}`;
    if (!best.has(k) || r.time_seconds < best.get(k)!.time_seconds) best.set(k, r);
  }
  return [...best.values()];
}
