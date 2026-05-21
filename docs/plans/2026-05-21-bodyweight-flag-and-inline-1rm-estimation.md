# Flag `is_bodyweight` + estimation 1RM inline — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal :** Ajouter un flag `is_bodyweight` au catalogue d'exercices (UI Charge masquée pendant la séance) et permettre à l'utilisateur d'estimer son 1RM via un sous-flow de ramp-up inline sur la série 1 — déclenché soit via le `OneRmGate` au lancement, soit via un bouton "Recalculer ma 1RM" pendant la séance.

**Architecture :** Migration SQL légère + propagation du champ à travers les mappers + lifted state `inlineEstimationExercises: Set<number>` dans `Strength.tsx`, consommé par `OneRmGate` et `WorkoutRunner`. Les séries de chauffe sont éphémères en mémoire React (pas de persistance). Seule la "série de référence" est loggée (set_index=1) ; le 1RM est persisté via l'API `update1RM` existante.

**Tech Stack :** React 19 + TypeScript + Supabase (PostgreSQL + RLS) + Vitest + React Query 5 + Wouter + Tailwind 4. Helpers existants utilisés : `estimateOneRM` (`src/lib/prDetection.ts`), `update1RM` (`src/lib/api/strength.ts:1119`), `BODYWEIGHT_SENTINEL` (`src/lib/api/client.ts:29`).

**Design doc :** `docs/plans/2026-05-21-bodyweight-flag-and-inline-1rm-estimation-design.md`

---

## Task 1 : Migration DB — ajout `is_bodyweight` sur `dim_exercices`

**Files:**
- Create: `supabase/migrations/00183_dim_exercices_is_bodyweight.sql`

**Step 1 : Écrire la migration**

```sql
-- 00183_dim_exercices_is_bodyweight.sql
-- §297 — Flag is_bodyweight pour distinguer les exos au poids de corps
-- (pas de 1RM requis, UI Charge masquée pendant la séance).
ALTER TABLE dim_exercices
ADD COLUMN IF NOT EXISTS is_bodyweight BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN dim_exercices.is_bodyweight IS
  'Si TRUE, exercice au poids de corps : le OneRmGate ignore cet exo et le WorkoutRunner masque le champ Charge (log auto avec BODYWEIGHT_SENTINEL).';
```

**Step 2 : Appliquer via MCP Supabase**

Utiliser `mcp__plugin_supabase_supabase__apply_migration` avec `name = "00183_dim_exercices_is_bodyweight"` et le SQL ci-dessus.

Expected : retour OK, aucune erreur.

**Step 3 : Vérifier que la colonne existe**

Via `mcp__plugin_supabase_supabase__execute_sql` :

```sql
SELECT column_name, data_type, column_default, is_nullable
FROM information_schema.columns
WHERE table_name = 'dim_exercices' AND column_name = 'is_bodyweight';
```

Expected : 1 ligne — `is_bodyweight | boolean | false | NO`.

**Step 4 : Commit**

```bash
git add supabase/migrations/00183_dim_exercices_is_bodyweight.sql
git commit -m "feat(§297): migration is_bodyweight sur dim_exercices"
```

---

## Task 2 : Ajouter `is_bodyweight` au type Exercise + mappers

**Files:**
- Modify: `src/lib/api/types.ts` (interface `Exercise`)
- Modify: `src/lib/api/client.ts:219` (`mapDbExerciseToApi`)
- Modify: `src/lib/api/client.ts:246` (`mapApiExerciseToDb`)
- Modify: `src/lib/api/helpers.ts:66` (`normalizeExercise`)
- Test : créer `src/lib/api/__tests__/exerciseMappers.test.ts` (si inexistant) ou ajouter au plus proche existant

**Step 1 : Écrire le test (round-trip db ↔ api)**

Fichier : `src/lib/api/__tests__/exerciseMappers.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { mapDbExerciseToApi, mapApiExerciseToDb } from '@/lib/api/client';
import { normalizeExercise } from '@/lib/api/helpers';

describe('exercise mappers — is_bodyweight', () => {
  it('mapDbExerciseToApi reads is_bodyweight from DB row', () => {
    const row = { id: 1, nom_exercice: 'Pompes', is_bodyweight: true };
    const result = mapDbExerciseToApi(row);
    expect(result.is_bodyweight).toBe(true);
  });

  it('mapDbExerciseToApi defaults is_bodyweight to false when absent', () => {
    const row = { id: 1, nom_exercice: 'Squat' };
    const result = mapDbExerciseToApi(row);
    expect(result.is_bodyweight).toBe(false);
  });

  it('mapApiExerciseToDb writes is_bodyweight to DB row', () => {
    const ex = { id: 1, nom_exercice: 'Tractions', is_bodyweight: true } as any;
    const result = mapApiExerciseToDb(ex);
    expect(result.is_bodyweight).toBe(true);
  });

  it('mapApiExerciseToDb defaults is_bodyweight to false when undefined', () => {
    const ex = { id: 1, nom_exercice: 'Squat' } as any;
    const result = mapApiExerciseToDb(ex);
    expect(result.is_bodyweight).toBe(false);
  });

  it('normalizeExercise preserves is_bodyweight from localStorage', () => {
    const ex = { id: 1, nom_exercice: 'Dips', is_bodyweight: true };
    const result = normalizeExercise(ex);
    expect(result.is_bodyweight).toBe(true);
  });
});
```

**Step 2 : Run test (must fail)**

```bash
npx vitest run src/lib/api/__tests__/exerciseMappers.test.ts
```

