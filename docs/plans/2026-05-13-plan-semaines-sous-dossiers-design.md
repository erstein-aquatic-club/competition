# Design — Semaines comme sous-dossiers des plans muscu

*Date : 2026-05-13*

## Contexte

Les plans d'entraînement génériques (`training_plans`) ont une grille N semaines × 7 jours.
Les séances référencées dans `training_plan_sessions` pointent vers des `strength_sessions`
qui peuvent avoir un `folder_id`. Actuellement aucun lien automatique n'existe entre un plan
et la structure de dossiers de la biblio séances.

Objectif : créer automatiquement un dossier racine + N sous-dossiers "Semaine 1"…"Semaine N"
à la création du plan, les maintenir synchronisés avec le plan, et copier chaque séance choisie
dans le bon sous-dossier semaine au moment de l'assignation.

---

## Structure de données

### Migration SQL

```sql
ALTER TABLE training_plans
  ADD COLUMN folder_id INT REFERENCES strength_folders(id) ON DELETE SET NULL;
```

### Hiérarchie de dossiers créée

```
strength_folders
  ├── "Prépa Sprint 50m"  (type=session, athlete_id=NULL, parent_id=NULL)
  │     ├── "Semaine 1"   (parent_id=<racine.id>)
  │     ├── "Semaine 2"   (parent_id=<racine.id>)
  │     └── "Semaine 3"   (parent_id=<racine.id>)

training_plans
  └── id=1, name="Prépa Sprint 50m", folder_id=<racine.id>
```

### Synchro plan ↔ dossier

| Mutation plan | Action dossiers |
|---|---|
| Création (N semaines) | Créer racine + N sous-dossiers "Semaine 1"…"Semaine N" |
| Renommer le plan | `renameStrengthFolder(folder_id, nouveau_nom)` |
| Ajouter une semaine | Créer sous-dossier "Semaine N+1" |
| Supprimer la dernière semaine | Supprimer sous-dossier + ses séances (après confirmation) |
| Supprimer le plan | `ON DELETE SET NULL` sur `folder_id` → dossier orphelin (à nettoyer manuellement) |

---

## Assignation session → slot

Flux actuel : `picker → upsertTrainingPlanSession(session_template_id)`

Nouveau flux :
1. Coach sélectionne une séance dans le picker
2. `duplicateStrengthSession(originalId, weekSubFolderId)` → copie dans "Semaine W"
3. `upsertTrainingPlanSession(plan_id, relative_week, day_of_week, copie.id)`

Chaque slot a sa propre copie modifiable. L'original reste inchangé dans la biblio.

---

## Composants impactés

### `src/lib/api/strength.ts`
- Nouvelle fonction `createPlanFolderStructure(planId, planName, numWeeks)` : crée dossier racine + sous-dossiers, met à jour `training_plans.folder_id`
- Nouvelle fonction `getPlanWeekFolders(planFolderId)` : retourne les sous-dossiers d'un plan, triés par semaine
- Modifier `updateTrainingPlan()` (ou wrapper côté mutation) pour appeler `renameStrengthFolder` si le nom change

### `supabase/migrations/00XXX_plan_folder_id.sql`
- `ALTER TABLE training_plans ADD COLUMN folder_id ...`

### `src/components/coach/strength/TrainingPlansBrowser.tsx`
- `CreatePlanDialog` : après création, appeler `createPlanFolderStructure`
- `addWeekMut` : créer "Semaine N+1" après `updateTrainingPlan`
- `removeLastWeekMut` : supprimer sous-dossier semaine + séances dans la confirmation
- `handlePick` : remplacer `upsertTrainingPlanSession` direct par copie + upsert
- Renommage plan (onBlur) : appeler `renameStrengthFolder` si `folder_id` présent
- Picker : afficher hiérarchie dossier → sous-dossier semaine → séances

### `src/pages/coach/StrengthCatalog.tsx`
- Rendu récursif des dossiers : sous-dossiers `FolderCard variant="nested"` à l'intérieur des dossiers racines

---

## Compatibilité plans existants

Les plans sans `folder_id` (plans antérieurs à cette migration) continuent de fonctionner :
- Picker : référence directe sans copie (comportement actuel inchangé)
- Pas de migration de données rétroactive

---

## Périmètre exclu

- Nettoyage automatique du dossier à la suppression du plan (risque de perte de données — ON DELETE SET NULL suffit)
- Sous-dossiers "jour" à l'intérieur des semaines (YAGNI)
- Plans athlete-specific (scope : plans globaux uniquement)
