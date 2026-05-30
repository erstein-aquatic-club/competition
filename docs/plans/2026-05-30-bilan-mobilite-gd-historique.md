# Bilan muscu — Mobilité G/D + notes + historique/évolution — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Permettre au coach de noter la mobilité gauche/droite (asymétries) + des notes dans le bilan muscu, et de consulter l'historique des bilans avec une courbe d'évolution.

**Architecture:** `physical_tests` (jsonb) passe à une forme uniforme `{left,right,note?}` par axe, upcastée depuis l'ancienne forme (number) par un normaliseur pur — **aucune migration SQL**. Le moteur consomme `min(left,right)`. UI bilan (saisie G/D) puis historique + évolution (recharts).

**Tech Stack:** React 19 / TS, `node:test` (purs) + vitest jsdom (UI), recharts (déjà en dépendance). Design : `docs/plans/2026-05-30-bilan-mobilite-gd-historique-design.md`.

**Conventions projet :** TDD strict (@superpowers:test-driven-development). UI via @frontend-design (obligatoire, instruction projet). Commits fréquents. Vérifs : `npx tsc --noEmit`, `node --test --experimental-test-module-mocks --import tsx "src/**/*.test.ts" "src/**/*.test.tsx"` (purs), `npx vitest run --config vitest.config.unit.ts <fichier>` (UI), `npm run build`. **Pas de migration → pas de `test:rls`.**

---

## SLICE A — Mobilité G/D + notes (data model + moteur + saisie)

### Task A1 : Types `MobilityAxisScore` + forme v2 de `physical_tests`

**Files:**
- Modify: `src/lib/api/types.ts:931-944` (interface `StrengthPhysicalTests`)

**Step 1 — Éditer les types** (pas de test : déclaration de types pure).

Remplacer l'interface `StrengthPhysicalTests` par :

```ts
/** Score d'un axe de mobilité/mouvement : gauche/droite (0-3 chacun) + note libre.
 *  §346 — pour les axes bilatéraux (trunk_neck_alignment), left === right. */
export interface MobilityAxisScore {
  left: number;   // 0-3
  right: number;  // 0-3
  note?: string;
}

/** Score brut d'un axe tel que stocké : ancienne forme (number) OU v2 (objet). */
export type AxisScoreRaw = number | MobilityAxisScore;

/** Contenu JSONB de strength_assessments.physical_tests (saisi par le coach).
 *  Forme RAW : chaque axe peut être un number (bilans < §346) ou un
 *  MobilityAxisScore (≥ §346). Passer par `normalizePhysicalTests` avant usage. */
export interface StrengthPhysicalTests {
  mobility: {
    shoulder_flexion: AxisScoreRaw;
    t_spine: AxisScoreRaw;
    hip: AxisScoreRaw;
  };
  movement: {
    scapula_control: AxisScoreRaw;
    trunk_neck_alignment: AxisScoreRaw;
    hip_hinge: AxisScoreRaw;
  };
  /** Note de synthèse globale du bilan physique (§346). */
  note?: string;
  filled_at: string;
}

/** Forme CANONIQUE post-normalisation : chaque axe est un MobilityAxisScore. */
export interface StrengthPhysicalTestsNormalized {
  mobility: Record<'shoulder_flexion' | 't_spine' | 'hip', MobilityAxisScore>;
  movement: Record<'scapula_control' | 'trunk_neck_alignment' | 'hip_hinge', MobilityAxisScore>;
  note?: string;
  filled_at: string;
}
```

**Step 2 — Vérifier tsc** (attendu : des erreurs dans les consommateurs qui lisent les axes comme number — c'est normal, corrigées aux tâches suivantes). Run: `npx tsc --noEmit` → noter les fichiers en erreur (engine, UI bilan). On les traite ensuite.

**Step 3 — Commit** : `git add src/lib/api/types.ts && git commit -m "feat(§346): types physical_tests G/D (MobilityAxisScore, forme v2)"`

---

### Task A2 : Module pur `physicalTests.ts` — normaliseur + score effectif

**Files:**
- Create: `src/lib/strength/physicalTests.ts`
- Test: `src/lib/strength/__tests__/physicalTests.test.ts`

**Step 1 — Écrire le test (RED)** dans `__tests__/physicalTests.test.ts` :

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizePhysicalTests,
  effectiveAxisScore,
} from '../physicalTests.ts';

