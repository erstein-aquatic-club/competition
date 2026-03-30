# Design — Détail historique séances musculation

**Date** : 2026-03-30
**Statut** : Validé

## Contexte

L'historique des séances musculation (`HistoryTable.tsx`) affiche une liste plate : date, statut, nombre de séries, durée, ressenti. Les données détaillées (poids, reps, difficulté, RPE par set) sont déjà chargées via `getStrengthHistory()` mais non exploitées côté UI.

## Objectif

Permettre à l'athlète d'ouvrir une séance passée pour voir :
1. Un résumé inline (exercices + charge)
2. Un détail complet (stats performance + ressenti + sets)

## Design

### Niveau 1 — Expandable inline

La carte existante devient cliquable. Au tap, un panneau se déplie en dessous (AnimatePresence + motion.div) :

- **Exercices** — liste de noms en pills/tags compacts
- **sRPE** — icône Zap + valeur (durée × RPE), calculé via `computeSRPE()` de `trainingLoadHelpers.ts`
- **Tonnage** — icône Weight + somme(poids × reps) formatée
- **Bouton "Voir détails"** — ouvre le Sheet (niveau 2)

Le chevron sur la carte indique l'état expand/collapse.

### Niveau 2 — Bottom Sheet détail complet

Sheet Shadcn (side="bottom") avec 3 sections :

#### Header
- Date complète + heure de début
- Badge statut coloré (réutilise `statusStyle` existant)
- Durée totale

#### Section Performance (KPI cards horizontales)
4 cards compactes `bg-muted/40 rounded-lg` :
- Tonnage total (kg)
- Nombre de séries
- Nombre de reps
- sRPE

#### Section Exercices (liste détaillée)
Pour chaque exercice regroupé depuis les logs :
- Nom exercice en bold
- Chaque série : poids × reps + indicateur difficulté (1-5 dots colorées vert→orange→rouge)
- Sous-total : volume par exercice + poids max

#### Section Ressenti
- RPE, Fatigue, Feeling en 3 mini-gauges visuelles
- Difficulté moyenne (agrégée des sets)
- Commentaires/notes si présents

## Approche technique

**Approche A — Tout côté client** (validée) :
- Les logs sont déjà dans la réponse de `getStrengthHistory()` (champ `logs` ou `strength_set_logs`)
- Calculs en mémoire : tonnage = Σ(weight × reps), sRPE = computeSRPE(rpe, duration)
- Regroupement exercices via `exercise_id` + lookup dans le cache `exercises`
- Zéro appel API supplémentaire

## Fichiers impactés

| Fichier | Action |
|---------|--------|
| `src/components/strength/HistoryTable.tsx` | Ajouter expand inline + chevron + état |
| `src/components/strength/RunDetailSheet.tsx` | **Nouveau** — Bottom sheet détail complet |
| `src/lib/strengthHistoryUtils.ts` | **Nouveau** — Helpers calcul (tonnage, groupByExercise, etc.) |

## Composants UI utilisés
- `Sheet` (Shadcn/Radix) — bottom sheet
- `motion.div` + `AnimatePresence` (framer-motion) — expand/collapse
- Icônes Lucide : Zap, Weight, ChevronDown, Flame, Activity, MessageSquare
