# Templates de périodisation muscu — 14 templates en modèle de phases

> **✅ PASSÉ AU MODÈLE DE PHASES À DURÉE VARIABLE (2026-05-18).** Ce document a
> été ré-écrit : les templates ne portent plus une table figée semaine→cycle
> mais une **liste ordonnée de phases**, chacune avec une plage de durée
> `{ cycle, min_weeks, nominal_weeks, max_weeks }`. À la génération (Chantier C),
> le coach saisit une durée cible et le moteur étire/comprime chaque phase dans
> sa plage. Le document compte désormais **14 templates** : **7 « saison »**
> (`kind = season`, un par famille d'épreuve) + **7 « mini-prépa »**
> (`kind = inter_competition`, format court inter-compétitions). Vocabulaire des
> cycles : `prepa_generale / force_max / puissance / maintien / affutage / pic`
> (cf. `bilan-muscu-cycles-vocabulaire.md`). Les profils d'emphase par seau
> (`bucket_emphasis`) et les rationales S&C par épreuve **n'ont pas changé**
> pour les 7 templates de saison.

> **✅ VALIDÉ PAR LE COACH (2026-05-18).** Les 14 templates ont été validés avec
> une seule correction : le **plafond des 7 mini-prépas est resserré à 8 sem.**
> (au lieu de 11) — au-delà, on repasse sur un template de saison. Cette version
> est la version validée, prête à être seedée en base (table
> `strength_periodization_templates`). Le design qui fonde ce passage au modèle
> de phases est `docs/plans/2026-05-18-bilan-muscu-templates-duree-variable-design.md`.

---

## 1. Modèle de périodisation

### Le vocabulaire des cycles (`cycle`)

Chaque template décrit une progression par **cycles**. Chaque cycle porte un
type. Le vocabulaire compte **6 valeurs** : trois **blocs** (multi-semaines, le
cœur du travail) et trois **transitions** (semaine isolée, articulation entre
blocs ou vers la compétition). Détail complet dans
`bilan-muscu-cycles-vocabulaire.md`.

| `cycle` | Type | Nom FR | Intention physiologique | Charge / volume typique |
|---|---|---|---|---|
| `prepa_generale` | bloc | Préparation générale | Adaptation anatomique (tendons, posture, préhab), endurance de force, conditionnement général. Socle sur lequel la force se construit. Cycle dominant en début de saison et chez le fond. | Charges légères/modérées, séries longues (≈ 12-20 reps, ~50-70 % 1RM). |
| `force_max` | bloc | Force maximale | Force maximale : recrutement des unités motrices, coordination intermusculaire, charges lourdes sur les mouvements fondamentaux. | Charges lourdes, peu de reps (≈ 3-6 reps, ~80-89 % 1RM), récup longue (~3 min). |
| `puissance` | bloc | Puissance / vitesse | Conversion de la force en puissance explosive et vitesse (force-vitesse, pliométrie, RFD, haltérophilie dynamique). Bloc terminal du sprint. | Charges modérées déplacées à vitesse maximale (≈ 3-6 reps @ ~60-80 % 1RM), récup longue. |
| `maintien` | transition (1-3 sem.) | Maintien | Cycle court qui préserve les acquis sans construire (voyage, articulation entre deux blocs, léger deload). | Volume réduit (~40-60 %), intensité maintenue. |
| `affutage` | transition (1-3 sem.) | Affûtage | Réduction progressive du volume avant compétition, intensité et explosivité préservées (« rester nerveux »). | Volume en décroissance (−25 % → −40-50 %), intensité/vitesse tenues. |
| `pic` | transition (1 sem., figé) | Pic | Semaine de compétition : activation du SNC, séance très courte, « se sentir explosif ». | Volume minimal, charges légères déplacées à vitesse maximale. |

### Le modèle de phases (`structure.phases`)

Un template ne fixe **plus** une durée en semaines. Il décrit une **liste
ordonnée de phases**. Chaque phase tient **un cycle** sur une **plage de
durée** :

```jsonc
{ "cycle": "force_max", "min_weeks": 2, "nominal_weeks": 3, "max_weeks": 4 }
```

- `nominal_weeks` — la durée **validée par le coach** au point 1 (calibrage des
  longueurs de blocs). C'est le point de départ du moteur de génération.
- `min_weeks` / `max_weeks` — bornes de flexibilité de **chaque** phase. Le
  moteur étire/comprime la phase dans `[min_weeks, max_weeks]` pour atteindre la
  durée cible saisie par le coach.
- Une phase rigide a `min_weeks == nominal_weeks == max_weeks` — c'est le cas du
  `pic`, toujours figé à `[1, 1, 1]`.
- Contrainte de cohérence : `min_weeks ≤ nominal_weeks ≤ max_weeks` pour chaque
  phase.
- **Durée d'un template** ∈ `[Σ min_weeks, Σ max_weeks]` ; valeur par défaut
  = `Σ nominal_weeks`. Les bornes globales sont dénormalisées en colonnes
  `min_week_count` / `max_week_count` de la table (cf. design § 3).

**Fourchettes proposées par type de cycle** (ordres de grandeur S&C, point de
départ pour la validation coach) :

| `cycle` | Largeur de plage | Règle appliquée dans ce doc |
|---|---|---|
| `prepa_generale` | large (socle modulable) | `min` ≈ nominal−2 (plancher ≥ 1), `max` ≈ nominal+3. |
| `force_max` | étroite (fenêtre efficace) | `min` = 2, `max` = 4. |
| `puissance` | étroite (fenêtre efficace) | `min` = 2, `max` = 4. |
| `maintien` | courte | `min` = 1, `max` = 3. |
| `affutage` | courte | `min` = 1, `max` = 3. |
| `pic` | **figée** | `min` = `nominal` = `max` = 1. |

> **Exception T1 (`sprint_50`, saison).** La phase `affutage` de T1 a un
> `nominal` de **3 semaines** (validé par le coach) — soit son `nominal` **au
> plafond de la plage** `[1, 3, 3]`. C'est la seule phase `affutage` du doc dans
> ce cas : elle ne peut donc que se **comprimer** (jusqu'à 1 sem.), pas
> s'étirer. C'est voulu — un affûtage de sprint de 3 semaines est déjà long, il
> n'y a pas de raison de l'allonger davantage. Le `nominal` de T1 n'est pas
> rouvert ici (validé coach).

### La notion `kind` — saison vs mini-prépa

Chaque template porte un `kind` :

- **`season`** — préparation de saison (macrocycle complet). Un template par
  `event_group`. Forme : un ou plusieurs blocs `prepa_generale`/`force_max`/
  `puissance`, ponctués de `maintien`, terminés par `affutage` puis `pic`.
  Dérivés des 7 séquences validées par le coach au point 1.
- **`inter_competition`** — mini-prépa entre deux compétitions rapprochées
  (~1 mois). Un template par `event_group`. Format court (~5 sem. nominales,
  5-8 sem. selon la durée cible — plafonné à 8 sem. : au-delà, on repasse sur un
  template de saison). Forme :
  `maintien` (léger deload) → reload → `affutage` → `pic`. On part d'une base
  déjà solide (sortie de macrocycle) : on ne reconstruit pas, on relance
  fraîcheur et puissance.

Le **modèle de données est identique** pour les deux `kind` : mêmes phases,
mêmes plages — seule la forme de la séquence diffère.

### Le sens de `bucket_emphasis`

`bucket_emphasis` pondère **les qualités physiques que l'ÉPREUVE exige** (pas le
cycle en cours). 5 buckets entraînables, poids 0..1 :

| `bucket` | Qualité | Exemple de demande |
|---|---|---|
| `lower_strength` | Force du bas du corps | Gainage de jambes en nage longue, tenue de coulée. |
| `lower_power` | Puissance du bas du corps | Départ plongé, virages, coups de pied explosifs. |
| `upper_strength` | Force du haut du corps | Traction soutenue, maintien technique sous fatigue. |
| `upper_power` | Puissance du haut du corps | Traction explosive du sprint, premiers mètres. |
| `mobility` | Mobilité / prévention | Épaule du nageur, hanche en brasse, préhab d'épaule en nage longue. |

Les poids sont des **emphases relatives**, pas une somme normalisée à 1 : ils
disent «sur quoi insister» pour cette épreuve. Un sprint 50 m sature les buckets
de puissance ; un 1500 m insiste sur la force-endurance et la mobilité/préhab.
`bucket_emphasis` dépend de l'**épreuve**, pas du `kind` : un template
mini-prépa réutilise tel quel le `bucket_emphasis` du template saison de la même
spécialité.

> **Note sur le découpage.** Le template ne fixe **que la séquence de cycles et
> leurs plages de durée**. Le chargement de chaque cycle (séries/reps/%1RM/récup)
> est défini hors template, dans `src/lib/strength/periodizationCycles.ts` :
> `prepa_generale` et `force_max` réutilisent les paramètres `*_endurance` et
> `*_force` portés par chaque exercice de `dim_exercices` ; `puissance`,
> `maintien`, `affutage` et `pic` portent un **schéma de charge générique au
> niveau cycle**, appliqué uniformément (cf. `bilan-muscu-cycles-vocabulaire.md`
> § 3). La littérature S&C natation distingue explicitement la **force maximale**
> (phase de développement) de la **puissance / vitesse** (phase de construction
> puis de compétition) — d'où deux blocs distincts `force_max` puis `puissance`.

> **Note : pas de cycle `test` dans les templates.** L'évaluation 1RM est une
> étape **amont** du Bilan Muscu (hors périodisation) ; ce n'est pas un cycle.
> Chaque template démarre directement sur son premier cycle d'entraînement.

> **Note pour le seeding.** Le champ `structure` (jsonb, type figé
> `PeriodizationStructure`) porte **`phases: [{ cycle, min_weeks,
> nominal_weeks, max_weeks }]` + `bucket_emphasis`**. Les colonnes dénormalisées
> `min_week_count` / `max_week_count` de la table valent respectivement
> `Σ min_weeks` et `Σ max_weeks` des phases — le seed les renseigne en
> cohérence avec le `structure`. La colonne *Intention* des tables de phases
> ci-dessous est un **commentaire de lecture** (contexte coach) : elle n'est
> **pas** seedée — seuls `cycle` et les trois durées le sont, phase par phase.

### Honnêteté sur les sources

Les programmes nominatifs des athlètes d'élite **ne sont pas publics**. Aucun
template ci-dessous n'est présenté comme «le programme de l'athlète X». Chaque
template est une **synthèse de bonnes pratiques** fondée sur :

1. la **littérature S&C natation publiée** (revues, études de pratiques de
   coaches) ;
2. des **approches générales publiquement documentées** (presse spécialisée,
   interviews).

Quand un choix relève de mon raisonnement de synthèse plutôt que d'une citation
directe, c'est indiqué explicitement par la mention *(synthèse)*.

**Sources principales mobilisées :**

- **Frontiers in Sports and Active Living (2023)** — *From dry-land to the
  water: training and testing practices of strength and conditioning coaches in
  high level French sprint swimmers* (enquête auprès de coaches S&C français de
  sprinteurs élite). Clé pour : séquence développement (force max) →
  construction (puissance) → compétition (vitesse max) ; ≥ 3 séances/semaine ;
  paramètres force max (~89 % 1RM, 3-4×3-4) et puissance (~59 % 1RM, 3-4×6-7).
- **NSCA Coach** — *Beyond the Pool: Improving Swimming Performance with
  Dryland Training*. Clé pour : progression du général/foundational vers
  l'explosif spécifique ; intensités par épreuve (sprint 3-6 reps @ 70-85 %
  1RM ; endurance 10-15 reps @ 50-70 % 1RM) ; guidance par nage (papillon/brasse
  → stabilité d'épaule + mobilité de hanche ; crawl/dos → gainage + position de
  coulée).
