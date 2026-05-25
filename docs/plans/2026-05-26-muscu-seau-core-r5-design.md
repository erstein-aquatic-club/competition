# Design — 6ᵉ seau « tronc / core » (R5) — Bilan Muscu

> **Statut : PROPOSITION (DRAFT). Migrations NON appliquées en prod.**
> Les valeurs d'emphase core et le choix KPI sont une **décision d'entraînement** :
> le coach valide avant tout déploiement. Tout ce qui est marqué « À VALIDER COACH ».
>
> - Audit source : `docs/audits/2026-05-25-audit-muscu-matrice-complete-vs-elite.md` §4-E / R5
> - Audit confirmation : `docs/audits/2026-05-26-audit-robustesse-perf-elite-edition.md` §3 / R5
> - Branche worktree : `feat/coach-bilan-unifie` (DRAFT, non poussée)

---

## 0. Problème (rappel)

Le moteur n'a que **5 seaux entraînables** : `lower_strength`, `lower_power`,
`upper_strength`, `upper_power`, `mobility` (`composeTemplate.ts:23-29`,
`api/types.ts:1040-1045`). Le **tronc** — ondulation (papillon/dos), rotation
(crawl/dos), gainage/streamline (toutes nages) — n'a **pas de seau dédié**. Il
est dispersé :

- `upper_strength` : Hollow Body Hold (78), Gainage lesté (61), Planche latérale (47),
  Planche dynamique (82), Planche instable (79), Pallof Press (45), Dead Bug (46),
  Ab Wheel Rollout (72), Relevés de jambes suspendu (23), Plank walkout (75), Abdos (32).
- `lower_strength` : Superman dynamique (80).
- `upper_power` : Lancer rotatif médecine-ball (53), Lancer latéral médecine-ball (54).

Conséquence : la qualité la plus papillon/4N-spécifique (raideur transmissive du
tronc, transfert de force) n'est pilotable qu'**indirectement**. Le coach ne peut
pas dire « plus de tronc pour ce papillonneur » sans gonfler tout `upper_strength`.

---

## 1. Décision n°1 — Matrice d'emphase core (nage × distance)  **[À VALIDER COACH]**

### 1.1 Modèle (inchangé)

On garde le modèle §305 : `emphasis_core = clamp01(round2(profil.emphasis.core × signature.mult.core))`.
On ajoute donc une clé `core` :
- dans `strength_distance_profiles.emphasis` (5 distances × 2 kinds) ;
- dans `strength_stroke_signatures.mult` (5 nages, crawl ≡ 1.0).

### 1.2 Emphase core par **distance** (ancrée crawl)

Le tronc est une qualité **transversale** : présent partout, mais son poids relatif
monte avec la part technique/transmissive de l'épreuve et baisse quand la force
pure brute domine (sprint). On le cale **entre `mobility` et `upper_strength`** —
plus stable que la mobilité (qui décolle en fond/4N pour la préhab), jamais nul.

| distance_key | emphasis.core (crawl) | Raisonnement |
|---|---|---|
| `50`     | **0.45** | Sprint = force/puissance brute prime ; le tronc sert surtout le streamline départ/coulée. Plancher non négligeable (transfert). |
| `100`    | **0.50** | Sprint long ; transfert tronc un peu plus sollicité (nage glycolytique). |
| `200`    | **0.60** | Épreuve « technique » ; rotation/streamline plus exposés sur la durée. |
| `400plus`| **0.65** | Endurance de force : maintien postural/streamline sur ~4 min. |
| `fond`   | **0.70** | Demi-fond : économie de nage = gainage postural soutenu très longtemps (cale comme `mobility`=1.0 mais inférieur car c'est de l'endurance posturale, pas de la préhab articulaire). |

> Ancrage : la littérature dryland natation place le travail de tronc/anti-rotation
> comme **socle permanent** (jamais périodisé « en pic »), avec un poids croissant
> sur les épreuves longues où l'économie posturale prime. Cf. sources §5.

