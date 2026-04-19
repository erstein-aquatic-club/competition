# Créneaux non assignés 30j — Design

**Date** : 2026-04-19
**Portée** : Coach Home — nouvelle section rétrospective entre "Ma semaine" et "Accès rapides".
**Problème** : un coach ne voit actuellement les créneaux vides que pour la semaine en cours (grille "Ma semaine"). Les oublis passés disparaissent de la vue, sans rappel.
**Objectif** : exposer, sur la home coach, le nombre et la liste des créneaux d'entraînement qui n'ont reçu aucune séance assignée sur les 30 derniers jours, avec navigation directe vers la semaine concernée.

## Fenêtre et règles de comptage

Même convention que `get_feedback_rates_all_athletes` (migration §00121) :

- **Fenêtre** : `current_date - 30` → `current_date - 1` (J-30 à J-1, aujourd'hui exclu).
- **Slots pris en compte** : `training_slots.is_active = true`, `session_type = 'swim'`.
  - Slots récurrents → énumérer chaque date ISO de la fenêtre matchant `day_of_week`.
  - Slots one-off (`scheduled_date` non null) → garder uniquement si `scheduled_date` tombe dans la fenêtre.
- **Exclusions** :
  - Occurrences annulées par un `training_slot_overrides` (`status = 'cancelled'`, match `slot_id + override_date`).
  - Occurrences déjà servies par une `session_assignments` (match `training_slot_id + scheduled_date`, `status <> 'cancelled'`).

Une occurrence "non assignée" = slot actif + date dans la fenêtre, sans override cancelled et sans assignment non-cancelled.

## Architecture data — RPC serveur

**Nouvelle migration** : `supabase/migrations/00117_unassigned_slot_instances_30d.sql`.

```sql
CREATE OR REPLACE FUNCTION get_unassigned_slot_instances_30d()
RETURNS TABLE (
  slot_id          uuid,
  scheduled_date   date,
  day_of_week      smallint,
  start_time       time,
  end_time         time,
  location         text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  WITH
  since_date AS (
    SELECT (current_date - 30)::date AS d
  ),
  dates AS (
    SELECT gs::date AS d, EXTRACT(ISODOW FROM gs)::smallint AS dow
    FROM generate_series((SELECT d FROM since_date), current_date - 1, '1 day'::interval) gs
  ),
  -- Occurrences attendues (récurrentes + one-off dans la fenêtre)
  expected AS (
    SELECT ts.id AS slot_id, d.d AS scheduled_date, ts.day_of_week,
           ts.start_time, ts.end_time, ts.location
    FROM training_slots ts
    JOIN dates d ON d.dow = ts.day_of_week
    WHERE ts.is_active = true
      AND ts.session_type = 'swim'
      AND ts.scheduled_date IS NULL
    UNION ALL
    SELECT ts.id, ts.scheduled_date, ts.day_of_week,
           ts.start_time, ts.end_time, ts.location
    FROM training_slots ts
    WHERE ts.is_active = true
      AND ts.session_type = 'swim'
      AND ts.scheduled_date IS NOT NULL
      AND ts.scheduled_date >= (SELECT d FROM since_date)
      AND ts.scheduled_date <  current_date
  ),
  -- Occurrences annulées via override
  cancelled AS (
    SELECT slot_id, override_date
    FROM training_slot_overrides
    WHERE status = 'cancelled'
      AND override_date >= (SELECT d FROM since_date)
      AND override_date <  current_date
  ),
  -- Occurrences déjà servies
  assigned AS (
    SELECT DISTINCT training_slot_id AS slot_id, scheduled_date
    FROM session_assignments
    WHERE training_slot_id IS NOT NULL
      AND assignment_type = 'swim'
      AND status <> 'cancelled'
      AND scheduled_date >= (SELECT d FROM since_date)
      AND scheduled_date <  current_date
  )
  SELECT e.slot_id, e.scheduled_date, e.day_of_week,
         e.start_time, e.end_time, e.location
  FROM expected e
  WHERE NOT EXISTS (
    SELECT 1 FROM cancelled c
    WHERE c.slot_id = e.slot_id AND c.override_date = e.scheduled_date
  )
  AND NOT EXISTS (
    SELECT 1 FROM assigned a
    WHERE a.slot_id = e.slot_id AND a.scheduled_date = e.scheduled_date
  )
  ORDER BY e.scheduled_date DESC, e.start_time;
$$;

GRANT EXECUTE ON FUNCTION get_unassigned_slot_instances_30d() TO authenticated;
```

**Wrapper API** : `getUnassignedSlots30d()` dans `src/lib/api/assignments.ts` (module déjà dédié aux slots/assignments).

```ts
export async function getUnassignedSlots30d(): Promise<Array<{
  slot_id: string;
  scheduled_date: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  location: string | null;
}>>
```

Re-exports dans `src/lib/api/index.ts` et `src/lib/api.ts`.

## UI — Section accordéon

Insertion dans `src/pages/Coach.tsx` `CoachHome` **entre Section B (Ma semaine) et Section D (Accès rapides)**.

### Hiérarchie visuelle

- Réutilise `<SectionLabel>` existant : `CRÉNEAUX À COMPLÉTER`.
- Carte principale = `button` ambre si N>0, verte si N=0, cliquable pour plier/déplier.

### État replié

```
┌──────────────────────────────────────────────────┐
│ ⚠️  12 créneaux à compléter (30 derniers jours) ▼ │
└──────────────────────────────────────────────────┘
```

Icône `AlertCircle`, classes ambre (cohérence avec le footer "Ma semaine"). Chevron rotate sur expand.

### État déplié

Liste groupée par semaine ISO (plus récente en premier), chaque ligne = bouton.

```
┌──────────────────────────────────────────────────┐
│ ⚠️  12 créneaux à compléter (30j)              ▲ │
├──────────────────────────────────────────────────┤
│ Semaine du 14 avr.                               │
│   Mar. 15 avr.  18h-20h  Piscine Erstein     ›  │
│   Jeu. 17 avr.  06h-08h  Piscine Erstein     ›  │
│ Semaine du 7 avr.                                │
│   Lun. 7 avr.   18h-20h  Piscine Erstein     ›  │
│   …                                              │
└──────────────────────────────────────────────────┘
```

### État vide

```
┌──────────────────────────────────────────────────┐
│ ✅ Tous les créneaux des 30 derniers jours       │
│    sont assignés                                 │
└──────────────────────────────────────────────────┘
```

Classes vertes (`emerald-50/70`). Pas d'interaction (pas de chevron).

### État de chargement

Placeholder compact (skeleton une ligne) tant que la query n'a pas répondu, pour éviter le flash "Aucun" → "N créneaux".

## Navigation — deep-link semaine

### Modèle d'état

`src/pages/coach/coachRouteState.ts` :

```ts
export type CoachRouteState = {
  section: CoachSection;
  tab?: CoachCommsTab;
  athleteId?: number | null;
  weekDate?: string;  // YYYY-MM-DD, uniquement pour section="week"
};
```

- `parseCoachHashLocation` : lit `weekDate` si `section === "week"` et format valide, sinon `undefined`.
- `buildCoachHash` : écrit `weekDate` si `section === "week"` et défini, sinon delete.
- Les autres sections déchargent `weekDate` (comme `tab`/`athleteId` pour non-comms).

### Propagation

- `Coach.tsx` route racine : quand `activeSection === "week"`, passe `initialWeekDate={routeState.weekDate}` à `CoachWeekView`.
- `CoachWeekView` : prop `initialWeekDate?: string`, propagée à `CoachTrainingSlotsScreen`.
- `CoachTrainingSlotsScreen` : `useState` d'init calcule le lundi à partir de `initialWeekDate` si présent :

```ts
const [weekMonday, setWeekMonday] = useState(() =>
  getMonday(initialWeekDate ? new Date(initialWeekDate + "T00:00:00") : new Date())
);
```

Pas de `useEffect` pour re-sync sur changement de prop : le user navigue une fois depuis la home, puis les boutons prev/next/today reprennent le contrôle local. Si on re-clique sur un créneau en mode week, la prop change et on veut bien que la semaine affichée change — on ajoute donc un `useEffect` simple qui re-aligne `weekMonday` quand `initialWeekDate` change entre deux renders.

### Handler au clic

Dans `CoachHome`, on ajoute un callback `onOpenWeekAt(date: string)` propagé par `Coach.tsx` qui met à jour `routeState` :

```ts
setRouteState({ section: "week", weekDate });
```

Le tri client-side sur le lundi ISO est fait dans la home (pour le groupage visuel) — pas besoin de calculer le lundi côté RPC.

## Fichiers touchés

| Fichier | Type | Remarque |
|---|---|---|
| `supabase/migrations/00117_unassigned_slot_instances_30d.sql` | Nouveau | RPC + GRANT |
| `src/lib/api/assignments.ts` | Modif | +`getUnassignedSlots30d()` (~25 lignes) |
| `src/lib/api/index.ts` | Modif | Re-export |
| `src/lib/api.ts` | Modif | Façade |
| `src/pages/coach/coachRouteState.ts` | Modif | Champ `weekDate` |
| `src/pages/Coach.tsx` | Modif | Section accordéon + prop `initialWeekDate` + handler `onOpenWeekAt` |
| `src/pages/coach/CoachWeekView.tsx` | Modif | Prop `initialWeekDate` |
| `src/pages/coach/CoachTrainingSlotsScreen.tsx` | Modif | Init `weekMonday` depuis prop + re-sync effect |

## Tests

- **RLS intégration** : la RPC est `SECURITY DEFINER` et lit des tables sous RLS. Ajouter un test `supabase/tests/rls/coach_unassigned_slots.test.ts` qui vérifie qu'un coach voit bien les slots du club (ou un test plus simple : la RPC retourne des lignes). Lancer `npm run test:rls` après migration.
- **Unit (Vitest)** : pas de logique pure isolable côté client (tout est SQL + intégration UI). Un test sur le parsing de `weekDate` dans `coachRouteState.ts` est utile (round-trip `build` ↔ `parse`).

## Hors scope

- Pas de pagination (max 30j × ~6 slots = ~25 items, scroll natif suffit).
- Pas de filtre par groupe/lieu (liste simple).
- Pas de "marquer comme intentionnellement vide" (non demandé).
- Pas de notification push quand N franchit un seuil (non demandé).

## Risques et mitigations

- **Perf RPC** : `generate_series` sur 30 jours × `training_slots` (quelques dizaines de lignes) + `NOT EXISTS` — coût négligeable. STABLE + SECURITY DEFINER cohérent avec §00121.
- **Timezone** : le RPC utilise `current_date` (UTC serveur Supabase). Pour un club en Europe/Paris, un slot du 19 avril à 23h UTC tombe déjà le 20 local — mais puisqu'on reste à la granularité date ISO (sans heure), l'écart est sans impact sur le comptage des occurrences passées.
- **Régression "Ma semaine"** : la nouvelle section consomme une query dédiée, indépendante des queries existantes. Aucun partage d'état.
