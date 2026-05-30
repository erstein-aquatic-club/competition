# Échauffement intelligent (Blocs 1+2) — Implementation Plan §351

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Faire commencer chaque séance muscu (développement + amorce PAP) par un échauffement articulaire commun seedé (Bloc 1) puis une mobilité corrective générée à partir des déficits G/D du nageur (Bloc 2), matérialisés à la génération du mésocycle.

**Architecture:** Le moteur pur (`mesocycleEngine.ts`) calcule les blocs à la génération et les écrit dans chaque séance, remplaçant le warmup mobilité générique actuel. Bloc 1 = liste ordonnée d'exos articulaires (table `warmup_common_routine` seedée). Bloc 2 = exos du seau `mobility` taggés `corrective_axes`, sélectionnés par axe déficitaire (`effective=min(G,D) ≤ 1` OU `|G−D| ≥ 2`), plafonnés à 2 avec rotation déterministe sur l'index de séance. Contrôle coach indirect (scores bilan / table / tags) ; édition per-séance + écran routine + Bloc 3 = §352.

**Tech Stack:** TypeScript, fonctions pures testées en `node:test`, Supabase (migration MCP + RLS), React + `/frontend-design` pour le marquage UI.

**Design de référence :** `docs/plans/2026-05-30-echauffement-intelligent-mobilite-design.md`

**Conventions projet (rappel) :**
- Migrations via MCP Supabase (`apply_migration`), projet `fscnobivsgornxdwqwlk`, jamais `supabase db push`.
- `git add` **ciblé** (jamais `-A`) — checkout partagé entre terminaux ; vérifier `git status` avant.
- Déploiement = push sur `main` (CI lint+build). Garde `react-hooks/rules-of-hooks` bloquante.
- Helpers RLS : `app_user_role()` / `app_user_id()`, jamais `auth.uid()` en subquery.

---

## Task 1: Migration — colonne `corrective_axes` + table `warmup_common_routine` + seed

**Files:**
- Create: `supabase/migrations/00214_warmup_intelligent.sql`
- Apply via: `mcp__plugin_supabase_supabase__apply_migration`

**Step 1: Écrire le fichier de migration**

```sql
-- 00214_warmup_intelligent.sql — Échauffement intelligent §351
-- (1) tag d'axe correctif sur les exos mobilité ; (2) routine articulaire commune.

ALTER TABLE dim_exercices ADD COLUMN IF NOT EXISTS corrective_axes text[] NOT NULL DEFAULT '{}';

-- Seed des tags d'axe (exos du seau mobility, ids vérifiés sur prod).
UPDATE dim_exercices SET corrective_axes = '{shoulder_flexion}'              WHERE id = 24;  -- Y-T-W épaules
UPDATE dim_exercices SET corrective_axes = '{shoulder_flexion}'              WHERE id = 84;  -- Shoulder Dislocates
UPDATE dim_exercices SET corrective_axes = '{t_spine,trunk_neck_alignment}' WHERE id = 87;  -- Cat-Cow
UPDATE dim_exercices SET corrective_axes = '{hip,hip_hinge}'                 WHERE id = 59;  -- Hip Airplane
UPDATE dim_exercices SET corrective_axes = '{hip,hip_hinge}'                 WHERE id = 85;  -- 90/90 Hip Switch
UPDATE dim_exercices SET corrective_axes = '{hip}'                           WHERE id = 86;  -- Hip Flexor Stretch
UPDATE dim_exercices SET corrective_axes = '{scapula_control}'              WHERE id = 49;  -- Face Pull
UPDATE dim_exercices SET corrective_axes = '{scapula_control}'              WHERE id = 51;  -- Serratus Wall Slide
UPDATE dim_exercices SET corrective_axes = '{scapula_control}'              WHERE id = 52;  -- Pompe scapulaire
UPDATE dim_exercices SET corrective_axes = '{scapula_control}'              WHERE id = 71;  -- Scapula Pull-Up
UPDATE dim_exercices SET corrective_axes = '{trunk_neck_alignment}'         WHERE id = 83;  -- Streamline Hold

CREATE TABLE IF NOT EXISTS warmup_common_routine (
  id          serial PRIMARY KEY,
  ordre       int  NOT NULL,
  exercise_id int  NOT NULL REFERENCES dim_exercices(id)
);

ALTER TABLE warmup_common_routine ENABLE ROW LEVEL SECURITY;

CREATE POLICY warmup_common_routine_read ON warmup_common_routine
  FOR SELECT USING (app_user_role() IS NOT NULL);

CREATE POLICY warmup_common_routine_write ON warmup_common_routine
  FOR ALL USING (app_user_role() IN ('coach','admin'))
  WITH CHECK (app_user_role() IN ('coach','admin'));

-- Seed : routine articulaire générique sans contre-indication.
INSERT INTO warmup_common_routine (ordre, exercise_id) VALUES
  (1, 87),  -- Cat-Cow
  (2, 84),  -- Shoulder Dislocates
  (3, 24);  -- Y-T-W épaules
```