test('effectiveAxisScore = min(left,right)', () => {
  assert.equal(effectiveAxisScore({ left: 3, right: 0 }), 0);
  assert.equal(effectiveAxisScore({ left: 2, right: 3 }), 2);
});

test('normalizePhysicalTests: ancienne forme (number) → {left,right} égaux', () => {
  const v1 = {
    mobility: { shoulder_flexion: 2, t_spine: 1, hip: 3 },
    movement: { scapula_control: 0, trunk_neck_alignment: 2, hip_hinge: 3 },
    filled_at: '2026-01-01T00:00:00Z',
  } as any;
  const n = normalizePhysicalTests(v1)!;
  assert.deepEqual(n.mobility.shoulder_flexion, { left: 2, right: 2, note: undefined });
  assert.deepEqual(n.movement.scapula_control, { left: 0, right: 0, note: undefined });
  assert.equal(n.filled_at, '2026-01-01T00:00:00Z');
});

test('normalizePhysicalTests: forme v2 → passthrough (préserve note + asymétrie)', () => {
  const v2 = {
    mobility: {
      shoulder_flexion: { left: 3, right: 1, note: 'épaule D limitée' },
      t_spine: { left: 2, right: 2 }, hip: { left: 3, right: 3 },
    },
    movement: {
      scapula_control: { left: 1, right: 0 },
      trunk_neck_alignment: { left: 2, right: 2 }, hip_hinge: { left: 3, right: 3 },
    },
    note: 'synthèse',
    filled_at: '2026-02-01T00:00:00Z',
  } as any;
  const n = normalizePhysicalTests(v2)!;
  assert.deepEqual(n.mobility.shoulder_flexion, { left: 3, right: 1, note: 'épaule D limitée' });
  assert.equal(n.note, 'synthèse');
});

test('normalizePhysicalTests: null → null', () => {
  assert.equal(normalizePhysicalTests(null), null);
});
```

**Step 2 — Run RED** : `node --test --experimental-test-module-mocks --import tsx src/lib/strength/__tests__/physicalTests.test.ts` → FAIL (module introuvable).

**Step 3 — Implémenter (GREEN)** `src/lib/strength/physicalTests.ts` :

```ts
import type {
  AxisScoreRaw,
  MobilityAxisScore,
  StrengthPhysicalTests,
  StrengthPhysicalTestsNormalized,
} from '@/lib/api/types';

/** Score effectif d'un axe = côté le plus faible (corrige le déficit unilatéral). */
export function effectiveAxisScore(axis: MobilityAxisScore): number {
  return Math.min(axis.left, axis.right);
}

function normalizeAxis(raw: AxisScoreRaw): MobilityAxisScore {
  if (typeof raw === 'number') return { left: raw, right: raw, note: undefined };
  return { left: raw.left, right: raw.right, note: raw.note };
}

/** Upcaste la forme stockée (v1 number par axe OU v2 objet) en forme canonique. */
export function normalizePhysicalTests(
  raw: StrengthPhysicalTests | null,
): StrengthPhysicalTestsNormalized | null {
  if (!raw) return null;
  return {
    mobility: {
      shoulder_flexion: normalizeAxis(raw.mobility.shoulder_flexion),
      t_spine: normalizeAxis(raw.mobility.t_spine),
      hip: normalizeAxis(raw.mobility.hip),
    },
    movement: {
      scapula_control: normalizeAxis(raw.movement.scapula_control),
      trunk_neck_alignment: normalizeAxis(raw.movement.trunk_neck_alignment),
      hip_hinge: normalizeAxis(raw.movement.hip_hinge),
    },
    note: raw.note,
    filled_at: raw.filled_at,
  };
}
```

**Step 4 — Run GREEN** : même commande → 4 PASS.

**Step 5 — Commit** : `git add src/lib/strength/physicalTests.ts src/lib/strength/__tests__/physicalTests.test.ts && git commit -m "feat(§346): normalizePhysicalTests + effectiveAxisScore (G/D, rétrocompat)"`

---

### Task A3 : Moteur — `scoreMobility` & `dysfunctionFlags` consomment min(G,D)

**Files:**
- Modify: `src/lib/strength/mesocycleEngine.ts:79-92` (`scoreMobility`), `:194-206` (`dysfunctionFlags`)
- Test: `src/lib/strength/__tests__/mesocycleEngine.test.ts` (ajouter un bloc)

**Step 1 — Test RED** (ajouter dans `mesocycleEngine.test.ts`, importer `scoreBuckets` déjà présent ; mais `scoreMobility`/`dysfunctionFlags` sont internes → les tester via leur effet). Le plus simple : exporter `scoreMobility` et `dysfunctionFlags` (comme `scorePsychology` l'a été §343) et les tester directement :

```ts
import { scoreMobility, dysfunctionFlags } from '../mesocycleEngine.ts';

