# Prompt d'audit autoporté — Bilan Muscu §293 (Chantiers C + D + ajustements)

> **Usage** : copier-coller en intégralité dans une nouvelle session Claude Code
> en tant que premier message. Pas de contexte préalable supposé.

---

Tu es un ingénieur d'audit logiciel. Tu interviens sur le projet **Suivi Natation V2 / Erstein Aquatic Club** (`/Users/francoiswagner/Antigravity/Project-EAC/competition`, branche `main`).

Ton mandat : **auditer en profondeur la robustesse du flux Bilan Muscu → Mésocycle** livré par le §293 (Chantiers C « Moteur » + D « Intégration » + ajustements vagues A/B/C + fixes UX), et produire un rapport actionnable.

Tu ne fais **aucune modification de code** sauf si on te le demande explicitement. Tu lis, tu vérifies, tu rapportes.

## 1. Contexte projet à charger (5 min)

Lis ces fichiers dans cet ordre — c'est ta carte mentale :

1. `CLAUDE.md` — conventions du projet (règles agents, économie tokens, RLS, déploiement)
2. `docs/implementation-log.md` § **§293** — l'historique détaillé de ce qu'on a livré
3. `docs/bilan-muscu-guide-utilisateurs.md` — la vue utilisateur du flux (sans jargon)
4. `docs/plans/2026-05-18-bilan-muscu-moteur-generation-design.md` — le design du moteur
5. `docs/plans/bilan-muscu-mapping-mesocycle-planning.md` — le mapping mésocycle → DB

**Conventions critiques à respecter pendant l'audit** :
- Stack : React 19 + TS + Vite + Tailwind 4 + shadcn/ui + Wouter (hash routing) + Supabase
- RLS : helpers `app_user_id()` / `app_user_role()`, **jamais** `auth.uid()` directement
- Migrations : numéros `00170`-`00176` pour le §293
- Tests RLS d'intégration : `npm run test:rls` (Docker requis — `docker ps` 1× max par session)
- Project ID Supabase : `fscnobivsgornxdwqwlk` (MCP plugin disponible)

## 2. Périmètre de l'audit

### 2.1 Couche données (DB)

- **Migrations §293** : `00170` (tables) · `00171` (RLS coach club-entier) · `00172` (RPC apply) · `00173` (RPC revert) · `00174` (re-tag is_core) · `00175` (template sprint_50 saison McEvoy-aligned) · `00176` (template sprint_50 mini-prépa).
- Tables : `strength_mesocycles`, `strength_planning_snapshots`.
- Tables consommées : `strength_planning_slot_overrides`, `strength_planning_week_overrides`, `strength_sessions`, `strength_session_items`, `dim_exercices`, `notifications`, `notification_targets`, `group_members`, `user_profiles`, `strength_assessments`, `strength_kpi_measurements`, `strength_periodization_templates`.

### 2.2 Moteur TS pur

- `src/lib/strength/mesocycleEngine.ts` (~900 l.) — 6 fonctions pures : `scoreBuckets`, `prioritizeBuckets`, `allocateVolume`, `selectExercises`, `periodize`, `generateMesocycle`. **Vague C** : sessions multi-bucket (primary + complement) via `distributeSessionSlots` + `buildSession`.
- `src/lib/strength/mesocycleEngine.types.ts` — interface-pivot `GeneratedMesocycle` + `CatalogExercise` + `MesocycleExercise` (avec `illustrationGif` ajouté).
- `src/lib/strength/jumpPower.ts` — calculs détente verticale Sayers + W/kg.
- `src/lib/strength/kpiBaremes.ts` — barèmes 5 KPIs × 2 sexes × 3 bandes d'âge.
- `src/lib/strength/periodizationCycles.ts` — chargement par cycle (catalogue / generique).
- Tests : `src/lib/strength/__tests__/mesocycleEngine.test.ts` (51 tests TDD).

### 2.3 Wrappers API

- `src/lib/api/strength-mesocycles.ts` — `generateMesocyclePreview`, `applyMesocycle`, `revertMesocycle`, `getMesocycle`, `getActiveMesocycle`, `listMesocycles`, `getMesocycleSessionsContent`.
- `src/lib/api/strength-periodization-templates.ts` — list/get templates.
- `src/lib/api/strength-catalog.ts` — projection taggée de `dim_exercices`.
- Tests : `src/lib/api/__tests__/strength-mesocycles.test.ts` (12 tests).

