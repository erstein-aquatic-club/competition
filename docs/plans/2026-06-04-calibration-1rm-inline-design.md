# Design — Calibration 1RM inline, minimale et bien gated (§369)

*Date : 2026-06-04 — branche `feat/muscu-369-calibration-1rm-inline` (depuis `main` post-revert §368)*

## Contexte

§368 (wizard de calibration 1RM multi-étapes) a été **livré puis reverté le jour même** :
les nageurs ne pouvaient plus utiliser l'app. Causes (cf. `implementation-log.md` §368) :
le gate « jamais réalisé » (`firstTimeExercises`) qui remplaçait `computeMissing1RmExercises`
avait perdu les filtres **`percent_1rm`** et **1RM-manquante** → exos élastique / PDC /
accessoires réclamaient un 1RM ; le wizard multi-étapes se lançait sur **chaque** exo d'un
nouveau mésocycle → submersion + « boucles » ; suspect : `invalidateQueries(["1rm"])` en
séance → resets de position.

§369 refait l'**intention initiale** (aider quelqu'un qui ne connaît pas son max à trouver
un 1RM en séance, sans bloquer le lancement, sans forcer l'échec) en version **minimale**.

## Décisions de cadrage (brainstorming)

- **Déclencheur strict**, évalué **inline dans `WorkoutRunner`** (pas de requête parent).
- **Forme** : carte de série 1 **augmentée** (pas d'écran séparé, pas de wizard).
- **Sécurité** : un seul **toast** non bloquant si RIR 0 ou difficulté 5.
- **Lancement** : `OneRmGate` retiré → un tap. Persistance **sans invalidation 1RM en séance**.
- **1RM sans RIR renseigné** : on le calcule quand même (Epley simple) — option (a), une
  référence imparfaite vaut mieux que rien.

## Spécification

### 1. Déclencheur (corrige #4)
Calibration affichée **uniquement si TOUTES** ces conditions (pour l'exo courant) :
- `currentSetIndex === 1`
- `percent_1rm > 0` (prescrit en %1RM)
- métrique `weight_kg` **et** non poids-de-corps (`!is_bodyweight`)
- **aucun 1RM** connu pour cet exo dans `oneRMs`

→ élastique / PDC / accessoires en reps / exos déjà dotés d'un 1RM : **carte de série
normale, rien de changé**. (Restauration des 4 filtres de `computeMissing1RmExercises`,
évalués inline.)

### 2. Carte de série 1 augmentée (corrige #1)
Quand le déclencheur matche, la carte habituelle (charge + reps) gagne :
- ligne d'aide : « On ne connaît pas ton max — échauffe-toi, fais une vraie série de
  travail, garde des reps en réserve. »
- champ **« reps en réserve »** (0 / 1 / 2 / 3 / 4+).

Valider la série :
- calcule le 1RM via `estimateOneRM(charge, reps, { rir })` (Epley+RIR) ; **si RIR non
  renseigné → Epley simple** sur charge×reps (option (a)),
- logge la série comme **série 1**, puis avance normalement à la série 2.

Aucun écran séparé, aucune étape à vide, aucun palier in-app, aucun retex multi-cases.

### 3. Filet de sécurité (esprit « qualité > charge »)
À la série de calibration, si **RIR 0** OU **difficulté 5** → **toast** non bloquant :
« Tu es allé près de l'échec — garde 2-3 reps la prochaine fois, on progresse mieux en
qualité. » Aucune carte, aucune action requise.

### 4. Lancement & persistance (corrige #2/#3)
- **`OneRmGate` retiré** → séance lancée en un tap, tout est inline série 1. (Les max connus
  se saisissent via l'UI 1RM existante.)
- 1RM calculé gardé en **état local du run** (`Map<exerciseId, 1RM>`) pour cibler les séries
  2+ du même exo. Persistance serveur **sans `invalidateQueries(["1rm"])` en séance**
  (fire-and-forget / différée fin de séance) → supprime la cause suspecte des resets/boucles.

### 5. Hors périmètre (vs §368, YAGNI)
Pas de : wizard multi-étapes, mouvement à vide, paliers de chauffe in-app, retex 3-cases,
validation post-série-2, API `getPerformedExerciseIds`, requête `firstTimeExercises`,
composant séparé. Net : 1 champ + 1 hint + 1 toast + gate inline + persistance non-invalidante.

## Tests
- `estimateOneRM` avec RIR explicite (pur, node:test).
- Gate `needsCalibration` (pur) : vrai **uniquement** sur %1RM + weight_kg + non-PDC + sans-1RM
  — **le test qui aurait attrapé l'incident #4** (élastique/PDC/accessoire/déjà-doté → faux).
- Rendu (SSR negative-gate) : la carte série 1 affiche le champ RIR + hint uniquement sur un
  exo éligible ; un exo non éligible n'affiche rien de spécial.
- Pas de migration, pas de `test:rls`.

## Leçon (process)
**Aucun déploiement muscu sans smoke terrain.** §369 ne sera pas mergé/déployé sans une
vérification manuelle sur l'app réelle (1ère fois sur un exo %1RM sans 1RM → carte augmentée ;
élastique/PDC → rien ; pas de boucle/skip).