- **PMC8296310 (2021)** — *Periodization and Programming for Individual 400 m
  Medley Swimmers*. Clé pour : macrocycles General → Specific → Competitive ;
  premier macrocycle orienté force-base / force-métabolique en circuit, puis
  force max / puissance / vitesse-endurance ; taper 8-21 j, −40-60 % de charge.
- **Frontiers in Physiology (2019)** — *Elite Swimmers' Training Patterns in the
  25 Weeks Prior to Their Season's Best Performances* (cohorte 20 ans). Clé
  pour : structure de pré-saison vers pic ; sprinteurs vs demi-fond.
- **PMC7052717 (2020)** — *The Effectiveness of a Dry-Land Shoulder Rotators
  Strength Training Program in Injury Prevention in Competitive Swimmers*. Clé
  pour : déficit rotateurs externes < internes ; préhab d'épaule.
- **PMC4637920** — *Effects of a Dry-Land Strengthening Program in Competitive
  Adolescent Swimmers*. Clé pour : gains de force de rotation externe d'épaule.
- **Frontiers in Physiology (2022) / PMC9730280** — *VO2 kinetics and tethered
  strength influence the 200-m front crawl stroke kinematics and speed*. Clé
  pour : profil mixte aéro-anaérobie du 200 m, ~72-79 % aérobie.
- **Presse spécialisée natation** — couverture publique de l'approche sprint
  «qualité plutôt que volume» de Cameron McEvoy (calisthénie, gymnastique,
  escalade, haltérophilie ; volume en bassin fortement réduit ; priorité
  récupération/mobilité). Sources : olympics.com, swimswam.com, yourswimlog.com.
  *Utilisé comme illustration d'une tendance documentée, pas comme copie d'un
  programme confidentiel.*
- **U.S. Masters Swimming** — guides dryland brasse et dos (rôle des
  adducteurs en brasse ; chaîne postérieure / lats en dos).

URLs en fin de document.

---

## 2. Les 7 templates « saison » (`kind = season`)

> Chaque template ci-dessous est dérivé d'une **séquence semaine→cycle validée
> par le coach** au point 1 du chantier. La conversion en phases est mécanique :
> chaque suite contiguë de semaines d'un même cycle = une phase, dont le
> `nominal_weeks` reprend **exactement** la longueur validée. Les
> `min_weeks`/`max_weeks` sont les fourchettes de flexibilité (cf. § 1).

### T1 — `sprint_50` · Sprint 50 m crawl / papillon