### 1.3 Signature core par **nage** (multiplicateur vs crawl)

Le crawl est l'ancre (rotation longitudinale modérée + streamline). On module :

| stroke_key | mult.core | Raisonnement (sources §5) |
|---|---|---|
| `freestyle` (crawl) | **1.0** | Ancre : rotation longitudinale + streamline. |
| `butterfly` (papillon) | **1.40** | Ondulation dauphin = LA qualité tronc-spécifique max ; extension thoracique + flexion rythmique du tronc. Le plus haut de la matrice. |
| `backstroke` (dos) | **1.25** | Ondulation dorsale (coup de pied dauphin au mur) + rotation longitudinale ; tronc très sollicité, un cran sous le papillon. |
| `breaststroke` (brasse) | **0.85** | Ondulation présente (vague brasse moderne) mais propulsion jambes-dominante ; tronc plus statique-gainage que dynamique. Plancher > crawl ? Non : sous crawl car moins de rotation. |
| `medley` (4 nages) | **1.30** | Cumule toutes les sollicitations (ondulation fly/dos + rotation crawl) → besoin tronc quasi-maximal, juste sous le papillon. |

### 1.4 Matrice composée résultante (5 nages × 5 distances, season) — **indicative**

`core = clamp01(round2(distance × stroke))` :

| | 50 (.45) | 100 (.50) | 200 (.60) | 400plus (.65) | fond (.70) |
|---|---|---|---|---|---|
| **Crawl** ×1.0   | 0.45 | 0.50 | 0.60 | 0.65 | 0.70 |
| **Papillon** ×1.40 | 0.63 | 0.70 | 0.84 | 0.91 | **0.98** |
| **Dos** ×1.25    | 0.56 | 0.63 | 0.75 | 0.81 | 0.88 |
| **Brasse** ×0.85 | 0.38 | 0.43 | 0.51 | 0.55 | 0.60 |
| **4 nages** ×1.30 | 0.59 | 0.65 | 0.78 | 0.85 | 0.91 |

Le papillon/4N ressortent nettement (objectif R5 : lever le sous-modélisé fly/4N).
Tout reste ≤ 1.0 (clamp). **Aucune cellule = 0** (le tronc est toujours travaillé).

---

## 2. Décision n°2 — KPI du core  **[RECOMMANDATION : option (a) — pas de KPI dédié]**

### Le point dur

5 KPIs mesurés ↔ 5 seaux. Un 6ᵉ seau **sans KPI** scorerait `null` → traité comme
`0` par `prioritizeBuckets` (`mesocycleEngine.ts:223`, `combined = emphasis × (100 − 0)`),
donc **sur-priorisé systématiquement** (toujours « donnée manquante, conservateur »).
Sur un papillon (emphasis core 0.84), il battrait presque tous les autres seaux et
volerait du volume focus à la force — exactement ce qu'on ne veut pas.

### Options évaluées

| Option | Description | Coût | Risque |
|---|---|---|---|
| **(a) Core « toujours présent »** (recommandée) | Core traité comme `mobility` : **hors scoring KPI**, **hors top-focus**, intégré comme **bloc systématique** (1 exo core / séance, comme le warmup mobilité). Pas de score → pas de sur-priorisation. | **Faible** (réutilise le pattern mobilité existant `allocateVolume:337-340`). | Très faible. |
| (b) Nouveau KPI core (plank hold, Sørensen, Sport-spé : medball rotatif distance) | Mesure dédiée → score réel → priorisation normale. | **Élevé** (mesure poolside, barème à construire, wizard, migration KPI). | Barème `placeholder` au départ → re-introduit le défaut « score peu fiable » que §309 vient de corriger. |
| (c) Core dérivé d'un KPI existant (ex. moyenne imtp + medball rotatif) | Pas de nouvelle mesure. | Moyen. | **Faux signal** : aucun KPI existant ne mesure le gainage/anti-rotation. Dérivation arbitraire = score trompeur. |

