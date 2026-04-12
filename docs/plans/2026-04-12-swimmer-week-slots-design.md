# Design : Vue semaine créneaux nageur (lecture seule)

**Date** : 2026-04-12

## Objectif

Ajouter une vue hebdomadaire des créneaux d'entraînement en lecture seule sur la home nageur, basée sur la vue coach mobile (`CoachSlotCalendar`).

## Placement

Nouvelle **Section G** après "Accès rapides" (Section F), en bas de `SwimmerHome.tsx`.

## Composant

`src/components/shared/SwimmerWeekSlots.tsx`

### Header

- Titre "Ma semaine"
- Chevrons gauche/droite + bouton "Aujourd'hui" (même pattern que le coach)
- Toggle pill : "Groupe" | "Perso" pour switcher entre créneaux du groupe et créneaux personnalisés (swimmer-slots)

### Grille par jour

Structure verticale identique au coach (jours empilés, cards par créneau) :

- Cards simplifiées read-only :
  - Heure (start–end)
  - Nom de la séance (si publiée) + distance
  - Lieu
  - Badge "Annulé" si créneau annulé (sinon aucun badge)
- Jour d'aujourd'hui en surbrillance (`bg-primary/[0.03]`)
- Créneaux vides : horaire + lieu, texte grisé "Pas de séance"

### Toggle "Perso"

- Affiche les `SwimmerTrainingSlot` du nageur (prop passée depuis SwimmerHome)
- Matérialisation simplifiée par jour de semaine (pas d'overrides/assignments)

## Ce qu'on ne fait PAS

- Pas de bottom sheet au tap (read-only)
- Pas de badges draft/published (nageur ne voit que published, cancelled, empty)
- Pas d'export image
- Pas de lien vers la bibliothèque

## Données

- **Mode "Groupe"** : réutilise `useSlotCalendar()`, filtre les instances non-draft (nageur voit uniquement `published`, `cancelled`, `empty`)
- **Mode "Perso"** : utilise les `swimmerSlots` existants + mini-matérialisation par jour de semaine

## Fichiers impactés

- `src/components/shared/SwimmerWeekSlots.tsx` (nouveau)
- `src/pages/SwimmerHome.tsx` (ajout Section G)
