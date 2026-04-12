# Design — Restructuration bibliothèque musculation nageur (§93)

**Date** : 2026-03-28
**Statut** : Validé

## Contexte

L'onglet "S'entraîner" de la page Musculation nageur affiche toutes les séances à plat (assignées + catalogue). C'est brouillon. On restructure avec des dossiers et on rend visibles les plans personnalisés des autres nageurs.

## Décisions

- **Approche** : Nouveau composant `SessionBrowser` remplace `SessionList` (approche 2 — composants modulaires)
- **3 sections verticales** : Séances non classées → Bibliothèque commune (dossiers coach) → Plans d'équipe (par nageur)
- **Dossiers communs** : Réutilise les `strength_folders` globaux (sans `athlete_id`) créés par le coach
- **Plans d'équipe** : Réutilise `MyPlanTab` tel quel pour chaque nageur ayant un plan
- **Nageur courant exclu** des plans d'équipe (il a son onglet "Mon plan")
- **Onglets "Mon plan" et "Historique"** : inchangés

## Architecture composants

```
SessionBrowser.tsx (orchestrateur)
├── InProgressCard (séance en cours — extrait de SessionList)
├── CycleSelector (3 boutons cycle — extrait de SessionList)
├── SearchBar (recherche globale — filtre les 3 sections)
├── UnfiledSessionList (séances sans folder_id — liste plate)
├── CommonFolderList (dossiers globaux coach — accordéons)
│   └── FolderAccordion (dossier → liste de séances)
└── TeamPlansSection (plans personnalisés des autres nageurs)
    └── MyPlanTab (réutilisé, un par nageur)
```

## Données

### Queries React Query
- `["strength_catalog"]` — existant, toutes les séances
- `["strength_folders", "session", null]` — dossiers globaux (existant)
- `["team_athlete_plans", userId]` — nouveau, plans des autres nageurs

### Nouvelle API : `getTeamAthletePlans(excludeAthleteId: number)`
- Fetch `strength_folders` type `session` avec `athlete_id IS NOT NULL` et `!= excludeAthleteId`
- Join sur `users` pour récupérer le prénom
- Retourne `{ athleteId: number; athleteName: string; folders: StrengthFolder[] }[]`
- Groupé par nageur, trié alphabétiquement

### Pas de modif DB
- Réutilise `strength_folders` et `strength_sessions` tels quels
- Pas de migration nécessaire
- Pas de changement RLS

## Rendu visuel

### Ordre vertical
1. Séance en cours (card primaire, si applicable)
2. Cycle selector (3 boutons)
3. Barre de recherche (si > 4 séances total)
4. **Séances non classées** — liste plate, pas de header
5. **Bibliothèque** — header uppercase, accordéons par dossier
6. **Plans d'équipe** — header uppercase, bloc par nageur (fermé par défaut)

### Bibliothèque commune
- Accordéons fermés par défaut
- Icône dossier + nom + badge compteur
- Sous-dossiers en sous-sections indentées

### Plans d'équipe
- Bloc par nageur : initiale/avatar + prénom
- Contenu = `MyPlanTab` (timeline phase, couleurs, dots)
- Fermé par défaut, dépliable

### Interactions
- Clic séance non classée/bibliothèque → `onStartCatalog`
- Clic séance assignée → `onStartAssignment`
- Clic séance plan d'équipe → `startPlanSession` (cycle de la séance)

## Fichiers impactés

| Fichier | Action |
|---------|--------|
| `src/components/strength/SessionBrowser.tsx` | Nouveau — orchestrateur |
| `src/components/strength/CommonFolderList.tsx` | Nouveau — accordéons dossiers |
| `src/components/strength/TeamPlansSection.tsx` | Nouveau — plans d'équipe |
| `src/components/strength/UnfiledSessionList.tsx` | Nouveau — séances non classées |
| `src/components/strength/InProgressCard.tsx` | Extrait de SessionList |
| `src/components/strength/CycleSelector.tsx` | Extrait de SessionList |
| `src/lib/api/strength.ts` | Ajout `getTeamAthletePlans` |
| `src/lib/api/index.ts` + `src/lib/api.ts` | Re-export |
| `src/pages/Strength.tsx` | Branche SessionBrowser |

## Ce qu'on ne fait pas
- Pas de modif sur l'onglet "Mon plan"
- Pas de modif sur l'onglet "Historique"
- Pas de modif côté coach
- Pas de nouvelle table DB
