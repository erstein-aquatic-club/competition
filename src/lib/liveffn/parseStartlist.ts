// Regex-based parser for liveffn "liste de départ par structure" HTML pages.
// Must run under node:test AND in the browser at runtime — hence NO DOM/JSDOM.
// Markup shape (verified against src/lib/liveffn/__fixtures__/startlist-93727-118.html):
//
//   <td colspan="7" class="resStructureIndividu1">WAGNER Francois (1999) FRA </td>
//   <tr class="survol">
//       <td>50 Nage Libre Messieurs  </td>
//       <td class="resStructureRelayeur"></td>
//       <td class="startlist_serie">série 1</td>
//       <td class="startlist_couloir">couloir 4</td>
//       <td class="temps">00:23.64</td>
//       <td class="startlist_date">Dimanche 24 Mai</td>
//       <td class="startlist_horaire">10h59</td>
//   </tr>
//
// Each race row belongs to the most recent preceding swimmer heading.

export interface StartlistRace {
  rawEvent: string; // "50 Nage Libre Messieurs" (verbatim, KEEP gender suffix)
  heat: number | null; // série number
  lane: number | null; // couloir number
  entryTimeSeconds: number | null;
  entryTimeDisplay: string; // "23.64" (normalized via formatTimeDisplay)
  day: string; // "Dimanche 24 Mai"
  time: string; // "10h59"
}

export interface StartlistSwimmer {
  lastName: string;
  firstName: string;
  birthYear: number | null;
  races: StartlistRace[];
}

export interface StartlistResult {
  clubName: string | null;
  structureCode: string | null;
  swimmers: StartlistSwimmer[];
}

/** Decode the few HTML entities we care about + collapse/trim whitespace. */
function clean(raw: string): string {
  return raw
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/<[^>]*>/g, " ") // strip any stray inline tags
    .replace(/\s+/g, " ")
    .trim();
}

/** Parse "mm:ss.cc" or "ss.cc" into seconds. Returns null when not a time. */
export function parseTime(s: string): number | null {
  const t = s.trim();
  const m = t.match(/^(?:(\d+):)?(\d{1,2})(?:\.(\d{1,2}))?$/);
  if (!m) return null;
  const min = m[1] ? parseInt(m[1], 10) : 0;
  const sec = parseInt(m[2], 10);
  const cs = m[3] ? parseInt(m[3].padEnd(2, "0"), 10) : 0;
  return min * 60 + sec + cs / 100;
}

/** Local copy of supabase/functions/_shared/ffn-parser.ts formatTimeDisplay (Deno code — do not import). */
function formatTimeDisplay(seconds: number): string {
  const min = Math.floor(seconds / 60);
  const sec = Math.floor(seconds % 60);
  const cs = Math.round((seconds % 1) * 100);
  const pad2 = (n: number) => String(n).padStart(2, "0");
  return min > 0 ? `${min}:${pad2(sec)}.${pad2(cs)}` : `${sec}.${pad2(cs)}`;
}

function extractCell(rowHtml: string, className: string): string | null {
  const re = new RegExp(`<td[^>]*class="[^"]*\\b${className}\\b[^"]*"[^>]*>([\\s\\S]*?)</td>`, "i");
  const m = rowHtml.match(re);
  return m ? clean(m[1]) : null;
}

function parseFirstCell(rowHtml: string): string {
  // The event lives in the FIRST <td> (it has no class hook).
  const m = rowHtml.match(/<td(?![^>]*class=)[^>]*>([\s\S]*?)<\/td>/i);
  return m ? clean(m[1]) : "";
}

function parseInteger(text: string | null): number | null {
  if (!text) return null;
  const m = text.match(/(\d+)/);
  return m ? parseInt(m[1], 10) : null;
}

export function parseStartlist(html: string): StartlistResult {
  // Club name + structure code — best-effort, non-critical.
  const clubMatch = html.match(/([A-ZÀ-Ÿ][A-ZÀ-Ÿ' -]*AQUATIC CLUB)/);
  const clubName = clubMatch ? clean(clubMatch[1]) : null;
  const structMatch = html.match(/structure\s*:?\s*(\d+)/i);
  const structureCode = structMatch ? structMatch[1] : null;

  // Tokenize the body into a stream of "heading" and "race" events in document order.
  // A single combined regex preserves ordering between swimmer headings and survol rows.
  const tokenRe =
    /<td[^>]*class="[^"]*\bresStructureIndividu1\b[^"]*"[^>]*>([\s\S]*?)<\/td>|<tr[^>]*class="[^"]*\bsurvol\b[^"]*"[^>]*>([\s\S]*?)<\/tr>/gi;

  const swimmers: StartlistSwimmer[] = [];
  let current: StartlistSwimmer | null = null;
  let m: RegExpExecArray | null;

  while ((m = tokenRe.exec(html)) !== null) {
    if (m[1] !== undefined) {
      // Swimmer heading: "NAME Firstname (YYYY) FRA"
      const text = clean(m[1]);
      const hm = text.match(/^([A-ZÀ-Ÿ][A-ZÀ-Ÿ' -]*?)\s+(\S.*?)\s*\((\d{4})\)/);
      let lastName = "";
      let firstName = "";
      let birthYear: number | null = null;
      if (hm) {
        lastName = hm[1].trim();
        firstName = hm[2].trim();
        birthYear = parseInt(hm[3], 10);
      } else {
        // Fallback: keep whatever text we have so the swimmer isn't dropped.
        lastName = text;
      }
      current = { lastName, firstName, birthYear, races: [] };
      swimmers.push(current);
    } else if (m[2] !== undefined && current) {
      // Race row.
      const rowHtml = m[2];
      const rawEvent = parseFirstCell(rowHtml);
      const heat = parseInteger(extractCell(rowHtml, "startlist_serie"));
      const lane = parseInteger(extractCell(rowHtml, "startlist_couloir"));
      const tempsRaw = extractCell(rowHtml, "temps") ?? "";
      const entryTimeSeconds = parseTime(tempsRaw);
      const entryTimeDisplay =
        entryTimeSeconds !== null ? formatTimeDisplay(entryTimeSeconds) : clean(tempsRaw);
      const day = extractCell(rowHtml, "startlist_date") ?? "";
      const time = extractCell(rowHtml, "startlist_horaire") ?? "";
      current.races.push({
        rawEvent,
        heat,
        lane,
        entryTimeSeconds,
        entryTimeDisplay,
        day,
        time,
      });
    }
  }

  return { clubName, structureCode, swimmers };
}
