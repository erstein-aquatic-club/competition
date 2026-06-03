# Wizard de calibration 1RM guidé — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Rendre une séance de musculation toujours lançable en un tap, et guider le pratiquant — à la première réalisation d'un exo — vers une 1RM calculée via un wizard conversationnel avec retex, sans jamais chercher l'échec.

**Architecture:** On supprime le gate pré-séance (`OneRmGate`) ; toute la calibration se passe dans `WorkoutRunner` sur la série 1 d'un exo « jamais réalisé ». Une sous-machine à états isolée dans un nouveau composant `OneRmDiscoveryWizard` enchaîne : mouvement à vide → paliers de chauffe suggérés → série de travail avec RIR explicite → calcul 1RM → validation post-série-2. La logique de calcul (1RM via RIR, suggestion de charge, détection retour négatif, ajustement −10 %) vit dans des helpers purs testés en `node:test`.

**Tech Stack:** React 19 + TypeScript, Tailwind, Radix/Shadcn (Sheet/Card/Button), React Query 5, Supabase (`strength_set_logs`, `update1RM`). Tests : `node:test` (logique pure) + vitest jsdom (composant `*.vitest.tsx`).

**Branche :** `feat/wizard-calibration-1rm` (déjà créée, contient le design doc `docs/plans/2026-06-03-wizard-calibration-1rm-design.md`).

**Référence design :** `docs/plans/2026-06-03-wizard-calibration-1rm-design.md` (lire avant de commencer).

⚠️ **Working tree partagé** : `src/components/strength/WorkoutRunner.tsx` a déjà des modifs non commitées d'un autre terminal. Avant de toucher ce fichier, faire `git stash list` / `git status` et **ne committer que les fichiers de cette tâche** (jamais `git add -A`). Si un conflit de WIP apparaît, s'arrêter et demander.

---

## Task 1 : `estimateOneRM` accepte un RIR explicite

**Files:**
- Modify: `src/lib/prDetection.ts:26-33`
- Test: `src/__tests__/prDetection.test.ts`

**Contexte :** aujourd'hui `estimateOneRM(weight, reps, difficulty?)` déduit le RIR de la difficulté (map `difficultyToRIR`). Le wizard capte le RIR **explicitement** (0/1/2/3/4+). On ajoute une surcharge sans casser les appelants existants.

**Step 1 — Écrire le test qui échoue**

Ajouter dans `src/__tests__/prDetection.test.ts` :

```ts
import { estimateOneRM } from "../lib/prDetection";

test("estimateOneRM: RIR explicite prime sur la difficulté", () => {
  // 60 kg × 5 reps, RIR 2 → effectiveReps 7 → 60*(1+7/30)=74
  assert.equal(estimateOneRM(60, 5, { rir: 2 }), 74);
});

test("estimateOneRM: RIR explicite 0 = à l'échec (effectiveReps = reps)", () => {
  // 100 kg × 1 rep, RIR 0 → 100
  assert.equal(estimateOneRM(100, 1, { rir: 0 }), 100);
});

test("estimateOneRM: rétrocompat — 3e arg numérique reste interprété comme difficulté", () => {
  // difficulté 3 → RIR 3 ; 60×5 → effectiveReps 8 → 60*(1+8/30)=76
  assert.equal(estimateOneRM(60, 5, 3), 76);
});
```

**Step 2 — Lancer, vérifier l'échec**

Run: `npm test -- src/__tests__/prDetection.test.ts` (ou `node --test`)
Expected: FAIL — la signature objet `{ rir }` n'est pas gérée.

**Step 3 — Implémentation minimale**

Remplacer la signature dans `src/lib/prDetection.ts` :

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

**Step 4 — Lancer, vérifier le succès**

Run: `npm test -- src/__tests__/prDetection.test.ts`
Expected: PASS (anciens tests inclus).

**Step 5 — Commit**

```bash
git add src/lib/prDetection.ts src/__tests__/prDetection.test.ts
git commit -m "feat(1rm): estimateOneRM accepte un RIR explicite {rir}"
```

---

## Task 2 : helper de suggestion de charge

**Files:**
- Create: `src/lib/strength/oneRmCalibration.ts`
- Test: `src/lib/strength/__tests__/oneRmCalibration.test.ts`

**Contexte :** à chaque palier on suggère une charge. Réponse « recharger » ∈ {`little`, `medium`, `lot`} → incrément +2,5 / +5 / +10 kg depuis le palier précédent. Si une 1RM est connue ET qu'on n'a pas encore de palier, on ancre le premier à ~45 % de la 1RM (arrondi au pas de 2,5).

