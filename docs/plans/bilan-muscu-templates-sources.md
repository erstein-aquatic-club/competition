# Templates de périodisation muscu — 7 profils d'épreuve

> **✅ RÉ-ALIGNÉ sur les 6 cycles (2026-05-18).** Ce document a été ré-écrit
> avec le vocabulaire validé à **6 cycles** :
> `prepa_generale / force_max / puissance / maintien / affutage / pic`
> (cf. `bilan-muscu-cycles-vocabulaire.md`). L'ancien vocabulaire
> `endurance / hypertrophie / force / deload` est abandonné. Les 7 templates
> ci-dessous sont **en attente de validation coach** avant d'être seedés en base
> (table `strength_periodization_templates`). Les profils d'emphase par seau
> (`bucket_emphasis`) et les rationales S&C par épreuve n'ont pas changé : seules
> les séquences semaine→cycle ont été ré-alignées.

> **PROPOSITION — à valider par le coach.**
>
> Ce document propose 7 templates de périodisation de musculation à sec
> (dryland), un par famille d'épreuve. Il sera revu et corrigé par le coach
> avant que les templates soient injectés dans la base de données. Aucun code,
> aucune migration ici — c'est un document de travail.

---

## 1. Modèle de périodisation utilisé

### Le vocabulaire des cycles (`cycle`)

Chaque template décrit une progression **semaine par semaine**. Chaque semaine
porte un type de cycle. Le vocabulaire compte **6 valeurs** : trois **blocs**
(multi-semaines, le cœur du travail) et trois **transitions** (semaine isolée,
articulation entre blocs ou vers la compétition). Détail complet dans
`bilan-muscu-cycles-vocabulaire.md`.

| `cycle` | Type | Nom FR | Intention physiologique | Charge / volume typique |
|---|---|---|---|---|
| `prepa_generale` | bloc | Préparation générale | Adaptation anatomique (tendons, posture, préhab), endurance de force, conditionnement général. Socle sur lequel la force se construit. Cycle dominant en début de saison et chez le fond. | Charges légères/modérées, séries longues (≈ 12-20 reps, ~50-70 % 1RM). |
| `force_max` | bloc | Force maximale | Force maximale : recrutement des unités motrices, coordination intermusculaire, charges lourdes sur les mouvements fondamentaux. | Charges lourdes, peu de reps (≈ 3-6 reps, ~80-89 % 1RM), récup longue (~3 min). |
| `puissance` | bloc | Puissance / vitesse | Conversion de la force en puissance explosive et vitesse (force-vitesse, pliométrie, RFD, haltérophilie dynamique). Bloc terminal du sprint. | Charges modérées déplacées à vitesse maximale (≈ 3-6 reps @ ~60-80 % 1RM), récup longue. |
| `maintien` | transition (1 sem.) | Maintien | Semaine isolée qui préserve les acquis sans construire (voyage, articulation entre deux blocs). | Volume réduit (~40-60 %), intensité maintenue. |
| `affutage` | transition (1-3 sem.) | Affûtage | Réduction progressive du volume avant compétition, intensité et explosivité préservées (« rester nerveux »). | Volume en décroissance (−25 % → −40-50 %), intensité/vitesse tenues. |
| `pic` | transition (1 sem.) | Pic | Semaine de compétition : activation du SNC, séance très courte, « se sentir explosif ». | Volume minimal, charges légères déplacées à vitesse maximale. |

> **Note sur le découpage.** Le template ne fixe **que la séquence hebdomadaire
> de cycles**. Le chargement de chaque cycle (séries/reps/%1RM/récup) est défini
> hors template, dans `src/lib/strength/periodizationCycles.ts` : `prepa_generale`
> et `force_max` réutilisent les paramètres `*_endurance` et `*_force` portés par
> chaque exercice de `dim_exercices` ; `puissance`, `maintien`, `affutage` et
> `pic` portent un **schéma de charge générique au niveau cycle**, appliqué
> uniformément (cf. `bilan-muscu-cycles-vocabulaire.md` § 3). La littérature S&C
> natation distingue explicitement la **force maximale** (phase de développement)
> de la **puissance / vitesse** (phase de construction puis de compétition) —
> d'où deux blocs distincts `force_max` puis `puissance`, et non un cycle `force`
> agrégé comme dans l'ancien vocabulaire.

