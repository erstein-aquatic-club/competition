# Liste de départ liveffn — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Let the coach paste a liveffn "liste de départ par structure" URL on a competition and see an enriched per-swimmer / chronological schedule, each race row showing the swimmer's best recent perf + date and objective target time — identical data to the fiches objectifs.

**Architecture:** A thin authenticated edge function `liveffn-startlist` validates the URL and returns the raw HTML (CORS proxy only). All parsing, name-matching, and enrichment live in tested `src/lib/liveffn/` modules (regex-based → same code in `node:test` and browser). Event-code mapping reuses `objectiveHelpers` so numbers match the objective cards exactly. The URL + manual match overrides persist on the `competitions` record; the listing itself is re-fetched live each open.

**Tech Stack:** React 19 + TS, React Query, Supabase Edge Functions (Deno), `node:test`, Tailwind/Radix. Design doc: `docs/plans/2026-06-01-liveffn-startlist-design.md`.

**Key prior-art (read before starting):**
- `supabase/functions/ffn-performances/index.ts` — edge fn shape (CORS, `getCallerIdentity` JWT, role gate).
- `supabase/functions/_shared/cors.ts` — shared CORS headers (origin = github.io).
- `src/lib/objectiveHelpers.ts:106-183` — `eventCodeFromFfnName`, `findBestPerformance`, `formatTime`, `daysUntil`, `eventLabel`.
- `src/lib/api/records.ts:460` — `getSwimmerPerformances({userId})`; `:485` — `importSwimmerPerformances` (invoke pattern).
- `src/lib/api/objectives.ts:154` — `getObjectivesByCompetition(competitionId)`.
- `src/lib/api/users.ts:112` — `getAthletes()` → `AthleteSummary { id, display_name, group_id, ffn_iuf }`.
- `src/lib/api/competitions.ts` — `getCompetitions/createCompetition/updateCompetition`; types at `src/lib/api/types.ts:511` (`Competition`, `CompetitionInput`).
- `src/pages/coach/CoachCompetitionsScreen.tsx` (823 LOC) — competition list + edit dialog (`CompetitionForm` ~L99-241); `athletes` via `useQuery(["athletes"], getAthletes)` at L110.

**Conventions:** runner is `node:test` (`*.test.ts`), NOT vitest (a `pretest` guard fails the build if a `*.test.ts` imports vitest). Tests live next to source or under `__tests__/`. Migrations via Supabase MCP `apply_migration` (project `fscnobivsgornxdwqwlk`), file in `supabase/migrations/00XXX_*.sql`. No RLS policy change here → **no `test:rls`**.

---

## Task 1: Data-model migration + types

**Files:**
- Create: `supabase/migrations/00221_competition_startlist.sql` (verify next free number with `ls supabase/migrations | tail`)
- Modify: `src/lib/api/types.ts:511-528` (`Competition`, `CompetitionInput`)

**Step 1: Write the migration SQL**

```sql
-- 00221_competition_startlist.sql
-- liveffn startlist URL + persisted manual name→user match overrides on competitions.
alter table public.competitions
  add column if not exists liveffn_startlist_url text,
  add column if not exists startlist_athlete_map jsonb not null default '{}'::jsonb;

comment on column public.competitions.liveffn_startlist_url is
  'liveffn.com "liste de départ par structure" URL (coach-pasted).';
comment on column public.competitions.startlist_athlete_map is
  'Map normalized startlist key (lastname-firstname-year) → user id (number) or null = intentionally unmatched. Manual overrides only; auto-match fills the rest at render.';
```

**Step 2: Apply via MCP**

Use `mcp__plugin_supabase_supabase__apply_migration` with name `00221_competition_startlist` and the SQL above. (No RLS change — `competitions` already coach/admin-writable.)

**Step 3: Verify columns exist**

Run an MCP `execute_sql`: `select column_name from information_schema.columns where table_name='competitions' and column_name in ('liveffn_startlist_url','startlist_athlete_map');`
Expected: 2 rows.

**Step 4: Extend TS types**

In `src/lib/api/types.ts`, add to `Competition`:
```ts
  liveffn_startlist_url?: string | null;
  startlist_athlete_map?: Record<string, number | null> | null;
```
and to `CompetitionInput`:
```ts
  liveffn_startlist_url?: string | null;
  startlist_athlete_map?: Record<string, number | null> | null;
```
(`createCompetition`/`updateCompetition` already spread `input`, so no change needed there. `getCompetitions` uses `select("*")` → new columns flow through.)

