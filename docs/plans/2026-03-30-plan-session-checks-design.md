# Design — Coches séances plan musculation

*Date : 2026-03-30*
*Statut : Validé*

---

## Contexte

Le `MyPlanTab` affiche les séances de musculation par cycle (S13 Force, S15 Puissance…) avec les jours de la semaine. Le nageur n'a aucun moyen de voir quelles séances il a déjà faites cette semaine.

## Besoin

Coches visuelles manuelles sur les séances du plan pour tracker l'avancement hebdomadaire. Pas de suivi analytique derrière — purement visuel.

## Approche retenue : localStorage par semaine ISO

- Zéro migration, zéro API
- Coches persistées en localStorage par `userId` + semaine ISO
- Auto-check optionnel si un `strength_session_run` complété existe pour cette session + semaine
- Reset automatique chaque lundi

## Stockage

```typescript
// localStorage key: "plan-checks-{userId}"
// Value: Record<string, string[]>
// Exemple: { "2026-W14": ["42", "58"], "2026-W13": ["42"] }
```

Helper functions:
- `getPlanChecks(userId)` → Record
- `togglePlanCheck(userId, weekKey, sessionId)` → void
- `isChecked(userId, weekKey, sessionId)` → boolean
- `getISOWeekKey(date)` → string (ex: "2026-W14")

## UX

### Cercle cochable par séance

- Ajout d'un cercle à gauche de chaque séance (avant le badge jour)
- Tap sur le cercle = toggle coché/décoché
- Non coché : cercle vide avec bordure `border-muted-foreground/30`
- Coché : cercle rempli vert (`bg-emerald-500`) avec icône Check blanche, petite animation scale

### Apparence séance cochée

- Texte avec opacité réduite (`opacity-60`)
- Pas de barré (trop agressif) — juste l'opacité + le check vert suffisent

### Auto-check depuis les runs complétés

- Query `strength_session_runs` pour le user avec `status=completed` et `session_id` dans la semaine courante
- Si un run complété matche un session_id du plan → pré-coché (mais dé-cochable manuellement)

### Compteur par cycle

- En haut de chaque cycle : "3/5 séances" en petit texte
- Mini barre de progression (même style que ChallengeProgressBar) : verte si 100%, muted sinon
- Uniquement pour les séances de la semaine courante (filtrer par day match)

## Composants impactés

- Modifier : `src/components/strength/MyPlanTab.tsx` — ajouter cercles, compteur, logique checks
- Créer : `src/lib/planCheckHelpers.ts` — fonctions pures localStorage + ISO week
- Aucune migration, aucun composant UI externe

## Hors scope

- Historique des semaines passées
- Analytics de complétion
- Sync cloud