### 2.4 RLS / RPC

- Tests RLS intégration : `supabase/tests/rls/strength-mesocycles.test.ts` (13 tests table) + `strength-mesocycle-rpc.test.ts` (12 tests RPC).
- Schéma de test : `supabase/tests/schema.sql` (les RPC y sont recopiées en miroir).

### 2.5 UI

- `src/pages/MesocycleGeneration.tsx` (~830 l.) — écran nageur de génération.
- `src/pages/MesocyclePreview.tsx` (~1100 l.) — écran nageur d'aperçu.
- `src/components/strength/MesocycleEntry.tsx` — tuile d'entrée sur `/strength`.
- `src/components/strength/ExerciseGifLightbox.tsx` — thumbnail + viewer fullscreen.
- `src/components/coach/CoachMesocyclePanel.tsx` (~870 l.) — panneau coach (visibilité + raisonnement + plan détaillé + revert).
- Wiring : `src/App.tsx` (routes), `src/pages/Strength.tsx` (tuile), `src/pages/coach/CoachSwimmerFullView.tsx` (CollapsibleSection).
- Fix UI Profile : `src/pages/Profile.tsx` (champ Sexe, ToggleGroup M/F).

## 3. Axes d'audit

Pour chaque axe, **exécute des vérifs concrètes** (lecture code, commandes, requêtes SQL via MCP) plutôt que de spéculer. Si tu ne peux pas vérifier, écris-le clairement dans le rapport.

### 3.1 Sécurité / RLS

- [ ] Les 2 RPC `apply_strength_mesocycle` et `revert_strength_mesocycle` sont `SECURITY DEFINER` ET vérifient l'identité de l'appelant (`app_user_id()` ou `app_user_role()`).
- [ ] Un nageur ne peut PAS appliquer un mésocycle pour un autre nageur.
- [ ] Un coach peut appliquer / revert pour n'importe quel nageur (club-entier, RLS de 00171).
- [ ] Le scope coach des tables `strength_mesocycles` + `strength_planning_snapshots` est cohérent avec `strength_assessments` (calqué club-wide depuis 00171).
- [ ] L'override sécurité (douleur intensité ≥ 3 OU sub-score `physical_tests` = 0) force `mobility` rang 1 dans `prioritizeBuckets`. Vérifie le test correspondant et reproduit-le mentalement.
- [ ] Les contre-indications (`contraindication_zones` ∩ `painZones`) excluent bien les exercices contre-indiqués dans `selectExercises`. **Attention** : la DB utilise des zones granulaires (`left_shoulder`, `right_shoulder`, `lower_back`) — vérifier que ça matche les zones du questionnaire `pain` (intensity 1-3).

### 3.2 Idempotence / robustesse transactionnelle

- [ ] La RPC `apply_strength_mesocycle` est entièrement transactionnelle : si une étape échoue, ROLLBACK total ?
- [ ] La RPC `apply_strength_mesocycle` supersede correctement les mésocycles `active` précédents (1 seul `active` par athlète à la fois).
- [ ] Le snapshot des `strength_planning_slot_overrides` + `_week_overrides` est créé AVANT toute écriture.
- [ ] La RPC `revert_strength_mesocycle` restaure exactement l'état d'avant (snapshot bien rejoué — vérifier le test « snapshot pré-existant : revert restaure l'override d'avant »).
- [ ] La RPC `revert` refuse les mésocycles non-`active` (`superseded` / `reverted` → exception).
- [ ] Identification des templates créés par un mésocycle via `raw_payload->>'mesocycle_id'` — pas de FK formelle, est-ce robuste ?

### 3.3 Données partielles tolérées

- [ ] Si aucune mesure KPI : le moteur ne throw pas, génère quand même avec `dataConfidence='low'`.
- [ ] Si `physical_tests` null : `mobility` score = null, traité comme 0 dans la priorité (donc priorité max — conservateur).
- [ ] Si `questionnaire` null : `psychology` score = null, `psychFlag` reste false.
- [ ] Si pas de groupe pour le nageur (`group_members` vide) : la RPC apply tombe sur le fallback notif target_user (au lieu de target_group). Vérifier que ce fallback existe et fonctionne.

### 3.4 Cohérence catalogue ↔ moteur ↔ DB

