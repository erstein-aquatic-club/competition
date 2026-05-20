# Guide Bilan Muscu — Nageurs & Coaches

*Comment fonctionne le module musculation de l'application EAC, en clair, sans jargon technique.*

> **Ce document s'adresse à toi, nageur, et à toi, coach.** Si tu cherches la doc développeur, va plutôt voir `docs/implementation-log.md` ou les fichiers `docs/plans/2026-05-*-bilan-muscu-*.md`.

---

## 1. Pourquoi ce module existe

Avant, la muscu à l'EAC ressemblait souvent à :

- Le coach prépare une séance pour un groupe entier — les nageurs s'y adaptent comme ils peuvent.
- Le nageur fait ce qu'il peut avec — sans savoir si la charge est trop faible ou trop forte pour lui.
- Pas de visibilité sur ses progrès ni sur la cohérence avec son objectif (sprint, demi-fond, 4 nages…).
- Au moindre changement d'objectif ou de forme physique, tout est à refaire à la main.

Le module **Bilan Muscu** corrige ça avec une boucle simple :

```
  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐    ┌──────────────┐
  │   BILAN      │ →  │   MOTEUR     │ →  │  MÉSOCYCLE   │ →  │  SÉANCES     │
  │ (où j'en     │    │ (que faut-il │    │ (le plan sur │    │ (sur la      │
  │  suis)       │    │ travailler ?)│    │ N semaines)  │    │  timeline)   │
  └──────────────┘    └──────────────┘    └──────────────┘    └──────────────┘
        │                                                            │
        └────────────  Le coach voit tout et peut ajuster  ──────────┘
```

**Trois principes** :

1. **Pas de boîte noire.** Le système est entièrement explicable — le coach voit le « pourquoi » de chaque choix.
2. **Pas bloquant.** Si une donnée manque, on continue avec ce qu'on a, on baisse juste la confiance.
3. **Le nageur autonome, le coach en filet.** Le nageur génère son plan tout seul ; le coach garde la visibilité totale et peut rejeter ou ajuster.

---

## 2. Vue d'ensemble : les 4 grandes briques

| Brique | Pour quoi | Qui la remplit |
|---|---|---|
| **A — Le contenu** | La base de connaissance : barèmes des tests, catalogue d'exercices taggés, modèles de cycles | Coach + équipe technique (configuré une fois) |
| **B — Le bilan** | Où en est le nageur aujourd'hui : douleurs, mobilité, qualité de mouvement, scores aux 5 tests de force | Nageur (questionnaire) + Coach (notation physique) + Nageur ou coach (5 KPIs) |
| **C — Le moteur** | Le calcul du plan personnalisé à partir du bilan | Automatique |
| **D — La mise en œuvre** | Le plan apparaît sur la timeline du nageur, le coach est notifié, peut rejeter | Nageur (génération) + Coach (visibilité, revert) |

---

## 3. Workflow nageur — du bilan au mésocycle

### Étape 1 — Le questionnaire (5 min)

> *Onglet « S'entraîner » > carte violette « Ton coach a demandé un bilan »*

Le coach lance un bilan pour toi. Tu reçois une notif (à terme) ou tu vois directement la carte. Tu remplis :

1. **Douleurs actuelles** : tu cliques sur les zones qui te gênent (épaule, genou, dos…), tu notes l'intensité 1-3.
2. **Historique de blessures** : texte libre.
3. **Ressenti mobilité** : note 1-5 (très raide → très souple).
4. **État psychologique** : 3 notes 1-5 — confiance, motivation, stress.

**Une fois soumis**, ton bilan passe en « en attente du coach » — tu peux le consulter mais plus le modifier.

### Étape 2 — Les 5 tests de force (1 séance dédiée)

> *Onglet « S'entraîner » > carte « Bilan KPIs de force »*

Tu passes avec un binôme. L'écran te guide test par test, avec le protocole détaillé + un emplacement pour la démo GIF. Les 5 tests :

| Test | Ce que ça mesure | Comment |
|---|---|---|
| **Tirage isométrique mi-cuisse (IMTP)** | Force bas du corps | Barre sur les pins du rack à hauteur mi-cuisse, charge max en kg que tu tiens 5 s |
| **Détente verticale** | Puissance bas du corps | Tu donnes ton poids, le binôme chronomètre ton temps de vol sur 3 sauts (jambes tendues, pas de tuck). Le système calcule ta puissance en W/kg via l'équation de Sayers |
| **Saut en longueur (broad jump)** | Puissance bas du corps | Distance max sur 3 essais, en cm |
| **Traction lestée** | Force haut du corps | Charge additionnelle max sur 1 traction stricte |
| **Lancer vertical médecine-ball 10 kg** | Puissance haut du corps | Hauteur max atteinte par le ballon, en cm |

