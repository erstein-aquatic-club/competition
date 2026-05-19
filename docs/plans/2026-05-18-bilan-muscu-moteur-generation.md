# Moteur de génération du mésocycle (Chantiers C + D) — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Livrer le moteur déterministe qui transforme une évaluation Bilan Muscu en mésocycle de musculation périodisé, et son intégration de bout en bout — le nageur génère son plan en autonomie, le coach garde visibilité et contrôle.

**Architecture:** Moteur de règles pur en TS (`mesocycleEngine.ts`, testé unitairement) → RPC transactionnelles qui matérialisent le mésocycle sur la timeline `strength_planning_*` existante avec snapshot/revert → UI nageur (génération + aperçu) et intégration coach (notification, visibilité, revert). Pas de LLM.

**Tech Stack:** TypeScript (moteur pur, `node:test`), Supabase (Postgres, migrations + RPC via MCP, RLS), React 19 + Tailwind (UI), tests RLS d'intégration (Docker).

**Design de référence:** `docs/plans/2026-05-18-bilan-muscu-moteur-generation-design.md` — **à lire avant de commencer**. Design global : `docs/plans/2026-05-17-bilan-muscu-mesocycle-design.md`.

---

## Contexte & conventions (lire avant tout)

- **Migrations** : fichier SQL dans `supabase/migrations/` + appliqué via le MCP Supabase (`mcp__plugin_supabase_supabase__apply_migration`, projet `fscnobivsgornxdwqwlk`). Dernière migration : `00169`. Numéros ci-dessous (`00170`+) indicatifs.
- **RLS** : helpers `app_user_id()` / `app_user_role()`. Tests RLS requis dès qu'une policy/table sous RLS ou une RPC sur tables RLS change (cf. CLAUDE.md). Vérifier Docker (`docker ps`) 1× ; si éteint, demander à l'utilisateur.
- **Tests unitaires** : `node --test --experimental-test-module-mocks --import tsx <chemin>`. TDD pour tout le moteur (Phase 2).
- **UI** : toute UI passe par le skill `/frontend-design` (règle projet — obligatoire).
- **`@/` alias** = `src/`.
- **Branche** : `main` (convention projet).
- **Points de validation** : Task 1.1 (barème de puissance) produit un artefact **à valider par l'utilisateur** avant encodage.
- **Workflow doc** : entrées `implementation-log.md` au fil de l'eau, mise à jour ROADMAP/FEATURES_STATUS/CLAUDE.md/files-map à la clôture (cf. CLAUDE.md).
- **Exécution** : chantier transverse → équipe d'agents recommandée (cf. design § 9).

---

# Phase 1 — KPI détente verticale → mesure de puissance

### Task 1.1 : Recherche + barème de puissance `vertical_jump` — **ARTEFACT À VALIDER**

**Files:** Create `docs/plans/bilan-muscu-barème-puissance-detente.md` (note de recherche).

**Step 1 — Recherche.** Via `WebSearch`/`WebFetch`, sourcer des normes de *peak power* du saut vertical (countermovement jump, équation de Sayers `P = 60.7·h_cm + 45.3·m_kg − 2055`) par sexe et bande d'âge natation (13-14 / 15-16 / 17-18, alignées sur `kpiBaremes.ts` §290).

**Step 2 — Rédiger la note** : pour `vertical_jump` × sexe × bande, les points d'ancrage `[puissance_W, score]` proposés, avec source et flag de confiance (`solid`/`transposed`/`placeholder`).

**Step 3 — ⛔ POINT DE VALIDATION** : présenter la note à l'utilisateur. Ne pas continuer sans accord.

**Step 4 — Commit** : `git commit -m "docs(§293): barème de puissance détente verticale (sources)"`.

### Task 1.2 : Fonctions de calcul puissance (TDD)

**Files:** Create `src/lib/strength/jumpPower.ts` ; Test `src/lib/strength/__tests__/jumpPower.test.ts`.

**Step 1 — Test d'abord.** `flightTimeToHeight(t)` → `h = 9.81·t²/8` en cm ; `sayersPeakPower(heightCm, weightKg)` → `60.7·h + 45.3·m − 2055` en W. Cas : `flightTimeToHeight(0.5)` ≈ 30.7 cm ; `sayersPeakPower(40, 70)` = 60.7·40+45.3·70−2055 = 3542 W ; bornes (temps de vol ≤ 0 → throw).

