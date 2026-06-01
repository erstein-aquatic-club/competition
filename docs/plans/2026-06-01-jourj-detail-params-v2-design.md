# Design — Paramètres v2 + détail nageur Jour J

*Date : 2026-06-01 · Statut : validé, à planifier · Branche : `main` (checkout partagé)*

## Contexte

Suite de la refonte UX Compétitions (§362), retours terrain François :
1. **(déjà corrigé)** la tuile « Échéances » ouvrait directement une compétition au lieu
   de la timeline → fix livré (`fix(comp-ux): Échéances tile opens the timeline`).
2. **Onglet Paramètres** à améliorer (visuel/mobile) + ajouter le **bassin (25/50 m)**.
3. **Jour J** : un clic sur un nageur doit afficher le **tableau d'allures** de son objectif
   + son **meilleur temps de la saison** + son **best all-time** (avec dates).

## Décisions (brainstorming)

| Sujet | Décision |
|---|---|
| Deux « meilleurs temps » | **Best saison + best all-time** (pour l'épreuve de la course), avec dates |
| Présentation détail nageur | **Bottom sheet** (`Sheet side="bottom"`) |
| Améliorations Paramètres | **Refonte visuelle/mobile** + **champ bassin 25/50 m** |
| Tableau d'allures (bassin) | utilise le **bassin de la compétition** (`competition.pool_length`), fallback = bassin de l'objectif |

## 1. Modèle de données

Migration additive (via Supabase MCP) : `competitions.pool_length int` nullable (25 ou 50).
Pas de changement RLS (`competitions` déjà coach/admin-writable) → **pas de `test:rls`**.
`Competition`/`CompetitionInput` types étendus (`pool_length?: number | null`).

## 2. Onglet Paramètres (refonte + bassin)

Re-layout du tab existant de `CompetitionDetail`, en **sections aérées mobile-first** :
- **Infos** : nom, dates (début/fin), lieu, **bassin** (segmented 25 m / 50 m / —), notes.
- **Liste de départ** : champ lien liveffn (validation host+path déjà en place).
- **Zone danger** : suppression (discret, confirmation AlertDialog).

Grandes cibles tactiles, tokens sémantiques dark-mode, `tabular-nums`. Sauvegarde via
`updateCompetition({…, pool_length})`. Aucun composant lourd nouveau.

## 3. Jour J — détail nageur au clic (bottom sheet)

Chaque ligne de course (`RaceRow` dans `CompetitionStartlistPanel`) devient **tactile** quand
le nageur est lié → ouvre une **feuille en bas** pour ce nageur + cette épreuve :
- **En-tête** : nom · épreuve (label) · jour/heure · série/couloir.
- **Temps (pour l'épreuve)** :
  - **Meilleur temps saison** (≥ 1er sept de la saison FFN courante) + date,
  - **Best all-time** (record perso) + date,
  - manquant → « — ».
- **Tableau d'allures** : `PaceMatrixInline` (composant existant, cf. `ObjectiveDetailSheet`),
  `targetTimeMs = objectif.target_time_seconds × 1000`, `stroke`/`distance` via
  `parseObjectiveForPace(eventCode, poolLength)`, `targetPoolSize` = bassin compétition
  (fallback objectif). Pas d'objectif pour l'épreuve → message, pas de matrice.

**Câblage** : on thread l'`userId` matché + les `perfs`/`objectifs` (déjà chargés dans le
panneau via `perfsByUser`/`objectivesByUser`) jusqu'à `RaceRow`, donc la feuille **ne refetch
rien**. `swimmerSex` passé `null` (non disponible dans `AthleteSummary` ; MVP).

Infra réutilisée (tout existe — cf. exploration) :
- `PaceMatrixInline` — `src/components/coach/pace/PaceMatrixInline.tsx`.
- `parseObjectiveForPace(event_code, pool_length)` — `src/lib/objective-pace-link.ts`.
- `findBestPerformance` — `src/lib/objectiveHelpers.ts`.

## 4. Helpers purs (testés node:test)

- `currentSeasonStart(todayIso)` → `YYYY-09-01` de la saison FFN courante (si mois ≥ 9 →
  année courante, sinon année-1).
- `bestForEvent(perfs, eventCode, { fromDate? })` → `{ time, date } | null` : filtre la
  fenêtre (`competition_date >= fromDate`) puis réutilise `findBestPerformance`. Best-saison =
  avec `fromDate=currentSeasonStart` ; best-all-time = sans `fromDate`.

## 5. Esthétique & tests

- UI via `/frontend-design`, cohérent app (réutilise `PaceMatrixInline`, couleurs de nage,
  type scale coach, dark-mode).
- `node:test` sur les 2 helpers purs ; reste = UI vérifiée tsc/lint (Supabase indispo local,
  vérif live post-déploiement github.io). Pas de `test:rls`.

## 6. Hors périmètre / futur

- `swimmerSex` réel pour la matrice (non exposé aujourd'hui).
- Best-temps par bassin (25 vs 50) — écarté au profit de saison vs all-time.
- Notifications/partage du Jour J aux nageurs (futur).