### Recommandation : **(a) Core « toujours présent »**, comme `mobility`

**Argumentaire.**
1. **Cohérence doctrine.** Le tronc, dans la littérature dryland natation, est un
   **socle permanent non périodisé** (jamais « en pic », toujours présent) — exactement
   le statut de la mobilité aujourd'hui. Le modéliser comme un score 0-100 à
   « rattraper » serait un contresens d'entraînement.
2. **Zéro risque de sur-priorisation.** En sortant le core du scoring (`scoreBuckets`
   ne lui assigne pas de score → reste hors `ALL_BUCKETS` de priorisation, comme
   on l'a fait pour `mobility` qui, elle, A un score mais n'est jamais top-focus sauf
   override), on évite le piège `emphasis × (100 − 0)`.
3. **Coût minimal, réversible.** Le pattern « bucket systématique greffé sur chaque
   séance » existe déjà pour la mobilité (`allocateVolume:337-340`,
   `buildSession` warmup `mesocycleEngine.ts:950-952`). On ajoute un **2ᵉ bloc
   systématique** (core) sur le même modèle. Si le coach veut plus tard un vrai KPI,
   on passe à (b) sans rien casser.
4. **Le score §309 reste protégé.** On n'ajoute aucun KPI `placeholder` →
   `lowestBaremeConfidence` inchangé.

> **Conséquence d'implémentation** : `core` est un `StrengthBucket` (entraînable,
> a des exercices) mais **n'entre pas dans `BucketScores`/`ALL_BUCKETS`** de
> `prioritizeBuckets`. Comme la mobilité en warmup, il est **alloué et inséré**
> mais **jamais scoré ni priorisé** par l'emphasis × (100−score). L'emphasis core
> du template sert alors à **doser combien d'exos core** (1 partout, 2 si emphasis ≥ ~0.8,
> i.e. papillon/4N/dos-long) plutôt qu'à le faire monter en priorité.

### Variante minimale retenue pour le DRAFT

Pour rester sûr et testable sans réécrire `allocateVolume`, le DRAFT implémente :
- `core` ∈ `StrengthBucket` (type + catalogue + `EMPHASIS_BUCKETS` + signatures/profils) ;
- `composeTemplate` calcule `bucket_emphasis.core` (testé) ;
- **core inséré comme bloc systématique** (1 exo, après le warmup mobilité, avant le
  bloc primaire) quand l'emphasis core du template > 0 et qu'un exo core admissible
  existe — **sans toucher au scoring/priorisation** (donc pas de régression sur les
  5 seaux scorés). Le dosage « 2 exos si emphasis ≥ 0.8 » est laissé en TODO coach
  (commenté), car c'est un réglage d'entraînement.

---

## 3. Décision n°3 — Catalogue : re-tag `bucket = 'core'`  **[plan de re-tag]**

### 3.1 Exercices à re-tagger en `core` (DRAFT migration 00203)

Vrais exercices de tronc (gainage / anti-rotation / anti-extension / flexion-tronc /
ondulation), aujourd'hui dispersés. Source : requête live `dim_exercices` (2026-05-26).

| id | nom_exercice | bucket actuel | → core | is_core proposé | Catégorie tronc |
|---|---|---|---|---|---|
| 78 | Hollow Body Hold | upper_strength | **core** | true | anti-extension (streamline) |
| 61 | Gainage lesté | upper_strength | **core** | true | anti-extension |
| 47 | Planche latérale | upper_strength | **core** | false | anti-flexion latérale |
| 82 | Planche dynamique (touché épaule) | upper_strength | **core** | false | anti-rotation dynamique |
| 79 | Planche instable (Swiss Ball) | upper_strength | **core** | false | anti-extension instable |
| 45 | Pallof Press | upper_strength | **core** | true | **anti-rotation** (signature crawl/dos) |
| 46 | Dead Bug | upper_strength | **core** | true | anti-extension contrôle |
| 72 | Ab Wheel Rollout | upper_strength | **core** | false | anti-extension avancé |
| 23 | Relevés de jambes suspendu | upper_strength | **core** | false | flexion-tronc / fléchisseurs |
| 75 | Plank walkout (Inchworm) | upper_strength | **core** | false | anti-extension dynamique |
| 32 | Abdos | upper_strength | **core** | false | flexion-tronc basique |
| 80 | Superman dynamique | lower_strength | **core** | true | **extension dorsale / ondulation** (signature fly/dos) |