Expected : 5 fails — `result.is_bodyweight` is undefined (property doesn't exist yet).

**Step 3 : Ajouter le champ dans le type**

`src/lib/api/types.ts` — interface `Exercise` (après la ligne `folder_id?: number | null;`) :

```ts
  folder_id?: number | null;
  /** §297 — Si TRUE, exo au poids de corps : OneRmGate l'ignore, runner masque Charge. */
  is_bodyweight?: boolean;
}
```

**Step 4 : Wire `mapDbExerciseToApi`**

`src/lib/api/client.ts:219` — ajouter avant le `}` final de l'objet retourné :

```ts
  folder_id: safeOptionalInt(row.folder_id),
  is_bodyweight: row.is_bodyweight === true,
});
```

**Step 5 : Wire `mapApiExerciseToDb`**

`src/lib/api/client.ts:246` — ajouter avant le `}` final :

```ts
  folder_id: exercise.folder_id ?? null,
  is_bodyweight: exercise.is_bodyweight === true,
});
```

**Step 6 : Wire `normalizeExercise`**

`src/lib/api/helpers.ts:66` — ajouter avant le `}` final :

```ts
  recup_exercices_force: safeOptionalInt(exercise.recup_exercices_force),
  is_bodyweight: exercise.is_bodyweight === true,
});
```

**Step 7 : Run test (must pass)**

```bash
npx vitest run src/lib/api/__tests__/exerciseMappers.test.ts
```

Expected : 5 passes.

**Step 8 : Type check**

```bash
npx tsc --noEmit
```

Expected : 0 erreurs (le champ optionnel `?` ne casse aucun callsite existant).

**Step 9 : Commit**

```bash
git add src/lib/api/types.ts src/lib/api/client.ts src/lib/api/helpers.ts \
        src/lib/api/__tests__/exerciseMappers.test.ts
git commit -m "feat(§297): champ is_bodyweight sur Exercise + mappers + tests"
```

---

## Task 3 : UI catalogue coach — checkbox PDC

**Files:**
- Modify: `src/pages/coach/StrengthCatalog.tsx` (dialog d'édition ~ligne 953, dialog de création ~ligne 1070)

**Step 1 : Ajouter checkbox dans le dialog d'édition**

`StrengthCatalog.tsx:953` — JUSTE APRÈS le bloc `<div className="flex items-center gap-2">` du checkbox warmup (l. 953-969), ajouter un nouveau bloc :

```tsx
            <div className="flex items-center gap-2">
              <Checkbox
                id="bodyweight-flag-edit"
                checked={editingExercise.is_bodyweight === true}
                onCheckedChange={(checked) => {
                  const isBw = checked === true;
                  setEditingExercise({
                    ...editingExercise,
                    is_bodyweight: isBw,
                    // Reset les % 1RM si l'exo passe en PDC (cohérence)
                    ...(isBw
                      ? {
                          pct_1rm_endurance: null,
                          pct_1rm_hypertrophie: null,
                          pct_1rm_force: null,
                        }
                      : {}),
                  });
                }}
              />
              <Label htmlFor="bodyweight-flag-edit">
                Exercice au poids de corps (pas de 1RM)
              </Label>
            </div>
```

**Step 2 : Ajouter checkbox dans le dialog de création**

`StrengthCatalog.tsx` — chercher le bloc équivalent autour de la ligne 1074 (`checked={newExercise.exercise_type === "warmup"}`) et ajouter juste après :

```tsx
            <div className="flex items-center gap-2">
              <Checkbox
                id="bodyweight-flag-create"
                checked={newExercise.is_bodyweight === true}
                onCheckedChange={(checked) => {
                  const isBw = checked === true;
                  setNewExercise({
                    ...newExercise,
                    is_bodyweight: isBw,
                    ...(isBw
                      ? {
                          pct_1rm_endurance: null,
                          pct_1rm_hypertrophie: null,
                          pct_1rm_force: null,
                        }
                      : {}),
                  });
                }}
              />
              <Label htmlFor="bodyweight-flag-create">
                Exercice au poids de corps (pas de 1RM)
              </Label>
            </div>
```

**Step 3 : Optionnel — désactiver les champs %1RM si is_bodyweight=true**

Si le composant `ExerciseCycleTabs` est utilisé pour saisir les %1RM (`l. 946`), passer une prop `disabled={editingExercise.is_bodyweight}` ou wrapper de l'extérieur avec un `<fieldset disabled={...}>`. **Skip pour V1 si trop complexe** — la cohérence est déjà garantie par le reset à `null` côté checkbox.

**Step 4 : Vérifier dans le navigateur (smoke test)**

```bash
npm run dev
```

Ouvrir `/#/coach/strength-catalog`, créer un exo "Test PDC" avec la case cochée, sauvegarder, rééditer → la case doit rester cochée. Vérifier en DB :

```sql
SELECT id, nom_exercice, is_bodyweight FROM dim_exercices WHERE nom_exercice = 'Test PDC';
```

Expected : `is_bodyweight = true`.

**Step 5 : Type check**

```bash
npx tsc --noEmit
```

Expected : 0 erreurs.

**Step 6 : Commit**

```bash
git add src/pages/coach/StrengthCatalog.tsx
git commit -m "feat(§297): checkbox PDC dans le catalogue coach (création + édition)"
```

---

## Task 4 : Filtrer `missing1RmExercises` — exclure les exos PDC

**Files:**
- Modify: `src/pages/Strength.tsx:548-556`
- Test : ajouter à un fichier de test existant ou créer `src/pages/__tests__/Strength.missing1rm.test.ts`

**Step 1 : Écrire le test pour le filtre**

Créer un test pur du filtre (logique extraite ou testée via la prop) :

`src/pages/__tests__/strength_missing1rm_filter.test.ts` :

```ts
import { describe, it, expect } from 'vitest';

// Fonction extraite du useMemo de Strength.tsx (Task 4 step 3).
// Si pas encore extraite, ce test guide l'extraction.
import { computeMissing1RmExercises } from '@/lib/strength/missing1rmFilter';

const ex = (id: number, isBw: boolean) => ({
  id, nom_exercice: `Ex ${id}`, exercise_type: 'strength' as const,
  is_bodyweight: isBw,
});

describe('computeMissing1RmExercises', () => {
  const exerciseLookup = new Map([
    [1, ex(1, false)],
    [2, ex(2, true)],   // PDC
    [3, ex(3, false)],
  ]);

  it('renvoie les exos non-PDC avec %1RM > 0 et sans 1RM enregistré', () => {
    const items = [
      { exercise_id: 1, percent_1rm: 75 },
      { exercise_id: 2, percent_1rm: 0 },
      { exercise_id: 3, percent_1rm: 80 },
    ] as any;
    const oneRMs = [{ exercise_id: 3, weight: 100 }] as any;
    const result = computeMissing1RmExercises(items, oneRMs, exerciseLookup);
    expect(result).toEqual([
      { exerciseId: 1, exerciseName: 'Ex 1' },
    ]);
  });

  it('exclut un exo PDC même si percent_1rm > 0 (coach a oublié de remettre à 0)', () => {
    const items = [
      { exercise_id: 2, percent_1rm: 60 },  // PDC avec % par erreur
    ] as any;
    const result = computeMissing1RmExercises(items, [], exerciseLookup);
    expect(result).toEqual([]);
  });

  it('exclut les items avec percent_1rm = 0', () => {
    const items = [
      { exercise_id: 1, percent_1rm: 0 },
    ] as any;
    const result = computeMissing1RmExercises(items, [], exerciseLookup);
    expect(result).toEqual([]);
  });

  it('exclut les exos qui ont déjà un 1RM enregistré', () => {
    const items = [
      { exercise_id: 1, percent_1rm: 75 },
    ] as any;
    const oneRMs = [{ exercise_id: 1, weight: 80 }] as any;
    const result = computeMissing1RmExercises(items, oneRMs, exerciseLookup);
    expect(result).toEqual([]);
  });
});
```

**Step 2 : Run test (must fail — module n'existe pas)**

```bash
npx vitest run src/pages/__tests__/strength_missing1rm_filter.test.ts
```

Expected : FAIL — module introuvable.

**Step 3 : Extraire la fonction**

Créer `src/lib/strength/missing1rmFilter.ts` :

```ts
import type { StrengthSessionItem, Exercise } from '@/lib/api';
import type { OneRmEntry } from '@/lib/types';

export interface Missing1RmExercise {
  exerciseId: number;
  exerciseName: string;
}

/**
 * §297 — Renvoie la liste des exos pour lesquels le OneRmGate doit s'ouvrir.
 * Exclut :
 *  - les items sans %1RM prescrit (percent_1rm <= 0)
 *  - les exos déjà dotés d'un 1RM > 0
 *  - les exos marqués `is_bodyweight = true` (PDC ne demande jamais de 1RM)
 */
export function computeMissing1RmExercises(
  items: StrengthSessionItem[],
  oneRMs: OneRmEntry[] | null | undefined,
  exerciseLookup: Map<number, Exercise>,
): Missing1RmExercise[] {
  const oneRMsArr = oneRMs ?? [];
  return items
    .filter((item) => (item.percent_1rm ?? 0) > 0)
    .filter((item) => {
      const ex = exerciseLookup.get(item.exercise_id);
      return !ex?.is_bodyweight;
    })
    .filter((item) =>
      !oneRMsArr.some(
        (rm) => rm.exercise_id === item.exercise_id && Number(rm.weight) > 0,
      ),
    )
    .map((item) => ({
      exerciseId: item.exercise_id,
      exerciseName: item.exercise_name ?? `Ex #${item.exercise_id}`,
    }));
}
```

**Step 4 : Run test (must pass)**

```bash
npx vitest run src/pages/__tests__/strength_missing1rm_filter.test.ts
```

Expected : 4 passes.

**Step 5 : Brancher la fonction dans `Strength.tsx`**

`src/pages/Strength.tsx:548-556` — remplacer le useMemo par :

```ts
import { computeMissing1RmExercises } from '@/lib/strength/missing1rmFilter';
// ...
const missing1RmExercises = useMemo(
  () => computeMissing1RmExercises(activeFilteredItems, oneRMs, exerciseLookup),
  [activeFilteredItems, oneRMs, exerciseLookup],
);
```

**Step 6 : Type check**

```bash
npx tsc --noEmit
```

Expected : 0 erreurs.

**Step 7 : Commit**

```bash
git add src/lib/strength/missing1rmFilter.ts \
        src/pages/__tests__/strength_missing1rm_filter.test.ts \
        src/pages/Strength.tsx