**Step 1 — Écrire le test qui échoue**

```ts
import test from "node:test";
import assert from "node:assert/strict";
import { suggestNextLoad, ReloadAppetite } from "../oneRmCalibration";

test("suggestNextLoad: incréments depuis le palier précédent", () => {
  assert.equal(suggestNextLoad({ previousLoad: 20, appetite: "little" }), 22.5);
  assert.equal(suggestNextLoad({ previousLoad: 20, appetite: "medium" }), 25);
  assert.equal(suggestNextLoad({ previousLoad: 20, appetite: "lot" }), 30);
});

test("suggestNextLoad: 1er palier ancré à ~45% de la 1RM connue", () => {
  // known1rm 100 → 45 → arrondi pas 2.5 → 45
  assert.equal(suggestNextLoad({ previousLoad: null, appetite: "medium", known1rm: 100 }), 45);
});

test("suggestNextLoad: 1er palier sans 1RM ni précédent = pas de suggestion", () => {
  assert.equal(suggestNextLoad({ previousLoad: null, appetite: "medium" }), null);
});
```

**Step 2 — Lancer, vérifier l'échec**

Run: `npm test -- src/lib/strength/__tests__/oneRmCalibration.test.ts`
Expected: FAIL — module inexistant.

**Step 3 — Implémentation minimale**

```ts
export type ReloadAppetite = "little" | "medium" | "lot";

const INCREMENT_KG: Record<ReloadAppetite, number> = {
  little: 2.5,
  medium: 5,
  lot: 10,
};

const roundToStep = (kg: number, step = 2.5) => Math.round(kg / step) * step;

export function suggestNextLoad(opts: {
  previousLoad: number | null;
  appetite: ReloadAppetite;
  known1rm?: number | null;
}): number | null {
  const { previousLoad, appetite, known1rm } = opts;
  if (previousLoad != null && previousLoad > 0) {
    return roundToStep(previousLoad + INCREMENT_KG[appetite]);
  }
  if (known1rm != null && known1rm > 0) {
    return roundToStep(known1rm * 0.45);
  }
  return null;
}
```

**Step 4 — Lancer, vérifier le succès**

Run: `npm test -- src/lib/strength/__tests__/oneRmCalibration.test.ts`
Expected: PASS.

**Step 5 — Commit**

```bash
git add src/lib/strength/oneRmCalibration.ts src/lib/strength/__tests__/oneRmCalibration.test.ts
git commit -m "feat(1rm): helper suggestNextLoad (incréments + ancrage 45%)"
```

---

## Task 3 : détection « retour négatif » + ajustement −10 %

**Files:**
- Modify: `src/lib/strength/oneRmCalibration.ts`
- Test: `src/lib/strength/__tests__/oneRmCalibration.test.ts`

**Contexte (5a-1 + 5b-1) :** après la série 2, retour négatif = douleur **OU** série trop dure (reps cibles non atteintes / RIR 0 / difficulté 5). Si négatif, on propose une 1RM revue à la baisse (−10 %, arrondie au pas de 2,5).

**Step 1 — Écrire le test qui échoue**

```ts
import { isNegativeValidation, adjustOneRmDown } from "../oneRmCalibration";

test("isNegativeValidation: douleur suffit", () => {
  assert.equal(isNegativeValidation({ pain: true, repsDone: 8, repsTarget: 8, rir: 3, difficulty: 3 }), true);
});

test("isNegativeValidation: reps cibles non atteintes", () => {
  assert.equal(isNegativeValidation({ pain: false, repsDone: 5, repsTarget: 8, rir: 1, difficulty: 4 }), true);
});

test("isNegativeValidation: RIR 0 (échec)", () => {
  assert.equal(isNegativeValidation({ pain: false, repsDone: 8, repsTarget: 8, rir: 0, difficulty: 4 }), true);
});

test("isNegativeValidation: difficulté 5", () => {
  assert.equal(isNegativeValidation({ pain: false, repsDone: 8, repsTarget: 8, rir: 2, difficulty: 5 }), true);
});

test("isNegativeValidation: tout va bien = false", () => {
  assert.equal(isNegativeValidation({ pain: false, repsDone: 8, repsTarget: 8, rir: 2, difficulty: 3 }), false);
});

test("adjustOneRmDown: -10% arrondi au pas de 2.5", () => {
  // 100 → 90
  assert.equal(adjustOneRmDown(100), 90);
  // 77 → 69.3 → arrondi 70
  assert.equal(adjustOneRmDown(77), 70);
});
```