**12 exercices** → `core`. Couvre les 4 familles (anti-extension, anti-flexion-lat,
anti-rotation, flexion/extension) → le pool core est viable à tous les niveaux
(beginner : 78, 47, 45, 46, 32, 80 ; intermediate : 61, 79, 23 ; advanced : 72).

### 3.2 Exercices qui **restent** dans leur seau (ne PAS re-tagger)

- **53 Lancer rotatif médecine-ball** / **54 Lancer latéral médecine-ball** → restent
  `upper_power`. Ce sont des transferts **balistiques** (puissance rotationnelle) qui
  alimentent le KPI `medball_vertical_throw`/`upper_power`, pas du gainage. Les
  déplacer fausserait le pool puissance et la PAP explosive (`POWER_BUCKETS`). Ils
  *expriment* la puissance de tronc mais relèvent du seau puissance.
  > **À VALIDER COACH** : si le coach considère le lancer rotatif comme « cœur du
  > tronc dynamique », on pourra l'ajouter à `core` en gardant un doublon power —
  > mais par défaut on ne déplace pas (préserve la chaîne KPI upper_power).

### 3.3 Effet sur les comptes de seau

Avant : `upper_strength(37), lower_strength(19), lower_power(17), upper_power(7), mobility(15)`.
Après re-tag : `upper_strength(26), lower_strength(18), core(12)`, autres inchangés.
`upper_strength` reste largement fourni (26 exos) → pas d'appauvrissement du seau.

### 3.4 Contre-indications

Les exercices core re-taggés conservent leurs `contraindication_zones` actuelles
(beaucoup ont `lower_back` → critique en papillon, cf. audit §4-A). La substitution
existante (`selectExercises:445-455`) fonctionne telle quelle sur le seau core.

---

## 4. Décision n°4 — Périodisation du core  **[cycles génériques, pas de schéma propre]**

**Recommandation : le core suit les cycles génériques existants**, comme la mobilité,
**sans arc dédié**.

- Le core est un **socle permanent** → il ne se périodise pas en pic/affûtage comme
  la force. Comme la mobilité (warmup), il est chargé en **endurance/contrôle**
  quelle que soit la semaine (`toMesocycleExercise` règle 1, `mesocycleEngine.ts:1121`).
- **Pas de nouvelle phase** dans `structure.phases` : les profils de distance gardent
  leurs arcs actuels. On ajoute juste la clé `core` à `emphasis` (le dosage volume),
  pas aux `phases`.
- Implémentation DRAFT : le bloc core est inséré avec `isWarmup`-like (chargement
  endurance/contrôle), intention « Gainage / transfert — contrôle, pas l'effort ».
  Il n'est **jamais** converti en PAP (la PAP reste force+puissance+warmup).

> **À VALIDER COACH** : faut-il un léger pic de volume core en `force_max`
> (transfert) ? Par défaut non — le core reste constant. C'est un réglage fin.

---

## 5. Sources (littérature dryland natation — tronc / ondulation)

- **USMS butterfly dryland** — le tronc/ondulation comme moteur du dauphin :
  https://www.usms.org/fitness-and-training/articles-and-videos/articles/dryland-exercises-to-improve-your-butterfly-technique
- **SwimSwam dolphin-kick dryland** (engagement tronc complet) :
  https://swimswam.com/dryland-exercises-dolphin-kick/
