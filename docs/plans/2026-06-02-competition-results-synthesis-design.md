# Design — Synthèse « Résultats » club depuis liveffn

*Date : 2026-06-02 · Statut : validé (brainstorming) · Prochain chantier : §364*

## Objectif

Permettre au coach d'importer la vue « Résultats » d'une compétition depuis liveffn
(par structure/club) pour obtenir une **synthèse visuelle à l'instant T** des résultats
du club, en complément de la timeline (liste de départ) déjà importable.

La synthèse fait ressortir, par nageur et par épreuve :

- le **classement** (place ; 1ᵉ de finale A/B/C le cas échéant) ;
- les **qualifications aux finales** ;
- les **nouvelles meilleures performances** (record perso) ;
- l'**atteinte des objectifs** définis dans l'app (temps cible) ;
- en l'absence d'objectif chiffré, un **rang historique** (ex. « 2ᵉ meilleur temps
  all-time sur 50 NL grand bassin »).

## Décisions de cadrage (Q&A brainstorming)

| Question | Décision |
|---|---|
| Chargement | **Snapshot sauvegardé** à l'import (pas de fetch live à chaque ouverture). Rapide, hors-ligne, survit à l'archivage liveffn. |
| Emplacement | **Nouvel onglet « Résultats »** dans `CompetitionDetail` (4ᵉ onglet, à côté de Nageurs / Paramètres / Jour J). |
| Écriture des perfs | **Snapshot display-only** : on n'écrit PAS dans `swimmer_performances` (pas de doublon/conflit avec la sync officielle `ffn-performances` qui alimente les records). |
| « Si pas de MPP » | MPP = objectif/temps cible. Sans objectif sur l'épreuve → **rang vs historique perso**. |

## Architecture & flux de données

```
Coach colle l'URL liveffn « Résultats »  (…/resultats.php?…&action=structure&structure=NNN)
        │
        ▼
[edge fn liveffn-startlist]  ← assouplir l'allowlist pour accepter aussi resultats.php
        │ (proxy HTML générique, AUCUNE nouvelle edge fn à déployer)
        │ retourne le HTML brut
        ▼
[parseResults.ts]  parseur regex SANS DOM (frère de parseStartlist.ts)
        │ → par nageur : races[{ rawEvent, eventCode, phase, place, timeSeconds, points, splits }]
        ▼
[matchSwimmers.ts]  réutilise le matcher existant + competition.startlist_athlete_map
        │ (même page structure → mêmes clés de nom ; fallback matching à neuf)
        ▼
persist  competition.liveffn_results_url  +  competition.results_snapshot (jsonb, données BRUTES parsées)
```

### Raffinement clé : où se calculent les verdicts

Le `results_snapshot` ne stocke **que les données volatiles de liveffn** (ce qui
disparaît quand liveffn archive la compétition). Les **verdicts** (record perso /
objectif / rang historique) sont calculés **au rendu** par des fonctions pures sur
`(snapshot, swimmer_performances, objectives)` — toutes issues de **notre propre BDD**.

Avantages :

- Insights toujours corrects (ajouter un objectif plus tard → reflété immédiatement).
- Logique trivialement testable en `node:test`, comme `seasonBest.ts`.
- Les données de comparaison (perfs/objectifs) sont mises en cache par React Query →
  fonctionne hors-ligne au bord du bassin.

## Modèle de données (1 migration)

Ajouter à la table `competitions` :

- `liveffn_results_url text`
- `results_snapshot jsonb`

RLS inchangée (même ligne, écriture coach/admin déjà couverte). **Pas de `test:rls`
nécessaire** (ajout de 2 colonnes, policies inchangées).

## Parseur — `parseResults.ts`

Pur, regex, couvert par `node:test` (miroir de `parseStartlist.ts`). Réutilise les
helpers `clean`/`parseTime`/normalisation de nom de `parseStartlist`.

- Découpe le HTML sur `resStructureIndividu1` → nom + année de naissance du nageur.
- Par `<tr class="survol">` :
  - **place** ← `resStructureDetailPlace` (« 7e » → `7`)
  - **rawEvent + phase** ← le label `<a>`. Normaliser vers un `event_code` compact
    (réutiliser la normalisation event-code existante) et classer `phase` :
    `series` | `finaleA` | `finaleB` | `finaleC` | `demi`.
  - **time** ← `temps` ou `temps_sans_tps_passage` (« 00:23.94 » → `23.94`)
  - **points** ← `points` (« 1177 pts » → `1177`)
  - **splits** ← table imbriquée `split`/`lap`/`distance` (optionnel, détail de course)