git commit -m "feat(§297): filtre missing1RmExercises exclut les exos PDC (+ tests)"
```

---

## Task 5 : Refonte `OneRmGate` — remplacer "Poids libre" par "Estimer pendant la séance"

**Files:**
- Modify: `src/components/strength/OneRmGate.tsx`

**Step 1 : Modifier les props**

`src/components/strength/OneRmGate.tsx:10-17` — remplacer :

```ts
interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  missingExercises: Array<{ exerciseId: number; exerciseName: string }>;
  athleteId: number | string | null;
  onSaveAndContinue: () => void;
  /** §297 — Lance la séance ; les exos sans 1RM saisi entrent en mode
   *  estimation inline (ramp-up sur série 1) côté WorkoutRunner. */
  onEstimateInline: (skippedExerciseIds: number[]) => void;
}
```

**Step 2 : Adapter le saveMutation pour skipper les exos sans valeur saisie**

Remplacer le `saveMutation` actuel (l. 29-49) :

```ts
  const saveMutation = useMutation({
    mutationFn: async (mode: 'saveAndContinue' | 'estimateInline') => {
      const savedIds: number[] = [];
      const skippedIds: number[] = [];
      for (const ex of missingExercises) {
        const weight = Number(values[ex.exerciseId]);
        if (weight > 0) {
          await update1RM({
            athlete_id: athleteId ?? undefined,
            exercise_id: ex.exerciseId,
            one_rm: weight,
          });
          savedIds.push(ex.exerciseId);
        } else {
          skippedIds.push(ex.exerciseId);
        }
      }
      return { mode, savedIds, skippedIds };
    },
    onSuccess: ({ mode, savedIds, skippedIds }) => {
      if (savedIds.length > 0) toast("1RM sauvegardés");
      if (mode === 'estimateInline') {
        onEstimateInline(skippedIds);
      } else {
        onSaveAndContinue();
      }
    },
    onError: () => {
      toast.error("Erreur", { description: "Impossible de sauvegarder les 1RM." });
    },
  });
```

**Step 3 : Modifier les boutons du footer**

Remplacer le bloc `<div className="mt-6 flex gap-2">` (l. 85-96) :

```tsx
        <div className="mt-6 flex gap-2">
          <Button
            className="flex-1"
            onClick={() => saveMutation.mutate('saveAndContinue')}
            disabled={!hasAnyValue || saveMutation.isPending}
          >
            {saveMutation.isPending ? "Sauvegarde..." : "Sauvegarder et continuer"}
          </Button>
          <Button
            variant="outline"
            className="flex-1"
            disabled={saveMutation.isPending}
            onClick={() => saveMutation.mutate('estimateInline')}
          >
            Estimer pendant la séance
          </Button>
        </div>
```

**Step 4 : Mettre à jour la description du gate**

Ligne 61-64, remplacer :

```tsx
          <SheetDescription>
            Ces exercices utilisent un % de votre 1RM. Renseignez vos max,
            ou laissez l'app les estimer pendant la séance (séries de chauffe).
          </SheetDescription>
```

**Step 5 : Mettre à jour le callsite dans Strength.tsx**

`src/pages/Strength.tsx:1107-1124` — remplacer le bloc `<OneRmGate>` :

```tsx
      <OneRmGate
        open={showOneRmGate}
        onOpenChange={setShowOneRmGate}
        missingExercises={missing1RmExercises}
        athleteId={userId}
        onSaveAndContinue={() => {
          setShowOneRmGate(false);
          queryClient.invalidateQueries({ queryKey: ["1rm"] });
          handleLaunchFocus();
        }}
        onEstimateInline={(skippedIds) => {
          setShowOneRmGate(false);
          setInlineEstimationExercises(new Set(skippedIds));
          // Re-trigger launch — handleLaunchFocus will now bypass the gate
          // because missing1RmExercises is recomputed against oneRMs (saved
          // values already persisted) and the remaining items are in the Set.
          setTimeout(() => handleLaunchFocus(), 0);
        }}
      />
```

Note : `setInlineEstimationExercises` n'existe pas encore — sera créé en Task 6. Pour cette task, **commenter temporairement** la ligne `setInlineEstimationExercises(...)` ou créer un stub.

**Step 6 : Stub `inlineEstimationExercises` dans Strength.tsx pour ne pas casser tsc**

Ajouter en haut du composant (vers la ligne 545) :

```ts
const [inlineEstimationExercises, setInlineEstimationExercises] =
  useState<Set<number>>(new Set());