**Step 2 — Lancer, vérifier l'échec** — Run même commande. Expected: FAIL.

**Step 3 — Implémentation minimale** (ajouter à `oneRmCalibration.ts`)

```ts
export interface ValidationInput {
  pain: boolean;
  repsDone: number;
  repsTarget: number;
  rir: number;
  difficulty: number | null;
}

export function isNegativeValidation(v: ValidationInput): boolean {
  if (v.pain) return true;
  if (v.repsTarget > 0 && v.repsDone < v.repsTarget) return true;
  if (v.rir <= 0) return true;
  if (v.difficulty != null && v.difficulty >= 5) return true;
  return false;
}

export function adjustOneRmDown(oneRm: number, factor = 0.9, step = 2.5): number {
  if (oneRm <= 0) return 0;
  return Math.round((oneRm * factor) / step) * step;
}
```

**Step 4 — Lancer, vérifier le succès** — Expected: PASS.

**Step 5 — Commit**

```bash
git add src/lib/strength/oneRmCalibration.ts src/lib/strength/__tests__/oneRmCalibration.test.ts
git commit -m "feat(1rm): détection retour négatif + ajustement 1RM -10%"
```

---

## Task 4 : API — exos « jamais réalisés » par l'athlète

**Files:**
- Modify: `src/lib/api/strength.ts` (à côté de `getStrengthHistory`, ~957) + export dans `src/lib/api/index.ts`
- Test: optionnel (query Supabase ; couvert plus tard en intégration). Pas de test unitaire requis ici (pas de logique pure).

**Contexte :** la détection « première réalisation » se base sur l'absence d'historique de séries (`strength_set_logs`) pour cet athlète × exo. On expose un helper qui, pour une liste d'exercice_ids, renvoie ceux **déjà réalisés**.

**Step 1 — Implémentation**

Ajouter dans `src/lib/api/strength.ts` (réutiliser le pattern de jointure runs → set_logs déjà présent autour des lignes 580-700) :

```ts
/**
 * Renvoie le sous-ensemble d'exercise_ids que l'athlète a déjà réalisés
 * (au moins une série loggée). Sert à déclencher le wizard de calibration
 * 1RM à la PREMIÈRE réalisation d'un exo.
 */
export async function getPerformedExerciseIds(
  athleteId: number | string,
  exerciseIds: number[],
): Promise<number[]> {
  if (!canUseSupabase() || exerciseIds.length === 0) return [];
  const { data, error } = await supabase
    .from("strength_set_logs")
    .select("exercise_id, strength_runs!inner(athlete_id)")
    .in("exercise_id", exerciseIds)
    .eq("strength_runs.athlete_id", athleteId);
  if (error || !data) return [];
  return Array.from(new Set(data.map((r) => Number(r.exercise_id))));
}
```

> ⚠️ Vérifier le nom exact de la table de runs et de la FK (`strength_runs.athlete_id`) en lisant `getStrengthHistory` (`src/lib/api/strength.ts:957-1000`) avant d'écrire la query — adapter la jointure au schéma réel.

**Step 2 — Export**

Ajouter `getPerformedExerciseIds` dans les re-exports de `src/lib/api/index.ts` (à côté de `getStrengthHistory`, ligne ~533).

**Step 3 — Type check**

Run: `npx tsc --noEmit`
Expected: 0 erreur.

**Step 4 — Commit**

```bash
git add src/lib/api/strength.ts src/lib/api/index.ts
git commit -m "feat(1rm): getPerformedExerciseIds (détection première réalisation)"
```

---

## Task 5 : composant `OneRmDiscoveryWizard` — squelette + étape A (retex à vide + branche douleur)

**Files:**
- Create: `src/components/strength/OneRmDiscoveryWizard.tsx`
- Test: `src/components/strength/OneRmDiscoveryWizard.vitest.tsx`

**Contexte :** composant contrôlé qui gère la sous-machine. Props (proposées) :

```ts
interface OneRmDiscoveryWizardProps {
  exerciseName: string;
  known1rm: number | null;          // si déjà saisie (coach), sert d'ancrage
  /** mode court : saute les paliers, démarre direct sur la série de travail */
  shortMode?: boolean;
  onComputed: (oneRm: number, workingSet: { weight: number; reps: number; rir: number; pain: boolean }) => void;
  onPainAbort: (action: "lighten" | "substitute" | "skip") => void;
}
type WizardStep = "empty" | "warmup" | "working";
```

