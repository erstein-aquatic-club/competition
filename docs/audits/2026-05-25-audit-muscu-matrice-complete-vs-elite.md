# Audit — Matrice complète muscu (sexe × distance × nage) + modulations vs très haut niveau — 2026-05-25

*Audit de cohérence du générateur de mésocycle muscu (§305) sur **toute la matrice
sexe × distance × nage**, et de la **logique de modulation** (douleurs + KPI).
Lecture seule, aucune modification de code. Tous les faits code/DB sont vérifiés
(`fichier:ligne` ou requête SQL prod, projet `fscnobivsgornxdwqwlk`, 2026-05-25).
Recherche externe (WebSearch/WebFetch, sources datées) sur les méthodes dryland
de l'élite mondiale par nage/distance/sexe.*

> **C'est la porte de validation de §305.** La taxonomie nage × distance a été
> déployée **sans validation coach des barèmes de-novo**. Les deux cibles
> prioritaires — **le 100 m et le PAPILLON** (calibrés sans template historique) —
> reçoivent ici un **verdict explicite** (§2 et §5).
>
> **Antériorité étendue, non refaite** : les audits 100 m NL H (2026-05-25) et
> 200 m NL F (2026-05-24) traitent le crawl sprint/demi-fond. Cet audit **étend**
> à papillon/dos/brasse/4 nages/fond, à la dimension sexe, et à la modulation.
> Les écarts génériques déjà documentés (autorégulation/VBT, 1 exo/seau,
> dé-jeunification §303/§304) sont **crédités en report**, pas re-litigés.

---

## 1. Synthèse exécutive

