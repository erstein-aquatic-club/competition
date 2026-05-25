# Audit — Musculation des nageurs élite du 100 m NL (hommes) vs générateur de mésocycle — 2026-05-25

*Travail de recherche (méthodes d'entraînement musculation des meilleurs nageurs
mondiaux/olympiques sur 100 m nage libre hommes) croisé en lecture seule avec le
comportement réel du générateur (`mesocycleEngine.ts`, `periodizationCycles.ts`,
`kpiBaremes.ts`, le **catalogue `dim_exercices`** et les **templates
`strength_periodization_templates`** en base prod). Aucune modification de code.
Tous les faits code/DB sont vérifiés (`fichier:ligne` ou requête SQL).*

> **Contexte vs l'audit 200 NL féminin (2026-05-24)** : cet audit est postérieur
> à **§303** (« dé-jeunification » : bande d'âge `adulte`, tier de performance,
> barème débridé, niveau de pratique lu en table). Le **verrou n°1 de l'audit
> 200 NL-F (G1 « jeunification ») est donc en grande partie levé** — je le crédite
> explicitement plus bas. Les écarts qui restent pour un 100 m H élite sont **plus
> fins et surtout opérationnels** (activation des bons réglages), pas des
> manques de fond.

## Synthèse exécutive

**État global** : 🟢🟠 — Pour un 100 m NL masculin de haut niveau, le générateur a
des **fondations solides et désormais adultes** : un **catalogue complet** (il
contient *réellement* squat/front squat/soulevé de terre/développé couché,
**tractions lestées**, **power clean / hang clean**, drop jumps, box jumps,
lancers de médecine-ball…), un cycle `force_max` qui prescrit de la **vraie force
maximale** (compounds 5×3 @ 85 %), et une **périodisation sprint « McEvoy-aligned »
cohérente**. Le verrou n'est plus le contenu : c'est **l'activation** du bon
niveau/tier et **quelques angles de puissance/autorégulation**.

- **Écart élevé** 🔴 : **1** (pool élite verrouillé derrière `level='advanced'` ; `level` et `tier` désynchronisables ; KPI traction lestée mesuré mais non prescrit hors `advanced`)
- **Écarts moyens** 🟠 : **3** (puissance haut du corps sous-pondérée ; zéro autorégulation/VBT ; pas de vrai bloc force ≥ 90 % / divergence doc↔moteur sur la puissance)
- **Écarts faibles** 🟡 : **4** (pas de template 100 m → proxy `sprint_50` ; pas de deload explicite ; 1 exo/seau sans rotation ; angle disponibilité énergétique masculine absent)
- **Hors périmètre** ⚪ (décision produit 2026-05-24) : **2** (couplage macrocycle natation ; transfert eau)
- **Alignements confirmés** ✅ : **6**

**3 recommandations prioritaires** (périmètre actuel, *swim-independent*)

