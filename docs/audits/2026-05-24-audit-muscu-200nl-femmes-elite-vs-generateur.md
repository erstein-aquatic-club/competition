# Audit — Musculation des nageuses élite du 200 m NL vs générateur de mésocycle — 2026-05-24

*Travail de recherche (méthodes d'entraînement musculation des meilleures
nageuses mondiales sur 200 m nage libre) croisé en lecture seule avec le
comportement réel du générateur de planification de l'app
(`mesocycleEngine.ts`, barèmes KPI, templates de périodisation). Aucune
modification de code. Tous les faits code sont vérifiés avec `fichier:ligne`.*

## Synthèse exécutive

**État global** : 🟠 — Le générateur a des **fondations justes** pour une 200 NL
féminine (les bons KPI prédictifs, une périodisation par blocs cohérente, une
emphasis épreuve-spécifique), mais reste **calibré pour un·e adolescent·e en
développement** (barèmes 13-18 ans, population scolaire) et **aveugle au
macrocycle natation**. Pour servir une nageuse de **haut niveau adulte**, c'est
le verrou principal.

- **Écarts élevés** 🔴 : **1** (calibration jeunesse)
- **Écarts moyens** 🟠 : **3** (niveau figé ; pas d'autorégulation ; angle mort RED-S/féminin)
- **Écarts faibles** 🟡 : **2** (1 exo/bucket sans rotation ; bloc puissance un peu lourd)
- **Hors périmètre** ⚪ (décision produit 2026-05-24, voir §1) : **2** (couplage macrocycle natation ; transfert eau)
- **Alignements confirmés** ✅ : **5**

**3 recommandations prioritaires** (périmètre actuel, sans lien natation)

1. **Dé-jeunifier le moteur (G1 + G3).** Lever le plafond d'âge / ajouter des
   normes adultes (`kpiBaremes.ts` plafonne à `'17-18'`, population scolaire) et
   débrider le niveau athlète figé `"intermediate"`. Tant que ces deux hypothèses
   tiennent, une nageuse adulte de haut niveau « passe le plafond » sur tous les
   KPI → la priorisation des seaux s'effondre, et elle ne reçoit jamais les exos
   `advanced`. C'est le verrou dont dépend le reste.
2. **Ouvrir un angle féminin au-delà des normes par sexe (G5).** Intégrer un
   marqueur de **disponibilité énergétique / RED-S** (risque n°1 documenté chez
   les nageuses de demi-fond). La périodisation menstruelle, elle, reste
   *scientifiquement débattue* → à traiter en option prudente, pas en défaut.
3. **Introduire de l'autorégulation (G4).** RPE/RIR ou %1RM réel piloté plutôt
   que des charges 100 % déterministes (puissance = force−15 %, pic = force×0,6).
   Modernisation entièrement *swim-independent*.

---

## 1. Cadrage

Les « meilleures nageuses mondiales » du 200 NL (≈ 1:52–1:57) sont des
**adultes de 20-28 ans, entraînées depuis 10+ ans**. Le 200 NL féminin est une
épreuve **mixte aéro/anaérobie** : trop longue pour du pur sprint, trop courte
pour du vrai demi-fond.

Le moteur de génération, lui, repose sur une hypothèse implicite « **jeune en
formation** » (barèmes 13-18 ans). La plupart des écarts ci-dessous découlent de
ce décalage de population de référence.

**Décision de périmètre (2026-05-24)** : le module musculation doit rester
**indépendant de la planification et des séances de natation** pour l'instant.
Les écarts qui supposeraient un tel lien — **G2** (couplage macrocycle natation /
charge bassin) et **G6** (transfert eau) — sont donc documentés pour mémoire mais
classés **hors périmètre** ⚪ et non priorisés. Toutes les recommandations de §0
sont *swim-independent*.

---

## 2. Benchmark — méthodes d'entraînement musculation (200 NL féminin élite)

| Axe | Pratique élite / littérature |
|---|---|
| **Nature de l'épreuve** | Mixte aéro/anaéro → besoin de **force max + puissance ET endurance-force**, mais la force max **transfère mieux** que l'endurance musculaire (gains 25/50 m en 3 sem) → prioriser force/puissance, l'endurance-force n'est qu'un complément. |
| **Périodisation** | Macrocycle calé sur la saison natation, 2-4 périodes : prépa générale (hypertrophie/adaptation anatomique + gainage) → **force max** → **conversion puissance** → vitesse/affûtage. Pics de charge dryland typiquement **~20 et ~6 sem** avant la perf cible. |
| **Fréquence/volume** | ≥ 3 séances/sem (83 % des coachs FR HN), ~20-25 % du temps d'entraînement hebdo (≥ 3 h). |
| **Paramètres chiffrés** (coachs FR HN sprint) | Force max : **3-4 × 3-4 @ ~89 % 1RM**, ~3 min récup. Puissance : **3-4 × 6-7 @ ~59 % 1RM**, ~2,5 min récup. |
| **Exercices** | Top 3 = **gainage/tronc (qualité n°1), développé couché, squat** ; + hip hinge, tractions/tirage haut ; pliométrie bas du corps pour départs/virages (50 %) ; haut du corps > bas (58 %). |
| **KPI dryland prédictifs *chez la femme*** | Somme **traction lestée + vitesse back squat + hauteur CMJ** → **r = −0,86** avec le temps de sprint (traction lestée r=−0,66 ; vitesse squat r=−0,67 ; CMJ r=−0,75). ⚠️ Mais d'autres travaux montrent que les tests dryland **ne prédisent pas** les points World Aquatics → ne pas surinterpréter. |
| **Transfert eau** | Plaquettes, élastiques, nage résistée/assistée, overspeed, tethered. |
| **Autorégulation / VBT** | ~38 % des coachs FR HN utilisent des mesures force-vitesse (Gymaware, MyJump) — VBT encore minoritaire mais c'est la tendance. |
| **Timing dryland↔bassin** | Une séance de force (charge modérée) **12 h avant** un 100 m n'altère pas la perf (avec nuit de sommeil) ; léger −4,4 % au lancer med-ball après force max → prudence sur le **haut du corps proche compétition**. |
| **Spécificités féminines** | En pratique : **aucune** différenciation par sexe chez les coachs. Science : force possiblement supérieure en phase folliculaire (bénéfice de la périodisation menstruelle **débattu**) ; surtout enjeu **RED-S / disponibilité énergétique** (≥ 45 kcal/kg MM/j ; < 30 = dysfonction reproductive) et lien troubles menstruels ↔ blessures. |
| **Prévention** | Épaule++ (swimmer's shoulder), mobilité quotidienne intégrée à chaque phase. |

Sources complètes en §6.

---

## 3. Ce que le générateur fait DÉJÀ bien pour une 200 NL féminine ✅

| Point fort | Preuve |
|---|---|
| **Les bons KPI** | Le moteur suit `weighted_pullup`, `vertical_jump` (CMJ→puissance via Sayers), `broad_jump`, `imtp`, `medball_vertical_throw` — soit **exactement** les prédicteurs validés *chez la femme*. Ancrage scientifique solide. |
| **Périodisation 200m cohérente** | Template `200m` « Force-endurance mixte » : `prepa_generale (endurance) → force_max → puissance → affutage → pic` (`supabase/migrations/00169_strength_periodization_templates_seed.sql:41-47`). Conforme à la nature mixte de l'épreuve. |
| **Emphasis épreuve-spécifique** | 200m = `upper_strength:0.9` dominant, puis `upper_power:0.8, lower_power:0.75, lower_strength:0.7, mobility:0.6` (`00169:48`) → cohérent avec la dominance du haut du corps / volume de tirage en crawl. |
| **Sécurité** | Override douleur/dysfonction → mobilité prioritaire ; substitution/exclusion des exercices contre-indiqués. Dépasse la plupart des générateurs grand public. |
| **Normalisation par sexe** | Barèmes F/M séparés par bande d'âge (méthodo correcte ; ex. `broad_jump 17-18` F vs M dans `kpiBaremes.ts`). |

---

## 4. Écarts, par ordre d'impact

| # | Écart | Méthode élite | Ce que fait le moteur (preuve) | Gravité |
|---|---|---|---|---|
| **G1** | **Plafond 18 ans / barèmes scolaires** | Athlètes adultes, normes de haut niveau | `AgeBand = '13-14' \| '15-16' \| '17-18'` (`src/lib/strength/kpiBaremes.ts:62`), normes « Pediatrics, 736 jeunes 13-18 ans, population scolaire » (`kpiBaremes.ts:87`). Pour une senior, les scores **saturent → la priorisation `emphasis × (100 − score)` s'effondre** → plan dégénéré. | 🔴 Élevé |
| **G2** | **Zéro couplage au macrocycle natation** | Pics de charge dryland ~20 et ~6 sem avant la cible ; lourd planifié vs charge bassin (règle des 12 h, prudence haut du corps près des courses) | Aucune entrée macrocycle / dates / charge bassin dans `MesocycleInput`. Seul proxy : `template.kind` (`season` vs `inter_competition`). | ⚪ Hors périmètre\* |
| **G3** | **Niveau athlète figé `"intermediate"`** | Programmation très différente selon l'âge d'entraînement | `level: "intermediate"` codé en dur (`src/pages/MesocyclePreview.tsx:304`) → le filtre catalogue est toujours intermédiaire ; les exos taggés `advanced` ne sont jamais servis, quel que soit le niveau réel. | 🟠 Moyen |
| **G4** | **Pas d'autorégulation (RPE/RIR/VBT)** | Tendance élite = VBT (Gymaware, MyJump), ajustement selon fatigue/récup | %1RM **fixe et déterministe** : `puissance` = force−15 % ; `pic` = force×0,6 (`src/lib/strength/periodizationCycles.ts:104-165`). Aucune boucle de feedback d'effort, aucun ajustement en cours de plan (`mesocycleEngine.ts`). | 🟠 Moyen |
| **G5** | **Aucune dimension RED-S / cycle menstruel** | RED-S = risque féminin majeur ; statut menstruel suivi par certains | Seule différenciation féminine = normalisation des scores. Le questionnaire capte douleur + psycho (confiance/motivation/stress), **rien sur la disponibilité énergétique ou le cycle**. | 🟠 Moyen |
| **G6** | **Pas de transfert eau** | Plaquettes, élastiques, nage résistée/assistée, overspeed, Vasa/swim bench | Musculation **à sec uniquement** ; aucun branchement sur le planning natation en eau. | ⚪ Hors périmètre\* |
| **G7** | **1 exercice par bucket, pas de rotation** | Pool d'exercices varié sur le mésocycle | Sélection unique par seau (`isCore` puis niveau décroissant, `mesocycleEngine.ts:399-405`) → les mêmes lifts reviennent sur 7-18 sem (monotonie). | 🟡 Faible |
| **G8** | **Bloc puissance un peu « lourd »** | Puissance élite ≈ 6-7 reps @ ~59 % 1RM, vitesse pure | App = 3-6 reps @ **60-80 %** (`periodizationCycles.ts:110-112`) → plutôt « force-vitesse » ; pliométrie/overspeed pas dédiée bien que le bucket `*_power` existe. | 🟡 Faible |

\* **G2 et G6 — hors périmètre** par décision produit du 2026-05-24 : pas de lien
avec la planification ni les séances de natation pour l'instant (cf. §1).
Conservés pour mémoire, non priorisés.

---

## 5. Les écarts « tête de gondole » (périmètre actuel, sans lien natation)

1. **G1 + G3 — la dé-jeunification du moteur.** C'est le verrou. Tant que les
   barèmes plafonnent à 18 ans sur des normes scolaires (G1) et que le niveau
   reste figé `"intermediate"` (G3), le moteur ne peut pas *discriminer les
   qualités* d'une nageuse adulte de haut niveau : elle « passe le plafond »
   partout, donc `prioritizeBuckets` (qui pondère `emphasis × (100 − score)`) ne
   sait plus quoi cibler, et elle ne reçoit jamais les exos `advanced`. Tout le
   reste en dépend.
2. **G5 — l'angle mort féminin.** Au-delà des normes par sexe, rien sur RED-S /
   disponibilité énergétique — pourtant le risque n°1 documenté chez les
   nageuses de demi-fond. (La périodisation menstruelle reste *débattue*
   scientifiquement → à traiter avec prudence / en option, pas en défaut.)
3. **G4 — l'absence d'autorégulation.** Charges 100 % déterministes ; aucun
   RPE/RIR ni ajustement selon la fatigue. Levier de modernisation entièrement
   *swim-independent*.

> **Hors périmètre actuel** : le couplage au macrocycle natation (G2) serait,
> dans l'absolu, le levier le plus différenciant — mais il relève du lien
> muscu ↔ natation écarté par décision produit du 2026-05-24 (cf. §1).

---

## 6. Sources (recherche)

- [Frontiers — Elite Swimmers' Training Patterns, 20-yr cohort (périodisation, pics 20/6 sem)](https://www.frontiersin.org/journals/physiology/articles/10.3389/fphys.2019.00363/full)
- [S&C coachs FR sprint HN — pratiques & paramètres chiffrés (PMC10811196)](https://pmc.ncbi.nlm.nih.gov/articles/PMC10811196/)
- [Swimming Science — Step-by-step dryland periodization](https://www.swimmingscience.net/dryland-periodiziation-swimmers/)
- [Delayed Effect of Dry-Land Strength Training (timing 12 h, PMC10366873)](https://pmc.ncbi.nlm.nih.gov/articles/PMC10366873/)
- [Strength/power vs sprint freestyle, corrélations *femmes* D1 (JSR PDF)](https://cdn.ymaws.com/swimmingcoach.org/resource/resmgr/swimresearch/JSR_Volume_26-_Kao_-_Manuscr.pdf)
- [Dryland for sprint freestyle — programmation](https://www.yourswimlog.com/sprint-freestyle-dryland/)
- [How to drop 10s in the 200 free (nature mixte)](https://blog.myswimpro.com/2022/08/22/how-to-drop-10-seconds-in-the-200-freestyle/)
- [Cycle menstruel & ajustement coachs natation (PMC9924511)](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC9924511/)
- [RED-S & natation / triade de l'athlète féminine (PMC9737121)](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC9737121/)
- [Tests dryland ≠ prédicteurs des points World Aquatics (PMC11053844)](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC11053844/)

---

## 7. Méthode

- **Recherche externe** : WebSearch + WebFetch (mai 2026) sur la littérature et
  les pratiques S&C en natation, croisée et synthétisée ci-dessus.
- **Cartographie du moteur** : exploration lecture seule de
  `src/lib/strength/mesocycleEngine.ts`, `mesocycleEngine.types.ts`,
  `periodizationCycles.ts`, `kpiBaremes.ts`, `src/lib/api/strength-mesocycles.ts`,
  `src/pages/MesocycleGeneration.tsx`, `src/pages/MesocyclePreview.tsx`, et
  `supabase/migrations/00169_strength_periodization_templates_seed.sql`.
- **Vérification** : chaque fait code des §3-4 a été confirmé par lecture
  directe du fichier référencé (`fichier:ligne`). Les écarts sont *factuels*
  (ce que le code fait / ne fait pas), pas spéculatifs.

> **Limite de portée** : EAC est un club ; sa population réelle de 200 NL
> féminines est probablement jeune/régionale, pas « mondiale ». Les écarts sont
> mesurés contre la *méthodologie élite* comme référence ; leur priorité pour
> l'app doit être pondérée par la population réellement servie. G1 (normes
> adultes) reste pertinent dès qu'une nageuse senior ou en filière performance
> utilise l'outil ; G2 (macrocycle) est écarté par décision de périmètre du
> 2026-05-24 (pas de lien natation).
