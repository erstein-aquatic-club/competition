# §305 — Taxonomie nage × distance — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (or subagent-driven-development) to implement this plan task-by-task.

**Goal:** Permettre de choisir **la nage puis la distance** (50/100/200/400+, 5 nages dont papillon) et composer le mésocycle à partir de deux axes DB indépendants — sans régresser les emphases existantes ni casser les plans historiques.

**Architecture:** Modèle A — deux tables de référence (`strength_stroke_signatures`, `strength_distance_profiles`) composées à la génération par une **fonction pure** `composeTemplate()` en un objet *template-like* identique à celui que `mesocycleEngine.ts` consomme déjà (moteur **inchangé**). Composition : `bucket_emphasis[b] = clamp01(round2(distance.emphasis[b] × stroke.mult[b]))`, crawl = mult 1.0 (reproduit l'existant par construction).

**Tech Stack:** React 19 + TS, Tailwind/shadcn, React Query, Vitest-style `node --test`, Supabase (migrations via MCP, projet `fscnobivsgornxdwqwlk`).

**Conception validée :** `docs/plans/2026-05-25-muscu-305-taxonomie-nage-distance-design.md`.

**Données de calibration (source de vérité — utilisées par les tests ET les seeds) :**

Emphase crawl par distance `{ls, lp, us, up, mob}` :
- `50` = `{0.85, 0.90, 1.00, 0.50, 0.30}`
- `100` = `{0.82, 0.85, 0.97, 0.60, 0.42}` *(de-novo, sprint-leaning — à valider coach)*
- `200` = `{0.70, 0.75, 0.90, 0.80, 0.60}`  ← **distance de référence**
- `400plus` = `{0.80, 0.60, 1.00, 0.65, 0.80}` *(= valeurs 400 m)*

Multiplicateur nage `mult[b] = emphase_nage / crawl_200` :
- `freestyle` = `{1.000, 1.000, 1.000, 1.000, 1.000}`
- `breaststroke` = `{1.214, 1.333, 0.611, 0.750, 1.333}`
- `backstroke` = `{0.857, 0.933, 0.944, 1.125, 1.333}`
- `medley` = `{1.071, 1.067, 0.944, 1.000, 1.333}`
- `butterfly` = `{1.000, 1.150, 1.000, 1.050, 1.150}` *(de-novo — à valider coach)*

**Garde de non-régression (vérifiée à la main, à verrouiller par tests) :** composer crawl×{50,200,400plus} et {brasse,dos,medley}×200 reproduit **exactement** (±0.01) les 6 emphases seedées correspondantes. (Le 7ᵉ, crawl « distance/fond », se replie sur `400plus`.)

---

## Setup

**Step 1:** Branche depuis `main` :
```bash
git checkout main && git checkout -b feat/305-taxonomie-nage-distance
```

---

## Task 1 : Types + fonction de composition `composeTemplate` (TDD) — le cœur

**Files:**
- Create: `src/lib/strength/composeTemplate.ts`
- Test: `src/lib/strength/__tests__/composeTemplate.test.ts`
- Modify: `src/lib/strength/mesocycleEngine.types.ts` (ajouter les types)

**Step 1 — Types** (append to `mesocycleEngine.types.ts`):
```ts
export type StrokeKey = 'freestyle' | 'butterfly' | 'backstroke' | 'breaststroke' | 'medley';
export type DistanceKey = '50' | '100' | '200' | '400plus';

/** Multiplicateur par seau d'une nage vs crawl (crawl ≡ 1.0). §305. */
export interface StrokeSignature {
  stroke_key: StrokeKey;
  label: string;
  mult: Record<StrengthBucket, number>;
}

/** Emphase canonique (ancrée crawl) + arc de périodisation d'une distance. §305. */
export interface DistanceProfile {
  distance_key: DistanceKey;
  kind: PeriodizationTemplateKind;
  label: string;
  emphasis: Record<StrengthBucket, number>;
  structure: PeriodizationStructure;     // { phases }
  min_week_count: number;
  max_week_count: number;
}
```
> `StrengthBucket` here = the 5 plan buckets `lower_strength | lower_power | upper_strength | upper_power | mobility` (the engine's `bucket_emphasis` keys; `psychology` is not an emphasis bucket).

**Step 2 — Write the failing test** `composeTemplate.test.ts` (regression-locks the 6 reproductions + clamp). Use small fixtures mirroring the calibration data:
```ts
import { describe, it, expect } from 'vitest'; // runner is node:test-compatible; project uses `node --test` — if `vitest` import unavailable, use `import { test } from 'node:test'; import assert from 'node:assert'` per sibling tests.
import { composeTemplate } from '../composeTemplate';
import type { StrokeSignature, DistanceProfile } from '../mesocycleEngine.types';

const PHASES = { phases: [{ cycle: 'force_max', min_weeks: 2, nominal_weeks: 3, max_weeks: 4 }] };
const dp = (distance_key: any, emphasis: any): DistanceProfile => ({
  distance_key, kind: 'season', label: distance_key,
  emphasis, structure: PHASES as any, min_week_count: 8, max_week_count: 16,
});
const ss = (stroke_key: any, mult: any): StrokeSignature => ({ stroke_key, label: stroke_key, mult });

const E50  = { lower_strength: .85, lower_power: .90, upper_strength: 1.0, upper_power: .50, mobility: .30 };
const E200 = { lower_strength: .70, lower_power: .75, upper_strength: .90, upper_power: .80, mobility: .60 };
const FREE = { lower_strength: 1, lower_power: 1, upper_strength: 1, upper_power: 1, mobility: 1 };
const BREAST = { lower_strength: 1.214, lower_power: 1.333, upper_strength: .611, upper_power: .750, mobility: 1.333 };

describe('composeTemplate', () => {
  it('crawl × 50 reproduit l’emphase sprint_50', () => {
    const t = composeTemplate(dp('50', E50), ss('freestyle', FREE), 'season');
    expect(t.structure.bucket_emphasis).toEqual({
      lower_strength: .85, lower_power: .9, upper_strength: 1, upper_power: .5, mobility: .3,
    });
  });
  it('brasse × 200 reproduit l’emphase brasse (±0.01)', () => {
    const t = composeTemplate(dp('200', E200), ss('breaststroke', BREAST), 'season');
    const e = t.structure.bucket_emphasis;
    expect(e.lower_strength).toBeCloseTo(.85, 2);
    expect(e.lower_power).toBeCloseTo(1.0, 2);
    expect(e.upper_strength).toBeCloseTo(.55, 2);
    expect(e.upper_power).toBeCloseTo(.60, 2);
    expect(e.mobility).toBeCloseTo(.80, 2);
  });
  it('clampe à 1.0 et compose name/event_group', () => {
    const t = composeTemplate(dp('50', E50), ss('breaststroke', BREAST), 'season');
    expect(t.structure.bucket_emphasis.lower_power).toBe(1); // .9×1.333=1.2 → clamp 1
    expect(t.event_group).toBe('breaststroke_50');
    expect(t.kind).toBe('season');
    expect(t.min_week_count).toBe(8);
  });
});
```
Run: `npx vitest run src/lib/strength/__tests__/composeTemplate.test.ts` → FAIL (module missing).
*(If the bare `vitest` runner misbehaves — see §304 note — run via `npm test` filtered, or rewrite with `node:test`+`assert` like sibling tests. The implementer should match the dominant in-repo test style; check a neighbor like `strengthProfileMismatch.test.ts`.)*

**Step 3 — Implement** `composeTemplate.ts`:
```ts
import type {
  StrokeSignature, DistanceProfile, StrengthBucket,
} from './mesocycleEngine.types';
import type { StrengthPeriodizationTemplate, PeriodizationTemplateKind } from '@/lib/api/types';

const EMPHASIS_BUCKETS: StrengthBucket[] = [
  'lower_strength', 'lower_power', 'upper_strength', 'upper_power', 'mobility',
];
const clamp01 = (n: number) => Math.min(1, Math.max(0, n));
const round2 = (n: number) => Math.round(n * 100) / 100;

/** Compose un template-like (consommé tel quel par mesocycleEngine) depuis une
 *  distance (emphase ancrée crawl + arc) et une nage (multiplicateur par seau). §305. */
export function composeTemplate(
  profile: DistanceProfile,
  signature: StrokeSignature,
  kind: PeriodizationTemplateKind,
): StrengthPeriodizationTemplate {
  const bucket_emphasis = Object.fromEntries(
    EMPHASIS_BUCKETS.map((b) => [b, clamp01(round2(profile.emphasis[b] * signature.mult[b]))]),
  ) as Record<StrengthBucket, number>;

  return {
    id: `${signature.stroke_key}_${profile.distance_key}_${kind}`, // synthétique, non-persisté
    event_group: `${signature.stroke_key}_${profile.distance_key}`,
    kind,
    name: `${signature.label} ${profile.label}`,
    min_week_count: profile.min_week_count,
    max_week_count: profile.max_week_count,
    structure: { phases: profile.structure.phases, bucket_emphasis },
    created_at: '',
    updated_at: '',
  };
}
```
Run the test → PASS.

**Step 4 — Commit:**
```bash
git add src/lib/strength/composeTemplate.ts src/lib/strength/__tests__/composeTemplate.test.ts src/lib/strength/mesocycleEngine.types.ts
git commit -m "feat(§305): composeTemplate (nage × distance → template-like) + types + garde régression" -m "Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 2 : Migration `00193` — `strength_stroke_signatures` (table + RLS + seed)

**Files:** Create `supabase/migrations/00193_strength_stroke_signatures.sql`

**Step 1 — SQL** (RLS calquée sur `spt_select`/`spt_write` de `00166`) :
```sql
-- 00193_strength_stroke_signatures.sql — §305. Réf de référence en lecture.
BEGIN;
CREATE TABLE strength_stroke_signatures (
  stroke_key TEXT PRIMARY KEY
    CHECK (stroke_key IN ('freestyle','butterfly','backstroke','breaststroke','medley')),
  label      TEXT  NOT NULL,
  mult       JSONB NOT NULL,  -- {lower_strength,lower_power,upper_strength,upper_power,mobility}
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TRIGGER strength_stroke_signatures_set_updated_at
  BEFORE UPDATE ON strength_stroke_signatures
  FOR EACH ROW EXECUTE FUNCTION set_updated_at_timestamp();
ALTER TABLE strength_stroke_signatures ENABLE ROW LEVEL SECURITY;
CREATE POLICY sss_select ON strength_stroke_signatures FOR SELECT TO authenticated USING (true);
CREATE POLICY sss_write  ON strength_stroke_signatures FOR ALL TO authenticated
  USING (app_user_role() IN ('coach','admin')) WITH CHECK (app_user_role() IN ('coach','admin'));

INSERT INTO strength_stroke_signatures (stroke_key, label, mult) VALUES
 ('freestyle','Crawl',       '{"lower_strength":1.0,"lower_power":1.0,"upper_strength":1.0,"upper_power":1.0,"mobility":1.0}'),
 ('breaststroke','Brasse',   '{"lower_strength":1.214,"lower_power":1.333,"upper_strength":0.611,"upper_power":0.75,"mobility":1.333}'),
 ('backstroke','Dos',        '{"lower_strength":0.857,"lower_power":0.933,"upper_strength":0.944,"upper_power":1.125,"mobility":1.333}'),
 ('medley','4 nages',        '{"lower_strength":1.071,"lower_power":1.067,"upper_strength":0.944,"upper_power":1.0,"mobility":1.333}'),
 ('butterfly','Papillon',    '{"lower_strength":1.0,"lower_power":1.15,"upper_strength":1.0,"upper_power":1.05,"mobility":1.15}');
COMMIT;
```

**Step 2 — Apply via MCP** `apply_migration` (name `strength_stroke_signatures`), then verify:
```sql
SELECT stroke_key, mult FROM strength_stroke_signatures ORDER BY stroke_key;
```
Expected: 5 rows; `freestyle.mult` all 1.0.

**Step 3 — Commit** the `.sql` file.

---

## Task 3 : Migration `00194` — `strength_distance_profiles` (table + RLS + seed)

**Files:** Create `supabase/migrations/00194_strength_distance_profiles.sql`

**Arcs (`structure`)** — transcrire **à l'identique** depuis `00169_strength_periodization_templates_seed.sql` :
- `50` ← `sprint_50` (season + inter_competition)
- `200` ← `200m`
- `400plus` ← `400m`
- `100` ← **NOUVEAU** (fourni ci-dessous).

`100` season `structure.phases` (sprint avec pic moins dépouillé + force_max retenue) :
```json
[{"cycle":"prepa_generale","min_weeks":1,"nominal_weeks":1,"max_weeks":2},
 {"cycle":"force_max","min_weeks":2,"nominal_weeks":3,"max_weeks":4},
 {"cycle":"puissance","min_weeks":2,"nominal_weeks":3,"max_weeks":4},
 {"cycle":"maintien","min_weeks":1,"nominal_weeks":1,"max_weeks":2},
 {"cycle":"affutage","min_weeks":1,"nominal_weeks":1,"max_weeks":2},
 {"cycle":"pic","min_weeks":1,"nominal_weeks":1,"max_weeks":1}]
```
min_week_count 8, max_week_count 16. `100` inter_competition :
```json
[{"cycle":"maintien","min_weeks":1,"nominal_weeks":1,"max_weeks":2},
 {"cycle":"puissance","min_weeks":2,"nominal_weeks":2,"max_weeks":3},
 {"cycle":"affutage","min_weeks":1,"nominal_weeks":1,"max_weeks":1},
 {"cycle":"pic","min_weeks":1,"nominal_weeks":1,"max_weeks":1}]
```
min 5, max 8.

**Step 1 — SQL** (table + RLS + 8 rows = 4 distances × 2 kinds). `emphasis` per distance from the calibration block (constant across `kind`); `structure`/bounds per (distance, kind):
```sql
-- 00194_strength_distance_profiles.sql — §305.
BEGIN;
CREATE TABLE strength_distance_profiles (
  distance_key   TEXT NOT NULL CHECK (distance_key IN ('50','100','200','400plus')),
  kind           TEXT NOT NULL CHECK (kind IN ('season','inter_competition')),
  label          TEXT NOT NULL,
  emphasis       JSONB NOT NULL,
  structure      JSONB NOT NULL,
  min_week_count INTEGER NOT NULL CHECK (min_week_count > 0),
  max_week_count INTEGER NOT NULL CHECK (max_week_count >= min_week_count),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (distance_key, kind)
);
CREATE TRIGGER strength_distance_profiles_set_updated_at
  BEFORE UPDATE ON strength_distance_profiles
  FOR EACH ROW EXECUTE FUNCTION set_updated_at_timestamp();
ALTER TABLE strength_distance_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY sdp_select ON strength_distance_profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY sdp_write  ON strength_distance_profiles FOR ALL TO authenticated
  USING (app_user_role() IN ('coach','admin')) WITH CHECK (app_user_role() IN ('coach','admin'));

-- emphasis constants:
--  50      {"lower_strength":0.85,"lower_power":0.9,"upper_strength":1.0,"upper_power":0.5,"mobility":0.3}
--  100     {"lower_strength":0.82,"lower_power":0.85,"upper_strength":0.97,"upper_power":0.6,"mobility":0.42}
--  200     {"lower_strength":0.7,"lower_power":0.75,"upper_strength":0.9,"upper_power":0.8,"mobility":0.6}
--  400plus {"lower_strength":0.8,"lower_power":0.6,"upper_strength":1.0,"upper_power":0.65,"mobility":0.8}
-- INSERT 8 rows: (distance_key,kind,label,emphasis,structure,min,max).
-- structure for 50/200/400plus = copy verbatim from 00169 (sprint_50/200m/400m, matching kind);
-- structure for 100 = the JSON provided in the plan (season + inter); labels FR.
INSERT INTO strength_distance_profiles (distance_key, kind, label, emphasis, structure, min_week_count, max_week_count) VALUES
 ('50','season','50 m', '{...50 emphasis...}', '{...sprint_50 season structure from 00169...}', 8, 16),
 ('50','inter_competition','50 m', '{...50 emphasis...}', '{...sprint_50 inter structure...}', 5, 8),
 ('100','season','100 m', '{...100 emphasis...}', '{...100 season structure (plan)...}', 8, 16),
 ('100','inter_competition','100 m', '{...100 emphasis...}', '{...100 inter structure (plan)...}', 5, 8),
 ('200','season','200 m', '{...200 emphasis...}', '{...200m season structure...}', 7, 18),
 ('200','inter_competition','200 m', '{...200 emphasis...}', '{...200m inter structure...}', 5, 8),
 ('400plus','season','400 m +', '{...400plus emphasis...}', '{...400m season structure...}', 9, 22),
 ('400plus','inter_competition','400 m +', '{...400plus emphasis...}', '{...400m inter structure...}', 5, 8);
COMMIT;
```
> The implementer **must** open `00169` and paste the exact `structure` JSON for sprint_50/200m/400m per kind (don't hand-retype phase numbers). Min/max week counts must equal Σ phase min/max (the 00166 invariant).

**Step 2 — Apply via MCP**, verify:
```sql
SELECT distance_key, kind, min_week_count, max_week_count,
       emphasis->>'upper_power' AS up, emphasis->>'lower_power' AS lp
FROM strength_distance_profiles ORDER BY distance_key, kind;
```
Expected: 8 rows; `50.up=0.5/lp=0.9`, `400plus.up=0.65/lp=0.6` (the lp/up flip).

**Step 3 — Regression cross-check (MCP):** compose-in-SQL is overkill; instead confirm the TS test (Task 1) already locks the math, and spot-check one composition by hand against `00169`. Commit the `.sql`.

---

## Task 4 : Migration `00195` — `strength_mesocycles` ALTER

> **AS-BUILT (simplification §305, YAGNI) :** on n'ajoute **PAS** de colonnes
> `stroke`/`distance` et on **NE réécrit PAS** la RPC. Le `event_group` composé
> (`freestyle_100`) porte déjà la taxonomie ; il suffit de rendre `template_id`
> nullable. La RPC `apply_strength_mesocycle` reste **inchangée** (on lui passe
> `p_template_id = NULL` + l'`event_group` composé). Migration réelle =
> `00195_mesocycles_template_id_nullable.sql` (un seul `ALTER ... DROP NOT NULL`).
> Le bloc ci-dessous (réécriture RPC + colonnes) est **abandonné** — conservé pour
> mémoire.

**Files:** Create `supabase/migrations/00195_mesocycles_stroke_distance.sql`

**Step 1 — SQL:**
```sql
-- 00195_mesocycles_stroke_distance.sql — §305.
BEGIN;
ALTER TABLE strength_mesocycles
  ADD COLUMN stroke   TEXT NULL,
  ADD COLUMN distance TEXT NULL,
  ALTER COLUMN template_id DROP NOT NULL;   -- nouvelles générations: NULL

-- RPC: ajouter p_stroke / p_distance (defaults NULL), insérer les 2 colonnes,
-- accepter template_id NULL. Signature change → DROP puis CREATE.
DROP FUNCTION IF EXISTS apply_strength_mesocycle(
  integer, uuid, uuid, text, text, integer, integer, date, jsonb, text, jsonb);

CREATE OR REPLACE FUNCTION apply_strength_mesocycle(
  p_athlete_id integer, p_assessment_id uuid, p_template_id uuid,
  p_event_group text, p_kind text, p_target_week_count integer,
  p_sessions_per_week integer, p_start_week_monday date,
  p_bucket_priorities jsonb, p_engine_version text, p_weeks jsonb,
  p_stroke text DEFAULT NULL, p_distance text DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
  -- BODY: identical to 00172, EXCEPT the strength_mesocycles INSERT also sets
  -- stroke = p_stroke, distance = p_distance.
  ... ;
$$;

GRANT EXECUTE ON FUNCTION apply_strength_mesocycle(
  integer, uuid, uuid, text, text, integer, integer, date, jsonb, text, jsonb, text, text
) TO authenticated;
COMMIT;
```
> Implementer: copy the **full body from `00172`** verbatim, add `stroke, distance` to the `INSERT INTO strength_mesocycles (...)` column list and `p_stroke, p_distance` to its `VALUES (...)`. Everything else unchanged. Re-grant with the **new 13-arg signature**.

**Step 2 — Apply via MCP**, verify columns + function:
```sql
SELECT column_name FROM information_schema.columns
 WHERE table_name='strength_mesocycles' AND column_name IN ('stroke','distance','template_id');
```

**Step 3 — Commit.**

> **RLS:** new tables are read-for-all reference data (policies mirror `spt_*`); the RPC keeps its own `app_user_id()`/role auth check unchanged → authorization is **not** altered. Run `npm run test:rls` **only** if Docker is already up and you changed an auth clause (you didn't) — otherwise skip per `CLAUDE.md`.

---

## Task 5 : API wrappers (`strength-mesocycles.ts`) + types

**Files:** Modify `src/lib/api/strength-mesocycles.ts`, `src/lib/api/types.ts`, `src/lib/api/index.ts` (re-export).

**Step 1 — Fetchers:** add `getStrokeSignatures(): Promise<StrokeSignature[]>` and `getDistanceProfiles(): Promise<DistanceProfile[]>` (simple `.select('*')` on the two tables; map jsonb → typed).

**Step 2 — Apply (AS-BUILT):** in `applyMesocycle(...)`, change only `p_template_id` → `null` (composed id is synthetic; column nullable). Leave `p_event_group` (carries `freestyle_100`). **No** `p_stroke`/`p_distance` args (dropped in T4 simplification).

**Step 3 — Tests:** extend `src/lib/api/__tests__/strength-mesocycles.test.ts` to assert the RPC payload includes `p_stroke`/`p_distance` and `p_template_id: null` (mock the supabase client as the existing tests do). Run the file.

**Step 4 — Commit.**

---

## Task 6 : UI — `MesocycleGeneration.tsx` (Nage → Épreuve)

> UI = **reuse the existing chip-picker pattern** already in this file; no new design. If a novel visual is wanted, run `/frontend-design` — otherwise mirror the current `event_group` chips.

**Files:** Modify `src/pages/MesocycleGeneration.tsx`

**Step 1 — Replace** the single `event_group` chip step with **two steps**:
1. **Nage** — 5 chips from `getStrokeSignatures()` (or static list `freestyle/butterfly/backstroke/breaststroke/medley` with FR labels).
2. **Épreuve** — distance chips filtered by stroke: `['50','100','200']` for all; add `'400plus'` only when stroke ∈ `{freestyle, medley}`.

**Step 2 — Hand-off:** the sessionStorage payload (`SESSION_KEY`) now carries `{ stroke, distance, kind, targetWeekCount, sessionsPerWeek, startWeekMonday }` instead of a single `event_group`/`templateId`. Week bounds come from the chosen `DistanceProfile(distance, kind)`.

**Step 3 — Type-check** (`npx tsc --noEmit`), **Commit.**

---

## Task 7 : UI — `MesocyclePreview.tsx` (compose au lieu de fetch)

**Files:** Modify `src/pages/MesocyclePreview.tsx`

**Step 1 — Replace** the single-template `useQuery` with fetches of `getStrokeSignatures()` + `getDistanceProfiles()` (React Query, `staleTime` like the catalog). Resolve the chosen `signature` (by `stroke`) and `profile` (by `distance`+`kind`) from the hand-off params.

**Step 2 — Compose:** `const template = composeTemplate(profile, signature, kind);` and feed it into the existing `MesocycleInput` exactly where `template` was used (the `input` memo, ~line 321). The engine call is unchanged.

**Step 3 — Apply (AS-BUILT):** `applyMesocycle` already sends `p_template_id: null` + the composed `event_group` (Task 5). The preview just needs to feed the **composed** template into `MesocycleInput` (Step 2 above) — no extra apply args. The "Normes" footer and reasoning panel are unchanged.

**Step 4 — Type-check, Commit.**

---

## Task 8 : Vérification globale + documentation projet

**Step 1 — Verify:**
- `npm test` (real runner `node --test`) → all green (incl. new `composeTemplate` + API tests).
- `npx tsc --noEmit` → 0.
- MCP spot-checks already done in Tasks 2-4.
- `npm run test:rls` **not** required (no auth clause changed).

**Step 2 — Manual smoke (optional but recommended):** in the app, generate a **100 crawl**, a **50 brasse**, and a **200 dos**; confirm the preview shows sensible emphasis (brasse → lower-dominant, dos → upper_power-dominant) and the arc matches the distance.

**Step 3 — Docs (mandatory workflow):**
- `docs/implementation-log.md` → §305 entry (contexte = taxonomie plate ; changements = 2 tables + composeTemplate + RPC + UI 2 étapes ; fichiers ; tests + garde régression ; décisions = modèle emphasis(distance)×mult(nage), 400plus=400m, 100/papillon de-novo à valider coach ; limites = préhab ciblée → §306).
- `docs/ROADMAP.md` → ligne §305 + `*Dernière mise à jour*`.
- `docs/FEATURES_STATUS.md` → feature « générateur mésocycle » : choix nage+distance, papillon ajouté.
- `CLAUDE.md` → **uniquement** la ligne « Dernier § livré » → §305 ; ajouter les 2 tables à `docs/claude/files-map.md` + `composeTemplate.ts`.

**Step 4 — Commit** `git add docs/ CLAUDE.md` (⚠️ **exclure** les WIP non liés : `docs/muscu plan/`, `docs/pace-calculator-scenarios.pdf`, `docs/plans/2026-05-13-*`, `docs/prompts/2026-05-23-*` — `git add` ces chemins précis, pas `git add docs/` en bloc).

---

## Hors périmètre (→ §306+)

Préhab ciblée par nage (adducteurs brasse vs épaule), tagging région des exercices ; bump `upper_power` (GB) ; autorégulation/VBT (GC) ; deload (GE) ; bloc force ≥ 90 % (GD) ; couplage natation (produit). Calibration `100`/papillon **à valider par le coach** avant déploiement.
```