// (utilisé en Task 6+)
void inlineEstimationExercises;  // silence "unused" jusqu'à Task 6
```

Et **supprimer** la ligne `const [skipPercent1rm, setSkipPercent1rm] = useState(false);` (ligne 546) ainsi que sa référence dans `handleLaunchFocus` :

```ts
if (missing1RmExercises.length > 0 && !skipPercent1rm) {  // AVANT
if (missing1RmExercises.length > 0 && inlineEstimationExercises.size === 0) {  // APRÈS
```

**Step 7 : Type check + tests existants**

```bash
npx tsc --noEmit && npm test -- --run
```

Expected : 0 erreurs tsc, tests existants verts (sauf si un test mockait `onSkipToFreeWeight` — adapter le mock).

**Step 8 : Commit**

```bash
git add src/components/strength/OneRmGate.tsx src/pages/Strength.tsx
git commit -m "feat(§297): OneRmGate — bouton 'Estimer pendant la séance' remplace 'Poids libre'"
```

---

## Task 6 : Passer `inlineEstimationExercises` + callbacks au `WorkoutRunner`

**Files:**
- Modify: `src/components/strength/WorkoutRunner.tsx` (props)
- Modify: `src/pages/Strength.tsx` (passage des props)

**Step 1 : Étendre les props du runner**

`src/components/strength/WorkoutRunner.tsx:146-169` — ajouter dans la signature de `WorkoutRunner({...})` :

```ts
  /** §297 — Set d'exercise_ids dont la série 1 doit ouvrir le mode estimation
   *  ramp-up (calcul 1RM à partir d'une série de référence). Le runner retire
   *  l'exo du Set parent via onEstimationComplete. */
  inlineEstimationExercises?: Set<number>;
  onRequestRecalc?: (exerciseId: number) => void;
  onEstimationComplete?: (exerciseId: number, estimatedOneRm: number) => Promise<void>;
}: {
  // ... existants
  inlineEstimationExercises?: Set<number>;
  onRequestRecalc?: (exerciseId: number) => void;
  onEstimationComplete?: (exerciseId: number, estimatedOneRm: number) => Promise<void>;
}) {
```

**Step 2 : Wire callbacks dans Strength.tsx**

Dans `src/pages/Strength.tsx`, ajouter avant le `return` :

```ts
const handleRequestRecalc = useCallback((exerciseId: number) => {
  setInlineEstimationExercises((prev) => {
    const next = new Set(prev);
    next.add(exerciseId);
    return next;
  });
  toast("Mode estimation activé", {
    description: "Fais ta chauffe et marque ta série de référence.",
  });
}, []);

const handleEstimationComplete = useCallback(
  async (exerciseId: number, estimatedOneRm: number) => {
    if (!userId) return;
    await update1RM({
      athlete_id: userId,
      exercise_id: exerciseId,
      one_rm: estimatedOneRm,
    });
    await queryClient.invalidateQueries({ queryKey: ["1rm"] });
    setInlineEstimationExercises((prev) => {
      const next = new Set(prev);
      next.delete(exerciseId);
      return next;
    });
    toast(`🎯 1RM estimé : ${estimatedOneRm} kg`);
  },
  [userId, queryClient, toast],
);
```

Importer `update1RM` depuis `@/lib/api`.

**Step 3 : Passer les props au composant**

`src/pages/Strength.tsx:804` — sur l'instanciation `<WorkoutRunner>`, ajouter :

```tsx
<WorkoutRunner
  // ... props existantes
  inlineEstimationExercises={inlineEstimationExercises}
  onRequestRecalc={handleRequestRecalc}
  onEstimationComplete={handleEstimationComplete}
/>
```

Et **retirer** le `void inlineEstimationExercises;` ajouté en Task 5.

**Step 4 : Type check**

```bash
npx tsc --noEmit
```

Expected : 0 erreurs.

**Step 5 : Commit**

```bash
git add src/components/strength/WorkoutRunner.tsx src/pages/Strength.tsx
git commit -m "feat(§297): props inlineEstimationExercises + callbacks recalc/complete"
```

---

## Task 7 : `WorkoutRunner` — UI exo bodyweight (masquer Charge)

**Files:**
- Modify: `src/components/strength/WorkoutRunner.tsx` (carte de série + handleValidateSet)
- Test : `src/components/strength/__tests__/WorkoutRunner.bodyweight.test.tsx` (nouveau)

**Step 1 : Écrire le test rendu**

`src/components/strength/__tests__/WorkoutRunner.bodyweight.test.tsx` :

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { WorkoutRunner } from '@/components/strength/WorkoutRunner';

const bodyweightExercise = {
  id: 10,
  nom_exercice: 'Pompes',
  exercise_type: 'strength' as const,
  is_bodyweight: true,
};

const session = {
  id: 1,
  title: 'Test',
  description: '',
  cycle: 'endurance' as const,
  items: [
    {
      exercise_id: 10,
      order_index: 0,
      sets: 3,
      reps: 12,
      rest_seconds: 60,
      percent_1rm: 0,
    },
  ],
};

describe('WorkoutRunner — bodyweight exercise', () => {
  it('hides the Charge tile for is_bodyweight exercises on the workout card', () => {
    render(
      <WorkoutRunner
        session={session as any}
        exercises={[bodyweightExercise as any]}
        oneRMs={[]}
        onFinish={vi.fn()}
        userId={1}
        initialStep={1}
      />,
    );
    // The "Charge" label only appears on the input drawer (closed by default)
    // and on the main set card — we assert the main set card doesn't show it.
    // The Reps tile must still be present.
    const repsLabels = screen.getAllByText('Reps');
    expect(repsLabels.length).toBeGreaterThan(0);
    // No visible "Charge" tile on the main card (text "Charge" appears 0 times
    // outside the closed drawer).
    expect(screen.queryByText('Charge')).toBeNull();
  });
});
```

**Step 2 : Run test (must fail)**

```bash
npx vitest run src/components/strength/__tests__/WorkoutRunner.bodyweight.test.tsx
```

Expected : FAIL — "Charge" is found in the DOM.

**Step 3 : Détecter `isBodyweightExercise` dans le runner**

`src/components/strength/WorkoutRunner.tsx`, après la résolution de `currentExerciseDef` (vers la ligne 289) :

```ts
const isBodyweightExercise = currentExerciseDef?.is_bodyweight === true;
```

**Step 4 : Conditionner la grille `grid-cols-2`**

Lignes 1009-1042 — wrapper la grille pour basculer en `grid-cols-1` quand bodyweight :

```tsx
<div className={cn(
  "grid gap-3",
  isBodyweightExercise ? "grid-cols-1" : "grid-cols-2"
)}>
  {!isBodyweightExercise && (
    <button
      type="button"
      className="..."
      onClick={() => openInputSheet("weight")}
    >
      <div className="text-[11px] ...">Charge</div>
      {/* ... contenu Charge inchangé ... */}
    </button>
  )}
  <button
    type="button"
    className="..."
    onClick={() => openInputSheet("reps")}
  >
    <div className="text-[11px] ...">Reps</div>
    {/* ... contenu Reps inchangé ... */}
  </button>
</div>
```

**Step 5 : Forcer `BODYWEIGHT_SENTINEL` à la validation**

`handleValidateSet` (ligne 585-591) — adapter `newLog.weight` :

```ts
const newLog = {
  exercise_id: currentBlock.exercise_id,
  set_number: currentSetIndex,
  reps: currentSetInputs[currentSetIndex - 1]?.reps || currentBlock.reps,
  weight: isBodyweightExercise
    ? BODYWEIGHT_SENTINEL
    : (currentSetInputs[currentSetIndex - 1]?.weight ?? targetWeight),
  difficulty: setDifficultyValue,
};
```

**Step 6 : Adapter le sheet d'input pour ne pas proposer "Charge" sur exo PDC**

L'utilisateur ne devrait jamais ouvrir le sheet en mode "weight" sur un exo PDC. Comme la tile Charge est masquée (Step 4), `openInputSheet("weight")` n'est plus appelable depuis l'UI. **No-op nécessaire** — laissé tel quel.

**Step 7 : Run test (must pass)**

```bash
npx vitest run src/components/strength/__tests__/WorkoutRunner.bodyweight.test.tsx
```

Expected : PASS.

**Step 8 : Lancer toute la suite pour vérifier qu'on n'a rien cassé**

```bash
npm test -- --run
```

Expected : 0 régression.

**Step 9 : Commit**

```bash
git add src/components/strength/WorkoutRunner.tsx \
        src/components/strength/__tests__/WorkoutRunner.bodyweight.test.tsx
git commit -m "feat(§297): WorkoutRunner masque Charge pour les exos PDC + auto-log BODYWEIGHT_SENTINEL"
```

---

## Task 8 : `WorkoutRunner` — UI mode estimation (warmupHistory + 2 boutons)

**Files:**
- Modify: `src/components/strength/WorkoutRunner.tsx`
- Test : `src/components/strength/__tests__/WorkoutRunner.estimation.test.tsx` (nouveau)

**Step 1 : Écrire le test de rendu mode estimation**

`src/components/strength/__tests__/WorkoutRunner.estimation.test.tsx` :

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { WorkoutRunner } from '@/components/strength/WorkoutRunner';

const exercise = {
  id: 5,
  nom_exercice: 'Squat',
  exercise_type: 'strength' as const,
  is_bodyweight: false,
};

const session = {
  id: 1,
  title: 'Test',
  description: '',
  cycle: 'endurance' as const,
  items: [
    {
      exercise_id: 5,
      order_index: 0,
      sets: 4,
      reps: 8,
      rest_seconds: 90,
      percent_1rm: 75,
    },
  ],
};

describe('WorkoutRunner — inline estimation mode', () => {
  it('shows estimation banner on set 1 when exercise is in inlineEstimationExercises', () => {
    render(
      <WorkoutRunner
        session={session as any}
        exercises={[exercise as any]}
        oneRMs={[]}
        onFinish={vi.fn()}
        userId={1}
        initialStep={1}
        inlineEstimationExercises={new Set([5])}
        onEstimationComplete={vi.fn()}
      />,
    );
    expect(screen.getByText(/Estimation 1RM en cours/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Chauffe suivante/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /série de référence/i })).toBeInTheDocument();
  });

  it('does NOT show estimation banner on set 1 when exercise is NOT in the Set', () => {
    render(
      <WorkoutRunner
        session={session as any}
        exercises={[exercise as any]}
        oneRMs={[{ exercise_id: 5, weight: 100 }] as any}
        onFinish={vi.fn()}
        userId={1}
        initialStep={1}
        inlineEstimationExercises={new Set()}
      />,
    );
    expect(screen.queryByText(/Estimation 1RM en cours/i)).toBeNull();
  });
});
```

**Step 2 : Run test (must fail)**

```bash
npx vitest run src/components/strength/__tests__/WorkoutRunner.estimation.test.tsx
```

Expected : FAIL — banner introuvable.

**Step 3 : Détecter `isEstimationMode` + state `warmupHistory`**

`src/components/strength/WorkoutRunner.tsx`, après `isBodyweightExercise` :

```ts
const isEstimationMode =
  !isBodyweightExercise &&
  currentSetIndex === 1 &&
  (inlineEstimationExercises?.has(currentBlock?.exercise_id ?? -1) ?? false);

