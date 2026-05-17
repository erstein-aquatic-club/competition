# Bilan muscu — barèmes de référence (sources & proposition)

## Validation coach — 2026-05-17

**Statut : VALIDÉ — encodé dans `src/lib/strength/kpiBaremes.ts` (§290).**

Le coach a relu cette proposition et arrêté les 4 décisions suivantes ; les barèmes
encodés en respectent l'application :

1. **5 KPIs encodés**, chacun porteur d'un **flag de confiance** :
   `solid` (normes publiées réelles — uniquement `broad_jump`),
   `transposed` (`vertical_jump`, `weighted_pullup`, `imtp`),
   `placeholder` (`medball_vertical_throw` — aucune donnée publiée, grille à calibrer).
2. **Bandes d'âge : 13-14, 15-16, 17-18 uniquement.** La tranche **A1 (11-12) est
   abandonnée** — il n'y a pas de Bilan Muscu avant 13 ans. Les lignes A1 des tableaux
   ci-dessous (§ 4-8) ne sont **pas** encodées.
3. **Population de référence : population scolaire générale** (la population des normes
   publiées — pas de recalibrage vers le haut « nageur entraîné ». Question ouverte n°1
   tranchée en faveur de l'option (a)).
4. **Barèmes filles : valeurs réelles par bande** — chaque bande prend la valeur que
   donnent les données, sans gel arbitraire des bandes les plus âgées. Question ouverte
   n°2 tranchée en faveur des valeurs populationnelles réelles.

Les tranches A2/A3/A4 du document deviennent respectivement les bandes encodées
13-14 / 15-16 / 17-18.

---

**Statut initial : PROPOSITION — à relire et corriger par le coach avant encodage dans l'app.**
Tâche A1.2 du chantier *Bilan muscu*. Ce document NE modifie aucun code. Il sert d'entrée
de discussion : aucun chiffre ci-dessous ne doit être encodé dans
`src/lib/strength/kpiBaremes.ts` tant que le coach ne l'a pas validé.

---

## 1. But

Le moteur d'évaluation force doit convertir une **mesure brute** d'un KPI (cm, kg…) en un
**score 0-100**, par **sexe** et par **tranche d'âge**, pour des nageurs de compétition de
~12-18 ans. Pour cela il faut un *barème* par KPI × sexe × tranche : une courte liste de
**points d'ancrage** `[valeurBrute, score]`. Le moteur interpole linéairement entre les
ancres (et extrapole/plafonne aux extrémités — détail d'implémentation hors périmètre ici).

Ce document fournit, pour chaque KPI, soit des **normes publiées réelles** (avec citation),
soit une **logique de transposition** explicite quand aucune norme standardisée n'existe.

### Honnêteté sur les sources — règle appliquée

- `vertical_jump` et `broad_jump` : normes issues de batteries de tests de condition
  physique des jeunes (EUROFIT / FitBack, études de percentiles). **Toute valeur est tracée
  à une source.**
- `weighted_pullup`, `imtp`, `medball_vertical_throw` : **aucune norme standardisée
  publiée n'existe pour ces tests exacts** dans cette population. Les barèmes proposés sont
  **transposés** depuis une grandeur documentée voisine. Ils sont **explicitement étiquetés
  « transposé — à valider/calibrer par le coach »** et le raisonnement est montré. Aucun
  chiffre inventé n'est présenté comme une norme sourcée.

---

## 2. Schéma d'ancrage retenu

**Schéma à 5 ancres, percentiles → scores : p10 → 10, p30 → 30, p50 → 50, p70 → 70,
p90 → 90.**

Justification du choix :

- La meilleure source disponible (percentiles du standing broad jump, Petrigna et al. 2020)
  publie ses données en **déciles p10…p90** — pas en p5/p95. Adopter p10/p30/p50/p70/p90
  permet d'utiliser les valeurs publiées **directement, sans extrapolation**, ce qui réduit
  le risque d'erreur.
- Mapper le percentile *p* au score *p* est lisible : un score de 50 = performance
  médiane de la population de référence, 90 = top 10 %, 10 = bas 10 %.
- Le moteur interpole entre ancres ; au-delà de p90 il peut monter jusqu'à 100, en-dessous
  de p10 descendre vers 0 (comportement à définir côté code — pas ici).

**Population de référence.** Les normes publiées portent sur la **population scolaire
générale**, pas sur des nageurs entraînés. Un nageur de club est en moyenne au-dessus de
cette population sur les tests de force/puissance. Conséquence assumée : un nageur EAC
« moyen pour un nageur » obtiendra un score > 50 sur ces barèmes. **Le coach doit décider**
s'il veut (a) garder la référence « population générale » (scores flatteurs mais
comparables aux normes publiques), ou (b) recentrer les barèmes sur la population « jeune
nageur entraîné » (scores plus exigeants). Voir § 9, question ouverte n°1.

---

## 3. Tranches d'âge proposées

Alignées sur les **catégories FFN natation course** (saison 2024-2025 ; l'âge est calculé
sur l'année civile, changement de catégorie au 1er janvier — source : règlements FFN
2024-2025) :

| Tranche | Âge | Catégorie FFN correspondante | Remarque physiologique |
|---|---|---|---|
| **A1** | 11-12 ans | Avenirs (≤11) + Benjamins (12) | Majoritairement pré-PHV |
| **A2** | 13-14 ans | Benjamins (13) + Juniors (14) | Pic de croissance (PHV) — forte variabilité |
| **A3** | 15-16 ans | Juniors | Post-PHV, montée rapide de la force |
| **A4** | 17-18 ans | Juniors | Quasi-adulte |

Remarques :

- La catégorie FFN « Juniors » couvre 14 à 18 ans d'un bloc : trop large pour un barème de
  force (un nageur de 14 ans en plein PHV n'a rien à voir avec un de 18 ans). On la
  **subdivise** en A2/A3/A4.
- Les normes publiées (EUROFIT, broad jump) sont **annuelles** ; on agrège deux âges par
  tranche en prenant la moyenne des deux années (méthode indiquée sous chaque tableau).
- **Décalage maturatif** : à 13-14 ans surtout, deux nageurs du même âge civil peuvent être
  séparés de 2-3 ans de maturité biologique. Le score d'un nageur A2 est donc à lire avec
  prudence. À discuter avec le coach (§ 9, question n°4) : faut-il un ajustement maturité,
  ou bien le score brut suffit comme outil de suivi individuel dans le temps ?

---

## 4. KPI `broad_jump` — Standing broad jump (saut en longueur sans élan)

**Confiance : ÉLEVÉE.** Normes directes, percentiles publiés, grande population.

### Source

Petrigna L., Karsten B., Marcolin G., et al. (2020). *Percentile values of the standing
broad jump in children and adolescents aged 6-18 years old.* European Journal of
Translational Myology / *Biology of Sport*-affiliée — PMC7385687.
- Population : 2 140 enfants/adolescents (1 176 garçons, 964 filles), 7 pays européens
  (Italie, Lituanie, Allemagne, Espagne, Portugal, Croatie, Turquie).
- Test : standing broad jump, distance horizontale en cm, meilleur essai.
- Percentiles publiés : déciles p10 à p90 (pas de p5/p95).

Source corroborante (ordres de grandeur) : Tomkinson G. et al. / réseau **FitBack** (2023,
PMC9985767) — *standing long jump*, 1 345 159 résultats, 34 pays européens ; médianes
garçons ~150 cm (11 ans) → ~208 cm (15 ans), filles ~140 → ~157 cm. Cohérent avec Petrigna.

### Barèmes proposés (valeurs Petrigna et al. 2020, cm)

Méthode d'agrégation : moyenne arithmétique des deux âges de la tranche, arrondie à l'unité.

**Garçons**

| Tranche | p10→10 | p30→30 | p50→50 | p70→70 | p90→90 |
|---|---|---|---|---|---|
| A1 (11-12) | 127 | 151 | 158 | 171 | 185 |
| A2 (13-14) | 133 | 153 | 167 | 181 | 197 |
| A3 (15-16) | 134 | 159 | 175 | 191 | 211 |
| A4 (17-18) | 148 | 168 | 187 | 203 | 224 |

*Détail par âge (cm) — p10/p30/p50/p70/p90 : 11 ans 117/143/153/164/178 — 12 ans
137/158/164/178/193 — 13 ans 135/154/168/180/188 — 14 ans 130/153/166/183/205 —
15 ans 132/153/170/182/198 — 16 ans 135/164/180/200/223 — 17 ans 150/175/195/210/228 —
18 ans 146/160/178/196/220.*

**Filles**

| Tranche | p10→10 | p30→30 | p50→50 | p70→70 | p90→90 |
|---|---|---|---|---|---|
| A1 (11-12) | 114 | 139 | 151 | 160 | 175 |
| A2 (13-14) | 116 | 128 | 140 | 153 | 173 |
| A3 (15-16) | 107 | 124 | 135 | 149 | 170 |
| A4 (17-18) | 98 | 113 | 125 | 139 | 163 |

*Détail par âge (cm) : 11 ans 106/140/152/160/175 — 12 ans 122/139/151/160/175 —
13 ans 121/131/142/154/178 — 14 ans 111/125/138/151/167 — 15 ans 112/127/139/150/176 —
16 ans 102/120/131/148/165 — 17 ans 95/112/126/140/169 — 18 ans 100/114/123/137/157.*

> **Note sur les filles.** La performance médiane **baisse** de A1 à A4 dans les données
> brutes (effet bien documenté : plateau vers 12-13 ans puis déclin de la performance
> relative à la masse). Encoder cette baisse telle quelle donne un barème A4 plus « facile »
> que A1 — ce qui peut **démotiver** une nageuse de 17 ans qui progresse mais voit son score
> baisser. **Décision coach requise** (§ 9, question n°2) : garder la référence
> populationnelle décroissante, ou geler le barème filles au niveau A2 pour A3/A4 ?

---

## 5. KPI `vertical_jump` — Détente verticale (jump-and-reach), meilleur de 3

**Confiance : MOYENNE.** Le test (détente sèche, hauteur atteinte en cm) est standard, mais
les **normes publiées en cm pour des jeunes de 12-18 ans sont étonnamment rares** : la
plupart des batteries de référence mesurent soit la **puissance** (W/kg, plateforme de
force), soit ne couvrent que les adultes. Les ancres ci-dessous sont **dérivées**, pas
recopiées d'une table de percentiles cm jeunes.

### Sources et données disponibles

1. **EUROFIT** (Council of Europe, *Eurofit Provisional Handbook*, Strasbourg 1983) — la
   batterie EUROFIT a longtemps utilisé le **standing broad jump** comme test de puissance
   des membres inférieurs, *pas* la détente verticale. Les tables EUROFIT « vertical jump »
   largement reprises en ligne (topendsports, marathonhandbook) sont des normes **adultes**
   (20-29 ans et +), pas jeunes.
2. **Normes adultes (topendsports)** : hommes — moyenne 41-50 cm, très bon 61-70 cm ;
   femmes — moyenne 31-40 cm, très bon 51-60 cm. Utiles comme **plafond A4** seulement.
3. **Puissance du saut, jeunes 10-18 ans** (Frontiers Pediatrics 2024, fped.2024.1207609,
   PMC10850334) : 736 jeunes portugais, countermovement jump sur Leonardo Mechanograph,
   **puissance en W/kg** (p3…p97). Confirme la dynamique : chez les garçons la puissance
   monte fortement avec l'âge (p50 ~37 W/kg à 11 ans → ~57 W/kg à 18 ans) ; chez les filles
   elle est quasi **plate** (~38 → ~44 W/kg). Cette source ne donne **pas** la hauteur en cm,
   donc ne fournit pas directement un barème — mais elle valide la **forme** des courbes.

### Logique de construction des ancres (TRANSPOSÉE — à valider/calibrer par le coach)

Faute de table de percentiles cm pour jeunes, les ancres sont construites ainsi :

- Point de départ : repères de terrain communément cités pour ados (garçons 13-14 ans
  ≈ 40-43 cm en moyenne ; garçons lycée ≈ 50-55 cm ; ados ~30-50 cm filles selon âge).
- Progression appliquée selon la **forme** des courbes de puissance Frontiers 2024 : forte
  hausse garçons A1→A4, quasi-plateau filles.
- Plafond p90 A4 calé sous les normes adultes « très bon » (garçons ~61-70 cm,
  filles ~51-60 cm).

**Ces tableaux sont des points de départ, pas des normes. Le coach devrait idéalement
mesurer 10-20 nageurs EAC sur 1-2 séances et recaler les ancres sur les données réelles
du club** (§ 9, question n°3).

**Garçons — détente verticale (cm) — TRANSPOSÉ / placeholder**

| Tranche | p10→10 | p30→30 | p50→50 | p70→70 | p90→90 |
|---|---|---|---|---|---|
| A1 (11-12) | 22 | 28 | 33 | 38 | 45 |
| A2 (13-14) | 28 | 35 | 41 | 47 | 54 |
| A3 (15-16) | 33 | 41 | 48 | 54 | 61 |
| A4 (17-18) | 37 | 45 | 52 | 59 | 67 |

**Filles — détente verticale (cm) — TRANSPOSÉ / placeholder**

| Tranche | p10→10 | p30→30 | p50→50 | p70→70 | p90→90 |
|---|---|---|---|---|---|
| A1 (11-12) | 18 | 23 | 28 | 33 | 40 |
| A2 (13-14) | 21 | 26 | 31 | 36 | 43 |
| A3 (15-16) | 23 | 29 | 34 | 39 | 46 |
| A4 (17-18) | 25 | 31 | 36 | 42 | 49 |

> Confiance MOYENNE. Test bien établi ; la **dynamique** par âge/sexe est sourcée
> (Frontiers 2024). Les **niveaux absolus en cm sont une estimation** à calibrer sur le
> club. Ne PAS présenter ces chiffres comme des normes publiées.

---

## 6. KPI `weighted_pullup` — Charge additionnelle max sur 1 traction stricte (kg)

**Confiance : FAIBLE-MOYENNE. TRANSPOSÉ — aucune norme publiée jeunes.**

### Pourquoi transposé

Il n'existe pas de table de percentiles « charge additionnelle en traction lestée » pour
des nageurs de 12-18 ans. Les standards disponibles (Liftoffrank, athletepath, strengthlevel)
sont des standards d'**adultes** de salle de musculation, exprimés en % de la masse
corporelle ajoutée.

### Logique de transposition

Standards adultes en **charge ajoutée = % du poids de corps (PdC)** au 1RM
(source : Liftoffrank, *Weighted Pull-Up Standards*, et benchmarks relatifs convergents) :

| Niveau | Charge ajoutée (% PdC) |
|---|---|
| Débutant | 0-10 % |
| Intermédiaire | 25-50 % |
| Avancé | 50-75 % |
| Élite | ≥ 100 % |

Transposition retenue pour de **jeunes nageurs** (population plus jeune, moins lourde,
moins expérimentée en muscu que la base « adulte gym » — d'où des % volontairement
**conservateurs**, abaissés vers le bas de chaque fourchette) :

- **Pré-requis** : 1 traction stricte au poids de corps = charge ajoutée 0 kg = **score ~30**.
  Un nageur qui ne tient pas 1 traction stricte est sous p30 (score < 30 — barème
  extrapolé côté code).
- p50 → charge ajoutée ≈ **10-15 % PdC** ; p70 → **~25 % PdC** ; p90 → **~40-45 % PdC**.
- Atténuation A1 (11-12) : pré-PHV, peu de masse, force relative limitée → ancres rabaissées.

**Conversion en kg.** Le barème est plus juste en **% du poids de corps**, mais le KPI est
saisi en **kg**. Deux options pour le coach (§ 9, question n°5) :
(a) garder le barème en kg avec un **poids de corps de référence par tranche** (ci-dessous),
(b) faire saisir le poids de corps et noter en % PdC côté moteur.
Poids de corps de référence retenus ci-dessous (ordres de grandeur jeunes nageurs, à
ajuster) : garçons A1 40 kg / A2 52 kg / A3 65 kg / A4 72 kg ; filles A1 40 kg / A2 50 kg /
A3 56 kg / A4 60 kg.

**Garçons — charge additionnelle traction (kg) — TRANSPOSÉ / à calibrer**

| Tranche | p10→10 | p30→30 | p50→50 | p70→70 | p90→90 |
|---|---|---|---|---|---|
| A1 (11-12) | -10 (assisté) | 0 | 2,5 | 5 | 12 |
| A2 (13-14) | -5 | 0 | 5 | 12,5 | 22,5 |
| A3 (15-16) | 0 | 5 | 10 | 17,5 | 30 |
| A4 (17-18) | 0 | 5 | 12,5 | 20 | 35 |

**Filles — charge additionnelle traction (kg) — TRANSPOSÉ / à calibrer**

| Tranche | p10→10 | p30→30 | p50→50 | p70→70 | p90→90 |
|---|---|---|---|---|---|
| A1 (11-12) | -15 (assisté) | -5 | 0 | 2,5 | 7,5 |
| A2 (13-14) | -10 | -2,5 | 0 | 5 | 12,5 |
| A3 (15-16) | -7,5 | 0 | 2,5 | 7,5 | 17,5 |
| A4 (17-18) | -5 | 0 | 5 | 10 | 20 |

> Valeurs négatives = traction **assistée** (élastique / poulie) : à n'encoder que si le
> moteur sait gérer une charge négative ; sinon plancher à 0 et traiter « assisté » comme
> score < p30. **Décision coach** (§ 9, question n°5).
> Confiance FAIBLE-MOYENNE : la *logique* (% PdC) est sourcée pour adultes ; la transposition
> jeunes et la conversion en kg sont des hypothèses. À recalibrer sur le club.

---

## 7. KPI `imtp` — Barbell mid-thigh pull, charge max sur 1 rep (kg)

**Confiance : FAIBLE. TRANSPOSÉ — aucune norme publiée pour ce test exact.**

### Avertissement important sur la nature du test

L'IMTP « académique » (*Isometric Mid-Thigh Pull*) mesure une **force isométrique de pic en
Newtons** sur une plateforme de force — l'athlète tire de toutes ses forces sur une barre
**fixe**. Le KPI décrit ici est différent : c'est une **charge dynamique max sur 1 rep**,
barre posée sur les pins du rack à mi-cuisse, exprimée en **kg**. **Ce sont deux mesures
distinctes.** Les données IMTP publiées (peak force en N) ne se convertissent PAS
directement en kg de charge soulevée. Cette divergence est la première chose à clarifier
avec le coach (§ 9, question n°6).

### Données de référence disponibles

- **IMTP isométrique, jeunes** : Morris R. et al. (2018), *Isometric Mid-Thigh Pull
  Characteristics in Elite Youth Male Soccer Players*, J. Strength Cond. Res. (DOI
  10.1519/JSC.0000000000002673 ; Leeds Beckett). 293 footballeurs U12-U18. Le **peak force
  absolu monte** de façon nette à chaque catégorie d'âge ; la cohorte U18 atteint
  **~2267 N** de force de pic (≈ équivalent ~231 kg-force isométrique). La **force
  relative** (PF/masse), elle, n'augmente quasiment pas entre catégories — ce qui montre que
  la progression du pic est surtout de la masse corporelle.
  → Cette source donne la **dynamique** (progression par âge) mais **pas un barème en kg de
  charge soulevée**, car c'est de l'isométrie en N.
- Repère « tirage lourd dynamique jeunes » : il n'y a pas de table de normes de deadlift /
  mid-thigh pull 1RM publiée et fiable pour 12-18 ans (le 1RM dynamique sur jeunes est peu
  testé pour raisons de sécurité — c'est justement l'argument du test isométrique).

### Logique de transposition

Faute de norme directe, le barème est ancré sur un **ratio charge/poids de corps** type
mid-thigh pull (le mid-thigh pull est un mouvement partiel à fort levier — charges
nettement plus lourdes qu'un deadlift complet) :

- p50 ≈ **1,3-1,5 × PdC** ; p90 ≈ **2,0-2,2 × PdC** ; p10 ≈ **0,7-0,8 × PdC**.
- Forte progression garçons A1→A4 (cohérent avec la hausse de peak force de Morris 2018) ;
  progression plus modérée filles.
- Atténuation A1 (pré-PHV) : ratios rabaissés, et **prudence** — un 1RM dynamique chez un
  enfant de 11-12 ans est discutable ; le coach voudra peut-être ne **pas** noter ce KPI
  pour A1, ou le mesurer en charge sous-maximale (§ 9, question n°6).

Poids de corps de référence : identiques au § 6.

**Garçons — mid-thigh pull charge max (kg) — TRANSPOSÉ / à calibrer**

| Tranche | p10→10 | p30→30 | p50→50 | p70→70 | p90→90 |
|---|---|---|---|---|---|
| A1 (11-12) | 25 | 35 | 45 | 60 | 75 |
| A2 (13-14) | 40 | 55 | 70 | 90 | 110 |
| A3 (15-16) | 55 | 75 | 95 | 115 | 140 |
| A4 (17-18) | 65 | 90 | 110 | 130 | 155 |

**Filles — mid-thigh pull charge max (kg) — TRANSPOSÉ / à calibrer**

| Tranche | p10→10 | p30→30 | p50→50 | p70→70 | p90→90 |
|---|---|---|---|---|---|
| A1 (11-12) | 22 | 30 | 40 | 50 | 62 |
| A2 (13-14) | 32 | 42 | 55 | 68 | 85 |
| A3 (15-16) | 40 | 52 | 65 | 80 | 100 |
| A4 (17-18) | 45 | 58 | 72 | 88 | 110 |

> Confiance FAIBLE. Aucune des valeurs n'est une norme publiée. La *dynamique* par âge est
> sourcée (Morris 2018, IMTP isométrique) ; les **niveaux en kg sont une transposition** via
> un ratio charge/PdC supposé. **Ce KPI a le plus besoin de la relecture du coach**, et
> idéalement d'une calibration sur 10-15 mesures réelles avant d'être utilisé pour scorer.

---

## 8. KPI `medball_vertical_throw` — Lancer vertical d'un médecine-ball 10 kg, allongé sur le dos, hauteur atteinte (cm)

**Confiance : FAIBLE. TRANSPOSÉ — protocole maison, aucune norme publiée.**

### Pourquoi transposé

Le test décrit (allongé sur le dos, médecine-ball **10 kg**, lancer vertical, **hauteur**
atteinte en cm) est un **protocole bespoke**. Aucune norme publiée n'existe pour ce
protocole. Les données de lancer de médecine-ball publiées portent sur d'**autres
protocoles** : ball plus léger, position assise, mesure en **distance** et non en hauteur.

### Données de référence disponibles (protocoles voisins)

- **Utah Seated Medicine Ball Throw** : Biggar, Larson & DeBeliso (2022), *Establishing
  Normative Reference Values for the Utah Seated Medicine Ball Throw Protocol in
  Adolescents*, The Sport Journal. 113 élèves non entraînés, 12-15 ans. Ball **2 kg**,
  position **assise dos au mur**, mesure en **distance (m)**.
  Moyennes (± SD) : garçons 12-13 ans **4,3 ± 0,7 m**, 14-15 ans **5,2 ± 0,8 m** ;
  filles 12-13 ans **3,4 ± 0,5 m**, 14-15 ans **3,7 ± 0,5 m**.
- Ces données confirment : (a) écart garçons/filles marqué, (b) progression nette garçons
  12→15 ans, progression faible filles. Elles **ne donnent pas** de hauteur en cm pour un
  ball de 10 kg.

### Logique de transposition

Comme aucune table n'existe pour ce protocole exact :

- La **forme** du barème (écart sexes, progression par âge) reprend celle de l'Utah SMBT
  (garçons +~20 % de 12-13 à 14-15 ; filles quasi-plateau).
- Les **niveaux absolus en cm** sont impossibles à dériver d'une source — un médecine-ball
  de **10 kg** lancé verticalement depuis le sol par un ado de 12 ans n'atteindra qu'une
  hauteur modeste. Les valeurs ci-dessous sont des **placeholders explicites** : ordres de
  grandeur plausibles, à **mesurer et recaler intégralement sur le club**.

**Garçons — lancer vertical médecine-ball 10 kg, hauteur (cm) — PLACEHOLDER / à mesurer**

| Tranche | p10→10 | p30→30 | p50→50 | p70→70 | p90→90 |
|---|---|---|---|---|---|
| A1 (11-12) | 30 | 45 | 60 | 75 | 95 |
| A2 (13-14) | 45 | 65 | 85 | 105 | 130 |
| A3 (15-16) | 65 | 90 | 115 | 140 | 170 |
| A4 (17-18) | 80 | 110 | 135 | 160 | 195 |

**Filles — lancer vertical médecine-ball 10 kg, hauteur (cm) — PLACEHOLDER / à mesurer**

| Tranche | p10→10 | p30→30 | p50→50 | p70→70 | p90→90 |
|---|---|---|---|---|---|
| A1 (11-12) | 20 | 30 | 42 | 55 | 70 |
| A2 (13-14) | 30 | 42 | 55 | 70 | 88 |
| A3 (15-16) | 38 | 52 | 68 | 84 | 105 |
| A4 (17-18) | 45 | 60 | 78 | 95 | 118 |

> Confiance FAIBLE — la plus faible des 5 KPI. **Aucun** chiffre n'est sourcé : seule la
> *forme* (écart sexes, dynamique par âge) s'appuie sur l'Utah SMBT, qui utilise un autre
> ball, une autre position et une autre unité. Pour un médecine-ball **10 kg** chez des
> 11-12 ans, vérifier d'abord la **faisabilité/sécurité** du test. Ces tableaux sont à
> traiter comme une grille vierge à remplir avec les mesures réelles du club.

---

## 9. Questions ouvertes pour le coach

Par ordre de priorité de relecture :

1. **Population de référence (impacte les 5 KPI).** Garde-t-on la référence « population
   scolaire générale » (scores flatteurs pour des nageurs entraînés, mais comparables aux
   normes publiques) ou recentre-t-on les barèmes sur « jeune nageur de club entraîné »
   (scores plus exigeants, plus discriminants en interne) ? Ce choix décale tous les
   barèmes.

2. **Barème filles décroissant avec l'âge (`broad_jump`, et tendance similaire ailleurs).**
   Les données brutes font baisser la performance médiane des filles de A1 à A4. Faut-il
   encoder cette baisse (risque de démotivation : une nageuse progresse mais son score
   baisse) ou geler le barème filles A3/A4 au niveau A2 ?

3. **Calibration `vertical_jump` sur le club.** Les niveaux en cm sont estimés. Le coach
   peut-il mesurer 10-20 nageurs pour recaler les ancres ? Sans ça, confiance MOYENNE
   seulement.

4. **Ajustement maturité (tranche A2 surtout).** À 13-14 ans, l'écart de maturité biologique
   fausse la comparaison entre nageurs du même âge. Veut-on un ajustement (statut PHV,
   âge biologique) ou bien le score sert uniquement de **suivi individuel dans le temps**
   (auquel cas la comparaison inter-nageurs est secondaire) ?

5. **`weighted_pullup` — unité et tractions assistées.** (a) Barème en kg avec poids de
   corps de référence par tranche, ou saisie du poids de corps + notation en % PdC ?
   (b) Comment traiter une traction **assistée** (valeurs négatives) : le moteur les
   gère-t-il, ou plancher à 0 ?

6. **`imtp` — clarifier le test et son usage A1.** (a) Confirmer que le test EAC est bien
   une **charge dynamique en kg** (mid-thigh pull sur pins) et non un IMTP isométrique en N
   — les deux ne sont pas convertibles. (b) Mesure-t-on ce KPI sur les **11-12 ans (A1)**,
   ou est-ce déconseillé (1RM dynamique chez pré-pubères) ? Si oui, charge sous-maximale ?

7. **`medball_vertical_throw` — faisabilité.** Vérifier que le protocole (médecine-ball
   **10 kg**, allongé sur le dos, lancer vertical) est sûr et réalisable pour tous, surtout
   A1 filles. Les barèmes de ce KPI sont des **placeholders** : prévoir une campagne de
   mesures avant de scorer quoi que ce soit dessus.

8. **Validité globale avant encodage.** Recommandation : n'activer le scoring que pour
   `broad_jump` (confiance élevée) au lancement, garder les 4 autres en « mesure enregistrée,
   score indicatif » jusqu'à une première calibration club.

---

## 10. Récapitulatif des sources

| Source | KPI servi | Population | Nature |
|---|---|---|---|
| Petrigna et al. 2020, *Percentile values of the standing broad jump 6-18 y* (PMC7385687) | `broad_jump` | 2 140 jeunes, 7 pays UE | Normes directes (déciles p10-p90) |
| Tomkinson et al. / FitBack 2023 (PMC9985767) | `broad_jump` (corrobore) | 1,3 M résultats, 34 pays UE | Normes directes (corroboration) |
| Council of Europe, *Eurofit Provisional Handbook* 1983 | `vertical_jump` (cadre) | — | Batterie de test (broad jump, pas VJ) |
| Frontiers Pediatrics 2024, fped.2024.1207609 (PMC10850334) | `vertical_jump` (dynamique) | 736 jeunes portugais | Puissance CMJ W/kg (pas hauteur cm) |
| topendsports — Vertical Jump Norms | `vertical_jump` (plafond) | Adultes | Normes adultes (catégories) |
| Liftoffrank, *Weighted Pull-Up Standards* | `weighted_pullup` | Adultes (gym) | Standards % PdC |
| Morris et al. 2018, *IMTP in Elite Youth Male Soccer Players*, JSCR | `imtp` (dynamique) | 293 footballeurs U12-U18 | IMTP isométrique (peak force N) |
| Biggar, Larson & DeBeliso 2022, *Utah Seated Medicine Ball Throw* (The Sport Journal) | `medball_vertical_throw` (forme) | 113 ados 12-15 ans | Lancer assis ball 2 kg, distance m |

**Bilan de confiance par KPI :**

| KPI | Confiance | Statut des barèmes |
|---|---|---|
| `broad_jump` | **Élevée** | Normes publiées, valeurs directes |
| `vertical_jump` | **Moyenne** | Dynamique sourcée, niveaux cm transposés — à calibrer |
| `weighted_pullup` | **Faible-moyenne** | Logique % PdC sourcée (adultes), transposition jeunes — à calibrer |
| `imtp` | **Faible** | Aucune norme directe ; test à clarifier — à calibrer |
| `medball_vertical_throw` | **Faible** | Protocole maison, placeholders — à mesurer intégralement |

---

*Document produit pour la tâche A1.2. Proposition à valider — ne pas encoder avant
relecture du coach.*