- **BridgeAthletic — butterfly full-body engagement** (ondulation = chaîne tronc) :
  https://blog.bridgeathletic.com/swim-dryland-building-blocks-butterfly-full-body-engagement
- **YourSwimLog — underwater dolphin kick** (tronc + cheville, toutes nages au mur) :
  https://www.yourswimlog.com/develop-awesome-underwater-dolphin-kicking/
- **Revue rachis lombaire papillon 2024** (hyperextension ondulatoire = charge lombaire
  fly-spécifique → contre-indication `lower_back`) :
  https://journals.sagepub.com/doi/10.1177/19417381231225213
- **USMS underwater kick** (coup de pied dauphin au mur = dos aussi) :
  https://www.usms.org/fitness-and-training/guides/underwater-kick
- **Anti-rotation / Pallof comme socle permanent du nageur** (transfert force, axe long
  crawl/dos) — consensus dryland (USMS/BridgeAthletic ci-dessus).

> Note : la matrice §1 est une **proposition d'expert** ancrée sur ces sources
> qualitatives (pas de norme chiffrée publiée pour l'emphase tronc) → **à valider
> par le coach** comme toute la matrice §305.

---

## 6. Migrations DRAFT (NON appliquées)

Trois fichiers SQL créés dans `supabase/migrations/`, **non appliqués** en prod :

- **`00203_strength_core_bucket_signatures_profiles.sql`** — ajoute la clé `core` à
  `strength_stroke_signatures.mult` (5 nages) et `strength_distance_profiles.emphasis`
  (10 lignes), via `jsonb_set` idempotent. Aucune RLS touchée. Réversible.
- **`00204_dim_exercices_core_bucket.sql`** — élargit le CHECK `dim_exercices_bucket_check`
  pour accepter `'core'`, puis re-tag les 12 exercices (§3.1) + ajuste `is_core`.
  Réversible (re-tag inverse documenté en commentaire).
- (le label de session RPC `apply_strength_mesocycle` fonctionne déjà : le `CASE`
  a un `ELSE v_primary_bucket` → un slot core afficherait « core » brut. Un branch
  CASE « Tronc » est un nice-to-have **non bloquant**, laissé en TODO dans la migration.)

### Ordre d'application (quand le coach valide)

1. `00203` (référentiels) puis `00204` (catalogue), via MCP `apply_migration` uniquement.
2. Redéployer le front (le type `StrengthBucket += 'core'` est déjà mergé).
3. Vérifier en lecture : `SELECT bucket, count(*) FROM dim_exercices GROUP BY bucket`
   → `core` doit valoir 12.

---

## 7. Récapitulatif des 4 décisions

| # | Décision | Choix tranché | Statut |
|---|---|---|---|
| 1 | Matrice emphase core (nage × distance) | Distances 0.45→0.70 ; signatures fly ×1.40, 4N ×1.30, dos ×1.25, crawl ×1.0, brasse ×0.85 | **À VALIDER COACH** |
| 2 | KPI du core | **Option (a)** : core « toujours présent » (hors scoring KPI, comme mobilité) | Recommandé, argumenté |
| 3 | Re-tag catalogue | 12 exos → `core` (gainage/anti-rotation/extension) ; medball rotatif/latéral **restent** upper_power | Plan précis, **À VALIDER COACH** pour medball |
| 4 | Périodisation | Cycles génériques, socle permanent (comme mobilité), pas d'arc propre | Recommandé |

### Reste à valider par le coach
- Les **valeurs chiffrées** de la matrice §1 (emphase d'entraînement).
- Le sort du **lancer rotatif médecine-ball** (53) : core dynamique ou puissance ?
- Faut-il **2 exos core** sur fly/4N/dos-long (emphasis ≥ 0.8) vs 1 partout ?
- Faut-il un **vrai KPI core** à terme (option b) — décision mesure poolside.