Tu peux **sauter un test** — le bilan partiel est accepté.

### Étape 3 — Le coach finalise

Le coach (sur `/coach/strength-assessment`) :

- Évalue ta **mobilité** sur 3 axes (flexion épaule, mobilité thoracique, mobilité hanche) — notes 0-3 chacune.
- Évalue la **qualité de mouvement** sur 3 axes (contrôle scapulaire, alignement tronc-nuque, charnière hanche) — notes 0-3 chacune.

Quand il valide, **ton bilan passe en « complété »** — et la suite te devient accessible.

### Étape 4 — Tu génères ton mésocycle

> *Onglet « S'entraîner » > tuile violette « Génère ton mésocycle muscu »*

Cette tuile n'apparaît que si ton bilan est complété. Tu y configures ton plan en 4 sections (l'écran les déroule au fur et à mesure) :

| Section | Choix |
|---|---|
| **01 — Épreuve ciblée** | Sprint 50 m, 200 m, 400 m, demi-fond, brasse, dos, 4 nages |
| **02 — Famille de prépa** | **Prépa de saison** (cycle long 7-23 sem.) ou **Mini-prépa inter-compétitions** (cycle court 5-8 sem. entre deux compés) |
| **03 — Durée cible** | Tu fixes le nombre de semaines avec un compteur. **Tes prochaines compétitions s'affichent** avec le nombre de semaines qui t'en sépare — tu peux cliquer dessus pour aligner ton pic sur une compétition |
| **04 — Séances/semaine** | Repris automatiquement de ton bilan, modifiable |

Puis tu cliques **« Voir l'aperçu »**.

### Étape 5 — L'aperçu — c'est là que la magie opère

L'écran te montre **deux choses** :

#### A. Le « pourquoi » (panneau du haut)

- **Tes 6 scores de seau** affichés en barres 0-100 : Force bas / Puissance bas / Force haut / Puissance haut / Mobilité / Psychologie.
  - Rouge < 40 : faible
  - Orange 40-69 : moyen
  - Vert ≥ 70 : fort
  - Gris hachuré : donnée manquante
- **Le Top 3 des priorités** : quels seaux le système a décidé de travailler en focus, avec une phrase d'explication (« Force bas faible (30/100) — sollicité ×1.0 par l'épreuve → focus »).
- Si une douleur intense ou une dysfonction a été détectée → bandeau « override » : la mobilité passe en priorité 1 quoi qu'il arrive.
- Si tu as un score psy bas → bandeau « pense à parler à ton coach ».
- Un indicateur de **confiance des données** (3 segments : low / partial / full) — si tu as sauté des KPIs, la confiance baisse.

#### B. Le plan détaillé (panneau du bas)

- Toutes les semaines de ton mésocycle, repliables.
- Chaque semaine a son **cycle de périodisation** matérialisé par une pastille colorée :

| Cycle | Couleur | Ce que ça veut dire |
|---|---|---|
| **Préparation générale** | Bleu | Adaptation anatomique, endurance de force, préhab |
| **Force max** | Rouge | Charges lourdes, peu de répétitions, recrutement |
| **Puissance / vitesse** | Orange | Charges modérées, mais déplacées **vite** |
| **Maintien** | Gris | Volume réduit, intensité préservée, sans construire |
| **Affûtage** | Violet | Décroissance progressive du volume avant compétition |
| **Pic** | Vert | Semaine de compé : très court, très explosif |

- Chaque séance affiche les exercices avec **leur notation complète** : `Squat dos · 4 × 5 @ 85% · 180 s`.
- Si un exercice **remplace** un autre à cause d'une douleur, c'est marqué avec un badge orange « remplace #X ».

### Étape 6 — Tu confirmes

Tu cliques **« Confirmer & appliquer »**. En une fraction de seconde :

- Ton mésocycle est posé sur la **timeline muscu** (onglet « Mon plan » de `/strength`).
- Les semaines colorées par phase apparaissent sur ta planif.
- Si tu avais déjà des séances posées dans cette fenêtre, elles sont **sauvegardées** (snapshot) — un revert te les remet à l'identique.
- Si tu avais un mésocycle actif précédent, il devient « superseded » — un seul peut être actif à la fois.
- Ton coach reçoit une notification.