- [ ] **PIÈGE CONNU** : `dim_exercices` a des colonnes en `nb_series_endurance` / `pourcentage_charge_1rm_endurance` / `recup_series_endurance` (lowercase, suffix complet). Une SELECT avec les noms hérités du type TS legacy (`Nb_series_endurance` / `pct_1rm_endurance` / `recup_endurance`) plantait silencieusement et renvoyait des sessions vides. Vérifier que `src/lib/api/strength-catalog.ts` utilise les BONS noms. Vérifier le SELECT dans `getMesocycleSessionsContent` aussi.
- [ ] Le tag `is_core` (re-balanced par mig 00174) sort bien les piliers en premier dans `selectExercises`. Compter `dim_exercices` par bucket × is_core et vérifier la cohérence avec ce que `selectExercises` priorise.
- [ ] Le `bucket_emphasis` du template `sprint_50 saison` (mig 00175) est cohérent avec la signature McEvoy de référence (`training_plans` id=2 dans la DB). Comparer les emphasis avec la répartition d'exercices observée dans le plan McEvoy par bucket.
- [ ] `getMesocycleSessionsContent` reconstruit fidèlement le mésocycle persisté (week_number, session_number, bucket, is_core, periodization_cycle, substituted, original_exercise_id, illustration_gif).

### 3.5 Logique du moteur (TDD)

