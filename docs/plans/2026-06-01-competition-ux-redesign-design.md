# Design — Refonte UX module Compétitions (coach)

*Date : 2026-06-01 · Statut : validé, à planifier · Branche cible : `main` (checkout partagé multi-terminal)*

## Problème

Le module Compétitions (« Échéances ») est jugé peu visuel et mal optimisé mobile.
Un clic sur une compétition ouvre un panneau latéral étroit (`CompetitionFormSheet`)
qui mélange formulaire + assignation de nageurs — peu lisible. Le coach veut **3 workflows
clairs** par compétition et un **accès plus rapide** à la prochaine échéance.

## Décisions (brainstorming)

| Sujet | Décision |
|---|---|
| Détail compétition | **Plein écran, 3 onglets** : Nageurs · Paramètres · Jour J |
| Timeline Échéances | **Hero « prochaine compétition »** (compte à rebours, lieu, nb nageurs, bouton Jour J) + cartes scannables en dessous |
| Périmètre liste | **Hero = prochaine compétition**, liste mixte (compétitions + entretiens + fins de cycle), couleur/icône par type |
| Nageurs ↔ Jour J | **Liés avec suggestion** : Nageurs = assignation manuelle ; bandeau « N engagés liveffn détectés — ajouter ? » ; Jour J affiche tous les engagés liveffn |
| Accès rapide | **Tuile hub coach vivante** (prochaine compé + J-X, tap → détail) **+** hero dans l'écran Échéances |

## 1. Navigation (3 niveaux, mobile-first)

- **Hub coach** (`Coach.tsx`) : la tuile « Échéances » affiche la prochaine compétition
  + `J-X` ; tap → détail de cette compétition (deep-link).
- **Écran Échéances** (`CoachCompetitionsScreen`) : hero compétition + liste mixte en cartes
  tactiles colorées par type.
- **Détail compétition** (nouveau, plein écran) : header (nom, dates, lieu, J-X, retour)
  + 3 onglets.

**Routing** : ajouter un champ optionnel `competitionId` à l'état de route coach
(`coachRouteState.ts`, section `competitions`) pour le deep-link 1-tap. Additif,
rétrocompatible (absent = écran liste). Le `CompetitionFormSheet` latéral est retiré.

## 2. Les 3 onglets

- **Nageurs** : recherche, ajout par groupe (chips), avatars, compteur. Bandeau
  intelligent si un listing liveffn existe : « **N nageurs engagés détectés — les ajouter
  aux participants ?** » → ajout en un tap. La sélection reste l'**assignation manuelle**
  (`competition_assignments`).
- **Paramètres** : nom, dates, lieu, notes, **lien liveffn** (déplacé ici depuis le Jour J),
  suppression. Reprend les champs de l'ancien formulaire.
- **Jour J** : le listing liveffn enrichi (`CompetitionStartlist`) **refactoré** en panneau
  embarqué — vues par nageur / chronologique, perf + objectif. Tous les engagés liveffn.

**Création** : petit modal léger (nom + dates + lieu) → atterrit sur le détail, onglet
Paramètres.

## 3. Architecture & composants

- **Nouveau** `src/components/coach/competition/CompetitionDetail.tsx` — plein écran, 3 onglets.
  Orchestre le fetch/parse liveffn **une fois** et le partage entre Nageurs (suggestion) et
  Jour J (listing). Onglet par défaut à l'ouverture : Nageurs (ou Jour J si déclenché par le
  bouton hero).
- **Refactor** `CompetitionStartlist` → `CompetitionStartlistPanel` (corps réutilisable, sans
  le wrapper `Sheet`). L'ancien usage (ouvert depuis l'écran liste) est remplacé par l'onglet.
- **Refactor** timeline dans `CoachCompetitionsScreen` → hero + cartes scannables (remplace le
  rail vertical à petits points). Conserve la logique d'événements unifiés (`DeadlineEvent`).
- **Modif** `Coach.tsx` (tuile « Échéances » vivante) + `coachRouteState.ts` (`competitionId`).
- Réutilise toutes les APIs : `getCompetitions`, `createCompetition`, `updateCompetition`,
  `deleteCompetition`, `get/setCompetitionAssignments`, `getAthletes`, `fetchStartlistHtml`,
  `parseStartlist`, `autoMatch`, `buildStartlistRows`.

## 4. Helpers purs (testés node:test)

- `nextCompetition(events, todayIso)` — sélectionne la prochaine compétition (à venir la plus
  proche ; sinon null) pour le hero + la tuile hub. Pur, testable.
- `suggestedParticipants(matchedUserIds, assignedUserIds)` — diff des engagés liveffn (matchés)
  non encore assignés, pour le bandeau de suggestion. Pur, testable.

## 5. Esthétique (`/frontend-design`)

Cohérent avec l'app : tokens shadcn/Tailwind, dark-mode (tokens sémantiques, pas de hex en
dur), couleurs de nage (`STROKE_COLORS`), `tabular-nums`. Hero soigné (contraste/dégradé
subtil, gros `J-X`), cartes à grandes cibles tactiles, onglets en segmented control. Pas de
police exotique — la fonte de l'app.

## 6. Hors périmètre / futur

- Pas de changement du modèle de données (réutilise `competition_assignments` + les colonnes
  `liveffn_startlist_url`/`startlist_athlete_map` de §361).
- Pas de notifications/partage du Jour J aux nageurs (évolution future possible).
- Robustesse réseau faible du listing (cache offline) reste l'évolution future notée en §361.