- **`event_group`** : `sprint_50` — **`kind`** : `season`
- **`name`** : « Sprint 50 m — Force-vitesse »
- Séquence validée : `force_max`×2 → `maintien`×1 → `puissance`×2 → `affutage`×3 → `pic`×1

| Phase # | `cycle` | `min_weeks` | `nominal_weeks` | `max_weeks` | Intention |
|---|---|---|---|---|---|
| 1 | `force_max` | 2 | 2 | 4 | Force max, charges lourdes puis montée en charge (squat / traction / SDT / tirage). |
| 2 | `maintien` | 1 | 1 | 3 | Articulation entre les blocs : volume réduit, intensité tenue. |
| 3 | `puissance` | 2 | 2 | 4 | Conversion force→vitesse (Power Clean, squat jump, med-ball), RFD, vitesse maximale. |
| 4 | `affutage` | 1 | 3 | 3 | Affûtage étalé : paliers −25 % → −40 % → −50 % de volume, explosivité préservée. |
| 5 | `pic` | 1 | 1 | 1 | Pic / activation SNC, très court, « se sentir explosif ». |

→ `min_week_count` = 7 · `nominal` = 9 · `max_week_count` = 15

**`bucket_emphasis`** :

| bucket | poids | justification |
|---|---|---|
| `upper_power` | **1.0** | Le 50 m est une épreuve de puissance quasi pure ; la traction explosive domine. |
| `lower_power` | **0.95** | Départ plongé + un virage (50 m) = poids décisif du bas du corps explosif. |
| `upper_strength` | 0.6 | Socle de force nécessaire pour exprimer la puissance, sans plus. |
| `lower_strength` | 0.55 | Idem, support de la puissance. |
| `mobility` | 0.4 | Mobilité utile (amplitude, départ) mais moins critique qu'en nage longue. |

**Rationale S&C.** L'enquête Frontiers 2023 sur les coaches S&C de sprinteurs
élite français décrit exactement cette progression : force maximale (phase de
développement), puis puissance maximale (phase de construction), puis **vitesse
maximale juste avant la compétition**. La NSCA recommande pour le sprint des
charges lourdes à faibles reps (3-6 @ 70-85 % 1RM) pour la puissance anaérobie.
La tendance «qualité plutôt que volume» publiquement documentée autour de
Cameron McEvoy (haltérophilie, calisthénie, gymnastique, mobilité priorisée)
renforce le choix d'une phase `puissance` consistante et d'un `affutage` étalé
sur 3 semaines pour préserver la fraîcheur nerveuse. Le double poids
`upper_power` + `lower_power` reflète qu'un 50 m se gagne au départ, sous l'eau
et sur les premiers appuis. La séquence reproduit le **plan réel 10 semaines
d'un sprinteur du club**, débarrassé de sa semaine de test amont : `force_max`
×2 → `maintien` ×1 (articulation entre les blocs) → `puissance` ×2 → `affutage`
×3 → `pic` ×1 = 9 semaines nominales. Pas de `prepa_generale` — le sprinteur
arrive déjà préparé, la période est entièrement tirée vers l'explosivité ; en
conséquence la phase `affutage` (3 sem. nominales) a une plage réduite vers le
bas seulement (`min` 1) pour comprimer sans descendre sous le plancher S&C.

---

### T2 — `breaststroke` · Brasse

- **`event_group`** : `breaststroke` — **`kind`** : `season`
- **`name`** : « Brasse — Hanche & adducteurs »
- Séquence validée : `prepa_generale`×3 → `force_max`×3 → `puissance`×3 → `affutage`×2 → `pic`×1

| Phase # | `cycle` | `min_weeks` | `nominal_weeks` | `max_weeks` | Intention |
|---|---|---|---|---|---|
| 1 | `prepa_generale` | 1 | 3 | 6 | Adaptation anatomique, préhab hanche/adducteurs, endurance de force du fouet de jambes. |
| 2 | `force_max` | 2 | 3 | 4 | Force max des adducteurs / hanche, charges lourdes, mouvements fondamentaux. |
| 3 | `puissance` | 2 | 3 | 4 | Conversion force→puissance du fouet brasse, force-vitesse, explosivité de jambes. |
| 4 | `affutage` | 1 | 2 | 3 | Affûtage, paliers −25 % puis −50 % de volume, explosivité préservée. |
| 5 | `pic` | 1 | 1 | 1 | Pic pré-compétition, activation SNC. |

→ `min_week_count` = 7 · `nominal` = 12 · `max_week_count` = 18

**`bucket_emphasis`** :

| bucket | poids | justification |
|---|---|---|
| `lower_power` | **1.0** | La propulsion brasse vient du rappel explosif des jambes (adducteurs) ; le fouet est le moteur n°1. |
| `lower_strength` | **0.85** | Force d'adducteurs/hanche pour gérer les charges du fouet et éviter les pubalgies. |
| `mobility` | **0.8** | Rotation interne de hanche = légalité du kick ; mobilité de hanche élevée et spécifique. |
| `upper_power` | 0.6 | Traction brasse présente mais moins dominante que les jambes. |
| `upper_strength` | 0.55 | Socle de traction. |

**Rationale S&C.** La brasse est la seule nage où les jambes sont le premier
moteur, et la propulsion vient des **adducteurs** qui rappellent les jambes (pas
de l'extension du genou). Les guides dryland brasse (U.S. Masters Swimming)
insistent sur le travail spécifique adducteurs / hanche et la prévention des
pubalgies, et la NSCA classe la brasse parmi les nages exigeant **stabilité
d'épaule + mobilité de hanche**. D'où le triplet inhabituel `lower_power` +
`lower_strength` + `mobility` élevés. La phase `prepa_generale` est *un peu plus
longue que la base du sprint (3 semaines nominales, synthèse)* pour laisser le
temps de construire la préhab spécifique de hanche/adducteurs, qui s'acquiert
lentement, avant d'enchaîner sur `force_max` puis `puissance`. C'est cette phase
de socle qui porte la plus large plage (`[1, 3, 6]`) : c'est le levier principal
quand le coach veut allonger ou raccourcir le macrocycle.

---

### T3 — `backstroke` · Dos

- **`event_group`** : `backstroke` — **`kind`** : `season`
- **`name`** : « Dos — Chaîne postérieure & épaule »
- Séquence validée : `prepa_generale`×3 → `force_max`×3 → `puissance`×3 → `affutage`×2 → `pic`×1

| Phase # | `cycle` | `min_weeks` | `nominal_weeks` | `max_weeks` | Intention |
|---|---|---|---|---|---|
| 1 | `prepa_generale` | 1 | 3 | 6 | Adaptation anatomique, préhab épaule (rotateurs), socle lats + chaîne postérieure. |
| 2 | `force_max` | 2 | 3 | 4 | Force max de traction dorsale, charges lourdes, mouvements fondamentaux. |
| 3 | `puissance` | 2 | 3 | 4 | Conversion force→puissance de traction + ondulation, force-vitesse, explosivité. |
| 4 | `affutage` | 1 | 2 | 3 | Affûtage, paliers −25 % puis −50 % de volume, explosivité préservée. |
| 5 | `pic` | 1 | 1 | 1 | Pic pré-compétition, activation SNC. |

→ `min_week_count` = 7 · `nominal` = 12 · `max_week_count` = 18

**`bucket_emphasis`** :

| bucket | poids | justification |
|---|---|---|
| `upper_power` | **0.9** | Traction dorsale puissante, position de tirage atypique bras écartés. |
| `upper_strength` | **0.85** | Lats et grand dorsal très sollicités ; force de traction soutenue. |
| `mobility` | **0.8** | Épaule du nageur : déficit rotateurs externes ; préhab + amplitude critiques en dos. |
| `lower_power` | 0.7 | Ondulation sous-marine et coups de pied = puissance de chaîne postérieure (glutes/ischios). |
| `lower_strength` | 0.6 | Socle de chaîne postérieure. |

**Rationale S&C.** Le dos sollicite fortement **lats et chaîne postérieure**
(glutes, ischios, quadriceps) — confirmé par les guides dryland dos (U.S.
Masters Swimming), qui ajoutent que la position de tirage bras écartés et les
reaches rotationnels exigent une vraie force. La mobilité d'épaule est élevée
car les études de prévention (PMC7052717, PMC4637920) documentent un **déficit
de rotateurs externes** chez les nageurs et l'efficacité d'un programme de
renforcement des rotateurs ; le dos, dos à la surface avec entrées de bras au-
dessus de la tête, est particulièrement exposé. L'ondulation sous-marine, arme
majeure du dos moderne, justifie un `lower_power` non négligeable. La phase
`prepa_generale` initiale est *chargée en préhab d'épaule (3 semaines nominales,
synthèse)* avant la phase `force_max` puis la phase `puissance` — et porte la
plage la plus large (`[1, 3, 6]`).