describe('mobilité G/D (§346)', () => {
  const v2 = (sf: [number, number]) => ({
    mobility: { shoulder_flexion: { left: sf[0], right: sf[1] }, t_spine: { left: 3, right: 3 }, hip: { left: 3, right: 3 } },
    movement: { scapula_control: { left: 3, right: 3 }, trunk_neck_alignment: { left: 3, right: 3 }, hip_hinge: { left: 3, right: 3 } },
    filled_at: 'x',
  }) as any;

  it('scoreMobility utilise min(G,D) par axe', () => {
    // shoulder G=3 D=0 → effectif 0 ; les 5 autres = 3 → somme 15/18*100
    assert.equal(Math.round(scoreMobility(v2([3, 0]))!), Math.round((15 / 18) * 100));
  });
  it('dysfunctionFlags détecte une asymétrie unilatérale (un côté = 0)', () => {
    assert.deepEqual(dysfunctionFlags(v2([3, 0])), ['shoulder_flexion']);
  });
  it('rétrocompat : ancienne forme number inchangée', () => {
    const v1 = { mobility: { shoulder_flexion: 0, t_spine: 3, hip: 3 }, movement: { scapula_control: 3, trunk_neck_alignment: 3, hip_hinge: 3 }, filled_at: 'x' } as any;
    assert.deepEqual(dysfunctionFlags(v1), ['shoulder_flexion']);
  });
});
```

**Step 2 — Run RED** : `node --test ... src/lib/strength/__tests__/mesocycleEngine.test.ts` → FAIL (exports manquants + lecture number).

**Step 3 — GREEN** : dans `mesocycleEngine.ts`,
- `export` sur `scoreMobility` et `dysfunctionFlags`.
- En tête de chaque, normaliser puis consommer `effectiveAxisScore` :

```ts
import { normalizePhysicalTests, effectiveAxisScore } from './physicalTests';

export function scoreMobility(physicalTests: MesocycleInput['assessment']['physical_tests']): number | null {
  const pt = normalizePhysicalTests(physicalTests ?? null);
  if (!pt) return null;
  const { mobility, movement } = pt;
  const sum =
    effectiveAxisScore(mobility.shoulder_flexion) + effectiveAxisScore(mobility.t_spine) +
    effectiveAxisScore(mobility.hip) + effectiveAxisScore(movement.scapula_control) +
    effectiveAxisScore(movement.trunk_neck_alignment) + effectiveAxisScore(movement.hip_hinge);
  return (sum / 18) * 100;
}

