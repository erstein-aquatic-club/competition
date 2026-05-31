# Échauffement intelligent §352 — Bloc 3 (activation) + correctif unilatéral + Raise — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Ajouter le Bloc 3 (activation musculaire spécifique aux seaux de la séance) à l'échauffement matérialisé, rendre le Bloc 2 correctif **unilatéral** pour les axes asymétriques, et ajouter une mise en route « Raise » + des seeds dynamiques au Bloc 1.

**Architecture:** Prolonge §351. Une table seedée `warmup_activation_routine (bucket→exos)` + une colonne `dim_exercices.supports_unilateral`. Le moteur pur calcule par séance de développement un bloc activation (1 exo/seau de travail, plafond 2, dédup vs Blocs 1+2) et, pour le correctif d'un axe asymétrique, préfère un exo unilatéral côté faible. Matérialisé à la génération, marqué à l'aperçu (3ᵉ sous-section).

**Tech Stack:** TypeScript, fonctions pures `node:test`, Supabase (migration MCP + RLS), React/Tailwind (`/frontend-design`).

**Design de référence :** `docs/plans/2026-05-31-echauffement-intelligent-bloc3-activation-design.md`. **Base §351** : commits `f0f6860d6`→`fb1bc5d53` (structure warmup : `buildCommonWarmup`/`selectCorrectiveWarmup`/`deficientAxes`, `ctx.warmup={common,corrective}`, `tagWarmup`, `warmupLabels.ts`, persistance `raw_payload`, marquage `SessionCard`).