États retex : `pain: boolean`, `ease: "ok" | "hesitant" | "hard"`, `appetite: ReloadAppetite`.

**Step 1 — Écrire le test qui échoue** (`OneRmDiscoveryWizard.vitest.tsx`)

```tsx
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { OneRmDiscoveryWizard } from "./OneRmDiscoveryWizard";

describe("OneRmDiscoveryWizard — étape mouvement à vide", () => {
  it("affiche les 3 cases de retex à l'étape à vide", () => {
    render(<OneRmDiscoveryWizard exerciseName="Squat" known1rm={null} onComputed={vi.fn()} onPainAbort={vi.fn()} />);
    expect(screen.getByText(/à vide/i)).toBeTruthy();
    expect(screen.getByText(/douleur/i)).toBeTruthy();
    expect(screen.getByText(/recharger/i)).toBeTruthy();
  });

  it("douleur=oui à l'étape à vide propose la branche sécurité (alléger/substituer/passer)", () => {
    const onPainAbort = vi.fn();
    render(<OneRmDiscoveryWizard exerciseName="Squat" known1rm={null} onComputed={vi.fn()} onPainAbort={onPainAbort} />);
    fireEvent.click(screen.getByRole("button", { name: /douleur.*oui/i }));
    expect(screen.getByText(/qualité|sécurité|allég/i)).toBeTruthy();
  });
});
```

**Step 2 — Lancer, vérifier l'échec**

Run: `npx vitest run src/components/strength/OneRmDiscoveryWizard.vitest.tsx`
Expected: FAIL — composant inexistant.

**Step 3 — Implémentation minimale** : composant avec `step="empty"`, carte retex 3 cases (douleur oui/non, aisance 3 niveaux, recharger un peu/moyen/beaucoup) ; si douleur=oui → panneau sécurité avec 3 boutons appelant `onPainAbort`. Style : réutiliser `Card`, `Button`, `ScaleSelector5`/boutons ronds h-11 w-11 (cf. `WorkoutRunner` difficulté). Voir snippet de référence dans `WorkoutRunner.tsx:1184-1226`.

**Step 4 — Lancer, vérifier le succès** — Expected: PASS.

**Step 5 — Commit**

```bash
git add src/components/strength/OneRmDiscoveryWizard.tsx src/components/strength/OneRmDiscoveryWizard.vitest.tsx
git commit -m "feat(1rm): wizard étape mouvement à vide + branche douleur"
```

---

## Task 6 : wizard — paliers de chauffe suggérés

**Files:**
- Modify: `src/components/strength/OneRmDiscoveryWizard.tsx`
- Test: `src/components/strength/OneRmDiscoveryWizard.vitest.tsx`

**Step 1 — Test qui échoue**

```tsx
it("propose une charge suggérée au 1er palier quand une 1RM est connue", () => {
  render(<OneRmDiscoveryWizard exerciseName="Squat" known1rm={100} onComputed={vi.fn()} onPainAbort={vi.fn()} />);
  // valider l'étape à vide sans douleur
  fireEvent.click(screen.getByRole("button", { name: /douleur.*non/i }));
  fireEvent.click(screen.getByRole("button", { name: /palier|suivant|continuer/i }));
  // 45% de 100 = 45 kg suggéré
  expect(screen.getByDisplayValue("45")).toBeTruthy();
});

it("permet d'ajouter un palier suivant et incrémente selon l'appétit", () => {
  // little = +2.5 kg ; vérifier la nouvelle suggestion = previous + 2.5
  // (détails selon l'UI ; valider via le champ charge)
});
```

**Step 2 — Lancer, vérifier l'échec** — Expected: FAIL.

**Step 3 — Implémentation** : à `step="warmup"`, calculer la charge via `suggestNextLoad({ previousLoad, appetite, known1rm })` (Task 2), pré-remplir un champ éditable, capter reps + retex 3 cases, bouton « + palier suivant » (réinjecte `previousLoad` = charge du palier courant), bouton « passer à la série de travail » → `step="working"`. En `shortMode`, sauter directement à `working`.

**Step 4 — Succès** — Expected: PASS.

**Step 5 — Commit**

```bash
git add src/components/strength/OneRmDiscoveryWizard.tsx src/components/strength/OneRmDiscoveryWizard.vitest.tsx
git commit -m "feat(1rm): wizard paliers de chauffe suggérés"
```

