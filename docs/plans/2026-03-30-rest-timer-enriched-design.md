# Design — Rest Timer enrichi avec tabs swipables

**Date** : 2026-03-30
**Statut** : Validé
**Composant cible** : `src/components/strength/WorkoutRunner.tsx` (section `isResting`)

## Contexte

L'écran de repos entre les séries de musculation est minimaliste : un timer circulaire, un bouton +30s, et une petite card exercice suivant. Pendant les 2-3 minutes de repos, l'utilisateur n'a rien d'utile à consulter.

## Objectif

Enrichir la vue de repos avec des données contextuelles pertinentes, accessibles via un design épuré utilisant des tabs swipables. Hiérarchie des données : Illustration/Notes > Progression séance > Résumé série > Historique perfs.

## Layout

L'écran fullscreen de repos se divise en 2 zones :

- **Zone haute fixe (~35%)** : Timer circulaire SVG (inchangé), boutons +30s et skip, header "Repos"/"Transition" + X
- **Zone basse swipable (~65%)** : 3 pages navigables par swipe horizontal avec dots de pagination centrés entre les deux zones

## Tab 1 — "Exercice" (affichée par défaut)

Remplace la card exercice actuelle en version enrichie :

- **GIF illustration** en grand format (~180px, coins arrondis, centré). Placeholder Dumbbell si absent
- **Nom de l'exercice** — bold, sous le GIF
- **Prescription** — sets × reps, % 1RM, charge cible — ligne compacte
- **Badges muscles** — pills horizontales des `muscle_groups`
- **Notes coach** — texte complet `exerciseNotes[exerciseId]` dans un encart subtle avec icône StickyNote

Label contextuel : "Prochain exercice" si `restType === "exercise"`, sinon "Exercice en cours".

## Tab 2 — "Séance"

Vue d'ensemble de la progression :

- **Barre de progression** horizontale — `progressPct` avec label "X / Y exercices"
- **Résumé dernière série** — card compacte : exercice, set N°, charge × reps (dernier élément de `logs[]`)
- **Volume total** — somme `weight × reps` de tous les logs, affiché en gros (ex: "2 450 kg")
- **Liste exercices** — exercices complétés grisés/barrés en haut, exercices restants avec nom + sets×reps (scrollable)

## Tab 3 — "Perfs"

Données de performance (mémoire uniquement, pas de fetch) :

- **1RM estimé** — valeur `oneRMs` pour l'exercice en cours, affichée en gros
- **Charge cible** — calculée depuis % 1RM de la prescription
- **% de 1RM travaillé** — indicateur visuel du ratio charge loggée / 1RM estimé

## Technique

- **Swipe** : framer-motion `AnimatePresence` + gesture drag (déjà dans le projet)
- **Données** : Toutes disponibles dans les props/state existants de WorkoutRunner (`logs`, `oneRMs`, `exercises`, `exerciseNotes`, `workoutPlan`, `progressPct`). Aucun appel API supplémentaire
- **Dots pagination** : 3 petits cercles, le courant en `primary`, les autres en `muted`
- **Extraction** : Le contenu des 3 tabs sera extrait dans un composant `RestTimerTabs` pour garder WorkoutRunner gérable
