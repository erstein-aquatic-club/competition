# Templates de périodisation muscu — 7 profils d'épreuve

> **⚠️ À RÉ-ALIGNER (2026-05-17).** Ce document a été rédigé avec l'ancien
> vocabulaire de cycles `endurance / hypertrophie / force / deload`. Le
> vocabulaire **validé** est désormais à **6 cycles** :
> `prepa_generale / force_max / puissance / maintien / affutage / pic`
> (cf. `bilan-muscu-cycles-vocabulaire.md`, validé coach 2026-05-17 —
> « hypertrophie » abandonné). Les 7 templates ci-dessous doivent être
> **réécrits** avec ce vocabulaire avant d'être seedés (tâche A3.3-bis).
> Le profil d'emphase par seau et la logique S&C par épreuve restent valables.

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
porte un type de cycle :

| `cycle` | Intention physiologique | Charge / volume typique |
|---|---|---|
| `endurance` | Adaptation anatomique, endurance de force, prévention. Tendons, posture, conditionnement général. | Charges légères/modérées, séries longues (≈ 12-20 reps, ~50-70 % 1RM). |
| `hypertrophie` | Construction de masse contractile et de tissu de soutien. Base sur laquelle la force se construit. | Charges modérées, volume élevé (≈ 8-12 reps). |
| `force` | Force maximale puis puissance/vitesse. Recrutement, coordination intermusculaire, taux de développement de force (RFD). | Charges lourdes, peu de reps (≈ 3-6 reps, ~70-89 % 1RM), récup longue. |
| `deload` | Semaine de décharge : volume réduit (~40-60 %), intensité maintenue. Récupération, supercompensation, fenêtre avant compétition. | Volume coupé, qualité préservée. |

> **Note importante sur le découpage.** Le catalogue d'exercices porte déjà les
> séries / reps / %1RM par cycle (`endurance`, `hypertrophie`, `force`). Le
> template ne fixe **que la séquence hebdomadaire de cycles**. Le cycle `force`
> couvre ici le continuum force-max → puissance → vitesse : la littérature S&C
> natation prescrit la force max en phase de développement, puis la puissance
> «après la force max ou juste avant la compétition», et la vitesse maximale
> «juste avant la compétition» (Frontiers / coaches S&C français, 2023). Comme
> le moteur ne dispose que de 3 cycles de travail, `force` agrège ce bloc
> terminal ; le coach peut, à la revue, décider de raffiner ce point (voir
> «Questions ouvertes»).

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
  sprinteurs élite). Clé pour : ordre hypertrophie → force endurance → force max
  → puissance → vitesse ; ≥ 3 séances/semaine ; paramètres force (~89 % 1RM,
  3-4×3-4) et puissance (~59 % 1RM, 3-4×6-7).
- **NSCA Coach** — *Beyond the Pool: Improving Swimming Performance with
  Dryland Training*. Clé pour : progression du général/foundational vers
  l'explosif spécifique ; intensités par épreuve (sprint 3-6 reps @ 70-85 %
  1RM ; endurance 10-15 reps @ 50-70 % 1RM) ; guidance par nage (papillon/brasse
  → stabilité d'épaule + mobilité de hanche ; crawl/dos → gainage + position de
  coulée).
- **PMC8296310 (2021)** — *Periodization and Programming for Individual 400 m
  Medley Swimmers*. Clé pour : macrocycles General → Specific → Competitive ;
  premier macrocycle orienté hypertrophie-force / force-métabolique en circuit,
  puis force max / puissance / vitesse-endurance ; taper 8-21 j, −40-60 % de
  charge.
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
- **`week_count`** : **12**

| Semaine | `cycle` | Intention |
|---|---|---|
| 1 | `endurance` | Adaptation anatomique, remise en charge. |
| 2 | `hypertrophie` | Construction de masse contractile. |
| 3 | `hypertrophie` | Idem, volume soutenu. |
| 4 | `deload` | Décharge, assimilation du bloc hypertrophie. |
| 5 | `hypertrophie` | Reprise hypertrophie, base élargie. |
| 6 | `force` | Bascule vers force max. |
| 7 | `force` | Force max, charges lourdes. |
| 8 | `deload` | Décharge en milieu de bloc force. |
| 9 | `force` | Force max → puissance. |
| 10 | `force` | Puissance / vitesse, RFD. |
| 11 | `force` | Vitesse maximale, qualité pure. |
| 12 | `deload` | Affûtage, fenêtre pré-compétition. |

