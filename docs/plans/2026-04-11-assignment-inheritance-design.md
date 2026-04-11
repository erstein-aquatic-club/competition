# Design — Refonte Système d'Assignation avec Héritage

**Date** : 2026-04-11
**Contexte** : Le système actuel réduit les créneaux à AM/PM, ne supporte pas l'héritage de séance pour les créneaux perso, ni la priorité individuel > groupe, ni les sous-groupes multi-séances.

---

## Principes

1. **Slot réel** — l'identifiant devient `training_slot_id + date`, pas "morning/evening"
2. **Héritage créneau perso** — un nageur avec `swimmer_training_slot` hérite de la séance groupe du `training_slot` source
3. **Priorité individuel > sous-groupe > groupe** — order-independent
4. **Multi-séances par slot** — N séances pour N sous-groupes, nageur voit la sienne pré-sélectionnée mais peut changer
5. **Feedback lié à l'assignment** — `dim_sessions.assignment_id` FK

## Changements DB

### Migration `00086_assignment_inheritance.sql`

1. `dim_sessions` : ajout `assignment_id INTEGER REFERENCES session_assignments(id) ON DELETE SET NULL`
2. Remplacer le UNIQUE dedup : `(athlete_id, session_date, assignment_id)` WHERE assignment_id IS NOT NULL
3. `session_assignments` : ajout `target_subgroup_id INTEGER REFERENCES groups(id) ON DELETE SET NULL`

### Bugs audit #4 corrigés dans la même migration

4. RLS `interviews` : restreindre au coach assigné (pas tous les coachs)
5. Fix `save_strength_run_atomic` : warning si assignment supprimé (pas silent 0 rows)

## Logique de résolution

### `resolveSwimmerAssignments(userId, date)` (nouveau helper API)

```
Pour chaque swimmer_training_slot du nageur pour ce jour :
  1. Chercher assignation individuelle (target_user_id = userId) sur ce slot+date
     → Si trouvée : source = "individual", c'est elle
  2. Sinon : remonter au training_slot source (via source_assignment_id)
     → Chercher assignation groupe pour ce training_slot_id + date
     → Si trouvée : source = "group", héritage
  3. Si sous-groupes : filtrer par sous-groupe du nageur
     → Les autres = alternatives

Retour : [{
  slotTime, assignedSession, source, assignmentId, alternatives[]
}]
```

### Priorité (order-independent)

- INSERT individuel APRÈS groupe : individuel écrase (pas de suppression DB, juste priorité à la résolution)
- INSERT groupe APRÈS individuel : groupe ignoré à la résolution (l'individuel existe déjà)
- Pas de modification des mutations existantes — la priorité est UNIQUEMENT à la lecture

## Frontend

### Dashboard nageur
- `useDashboardState` : remplacer `slotKey = AM/PM` par `slotId = training_slot_id`
- Afficher l'heure du créneau (17h-18h) sur chaque card
- Si alternatives : picker discret pour changer de séance
- Badge "Séance personnalisée" si source = "individual"
- Feedback sauvé avec `assignment_id`

### Coach UI
- `CoachSlotCalendar` : option sous-groupe dans SlotSessionSheet
- Indicateur visuel quand une exception individuelle existe sur un slot

## Fichiers impactés

| Fichier | Changement |
|---------|------------|
| `supabase/migrations/00086_assignment_inheritance.sql` | Schema + RLS + RPC fix |
| `src/lib/api/assignments.ts` | `resolveSwimmerAssignments()` helper |
| `src/hooks/useDashboardState.ts` | Slot réel au lieu de AM/PM, alternatives |
| `src/components/dashboard/FeedbackDrawer.tsx` | Heure créneau, picker alternatives, `assignment_id` au save |
| `src/pages/Dashboard.tsx` | Adapter au nouveau format de slots |
| `src/pages/coach/SlotSessionSheet.tsx` | Sélecteur sous-groupe |
| `src/lib/api/strength.ts` | RPC fix (assignment deleted warning) |
| `src/lib/auth.ts` | (déjà corrigé) |

## Use case futur

Prédiction de présence : `swimmer_training_slots` actifs par jour → liste des présents attendus par tranche horaire. Pas implémenté dans ce chantier.