**Conventions :** migrations via MCP (projet `fscnobivsgornxdwqwlk`) ; `git add` **ciblé** (checkout partagé entre terminaux — d'autres fichiers WIP non-à-moi peuvent être présents) ; runner `node --test --experimental-test-module-mocks --import tsx <file>` ; pas de push sans demande.

---

## Task 1: Migration `00215_warmup_bloc3.sql` (table activation + supports_unilateral + Raise + seeds)

**Files:** Create `supabase/migrations/00215_warmup_bloc3.sql` ; apply via MCP `apply_migration`.

**Step 1: Écrire la migration**

```sql
-- 00215_warmup_bloc3.sql — §352 Bloc 3 activation + correctif unilatéral + Raise

-- (1) Colonne unilatéral (Bloc 2 correctif côté faible).
ALTER TABLE dim_exercices ADD COLUMN IF NOT EXISTS supports_unilateral boolean NOT NULL DEFAULT false;
UPDATE dim_exercices SET supports_unilateral = true WHERE id IN (59, 85, 73);  -- Hip Airplane, 90/90 Hip Switch, Rowing élastique unilatéral
-- (liste exacte à confirmer coach au seed — exos naturellement par côté)

-- (2) Table activation (Bloc 3), parallèle de warmup_common_routine.
CREATE TABLE IF NOT EXISTS warmup_activation_routine (
  id          serial PRIMARY KEY,
  bucket      text NOT NULL,
  ordre       int  NOT NULL,
  exercise_id int  NOT NULL REFERENCES dim_exercices(id)
);
ALTER TABLE warmup_activation_routine ENABLE ROW LEVEL SECURITY;
CREATE POLICY warmup_activation_routine_read ON warmup_activation_routine
  FOR SELECT USING (app_user_role() IS NOT NULL);
CREATE POLICY warmup_activation_routine_write ON warmup_activation_routine
  FOR ALL USING (app_user_role() IN ('coach','admin'))
  WITH CHECK (app_user_role() IN ('coach','admin'));

-- Seed activation par seau (exos légers, fondés recherche). Ids à confirmer coach.
INSERT INTO warmup_activation_routine (bucket, ordre, exercise_id) VALUES
  ('upper_strength', 1, 74),  -- Rowing élastique penché
  ('upper_strength', 2, 49),  -- Face Pull
  ('upper_power',    1, 49),  -- Face Pull
  ('upper_power',    2, 51),  -- Serratus Wall Slide
  ('lower_strength', 1, 93),  -- glute machine (activation fessiers légère)
  ('lower_power',    1, 93);

-- (3) Item Raise (mise en route) seedé puis placé en tête de warmup_common_routine.
INSERT INTO dim_exercices (nom_exercice, bucket, level, is_core, contraindication_zones,
  nb_series_endurance, nb_reps_endurance, pourcentage_charge_1rm_endurance, recup_series_endurance)
VALUES ('Mise en route (montées de genoux / corde à sauter)', 'mobility', 'beginner', false, '{}', 1, 30, 0, 20)
RETURNING id;
-- Puis (dans la même migration, via un DO/insert paramétré ou un second statement) :
INSERT INTO warmup_common_routine (ordre, exercise_id)
SELECT 0, id FROM dim_exercices WHERE nom_exercice = 'Mise en route (montées de genoux / corde à sauter)';
```

> Le `RETURNING` ne se chaîne pas en SQL plat ; utiliser deux statements (INSERT exo, puis INSERT routine via `SELECT id FROM dim_exercices WHERE nom_exercice = '…'`). Vérifier l'unicité du nom avant.

**Step 2: Appliquer via MCP** (`apply_migration`, name `00215_warmup_bloc3`).

**Step 3: Vérifier** via `execute_sql` :
```sql
SELECT bucket, ordre, exercise_id FROM warmup_activation_routine ORDER BY bucket, ordre;
SELECT id, nom_exercice FROM dim_exercices WHERE supports_unilateral; -- 59,85,73 + raise non concerné
SELECT ordre, exercise_id FROM warmup_common_routine ORDER BY ordre; -- ordre 0 = Raise en tête
```

**Step 4: Commit** (targeted) :
```bash
git add supabase/migrations/00215_warmup_bloc3.sql
git commit -m "feat(§352): migration bloc3 activation + supports_unilateral + item Raise"
```

---

## Task 2: Test RLS `warmup_activation_routine`

**Files:** Modify `supabase/tests/schema.sql` (réplique table + 2 policies, + colonne `supports_unilateral` sur le `dim_exercices` de test) ; Create `supabase/tests/rls/warmup_activation_routine.test.ts` (calqué sur `warmup_common_routine.test.ts` de §351).

Mêmes cas que §351 : athlète CAN SELECT ; athlète CANNOT INSERT/UPDATE/DELETE (no-op détecté, piège §113) ; coach CAN INSERT/UPDATE/DELETE. Vérifier Docker (`docker ps`, 1×) ; `supabase start` si besoin ; `npm run test:rls`. Valider le piège §113 (affaiblir la policy → RED).

**Commit:** `git add supabase/tests/schema.sql supabase/tests/rls/warmup_activation_routine.test.ts && git commit -m "test(§352): RLS warmup_activation_routine"`

---

## Task 3: Types + lecture catalogue (grouper pour tsc vert)

**Files:** Modify `src/lib/strength/mesocycleEngine.types.ts`, `src/lib/api/strength-catalog.ts`.

- `CatalogExercise` : `+ supportsUnilateral: boolean;`
- `MesocycleInput` : `+ activationRoutine?: Partial<Record<StrengthBucket, number[]>>;`
- `MesocycleExercise.warmupKind` + `SelectedExercise` (si un champ kind y est dérivé) : union `'common' | 'corrective' | 'activation'`.
- `strength-catalog.ts` : `DbRow + supports_unilateral: boolean | null;`, ajouter `supports_unilateral` au `.select(...)`, `mapRow` → `supportsUnilateral: row.supports_unilateral ?? false`.

`npx tsc --noEmit` → 0. Commit : `git add <les 2 fichiers> && git commit -m "feat(§352): types supportsUnilateral/activationRoutine + catalogue lit supports_unilateral"`

---

## Task 4: `selectActivation` (pure, TDD)

**Files:** Modify `src/lib/strength/mesocycleEngine.ts` + test `src/lib/strength/__tests__/mesocycleEngine.test.ts`.

**Step 1: Constante** près de `MAX_CORRECTIVE` :
```typescript
/** §352 — plafond d'exos d'activation (Bloc 3) par séance. */
const MAX_ACTIVATION = 2;
```

**Step 2: Tests (RED)** — réutiliser le helper `cat()` (ajouter le champ `supportsUnilateral: false` au helper s'il manque) :
```typescript
import { selectActivation } from './mesocycleEngine';

test('selectActivation — 1 exo par seau de travail, plafond 2', () => {
  const routine = { upper_strength: [74, 49], lower_power: [93] } as any;
  const catalog = [cat({ id: 74 }), cat({ id: 49 }), cat({ id: 93 })];
  const res = selectActivation(['upper_strength', 'lower_power'], routine, catalog, [], 'beginner', new Set());
  assert.deepEqual(res.map(s => s.exercise.id), [74, 93]);
  assert.ok(res.every(s => s.warmupKind === undefined)); // tag posé au build, pas ici (cf. impl) — adapter selon choix
});

test('selectActivation — dédup vs Blocs 1+2 (usedIds)', () => {
  const routine = { upper_strength: [74, 49] } as any;
  const catalog = [cat({ id: 74 }), cat({ id: 49 })];
  const res = selectActivation(['upper_strength'], routine, catalog, [], 'beginner', new Set([74]));
  assert.deepEqual(res.map(s => s.exercise.id), [49]); // 74 déjà utilisé → prend le suivant
});

test('selectActivation — contre-indication + plafond global 2', () => {
  const routine = { upper_strength: [49], upper_power: [51], lower_strength: [93] } as any;
  const catalog = [cat({ id: 49 }), cat({ id: 51, contraindicationZones: ['left_shoulder'] }), cat({ id: 93 })];
  const res = selectActivation(['upper_strength','upper_power','lower_strength'], routine, catalog, ['left_shoulder'], 'beginner', new Set());
  // upper_power exclu (CI) ; plafond 2 → [49, 93]
  assert.deepEqual(res.map(s => s.exercise.id), [49, 93]);
});

test('selectActivation — routine vide pour un seau → ignoré', () => {
  assert.deepEqual(selectActivation(['lower_power'], {} as any, [cat({id:1})], [], 'beginner', new Set()), []);
});
```

**Step 3: Implémenter** (près de `selectCorrectiveWarmup`) :
```typescript
/**
 * §352 Bloc 3 — exos d'activation pour les seaux de travail de la séance.
 * 1 exo par seau (1er admissible de la routine du seau), plafond MAX_ACTIVATION,
 * dédup vs Blocs 1+2 (`usedIds`), fits-level + contre-indication. Déterministe.
 */
export function selectActivation(
  workBuckets: StrengthBucket[],
  activationRoutine: Partial<Record<StrengthBucket, number[]>>,
  catalog: CatalogExercise[],
  painZones: string[],
  level: 'beginner' | 'intermediate' | 'advanced',
  usedIds: Set<number>,
): SelectedExercise[] {
  const painSet = new Set(painZones);
  const levelNum = LEVEL_ORDER[level];
  const byId = new Map(catalog.map((e) => [e.id, e]));
  const out: SelectedExercise[] = [];
  const used = new Set(usedIds);
  for (const bucket of workBuckets) {
    if (out.length >= MAX_ACTIVATION) break;
    const ids = activationRoutine[bucket] ?? [];
    for (const id of ids) {
      const ex = byId.get(id);
      if (!ex || used.has(id)) continue;
      if (ex.level !== null && LEVEL_ORDER[ex.level] > levelNum) continue;
      if (ex.contraindicationZones.some((z) => painSet.has(z))) continue;
      used.add(id);
      out.push({ exercise: ex, substituted: false, originalExerciseId: null });
      break; // 1 exo par seau
    }
  }
  return out;
}
```
*(Le tag `warmupKind='activation'` est posé par `tagWarmup` dans `buildSession`, pas ici — aligner le test du Step 2.)*

**Step 4: GREEN** ; **Step 5: Commit** `feat(§352): selectActivation (Bloc 3, 1/seau, plafond 2, dédup)`.

---

## Task 5: `selectCorrectiveWarmup` unilatéral (TDD)

**Files:** Modify `src/lib/strength/mesocycleEngine.ts` + test.

**Step 1: Tests (RED)** :
```typescript
test('selectCorrectiveWarmup — axe asymétrique préfère un exo unilatéral', () => {
  const deficient = [{ axis: 'hip', side: 'left', effective: 1, asymmetry: 2 }] as any;
  const catalog = [
    cat({ id: 59, correctiveAxes: ['hip'], supportsUnilateral: true }),
    cat({ id: 86, correctiveAxes: ['hip'], supportsUnilateral: false }),
  ];
  const res = selectCorrectiveWarmup(deficient, catalog, [], 'beginner', 0, []);
  assert.equal(res[0].exercise.id, 59); // unilatéral préféré pour l'asymétrie
});

test('selectCorrectiveWarmup — déficit bilatéral (both) : pas de préférence unilatérale', () => {
  const deficient = [{ axis: 'hip', side: 'both', effective: 1, asymmetry: 0 }] as any;
  const catalog = [
    cat({ id: 86, correctiveAxes: ['hip'], supportsUnilateral: false }),
    cat({ id: 59, correctiveAxes: ['hip'], supportsUnilateral: true }),
  ];
  const res = selectCorrectiveWarmup(deficient, catalog, [], 'beginner', 0, []);
  assert.equal(res[0].exercise.id, 86); // ordre catalogue conservé (pas de tri unilatéral)
});

test('selectCorrectiveWarmup — asymétrie mais aucun unilatéral dispo → repli bilatéral', () => {
  const deficient = [{ axis: 't_spine', side: 'right', effective: 1, asymmetry: 2 }] as any;
  const catalog = [cat({ id: 87, correctiveAxes: ['t_spine'], supportsUnilateral: false })];
  const res = selectCorrectiveWarmup(deficient, catalog, [], 'beginner', 0, []);
  assert.equal(res[0].exercise.id, 87);
});
```

**Step 2: Implémenter** — dans le `catalog.find(...)` actuel, quand `d.side !== 'both'`, faire une **première passe** qui exige `supportsUnilateral`, puis repli sur la passe actuelle si rien :
```typescript
const isAsym = d.side !== 'both';
const matches = (e: CatalogExercise) =>
  e.correctiveAxes.includes(d.axis) && !usedIds.has(e.id) &&
  (e.level === null || LEVEL_ORDER[e.level] <= levelNum) &&
  !e.contraindicationZones.some((z) => painSet.has(z));
const candidate =
  (isAsym ? catalog.find((e) => matches(e) && e.supportsUnilateral) : undefined)
  ?? catalog.find(matches);
```
(Conserver le reste : `usedIds.add`, push avec `correctiveAxis`/`correctiveSide`.)

**Step 3: GREEN** (+ régression : les tests §351 de `selectCorrectiveWarmup` restent verts). **Commit** `feat(§352): correctif unilatéral côté faible pour axe asymétrique`.

---

## Task 6: Câblage Bloc 3 dans le moteur (TDD intégration)

**Files:** Modify `src/lib/strength/mesocycleEngine.ts` + test.

- `JourAwareContext.warmup` : `{ common; corrective; activation }`.
- `generateMesocycle` : passer `input.activationRoutine ?? {}` + le catalogue/level dans les flags de `buildWeek` (déjà passés pour le correctif).
- `buildWeek`, par séance de développement : `workBuckets = [slot.primary, slot.complement].filter(b => b && b !== 'mobility' && b !== 'core')` ; `usedIds = new Set([...common, ...corrective].map(s => s.exercise.id))` ; `activation = selectActivation(workBuckets, activationRoutine, catalog, painZones, level, usedIds)`. Construire le `ctx.warmup` par séance avec `activation` (les séances PAP/override reçoivent `activation: []`).
- `buildSession` (branche développement) : `const warmup = [...common(tag common), ...corrective(tag corrective), ...activation.map(s => tagWarmup(toMesocycleExercise(s, cycle, true), 'activation'))]`. PAP (`buildPapSession`) + override mobilité : pas d'activation.

**Tests (RED→GREEN)** : séance dév porte ≥1 item `warmupKind === 'activation'` sur ses seaux de travail ; PAP + override = aucun `'activation'` ; un exo déjà en common/corrective n'apparaît pas en activation (dédup). **Commit** `feat(§352): câblage Bloc 3 activation dans buildSession (dév only, dédup)`.

---

## Task 7: API `getActivationRoutine` + injection aperçu

**Files:** Modify `src/lib/api/strength-warmup.ts` (+ test), `src/lib/api/index.ts`, `src/pages/MesocyclePreview.tsx`.

- `getActivationRoutine(): Promise<Partial<Record<string, number[]>>>` : `select bucket, exercise_id, ordre from warmup_activation_routine order by bucket, ordre` → regroupe par bucket. Fallback `{}`. Test mocké (calqué sur `getCommonWarmupRoutine`, mêmes flags).
- `MesocyclePreview` : `useQuery(["strength-warmup-activation"], getActivationRoutine)` + `warmupLoading`-style gating ; injecter `activationRoutine` dans le `MesocycleInput` (à côté de `commonWarmupRoutine`).

`tsc 0`, tests verts. **Commit** `feat(§352): API getActivationRoutine + injection aperçu`.

---

## Task 8: Persistance + marquage UI (`/frontend-design`)

**Files:** Modify `src/lib/api/strength-mesocycles.ts`, `src/lib/strength/warmupLabels.ts` (+ test), `src/pages/MesocyclePreview.tsx` (SessionCard).

- `getMesocycleSessionsContent` : ajouter `'activation'` au garde de désérialisation de `warmup_kind` (serialize round-trip déjà OK §351).
- `warmupLabels.warmupSectionLabel` : `'activation' → 'Activation musculaire'` (+ test +1).
- `SessionCard` : la logique de sous-section §351 se base sur `warmupKind` ; vérifier que `'activation'` produit une 3ᵉ eyebrow (l'ordre common→corrective→activation est garanti par le moteur). Ajuster le libellé de transition vers le principal si besoin. **`/frontend-design`** pour le rendu (cohérence sky/iOS existante). **Attention hooks** (#310) : pas de nouveau hook après early return.

`tsc 0`, lint 0, vitest (MesocyclePreview.vitest vert). **Commit** `feat(§352): marquage activation à l'aperçu + persistance warmup_kind activation`.

---

## Task 9: Vérification finale + doc

- `npx tsc --noEmit` 0 ; `npm run lint` 0 erreur ; `npm test` (node:test + vitest) verts ; `npm run build` OK ; `npm run test:rls` (Task 2).
- Doc obligatoire : `implementation-log.md` §352 ; `ROADMAP.md` (+ date) ; `FEATURES_STATUS.md` ; `CLAUDE.md` (« Dernier § livré ») ; `files-map.md` (table `warmup_activation_routine`, colonne `supports_unilateral`, `getActivationRoutine`) ; mémoire `muscu-bilan-warmup-roadmap`.
- **Commit** doc (targeted). Push **uniquement si demandé**.

---

## Notes transverses
- Pas de `Date.now()`/`Math.random()` (moteur pur). Activation déterministe par seau (pas de rotation).
- Dédup ordre : common → corrective → activation (chaque étape ajoute à `usedIds`).
- Seeds (ids exacts activation + supports_unilateral + Raise) **proposés à validation coach** au moment du seed, fondés sur les menus de la recherche (design doc § Recherche).
- Checkout partagé : `git add` ciblé, jamais `-A` ; d'autres fichiers WIP (ex. `swimPlanningShared.ts`, `date.ts`) peuvent appartenir à un autre terminal — ne pas les committer.
