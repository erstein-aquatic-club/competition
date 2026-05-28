# Mésocycle muscu — 100 m brasse · Samuel Nonnenmacher

> **Date** : 2026-05-28 · **Auteur** : coach (François) · **Durée** : 12 semaines · **Fréquence** : 4×/sem
> **Contexte** : pas de séance de calibration possible → KPIs **fictifs** dérivés de mesures de force terrain.
> Ce document a deux usages : (1) les **5 KPIs à saisir** dans le bilan coach de l'app pour générer le mésocycle ;
> (2) un **programme écrit autonome** avec les charges en kg, qui complète la sortie générique du moteur.

---

## 0. Profil de l'athlète

| Paramètre | Valeur |
|---|---|
| Sexe | M |
| Âge | 22 ans (bande barème `adulte` = ancres 17-18) |
| Poids de corps | ~75 kg |
| Niveau (sélection catalogue) | **advanced** |
| Tier (barème KPI) | **national** |
| Épreuve cible | **100 m brasse** (`breaststroke_100`, kind `season`) |
| Statut | Ancien N1, ~**−20 %** vs son meilleur niveau, en reconstruction |

**Mesures de force terrain fournies :**

| Test | Mesure | 1RM estimé |
|---|---|---|
| Développé couché | 90 kg × 2 reps | **~95 kg** (Epley) |
| Trap bar squat | ~70 kg (charge de travail) | **~85 kg** (à recaler S1) |
| Traction lestée | +20 kg @ 80 % | **+25 kg** (total ≈ 100 kg) |
| Box jump | ~120 cm | détente sèche ≈ **50 cm** |

**Lecture coach.** Profil très typé *« nageur N1 désentraîné »* : **dos/tirage solides** (lats), **poussée correcte** (DC 95 kg), mais **force maximale des jambes effondrée** (trap bar 70 kg pour 75 kg de corps) avec une **détente réactive qui tient encore**. Or le 100 brasse est **propulsé par les jambes** (fouet + extension de hanche explosive). → Le levier #1 est la **force max jambes**, le #2 la **puissance jambes**. Le moteur va converger là-dessus tout seul (focus forcé brasse).

---

## 1. KPIs fictifs — à saisir dans le wizard bilan coach