export function dysfunctionFlags(physicalTests: StrengthPhysicalTests | null): string[] {
  const pt = normalizePhysicalTests(physicalTests);
  if (!pt) return [];
  const flags: string[] = [];
  for (const [k, v] of Object.entries(pt.mobility)) if (effectiveAxisScore(v) === 0) flags.push(k);
  for (const [k, v] of Object.entries(pt.movement)) if (effectiveAxisScore(v) === 0) flags.push(k);
  return flags;
}
```

**Step 4 — Run GREEN** : suite moteur verte (les anciens tests `physical_tests` en number passent via le normaliseur).

**Step 5 — Vérif tsc** : `npx tsc --noEmit` → 0 (les types unions acceptent number ET objet).

**Step 6 — Commit** : `git add -A && git commit -m "feat(§346): moteur consomme min(G,D) mobilité (normalisé, rétrocompat)"`

---

### Task A4 : UI saisie G/D + notes (`AssessmentScoreField` + `StrengthAssessmentScreen`)

> **REQUIRED SUB-SKILL pour cette tâche : @frontend-design** (instruction projet : tout dev UI passe par `/frontend-design`).

**Files:**
- Modify: `src/pages/coach/StrengthAssessmentScreen.tsx`, `src/components/strength/assessment/AssessmentScoreField.tsx` (vérifier le chemin via `grep -rl AssessmentScoreField src`)
- Test: `src/pages/coach/StrengthAssessmentScreen.vitest.tsx` (étendre) ou nouveau vitest ciblé du champ

**Contrat UI :**
- Les 5 axes G/D (`shoulder_flexion`, `t_spine`, `hip`, `scapula_control`, `hip_hinge`) : deux sélecteurs 0-3 côte à côte **Gauche | Droite** + un champ note repliable (optionnel). `trunk_neck_alignment` : un sélecteur unique (écrit `left=right`).
- Une **note de synthèse** (textarea) en bas du formulaire.
- L'état du formulaire construit un `StrengthPhysicalTests` v2 (axes en objets) ; `updateAssessmentPhysicalTests` l'écrit tel quel (déjà typé `StrengthPhysicalTests`).
- Lecture d'un bilan existant : `normalizePhysicalTests` pour pré-remplir G/D (un ancien bilan affiche G=D).

**TDD (vitest)** : Step 1 — test RED « saisir D=0 sur l'épaule produit un payload `{shoulder_flexion:{left:3,right:0}}` à la sauvegarde » (spy sur `updateAssessmentPhysicalTests`). Step 2 — RED. Step 3 — implémenter le champ G/D + note (via `/frontend-design`). Step 4 — GREEN. Step 5 — `npx tsc --noEmit` + `npm run build`. Step 6 — Commit.

**Note** : `getPreviousCompletedPhysicalTests` (affichage de la note précédente, §301 T5) doit aussi passer par `normalizePhysicalTests` pour comparer G/D.

---

### Task A5 : Vérif intégrale Slice A + doc

**Steps :** `npx tsc --noEmit` (0) ; suite `node:test` complète verte ; vitest unit verte ; `npm run build` OK. Mettre à jour `docs/implementation-log.md` (§346), `docs/ROADMAP.md`, `docs/FEATURES_STATUS.md`, `CLAUDE.md` (Dernier §), `docs/claude/files-map.md` (nouveau `physicalTests.ts`). Commit.

---

## SLICE B — Historique + évolution (§347)

### Task B1 : Section « Historique » (liste + détail read-only)

> UI → @frontend-design.

**Files:** Modify `src/pages/coach/StrengthAssessmentScreen.tsx` ; éventuel sous-composant `src/components/strength/assessment/AssessmentHistory.tsx`.

**Contrat :** sous le bilan courant, section « Historique » : `listAssessments(athleteId)` (déjà existant) → liste (date `created_at`, statut), triée récent→ancien ; tap → ouvre le bilan en **read-only** (réutiliser l'affichage des scores, normalisés). Bouton « Nouveau bilan » (= flux `createAssessment` existant). TDD vitest : la liste rend N bilans ; un tap montre le détail read-only. Commit.

### Task B2 : Courbe d'évolution (recharts)

> UI → @frontend-design.

**Files:** Create `src/components/strength/assessment/MobilityEvolutionChart.tsx` (+ helper pur `src/lib/strength/mobilityEvolution.ts` pour transformer `StrengthAssessment[]` → séries par axe).

**Contrat :** helper pur `buildMobilityEvolution(assessments)` → pour chaque axe, série `{date, left, right, effective}` triée chrono (via `normalizePhysicalTests`). TDD `node:test` du helper (axes, tri, rétrocompat number). Chart recharts (LineChart) avec sélecteur d'axe et toggle G/D/effectif ; KPIs via `getKpiHistory` (réutiliser la logique de progression du Wrapped si pertinent). TDD vitest léger (le helper porte la logique ; le chart = rendu). Commit.

### Task B3 : Vérif intégrale Slice B + doc

`tsc` 0, tests verts, build OK. Docs (§347 implementation-log + ROADMAP + FEATURES + CLAUDE.md + files-map pour les nouveaux composants). Commit.

---

## Hors scope (rappel)

- (8) [FUTUR] routines d'échauffement pilotées par les déficits G/D — chantier séparé, dépend des données de ce plan. Voir mémoire `muscu-bilan-warmup-roadmap`.
- Saisie mobilité côté nageur (reste coach-only).

## Risques / pièges

- **Ripple de types** : changer `StrengthPhysicalTests` casse temporairement tsc chez les consommateurs (engine, UI). C'est attendu — chaque consommateur passe par `normalizePhysicalTests`. Faire A1→A3 d'affilée avant de viser tsc 0.
- **Pas de migration** : la forme v2 vit dans le jsonb existant ; ne PAS créer de migration ni lancer `test:rls`.
- **Backward-compat** : tout accès à un axe DOIT passer par `normalizePhysicalTests` (jamais lire `physical_tests.mobility.t_spine` comme un number ailleurs — grep pour les consommateurs résiduels).