---

## Task 7 : wizard — série de travail + RIR → calcul 1RM

**Files:**
- Modify: `src/components/strength/OneRmDiscoveryWizard.tsx`
- Test: `src/components/strength/OneRmDiscoveryWizard.vitest.tsx`

**Step 1 — Test qui échoue**

```tsx
it("calcule la 1RM depuis la série de travail (charge + reps + RIR explicite)", () => {
  const onComputed = vi.fn();
  render(<OneRmDiscoveryWizard exerciseName="Squat" known1rm={null} shortMode onComputed={onComputed} onPainAbort={vi.fn()} />);
  // saisir charge 60, reps 5, RIR 2
  fireEvent.change(screen.getByLabelText(/charge/i), { target: { value: "60" } });
  fireEvent.change(screen.getByLabelText(/reps/i), { target: { value: "5" } });
  fireEvent.click(screen.getByRole("button", { name: /2/ })); // bouton RIR=2
  fireEvent.click(screen.getByRole("button", { name: /calculer.*1rm|valider/i }));
  // estimateOneRM(60,5,{rir:2}) = 74
  expect(onComputed).toHaveBeenCalledWith(74, expect.objectContaining({ weight: 60, reps: 5, rir: 2 }));
});

it("avertit (sans bloquer) si RIR 0 sélectionné", () => {
  render(<OneRmDiscoveryWizard exerciseName="Squat" known1rm={null} shortMode onComputed={vi.fn()} onPainAbort={vi.fn()} />);
  fireEvent.click(screen.getByRole("button", { name: /^0$/ }));
  expect(screen.getByText(/échec|garde.*reps|réserve/i)).toBeTruthy();
});
```

**Step 2 — Lancer, vérifier l'échec** — Expected: FAIL.

**Step 3 — Implémentation** : `step="working"` — sélecteur RIR (0/1/2/3/4+), message anti-échec, avertissement doux si RIR 0. Au valider : `estimateOneRM(weight, reps, { rir })` → `onComputed(oneRm, { weight, reps, rir, pain })`.

**Step 4 — Succès** — Expected: PASS.

**Step 5 — Commit**

```bash
git add src/components/strength/OneRmDiscoveryWizard.tsx src/components/strength/OneRmDiscoveryWizard.vitest.tsx
git commit -m "feat(1rm): wizard série de travail + RIR -> calcul 1RM"
```

---

## Task 8 : branchement dans `WorkoutRunner` (remplace le mode estimation §297)

**Files:**
- Modify: `src/components/strength/WorkoutRunner.tsx` (bloc `isEstimationMode` 306-310, UI 1111-1320, `handleReferenceSet` 622-678 ; props 174-179)
- Test: comportement couvert par les tests composant du wizard + smoke manuel.

⚠️ Ce fichier a de la WIP d'un autre terminal — vérifier `git status` avant, committer ciblé.

**Contexte :** le wizard remplace le ramp-up sommaire §297. On garde le contrat `onEstimationComplete` (persistance 1RM) et `inlineEstimationExercises`, on ajoute `firstTimeExercises: Set<number>`.

**Step 1 — Étendre les props**

```ts
firstTimeExercises?: Set<number>;
```

Calculer le mode courant à l'entrée d'un exo :
- `isFirstTime = firstTimeExercises?.has(currentBlock.exercise_id)`
- wizard complet si `isFirstTime` ; `shortMode` si recalcul/1RM manquante mais déjà réalisé.

**Step 2 — Remplacer le bloc d'UI estimation** (1111-1320 + boutons 1264-1288) par le rendu de `<OneRmDiscoveryWizard ... />` quand `step===1` et mode calibration actif. `onComputed` :
1. `await onEstimationComplete(exerciseId, oneRm)`
2. logge la série de travail comme série 1 (réutiliser la logique de `handleReferenceSet`, y compris la garde `isLoggingRef`)
3. si `pain` → ajouter un marqueur douleur à la note de la série (`onUpdateNote` ou champ comments du log)
4. `setCurrentSetIndex(2)` + repos auto.

**Step 3 — Validation post-série-2** : après la 2ᵉ série loggée (détecter `currentSetIndex===2` validée), afficher une carte (douleur + « charge me semble »). Calculer `isNegativeValidation(...)` (Task 3) ; si négatif → message qualité>charge + bouton « ajuster ma 1RM (−10 %) » appelant `onEstimationComplete(exerciseId, adjustOneRmDown(oneRm))` et re-ciblant les séries restantes.

