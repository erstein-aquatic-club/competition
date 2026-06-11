# §375 — Affûtage progressif par paliers + scope des facteurs d'ajustement — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Corriger les deux écarts actionnables de l'audit moteur muscu (2026-06-10) : (1) l'affûtage multi-semaines applique `sets × 0.4` uniformément alors que le doc validé coach (`bilan-muscu-templates-sources.md`, T1) prescrit des paliers progressifs −25 % → −40 % → −50 % ; (2) `applyAdjustmentFactors` (ajustement mid-cycle coach) scale AUSSI les amorces PAP (dose fixe par doctrine — fraîcheur avant bassin) et les exos d'échauffement (Blocs 1-3 §351-352).

**Architecture:** Tout est TS pur, zéro I/O, zéro migration, zéro RLS. (1) Deux helpers purs exportés dans `mesocycleEngine.ts` (`taperSetFactor`, `phasePositionFor`) + threading du facteur par semaine via les `flags` de `buildWeek` → `JourAwareContext` → `buildSession` → `toMesocycleExercise`. (2) Garde de scope dans `adjustmentFactors.ts` sur `session.role` et `exo.warmupKind`. Bump `ENGINE_VERSION` 1.1.0 → 1.2.0. Le 3ᵉ écart de l'audit (progression intra-bloc `force_max`) n'est **PAS codé** : question coach préparée en fin de plan (Task 7).

**Tech Stack:** TypeScript, runner `node:test` (PAS vitest pour les `*.test.ts` — garde-fou `pretest` bloque tout import vitest), fixtures existantes dans `src/lib/strength/__tests__/`.

**Effet en prod :** comme tout fix moteur, visible UNIQUEMENT après régénération d'un mésocycle (les plans matérialisés ne sont jamais réécrits — gotcha connu). À mentionner dans l'implementation-log.

---

## Conventions d'exécution

- **Commande de test ciblée** (rapide, sans la suite complète) :
  ```bash
  node --test --experimental-test-module-mocks --import tsx src/lib/strength/__tests__/<fichier>.test.ts
  ```