**Step 2: Appliquer via MCP**

Utiliser `mcp__plugin_supabase_supabase__apply_migration` (name: `00214_warmup_intelligent`, query = contenu ci-dessus).

**Step 3: Vérifier en base**

Via `mcp__plugin_supabase_supabase__execute_sql` :
```sql
SELECT id, nom_exercice, corrective_axes FROM dim_exercices WHERE corrective_axes <> '{}' ORDER BY id;
SELECT ordre, exercise_id FROM warmup_common_routine ORDER BY ordre;
```
Attendu : 11 exos taggés ; 3 lignes routine (87, 84, 24).

**Step 4: Commit**

```bash
git add supabase/migrations/00214_warmup_intelligent.sql
git commit -m "feat(§351): migration warmup intelligent (corrective_axes + warmup_common_routine)"
```

---

## Task 2: Test RLS de `warmup_common_routine`

**Files:**
- Modify: `supabase/tests/schema.sql` (ajouter la table au schéma hand-crafted)
- Create: `supabase/tests/rls/warmup-common-routine.test.ts` (ou fichier équivalent selon le harness existant — voir `docs/rls-testing.md`)

> Lire `docs/rls-testing.md` (debug/ajout de test) AVANT cette tâche. Vérifier Docker : `docker ps` (1× max). Si Docker absent → demander à l'utilisateur de lancer Docker Desktop et attendre confirmation.

**Step 1: Ajouter la table au schéma de test**

Dans `supabase/tests/schema.sql`, répliquer `warmup_common_routine` (table + RLS + 2 policies, identiques à la migration). Ajouter quelques lignes de seed cohérentes avec les `dim_exercices` du schéma de test.

**Step 2: Écrire le test de policy (RED)**

Couvrir : un athlète peut SELECT (lecture authentifiée OK) ; un athlète ne peut PAS INSERT/UPDATE/DELETE (écriture refusée) ; un coach peut INSERT/UPDATE/DELETE.

**Step 3: Lancer et vérifier**

Run: `npm run test:rls`
Attendu : le nouveau fichier passe ; pas de régression (hors 2 échecs pré-existants `coach_pace_zones`, cf. mémoire `rls-tests-preexisting-failures`).

**Step 4: Commit**

```bash
git add supabase/tests/schema.sql supabase/tests/rls/warmup-common-routine.test.ts
git commit -m "test(§351): RLS warmup_common_routine (lecture authentifié / écriture coach-admin)"
```

---

## Task 3: Étendre les types moteur (`CatalogExercise`, `MesocycleInput`, `MesocycleExercise`)

**Files:**
- Modify: `src/lib/strength/mesocycleEngine.types.ts`

**Step 1: Ajouter les champs**

Dans `CatalogExercise`, après `strokePrehabAffinity` :
```typescript
  /**
   * Axes de mobilité/mouvement que cet exo corrige (§351). Ex. `['hip','hip_hinge']`.
   * Alimente le Bloc 2 (mobilité corrective) : un exo est candidat pour un axe
   * déficitaire ssi `correctiveAxes` contient cet axe. Défaut `[]` (non correctif).
   */
  correctiveAxes: string[];
```

Dans `MesocycleInput`, après `exerciseCatalog` :
```typescript
  /**
   * Routine articulaire commune (§351 Bloc 1) — exercise_ids ordonnés issus de
   * `warmup_common_routine`. Résolus contre `exerciseCatalog`. `[]` → pas de bloc 1.
   */
  commonWarmupRoutine: number[];
```