**Step 2** — Lancer, vérifier l'échec. **Step 3** — Implémenter les 2 fonctions pures. **Step 4** — Lancer, vérifier le succès.

**Step 5 — Commit** : `feat(§293): calcul hauteur+puissance détente (flight time, Sayers)`.

### Task 1.3 : Protocole `kpiProtocols.ts` révisé

**Files:** Modify `src/lib/strength/kpiProtocols.ts`.

**Step 1** — Lire le fichier. Réécrire la fiche-protocole `vertical_jump` : saisie du **poids**, 3 sauts stricts (flexion → saut **jambes tendues**, sans tuck), **binôme chronométreur** du temps de vol, meilleur des 3. Mettre à jour le libellé/l'unité (puissance).

**Step 2** — `npx tsc --noEmit` → exit 0. **Step 3 — Commit** : `feat(§293): protocole détente verticale en temps de vol`.

### Task 1.4 : Barème `kpiBaremes.ts` — encoder la puissance validée

**Files:** Modify `src/lib/strength/kpiBaremes.ts` + son test.

**Step 1** — Remplacer le barème `vertical_jump` (ancres hauteur cm → ancres **puissance W**, valeurs validées en Task 1.1), mettre à jour le flag de confiance. **Step 2** — Adapter le test structurel de `kpiBaremes.test.ts` si une assertion fige l'unité/les bornes. **Step 3** — Lancer les tests → vert ; `tsc` → exit 0.

**Step 4 — Commit** : `feat(§293): barème de puissance détente verticale`.

### Task 1.5 : Wizard KPI — saisie poids + chronométrage du temps de vol

**Files:** Modify l'écran du wizard KPI (Chantier B) + le stockage `strength_kpi_measurements`.

**Step 1 — Explorer.** Localiser l'écran wizard KPI et le code d'enregistrement d'une mesure (`grep -rn "kpi_measurement\|strength_kpi" src/`). Identifier comment une mesure `vertical_jump` est saisie/stockée aujourd'hui.

**Step 2 — UI** (via `/frontend-design`) : pour `vertical_jump`, ajouter un champ **poids (kg)** et un **module de chronométrage du temps de vol** sur 3 essais (saisie ou chrono). Calculer la puissance via `jumpPower.ts` (Task 1.2).

**Step 3 — Stockage** : la mesure `vertical_jump` enregistre `value` = puissance (W), `unit` = `W`, et `attempts` (jsonb) = `{ weight_kg, flight_times: [t1,t2,t3] }`.

**Step 4** — Vérifier (`npm test`, `tsc`). **Step 5 — Commit** : `feat(§293): wizard détente verticale — poids + temps de vol`.

---

# Phase 2 — Moteur `mesocycleEngine.ts` (TDD)

### Task 2.0 : Types du moteur + exploration des entrées

**Files:** Create `src/lib/strength/mesocycleEngine.types.ts`.

**Step 1 — Explorer** les types livrés par le Chantier B : `grep -rn "strength_assessments\|StrengthAssessment\|physical_tests\|questionnaire" src/lib/api/types.ts` — relever la forme de l'évaluation, des mesures KPI, du `physical_tests` jsonb, du questionnaire.

**Step 2 — Définir les types** : `BucketScore` (6 seaux 0-100), `BucketPriority`, `MesocycleWeek`, `MesocycleSession`, `MesocycleExercise` (exercice + sets/reps/charge), `GeneratedMesocycle` (semaines + snapshot du raisonnement + `data_confidence`). Ce type `GeneratedMesocycle` est l'**interface commune** du chantier — le figer ici.

**Step 3** — `tsc` → exit 0. **Commit** : `feat(§293): types de l'objet mésocycle`.

### Task 2.1 : `scoreBuckets` (TDD)

**Files:** Create `src/lib/strength/mesocycleEngine.ts` ; Test `src/lib/strength/__tests__/mesocycleEngine.test.ts`.

**Step 1 — Test d'abord.** `scoreBuckets(assessment, kpiMeasurements, athlete)` → `Record<bucket, number>` 0-100 sur les **6 seaux**. `lower_strength` ← `imtp` ; `lower_power` ← moyenne(`vertical_jump`,`broad_jump`) ; `upper_strength` ← `weighted_pullup` ; `upper_power` ← `medball_vertical_throw` (chacun via `getBareme`/`kpiScore` de `kpiBaremes`) ; `mobility` ← `physical_tests` ; `psychology` ← questionnaire. Tester : KPI présents → scores attendus ; KPI manquant → seau à `null`/score conservateur + `data_confidence` abaissé.