- [ ] Tous les 51 tests passent : `node --test --experimental-test-module-mocks --import tsx src/lib/strength/__tests__/mesocycleEngine.test.ts`
- [ ] **Vague C** : chaque séance combine un primary + un complement bucket. Vérifier la heuristique `pickComplement` (focus#1 ↔ focus#2 ; maintien primary → top focus ; mobility override → null).
- [ ] L'ordre des `buckets[]` dans MesocycleSession : `[primary, complement?, 'mobility'?]` — invariant consommé par la RPC pour le nom du template.
- [ ] `periodize` distribue correctement les phases dans `[min, max]` (étire OU comprime selon la cible).
- [ ] Si target ∉ `[Σmin, Σmax]` : throw avec message clair.
- [ ] Sprint_50 saison McEvoy : pour target ~10-11 sem, on doit avoir la séquence reprise → force_max → PDC → puissance → maintien → affutage → pic.

### 3.6 UI / UX

- [ ] La tuile `MesocycleEntry` n'apparaît que si `assessment.status === 'completed'` et avec le bon variant (violet « action » vs neutre « régénérer »).
- [ ] L'écran de génération bloque la progression si une section précédente n'est pas remplie (disclosure progressive).
- [ ] Le sélecteur de durée du `MesocycleGeneration` montre les compétitions à venir + permet de snap sur celles dans la plage.
- [ ] Sur `/strength/mesocycle-preview` : raisonnement auditable + plan détaillé (toutes les semaines repliées par défaut, bouton Tout déplier dispo).
- [ ] Le viewer GIF (`ExerciseGifLightbox`) ouvre en fullscreen au tap, ferme au backdrop click + X.
- [ ] Le CTA « Confirmer » ne déborde plus sur mobile étroit.
- [ ] **Cas mort** : un nageur sans `sex` ou sans `birthdate` voit l'écran « Profil incomplet » (pas un crash). Le champ Sexe est éditable dans `Profile.tsx` (ToggleGroup M/F).
- [ ] **Cas mort** : catalogue vide ou en erreur → écran d'erreur explicite (pas de plan creux silencieux).
- [ ] Coach panel : voit le mésocycle actif + raisonnement parsé + plan détaillé fetché de la DB + bouton Rejeter avec confirmation. Les exercices ont leurs GIF thumbnails.
- [ ] L'historique compact des mésocycles `superseded`/`reverted` s'affiche.

### 3.7 Cohérence engine ↔ persistance ↔ relecture

- [ ] Le moteur produit un `GeneratedMesocycle` qui est sérialisé en JSON par `applyMesocycle` (camelCase → snake_case). Vérifier que le mapping n'a pas de trou (toutes les clés du `MesocycleExercise` sont propagées sauf celles non utiles côté DB).
- [ ] La RPC apply lit ce JSON et le persiste fidèlement.
- [ ] `getMesocycleSessionsContent` recompose les MêmeS données depuis la DB. Diff potentiel : `illustrationGif` n'est PAS stocké en `raw_payload` mais résolu via JOIN — c'est OK mais à vérifier.
- [ ] Le label `cycle_type` legacy (`endurance` / `force`) projette tous les cycles non-prepa_generale sur `force`. Le vrai `periodization_cycle` est conservé dans `raw_payload`. Vérifier que ça ne casse pas la lecture par le coach (qui voit le bon label) ni par le WorkoutRunner (qui consomme `cycle_type` legacy).

### 3.8 Performance / scalabilité

- [ ] Pour un mésocycle de 16 semaines × 5 séances × 6 exercices = 480 INSERT items dans la RPC. Acceptable ? Mesurer.
- [ ] `getMesocycleSessionsContent` JOIN sur `dim_exercices` × 480 lignes. Index sur `strength_session_items.session_id` existant ? Sur `raw_payload->>'mesocycle_id'` ?
- [ ] `MyPlanTab` consomme `getStrengthPlanningWeekOverrides` (introduit en §293). Coût supplémentaire vs avant ?
- [ ] L'UI MesocyclePreview : composition `MesocycleInput` + `generateMesocyclePreview` se font à chaque re-render. `useMemo` correctement câblé ?

### 3.9 Documentation à jour

- [ ] `CLAUDE.md` § « Dernier § livré » = §293
- [ ] `docs/ROADMAP.md` lead « Dernière mise à jour » = §293 résumé
- [ ] `docs/FEATURES_STATUS.md` : 3 lignes ✅ pour Génération autonome, Moteur, Vue coach
- [ ] `docs/claude/files-map.md` : 19 fichiers §293 listés avec taille mesurée
- [ ] `docs/implementation-log.md` : entrée §293 complète
- [ ] `docs/bilan-muscu-guide-utilisateurs.md` : à jour avec les vagues A/B/C ? **Probable décalage : ce guide ne mentionne pas l'ajustement McEvoy ni le multi-bucket vague C.**

## 4. Vérifs à exécuter (commandes exactes)

```bash
# 1. Type check global
npx tsc --noEmit

# 2. Tests unitaires (Vitest + node:test)
npm test

# 3. Build production
npm run build

# 4. Tests RLS d'intégration (Docker requis)
docker ps                            # 1× par session, vérifier Supabase containers up
npm run test:rls -- supabase/tests/rls/strength-mesocycles.test.ts supabase/tests/rls/strength-mesocycle-rpc.test.ts
```

Tu devrais obtenir : tsc exit 0 / 884+ tests verts / build OK / 25 RLS §293 verts.

**Si tu trouves un test rouge** : c'est une régression — investigue.

## 5. Vérifs DB via MCP (à exécuter via `mcp__plugin_supabase_supabase__execute_sql`)

```sql
-- 5.1 Tag is_core par bucket
SELECT bucket, COUNT(*) FILTER (WHERE is_core = true) AS core, COUNT(*) AS total
  FROM dim_exercices WHERE bucket IS NOT NULL GROUP BY bucket ORDER BY bucket;
-- Attendu : ~14 upper_strength core, ~3 lower_strength, ~5 lower_power, ~2 upper_power, ~2 mobility

-- 5.2 Templates sprint_50 (saison + mini-prépa)
SELECT name, kind, min_week_count, max_week_count, structure
  FROM strength_periodization_templates WHERE event_group = 'sprint_50';
-- Vérifier : saison = 8-16 sem, 7 phases, upper_strength 1.0 ; mini = 5-8 sem, 4 phases, upper_strength 0.95

-- 5.3 Existence des 2 RPC
SELECT proname, pg_get_function_arguments(oid)
  FROM pg_proc WHERE proname IN ('apply_strength_mesocycle', 'revert_strength_mesocycle');

-- 5.4 Profils incomplets (devrait être 0)
SELECT COUNT(*) FROM user_profiles WHERE sex IS NULL OR birthdate IS NULL;

-- 5.5 Catalog GIFs coverage
SELECT COUNT(*) FILTER (WHERE illustration_gif IS NOT NULL) AS with_gif,
       COUNT(*) AS total FROM dim_exercices WHERE bucket IS NOT NULL;
-- Attendu : ~83/94

-- 5.6 Vérif noms colonnes dim_exercices (PIÈGE)
SELECT column_name FROM information_schema.columns
 WHERE table_schema='public' AND table_name='dim_exercices'
   AND (column_name ILIKE '%series%' OR column_name ILIKE '%reps%' OR column_name ILIKE '%1rm%' OR column_name ILIKE '%recup%')
 ORDER BY column_name;
-- Confirmer : nb_series_*, pourcentage_charge_1rm_*, recup_series_* (lowercase)
```

## 6. Pièges connus rencontrés pendant le dev

1. **users.name vs users.display_name** : la prod a `display_name`, pas `name`. Les RPC `apply` / `revert` ont été corrigées (mig 00172/00173) après bug attrapé par les tests RLS.
2. **Noms colonnes dim_exercices** : `nb_series_*` / `pourcentage_charge_1rm_*` / `recup_series_*` (lowercase, suffix complet). Une SELECT avec les noms du type TS legacy (`Nb_series_`, `pct_1rm_`, `recup_`) plante silencieusement → catalog vide → sessions sans exercices. Fix dans commit `d28831157`.
3. **Sex absent dans Profile UI** : `user_profiles.sex` existait en DB (mig 00014) mais aucun champ dans `Profile.tsx`. 10/10 athlètes bloqués sur l'aperçu mésocycle avec « Profil incomplet ». Fix commit `e569745b8`.
4. **CTA overflow** sur mobile : « Modifier les paramètres » + « Confirmer & appliquer » débordait. Fix commit `91a072f39`.
5. **Vue trop chargée** : toutes les semaines dépliées par défaut → trop dense. Replié par défaut depuis commit `0e296f149`.
6. **Tractions sous-représentées en mini-prépa** : `upper_power 1.0` au lieu de `upper_strength 0.95` dans le template `sprint_50 inter_competition`. Fix mig 00176 (commit `a068eda14`).
7. **Tag is_core mal interprété** au §291 : utilisé pour « gainage » au lieu de « pilier de seau ». Fix mig 00174 (vague A McEvoy).
8. **Template `sprint_50 saison`** désaligné avec McEvoy. Fix mig 00175 (vague B).
9. **Sessions mono-bucket** : moteur produisait 1 séance = 1 bucket, alors que McEvoy fait du multi-bucket par séance. Fix engine vague C (commit `b8777c348`).

## 7. Livrable attendu

Un rapport markdown structuré comme suit, **sauvé dans `docs/audits/2026-XX-XX-audit-bilan-muscu-293.md`** (remplace XX-XX par la date du jour) :

```markdown
# Audit Bilan Muscu §293 — <date>

## Synthèse exécutive
- État global : 🟢 / 🟡 / 🔴
- N findings critiques : ?
- N findings mineurs : ?
- Recommandations prioritaires (max 3)

## Résultats par axe
### Sécurité / RLS — 🟢/🟡/🔴
- Constat précis (avec ligne de code / résultat de requête à l'appui)
- Findings
### Idempotence transactionnelle — …
### …

## Pièges vérifiés (du § 6 du prompt)
| Piège | Statut | Preuve |

## Trous documentaires
- Liste des incohérences entre code et docs

## Annexes
- Sortie de tsc / npm test / npm run test:rls
- Requêtes SQL diagnostiques + résultats
```

## 8. Anti-patterns à éviter

- ❌ Ne **modifie pas** le code sans qu'on te le demande. Tu es en lecture.
- ❌ Ne **spawn pas d'agents** subordonnés sans nécessité (cf. `CLAUDE.md` § Agents & coût).
- ❌ Ne **devine pas** : si une vérif est ambiguë, écris-la dans le rapport comme « non vérifiée — raison ».
- ❌ Ne **liste pas exhaustivement** tous les fichiers : focus sur les findings.
- ❌ Ne **redéploie pas** ni `git push` quoi que ce soit pendant l'audit.
- ✅ **Cite tes preuves** : numéros de ligne, sorties de commandes, lignes SQL.
- ✅ **Quantifie** : « 884/884 tests verts », « 10/10 athlètes sex=M/F », « 83/94 GIFs présents ».
- ✅ **Trouve les incohérences entre les couches** (DB ↔ engine ↔ UI ↔ docs).

## 9. Budget

- **Lecture** : ~30-45 min pour parcourir docs + code + commits du §293.
- **Vérifs** : ~15-20 min pour exécuter les commandes + queries SQL.
- **Rapport** : ~15-25 min pour structurer les findings.

Cible : 1-1.5h de travail concentré pour un audit complet et actionnable. Plus → trop touffu ; moins → superficiel.

---

**Démarre maintenant.** Premier livrable attendu : un message de checkpoint après lecture des 5 docs du § 1 (« contexte chargé, voici ce que j'ai compris du périmètre + voici les premiers signaux faibles à creuser »). Puis tu attaques les vérifs.