**`bucket_emphasis`** :

| bucket | poids | justification |
|---|---|---|
| `upper_power` | **1.0** | Le 50 m est une épreuve de puissance quasi pure ; la traction explosive domine. |
| `lower_power` | **0.95** | Départ plongé + un virage (50 m) = poids décisif du bas du corps explosif. |
| `upper_strength` | 0.6 | Socle de force nécessaire pour exprimer la puissance, sans plus. |
| `lower_strength` | 0.55 | Idem, support de la puissance. |
| `mobility` | 0.4 | Mobilité utile (amplitude, départ) mais moins critique qu'en nage longue. |

**Rationale S&C.** L'enquête Frontiers 2023 sur les coaches S&C de sprinteurs
élite français décrit exactement cette progression : hypertrophie et endurance
de force en début de saison, puis évolution vers force max, puissance et
**vitesse maximale juste avant la compétition**. La NSCA recommande pour le
sprint des charges lourdes à faibles reps (3-6 @ 70-85 % 1RM) pour la puissance
anaérobie. La tendance «qualité plutôt que volume» publiquement documentée
autour de Cameron McEvoy (haltérophilie, calisthénie, gymnastique, mobilité
priorisée) renforce le choix d'un bloc terminal `force` long et de `deload`
fréquents pour préserver la fraîcheur nerveuse. Le double poids `upper_power` +
`lower_power` reflète qu'un 50 m se gagne au départ, sous l'eau et sur les
premiers appuis. *La durée de 12 semaines est une synthèse* : assez longue pour
hypertrophie + force, assez courte pour rester un bloc «pré-pic».

---

### T2 — `breaststroke` · Brasse

- **`name`** : « Brasse — Hanche & adducteurs »
- **`week_count`** : **14**

| Semaine | `cycle` | Intention |
|---|---|---|
| 1 | `endurance` | Adaptation anatomique, préhab hanche/adducteurs. |
| 2 | `endurance` | Endurance de force, mobilité de hanche. |
| 3 | `hypertrophie` | Construction, accent bas du corps. |
| 4 | `hypertrophie` | Idem. |
| 5 | `deload` | Décharge. |
| 6 | `hypertrophie` | Reprise, base de force du fouet de jambes. |
| 7 | `hypertrophie` | Idem. |
| 8 | `force` | Force max, adducteurs / hanche. |
| 9 | `force` | Force max. |
| 10 | `deload` | Décharge milieu de bloc. |
| 11 | `force` | Force → puissance du fouet brasse. |
| 12 | `force` | Puissance. |
| 13 | `force` | Vitesse / explosivité. |
| 14 | `deload` | Affûtage pré-compétition. |

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
`lower_strength` + `mobility` élevés. Le template est *un peu plus long que le
sprint (14 semaines, synthèse)* pour laisser le temps de construire la force
spécifique de hanche et la mobilité, qui s'acquièrent lentement.

---

### T3 — `backstroke` · Dos

- **`name`** : « Dos — Chaîne postérieure & épaule »
- **`week_count`** : **13**

| Semaine | `cycle` | Intention |
|---|---|---|
| 1 | `endurance` | Adaptation anatomique, préhab épaule (rotateurs). |
| 2 | `endurance` | Endurance de force, chaîne postérieure. |
| 3 | `hypertrophie` | Construction, lats + chaîne postérieure. |
| 4 | `hypertrophie` | Idem. |
| 5 | `deload` | Décharge. |
| 6 | `hypertrophie` | Reprise. |
| 7 | `force` | Force max, traction dorsale. |
| 8 | `force` | Force max. |
| 9 | `deload` | Décharge milieu de bloc. |
| 10 | `force` | Force → puissance. |
| 11 | `force` | Puissance de traction + ondulation. |
| 12 | `force` | Vitesse / explosivité. |
| 13 | `deload` | Affûtage pré-compétition. |

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
majeure du dos moderne, justifie un `lower_power` non négligeable. *Durée 13
semaines : valeur médiane de synthèse* entre sprint et nages plus longues.

