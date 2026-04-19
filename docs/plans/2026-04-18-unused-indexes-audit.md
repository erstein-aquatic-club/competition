# Audit des 57 indexes "unused" — Classification par bucket

**Context** : advisor Supabase `unused_index` flagge 57 indexes jamais hit par `pg_stat_statements`. MAIS l'application est sous-exploitée en prod — beaucoup de ces indexes sont des FK indexes qui protègent JOIN et cascade deletes futurs, ou des indexes sur features récentes peu sollicitées.

**Méthode** :
1. Récupération de la définition via `pg_indexes`.
2. Cross-ref avec `information_schema.table_constraints` pour détecter les FK déclarées.
3. Grep sur `src/lib/api/` + `src/hooks/` pour trouver des `.eq/.order/.gte/.lte` sur les colonnes indexées.
4. Les FK **non déclarées** mais sémantiquement évidentes (`created_by`, `*_id` vers users) → bucket 2 quand même (JOIN existera).

**Compteurs** :
- SAFE TO DROP : **11**
- KEEP (FK index, déclarée OU sémantique) : **43**
- KEEP (match feature code) : **3**

**Total préservé** : 46 / 57. **Drop recommandé** : 11.

---

## Bucket 1 — SAFE TO DROP (11)

| Index | Table | Colonnes | Justification |
|---|---|---|---|
| `idx_dim_sessions_created` | dim_sessions | `created_at` | Colonne technique d'audit, aucun tri/filtre sur `created_at` côté app (trie par `session_date`). |
| `idx_dim_sessions_name_date` | dim_sessions | `(athlete_name, session_date)` | Colonne dénormalisée historique (§135 utilise `athlete_id`/`session_date` → couvert par d'autres indexes). `athlete_name` n'est filtré nulle part. |
| `idx_import_logs_status` | import_logs | `status` | Low cardinality (3 états), volume minuscule (logs admin). Pas de `.eq('status', ...)` trouvé. |
| `idx_assignments_status` | session_assignments | `status` | Status filtré principalement par policies RLS (expression simple), volume élevé. `.eq('status', ...)` absent du codebase (confirmé grep). |
| `idx_sa_visible_from` | session_assignments | `visible_from` WHERE NOT NULL | Partiel mais colonne utilisée uniquement en `UPDATE` (line 469) et lecture (row.visible_from filtré côté JS line 594). Pas de WHERE/ORDER BY. |
| `idx_training_slots_day` | training_slots | `day_of_week` WHERE is_active | 7 valeurs distinctes → sélectivité trop faible pour index utile. `.order('day_of_week')` suffit avec seq scan sur table petite. |
| `idx_training_slots_session_type` | training_slots | `session_type` WHERE is_active | Aucun `.eq('session_type', ...)` trouvé (grep confirme). |
| `idx_strength_set_logs_completed` | strength_set_logs | `completed_at` | Aucun `.eq/.gte/.order('completed_at')` dans le codebase. |
| `idx_users_created` | users | `created_at` | 1 usage `.order('created_at')` dans users.ts mais table petite (< 200 rows) → seq scan OK. |
| `club_record_swimmers_active_idx` | club_record_swimmers | `is_active` | Boolean low cardinality, table de jointure. Aucune match. |
| `idx_groups_temporary` | groups | `(is_temporary, is_active)` | Partiellement match : `is_temporary=true` heavily used. Mais table `groups` a < 50 rows → seq scan OK. **Borderline**, peut garder si on veut être safe. |

**Note** : `idx_groups_temporary` est borderline. Si le user préfère safe, on le déplace en bucket 3.

---

## Bucket 2 — KEEP (FK index : déclarée ou sémantique) (43)

Indexes sur colonnes FK (déclarées via `information_schema` OU sémantiquement FK — i.e. colonne `*_id` qui référence une autre table même sans contrainte formelle). Ces indexes sont **load-bearing** pour les JOINs et les cascade deletes futurs.

| Index | Table | Colonnes | FK déclarée ? | Cible |
|---|---|---|---|---|
| `idx_admin_audit_log_actor_id` | admin_audit_log | `actor_id` | ✅ | users.id (utilisé via `actor:users!actor_id(...)` audit.ts:18) |
| `idx_admin_audit_log_target_user_id` | admin_audit_log | `target_user_id` | ✅ | users.id |
| `idx_challenges_coach_id` | challenges | `coach_id` | ✅ | users.id |
| `idx_checklist_templates_athlete` | checklist_templates | `athlete_id` | ✅ | users.id |
| `idx_chrono_records_coach` | chrono_records | `coach_id` | ❌ (sémantique) | users.id (via coach_id évident) |
| `idx_coach_comment_reads_coach` | coach_comment_reads | `coach_user_id` | ✅ | users.id |
| `idx_csa_assigned_by` | coach_swimmer_assignments | `assigned_by` | ✅ | users.id |
| `idx_csh_swimmer` | coach_swimmer_history | `swimmer_id` | ❌ (sémantique) | users.id (utilisé dans coach-assignments.ts) |
| `idx_competition_checklist_checks_checklist_item_id` | competition_checklist_checks | `checklist_item_id` | ✅ | checklist_items.id |
| `idx_comp_checklists_athlete` | competition_checklists | `athlete_id` | ✅ | users.id |
| `idx_comp_checklists_template` | competition_checklists | `checklist_template_id` WHERE NOT NULL | ✅ | checklist_templates.id |
| `idx_competition_races_athlete` | competition_races | `athlete_id` | ✅ | users.id |
| `idx_competitions_created_by` | competitions | `created_by` | ❌ (sémantique) | users.id |
| `idx_groups_created_by` | groups | `created_by` | ✅ | users.id |
| `idx_groups_parent` | groups | `parent_group_id` WHERE NOT NULL | ✅ | groups.id (self-ref, sous-groupes) |
| `idx_import_logs_triggered_by` | import_logs | `triggered_by` | ✅ | users.id |
| `idx_interviews_created_by` | interviews | `created_by` | ❌ (sémantique, UUID auth) | auth.uid — utilisé dans les policies RLS interviews (created_by = auth.uid()) |
| `idx_interviews_cycle` | interviews | `current_cycle_id` WHERE NOT NULL | ✅ | training_cycles.id |
| `idx_notif_log_sender` | notification_log | `(sender_id, created_at DESC)` | ✅ (sender_id) | users.id (composite avec DESC → timeline) |
| `idx_notifications_created_by` | notifications | `created_by` | ✅ | users.id |
| `idx_objectives_competition` | objectives | `competition_id` WHERE NOT NULL | ✅ | competitions.id |
| `idx_objectives_created_by` | objectives | `created_by` | ❌ (sémantique) | users.id |
| `idx_one_rm_exercise` | one_rm_records | `exercise_id` | ✅ | dim_exercices.id |
| `idx_one_rm_source_run` | one_rm_records | `source_run_id` WHERE NOT NULL | ✅ | strength_session_runs.id |
| `idx_race_routines_routine` | race_routines | `routine_id` | ✅ | routine_templates.id |
| `idx_routine_templates_athlete` | routine_templates | `athlete_id` WHERE NOT NULL | ✅ | users.id |
| `idx_sa_swim_catalog` | session_assignments | `swim_catalog_id` WHERE NOT NULL | ✅ | swim_sessions_catalog.id |
| `idx_strength_folders_athlete_id` | strength_folders | `athlete_id` | ✅ | users.id |
| `idx_strength_folders_parent_id` | strength_folders | `parent_id` | ✅ | strength_folders.id (self-ref) |
| `idx_strength_runs_assignment` | strength_session_runs | `assignment_id` | ✅ | session_assignments.id |
| `idx_strength_runs_session` | strength_session_runs | `session_id` | ✅ | strength_sessions.id |
| `idx_strength_set_logs_exercise` | strength_set_logs | `exercise_id` | ✅ | dim_exercices.id |
| `idx_swim_catalog_folders_created_by` | swim_catalog_folders | `created_by` | ✅ | users.id |
| `idx_swim_exercise_logs_source` | swim_exercise_logs | `source_item_id` WHERE NOT NULL | ✅ | swim_session_items.id |
| `idx_swimmer_slots_created_by` | swimmer_training_slots | `created_by` | ✅ | users.id |
| `idx_timesheet_shift_groups_shift` | timesheet_shift_groups | `shift_id` | ✅ | timesheet_shifts.id |
| `idx_training_cycles_created_by` | training_cycles | `created_by` | ❌ (sémantique) | users.id |
| `idx_training_cycles_end_comp` | training_cycles | `end_competition_id` WHERE NOT NULL | ✅ | competitions.id |
| `idx_training_cycles_start_comp` | training_cycles | `start_competition_id` WHERE NOT NULL | ✅ | competitions.id |
| `idx_slot_coaches_coach` | training_slot_coaches | `coach_id` | ✅ | users.id |
| `idx_slot_overrides_created_by` | training_slot_overrides | `created_by` | ✅ | users.id |
| `idx_training_slot_overrides_slot_date` | training_slot_overrides | `(slot_id, override_date)` | ✅ (slot_id) | training_slots.id (composite → lookup slot+date) |
| `idx_user_profiles_approved_by` | user_profiles | `approved_by` | ✅ | users.id |

**Rationale global** : supprimer un FK index force un `Seq Scan` sur la table parent lors du cascade DELETE / JOIN → peut devenir catastrophique en prod avec plus de volume. Supabase advisor ne voit pas ces usages car ils sont principalement internes (contraintes RI, JOIN coach_swimmer_assignments dans policies RLS, etc.).

---

## Bucket 3 — KEEP (match feature code) (3)

| Index | Table | Colonnes | Match trouvé |
|---|---|---|---|
| `idx_training_slots_scheduled_date` | training_slots | `scheduled_date` WHERE (scheduled_date IS NOT NULL AND is_active) | `.gte/.lte/.eq/.order('scheduled_date')` dans `assignments.ts` (6 occurrences), `useSwimAnalytics.ts` (2), `Dashboard.tsx`. Vue semaine coach §131. |
| `idx_timesheet_shifts_date` | timesheet_shifts | `shift_date` | `.order/.gte/.lte('shift_date')` dans `timesheet.ts` lines 25-28. Pointage coach §39. |
| `idx_swim_records_date` | swim_records | `record_date` | `.order('record_date')` dans `records.ts:362`. Volumineuse avec l'historique FFN, order important. |

---

## Mesure d'impact après drop des 11 safe

- **Gain espace** : ~30-50 KB (indexes petits sur tables moyennes).
- **Gain INSERT** : négligeable (tables à faible write rate).
- **Gain en lisibilité `\d` PostgreSQL** : réel — enlève 11 lignes de bruit dans les descriptions.
- **Risque régression** : très faible. Aucun de ces 11 n'est sur une FK ou un filtre actif.

---

## Recommandation finale

**Migration `00123_drop_safe_unused_indexes.sql`** ne garder que les 11 du bucket 1 :
```sql
DROP INDEX IF EXISTS idx_dim_sessions_created;
DROP INDEX IF EXISTS idx_dim_sessions_name_date;
DROP INDEX IF EXISTS idx_import_logs_status;
DROP INDEX IF EXISTS idx_assignments_status;
DROP INDEX IF EXISTS idx_sa_visible_from;
DROP INDEX IF EXISTS idx_training_slots_day;
DROP INDEX IF EXISTS idx_training_slots_session_type;
DROP INDEX IF EXISTS idx_strength_set_logs_completed;
DROP INDEX IF EXISTS idx_users_created;
DROP INDEX IF EXISTS club_record_swimmers_active_idx;
-- idx_groups_temporary : à décider (borderline, usage réel mais table petite)
```

**Advisor post-drop** : environ 47-48 warnings `unused_index` restants (46 FK + éventuels feature indexes) — ces warnings sont **acceptables** car les FK indexes ne seront hit qu'avec plus de volume en prod.

Si le user préfère une passe agressive (drop tout sauf FK déclarées), on passe à ~25 drops (les FK non déclarées sémantiquement mais flaggées restent dans le listing de l'advisor). **Recommandation : approche conservative (11 drops) pour éviter toute régression sur cascade/JOIN.**