1. **Lever / coupler le verrou de niveau (GA).** Aujourd'hui les exos qui *définissent*
   le profil d'un sprinteur mondial — **tractions lestées, power clean, hang clean,
   drop jump, pompes claquées** — sont taggés `advanced` (`dim_exercices`) et le
   moteur ne les sert que si `athleteLevel === 'advanced'`
   (`mesocycleEngine.ts:385-386`). Or le défaut est `intermediate`/`club`
   (`MesocyclePreview.tsx:318-319`). **`level` (pool d'exos) et `performance_tier`
   (barème) sont deux réglages séparés** : un nageur noté « elite » au barème peut
   recevoir des **tractions au poids du corps** au lieu de **lestées** — alors même
   que le KPI `weighted_pullup` mesure la charge additionnelle. → Coupler les deux
   réglages (ou au moins alerter le coach quand `tier ≥ national` mais
   `level ≠ advanced`), et défaut `advanced` pour la filière performance.
2. **Renforcer l'angle puissance haut du corps (GB).** Le template `sprint_50`
   pondère `upper_power: 0.5` (vs `upper_strength: 1.0`) et le seau `upper_power`
   est mince (lancers med-ball + bench pull explosif + pompes claquées). Or la
   **puissance du haut du corps est le 1er prédicteur du sprint** (r ≈ −0,86 vs
   50 m ; puissance lat pull-down = test à sec le plus corrélé au 100 m). →
   Remonter l'emphasis `upper_power` du template sprint et étoffer le seau.
3. **Introduire de l'autorégulation / VBT (GC).** Charges 100 % déterministes
   (% 1RM fixe). La tendance élite est la mesure force-vitesse (VBT, ~38 % des
   coachs HN FR). Levier de modernisation entièrement *swim-independent*.

---

## 1. Cadrage

Les « meilleurs nageurs mondiaux » du 100 m NL (≈ 46,4–48,3 s) sont des **adultes
de 20-28 ans**, entraînés depuis 10+ ans. Le 100 m libre masculin est une épreuve
**fortement sprint** : départ + 15 m explosifs (alactique), puis maintien d'une
puissance de nage élevée sous montée de lactate (glycolytique). Comparé au
**200 NL féminin** de l'audit voisin, le **transfert force max / puissance /
explosivité prime encore davantage**, et l'**endurance-force** est un complément
mineur.

**Décision de périmètre (2026-05-24)** : le module musculation reste **indépendant
de la planification et des séances de natation**. Les écarts qui supposeraient ce
lien (couplage macrocycle / charge bassin ; transfert eau) sont documentés pour
mémoire mais classés **hors périmètre** ⚪. Toutes les recommandations de §0 sont
*swim-independent*.

---

## 2. Benchmark — méthodes d'entraînement musculation (100 NL masculin élite)

| Axe | Pratique élite / littérature |
|---|---|
| **Nature de l'épreuve** | Sprint long : départ/15 m alactique + nage glycolytique. Priorité **force max + puissance + explosivité** ; l'endurance-force n'est qu'un complément. La force max et la pliométrie transfèrent **mieux** que l'endurance musculaire sur le sprint. |
| **Effet du renforcement** | Sprinters NL : **+2,8 % sur 100 m** après 3 mois de muscu ; méta-analyse : sprint amélioré de **1,3–4,4 %** par muscu+pliométrie ciblée. Les nageurs élite ont une **puissance musculaire max 18–25 % supérieure** aux niveaux inférieurs. |
| **Périodisation** | Blocs calés sur la saison : hypertrophie/adaptation anatomique → **force max** → **conversion puissance** → vitesse/affûtage. Pics dryland typiquement **~20 et ~6 sem** avant la cible. |
| **Fréquence/volume dryland** | **≥ 3 séances/sem** (83 % des coachs HN FR), ~20-25 % du temps hebdo. (NB : 3-4 séances *à sec*/sem est la norme — l'eau porte le gros volume.) |
| **Paramètres chiffrés** (coachs HN FR sprint) | Force max : **3-4 × 3-4 @ ~89 % 1RM**, ~3 min récup. Puissance : **3-4 × 6-7 @ ~59 % 1RM**, ~2,5 min. Maintien proche compé : 1-2 séances, charges lourdes, volume minimal. |
| **Exercices clés** | Gainage/tronc (#1), **développé couché, squat** (top 3) ; hip hinge/soulevé de terre, **tractions lestées / tirage / lat pull-down** ; **dérivés d'haltérophilie** (power clean, hang clean) ; **pliométrie** bas du corps (départs/virages) ; lancers de médecine-ball. Haut du corps ≥ bas. |
| **KPI prédictifs *chez l'homme*** | **Puissance haut du corps r ≈ −0,86 vs 50 m** (prédicteur le plus fort) ; **puissance lat pull-down** = test à sec le plus corrélé au 100 m (F@Pmax ρ=−0,56 ; V@Pmax ρ=0,71 vs vitesse moy.) ; **développé couché** F@Pmax ρ≈−0,51 à −0,79 ; **back squat 1RM r=−0,74 vs temps de départ** (sprinteurs internationaux GB à < 15 % du record du monde) ; CMJ / squat jump → départ ; puissance moyenne jambes r=0,76 vs vitesse. |
| **VBT / autorégulation** | Profilage charge-vitesse en montée (≈ 38 % des coachs HN FR utilisent force-vitesse) ; en bassin, charge relative max (rL0) r=0,63 vs 100 m. |
| **Timing dryland↔bassin** | Une séance de force **12 h avant** un 100 m n'altère pas la perf (avec nuit de sommeil). Prudence haut du corps proche compétition. |
| **Spécificités masculines** | Pas d'angle menstruel (≠ audit féminin). Mais **disponibilité énergétique / RED-S existe aussi chez l'homme** (15-70 % des athlètes M ; **43 % des nageurs NCAA en faible disponibilité**) → impacte l'adaptation force et l'os. Plafonds de charge **bien plus hauts** qu'en référence scolaire. |
| **Prévention** | Épaule++ (swimmer's shoulder), mobilité quotidienne intégrée à chaque phase. |

Sources complètes en §6.

---

## 3. Ce que le générateur fait DÉJÀ bien pour un 100 NL masculin élite ✅

| Point fort | Preuve |
|---|---|
| **Catalogue complet et pertinent** | `dim_exercices` contient *réellement* les piliers du sprinteur : squat arrière/avant, soulevé de terre roumain & trap bar, développé couché barre, **tractions lestées**, **power clean / hang clean**, **drop jump to stick**, box jump, squat sauté, **lancers de médecine-ball** (vertical/latéral/rotatif/poids), pompes claquées. (requête `dim_exercices`, 2026-05-25). L'agent initial avait conclu « pas d'haltéro » — **faux** : ils sont présents, taggés `advanced`. |
| **Vraie force maximale** | `force_max` lit directement les colonnes force du catalogue (`mesocycleEngine.ts:838-843`) → compounds **5 × 3 @ 85 %, 330 s de récup** (back squat, bench, soulevé, tractions lestées). C'est de la force max légitime (≥ 85 %), pas un placebo. |
| **Périodisation sprint cohérente** | Template `sprint_50` saison « **Force / Puissance (McEvoy-aligned)** » : `prepa_generale → force_max → prepa_generale (unload) → puissance → maintien → affutage → pic` (DB `strength_periodization_templates`). Arc bloc manuel-de-référence pour le sprint, pic = activation SNC. |
| **Travail explosif présent** | Cycles `puissance` et `pic` (`periodizationCycles.ts:104-165`) + exos pliométriques/balistiques taggés (`lower_power`, `upper_power`), intention « déplacer la charge à vitesse maximale ». |
| **§303 — barèmes adultes & tier élite** | Bande `adulte` (`kpiBaremes.ts:103,308,320`) + décalage `elite` de **0,5 × étendue** (`shiftAnchors`, ligne 89-95). Ex. traction lestée H elite : p50 ≈ **+30 kg**, p90 ≈ **+52 kg** ; détente p50 ≈ **66 W/kg**. De plus `kpiScore` **extrapole au-delà de p90** (ligne 46-57) → les profils > p90 restent discriminables. Le verrou « plafond 18 ans » de l'audit 200 NL-F est ainsi largement levé. |
| **Les bons KPI** | `weighted_pullup`, `vertical_jump` (puissance W/kg), `broad_jump`, `imtp`, `medball_vertical_throw` — alignés sur les prédicteurs **masculins** (pulling power → propulsion ; squat/détente → départ). |

---

## 4. Écarts, par ordre d'impact

| # | Écart | Méthode élite | Ce que fait le moteur (preuve) | Gravité |
|---|---|---|---|---|
| **GA** | **Pool élite verrouillé + réglages désynchronisables** | Un sprinteur mondial s'entraîne sur tractions lestées, haltéro, pliométrie avancée | Ces exos sont taggés `advanced` (`dim_exercices`) ; `selectExercises` ne les sert que si `athleteLevel==='advanced'` (`mesocycleEngine.ts:385-386`). Défaut = `intermediate`/`club` (`MesocyclePreview.tsx:318-319`). `level` (pool) et `performance_tier` (barème) sont **2 réglages séparés** → un nageur « elite » au barème peut recevoir des **tractions au poids du corps** au lieu de lestées. Incohérence : le KPI `weighted_pullup` est mesuré mais l'exo `Tractions lestées` (advanced) n'est pas prescrit hors `advanced`. | 🔴 Élevé |
| **GB** | **Puissance haut du corps sous-pondérée / seau mince** | Puissance haut du corps = 1er prédicteur sprint (r≈−0,86) | `sprint_50` : `upper_power: 0.5` vs `upper_strength: 1.0` (DB). Seau `upper_power` = lancers med-ball + bench pull explosif + pompes claquées (peu d'options ; pulling explosif lourd quasi absent). | 🟠 Moyen |
| **GC** | **Aucune autorégulation (RPE/RIR/VBT)** | Tendance élite = profilage force-vitesse, ajustement fatigue | % 1RM **fixe et déterministe** (`mesocycleEngine.ts:804-895`). Intention « vitesse max » affichée mais **aucune cible de vitesse ni feedback**. | 🟠 Moyen |
| **GD** | **Pas de vrai bloc force ≥ 90 % ; divergence doc↔moteur sur la puissance** | Élite : parfois 1-3RM @ 90-95 % ; puissance = charge allégée à vitesse max | Charge plafonne à ~85 % (`force_max`) ; `pic` redescend à ~× 0,6 (`mesocycleEngine.ts:874`). Et le schéma `puissance` *documenté* (`60-80 %`, `periodizationCycles.ts:112`) **n'est pas appliqué** : le moteur prend la colonne force **− 15 pts** (`ligne 858`) → back squat en phase puissance = **5×3 @ 70 %** (force-vitesse), pas la fourchette explosive documentée. | 🟠 Moyen |
| **GE** | **Pas de deload explicite** | Deload toutes les ~3-4 sem sur un bloc long | Vocabulaire à 6 cycles sans semaine de décharge ; `maintien`/`affutage` baissent le volume mais tiennent 70-85 %. Atténué par le 2ᵉ `prepa_generale` (unload) du template `sprint_50`. | 🟡 Faible |
| **GF** | **Pas de template 100 m ; sélection non event-aware** | Dryland 100 m ≈ 50 m (force+puissance) mais nuance lactique | Aucun event_group `100m`/`sprint_100` en DB → un crawleur 100 m choisit `sprint_50` (proxy correct) ou `200m`. La sélection d'exo dans un seau n'est **pas** event-spécifique (`mesocycleEngine.ts:373-429`). | 🟡 Faible |
| **GG** | **1 exo/seau, pas de rotation** | Pool varié sur le mésocycle | Sélection ordonnée `isCore` puis niveau décroissant (`mesocycleEngine.ts:399-405`) → les mêmes lifts reviennent sur 8-16 sem (monotonie). | 🟡 Faible |
| **GH** | **Angle disponibilité énergétique absent** | RED-S existe aussi chez l'homme (impact force/os) | Questionnaire = douleur + psycho ; **rien sur la disponibilité énergétique**. Moins critique que chez la femme (pas d'angle menstruel), mais réel. | 🟡 Faible |
| **G-natation 1** | **Zéro couplage macrocycle natation** | Pics dryland ~20/~6 sem avant la cible | Aucune date/charge bassin en entrée. | ⚪ Hors périmètre\* |
| **G-natation 2** | **Pas de transfert eau** | Plaquettes, élastiques, nage résistée, tethered | Muscu à sec uniquement. | ⚪ Hors périmètre\* |

\* **Hors périmètre** par décision produit du 2026-05-24 (pas de lien avec la
planification/séances de natation). Conservés pour mémoire, non priorisés.

---

## 5. Les écarts « tête de gondole » (périmètre actuel, sans lien natation)

1. **GA — déverrouiller/coupler niveau & tier.** C'est le verrou *pratique* d'un
   plan « niveau mondial ». Le contenu élite **existe** ; il faut juste qu'il soit
   servi. Deux gestes : (a) **coupler ou alerter** quand `performance_tier ≥ national`
   mais `practice_level ≠ advanced` (sinon « elite au barème, intermediate aux
   exos ») ; (b) résoudre l'**incohérence KPI↔prescription** (on mesure la traction
   *lestée*, on prescrit la traction *au poids du corps* hors `advanced`).
2. **GB — l'angle puissance haut du corps.** Le prédicteur sprint le plus fort est
   sous-pondéré (`upper_power: 0.5`) et le seau est mince. Remonter l'emphasis du
   template `sprint_50` et étoffer le pool d'explosif tirant/poussant.
3. **GC — l'autorégulation.** Charges déterministes ; aucune boucle vitesse/effort.
   Modernisation *swim-independent* alignée sur la pratique élite (VBT).

> **Hors périmètre actuel** : le couplage au macrocycle natation serait, dans
> l'absolu, le levier le plus différenciant — mais il relève du lien muscu ↔
> natation écarté par décision produit du 2026-05-24.

---

## 6. Sources (recherche)

- [Frontiers — Elite Swimmers' Training Patterns, cohorte 20 ans (périodisation, pics 20/6 sem)](https://www.frontiersin.org/journals/physiology/articles/10.3389/fphys.2019.00363/full)
- [Frontiers — Network meta-analysis modalités d'entraînement (combiné eau+force = meilleur sur 100 m)](https://www.frontiersin.org/journals/physiology/articles/10.3389/fphys.2025.1636595/full)
- [S&C coachs HN FR sprint — pratiques & paramètres chiffrés (PMC10811196)](https://pmc.ncbi.nlm.nih.gov/articles/PMC10811196/)
- [Strength & Power Predictors of Swimming Starts in International Sprinters (back squat 1RM r=−0,74)](https://pubmed.ncbi.nlm.nih.gov/20664366/)
- [Upper-body muscular power & 50 m freestyle (r ≈ −0,86) (PMC12852417)](https://pmc.ncbi.nlm.nih.gov/articles/PMC12852417/)
- [Dryland strength/power associations — bench & lat pull-down vs 100 m (PMC3588897)](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC3588897/)
- [Paralympic — lat pull-down power = test à sec le plus corrélé (PMC11054501)](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC11054501/)
- [Maximal strength vs vertical jump training, splits sprint (PubMed 31985714)](https://pubmed.ncbi.nlm.nih.gov/31985714/)
- [Load-velocity profiling vs paramètres 100/200 m (rL0 r=0,63) (PMC10757606)](https://pmc.ncbi.nlm.nih.gov/articles/PMC10757606/)
- [Delayed effect of dry-land strength (timing 12 h) (PMC10366873)](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC10366873/)
- [Dryland for sprint freestyle — programmation](https://www.yourswimlog.com/sprint-freestyle-dryland/)
- [Plyométrie & départs explosifs (SwimSwam)](https://swimswam.com/plyometric-exercises-swimmers-explosive-starts/)
- [Low energy availability / RED-S chez l'athlète masculin (PMC6843850)](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC6843850/)

---

## 7. Méthode

- **Recherche externe** : WebSearch + WebFetch (mai 2026) sur la littérature et les
  pratiques S&C en sprint natation masculin, croisée et synthétisée ci-dessus.
- **Cartographie du moteur** : lecture seule de `mesocycleEngine.ts`,
  `mesocycleEngine.types.ts`, `periodizationCycles.ts`, `kpiBaremes.ts`,
  `strength-mesocycles.ts`, `MesocycleGeneration.tsx`, `MesocyclePreview.tsx`.
- **Vérification en base prod** (MCP Supabase, projet `fscnobivsgornxdwqwlk`,
  2026-05-25) : contenu de `dim_exercices` (buckets/niveaux/`is_core`/colonnes de
  charge) et `strength_periodization_templates` (structure + `bucket_emphasis` par
  event_group). **Cette vérification DB a corrigé une conclusion erronée** d'un
  premier passage (« pas d'haltéro / force_max faible ») : les exos élite et les
  charges de vraie force max **existent** ; le verrou est ailleurs (GA).
- **Vérification ligne à ligne** : chaque fait code des §3-4 confirmé par lecture
  directe (`fichier:ligne`) ou requête SQL. Les écarts sont *factuels*.

> **Limite de portée** : EAC est un club ; sa population réelle de 100 NL masculins
> est probablement régionale/nationale, pas « mondiale ». Les écarts sont mesurés
> contre la *méthodologie élite* comme référence ; leur priorité pour l'app doit
> être pondérée par la population réellement servie. GA (déverrouillage niveau/tier)
> reste pertinent dès qu'un nageur en filière performance utilise l'outil.
