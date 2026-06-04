# Calibration 1RM inline (§369) — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Aider un nageur qui ne connaît pas son max à obtenir un 1RM **en séance**, via une simple carte de série 1 augmentée — strictement gated (uniquement exo %1RM + weight_kg + non-PDC + sans 1RM), sans wizard, sans bloquer le lancement, sans casser la navigation de séance.

**Architecture:** On part du code **reverté §297** (qui contient déjà `estimateOneRM`, `isEstimationMode`, `onEstimationComplete`, le `OneRmGate`). On (1) ajoute un RIR explicite à `estimateOneRM`, (2) crée un **gate pur testable** `needsOneRmCalibration` (LE test qui aurait attrapé l'incident §368), (3) remplace le ramp-up §297 (`handleReferenceSet`/`handleAddWarmupSet`/`warmupHistory`/bannière) par une **carte de série 1 augmentée** (hint + champ reps-en-réserve) déclenchée inline, (4) retire le `OneRmGate` pré-séance (lancement un tap), (5) persiste le 1RM **sans `invalidateQueries(["1rm"])` en séance** (map locale du run pour cibler les séries 2+).

**Tech Stack:** React 19 + TS, Tailwind, `node:test` (logique pure) + vitest jsdom + node:test SSR (`renderToStaticMarkup`, cf. `src/pages/__tests__/StrengthRunner.test.tsx`).

**Branche :** `feat/muscu-369-calibration-1rm-inline` (déjà créée depuis `main` post-revert ; contient le design `docs/plans/2026-06-04-calibration-1rm-inline-design.md`).

**Référence design :** lire `docs/plans/2026-06-04-calibration-1rm-inline-design.md` avant de commencer.

⚠️ **Isolation** : le working tree partagé est sur `main` (WIP swim d'un autre terminal). Travailler dans le worktree `/tmp/wt-369` (déjà monté). Stage par chemins explicites, **jamais `git add -A`**.

⚠️ **Process** : §369 **ne sera pas mergé/déployé sans smoke terrain** (cf. incident §368).

---

## Task 1 : `estimateOneRM` accepte un RIR explicite

**Files:**
- Modify: `src/lib/prDetection.ts:26-33` (fonction `estimateOneRM`)
- Test: `src/__tests__/prDetection.test.ts`

Le code reverté a `estimateOneRM(weight, reps, difficulty?)` qui déduit le RIR de la difficulté via `difficultyToRIR`. On ajoute une surcharge objet `{ rir }` sans casser les appelants.

**Step 1 — Test qui échoue** (mirror le style `describe`/`it` `node:test` du fichier) :
```ts
test("estimateOneRM: RIR explicite prime sur la difficulté", () => {
  assert.equal(estimateOneRM(60, 5, { rir: 2 }), 74); // effectiveReps 7 → 60*(1+7/30)=74
});
test("estimateOneRM: RIR explicite 0 = échec (effectiveReps = reps)", () => {
  assert.equal(estimateOneRM(100, 1, { rir: 0 }), 100);
});
test("estimateOneRM: rétrocompat — 3e arg numérique = difficulté", () => {
  assert.equal(estimateOneRM(60, 5, 3), 76); // difficulté 3 → RIR 3 → effectiveReps 8
});
```

**Step 2 — Run, FAIL.** `node --test --import tsx src/__tests__/prDetection.test.ts`

**Step 3 — Implémentation** :
```ts
export function estimateOneRM(
  weight: number,
  reps: number,
  effort?: number | null | { rir: number },
): number {
  if (reps <= 0 || weight <= 0) return 0;
  const rir =
    effort != null && typeof effort === "object"
      ? Math.max(0, Math.round(effort.rir))
      : difficultyToRIR(effort);
  const effectiveReps = reps + rir;
  if (effectiveReps <= 0) return 0;
  if (effectiveReps === 1) return weight;
  return Math.round(weight * (1 + effectiveReps / 30) * 10) / 10;
}
```
Mettre à jour le JSDoc au-dessus pour mentionner `{ rir }`.

**Step 4 — Run, PASS.** **Step 5 — `npx tsc --noEmit` → 0.**

**Step 6 — Commit** :
```bash
git add src/lib/prDetection.ts src/__tests__/prDetection.test.ts
git commit -m "feat(§369): estimateOneRM accepte un RIR explicite {rir}"
```

---

## Task 2 : gate pur `needsOneRmCalibration` (anti-régression #4)

**Files:**
- Create: `src/lib/strength/oneRmCalibration.ts`
- Test: `src/lib/strength/__tests__/oneRmCalibration.test.ts`

**LE test qui aurait attrapé l'incident §368.** Gate pur : la calibration n'apparaît que pour un exo prescrit en %1RM, métrique weight_kg, non-PDC, sans 1RM connu, à la série 1.

**Step 1 — Test qui échoue** (`node:test`, imports avec extension `.ts` comme les siblings) :
```ts
import { needsOneRmCalibration } from "../oneRmCalibration.ts";

const base = { setIndex: 1, percent1rm: 70, metric: "weight_kg", isBodyweight: false, hasOneRm: false };

test("éligible : %1RM + weight_kg + non-PDC + sans 1RM, série 1", () => {
  assert.equal(needsOneRmCalibration(base), true);
});
test("PAS éligible : exo sans %1RM (accessoire/reps)", () => {
  assert.equal(needsOneRmCalibration({ ...base, percent1rm: 0 }), false);
});
test("PAS éligible : poids de corps (PDC)", () => {
  assert.equal(needsOneRmCalibration({ ...base, isBodyweight: true }), false);
});
test("PAS éligible : métrique non-poids (élastique mappé height_cm/time_s, §298)", () => {
  assert.equal(needsOneRmCalibration({ ...base, metric: "height_cm" }), false);
});
test("PAS éligible : 1RM déjà connu", () => {
  assert.equal(needsOneRmCalibration({ ...base, hasOneRm: true }), false);
});
test("PAS éligible : pas la série 1", () => {
  assert.equal(needsOneRmCalibration({ ...base, setIndex: 2 }), false);
});
```

**Step 2 — Run, FAIL.**

**Step 3 — Implémentation** :
```ts
export interface CalibrationGateInput {
  setIndex: number;
  percent1rm: number | null | undefined;
  metric: string | null | undefined;
  isBodyweight: boolean;
  hasOneRm: boolean;
}

/**
 * Vrai uniquement quand une calibration 1RM en séance a du sens :
 * série 1, exo prescrit en %1RM, métrique poids (kg), non poids-de-corps,
 * et aucun 1RM connu. (Restaure les 4 filtres de l'ancien §297
 * computeMissing1RmExercises, évalués inline — cf. incident §368.)
 */
export function needsOneRmCalibration(i: CalibrationGateInput): boolean {
  return (
    i.setIndex === 1 &&
    Number(i.percent1rm ?? 0) > 0 &&
    (i.metric ?? "weight_kg") === "weight_kg" &&
    !i.isBodyweight &&
    !i.hasOneRm
  );
}
```

**Step 4 — Run, PASS.** **Step 5 — `npx tsc --noEmit` → 0.**

**Step 6 — Commit** :
```bash
git add src/lib/strength/oneRmCalibration.ts src/lib/strength/__tests__/oneRmCalibration.test.ts
git commit -m "feat(§369): gate pur needsOneRmCalibration (anti-régression élastique/PDC/%1RM)"
```

---

## Task 3 : WorkoutRunner — carte de série 1 augmentée (remplace le ramp-up §297)

**Files:**
- Modify: `src/components/strength/WorkoutRunner.tsx` (anchors ci-dessous)
- Test: `src/pages/__tests__/StrengthRunner.test.tsx`

**Anchors dans le code reverté** (lire avant d'éditer — les numéros peuvent bouger) :
- `isBodyweightExercise` (346), `metric`/`tracksWeight` (348-350), `isEstimationMode` (351-354), `warmupHistory` state (356), `hasPercent`/`rm`/`targetWeight`/`targetValue` (389-396).
- `handleAddWarmupSet` (692), `handleReferenceSet` (702-…), bannière « Estimation 1RM en cours » (~1280), grille charge/reps (1317), bloc recalc (~1408), `{!isEstimationMode && …}` (1424).
- `onEstimationComplete` prop (192/221), `inlineEstimationExercises` (190/219), `onRequestRecalc` (191/220), `oneRMs` prop.

**But :** remplacer le mode estimation ramp-up (chauffe + série de référence) par une **carte de série 1 augmentée** : la grille charge/reps habituelle + un champ **« reps en réserve »** + une **ligne d'aide**, déclenchée par le gate **inline**.

**Step 1 — Gate inline + état local du 1RM du run**

Ajouter près des dérivés (après `hasPercent`) :
```ts
const hasOneRmForCurrent = Number(oneRMs.find((r) => r.exercise_id === currentBlock?.exercise_id)?.weight ?? 0) > 0;
const needsCalibration =
  currentBlock != null &&
  needsOneRmCalibration({
    setIndex: currentSetIndex,
    percent1rm: percentValue,
    metric,
    isBodyweight: isBodyweightExercise,
    hasOneRm: hasOneRmForCurrent,
  });
```
Ajouter un état run-local (avec les autres `useState`, **inconditionnel**, cf. historique #310) :
```ts
const [runOneRms, setRunOneRms] = useState<Map<number, number>>(new Map());
const [calibRir, setCalibRir] = useState<number | null>(null); // reps en réserve saisies
```
Faire en sorte que la **cible** des séries 2+ utilise d'abord la valeur fraîche locale :
- modifier le calcul de `rm` (389-393) pour : `const rm = hasPercent ? (runOneRms.get(currentBlock?.exercise_id ?? -1) ?? oneRMs.find(...)?.weight ?? 0) : 0;`

**Step 2 — Supprimer le ramp-up §297**

Retirer : `warmupHistory` (state + effet de reset), `handleAddWarmupSet`, `handleReferenceSet`, la bannière « Estimation 1RM en cours » (~1280-…), les boutons « + Chauffe suivante » / « série de référence ». Remplacer `isEstimationMode` par `needsCalibration` partout où c'était utilisé pour MASQUER la carte normale — mais désormais on **garde** la carte normale (charge/reps) et on l'**augmente** (pas de remplacement plein écran). Conserver `inlineEstimationExercises`/`onRequestRecalc` pour le recalcul (le gate effectif devient `needsCalibration || inlineEstimationExercises.has(id)` — exposer une const `showCalibration`).

**Step 3 — Augmenter la carte de série 1**

Quand `showCalibration` :
- afficher la **ligne d'aide** au-dessus de la grille : « On ne connaît pas ton max — échauffe-toi, fais une vraie série de travail, garde des reps en réserve. »
- afficher un sélecteur **« reps en réserve »** 0/1/2/3/4+ (boutons ronds h-11, style du sélecteur difficulté existant), liant `calibRir` (4+ → 4).

**Step 4 — Calcul + persistance non-invalidante au validate**

Dans le `handleValidateSet` (ou une branche dédiée appelée quand `showCalibration` à la série 1) : à la validation de la série 1 d'un exo en calibration :
```ts
const oneRm = estimateOneRM(weight, reps, calibRir != null ? { rir: calibRir } : undefined);
if (oneRm > 0) {
  setRunOneRms((prev) => new Map(prev).set(exerciseId, oneRm)); // cible locale immédiate, AUCUNE invalidation
  void onEstimationComplete?.(exerciseId, oneRm);               // persistance fire-and-forget (cf. Task 4 : ne PAS invalider en séance)
}
// filet sécurité (non bloquant)
if (calibRir === 0 || setDifficultyValue === 5) {
  toast("Garde des reps en réserve", { description: "Tu es allé près de l'échec — garde 2-3 reps, on progresse mieux en qualité." });
}
setCalibRir(null);
```
Puis logguer la série comme série 1 et avancer **via le flux normal existant** (ne pas réintroduire de saut spécial — laisser `handleValidateSet` gérer set 1 → set 2). Garder `isLoggingRef`.

**Step 5 — tsc + tests** : `npx tsc --noEmit` → 0. Ajouter au moins un test SSR (Step 6) avant commit.

**Step 6 — Test SSR (negative + positive gate)** dans `StrengthRunner.test.tsx` (`renderToStaticMarkup`) :
- exo **%1RM weight_kg non-PDC sans 1RM** à la série 1 → le markup contient le hint/champ « reps en réserve ».
- exo **élastique (metric height_cm)** ou **PDC (is_bodyweight)** ou **accessoire (percent_1rm 0)** ou **déjà doté d'un 1RM** → markup **sans** hint/champ calibration, carte normale (« Valider série »). *(C'est le test de non-régression de l'incident.)*

**Step 7 — Commit** :
```bash
git add src/components/strength/WorkoutRunner.tsx src/pages/__tests__/StrengthRunner.test.tsx
git commit -m "feat(§369): carte série 1 augmentée (hint + reps en réserve) + gate inline, remplace ramp-up §297"
```

---

## Task 4 : Strength.tsx — retrait du gate pré-séance + persistance 1RM non-invalidante en séance

**Files:**
- Modify: `src/pages/Strength.tsx` (anchors : import OneRmGate 41, `computeMissing1RmExercises` import 46, `showOneRmGate` 550, `missing1RmExercises` 552, gate block ~685-688, render `<OneRmGate>` 1184, `handleEstimationComplete` 644)
- Delete (si plus importés) : `src/components/strength/OneRmGate.tsx`, `src/lib/strength/missing1rmFilter.ts` (+ test)

**Step 1 — Retirer le gate pré-séance** : supprimer `showOneRmGate`, le bloc `if (… missing1RmExercises.length > 0 …) { setShowOneRmGate(true); return; }`, le `<OneRmGate>`, l'import. `handleLaunchFocus` démarre toujours. Si `missing1RmExercises`/`computeMissing1RmExercises` deviennent inutilisés (le gate est désormais inline dans WorkoutRunner), les retirer + `git rm` `missing1rmFilter.ts` + son test + `OneRmGate.tsx` (vérifier `grep -rn OneRmGate src/` = 0 avant suppression).

**Step 2 — Persistance non-invalidante en séance** : dans `handleEstimationComplete` (644), **retirer le `await queryClient.invalidateQueries({ queryKey: ["1rm"] })`** (c'est la cause suspecte des resets de position §368/#3 ; la cible en séance vient désormais de `runOneRms` local côté WorkoutRunner). Garder `update1RM` (persistance serveur). Le 1RM rafraîchi sera relu naturellement à la prochaine ouverture de séance (la query se recharge hors-séance). Laisser un commentaire expliquant pourquoi on n'invalide pas en séance.

**Step 3 — tsc + suite** : `npx tsc --noEmit` → 0 ; `npm test` → fail=0 ; `npx vitest run --config vitest.config.unit.ts` → vert ; `npm run lint` → 0 erreur.

**Step 4 — Commit** :
```bash
git add src/pages/Strength.tsx
# si supprimés : git rm src/components/strength/OneRmGate.tsx src/lib/strength/missing1rmFilter.ts src/pages/__tests__/strength_missing1rm_filter.test.ts
git commit -m "feat(§369): séance lancée en un tap (gate inline) + pas d'invalidation 1RM en séance"
```

---

## Task 5 : vérification de bout en bout + documentation

**Files:** `docs/implementation-log.md`, `docs/ROADMAP.md`, `docs/FEATURES_STATUS.md`, `CLAUDE.md`, `docs/claude/files-map.md`

**Step 1 — Vérification** (REQUIRED SUB-SKILL: superpowers:verification-before-completion) : `npx tsc --noEmit && npm test && npx vitest run --config vitest.config.unit.ts && npm run lint` — coller la sortie réelle (fail=0, 0 erreur lint).

**Step 2 — Smoke manuel OBLIGATOIRE avant tout merge** (`npm run dev`) : (a) exo %1RM sans 1RM → carte série 1 avec hint + champ reps-en-réserve, valider → 1RM calculé, séries 2+ ciblées, **pas de boucle/skip** ; (b) exo élastique / PDC / accessoire → **rien de spécial** ; (c) RIR 0 → toast sécurité. Documenter le résultat.

**Step 3 — Docs** : entrée **§369** dans `implementation-log.md` (remplace l'esprit de l'entrée §368 « à suivre ») ; ligne ROADMAP + `*Dernière mise à jour*` ; FEATURES_STATUS ; `CLAUDE.md` « Dernier § livré » = §369 (≤15 mots) ; `files-map.md` : ajouter `src/lib/strength/oneRmCalibration.ts` (mesurer `wc -l`) ; retirer les lignes éventuelles de `OneRmGate.tsx`/`missing1rmFilter.ts` si supprimés.

**Step 4 — Commit docs** :
```bash
git add docs/ CLAUDE.md
git commit -m "docs(§369): log + roadmap + features + files-map (calibration 1RM inline)"
```

**Step 5 — Finalisation** : REQUIRED SUB-SKILL: superpowers:finishing-a-development-branch. **Ne pas déployer sans le smoke terrain du Step 2.**

---

## Notes transverses
- **DRY** : la logique chiffrée (`estimateOneRM`, gate) dans les helpers purs, pas inline.
- **YAGNI** : pas de wizard, pas d'écran séparé, pas d'API `getPerformedExerciseIds`, pas de requête `firstTimeExercises`, pas de validation post-série-2.
- **Hooks inconditionnels** (historique React #310 — tous les `useState` en tête).
- **Pas de migration** → pas de `test:rls`.
- Commits ciblés (working tree partagé).