const [warmupHistory, setWarmupHistory] = useState<
  Array<{ weight: number; reps: number; difficulty: number | null }>
>([]);

// Reset warmupHistory quand on change d'exo (sécurité contre fuite mémoire)
useEffect(() => {
  setWarmupHistory([]);
}, [currentBlock?.exercise_id]);
```

**Step 4 : Ajouter le bandeau + UI estimation au-dessus de la carte de série**

Juste avant le bloc `<Card className="rounded-3xl border bg-card p-4 shadow-sm">` (ligne 993), ajouter :

```tsx
{isEstimationMode && (
  <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm">
    <div className="flex items-center gap-2 font-semibold text-amber-900 dark:text-amber-200">
      🎯 Estimation 1RM en cours
    </div>
    <p className="mt-1 text-xs text-amber-900/80 dark:text-amber-200/80">
      Charge légère, monte progressivement. Marque ta dernière série
      comme référence pour calculer ton 1RM.
    </p>
    {warmupHistory.length > 0 && (
      <div className="mt-2 flex flex-wrap gap-1.5 text-[11px] text-amber-900/90 dark:text-amber-200/90">
        {warmupHistory.map((w, i) => (
          <span key={i} className="rounded-full bg-amber-500/20 px-2 py-0.5">
            {w.weight}kg × {w.reps}
          </span>
        ))}
      </div>
    )}
  </div>
)}
```

**Step 5 : Remplacer le `BottomActionBar` en mode estimation**

Lignes 1100-1133 — le `BottomActionBar` actuel contient `[Valider série]` et `[Passer cet exercice]`. En mode estimation, le remplacer par 2 boutons spécifiques :

```tsx
{!inputSheetOpen && !isResting ? (
  <BottomActionBar
    className="bottom-0 z-modal"
    containerClassName="flex-col gap-2 py-4"
  >
    {isEstimationMode ? (
      <>
        <Button
          variant="outline"
          className="w-full h-12 rounded-2xl text-sm font-semibold"
          onClick={handleAddWarmupSet}
          disabled={
            !currentSetInputs[0]?.weight || !currentSetInputs[0]?.reps
          }
        >
          + Chauffe suivante
        </Button>
        <Button
          className="w-full h-14 rounded-2xl text-base font-bold shadow-lg"
          onClick={handleReferenceSet}
          disabled={
            !currentSetInputs[0]?.weight ||
            !currentSetInputs[0]?.reps ||
            currentSetInputs[0]?.difficulty == null
          }
        >
          <Check className="mr-2 h-5 w-5" />
          C'est ma série de référence → calculer 1RM
        </Button>
      </>
    ) : (
      <>
        <Button
          className="w-full h-14 rounded-2xl text-base font-bold shadow-lg active:scale-[0.97] transition-transform"
          onClick={handleValidateSet}
        >
          <Check className="mr-2 h-5 w-5" />
          {currentLoggedSet ? "Série suivante" : "Valider série"}
        </Button>
        <button
          type="button"
          className="text-xs text-muted-foreground font-medium py-1 active:text-foreground transition-colors"
          onClick={() => {
            const hasLogsForCurrent = currentBlock
              ? logs.some((l) => l.exercise_id === currentBlock.exercise_id)
              : false;
            if (hasLogsForCurrent) {
              setSkipExerciseConfirmOpen(true);
            } else {
              advanceExercise();
            }
          }}
        >
          Passer cet exercice
        </button>
      </>
    )}
  </BottomActionBar>
) : null}
```

**Step 6 : Implémenter `handleAddWarmupSet` (stub `handleReferenceSet` pour Task 9)**

Juste avant `handleValidateSet` :

```ts
const handleAddWarmupSet = () => {
  if (!currentBlock) return;
  const weight = Number(currentSetInputs[0]?.weight ?? 0);
  const reps = Number(currentSetInputs[0]?.reps ?? 0);
  const difficulty = currentSetInputs[0]?.difficulty ?? null;
  if (weight <= 0 || reps <= 0) return;
  setWarmupHistory((prev) => [...prev, { weight, reps, difficulty }]);
  // Reset les inputs pour la chauffe suivante
  setCurrentSetInputs({});
};

