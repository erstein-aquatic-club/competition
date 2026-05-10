# Design — Auto-sync objectifs chronométriques → Allures équipe

*Date : 2026-05-10*

## Contexte

L'onglet « Allures équipe » (section `pace-calculator` dans `Coach.tsx`) affiche les
cibles d'allures par nageur (`coach_pace_targets`). Un mécanisme partiel existe déjà :
quand un coach sauvegarde un objectif dans `SwimmerObjectivesTab`, `autoSyncPaceTarget`
crée la cible correspondante. Mais les objectifs créés avant ce mécanisme, ou créés
directement par le nageur, n'ont jamais de cible générée.

**Demande** : tout nageur ayant un objectif chronométrique doit hériter
automatiquement d'une cible visible dans « Allures équipe », sans action du coach.

## Décisions

| Question | Choix |
|----------|-------|
| Mode de création | Auto-création silencieuse (pas de confirmation UI) |
| Cible existante ? | Ne pas écraser — skip si déjà présente pour (nage + distance + bassin) |
| Implémentation | Frontend-driven (Approche A) — aucune migration |

## Architecture

Un seul `useEffect` ajouté dans `CoachPaceCalculatorScreen.tsx`, déclenché
après que `teamLoading === false` et `targetsQuery.isLoading === false`.

Aucun nouveau fichier, aucune migration, aucune nouvelle dépendance.

## Flux de données

```
CoachPaceCalculatorScreen mount
  ├─ team (déjà chargé) : TeamMember[]  (accountId = public.users.id : number)
  ├─ targets (déjà chargés) : PaceTarget[]
  │
  └─ useEffect [teamLoading, targetsQuery.isLoading]
       │
       ├─ 1. supabase.from("users").select("id, auth_uid")
       │       .in("id", teamAccountIds)
       │    → Map<auth_uid: string, accountId: number>
       │
       ├─ 2. getObjectives()   ← sans filtre, RLS limite au périmètre accessible
       │    → Objective[]  (athlete_id = auth UUID)
       │
       ├─ 3. Pour chaque Objective :
       │       a. résoudre accountId via Map → absent → skip
       │       b. parseObjectiveForPace(event_code, pool_length) → null → skip
       │       c. shouldAutoSyncToPaceTarget(obj, parsed, targets, accountId) → false → skip
       │       d. upsertPaceTarget(...)
       │
       └─ 4. Si ≥ 1 upsert effectué :
               queryClient.invalidateQueries(["pace-targets"])
```

## Gestion des cas limites

| Cas | Comportement |
|-----|-------------|
| `target_time_seconds` null | skip |
| `event_code` non-FFN | `parseObjectiveForPace` → null → skip |
| Cible déjà existante | `shouldAutoSyncToPaceTarget` → false → skip |
| Nageur hors équipe | `auth_uid` absent du Map → skip |
| Erreur réseau | `try/catch` silencieux (pattern `autoSyncPaceTarget`) |
| Double montage (StrictMode) | idempotent — upsert + check évitent doublons |

## Fichiers modifiés

| Fichier | Changement |
|---------|-----------|
| `src/pages/coach/CoachPaceCalculatorScreen.tsx` | Ajout d'un `useEffect` de sync au montage |
| `src/pages/coach/__tests__/CoachPaceCalculatorScreen.test.tsx` | Tests du déclenchement au montage |

## Tests

- Vérifier que le `useEffect` appelle `upsertPaceTarget` pour chaque objectif chrono
  sans cible correspondante au montage.
- Vérifier qu'il ne rappelle pas `upsertPaceTarget` si la cible existe déjà.
- Vérifier le skip si `target_time_seconds` est null.
- Vérifier le skip si `event_code` est invalide.