---

### T4 — `200m` · 200 m

- **`event_group`** : `200m` — **`kind`** : `season`
- **`name`** : « 200 m — Force-endurance mixte »
- Séquence validée : `prepa_generale`×3 → `force_max`×3 → `puissance`×3 → `affutage`×2 → `pic`×1

| Phase # | `cycle` | `min_weeks` | `nominal_weeks` | `max_weeks` | Intention |
|---|---|---|---|---|---|
| 1 | `prepa_generale` | 1 | 3 | 6 | Adaptation anatomique, endurance de force, conditionnement. |
| 2 | `force_max` | 2 | 3 | 4 | Force max, charges lourdes, mouvements fondamentaux. |
| 3 | `puissance` | 2 | 3 | 4 | Conversion force→puissance orientée vitesse-endurance, qualité. |
| 4 | `affutage` | 1 | 2 | 3 | Affûtage, paliers −25 % puis −50 % de volume, explosivité préservée. |
| 5 | `pic` | 1 | 1 | 1 | Pic pré-compétition, activation SNC. |

→ `min_week_count` = 7 · `nominal` = 12 · `max_week_count` = 18

**`bucket_emphasis`** :

| bucket | poids | justification |
|---|---|---|
| `upper_strength` | **0.9** | Le 200 m exige une traction puissante **maintenue sous fatigue** ; force-endurance du haut du corps. |
| `upper_power` | **0.8** | Encore proche du sprint ; départ, virages (3 virages en 200 m), explosivité utile. |
| `lower_power` | **0.75** | 3 virages = poids réel des appuis explosifs. |
| `lower_strength` | 0.7 | Force de jambes pour tenir l'amplitude de coup de pied sur 200 m. |
| `mobility` | 0.6 | Préhab et amplitude, charge de bassin déjà élevée. |

**Rationale S&C.** Le 200 m est une épreuve **mixte** : ~72-79 % d'apport
aérobie (Frontiers Physiology 2022 / PMC9730280) mais une composante anaérobie
décisive — la littérature place le 200 m comme l'épreuve la plus dépendante de
la tolérance au lactate (peak lactate). Côté muscu, cela se traduit par un
équilibre : une phase `prepa_generale` plus longue qu'en sprint, mais une phase
`puissance` qui vise la **vitesse-endurance** (puissance maintenue) plutôt que
la vitesse pure. L'emphase bascule de `*_power` (sprint) vers `upper_strength` :
tenir la traction sans s'écrouler dans le 3e 50 est le nerf de la guerre. La
séquence est *volontairement équilibrée force ↔ puissance* — 3 semaines
nominales de chaque bloc.

---

### T5 — `400m` · 400 m

- **`event_group`** : `400m` — **`kind`** : `season`
- **`name`** : « 400 m — Force-endurance aérobie »
- Séquence validée : `prepa_generale`×4 → `force_max`×3 → `maintien`×1 → `puissance`×2 → `affutage`×2 → `pic`×1

| Phase # | `cycle` | `min_weeks` | `nominal_weeks` | `max_weeks` | Intention |
|---|---|---|---|---|---|
| 1 | `prepa_generale` | 2 | 4 | 7 | Adaptation anatomique, endurance de force, conditionnement métabolique. |
| 2 | `force_max` | 2 | 3 | 4 | Force max, charges lourdes, mouvements fondamentaux. |
| 3 | `maintien` | 1 | 1 | 3 | Articulation : volume réduit, transfert vers la force durable. |
| 4 | `puissance` | 2 | 2 | 4 | Conversion force→puissance / vitesse-endurance durable, qualité. |
| 5 | `affutage` | 1 | 2 | 3 | Affûtage, paliers −25 % puis −50 % de volume, explosivité préservée. |
| 6 | `pic` | 1 | 1 | 1 | Pic pré-compétition, activation SNC. |

→ `min_week_count` = 9 · `nominal` = 13 · `max_week_count` = 22

**`bucket_emphasis`** :

| bucket | poids | justification |
|---|---|---|
| `upper_strength` | **1.0** | Le 400 m se joue sur la force-endurance de traction : maintenir la propulsion 4 min. |
| `lower_strength` | **0.8** | Force de jambes durable, gainage de coup de pied prolongé. |
| `mobility` | **0.8** | Volume de bassin élevé → préhab d'épaule essentielle ; amplitude de nage. |
| `upper_power` | 0.65 | Départ et virages présents (7 virages en 400 m) mais moins déterminants. |
| `lower_power` | 0.6 | Appuis explosifs utiles aux virages, secondaires. |

