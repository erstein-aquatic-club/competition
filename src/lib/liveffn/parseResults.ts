// Parseur regex SANS DOM de la vue "résultats par structure" liveffn.
// Tourne sous node:test ET dans le navigateur (aucun JSDOM). Frère de parseStartlist.ts.
import { clean, parseInteger, parseSwimmerHeading, parseTime } from "./parseStartlist.ts";
import { startlistKey } from "./matchSwimmers.ts";
import { eventCodeFromFfnName } from "../objectiveHelpers.ts";
import { stripGender } from "./buildStartlistRows.ts";
import type {
  ResultsSnapshot, ResultsSnapshotRace, ResultsSnapshotSwimmer,
} from "../api/types.ts";

type Phase = ResultsSnapshotRace["phase"];

/** Sépare le suffixe de phase du label, retourne la base (sans phase NI genre). */
export function classifyPhase(rawEvent: string): { phase: Phase; base: string } {
  const txt = clean(rawEvent);
  let phase: Phase = "unknown";
  let body = txt;
  const fin = txt.match(/\bFinale\s+([ABC])\b\s*$/i);
  if (fin) {
    phase = (`finale${fin[1].toUpperCase()}`) as Phase;
    body = txt.slice(0, fin.index).trim();
  } else if (/\bDemi-?finales?\b/i.test(txt)) {
    phase = "demi";
    body = txt.replace(/\bDemi-?finales?\b[^]*$/i, "").trim();
  } else if (/\bS[ée]ries?\b\s*$/i.test(txt)) {
    phase = "series";
    body = txt.replace(/\bS[ée]ries?\b\s*$/i, "").trim();
  }
  return { phase, base: stripGender(body) };
}

/** "7e"/"1er"/"1re" → number ; "DSQ"/"" → null. */
export function parsePlace(raw: string): number | null {
  const m = clean(raw).match(/^(\d+)\s*(?:er|re|nd|e|ème|ᵉ)?\b/i);
  return m ? parseInt(m[1], 10) : null;
}

/**
 * Récupère le contenu d'une cellule <td class="..."> en s'arrêtant au prochain
 * <td> ou </tr>. Contrairement à extractCell (parseStartlist), ne s'arrête PAS
 * au premier </td> imbriqué (cellule "temps" contient une <table class="split">
 * avec ses propres </td>). Retourne le HTML BRUT (non nettoyé) pour permettre un
 * traitement fin (extraction du temps de tête, parsing des splits).
 */
function cellHtml(rowHtml: string, className: string): string | null {
  const re = new RegExp(
    `<td[^>]*class="[^"]*\\b${className}\\b[^"]*"[^>]*>([\\s\\S]*?)(?=<td\\b|</tr\\b)`,
    "i",
  );
  const m = rowHtml.match(re);
  return m ? m[1] : null;
}

/** Premier token "temps" en tête de la cellule (avant la table de splits). */
function extractTime(tempsCellHtml: string): { seconds: number | null; display: string } {
  // La cellule "temps" enveloppe le temps dans un <a class="tooltip">TEMPS<b><table class="split">...
  // On coupe avant la <table class="split"> / le <b id="splitAutre">, puis on nettoie.
  const head = tempsCellHtml.split(/<table\b|<b\s+id="splitAutre"/i)[0];
  const text = clean(head);
  const m = text.match(/(?:\d+:)?\d{1,2}(?:\.\d{1,2})?/);
  const display = m ? m[0] : text;
  return { seconds: parseTime(display), display };
}

/** Splits depuis la table imbriquée class="split". */
function parseSplits(rowHtml: string): ResultsSnapshotRace["splits"] {
  const out: ResultsSnapshotRace["splits"] = [];
  const re =
    /<td class="distance">([\s\S]*?)<\/td>\s*<td class="split">([\s\S]*?)<\/td>\s*<td class="lap">([\s\S]*?)<\/td>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(rowHtml)) !== null) {
    out.push({ distance: clean(m[1]), cumulative: clean(m[2]), lap: clean(m[3]) });
  }
  return out;
}

export function parseResults(html: string): ResultsSnapshot {
  const clubMatch = html.match(/([A-ZÀ-Ÿ][A-ZÀ-Ÿ' -]*AQUATIC CLUB)/);
  const clubName = clubMatch ? clean(clubMatch[1]) : null;
  const structMatch = html.match(/structure[=:\s]*?(\d{3,})/i);
  const structureCode = structMatch ? structMatch[1] : null;

  // Tokenise headings + survol rows en ordre document.
  // La cellule "temps" contient une <table class="split"> avec ses propres <tr>/</tr>
  // (et son propre </table>) : un simple `[\s\S]*?</tr>` paresseux se ferme sur le
  // </tr> imbriqué. On ancre donc la fin de la ligne survol sur sa DERNIÈRE cellule
  // `<td class="rem">…</td></tr>` (présente sur chaque ligne, jamais dans la split-table).
  const tokenRe =
    /<td[^>]*class="[^"]*\bresStructureIndividu1\b[^"]*"[^>]*>([\s\S]*?)<\/td>|<tr[^>]*class="[^"]*\bsurvol\b[^"]*"[^>]*>([\s\S]*?<td[^>]*class="[^"]*\brem\b[^"]*"[^>]*>[\s\S]*?<\/td>)\s*<\/tr>/gi;

  const swimmers: ResultsSnapshotSwimmer[] = [];
  let current: ResultsSnapshotSwimmer | null = null;
  let m: RegExpExecArray | null;
  while ((m = tokenRe.exec(html)) !== null) {
    if (m[1] !== undefined) {
      const { lastName, firstName, birthYear } = parseSwimmerHeading(m[1]);
      current = {
        key: startlistKey({ lastName, firstName, birthYear }),
        lastName, firstName, birthYear, races: [],
      };
      swimmers.push(current);
    } else if (m[2] !== undefined && current) {
      const rowHtml = m[2];
      const evMatch = rowHtml.match(/<a[^>]*>([\s\S]*?)<\/a>/i);
      const rawEvent = evMatch ? clean(evMatch[1]) : "";
      if (!rawEvent) continue;
      const { phase, base } = classifyPhase(rawEvent);
      const eventCode = eventCodeFromFfnName(base);
      const place = parsePlace(cellHtml(rowHtml, "resStructureDetailPlace") ?? "");
      const tempsCell =
        cellHtml(rowHtml, "temps") ?? cellHtml(rowHtml, "temps_sans_tps_passage") ?? "";
      const { seconds: timeSeconds, display: timeDisplay } = extractTime(tempsCell);
      const points = parseInteger((cellHtml(rowHtml, "points") ?? "").replace(/pts/i, ""));
      current.races.push({
        rawEvent, eventCode, phase, place, timeSeconds,
        timeDisplay, points, splits: parseSplits(rowHtml),
      });
    }
  }
  return { structureCode, clubName, athleteMap: {}, swimmers };
}