**Step 2-4** — Échec → implémenter → succès. **Step 5 — Commit** : `feat(§293): scoreBuckets — scoring des 6 seaux`.

### Task 2.2 : `prioritizeBuckets` (TDD)

**Step 1 — Test.** `prioritizeBuckets(bucketScores, template, painReports, physicalTests)` → seaux ordonnés par priorité décroissante. Priorité = `bucket_emphasis × (100 − score)`. Tester : un seau faible+sollicité passe devant un seau faible+non sollicité ; un seau fort descend. **Override sécurité** : douleur intense ou dysfonction → `mobility`/correctif forcé priorité 1 (test dédié).

**Step 2-4** — TDD. **Step 5 — Commit** : `feat(§293): prioritizeBuckets — score combiné + override sécurité`.

### Task 2.3 : `allocateVolume` (TDD)

**Step 1 — Test.** `allocateVolume(priorities, sessionsPerWeek)` → répartition du volume hebdo sur les **5 seaux entraînables** : 2 prioritaires = focus (~60 %), reste = maintien (~40 %), `mobility` en échauffement. `psychology` → pas de volume mais un flag si score bas. Tester plusieurs `sessionsPerWeek` (2 à 5).

**Step 2-4** — TDD. **Step 5 — Commit** : `feat(§293): allocateVolume — répartition du volume par seau`.

### Task 2.4 : `selectExercises` (TDD)

**Step 1 — Explorer** la forme de `dim_exercices` taggé (`bucket`, `level`, `contraindication_zones`, `is_core`) — déjà connue (§291), confirmer via `src/lib/api/types.ts`.

**Step 2 — Test.** `selectExercises(allocations, exerciseCatalog, athleteLevel, painZones)` → exercices par seau, filtrés par `level`, **excluant** tout exercice dont `contraindication_zones` recoupe `painZones` (substitution par régression). Tester : zone de douleur → exercice exclu/substitué.

**Step 3-5** — TDD → **Commit** : `feat(§293): selectExercises — sélection filtrée par douleur`.

### Task 2.5 : `periodize` (TDD)

**Step 1 — Test.** `periodize(template, targetWeekCount)` → liste de semaines `{ cycle }` : distribue les phases du template (`min/nominal/max_weeks`) pour atteindre `targetWeekCount` (part du `nominal`, répartit le delta dans les bornes). Tester : `targetWeekCount = Σnominal` → chaque phase à son nominal ; cible plus longue/courte → phases étirées/comprimées dans `[min,max]` ; cible hors `[Σmin, Σmax]` → throw. Le chargement par cycle vient de `PERIODIZATION_CYCLES` (`periodizationCycles.ts`).

**Step 2-4** — TDD. **Step 5 — Commit** : `feat(§293): periodize — distribution des phases sur la durée cible`.

### Task 2.6 : `generateMesocycle` — orchestrateur (TDD)

**Step 1 — Test.** `generateMesocycle(input)` enchaîne `scoreBuckets → prioritizeBuckets → allocateVolume → selectExercises → periodize` → `GeneratedMesocycle` complet (semaines → séances → exercices chargés + snapshot du raisonnement + `data_confidence`). Tester un cas nominal de bout en bout + un cas données partielles (ne bloque pas).

**Step 2-4** — TDD. **Step 5 — Commit** : `feat(§293): generateMesocycle — orchestrateur du moteur`.

---

# Phase 3 — Tables & RLS

### Task 3.1 : Migration — `strength_mesocycles` + `strength_planning_snapshots`

**Files:** Create `supabase/migrations/00170_strength_mesocycles.sql`.

**Step 1 — Écrire** les 2 tables (cf. design § 6) : `strength_mesocycles` (`athlete_id`, `assessment_id`, `template_id`, `event_group`, `kind`, `target_week_count`, `sessions_per_week`, `status`, `bucket_priorities` jsonb, `engine_version`, `generated_at/_by`) ; `strength_planning_snapshots` (`mesocycle_id`, `athlete_id`, `slot_overrides` jsonb, `week_overrides` jsonb, `created_at`). RLS sur les deux : nageur lit/écrit les siens (`app_user_id()`), coach lit ceux de ses nageurs, admin complet. Triggers `updated_at` au besoin.