**Step 5: Type check + commit**

Run: `npx tsc --noEmit` → Expected: exit 0.
```bash
git add supabase/migrations/00221_competition_startlist.sql src/lib/api/types.ts
git commit -m "feat(startlist): competitions.liveffn_startlist_url + startlist_athlete_map (mig 00221)"
```

---

## Task 2: Capture a real HTML fixture + write `parseStartlist` (TDD)

> We must parse the REAL liveffn HTML, not a guess. Capture a live sample first, save it as a fixture, then write the parser test against it.

**Files:**
- Create: `src/lib/liveffn/__fixtures__/startlist-93727-118.html` (captured sample)
- Create: `src/lib/liveffn/parseStartlist.ts`
- Create: `src/lib/liveffn/parseStartlist.test.ts`

**Step 1: Fixture is ALREADY captured** (committed at `src/lib/liveffn/__fixtures__/startlist-93727-118.html`, 13139 bytes, real liveffn HTML for competition 93727 / structure 118 = EAC). Do NOT re-fetch; parse this committed file. **Do not hand-fabricate HTML.**

**Step 2: Real markup (verified from the fixture)**

The page is a `<table>`. Each swimmer is a heading row, followed by one `<tr class="survol">` per race:

```html
<td colspan="7" class="resStructureIndividu1">WAGNER Francois (1999) FRA </td>
...
<tr class="survol">
    <td>50 Nage Libre Messieurs  </td>
    <td class="resStructureRelayeur"></td>
    <td class="startlist_serie">série 1</td>
    <td class="startlist_couloir">couloir 4</td>
    <td class="temps">00:23.64</td>
    <td class="startlist_date">Dimanche 24 Mai</td>
    <td class="startlist_horaire">10h59</td>
</tr>
```

Parse via these class hooks (robust): heading = `class="resStructureIndividu1"` → `NAME Firstname (YYYY) FRA`; race cells = first `<td>` (event), `.startlist_serie` ("série N"), `.startlist_couloir` ("couloir N"), `.temps` ("00:23.64"), `.startlist_date`, `.startlist_horaire`. Skip the empty `.resStructureRelayeur` cell. Races belong to the most recent preceding heading. `entryTimeDisplay`: normalize "00:23.64" via `formatTimeDisplay` → "23.64" (matches objective-card formatting); `entryTimeSeconds` via a `parseTime` helper (mm:ss.cc / ss.cc). The three swimmers in the fixture: HASAPIS Stellio (2007), NONNENMACHER Samuel (2004), WAGNER Francois (1999) — assertions in Step 3 already match the real data.

**Step 3: Write the failing test** (`parseStartlist.test.ts`)

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parseStartlist } from "./parseStartlist.ts";

const html = readFileSync(
  fileURLToPath(new URL("./__fixtures__/startlist-93727-118.html", import.meta.url)),
  "utf8",
);

test("parses every swimmer from the structure startlist", () => {
  const { swimmers } = parseStartlist(html);
  const wagner = swimmers.find((s) => s.lastName === "WAGNER" && s.firstName === "Francois");
  assert.ok(wagner, "WAGNER Francois present");
  assert.equal(wagner!.birthYear, 1999);
  const free50 = wagner!.races.find((r) => /nage libre/i.test(r.rawEvent) && /^50/.test(r.rawEvent));
  assert.ok(free50);
  assert.equal(free50!.heat, 1);
  assert.equal(free50!.lane, 4);
  assert.equal(free50!.entryTimeDisplay, "23.64");
  assert.equal(free50!.entryTimeSeconds, 23.64);
  assert.equal(free50!.day, "Dimanche 24 Mai");
  assert.equal(free50!.time, "10h59");
});