**Step 4 — Type check + tests**

Run: `npx tsc --noEmit && npm test`
Expected: 0 erreur TS, suite verte.

**Step 5 — Commit**

```bash
git add src/components/strength/WorkoutRunner.tsx
git commit -m "feat(1rm): branche le wizard de calibration dans WorkoutRunner + validation post-série-2"
```

---

## Task 9 : suppression du `OneRmGate` + lancement direct + passage de `firstTimeExercises`

**Files:**
- Modify: `src/pages/Strength.tsx` (import 41, state 550, gate logic 683-690, render 1184-1200)
- Delete (optionnel) : `src/components/strength/OneRmGate.tsx` si plus aucun import.

**Step 1 — Retirer le gate**
- Supprimer `showOneRmGate` (550), le bloc `if (...) { setShowOneRmGate(true); return; }` (683-690), le `<OneRmGate .../>` (1184-1200), l'import (41).
- `handleLaunchFocus` démarre toujours le run.

**Step 2 — Calculer `firstTimeExercises`**
- Au montage de la séance active, appeler `getPerformedExerciseIds(userId, sessionExerciseIds)` (Task 4) ; `firstTimeExercises = sessionExerciseIds \ performed`. Le passer à `<WorkoutRunner firstTimeExercises={...} />` (render ~877).
- Conserver `inlineEstimationExercises` / `onEstimationComplete` existants.

**Step 3 — Vérifier qu'aucun import résiduel de `OneRmGate` ne casse**

Run: `npx tsc --noEmit`
Expected: 0 erreur. Si `OneRmGate.tsx` n'est plus importé nulle part (`grep -rn OneRmGate src/`), le supprimer.

**Step 4 — Suite complète**

Run: `npm test && npx vitest run && npm run lint`
Expected: tout vert.

**Step 5 — Commit**

```bash
git add src/pages/Strength.tsx
# si supprimé : git rm src/components/strength/OneRmGate.tsx
git commit -m "feat(1rm): supprime le gate pré-séance, séance lançable en un tap"
```

---

## Task 10 : vérification de bout en bout + documentation obligatoire

**Files:**
- Modify: `docs/implementation-log.md`, `docs/ROADMAP.md`, `docs/FEATURES_STATUS.md`, `CLAUDE.md`, `docs/claude/files-map.md`

**Step 1 — Vérification** (REQUIRED SUB-SKILL: superpowers:verification-before-completion)

Run: `npx tsc --noEmit && npm test && npx vitest run && npm run lint`
Expected: 0 erreur TS, suites vertes, lint OK. Coller la sortie réelle.

**Step 2 — Smoke manuel** (`npm run dev`) : lancer une séance avec un exo jamais réalisé → wizard complet ; douleur → branche sécurité ; série de travail → 1RM calculée ; série 2 dure/douleur → proposition −10 %. (Voir skill `verify` / `run`.)

**Step 3 — Docs (workflow obligatoire CLAUDE.md)**
- `docs/implementation-log.md` : nouvelle entrée § (contexte, changements, fichiers, tests, décisions, limites).
- `docs/ROADMAP.md` : ligne du chantier + `*Dernière mise à jour*`.
- `docs/FEATURES_STATUS.md` : statut feature calibration 1RM.
- `CLAUDE.md` : maj « Dernier § livré » (≤15 mots) ; ajouter `OneRmDiscoveryWizard.tsx` + `oneRmCalibration.ts` à `docs/claude/files-map.md` (avec `wc -l`).

**Step 4 — Commit docs**

```bash
git add docs/ CLAUDE.md
git commit -m "docs(1rm): log + roadmap + features + files-map (wizard calibration)"
```

**Step 5 — Finalisation** : REQUIRED SUB-SKILL: superpowers:finishing-a-development-branch (proposer merge/PR).

---

## Notes transverses
- **DRY** : toute la logique chiffrée (1RM, suggestion, négatif, −10 %) dans `oneRmCalibration.ts` + `prDetection.ts`, jamais inline dans les composants.
- **YAGNI** : pas de nouvelle table, pas de remontée coach dédiée (douleur en note), pas de persistance des retex intermédiaires.
- **Exos poids de corps** : wizard non rendu (rien à calibrer) — garder l'exclusion `isBodyweightExercise`.
- **Pas de migration Supabase** → pas de `test:rls`.
- **Commits fréquents**, ciblés (working tree partagé).
```