> **Note : pas de semaine `test` dans les templates.** L'évaluation 1RM est une
> étape **amont** du Bilan Muscu (hors périodisation) ; elle n'est pas un cycle.
> Chaque template démarre donc directement sur son premier cycle
> d'entraînement, pas sur une semaine de test.

> **Note pour le seeding.** Pour le seeding en base, la **table semaine→cycle de
> chaque template (§ 2) fait foi** ; le tableau récapitulatif § 3 n'en est qu'un
> résumé. Le champ `structure` (jsonb, type figé `PeriodizationStructure`) ne
> porte que `weeks: [{ cycle }]` + `bucket_emphasis` : la colonne *Intention*
> des tables § 2 est un **commentaire de lecture** (contexte coach), elle n'est
> **pas** seedée — seul `cycle` l'est, semaine par semaine.

### Le sens de `bucket_emphasis`

`bucket_emphasis` pondère **les qualités physiques que l'ÉPREUVE exige** (pas la
semaine en cours). 5 buckets entraînables, poids 0..1 :

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

### Honnêteté sur les sources

Les programmes semaine-par-semaine **nominatifs** des athlètes d'élite **ne sont
pas publics**. Aucun template ci-dessous n'est présenté comme «le programme de
l'athlète X». Chaque template est une **synthèse de bonnes pratiques** fondée
sur :

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

## 2. Les 7 templates

### T1 — `sprint_50` · Sprint 50 m crawl / papillon

- **`name`** : « Sprint 50 m — Force-vitesse »
- **`week_count`** : **9**

| Semaine | `cycle` | Intention |
|---|---|---|
| 1 | `force_max` | Force max, charges lourdes (squat / traction / SDT / tirage). |
| 2 | `force_max` | Force max, montée en charge (+5/+10 %). |
| 3 | `maintien` | Articulation entre les blocs : volume réduit, intensité tenue. |
| 4 | `puissance` | Conversion force→vitesse (Power Clean, squat jump, med-ball). |
| 5 | `puissance` | Force-vitesse, RFD, vitesse maximale. |
| 6 | `affutage` | Affûtage, palier −25 % de volume. |
| 7 | `affutage` | Affûtage, palier −40 %, explosivité préservée. |
| 8 | `affutage` | Affûtage, palier −50 %, qualité pure. |
| 9 | `pic` | Pic / activation SNC, très court, « se sentir explosif ». |

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
renforce le choix d'un bloc `puissance` long et d'un `affutage` étalé sur
3 semaines pour préserver la fraîcheur nerveuse. Le double poids `upper_power` +
`lower_power` reflète qu'un 50 m se gagne au départ, sous l'eau et sur les
premiers appuis. La séquence reproduit le **plan réel 10 semaines d'un sprinteur
du club**, débarrassé de sa semaine de test amont : `force_max` ×2 →
`maintien` ×1 (articulation entre les blocs) → `puissance` ×2 → `affutage` ×3 →
`pic` ×1 = 9 semaines. Pas de `prepa_generale` — le sprinteur arrive déjà
préparé, la période est entièrement tirée vers l'explosivité.

---

### T2 — `breaststroke` · Brasse

- **`name`** : « Brasse — Hanche & adducteurs »
- **`week_count`** : **12**