**Step 2 — Appliquer** via MCP. **Step 3 — Vérifier** via `list_tables`. **Step 4 — Commit** : `feat(§293): tables strength_mesocycles + snapshots (RLS)`.

### Task 3.2 : Types TS + schéma de test RLS

**Files:** Modify `src/lib/api/types.ts`, `supabase/tests/schema.sql` ; Create `supabase/tests/rls/strength-mesocycles.test.ts`.

**Step 1** — Interfaces TS des 2 tables. **Step 2** — Reporter les 2 tables + RLS dans `schema.sql`. **Step 3** — Test RLS : nageur lit/écrit les siens, ne voit pas ceux d'un autre ; coach lit ceux de ses nageurs. **Step 4** — Docker + `npm run test:rls` → vert (hors échecs pré-existants connus). **Step 5 — Commit** : `test(§293): types + tests RLS strength_mesocycles`.

---

# Phase 4 — Persistance & RPC

### Task 4.1 : Explorer la timeline `strength_planning_*` + définir le mapping

**Files:** Create `docs/plans/bilan-muscu-mapping-mesocycle-planning.md` (note technique).

**Step 1 — Explorer** : structure de `strength_planning_slots` / `strength_planning_slot_overrides` / `strength_planning_week_*`, et la représentation des séances/exercices produite par le builder muscu coach (`grep`/`Read` sur les composants de planif muscu et `src/lib/api/*`).

**Step 2 — Rédiger** la note : comment un `GeneratedMesocycle` (semaines → séances → exercices) se matérialise en lignes `strength_planning_slot_overrides`. **Step 3 — Commit** la note.

### Task 4.2 : RPC `apply_strength_mesocycle`

**Files:** Create `supabase/migrations/00171_apply_strength_mesocycle.sql`.

**Step 1 — Écrire** la fonction `apply_strength_mesocycle` (SECURITY DEFINER, transactionnelle) : vérifie `app_user_id() = athlete_id` ; snapshot des overrides existants → `strength_planning_snapshots` ; `INSERT strength_mesocycles` ; matérialise les overrides (mapping Task 4.1) ; `INSERT` notification coach. Paramètre d'entrée : le mésocycle sérialisé + métadonnées.

**Step 2 — Appliquer** via MCP. **Step 3 — Vérifier** (appel de test via `execute_sql`). **Step 4 — Commit** : `feat(§293): RPC apply_strength_mesocycle`.

### Task 4.3 : RPC `revert_strength_mesocycle`

**Files:** Create `supabase/migrations/00172_revert_strength_mesocycle.sql`.

**Step 1 — Écrire** `revert_strength_mesocycle` : restaure le snapshot, marque le mésocycle `reverted`. Autorisé au coach du nageur **ou** au nageur lui-même. **Step 2 — Appliquer + vérifier. Step 3 — Commit** : `feat(§293): RPC revert_strength_mesocycle`.

### Task 4.4 : Tests RLS d'intégration des RPC

**Files:** Modify `supabase/tests/schema.sql` (ajout des RPC + tables planning si absentes) ; Create `supabase/tests/rls/strength-mesocycle-rpc.test.ts`.

**Step 1** — Tests : un nageur applique pour lui-même ✅ ; pour un autre ❌ ; revert par le coach ✅ ; snapshot bien créé/restauré. **Step 2** — `npm run test:rls` → vert. **Step 3 — Commit** : `test(§293): tests RLS des RPC mésocycle`.

### Task 4.5 : Wrappers API JS

**Files:** Modify/Create dans `src/lib/api/` (module `strength` ou nouveau module mésocycle).

