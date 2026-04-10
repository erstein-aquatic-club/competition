# Design — Améliorations vue planification natation

**Date :** 2026-04-10
**Statut :** Validé

## Contexte

Améliorations de la page SwimPlanningDemo existante pour :
1. Rendre les filières visibles sur la card collapsed (mini-dots)
2. Permettre de lier une séance du catalogue nage à chaque slot

## 1. Mini-dots filières sur card collapsed

Sur chaque card semaine (vue macro), après le compteur "X fil.", afficher une rangée de mini-dots colorés (6px) — un par slot rempli, couleur de la filière. Ordre : Lun matin, Lun soir, Mar matin, Mar soir... Max 12 dots.

## 2. Lier une séance depuis le bottom sheet

Le bottom sheet filière existant obtient un bouton "Lier une séance" (visible uniquement quand le slot a une filière). Ce bouton ouvre un second Sheet (picker séances) :
- Liste des séances du catalogue nage via `api.getSwimSessions()`
- Groupées par date, les plus récentes d'abord
- Barre de recherche (filtre par nom)
- Tap = appelle `upsertSwimPlanningSlot(...)` avec `session_id`
- Option "Délier" si déjà liée

## 3. Indicateur séance liée dans la grille micro

Quand un slot a un `session_id`, le chip filière affiche une petite icône lien (Link, ~10px) en coin supérieur droit. Tap ouvre le bottom sheet comme avant.

## 4. Modèle de données

Aucun changement — le champ `session_id uuid NULL` existe déjà.

## Fichiers impactés

| Fichier | Modification |
|---------|-------------|
| `src/pages/coach/SwimPlanningDemo.tsx` | Mini-dots, bouton lier séance, picker, icône lien |