**Rationale S&C.** Le 400 m est l'épreuve charnière : nettement plus aérobie que
le 200, mais encore loin du fond. La NSCA recommande pour les épreuves
d'endurance des charges modérées à reps élevées (10-15 @ 50-70 % 1RM) — d'où une
phase `prepa_generale` initiale longue (4 semaines nominales) qui porte
l'endurance de force, et qui ouvre la plage la plus large (`[2, 4, 7]`). Une
phase `maintien` articule la phase `force_max` vers la phase `puissance`, qui
reste **courte** (2 semaines nominales) : on cherche de la force durable, pas de
la vitesse pure. L'emphase passe résolument sur `*_strength` (force-endurance)
et `mobility` (préhab d'épaule, le volume de bassin grimpant). *13 semaines
nominales : synthèse*, cohérente avec un mésocycle «Specific» long du modèle
400 m médley (PMC8296310, mésocycles spécifiques de 7-10 semaines).

---

### T6 — `distance` · 800 / 1500 m

- **`event_group`** : `distance` — **`kind`** : `season`
- **`name`** : « Demi-fond — Endurance de force & préhab »
- Séquence validée : `prepa_generale`×5 → `maintien`×1 → `force_max`×3 → `puissance`×2 → `affutage`×2 → `pic`×1

| Phase # | `cycle` | `min_weeks` | `nominal_weeks` | `max_weeks` | Intention |
|---|---|---|---|---|---|
| 1 | `prepa_generale` | 3 | 5 | 8 | Adaptation anatomique, préhab épaule, endurance de force spécifique, gainage soutenu. |
| 2 | `maintien` | 1 | 1 | 3 | Articulation : volume réduit avant le bloc de force. |
| 3 | `force_max` | 2 | 3 | 4 | Force max (bloc court), charges lourdes, mouvements fondamentaux. |
| 4 | `puissance` | 2 | 2 | 4 | Conversion en force durable / puissance (bloc court), quelques séances de qualité. |
| 5 | `affutage` | 1 | 2 | 3 | Affûtage, paliers −25 % puis −50 % de volume, qualité préservée. |
| 6 | `pic` | 1 | 1 | 1 | Pic pré-compétition, activation SNC. |

→ `min_week_count` = 10 · `nominal` = 14 · `max_week_count` = 23

**`bucket_emphasis`** :

| bucket | poids | justification |
|---|---|---|
| `upper_strength` | **1.0** | Le demi-fond se gagne sur la traction maintenue ; force-endurance du haut du corps avant tout. |
| `mobility` | **1.0** | 60-80 km/semaine en bassin → l'épaule du nageur est le risque n°1 ; préhab maximale. |
| `lower_strength` | **0.75** | Gainage de coup de pied sur 800/1500 m, tenue posturale. |
| `upper_power` | 0.45 | Départ et virages dilués sur la distance ; faible poids. |
| `lower_power` | 0.4 | Appuis explosifs marginaux sur ces distances. |

**Rationale S&C.** Pour le demi-fond, l'objectif dryland prioritaire est la
**prévention de blessure** et la force-endurance, pas la puissance. Les sources
sur le 1500 m soulignent que les nageurs de fond couvrent 60-80 km/semaine et
que ce volume génère douleurs d'épaule et de bas du dos ; les études PMC7052717
et PMC4637920 démontrent l'intérêt d'un renforcement des rotateurs externes
d'épaule. D'où `mobility` à 1.0 (à égalité avec `upper_strength`) — c'est le
seul template où la préhab est aussi haute. La structure fait porter le template
par une phase `prepa_generale` **dominante** (5 semaines nominales : endurance
de force, gainage, préhab), puis une phase `force_max` modérée et une phase
`puissance` courte : on cherche un nageur **fort sous fatigue** sans alourdir
une masse qui pénaliserait l'hydrodynamisme. *14 semaines nominales : synthèse*
— le template le plus long, car la force-endurance et la résilience tissulaire
se construisent sur la durée ; sa plage globale (`[10, 23]`) est la plus large
des 7 templates de saison.

---

### T7 — `medley` · 4 nages

- **`event_group`** : `medley` — **`kind`** : `season`
- **`name`** : « 4 nages — Polyvalence force-puissance »
- Séquence validée : `prepa_generale`×3 → `force_max`×3 → `maintien`×1 → `puissance`×3 → `affutage`×2 → `pic`×1

| Phase # | `cycle` | `min_weeks` | `nominal_weeks` | `max_weeks` | Intention |
|---|---|---|---|---|---|
| 1 | `prepa_generale` | 1 | 3 | 6 | Adaptation anatomique, préhab globale, endurance de force, conditionnement (circuit). |
| 2 | `force_max` | 2 | 3 | 4 | Force max, charges lourdes, mouvements fondamentaux. |
| 3 | `maintien` | 1 | 1 | 3 | Articulation : volume réduit entre force et puissance. |
| 4 | `puissance` | 2 | 3 | 4 | Conversion force→puissance / vitesse-endurance, qualité. |
| 5 | `affutage` | 1 | 2 | 3 | Affûtage, paliers −25 % puis −50 % de volume, explosivité préservée. |
| 6 | `pic` | 1 | 1 | 1 | Pic pré-compétition, activation SNC. |

→ `min_week_count` = 8 · `nominal` = 13 · `max_week_count` = 21

**`bucket_emphasis`** :

| bucket | poids | justification |
|---|---|---|
| `upper_strength` | **0.85** | 4 nages = traction soutenue toutes nages confondues ; force-endurance polyvalente. |
| `upper_power` | **0.8** | Papillon (1re nage) et virages nombreux exigent de l'explosivité de traction. |
| `lower_power` | **0.8** | Brasse + virages + départ : puissance de jambes décisive sur un medley. |
| `mobility` | **0.8** | 4 nages = 4 patterns d'épaule/hanche ; mobilité large pour brasse + dos + papillon. |
| `lower_strength` | **0.75** | Force de jambes pour la brasse et le gainage global. |

**Rationale S&C.** Le 4 nages est l'épreuve la plus **équilibrée** : aucun
bucket ne peut être négligé car les 4 nages cumulent leurs exigences (puissance
de traction du papillon, mobilité d'épaule du dos, puissance de jambes et
mobilité de hanche de la brasse, force-endurance du crawl). C'est pourquoi tous
les buckets sont entre 0.75 et 0.85 — un profil volontairement plat. Le modèle
de périodisation 400 m médley publié (PMC8296310) décrit précisément un premier
macrocycle orienté **force-base et conditionnement métabolique en circuit**,
puis force max / puissance / vitesse-endurance — séquence reprise ici, avec une
phase `maintien` articulant `force_max` et `puissance`. *13 semaines nominales :
synthèse*, séquence médiane alignée sur les mésocycles longs du modèle médley
publié. Note : ce template vise le 4-nages «générique» ; un medleyiste de 200 m
et un de 400 m n'ont pas exactement le même besoin (voir Questions ouvertes).

---

## 3. Les 7 templates « mini-prépa » (`kind = inter_competition`)

> **Objectif.** Un format court (~5 sem. nominales, 5-8 sem. selon la durée
> cible) par `event_group`, à utiliser **entre deux compétitions rapprochées**.
> On part d'une base déjà solide (sortie de macrocycle) : pas de reconstruction,
> juste une **relance de fraîcheur et de puissance**. Le plafond est volontairement
> tenu à **8 sem.** (décision coach) : au-delà, ce n'est plus une mini-prépa,
> on bascule sur un template de saison. Forme commune : `maintien`
> (léger deload pour évacuer la fatigue de la compétition précédente) → **reload**
> (un bloc court qui remet du jus) → `affutage` → `pic`.
>
> **Cycle de reload.** `puissance` pour les profils explosifs (`sprint_50`,
> `breaststroke`, `backstroke`, `200m`, `medley`) : entre deux compétitions, ces
> nageurs ont besoin de retrouver la vitesse et le tonus nerveux, pas de
> reconstruire de la force de base déjà acquise. `force_max` pour les profils de
> fond (`400m`, `distance`) : sur ces épreuves, c'est la force-endurance qui
> s'érode entre deux compétitions, et un rappel de force maximale courte la
> recharge mieux qu'un travail de vitesse peu transférable.
>
> **`bucket_emphasis`** : **réutilisé tel quel** du template « saison » de la
> même spécialité — les exigences de l'épreuve ne changent pas selon le `kind`.

### T8 — `sprint_50` · Mini-prépa sprint 50 m

- **`event_group`** : `sprint_50` — **`kind`** : `inter_competition`
- **`name`** : « Sprint 50 m — Mini-prépa inter-compétitions »

| Phase # | `cycle` | `min_weeks` | `nominal_weeks` | `max_weeks` | Intention |
|---|---|---|---|---|---|
| 1 | `maintien` | 1 | 1 | 2 | Léger deload : évacuer la fatigue de la compétition précédente, intensité tenue. |
| 2 | `puissance` | 2 | 2 | 3 | Reload explosif : relancer force-vitesse et RFD, charges déplacées vite. |
| 3 | `affutage` | 1 | 1 | 2 | Affûtage court, explosivité préservée. |
| 4 | `pic` | 1 | 1 | 1 | Pic pré-compétition, activation SNC. |

→ `min_week_count` = 5 · `nominal` = 5 · `max_week_count` = 8

**`bucket_emphasis`** : réutilisé de T1 — `upper_power` 1.0, `lower_power` 0.95,
`upper_strength` 0.6, `lower_strength` 0.55, `mobility` 0.4.

**Choix du reload.** Profil explosif : le sprinteur garde sa base de force entre
deux compétitions, ce qui s'émousse vite c'est le tonus nerveux et la vitesse —
d'où un reload `puissance` (force-vitesse, pliométrie) plutôt qu'un rappel de
force maximale.

---

### T9 — `breaststroke` · Mini-prépa brasse

- **`event_group`** : `breaststroke` — **`kind`** : `inter_competition`
- **`name`** : « Brasse — Mini-prépa inter-compétitions »

| Phase # | `cycle` | `min_weeks` | `nominal_weeks` | `max_weeks` | Intention |
|---|---|---|---|---|---|
| 1 | `maintien` | 1 | 1 | 2 | Léger deload : récupérer de la compétition, mobilité hanche/adducteurs entretenue. |
| 2 | `puissance` | 2 | 2 | 3 | Reload explosif : relancer le fouet de jambes, force-vitesse des adducteurs. |
| 3 | `affutage` | 1 | 1 | 2 | Affûtage court, explosivité préservée. |
| 4 | `pic` | 1 | 1 | 1 | Pic pré-compétition, activation SNC. |

→ `min_week_count` = 5 · `nominal` = 5 · `max_week_count` = 8

**`bucket_emphasis`** : réutilisé de T2 — `lower_power` 1.0, `lower_strength`
0.85, `mobility` 0.8, `upper_power` 0.6, `upper_strength` 0.55.

**Choix du reload.** Profil explosif : la propulsion brasse est une explosion de
jambes ; entre deux compétitions, c'est la puissance du fouet qu'il faut
ré-aiguiser, pas la force de base. Reload `puissance`.

---

### T10 — `backstroke` · Mini-prépa dos

- **`event_group`** : `backstroke` — **`kind`** : `inter_competition`
- **`name`** : « Dos — Mini-prépa inter-compétitions »

| Phase # | `cycle` | `min_weeks` | `nominal_weeks` | `max_weeks` | Intention |
|---|---|---|---|---|---|
| 1 | `maintien` | 1 | 1 | 2 | Léger deload : récupérer, préhab d'épaule entretenue. |
| 2 | `puissance` | 2 | 2 | 3 | Reload explosif : relancer puissance de traction et ondulation sous-marine. |
| 3 | `affutage` | 1 | 1 | 2 | Affûtage court, explosivité préservée. |
| 4 | `pic` | 1 | 1 | 1 | Pic pré-compétition, activation SNC. |

→ `min_week_count` = 5 · `nominal` = 5 · `max_week_count` = 8

**`bucket_emphasis`** : réutilisé de T3 — `upper_power` 0.9, `upper_strength`
0.85, `mobility` 0.8, `lower_power` 0.7, `lower_strength` 0.6.

**Choix du reload.** Profil explosif : le dos vit de traction puissante et
d'ondulation sous-marine ; un reload `puissance` recharge ces qualités vives,
plus pertinent qu'un rappel de force maximale entre deux compétitions.

---

### T11 — `200m` · Mini-prépa 200 m

- **`event_group`** : `200m` — **`kind`** : `inter_competition`
- **`name`** : « 200 m — Mini-prépa inter-compétitions »

| Phase # | `cycle` | `min_weeks` | `nominal_weeks` | `max_weeks` | Intention |
|---|---|---|---|---|---|
| 1 | `maintien` | 1 | 1 | 2 | Léger deload : récupérer de la compétition, intensité tenue. |
| 2 | `puissance` | 2 | 2 | 3 | Reload : relancer la vitesse-endurance, puissance maintenue. |
| 3 | `affutage` | 1 | 1 | 2 | Affûtage court, explosivité préservée. |
| 4 | `pic` | 1 | 1 | 1 | Pic pré-compétition, activation SNC. |

→ `min_week_count` = 5 · `nominal` = 5 · `max_week_count` = 8

**`bucket_emphasis`** : réutilisé de T4 — `upper_strength` 0.9, `upper_power`
0.8, `lower_power` 0.75, `lower_strength` 0.7, `mobility` 0.6.

**Choix du reload.** Profil encore explosif : le 200 m reste majoritairement
piloté par la vitesse-endurance. Entre deux compétitions, un reload `puissance`
(orienté puissance maintenue) ré-aiguise le geste mieux qu'un rappel de force
lourde — la base de force est déjà acquise.

---

### T12 — `400m` · Mini-prépa 400 m

- **`event_group`** : `400m` — **`kind`** : `inter_competition`
- **`name`** : « 400 m — Mini-prépa inter-compétitions »

| Phase # | `cycle` | `min_weeks` | `nominal_weeks` | `max_weeks` | Intention |
|---|---|---|---|---|---|
| 1 | `maintien` | 1 | 1 | 2 | Léger deload : récupérer de la compétition, intensité tenue. |
| 2 | `force_max` | 2 | 2 | 3 | Reload de force : recharger la force-endurance de traction érodée. |
| 3 | `affutage` | 1 | 1 | 2 | Affûtage court, explosivité préservée. |
| 4 | `pic` | 1 | 1 | 1 | Pic pré-compétition, activation SNC. |

→ `min_week_count` = 5 · `nominal` = 5 · `max_week_count` = 8

**`bucket_emphasis`** : réutilisé de T5 — `upper_strength` 1.0, `lower_strength`
0.8, `mobility` 0.8, `upper_power` 0.65, `lower_power` 0.6.

**Choix du reload.** Profil de fond : sur le 400 m c'est la **force-endurance**
de traction qui s'érode entre deux compétitions, pas la vitesse. Un reload court
de `force_max` la recharge directement ; un travail de vitesse pure serait peu
transférable à une épreuve aérobie de 4 min.

---

### T13 — `distance` · Mini-prépa demi-fond

- **`event_group`** : `distance` — **`kind`** : `inter_competition`
- **`name`** : « Demi-fond — Mini-prépa inter-compétitions »

| Phase # | `cycle` | `min_weeks` | `nominal_weeks` | `max_weeks` | Intention |
|---|---|---|---|---|---|
| 1 | `maintien` | 1 | 1 | 2 | Léger deload : récupérer de la compétition, préhab d'épaule entretenue. |
| 2 | `force_max` | 2 | 2 | 3 | Reload de force : recharger la force-endurance de traction érodée. |
| 3 | `affutage` | 1 | 1 | 2 | Affûtage court, qualité préservée. |
| 4 | `pic` | 1 | 1 | 1 | Pic pré-compétition, activation SNC. |

→ `min_week_count` = 5 · `nominal` = 5 · `max_week_count` = 8

**`bucket_emphasis`** : réutilisé de T6 — `upper_strength` 1.0, `mobility` 1.0,
`lower_strength` 0.75, `upper_power` 0.45, `lower_power` 0.4.

**Choix du reload.** Profil de fond : le demi-fond ne vit pas de puissance pure.
Entre deux compétitions, c'est la force-endurance et la résilience tissulaire
qu'il faut entretenir — un reload court de `force_max` est le levier le plus
pertinent, cohérent avec le `puissance` minoré du template saison.

---

### T14 — `medley` · Mini-prépa 4 nages

- **`event_group`** : `medley` — **`kind`** : `inter_competition`
- **`name`** : « 4 nages — Mini-prépa inter-compétitions »

| Phase # | `cycle` | `min_weeks` | `nominal_weeks` | `max_weeks` | Intention |
|---|---|---|---|---|---|
| 1 | `maintien` | 1 | 1 | 2 | Léger deload : récupérer de la compétition, mobilité globale entretenue. |
| 2 | `puissance` | 2 | 2 | 3 | Reload explosif : relancer la puissance polyvalente (papillon, virages, brasse). |
| 3 | `affutage` | 1 | 1 | 2 | Affûtage court, explosivité préservée. |
| 4 | `pic` | 1 | 1 | 1 | Pic pré-compétition, activation SNC. |

→ `min_week_count` = 5 · `nominal` = 5 · `max_week_count` = 8

**`bucket_emphasis`** : réutilisé de T7 — `upper_strength` 0.85, `upper_power`
0.8, `lower_power` 0.8, `mobility` 0.8, `lower_strength` 0.75.

**Choix du reload.** Profil majoritairement explosif : le medley cumule
papillon, virages nombreux et fouet de brasse — autant de qualités vives. Entre
deux compétitions, un reload `puissance` relance cette polyvalence explosive
mieux qu'un rappel de force lourde non spécifique.

---

## 4. Tableau récapitulatif — 14 templates

| # | `event_group` | `kind` | `name` | Séquence de phases | `min_week_count` (Σ min) | `nominal` (Σ nominal) | `max_week_count` (Σ max) |
|---|---|---|---|---|---|---|---|
| T1 | `sprint_50` | `season` | Sprint 50 m — Force-vitesse | `force_max` → `maintien` → `puissance` → `affutage` → `pic` | 7 | 9 | 15 |
| T2 | `breaststroke` | `season` | Brasse — Hanche & adducteurs | `prepa_generale` → `force_max` → `puissance` → `affutage` → `pic` | 7 | 12 | 18 |
| T3 | `backstroke` | `season` | Dos — Chaîne postérieure & épaule | `prepa_generale` → `force_max` → `puissance` → `affutage` → `pic` | 7 | 12 | 18 |
| T4 | `200m` | `season` | 200 m — Force-endurance mixte | `prepa_generale` → `force_max` → `puissance` → `affutage` → `pic` | 7 | 12 | 18 |
| T5 | `400m` | `season` | 400 m — Force-endurance aérobie | `prepa_generale` → `force_max` → `maintien` → `puissance` → `affutage` → `pic` | 9 | 13 | 22 |
| T6 | `distance` | `season` | Demi-fond — Endurance de force & préhab | `prepa_generale` → `maintien` → `force_max` → `puissance` → `affutage` → `pic` | 10 | 14 | 23 |
| T7 | `medley` | `season` | 4 nages — Polyvalence force-puissance | `prepa_generale` → `force_max` → `maintien` → `puissance` → `affutage` → `pic` | 8 | 13 | 21 |
| T8 | `sprint_50` | `inter_competition` | Sprint 50 m — Mini-prépa inter-compétitions | `maintien` → `puissance` → `affutage` → `pic` | 5 | 5 | 8 |
| T9 | `breaststroke` | `inter_competition` | Brasse — Mini-prépa inter-compétitions | `maintien` → `puissance` → `affutage` → `pic` | 5 | 5 | 8 |
| T10 | `backstroke` | `inter_competition` | Dos — Mini-prépa inter-compétitions | `maintien` → `puissance` → `affutage` → `pic` | 5 | 5 | 8 |
| T11 | `200m` | `inter_competition` | 200 m — Mini-prépa inter-compétitions | `maintien` → `puissance` → `affutage` → `pic` | 5 | 5 | 8 |
| T12 | `400m` | `inter_competition` | 400 m — Mini-prépa inter-compétitions | `maintien` → `force_max` → `affutage` → `pic` | 5 | 5 | 8 |
| T13 | `distance` | `inter_competition` | Demi-fond — Mini-prépa inter-compétitions | `maintien` → `force_max` → `affutage` → `pic` | 5 | 5 | 8 |
| T14 | `medley` | `inter_competition` | 4 nages — Mini-prépa inter-compétitions | `maintien` → `puissance` → `affutage` → `pic` | 5 | 5 | 8 |

Toutes les bornes globales sont dans `]0, 24]` (contrainte de la table). Chaque
template se termine par `affutage` puis `pic` ; chaque `pic` est figé à
`[1, 1, 1]`.

---

## 5. Évaluation honnête de la confiance

Le **vocabulaire à 6 cycles est validé** ; ce qui reste soumis à validation
coach ci-dessous concerne les **séquences de phases**, les **plages
`min`/`max`** et le contenu des **7 mini-prépas**.

- **Élevée** — Le **vocabulaire des cycles** (6 cycles) et la **séquence
  générale** prépa générale → force max → puissance/vitesse → affûtage → pic :
  directement appuyés sur la littérature S&C natation (Frontiers 2023, NSCA,
  PMC8296310) et sur le plan réel « Prépa sprint 50 m » du club. Peu de risque.
- **Élevée** — Les **`nominal_weeks`** des 7 templates de saison : ce sont les
  longueurs de blocs **validées par le coach** au point 1 (séquences semaine→
  cycle). Elles ne sont **pas** rouvertes ici — seule leur traduction en phases
  est mécanique.
- **Élevée** — Les **directions de `bucket_emphasis`** : sprint = puissance,
  fond = force-endurance + mobilité, brasse = hanche/adducteurs, dos = chaîne
  postérieure + épaule, medley = équilibré. Faits S&C bien établis, inchangés
  depuis la version précédente du document.
- **Moyenne** — Les **plages `min_weeks` / `max_weeks`** par phase. Les ordres
  de grandeur (`force_max`/`puissance` 2-4, `prepa_generale` large, `maintien`/
  `affutage` 1-3, `pic` figé) sont sourcés par les fenêtres efficaces de la
  littérature ; les valeurs exactes sont un jugement de synthèse. C'est le
  premier point à calibrer avec le coach : jusqu'où veut-il pouvoir comprimer ou
  étirer chaque phase ?
- **Validée coach** — La **forme des 7 mini-prépas** (`maintien` → reload →
  `affutage` → `pic`, ~5 sem. nominales, 5-8 sem. selon la durée cible) et le
  **choix du cycle de reload** par spécialité (`puissance` pour les explosifs,
  `force_max` pour le fond) ont été validés par le coach le 2026-05-18, avec le
  plafond resserré à 8 sem. La logique reste cohérente avec le contraste
  sprint/fond de la littérature.
- **Moyenne** — Les **valeurs numériques exactes** des poids `bucket_emphasis`
  (0.6 vs 0.7 vs 0.8). Les directions sont sourcées ; le calibrage fin est un
  jugement de synthèse. À ajuster par le coach selon son ressenti.
- **Note d'honnêteté** — Aucun template n'est la copie d'un programme nominatif
  d'athlète d'élite (ces programmes ne sont pas publics). L'approche McEvoy est
  citée comme **tendance documentée** illustrant la philosophie sprint, pas comme
  programme reproduit.

---

## 6. Questions ouvertes pour le coach

1. **Plages `min`/`max` par phase.** Les `nominal_weeks` sont validés ; les
   bornes de flexibilité, non. Les fourchettes proposées (`prepa_generale`
   large, `force_max`/`puissance` 2-4, `maintien`/`affutage` 1-3) te
   conviennent-elles ? En particulier : un `prepa_generale` qu'on peut
   comprimer à 1 semaine (T2/T3/T4/T7) est-il réaliste, ou faut-il un plancher
   plus haut ?

2. **Forme des mini-prépas — ✅ RÉSOLU (coach, 2026-05-18).** La forme `maintien`
   → reload → `affutage` → `pic` (~5 sem. nominales) est validée. Le **plafond
   est fixé à 8 sem.** : au-delà, on repasse sur un template de saison —
   d'où le resserrement des plages des phases mini-prépa (`maintien` et
   `affutage` `max` 2, reload `max` 3, soit Σ max = 8). La question d'une
   variante encore plus courte (3 sem.) reste ouverte si besoin futur.

