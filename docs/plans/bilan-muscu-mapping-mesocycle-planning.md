# Mapping `GeneratedMesocycle` → `strength_planning_*`

Note technique préparatoire aux RPC `apply_strength_mesocycle` /
`revert_strength_mesocycle` (§293, Phase 4).

**But :** décrire précisément comment un objet `GeneratedMesocycle` produit
par le moteur (`src/lib/strength/mesocycleEngine.ts`) se matérialise sur la
timeline de planification muscu existante (`strength_planning_slots`,
`strength_planning_slot_overrides`, `strength_planning_week_meta`,
`strength_planning_week_overrides`), et comment le `snapshot/revert` opère.

---

## 1. Lecture rapide du modèle existant

Tables impliquées (cf. `00001_initial_schema.sql` et `00136_strength_planning_slots.sql`).

| Table | Granularité | Contenu |
|---|---|---|
| `strength_sessions` | template de séance | `id (serial)`, `name`, `description`, `folder_id`, `created_by` |
| `strength_session_items` | exercices du template | `session_id`, `ordre`, `exercise_id` → `dim_exercices`, `block ∈ {warmup, main}`, `cycle_type ∈ {endurance, hypertrophie, force}`, `sets`, `reps`, `pct_1rm`, `rest_series_s`, `rest_exercise_s`, `notes`, `raw_payload` (jsonb) |
| `strength_planning_slots` | planning niveau groupe | `(group_id, week_start, day_of_week 0-6, time_slot ∈ {morning, evening})` → `session_template_id` |
| `strength_planning_slot_overrides` | planning par nageur (surcharge) | `(athlete_id, week_start, day_of_week, time_slot)` → `session_template_id`. UNIQUE sur le tuple |
| `strength_planning_week_meta` | meta semaine groupe | `(group_id, week_start)` → `week_type`, `notes` |
| `strength_planning_week_overrides` | meta semaine nageur | `(athlete_id, week_start)` → `week_type`, `notes` |

**Convention muscu (cf. backfill du 00136)** : les séances de musculation
sont posées dans le créneau `time_slot = 'evening'`. La RPC respectera cette
convention.

**Convention coach builder existant** : un nouveau template muscu = une
ligne `strength_sessions` + N lignes `strength_session_items`. Le coach
relie ensuite via `strength_planning_slot_overrides` (cf.
`src/lib/api/strength.ts` autour de la ligne 230, `createStrengthSession`).

---

## 2. Mapping mésocycle → planning

### 2.1 Paramètres d'entrée de la RPC `apply`

L'orchestrateur (`generateMesocycle`) ne connaît pas les **dates** — la RPC
les reçoit du UI nageur :

| Paramètre | Type | Source UI |
|---|---|---|
| `p_athlete_id` | int | session (= `app_user_id()`, vérifié dans la RPC) |
| `p_assessment_id` | uuid | dernière évaluation `completed` du nageur |
| `p_template_id` | uuid | template choisi |
| `p_event_group` | text | snapshot du `event_group` du template |
| `p_kind` | text | snapshot du `kind` du template (`season`/`inter_competition`) |
| `p_target_week_count` | int | durée cible saisie |
| `p_sessions_per_week` | int | de l'évaluation, ajustable |
| `p_start_week_monday` | date | calculée par l'UI : `startMonday(now + 7d)` par défaut, ou la première semaine vide après l'évaluation |
| `p_bucket_priorities` | jsonb | `reasoning` complet sérialisé (scoreReasoning, dataConfidence, …) |
| `p_engine_version` | text | `ENGINE_VERSION` exporté par le moteur |
| `p_weeks` | jsonb | sérialisation de `GeneratedMesocycle.weeks` |

Le `p_weeks` payload contient, pour chaque semaine, l'ensemble des
informations nécessaires à la matérialisation. Forme :