test("does not invent swimmers and keeps races attached to the right heading", () => {
  const { swimmers } = parseStartlist(html);
  assert.ok(swimmers.length >= 3);
  for (const s of swimmers) assert.ok(s.races.length >= 1, `${s.lastName} has races`);
});
```
> Adjust the asserted lane/heat/values to whatever the captured fixture actually contains (read them out of the fixture in Step 2 — the screenshot may be stale vs the live page).

**Step 4: Run → fail**

Run: `npm test -- src/lib/liveffn/parseStartlist.test.ts` (or the project's single-file invocation). Expected: FAIL (`parseStartlist` not defined).

**Step 5: Implement `parseStartlist.ts`**

Regex-based (no DOM, so it runs in node + browser). Shape:
```ts
export interface StartlistRace {
  rawEvent: string;          // "50 Nage Libre Messieurs"
  heat: number | null;       // série
  lane: number | null;       // couloir
  entryTimeSeconds: number | null;
  entryTimeDisplay: string;  // "23.64"
  day: string;               // "Dimanche 24 Mai"
  time: string;              // "10h59"
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
export function parseStartlist(html: string): StartlistResult { /* ... */ }
```
Implementation notes: split on the swimmer-heading pattern (`NAME Firstname (YYYY) FRA`), then within each block extract race lines. Reuse the time helper idea from `_shared/ffn-parser.ts:parseTime` (mm:ss.cc or ss.cc). Strip `&nbsp;`/collapse whitespace (`clean`). Keep `rawEvent` verbatim incl. "Messieurs/Dames" — gender stripping happens in Task 4.

**Step 6: Run → pass.** Iterate the regex against the real fixture until both tests pass.

**Step 7: Commit**
```bash
git add src/lib/liveffn/parseStartlist.ts src/lib/liveffn/parseStartlist.test.ts src/lib/liveffn/__fixtures__/startlist-93727-118.html
git commit -m "feat(startlist): parseStartlist + real liveffn HTML fixture"
```

---

## Task 3: Name normalization + auto-match (TDD)

**Files:**
- Create: `src/lib/liveffn/matchSwimmers.ts`
- Create: `src/lib/liveffn/matchSwimmers.test.ts`

**Step 1: Failing test**

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { startlistKey, normalizeName, autoMatch } from "./matchSwimmers.ts";

test("startlistKey is stable and order/accent/case independent", () => {
  assert.equal(startlistKey({ lastName: "WAGNER", firstName: "Francois", birthYear: 1999 }),
               "wagner-francois-1999");
});

test("normalizeName tokenizes order-independently (LASTNAME Firstname ↔ Firstname Lastname)", () => {
  assert.equal(normalizeName("WAGNER Francois"), normalizeName("François Wagner"));
});

test("autoMatch links by name; birth-year breaks ties only when both known", () => {
  const swimmers = [
    { lastName: "WAGNER", firstName: "Francois", birthYear: 1999 },
    { lastName: "NONNENMACHER", firstName: "Samuel", birthYear: 2004 },
  ];
  const athletes = [
    { id: 7, display_name: "François Wagner", birthYear: 1999 },
    { id: 9, display_name: "Samuel Nonnenmacher", birthYear: 2004 },
  ];
  const res = autoMatch(swimmers, athletes, {} /* no overrides */);
  assert.equal(res["wagner-francois-1999"], 7);
  assert.equal(res["nonnenmacher-samuel-2004"], 9);
});

test("explicit override wins over auto-match (incl. null = intentionally unmatched)", () => {
  const swimmers = [{ lastName: "WAGNER", firstName: "Francois", birthYear: 1999 }];
  const athletes = [{ id: 7, display_name: "François Wagner", birthYear: 1999 }];
  assert.equal(autoMatch(swimmers, athletes, { "wagner-francois-1999": null })["wagner-francois-1999"], null);
  assert.equal(autoMatch(swimmers, athletes, { "wagner-francois-1999": 42 })["wagner-francois-1999"], 42);
});

test("ambiguous (two same normalized names, no usable birth year) → null, not a wrong guess", () => {
  const swimmers = [{ lastName: "MARTIN", firstName: "Alex", birthYear: null }];
  const athletes = [
    { id: 1, display_name: "Alex Martin", birthYear: 2010 },
    { id: 2, display_name: "Martin Alex", birthYear: 2011 },
  ];
  assert.equal(autoMatch(swimmers, athletes, {})["martin-alex-null"], null);
});
```

**Step 2: Run → fail.**

**Step 3: Implement `matchSwimmers.ts`**

```ts
export interface MatchCandidate { id: number; display_name: string; birthYear?: number | null; }
export interface ParsedSwimmerLite { lastName: string; firstName: string; birthYear: number | null; }

export function normalizeName(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "")  // strip accents
    .toLowerCase().replace(/[^a-z\s-]/g, " ")
    .split(/[\s-]+/).filter(Boolean).sort().join(" ");        // token-set, order-independent
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
    if (hits.length > 1 && s.birthYear != null)                            // birth-year tiebreak
      hits = hits.filter((a) => a.birthYear === s.birthYear) || hits;
    result[key] = hits.length === 1 ? hits[0].id : null;                   // ambiguous/none → null
  }
  return result;
}
```

**Step 4: Run → pass. Step 5: Commit**
```bash
git add src/lib/liveffn/matchSwimmers.ts src/lib/liveffn/matchSwimmers.test.ts
git commit -m "feat(startlist): order-independent name match + persisted-override resolution"
```

---

## Task 4: Enrichment + row assembly (`buildStartlistRows`, TDD)

**Files:**
- Create: `src/lib/liveffn/buildStartlistRows.ts`
- Create: `src/lib/liveffn/buildStartlistRows.test.ts`

**Goal:** combine parsed swimmers + matched user ids + each user's perfs + the competition's objectives into enriched rows, exposed both grouped-by-swimmer and flat-chronological. Pure function (perfs/objectives passed in) so it's fully testable; the component does the I/O.

**Step 1: Failing test**

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildStartlistRows, stripGender } from "./buildStartlistRows.ts";

