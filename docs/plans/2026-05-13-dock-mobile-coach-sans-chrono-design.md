# Design — Dock mobile coach/admin : remplacement Chrono → Profil

**Date :** 2026-05-13  
**Périmètre :** `src/components/layout/navItems.ts`, `src/components/layout/AppLayout.tsx`

## Contexte

La vue Chrono (`/coach?section=chrono`) est trop dense pour une utilisation mobile. Sur le dock mobile coach/admin, on la remplace par un raccourci Profil, aligné sur ce qui existe déjà pour le rôle athlete. La vue Chrono reste accessible sur la nav desktop (≥ md).

## Design

### `navItems.ts`

Ajouter une fonction `getMobileNavItemsForRole()` qui réutilise les items existants sauf pour coach et admin : l'item Chrono (`Timer`, `/coach?section=chrono`) est remplacé par l'item Profil (`User`, `/profile`) à la même position (5e slot). Les rôles comité et athlete retournent la même liste que `getNavItemsForRole()`.

### `AppLayout.tsx`

- Le dock mobile (`md:hidden`) utilise `getMobileNavItemsForRole(role)`.
- Le header desktop (`hidden md:flex`) continue d'utiliser `getNavItemsForRole(role)` — Chrono y reste présent.

### Effets de bord positifs

Le `NavBadge` (messages non lus) s'applique automatiquement sur l'item `/profile` — coach/admin en bénéficient sans code supplémentaire.

### Tests

Mettre à jour `AppLayoutLogic.test.ts` et les tests de `navItems` pour couvrir la nouvelle fonction `getMobileNavItemsForRole()`.

## Décision d'approche

Deux fonctions distinctes (A) plutôt qu'un flag `hideOnMobile` (B) : plus lisible, aucun changement de type, les deux configs sont explicites.
