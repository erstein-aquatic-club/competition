# Design — Créneaux multi-groupes / multi-coachs

**Date** : 2026-04-06
**Statut** : Validé

## Contexte

Le formulaire de gestion des créneaux d'entraînement utilise un modèle en lignes (1 ligne = 1 groupe + 1 coach + lignes d'eau). Ce modèle est laborieux à remplir et ne reflète pas la réalité métier : les groupes et coachs sont des listes indépendantes, et les lignes d'eau sont un nombre global au créneau.

## Modèle de données

### Avant
- `training_slot_assignments` : `(slot_id, group_id, coach_id, lane_count)`
- UNIQUE `(slot_id, group_id)`
- 1 ligne = 1 groupe + 1 coach + lignes d'eau

### Après
- `training_slot_assignments` : `(slot_id, group_id)` — coach_id et lane_count retirés
- Nouvelle table `training_slot_coaches` : `(slot_id, coach_id)` — UNIQUE `(slot_id, coach_id)`
- `lane_count` migre sur `training_slots` (global au créneau)
- Groupes et coachs sont des listes indépendantes

### Migration
1. Ajouter colonne `lane_count SMALLINT` à `training_slots`
2. Migrer les lane_count existants (MAX par slot)
3. Créer table `training_slot_coaches`
4. Migrer les coach_id existants depuis `training_slot_assignments`
5. Supprimer colonnes `coach_id` et `lane_count` de `training_slot_assignments`

## UI du formulaire (SlotFormSheet)

Le formulaire à lignes répétées est remplacé par 4 sections empilées :

1. **Infos du créneau** — Jour, horaire début/fin, lieu (inchangé)
2. **Groupes** — Multi-select chips (cocher/décocher les groupes disponibles)
3. **Lignes d'eau** — Input numérique (nombre global)
4. **Coachs** — Multi-select chips (même pattern que les groupes)

## Impact aval

### Inchangé
- `session_assignments` (assignation séances nage) — pas impacté
- `resolveSlotAssignment` — utilise `slot.assignments[].group_id` → même source
- `bulkCreateSlotAssignments` — utilise `inst.groups.map(g => g.group_id)` → même source
- Badges groupes sur timeline — alimentés par `slot.assignments`
- Vues semaine/calendrier — seule la lecture des coachs change de source

### Modifié
- `TrainingSlot` type — ajout `coaches: TrainingSlotCoach[]` et `lane_count: number | null`
- `TrainingSlotAssignment` type — suppression `coach_id`, `coach_name`, `lane_count`
- `TrainingSlotInput` type — `assignments` devient `group_ids: number[]`, ajout `coach_ids: number[]`, `lane_count`
- `getTrainingSlots()` — JOIN supplémentaire sur `training_slot_coaches`
- `createTrainingSlot()` / `updateTrainingSlot()` — insère dans 2 tables au lieu d'1
- `CoachTrainingSlotsScreen` — nouveau SlotFormSheet avec multi-select
- Timeline slots — affichage coachs depuis `slot.coaches` au lieu de `slot.assignments[].coach_name`
