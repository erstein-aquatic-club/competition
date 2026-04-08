# Rest Screen Improvements — Design Document

**Date** : 2026-04-08
**Scope** : RestScreen (mode focus musculation) — 5 améliorations UX

## Contexte

L'écran de récupération (`RestScreen`) s'affiche entre chaque série/exercice en mode focus musculation. Il contient un timer circulaire + 3 onglets swipables (Exercice, Séance, Perfs). Plusieurs irritants UX identifiés.

## 1. Progression série en cours + estimation temps restant

**Problème** : Le nageur ne voit pas clairement où il en est dans ses séries (ex: série 4/5) ni combien de temps il reste dans la séance.

**Solution** : Enrichir `RestSessionTab` avec :
- **Pastilles de série** : indicateurs visuels ●●●○○ sous la barre de progression globale, séries complétées en `primary`, restantes en `muted`. Label "Série 3/5".
- **Estimation temps restant** : calcul `(séries restantes × repos moyen) + (exercices restants × repos inter-exercice)`. Affiché sous la barre : "~12 min restantes".

**Props ajoutées à RestSessionTab** : `currentSetIndex`, `totalSets`, `restDurations` (set/exercise).

## 2. Notes perso éditables

**Problème** : L'onglet Exercice affiche la note coach en lecture seule. Le nageur ne peut pas ajouter ses propres notes pendant le repos.

**Solution** : Ajouter un bloc "Ma note" sous la note coach dans `RestExerciseTab` :
- Textarea auto-resize (max 3 lignes), style dashed
- Debounce 800ms avant appel `onUpdateNote` (même pattern que WorkoutRunner)
- Icône `Pencil`

**Props ajoutées** : `athleteNote: string`, `onUpdateNote: (exerciseId: number, note: string | null) => void`, `exerciseId: number`.

## 3. Conflit scroll vertical / swipe horizontal

**Problème** : `overflow-y-auto` sur le conteneur des tabs capture les gestes tactiles verticaux et empêche le swipe latéral.

**Solution** : Détection directionnelle au touchstart/touchmove :
- Capture point de départ du touch
- Sur les premiers ~10px de mouvement, déterminer l'intention (ratio deltaX/deltaY)
- Si horizontal → lock scroll vertical + déclencher swipe
- Si vertical → laisser scroll natif, ignorer swipe

Implémentation dans `useSwipeNavigation` ou directement dans le conteneur RestScreen.

## 4. GIF en full ratio

**Problème** : Le conteneur GIF (`h-[170px] max-w-[260px]` + `object-cover`) crop les GIFs rectangulaires.

**Solution** :
- `object-cover` → `object-contain`
- Conteneur : `h-[170px]` → `max-h-[220px]`, `max-w-[260px]` → `max-w-[300px]`
- Fond `bg-muted/20` pour les bandes vides
- Placeholder adapté en conséquence

## 5. Sparkline 1RM + détail complet

**Problème** : L'onglet Perfs montre le 1RM actuel mais pas l'évolution dans le temps.

**Solution** :
- **Mini sparkline** inline (~80px haut) via `recharts` AreaChart sans axes — données 3 mois via `useExerciseHistory`
- Label "Évolution 1RM" + delta ("+5.2 kg") à droite
- **Tap** → ouvre `ExerciseProgressChart` (bottom sheet existant complet)
- Cache React Query (`staleTime: 60_000`) évite les requêtes répétées entre séries

**Props ajoutées à RestScreen/RestPerfsTab** : `exerciseId`, `userId`.

## Fichiers impactés

| Fichier | Modifications |
|---------|---------------|
| `src/components/strength/RestScreen.tsx` | Nouvelles props (notes, exerciseId, userId, set progress, rest durations), passage aux sous-composants |
| `src/components/strength/RestExerciseTab.tsx` | Bloc note perso éditable, GIF object-contain |
| `src/components/strength/RestSessionTab.tsx` | Pastilles série, estimation temps restant |
| `src/components/strength/RestPerfsTab.tsx` | Sparkline 1RM, ouverture ExerciseProgressChart |
| `src/components/strength/WorkoutRunner.tsx` | Passer les nouvelles props à RestScreen |
| `src/hooks/useSwipeNavigation.ts` | Détection directionnelle touch (fix conflit scroll/swipe) |
