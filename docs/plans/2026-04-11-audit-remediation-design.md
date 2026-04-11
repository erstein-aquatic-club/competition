# Design — Remédiation Audit EAC

**Date** : 2026-04-11
**Contexte** : Audit complet (frontend + backend + Supabase) ayant identifié 18 recommandations.
**Scope** : 17 items implémentés (item #2 leaked password exclu — Pro plan only, item #9 quick-add feedback exclu).

---

## Phase 1 — Sécurité Backend

**Migration** : `00079_security_hardening.sql`

### 1.1 Vue `swim_records_comp` — retirer SECURITY DEFINER

- `DROP VIEW` + `CREATE VIEW` avec `security_invoker = true`
- La vue fait un simple SELECT sur `swimmer_performances` — le RLS de cette table suffit

### 1.2 Fixer `search_path` sur les 11 fonctions manquantes

`ALTER FUNCTION ... SET search_path = public` pour :
- `app_user_id`, `app_user_role`, `update_updated_at_column` (non SECURITY DEFINER)
- `auto_notify_competition_assignment`, `auto_notify_interview_created`, `auto_notify_interview_transition`, `auto_notify_session_assignment`, `auto_notify_slot_override`, `auto_notify_swimmer_comment` (triggers SECURITY DEFINER)
- `generate_swim_share_token`, `sync_group_members_on_profile`, `send_wellness_morning_push`, `get_strength_history_aggregate`, `get_upcoming_birthdays`, `log_coach_swimmer_removal`, `notify_push_on_target_insert`

### 1.3 Restreindre `admin_audit_log` INSERT

Remplacer la policy `System can insert audit log` (WITH CHECK true) par :
```sql
WITH CHECK (current_setting('role') = 'service_role')
```
Les triggers SECURITY DEFINER s'exécutent en tant qu'owner → passent toujours. Les appels clients directs sont bloqués.

---

## Phase 2 — Performance DB + Frontend Full Stack

### 2.1 Index FK manquants

**Migration** : `00080_missing_fk_indexes.sql`

**Priorité haute** :
- `strength_session_items(exercise_id)`
- `session_assignments(swim_catalog_id)`
- `session_assignments(strength_session_id)`
- `competition_races(athlete_id)`
- `strength_session_runs(session_id)`
- `strength_sessions(folder_id)`

**Priorité moyenne** :
- `objectives(competition_id)`, `objectives(created_by)`
- `notifications(created_by)`
- `competition_checklists(athlete_id)`
- `one_rm_records(exercise_id)`, `one_rm_records(source_run_id)`
- `interviews(created_by)`, `interviews(current_cycle_id)`
- `training_cycles(created_by)`, `training_cycles(start_competition_id)`, `training_cycles(end_competition_id)`
- `dim_exercices(folder_id)`
- `checklist_templates(athlete_id)`
- `competition_checklists(checklist_template_id)`
- `race_routines(routine_id)`
- `routine_templates(athlete_id)`
- `swim_exercise_logs(source_item_id)`
- `swimmer_training_slots(created_by)`
- `training_slot_overrides(created_by)`
- `training_slots(created_by)`
- `groups(created_by)`
- `import_logs(triggered_by)`
- `coach_swimmer_assignments(assigned_by)`
- `training_slot_coaches(coach_id)`

**Omis** : `admin_audit_log`, `challenges`, `swim_catalog_folders`, `coach_comment_reads` — tables vides ou quasi-statiques.

### 2.2 Suppression index inutilisés (2 seulement)

- `DROP INDEX idx_swim_exercise_logs_user_event` — index partiel sans query correspondante
- `DROP INDEX idx_user_profiles_updated` — updated_at jamais requêté

Les 5 autres index signalés "unused" sont conservés : faible volume actuel mais queries existantes ou futures les utiliseront.

### 2.3 Pagination backend + frontend

**Migration** : `00081_pagination_rpcs.sql`

3 RPC paginées avec `count(*) OVER()` :

a) `get_athletes_paginated(p_offset int, p_limit int, p_search text, p_group_id int)`
   - Remplace les 3 queries séparées de `getAthletes()` (users + profiles + group_members)
   - Retourne le tout en un seul appel

b) `get_swim_catalog_paginated(p_offset int, p_limit int, p_search text, p_folder text)`
   - Remplace le chargement intégral du catalogue nage

c) `get_strength_catalog_paginated(p_offset int, p_limit int, p_search text, p_folder_id int)`
   - Idem pour les sessions muscu

**Frontend** :