3. **Cycle de reload des mini-prépas.** J'ai retenu `puissance` pour les profils
   explosifs (`sprint_50`, `breaststroke`, `backstroke`, `200m`, `medley`) et
   `force_max` pour le fond (`400m`, `distance`). Le 200 m est un cas limite
   (épreuve mixte) — son reload doit-il rester `puissance`, ou basculer sur
   `force_max` comme le 400 m ?

4. **`affutage` des mini-prépas.** J'ai mis `affutage` à `[1, 1, 3]` (nominal 1)
   dans les mini-prépas, contre `[1, 2, 3]` en saison (et `[1, 3, 3]` pour T1).
   Un affûtage d'1 semaine
   suffit-il entre deux compétitions, ou faut-il garder 2 semaines comme en
   saison ?

5. **Placement des phases `maintien` (templates saison).** Un `maintien` est
   inséré au milieu des templates longs (T1 entre force et puissance, T5 idem,
   T6 avant le bloc force, T7 entre force et puissance). Est-ce le bon placement,
   ou préfères-tu un rythme de `maintien` plus régulier (notamment chez les
   jeunes) ?

6. **Calibrage des poids `bucket_emphasis`.** Les directions sont sourcées, mais
   les valeurs exactes (ex. `mobility` 0.4 en sprint, 1.0 en demi-fond) sont mon
   jugement. Lesquelles te semblent à corriger ? La mobilité en sprint mérite-
   t-elle vraiment d'être aussi basse (0.4) ?