| Semaine | `cycle` | Intention |
|---|---|---|
| 1 | `prepa_generale` | Adaptation anatomique, préhab hanche/adducteurs. |
| 2 | `prepa_generale` | Endurance de force, mobilité de hanche. |
| 3 | `prepa_generale` | Socle, base de force du fouet de jambes. |
| 4 | `force_max` | Force max, adducteurs / hanche. |
| 5 | `force_max` | Force max, charges lourdes. |
| 6 | `force_max` | Force max, mouvements fondamentaux. |
| 7 | `puissance` | Conversion force→puissance du fouet brasse. |
| 8 | `puissance` | Force-vitesse, explosivité. |
| 9 | `puissance` | Vitesse / explosivité de jambes. |
| 10 | `affutage` | Affûtage, palier −25 % de volume. |
| 11 | `affutage` | Affûtage, palier −50 %, explosivité préservée. |
| 12 | `pic` | Pic pré-compétition, activation SNC. |

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
`lower_strength` + `mobility` élevés. Le bloc `prepa_generale` est *un peu plus
long que la base du sprint (3 semaines, synthèse)* pour laisser le temps de
construire la préhab spécifique de hanche/adducteurs, qui s'acquiert lentement,
avant d'enchaîner sur `force_max` puis `puissance`.

---

### T3 — `backstroke` · Dos

- **`name`** : « Dos — Chaîne postérieure & épaule »
- **`week_count`** : **12**

| Semaine | `cycle` | Intention |
|---|---|---|
| 1 | `prepa_generale` | Adaptation anatomique, préhab épaule (rotateurs). |
| 2 | `prepa_generale` | Endurance de force, chaîne postérieure. |
| 3 | `prepa_generale` | Socle, lats + chaîne postérieure. |
| 4 | `force_max` | Force max, traction dorsale. |
| 5 | `force_max` | Force max, charges lourdes. |
| 6 | `force_max` | Force max, mouvements fondamentaux. |
| 7 | `puissance` | Conversion force→puissance de traction + ondulation. |
| 8 | `puissance` | Force-vitesse, explosivité. |
| 9 | `puissance` | Vitesse / explosivité. |
| 10 | `affutage` | Affûtage, palier −25 % de volume. |
| 11 | `affutage` | Affûtage, palier −50 %, explosivité préservée. |
| 12 | `pic` | Pic pré-compétition, activation SNC. |

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
majeure du dos moderne, justifie un `lower_power` non négligeable. Le bloc
`prepa_generale` initial est *chargé en préhab d'épaule (3 semaines, synthèse)*
avant le bloc `force_max` puis le bloc `puissance`.

---

### T4 — `200m` · 200 m

- **`name`** : « 200 m — Force-endurance mixte »
- **`week_count`** : **12**

| Semaine | `cycle` | Intention |
|---|---|---|
| 1 | `prepa_generale` | Adaptation anatomique. |
| 2 | `prepa_generale` | Endurance de force. |
| 3 | `prepa_generale` | Endurance de force, conditionnement. |
| 4 | `force_max` | Force max. |
| 5 | `force_max` | Force max, charges lourdes. |
| 6 | `force_max` | Force max, mouvements fondamentaux. |
| 7 | `puissance` | Conversion force→puissance. |
| 8 | `puissance` | Puissance / vitesse-endurance. |
| 9 | `puissance` | Vitesse-endurance, qualité. |
| 10 | `affutage` | Affûtage, palier −25 % de volume. |
| 11 | `affutage` | Affûtage, palier −50 %, explosivité préservée. |
| 12 | `pic` | Pic pré-compétition, activation SNC. |

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
équilibre : un bloc `prepa_generale` plus long qu'en sprint, mais un bloc
`puissance` qui vise la **vitesse-endurance** (puissance maintenue) plutôt que
la vitesse pure. L'emphase bascule de `*_power` (sprint) vers `upper_strength` :
tenir la traction sans s'écrouler dans le 3e 50 est le nerf de la guerre. La
séquence est *volontairement équilibrée force ↔ puissance* — 3 semaines de
chaque bloc.

---

### T5 — `400m` · 400 m

- **`name`** : « 400 m — Force-endurance aérobie »
- **`week_count`** : **13**