### Étape 7 — Tu t'entraînes

Les séances apparaissent dans ton planning natation/muscu. Tu cliques dessus comme d'habitude, le mode focus se lance, tu fais ta séance, tu enregistres tes répétitions et tes charges. Rien de neuf de ce côté.

---

## 4. Workflow coach — visibilité et contrôle

### Étape 1 — La notification

Quand un nageur génère son mésocycle, tu reçois une notif « Nouveau mésocycle muscu » dans ton centre de notifications. Le mésocycle est déjà appliqué — pas besoin de l'approuver. **Le nageur est autonome.**

### Étape 2 — La visibilité

> *Hub coach > Fiche nageur > onglet **Planning** > section **Mésocycle muscu** (violette)*

Tu y vois exactement ce que le nageur a vu :

- Les métadonnées : épreuve, famille (saison / mini-prépa), durée, séances/sem, date de génération, version du moteur.
- Le **raisonnement auditable** : les 6 scores de seau, les top priorités avec leur rationale, les flags (psy, contre-indications), la confiance des données.
- L'**historique** des mésocycles passés (superseded, reverted) avec leurs dates.

Tu peux donc à tout moment expliquer au nageur **pourquoi** son plan a été construit ainsi.

### Étape 3 — Ajustement fin

Si une séance ne te convient pas — un exercice à substituer, une charge à ajuster — **tu cliques sur la séance dans la timeline** et tu l'édites comme n'importe quelle séance muscu existante (le builder est le même). Les séances générées sont des templates standards.

### Étape 4 — Le revert (si vraiment ça ne va pas)