7. **`sprint_50` crawl ET papillon.** 50 crawl et 50 papillon sont regroupés
   dans un template unique (saison T1 + mini-prépa T8). Le 50 papillon demande
   plus d'ondulation/puissance de chaîne postérieure. Faut-il les séparer ?

8. **`medley` 200 vs 400.** Un seul template medley par `kind` : le 200 4-nages
   (plus explosif) et le 400 4-nages (plus aérobie) sont assez différents. Un
   template commun convient-il, ou en faut-il deux ?

9. **`distance` 800 vs 1500.** Regroupés sous `distance`. Le 800 m femmes /
   1500 m hommes étant des épreuves olympiques distinctes mais de profil proche,
   le template unique te semble-t-il pertinent ?

10. **Public visé.** Ces templates sont calibrés «nageur de compétition
    générique». Faut-il des variantes par âge / niveau (jeunes catégories vs
    seniors), notamment sur le volume du bloc `force_max` et la fréquence des
    `maintien` ?

---

## Sources (URLs)

- Frontiers in Sports and Active Living (2023), *From dry-land to the water…
  French sprint swimmers* — https://www.frontiersin.org/journals/sports-and-active-living/articles/10.3389/fspor.2023.1338856/full
  et https://pmc.ncbi.nlm.nih.gov/articles/PMC10811196/
