# Mobilisation épaules 3 axes (nageur) — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Remplacer le Y-T-W épaules (id=24) par un nouvel exercice de mobilisation épaule spécifique nageur dans la routine d'échauffement commune et toutes les séances générées.

**Architecture:** Migration SQL atomique (DO block) : INSERT nouvel exercice dans `dim_exercices`, UPDATE `warmup_common_routine` + `strength_session_items`. Pas de changement de code applicatif — seulement une mise à jour du test mock qui codait l'id=24 en dur.

**Tech Stack:** PostgreSQL (Supabase), migration via MCP `mcp__plugin_supabase_supabase__apply_migration`, node:test

---

### Task 1 : Baseline tests

**Files:**
- Run: `npm test` (suite complète)

**Step 1 : Vérifier que les tests passent avant toute modification**

```bash
npm test 2>&1 | tail -20
```
Expected: suite verte. Noter le nombre de tests passing.

---

### Task 2 : Créer la migration 00221

**Files:**
- Create: `supabase/migrations/00221_mobilisation_epaules_3axes.sql`

**Step 1 : Écrire le fichier SQL**

```sql
-- §360 — Mobilisation épaules 3 axes (nageur)
-- Remplace Y-T-W épaules (id=24) dans la routine d'échauffement commune
-- et dans toutes les séances générées (strength_session_items).
-- Les strength_set_logs (historique réel) sont intentionnellement conservés.

DO $$
DECLARE
  new_id INTEGER;
BEGIN
  INSERT INTO dim_exercices (
    nom_exercice,
    description,
    exercise_type,
    exercise_subtype,
    bucket,
    corrective_axes,
    is_bodyweight,
    intensity_metric,
    level,
    is_core,
    supports_unilateral,
    nb_series_endurance,  nb_reps_endurance,
    nb_series_hypertrophie, nb_reps_hypertrophie,
    nb_series_force,      nb_reps_force,
    pourcentage_charge_1rm_endurance,
    pourcentage_charge_1rm_hypertrophie,
    pourcentage_charge_1rm_force,
    recup_series_endurance,    recup_exercices_endurance,
    recup_series_hypertrophie, recup_exercices_hypertrophie,
    recup_series_force,        recup_exercices_force,
    selection_priority,
    warmup_reps,
    warmup_duration
  ) VALUES (
    'Mobilisation épaules 3 axes (nageur)',
    'Échauffement épaule spécifique natation — 3 phases enchaînées à vide, coudes à 90° : '
    '(1) extension en position flèche ×5 reps, '
    '(2) rotation avant-bras parallèles au sol paume vers bas ×5 reps, '
    '(3) adduction coudes vers le corps par pivotement sur le 3ᵉ axe ×5 reps.',
    'strength',
    'prehab',
    'mobility',
    ARRAY['shoulder_flexion', 'shoulder_rotation'],
    false,
    'weight_kg',
    'beginner',
    false,
    false,
    2, 15,
    2, 15,
    2, 15,
    0, 0, 0,
    45,  90,
    60, 120,
    75, 150,
    0,
    15,
    null
  )
  RETURNING id INTO new_id;

  -- Bloc 1 warm-up : remplace YTW (ordre=3)
  UPDATE warmup_common_routine
  SET exercise_id = new_id
  WHERE exercise_id = 24;

  -- Séances générées existantes (18 strength_session_items)
  UPDATE strength_session_items
  SET exercise_id = new_id
  WHERE exercise_id = 24;
END $$;
```

**Step 2 : Vérifier que le fichier existe**

```bash
ls supabase/migrations/00221_mobilisation_epaules_3axes.sql
```

---

### Task 3 : Appliquer la migration via MCP

**Step 1 : Appliquer**

Utiliser l'outil MCP `mcp__plugin_supabase_supabase__apply_migration` avec :
- `project_id`: `fscnobivsgornxdwqwlk`
- `name`: `mobilisation_epaules_3axes`
- Contenu du fichier SQL ci-dessus

**Step 2 : Récupérer le nouvel id**

```sql
SELECT id, nom_exercice FROM dim_exercices
WHERE nom_exercice = 'Mobilisation épaules 3 axes (nageur)';
```

Via : `supabase db query --linked "SELECT id FROM dim_exercices WHERE nom_exercice = 'Mobilisation épaules 3 axes (nageur)';"`

Retenir cet `id` — il sera noté `NEW_ID` pour la suite.

**Step 3 : Vérifier la routine**

