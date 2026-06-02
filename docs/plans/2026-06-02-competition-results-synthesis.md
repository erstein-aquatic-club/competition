# Synthèse « Résultats » club (liveffn) — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Importer la vue « Résultats » d'une compétition liveffn (par structure/club) pour afficher une synthèse visuelle par nageur : classement, qualifications finales, records perso, atteinte des objectifs, et rang historique en fallback.

**Architecture:** Réutilise le pipeline éprouvé de la liste de départ. L'edge fn `liveffn-startlist` (proxy HTML générique) est élargie pour accepter `resultats.php`. Un parseur regex sans DOM (`parseResults.ts`) extrait les résultats, le matcher existant (`matchSwimmers`) relie les nageurs, et un **snapshot brut** est persisté sur la compétition. Les **verdicts** (record/objectif/rang) sont calculés au rendu par des fonctions pures (`resultVerdicts.ts`) contre `swimmer_performances` + `objectives` de notre BDD — toujours à jour, testables, et cachés par React Query (donc hors-ligne OK).

**Tech Stack:** React 19 + TS, Tailwind 4, Radix/Shadcn, React Query 5, Supabase (PostgreSQL + edge fn Deno), tests `node:test`.

**Design source:** `docs/plans/2026-06-02-competition-results-synthesis-design.md`