- NSCA Coach, *Beyond the Pool: Improving Swimming Performance with Dryland
  Training* — https://www.nsca.com/education/articles/nsca-coach/beyond-the-pool-improving-swimming-performance-with-dryland-training/
- PMC8296310 (2021), *Periodization and Programming for Individual 400 m Medley
  Swimmers* — https://pmc.ncbi.nlm.nih.gov/articles/PMC8296310/
- Frontiers in Physiology (2019), *Elite Swimmers' Training Patterns in the 25
  Weeks Prior to Their Season's Best Performances* — https://www.frontiersin.org/journals/physiology/articles/10.3389/fphys.2019.00363/full
- PMC7052717 (2020), *The Effectiveness of a Dry-Land Shoulder Rotators Strength
  Training Program in Injury Prevention in Competitive Swimmers* — https://pmc.ncbi.nlm.nih.gov/articles/PMC7052717/
- PMC4637920, *Effects of a Dry-Land Strengthening Program in Competitive
  Adolescent Swimmers* — https://ncbi.nlm.nih.gov/pmc/articles/PMC4637920
- Frontiers in Physiology (2022) / PMC9730280, *VO2 kinetics and tethered
  strength influence the 200-m front crawl stroke kinematics and speed* — https://pmc.ncbi.nlm.nih.gov/articles/PMC9730280/
- U.S. Masters Swimming — guides dryland brasse — https://www.usms.org/fitness-and-training/articles-and-videos/articles/dryland-exercises-to-improve-your-breaststroke
- U.S. Masters Swimming — guides dryland dos — https://www.usms.org/fitness-and-training/articles-and-videos/articles/dryland-exercises-to-improve-your-backstroke
- Approche sprint « qualité plutôt que volume » (Cameron McEvoy), couverture
  publique — https://www.olympics.com/en/news/australia-olympic-champion-cameron-mcevoy-revolutionary-swimming-methods-interview
  ; https://swimswam.com/has-olympic-and-world-champion-cameron-mcevoy-found-the-bleeding-edge-of-sprint-training/
  ; https://www.yourswimlog.com/how-cam-mcevoy-trains-for-pure-speed-in-the-50-freestyle/

---

*Document validé coach (2026-05-18) — modèle de phases à durée variable.
14 templates : 7 « saison » + 7 « mini-prépa » (plafond mini-prépa resserré à
8 sem.). Prêt pour le seeding en base (table `strength_periodization_templates`).
Design de référence : `docs/plans/2026-05-18-bilan-muscu-templates-duree-variable-design.md`.*