**État global** : 🟢🟠 — La **mécanique de composition est saine et vérifiable** :
`bucket_emphasis[b] = clamp01(round2(distance.emphasis[b] × stroke.mult[b]))`
(`composeTemplate.ts:42`). La **calibration des nages historiques est exacte**
(crawl/dos/brasse/4 nages × 200 m reproduisent **au bit près** les anciens
templates — preuve SQL §3). Le **traitement du sexe est conforme à la littérature**
(emphasis non différenciée par sexe, seuls les **barèmes KPI** le sont). Mais
**deux surfaces de-novo non historiquement validées** sortent fragiles : la
**signature papillon** (upper_power et mobilité sous-pondérées) et — moins grave —
la **collapse du fond** (800/1500 servis avec le profil 400 m). Côté modulation :
le **scaffold sécurité est solide**, sauf **un trou pour la brasse** (la douleur
adducteurs/aine, blessure-signature, **n'est pas déclarable** alors que la brasse
porte l'emphasis jambes le plus élevé de la matrice).

| Gravité | Nb | Écarts |
|---|---|---|
| 🔴 Élevé | **1** | Brasse : douleur **adducteurs/aine non déclarable** (zone absente du body-map) × emphasis jambes max (LS/LP clampés à 1.0) → la modulation peut charger une aine blessée |
| 🟠 Moyen | **5** | Papillon `upper_power` sous-pondéré (de-novo) ; papillon `mobility` sous-pondérée (de-novo) ; dos `lower_strength` ×0.857 non étayé ; **fond 800/1500 servi en profil 400 m** (régression vs ancien template demi-fond) ; **pas de seau tronc/core** (ondulation/rotation/streamline sous-modélisés) |
| 🟡 Faible | **6** | 100 m de-novo crédible mais `upper_power` nudge possible ; dos `upper_power` ×1.125 peu étayé ; signatures nages appliquées hors 200 m = extrapolation ; emphasis season=inter-comp aplati ; `right_calf` absent du body-map ; douleur légère (intensité 1) exclut déjà tous les exos de la zone |
| ⚪ Hors périmètre | **2** | Couplage macrocycle natation ; transfert eau (décision produit 2026-05-24) |
| ✅ Alignements | **9** | cf. §3 |

**Verdict des deux cibles de-novo prioritaires (la porte §305)**

- **100 m — ✅ VALIDÉ (risque faible).** Interpolation 50↔200 cohérente,
  arc sprint-leaning conservant `force_max` + conversion puissance + affûtage
  court. **Aucun blocage.** Nudge optionnel : `upper_power` 0.60 → ~0.65.
- **PAPILLON — 🟠 PARTIELLEMENT INVALIDÉ (à réviser avant confiance).**
  `upper_power` (×1.05 → 0.53–0.63 au 50/100) **trop bas** pour la nage au tirage
  le plus balistique ; `mobility` (×1.15) **trop basse** vu la charge
  épaule + rachis thoracique + lombaire + cheville la plus élevée des nages.
  Ce sont exactement les valeurs que `00193` signalait « à valider coach ».

**3 recommandations prioritaires** (swim-independent ; les 2 premières = 1 ligne
`UPDATE` sur les 2 tables §305)

1. **Réviser la signature papillon** (`strength_stroke_signatures`, 00193) :
   `upper_power` ×1.05 → **~1.35**, `mobility` ×1.15 → **~1.35** (option
   `upper_strength` ×1.0 → 1.05). Résout la cible de-novo n°1.
2. **Ajouter une zone douleur « adducteurs/aine »** au body-map (+ taguer les
   exos adducteurs/coup de pied brasse) — ferme le trou sécurité 🔴 de la brasse.
3. **Re-examiner `lower_strength` du dos** (×0.857 → ~0.95–1.0) : la réduction
   n'est pas étayée (coup de pied dauphin au mur + départs explosifs).

---

## 2. Matrice de couverture — sexe × distance × nage

L'emphasis ci-dessous est **calculée** par la formule live (`composeTemplate.ts:42`)
à partir des valeurs **lues en base** (`strength_stroke_signatures` /
`strength_distance_profiles`, SQL 2026-05-25). Format : **LS / LP / US / UP / MOB**
(lower_strength, lower_power, upper_strength, upper_power, mobility).

> **Sexe** : la matrice **ne dépend PAS du sexe** — `composeTemplate` ne prend que
> (distance, nage, kind) (`composeTemplate.ts:36-55`). Seuls les **barèmes KPI**
> sont sexués (`kpiBaremes.ts`). C'est **conforme à l'élite** (cf. §4-D : les
> prédicteurs dryland sont les mêmes H/F ; on normalise le score, on ne change pas
> l'emphasis). ✅ Les notes de cohérence valent donc H **et** F.

| Nage \ Distance | 50 | 100 *(de-novo)* | 200 | 400 + |
|---|---|---|---|---|
| **Crawl** | .85/.90/1.0/.50/.30 | .82/.85/.97/.60/.42 | .70/.75/.90/.80/.60 | .80/.60/1.0/.65/.80 |
| **Papillon** *(de-novo)* | .85/1.0/1.0/**.53**/**.35** | .82/.98/.97/**.63**/**.48** | .70/.86/.90/.84/.69 | .80/.69/1.0/.68/.92 |
| **Dos** | .73/.84/.94/.56/.40 | .70/.79/.92/.68/.56 | .60/.70/.85/.90/.80 | .69/.56/.94/.73/1.0 |
| **Brasse** | **1.0/1.0**/.61/.38/.40 | **1.0/1.0**/.59/.45/.56 | .85/1.0/.55/.60/.80 | .97/.80/.61/.49/1.0 |
| **4 nages** | .91/.96/.94/.50/.40 | .88/.91/.92/.60/.56 | .75/.80/.85/.80/.80 | .86/.64/.94/.65/1.0 |

**Note de cohérence par cellule** (vs élite mondiale, cf. §4) :

| Nage | 50 | 100 | 200 | 400+ |
|---|---|---|---|---|
| Crawl | ✅ | ✅ | ✅ | 🟡¹ |
| Papillon | 🟠² | 🟠² | 🟢 | 🟢 |
| Dos | 🟠³ | 🟠³ | ✅⁴ | 🟡⁵ |
| Brasse | ✅⁶ | ✅⁶ | ✅⁴ | 🟡⁵ |
| 4 nages | 🟢⁷ | 🟢⁷ | ✅⁴ | 🟢 |

¹ 400+ crawl = ancien template 400 m (✅ pour 400/800) mais le **fond pur 1500**
n'a plus son profil demi-fond (§4-C). ² Papillon de-novo : `upper_power`/`mobility`
sous-pondérés au sprint (§4-A). ³ Dos sprint : `lower_strength` ×0.857 discutable
(§4-B). ⁴ 200 = reproduit le template historique validé (§3). ⁵ Profil fond
collapsé. ⁶ Brasse jambes-dominante : direction correcte (§4-B). ⁷ 50/100 4 nages
ne sont pas des épreuves LCM réelles (100 4N = petit bassin) mais composent.

---

## 3. Calibration — ce qui est vérifié, ce qui est de-novo

**✅ Calibration des nages historiques : EXACTE (preuve SQL).** Les signatures
valent `mult[b] = emphase_nage[b] / crawl_200[b]` (`00193:6`). Composées avec le
profil 200 m, elles **reproduisent au bit près** les anciens templates
(`strength_periodization_templates`, SQL 2026-05-25) :

| Nage × 200 | Composé (calculé) | Template historique (DB) | Match |
|---|---|---|---|
| Dos | .60/.70/.85/.90/.80 | `{LS .6, LP .7, US .85, UP .9, MOB .8}` | ✅ exact |
| Brasse | .85/1.0/.55/.60/.80 | `{LS .85, LP 1.0, US .55, UP .6, MOB .8}` | ✅ exact |
| 4 nages | .75/.80/.85/.80/.80 | `{LS .75, LP .8, US .85, UP .8, MOB .8}` | ✅ exact |
| Crawl × 50 | .85/.90/1.0/.50/.30 | `sprint_50 season` idem | ✅ exact |
| Crawl × 200 | .70/.75/.90/.80/.60 | `200m` idem | ✅ exact |
| Crawl × 400+ | .80/.60/1.0/.65/.80 | `400m` idem | ✅ exact |

**Surface de-novo (jamais validée historiquement)** :

1. **Signature PAPILLON — 100 % de-novo.** Il **n'existait aucun template
   papillon** (event_groups : 200m, 400m, backstroke, breaststroke, distance,
   medley, sprint_50 — pas de butterfly, SQL). `00193:7` le dit (« Papillon =
   de-novo à valider coach »). → §4-A.
2. **Profil 100 m — 100 % de-novo.** Aucun template 100 m/`sprint_100`
   historique. `00194:6-7` : « 100 est de-novo (sprint à pic moins dépouillé +
   force_max retenue) ». → §5.
3. **Signatures nages appliquées hors 200 m = extrapolation** 🟡. Les
   multiplicateurs n'ont été calibrés **qu'au 200 m**. Les appliquer à 50/100/400
   est nouveau (ex. brasse 50/100 : LS et LP **clampés à 1.0**,
   `composeTemplate.ts:31,42`). C'est *plutôt une amélioration* (l'ancien système
   avait **un seul** template brasse, distance-agnostique) mais les valeurs aux
   distances ≠ 200 ne sont pas adossées à un historique.

---

## 4. Volet A — Cohérence vs élite mondiale, par nage / distance / sexe

### A. PAPILLON 🟠 (cible de-novo n°1)

Signature live : `LS ×1.0, LP ×1.15, US ×1.0, UP ×1.05, MOB ×1.15` (SQL `00193:43-44`).

- **`upper_power` trop bas** 🟠. À 0.53 (50) / 0.63 (100), c'est ~la moitié du
  `lower_power`, et **l'ordre par distance est inversé** (50 < 100 < 200) alors
  que le besoin de puissance balistique du tirage est **maximal au sprint**. Le
  papillon est le tirage à deux bras **le plus balistique** de la natation ;
  l'élite (Dressel : hang clean/snatch, clean pulls, med-ball/ballistique) en fait
  le cœur du dryland sprint. Au 50/100, `upper_power` devrait approcher la parité
  avec `lower_power` (~0.9–1.0). → **×1.05 trop faible ; viser ~×1.3–1.5.**
  ([Dressel](https://www.sportskeeda.com/us/olympics/caeleb-dressel-s-workout-training-schedule) ;
  [med-ball RCT 2021](https://pmc.ncbi.nlm.nih.gov/articles/PMC8508303/))
- **`mobility` trop basse** 🟠. 0.35 au 50 fly est faible : le papillon exige la
  **plus grande extension thoracique + ROM épaule** de toutes les nages, et la
  cheville porte > 75 % de la propulsion du dauphin — le besoin de préhab **ne
  rétrécit pas** pour le sprinteur. → **×1.15 trop petit ; viser ~×1.3–1.4.**
  ([USMS butterfly dryland](https://www.usms.org/fitness-and-training/articles-and-videos/articles/dryland-exercises-to-improve-your-butterfly-technique) ;
  [yourswimlog dolphin kick](https://www.yourswimlog.com/develop-awesome-underwater-dolphin-kicking/))
- **`upper_strength` ×1.0 acceptable** ✅ (un léger bump ~×1.05 est raisonnable
  mais non exigé par la littérature).
- **Chaîne postérieure / tronc partiellement capturés.** `lower_power` ×1.15
  capte le drive de hanche ; mais **aucun seau tronc/core** (`EMPHASIS_BUCKETS`,
  `composeTemplate.ts:23-29`) → la qualité la plus papillon-spécifique (raideur
  ondulatoire du tronc) **n'est pas modélisée**. Voir B1, §4-E.
- **Zones blessure** (contre-indication) : **épaule** (~56 % chez les flyers) et
  **rachis lombaire** (33–58 %, hyperextension de l'ondulation — spécifique fly).
  Le `lower_back` est donc une contre-indication **critique en papillon**.
  ([revue lombaire 2024](https://journals.sagepub.com/doi/10.1177/19417381231225213) ;
  [épidémio épaule PMC3435931](https://pmc.ncbi.nlm.nih.gov/articles/PMC3435931/))

### B. DOS & BRASSE

**Dos** — signature `LS ×0.857, LP ×0.933, US ×0.944, UP ×1.125, MOB ×1.333`.
- **`mobility` ×1.333 justifié** ✅ : le dos est la nage de l'**instabilité
  antérieure d'épaule** (« apprehension shoulder », abduction + RE max à l'entrée
  et aux culbutes) — préhab/coiffe = stratégie n°1.
  ([PMC3435931](https://pmc.ncbi.nlm.nih.gov/articles/PMC3435931/) ;
  [Kabat D2 PMC10679734 2023](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC10679734/))
- **`lower_strength` ×0.857 (réduction) discutable** 🟠 : le dos s'appuie
  lourdement sur le **coup de pied dauphin au mur** (up-kick = ischios/fessiers)
  et des **départs explosifs**. Aucune base documentée pour *moins* de force
  jambes que le crawl. **Assomption la plus faible du dos.** → viser ~0.95–1.0.
  ([USMS underwater kick](https://www.usms.org/fitness-and-training/guides/underwater-kick))
- **`upper_power` ×1.125 plausible mais peu étayé** 🟡 (rien ne prouve que le dos
  ait besoin de *plus* d'upper power que le crawl ; les deux sont des nages à axe
  long rotatives).

**Brasse** — signature `LS ×1.214, LP ×1.333, US ×0.611, UP ×0.75, MOB ×1.333`.
- **Jambes-dominantes : direction CORRECTE** ✅. LS/LP clampés à 1.0 au 50/100
  collent à l'élite (Peaty : squat 160 kg, trap-bar 200 kg, pliométrie ; King :
  « leg-heavy »). ~70 % de la propulsion vient des jambes.
  ([USMS King](https://www.usms.org/fitness-and-training/articles-and-videos/articles/breaststroke-tips-from-olympian-lilly-king) ;
  [RSNG Peaty](https://uk.rsng.com/categories/movement-fuel/articles/record-shattering-olympic-gold-swimmer-adam-peaty-reveals-his-powerhouse-gym-routine))
- **`upper_strength` ×0.611 (le plus bas de la matrice) DÉFENDABLE** ✅ : tirage
  court mais puissant → un **plancher** ~0.55–0.61 (pas zéro) est approprié.
- **Trou sécurité adducteurs/aine** 🔴 (cf. Volet B) : la brasse charge le plus
  les jambes, et ses blessures-signature sont le **« breaststroker's knee »**
  (86 % de prévalence, **RR 5,1×**) **et l'élongation adducteurs/aine**. La
  Copenhagen adduction (preuve forte) **existe au catalogue** (`Planche
  Copenhague`, lower_strength intermediate, SQL) mais n'est pas routée comme
  préhab adducteurs, et **la zone aine n'est pas déclarable** (§Volet B).
  ([épidémio PMC3435931](https://pmc.ncbi.nlm.nih.gov/articles/PMC3435931/) ;
  [Copenhagen méta 2025 PMC12363431](https://pmc.ncbi.nlm.nih.gov/articles/PMC12363431/))

### C. 4 NAGES & FOND/DEMI-FOND

**4 nages** — `MOB ×1.333` **justifiée** ✅ (4 nages = le plus de variété de
mouvement → charge préhab max). Le profil « polyvalent » du 200 4N (tout à
0.75–0.85) est **directionnellement correct** (épreuve généraliste). Au 400 4N
(profil `400plus`), faire chuter `lower_power` à 0.64 en gardant `US` 0.94 + `MOB`
1.0 est défendable (épreuve ~4 min, aérobie-dominante) — *léger* bémol : garder
un peu de puissance pour départs/virages/coulées.
([périodisation 400 4N PMC8296310 2021](https://pmc.ncbi.nlm.nih.gov/articles/PMC8296310/))

**Fond — régression 🟠 (vérifiable).** L'ancien template **demi-fond** existait :
`{LS .75, LP .40, UP .45, US 1.0, MOB 1.0}` (DB `distance`). Or **aucune cellule
§305 ne le reproduit** : `distance_key` ne va que jusqu'à `400plus`
(`00194:14`), dont l'emphasis (`LS .8, LP .6, UP .65, US 1.0, MOB .8`) **égale
l'ancien template 400 m**, pas le demi-fond. Donc **800/1500 sont servis avec le
profil 400 m** : trop de puissance (LP .60 vs .40), moins de préhab (MOB .80 vs
1.0). Pour le fond pur, l'élite garde la **force max lourde** (économie) — donc
`US 1.0` reste juste, et **ne pas** charger le travail haute-rep d'« endurance-force »
est correct — mais `LP .60` est trop haut et collapser 400/800/1500 en un seul
profil perd la nuance (un 1500 ~15 min ≠ un 400 ~4 min).
([force lourde endurance PMC3763280](https://pmc.ncbi.nlm.nih.gov/articles/PMC3763280/) ;
[S&R 1500](https://srsport.com/blog/swim-training-for-the-1500-m-freestyle/))

### D. SEXE — ✅ traitement conforme

- **Ne PAS différencier l'emphasis par sexe** : confirmé par l'élite (l'étude
  élite n=58 trouve les **mêmes prédicteurs dryland H/F** ; différences absolues
  s'effacent normalisées à la masse maigre). Le générateur fait exactement ça
  (emphasis non sexuée, barèmes KPI sexués `kpiBaremes.ts`). ✅
  ([prédicteurs élite 2024 PMC11053844](https://pmc.ncbi.nlm.nih.gov/articles/PMC11053844/))
- **Flags sexe (pas des poids différents)** : épaule ~3× plus blessée chez les
  femmes (partiellement contesté) — argument *léger* pour plus de préhab
  scapulaire en dos/4N féminin ; **RED-S/faible disponibilité énergétique** pire
  chez la femme mais réel chez l'homme ; **périodisation menstruelle = DÉBATTUE**
  (méta-analyse 2020 sans effet) → **ne pas l'inscrire en dur**. (Report des
  audits H/F antérieurs — angle disponibilité énergétique toujours absent.)
  ([RED-S PMC9724109](https://pmc.ncbi.nlm.nih.gov/articles/PMC9724109/) ;
  [menstruel débattu](https://mennohenselmans.com/menstrual-cycle-periodization/))

### E. Transversal — pas de seau tronc/core 🟠 (B1)

Les 5 seaux entraînables sont LS/LP/US/UP + mobility (`composeTemplate.ts:23-29`).
Le **tronc** (ondulation papillon/dos, rotation crawl/dos, gainage streamline) n'a
**pas de seau dédié** : il est dispersé dans `upper_strength` (planches, hollow
body, ab wheel) et `lower_strength` (Superman). Conséquence : la qualité la plus
fly/4N-spécifique (raideur transmissive du tronc) n'est pilotable que
**indirectement**. Limitation générateur-wide, plus saillante en papillon/4N.

### ⚪ Hors périmètre (décision produit 2026-05-24)
Couplage macrocycle natation (pics ~20/~6 sem) et transfert eau — conservés pour
mémoire, non priorisés.

---

## 5. Verdict 100 m (cible de-novo n°2) — ✅ VALIDÉ

Profil 100 m de-novo : `LS .82, LP .85, US .97, UP .60, MOB .42` (SQL `00194:49-56`).

- **Interpolation 50↔200 cohérente** ✅. Chaque seau tombe entre le 50 et le 200
  (ex. UP : 0.50 → **0.60** → 0.80 ; MOB : 0.30 → **0.42** → 0.60), leaning sprint
  — conforme à un 100 « sprint long » (départ/15 m alactique + nage glycolytique,
  cf. audit 100 NL H 2026-05-25, déjà ✅ sur les fondamentaux).
- **Arc crédible** : `prepa_generale → force_max → puissance → maintien →
  affutage → pic` (`00194:51`) — bloc force max retenu + conversion puissance
  complète + affûtage court + pic SNC. Pas de cul-de-sac.
- **Nudge optionnel 🟡** : `upper_power` 0.60 → ~0.65 (le 100 soutient la
  puissance plus longtemps que le 50). Non bloquant.
- **Attention héritage** : le **100 de chaque nage** hérite des défauts de la
  *signature* (ex. **100 papillon** = profil 100 × signature fly → hérite du
  `upper_power` bas du §4-A). Valider le 100 ne dispense pas de réviser le
  papillon.

---

## 6. Volet B — Modulations (douleurs + KPI)

### B-1. Douleurs — scaffold solide, **un trou brasse** 🔴

- **Override sécurité correct** ✅ : douleur intense (`intensity ≥ 3`) **ou**
  dysfonction de mouvement (sous-score = 0) → `mobility` forcée rang 1, autres
  seaux décalés (`mesocycleEngine.ts:170-189, 235-245`). Réaction ni sur- ni
  sous-dimensionnée.
- **Contre-indication = toute douleur ≥ 1** : `selectExercises` filtre sur
  `painZones` = **toutes** les entrées douleur, pas seulement ≥ 3
  (`mesocycleEngine.ts:565-566` → `382-383`). Donc une douleur **légère
  (intensité 1)** exclut déjà *tous* les exos touchant la zone, sans forcer la
  mobilité 🟡 — réponse graduée raisonnable, mais potentiellement sur-réactive sur
  la sélection (un simple inconfort vide un seau).
- **Substitution crue mais saine** ✅/🟡 : un core contre-indiqué est remplacé par
  le **premier non-core sûr du même seau** (`mesocycleEngine.ts:413-423`) — même
  seau, sûr, mais **pas apparié au pattern moteur**. Acceptable (priorité =
  innocuité).
- **Couverture catalogue des zones** (SQL `dim_exercices`) : épaule 43/côté,
  `lower_back` 34, genou 22, cheville 16, coude 16, poignet 13, hanche 12,
  `left_calf` 5, `neck` 3, `upper_back` 1. **Épaule/dos/genou bien couverts.** ✅
- **🔴 Trou n°1 — zone adducteurs/aine absente.** Le body-map a 16 zones (L/R
  épaule, coude, poignet, hanche, genou, cheville + nuque, dos haut, lombaires,
  `left_calf`) (`BodySvg.tsx:18-37`). **Aucune zone aine/adducteurs, ni
  pectoraux, ni ischios.** Un brasseur avec élongation adducteurs (blessure-
  signature) ne peut déclarer que `hanche` ou `genou`. Combiné à l'emphasis jambes
  **max** de la brasse (LS/LP clampés à 1.0), la modulation peut **charger une
  aine blessée** sans frein. C'est l'unique interaction où le seau le plus
  pondéré coïncide avec une blessure **non modélisable**.
- **🟡 Asymétrie `right_calf`** : le body-map n'a que `left_calf`
  (`BodySvg.tsx:36`) et `dim_exercices` n'utilise aussi que `left_calf` (SQL) →
  un mollet droit n'est ni déclarable ni contre-indiquable. Mineur.

### B-2. KPI mesurés — logique correcte

- **Mapping KPI→seau exact** ✅ (`mesocycleEngine.ts:121-139`) :
  `imtp`→lower_strength, moyenne(`vertical_jump`,`broad_jump`)→lower_power,
  `weighted_pullup`→upper_strength, `medball_vertical_throw`→upper_power,
  `physical_tests`→mobility.
- **Priorisation `emphasis × (100 − score)`** ✅ (`mesocycleEngine.ts:223`) puis
  top-2 = focus (60 % volume), reste = maintien (40 %), mobilité = échauffement
  systématique (`allocateVolume`, `285-342`). Un KPI faible déplace bien le
  volume vers le bon seau, **pondéré par l'épreuve**.
- **KPI manquant = score 0 (conservateur)** ✅ raisonnable
  (`mesocycleEngine.ts:222`) — mais un KPI absent dans un **seau à forte
  emphasis** domine la priorisation (emphasis × 100). Atténué par
  `data_confidence` (`computeDataConfidence:928-944`) qui signale low/partial/full.
- **Discrimination élite** ✅ (§303/§304) : `shiftAnchors` décale les ancres de
  `k×étendue` (élite k=0.5, `kpiBaremes.ts:76-95`) et `kpiScore` **extrapole
  au-delà de p90** (`46-57`) → les profils élite restent discriminables (ex.
  traction lestée H élite p50 ≈ +30 kg). La bande `adulte` réutilise `17-18`
  (`kpiBaremes.ts:301-312`) décalée — crédible pour un adulte élite.
- **Fiabilité par barème (§301)** ✅ prise en compte : `medball_vertical_throw`
  est **placeholder** (`kpiBaremes.ts:262`), donc le score `upper_power` est le
  moins fiable ; `computeLowestBaremeConfidence` (`947-962`) le remonte à
  l'aperçu. 🟡 À garder en tête vu que §4-A propose de **monter** `upper_power`
  en papillon : on muscle un seau dont le KPI est le plus incertain.
- **⚠️ Caveat transversal** : la littérature note que les **tests dryland prédisent
  mal** le résultat en bassin (valeur prédictive « négligeable » sur une cohorte
  élite) → traiter les scores KPI comme des **priors**, pas des cibles dures.
  ([PMC11053844 2024](https://pmc.ncbi.nlm.nih.gov/articles/PMC11053844/))

### B-3. Interaction A × B — part bien de l'épreuve, sauf le trou brasse

La modulation démarre **bien** de l'emphasis épreuve-spécifique (A), puisque la
priorité = `emphasis(A) × (100 − score)` (`mesocycleEngine.ts:223`). Exemples :

- **Brasseur `imtp` faible + douleur épaule** : `lower_strength` (emphasis 1.0
  brasse) priorisé → cohérent (brasse jambes-dominante) ; épaule ≥ 3 → mobilité
  forcée #1 + exos épaule exclus. **Plan cohérent** ✅.
- **Brasseur douleur adducteurs/aine** : **non déclarable** → ni override, ni
  contre-indication → le travail jambes (emphasis max) procède sur une aine
  blessée. **Échec A×B** 🔴 — c'est la traduction concrète du trou B-1.

---

## 7. Recommandations priorisées (swim-independent)

| # | Action | Cible | Effort | Valide/invalide |
|---|---|---|---|---|
| **R1** | **Réviser signature papillon** : `upper_power` ×1.05→~1.35, `mobility` ×1.15→~1.35 (opt. `upper_strength` ×1.0→1.05) | `strength_stroke_signatures` (00193) | 1 `UPDATE` | **Invalide** le papillon de-novo actuel → le corrige |
| **R2** | **Ajouter zone « adducteurs/aine »** au body-map + taguer `contraindication_zones` des exos adducteurs/coup de pied ; router `Planche Copenhague` en préhab brasse | `BodySvg.tsx` + `dim_exercices` | Moyen | Ferme le 🔴 brasse |
| **R3** | **Remonter `lower_strength` dos** ×0.857→~0.95–1.0 | `strength_stroke_signatures` (00193) | 1 `UPDATE` | Corrige l'assomption dos la plus faible |
| **R4** | **Profil fond distinct** : rétablir une emphasis demi-fond pour ≥ 800 (LP plus bas, MOB max) — nouvelle `distance_key` ou abaisser `LP` du `400plus` au-delà de 800 | `strength_distance_profiles` (00194) + sélecteur | Moyen | Corrige la régression fond |
| **R5** | **(futur, plus lourd)** Introduire un **seau tronc/core** — sort l'ondulation/rotation/streamline de l'implicite | `composeTemplate` + tables + catalogue | Élevé | Lève B1 |
| **R6** | Nudge optionnel `upper_power` 100 m 0.60→0.65 | 00194 | 1 `UPDATE` | Affine le 100 m (déjà ✅) |
| — | **Report (déjà documenté)** : autorégulation/VBT ; rotation d'exos (1/seau) ; angle disponibilité énergétique/RED-S | — | — | cf. audits 100 NL H / 200 NL F |

**Ce qui valide / invalide les barèmes de-novo (la porte §305)** :
- **100 m → VALIDÉ** : déployable tel quel ; R6 cosmétique.
- **Papillon → À RÉVISER** avant confiance : R1 est le correctif minimal
  (1 ligne SQL sur `strength_stroke_signatures`). Tant que non fait, un papillon
  sprint reçoit un dryland sous-balistique du haut du corps et sous-mobilité.

---

## 8. Sources (recherche externe, mai 2026)

**Papillon** · [USMS butterfly dryland](https://www.usms.org/fitness-and-training/articles-and-videos/articles/dryland-exercises-to-improve-your-butterfly-technique) · [SwimSwam dolphin-kick](https://swimswam.com/dryland-exercises-dolphin-kick/) · [BridgeAthletic ondulation 2016](https://blog.bridgeathletic.com/swim-dryland-building-blocks-butterfly-full-body-engagement) · [Dressel training](https://www.sportskeeda.com/us/olympics/caeleb-dressel-s-workout-training-schedule) · [revue lombaire fly 2024](https://journals.sagepub.com/doi/10.1177/19417381231225213) · [dolphin kick cheville](https://www.yourswimlog.com/develop-awesome-underwater-dolphin-kicking/)

**Dos & brasse** · [épaule par nage PMC3435931](https://pmc.ncbi.nlm.nih.gov/articles/PMC3435931/) · [Kabat D2 dos PMC10679734 2023](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC10679734/) · [USMS underwater kick](https://www.usms.org/fitness-and-training/guides/underwater-kick) · [USMS King brasse](https://www.usms.org/fitness-and-training/articles-and-videos/articles/breaststroke-tips-from-olympian-lilly-king) · [RSNG Peaty](https://uk.rsng.com/categories/movement-fuel/articles/record-shattering-olympic-gold-swimmer-adam-peaty-reveals-his-powerhouse-gym-routine) · [Copenhagen méta 2025 PMC12363431](https://pmc.ncbi.nlm.nih.gov/articles/PMC12363431/)

**4 nages / fond / sexe** · [périodisation 400 4N PMC8296310 2021](https://pmc.ncbi.nlm.nih.gov/articles/PMC8296310/) · [force lourde endurance PMC3763280](https://pmc.ncbi.nlm.nih.gov/articles/PMC3763280/) · [S&R 1500](https://srsport.com/blog/swim-training-for-the-1500-m-freestyle/) · [prédicteurs dryland élite H/F 2024 PMC11053844](https://pmc.ncbi.nlm.nih.gov/articles/PMC11053844/) · [RED-S femme PMC9724109](https://pmc.ncbi.nlm.nih.gov/articles/PMC9724109/) · [périodisation menstruelle débattue](https://mennohenselmans.com/menstrual-cycle-periodization/)

---

## 9. Méthode

- **Recherche externe** : WebSearch + WebFetch (mai 2026), 3 streams parallèles
  (papillon ; dos + brasse ; 4 nages + fond + sexe), chaque conclusion adossée à
  une source datée. Couverture explicite du sous-documenté (papillon, dos, brasse,
  4 nages, demi-fond) et de la dimension sexe.
- **Cartographie code (lecture seule)** : `composeTemplate.ts`,
  `mesocycleEngine.ts`, `kpiBaremes.ts`, `periodizationCycles.ts`,
  `strengthProfileMismatch.ts`, `zones.ts`, `BodySvg.tsx` ; migrations
  `00193`/`00194`.
- **Vérification base prod** (MCP Supabase, `fscnobivsgornxdwqwlk`, 2026-05-25) :
  `strength_stroke_signatures`, `strength_distance_profiles`,
  `strength_periodization_templates` (preuve de calibration §3), `dim_exercices`
  (buckets/niveaux/`is_core`/`contraindication_zones`).
- **Emphasis matrice §2** : **calculée** par la formule live
  (`composeTemplate.ts:42`) sur les valeurs lues en base — pas dérivée de mémoire.
  Les valeurs live priment sur les seeds (ex. `sprint_50` season LS 0.85).
- **Garde-fous** : chaque fait code/DB est confirmé par `fichier:ligne` ou SQL ;
  aucune valeur de barème inventée ; les recommandations chiffrées de §4-A/§7 sont
  **directionnelles** (l'élite papillon est inférée — peu d'essais fly-spécifiques).

> **Limite de portée** : EAC est un club ; sa population réelle (jeunes/régionaux)
> n'est pas « mondiale ». Les écarts sont mesurés contre la **méthodologie élite**
> comme référence ; leur priorité doit être pondérée par la population servie. Mais
> **R1 (papillon) et R2 (aine brasse) sont pertinents dès le premier nageur** de
> ces nages, car ce sont des défauts de-novo / de sécurité, pas des raffinements.