**Réutilisation (DRY) — ne pas réécrire :**
- `eventCodeFromFfnName`, `eventLabel`, `findBestPerformance`, `formatTime` → `src/lib/objectiveHelpers.ts`
- `parseTime` (exporté), `clean`/`extractCell`/`parseInteger`/heading regex → `src/lib/liveffn/parseStartlist.ts` (à exporter, Task 2)
- `stripGender` → `src/lib/liveffn/buildStartlistRows.ts`
- `autoMatch`, `startlistKey`, `normalizeName` → `src/lib/liveffn/matchSwimmers.ts`
- `bestForEvent`, `currentSeasonStart` → `src/lib/competitions/seasonBest.ts`
- `fetchStartlistHtml` (modèle d'invoke + error surfacing) → `src/lib/api/competitions.ts`

---

## Task 1 : Migration + types + API persistence du snapshot

**Files:**
- Create: `supabase/migrations/00224_competition_results_snapshot.sql`
- Modify: `src/lib/api/types.ts` (interface `Competition` + `CompetitionInput`, ~511-534)
- Modify: `src/lib/api/competitions.ts` (nouveaux helpers)

**Step 1 — Écrire la migration**

```sql
-- 00224_competition_results_snapshot.sql
-- Stocke l'URL liveffn "Résultats" (par structure) + un snapshot BRUT des
-- résultats parsés (display-only ; n'alimente PAS swimmer_performances).
alter table public.competitions
  add column if not exists liveffn_results_url text,
  add column if not exists results_snapshot jsonb,
  add column if not exists results_imported_at timestamptz;
```

**Step 2 — Appliquer via MCP** (règle projet : jamais `db push`)

Outil : `mcp__plugin_supabase_supabase__apply_migration`, name `00224_competition_results_snapshot`, project `fscnobivsgornxdwqwlk`.
Vérifier ensuite via `list_tables` que les 3 colonnes existent. **Pas de `test:rls`** (policies inchangées, mêmes lignes).

**Step 3 — Étendre les types**

Dans `src/lib/api/types.ts`, ajouter à `Competition` :
```ts
  liveffn_results_url?: string | null;
  results_snapshot?: ResultsSnapshot | null;
  results_imported_at?: string | null;
```
et à `CompetitionInput` : `liveffn_results_url?: string | null;`.

Ajouter (en bas du bloc Competition, ~535) le type du snapshot (le contrat parseur↔UI) :
```ts
/** Snapshot BRUT des résultats liveffn (display-only — voir §364). */
export interface ResultsSnapshot {
  structureCode: string | null;
  clubName: string | null;
  /** Carte clé-nageur (startlistKey) → user_id app, figée à l'import. */
  athleteMap: Record<string, number | null>;
  swimmers: ResultsSnapshotSwimmer[];
}
export interface ResultsSnapshotSwimmer {
  key: string;        // startlistKey
  lastName: string;
  firstName: string;
  birthYear: number | null;
  races: ResultsSnapshotRace[];
}
export interface ResultsSnapshotRace {
  rawEvent: string;                 // "50 Nage Libre Messieurs Séries"
  eventCode: string | null;         // compact, base sans genre/phase
  phase: "series" | "finaleA" | "finaleB" | "finaleC" | "demi" | "unknown";
  place: number | null;
  timeSeconds: number | null;
  timeDisplay: string;
  points: number | null;
  splits: { distance: string; cumulative: string; lap: string }[];
}
```

**Step 4 — Helpers API**

Dans `src/lib/api/competitions.ts`, ajouter (calque sur `fetchStartlistHtml`) :
```ts
export async function fetchResultsHtml(url: string): Promise<string> {
  // Identique à fetchStartlistHtml : même edge fn générique (Task 6 élargit l'allowlist).
  if (!canUseSupabase()) throw new Error("Supabase non configuré");
  const { data, error } = await supabase.functions.invoke("liveffn-startlist", { body: { url } });
  if (error) {
    let detail: string | null = null;
    const ctx = (error as { context?: unknown }).context;
    if (ctx instanceof Response) {
      try { detail = ((await ctx.clone().json()) as { error?: string })?.error ?? null; } catch { /* not JSON */ }
    }
    throw new Error(detail ?? error.message);
  }
  if (!data?.html) throw new Error(data?.error ?? "Réponse vide");
  return data.html as string;
}

export async function saveResultsSnapshot(
  competitionId: string,
  url: string,
  snapshot: ResultsSnapshot,
  importedAtIso: string,
): Promise<void> {
  if (!canUseSupabase()) throw new Error("Supabase non configuré");
  assertSupabase(
    await supabase.from("competitions")
      .update({ liveffn_results_url: url, results_snapshot: snapshot, results_imported_at: importedAtIso })
      .eq("id", competitionId),
  );
}
```
Importer `ResultsSnapshot` depuis `./types`. (Vérifier les noms `canUseSupabase`/`assertSupabase` déjà importés dans le fichier ; sinon les ajouter depuis `./client`.)

**Step 5 — Type check + commit**

Run: `npx tsc --noEmit`  → Expected: exit 0
```bash
git add supabase/migrations/00224_competition_results_snapshot.sql src/lib/api/types.ts src/lib/api/competitions.ts
git commit -m "feat(résultats): migration + types + API snapshot résultats liveffn (§364)"
```

---

## Task 2 : Exporter les helpers HTML partagés de parseStartlist

But : permettre à `parseResults` de réutiliser `clean`, `extractCell`, `parseInteger`, et le parsing d'en-tête nageur SANS dupliquer (DRY).

**Files:** Modify `src/lib/liveffn/parseStartlist.ts`

**Step 1 — Exporter les helpers existants**

Passer `function clean` → `export function clean`, `function extractCell` → `export function extractCell`, `function parseInteger` → `export function parseInteger`.

**Step 2 — Extraire le parsing d'en-tête nageur dans une fonction exportée**

Remplacer le bloc inline (lignes ~113-130) par un appel à une nouvelle fonction exportée :
```ts
/** Parse "NAME Firstname (YYYY) FRA" → identité nageur. Fallback : lastName=texte brut. */
export function parseSwimmerHeading(headingHtml: string): { lastName: string; firstName: string; birthYear: number | null } {
  const text = clean(headingHtml);
  const hm = text.match(/^([A-ZÀ-Ÿ][A-ZÀ-Ÿ'\- ]*?[A-ZÀ-Ÿ])\s+([A-ZÀ-Ÿ][a-zà-ÿ].*?)\s*\((\d{4})\)/);
  if (hm) return { lastName: hm[1].trim(), firstName: hm[2].trim(), birthYear: parseInt(hm[3], 10) };
  return { lastName: text, firstName: "", birthYear: null };
}
```
et dans `parseStartlist`, remplacer le bloc heading par `const { lastName, firstName, birthYear } = parseSwimmerHeading(m[1]);`.

**Step 3 — Vérifier non-régression**

Run: `node --test src/lib/liveffn/parseStartlist.test.ts`  → Expected: PASS (inchangé)
Run: `npx tsc --noEmit`  → Expected: exit 0

**Step 4 — Commit**
```bash
git add src/lib/liveffn/parseStartlist.ts
git commit -m "refactor(liveffn): exporter clean/extractCell/parseInteger/parseSwimmerHeading (DRY §364)"
```

---

## Task 3 : Capturer la fixture HTML des résultats

**Files:** Create `src/lib/liveffn/__fixtures__/resultats-93727-118.html`

**Step 1 — Récupérer le HTML réel** (page publique, déjà vérifiée : 3 nageurs, Séries uniquement)
```bash
curl -s --max-time 30 -A "Mozilla/5.0 (compatible; suivi-natation/1.0)" \
  "https://www.liveffn.com/cgi-bin/resultats.php?competition=93727&langue=fra&go=detail&action=structure&structure=118" \
  -o src/lib/liveffn/__fixtures__/resultats-93727-118.html
wc -c src/lib/liveffn/__fixtures__/resultats-93727-118.html   # attendu ~15 Ko
grep -c resStructureIndividu1 src/lib/liveffn/__fixtures__/resultats-93727-118.html  # attendu 3
```

**Step 2 — Commit**
```bash
git add src/lib/liveffn/__fixtures__/resultats-93727-118.html
git commit -m "test(résultats): fixture HTML liveffn résultats 93727/118 (§364)"
```

---

## Task 4 : Parseur `parseResults.ts` (TDD)

**Files:**
- Create: `src/lib/liveffn/parseResults.ts`
- Test: `src/lib/liveffn/parseResults.test.ts`

Markup de référence (vérifié) :
```html
<td colspan="7" class="resStructureIndividu1">HASAPIS Stellio (2007) FRA </td>
<tr class="survol">
  <td class="resStructureDetailPlace">7e</td>
  <td><a ... class="underline">50 Nage Libre Messieurs Séries</a></td>
  <td class="resStructureRelayeur"></td>
  <td class="temps_sans_tps_passage">00:23.94</td>   <!-- ou class="temps" avec splits imbriqués -->
  <td class="reaction"></td>
  <td class="points">1177 pts</td>
  <td class="rem"></td>
</tr>
```

**Step 1 — Écrire les tests d'abord**

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { classifyPhase, parsePlace, parseResults } from "./parseResults.ts";

test("classifyPhase: séries", () => {
  assert.deepEqual(classifyPhase("50 Nage Libre Messieurs Séries"),
    { phase: "series", base: "50 Nage Libre" });
});
test("classifyPhase: finale A/B/C", () => {
  assert.equal(classifyPhase("100 Papillon Dames Finale A").phase, "finaleA");
  assert.equal(classifyPhase("100 Papillon Dames Finale B").phase, "finaleB");
  assert.equal(classifyPhase("100 Papillon Dames Finale C").phase, "finaleC");
});
test("classifyPhase: pas de suffixe → unknown + base sans genre", () => {
  assert.deepEqual(classifyPhase("200 Brasse Messieurs"),
    { phase: "unknown", base: "200 Brasse" });
});
test("parsePlace", () => {
  assert.equal(parsePlace("7e"), 7);
  assert.equal(parsePlace("1er"), 1);
  assert.equal(parsePlace("1re"), 1);
  assert.equal(parsePlace(""), null);
  assert.equal(parsePlace("DSQ"), null);
});

const html = readFileSync(
  fileURLToPath(new URL("./__fixtures__/resultats-93727-118.html", import.meta.url)), "utf8");

test("parseResults: 3 nageurs avec courses", () => {
  const r = parseResults(html);
  assert.equal(r.swimmers.length, 3);
  const stellio = r.swimmers.find((s) => s.lastName === "HASAPIS");
  assert.ok(stellio);
  assert.equal(stellio!.birthYear, 2007);
  const free50 = stellio!.races.find((x) => x.rawEvent.startsWith("50 Nage Libre"));
  assert.ok(free50);
  assert.equal(free50!.place, 7);
  assert.equal(free50!.phase, "series");
  assert.equal(free50!.eventCode, "50nl");          // valeur exacte = eventCodeFromFfnName("50 Nage Libre")
  assert.equal(free50!.timeSeconds, 23.94);
  assert.equal(free50!.points, 1177);
});

test("parseResults: capte les splits quand présents (class temps)", () => {
  const r = parseResults(html);
  const stellio = r.swimmers.find((s) => s.lastName === "HASAPIS")!;
  const free100 = stellio.races.find((x) => x.rawEvent.startsWith("100 Nage Libre"))!;
  assert.equal(free100.timeSeconds, 52.09);
  assert.ok(free100.splits.length >= 2);
});
```
> NB : confirmer la valeur exacte de `eventCodeFromFfnName("50 Nage Libre")` en l'important dans un REPL/test avant de figer `"50nl"` ; ajuster l'assertion à la valeur réelle.

**Step 2 — Lancer : doit échouer**

Run: `node --test src/lib/liveffn/parseResults.test.ts`  → Expected: FAIL (module introuvable)

**Step 3 — Implémenter `parseResults.ts`**

```ts
// Parseur regex SANS DOM de la vue "résultats par structure" liveffn.
// Tourne sous node:test ET dans le navigateur (aucun JSDOM). Frère de parseStartlist.ts.
import {
  clean, extractCell, parseInteger, parseSwimmerHeading, parseTime,
} from "./parseStartlist.ts";
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
  } else if (/\bS[ée]ries?\b\s*$/i.test(txt)) {
    phase = "series";
    body = txt.replace(/\bS[ée]ries?\b\s*$/i, "").trim();
  } else if (/\bDemi-?finale\b/i.test(txt)) {
    phase = "demi";
    body = txt.replace(/\bDemi-?finale[^]*$/i, "").trim();
  }
  return { phase, base: stripGender(body) };
}

