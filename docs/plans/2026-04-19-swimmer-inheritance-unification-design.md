# Design — Unification backend de la logique d'héritage séances nageur

**Date** : 2026-04-19
**Auteur** : François + Claude (brainstorming)
**Statut** : validé, prêt pour planification d'implémentation

## Contexte et motivation

Les patches §137, §138, §139, §143 ont empilé des fixes successifs côté frontend pour faire fonctionner l'héritage des séances groupe sur les créneaux personnalisés d'un nageur. Chaque fix révélait un cas manqué par le précédent :

- §137 : `swimmer_slot.id ≠ training_slot.id` — besoin d'un résolveur swimmer-centric.
- §138 : créneaux salle héritaient à tort de séances nage (bug d'abstraction dans le resolver).
- §139 : passage à la résolution par training_slot d'origine pour éviter le filtrage `visibleGroupIds` time-insensitive.
- §143 : fallback par attributs (day + bucket + groupes) pour les swimmer_slots créés manuellement (source_assignment_id NULL).

Cette accumulation produit un code fragile, divergent entre Dashboard nageur (via `resolveSwimmerAssignmentsBatch`) et vue semaine coach (via une variante locale). Les règles d'absence (table `planned_absences` jour-entière) sont grossières. Les opérations groupe écrasent silencieusement les assignations individuelles.

**Objectif** : une seule source de vérité backend (Postgres RPC) consommée par toutes les vues, avec sémantique claire et invariants garantis.

## Règles métier validées

| # | Règle | Statut |
|---|---|---|
| R1 | Dénominateur de présence d'un nageur = ses `swimmer_training_slots`. Pas de créneau ce jour/bucket → n'existe pas dans ses stats. | ✅ |
| R2 | Héritage séance groupe → nageur : même jour + même bucket (cutoff 13h). Horaires peuvent différer. | ✅ |
| R3 | Précédence : individuel (`target_user_id`) > subgroup (`target_subgroup_id`) > groupe (`target_group_id`). | ✅ |
| R4 | Création groupe sur créneau avec individuels existants → dialog listant les individuels préservés. | ✅ |
| R5 | Suppression groupe ne touche jamais aux assignations individuelles. | ✅ |
| R6 | Absence granulaire par créneau (pas par jour). Table `planned_absences` étendue avec `scheduled_slot`. | ✅ |
| R7 | Pas d'absence inférée : seul un log dans `planned_absences` compte. "Pas de ressenti" ≠ "absent". | ✅ |
| R8 | Source de vérité unique : RPC Postgres `get_swimmer_sessions`. | ✅ |
| R9 | Même règle bucket AM/PM pour swim ET strength (session_type match requis). | ✅ |
| R10 | Coach voit les brouillons (`visible_from > today`), nageur ne les voit pas. | ✅ |

## Modèle de données

### Table modifiée : `planned_absences`

```sql
ALTER TABLE planned_absences
  ADD COLUMN scheduled_slot text CHECK (scheduled_slot IN ('morning', 'evening')),
  ADD COLUMN training_slot_id uuid REFERENCES training_slots(id) ON DELETE SET NULL;

DROP INDEX IF EXISTS planned_absences_user_date_unique;
CREATE UNIQUE INDEX planned_absences_user_date_slot_unique
  ON planned_absences(user_id, date, COALESCE(scheduled_slot, 'all'));

CREATE INDEX idx_pa_user_date_slot
  ON planned_absences(user_id, date, scheduled_slot);
```

Sémantique :
- `scheduled_slot = NULL` → absence toute la journée (tous créneaux).
- `scheduled_slot = 'morning' | 'evening'` → absence scopée.
- `training_slot_id` optionnel, pour distinguer deux créneaux dans le même bucket (cas rare).

Backfill : lignes existantes restent `scheduled_slot = NULL` (= comportement actuel).

### Table modifiée : `session_assignments`

```sql
CREATE UNIQUE INDEX idx_sa_unique_slot_user_v1
  ON session_assignments(training_slot_id, scheduled_date, target_user_id)
  WHERE target_user_id IS NOT NULL AND assignment_type = 'swim';
```

Empêche les duplicatas individuels sur un même créneau/date.

### Tables inchangées

- `swimmer_training_slots` : `source_assignment_id` continue d'exister comme chemin d'héritage préféré. Le fallback par attributs est maintenant en SQL.
- `training_slots`, `training_slot_assignments` : aucune modification.

## RPC `get_swimmer_sessions`

### Signature

```sql
CREATE OR REPLACE FUNCTION public.get_swimmer_sessions(
  p_user_id integer,
  p_from date,
  p_to date,
  p_include_drafts boolean DEFAULT false
)
RETURNS TABLE (
  swimmer_slot_id uuid,
  scheduled_date date,
  day_of_week int,
  bucket text,
  slot_start_time time,
  slot_end_time time,
  slot_location text,
  slot_session_type text,
  assignment_id integer,
  assignment_source text,
  assignment_title text,
  assignment_total_km numeric,
  swim_catalog_id integer,
  strength_session_id integer,
  training_slot_id uuid,
  is_absent boolean,
  absence_reason text,
  log_session_id uuid
)
LANGUAGE sql STABLE SECURITY INVOKER;
```

### Algorithme (5 étapes)

**Étape 1 — Dénominateur "créneaux attendus"**

Pour chaque date ∈ [p_from, p_to] :
- Si le nageur a des `swimmer_training_slots` actifs → utilise ses slots perso du `day_of_week` correspondant.
- Sinon → utilise les `training_slots` de ses groupes (permanent ∪ temporaire actif) du même `day_of_week`.

**Étape 2 — Résolution training_slot groupe source**

Pour chaque créneau attendu :
1. **Exact** : `swimmer_slot.source_assignment_id` → `training_slot_assignments.slot_id`.
2. **Fallback attributs** : `training_slot` avec même `day_of_week` + même `session_type` + même bucket, assigné à un groupe du nageur. Tie-break par distance `start_time` minimale.
3. Si aucun match → `training_slot_id = NULL`.

**Étape 3 — Précédence individuel > subgroup > groupe**

Sur `(scheduled_date, bucket, training_slot_id résolu)` :
1. `target_user_id = p_user_id` → priorité 1.
2. `target_subgroup_id IN (sous-groupes du nageur)` → priorité 2.
3. `target_group_id IN (groupes du nageur)` via training_slot_id OR bucket → priorité 3.

Filtres : `status != 'cancelled'`, et si `p_include_drafts = false` alors `visible_from IS NULL OR visible_from <= CURRENT_DATE`.

**Étape 4 — Absences**

Join `planned_absences` sur `(user_id, date, scheduled_slot OR scheduled_slot IS NULL)`. `is_absent = true` si match.

**Étape 5 — Logs**

Left join `dim_sessions` pour marquer les séances déjà loggées (`log_session_id IS NOT NULL`).

### Sécurité

- `SECURITY INVOKER` → RLS s'applique transparemment. Policies existantes sur `session_assignments`, `planned_absences`, `swimmer_training_slots` filtrent automatiquement.
- Un nageur ne peut appeler que pour son propre `p_user_id`.
- Un coach peut appeler pour n'importe quel nageur (RLS coach permissive).

## Protection des assignations individuelles

### `deleteSlotAssignments` — scoped

```ts
.from("session_assignments")
.delete()
.eq("training_slot_id", params.trainingSlotId)
.eq("scheduled_date", params.scheduledDate)
.is("target_user_id", null);  // ← préserver les individuels
```

### `bulkCreateSlotAssignments` — retourne les individuels préservés

```ts
Promise<{
  created: number;
  preservedIndividuals: Array<{
    user_id: number;
    display_name: string;
    session_title: string;
  }>;
}>
```

Le frontend utilise cette liste pour afficher le dialog de prompt.

### Nouvelle fonction `assignIndividualSession`

Clarifie l'API d'assignation individuelle (existait partiellement dans `assignments_create`). Utilisée depuis fiche nageur et vue semaine coach filtrée.

### UI — Prompt de confirmation

Avant insert groupe, si individuels détectés :

```
Séance "{nom}" assignée au groupe {X} le {date}.

Les séances personnelles suivantes sont préservées :
• Francois WAGNER → "Séance hypoxie 2km"
• Pierre MARTIN → "Séance retour blessure"

[ Annuler ]  [ Confirmer ]
```

### UI — Badge "Perso"

Sur les cards de slot où `assignment_source === 'individual'`, afficher un petit badge `Perso` pour que le coach sache qu'il regarde la version individuelle.

## Plan de migration

### Migrations SQL (ordre strict)

| # | Fichier | Impact |
|---|---|---|
| 1 | `00128_planned_absences_per_slot.sql` | ALTER ADD columns + unique index + new index |
| 2 | `00129_get_swimmer_sessions_rpc.sql` | CREATE FUNCTION + GRANT |
| 3 | `00130_session_assignments_individual_unique.sql` | CREATE UNIQUE INDEX |

Toutes non-bloquantes, aucun downtime.

### Refactor frontend (ordre strict)

| # | Étape | Fichiers |
|---|---|---|
| 1 | Créer wrapper `getSwimmerSessions` + type `SwimmerSession` | `src/lib/api/swimmerSessions.ts`, `src/lib/api/types.ts` |
| 2 | Remplacer `resolveSwimmerAssignmentsBatch` dans 5 consommateurs | `useDashboardSessions.ts`, `SuiviSaison.tsx`, `SuiviSemaine.tsx`, `SwimmerHome.tsx`, `CoachTrainingSlotsScreen.tsx` |
| 3 | Refactor `deleteSlotAssignments` + `bulkCreateSlotAssignments` | `src/lib/api/assignments.ts` |
| 4 | UI `PreservedIndividualsDialog` | nouveau composant |
| 5 | UI `IndividualAssignmentBadge` | nouveau composant |
| 6 | Déprécier puis supprimer anciennes fonctions | après 1 semaine stable |

### Consommateurs NON migrés V1

- `useMonthlyReport.ts` — reste sur `dim_sessions`. Intégration V2 si besoin.
- Admin / Timesheet — orthogonal.

## Tests

### Tests RLS (`supabase/tests/rls/get_swimmer_sessions.test.ts`)

12 cas minimum couvrant : héritage exact, héritage par attributs (§143 reproduction), bucket mismatch, individuel prime, subgroup, absence par bucket, absence jour entier, nageur en stage avec dates passées, RLS nageur-autre, coach permissif, nageur sans swimmer_slots.

### Tests TypeScript (Vitest)

- `swimmerSessions.test.ts` — wrapper typesafe.
- `bulkCreateSlotAssignments.test.ts` — `.is("target_user_id", null)` + `preservedIndividuals`.

### UAT

Checklist validée par François sur les cas réels du 09-10/04 + flux création/suppression groupe avec individuels.

## Matrice d'invariants

| Invariant | Avant | Après |
|---|---|---|
| Héritage créneau perso + groupe même bucket | Partiel (bugs §137→§143) | Garanti SQL |
| Pas d'héritage bucket mismatch | OK frontend | Garanti SQL |
| Individuel > groupe | OK certaines vues | Garanti SQL, homogène |
| Création groupe préserve individuel | Cassé (delete wipe) | Index unique + delete scoped + prompt |
| Absence par créneau | Jour entier seulement | `scheduled_slot` nullable |
| Pas d'absence auto sans ressenti | OK | Confirmé par tests |
| Dénominateur = créneaux perso du nageur | OK sauf fiche Suivi | Unifié via RPC |

## Limites et V2

1. **Historique d'appartenance groupe non tracké** — changement de groupe perd les assignations passées. Cas rare.
2. **Rapport mensuel non migré V1** — chantier distinct.
3. **Performance > 3 mois non testée** — batch par 7 jours si besoin.
4. **Assignations sous-groupe orphelines** — comportement attendu : non visible pour nageur hors sous-groupe.
5. **Suppression d'un individuel** — uniquement depuis fiche nageur en V1. Raccourci vue semaine possible en V2.

## Rollback

Chaque migration est réversible indépendamment :
- Mig 1 : `DROP COLUMN scheduled_slot, training_slot_id` + recréer ancien index.
- Mig 2 : `DROP FUNCTION get_swimmer_sessions`.
- Mig 3 : `DROP INDEX idx_sa_unique_slot_user_v1`.

Le frontend peut rester sur `resolveSwimmerAssignmentsBatch` tant que la migration n'est pas complète (étape 2 incrémentale). Aucun big-bang.

## Prochaine étape

Invocation de `superpowers:writing-plans` pour produire un plan d'implémentation détaillé, phasé en : migrations SQL → wrapper TS → migration consommateurs → refactor mutations → UI → tests → nettoyage.