> Saisir ces 5 valeurs dans le bilan KPI de Samuel, puis **générer le mésocycle via l'UI** :
> `100 brasse` / `season` / **12 semaines** / niveau **advanced** / tier **national** / **4 séances** Lun-Mar-Jeu-Ven.
> (La génération en base directe — apply RPC — est bloquée par usurpation JWT : passer par l'écran de génération.)

| # | KPI (`kpi_key`) | **Valeur à saisir** | Unité | Détail de saisie | Score barème (national, M, adulte) |
|---|---|---|---|---|---|
| 1 | `weighted_pullup` (traction lestée) | **25** | kg | charge additionnelle 1RM | **51 / 100** |
| 2 | `imtp` (tirage mi-cuisse) | **100** | kg | charge max 1 rép. | **13 / 100** ⚠️ point faible #1 |
| 3 | `vertical_jump` (détente puissance) | **58,4** | W/kg | poids 75 kg + temps de vol ↔ détente 50 cm | **27 / 100** |
| 4 | `broad_jump` (saut en longueur) | **215** | cm | meilleur essai | **52 / 100** |
| 5 | `medball_vertical_throw` (lancer assis) | **14,4** | kg·m | ballon **3 kg** × **4,8 m** | **72 / 100** |

**Comment les valeurs ont été dérivées :**

- **`weighted_pullup` = 25 kg** — directement son 1RM additionnel (20 kg = 80 % ⇒ 25 kg).
- **`imtp` = 100 kg** — le tirage mi-cuisse (ROM partiel depuis mi-cuisse) se charge ~+40 % vs un trap bar squat complet ⇒ 70 kg → ~100 kg. **Reste très bas** au barème national : c'est voulu, ses jambes sont son déficit.
- **`vertical_jump` = 58,4 W/kg** — un box jump de 120 cm correspond à une détente sèche réelle (sans tuck, comme l'exige le protocole) d'environ **50 cm**. Sayers : `P = 60,7×50 + 45,3×75 − 2055 = 4378 W` → `4378 / 75 = 58,4 W/kg`. (Temps de vol équivalent ≈ 0,64 s.)
- **`broad_jump` = 215 cm** — estimé cohérent avec sa détente verticale réactive.
- **`medball_vertical_throw` = 14,4 kg·m** — son **DC 90 kg×2 n'a aucun KPI dédié** dans l'app (elle ne mesure pas la poussée horizontale/verticale). Le lancer médecine-ball assis EST le test de poussée explosive du haut → on l'aligne sur sa bonne poussée : ballon 3 kg, ~4,8 m ⇒ indice 14,4.

> ⚠️ **Bilan mobilité + questionnaire non réalisés** → `mobility` et `psychology` resteront « non mesurés ». Conséquence moteur : mobilité priorisée par défaut (conservateur) mais elle n'est de toute façon que l'échauffement systématique. **Idéalement, faire passer le screening mobilité plus tard** (épaules/hanches/chevilles — clés en brasse).

---

## 2. Ce que le moteur génère (vérifié sur le code, pas supposé)

### 2.1 Emphase par seau — `composeTemplate(100 season × brasse)`

`bucket_emphasis[b] = clamp01(emphasis_distance × mult_nage)` :

| Seau | 100 m (emphasis) | × Brasse (mult) | = Emphase | Score Samuel | Rôle |
|---|---|---|---|---|---|
| `lower_strength` | 0,82 | 1,214 | **1,00** | 13 | 🎯 **Focus #1** |
| `lower_power` | 0,85 | 1,333 | **1,00** | 40 | 🎯 **Focus #2** |
| `upper_strength` | 0,97 | 0,611 | 0,59 | 51 | maintien |
| `upper_power` | 0,60 | 0,75 | 0,45 | 72 | maintien |
| `mobility` | 0,42 | 1,333 | 0,56 | — | échauffement |
| `core` | 0,50 | 0,85 | 0,43 | (non scoré) | bloc systématique |

### 2.2 Priorisation finale

`forced_focus` brasse = `[lower_strength, lower_power]` (appliqué car distance sprint 50/100). Score combiné `emphasis × (100 − score)` :

1. **Force jambes** (combiné 87) → bloc **primaire** (2 exos/séance dév)
2. **Puissance jambes** (combiné 60) → **complément** (1 exo)
3. Mobilité (56) → échauffement à chaque séance
4. Force haut (29) → maintien
5. Puissance haut (13) → maintien

→ Un mésocycle **résolument orienté jambes**, ce qui est exactement la priorité physiologique du 100 brasse pour ce profil.

> ⚠️ **LIMITE MOTEUR — le haut du corps est vidé.** Le focus brasse étant verrouillé sur les jambes
> (`forced_focus = [lower_strength, lower_power]`), et tout primaire « maintien » se pairant avec le top
> focus (jambes), **le méso généré ne contiendra ni tractions ni poussée** : les 2 amorces sont jambes (PAP
> trap bar + box jump), et `ensureFocusDevelopmentSession` éjecte les seaux haut du corps des jours dév.
> **Le travail haut du corps doit donc être garanti hors moteur** — voir §3.5 ci-dessous (bloc non
> négociable) et la manip d'injection dans le méso généré.

### 2.3 Périodisation 12 semaines

Profil `100 season` (nominal 10 sem) étiré à 12 par round-robin (+1 prépa générale, +1 force max) :

| Semaines | Cycle | Intention | Chargement (source app) |
|---|---|---|---|
| **S1 – S2** | Prépa générale | remise en route, densité tissulaire | catalogue `*_endurance` |
| **S3 – S6** | **Force max** (4 sem) | **cœur du chantier : force jambes** | catalogue `*_force` |
| **S7 – S9** | Puissance / vitesse | conversion en explosivité | générique 60-80 %, vitesse max, repos 150-180 s |
| **S10** | Maintien | volume réduit, intensité tenue | générique 70-85 % |
| **S11** | Affûtage | nerveux, volume bas | générique 70-85 %, volume↓ |
| **S12** | Pic | activation SNC | générique 40-60 % vite, volume minimal |

---

## 3. Programme écrit — charges concrètes en kg

> Le moteur prescrit en %1RM/reps génériques par cycle. Ci-dessous, **traduction en kg** sur ses 1RM réels.
> Recaler les 1RM en fin de S2 (les charges de force max en dépendent). **Tout est progressif** : les % montent à l'intérieur de chaque phase.

### 3.1 Répartition hebdo (4 séances)

| Jour | Type | Contenu |
|---|---|---|
| **Lundi** | Amorce PAP | potentiateur lourd-court jambes + explosif, puis bassin frais |
| **Mardi** | Développement A | **Force jambes** (primaire) + Puissance jambes (complément) + core |
| **Jeudi** | Amorce PAP | potentiateur + explosif (alterné : box jump / trap bar) |
| **Vendredi** | Développement B + **HAUT garanti** | **Force jambes** + **bloc maintien haut du corps NON négociable** (tractions lestées + lancer/poussée) + core |

> Doctrine : espacement SNC 48-72 h, **pas de muscu le samedi**, amorces les jours de gros bassin.
> Les amorces sont **dimensionnées pour laisser frais** (ne jamais cramer la séance d'eau).

### 3.2 Sélection d'exercices (staples catalogue + complément brasse)

- **Force jambes (focus #1)** : **Trap bar squat** (staple) · **Hip thrust** ou **fentes bulgares** (extension de hanche, clé brasse).
- **Puissance jambes (focus #2)** : **Box jump** (staple) · **Squat jump** / **saut en longueur** · *(travail adducteurs explosif possible — spécifique fouet de brasse)*.
- **Force haut (maintien)** : **Tractions lestées** (staple).
- **Puissance haut (maintien)** : **Lancer médecine-ball** / pompes plyo / bench throw.
- **Core (bloc systématique)** : **Roue abdos** (staple) · anti-rotation (Pallof) · gainage dynamique.
- **Mobilité (échauffement)** : hanches, chevilles (dorsiflexion = fouet), épaules, T-spine.

### 3.3 Charges par phase — lifts principaux

**1RM de référence : Trap bar 85 kg · DC 95 kg · Traction +25 kg (≈100 kg total).**

#### Phase 1 — Prépa générale (S1-2) · endurance de force
| Exo | Séries × reps | % 1RM | Charge |
|---|---|---|---|
| Trap bar squat | 3 × 12-15 | 50-55 % | **45-50 kg** |
| Hip thrust / bulgares | 3 × 12 | — | charge modérée, tempo contrôlé |
| Tractions lestées | 3 × 8-10 | léger | +0 à +5 kg |
| Core (roue abdos) | 3 × 8-12 | — | poids de corps |
> Repos court (60-90 s). **Recaler les 1RM en fin de S2** (trap bar surtout — il va vite remonter).

#### Phase 2 — Force max (S3-6) · LE bloc clé jambes
| Exo | Séries × reps | % 1RM | Charge (progression S3→S6) |
|---|---|---|---|
| **Trap bar squat** | 4-5 × 3-5 | 80 → 90 % | **68 → 77+ kg** (recaler à la hausse !) |
| Hip thrust | 4 × 5-6 | 80-85 % | lourd |
| Tractions lestées (maintien) | 3 × 4-5 | — | **+15 à +20 kg** |
| Lancer médecine-ball (maintien) | 3 × 5 | — | explosif, 3 kg |
| Core | 3 × 6-10 | — | lesté progressif |
> Repos long **3-4 min** sur les gros lifts. Qualité > volume : viser la barre qui monte, pas l'échec.
> **C'est ici que se gagne le 100 brasse** — 4 semaines pour reconstruire la force d'extension de hanche.

#### Phase 3 — Puissance / vitesse (S7-9) · conversion
| Exo | Séries × reps | % 1RM | Intention |
|---|---|---|---|
| Trap bar squat **dynamique** | 4 × 3 | 60-70 % (**~50-60 kg**) | **vitesse maximale** sur chaque rép. |
| Box jump | 4 × 3 | — | hauteur max, réception propre |
| Squat jump / saut longueur | 3 × 4 | léger/lesté | explosif |
| Tractions lestées | 2 × 4 | — | maintien (+15 kg) |
| Lancer médecine-ball | 3 × 4 | — | distance max |
> Repos 150-180 s (récupération complète SNC). **La vitesse prime sur la charge** — si la barre ralentit, on arrête la série.

#### Phase 4 — Maintien (S10)
- Trap bar 2-3 × 4-6 @ 75-80 % · Box jump 3 × 3 · Traction 2 × 5 · core léger. **Volume ~40-50 %**, intensité tenue.

#### Phase 5 — Affûtage (S11)
- Trap bar 2 × 3 @ 80 % (vif) · Box jump 2-3 × 3 · 1 × tractions. **Volume bas, exécution nerveuse.**

#### Phase 6 — Pic (S12)
- 1-2 × 2-4 charges légères déplacées **vite** (trap bar ~40-50 %, box jump). **Se sentir explosif** avant la compète. Aucune fatigue résiduelle.

### 3.4 Structure d'une amorce PAP (Lun / Jeu)
1. Échauffement mobilité ciblé (hanches/chevilles).
2. **Potentiateur lourd-court** : Trap bar **2 × 2 @ 85 %** (repos 180 s) — *ou* tractions lestées lourdes le jeudi.
3. **Explosif** (alterné) : Lundi **Box jump 2 × 3** · Jeudi **Squat jump / trap bar dynamique 2 × 3**.
4. → Bassin **dans la foulée**, jambes potentialisées, sans fatigue.

### 3.5 Maintien haut du corps — **garanti** (hors moteur)

Le méso généré étant 100 % jambes (cf. §2.2), le haut du corps est assuré ici. **Objectif : maintenir/progresser
ses points forts** (tractions 51/100, poussée DC 95 kg) — un nageur N1 ne doit pas régresser du haut pendant
qu'il reconstruit les jambes. Bloc **fixe chaque vendredi** (après le bloc jambes, fraîcheur préservée) :

| Exo | Phase prépa/force max | Phase puissance/affûtage | Rôle |
|---|---|---|---|
| **Tractions lestées** | 3-4 × 4-6 @ +15 à +20 kg | 3 × 3 @ +15 kg, vite | maintien/progression force tirage |
| **Développé couché** *(ou pompes lestées)* | 3 × 5 @ ~80 % (~75 kg) | 3 × 3 explosif @ 60 % | maintien poussée |
| **Lancer médecine-ball** *(déjà en maintien moteur)* | 3 × 5, 3 kg | 3 × 4 distance max | puissance haute |

> **Volume volontairement bas** (~2-3 exos) : c'est du **maintien**, pas un 2ᵉ chantier. Ne pas empiéter sur
> la récupération des jambes. Sur les semaines lourdes jambes (force max S3-6), garder les tractions/DC à
> 3 séries max, RPE ≤ 8. **Progression douce attendue** sur les tractions (il part fort).

**Comment l'injecter dans le méso généré (app) :** à l'aperçu (`MesocyclePreview`) **avant** d'appliquer,
sur la séance du vendredi, **remplacer 1 exo jambes complément par les tractions lestées** (et ajouter le DC
si l'écran le permet). Sinon, suivre ce bloc §3.5 en parallèle du méso comme une routine fixe du vendredi.

> 💡 **Alternative plus propre** : générer le méso sur **3 séances** (Lun amorce / Mar + Jeu dév jambes) et
> garder le **vendredi comme séance haut du corps dédiée** (tractions + DC + lancer + core), pilotée par ce
> doc. Le moteur fait ce qu'il fait de mieux (spécialiser les jambes), le haut est cleanement séparé.

> ✅ **Correctif moteur livré (§335)** : `ensureMaintienRepresentation` garantit désormais que le top seau
> maintien (ici `upper_strength` = tractions lestées) décroche une séance de dév quand les 2 focus sont des
> jambes — cas symétrique des §324/§325/§329. Le **plan actif de Samuel a été patché en base** : chaque
> **mardi** (séance dév), le complément jambes a été remplacé par des **tractions lestées** (force haut),
> jambes intactes le vendredi. Donc le bloc haut du corps est maintenant DANS le méso généré ; ce §3.5 reste
> utile si tu veux y ajouter aussi du **développé couché** (la poussée n'est pas couverte par le moteur).

---

## 4. Points de suivi

- [ ] **Recaler les 1RM en fin de S2** (surtout trap bar — un retour de force rapide est attendu chez un ancien N1).
- [ ] Faire passer le **screening mobilité** dès que possible (épaules/hanches/chevilles) → réinjecter dans un futur bilan.
- [ ] **Adducteurs / dorsiflexion cheville** : surveiller spécifiquement (mécanique du fouet brasse) — ajouter du travail ciblé si le kick manque de puissance.
- [ ] Re-tester les KPIs (vrai bilan) à **mi-parcours (~S6)** et **fin (S12)** pour suivre la progression réelle vs ces valeurs fictives de départ.
- [ ] Si la charge bassin devient lourde → basculer une amorce en simple activation (le programme reste prioritaire sur la fraîcheur de nage).

---

*Valeurs barème calculées avec `kpiBaremes.ts` (shift tier national k=0,35), `jumpPower.ts` (Sayers), `medballPower.ts` (indice masse×distance), `composeTemplate.ts` (brasse × 100). Périodisation : `periodize()` sur le profil `100 season` étiré à 12 semaines.*