/** "7e"/"1er"/"1re" → number ; "DSQ"/"" → null. */
export function parsePlace(raw: string): number | null {
  const m = clean(raw).match(/^(\d+)\s*(?:er|re|nd|e|ème|ᵉ)?\b/i);
  return m ? parseInt(m[1], 10) : null;
}

/** Splits depuis la table imbriquée class="split" (lap = temps cumulé, relay = inter). */
function parseSplits(rowHtml: string): ResultsSnapshotRace["splits"] {
  const out: ResultsSnapshotRace["splits"] = [];
  const re = /<td class="distance">([^<]*)<\/td>\s*<td class="split">([^<]*)<\/td>\s*<td class="lap">([^<]*)<\/td>/gi;
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

  const tokenRe =
    /<td[^>]*class="[^"]*\bresStructureIndividu1\b[^"]*"[^>]*>([\s\S]*?)<\/td>|<tr[^>]*class="[^"]*\bsurvol\b[^"]*"[^>]*>([\s\S]*?)<\/tr>/gi;

  const swimmers: ResultsSnapshotSwimmer[] = [];
  let current: ResultsSnapshotSwimmer | null = null;
  let m: RegExpExecArray | null;
  while ((m = tokenRe.exec(html)) !== null) {
    if (m[1] !== undefined) {
      const { lastName, firstName, birthYear } = parseSwimmerHeading(m[1]);
      current = { key: startlistKey({ lastName, firstName, birthYear }), lastName, firstName, birthYear, races: [] };
      swimmers.push(current);
    } else if (m[2] !== undefined && current) {
      const rowHtml = m[2];
      // Label = 1er lien <a> de la ligne (l'épreuve).
      const evMatch = rowHtml.match(/<a[^>]*>([\s\S]*?)<\/a>/i);
      const rawEvent = evMatch ? clean(evMatch[1]) : "";
      if (!rawEvent) continue; // ligne non-épreuve (en-tête de tableau, etc.)
      const { phase, base } = classifyPhase(rawEvent);
      const eventCode = eventCodeFromFfnName(base);
      const place = parsePlace(extractCell(rowHtml, "resStructureDetailPlace") ?? "");
      const tempsRaw = extractCell(rowHtml, "temps") ?? extractCell(rowHtml, "temps_sans_tps_passage") ?? "";
      const timeSeconds = parseTime(tempsRaw);
      const points = parseInteger((extractCell(rowHtml, "points") ?? "").replace(/pts/i, ""));
      current.races.push({
        rawEvent, eventCode, phase, place, timeSeconds,
        timeDisplay: tempsRaw, points, splits: parseSplits(rowHtml),
      });
    }
  }
  return { structureCode, clubName, athleteMap: {}, swimmers };
}
```
> `athleteMap` est rempli par le composant à l'import (Task 7), pas par le parseur.
> Vérifier que `extractCell` gère une cellule contenant des sous-tags (`temps` avec `<a>`/`<table>`) : il s'appuie sur `clean` qui strippe les tags → `parseTime` lit le 1er temps. Si l'extraction du temps avec splits échoue, ajuster `extractCell` ou parser `temps` via un regex dédié dans un test rouge d'abord.

**Step 4 — Lancer : doit passer**

Run: `node --test src/lib/liveffn/parseResults.test.ts`  → Expected: PASS
Run: `npx tsc --noEmit`  → Expected: exit 0

**Step 5 — Commit**
```bash
git add src/lib/liveffn/parseResults.ts src/lib/liveffn/parseResults.test.ts
git commit -m "feat(résultats): parseur liveffn résultats (place/phase/temps/points/splits) TDD (§364)"
```

---

## Task 5 : Verdicts `resultVerdicts.ts` (le cœur, TDD)

**Files:**
- Create: `src/lib/competitions/resultVerdicts.ts`
- Test: `src/lib/competitions/resultVerdicts.test.ts`

Logique : grouper par `eventCode`, replier les phases (place finale prioritaire sur séries, meilleur temps), puis calculer le verdict.

**Step 1 — Écrire les tests d'abord**

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { collapseByEvent, eventVerdict } from "./resultVerdicts.ts";
import type { ResultsSnapshotRace } from "../api/types.ts";

const race = (p: Partial<ResultsSnapshotRace>): ResultsSnapshotRace => ({
  rawEvent: "", eventCode: "50nl", phase: "series", place: null,
  timeSeconds: null, timeDisplay: "", points: null, splits: [], ...p,
});

test("collapseByEvent : finale prioritaire + meilleur temps", () => {
  const g = collapseByEvent([
    race({ phase: "series", place: 3, timeSeconds: 24.10 }),
    race({ phase: "finaleA", place: 1, timeSeconds: 23.94 }),
  ]);
  assert.equal(g.length, 1);
  assert.equal(g[0].finalPlace, 1);          // place de la finale
  assert.equal(g[0].bestTime, 23.94);
  assert.equal(g[0].qualifiedFinal, "A");
});

test("collapseByEvent : séries seules → pas de finale", () => {
  const g = collapseByEvent([race({ phase: "series", place: 7, timeSeconds: 23.94 })]);
  assert.equal(g[0].finalPlace, 7);
  assert.equal(g[0].qualifiedFinal, null);
});

const perfs = (arr: [number, string][]) =>
  arr.map(([t, d]) => ({ event_code: "50nl", pool_length: 50, time_seconds: t, competition_date: d }));

test("verdict : nouveau record perso (plus rapide que tout l'historique antérieur)", () => {
  const v = eventVerdict({
    eventCode: "50nl", poolLength: 50, time: 23.94, place: 1, compDate: "2026-05-24",
    perfs: perfs([[24.20, "2025-12-01"], [24.05, "2026-03-01"]]), objectives: [],
  });
  assert.equal(v.isNewBest, true);
  assert.ok(Math.abs(v.bestDelta! - (-0.11)) < 1e-6);
  assert.equal(v.objective, null);
  assert.equal(v.historyRank, 1);
});

test("verdict : objectif atteint (prioritaire sur rang historique)", () => {
  const v = eventVerdict({
    eventCode: "50nl", poolLength: 50, time: 23.94, place: 1, compDate: "2026-05-24",
    perfs: perfs([[24.20, "2025-12-01"]]),
    objectives: [{ event_code: "50nl", target_time_seconds: 24.00 }],
  });
  assert.equal(v.objective!.met, true);
  assert.ok(Math.abs(v.objective!.gap - (-0.06)) < 1e-6);
  assert.equal(v.historyRank, null); // pas de fallback quand objectif présent
});

test("verdict : objectif manqué", () => {
  const v = eventVerdict({
    eventCode: "50nl", poolLength: 50, time: 24.40, place: 5, compDate: "2026-05-24",
    perfs: [], objectives: [{ event_code: "50nl", target_time_seconds: 24.00 }],
  });
  assert.equal(v.objective!.met, false);
  assert.ok(Math.abs(v.objective!.gap - 0.40) < 1e-6);
});

test("verdict : rang historique en fallback (pas d'objectif)", () => {
  const v = eventVerdict({
    eventCode: "50nl", poolLength: 50, time: 24.10, place: 4, compDate: "2026-05-24",
    perfs: perfs([[23.94, "2025-12-01"], [24.05, "2026-03-01"], [24.30, "2025-10-01"]]),
    objectives: [],
  });
  assert.equal(v.isNewBest, false);
  assert.equal(v.historyRank, 3);   // 23.94 et 24.05 plus rapides → 3e
});

test("verdict : première perf sur l'épreuve (aucun historique)", () => {
  const v = eventVerdict({
    eventCode: "50nl", poolLength: 50, time: 24.10, place: 4, compDate: "2026-05-24",
    perfs: [], objectives: [],
  });
  assert.equal(v.isFirstEver, true);
  assert.equal(v.isNewBest, false);
  assert.equal(v.historyRank, 1);
});

test("verdict : filtrage bassin (un 25m plus rapide n'écrase pas un best 50m)", () => {
  const v = eventVerdict({
    eventCode: "50nl", poolLength: 50, time: 23.94, place: 1, compDate: "2026-05-24",
    perfs: [{ event_code: "50nl", pool_length: 25, time_seconds: 23.50, competition_date: "2025-12-01" }],
    objectives: [],
  });
  assert.equal(v.isNewBest, true);   // le 25m est ignoré
  assert.equal(v.isFirstEver, true); // aucun 50m antérieur
});

test("verdict : exclut la perf de CE meet déjà synchronisée (compDate)", () => {
  const v = eventVerdict({
    eventCode: "50nl", poolLength: 50, time: 23.94, place: 1, compDate: "2026-05-24",
    perfs: perfs([[23.94, "2026-05-24"], [24.20, "2025-12-01"]]), // 1re = ce meet
    objectives: [],
  });
  assert.equal(v.isNewBest, true); // ne se compare pas à lui-même
});
```

