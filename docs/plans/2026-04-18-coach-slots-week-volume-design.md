# Récapitulatif volume assigné — vue créneaux coach

*Date : 2026-04-18*

## Objectif

Afficher sur la vue créneaux coach (`CoachTrainingSlotsScreen`) le **volume total assigné pour la semaine affichée**, pour donner au coach une lecture rapide de sa charge hebdomadaire planifiée.

## Périmètre

- **Métrique** : distance totale (km) des séances rattachées à un créneau de la semaine affichée.
- **Périodicité** : total de la semaine affichée uniquement (pas de répartition par jour ni par groupe).
- **Inclusions** : créneaux dont l'état est `draft` ou `published` (tout créneau avec une `assignment` liée).
- **Exclusions** : créneaux `empty` (sans séance assignée) et `cancelled` (override annulé).

## Calcul

Dans `src/hooks/useSlotCalendar.ts` :

```ts
const weekTotalDistance = useMemo(
  () => instances.reduce((sum, inst) => {
    if (inst.state === "cancelled" || !inst.assignment) return sum;
    return sum + (inst.assignment.session_distance ?? 0);
  }, 0),
  [instances],
);
```

Exposé via le `return` du hook.

## Affichage

Dans `src/pages/coach/CoachTrainingSlotsScreen.tsx` :

- **Desktop** (~L2696) : badge à droite du bouton "S12 – 13 avril – 19 avril", format `📏 24,5 km` (entier sans décimale si km rond, sinon 1 décimale — `Math.round(m/100)/10`).
- **Mobile** (~L2799) : même badge positionné cohéremment avec la nav semaine mobile existante.
- **Zéro assigné** : ne rien afficher (évite le bruit).

## Non inclus (YAGNI)

- Pas de répartition par groupe/filière.
- Pas de total mensuel ou multi-semaines.
- Pas de ratio "créneaux remplis / créneaux totaux".
- Pas de test unitaire dédié (agrégation triviale, couverte indirectement par les tests existants de `materializeSlots`).