---

### T4 — `200m` · 200 m

- **`name`** : « 200 m — Force-endurance mixte »
- **`week_count`** : **15**

| Semaine | `cycle` | Intention |
|---|---|---|
| 1 | `endurance` | Adaptation anatomique. |
| 2 | `endurance` | Endurance de force. |
| 3 | `endurance` | Endurance de force, conditionnement. |
| 4 | `hypertrophie` | Construction. |
| 5 | `hypertrophie` | Idem. |
| 6 | `deload` | Décharge. |
| 7 | `hypertrophie` | Reprise. |
| 8 | `hypertrophie` | Idem. |
| 9 | `force` | Force max. |
| 10 | `force` | Force max. |
| 11 | `deload` | Décharge milieu de bloc. |
| 12 | `force` | Force → puissance. |
| 13 | `force` | Puissance / vitesse-endurance. |
| 14 | `force` | Vitesse-endurance, qualité. |
| 15 | `deload` | Affûtage pré-compétition. |

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
équilibre : un bloc d'endurance de force plus long qu'en sprint, mais un bloc
terminal `force` qui vise la **vitesse-endurance** (puissance maintenue) plutôt
que la vitesse pure. L'emphase bascule de `*_power` (sprint) vers
`upper_strength` : tenir la traction sans s'écrouler dans le 3e 50 est le nerf
de la guerre. *15 semaines : synthèse* — plus long que le sprint pour installer
la base de force-endurance.

---

### T5 — `400m` · 400 m

- **`name`** : « 400 m — Force-endurance aérobie »
- **`week_count`** : **16**

| Semaine | `cycle` | Intention |
|---|---|---|
| 1 | `endurance` | Adaptation anatomique. |
| 2 | `endurance` | Endurance de force. |
| 3 | `endurance` | Endurance de force. |
| 4 | `endurance` | Endurance de force, conditionnement métabolique. |
| 5 | `hypertrophie` | Construction. |
| 6 | `hypertrophie` | Idem. |
| 7 | `deload` | Décharge. |
| 8 | `hypertrophie` | Reprise. |
| 9 | `hypertrophie` | Idem. |
| 10 | `force` | Force max. |
| 11 | `force` | Force max. |
| 12 | `deload` | Décharge milieu de bloc. |
| 13 | `force` | Force → puissance. |
| 14 | `endurance` | Endurance de force de retour (transfert spécifique). |
| 15 | `force` | Vitesse-endurance, qualité. |
| 16 | `deload` | Affûtage pré-compétition. |

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
bloc d'endurance de force initial long (4 semaines) et un retour d'une semaine
`endurance` en semaine 14 pour **transférer** la force acquise vers de
l'endurance de force spécifique avant l'affûtage. L'emphase passe résolument sur
`*_strength` (force-endurance) et `mobility` (préhab d'épaule, le volume de
bassin grimpant). *16 semaines : synthèse*, cohérente avec un mésocycle
«Specific» long du modèle 400 m médley (PMC8296310, mésocycles spécifiques de
7-10 semaines).

---

### T6 — `distance` · 800 / 1500 m

- **`name`** : « Demi-fond — Endurance de force & préhab »
- **`week_count`** : **18**

| Semaine | `cycle` | Intention |
|---|---|---|
| 1 | `endurance` | Adaptation anatomique, préhab épaule. |
| 2 | `endurance` | Endurance de force. |
| 3 | `endurance` | Endurance de force. |
| 4 | `endurance` | Endurance de force, conditionnement. |
| 5 | `hypertrophie` | Construction (volume modéré). |
| 6 | `hypertrophie` | Idem. |
| 7 | `deload` | Décharge. |
| 8 | `hypertrophie` | Reprise. |
| 9 | `endurance` | Transfert : endurance de force spécifique. |
| 10 | `force` | Force max (bloc court). |
| 11 | `force` | Force max. |
| 12 | `deload` | Décharge. |
| 13 | `endurance` | Endurance de force. |
| 14 | `endurance` | Endurance de force. |
| 15 | `force` | Conversion en force durable. |
| 16 | `endurance` | Endurance de force spécifique. |
| 17 | `endurance` | Maintien, préhab, qualité. |
| 18 | `deload` | Affûtage pré-compétition. |

