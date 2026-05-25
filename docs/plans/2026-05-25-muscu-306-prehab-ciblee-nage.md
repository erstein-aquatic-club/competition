# §306 — Préhab ciblée par nage — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fermer le trou sécurité 🔴 (douleur adducteurs/aine non déclarable) puis ajouter une couche de préhab proactif ciblée par nage, sans coupler à la natation en eau.

**Architecture:** Phase 1 (défensif) = **données + UI uniquement, zéro logique moteur** (l'override douleur et le filtre contre-indication de `selectExercises` sont déjà génériques sur des chaînes de zones). Phase 2 (préhab proactif) = colonne `stroke_prehab_affinity` sur `dim_exercices` + passe de préférence event-aware additive dans `selectExercises`. Implémenter **Phase 1 d'abord**.

**Tech Stack:** React/TS, Supabase (migration via MCP `apply_migration`, projet `fscnobivsgornxdwqwlk`), tests `node:test`. Design : `docs/plans/2026-05-25-muscu-306-prehab-ciblee-nage-design.md`.

**Conventions projet :** migrations via MCP **uniquement** (jamais `db push`) ; numéro suivant = `00197`. Pas de `test:rls` (données, pas de policy). UI → `/frontend-design` (règle globale). Docs obligatoires en fin (implementation-log + ROADMAP + CLAUDE.md).

---

# PHASE 1 — Défensif (le 🔴) — à livrer en premier

### Task 1 : Label FR de la zone aine (`zones.ts`)

**Files:**
- Modify: `src/lib/strength/zones.ts:33-35` (ajout après `right_ankle`)
- Test: `src/lib/strength/__tests__/zones.test.ts` (créer si absent)

**Step 1 — Test qui échoue**
```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { zoneLabelFr } from '../zones.ts';

test('zoneLabelFr maps groin zones', () => {
  assert.equal(zoneLabelFr('left_groin'), 'aine G');
  assert.equal(zoneLabelFr('right_groin'), 'aine D');
});
```
**Step 2 — Lancer, vérifier l'échec**
Run: `node --test src/lib/strength/__tests__/zones.test.ts`
Expected: FAIL (renvoie `'left_groin'` au lieu de `'aine G'`).

**Step 3 — Implémentation minimale** — dans `ZONE_LABEL_FR`, après `right_ankle: 'cheville D',` (et avant les fallbacks) :
```ts
  left_groin: 'aine G',
  right_groin: 'aine D',
```

**Step 4 — Lancer, vérifier le succès**
Run: `node --test src/lib/strength/__tests__/zones.test.ts` → PASS.

**Step 5 — Commit**
```bash
git add src/lib/strength/zones.ts src/lib/strength/__tests__/zones.test.ts
git commit -m "feat(§306): label FR zone aine (left/right_groin)"
```

---

### Task 2 : Zone aine dans le body-map (`BodySvg.tsx`) — UI

**Files:**
- Modify: `src/components/wellness/BodySvg.tsx:18-37` (`BODY_ZONES`) et `FRONT_POSITIONS` (~ligne 47+)

**Step 1 — Invoquer `/frontend-design`** pour placer/styler les 2 marqueurs de zone **à l'identique des zones existantes** (mêmes cercles cliquables, intérieur de cuisse). Règle globale CLAUDE.md : UI ⇒ `/frontend-design` obligatoire.

**Step 2 — `BODY_ZONES`** : ajouter après `right_ankle` (côté `front`) :
```ts
  { id: "left_groin", label: "Aine G", side: "front" },
  { id: "right_groin", label: "Aine D", side: "front" },
```

**Step 3 — `FRONT_POSITIONS`** : ajouter (intérieur de cuisse, entre hanches cy 230 et genoux cy 310) :
```ts
  left_groin:  { cx: 90,  cy: 264, r: 11 },
  right_groin: { cx: 110, cy: 264, r: 11 },
```

**Step 4 — Vérifier la propagation** (lecture seule) : `BodyHeatMap` (sélecteur nageur), `PainHistoryMap` (coach), `AssessmentContext` consomment `BODY_ZONES` → la zone apparaît automatiquement. `npx tsc --noEmit` exit 0.

**Step 5 — Vérif visuelle** : lancer l'app (`npm run dev`), ouvrir le questionnaire douleur, confirmer que les 2 marqueurs aine sont cliquables et bien placés.

**Step 6 — Commit**
```bash
git add src/components/wellness/BodySvg.tsx
git commit -m "feat(§306): zone douleur aine cliquable sur le body-map"
```

---

### Task 3 : Migration `00197` — contre-indication adducteurs

**Files:**
- Create: `supabase/migrations/00197_contraindication_groin_adductors.sql`

**Step 1 — Écrire le SQL** (append idempotent, ne touche pas les zones existantes ; ids vérifiés en base 2026-05-25) :
```sql
-- 00197_contraindication_groin_adductors.sql — §306 Phase 1 (défensif).
-- Rend la douleur adducteurs/aine effective : tague les exos qui chargent
-- franchement les adducteurs avec left_groin/right_groin (déclarables depuis
-- le body-map, §306). Liste focalisée — à valider coach. Append idempotent
-- (array_append conditionnel). Aucune policy/RLS touchée.
BEGIN;
UPDATE dim_exercices
SET contraindication_zones =
  (SELECT array_agg(DISTINCT z) FROM unnest(contraindication_zones || ARRAY['left_groin','right_groin']) z)
WHERE id IN (58, 37, 33, 36, 76, 92);  -- Copenhague, Fente latérale, Squat bulgare, RDL unilat., Fente sautée, départ ceinture
COMMIT;
```

**Step 2 — Appliquer via MCP** : `mcp__plugin_supabase_supabase__apply_migration` (name `contraindication_groin_adductors`, query = SQL ci-dessus).

**Step 3 — Vérifier en base**
Run SQL : `SELECT id, nom_exercice, contraindication_zones FROM dim_exercices WHERE id IN (58,37,33,36,76,92);`
Expected: chaque ligne contient désormais `left_groin` **et** `right_groin` (zones initiales préservées, pas de doublon).

**Step 4 — Commit**
```bash
git add supabase/migrations/00197_contraindication_groin_adductors.sql
git commit -m "feat(§306): migration 00197 — contre-indication aine sur exos adducteurs"
```

---

### Task 4 : Test de non-régression moteur (contre-indication aine générique)

**Files:**
- Modify: `src/lib/strength/__tests__/mesocycleEngine.test.ts` (ajout d'un cas)

**Step 1 — Test qui échoue** (mock catalog, prouve que la nouvelle zone est honorée par le filtre générique) :
```ts
test('selectExercises exclut un exo tagué left_groin quand l’aine est douloureuse', () => {
  const catalog = [
    { id: 1, nomExercice: 'Copenhague', bucket: 'lower_strength', level: 'intermediate',
      isCore: true, contraindicationZones: ['left_groin'], /* …champs requis… */ },
    { id: 2, nomExercice: 'Presse', bucket: 'lower_strength', level: 'beginner',
      isCore: false, contraindicationZones: [], /* … */ },
  ];
  const alloc = [{ bucket: 'lower_strength', sessionsPerWeek: 2, role: 'focus' }];
  const out = selectExercises(alloc, catalog, 'advanced', ['left_groin']);
  const ids = (out.lower_strength ?? []).map(s => s.exercise.id);
  assert.ok(!ids.includes(1), 'Copenhague (left_groin) doit être exclu');
  assert.ok(ids.includes(2), 'Presse (sans contre-indication) doit rester');
});
```
*(Compléter les champs requis de `CatalogExercise` selon `mesocycleEngine.types.ts` — copier un mock existant du fichier.)*

**Step 2 — Lancer** : `node --test src/lib/strength/__tests__/mesocycleEngine.test.ts` → **PASS attendu immédiatement** (le filtre est déjà générique). Si FAIL, le filtre ne gère pas la zone → investiguer.

**Step 3 — Commit**
```bash
git add src/lib/strength/__tests__/mesocycleEngine.test.ts
git commit -m "test(§306): garde-fou contre-indication zone aine"
```

---

### Task 5 : Vérif globale Phase 1 + docs

**Step 1** : `npm test` (suite complète) → tout vert ; `npx tsc --noEmit` → exit 0. **Pas de `test:rls`** (données/UI, aucune policy).
**Step 2** : Mettre à jour `docs/implementation-log.md` (entrée §306 Phase 1), `docs/ROADMAP.md` (ligne `*Dernière mise à jour*` en tête, §306 en cours), `CLAUDE.md` (« Dernier § livré » → §306 Phase 1). `files-map.md` : pas de nouveau fichier ≥150 lignes → pas d'entrée.
**Step 3 — Commit** : `git commit -m "docs(§306): suivi Phase 1 défensif"`.

> **Checkpoint** : Phase 1 livrable seule. Le 🔴 est fermé. Décider avec l'utilisateur si on enchaîne Phase 2.

---

# PHASE 2 — Préhab proactif event-aware (après Phase 1)

### Task 6 : Migration — colonne `stroke_prehab_affinity` + tag brasse
**Files:** `supabase/migrations/00198_stroke_prehab_affinity.sql`
- `ALTER TABLE dim_exercices ADD COLUMN stroke_prehab_affinity text[];`
- Tag V1 brasse → adducteurs : `UPDATE … SET stroke_prehab_affinity = ARRAY['breaststroke'] WHERE id IN (58, 37, 33);` (Copenhague, Fente latérale, Squat bulgare).
- Appliquer via MCP, vérifier par `SELECT`. Commit.

### Task 7 : Type + mapping catalog
**Files:** `src/lib/strength/mesocycleEngine.types.ts` (+ `strokePrehabAffinity?: string[]` sur `CatalogExercise`) ; le **mapper `dim_exercices` → `CatalogExercise`** (localiser via `grep -rn "contraindicationZones" src/lib/api`) — y ajouter le champ.
- TDD : test que le mapping lit la colonne. Commit.

### Task 8 : Passe de préférence event-aware dans `selectExercises`
**Files:** `src/lib/strength/mesocycleEngine.ts:373-429` ; test `mesocycleEngine.test.ts`.
- **Step 1 — Test qui échoue** : avec `strokeKey='breaststroke'`, un exo `lower_strength` non-core à affinité `breaststroke` remonte **devant** un non-core sans affinité ; ordre **inchangé** pour `strokeKey='freestyle'`.
- **Step 2** — Étendre la signature `selectExercises(alloc, catalog, level, painZones, strokeKey?)`. Après le tri `isCore`/niveau (`:399-405`), bump les exos dont `strokePrehabAffinity?.includes(strokeKey)` juste après les cores (équivalent-core, sans déloger un vrai core de force).
- **Step 3** — `generateMesocycle` dérive `strokeKey` de `input.template.event_group` (`'breaststroke_100'.split('_')[0]`) et le passe. Dégradation gracieuse si non parsable (passe inactive).
- **Step 4** — `node --test` PASS. Commit.

### Task 9 : Vérif globale Phase 2 + docs
- `npm test` vert, `tsc` 0, pas de `test:rls`. Docs (implementation-log/ROADMAP/CLAUDE.md → §306 complet). Commit.

---

## Notes d'exécution
- **Liste d'exos = choix coach** (Tasks 3 & 6) : proposée, à valider — réversible.
- **Ne jamais** déployer localement ; push `main` déclenche GitHub Pages (Phase 1 touche le front → un déploiement est attendu après Task 2).
- Champs `CatalogExercise` requis : copier un mock existant dans `mesocycleEngine.test.ts` pour les Tasks 4 & 8.