**Step 1 — Explorer** le module API muscu existant. **Step 2** — Wrappers : `generateMesocyclePreview` (appelle le moteur pur, pas d'I/O), `applyMesocycle` (→ RPC), `revertMesocycle` (→ RPC), `getMesocycle`. **Step 3** — `tsc` + `npm test`. **Step 4 — Commit** : `feat(§293): wrappers API mésocycle`.

---

# Phase 5 — UI nageur (génération + aperçu)

### Task 5.1 : Explorer le module muscu nageur + la feature compétitions

**Step 1** — `Read`/`grep` : `src/pages/Strength.tsx`, `useStrengthState`, la timeline muscu nageur, et la feature **compétitions** (où sont les échéances à venir, comment calculer les semaines restantes — cf. `CoachCompetitionsScreen.tsx` qui calcule déjà un `weeks`). Noter les hooks/API réutilisables. Pas de commit (exploration).

### Task 5.2 : Écran de génération — épreuve / famille / durée + échéances

**Files:** Create le(s) composant(s) d'écran sous `src/pages/` ou `src/components/strength/`.

**Step 1 — `/frontend-design`** : concevoir l'écran. Sélection épreuve (`event_group`) + famille (`season`/`inter_competition`) ; sélecteur de **durée cible** bornée à `[min_week_count, max_week_count]` du template ; **liste des prochaines échéances** + nb de semaines jusqu'à chacune ; mise en évidence des durées qui alignent le `pic` sur une échéance ; `sessions_per_week` relue de l'évaluation, ajustable.

**Step 2** — Brancher sur les wrappers API + le catalogue de templates. **Step 3** — Vérifs. **Step 4 — Commit** : `feat(§293): écran nageur de génération de mésocycle`.

### Task 5.3 : Écran d'aperçu — plan + raisonnement des seaux

**Step 1 — `/frontend-design`** : aperçu du `GeneratedMesocycle` (semaines → cycles → séances) **+** le raisonnement (6 scores de seau, priorités, `data_confidence`, le « pourquoi »). Bouton **Confirmer**.

**Step 2** — `generateMesocyclePreview` au rendu ; **Confirmer** → `applyMesocycle`. **Step 3** — Vérifs. **Step 4 — Commit** : `feat(§293): écran d'aperçu du mésocycle`.

### Task 5.4 : Parcours complet nageur

**Step 1** — Brancher le point d'entrée dans `Strength.tsx` (actif si évaluation complétée) → génération → aperçu → confirmation → mésocycle visible sur la timeline muscu. **Step 2** — Test e2e manuel décrit. **Step 3 — Commit** : `feat(§293): parcours nageur génération → timeline`.

---

# Phase 6 — Intégration coach

### Task 6.1 : Visibilité coach du mésocycle généré

**Step 1 — Explorer** la vue planif muscu coach. **Step 2 — `/frontend-design`** : afficher, sur la planif d'un nageur, le mésocycle généré + le **raisonnement des seaux** (auditable). **Step 3** — Commit : `feat(§293): visibilité coach du mésocycle`.

### Task 6.2 : Notification + action revert coach

**Step 1** — Vérifier la notification créée par la RPC `apply` (Task 4.2) s'affiche bien côté coach. **Step 2 — `/frontend-design`** : action **Rejeter le mésocycle** → `revertMesocycle`. L'édition séance par séance réutilise le **builder existant** (rien à créer). **Step 3** — Vérifs. **Step 4 — Commit** : `feat(§293): notification + revert coach`.

---

# Phase 7 — Clôture

### Task 7.1 : Vérification & documentation

**Step 1** — `npm test` vert · `npx tsc --noEmit` exit 0 · `npm run build` succès · `npm run test:rls` vert (hors échecs connus).
**Step 2** — Documentation (workflow CLAUDE.md) : entrées `implementation-log.md` (§293), `ROADMAP.md` (+ `*Dernière mise à jour*`), `FEATURES_STATUS.md` (Bilan Muscu → moteur livré), `CLAUDE.md` (« Dernier § livré » + nouveaux hubs : `mesocycleEngine.ts`, écrans de génération), `docs/claude/files-map.md` (nouveaux fichiers ≥ 150 lignes mesurés via `wc -l`).
**Step 3 — Commit** : `docs(§293): clôture moteur de génération du mésocycle`.

---

## Notes d'exécution

- **Ordre** : Phases 1→7 séquentielles. À l'intérieur : Phase 2 (moteur pur) parallélisable avec Phase 1 ; Phase 3 indépendante ; Phases 4→6 dépendent de 2+3.
- **Numéros de migration** : `00170`+ — prendre le prochain libre au moment d'appliquer.
- **Le `GeneratedMesocycle`** (Task 2.0) est l'interface-pivot : le figer tôt, tout le reste s'y branche.
- **Hors scope** (→ Chantier E) : boucle de suivi / réévaluation en fin de mésocycle.
- **§ numéro** : ce chantier ouvre `§293` (le §292 a clos le Chantier A).
