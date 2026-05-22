# Métrique d'intensité par exercice (hauteur/distance/temps) — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal :** Permettre, par exercice, de choisir une métrique d'intensité (`weight_kg | height_cm | distance_cm | time_s`) qui adapte le catalogue coach, le builder, le runner nageur et la progression — pour tracker p.ex. la hauteur de box d'un Box Jump en cm.

**Architecture :** Enum `intensity_metric` ajouté à `dim_exercices` + cible coach `target_intensity` sur `strength_session_items`. La valeur loggée réutilise `strength_set_logs.weight` (unité portée par l'exo). Une table de config `INTENSITY_METRICS` centralise labels/unités/comportement 1RM. Gating strict : aucun calcul 1RM/PR pour les métriques non-poids.

**Tech Stack :** React 19 + TypeScript + Supabase (PostgreSQL) + Vitest-syntax-but-`node:test`-runner + React Query 5 + Tailwind 4. Helpers réutilisés : `isBodyweight`/`BODYWEIGHT_SENTINEL` (`client.ts`), `estimateOneRM` (`prDetection.ts`), `computeMissing1RmExercises` (`missing1rmFilter.ts`, §297).

**Design doc :** `docs/plans/2026-05-22-intensity-metric-height-distance-time-design.md`

> **Convention tests** : `npm test` utilise `node:test` (PAS vitest). Tout nouveau test DOIT utiliser `import { describe, it } from "node:test"` + `import assert from "node:assert/strict"`. Modèle : `src/lib/api/__tests__/exerciseMappers.test.ts`.

---

## Task 1 : Migration DB — `intensity_metric` + `target_intensity`

**Files:**
- Create: `supabase/migrations/00186_intensity_metric.sql`

**Step 1 : Écrire la migration**

```sql
-- 00186_intensity_metric.sql
-- §298 — Métrique d'intensité par exercice : Box Jump → hauteur cm, etc.

-- A) Métrique d'intensité au catalogue
ALTER TABLE dim_exercices
ADD COLUMN IF NOT EXISTS intensity_metric TEXT NOT NULL DEFAULT 'weight_kg'
  CHECK (intensity_metric IN ('weight_kg','height_cm','distance_cm','time_s'));

COMMENT ON COLUMN dim_exercices.intensity_metric IS
  'Métrique d''intensité : weight_kg (défaut, charge + %1RM), height_cm (Box Jump), distance_cm (saut longueur), time_s (gainage). Pilote l''UI runner + le gating 1RM.';

-- B) Cible absolue prescrite par le coach (métriques non-poids)
ALTER TABLE strength_session_items
ADD COLUMN IF NOT EXISTS target_intensity DOUBLE PRECISION;

COMMENT ON COLUMN strength_session_items.target_intensity IS
  'Cible absolue (cm/s) prescrite par le coach pour les exos dont intensity_metric != weight_kg. NULL = libre.';
```

**Step 2 : Appliquer via MCP**

`mcp__plugin_supabase_supabase__apply_migration`, `project_id = fscnobivsgornxdwqwlk`, `name = 00186_intensity_metric`, query = SQL ci-dessus.

**Step 3 : Vérifier**

`mcp__plugin_supabase_supabase__execute_sql` :
```sql
SELECT column_name, data_type, column_default FROM information_schema.columns
WHERE (table_name='dim_exercices' AND column_name='intensity_metric')
   OR (table_name='strength_session_items' AND column_name='target_intensity');
```
Expected : 2 lignes — `intensity_metric | text | 'weight_kg'::text` et `target_intensity | double precision | NULL`.

**Step 4 : Commit**

```bash
git add supabase/migrations/00186_intensity_metric.sql
git commit -m "feat(§298): migration intensity_metric + target_intensity"
```

---

## Task 2 : Module `intensityMetrics.ts` + tests

**Files:**
- Create: `src/lib/strength/intensityMetrics.ts`
- Test: `src/lib/strength/__tests__/intensityMetrics.test.ts`

**Step 1 : Écrire le test (node:test)**

```ts
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { INTENSITY_METRICS, formatIntensity, type IntensityMetric } from "@/lib/strength/intensityMetrics";

describe("intensityMetrics (§298)", () => {
  it("expose les 4 métriques avec config cohérente", () => {
    const keys = Object.keys(INTENSITY_METRICS).sort();
    assert.deepEqual(keys, ["distance_cm", "height_cm", "time_s", "weight_kg"]);
  });

  it("seul weight_kg tracksOneRm + hasBodyweight", () => {
    assert.equal(INTENSITY_METRICS.weight_kg.tracksOneRm, true);
    assert.equal(INTENSITY_METRICS.weight_kg.hasBodyweight, true);
    for (const m of ["height_cm", "distance_cm", "time_s"] as IntensityMetric[]) {
      assert.equal(INTENSITY_METRICS[m].tracksOneRm, false, `${m} tracksOneRm`);
      assert.equal(INTENSITY_METRICS[m].hasBodyweight, false, `${m} hasBodyweight`);
    }
  });

  it("formatIntensity rend valeur + unité", () => {
    assert.equal(formatIntensity(75, "weight_kg"), "75 kg");
    assert.equal(formatIntensity(60, "height_cm"), "60 cm");
    assert.equal(formatIntensity(180, "distance_cm"), "180 cm");
    assert.equal(formatIntensity(30, "time_s"), "30 s");
  });

  it("formatIntensity rend — pour null/0", () => {
    assert.equal(formatIntensity(null, "height_cm"), "—");
    assert.equal(formatIntensity(0, "height_cm"), "—");
    assert.equal(formatIntensity(undefined, "weight_kg"), "—");
  });
});
```

**Step 2 : Run (must fail)**

```bash
node --test --experimental-test-module-mocks --import tsx src/lib/strength/__tests__/intensityMetrics.test.ts 2>&1 | tail -10
```
Expected : import error (module absent).

**Step 3 : Implémenter le module**

```ts
// src/lib/strength/intensityMetrics.ts
export type IntensityMetric = "weight_kg" | "height_cm" | "distance_cm" | "time_s";

interface MetricConfig {
  label: string;        // libellé tile runner / champ
  unit: string;         // suffixe affiché
  tracksOneRm: boolean; // déclenche estimation 1RM + OneRmGate ?
  hasBodyweight: boolean; // propose le bouton PDC ?
  selectLabel: string;  // libellé dans le Select coach
  max: number;          // borne haute de saisie (numpad)
}

export const INTENSITY_METRICS: Record<IntensityMetric, MetricConfig> = {
  weight_kg:   { label: "Charge",   unit: "kg", tracksOneRm: true,  hasBodyweight: true,  selectLabel: "Charge (kg)",   max: 1000 },
  height_cm:   { label: "Hauteur",  unit: "cm", tracksOneRm: false, hasBodyweight: false, selectLabel: "Hauteur (cm)",  max: 300  },
  distance_cm: { label: "Distance", unit: "cm", tracksOneRm: false, hasBodyweight: false, selectLabel: "Distance (cm)", max: 500  },
  time_s:      { label: "Temps",    unit: "s",  tracksOneRm: false, hasBodyweight: false, selectLabel: "Temps (s)",     max: 3600 },
};

export const DEFAULT_INTENSITY_METRIC: IntensityMetric = "weight_kg";

export function normalizeIntensityMetric(v: unknown): IntensityMetric {
  return v === "height_cm" || v === "distance_cm" || v === "time_s" ? v : "weight_kg";
}

export function formatIntensity(value: number | null | undefined, metric: IntensityMetric): string {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return "—";
  return `${n} ${INTENSITY_METRICS[metric].unit}`;
}
```

**Step 4 : Run (must pass)**

```bash
node --test --experimental-test-module-mocks --import tsx src/lib/strength/__tests__/intensityMetrics.test.ts 2>&1 | tail -10
```
Expected : 4 tests pass.

**Step 5 : Type check + commit**

```bash
npx tsc --noEmit
git add src/lib/strength/intensityMetrics.ts src/lib/strength/__tests__/intensityMetrics.test.ts
git commit -m "feat(§298): module intensityMetrics (config + formatIntensity) + tests"
```

---

## Task 3 : `Exercise.intensity_metric` — type + mappers

**Files:**
- Modify: `src/lib/api/types.ts` (interface `Exercise`)
- Modify: `src/lib/api/client.ts` (`mapDbExerciseToApi` ~219, `mapApiExerciseToDb` ~246)
- Modify: `src/lib/api/helpers.ts` (`normalizeExercise` ~66)
- Test: `src/lib/api/__tests__/exerciseMappers.test.ts` (étendre l'existant §297)

**Step 1 : Étendre le test existant**

Ajouter dans `src/lib/api/__tests__/exerciseMappers.test.ts` un nouveau `describe` :

```ts
import { normalizeIntensityMetric } from "@/lib/strength/intensityMetrics";

describe("exercise mappers — intensity_metric (§298)", () => {
  it("mapDbExerciseToApi lit intensity_metric", () => {
    const r = mapDbExerciseToApi({ id: 1, nom_exercice: "Box Jump", intensity_metric: "height_cm" });
    assert.equal(r.intensity_metric, "height_cm");
  });
  it("mapDbExerciseToApi défaut weight_kg si absent ou invalide", () => {
    assert.equal(mapDbExerciseToApi({ id: 1, nom_exercice: "Squat" }).intensity_metric, "weight_kg");
    assert.equal(mapDbExerciseToApi({ id: 1, nom_exercice: "X", intensity_metric: "bogus" }).intensity_metric, "weight_kg");
  });
  it("mapApiExerciseToDb écrit intensity_metric (défaut weight_kg)", () => {
    assert.equal((mapApiExerciseToDb({ id: 1, nom_exercice: "Box Jump", intensity_metric: "height_cm" } as any) as any).intensity_metric, "height_cm");
    assert.equal((mapApiExerciseToDb({ id: 1, nom_exercice: "Squat" } as any) as any).intensity_metric, "weight_kg");
  });
  it("normalizeExercise préserve intensity_metric", () => {
    assert.equal(normalizeExercise({ id: 1, nom_exercice: "Box Jump", intensity_metric: "height_cm" }).intensity_metric, "height_cm");
  });
});
```

**Step 2 : Run (must fail)**

```bash
node --test --experimental-test-module-mocks --import tsx src/lib/api/__tests__/exerciseMappers.test.ts 2>&1 | tail -10
```
Expected : nouveaux tests échouent (`intensity_metric` undefined).

**Step 3 : Type**

`src/lib/api/types.ts`, interface `Exercise`, après `is_bodyweight?: boolean;` :
```ts
  /** §298 — Métrique d'intensité. Défaut 'weight_kg'. Pilote runner UI + gating 1RM. */
  intensity_metric?: import("@/lib/strength/intensityMetrics").IntensityMetric;
```
(ou importer le type en haut du fichier si plus propre.)

**Step 4 : Mappers**

`client.ts` — ajouter l'import `import { normalizeIntensityMetric } from "@/lib/strength/intensityMetrics";` puis :
- `mapDbExerciseToApi` : `intensity_metric: normalizeIntensityMetric(row.intensity_metric),`
- `mapApiExerciseToDb` : `intensity_metric: normalizeIntensityMetric(exercise.intensity_metric),`

`helpers.ts` — `normalizeExercise` : `intensity_metric: normalizeIntensityMetric(exercise.intensity_metric),` (importer le helper).

**Step 5 : Run (must pass) + tsc**

```bash
node --test --experimental-test-module-mocks --import tsx src/lib/api/__tests__/exerciseMappers.test.ts 2>&1 | tail -10
npx tsc --noEmit
```
Expected : tous verts, tsc 0.

**Step 6 : Commit**

```bash
git add src/lib/api/types.ts src/lib/api/client.ts src/lib/api/helpers.ts src/lib/api/__tests__/exerciseMappers.test.ts
git commit -m "feat(§298): intensity_metric sur Exercise + mappers + tests"
```

---

## Task 4 : `StrengthSessionItem.target_intensity` — type + mapping read/write

**Files:**
- Modify: `src/lib/api/types.ts` (`StrengthSessionItem`)
- Modify: `src/lib/api/client.ts` (`normalizeStrengthItem` ~180)
- Modify: `src/lib/api/transformers.ts` (`prepareStrengthItemsPayload` ~41, `mapItemsForDbInsert` ~71)
- Modify: `src/lib/api/strength.ts` (`updateStrengthSession` rpcItems ~279, duplicate select ~1451 + insert ~1472)
- Test: `src/lib/api/__tests__/strengthItemTarget.test.ts` (nouveau)

**Step 1 : Test du round-trip item (node:test)**

```ts
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { normalizeStrengthItem } from "@/lib/api/client";
import { prepareStrengthItemsPayload } from "@/lib/api/transformers";

describe("strength item — target_intensity (§298)", () => {
  it("normalizeStrengthItem lit target_intensity depuis le DB", () => {
    const item = normalizeStrengthItem({ exercise_id: 8, ordre: 0, sets: 4, reps: 5, target_intensity: 60 }, 0, "normal");
    assert.equal(item.target_intensity, 60);
  });
  it("normalizeStrengthItem → null si absent", () => {
    const item = normalizeStrengthItem({ exercise_id: 1, ordre: 0, sets: 4, reps: 5 }, 0, "normal");
    assert.equal(item.target_intensity ?? null, null);
  });
  it("prepareStrengthItemsPayload propage target_intensity dans le payload", () => {
    const { itemsPayload } = prepareStrengthItemsPayload({
      cycle: "normal",
      items: [{ exercise_id: 8, order_index: 0, sets: 4, reps: 5, target_intensity: 60 }],
    });
    assert.equal(itemsPayload[0].target_intensity, 60);
  });
});
```

**Step 2 : Run (must fail)**

```bash
node --test --experimental-test-module-mocks --import tsx src/lib/api/__tests__/strengthItemTarget.test.ts 2>&1 | tail -10
```

**Step 3 : Type**

`types.ts`, interface `StrengthSessionItem`, ajouter :
```ts
  /** §298 — Cible absolue (cm/s) prescrite par le coach pour metric != weight_kg. NULL = libre. */
  target_intensity?: number | null;
```

**Step 4 : Read mapping**

`client.ts` `normalizeStrengthItem` : ajouter
```ts
  target_intensity: item.target_intensity == null ? null : Number(item.target_intensity),
```

**Step 5 : Write mapping**

`transformers.ts` :
- `prepareStrengthItemsPayload` : dans le `.map(...)` du `itemsPayload`, ajouter `target_intensity: item.target_intensity ?? null,`
- `mapItemsForDbInsert` : ajouter `target_intensity: item.target_intensity ?? null,`
- Étendre le type `DbStrengthItemPayload` (dans transformers.ts ou son fichier de types) avec `target_intensity?: number | null;`

`strength.ts` :
- `updateStrengthSession` rpcItems (~287) : ajouter `target_intensity: item.target_intensity ?? null,`
- duplicate session select (~1451) : ajouter `target_intensity` à la liste `.select(...)`
- duplicate insert copyItems (~1472) : ajouter `target_intensity: it.target_intensity,`

**Step 6 : RPC paginated — vérifier la projection**

⚠ Le builder coach peut lire les sessions via `get_strength_catalog_paginated` (RPC). Vérifier si elle renvoie `target_intensity` dans les items :
```bash
# Inspecter le corps de la fonction
```
```sql
SELECT pg_get_functiondef('get_strength_catalog_paginated'::regproc);
```
(via `mcp__plugin_supabase_supabase__execute_sql`). Si la fonction construit le JSON des items avec une liste de champs explicite SANS `target_intensity`, créer une migration `00187_catalog_paginated_target_intensity.sql` qui recompile la fonction avec le champ ajouté, appliquer via MCP. Si elle fait `to_jsonb(i.*)` ou `select *`, rien à faire.

**Step 7 : Run tests + tsc**

```bash
node --test --experimental-test-module-mocks --import tsx src/lib/api/__tests__/strengthItemTarget.test.ts 2>&1 | tail -10
npx tsc --noEmit
npm test -- --run 2>&1 | tail -6
```
Expected : verts, 0 régression.

**Step 8 : Commit**

```bash
git add src/lib/api/types.ts src/lib/api/client.ts src/lib/api/transformers.ts src/lib/api/strength.ts src/lib/api/__tests__/strengthItemTarget.test.ts supabase/migrations/00187_*.sql 2>/dev/null
git commit -m "feat(§298): target_intensity sur StrengthSessionItem (read/write + duplication)"
```

---

## Task 5 : `missing1rmFilter` exclut les métriques non-poids

**Files:**
- Modify: `src/lib/strength/missing1rmFilter.ts`
- Test: `src/pages/__tests__/strength_missing1rm_filter.test.ts` (étendre §297)

**Step 1 : Étendre le test**

Ajouter un cas dans le `describe` existant :

```ts
it("exclut les exos dont intensity_metric != weight_kg (§298)", () => {
  const lookup = new Map([
    [8, { id: 8, nom_exercice: "Box Jump", exercise_type: "strength", is_bodyweight: false, intensity_metric: "height_cm" } as any],
  ]);
  const items = [{ exercise_id: 8, percent_1rm: 75 }] as any;
  const result = computeMissing1RmExercises(items, [], lookup);
  assert.deepEqual(result, []);
});
```

**Step 2 : Run (must fail)**

```bash
node --test --experimental-test-module-mocks --import tsx src/pages/__tests__/strength_missing1rm_filter.test.ts 2>&1 | tail -10
```
Expected : le nouveau cas échoue (Box Jump renvoyé).

**Step 3 : Modifier le filtre**

`missing1rmFilter.ts` — le `.filter` sur `is_bodyweight` devient :
```ts
.filter((item) => {
  const ex = exerciseLookup.get(item.exercise_id);
  if (ex?.is_bodyweight) return false;
  // §298 — seules les métriques weight_kg utilisent un 1RM
  if (ex?.intensity_metric && ex.intensity_metric !== "weight_kg") return false;
  return true;
})
```

**Step 4 : Run (must pass)**

```bash
node --test --experimental-test-module-mocks --import tsx src/pages/__tests__/strength_missing1rm_filter.test.ts 2>&1 | tail -10
```

**Step 5 : Commit**

```bash
git add src/lib/strength/missing1rmFilter.ts src/pages/__tests__/strength_missing1rm_filter.test.ts
git commit -m "feat(§298): OneRmGate ignore les exos à métrique non-poids"
```

---

## Task 6 : Gating 1RM dans `logStrengthSet` (`skip_one_rm`)

**Files:**
- Modify: `src/lib/api/strength.ts` (`logStrengthSet` — `maybeUpdateOneRm` ~422, RPC estimate ~499, payload type)
- Test: `src/lib/api/__tests__/strength.test.ts` (étendre si un test couvre déjà logStrengthSet) OU nouveau `src/lib/api/__tests__/logStrengthSetGating.test.ts`

**Step 1 : Comprendre le point d'injection**

Le payload de `logStrengthSet` est typé en haut de la fonction. Il faut :
- Ajouter `skip_one_rm?: boolean;` au type du payload.
- Dans `maybeUpdateOneRm` (~423) : `if (isBodyweight(payload.weight) || payload.skip_one_rm) return null;`
- Dans le calcul RPC (~499-502) : `const oneRmEstimate = (isBodyweight(payload.weight) || payload.skip_one_rm) ? null : estimateOneRm(...)`

**Step 2 : Test (node:test) — vérifier que skip_one_rm coupe l'estimation**

Le plus simple : test unitaire de la condition de gating extraite. Si `logStrengthSet` est trop couplé à Supabase pour un test direct, extraire un helper pur :

```ts
// dans strength.ts, exporter :
export function shouldSkipOneRm(weight: number | null | undefined, skipFlag?: boolean): boolean {
  return isBodyweight(weight) || skipFlag === true;
}
```

Test `src/lib/api/__tests__/logStrengthSetGating.test.ts` :
```ts
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { shouldSkipOneRm } from "@/lib/api/strength";
import { BODYWEIGHT_SENTINEL } from "@/lib/api/client";

describe("shouldSkipOneRm (§298)", () => {
  it("skip si bodyweight sentinel", () => assert.equal(shouldSkipOneRm(BODYWEIGHT_SENTINEL), true));
  it("skip si flag explicite (métrique non-poids)", () => assert.equal(shouldSkipOneRm(60, true), true));
  it("ne skip pas un vrai poids", () => assert.equal(shouldSkipOneRm(75, false), false));
  it("ne skip pas un vrai poids sans flag", () => assert.equal(shouldSkipOneRm(75), false));
});
```

**Step 3 : Run (must fail)**

```bash
node --test --experimental-test-module-mocks --import tsx src/lib/api/__tests__/logStrengthSetGating.test.ts 2>&1 | tail -10
```

**Step 4 : Implémenter `shouldSkipOneRm` + brancher dans les 2 chemins**

Ajouter la fonction exportée + remplacer les 2 conditions de gating par `shouldSkipOneRm(payload.weight, payload.skip_one_rm)`.

**Step 5 : Run (must pass) + tsc + full**

```bash
node --test --experimental-test-module-mocks --import tsx src/lib/api/__tests__/logStrengthSetGating.test.ts 2>&1 | tail -10
npx tsc --noEmit
npm test -- --run 2>&1 | tail -6
```

**Step 6 : Commit**

```bash
git add src/lib/api/strength.ts src/lib/api/__tests__/logStrengthSetGating.test.ts
git commit -m "feat(§298): gating 1RM via skip_one_rm pour les métriques non-poids"
```

---

## Task 7 : Catalogue coach — Select métrique

**Files:**
- Modify: `src/pages/coach/StrengthCatalog.tsx` (dialogs création + édition)

**Step 1 : Ajouter le Select dans le dialog d'édition**

Près de la checkbox PDC (`bodyweight-flag-edit`, §297), ajouter un `Select` (composant déjà importé l. 37) :

```tsx
<div className="space-y-2">
  <Label>Métrique d'intensité</Label>
  <Select
    value={editingExercise.intensity_metric ?? "weight_kg"}
    onValueChange={(v) => {
      const metric = v as IntensityMetric;
      setEditingExercise((prev) => prev ? {
        ...prev,
        intensity_metric: metric,
        // §298 — métriques non-poids : pas de %1RM ni PDC
        ...(metric !== "weight_kg"
          ? { is_bodyweight: false, pct_1rm_endurance: null, pct_1rm_hypertrophie: null, pct_1rm_force: null }
          : {}),
      } : prev);
    }}
  >
    <SelectTrigger><SelectValue /></SelectTrigger>
    <SelectContent>
      {(Object.keys(INTENSITY_METRICS) as IntensityMetric[]).map((m) => (
        <SelectItem key={m} value={m}>{INTENSITY_METRICS[m].selectLabel}</SelectItem>
      ))}
    </SelectContent>
  </Select>
</div>
```

Importer en haut : `import { INTENSITY_METRICS, type IntensityMetric } from "@/lib/strength/intensityMetrics";`

**Step 2 : Masquer la checkbox PDC + griser %1RM quand metric != weight_kg**

- Wrapper la checkbox PDC `bodyweight-flag-edit` (§297) dans `{(editingExercise.intensity_metric ?? "weight_kg") === "weight_kg" && (...)}`.
- Wrapper `<ExerciseCycleTabs ... />` dans un conteneur grisé/désactivé quand `metric !== "weight_kg"` : soit `<fieldset disabled={metric !== "weight_kg"} className={metric !== "weight_kg" ? "opacity-50 pointer-events-none" : ""}>`, soit afficher un message "Les % 1RM ne s'appliquent pas à cette métrique."

**Step 3 : Idem dans le dialog de création (`newExercise`)**

Répliquer le Select + masquage PDC + grisage avec `newExercise` / `setNewExercise`.

**Step 4 : Type check + smoke (lire le diff, pas de dev server)**

```bash
npx tsc --noEmit
```
Re-lire le diff pour confirmer la cohérence des 2 dialogs.

**Step 5 : Commit**

```bash
git add src/pages/coach/StrengthCatalog.tsx
git commit -m "feat(§298): Select métrique d'intensité dans le catalogue coach"
```

---

## Task 8 : Builder de séance — champ "Cible (unité)"

**Files:**
- Modify: `src/components/coach/strength/StrengthExerciseCard.tsx` (+ le builder qui passe `exercises`)

**Step 1 : Localiser le champ %1RM dans `StrengthExerciseCard`**

```bash
grep -n "percent_1rm\|pct_1rm\|1RM\|%" src/components/coach/strength/StrengthExerciseCard.tsx
```

**Step 2 : Rendre le champ conditionnel**

Résoudre la métrique de l'exo courant :
```ts
import { INTENSITY_METRICS, type IntensityMetric } from "@/lib/strength/intensityMetrics";
const metric = (currentExercise?.intensity_metric ?? "weight_kg") as IntensityMetric;
```

Si `metric === "weight_kg"` → champ "%1RM" inchangé (écrit `percent_1rm`).
Sinon → afficher un champ numérique **"Cible {label} ({unit})"** qui écrit `target_intensity` via `onChange("target_intensity", value)` :
```tsx
{metric !== "weight_kg" ? (
  <div className="space-y-1">
    <Label className="text-xs">Cible {INTENSITY_METRICS[metric].label} ({INTENSITY_METRICS[metric].unit})</Label>
    <Input
      type="number"
      value={exercise.target_intensity ?? ""}
      placeholder={INTENSITY_METRICS[metric].unit}
      onChange={(e) => onChange("target_intensity", e.target.value === "" ? null : Number(e.target.value))}
    />
  </div>
) : (
  /* champ %1RM existant */
)}
```

Vérifier que `onChange` du composant accepte bien `(field, value)` et que `target_intensity` est routé jusqu'au state du builder (qui construit `session.items`). Si le builder filtre les champs persistés, ajouter `target_intensity` à la liste.

**Step 3 : Type check**

```bash
npx tsc --noEmit
```

**Step 4 : Commit**

```bash
git add src/components/coach/strength/StrengthExerciseCard.tsx
git commit -m "feat(§298): champ Cible (cm/s) dans le builder pour métriques non-poids"
```

---

## Task 9 : WorkoutRunner — tile adaptative + target + gating

**Files:**
- Modify: `src/components/strength/WorkoutRunner.tsx`

**Step 1 : Dériver la métrique**

Après `isBodyweightExercise` (§297, ~l.299) :
```ts
import { INTENSITY_METRICS, type IntensityMetric } from "@/lib/strength/intensityMetrics";
const metric = (currentExerciseDef?.intensity_metric ?? "weight_kg") as IntensityMetric;
const metricCfg = INTENSITY_METRICS[metric];
const tracksWeight = metric === "weight_kg";
```

**Step 2 : targetValue adaptatif**

Repérer `const targetWeight = hasPercent ? Math.round(rm * (percentValue / 100)) : 0;` (~l.343). Ajouter juste après :
```ts
// §298 — pour les métriques non-poids, la cible vient de l'item (target_intensity), pas du 1RM
const targetValue = tracksWeight ? targetWeight : Number(currentBlock?.target_intensity ?? 0);
```
Puis remplacer les usages de `targetWeight` qui servent de **valeur par défaut de saisie** (activeWeight ~439, openInputSheet ~676/733, suggestions ~825/1463) par `targetValue`. ⚠ NE PAS toucher les usages liés au calcul 1RM/PR (qui sont gatés Step 5). Lire chaque occurrence avant substitution.

**Step 3 : Label + unité de la tile "Charge"**

La tile (§297, masquée si bodyweight) : remplacer le libellé `"Charge"` et le suffixe `"kg"` par `metricCfg.label` / `metricCfg.unit`. La logique d'affichage PDC (`isBodyweight(activeWeight) ? "PDC" : ...`) ne s'applique que si `metricCfg.hasBodyweight` ; sinon afficher juste `{value} {unit}`.

**Step 4 : Numpad — PDC + bornes + suggestions**

Dans le drawer d'input (`applyDraftValue` ~662, suggestions ~1500) :
- Bouton "PDC" affiché seulement si `metricCfg.hasBodyweight`.
- Borne haute : remplacer le `1000` en dur par `metricCfg.max` (et garder `0` en borne basse). Reps inchangé.
- Suggestions `targetWeight ± 5/10` → utiliser `targetValue` (et garder des incréments cohérents ; pour le temps/hauteur ±5/±10 reste raisonnable).
- Le libellé du drawer "Charge" → `metricCfg.label`.

**Step 5 : Gating PR / 1RM (critique)**

Dans `handleValidateSet` — la PR detection (§297 ~l.597 `if (logWeight > 0 && logReps > 0 && !isBodyweight(logWeight))`) devient :
```ts
if (tracksWeight && logWeight > 0 && logReps > 0 && !isBodyweight(logWeight)) {
  /* detectPR ... */
}
```

Et là où `logStrengthSet`/`onLogSets` est appelé avec le payload : ajouter `skip_one_rm: !tracksWeight`. Vérifier le chemin : le runner appelle `onLogSets` (prop) → `Strength.tsx` → `logStrengthSetApi`. Donc le flag doit être ajouté au `newLog` construit dans WorkoutRunner ET propagé par Strength.tsx jusqu'à `logStrengthSetApi`. Tracer ce chemin :
```bash
grep -n "onLogSets\|logStrengthSetApi\|logStrengthSet" src/pages/Strength.tsx | head
```
Ajouter `skip_one_rm` au type `SetLogEntry` (lib/types.ts) si nécessaire pour le transporter, OU calculer le flag dans Strength.tsx à partir de l'`exerciseLookup` (le plus robuste : Strength.tsx connaît déjà `exerciseLookup`, il peut dériver `intensity_metric` de l'exo et armer `skip_one_rm` au moment de l'appel API, sans dépendre du runner). **Approche recommandée** : armer dans `Strength.tsx` au point d'appel `logStrengthSetApi` via `exerciseLookup.get(log.exercise_id)?.intensity_metric`.

**Step 6 : Type check + full suite**

```bash
npx tsc --noEmit
npm test -- --run 2>&1 | tail -6
```

**Step 7 : Commit**

```bash
git add src/components/strength/WorkoutRunner.tsx src/pages/Strength.tsx src/lib/types.ts 2>/dev/null
git commit -m "feat(§298): WorkoutRunner — tile/target/numpad adaptatifs + gating 1RM non-poids"
```

---

## Task 10 : ExerciseProgressChart — mode "meilleure valeur"

**Files:**
- Modify: `src/components/strength/ExerciseProgressChart.tsx`
- (vérifier le hook source : `src/hooks/useExerciseHistory.ts`)

**Step 1 : Identifier la métrique de l'exo dans le chart**

Le chart reçoit (ou peut recevoir) l'`Exercise`. Dériver `metric`. Si le composant n'a pas accès à l'exo, le passer en prop depuis le parent (vérifier les callsites).

**Step 2 : Brancher la courbe**

Si `metric === "weight_kg"` → comportement actuel (1RM estimé + volume kg) inchangé.
Sinon :
- Remplacer la série "1RM estimé" par **max(`weight`) par séance** (déjà le `bestSet.weight`, mais sans passer par Epley).
- Titre/label/tooltip via `metricCfg` ("Meilleure hauteur", unité `cm`).
- Masquer le bloc "volume kg" (le graphe volume + la carte volume).

**Step 3 : Type check + smoke**

```bash
npx tsc --noEmit
```

**Step 4 : Commit**

```bash
git add src/components/strength/ExerciseProgressChart.tsx src/hooks/useExerciseHistory.ts 2>/dev/null
git commit -m "feat(§298): ExerciseProgressChart — courbe meilleure valeur pour métriques non-poids"
```

---

## Task 11 : Résumés & historique — `formatIntensity` + exclusion volume

**Files:**
- Modify: `src/components/strength/SessionSummary.tsx`
- Modify: `src/components/strength/RestPerfsTab.tsx`
- Modify: `src/components/strength/RestSessionTab.tsx`

**Step 1 : Exclure les logs non-poids du "volume kg"**

Ces composants somment `weight × reps` en filtrant déjà `BODYWEIGHT_SENTINEL`. Étendre le filtre pour exclure aussi les exos `intensity_metric !== "weight_kg"`. Ces composants ont accès aux `exercises` (ou il faut le passer) → résoudre la métrique par `exercise_id`.

**Step 2 : Afficher la valeur via `formatIntensity`**

Là où s'affiche `{weight} kg × {reps}`, utiliser `formatIntensity(weight, metric)` pour rendre `60 cm × 5` / `30 s` / `75 kg` selon l'exo.

**Step 3 : Type check + full suite**

```bash
npx tsc --noEmit
npm test -- --run 2>&1 | tail -6
```

**Step 4 : Commit**

```bash
git add src/components/strength/SessionSummary.tsx src/components/strength/RestPerfsTab.tsx src/components/strength/RestSessionTab.tsx
git commit -m "feat(§298): résumés muscu — formatIntensity + volume kg exclut les métriques non-poids"
```

---

## Task 12 : Documentation

**Files:**
- Modify: `docs/implementation-log.md` (entrée §298)
- Modify: `docs/ROADMAP.md` (nouvelle ligne + date en tête, §297 demote)
- Modify: `docs/FEATURES_STATUS.md` (Musculation : métrique d'intensité)
- Modify: `CLAUDE.md` (ligne "Dernier §")
- Modify: `docs/claude/files-map.md` (ajouter `intensityMetrics.ts` ; MAJ tailles si > 30 %)

**Step 1 : Mesurer les tailles**

```bash
wc -l src/lib/strength/intensityMetrics.ts src/components/strength/WorkoutRunner.tsx src/pages/coach/StrengthCatalog.tsx src/components/strength/ExerciseProgressChart.tsx
```

**Step 2 : Rédiger l'entrée §298** dans `implementation-log.md` (contexte, décisions, changements par couche, fichiers, tests, limites — dont "pas de PR sur métriques non-poids", "logs kg historiques ré-interprétés si bascule de métrique"). Suivre le format de l'entrée §297.

**Step 3 : ROADMAP** — ligne en tête `*Dernière mise à jour : §298 ...*`, §297 passe en "Précédente".

**Step 4 : FEATURES_STATUS** — ajouter sous Musculation Nageur/Coach les lignes métrique d'intensité (catalogue, builder cible, runner adaptatif, progression).

**Step 5 : CLAUDE.md** — `Dernier § livré : **§298** — Métrique d'intensité par exercice (hauteur/distance/temps)`.

**Step 6 : files-map.md** — ajouter `src/lib/strength/intensityMetrics.ts` (rôle + taille mesurée). MAJ tailles des fichiers ayant varié > 30 %.

**Step 7 : Commit**

```bash
git add docs/ CLAUDE.md
git commit -m "docs(§298): implementation-log + ROADMAP + FEATURES_STATUS + CLAUDE.md + files-map"
```

---

## Task 13 : Vérification end-to-end

**Files:** aucun

**Step 1 : tsc + full suite + build**

```bash
npx tsc --noEmit
npm test -- --run 2>&1 | tail -8
npm run build 2>&1 | tail -5
```
Expected : tsc 0, tests verts (+ ~11 nouveaux), build OK.

**Step 2 : Smoke manuel (dev) — 3 scénarios**

`npm run dev` :
1. **Catalogue** : éditer "Box Jump" → métrique = Hauteur (cm) → sauvegarder → vérifier `intensity_metric='height_cm'` en DB ; la checkbox PDC + les %1RM disparaissent/grisent.
2. **Builder** : ajouter Box Jump à une séance → champ "Cible Hauteur (cm)" visible → saisir 60 → vérifier `target_intensity=60` en DB.
3. **Runner** : lancer la séance → pas de OneRmGate sur Box Jump → tile "Hauteur / cm" pré-remplie à 60 → valider une série à 65 → vérifier : log `weight=65`, AUCUN 1RM créé (`SELECT * FROM strength_one_rm WHERE exercise_id=8` vide), pas de toast "record". Progression chart affiche "Meilleure hauteur" en cm.

**Step 3 : Vérif régression poids**

Lancer une séance d'un exo `weight_kg` classique (Squat) → tout identique à avant (Charge/kg, %1RM, PDC, 1RM auto, PR).

**Step 4 : Fin** — si tout passe, le plan est achevé. Ne PAS déployer localement (push sur main → GitHub Actions).

---

## Récapitulatif des artefacts

| Type | Fichier | Statut |
|---|---|---|
| Migration | `00186_intensity_metric.sql` (+ éventuel `00187_*` RPC) | Nouveau |
| Module | `src/lib/strength/intensityMetrics.ts` | Nouveau |
| Type/mappers | `types.ts`, `client.ts`, `helpers.ts`, `transformers.ts`, `strength.ts` | Modifiés |
| Filtre | `missing1rmFilter.ts` | Modifié |
| UI coach | `StrengthCatalog.tsx`, `StrengthExerciseCard.tsx` | Modifiés |
| UI nageur | `WorkoutRunner.tsx`, `Strength.tsx` | Modifiés |
| Progression | `ExerciseProgressChart.tsx` (+ `useExerciseHistory.ts`) | Modifiés |
| Résumés | `SessionSummary.tsx`, `RestPerfsTab.tsx`, `RestSessionTab.tsx` | Modifiés |
| Tests | `intensityMetrics.test.ts`, `exerciseMappers.test.ts` (étendu), `strengthItemTarget.test.ts`, `strength_missing1rm_filter.test.ts` (étendu), `logStrengthSetGating.test.ts` | Nouveaux/étendus |
| Docs | implementation-log, ROADMAP, FEATURES_STATUS, CLAUDE.md, files-map | Modifiés |