Réalité vérifiée sur 93727/118 : certaines compétitions n'ont **que des Séries**
(pas de finale). La détection finale repose donc sur le suffixe de phase du label.

## Verdicts — `resultVerdicts.ts`

Fonctions pures (cœur testable). Les courses d'un nageur sont **groupées par
`event_code`** → les épreuves multi-phases se replient sur une ligne portant le
meilleur résultat + un badge « qualifié finale A ». Par ligne d'épreuve :

| Verdict | Règle |
|---|---|
| 🏆 Nouveau record perso | temps < `bestForEvent(perfs, event, {poolLength})` filtré `competition_date < comp.date` (exclut ce meet si déjà synchronisé par FFN) |
| 🥇🥈🥉 Podium / classement | depuis `place` de la phase la plus significative (place finale A si présente, sinon séries) |
| 🅰️ Qualifié finale A/B/C | une ligne de phase finale existe pour l'épreuve |
| ✅/❌ Objectif | si un `Objective` avec `target_time_seconds` matche épreuve+bassin → atteint/manqué + écart signé |
| 📊 Rang historique (fallback, seulement sans objectif) | position du temps parmi les meilleurs all-time du nageur (épreuve+bassin) → « 2ᵉ meilleur temps all-time » / « à +0.30s de ton record » / « 1ʳᵉ perf sur l'épreuve » si aucun historique |

Tous les seuils sont **bassin-aware** via `competition.pool_length` (réutilise la
logique exacte de `seasonBest.ts` : un résultat 50 m ne se compare jamais à un 25 m plus rapide).

## Structure visuelle — onglet « Résultats »

Le polish détaillé passe par `/frontend-design` à l'implémentation (règle globale).
Structure remise au design :

- **A — État import/vide** : input URL Résultats + bouton « Importer les résultats ».
  Affiche l'horodatage du dernier import + « Réimporter » si un snapshot existe.
- **B — En-tête synthèse (le « très visuel »)** : tuiles de stats agrégées sur tous
  les nageurs matchés : `🏆 X nouveaux records · 🥇 Y podiums · 🅰️ Z finales A · 🎯 N objectifs atteints`.
- **C — Cartes par nageur** (triées par highlight) :
  - En-tête : nom + bandeau de badges compact.
  - Une ligne par épreuve (phases repliées) :
    `50 NL · 23.94 · 7ᵉ · 🏆 record perso (−0.12s) · 1177 pts`
    ou fallback `100 Brasse · 1:08.40 · 32ᵉ · 📊 3ᵉ temps all-time`,
    badge objectif quand une cible existe : `✅ objectif 24.00 atteint` / `❌ +0.40s`.
  - Tap sur une ligne → déplie les splits (réutilise le rendu de `SwimmerRaceSheet`).
- **D — Nageurs non matchés** : noms liveffn non mappés listés en clair (rien n'est
  silencieusement perdu — même philosophie que la liste de départ).

## Tests

- `node:test` `parseResults.test.ts` — fixture `__fixtures__/resultats-93727-118.html`
  capturée.
- `node:test` `resultVerdicts.test.ts` — table-driven : record perso, objectif
  atteint/manqué, rang historique, sans-historique, filtrage bassin, repli des phases finales.
- Pas de `npm run test:rls` (migration = 2 colonnes, policies inchangées).

## Réutilisation (DRY)

- Edge fn `liveffn-startlist` : assouplir `isAllowedUrl` (accepter `resultats.php`).
- `parseStartlist.ts` : helpers `clean` / `parseTime` / normalisation nom.
- `matchSwimmers.ts` + `competition.startlist_athlete_map` : matching nageurs.
- `seasonBest.ts` / `bestForEvent` : comparaison perfs bassin-aware.
- `SwimmerRaceSheet.tsx` : rendu des splits.

## Fichiers (prévisionnel)

| Fichier | Action |
|---|---|
| `supabase/migrations/00XXX_competition_results_snapshot.sql` | + 2 colonnes |
| `supabase/functions/liveffn-startlist/index.ts` | assouplir allowlist |
| `src/lib/liveffn/parseResults.ts` (+ test + fixture) | nouveau parseur |
| `src/lib/competitions/resultVerdicts.ts` (+ test) | nouveaux verdicts |
| `src/lib/api/types.ts` | `Competition.liveffn_results_url`, `results_snapshot` |
| `src/lib/api/competitions.ts` | `fetchResultsHtml`, persist snapshot/url |
| `src/components/coach/competition/CompetitionResultsTab.tsx` | nouvel onglet |
| `src/components/coach/competition/CompetitionDetail.tsx` | brancher le 4ᵉ onglet |
```