```sql
SELECT wcr.ordre, wcr.exercise_id, e.nom_exercice
FROM warmup_common_routine wcr
JOIN dim_exercices e ON e.id = wcr.exercise_id
ORDER BY wcr.ordre;
```

Expected : ordre=3 affiche `Mobilisation épaules 3 axes (nageur)` (plus Y-T-W).

**Step 4 : Vérifier strength_session_items**

```sql
SELECT count(*) FROM strength_session_items WHERE exercise_id = 24;
```

Expected : `0` (toutes les 18 lignes ont été migrées).

---

### Task 4 : Mettre à jour le test mock

**Files:**
- Modify: `src/lib/api/__tests__/strength-warmup.test.ts:80,89`

Le test mockait l'id=24 en dur. Remplacer par `NEW_ID` (obtenu à la Task 3).

**Step 1 : Modifier les deux lignes**

Ligne 80 : `{ exercise_id: 24, ordre: 3 }` → `{ exercise_id: NEW_ID, ordre: 3 }`
Ligne 89 : `assert.deepEqual(ids, [87, 84, 24])` → `assert.deepEqual(ids, [87, 84, NEW_ID])`

**Step 2 : Lancer uniquement ce test**

```bash
node --test src/lib/api/__tests__/strength-warmup.test.ts 2>&1 | tail -15
```

Expected: 5/5 tests passing.

**Step 3 : Suite complète**

```bash
npm test 2>&1 | tail -20
```

Expected: même nombre de tests passing qu'au baseline.

---

### Task 5 : Mettre à jour la documentation

**Files:**
- Modify: `docs/implementation-log.md` (ajouter §360)
- Modify: `docs/ROADMAP.md` (ajouter ligne §360)
- Modify: `docs/FEATURES_STATUS.md` (si warm-up est tracké)
- Modify: `CLAUDE.md` (ligne "Dernier § livré")
- Modify: `docs/claude/files-map.md` (aucun nouveau fichier ≥150 LOC → pas de nouvelle ligne, vérifier si migration change la taille d'un fichier existant tracké)

**Step 1 : Entrée implementation-log.md**

Ajouter en tête (après l'en-tête du dernier §) :

```
## §360 — Mobilisation épaules 3 axes (nageur) — remplacement YTW échauffement

**Contexte** : Le Y-T-W épaules (id=24) était utilisé comme exercice d'échauffement articulaire dans
la routine commune (Bloc 1). Le coach/nageur François Wagner a demandé son remplacement par un exercice
spécifique natation : mobilisation épaule 3 axes enchaînés à vide, coudes à 90°.

**Changements** :
- `supabase/migrations/00221_mobilisation_epaules_3axes.sql` — INSERT + UPDATE atomique (DO block)
- `src/lib/api/__tests__/strength-warmup.test.ts` — mise à jour mock id 24 → NEW_ID

**Tables modifiées** :
- `dim_exercices` : +1 exercice (id=NEW_ID)
- `warmup_common_routine` : ordre=3 → NEW_ID (était 24)
- `strength_session_items` : 18 lignes exercise_id 24 → NEW_ID
- `strength_set_logs` : intentionnellement conservés (historique réel)

**Tests** : suite node:test verte (pas de nouveau test — mock mis à jour)

**Décisions** : YTW conservé dans le catalogue (non supprimé, non déprioritisé) ;
strength_set_logs non migrés (performances passées réelles).
```

**Step 2 : Mettre à jour CLAUDE.md**

Ligne "Dernier § livré" → `§360 — remplacement YTW par Mobilisation épaules 3 axes (nageur) en échauffement`

---

### Task 6 : Commit

**Step 1 : Stager les fichiers**

```bash
git add supabase/migrations/00221_mobilisation_epaules_3axes.sql \
        src/lib/api/__tests__/strength-warmup.test.ts \
        docs/implementation-log.md \
        docs/ROADMAP.md \
        CLAUDE.md \
        docs/plans/2026-06-01-mobilisation-epaules-3axes.md \
        docs/plans/2026-06-01-mobilisation-epaules-3axes-design.md
```

**Step 2 : Commit**

```bash
git commit -m "$(cat <<'EOF'
feat(§360): remplace YTW par Mobilisation épaules 3 axes (nageur) en échauffement

Migration 00221 : INSERT nouvel exercice + UPDATE warmup_common_routine (ordre=3)
+ UPDATE 18 strength_session_items. YTW conservé dans le catalogue.
strength_set_logs (historique réel) intentionnellement conservés.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

**Step 3 : Vérifier**

```bash
git log --oneline -3
```