**Step 2 — Lancer : doit échouer**

Run: `node --test src/lib/competitions/resultVerdicts.test.ts`  → Expected: FAIL

**Step 3 — Implémenter `resultVerdicts.ts`**

```ts
import { findBestPerformance } from "../objectiveHelpers";
import type { ResultsSnapshotRace } from "../api/types";

type Perf = {
  event_code: string; pool_length?: number | null;
  time_seconds?: number | null; competition_date?: string | null;
};

export interface CollapsedEvent {
  eventCode: string;
  bestTime: number | null;
  finalPlace: number | null;                 // place de la phase la + significative
  qualifiedFinal: "A" | "B" | "C" | null;
  points: number | null;
  races: ResultsSnapshotRace[];
}

const PHASE_RANK: Record<ResultsSnapshotRace["phase"], number> = {
  finaleA: 5, finaleB: 4, finaleC: 3, demi: 2, series: 1, unknown: 0,
};

/** Replie les courses d'un nageur par eventCode : place = phase la + haute, temps = min. */
export function collapseByEvent(races: ResultsSnapshotRace[]): CollapsedEvent[] {
  const byCode = new Map<string, ResultsSnapshotRace[]>();
  for (const r of races) {
    const code = r.eventCode ?? `?${r.rawEvent}`;
    (byCode.get(code) ?? byCode.set(code, []).get(code)!).push(r);
  }
  const out: CollapsedEvent[] = [];
  for (const [eventCode, group] of byCode) {
    const ranked = [...group].sort((a, b) => PHASE_RANK[b.phase] - PHASE_RANK[a.phase]);
    const top = ranked[0];
    const times = group.map((r) => r.timeSeconds).filter((t): t is number => t != null);
    const finalRow = group.find((r) => r.phase.startsWith("finale"));
    const qualifiedFinal = finalRow
      ? (finalRow.phase.replace("finale", "") as "A" | "B" | "C")
      : null;
    out.push({
      eventCode,
      bestTime: times.length ? Math.min(...times) : null,
      finalPlace: top.place,
      qualifiedFinal,
      points: group.map((r) => r.points).find((p) => p != null) ?? null,
      races: group,
    });
  }
  return out;
}

export interface EventVerdict {
  isNewBest: boolean;
  isFirstEver: boolean;
  bestDelta: number | null;     // time - bestAntérieur (négatif = record battu)
  objective: { target: number; met: boolean; gap: number } | null; // gap = time - target
  historyRank: number | null;   // rang du temps dans l'historique (1 = meilleur), null si objectif
}

export function eventVerdict(input: {
  eventCode: string;
  poolLength: number | null;
  time: number;
  place: number | null;
  compDate: string;
  perfs: Perf[];
  objectives: Array<{ event_code: string; pool_length?: number | null; target_time_seconds?: number | null }>;
}): EventVerdict {
  const { eventCode, poolLength, time, compDate, perfs, objectives } = input;

  // Historique ANTÉRIEUR strict (exclut ce meet) — bassin géré par findBestPerformance.
  const prior = perfs.filter((p) => (p.competition_date ?? "") < compDate);
  const best = findBestPerformance(prior, eventCode, poolLength ?? undefined);
  const isFirstEver = best == null;
  const isNewBest = best != null && time < best.time;
  const bestDelta = best != null ? time - best.time : null;

  // Objectif : plus petit target matchant l'épreuve (bassin si renseigné).
  let target: number | null = null;
  for (const o of objectives) {
    if (o.event_code !== eventCode) continue;
    if (o.pool_length != null && poolLength != null && o.pool_length !== poolLength) continue;
    if (o.target_time_seconds == null) continue;
    if (target === null || o.target_time_seconds < target) target = o.target_time_seconds;
  }
  const objective = target != null
    ? { target, met: time <= target, gap: time - target }
    : null;

  // Rang historique (fallback) : # de temps antérieurs strictement + rapides + 1.
  // (même filtrage bassin que findBestPerformance : compare event+bassin).
  let historyRank: number | null = null;
  if (objective === null) {
    const sameScope = prior.filter(
      (p) => p.event_code === eventCode
        && p.time_seconds != null
        && (poolLength == null || p.pool_length == null || p.pool_length === poolLength),
    );
    const faster = sameScope.filter((p) => (p.time_seconds as number) < time).length;
    historyRank = faster + 1;
  }

  return { isNewBest, isFirstEver, bestDelta, objective, historyRank };
}
```
> Vérifier la signature exacte de `findBestPerformance(perfs, code, poolLength?)` (objectiveHelpers.ts:164) et son champ retour (`{ time, date }`) ; ajuster si nécessaire.