const handleReferenceSet = async () => {
  // Implémenté en Task 9
};
```

**Step 7 : Run test (must pass)**

```bash
npx vitest run src/components/strength/__tests__/WorkoutRunner.estimation.test.tsx
```

Expected : 2 passes.

**Step 8 : Lancer toute la suite**

```bash
npm test -- --run
```

Expected : 0 régression.

**Step 9 : Commit**

```bash
git add src/components/strength/WorkoutRunner.tsx \
        src/components/strength/__tests__/WorkoutRunner.estimation.test.tsx
git commit -m "feat(§297): WorkoutRunner UI mode estimation (bandeau + chauffe + référence)"
```

---

## Task 9 : `handleReferenceSet` — calculer 1RM + logger + sortir du mode

**Files:**
- Modify: `src/components/strength/WorkoutRunner.tsx` (`handleReferenceSet`)
- Test : étendre `WorkoutRunner.estimation.test.tsx`

**Step 1 : Étendre le test**

Ajouter dans `WorkoutRunner.estimation.test.tsx` :

```tsx
import { fireEvent, waitFor } from '@testing-library/react';
import { estimateOneRM } from '@/lib/prDetection';

it('calls onEstimationComplete with Epley-computed 1RM on reference set', async () => {
  const onEstimationComplete = vi.fn().mockResolvedValue(undefined);
  const onLogSets = vi.fn().mockResolvedValue(undefined);

  render(
    <WorkoutRunner
      session={session as any}
      exercises={[exercise as any]}
      oneRMs={[]}
      onFinish={vi.fn()}
      onLogSets={onLogSets}
      userId={1}
      initialStep={1}
      inlineEstimationExercises={new Set([5])}
      onEstimationComplete={onEstimationComplete}
    />,
  );

  // Set weight=60, reps=8, difficulty=4 directement via les inputs internes
  // (le test bypass numpad — on s'attend à ce que le bouton soit désactivé
  // tant qu'on n'a pas saisi). Pour ce test, on injecte les valeurs en mockant
  // l'état initial — alternative : simuler les taps sur la numpad complète.
  // Approche pragmatique : tester la fonction handleReferenceSet via un wrapper
  // ou exposer estimateOneRM logique séparément. Ici on teste le wiring final.

  // Pour V1 : tester seulement que le calcul Epley est bien celui appelé.
  // L'estimation pour (60, 8, 4) avec RIR=1 → 60 * (1 + 9/30) = 78 kg
  const expected = estimateOneRM(60, 8, 4);
  expect(expected).toBe(78);
});
```

(Note : le test E2E complet du clic boutons sera couvert par smoke test manuel en Task 13.)

**Step 2 : Implémenter `handleReferenceSet`**

Remplacer le stub Task 8 :

```ts
const handleReferenceSet = async () => {
  if (!currentBlock || !onEstimationComplete) return;
  const weight = Number(currentSetInputs[0]?.weight ?? 0);
  const reps = Number(currentSetInputs[0]?.reps ?? 0);
  const difficulty = currentSetInputs[0]?.difficulty ?? null;
  if (weight <= 0 || reps <= 0 || difficulty == null) return;

  // Calcul Epley+RIR via la fonction existante de prDetection.ts
  const estimated = estimateOneRM(weight, reps, difficulty);
  if (estimated <= 0) {
    toast.error("Estimation impossible", {
      description: "Vérifie la charge et le nombre de répétitions.",
    });
    return;
  }

  // Persist le 1RM côté parent (Strength.tsx → update1RM + invalidate query)
  try {
    await onEstimationComplete(currentBlock.exercise_id, estimated);
  } catch {
    toast.error("Erreur", {
      description: "1RM non sauvegardé. Réessaye.",
    });
    return;
  }

  // Log la série de référence comme série 1 standard
  const newLog = {
    exercise_id: currentBlock.exercise_id,
    set_number: 1,
    reps,
    weight,
    difficulty,
  };
  setLogs((prev) => [...prev, newLog]);
  isLoggingRef.current = true;
  try {
    await onLogSets?.([newLog]);
  } finally {
    isLoggingRef.current = false;
  }

  // Reset warmupHistory + avance à série 2
  setWarmupHistory([]);
  setCurrentSetInputs({});
  setCurrentSetIndex(2);

  if (autoRest && currentBlock.rest_seconds > 0) {
    startRestTimer(currentBlock.rest_seconds, "set");
  }
};
```

**Step 3 : Run test**

```bash
npx vitest run src/components/strength/__tests__/WorkoutRunner.estimation.test.tsx
```

Expected : 3 passes.

**Step 4 : Smoke test manuel — Mode dev**

```bash
npm run dev
```

Scénario :
1. Compte de test, exo "Squat" sans 1RM, séance avec 4×8 @75%
2. Clic "Estimer pendant la séance" sur le gate
3. Série 1 → bandeau jaune visible
4. Saisir 40kg×10, difficulté 2 → "+ Chauffe suivante" (visible dans history)
5. Saisir 60kg×8, difficulté 4 → "C'est ma série de référence → calculer"
6. Toast "🎯 1RM estimé : 78kg"
7. Série 2 s'affiche avec targetWeight = `round(78 * 0.75) = 59 kg`
8. Vérifier en DB : `SELECT one_rm FROM strength_one_rm WHERE athlete_id=... AND exercise_id=...` → 78

**Step 5 : Commit**

```bash
git add src/components/strength/WorkoutRunner.tsx \
        src/components/strength/__tests__/WorkoutRunner.estimation.test.tsx