| Semaine | `cycle` | Intention |
|---|---|---|
| 1 | `prepa_generale` | Adaptation anatomique. |
| 2 | `prepa_generale` | Endurance de force. |
| 3 | `prepa_generale` | Endurance de force. |
| 4 | `prepa_generale` | Endurance de force, conditionnement métabolique. |
| 5 | `force_max` | Force max. |
| 6 | `force_max` | Force max, charges lourdes. |
| 7 | `force_max` | Force max, mouvements fondamentaux. |
| 8 | `maintien` | Articulation : volume réduit, transfert vers la force durable. |
| 9 | `puissance` | Conversion force→puissance / vitesse-endurance. |
| 10 | `puissance` | Vitesse-endurance, qualité. |
| 11 | `affutage` | Affûtage, palier −25 % de volume. |
| 12 | `affutage` | Affûtage, palier −50 %, explosivité préservée. |
| 13 | `pic` | Pic pré-compétition, activation SNC. |

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
d'endurance des charges modérées à reps élevées (10-15 @ 50-70 % 1RM) — d'où un
bloc `prepa_generale` initial long (4 semaines) qui porte l'endurance de force.
Une semaine de `maintien` en semaine 8 articule le bloc `force_max` vers le bloc
`puissance`, qui reste **court** (2 semaines) : on cherche de la force durable,
pas de la vitesse pure. L'emphase passe résolument sur `*_strength`
(force-endurance) et `mobility` (préhab d'épaule, le volume de bassin grimpant).
*13 semaines : synthèse*, cohérente avec un mésocycle «Specific» long du modèle
400 m médley (PMC8296310, mésocycles spécifiques de 7-10 semaines).

---

### T6 — `distance` · 800 / 1500 m

- **`name`** : « Demi-fond — Endurance de force & préhab »
- **`week_count`** : **14**

| Semaine | `cycle` | Intention |
|---|---|---|
| 1 | `prepa_generale` | Adaptation anatomique, préhab épaule. |
| 2 | `prepa_generale` | Endurance de force. |
| 3 | `prepa_generale` | Endurance de force. |
| 4 | `prepa_generale` | Endurance de force, conditionnement. |
| 5 | `prepa_generale` | Endurance de force spécifique, gainage soutenu. |
| 6 | `maintien` | Articulation : volume réduit avant le bloc de force. |
| 7 | `force_max` | Force max (bloc court). |
| 8 | `force_max` | Force max, charges lourdes. |
| 9 | `force_max` | Force max, mouvements fondamentaux. |
| 10 | `puissance` | Conversion en force durable / puissance (bloc court). |
| 11 | `puissance` | Puissance, quelques séances de qualité. |
| 12 | `affutage` | Affûtage, palier −25 % de volume. |
| 13 | `affutage` | Affûtage, palier −50 %, qualité préservée. |
| 14 | `pic` | Pic pré-compétition, activation SNC. |

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
par un bloc `prepa_generale` **dominant** (5 semaines : endurance de force,
gainage, préhab), puis un bloc `force_max` modéré et un bloc `puissance` court :
on cherche un nageur **fort sous fatigue** sans alourdir une masse qui
pénaliserait l'hydrodynamisme. *14 semaines : synthèse* — le template le plus
long, car la force-endurance et la résilience tissulaire se construisent sur la
durée.

---

### T7 — `medley` · 4 nages

- **`name`** : « 4 nages — Polyvalence force-puissance »
- **`week_count`** : **13**

| Semaine | `cycle` | Intention |
|---|---|---|
| 1 | `prepa_generale` | Adaptation anatomique, préhab globale. |
| 2 | `prepa_generale` | Endurance de force. |
| 3 | `prepa_generale` | Endurance de force, conditionnement (circuit). |
| 4 | `force_max` | Force max. |
| 5 | `force_max` | Force max, charges lourdes. |
| 6 | `force_max` | Force max, mouvements fondamentaux. |
| 7 | `maintien` | Articulation : volume réduit entre force et puissance. |
| 8 | `puissance` | Conversion force→puissance. |
| 9 | `puissance` | Puissance / vitesse-endurance. |
| 10 | `puissance` | Vitesse-endurance, qualité. |
| 11 | `affutage` | Affûtage, palier −25 % de volume. |
| 12 | `affutage` | Affûtage, palier −50 %, explosivité préservée. |
| 13 | `pic` | Pic pré-compétition, activation SNC. |

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
semaine de `maintien` articulant `force_max` et `puissance`. *13 semaines :
synthèse*, séquence médiane alignée sur les mésocycles longs du modèle médley
publié. Note : ce template vise le 4-nages «générique» ; un medleyiste de 200 m
et un de 400 m n'ont pas exactement le même besoin (voir Questions ouvertes).

---

## 3. Tableau récapitulatif

| # | `event_group` | `name` | `week_count` | Séquence (cycles) | Logique de périodisation |
|---|---|---|---|---|---|
| T1 | `sprint_50` | Sprint 50 m — Force-vitesse | 9 | `force_max`×2 → `maintien` → `puissance`×2 → `affutage`×3 → `pic` | Pas de `prepa_generale` (athlète déjà préparé) ; `puissance` dominant, `affutage` étalé pour la fraîcheur nerveuse. |
| T2 | `breaststroke` | Brasse — Hanche & adducteurs | 12 | `prepa_generale`×3 → `force_max`×3 → `puissance`×3 → `affutage`×2 → `pic` | `prepa_generale` un peu plus long (préhab hanche/adducteurs), mobilité spécifique élevée. |
| T3 | `backstroke` | Dos — Chaîne postérieure & épaule | 12 | `prepa_generale`×3 → `force_max`×3 → `puissance`×3 → `affutage`×2 → `pic` | `prepa_generale` chargé en préhab d'épaule, puis force/puissance de traction. |
| T4 | `200m` | 200 m — Force-endurance mixte | 12 | `prepa_generale`×3 → `force_max`×3 → `puissance`×3 → `affutage`×2 → `pic` | Profil équilibré force ↔ puissance ; bloc terminal vitesse-endurance. |
| T5 | `400m` | 400 m — Force-endurance aérobie | 13 | `prepa_generale`×4 → `force_max`×3 → `maintien` → `puissance`×2 → `affutage`×2 → `pic` | `prepa_generale` long, `puissance` court, `maintien` d'articulation : bascule vers la force-endurance. |
| T6 | `distance` | Demi-fond — Endurance de force & préhab | 14 | `prepa_generale`×5 → `maintien` → `force_max`×3 → `puissance`×2 → `affutage`×2 → `pic` | `prepa_generale` dominant (endurance de force + préhab), `force_max` modéré, `puissance` court. |
| T7 | `medley` | 4 nages — Polyvalence force-puissance | 13 | `prepa_generale`×3 → `force_max`×3 → `maintien` → `puissance`×3 → `affutage`×2 → `pic` | Profil équilibré tous buckets, séquence médiane avec `maintien` d'articulation. |

---

## 4. Évaluation honnête de la confiance

Le **vocabulaire à 6 cycles est validé** ; ce qui reste soumis à validation
coach ci-dessous concerne les **séquences semaine→cycle** et les `week_count`.

- **Élevée** — Le **vocabulaire des cycles** (6 cycles : `prepa_generale` /
  `force_max` / `puissance` + `maintien` / `affutage` / `pic`) et la **séquence
  générale** prépa générale → force max → puissance/vitesse → affûtage → pic :
  directement appuyés sur la littérature S&C natation (Frontiers 2023, NSCA,
  PMC8296310) et sur le plan réel « Prépa sprint 50 m » du club. Peu de risque.
- **Élevée** — Les **directions de `bucket_emphasis`** : sprint = puissance,
  fond = force-endurance + mobilité, brasse = hanche/adducteurs, dos = chaîne
  postérieure + épaule, medley = équilibré. Ce sont des faits S&C bien établis.
- **Moyenne** — Les **valeurs numériques exactes** des poids `bucket_emphasis`
  (0.6 vs 0.7 vs 0.8). Les directions sont sourcées ; le calibrage fin est un
  jugement de synthèse. À ajuster par le coach selon son ressenti.
- **Moyenne** — Les **`week_count`** (9 à 14) et la **longueur relative des
  blocs**. La fourchette est cohérente avec les mésocycles publiés et le plan
  réel du club, mais les valeurs précises sont une synthèse : elles dépendent du
  calendrier réel de la saison du club. Le découpage exact (combien de semaines
  de `prepa_generale` vs `force_max` vs `puissance`) est le premier point que le
  coach devrait revoir.
- **Note d'honnêteté** — Aucun template n'est la copie d'un programme nominatif
  d'athlète d'élite (ces programmes ne sont pas publics). L'approche McEvoy est
  citée comme **tendance documentée** illustrant la philosophie sprint, pas comme
  programme reproduit.

---

## 5. Questions ouvertes pour le coach

1. **Longueur relative des blocs.** Le vocabulaire à 6 cycles distingue bien
   `force_max` et `puissance` (l'ancienne question d'un cycle `force` agrégé est
   résolue par cette scission). Reste à valider le **nombre de semaines** de
   chaque bloc par template : par exemple, 3 semaines de `force_max` puis
   3 semaines de `puissance` en brasse/dos/200/medley convient-il, ou faut-il
   pondérer différemment selon l'épreuve ?

2. **Placement des semaines `maintien`.** J'ai inséré un `maintien` au milieu
   des templates longs (T1 entre force et puissance, T5 idem, T6 avant le bloc
   force, T7 entre force et puissance). Est-ce le bon placement pour vos
   nageurs, ou préférez-vous un rythme de `maintien` plus régulier (toutes les
   ~4 semaines, charge plus prudente, notamment chez les jeunes) ?

3. **Durée de l'`affutage`.** J'ai mis `affutage` ×3 pour le sprint (T1) et
   `affutage` ×2 pour les six autres templates. La durée du taper convient-elle
   épreuve par épreuve, ou faut-il l'allonger pour les épreuves de fond ?

4. **Calibrage des poids `bucket_emphasis`.** Les directions sont sourcées, mais
   les valeurs exactes (ex. `mobility` 0.4 en sprint, 1.0 en demi-fond) sont mon
   jugement. Lesquelles vous semblent à corriger ? En particulier : la mobilité
   en sprint mérite-t-elle vraiment d'être aussi basse (0.4) ?

5. **`week_count` vs calendrier réel.** Les durées (9-14 semaines) supposent un
   bloc de préparation continu. Comment s'articulent-elles avec votre découpage
   de saison (2 ou 3 macrocycles) ? Faut-il des templates plus courts pour la
   2e partie de saison ?

6. **`sprint_50` crawl ET papillon.** J'ai regroupé 50 crawl et 50 papillon dans
   un template unique. Le 50 papillon demande plus d'ondulation/puissance de
   chaîne postérieure. Faut-il les séparer, ou le template commun suffit-il ?

7. **`medley` 200 vs 400.** Un seul template medley : le 200 4-nages (plus
   explosif) et le 400 4-nages (plus aérobie) sont assez différents. Un template
   commun convient-il, ou en faut-il deux ?

8. **`distance` 800 vs 1500.** Regroupés sous `distance`. Le 800 m femmes / 1500 m
   hommes étant des épreuves olympiques distinctes mais de profil proche, le
   template unique vous semble-t-il pertinent ?

9. **Public visé.** Ces templates sont calibrés «nageur de compétition
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

*Document de proposition — §292 (Chantier A), ré-aligné sur les 6 cycles.
À valider par le coach avant seeding des 7 templates en base.*