**Step 4 — Lancer : doit passer**

Run: `node --test src/lib/competitions/resultVerdicts.test.ts`  → Expected: PASS (10 tests)
Run: `npx tsc --noEmit`  → Expected: exit 0

**Step 5 — Commit**
```bash
git add src/lib/competitions/resultVerdicts.ts src/lib/competitions/resultVerdicts.test.ts
git commit -m "feat(résultats): verdicts purs record/objectif/rang + repli phases TDD (§364)"
```

---

## Task 6 : Élargir l'allowlist de l'edge fn liveffn-startlist

**Files:** Modify `supabase/functions/liveffn-startlist/index.ts` (`isAllowedUrl`, ~28-33)

**Step 1 — Accepter aussi resultats.php**

```ts
function isAllowedUrl(raw: string): boolean {
  try {
    const u = new URL(raw);
    return /(^|\.)liveffn\.com$/.test(u.hostname)
      && /(startlist|resultats)\.php$/.test(u.pathname);
  } catch { return false; }
}
```
Mettre à jour le message d'erreur 400 : `…liveffn.com/…/startlist.php ou resultats.php`.

**Step 2 — Déployer l'edge fn via MCP**

Outil : `mcp__plugin_supabase_supabase__deploy_edge_function`, project `fscnobivsgornxdwqwlk`, name `liveffn-startlist` (slug inchangé). Conserver `verify_jwt=false` (la fn gère son auth).