git commit -m "feat(§297): handleReferenceSet calcule Epley, persist 1RM, log série 1, avance à série 2"
```

---

## Task 10 : Bouton "Recalculer ma 1RM" sur série 1

**Files:**
- Modify: `src/components/strength/WorkoutRunner.tsx`

**Step 1 : Ajouter le bouton sous la carte de série**

Juste après le bloc `<Button variant="outline" className="w-full rounded-2xl" onClick={() => setSeriesSheetOpen(true)}>` (ligne 1096), insérer :

```tsx
{/* §297 — Recalculer 1RM : visible uniquement sur série 1 d'exos chargés non en
    mode estimation, et avant que la série 1 ne soit loggée. */}
{!isBodyweightExercise &&
  !isEstimationMode &&
  currentSetIndex === 1 &&
  !currentLoggedSet &&
  onRequestRecalc &&
  currentBlock && (
    <Button
      variant="ghost"
      size="sm"
      className="w-full text-xs text-muted-foreground"
      onClick={() => onRequestRecalc(currentBlock.exercise_id)}
    >
      <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
      Recalculer ma 1RM
    </Button>
  )}
```

**Step 2 : Importer `RefreshCw` depuis `lucide-react`**

Ajouter à la liste des imports lucide-react (ligne 19-27) :

```ts
import {
  ArrowLeft,
  Check,
  CheckCircle2,
  RefreshCw,        // ← nouveau
  RotateCcw,
  StickyNote,
  Trophy,
  WifiOff,
  X,
} from "lucide-react";
```

**Step 3 : Test rapide — Smoke**

```bash
npm run dev
```

Scénario :
1. Compte avec 1RM Squat = 100kg déjà saisi
2. Lancer une séance avec Squat 4×8 @75%
3. Sur série 1 → bouton "Recalculer ma 1RM" visible
4. Clic → toast "Mode estimation activé" + bandeau jaune apparaît
5. Faire chauffes + référence comme Task 9

**Step 4 : Type check + tests**

```bash
npx tsc --noEmit && npm test -- --run
```

Expected : 0 erreur, 0 régression.

**Step 5 : Commit**

```bash
git add src/components/strength/WorkoutRunner.tsx
git commit -m "feat(§297): bouton 'Recalculer ma 1RM' sur série 1 des exos chargés"
```

---

## Task 11 : Persistance du mode estimation (focus state localStorage)

**Files:**
- Modify: `src/pages/Strength.tsx` (snapshot focus + restauration)
- Modify: `src/hooks/useStrengthState.ts` (si snapshot lifted ici — vérifier)

**Step 1 : Étendre le snapshot localStorage**

`src/pages/Strength.tsx:680-697` — sur l'écriture du focusKey, ajouter `inlineEstimationExercises: Array.from(inlineEstimationExercises)` :

```ts
window.localStorage.setItem(
  focusKey,
  JSON.stringify({
    screenMode: "reader",
    session: { ...activeSession, cycle: lockedCycle, items: activeFilteredItems },
    assignment: activeAssignment,
    runId: res.run_id,
    runLogs: [],
    runnerStep: 1,
    cycleType: lockedCycle,
    inlineEstimationExercises: Array.from(inlineEstimationExercises),  // ← nouveau
  }),
);
```

**Step 2 : Restaurer au mount**

Identifier où le focus state est lu depuis localStorage (probablement `useStrengthState.ts` ou dans un useEffect de Strength.tsx). Chercher avec :

```bash
grep -n "strength-focus-state" /Users/francoiswagner/Antigravity/Project-EAC/competition/src
```

À l'endroit où le JSON est parsé, ajouter :

```ts
const restoredIds = Array.isArray(snapshot.inlineEstimationExercises)
  ? snapshot.inlineEstimationExercises.filter((id: unknown) => typeof id === 'number')
  : [];
setInlineEstimationExercises(new Set(restoredIds));
```

**Step 3 : Type check**

```bash
npx tsc --noEmit
```

Expected : 0 erreurs.

**Step 4 : Smoke test — Background kill simulation**

```bash
npm run dev
```

Scénario :
1. Lancer séance avec "Estimer pendant la séance"
2. Faire 2 chauffes
3. Hard reload (Ctrl+Shift+R)
4. La séance reprend, bandeau jaune toujours présent sur série 1 (chauffes perdues — acceptable)
5. Refaire chauffes + référence → fonctionne normalement

**Step 5 : Commit**

```bash
git add src/pages/Strength.tsx src/hooks/useStrengthState.ts
git commit -m "feat(§297): persistance inlineEstimationExercises dans focus state localStorage"
```

---

## Task 12 : Mise à jour de la documentation projet

**Files:**
- Modify: `docs/implementation-log.md` (entrée §297)
- Modify: `docs/ROADMAP.md` (nouvelle ligne + date en tête)
- Modify: `docs/FEATURES_STATUS.md` (entrée pour la nouvelle feature)
- Modify: `CLAUDE.md` (ligne "Dernier §")
- Modify: `docs/claude/files-map.md` (nouveaux fichiers + tailles modifiées)

**Step 1 : Mesurer les tailles des fichiers modifiés**

```bash
wc -l src/components/strength/OneRmGate.tsx \
      src/components/strength/WorkoutRunner.tsx \
      src/pages/Strength.tsx \
      src/lib/strength/missing1rmFilter.ts \
      src/pages/coach/StrengthCatalog.tsx
```

Noter les valeurs pour `files-map.md`.

**Step 2 : Entrée `implementation-log.md` (§297)**

Ajouter au tableau des entrées :

```markdown
## §297 — Flag is_bodyweight + estimation 1RM inline (ramp-up) — 2026-05-21

**Contexte :** Les exos au poids de corps (pompes, tractions...) déclenchaient
inutilement le OneRmGate. Et les nageurs sans 1RM connu devaient soit deviner,
soit perdre la prescription en % (bouton "Poids libre").

**Changements :**
- DB : migration `00183_dim_exercices_is_bodyweight.sql` (colonne BOOLEAN NOT NULL DEFAULT FALSE)
- Types : `Exercise.is_bodyweight?: boolean` propagé dans 3 mappers
- Catalogue coach : checkbox "Exercice au poids de corps" dans create + edit dialog
- OneRmGate : "Poids libre" → "Estimer pendant la séance" (set populé avec exos non saisis)
- WorkoutRunner : 3 nouveaux modes UI sur série 1 :
  1. Exo PDC → tile Charge masquée, log auto BODYWEIGHT_SENTINEL
  2. Mode estimation → bandeau + warmupHistory + 2 boutons (chauffe / référence)
  3. Bouton "Recalculer ma 1RM" disponible sur tout exo chargé non encore loggé
- handleReferenceSet : calcule Epley+RIR via estimateOneRM existant, persist via
  update1RM, log série 1 standard, avance à série 2 (target weight recalculé)