**`bucket_emphasis`** :

| bucket | poids | justification |
|---|---|---|
| `upper_strength` | **1.0** | Le demi-fond se gagne sur la traction maintenue ; force-endurance du haut du corps avant tout. |
| `mobility` | **1.0** | 60-80 km/semaine en bassin → l'épaule du nageur est le risque n°1 ; préhab maximale. |
| `lower_strength` | **0.75** | Gainage de coup de pied sur 800/1500 m, tenue posturale. |
| `upper_power` | 0.45 | Départ et virages dilua sur la distance ; faible poids. |
| `lower_power` | 0.4 | Appuis explosifs marginaux sur ces distances. |

**Rationale S&C.** Pour le demi-fond, l'objectif dryland prioritaire est la
**prévention de blessure** et la force-endurance, pas la puissance. Les sources
sur le 1500 m soulignent que les nageurs de fond couvrent 60-80 km/semaine et
que ce volume génère douleurs d'épaule et de bas du dos ; les études PMC7052717
et PMC4637920 démontrent l'intérêt d'un renforcement des rotateurs externes
d'épaule. D'où `mobility` à 1.0 (à égalité avec `upper_strength`) — c'est le
seul template où la préhab est aussi haute. La structure privilégie des blocs
`endurance` récurrents et un bloc `force` court : on cherche un nageur **fort
sous fatigue** sans alourdir une masse qui pénaliserait l'hydrodynamisme.
*18 semaines : synthèse* — le template le plus long, car la force-endurance et
la résilience tissulaire se construisent sur la durée.

---

### T7 — `medley` · 4 nages

- **`name`** : « 4 nages — Polyvalence force-puissance »
- **`week_count`** : **16**

| Semaine | `cycle` | Intention |
|---|---|---|
| 1 | `endurance` | Adaptation anatomique, préhab globale. |
| 2 | `endurance` | Endurance de force. |
| 3 | `endurance` | Endurance de force, conditionnement (circuit). |
| 4 | `hypertrophie` | Construction. |
| 5 | `hypertrophie` | Idem. |
| 6 | `hypertrophie` | Idem. |
| 7 | `deload` | Décharge. |
| 8 | `hypertrophie` | Reprise. |
| 9 | `force` | Force max. |
| 10 | `force` | Force max. |
| 11 | `deload` | Décharge milieu de bloc. |
| 12 | `force` | Force → puissance. |
| 13 | `force` | Puissance. |
| 14 | `endurance` | Transfert : endurance de force spécifique. |
| 15 | `force` | Vitesse-endurance, qualité. |
| 16 | `deload` | Affûtage pré-compétition. |

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
macrocycle orienté **hypertrophie-force et conditionnement métabolique en
circuit**, puis force max / puissance / vitesse-endurance — séquence reprise
ici. *16 semaines : synthèse*, alignée sur les mésocycles longs du modèle médley
publié. Note : ce template vise le 4-nages «générique» ; un medleyiste de 200 m
et un de 400 m n'ont pas exactement le même besoin (voir Questions ouvertes).

---

## 3. Tableau récapitulatif

| # | `event_group` | `name` | `week_count` | Logique de périodisation |
|---|---|---|---|---|
| T1 | `sprint_50` | Sprint 50 m — Force-vitesse | 12 | Hypertrophie → bloc force/puissance/vitesse long, `deload` fréquents pour la fraîcheur nerveuse. |
| T2 | `breaststroke` | Brasse — Hanche & adducteurs | 14 | Construction lente de la force de hanche/adducteurs, mobilité spécifique élevée. |
| T3 | `backstroke` | Dos — Chaîne postérieure & épaule | 13 | Hypertrophie dorsale puis force/puissance, préhab d'épaule constante. |
| T4 | `200m` | 200 m — Force-endurance mixte | 15 | Profil mixte : endurance de force allongée + bloc terminal vitesse-endurance. |
| T5 | `400m` | 400 m — Force-endurance aérobie | 16 | Endurance de force longue, force max courte, retour `endurance` de transfert. |
| T6 | `distance` | Demi-fond — Endurance de force & préhab | 18 | Blocs `endurance` récurrents, force courte, préhab d'épaule maximale. |
| T7 | `medley` | 4 nages — Polyvalence force-puissance | 16 | Profil équilibré tous buckets, circuit métabolique puis force/puissance. |