```json
[
  {
    "week_number": 1,
    "cycle": "prepa_generale",
    "sessions": [
      {
        "session_number": 1,
        "buckets": ["mobility", "lower_strength"],
        "exercises": [
          {
            "exercise_id": 42,
            "nom_exercice": "Squat dos",
            "bucket": "lower_strength",
            "is_core": true,
            "sets": 4,
            "reps": 5,
            "intensity_pct_1rm": 85,
            "rest_seconds": 180,
            "intention": null,
            "substituted": false,
            "original_exercise_id": null
          }
          // …
        ]
      }
      // …
    ]
  }
  // …
]
```

### 2.2 Conversion des semaines en `week_start`

```
week_start_i = p_start_week_monday + (week_number - 1) * 7 days
```

`p_start_week_monday` est garanti par l'UI = un lundi (validé via
`getMonday` côté front).

### 2.3 Conversion des séances en `day_of_week`

`day_of_week ∈ [0, 6]` avec 0 = lundi (cohérent avec
`strength_planning_slots.day_of_week` et la convention `getMonday`).

Pattern de répartition selon `sessions_per_week` :

| `S` | Jours (`day_of_week`) | Notation |
|----|------------------------|----------|
| 1 | `[0]` | L |
| 2 | `[0, 3]` | L, J |
| 3 | `[0, 2, 4]` | L, M, V |
| 4 | `[0, 1, 3, 4]` | L, Ma, J, V |
| 5 | `[0, 1, 2, 3, 4]` | L→V |
| 6 | `[0, 1, 2, 3, 4, 5]` | L→Sa |
| 7 | `[0, 1, 2, 3, 4, 5, 6]` | L→D |

`session_number` (1-indexé dans `MesocycleSession`) → index `(session_number - 1)`
de la liste ci-dessus. Pattern hardcodé dans la RPC (tableau plpgsql).

### 2.4 Conversion d'un cycle de périodisation en `cycle_type` legacy

Le `cycle_type` des items legacy n'a que 3 valeurs (`endurance`,
`hypertrophie`, `force`). Mapping retenu :

| `PeriodizationCycle` | `cycle_type` legacy | Raison |
|---|---|---|
| `prepa_generale` | `endurance` | catalogue `*_endurance` (volumes hauts, charges modérées) |
| `force_max` | `force` | catalogue `*_force` (recrutement, charges lourdes) |
| `puissance` | `force` | charges modérées-rapides — famille force |
| `maintien` | `force` | maintient les acquis force |
| `affutage` | `force` | volume ↓, intensité tenue (force/vélocité) |
| `pic` | `force` | activation SNC, charges légères-rapides |

Le `cycle_type` legacy étant grossier, on conserve la valeur fine
`periodization_cycle` dans `strength_session_items.raw_payload` (jsonb),
de sorte que la lecture coach/nageur puisse afficher le cycle réel
(« Force max », « Puissance », …) sans perdre l'info.

### 2.5 `block` des items

| Source | `block` |
|---|---|
| `MesocycleExercise.bucket === 'mobility'` ET ordre dans la session = warmup (premiers items) | `warmup` |
| Tout autre | `main` |

L'orchestrateur range déjà les exercices warmup mobility en premier dans
`session.exercises` (cf. `buildSession` dans `mesocycleEngine.ts`). La RPC
duplique cette logique : les premiers items de bucket `mobility` →
`warmup`, le reste → `main`.

### 2.6 `raw_payload` des items

Pour ne rien perdre de la sémantique du moteur (le `cycle_type` legacy
écrase l'info de cycle, et `block` ne dit pas de quel bucket l'exercice
provient), on persiste :

```json
{
  "engine_source": "mesocycle",
  "mesocycle_id": "<uuid du mésocycle>",
  "periodization_cycle": "force_max",
  "bucket": "lower_strength",
  "is_core": true,
  "intention": "Déplacer la charge à vitesse maximale — …",
  "substituted": false,
  "original_exercise_id": null,
  "week_number": 3,
  "session_number": 2
}
```