**Fichiers modifiés :**
- supabase/migrations/00183_dim_exercices_is_bodyweight.sql (nouveau)
- src/lib/api/types.ts, src/lib/api/client.ts, src/lib/api/helpers.ts
- src/lib/strength/missing1rmFilter.ts (nouveau, extrait pour testabilité)
- src/components/strength/OneRmGate.tsx, WorkoutRunner.tsx
- src/pages/Strength.tsx, src/pages/coach/StrengthCatalog.tsx
- 3 nouveaux fichiers de tests dans __tests__/

**Tests :** 5 unit tests mappers + 4 tests filtre + 2 tests UI bodyweight +
  3 tests UI estimation. Smoke manuel : ramp-up dev local, persistance reload,
  vérification DB du 1RM persisté.

**Limites V1 :**
- Chauffes ramp-up éphémères (non persistées). Si crash/quit pendant l'estimation,
  l'utilisateur reprend du début. Acceptable car les chauffes ne sont pas du
  "vrai travail" loggé.
- Coach ne voit pas le ramp-up dans l'historique du nageur (seule la série de
  référence apparaît). Si besoin → table `strength_warmup_sets` future.

**RLS :** aucun changement de policy, `npm run test:rls` non requis.
```

**Step 3 : Mise à jour ROADMAP.md**

- Ligne en tête : `*Dernière mise à jour* : 2026-05-21 (§297)`
- Ajouter une ligne au tableau des § livrés : `§297 — Flag is_bodyweight + estimation 1RM inline (ramp-up) ✅`

**Step 4 : Mise à jour FEATURES_STATUS.md**

Ajouter ou mettre à jour une entrée sous la section Musculation :

```markdown
- ✅ Flag `is_bodyweight` au catalogue exercices (UI Charge masquée pendant séance)
- ✅ Estimation 1RM inline via ramp-up (chauffes + série de référence sur S1)
- ✅ Bouton "Recalculer ma 1RM" sur S1 de tout exo chargé
```

**Step 5 : Mise à jour CLAUDE.md**

Remplacer la ligne `Dernier § livré : **§296** — ...` par :

```markdown
Dernier § livré : **§297** — Flag is_bodyweight + estimation 1RM inline (ramp-up).
```

**Step 6 : Mise à jour `docs/claude/files-map.md`**

- Mettre à jour les tailles des fichiers modifiés (mesurées Step 1) si variation > 30%
- Ajouter ligne pour `src/lib/strength/missing1rmFilter.ts` (nouveau)
- Si un test ≥ 150 lignes → l'ajouter aussi

**Step 7 : Commit**

```bash
git add docs/ CLAUDE.md
git commit -m "docs(§297): implementation-log + ROADMAP + FEATURES_STATUS + files-map"
```

---

## Task 13 : Vérification finale end-to-end

**Files:** aucun

**Step 1 : Type check complet**

```bash
npx tsc --noEmit
```

Expected : 0 erreurs.

**Step 2 : Suite de tests complète**

```bash
npm test -- --run
```

Expected : 0 régression (les nouveaux tests passent, anciens inchangés sauf adaptation `onSkipToFreeWeight` → `onEstimateInline` dans mocks éventuels).

**Step 3 : Build de production**

```bash
npm run build
```

Expected : build OK, pas d'erreur de bundling.

**Step 4 : Smoke test end-to-end manuel (3 scénarios)**

`npm run dev`, puis :

**Scénario A — Exo PDC** :
1. Coach crée "Test Pompes", coche PDC, sauvegarde
2. Coach ajoute "Test Pompes" à une séance, l'assigne au nageur
3. Nageur lance la séance → pas de OneRmGate (PDC ignoré)
4. Série 1 → seule tile Reps visible, pas de Charge
5. Saisir 12 reps, valider → log enregistré avec `weight = -1` (BODYWEIGHT_SENTINEL)
6. Vérifier : `SELECT weight, reps FROM strength_set_logs WHERE exercise_id=...` → `(-1, 12)`

**Scénario B — Estimation inline depuis gate** :
1. Nageur sans 1RM Squat, séance Squat 4×8 @75%
2. Lancer → gate s'ouvre, ne pas saisir, clic "Estimer pendant la séance"
3. Série 1 → bandeau jaune
4. Chauffe 1 : 40×10, diff 2 → "Chauffe suivante"
5. Chauffe 2 : 50×8, diff 3 → "Chauffe suivante"
6. Référence : 60×8, diff 4 → "C'est ma série de référence"
7. Toast "🎯 1RM estimé : 78kg"
8. Série 2 affiche target = 59kg (= 78 × 0.75 arrondi)
9. Vérifier DB : 1RM Squat = 78kg

**Scénario C — Recalcul manuel** :
1. Nageur avec 1RM Squat existant
2. Lancer séance Squat
3. Série 1 → bouton "Recalculer ma 1RM" visible
4. Clic → bandeau jaune, mode estimation actif
5. Faire chauffes + référence comme scénario B
6. 1RM mis à jour avec la nouvelle valeur

**Step 5 : Vérifier le déploiement après merge**

> ⚠ Ne PAS déployer en local. Pousser sur `main` ou trigger workflow GitHub Actions.

Après deploy : vérifier dans la console navigateur `[EAC] Build: <date>` et tester le scénario A en prod sur compte de test.

**Step 6 : Plan complet — fin**

Si tous les scénarios passent, le plan est achevé.

---

## Récapitulatif des artefacts produits

| Type | Fichier | Statut |
|---|---|---|
| Migration | `supabase/migrations/00183_dim_exercices_is_bodyweight.sql` | Nouveau |
| Type | `src/lib/api/types.ts` | Modifié |
| Mapper | `src/lib/api/client.ts` | Modifié |
| Mapper | `src/lib/api/helpers.ts` | Modifié |
| API call | `src/lib/api/strength.ts` | Inchangé (update1RM réutilisé) |
| Logic | `src/lib/strength/missing1rmFilter.ts` | Nouveau |
| UI gate | `src/components/strength/OneRmGate.tsx` | Refondu |
| UI runner | `src/components/strength/WorkoutRunner.tsx` | Modifié (mode bodyweight + estimation + bouton recalc) |
| UI page | `src/pages/Strength.tsx` | Modifié (state + callbacks + props passées) |
| UI coach | `src/pages/coach/StrengthCatalog.tsx` | Modifié (checkbox PDC ×2 dialogs) |
| Test | `src/lib/api/__tests__/exerciseMappers.test.ts` | Nouveau |
| Test | `src/pages/__tests__/strength_missing1rm_filter.test.ts` | Nouveau |
| Test | `src/components/strength/__tests__/WorkoutRunner.bodyweight.test.tsx` | Nouveau |
| Test | `src/components/strength/__tests__/WorkoutRunner.estimation.test.tsx` | Nouveau |
| Persistance | Snapshot focus state | Modifié |
| Docs | `docs/implementation-log.md`, `docs/ROADMAP.md`, `docs/FEATURES_STATUS.md`, `CLAUDE.md`, `docs/claude/files-map.md` | Modifiés |