| Fichier | Changement |
|---------|------------|
| `src/lib/api/users.ts` | `getAthletes()` → appel RPC paginé |
| `src/lib/api/swim.ts` | `getSwimSessions()` → appel RPC paginé |
| `src/lib/api/strength.ts` | `getStrengthSessions()` → appel RPC paginé |
| `CoachSwimmersOverview.tsx` | `useInfiniteQuery` + infinite scroll ou "Charger plus" |
| `SwimCatalog.tsx` | Idem |
| `StrengthCatalog.tsx` | Idem |

Pattern : React Query `useInfiniteQuery` avec `getNextPageParam` basé sur offset.

### 2.4 RPC d'agrégation

**Migration** : `00082_aggregation_rpcs.sql`

a) `get_strength_run_summary(p_run_id int)`
   - Agrège tonnage, total reps, exercise breakdown en SQL
   - Remplace les calculs client-side dans `RunDetailSheet.tsx`

b) `batch_upsert_1rm(p_records jsonb)`
   - Reçoit `[{athlete_id, exercise_id, value, source_run_id}]`
   - Un seul `INSERT ... ON CONFLICT` au lieu de N appels parallèles

c) Enrichir `get_strength_history_aggregate` existant
   - Ajouter le groupByExercise actuellement calculé dans `strengthHistoryUtils.ts`

**Frontend** :

| Fichier | Changement |
|---------|------------|
| `src/lib/api/strength.ts` | `saveStrengthRun()` → `batch_upsert_1rm` |
| `src/lib/strengthHistoryUtils.ts` | Simplifier, déléguer à RPC |
| `RunDetailSheet.tsx` | Appeler `get_strength_run_summary` |

---

## Phase 3 — UX Frontend

### 3.1 Auto-fermeture drawer après save (item 10)

**Fichier** : `src/pages/Dashboard.tsx`

Dans le `onSuccess` de la mutation save : `setTimeout(() => setDrawerOpen(false), 500)` pour laisser le toast apparaître.

### 3.2 Breadcrumbs navigation coach (item 11)

**Nouveau** : `src/components/shared/CoachBreadcrumb.tsx`
- Utilise le composant `Breadcrumb` de shadcn/ui existant
- Hook `useCoachBreadcrumb(segments: {label, href?}[])` qui construit le chemin

**Fichiers impactés** :
- `CoachSwimmerDetail.tsx` — Coach > Nageurs > {nom}
- `SwimmerPlanningTab.tsx`, `SwimmerInterviewsTab.tsx`, `SwimmerObjectivesTab.tsx`, `SwimmerFeedbackTab.tsx` — inclut onglet actif
- `CoachChronoHistoryScreen.tsx` — Coach > Chrono > Historique

### 3.3 Indicateur champ manquant (item 12)

**Fichier** : `src/pages/Dashboard.tsx`

- Wrapper `div` sur le bouton Save qui intercepte le clic même désactivé
- Highlight `ring-2 ring-destructive` + shake animation sur les `ScaleSelector5` non remplis
- Texte `text-destructive text-xs` : "Remplis les 4 indicateurs"

### 3.4 Dark mode toggle admin (item 13)

**Mécanisme** :
- Clé `dark_mode` dans `app_settings` (table existante), valeurs : `"system"` | `"light"` | `"dark"`
- `Select` 3 options dans la page admin, section "Apparence"
- Au mount (`App.tsx`) : query `app_settings` → appliquer classe `.dark` sur `<html>`
- S'applique globalement à tous les utilisateurs du club

**Fichiers** :
- `src/lib/api/index.ts` — `getAppSetting(key)` / `setAppSetting(key, value)`
- Page admin — nouvelle section "Apparence"
- `src/App.tsx` — query early + apply class

---

## Phase 4 — Robustesse

### 4.1 Transaction atomique saveStrengthRun (item 14)

**Migration** : `00083_save_strength_run_atomic.sql`

RPC `save_strength_run_atomic(p_data jsonb)` encapsulant les 5 étapes :
1. INSERT `strength_session_runs`
2. INSERT `strength_set_logs[]`
3. UPSERT `one_rm_records[]` (via `batch_upsert_1rm`)
4. UPDATE run `status = 'completed'`
5. UPDATE `session_assignments.status` si lié

Rollback complet si une étape échoue.

**Frontend** : `src/lib/api/strength.ts` — `saveStrengthRun()` réduit à un seul appel RPC.

### 4.2 Conflict resolution offline (item 15)

**Frontend** :

