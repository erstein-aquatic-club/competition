# Design — Vue nageur planification nage

**Date :** 2026-04-10
**Statut :** Validé

## Contexte

Ajouter une vue "nageur" read-only de la planification natation, accessible en preview depuis la page coach. Le nageur voit un calendrier synthétique de 3 semaines avec les filières assignées, et peut cliquer sur chaque filière pour voir sa description, exemples d'exercices, et détails techniques.

## 1. Table `swim_filieres`

```sql
id          text PRIMARY KEY  -- "entretien-aerobie", etc.
name        text NOT NULL
short_name  text NOT NULL
color       text NOT NULL     -- "sky", "emerald", etc.
description text              -- notes génériques coach
examples    text              -- exemples d'exercices
sort_order  smallint DEFAULT 0
```

Pré-peuplée avec les 8 filières existantes via seed dans la migration.

## 2. Données techniques du guide (hardcodées)

Enrichir `swimFilieres.ts` avec un objet `technicals` par filière contenant : FC, lactates, effort perçu, durée série, distances, répétitions, intensité VMA, récupération, formes de travail.

## 3. Bouton preview côté coach

Bouton icône (Eye) "Vue nageur" dans le header de SwimPlanningDemo.tsx, à côté du badge Demo.

## 4. Vue nageur — calendrier 3 semaines à plat

Composant `SwimPlanningAthleteView.tsx` affiché en overlay/modal.

- 3 semaines : courante + 2 suivantes
- Header par semaine : numéro ISO, dates lun-sam, badge type
- Grille 6 jours × 2 colonnes (Matin / Soir)
- Chips filière colorés, read-only
- Icône lien discrète si séance liée
- Semaine courante mise en évidence

## 5. Bottom sheet filière (tap sur chip)

**Section haute (toujours visible) :**
- Nom complet + dot coloré
- Description (depuis swim_filieres.description)
- Exemples d'exercices (depuis swim_filieres.examples)

**Section basse (accordéon "Détails techniques") :**
- Grille 2 colonnes : FC, lactates, effort perçu, durée, distances, répétitions, intensité, récupération, formes de travail

## Fichiers

| Action | Fichier |
|--------|---------|
| Créer | `supabase/migrations/00072_swim_filieres.sql` |
| Créer | `src/lib/api/swim-filieres.ts` |
| Créer | `src/pages/coach/SwimPlanningAthleteView.tsx` |
| Modifier | `src/lib/swimFilieres.ts` (ajouter technicals) |
| Modifier | `src/lib/api/types.ts` (SwimFiliere type) |
| Modifier | `src/lib/api/index.ts` + `api.ts` (facade) |
| Modifier | `src/pages/coach/SwimPlanningDemo.tsx` (bouton preview) |
