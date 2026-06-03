# Design — Wizard de calibration 1RM guidé en séance

*Date : 2026-06-03 — branche cible à créer depuis `main`*

## Contexte & problème

Aujourd'hui, lancer une séance de musculation peut être bloqué par le popup
`OneRmGate` qui demande de saisir des charges max théoriques (1RM) pour les
exos qui en manquent. Un nageur qui ne connaît pas sa 1RM se retrouve freiné.

Il existe déjà une amorce de solution (§297) : une option « Estimer pendant la
séance » et un mode estimation inline sommaire dans `WorkoutRunner`
(ramp-up « + Chauffe suivante » → « série de référence » → `estimateOneRM`
Epley+RIR dérivé de la difficulté). C'est trop sommaire et reste optionnel
derrière un gate.

**Objectif** : (1) rendre la séance toujours lançable en un tap, et (2)
transformer ce ramp-up en un véritable **wizard guidé conversationnel avec
retex**, qui amène le pratiquant vers une 1RM calculée **sans jamais chercher
l'échec**, et valide la cohérence de la charge après coup.

## Décisions de cadrage (brainstorming)

- **Déclencheur** : wizard complet à la **première réalisation** d'un exo
  (peu importe qu'une 1RM existe déjà). Détection « jamais réalisé » =
  **absence d'historique de séries** pour cet athlète × exo. Ensuite, recalcul
  court seulement.
- **Lancement** : `OneRmGate` **supprimé**. Séance lançable en un tap ; toute
  la calibration se passe en séance, sur la série 1 de l'exo concerné.
- **Mesure d'effort** : **reps en réserve (RIR) explicites** (0/1/2/3/4+) sur
  la série de travail. La difficulté 1–5 reste pour le ressenti général.
- **Retex de chauffe** : **3 cases** — douleur (oui/non), aisance technique,
  « je peux recharger : un peu / moyen / beaucoup ».
- **Suggestion de charge** : incréments relatifs **+2,5 / +5 / +10 kg** selon
  « recharger », ancrés à **~40–50 %** si une 1RM est connue ; athlète libre de
  corriger.
- **Validation post-série-2** : retour négatif = **douleur OU série trop dure**
  (reps cibles non atteintes / RIR 0 / difficulté 5) → **conseil qualité >
  charge** + **1RM proposée à la baisse (−10 %)** acceptable d'un tap.
- **Persistance douleur** : drapeau ajouté à la **note/`comments`** de la série
  (visibilité coach), pas de nouvelle table.

## Flux détaillé

### 1. Lancement sans frein
- Suppression de `OneRmGate` et de la logique `missing1RmExercises` /
  `showOneRmGate` dans `Strength.tsx`. `handleLaunchFocus` démarre le run
  directement.

### 2. Détermination du mode à l'entrée d'un exo (`WorkoutRunner`)
- `firstTime` (aucun historique de série athlète × exo) → **wizard complet**,
  même si une 1RM est connue.
- Sinon, 1RM manquante OU recalcul demandé (bouton « Recalculer ma 1RM »
  existant) → **version courte** (directement la série de travail estimée, sans
  les paliers de chauffe guidés).
- Sinon → flux normal actuel.
- Exos poids de corps → pas de wizard (rien à calibrer), inchangé.

### 3. Wizard complet (sous-machine à états sur la série 1)
Cartes tap-friendly, style `WorkoutRunner` existant.

**Étape A — Mouvement à vide** (barre vide / réglage mini, ~1 rep)
Carte retex 3 cases. Si **douleur** → message sécurité + alléger / substituer /
passer l'exo (la douleur prime).

**Étape B — Palier(s) de chauffe**
Charge **suggérée** (+2,5 / +5 / +10 selon « recharger », ancrée ~40–50 % si
1RM connue, sinon depuis le palier précédent). Athlète confirme/corrige, fait
ses reps, re-retex. Bouton **« + palier suivant »** pour boucler jusqu'à se
sentir proche d'une charge de travail.

**Étape C — Série de travail estimée**
Athlète choisit charge + reps effectuées + **reps en réserve (0/1/2/3/4+)**.
Message anti-échec en clair. Si **RIR 0** → avertissement doux, estimation
quand même calculée. → **1RM** via `estimateOneRM` étendu (RIR explicite).
Série **loggée comme série 1** (pattern `handleReferenceSet`). 1RM persistée via
`onEstimationComplete` / `update1RM`.

Puis enchaînement normal **à partir de la série 2**, aux % de la 1RM fraîche.

### 4. Validation après la série 2
Carte : douleur (oui/non) + « cette charge me semble : trop légère / juste /
trop lourde ». Retour négatif = douleur **OU** série trop dure (reps cibles non
atteintes / RIR 0 / difficulté 5) → message **qualité > charge** + **1RM −10 %**
acceptable d'un tap ; séries restantes re-ciblées automatiquement.

## Modèle de données & persistance
- 1RM : `update1RM` existant (aucune table neuve).
- Série de travail estimée : loggée en série 1 (existant).
- `estimateOneRM(weight, reps, { rir })` : surcharge pour RIR explicite ; la
  version difficulté reste pour le reste de l'app.
- Drapeau douleur : ajouté à la note/`comments` de la série. Les autres retex
  pilotent la logique en séance, non persistés.

## Composant & tests
- Nouveau composant **`OneRmDiscoveryWizard.tsx`** (WorkoutRunner ≈ 1724 lignes
  → on isole la sous-machine), branché sur la série 1.
- **Logique pure (node:test)** : `estimateOneRM` avec RIR, incréments de
  suggestion, détection « retour négatif », ajustement 1RM −10 %.
- **Composant (vitest DOM)** : progression des étapes, branche douleur→sécurité,
  déclenchement de la validation post-série-2, ajustement accepté d'un tap.
- Méthode : TDD.

## Hors périmètre (YAGNI)
- Pas de remontée coach dédiée pour la douleur (note suffit).
- Pas de table d'historique des retex.
- Pas de changement au moteur de génération du mésocycle.