Si le plan dans son ensemble ne convient pas (mauvais choix d'épreuve, durée incohérente, choix de famille à revoir) — tu cliques **« Rejeter »** sur le panneau Mésocycle.

Une boîte de confirmation t'explique : « Toute la planif muscu posée par ce mésocycle (N semaines) sera supprimée, et l'état d'avant restauré. Le nageur sera notifié. »

Tu confirmes →

- Toutes les séances du mésocycle sont retirées de la timeline.
- L'état d'avant la génération est **restauré à l'identique** (depuis le snapshot).
- Le mésocycle passe en statut « reverted ».
- Le nageur reçoit une notif « Ton coach a annulé le mésocycle X. La planif d'avant a été restaurée. »
- Il peut en regénérer un nouveau (en ajustant ses paramètres après discussion avec toi, par exemple).

---

## 5. Comment le moteur prend ses décisions

Le moteur travaille en 5 étapes successives. Si tu veux comprendre ce qui se passe « sous le capot » (sans entrer dans le code) :

### 1. Scoring des 6 seaux

Chaque KPI passe par un **barème par sexe × bande d'âge** (13-14, 15-16, 17-18). Une mesure brute (par exemple `imtp = 95 kg`) devient un **score 0-100** par interpolation entre des ancres (p10, p30, p50, p70, p90).

- Le seau **Force bas du corps** ← score de l'IMTP.
- Le seau **Puissance bas du corps** ← moyenne des scores détente verticale + saut en longueur.
- Le seau **Force haut du corps** ← traction lestée.
- Le seau **Puissance haut du corps** ← lancer médecine-ball.
- Le seau **Mobilité** ← bilan coach (somme des 6 sous-scores 0-3 sur 18, ramenée à 100).
- Le seau **Psychologie** ← questionnaire (confiance + motivation + (6 − stress)).

> **Données manquantes ?** Un KPI absent → score `null`. Le seau peut quand même être scoré si au moins une source existe (ex. Puissance bas restera scorée si seul le broad jump est dispo).

### 2. Priorisation des 6 seaux

Pour chaque seau on calcule un score combiné :

```
priorité = bucket_emphasis × (100 − score)
```

- `bucket_emphasis` vient du template (l'épreuve « sprint » sollicite beaucoup la puissance, moins l'endurance, par exemple).
- `(100 − score)` reflète « combien il y a à faire » : un score faible monte la priorité.

**Override sécurité** : si une **douleur intense** (intensité ≥ 3) ou une **dysfonction** (sous-score physical_tests = 0) est détectée → la **Mobilité** est forcée en priorité 1, quoi qu'il arrive. C'est non négociable.

> **Pourquoi `null` est traité comme 0 ?** Conservateur. Si on n'a pas pu mesurer une force, on suppose qu'elle est faible et on la travaille. Mieux vaut faire du travail utile sur un déficit non confirmé que l'ignorer.

### 3. Allocation du volume

Sur les **5 seaux entraînables** (la psychologie n'a pas d'exercices, juste un flag) :

- Les **2 premiers prioritaires** = **focus** (~60 % du volume).
- Les **autres entraînables** = **maintien** (~40 % du volume).
- La **Mobilité** est en **échauffement systématique** dans chaque séance — sauf si elle est en focus (override sécurité), auquel cas elle prend une part dédiée.

### 4. Sélection des exercices

Pour chaque seau alloué, le moteur prend les exercices du catalogue qui :

1. Sont dans le **bon seau** (taggé `bucket = lower_strength` par exemple).
2. Sont à un **niveau ≤ ton niveau** (intermédiaire par défaut).
3. **Ne contiennent pas de contre-indication** sur une zone où tu as déclaré une douleur. *(Exemple : tu as mal à l'épaule, le développé couché est exclu.)*

Les exercices marqués `is_core` (les fondamentaux du seau) sont triés en premier. Si un exercice fondamental est exclu pour cause de douleur, un **remplaçant** est sélectionné et marqué `substituted` — tu le verras dans l'aperçu avec un badge « remplace #X ».

### 5. Périodisation sur la durée cible

Le template définit une **séquence de phases** (par exemple : prepa_generale → force_max → puissance → pic). Chaque phase a une plage `[min, nominal, max]` de semaines.

Si tu choisis **8 semaines** et que la somme des `nominal` fait 10, le moteur **comprime** : il prend une semaine à chaque phase qui peut être réduite (jusqu'à `min`). Inversement si tu choisis 15, il **étire** dans `[nominal, max]`.

Si tu choisis une durée **hors de la plage du template** (< Σmin ou > Σmax), le système refuse — c'est protégé.

### Chargement des exercices par cycle

Selon le cycle de la semaine :

- **Préparation générale** → on lit les paramètres `*_endurance` de chaque exercice dans le catalogue.
- **Force max** → on lit les paramètres `*_force` du catalogue.
- **Puissance, Maintien, Affûtage, Pic** → schéma de charge porté par le cycle (pas par l'exercice), avec son **intention** affichée (ex. « Déplacer la charge à vitesse maximale »).

---

## 6. Lexique

| Terme | Définition |
|---|---|
| **Bilan muscu** | L'instantané de ton état physique à un instant T : 5 tests + bilan coach + questionnaire. |
| **Mésocycle** | Un plan d'entraînement structuré sur plusieurs semaines (typiquement 5 à 23). |
| **Cycle de périodisation** | Une « phase » d'une semaine du mésocycle (prepa_generale, force_max, puissance, maintien, affutage, pic). |
| **Seau** (`bucket`) | Une catégorie d'exercices : force bas, puissance bas, force haut, puissance haut, mobilité. La psychologie est un 6e seau, pas entraînable. |
| **KPI** | Un test mesuré qui alimente le score d'un seau (IMTP, détente, broad jump, traction lestée, lancer médecine-ball). |
| **Barème** | La table par sexe × bande d'âge qui convertit ta mesure brute en un score 0-100. |
| **Override** (sécurité) | Quand le système force la mobilité en priorité 1 à cause d'une douleur intense ou d'une dysfonction. |
| **Substitution** | Quand un exercice fondamental est remplacé par un autre à cause d'une douleur. |
| **Snapshot** | La sauvegarde automatique de ta planif d'avant l'application du mésocycle — sert au revert. |
| **Revert** | L'annulation d'un mésocycle qui restaure la planif à l'identique d'avant. |
| **Status `active` / `superseded` / `reverted`** | L'état d'un mésocycle. Un seul peut être actif à la fois. |
| **`engine_version`** | La version du moteur ayant calculé le mésocycle. Permet de tracer si une mise à jour change les résultats. |

---

## 7. FAQ — cas particuliers

### J'ai mal quelque part en cours de mésocycle

Va dans ton **questionnaire wellness quotidien** (ou pain reports) → déclare la douleur. Ça ne change PAS le mésocycle actif (pas de regénération auto pour l'instant — c'est le Chantier E, à venir).

**Pour l'instant** : préviens ton coach. Il peut éditer les séances concernées (substituer l'exercice manuellement) sans annuler le mésocycle entier.

### J'ai raté plusieurs séances

Ce n'est pas un drame. Le mésocycle est un guide, pas un contrat. Les séances ratées sont consultables dans ton historique. À la fin du mésocycle, ton prochain bilan reflètera l'écart entre ce qui était prévu et ce qui a été fait.

> **À venir (Chantier E)** : une boucle de suivi qui détectera automatiquement la fin de ton mésocycle et te proposera de refaire ton bilan — la comparaison avec l'ancien te montrera tes progrès réels.

### Je veux changer mon mésocycle en cours

Deux options :

1. **Éditer une séance à la fois** : ton coach peut le faire en cliquant dessus.
2. **Tout refaire** : tu en regénères un nouveau (via la même tuile « Régénérer un mésocycle muscu »). L'ancien passe en `superseded`, le nouveau remplace. Le coach est notifié.

### Mon coach n'est pas d'accord avec mon mésocycle

Il te le dit, vous discutez, et il peut soit :

- **Éditer les séances** qui ne lui plaisent pas (action chirurgicale).
- **Rejeter le mésocycle entier** (action radicale) — la planif d'avant est restaurée, tu reçois une notif, vous regénérez ensemble en ajustant les paramètres.

### Pourquoi mon plan inclut de la mobilité partout ?

C'est **systématique** : la mobilité est en échauffement de chaque séance. Si en plus elle est en focus (override sécurité ou score très bas), elle prend aussi un bloc principal.

C'est intentionnel : la mobilité est sous-travaillée chez la majorité des nageurs adolescents et conditionne directement la qualité du reste.

### Pourquoi pas d'hypertrophie ?

Décision validée avec le coach après revue de la littérature S&C : **l'hypertrophie non spécifique augmente la traînée hydrodynamique**. Pour des nageurs, on cherche la **force maximale** et la **puissance**, pas la croissance musculaire pour la croissance.

Le vocabulaire historique `endurance / hypertrophie / force / deload` est abandonné côté Bilan Muscu au profit du vocabulaire à 6 cycles : `prepa_generale / force_max / puissance / maintien / affutage / pic`.

### Le moteur peut-il se tromper ?

Il peut **mal calibrer** dans certains cas (barèmes transposés depuis des populations non-natation pour 4 KPIs sur 5 — flag `transposed` ou `placeholder` dans le raisonnement). Mais il ne **ment pas** : tout choix est explicable et auditable.

Le coach a toujours le dernier mot. Le moteur est un assistant, pas un décideur.

### Que se passe-t-il si je n'ai pas fait certains tests ?

- Si tu n'as **aucun KPI** → tous les seaux entraînables sont à `null` → traités comme 0 (priorité max). Le mésocycle va travailler globalement, faute de mieux. La confiance des données est `low`.
- Si tu en as **3 sur 5** → confiance `partial`. Les seaux scorés guident la priorisation, les autres sont conservateurs.
- Si tu as **tout** → confiance `full`. Calibration optimale.

> **Conseil** : passer le bilan complet une fois te coûte ~45 min, mais te donne plusieurs mois de plans calibrés. Refaire un bilan en fin de mésocycle te montre tes progrès chiffrés.

---

## 8. Ce qui n'est pas encore livré

| Chantier | Statut | Quoi |
|---|---|---|
| **A — Contenu** | ✅ Livré | 14 templates de périodisation + 94 exercices taggés + barèmes des 5 KPIs |
| **B — Bilan** | ✅ Livré | Questionnaire nageur + bilan physique coach + wizard KPIs |
| **C — Moteur** | ✅ Livré | `mesocycleEngine.ts` — 6 fonctions pures testées |
| **D — Intégration** | ✅ Livré | RPC apply/revert + écrans nageur + panneau coach |
| **E — Boucle de suivi** | ⏳ À venir | Détection auto de fin de mésocycle + comparaison bilan avant/après + suggestion du prochain plan |

Les **GIFs de démonstration** des 5 protocoles KPI ne sont pas encore en place (5 fichiers à fournir par l'équipe technique).

---

## 9. Pour aller plus loin

- **Côté nageur** : commence par faire ton bilan, puis génère un mésocycle de 8 semaines aligné sur ta prochaine compétition. Refais le bilan à la fin pour mesurer tes progrès.
- **Côté coach** : surveille les flags (psy bas, contre-indications actives) qui apparaissent dans les raisonnements des nageurs — ce sont les signaux que tu ne voyais pas avant.

**Questions, remarques, bugs** : François Wagner.

---

*Document maintenu en cohérence avec l'état du code au §293 (2026-05-20). Si tu vois un écart entre cette doc et l'app, c'est l'app qui a raison — préviens.*