**Step 3 — Vérifier le déploiement** (curl direct, MCP get_logs est stale — cf. mémoire edge-function-error-surfacing)
```bash
# Doit retourner 401 "Session expirée…" (preuve que la fn tourne + auth active), PAS 400 URL.
curl -s -X POST "$SUPABASE_URL/functions/v1/liveffn-startlist" \
  -H "Content-Type: application/json" \
  -d '{"url":"https://www.liveffn.com/cgi-bin/resultats.php?competition=93727&structure=118"}' | head
```

**Step 4 — Commit + mettre à jour la table Edge Functions**

Mettre à jour `CLAUDE.md` (table Edge Functions) : note « accepte startlist.php + resultats.php » et incrémenter la version.
```bash
git add supabase/functions/liveffn-startlist/index.ts CLAUDE.md
git commit -m "feat(résultats): edge fn liveffn-startlist accepte resultats.php (§364)"
```

---

## Task 7 : Onglet `CompetitionResultsTab` (UI + import)

> **REQUIRED SUB-SKILL : `/frontend-design`** (règle globale UI obligatoire). Lui fournir la structure ci-dessous (sections A–D du design doc) ; il produit le rendu Tailwind/Shadcn.

**Files:**
- Create: `src/components/coach/competition/CompetitionResultsTab.tsx`
- (option) Create: `src/components/coach/competition/resultsTabSelectors.ts` (logique pure de l'en-tête de synthèse, testable)

**Données à charger dans le composant :**
- `competition.results_snapshot` (déjà sur la row, pas de fetch).
- Athlètes du club → `getAthletesSummary`/`athletesQuery` (déjà chargé par le parent, le passer en prop).
- Pour chaque `user_id` matché du snapshot : `getSwimmerPerformances({ userId })` (React Query, clé `["perfs", userId]`) ET `getObjectives(String(userId))`.
- `competition.pool_length` (bassin) threadé jusqu'à `eventVerdict`.

**Flux d'import (bouton « Importer les résultats ») :**
```ts
const url = liveffnResultsUrl;                       // champ Paramètres (Task 8)
const html = await fetchResultsHtml(url);
const parsed = parseResults(html);                   // ResultsSnapshot (athleteMap vide)
const candidates = athletes.map((a) => ({ id: a.id, display_name: a.name, birthYear: a.birthYear }));
const athleteMap = autoMatch(
  parsed.swimmers,                                   // {lastName, firstName, birthYear}
  candidates,
  competition.startlist_athlete_map ?? {},           // réutilise le mapping déjà fait en Jour J
);
await saveResultsSnapshot(competition.id, url, { ...parsed, athleteMap }, new Date().toISOString());
queryClient.invalidateQueries({ queryKey: ["competition", competition.id] });
```
> `new Date().toISOString()` est OK ici (code applicatif React, pas un script Workflow).

**Rendu (sections du design) :**
- **A** vide : input URL + bouton importer ; si snapshot → « Importé le {results_imported_at} » + « Réimporter ».
- **B** en-tête synthèse : tuiles agrégées (records, podiums, finales A, objectifs atteints) — calcul dans `resultsTabSelectors.ts` à partir des verdicts.
- **C** cartes par nageur (matchés d'abord, via `athleteMap`) : `collapseByEvent(swimmer.races)` → une ligne/épreuve avec `eventLabel(eventCode)`, temps (`formatTime`), place, badges du verdict (`eventVerdict`), points. Tap → splits.
- **D** nageurs non matchés (athleteMap[key] == null) listés en clair.

**#310 discipline (mémoire hooks-order) :** tous les hooks (`useQuery`, `useMemo`) AU-DESSUS de tout `return` conditionnel. Suivre le pattern de `SwimmerRaceSheet.tsx`.

**Step 1 — (si selectors) tests purs de l'en-tête de synthèse**

`resultsTabSelectors.test.ts` : à partir d'un snapshot + verdicts factices, vérifier les compteurs (records/podiums/finales/objectifs). Run `node --test ...` rouge → vert.

**Step 2 — Implémenter le composant via /frontend-design**, brancher les données ci-dessus.

**Step 3 — Vérifs**

Run: `npx tsc --noEmit` → exit 0
Run: `npm run lint` → pas d'erreur `rules-of-hooks`
Run: `npm test` → suite verte (les nouveaux tests purs inclus)

**Step 4 — Commit**
```bash
git add src/components/coach/competition/CompetitionResultsTab.tsx src/components/coach/competition/resultsTabSelectors*.ts
git commit -m "feat(résultats): onglet synthèse résultats club (cartes nageurs + verdicts) (§364)"
```

---

## Task 8 : Brancher le 4ᵉ onglet + champ URL Résultats dans CompetitionDetail

**Files:** Modify `src/components/coach/competition/CompetitionDetail.tsx`

**Step 1 — Type Tab + onglets**

Ligne ~90 : `type Tab = "nageurs" | "parametres" | "jourj" | "resultats";`
Ligne ~92-95 (tableau d'onglets) : ajouter `{ id: "resultats", label: "Résultats" }` après `jourj`.

**Step 2 — Champ URL Résultats dans Paramètres**

À côté du champ `liveffnUrl` (Paramètres, ~640) : ajouter un input `liveffnResultsUrl` (state local + persistance via `updateCompetition`), libellé « URL liveffn Résultats (par structure) » + aide « Utilisé par l'onglet Résultats ». Le `CompetitionInput`/`updateCompetition` accepte déjà `liveffn_results_url` (Task 1).

**Step 3 — Contenu de l'onglet**

```tsx
{tab === "resultats" && (
  <CompetitionResultsTab
    competition={competition}
    athletes={athletesQuery.data ?? []}
  />
)}
```
Import lazy si la page suit le pattern `lazyWithRetry` ; sinon import direct.

**Step 4 — Vérifs**

Run: `npx tsc --noEmit` → exit 0
Run: `npm run lint` → OK
Lancer l'app (`npm run dev`), ouvrir une compétition → onglet « Résultats » s'affiche ; coller l'URL 93727/118 en Paramètres, importer, vérifier les 3 nageurs + verdicts.

**Step 5 — Commit**
```bash
git add src/components/coach/competition/CompetitionDetail.tsx
git commit -m "feat(résultats): 4e onglet Résultats + champ URL dans CompetitionDetail (§364)"
```

---

## Task 9 : Documentation obligatoire (workflow projet)

**Files:**
- `docs/implementation-log.md` — entrée §364 (contexte, changements, fichiers, tests, décisions, limites)
- `docs/claude/files-map.md` — ajouter `parseResults.ts`, `resultVerdicts.ts`, `CompetitionResultsTab.tsx` (tailles via `wc -l`) ; maj `parseStartlist.ts` si variation > 30 %
- `docs/ROADMAP.md` — ligne §364 + `*Dernière mise à jour*`
- `docs/FEATURES_STATUS.md` — feature « Synthèse résultats compétition » ❌→✅
- `CLAUDE.md` — « Dernier § livré : §364 — Synthèse Résultats club (liveffn) » ; table Hubs : ajouter `CompetitionResultsTab.tsx` ; table Edge Functions déjà maj (Task 6)

**Step — Commit**
```bash
git add docs/ CLAUDE.md
git commit -m "docs(§364): synthèse Résultats club liveffn — log + files-map + roadmap + features"
```

---

## Validation finale

- `npx tsc --noEmit` → exit 0
- `npm test` → suite verte (parseResults, resultVerdicts, resultsTabSelectors, + non-régression parseStartlist)
- `npm run lint` → pas d'erreur `rules-of-hooks`
- Pas de `npm run test:rls` (migration = colonnes, policies inchangées)
- Test manuel : import 93727/118 → 3 nageurs matchés, verdicts cohérents (Stellio 50 NL 23.94 / 7ᵉ / record ou rang historique selon son historique en base)

## Limites connues / hors-scope (YAGNI)

- Pas d'écriture dans `swimmer_performances` (display-only) → les records/season-best n'incluent ces temps qu'après la sync FFN officielle.
- Pas de refresh live pendant le meet (snapshot ; bouton « Réimporter » manuel suffit).
- `clubName` ne reconnaît que le pattern « * AQUATIC CLUB » (hérité de parseStartlist) — non bloquant.
- Parsing finale A/B/C dépend du suffixe de label liveffn ; si un meet utilise un libellé inhabituel → phase `unknown` (dégradé propre, pas de crash).
```
