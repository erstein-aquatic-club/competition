# Design — Liste de départ liveffn par compétition

*Date : 2026-06-01 · Branche : `feat/liveffn-startlist` · Statut : validé, à planifier*

## Objectif

Permettre à l'entraîneur de coller, pour chaque compétition, un lien liveffn
« liste de départ par structure »
(ex. `https://www.liveffn.com/cgi-bin/startlist.php?competition=93727&langue=fra&go=detail&action=structure&structure=118`)
et d'obtenir, dans la page de la compétition, un **listing enrichi des horaires** auxquels
chaque nageur passe — relié aux **objectifs** du nageur et à sa **meilleure perf récente**
(exactement les mêmes données que les fiches objectifs, pour garder la cohérence).

La vue « par structure » est déjà filtrée sur le club (structure 118 = EAC) : seuls
les nageurs du club apparaissent, ce qui simplifie l'appariement.

## Décisions issues du brainstorming

| Question | Décision |
|---|---|
| Rattachement aux données | **Champ sur la compétition** (URL stockée sur le record `competitions`) |
| Appariement nageur startlist → user | **Auto-match + correction manuelle** (fallback dropdown, persisté) |
| Organisation du listing | **Deux vues avec bascule** : par nageur / chronologique |
| Enrichissement par ligne | **Meilleure perf récente + date** *et* **temps objectif** (si présent) |
| Persistance du listing | **Re-fetch live** à chaque ouverture (pas de cache du parse) |

## 1. Persistance

On stocke uniquement l'**URL** et les **corrections d'appariement** sur la compétition.
Le listing lui-même est **re-récupéré à chaque consultation** : séries/couloirs sont
attribués tardivement et changent — mettre en cache des couloirs périmés induirait en
erreur au bord du bassin. Cohérent avec le pattern à la demande de `ffn-performances`.

> **Évolution future (notée, non construite)** : robustesse réseau faible — mise en
> cache locale du dernier listing parsé (avec horodatage « dernière mise à jour ») pour
> affichage offline / dégradé, plus une stratégie de revalidation. Le modèle de données
> ci-dessous (URL + map) reste compatible avec cet ajout ultérieur.

## 2. Modèle de données

Une migration additive (via Supabase MCP), sur `competitions` :

- `liveffn_startlist_url text` — nullable.
- `startlist_athlete_map jsonb default '{}'` — clé normalisée startlist
  (`nom-prenom-annee`) → `user_id` (ou `null` explicite = « non lié volontairement »).
  Les corrections manuelles persistent ; l'auto-match ne remplit que les trous.

Pas de changement de policy RLS : `competitions` est déjà inscriptible coach/admin,
lisible par tous → **pas de `test:rls` requis**.

## 3. Backend — edge function `liveffn-startlist`

Nouvelle fonction sur le modèle de `ffn-performances` (CORS, JWT, coach/admin only).

- **Entrée** : `{ url }` — validée (doit être une URL `liveffn.com/.../startlist.php`).
- **Traitement** : fetch de la page + nouveau parser partagé `_shared/liveffn-parser.ts`.
- **Sortie** :
  - méta : nom du club, code structure ;
  - par nageur : `lastName, firstName, birthYear` + courses
    `{ rawEvent, eventCode, heat, lane, entryTimeSeconds, entryTimeDisplay, day, time }`.
- Mapping nom d'épreuve (« 50 Nage Libre Messieurs ») → `event_code` interne via
  `_shared/ffn-event-map.ts` existant (étendu si un libellé manque).
- `{ swimmers: [] }` + message clair si le parse ne trouve rien.

## 4. Frontend

Monté dans la **vue détail compétition** (`CoachCompetitionsScreen`), section
« Liste de départ » :

- Champ **URL** + Enregistrer + bouton **« Générer le listing »** (appelle l'edge function).
- **Appariement** : auto-match côté client des nageurs parsés contre, d'abord, les
  athlètes affectés à la compétition, puis tous les users — par nom normalisé
  (+ année de naissance en départage). Match confiant → lié ; ambigu/non trouvé →
  dropdown que le coach résout, persisté dans `startlist_athlete_map`.
- **Enrichissement** : réutilise les APIs existantes — `getSwimmerPerformances` +
  `findBestPerformance` (`objectiveHelpers`) pour la meilleure perf récente, et l'API
  objectifs pour le temps cible par `event_code`. Chiffres identiques aux fiches
  objectifs par construction.
- **Deux vues, bascule** :
  - *Par nageur* — sections, nageurs matchés en premier.
  - *Chronologique* — liste plate triée jour → heure.
  - Chaque ligne de course : épreuve · jour/heure · série/couloir · meilleure perf
    + « il y a X » · temps objectif (si présent).

## 5. Gestion d'erreurs

- URL absente/invalide → validation inline.
- liveffn injoignable / non-200 → « Impossible de récupérer la liste de départ » + retry.
- Parsé mais zéro nageur → « Aucun engagement trouvé (vérifie le lien) ».
- Nageur non matché → ligne affichée avec horaires mais badge neutre « non lié » au lieu
  de la perf — jamais de crash.

## 6. Tests

- **node:test** — parser sur une fixture HTML construite depuis la page exemple
  (séries/couloirs/temps/jours) + mapping nom d'épreuve → `event_code`.
- **node:test** — normalisation + logique d'auto-match (NOM majuscule, accents,
  départage par année de naissance).
- Réutilisation de `findBestPerformance` → logique de perf déjà couverte par les tests.