test("stripGender removes Messieurs/Dames/Mixte suffix", () => {
  assert.equal(stripGender("50 Nage Libre Messieurs"), "50 Nage Libre");
  assert.equal(stripGender("100 Brasse Dames"), "100 Brasse");
});

test("enriches a matched race with best perf + objective target via objectiveHelpers codes", () => {
  const swimmers = [{
    lastName: "WAGNER", firstName: "Francois", birthYear: 1999,
    races: [{ rawEvent: "50 Nage Libre Messieurs", heat: 1, lane: 4,
      entryTimeSeconds: 23.64, entryTimeDisplay: "23.64", day: "Dimanche 24 Mai", time: "10h59" }],
  }];
  const matches = { "wagner-francois-1999": 7 };
  const athleteName = { 7: "François Wagner" };
  const perfsByUser = { 7: [{ event_code: "50 NL", pool_length: 50, time_seconds: 23.9, competition_date: "2026-03-01" }] };
  const objectives = [{ athlete_id: "u7", event_code: "50NL", target_time_seconds: 23.2 }]; // see note
  const rows = buildStartlistRows({ swimmers, matches, athleteName, perfsByUser, objectivesByUser: { 7: objectives } });
  const r = rows.find((x) => x.swimmerName === "François Wagner" && /50/.test(x.rawEvent))!;
  assert.equal(r.eventCode, "50NL");
  assert.equal(r.bestPerf?.time, 23.9);
  assert.equal(r.bestPerf?.date, "2026-03-01");
  assert.equal(r.objectiveTarget, 23.2);
});

test("unmatched swimmer → row with linked=false, no perf/objective, never throws", () => {
  const swimmers = [{ lastName: "X", firstName: "Y", birthYear: null,
    races: [{ rawEvent: "50 Dos Messieurs", heat: 1, lane: 8, entryTimeSeconds: 27.55,
      entryTimeDisplay: "27.55", day: "Samedi 23 Mai", time: "17h10" }] }];
  const rows = buildStartlistRows({ swimmers, matches: { "x-y-null": null }, athleteName: {}, perfsByUser: {}, objectivesByUser: {} });
  assert.equal(rows[0].linked, false);
  assert.equal(rows[0].bestPerf, null);
});

test("chronological order helper sorts by day index then hour", () => {
  // give two races; assert the flat sorted output orders Vendredi < Samedi < Dimanche, then by HHhMM
});
```
> **Note on objective shape:** read `getObjectivesByCompetition` return (`Objective` at `types.ts:537`) — match by `event_code` AND the objective's athlete. The fn takes pre-grouped `objectivesByUser` so the test stays pure; the component groups by `athlete_id`→user id. Confirm the `Objective.athlete_id` ↔ user id relationship when wiring Task 6 (athlete_id may be a UUID; map via the athlete list).

**Step 2: Run → fail.**

**Step 3: Implement** using `eventCodeFromFfnName(stripGender(rawEvent))`, `findBestPerformance(perfs, eventCode, race-pool?)` from `src/lib/objectiveHelpers.ts`. Row type:
```ts
export interface StartlistRow {
  key: string; swimmerName: string; linked: boolean;
  rawEvent: string; eventLabel: string; eventCode: string | null;
  heat: number | null; lane: number | null;
  entryTimeSeconds: number | null; entryTimeDisplay: string;
  day: string; time: string; dayIndex: number; minutes: number;
  bestPerf: { time: number; date: string | null } | null;
  objectiveTarget: number | null;
}
```
Add a `bySwimmer(rows)` grouping and a `chronological(rows)` sorter (parse `day` against an ordered weekday+date list derived from the data, and `HHhMM`→minutes).

**Step 4: pass. Step 5: Commit**
```bash
git add src/lib/liveffn/buildStartlistRows.ts src/lib/liveffn/buildStartlistRows.test.ts
git commit -m "feat(startlist): buildStartlistRows enrichment (best perf + objective target)"
```

---

## Task 5: Edge function `liveffn-startlist` (fetch proxy) + API wrapper

**Files:**
- Create: `supabase/functions/liveffn-startlist/index.ts`
- Modify: `src/lib/api/competitions.ts` (add `fetchStartlistHtml`)
- Modify: `src/lib/api/index.ts` (re-export, follow existing pattern)

**Step 1: Edge function** (full code — it only fetches; no DB writes, no rate limit needed)

```ts
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