---

## 4. Évaluation honnête de la confiance

- **Élevée** — Le **vocabulaire des cycles** (endurance/hypertrophie/force +
  deload) et la **séquence générale** hypertrophie → force → puissance/vitesse
  → affûtage : directement appuyés sur la littérature S&C natation (Frontiers
  2023, NSCA, PMC8296310). Peu de risque.
- **Élevée** — Les **directions de `bucket_emphasis`** : sprint = puissance,
  fond = force-endurance + mobilité, brasse = hanche/adducteurs, dos = chaîne
  postérieure + épaule, medley = équilibré. Ce sont des faits S&C bien établis.
- **Moyenne** — Les **valeurs numériques exactes** des poids `bucket_emphasis`
  (0.6 vs 0.7 vs 0.8). Les directions sont sourcées ; le calibrage fin est un
  jugement de synthèse. À ajuster par le coach selon son ressenti.
- **Moyenne** — Les **`week_count`** (12 à 18). La fourchette est cohérente avec
  les mésocycles publiés, mais les valeurs précises sont une synthèse : elles
  dépendent du calendrier réel de la saison du club.
- **Plus faible / à trancher** — Le fait d'**agréger force max + puissance +
  vitesse dans le seul cycle `force`**. La littérature les distingue ; le moteur
  ne propose que 3 cycles de travail. C'est un compromis assumé, pas une
  recommandation S&C.
- **Note d'honnêteté** — Aucun template n'est la copie d'un programme nominatif
  d'athlète d'élite (ces programmes ne sont pas publics). L'approche McEvoy est
  citée comme **tendance documentée** illustrant la philosophie sprint, pas comme
  programme reproduit.

---

## 5. Questions ouvertes pour le coach

1. **Cycle `force` agrégé.** Le moteur ne connaît que `endurance` /
   `hypertrophie` / `force` comme cycles de travail. J'ai donc fait porter à
   `force` tout le bloc terminal force-max → puissance → vitesse. Est-ce
   acceptable, ou faut-il faire évoluer le vocabulaire (ajouter `puissance` /
   `vitesse`) avant le seeding ?

2. **Fréquence des `deload`.** J'ai placé un `deload` toutes les ~4-5 semaines +
   un en fin de template (affûtage). Est-ce le bon rythme pour vos nageurs, ou
   préférez-vous un `deload` toutes les 3 semaines (charge plus prudente,
   notamment chez les jeunes) ?

3. **Calibrage des poids `bucket_emphasis`.** Les directions sont sourcées, mais
   les valeurs exactes (ex. `mobility` 0.4 en sprint, 1.0 en demi-fond) sont mon
   jugement. Lesquelles vous semblent à corriger ? En particulier : la mobilité
   en sprint mérite-t-elle vraiment d'être aussi basse (0.4) ?

4. **`week_count` vs calendrier réel.** Les durées (12-18 semaines) supposent un
   bloc de préparation continu. Comment s'articulent-elles avec votre découpage
   de saison (2 ou 3 macrocycles) ? Faut-il des templates plus courts pour la
   2e partie de saison ?

5. **`sprint_50` crawl ET papillon.** J'ai regroupé 50 crawl et 50 papillon dans
   un template unique. Le 50 papillon demande plus d'ondulation/puissance de
   chaîne postérieure. Faut-il les séparer, ou le template commun suffit-il ?

6. **`medley` 200 vs 400.** Un seul template medley : le 200 4-nages (plus
   explosif) et le 400 4-nages (plus aérobie) sont assez différents. Un template
   commun convient-il, ou en faut-il deux ?

7. **`distance` 800 vs 1500.** Regroupés sous `distance`. Le 800 m femmes / 1500 m
   hommes étant des épreuves olympiques distinctes mais de profil proche, le
   template unique vous semble-t-il pertinent ?

8. **Public visé.** Ces templates sont calibrés «nageur de compétition
   générique». Faut-il des variantes par âge / niveau (jeunes catégories vs
   seniors), notamment sur le volume du bloc `force` et la fréquence des
   `deload` ?

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

*Document de proposition — Tâche A3.3. À valider par le coach avant seeding des
7 templates en base.*