C'est ce champ qui permettra :
- au coach de voir « tel exercice vient du mésocycle Y, c'est un substitut
  de l'exercice X car douleur épaule » (auditabilité, Phase 6) ;
- au revert d'identifier les templates créés par la RPC `apply` (cf. §3).

### 2.7 Nom des templates `strength_sessions`

```
name = '[Méso <short_id>] S<week_number> J<session_number> · <cycle> · <bucket_focus>'
```

Exemple : `[Méso 7a3f] S03 J2 · force_max · lower_strength`. Le préfixe
`[Méso <short_id>]` (8 premiers caractères de l'UUID) est ce qui permettra
à la RPC `revert` d'isoler les templates à supprimer.

### 2.8 `strength_planning_week_overrides` (meta semaine)

On y écrit, pour chaque semaine du mésocycle :

| Champ | Valeur |
|---|---|
| `athlete_id` | `p_athlete_id` |
| `week_start` | semaine_i |
| `week_type` | nom FR du cycle (« Préparation générale », « Force max », « Pic »…) — issu de `PERIODIZATION_CYCLES[cycle].label` |
| `notes` | mention du mésocycle (« Mésocycle <short_id> · semaine <i>/<N> ») |

Cela permet à la timeline existante (qui consomme déjà `week_overrides`)
d'afficher le type de semaine sans modification.

---

## 3. Snapshot et revert

### 3.1 Snapshot avant `apply`

Dans la même transaction que `apply` (avant tout INSERT) :

```sql
INSERT INTO strength_planning_snapshots (mesocycle_id, athlete_id, slot_overrides, week_overrides)
VALUES (
  <new_mesocycle_id>,
  p_athlete_id,
  (SELECT jsonb_agg(to_jsonb(o.*)) FROM strength_planning_slot_overrides o
    WHERE o.athlete_id = p_athlete_id
      AND o.week_start BETWEEN p_start_week_monday
                           AND p_start_week_monday + (p_target_week_count - 1) * 7),
  (SELECT jsonb_agg(to_jsonb(w.*)) FROM strength_planning_week_overrides w
    WHERE w.athlete_id = p_athlete_id
      AND w.week_start BETWEEN p_start_week_monday
                           AND p_start_week_monday + (p_target_week_count - 1) * 7)
);
```

Le snapshot est **par athlète + par fenêtre** (les semaines du mésocycle).
Pas de copie globale : on ne perturbe pas la timeline hors mésocycle.

### 3.2 `apply` — séquence dans la transaction

1. Vérifier `app_user_id() = p_athlete_id` (ou rôle `coach`/`admin`).
2. Marquer les mésocycles précédents `active` du même nageur comme
   `superseded` (UPDATE strength_mesocycles SET status='superseded' WHERE
   athlete_id = … AND status = 'active').
3. INSERT le nouveau `strength_mesocycles` row → `<new_mesocycle_id>`.
4. INSERT le `strength_planning_snapshots` row (cf. §3.1).
5. Pour chaque session `(week_i, session_j)` :
   - INSERT `strength_sessions` (name, created_by = p_athlete_id) →
     `<new_template_id>`.
   - INSERT `strength_session_items` (un par exercice, avec `raw_payload`
     contenant `mesocycle_id` = `<new_mesocycle_id>` cf. §2.6).
   - UPSERT `strength_planning_slot_overrides` :
     `INSERT … ON CONFLICT (athlete_id, week_start, day_of_week, time_slot)
      DO UPDATE SET session_template_id = EXCLUDED.session_template_id`.
6. Pour chaque semaine, UPSERT `strength_planning_week_overrides` (cf. §2.8).
7. INSERT `notifications` (`type = 'message'`, `metadata` jsonb avec
   `kind = 'strength_mesocycle_generated'`, `mesocycle_id`, `athlete_id`,
   `target_role = 'coach'`) + `notification_targets` au niveau du
   **groupe du nageur** (lookup via `group_members.user_id = p_athlete_id`).

### 3.3 `revert` — séquence

1. Vérifier que l'appelant est le nageur (`app_user_id() = mesocycle.athlete_id`)
   **ou** un coach/admin.
2. Charger le `strength_planning_snapshots` du mésocycle (`mesocycle_id = p_mesocycle_id`).
3. DELETE FROM `strength_planning_slot_overrides` WHERE `athlete_id` = `mesocycle.athlete_id`
   AND `week_start` ∈ fenêtre du mésocycle (`[start_week, start_week + N·7)`).
4. DELETE FROM `strength_planning_week_overrides` (idem fenêtre).
5. DELETE FROM `strength_sessions` les templates dont le nom commence par
   `[Méso <short_id>]` (et qui ont `created_by = mesocycle.athlete_id`,
   double sécurité). La cascade DELETE supprime aussi les
   `strength_session_items`.
6. INSERT (depuis le snapshot JSONB) les `slot_overrides` et
   `week_overrides` d'origine — `jsonb_to_recordset(...)` + INSERT.
7. UPDATE `strength_mesocycles.status = 'reverted'` pour `id = p_mesocycle_id`.
8. INSERT notification facultative côté nageur (« Mésocycle annulé par le
   coach »), seulement si l'appelant est coach et différent du nageur.

### 3.4 Idempotence et garde-fous

- L'`apply` est transactionnelle : si une étape échoue, ROLLBACK → état
  initial préservé.
- Le snapshot est créé **avant** tout INSERT — un échec en étape 5 ne
  laisse pas de mésocycle sans son snapshot.
- Le `revert` est aussi transactionnel ; si la restauration depuis le
  snapshot JSONB échoue (incohérence schéma future), la transaction
  ROLLBACK et le mésocycle reste `active`.
- Un `apply` ne peut pas créer deux mésocycles `active` sur le même
  athlete : étape 2 supersède les précédents.

---

## 4. Points laissés à l'implémentation (à trancher dans 4.2/4.3)

1. **Notification type** : extension du `notifications_type_check` pour
   ajouter `'strength_mesocycle'`, ou réutilisation de `'message'`. Décidé
   en 4.2 — défaut : réutilisation de `'message'` avec
   `metadata.kind = 'strength_mesocycle_generated'` (zéro migration de
   contrainte).
2. **Folder pour les templates générés** : NULL (orphan) ou création
   automatique d'un `strength_folders` par mésocycle ? Défaut : NULL —
   l'UI nageur consomme via `strength_planning_slot_overrides`, pas via
   les folders ; les folders sont un artefact organisationnel coach.
3. **Conflit avec un mésocycle `active` existant** : on supersède (cf.
   §3.2 étape 2). Pas de blocage UI ; le snapshot du nouveau mésocycle
   capture l'état post-snapshot du précédent — le revert ramène à cet
   état intermédiaire, pas à un état pré-mésocycles.
4. **RLS et SECURITY DEFINER** : les RPC sont `SECURITY DEFINER` (elles
   manipulent `strength_planning_slot_overrides` dont l'INSERT est
   réservé aux coach/admin). La RPC vérifie elle-même le rôle de
   l'appelant via `app_user_id()` / `app_user_role()`.

---

## 5. Cohérence avec les types TS

Les types `StrengthMesocycle` et `StrengthPlanningSnapshot` (cf.
`src/lib/api/types.ts`) couvrent déjà toute la persistance ci-dessus.
Aucun champ supplémentaire requis. Les wrappers JS (Task 4.5) traduiront
`GeneratedMesocycle` (sortie du moteur) en payload `p_weeks` de la RPC, et
parseront `strength_mesocycles.bucket_priorities` pour reconstruire le
`MesocycleReasoning` à l'affichage.