async function getRole(req: Request): Promise<string | null> {
  const auth = req.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) return null;
  const token = auth.replace("Bearer ", "");
  const c = createClient(supabaseUrl, supabaseAnonKey, { global: { headers: { Authorization: `Bearer ${token}` } } });
  const { data: { user } } = await c.auth.getUser(token);
  return (user?.app_metadata?.app_user_role as string) ?? null;
}

function isAllowedUrl(raw: string): boolean {
  try {
    const u = new URL(raw);
    return /(^|\.)liveffn\.com$/.test(u.hostname) && /startlist\.php$/.test(u.pathname);
  } catch { return false; }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  const role = await getRole(req);
  if (role !== "coach" && role !== "admin") return json({ error: "Accès réservé aux entraîneurs." }, 403);

  let url = "";
  try { ({ url } = await req.json()); } catch { return json({ error: "Corps invalide." }, 400); }
  if (!isAllowedUrl(url)) return json({ error: "URL liveffn invalide (attendu …liveffn.com/…/startlist.php)." }, 400);

  let html = "";
  try {
    const res = await fetch(url, { headers: { "User-Agent": "suivi-natation/1.0" } });
    if (!res.ok) return json({ error: `liveffn a répondu HTTP ${res.status}.` }, 502);
    html = await res.text();
  } catch (e) { return json({ error: `Échec de récupération: ${String(e)}` }, 502); }

  return json({ html });
});
```

**Step 2: Deploy** via `mcp__plugin_supabase_supabase__deploy_edge_function` (name `liveffn-startlist`). Verify it appears ACTIVE.

**Step 3: API wrapper** in `src/lib/api/competitions.ts`:
```ts
export async function fetchStartlistHtml(url: string): Promise<string> {
  if (!canUseSupabase()) throw new Error("Supabase non configuré");
  const { data, error } = await supabase.functions.invoke("liveffn-startlist", { body: { url } });
  if (error) throw new Error(String(data?.error ?? error.message));
  if (!data?.html) throw new Error(data?.error ?? "Réponse vide");
  return data.html as string;
}
```
Re-export in `src/lib/api/index.ts` alongside the other competitions exports.

**Step 4: tsc + commit**
```bash
npx tsc --noEmit
git add supabase/functions/liveffn-startlist/index.ts src/lib/api/competitions.ts src/lib/api/index.ts
git commit -m "feat(startlist): liveffn-startlist edge proxy + fetchStartlistHtml wrapper"
```
> Update `CLAUDE.md` Edge Functions table in Task 8.

---

## Task 6: `CompetitionStartlist` component + mount in CoachCompetitionsScreen

> **UI work → global CLAUDE.md mandates the `/frontend-design` skill.** Invoke `frontend-design` for the visual/component layer of this task; this plan specifies behavior + data wiring only.

**Files:**
- Create: `src/components/coach/CompetitionStartlist.tsx`
- Modify: `src/pages/coach/CoachCompetitionsScreen.tsx`

**Behavior:**
1. Props: `competition: Competition`. On mount, read `competition.liveffn_startlist_url`.
2. **URL field**: input + "Enregistrer" → `updateCompetition(id, { liveffn_startlist_url })` (React Query mutation, invalidate `["competitions"]`). Inline-validate host/path before enabling "Générer".
3. **Générer le listing** button → `fetchStartlistHtml(url)` → `parseStartlist(html)`.
4. **Matching**: load `getAthletes()` (already cached as `["athletes"]`). Build `MatchCandidate[]` (id, display_name; `birthYear` from `birthdate` if available — see note). `autoMatch(swimmers, candidates, competition.startlist_athlete_map ?? {})`. For each swimmer render a small select to override → on change, persist via `updateCompetition(id, { startlist_athlete_map: {...map, [key]: userId|null} })`.
5. **Enrichment**: for each matched user id, `getSwimmerPerformances({ userId })`; `getObjectivesByCompetition(competition.id)` once, group objectives by user id (map `Objective.athlete_id`→user — confirm relationship; likely via the athlete list's UUID). Call `buildStartlistRows({...})`.
6. **Views**: a toggle (Radix Tabs or segmented control) — *Par nageur* (`bySwimmer`, matched first) and *Chronologique* (`chronological`). Row shows: event label · `day` / `time` · `série N · couloir N` · best perf (`formatTime` + `daysUntil`/relative "il y a X") · objective target (`formatTime`) when present. Unmatched → neutral "non lié" badge, no perf.
7. **States**: loading spinner during fetch; error banner with retry on `fetchStartlistHtml` throw; "Aucun engagement trouvé (vérifie le lien)" when `swimmers.length === 0`.

**Mount:** in `CoachCompetitionsScreen.tsx`, add a "Liste de départ" button on each competition row/card that sets local state `startlistComp` and renders `<CompetitionStartlist competition={startlistComp} />` in a full-width Dialog/Sheet or an inline expanded panel (pick per frontend-design). Keep it out of the existing edit `CompetitionForm` (too large for the form).

> **Note (birthdate):** `AthleteSummary` from `getAthletes()` has no `birthdate`. MVP matches by name only (birth-year tiebreak degrades gracefully to "ambiguous→null"). If duplicate-name collisions appear in practice, source birthdate via a profile query later — out of scope now (YAGNI).

**Step — Verify (no node:test for the component; logic is covered by Tasks 2-4):**
- `npx tsc --noEmit` → exit 0.
- `npm run lint` → no new errors.
- Manual: run `npm run dev`, open a competition, paste the example URL, confirm swimmers list, matching, both views, and graceful unmatched/empty/error states. Use the `verify` skill / browser if available.

**Step — Commit**
```bash
git add src/components/coach/CompetitionStartlist.tsx src/pages/coach/CoachCompetitionsScreen.tsx
git commit -m "feat(startlist): CompetitionStartlist UI (by-swimmer / chronological, enriched)"
```

---

## Task 7: Full test + type + lint gate

**Step 1:** `npm test` → all green (new liveffn tests included).
**Step 2:** `npx tsc --noEmit` → exit 0.
**Step 3:** `npm run lint` → no new errors.
Fix anything red before docs. (No `test:rls` — no RLS change.)

---

## Task 8: Documentation (mandatory per CLAUDE.md workflow)

**Files:** `docs/implementation-log.md`, `docs/ROADMAP.md`, `docs/FEATURES_STATUS.md`, `CLAUDE.md`, `docs/claude/files-map.md`.

- **implementation-log.md**: new `§361` entry — context (coach pastes liveffn startlist per competition), changes (mig 00221, edge proxy `liveffn-startlist`, `src/lib/liveffn/*`, `CompetitionStartlist`), files, tests, decisions (live re-fetch; objectiveHelpers code system; edge=proxy), limits (no birthdate tiebreak yet; weak-network robustness = future).
- **ROADMAP.md**: add the `§361` line + update the top `*Dernière mise à jour*`.
- **FEATURES_STATUS.md**: add "Liste de départ liveffn par compétition" → ✅.
- **CLAUDE.md**: update "Dernier § livré" (≤15 words); add `liveffn-startlist` to the Edge Functions table.
- **files-map.md**: add `src/lib/liveffn/parseStartlist.ts`, `matchSwimmers.ts`, `buildStartlistRows.ts`, `src/components/coach/CompetitionStartlist.tsx`, `supabase/functions/liveffn-startlist/index.ts` with measured `wc -l` sizes.
- Run `graphify update .`.

**Commit**
```bash
git add docs CLAUDE.md
git commit -m "docs(§361): liste de départ liveffn par compétition"
```

---

## Out of scope (future, per user)
- Weak-network robustness: local cache of last parsed listing + "dernière mise à jour" timestamp + revalidation. The data model (URL + map, live re-fetch) is forward-compatible.
- Birthdate-based disambiguation beyond name tiebreak.
- Entry-time vs best-perf delta, pool-length provenance badge (explicitly deselected during brainstorming).
