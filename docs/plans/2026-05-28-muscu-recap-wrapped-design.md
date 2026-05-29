# Récap muscu « Wrapped » — Design

*Date : 2026-05-28 — validé en brainstorming.*

## Objectif

Un bouton discret en haut à droite de l'onglet **« Mon plan »** (muscu) ouvre un
**récap plein écran façon Spotify Wrapped / stories Instagram** : plusieurs pages
qui défilent au tap ou au timer, avec un récap très visuel de l'objectif du plan,
des forces/axes du nageur (issus des KPI du bilan, **sans valeurs brutes**, situés
vs population), de ses meilleures progressions récentes et de quelques stats fun.

Le **coach et l'admin** peuvent aussi déclencher ce récap depuis la vue de leur
nageur (`CoachSwimmerFullView`), avec un wording adapté (« Le récap de Inès »).

## Contraintes & décisions (validées)

- **Aucune table / migration / endpoint nouveau.** Tout est dérivé d'appels API
  existants → **pas de `test:rls`**.
- **Bouton conditionnel** : visible seulement si au moins une source de données
  existe (≥1 mésocycle actif, OU ≥1 mesure KPI, OU ≥3 séances loggées sur 90 j).
  Les pages sans données sont **sautées** (jamais de page vide).
- **Overlay plein écran in-app** (monté depuis le composant, **pas de route hash**
  → pas de risque de chunk lazy type §330).
- **Fenêtre perfs : 90 derniers jours**, comparés aux 90 précédents pour les Δ%.
- **Style** : dégradés vifs plein écran (un par page), gros chiffres animés en
  count-up, accents — façon Wrapped.
- **Pas de valeur brute de force/poids athlète exposée côté nageur** (cohérent
  avec la règle `body-weight-coach-only`). On n'expose que des bandes de niveau.

## Mécanique de l'overlay (stories)

- Barres de progression segmentées en haut (une par page visible).
- **Autoplay** au timer (~6 s/page) ; **tap droite/gauche** pour avancer/reculer ;
  **tap-hold** pour pauser ; **swipe-down ou croix** pour fermer.
- Respecte `prefers-reduced-motion` (désactive count-up/auto-advance agressif).

## Séquence des pages (chacune sautée si données absentes)

1. **Cover** — « Ton récap muscu » (ou « Le récap de {prénom} » côté coach) +
   période (90 j).
2. **Objectif du plan** — nage × distance (ex. « Sprint 50 m crawl »), focus
   traduit en clair (« Cap sur la puissance du haut du corps »), durée (X sem.),
   Y séances/sem. Source : `getActiveMesocycle` + stroke signatures / distance
   profiles.
3. **Tes forces** — 1-2 meilleurs KPI : libellé + **bande** (`kpiProtocols` +
   `kpiScore`). Aucune valeur brute.
4. **Ton plus gros potentiel** — le KPI le plus faible, formulé positivement.
5. **Tes plus belles progressions (90 j)** — podium 1/2/3 des exos avec le plus
   fort Δ% (sur 1RM estimé), ex. « Tractions +12% ». Source : historique séances.
6. **Ton volume** — tonnage total soulevé (« 700 kg ≈ X »), nb séances, séries,
   reps cumulés sur 90 j.
7. **Stat fun** — ex. exo le plus pratiqué / jour préféré / régularité.
8. **Outro** — petit récap + encouragement (capture d'écran à partager).

### Vocabulaire des bandes (score → libellé)

Le `kpiScore` est ancré sur les percentiles (10/30/50/70/90 = p10…p90) :

| Score | Libellé |
|-------|---------|
| ≥ 90 | top 10% de ta catégorie |
| 70–90 | top 30% |
| 50–70 | au-dessus de la moyenne |
| 30–50 | dans la moyenne |
| < 30 | gros potentiel de gain |

## Architecture (fichiers)

- `src/lib/strength/wrappedStats.ts` — **module pur testable** (`node:test`) :
  - mapping score → bande,
  - calcul Δ% de progression (best 1RM estimé 90 j vs 90 j précédents),
  - sélection des stats fun + agrégats volume,
  - garde `hasEnoughWrappedData(...)`,
  - construction de la **liste ordonnée des slides** (filtrant les vides).
  Zéro I/O.
- `src/hooks/useStrengthWrapped.ts` — orchestre les appels existants via React
  Query (`getProfile`, `getActiveMesocycle`, `getLatestKpiMeasurements`,
  historique séances) pour un `athleteId` donné, passe au module pur.
- `src/components/strength/wrapped/StrengthWrappedRecap.tsx` — l'overlay + moteur
  de stories (progress bars, autoplay, nav, fermeture).
- `src/components/strength/wrapped/slides/*` — une page par slide (présentation
  pure, props typées).
- **Boutons de déclenchement** :
  - `MyPlanTab.tsx` — header discret (nageur, `viewerContext: 'self'`).
  - `CoachSwimmerFullView.tsx` (onglet planning) — (coach/admin,
    `viewerContext: 'coach'`, passe `displayName`).

Le composant `StrengthWrappedRecap` prend `{ athleteId, displayName, viewerContext }`
→ réutilisé tel quel des deux côtés ; seul le wording de la cover change.

## Tests & qualité

- **`node:test`** sur `wrappedStats.ts` : bandes, Δ%, fun-stats, agrégats, cas
  vides, ordre/skip des slides.
- **vitest** léger sur le moteur de stories (nav tap, skip pages vides,
  count visible des barres de progression).
- `tsc` 0, build 0. **Pas de migration → pas de `test:rls`.**
- UI développée via le skill **`frontend-design`** (obligatoire pour tout UI).

## Hors scope (YAGNI)

- Pas de partage natif / génération d'image serveur (la capture d'écran suffit).
- Pas de persistance de « récap déjà vu » / badge nouveauté.
- Pas de comparaison inter-nageurs (leaderboard) dans ce récap.