- `src/lib/api/localStorage.ts` : wrapper `{ data, version, updatedAt }` sur chaque entrée
- `src/lib/api/client.ts` : au retour online, comparer timestamps local vs serveur (last-write-wins)
- **Nouveau** : `src/components/shared/OfflineSyncBanner.tsx` — toast au retour online si données écrasées

### 4.3 CHECK constraints texte (item 16)

**Migration** : `00084_text_length_constraints.sql`

| Table | Colonne(s) | Limite |
|-------|-----------|--------|
| `dim_sessions` | `comments`, `coach_notes` | 2000 |
| `user_profiles` | `bio` | 500 |
| `user_profiles` | `display_name` | 100 |
| `user_profiles` | `phone` | 20 |
| `notifications` | `title` | 200 |
| `notifications` | `body` | 2000 |
| `interviews` | 10 champs texte | 5000 chacun |
| `objectives` | `text` | 1000 |
| `strength_sessions` | `name` | 200 |
| `strength_sessions` | `description` | 2000 |
| `competitions` | `name` | 200 |
| `competitions` | `description` | 2000 |
| `strength_set_logs` | `notes` | 500 |
| `strength_session_runs` | `comments` | 2000 |
| `wellness_checks` | `notes` | 1000 |

**Frontend** : ajouter `maxLength` sur les inputs/textareas correspondants.

### 4.4 Cron de purge (item 17)

**Migration** : `00085_notification_cleanup.sql`

Fonction `cleanup_expired_notifications()` :
- DELETE notification_targets + notifications expirées > 30 jours
- DELETE push_subscriptions non mises à jour > 90 jours

Cron via `pg_cron` : chaque dimanche 3h00 UTC.

### 4.5 Session refresh Supabase (item 18)

**Fichier** : `src/lib/auth.ts`

- Écouter `TOKEN_REFRESHED` → mettre à jour tokens dans Zustand
- Écouter `SIGNED_OUT` cause `TOKEN_EXPIRED` → redirect login + toast
- Timer de sécurité : si aucun refresh depuis 55 min → forcer `refreshSession()`
- Si refresh échoue → `signOut()` + redirect

---

## Récapitulatif des migrations

| # | Fichier | Contenu |
|---|---------|---------|
| `00079` | `security_hardening.sql` | Vue swim_records_comp, search_path x11, audit_log policy |
| `00080` | `missing_fk_indexes.sql` | ~30 index FK + DROP 2 index inutilisés |
| `00081` | `pagination_rpcs.sql` | 3 RPC paginées (athletes, swim catalog, strength catalog) |
| `00082` | `aggregation_rpcs.sql` | run_summary, batch_upsert_1rm, enrichir history_aggregate |
| `00083` | `save_strength_run_atomic.sql` | RPC transactionnelle saveStrengthRun |
| `00084` | `text_length_constraints.sql` | CHECK constraints ~20 colonnes |
| `00085` | `notification_cleanup.sql` | Fonction purge + cron pg_cron |

## Fichiers frontend impactés

| Fichier | Phases |
|---------|--------|
| `src/lib/api/strength.ts` | 2, 4 |
| `src/lib/api/users.ts` | 2 |
| `src/lib/api/swim.ts` | 2 |
| `src/lib/api/localStorage.ts` | 4 |
| `src/lib/api/client.ts` | 4 |
| `src/lib/api/index.ts` | 3 |
| `src/lib/auth.ts` | 4 |
| `src/lib/strengthHistoryUtils.ts` | 2 |
| `src/pages/Dashboard.tsx` | 3 |
| `src/pages/coach/CoachSwimmersOverview.tsx` | 2 |
| `src/pages/coach/SwimCatalog.tsx` | 2 |
| `src/pages/coach/StrengthCatalog.tsx` | 2 |
| `src/pages/coach/CoachSwimmerDetail.tsx` | 3 |
| `src/pages/coach/SwimmerPlanningTab.tsx` | 3 |
| `src/pages/coach/SwimmerInterviewsTab.tsx` | 3 |
| `src/pages/coach/SwimmerObjectivesTab.tsx` | 3 |
| `src/pages/coach/SwimmerFeedbackTab.tsx` | 3 |
| `src/pages/coach/CoachChronoHistoryScreen.tsx` | 3 |
| `src/components/strength/RunDetailSheet.tsx` | 2 |
| `src/App.tsx` | 3 |
| Page admin | 3 |

**Nouveaux fichiers** :
- `src/components/shared/CoachBreadcrumb.tsx`
- `src/components/shared/OfflineSyncBanner.tsx`
- `src/hooks/useCoachBreadcrumb.ts`
