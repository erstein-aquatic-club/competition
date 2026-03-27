# Design — Planification muscu par nageur (dossiers hiérarchiques)

**Date :** 2026-03-27
**Chantier :** Intégration macro-cycles musculation dans la bibliothèque coach

## Contexte

Le coach prépare des plans de musculation périodisés par nageur (ex: Force Max → Puissance → Taper → Compétition). Chaque phase contient des séances avec des charges spécifiques définies manuellement. Aujourd'hui les dossiers de séances sont plats et globaux — pas de notion de nageur ni d'imbrication.

## Décisions

- **Approche B retenue** : dossiers liés à un nageur (athlete_id) avec imbrication (parent_id)
- **Charges manuelles** : le coach définit directement sets/reps/%1RM dans chaque séance, pas de calcul automatique
- **Phase 1** : outil coach uniquement. Phase 2 : vue nageur "Mon plan"

## 1. Modèle de données

### Migration sur `strength_folders`

```sql
ALTER TABLE strength_folders
  ADD COLUMN parent_id INTEGER REFERENCES strength_folders(id) ON DELETE CASCADE,
  ADD COLUMN athlete_id INTEGER REFERENCES users(id) ON DELETE CASCADE;
```

- `athlete_id` : porté par le dossier racine du nageur. Les sous-dossiers héritent via `parent_id`.
- `parent_id` : permet l'imbrication nageur → cycles → (sous-dossiers optionnels).
- Les dossiers sans `athlete_id` ni `parent_id` = bibliothèque commune (rétro-compatible).
- Contrainte app : un sous-dossier ne peut pas pointer vers un parent d'un autre nageur.

### Structure type

```
strength_folders:
  id=10, name="François Wagner", athlete_id=42, parent_id=NULL, type='session'
  id=11, name="Force Max (S1-S3)", athlete_id=NULL, parent_id=10, type='session'
  id=12, name="Puissance (S4-S6)", athlete_id=NULL, parent_id=10, type='session'
  id=13, name="Taper (S7-S8)", athlete_id=NULL, parent_id=10, type='session'

strength_sessions:
  id=100, name="Lundi — Tractions + Squat", folder_id=11
  id=101, name="Mardi — Deadlift + Bench Pull", folder_id=11
  ...
```

## 2. UX Coach — Catalogue muscu

### Filtre par nageur

- Select en haut du catalogue : "Bibliothèque commune" (défaut) | liste des nageurs
- Quand un nageur est sélectionné, affiche uniquement ses dossiers perso (2 niveaux : racine → cycles)
- Bouton "Créer un plan" crée le dossier racine + un premier sous-dossier cycle

### Navigation

```
[Bibliothèque commune ▾]  →  dossiers globaux (existant, inchangé)
[François Wagner ▾]       →  📁 Force Max (S1-S3)
                               💪 Lundi — Tractions + Squat
                               💪 Mardi — Deadlift + Bench Pull
                              📁 Puissance (S4-S6)
                               💪 Lundi — Power Clean + Tractions
                              📁 Taper (S7-S8)
                               💪 ...
```

### Gestion des dossiers

- Ajouter/renommer/supprimer des sous-dossiers (cycles)
- Créer des séances directement dans un sous-dossier
- Dupliquer une séance de la bibliothèque commune vers un dossier nageur
- Assignation rapide : bouton "Assigner" sur chaque séance → crée une assignation datée pour ce nageur

## 3. Copie inter-nageurs

Trois niveaux de copie (copies indépendantes, pas de lien) :

| Action | Ce qui est copié |
|--------|-----------------|
| Copier une séance | 1 séance + ses items → vers un dossier cible |
| Copier un sous-dossier (cycle) | Le dossier + toutes ses séances |
| Copier le plan complet d'un nageur | Dossier racine + tous sous-dossiers + toutes séances |

### UX

- Menu contextuel (⋯) sur un dossier ou une séance → "Copier vers…"
- Sheet/dialog : choix du nageur cible, puis dossier cible (ou "Nouveau dossier")
- Toast de confirmation

### API

- `duplicateStrengthSession(sessionId, targetFolderId)` → copie session + items
- `duplicateFolder(folderId, targetAthleteId, targetParentId?)` → copie dossier + séances
- `duplicateAthletePlan(sourceAthleteId, targetAthleteId)` → copie arborescence complète

## 4. Phase 2 — Vue nageur "Mon plan" (futur)

Non implémenté en phase 1. Prévision :

- Nouvel onglet "Mon plan" dans la page Strength
- Affiche les dossiers perso du nageur (cycles) en lecture seule
- Chaque cycle pliable, montre séances avec exercices/charges
- Le nageur peut démarrer une séance depuis cette vue (même flow que l'assignation)
- Badge sur le cycle courant (basé sur la date ou sélection manuelle)
- Pas de modification côté nageur — charges gérées par le coach

## 5. Rétro-compatibilité

- Les dossiers existants (sans parent_id ni athlete_id) restent inchangés
- L'UI "Bibliothèque commune" est la vue par défaut (comportement actuel)
- Aucun impact sur le flow d'assignation existant
- Les séances dans des dossiers nageur restent visibles dans le catalogue global si besoin