- **Suite complète** (`npm test`) : uniquement en Task 6 (validation finale). Type check : `npx tsc --noEmit`.
- **Commits** : `git add <chemins explicites>` uniquement — JAMAIS `git add -A` (d'autres terminaux partagent ce checkout ; il y a du WIP non lié dans `src/components/coach/swim/`, `src/lib/date.ts`, `src/lib/strength/strengthPlanWeeks.ts`). Vérifier `git status` avant chaque commit.
- **Numéro de chantier** : §375. Avant le commit final, vérifier dans `git log --oneline -5` qu'aucun autre terminal n'a pris §375 ; sinon renuméroter.
- **Pas de `npm run test:rls`** : aucun critère RLS rempli (TS pur, pas de policy/API/migration).

---

### Task 1: Helper pur `taperSetFactor` (paliers d'affûtage)

**Files:**
- Modify: `src/lib/strength/mesocycleEngine.ts` (ajouter près de `midRange`/`clampToRange`, ~ligne 1826)
- Create: `src/lib/strength/__tests__/taperSetFactor.test.ts`

**Step 1: Écrire le test qui échoue**

Créer `src/lib/strength/__tests__/taperSetFactor.test.ts` :

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { taperSetFactor } from '../mesocycleEngine';

// §375 — paliers doc validé coach (templates-sources T1) :
// volume −25 % → −40 % → −50 % ⇒ multiplicateurs de séries 0.75 / 0.60 / 0.50.

test('affûtage 3 semaines → paliers 0.75 / 0.60 / 0.50', () => {
  assert.equal(taperSetFactor(0, 3), 0.75);
  assert.equal(taperSetFactor(1, 3), 0.6);
  assert.equal(taperSetFactor(2, 3), 0.5);
});

test('affûtage 2 semaines → 0.75 puis 0.50 (doc: « −25 % puis −50 % »)', () => {
  assert.equal(taperSetFactor(0, 2), 0.75);
  assert.equal(taperSetFactor(1, 2), 0.5);
});

test('affûtage 1 semaine → 0.50 (palier le plus profond directement)', () => {
  assert.equal(taperSetFactor(0, 1), 0.5);
});

test('défensif : count > 3 (impossible templates actuels, max_weeks=3) → table 3 sem., dernière valeur tenue', () => {
  assert.equal(taperSetFactor(0, 4), 0.75);
  assert.equal(taperSetFactor(3, 4), 0.5);
});

test('défensif : index négatif clampé à 0', () => {
  assert.equal(taperSetFactor(-1, 3), 0.75);
});
```

**Step 2: Vérifier l'échec**

Run: `node --test --experimental-test-module-mocks --import tsx src/lib/strength/__tests__/taperSetFactor.test.ts`
Expected: FAIL — `taperSetFactor` n'est pas exporté.

**Step 3: Implémentation minimale**

Dans `mesocycleEngine.ts`, juste avant `clampToRange` (~ligne 1831) :

```ts
/**
 * §375 — paliers d'affûtage progressifs. Multiplicateur de SÉRIES de la semaine
 * `phaseWeekIndex` (0-based) d'une phase `affutage` longue de `phaseWeekCount`
 * semaines. Doc validé coach (`bilan-muscu-templates-sources.md`, T1) : volume
 * −25 % → −40 % → −50 %. Remplace le ×0.4 plat historique (−60 % dès la 1ʳᵉ
 * semaine), incohérent avec le doc et avec la littérature taper (progressif >
 * marche d'escalier).
 *  - 1 sem. → [0.50] ; 2 sem. → [0.75, 0.50] ; 3 sem. → [0.75, 0.60, 0.50].
 *  - count > 3 : impossible avec les templates seedés (max_weeks affutage = 3) ;
 *    défensif → table 3 semaines, dernier palier tenu.
 */
export function taperSetFactor(phaseWeekIndex: number, phaseWeekCount: number): number {
  const TABLES: Record<number, readonly number[]> = {
    1: [0.5],
    2: [0.75, 0.5],
    3: [0.75, 0.6, 0.5],
  };
  const table = TABLES[phaseWeekCount] ?? TABLES[3];
  return table[Math.min(Math.max(0, phaseWeekIndex), table.length - 1)];
}
```

**Step 4: Vérifier le PASS**

Run: la même commande qu'au Step 2. Expected: PASS (5/5).

**Step 5: Commit**

```bash
git add src/lib/strength/mesocycleEngine.ts src/lib/strength/__tests__/taperSetFactor.test.ts
git commit -m "feat(§375): taperSetFactor — paliers d'affûtage 0.75/0.60/0.50 (helper pur)"
```

---

### Task 2: Helper pur `phasePositionFor` (position d'une semaine dans sa phase)

**Files:**
- Modify: `src/lib/strength/mesocycleEngine.ts` (sous `taperSetFactor`)
- Modify: `src/lib/strength/__tests__/taperSetFactor.test.ts` (même fichier de test)

**Step 1: Écrire le test qui échoue**

Ajouter au fichier de test de la Task 1 :

```ts
import { phasePositionFor } from '../mesocycleEngine';
import type { PeriodizedWeek } from '../mesocycleEngine.types';

const W = (weekNumber: number, cycle: PeriodizedWeek['cycle']): PeriodizedWeek => ({ weekNumber, cycle });

// Forme T1 étirée : force_max ×2 → maintien ×1 → affutage ×3 → pic ×1.
const T1_LIKE: PeriodizedWeek[] = [
  W(1, 'force_max'), W(2, 'force_max'),
  W(3, 'maintien'),
  W(4, 'affutage'), W(5, 'affutage'), W(6, 'affutage'),
  W(7, 'pic'),
];

test('phasePositionFor : course affûtage de 3 semaines → index 0/1/2, count 3', () => {
  assert.deepEqual(phasePositionFor(T1_LIKE, 3), { index: 0, count: 3 });
  assert.deepEqual(phasePositionFor(T1_LIKE, 4), { index: 1, count: 3 });
  assert.deepEqual(phasePositionFor(T1_LIKE, 5), { index: 2, count: 3 });
});

test('phasePositionFor : phase d\'une semaine (maintien, pic) → index 0, count 1', () => {
  assert.deepEqual(phasePositionFor(T1_LIKE, 2), { index: 0, count: 1 });
  assert.deepEqual(phasePositionFor(T1_LIKE, 6), { index: 0, count: 1 });
});

test('phasePositionFor : bornes du tableau (1ʳᵉ et dernière semaine)', () => {
  assert.deepEqual(phasePositionFor(T1_LIKE, 0), { index: 0, count: 2 });
  assert.deepEqual(phasePositionFor(T1_LIKE, 1), { index: 1, count: 2 });
});
```

**Step 2: Vérifier l'échec** — même commande. Expected: FAIL (`phasePositionFor` non exporté).

**Step 3: Implémentation minimale**

```ts
/**
 * §375 — position d'une semaine dans sa course CONTIGUË de même cycle (la
 * « phase » telle que matérialisée par `periodize`, après étirement/compression
 * et éventuel `startPhase`). Sert à dériver le palier d'affûtage de la semaine.
 * NB : les templates seedés n'ont jamais deux phases adjacentes de même cycle —
 * si ça arrivait, elles seraient vues comme UNE course (acceptable : le taper
 * progresserait sur l'ensemble).
 */
export function phasePositionFor(
  weeks: readonly PeriodizedWeek[],
  idx: number,
): { index: number; count: number } {
  const cycle = weeks[idx].cycle;
  let start = idx;
  while (start > 0 && weeks[start - 1].cycle === cycle) start--;
  let end = idx;
  while (end < weeks.length - 1 && weeks[end + 1].cycle === cycle) end++;
  return { index: idx - start, count: end - start + 1 };
}
```

**Step 4: Vérifier le PASS** — même commande. Expected: PASS (8/8).

**Step 5: Commit**

```bash
git add src/lib/strength/mesocycleEngine.ts src/lib/strength/__tests__/taperSetFactor.test.ts
git commit -m "feat(§375): phasePositionFor — position d'une semaine dans sa phase contiguë"
```

---

### Task 3: Threading du facteur dans le pipeline de génération

C'est la tâche centrale. Cinq points de modification dans `mesocycleEngine.ts`, tous mécaniques.

**Files:**
- Modify: `src/lib/strength/mesocycleEngine.ts` :
  - `generateMesocycle` (~ligne 993, boucle `periodizedWeeks.map`)
  - `buildWeek` signature `flags` (~ligne 1043) + construction des `ctxs` (~ligne 1088)
  - `interface JourAwareContext` (~ligne 1467)
  - `buildSession` (~lignes 1593-1598, blocs primaire/complément)
  - `toMesocycleExercise` (~lignes 1859, 1929-1933) + `ENGINE_VERSION` (ligne 774)
- Modify: `src/lib/strength/__tests__/mesocycleEngine.test.ts` (test d'intégration)

**Step 1: Écrire le test d'intégration qui échoue**

D'abord lire les ~120 premières lignes de `src/lib/strength/__tests__/mesocycleEngine.test.ts` pour repérer les fixtures existantes (`makeInput`/template/catalogue — il y a un template T8-like vers la ligne 1986). Ajouter ensuite un bloc de test, en réutilisant le style des fixtures du fichier :

```ts
describe('§375 — affûtage progressif par paliers', () => {
  // Template minimal : force_max ×1 → affutage ×3 (rigide) → pic ×1 = 5 semaines.
  // Catalogue : un exo upper_strength avec nbSeriesForce = 8 (8 → paliers
  // strictement décroissants : round(8×0.75)=6, round(8×0.6)=5, round(8×0.5)=4).
  // Construire l'input via les helpers existants du fichier (makeInput/makeCatalogExercise
  // ou équivalent — adapter les noms réels), targetWeekCount = 5, sessionsPerWeek = 2,
  // SANS weekdays (mode legacy : pas d'amorce PAP, toutes les séances en développement).

  it('les semaines d\'affûtage déclinent 0.75 → 0.60 → 0.50 sur les blocs de travail', () => {
    const result = generateMesocycle(input);
    const affutageWeeks = result.weeks.filter((w) => w.cycle === 'affutage');
    assert.equal(affutageWeeks.length, 3);
    // Pour chaque semaine d'affûtage, prendre le 1er exo de TRAVAIL (hors warmup :
    // warmupKind == null) de la 1ʳᵉ séance et relever ses sets.
    const setsByWeek = affutageWeeks.map((w) => {
      const exo = w.sessions[0].exercises.find((e) => e.warmupKind == null);
      assert.ok(exo);
      return exo.sets;
    });
    assert.deepEqual(setsByWeek, [6, 5, 4]); // 8 × [0.75, 0.6, 0.5], arrondi
  });

  it('une phase affutage d\'1 semaine reçoit directement le palier 0.50', () => {
    // Même input mais targetWeekCount comprimé pour que l'affûtage tombe à 1 semaine
    // (min_weeks affutage = 1). Assert : sets = round(8 × 0.5) = 4.
  });

  it('le pic et la force_max ne changent pas (non-régression)', () => {
    // pic : sets = 2 (inchangé) ; force_max : sets = nbSeriesForce = 8 (inchangé).
  });
});
```

**Step 2: Vérifier l'échec**

Run: `node --test --experimental-test-module-mocks --import tsx src/lib/strength/__tests__/mesocycleEngine.test.ts`
Expected: FAIL — les 3 semaines d'affûtage valent toutes `round(8×0.4) = 3` → `[3,3,3] ≠ [6,5,4]`.

**Step 3: Implémenter le threading (5 modifications)**

1. **`generateMesocycle`** — calculer le facteur par semaine et le passer aux flags :

```ts
const weeks: MesocycleWeek[] = periodizedWeeks.map((pw, weekIdx) => {
  // §375 — palier d'affûtage de CETTE semaine (null hors affutage).
  const pos = phasePositionFor(periodizedWeeks, weekIdx);
  const weekTaperFactor =
    pw.cycle === 'affutage' ? taperSetFactor(pos.index, pos.count) : null;
  return buildWeek(pw, bucketAllocations, selected, weekdays, primerWeekdays, jourAware, {
    forceBiasRequired,
    mobilityOverrideActive,
    bucketPriorityOrder,
    coreEmphasis,
    taperSetFactor: weekTaperFactor,
    sessionIndexBase: weekIdx * weekdays.length,
    commonWarmupPool,
    deficient,
    catalog: input.exerciseCatalog,
    painZones,
    level: input.athlete.level,
    activationRoutine: input.activationRoutine ?? {},
  });
});
```

2. **`buildWeek`** — ajouter au type inline des `flags` :

```ts
    /** §375 — palier d'affûtage de la semaine (null hors cycle affutage). */
    taperSetFactor: number | null;
```

et dans la construction des `ctxs` (objet retourné ~ligne 1129) ajouter :

```ts
      taperSetFactor: flags.taperSetFactor,
```

3. **`JourAwareContext`** — ajouter le champ :

```ts
  /** §375 — palier d'affûtage de la semaine (null hors affutage). Appliqué aux
   *  blocs de TRAVAIL (primaire/complément) par `toMesocycleExercise` ; warmup,
   *  core et amorces PAP non concernés (doses propres). */
  taperSetFactor: number | null;
```

4. **`buildSession`** — passer le facteur aux deux blocs de travail uniquement :

```ts
    const primaryBlock = primaryPool
      .slice(0, PRIMARY_BLOCK_COUNT)
      .map((s) => toMesocycleExercise(s, effectiveCycle, false, ctx.taperSetFactor));
    const complementBlock = complementPool
      .slice(0, COMPLEMENT_BLOCK_COUNT)
      .map((s) => toMesocycleExercise(s, effectiveCycle, false, ctx.taperSetFactor));
```

(Ne PAS toucher les appels warmup `isWarmup=true` ni la branche override mobilité : Règle 1, le cycle n'y joue pas. Ne pas toucher `buildCoreExercise` ni `buildPapSession`. `ensureMaintienRepresentation` réutilise `ctxs[idx]` → hérite du champ sans modification.)

5. **`toMesocycleExercise`** — signature + branche affutage :

```ts
function toMesocycleExercise(
  selectedEx: SelectedExercise,
  cycle: PeriodizationCycle,
  isWarmup: boolean,
  taperFactor: number | null = null,
): MesocycleExercise {
```

```ts
    } else if (cycle === 'affutage') {
      // §375 — paliers progressifs (doc T1 : −25 % → −40 % → −50 %) au lieu du
      // ×0.4 plat. `?? 0.5` défensif : un appel sans facteur (ne devrait pas
      // exister) reçoit le palier le plus profond, proche de l'ancien 0.4.
      sets = Math.max(1, Math.round(baseSets * (taperFactor ?? 0.5)));
      reps = baseReps;
      intensityPct1rm = baseIntensity; // intensité tenue, volume décroissant
      restSeconds = baseRest;
    }
```

6. **`ENGINE_VERSION`** : `'1.1.0'` → `'1.2.0'`. Vérifier qu'aucun test ne fige l'ancienne valeur : `grep -rn "1\.1\.0\|engineVersion" src/lib/strength/__tests__/ src/lib/api/` — si un test l'asserte, le mettre à jour dans le même commit.

**Step 4: Vérifier le PASS + non-régression du fichier**

Run: `node --test --experimental-test-module-mocks --import tsx src/lib/strength/__tests__/taperSetFactor.test.ts src/lib/strength/__tests__/mesocycleEngine.test.ts`
Expected: PASS intégral. Si un test existant casse sur des `sets` en semaine d'affûtage : vérifier que la nouvelle valeur correspond au palier attendu (×0.75/0.6/0.5) et mettre à jour l'assertion (c'est le changement voulu), pas l'implémentation.

Run: `npx tsc --noEmit` — Expected: exit 0.

**Step 5: Commit**

```bash
git add src/lib/strength/mesocycleEngine.ts src/lib/strength/__tests__/mesocycleEngine.test.ts
git commit -m "feat(§375): affûtage progressif par paliers 0.75/0.60/0.50 — threading semaine→séance, ENGINE_VERSION 1.2.0"
```

---

### Task 4: Scope des facteurs d'ajustement — amorces PAP et warmup exclus

**Files:**
- Modify: `src/lib/strength/adjustmentFactors.ts`
- Modify: `src/lib/strength/__tests__/adjustmentFactors.test.ts`

**Step 1: Lire le helper `makePlan`/`makeExercise` du fichier de test** (~lignes 1-44) pour connaître le `role` par défaut des sessions fabriquées. Si `role` n'y figure pas ou vaut `'developpement'`, les tests existants restent valides tels quels.

**Step 2: Écrire les tests qui échouent**

Ajouter (adapter les helpers aux noms réels) :

```ts
test('§375: une séance amorce_pap n\'est PAS scalée (dose PAP fixe — fraîcheur avant bassin)', () => {
  const plan = makePlan([makeExercise({ sets: 2, intensityPct1rm: 85 })]);
  plan.weeks[0].sessions[0].role = 'amorce_pap';
  const out = applyAdjustmentFactors(plan, 1.5, 1.2);
  assert.equal(out.weeks[0].sessions[0].exercises[0].sets, 2);
  assert.equal(out.weeks[0].sessions[0].exercises[0].intensityPct1rm, 85);
});

test('§375: une séance mobilite_corrective n\'est PAS scalée (prescription de sécurité, pas une charge d\'entraînement)', () => {
  const plan = makePlan([makeExercise({ sets: 3, intensityPct1rm: 0 })]);
  plan.weeks[0].sessions[0].role = 'mobilite_corrective';
  const out = applyAdjustmentFactors(plan, 1.5, 1.2);
  assert.equal(out.weeks[0].sessions[0].exercises[0].sets, 3);
});

test('§375: les exos d\'échauffement (warmupKind) gardent leur dose, les exos de travail scalent', () => {
  const plan = makePlan([
    makeExercise({ sets: 2, intensityPct1rm: 0, warmupKind: 'common' }),
    makeExercise({ sets: 2, intensityPct1rm: 0, warmupKind: 'corrective' }),
    makeExercise({ sets: 2, intensityPct1rm: 0, warmupKind: 'activation' }),
    makeExercise({ sets: 4, intensityPct1rm: 80 }), // travail
  ]);
  const out = applyAdjustmentFactors(plan, 1.5, 1.0);
  const exos = out.weeks[0].sessions[0].exercises;
  assert.deepEqual(exos.map((e) => e.sets), [2, 2, 2, 6]);
});
```

NB : si `makeExercise` ne accepte pas `warmupKind`, étendre le helper (champ optionnel pass-through).

**Step 3: Vérifier l'échec**

Run: `node --test --experimental-test-module-mocks --import tsx src/lib/strength/__tests__/adjustmentFactors.test.ts`
Expected: FAIL sur les 3 nouveaux tests (tout scale aujourd'hui).

**Step 4: Implémentation**

Remplacer le corps du map dans `applyAdjustmentFactors` :

```ts
    weeks: plan.weeks.map((week) => ({
      ...week,
      sessions: week.sessions.map((session) => {
        // §375 — hors scope du scaling coach :
        //  - amorce_pap : dose PAP fixe par doctrine (2×2 lourd + 2×3 explosif,
        //    fraîcheur avant le sprint bassin) — la moduler casserait l'intention ;
        //  - mobilite_corrective : prescription de sécurité (override douleur/
        //    dysfonction), pas une charge d'entraînement à doser.
        if (session.role === 'amorce_pap' || session.role === 'mobilite_corrective') {
          return session;
        }
        return {
          ...session,
          exercises: session.exercises.map((exo) =>
            // §375 — l'échauffement (Blocs 1-3 §351-352, tagué warmupKind) garde
            // sa dose d'activation, quel que soit le volume cible du coach.
            exo.warmupKind != null
              ? exo
              : {
                  ...exo,
                  sets: Math.max(1, Math.round(exo.sets * volumeFactor)),
                  intensityPct1rm:
                    exo.intensityPct1rm == null || exo.intensityPct1rm === 0
                      ? exo.intensityPct1rm
                      : Math.max(0, Math.min(100, Math.round(exo.intensityPct1rm * intensityFactor))),
                },
          ),
        };
      },
    ),
    })),
```

(Adapter la fermeture des parenthèses au fichier réel ; conserver les throws défensifs et la pureté.)

**Step 5: Vérifier le PASS**

Run: même commande + `node --test --experimental-test-module-mocks --import tsx src/lib/strength/__tests__/mesocycleAdjust.integration.test.ts` (consommateur direct — vérifier qu'il ne fige pas l'ancien comportement ; s'il fabrique des sessions sans `role` valide, ajuster ses fixtures vers `'developpement'`).
Run: `npx tsc --noEmit` — Expected: exit 0.

**Step 6: Commit**

```bash
git add src/lib/strength/adjustmentFactors.ts src/lib/strength/__tests__/adjustmentFactors.test.ts src/lib/strength/__tests__/mesocycleAdjust.integration.test.ts
git commit -m "feat(§375): ajustement mid-cycle scoped — amorces PAP, mobilité corrective et warmup exclus du scaling"
```

---

### Task 5: Vérifier l'UI d'ajustement (lecture seule, pas de code attendu)

**Files:**
- Read: `src/pages/MesocycleAdjust.tsx` (écran coach §338, consommateur de `applyAdjustmentFactors`)

**Step 1:** Grep `applyAdjustmentFactors` dans `src/` pour confirmer que `MesocycleAdjust.tsx` (et son preview) est le seul appelant.
**Step 2:** Vérifier que l'aperçu de l'écran reflète le plan retourné par la fonction (il affichera automatiquement les amorces non modifiées — comportement voulu). Si l'écran affiche un texte du type « toutes les séances seront ajustées », corriger le libellé (1 ligne) pour mentionner que amorces PAP et échauffements gardent leur dose.
**Step 3:** Si modification de libellé : commit `fix(§375): libellé MesocycleAdjust — amorces/warmup hors scaling`. Sinon, rien.

---

### Task 6: Validation finale complète

**Step 1:** `npx tsc --noEmit` — Expected: exit 0.
**Step 2:** `npm test` — Expected: suite complète verte (~158 fichiers + vitest scopé). NE PAS lancer `npm run test:rls` (aucun critère rempli).
**Step 3:** Si échec : diagnostiquer avec superpowers:systematic-debugging avant tout fix. Ne pas commit en rouge.

---

### Task 7: Documentation obligatoire (workflow CLAUDE.md) + question coach

**Files:**
- Modify: `docs/implementation-log.md` (nouvelle entrée §375 en tête)
- Modify: `docs/ROADMAP.md` (ligne §375 + ligne `*Dernière mise à jour*` en tête)
- Modify: `CLAUDE.md` (UNIQUEMENT la ligne « Dernier § livré », ≤ 15 mots)
- Check: `docs/FEATURES_STATUS.md` (probablement aucun statut à changer — vérifier la ligne mésocycle/ajustement)
- Check: `docs/claude/files-map.md` (tailles : `wc -l src/lib/strength/mesocycleEngine.ts src/lib/strength/adjustmentFactors.ts` — mettre à jour seulement si variation > 30 %, improbable)

**Step 1:** Entrée `implementation-log.md` §375 avec : contexte (audit 2026-06-10 — 2 écarts corrigés sur 3), changements, fichiers, tests, décisions (palier 1 sem. = 0.50 ; `mobilite_corrective` exclue du scaling — décision d'implémentation à confirmer avec le coach), limites :
   - effet visible UNIQUEMENT après régénération d'un méso (plans matérialisés non réécrits) ;
   - **3ᵉ écart NON traité** : progression intra-bloc `force_max` — question coach ci-dessous.
**Step 2:** Question coach à consigner dans le log (et à poser à François pour transmission) :

> **Progression intra-bloc `force_max` (audit §375, écart #1).** Aujourd'hui chaque semaine d'un bloc force est identique (séries/reps/%1RM catalogue). Proposition : rampe d'intensité APPROCHANT la charge catalogue sans jamais la dépasser — bloc 2 sem. : [−5 pts, catalogue] ; 3 sem. : [−7.5, −2.5, catalogue] ; 4 sem. : [−7.5, −5, −2.5, catalogue]. Le mécanisme (`phasePositionFor`) est déjà en place ; l'implémentation est triviale une fois le schéma validé. Valides-tu ces paliers, en veux-tu d'autres, ou préfères-tu garder le chargement plat ?

**Step 3:** Vérifier le numéro § (collision multi-terminaux : `git log --oneline -5`).
**Step 4:** Commit :

```bash
git add docs/implementation-log.md docs/ROADMAP.md CLAUDE.md docs/FEATURES_STATUS.md docs/claude/files-map.md
git commit -m "docs(§375): log + roadmap — affûtage progressif, scope ajustements, question coach force_max"
```

**Step 5:** `graphify update .` (maintien du graphe, AST-only).

---

## Hors scope (explicite)

- **Progression intra-bloc `force_max`** : question coach (Task 7), pas de code.
- **Autorégulation RIR→charge, VBT** : écarts d'audit assumés, non planifiés ici.
- **Déploiement** : push sur `main` déclenche GitHub Actions (jamais de deploy local). Le push n'est PAS dans ce plan — à la demande de François.
- **Régénération des mésos actifs** : décision coach par athlète après déploiement (les plans existants gardent l'ancien affûtage plat).