Dans `MesocycleExercise` (chercher l'interface), ajouter en optionnel pour le marquage UI :
```typescript
  /** §351 — nature de l'item d'échauffement, pour le regroupement UI. */
  warmupKind?: 'common' | 'corrective';
  /** §351 — axe ciblé par un item correctif (Bloc 2), pour l'affichage. */
  correctiveAxis?: string;
  /** §351 — côté faible ciblé ('left' | 'right' | 'both'), pour l'affichage. */
  correctiveSide?: 'left' | 'right' | 'both';
```

**Step 2: tsc**

Run: `npx tsc --noEmit`
Attendu : des erreurs sur `mapRow` (strength-catalog) car `correctiveAxes` manque — **normal**, corrigé Task 8. Si on veut tsc 0 ici, faire Task 8 dans la foulée ; sinon noter l'erreur attendue. *(Recommandé : enchaîner Task 8 avant de committer Task 3 pour garder tsc vert.)*

**Step 3: Commit (groupé avec Task 8 si tsc doit rester vert)**

```bash
git add src/lib/strength/mesocycleEngine.types.ts
git commit -m "feat(§351): types moteur — correctiveAxes, commonWarmupRoutine, warmupKind"
```

---

## Task 4: `deficientAxes` — fonction pure (TDD)

**Files:**
- Modify: `src/lib/strength/mesocycleEngine.ts`
- Test: `src/lib/strength/mesocycleEngine.test.ts`

**Step 1: Écrire les tests (RED)**

```typescript
import { deficientAxes } from './mesocycleEngine';

// Helper local : construit un physical_tests v2.
const pt = (over: Partial<Record<string, {left:number;right:number}>>) => ({
  mobility: {
    shoulder_flexion: over.shoulder_flexion ?? { left: 3, right: 3 },
    t_spine:          over.t_spine          ?? { left: 3, right: 3 },
    hip:              over.hip              ?? { left: 3, right: 3 },
  },
  movement: {
    scapula_control:      over.scapula_control      ?? { left: 3, right: 3 },
    trunk_neck_alignment: over.trunk_neck_alignment ?? { left: 3, right: 3 },
    hip_hinge:            over.hip_hinge            ?? { left: 3, right: 3 },
  },
}) as any;

test('deficientAxes — effective ≤ 1 retenu', () => {
  const res = deficientAxes(pt({ hip: { left: 1, right: 1 } }));
  assert.deepEqual(res.map(a => a.axis), ['hip']);
  assert.equal(res[0].side, 'both');
});

test('deficientAxes — asymétrie |G−D| ≥ 2 retenue même si effective ≥ 2', () => {
  const res = deficientAxes(pt({ shoulder_flexion: { left: 3, right: 1 } }));
  assert.deepEqual(res.map(a => a.axis), ['shoulder_flexion']);
  assert.equal(res[0].side, 'right'); // côté faible = right
});

test('deficientAxes — tri par sévérité (effective croissant puis asymétrie décroissante)', () => {
  const res = deficientAxes(pt({
    hip: { left: 0, right: 0 },          // effective 0
    t_spine: { left: 1, right: 1 },      // effective 1
    shoulder_flexion: { left: 3, right: 1 }, // effective 1, asym 2
  }));
  // hip (0) avant les deux à effective 1 ; entre eux, asym 2 (shoulder) avant asym 0 (t_spine)
  assert.deepEqual(res.map(a => a.axis), ['hip', 'shoulder_flexion', 't_spine']);
});

test('deficientAxes — axe sain (3/3) exclu', () => {
  assert.deepEqual(deficientAxes(pt({})), []);
});

test('deficientAxes — null → []', () => {
  assert.deepEqual(deficientAxes(null), []);
});
```

**Step 2: Run (RED)**

Run: `node --test --import tsx src/lib/strength/mesocycleEngine.test.ts` (ou la commande de test du projet : `npm test` filtré).
Attendu : FAIL — `deficientAxes` non exporté.

**Step 3: Implémenter**

Dans `mesocycleEngine.ts` (près de `dysfunctionFlags`), ajouter :
```typescript
/** Un axe déficitaire avec son côté faible, pour le Bloc 2 (§351). */
export interface DeficientAxis {
  axis: string;
  /** Côté faible : 'left'/'right' si asymétrie, 'both' si G===D. */
  side: 'left' | 'right' | 'both';
  effective: number;
  asymmetry: number;
}

/**
 * §351 — axes de mobilité/mouvement déficitaires, triés par sévérité.
 * Critère d'inclusion : `effective = min(G,D) ≤ 1` OU `|G−D| ≥ 2`.
 * Tri : `effective` croissant, puis `|G−D|` décroissant (les pires d'abord).
 */
export function deficientAxes(physicalTests: StrengthPhysicalTests | null): DeficientAxis[] {
  const pt = normalizePhysicalTests(physicalTests);
  if (!pt) return [];
  const out: DeficientAxis[] = [];
  const all = { ...pt.mobility, ...pt.movement } as Record<string, { left: number; right: number }>;
  for (const [axis, v] of Object.entries(all)) {
    const effective = Math.min(v.left, v.right);
    const asymmetry = Math.abs(v.left - v.right);
    if (effective <= 1 || asymmetry >= 2) {
      const side: DeficientAxis['side'] =
        v.left === v.right ? 'both' : v.left < v.right ? 'left' : 'right';
      out.push({ axis, side, effective, asymmetry });
    }
  }
  out.sort((a, b) => (a.effective - b.effective) || (b.asymmetry - a.asymmetry));
  return out;
}
```

**Step 4: Run (GREEN)**

Run: même commande. Attendu : PASS.

**Step 5: Commit**

```bash
git add src/lib/strength/mesocycleEngine.ts src/lib/strength/mesocycleEngine.test.ts
git commit -m "feat(§351): deficientAxes (seuil ≤1 ou asymétrie ≥2, tri sévérité)"
```

---

## Task 5: `buildCommonWarmup` — résolution Bloc 1 (TDD)

**Files:**
- Modify: `src/lib/strength/mesocycleEngine.ts`
- Test: `src/lib/strength/mesocycleEngine.test.ts`

**Step 1: Tests (RED)**

```typescript
import { buildCommonWarmup } from './mesocycleEngine';

const cat = (over: Partial<CatalogExercise> & { id: number }): CatalogExercise => ({
  id: over.id, nomExercice: `ex${over.id}`, bucket: 'mobility', level: 'beginner',
  contraindicationZones: over.contraindicationZones ?? [], strokePrehabAffinity: [],
  correctiveAxes: over.correctiveAxes ?? [], isCore: false, selectionPriority: 0,
  illustrationGif: null, nbSeriesEndurance: 2, nbRepsEndurance: 10,
  pourcentageCharge1rmEndurance: 0, recupSeriesEndurance: 30, nbSeriesForce: null,
  nbRepsForce: null, pourcentageCharge1rmForce: null, recupSeriesForce: null,
});

test('buildCommonWarmup — résout les ids dans l\'ordre de la routine', () => {
  const catalog = [cat({ id: 87 }), cat({ id: 84 }), cat({ id: 24 })];
  const res = buildCommonWarmup([87, 84, 24], catalog, []);
  assert.deepEqual(res.map(s => s.exercise.id), [87, 84, 24]);
});

test('buildCommonWarmup — saute un exo contre-indiqué', () => {
  const catalog = [cat({ id: 87 }), cat({ id: 84, contraindicationZones: ['left_shoulder'] })];
  const res = buildCommonWarmup([87, 84], catalog, ['left_shoulder']);
  assert.deepEqual(res.map(s => s.exercise.id), [87]);
});

test('buildCommonWarmup — id absent du catalogue ignoré ; routine vide → []', () => {
  assert.deepEqual(buildCommonWarmup([999], [cat({ id: 87 })], []), []);
  assert.deepEqual(buildCommonWarmup([], [cat({ id: 87 })], []), []);
});
```

**Step 2: Run (RED)** — FAIL (non exporté).

**Step 3: Implémenter**

```typescript
/**
 * §351 Bloc 1 — résout la routine articulaire commune (ids ordonnés) en exos,
 * filtre les contre-indications (douleur épaule → saute Shoulder Dislocates).
 */
export function buildCommonWarmup(
  routineIds: number[],
  catalog: CatalogExercise[],
  painZones: string[],
): SelectedExercise[] {
  const painSet = new Set(painZones);
  const byId = new Map(catalog.map((e) => [e.id, e]));
  const out: SelectedExercise[] = [];
  for (const id of routineIds) {
    const ex = byId.get(id);
    if (!ex) continue;
    if (ex.contraindicationZones.some((z) => painSet.has(z))) continue;
    out.push({ exercise: ex, substituted: false, originalExerciseId: null });
  }
  return out;
}
```

**Step 4: Run (GREEN)** — PASS.

**Step 5: Commit**

```bash
git add src/lib/strength/mesocycleEngine.ts src/lib/strength/mesocycleEngine.test.ts
git commit -m "feat(§351): buildCommonWarmup (Bloc 1, résolution + filtre contre-indication)"
```

---

## Task 6: `selectCorrectiveWarmup` — Bloc 2 + rotation déterministe (TDD)

**Files:**
- Modify: `src/lib/strength/mesocycleEngine.ts`
- Test: `src/lib/strength/mesocycleEngine.test.ts`

**Step 1: Ajouter la constante**

Près des autres constantes de volume :
```typescript
/** §351 — plafond d'exos correctifs (Bloc 2) par séance. Rotation au-delà. */
const MAX_CORRECTIVE = 2;
```

**Step 2: Tests (RED)**

```typescript
import { selectCorrectiveWarmup } from './mesocycleEngine';

test('selectCorrectiveWarmup — un exo par axe déficitaire, plafond MAX_CORRECTIVE', () => {
  const deficient = [
    { axis: 'hip', side: 'both', effective: 0, asymmetry: 0 },
    { axis: 'scapula_control', side: 'left', effective: 1, asymmetry: 2 },
  ] as any;
  const catalog = [
    cat({ id: 59, correctiveAxes: ['hip'] }),
    cat({ id: 51, correctiveAxes: ['scapula_control'] }),
  ];
  const res = selectCorrectiveWarmup(deficient, catalog, [], 'beginner', 0, []);
  assert.deepEqual(res.map(s => s.exercise.id), [59, 51]);
});

test('selectCorrectiveWarmup — rotation déterministe sur sessionIndex (4 axes, cap 2)', () => {
  const deficient = ['A','B','C','D'].map((axis, i) =>
    ({ axis, side: 'both', effective: i === 0 ? 0 : 1, asymmetry: 0 })) as any;
  const catalog = ['A','B','C','D'].map((a, i) => cat({ id: 10 + i, correctiveAxes: [a] }));
  const s0 = selectCorrectiveWarmup(deficient, catalog, [], 'beginner', 0, []).map(s => s.exercise.id);
  const s1 = selectCorrectiveWarmup(deficient, catalog, [], 'beginner', 1, []).map(s => s.exercise.id);
  const s2 = selectCorrectiveWarmup(deficient, catalog, [], 'beginner', 2, []).map(s => s.exercise.id);
  assert.deepEqual(s0, [10, 11]); // A,B (pires d'abord)
  assert.deepEqual(s1, [12, 13]); // C,D
  assert.deepEqual(s2, [10, 11]); // wrap → A,B
});

test('selectCorrectiveWarmup — contre-indication exclut l\'exo de l\'axe', () => {
  const deficient = [{ axis: 'hip', side: 'both', effective: 0, asymmetry: 0 }] as any;
  const catalog = [cat({ id: 59, correctiveAxes: ['hip'], contraindicationZones: ['left_hip'] })];
  const res = selectCorrectiveWarmup(deficient, catalog, ['left_hip'], 'beginner', 0, []);
  assert.deepEqual(res, []);
});

test('selectCorrectiveWarmup — dédup vs Bloc 1 (exo déjà dans la routine commune)', () => {
  const deficient = [{ axis: 't_spine', side: 'both', effective: 1, asymmetry: 0 }] as any;
  const catalog = [cat({ id: 87, correctiveAxes: ['t_spine', 'trunk_neck_alignment'] })];
  const common = [{ exercise: catalog[0], substituted: false, originalExerciseId: null }] as any;
  const res = selectCorrectiveWarmup(deficient, catalog, [], 'beginner', 0, common);
  assert.deepEqual(res, []); // 87 déjà dans le bloc commun → pas de doublon
});

test('selectCorrectiveWarmup — porte axe + côté pour l\'UI', () => {
  const deficient = [{ axis: 'hip', side: 'left', effective: 1, asymmetry: 2 }] as any;
  const catalog = [cat({ id: 59, correctiveAxes: ['hip'] })];
  const res = selectCorrectiveWarmup(deficient, catalog, [], 'beginner', 0, []);
  assert.equal(res[0].correctiveAxis, 'hip');
  assert.equal(res[0].correctiveSide, 'left');
});
```

> Note : `selectCorrectiveWarmup` renvoie un `SelectedExercise` **enrichi** (`correctiveAxis`/`correctiveSide`). Étendre localement le type de retour (cf. Step 3) ou ajouter ces champs optionnels à `SelectedExercise` dans `mesocycleEngine.types.ts`.

**Step 3: Implémenter**

Ajouter les champs optionnels à `SelectedExercise` (types) :
```typescript
  /** §351 — axe ciblé (Bloc 2 correctif). */
  correctiveAxis?: string;
  correctiveSide?: 'left' | 'right' | 'both';
```

Implémentation :
```typescript
/**
 * §351 Bloc 2 — sélectionne les exos correctifs pour les axes déficitaires.
 * Rotation déterministe : fenêtre glissante de taille MAX_CORRECTIVE sur la liste
 * triée (pires d'abord), décalée par `sessionIndex` → couverture équitable sur la
 * semaine. Dédupliqué vs le Bloc 1 (`commonPool`). Aucun `Date.now`/`random`.
 */
export function selectCorrectiveWarmup(
  deficient: DeficientAxis[],
  catalog: CatalogExercise[],
  painZones: string[],
  level: 'beginner' | 'intermediate' | 'advanced',
  sessionIndex: number,
  commonPool: SelectedExercise[],
): SelectedExercise[] {
  if (deficient.length === 0) return [];
  const painSet = new Set(painZones);
  const levelNum = LEVEL_ORDER[level];
  const usedIds = new Set(commonPool.map((s) => s.exercise.id));

  // Fenêtre glissante des axes pour cette séance.
  const n = deficient.length;
  const take = Math.min(MAX_CORRECTIVE, n);
  const start = n > 0 ? (sessionIndex * MAX_CORRECTIVE) % n : 0;
  const window: DeficientAxis[] = [];
  for (let i = 0; i < take; i++) window.push(deficient[(start + i) % n]);

  const out: SelectedExercise[] = [];
  for (const d of window) {
    const candidate = catalog.find(
      (e) =>
        e.correctiveAxes.includes(d.axis) &&
        !usedIds.has(e.id) &&
        (e.level === null || LEVEL_ORDER[e.level] <= levelNum) &&
        !e.contraindicationZones.some((z) => painSet.has(z)),
    );
    if (candidate) {
      usedIds.add(candidate.id);
      out.push({
        exercise: candidate,
        substituted: false,
        originalExerciseId: null,
        correctiveAxis: d.axis,
        correctiveSide: d.side,
      });
    }
  }
  return out;
}
```

**Step 4: Run (GREEN)** — PASS sur les 5 tests.

**Step 5: Commit**

```bash
git add src/lib/strength/mesocycleEngine.ts src/lib/strength/mesocycleEngine.types.ts src/lib/strength/mesocycleEngine.test.ts
git commit -m "feat(§351): selectCorrectiveWarmup (Bloc 2, rotation déterministe + dédup)"
```

---

## Task 7: Câbler les blocs dans le moteur (`buildSession`/`buildPapSession`) + threading sessionIndex (TDD intégration)

**Files:**
- Modify: `src/lib/strength/mesocycleEngine.ts`
- Test: `src/lib/strength/mesocycleEngine.test.ts`

**Contexte d'implémentation :** pré-calculer les blocs dans `generateMesocycle` (qui a `physical_tests`, catalogue, niveau, `commonWarmupRoutine`) et passer, par séance, l'échauffement résolu. Cela garde `buildSession` pur de la logique physical_tests.

**Step 1: Tests d'intégration (RED)**

```typescript
// Construire un MesocycleInput minimal (réutiliser les helpers existants du fichier
// de test pour generateMesocycle ; ajouter commonWarmupRoutine + un catalogue mobility
// taggé + un physical_tests avec un déficit hip).

test('generateMesocycle — séance de développement porte Bloc 1 (common) + Bloc 2 (corrective)', () => {
  const meso = generateMesocycle(inputWithDeficitHipAndRoutine);
  const dev = meso.weeks[0].sessions.find(s => s.role === 'developpement')!;
  const warmups = dev.exercises.filter(e => e.warmupKind);
  assert.ok(warmups.some(e => e.warmupKind === 'common'));     // Bloc 1
  assert.ok(warmups.some(e => e.warmupKind === 'corrective')); // Bloc 2
  // Bloc 2 porte l'axe ciblé.
  assert.ok(warmups.some(e => e.warmupKind === 'corrective' && e.correctiveAxis === 'hip'));
});

test('generateMesocycle — amorce PAP porte aussi les blocs 1+2', () => {
  const meso = generateMesocycle(inputJourAwareWithPrimerAndDeficit);
  const pap = meso.weeks[0].sessions.find(s => s.role === 'amorce_pap')!;
  assert.ok(pap.exercises.some(e => e.warmupKind === 'common'));
});

test('generateMesocycle — override mobilité corrective NE porte PAS les blocs 1+2', () => {
  const meso = generateMesocycle(inputWithIntensePain); // douleur intense → override
  const corr = meso.weeks[0].sessions.find(s => s.role === 'mobilite_corrective');
  if (corr) assert.equal(corr.exercises.some(e => e.warmupKind), false);
});

test('generateMesocycle — sans déficit, séance porte Bloc 1 seul (pas de Bloc 2)', () => {
  const meso = generateMesocycle(inputNoDeficitWithRoutine);
  const dev = meso.weeks[0].sessions.find(s => s.role === 'developpement')!;
  assert.ok(dev.exercises.some(e => e.warmupKind === 'common'));
  assert.equal(dev.exercises.some(e => e.warmupKind === 'corrective'), false);
});
```

**Step 2: Run (RED)** — FAIL.

**Step 3: Implémenter**

Dans `generateMesocycle` :
```typescript
// §351 — blocs d'échauffement pré-calculés (matérialisés à la génération).
const warmupPainZones = painZones; // mêmes zones que la sécurité
const commonWarmupPool = buildCommonWarmup(
  input.commonWarmupRoutine ?? [],
  input.exerciseCatalog,
  warmupPainZones,
);
const deficient = deficientAxes(input.assessment.physical_tests);
```

Passer à `buildWeek`, dans le bloc `flags`, un `sessionIndexBase` (= `(pw.weekNumber - 1) * weekdays.length`) + `commonWarmupPool`, `deficient`, `level`, `catalog`, `warmupPainZones`. Dans `buildWeek`, pour chaque `slot` d'index `idx`, calculer :
```typescript
const globalIdx = sessionIndexBase + idx;
const corrective = selectCorrectiveWarmup(
  deficient, catalog, warmupPainZones, level, globalIdx, commonWarmupPool,
);
```
et passer `{ common: commonWarmupPool, corrective }` à `buildSession` (nouveau champ du `JourAwareContext`, ex. `ctx.warmup`).

Dans `buildSession`, **remplacer** le calcul du warmup générique :
```typescript
// AVANT (§318) :
// const warmup = mobilityPool.slice(0, warmupCount).map(s => toMesocycleExercise(s, cycle, true));
// APRÈS (§351) :
const warmup = [
  ...ctx.warmup.common.map(s => tagWarmup(toMesocycleExercise(s, cycle, true), 'common')),
  ...ctx.warmup.corrective.map(s =>
    tagWarmup(toMesocycleExercise(s, cycle, true), 'corrective', s.correctiveAxis, s.correctiveSide)),
];
```
où `tagWarmup` ajoute les champs `warmupKind`/`correctiveAxis`/`correctiveSide` :
```typescript
function tagWarmup(
  ex: MesocycleExercise, kind: 'common' | 'corrective',
  axis?: string, side?: 'left' | 'right' | 'both',
): MesocycleExercise {
  return { ...ex, warmupKind: kind, correctiveAxis: axis, correctiveSide: side };
}
```

- **Supprimer** la logique `MOBILITY_WARMUP_COUNT`/`warmupCount`/`MIN_WARMUP_COUNT` qui rognait le warmup dans `MAX_SESSION_ITEMS` : l'échauffement est désormais hors cap. `MAX_SESSION_ITEMS` ne s'applique plus qu'à `[...primaryBlock, ...complementBlock, ...coreBlock]` (recalculer ce plafond uniquement sur les blocs de travail).
- Dans `buildPapSession` : remplacer le `mobilityPool[0]` unique par les mêmes `ctx.warmup.common` + `ctx.warmup.corrective` (passer `ctx.warmup` à `buildPapSession`).
- L'override mobilité corrective (`isMobilityOverride`) : **ne pas** ajouter les blocs (chemin inchangé).

> Garder le tag `buckets` cohérent : un item warmup reste `bucket: 'mobility'`. Les sous-en-têtes UI s'appuient sur `warmupKind`.

**Step 4: Run (GREEN)** — PASS. Vérifier qu'aucun test existant de `generateMesocycle` ne casse (les anciens tests sans `commonWarmupRoutine`/sans physical_tests doivent rester verts ; ajouter `commonWarmupRoutine: []` aux fixtures existantes si le champ est requis — sinon le rendre optionnel avec défaut `[]`).

**Step 5: Commit**

```bash
git add src/lib/strength/mesocycleEngine.ts src/lib/strength/mesocycleEngine.test.ts
git commit -m "feat(§351): blocs 1+2 dans buildSession/buildPapSession (warmup hors MAX_SESSION_ITEMS)"
```

---

## Task 8: API catalogue — lire `corrective_axes`

**Files:**
- Modify: `src/lib/api/strength-catalog.ts`

**Step 1: Étendre `DbRow` + `select` + `mapRow`**

- `DbRow` : ajouter `corrective_axes: string[] | null;`
- `.select('… , corrective_axes, …')` : ajouter `corrective_axes` à la liste des colonnes.
- `mapRow` : ajouter `correctiveAxes: row.corrective_axes ?? [],`.

**Step 2: tsc**

Run: `npx tsc --noEmit`
Attendu : 0 erreur (résout l'erreur de Task 3).

**Step 3: Commit**

```bash
git add src/lib/api/strength-catalog.ts
git commit -m "feat(§351): strength-catalog lit corrective_axes"
```

---

## Task 9: API — `getCommonWarmupRoutine` (TDD léger)

**Files:**
- Create: `src/lib/api/strength-warmup.ts`
- Test: `src/lib/api/__tests__/strength-warmup.test.ts`
- Modify: `src/lib/api/index.ts` (re-export si convention)

**Step 1: Test (RED)** — mocker `supabase`/`canUseSupabase` comme les autres tests du dossier :

```typescript
test('getCommonWarmupRoutine — renvoie les exercise_ids triés par ordre', async () => {
  // mock supabase.from('warmup_common_routine').select(...).order('ordre')
  //   → [{exercise_id:87},{exercise_id:84},{exercise_id:24}]
  const ids = await getCommonWarmupRoutine();
  assert.deepEqual(ids, [87, 84, 24]);
});

test('getCommonWarmupRoutine — Supabase indisponible → []', async () => {
  // canUseSupabase() → false
  assert.deepEqual(await getCommonWarmupRoutine(), []);
});
```

**Step 2: Run (RED)** — FAIL.

**Step 3: Implémenter**

```typescript
import { supabase, canUseSupabase, assertSupabase } from './client';

/** §351 — ids ordonnés de la routine articulaire commune (Bloc 1). */
export async function getCommonWarmupRoutine(): Promise<number[]> {
  if (!canUseSupabase()) return [];
  const data = assertSupabase(
    await supabase.from('warmup_common_routine').select('exercise_id, ordre').order('ordre'),
  );
  return ((data ?? []) as { exercise_id: number }[]).map((r) => r.exercise_id);
}
```

**Step 4: Run (GREEN)** — PASS.

**Step 5: Commit**

```bash
git add src/lib/api/strength-warmup.ts src/lib/api/__tests__/strength-warmup.test.ts src/lib/api/index.ts
git commit -m "feat(§351): API getCommonWarmupRoutine"
```

---

## Task 10: Orchestrateur d'aperçu — injecter `commonWarmupRoutine`

**Files:**
- Modify: `src/lib/api/strength-mesocycles.ts` (chemin preview qui construit le `MesocycleInput`)

**Step 1: Repérer la construction du `MesocycleInput`**

Chercher dans `strength-mesocycles.ts` où `exerciseCatalog` est passé à `generateMesocycle`/preview. Y ajouter `commonWarmupRoutine`.

**Step 2: Implémenter**

Charger la routine en parallèle du catalogue (`Promise.all`) et l'injecter :
```typescript
const [catalog, commonWarmupRoutine] = await Promise.all([
  listCatalogExercisesTagged(),
  getCommonWarmupRoutine(),
]);
// … input: { …, exerciseCatalog: catalog, commonWarmupRoutine }
```

**Step 3: tsc + test**

Run: `npx tsc --noEmit` → 0. `npm test` (suite complète) → vert.

**Step 4: Commit**

```bash
git add src/lib/api/strength-mesocycles.ts
git commit -m "feat(§351): preview injecte commonWarmupRoutine dans MesocycleInput"
```

---

## Task 11: UI — marquage de l'échauffement (`/frontend-design` OBLIGATOIRE)

> **Règle projet : invoquer le skill `/frontend-design` pour ce travail UI.** Ne pas concevoir le rendu en autonomie.

**Files (à confirmer à l'ouverture) :**
- Modify: composant de rendu de la liste d'exos d'une séance matérialisée (probablement `SessionDetailPreview` + la vue séance nageur) — repérer via Grep `warmupKind`/`isWarmup`/rendu des `exercises` d'une `MesocycleSession`.

**Objectif :**
- Regrouper les items `warmupKind === 'common'` sous un sous-en-tête **« Échauffement articulaire »** et `warmupKind === 'corrective'` sous **« Mobilité corrective »**, avant le bloc principal.
- Pour chaque item correctif : afficher **axe + côté faible** (ex. « Hanche · côté gauche ») — mapper `correctiveAxis` via les labels FR de `MOBILITY_EVOLUTION_AXES` (`mobilityEvolution.ts`) et `correctiveSide` (`left`→« côté gauche », `right`→« côté droit », `both`→ rien).
- Badge léger « échauffement » réutilisant le style activation existant.
- Aucune nouvelle route ni écran.

**Tests :** vitest léger (`*.vitest.tsx`) sur le composant de rendu — vérifie que les deux sous-en-têtes apparaissent quand les `warmupKind` sont présents, et que l'axe/côté s'affiche. **Attention hooks** (leçon §316/§326/§350) : si le composant gagne un `useMemo`, le placer AVANT tout early return.

**Commit :**
```bash
git add <composants UI touchés> <tests vitest>
git commit -m "feat(§351): UI marquage échauffement (sous-en-têtes articulaire/correctif + axe·côté)"
```

---

## Task 12: Vérification finale + documentation obligatoire

**Step 1: Vérifications complètes**

```bash
npx tsc --noEmit          # 0 erreur
npm run lint              # 0 erreur (warnings exhaustive-deps tolérés)
npm test                  # node:test : 1501 + nouveaux, tous verts
npm run build             # OK
```
RLS déjà couvert Task 2 (`npm run test:rls`).

**Step 2: Documentation (workflow projet obligatoire)**

- `docs/implementation-log.md` : entrée **§351** (contexte, data model, moteur, UI, tests, limites = Bloc 3 + éditions → §352).
- `docs/ROADMAP.md` : ligne §351 + `*Dernière mise à jour*` en tête.
- `docs/FEATURES_STATUS.md` : feature échauffement intelligent ❌→⚠️/✅ (blocs 1+2).
- `CLAUDE.md` : ligne « Dernier § livré » = §351 (≤15 mots) ; annuaire `docs/claude/files-map.md` → `src/lib/api/strength-warmup.ts` (wc -l), table `warmup_common_routine`, colonne `corrective_axes`.
- Mémoire : MAJ `muscu-bilan-warmup-roadmap.md` (item 8 partiel : blocs 1+2 livrés ; Bloc 3 + édition per-séance + écran routine = §352).

**Step 3: Commit doc**

```bash
git add docs/implementation-log.md docs/ROADMAP.md docs/FEATURES_STATUS.md CLAUDE.md docs/claude/files-map.md
git commit -m "docs(§351): log + roadmap + features + annuaire (échauffement intelligent)"
```

**Step 4: Push (si demandé)**

```bash
git push origin main   # déclenche CI lint+build (gate react-hooks/rules-of-hooks)
```
Vérifier le déploiement (console : `[EAC] Build: <date>`).

---

## Notes transverses

- **Déterminisme** : aucun `Date.now()`/`Math.random()` dans le moteur (contrainte pure / resume). La rotation s'appuie sur l'index de séance global.
- **Rétrocompat** : anciens bilans (axes `number`, G=D) → `normalizePhysicalTests` les upcaste (G=D) ; `deficientAxes` les juge sur `effective`, asymétrie 0. Plans existants déjà matérialisés : inchangés (un nouveau bilan + régén applique les blocs — cf. mémoire `muscu-materialized-plan-stale-vs-catalog`).
- **`commonWarmupRoutine` optionnel** : rendre le champ optionnel (défaut `[]`) côté moteur pour ne pas casser les fixtures de test existantes.
- **Frontières §352** : édition per-séance des warmups, écran coach d'édition de `warmup_common_routine`, Bloc 3 (activation musculaire spécifique séance, nécessite tagging « groupe musculaire »).
