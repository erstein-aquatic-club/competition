# Design — Planification natation multi-niveau (groupe + nageur)

*Date* : 2026-04-18
*Statut* : Validé (brainstorming)
*Chantier* : §N (à numéroter lors de l'implémentation)

## Contexte

Aujourd'hui, deux systèmes de planification natation coexistent :

1. **`/coach/swim-planning`** (`SwimPlanningDemo.tsx`, 1462 LOC) — planification par **groupe** : timeline verticale, grille jour × créneau (matin/soir), filière + session optionnelle. Table `swim_planning_slots`.
2. **Fiche nageur > Planification** (`SwimmerPlanningTab.tsx`, 844 LOC) — planification par **cycles** (macro entre 2 compétitions) + semaines avec `week_type`/notes. Tables `training_cycles` + `training_weeks`. Bouton "Personnaliser" pour passer du plan groupe à un override athlète (copie profonde).

Le coach ne peut pas, dans `/coach/swim-planning`, affiner la filière d'un nageur spécifique. Et le système de cycles ne partage aucune donnée avec la vraie planification natation — c'est une abstraction parallèle peu utilisée.

## Objectif

Unifier les deux systèmes autour de `swim_planning_slots` :
- Ajouter une granularité **filière par jour** au niveau nageur dans `/coach/swim-planning`.
- Ajouter un **type de semaine par nageur** (remplace `training_weeks.week_type` du système cycles).
- Retirer le système cycles (`training_cycles` / `training_weeks` / `SwimmerPlanningTab`) après migration des données utiles.

## Scope retenu (réponses user)

- Q1 (granularité) : **A + E** — filière par jour + type de semaine. Pas de remove (C), pas d'ajout hors grille (D), pas de session différente (B).
- Q2 (remplacement cycles) : **B** — remplacement + édition inline depuis la fiche nageur.
- Q3 (migration données) : **A** — table dédiée, backfill au déploiement, anciennes tables droppées dans un patch ultérieur.
- Q4 (entrée UX) : **A** — dropdown niveau 2 dans `/coach/swim-planning`, à côté du sélecteur groupe.
- Q5 (vue nageur) : **B** — plan mergé + badge "Perso" discret.

## Modèle de données

Trois nouvelles tables, migration `00118_swim_planning_overrides.sql`.

### `swim_planning_slot_overrides`

Override filière/session par nageur sur un créneau précis.

```sql
CREATE TABLE swim_planning_slot_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  athlete_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  week_start date NOT NULL,
  day_of_week smallint NOT NULL CHECK (day_of_week BETWEEN 0 AND 5),
  time_slot text NOT NULL CHECK (time_slot IN ('morning', 'evening')),
  filiere text NOT NULL,
  session_id uuid NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(athlete_id, week_start, day_of_week, time_slot)
);
```

### `swim_planning_week_meta`

Type/notes semaine au niveau **groupe** (aujourd'hui en localStorage dans `SwimPlanningDemo` — on le promeut en DB pour que tous les coachs + nageurs d'un groupe voient la même chose).

```sql
CREATE TABLE swim_planning_week_meta (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id integer NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  week_start date NOT NULL,
  week_type text,
  notes text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(group_id, week_start)
);
```

### `swim_planning_week_overrides`

Type/notes semaine par nageur — remplace `training_weeks`.

```sql
CREATE TABLE swim_planning_week_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  athlete_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  week_start date NOT NULL,
  week_type text,
  notes text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(athlete_id, week_start)
);
```

### RLS

Mêmes policies que `swim_planning_slots` :
- `SELECT` : `TO authenticated USING (true)`.
- `INSERT / UPDATE / DELETE` : `app_user_role() IN ('coach', 'admin')`.

### Backfill (migration 00118)

```sql
-- Copie les week_type / notes des cycles athlète dans swim_planning_week_overrides
INSERT INTO swim_planning_week_overrides (athlete_id, week_start, week_type, notes)
SELECT DISTINCT ON (tc.athlete_id, tw.week_start)
  tc.athlete_id, tw.week_start, tw.week_type, tw.notes
FROM training_weeks tw
JOIN training_cycles tc ON tc.id = tw.cycle_id
WHERE tc.athlete_id IS NOT NULL
  AND (tw.week_type IS NOT NULL OR tw.notes IS NOT NULL)
ORDER BY tc.athlete_id, tw.week_start, tc.created_at DESC
ON CONFLICT (athlete_id, week_start) DO NOTHING;
```

Collision (nageur avec 2 cycles chevauchants) : on garde le plus récent (`ORDER BY created_at DESC`).

**Non-migré** : cycles `group_id`-scoped (ambiguïté sémantique — voir doc). Nombre loggé lors de la migration.

**Pas de DROP** dans 00118 : `training_cycles`/`training_weeks` restent en place jusqu'à un patch ultérieur (fenêtre de rollback prod).

## API

`src/lib/api/swim-planning.ts` (actuel : 44 LOC → ~150 LOC) étendu avec :

```ts
// Slot overrides
getSwimPlanningSlotOverrides({ athleteId, weekStarts }): SlotOverride[]
upsertSwimPlanningSlotOverride(input): SlotOverride
deleteSwimPlanningSlotOverride(id): void

// Week meta (groupe)
getSwimPlanningWeekMeta({ groupId, weekStarts }): WeekMeta[]
upsertSwimPlanningWeekMeta(input): WeekMeta

// Week overrides (nageur)
getSwimPlanningWeekOverrides({ athleteId, weekStarts }): WeekOverride[]
upsertSwimPlanningWeekOverride(input): WeekOverride
```

### Helper de merge pur

`src/lib/swimPlanningMerge.ts` (nouveau, ~80 LOC) + tests unitaires.

```ts
export interface EffectiveSlot extends SwimPlanningSlot {
  overridden?: boolean;
  overrideId?: string;
}

export interface EffectiveWeekMeta {
  week_type: string | null;
  notes: string | null;
  source: 'group' | 'athlete' | 'none';
}

export function mergeSlots(
  groupSlots: SwimPlanningSlot[],
  athleteOverrides: SlotOverride[],
): EffectiveSlot[];

export function mergeWeekMeta(
  groupMeta: WeekMeta | null,
  athleteOverride: WeekOverride | null,
): EffectiveWeekMeta;
```

## UI/UX

### `/coach/swim-planning` (écran principal)

- Header : sélecteur groupe inchangé + **nouveau dropdown nageur niveau 2** à droite. Options : "Plan du groupe" (par défaut) + tous les nageurs du groupe sélectionné.
- Query param `?athlete=<id>` pour deep link (utilisé par la fiche nageur).
- Bandeau d'état en mode nageur : avatar + nom + bouton "← Retour plan groupe".
- Slot override = bordure pointillée + mini-icône nageur (accent color).
- Slot hérité en mode nageur = teinte atténuée (affordance "clique pour override").
- Sheet filière en mode nageur : bouton additionnel **"Retirer l'override"** si un override existe déjà.
- Header de semaine : édite `swim_planning_week_meta` en mode groupe, `swim_planning_week_overrides` en mode nageur. Affichage prioritaire : override > groupe > vide.

### Fiche nageur > onglet Planification

Nouveau composant `SwimmerPlanningPanel` (remplace `SwimmerPlanningTab`) :
- Utilise la timeline extraite (voir refactor technique).
- Groupe et nageur verrouillés (pas de sélecteurs).
- Lien "Ouvrir en plein écran" → `/coach/swim-planning?athlete=<id>`.

### `/suivi/planification` (vue nageur)

`SwimPlanningAthleteView` :
- Fetch additionnel `getSwimPlanningSlotOverrides({ athleteId: me })` + `getSwimPlanningWeekOverrides({ athleteId: me })`.
- Merge via les helpers → plan effectif.
- Badge "Perso" (accent color, discret) sur slots overridden et sur week_type si source `'athlete'`. Tooltip au tap : "Personnalisé par ton coach".

### Refactor technique

Extraire de `SwimPlanningDemo` la timeline (rendu semaines + grille jour × créneau) vers un nouveau composant `SwimPlanningTimeline` (mode `'group'` | `'athlete'`). Réutilisé par :
- `SwimPlanningDemo` (mode switchable selon dropdown nageur).
- `SwimmerPlanningPanel` (toujours mode `'athlete'`).
- `SwimPlanningAthleteView` (toujours mode `'athlete'`, read-only).

Évite la divergence observée aujourd'hui entre `SwimPlanningDemo` et `SwimPlanningAthleteView` (code dupliqué à ~60%).

### Invocation `frontend-design`

Déléguée à l'implémentation pour les détails visuels :
- Traitement du badge "Perso" et du bordurage pointillé (contraste, accent color, dark mode).
- Affordance du dropdown nageur (mobile : pas 2 dropdowns côte à côte).
- Bandeau d'état nageur (position sticky / inline / sheet).

## Retrait de l'ancien

Dans le même patch d'implémentation :
- Supprimer `SwimmerPlanningTab.tsx` (844 LOC).
- Retirer son import dans `CoachSwimmerDetail.tsx`, remplacé par `<SwimmerPlanningPanel />`.

**Non supprimé dans ce patch** (fenêtre de rollback) :
- `src/lib/api/planning.ts` (les appels `training_cycles`/`training_weeks` deviennent orphelins mais ne cassent rien).
- Tables `training_cycles` et `training_weeks`.

**Patch §N+1** (à faire 1-2 semaines après prod) : DROP tables + suppression de `planning.ts`.

## Tests

- **Unitaire** : `src/lib/__tests__/swimPlanningMerge.test.ts` — 5-6 cas (override pur, override absent, collision, session héritée, week_type priority, notes priority).
- **Intégration RLS** : `supabase/tests/rls/swim_planning_overrides.test.ts` — coach peut écrire pour n'importe quel nageur, nageur ne peut pas écrire ses propres overrides (uniquement lire), admin peut écrire, isolation inter-nageurs OK (lecture globale autorisée comme `swim_planning_slots`).
- Pas de test E2E (scope trop large pour le harness actuel).

## Découpage du chantier

1. **Migration 00118** + test RLS.
2. **API + merge helper** + tests unitaires.
3. **Refactor `SwimPlanningTimeline`** (pur, aucun changement fonctionnel — checkpoint avant de toucher à la fonctionnalité).
4. **Mode nageur dans `/coach/swim-planning`** + invocation `frontend-design`.
5. **`SwimmerPlanningPanel`** remplace `SwimmerPlanningTab`.
6. **Merge côté nageur** dans `SwimPlanningAthleteView`.
7. **Doc** : `implementation-log.md` §N, `ROADMAP.md`, `CLAUDE.md`.

## Risques & mitigations

| Risque | Mitigation |
|---|---|
| Refactor timeline casse l'UX existante | Étape 3 = refactor pur, checkpoint manuel. |
| Overlap cycles dans le backfill | `ORDER BY created_at DESC` déterministe, logge les collisions. |
| Dépendances cachées sur `SwimmerPlanningTab` | Vérifié : seul usage = `CoachSwimmerDetail.tsx:473`. |
| Nageurs multi-groupes (stages) | Hors scope — on garde le groupe permanent principal (`athlete.group_id`), comme aujourd'hui. |
| Tables cycles encore présentes post-patch | Intentionnel — patch §N+1 pour drop. |

## Hors scope (YAGNI)

- Retirer un slot pour un nageur (option C de Q1).
- Ajouter un slot individuel hors grille groupe (D).
- Bulk "appliquer ce week_type à toutes les semaines du cycle".
- Filtrage du sélecteur nageur par attribution coach→nageur (durcissable ultérieurement).
- Override de session_id sans changer de filière (peut se faire déjà via le sheet filière en choisissant la même filière + session différente).

## Terminal state

Design validé. Passage immédiat à `superpowers:writing-plans` pour produire `docs/plans/2026-04-18-coach-individual-swim-planning-plan.md`.
