# Vocabulaire `PeriodizationCycle` — Bilan Muscu

> **Statut : PROPOSITION — à valider par le coach.**
>
> Ce document propose le **vocabulaire des cycles** (`PeriodizationCycle`) à
> partir duquel se construit la séquence semaine-par-semaine des templates de
> périodisation de musculation à sec, pour des nageurs de compétition couvrant
> **tous les profils d'épreuve** (sprint 50 m → fond 1500 m, toutes nages,
> 4 nages).
>
> Aucun code n'est écrit ici. Le document oriente une **décision de modèle de
> données** : comment chaque cycle se branche sur les paramètres
> séries/reps/%1RM stockés dans le catalogue d'exercices (`dim_exercices`).

---

## 0. Pourquoi ce document existe

Le brouillon antérieur (`docs/plans/bilan-muscu-templates-sources.md`) et la
table `strength_session_items.cycle_type` partent du vocabulaire
`endurance / hypertrophie / force / deload`. Le coach a tranché :

> **« hypertrophie » n'est pas pertinent pour des nageurs.** Une prise de masse
> musculaire délibérée joue *contre* le nageur (poids et traînée ajoutés). Le
> nageur veut de la force et de la puissance **sans hypertrophie**. Le
> vocabulaire doit être fondé sur la littérature, pas supposé.

Ce document remplace donc le vocabulaire de cycles utilisé jusqu'ici. Les
7 templates et la colonne `cycle_type` devront être revus en conséquence
(voir § 5 et § 6).

---

## 1. Synthèse de la littérature

### 1.1 Le cadre de référence : la périodisation de la force

Le cadre classique de périodisation de la force pour le sport (Bompa &
Buzzichelli, *Periodization of Strength Training for Sports*) enchaîne six
phases : **adaptation anatomique → hypertrophie → force maximale → conversion
en force spécifique / puissance → maintien → affûtage (peaking)**. C'est la
grille de lecture la plus répandue ; mais elle n'est pas spécifique à la
natation, et la phase « hypertrophie » y est explicitement optionnelle selon le
sport.

### 1.2 La spécificité natation : la séquence réellement utilisée

La littérature S&C **propre à la natation** confirme une séquence resserrée,
sans phase d'hypertrophie dédiée :

- **Enquête Frontiers 2023 sur les coaches S&C de sprinteurs élite français**
  (*From dry-land to the water*, Frontiers in Sports and Active Living) — la
  progression du macrocycle observée est : **phase de développement (force
  maximale) → phase de construction (puissance maximale) → phase de compétition
  (vitesse maximale)**. Paramètres mesurés :
  - Force maximale : **3-4 reps @ ~89 % 1RM** (ou RPE 7), 3-4 séries, récup
    ~3 min.
  - Puissance maximale : **6-7 reps @ ~59 % 1RM**, récup ~2 min 40 s,
    prescrite *après* la force maximale.
  - Vitesse maximale : prescrite *juste avant la compétition* visée.
  - ≥ 3 séances/semaine pour 83 % des coaches.
  - L'hypertrophie n'apparaît **pas** comme une phase à part : elle est citée
    comme une modalité « de début de saison » seulement, et l'endurance de
    force concerne surtout les nageurs de demi-fond.

- **Guides de périodisation dryland** (SwimSwam, Swimming Science) — modèle
  linéaire : force/base en début de saison/intersaison, puis on « échange
  progressivement les séries de force contre du travail de puissance » jusqu'au
  pic aux championnats. Premier cycle = force maximale ; cycles 2-3 =
  puissance et endurance de vitesse.

- **Périodisation 400 m 4 nages** (Crowley et al., *Periodization and
  Programming for Individual 400 m Medley Swimmers*, IJERPH 2021) — confirme la
  structure pré-saison → pic, et le contraste sprint / demi-fond.

### 1.3 Pourquoi l'hypertrophie est écartée pour les nageurs

La littérature appuie clairement la position du coach :

- **NSCA** (*Beyond the Pool: Improving Swimming Performance with Dryland
  Training*) — formulation explicite : *« un sur-accent sur l'hypertrophie non
  spécifique peut compromettre la biomécanique de nage en augmentant la traînée
  et en altérant l'efficacité du geste »*.
- La masse musculaire ajoutée augmente le poids corporel et la traînée
  frontale, dégrade la position hydrodynamique et peut réduire l'amplitude
  articulaire (Science of Swimming, *The Race Club*). L'objectif est la
  **force par efficacité neuronale** — meilleur recrutement des fibres et
  production de force *sans* gain de masse (SwimSwam, *3 Steps to Get Stronger
  Without Gaining Muscle Mass*).

**Nuance honnête.** L'hypertrophie n'est pas universellement bannie : pour un
nageur très jeune / sous-musclé, ou en intersaison longue, un travail à volume
modéré peut être justifié. Mais ce n'est **pas un objectif de périodisation
pré-compétitive** pour un nageur de compétition. Le vocabulaire ne doit donc
**pas** offrir « hypertrophie » comme cycle de premier rang. Le gain de tissu
contractile, quand il survient, est un *effet collatéral* d'un bloc de force,
pas une phase ciblée.

### 1.4 Sprint vs fond — comment la périodisation diffère

- **Sprinteur (50 m)** — la NSCA recommande de la force à haute intensité et de
  la pliométrie ciblant les fibres rapides et la production de force maximale.
  Séquence : force maximale → puissance explosive → vitesse. C'est la séquence
  exacte du plan réel « Prépa sprint 50 m » de ce club.
- **Nageur de fond (800/1500 m)** — la NSCA recommande de la force à intensité
  *plus basse, en répétitions élevées*, et un travail de gainage soutenu ; les
  études sur la natation de fond (volumes de 60-80 km/semaine) insistent sur la
  **prévention des blessures** (épaule, bas du dos) et la tenue technique sous
  fatigue. La force maximale et la puissance pure restent présentes mais avec
  un poids moindre ; un bloc d'**endurance de force** plus long les précède.
- **Le vocabulaire doit servir les deux** : un même jeu de cycles, des
  *séquences* différentes (cf. § 5).

### 1.5 Décharge (deload) et affûtage (taper)

- **Deload** ≠ **taper** (GC Performance, Stronger by Science) : le *deload*
  réduit la charge pour assimiler les adaptations *en cours de bloc* ; le
  *taper* retire de la charge pour *maximiser la performance avant une
  compétition*.
- Variable clé pour les deux : **maintenir l'intensité, réduire le volume et la
  fréquence**. L'intensité (% 1RM) préserve la force ; le volume fatigue le SNC.
- Chez le nageur, l'affûtage améliore les propriétés contractiles des fibres
  IIa (puissance de pointe ×2 normalisée à la taille de fibre — PMC3873657).
- En semaine de pic, 1 séance/semaine très courte, charges légères / vitesses
  élevées, suffit à maintenir l'activation neuronale sans ajouter de stress.

### 1.6 Concordance avec le plan réel « Prépa sprint 50 m »

Le plan 10 semaines d'un sprinteur adulte du club, tel que stocké dans l'app :

| Sem. | Contenu réel | Cycle proposé |
|------|--------------|---------------|
| W1 | Tests 5RM | `test` |
| W2-3 | Force max (gym, +5/+10 %, traction/squat/SDT/tirage) | `force_max` |
| W4 | Semaine voyage : poids de corps / élastique, tempo, mobilité — maintien | `maintien` |
| W5-6 | Force-vitesse (Power Clean, Squat Jump, box jumps, med-ball, 70-80 % @ vitesse max) | `puissance` |
| W7-9 | Affûtage (volume −25 % → −50 %, rester explosif/« nerveux ») | `affutage` |
| W10 | Pic / activation SNC (très court, « se sentir explosif ») | `pic` |

→ **Aucun bloc d'hypertrophie, aucun bloc d'endurance de force.** Le
vocabulaire proposé ci-dessous reproduit exactement cette séquence pour le
sprint, et l'étend aux autres profils.

---

## 2. Le vocabulaire `PeriodizationCycle` proposé

**6 valeurs.** Trois **blocs** (multi-semaines, le cœur du travail) et trois
**transitions** (semaine isolée, articulation entre blocs ou vers la
compétition). « hypertrophie » est supprimé.

| Valeur | Type | Nom FR | Rôle en une phrase |
|--------|------|--------|--------------------|
| `prepa_generale` | bloc | Préparation générale | Adaptation anatomique : tendons, posture, préhab, endurance de force. Remise en charge et socle. |
| `force_max` | bloc | Force maximale | Force maximale : recrutement, coordination intermusculaire, charges lourdes. |
| `puissance` | bloc | Puissance / vitesse | Conversion de la force en puissance explosive et vitesse (force-vitesse, RFD, pliométrie). |
| `maintien` | transition | Maintien | Semaine isolée qui préserve les acquis (voyage, charge réduite, intensité tenue) sans construire. |
| `affutage` | transition | Affûtage | Réduction progressive du volume avant compétition, intensité/explosivité préservées. |
| `pic` | transition | Pic | Semaine de compétition : activation SNC, très court, « se sentir explosif ». |

> **Note de nommage.** Identifiants en `snake_case` ASCII (compatibles
> contrainte SQL `CHECK`, pas d'accents) ; libellés FR pour l'UI. À arbitrer
> avec le coach (cf. § 7).

### Schéma de séquence type

```
prepa_generale → [maintien] → force_max → [maintien] → puissance → affutage → pic
   (bloc)        (transition)   (bloc)    (transition)   (bloc)   (transition)(transition)
```

Un template enchaîne 1..n blocs, insère des transitions `maintien` au milieu
des blocs longs, et termine systématiquement par `affutage` puis `pic`. Un
`test` peut ouvrir la séquence (cf. § 4).

---

## 3. Détail par cycle

Pour chaque cycle : **définition**, **caractère de charge** (intensité / reps /
intention), et **mapping vers `dim_exercices`** — le point qui pilote la
décision de modèle de données.

> **Rappel de la contrainte `dim_exercices`.** Le catalogue stocke les
> paramètres séries/reps/%1RM/récup pour **exactement 3 cycles** :
> `endurance`, `hypertrophie`, `force` (colonnes `nb_series_*`, `nb_reps_*`,
> `pourcentage_charge_1rm_*`, `recup_series_*`, `recup_exercices_*`). Pour
> chaque cycle proposé, on indique : **(R)** réutilise un des 3 jeux existant,
> **(N)** demande de nouveaux paramètres par exercice, ou **(D)** doit être
> dérivé par le moteur à partir d'un autre jeu.

### 3.1 `prepa_generale` — Préparation générale *(bloc)*

- **Définition.** Phase d'entrée : adaptation anatomique (tendons, ligaments,
  insertions), gainage, préhab d'épaule/hanche, endurance de force, remise en
  charge progressive. Construit le socle sur lequel la force se développera.
  C'est le cycle dominant en début de saison et **le plus long chez le nageur
  de fond**.
- **Charge.** Charges légères à modérées, séries longues : **≈ 12-20 reps,
  ~50-70 % 1RM**, récup courte. Intention : qualité technique, volume de
  travail, robustesse — pas de recherche de charge maximale.
- **Mapping `dim_exercices` — (R) réutilise `endurance`.** Le jeu de paramètres
  `*_endurance` du catalogue (séries longues, %1RM bas) correspond exactement
  au caractère de charge de `prepa_generale`. **Aucune nouvelle colonne.** Le
  moteur lit `nb_series_endurance` / `nb_reps_endurance` /
  `pourcentage_charge_1rm_endurance`. → renommage conceptuel : ce que le
  catalogue appelle « endurance » devient le support de `prepa_generale`.

### 3.2 `force_max` — Force maximale *(bloc)*

- **Définition.** Développement de la force maximale : recrutement des unités
  motrices, coordination intermusculaire, charges lourdes sur les mouvements
  fondamentaux (squat, soulevé de terre, traction, tirage). Cœur du plan
  sprint, présent dans tous les templates.
- **Charge.** Charges lourdes, peu de reps : **≈ 3-6 reps, ~80-89 % 1RM**,
  séries 3-4, récup longue (~3 min). Réf. Frontiers 2023 : 3-4 reps @ ~89 %
  1RM pour les sprinteurs.
- **Mapping `dim_exercices` — (R) réutilise `force`.** Le jeu `*_force` du
  catalogue (reps basses, %1RM élevé, récup longue) correspond directement.
  **Aucune nouvelle colonne.**

### 3.3 `puissance` — Puissance / vitesse *(bloc)*

- **Définition.** Conversion de la force en puissance explosive et en vitesse :
  force-vitesse, pliométrie (squat jump, box jump), lancers de med-ball,
  haltérophilie dynamique (Power Clean). C'est le bloc terminal du plan sprint
  (W5-6 du plan réel) ; chez le fond il est court ou réduit à quelques séances.
- **Charge.** Charges modérées **déplacées à vitesse maximale** : **≈ 3-6 reps
  @ ~60-80 % 1RM**, récup longue pour préserver la qualité. L'intention
  (« déplacer vite ») prime sur la charge. Réf. Frontiers 2023 : puissance
  ~6-7 reps @ ~59 % 1RM ; NSCA : 3-6 reps @ 70-85 % 1RM pour la puissance.
- **Mapping `dim_exercices` — décision à trancher. Recommandation : (N)
  nouveaux paramètres par exercice.** C'est le seul cycle qui ne se mappe sur
  *aucun* des 3 jeux existants :
  - `endurance` (reps trop hautes, %1RM trop bas) → non.
  - `force` (%1RM trop haut, intention « lourd » et non « vite ») → non.
  - L'ancien `hypertrophie` (8-12 reps, %1RM moyen) → ne correspond pas non
    plus, et serait un détournement trompeur d'une colonne destinée à
    disparaître.
  - La puissance dépend fortement de l'exercice (un squat jump, un med-ball
    throw et un Power Clean ne se prescrivent pas avec les mêmes reps/%1RM
    qu'un développé). Un jeu **par exercice** est justifié.
  - **Proposition concrète :** remplacer le triplet de colonnes
    `*_hypertrophie` (voué à être supprimé) par un triplet `*_puissance`
    (`nb_series_puissance`, `nb_reps_puissance`,
    `pourcentage_charge_1rm_puissance`, `recup_series_puissance`,
    `recup_exercices_puissance`). Coût neutre en nombre de colonnes, et le
    catalogue reste à 3 jeux : `endurance`, `force`, `puissance`.
  - *Alternative plus légère, à débattre :* dériver `puissance` par le moteur à
    partir du jeu `force` (mêmes reps, %1RM abaissé d'un offset fixe, ex.
    −15 pts). Plus simple à migrer, mais perd la spécificité par exercice. À
    arbitrer avec le coach (cf. § 7).

> **Décision coach (2026-05-18) — RÉSOLU.** Le coach a tranché : `puissance`
> utilise un **schéma de chargement générique au niveau cycle** (comme
> `maintien` / `affutage` / `pic`) — **pas** de nouvelles colonnes dans
> `dim_exercices`. Le triplet `*_hypertrophie` n'est donc **pas** remplacé par
> `*_puissance` : le moteur dérive la prescription de puissance au niveau du
> cycle. La recommandation **(N)** ci-dessus est abandonnée au profit de
> l'option « dérivé par le moteur » (cf. § 7, question 2).

### 3.4 `maintien` — Maintien *(transition, 1 semaine)*

- **Définition.** Semaine isolée qui **préserve** les acquis sans construire :
  cas du voyage (W4 du plan réel : poids de corps / élastique, tempo,
  mobilité), ou articulation entre deux blocs. Pas un bloc — une semaine.
- **Charge.** Volume réduit (~40-60 % du volume du bloc en cours), **intensité
  maintenue**. Le moteur peut basculer sur des variantes au poids du corps /
  élastique si le contexte l'exige (voyage).
- **Mapping `dim_exercices` — (D) dérivé par le moteur.** Pas de jeu de
  paramètres propre. Le moteur prend le jeu du **bloc adjacent** (le bloc que
  la semaine prolonge — typiquement `force_max` ou `puissance`) et **réduit le
  volume** (nombre de séries, ou nombre d'exercices) en gardant le %1RM.
  Aucune nouvelle colonne.

### 3.5 `affutage` — Affûtage *(transition, 1+ semaines)*

- **Définition.** Réduction progressive de la charge avant la compétition
  visée. Réduction surtout du **volume** (W7-9 du plan réel : −25 % → −50 %),
  l'intensité et l'explosivité étant préservées (« rester nerveux »). Peut
  s'étaler sur 1 à 3 semaines selon le template.
- **Charge.** Volume en décroissance (palier −25 % puis −40-50 %), **intensité
  et vitesse d'exécution maintenues**. Réf. : maintenir l'intensité préserve la
  force pendant le taper.
- **Mapping `dim_exercices` — (D) dérivé par le moteur.** Pas de jeu propre. Le
  moteur part du jeu du **dernier bloc** (en pratique `puissance`) et applique
  un **facteur de réduction de volume progressif** semaine par semaine. Aucune
  nouvelle colonne. Le facteur de décroissance est un paramètre du *template*,
  pas de l'exercice.

### 3.6 `pic` — Pic *(transition, 1 semaine)*

- **Définition.** Semaine de compétition : activation du SNC, séance(s) très
  courte(s), objectif « se sentir explosif » (W10 du plan réel). Maintien de
  l'activation neuronale sans aucun stress résiduel.
- **Charge.** Volume minimal (1 séance courte), charges légères déplacées à
  vitesse maximale, quelques séries de qualité. Aucune recherche de charge.
- **Mapping `dim_exercices` — (D) dérivé par le moteur.** Pas de jeu propre. Le
  moteur prend le jeu `puissance` et le **tronque fortement** (très peu de
  séries, sélection réduite d'exercices explosifs, %1RM bas). Aucune nouvelle
  colonne.

### 3.7 Récapitulatif du mapping

| Cycle | Type | Mapping `dim_exercices` | Impact modèle de données |
|-------|------|--------------------------|--------------------------|
| `prepa_generale` | bloc | **(R)** réutilise `endurance` | Aucun — colonnes existantes |
| `force_max` | bloc | **(R)** réutilise `force` | Aucun — colonnes existantes |
| `puissance` | bloc | **(N)** nouveaux paramètres *(recommandé : remplacer `*_hypertrophie` par `*_puissance`)* | Renommer 5 colonnes + re-seeder les 94 exercices |
| `maintien` | transition | **(D)** dérivé (bloc adjacent, volume réduit) | Aucun — logique moteur |
| `affutage` | transition | **(D)** dérivé (dernier bloc, volume décroissant) | Aucun — logique moteur |
| `pic` | transition | **(D)** dérivé (`puissance` tronqué) | Aucun — logique moteur |

**Conséquence pour le modèle de données.** Le catalogue reste à **3 jeux de
paramètres par exercice**, mais ces 3 jeux deviennent `endurance` / `force` /
`puissance` (au lieu de `endurance` / `hypertrophie` / `force`). Les
3 transitions (`maintien`, `affutage`, `pic`) **ne stockent rien** dans
`dim_exercices` — elles sont entièrement dérivées par le moteur. La colonne
`strength_session_items.cycle_type` voit sa contrainte `CHECK` passer de
3 à 6 valeurs (les 6 du vocabulaire), via migration.

---

## 4. Le cas particulier `test` — note ouverte

Le plan réel ouvre par **W1 : tests 5RM**. C'est conceptuellement une
transition (semaine isolée, ni bloc ni charge de développement). Deux options,
**à trancher par le coach** :

- **Option A — `test` est une 7e valeur du vocabulaire.** Sémantique propre,
  le moteur génère une séance de tests (pas de prescription %1RM, l'objectif
  *est* de mesurer le 1RM). Mapping : **(D)** dérivé — aucune donnée
  `dim_exercices`, le moteur produit un protocole de test.
- **Option B — `test` n'est pas un cycle.** Les tests sont gérés hors
  périodisation (le Bilan Muscu a déjà une étape d'évaluation initiale, cf.
  `2026-05-17-bilan-muscu-mesocycle-design.md`). Le vocabulaire reste à 6.

**Recommandation : Option B** — l'évaluation 1RM existe déjà comme étape amont
du moteur Bilan Muscu ; en faire un cycle dupliquerait la responsabilité. Mais
si le coach veut que le template *lui-même* puisse planifier une semaine de
re-test en milieu de cycle, alors Option A. → question § 7.

---

## 5. Usage par les 7 templates — le contraste sprint ↔ fond

Le vocabulaire est **commun aux 7 templates** ; ce qui change est la *séquence*
(quels cycles, dans quel ordre, quelle durée relative).

| Template | Profil | Séquence type | Trait dominant |
|----------|--------|---------------|----------------|
| `sprint_50` | Sprint 50 m | `force_max` court → `puissance` long → `affutage` → `pic` | Bloc `puissance` dominant ; `prepa_generale` minimal voire absent (athlète déjà préparé) |
| `breaststroke` | Brasse | `prepa_generale` → `force_max` → `puissance` | `prepa_generale` un peu plus long (préhab hanche/adducteurs) |
| `backstroke` | Dos | `prepa_generale` → `force_max` → `puissance` | `prepa_generale` chargé en préhab d'épaule |
| `200m` | 200 m | `prepa_generale` → `force_max` → `puissance` | Équilibré force ↔ puissance |
| `400m` | 400 m | `prepa_generale` long → `force_max` → `puissance` court | Bascule vers la force-endurance |
| `distance` | 800/1500 m | `prepa_generale` **dominant** → `force_max` modéré → `puissance` court/optionnel | Le plus long ; `prepa_generale` (endurance de force + préhab) porte le template |
| `medley` | 4 nages | `prepa_generale` → `force_max` → `puissance` | Polyvalent, séquence médiane |

**Le contraste central.** Sprint et fond utilisent **le même jeu de 6 cycles** ;
la différence est un curseur de **durée relative des blocs** :

- **Sprinteur** — `force_max` puis surtout `puissance` longs ; `prepa_generale`
  réduit ou absent ; séquence courte (le plan réel : 10 semaines, pas de
  `prepa_generale` du tout). La période est tirée vers l'explosivité.
- **Fond (800/1500)** — `prepa_generale` long et dominant (endurance de force,
  gainage, préhab épaule/bas du dos — la prévention des blessures est l'enjeu
  n°1 vu les volumes nagés) ; `force_max` modéré ; `puissance` court ou
  réduit à quelques séances de qualité ; séquence longue.

C'est exactement le rôle du `prepa_generale` (= ancien `endurance`) de servir de
bloc « endurance de force » long pour le fond — sans réintroduire
l'hypertrophie. Le besoin du fond est couvert par **la durée du bloc
`prepa_generale`**, pas par un cycle supplémentaire.

> **Note.** Les séquences ci-dessus remplacent celles de
> `docs/plans/bilan-muscu-templates-sources.md`, qui utilisaient
> `endurance / hypertrophie / force / deload`. Ce document-là devra être
> ré-aligné une fois ce vocabulaire validé. La traduction est mécanique :
> `endurance` → `prepa_generale`, `hypertrophie` → **absorbé** par
> `prepa_generale` (volume) ou `force_max` (charge), `force` → scindé en
> `force_max` puis `puissance`, `deload` → `maintien` (en cours de bloc) ou
> `affutage` (avant compétition).

---

## 6. Impacts à instruire (hors périmètre de ce document)

Pour mémoire, une fois le vocabulaire validé :

1. **Migration `dim_exercices`** — renommer le triplet de colonnes
   `*_hypertrophie` en `*_puissance` (ou décider l'alternative « dérivé moteur »
   du § 3.3), puis re-seeder les 94 exercices avec les paramètres `puissance`.
2. **Migration `strength_session_items`** — étendre la contrainte `CHECK` de
   `cycle_type` de 3 à 6 valeurs.
3. **Templates** — réécrire les 7 séquences semaine-par-semaine avec le nouveau
   vocabulaire (§ 5).
4. **Moteur** (`mesocycleEngine.ts`) — implémenter la dérivation des
   3 transitions (`maintien`, `affutage`, `pic`).
5. **Doc** — ré-aligner `bilan-muscu-templates-sources.md`.

---

## 7. Questions ouvertes pour le coach

> **✅ Questions tranchées par la validation du vocabulaire à 6 cycles (coach,
> 2026-05-18) — voir `docs/implementation-log.md` §292. Section conservée pour
> mémoire.**

1. **`test` : cycle ou étape amont ?** Recommandation Option B (l'évaluation
   1RM est déjà une étape du Bilan Muscu). Veux-tu pouvoir planifier une
   semaine de re-test *au milieu* d'un template (→ Option A, 7e valeur) ?
2. **`puissance` : nouveaux paramètres par exercice, ou dérivés par le
   moteur ? — RÉSOLU (coach, 2026-05-18).** Décision : `puissance` utilise un
   **schéma de chargement générique au niveau cycle** (comme `maintien` /
   `affutage` / `pic`), **sans** colonne dédiée dans `dim_exercices`. Le
   triplet `*_hypertrophie` n'est pas renommé en `*_puissance` ; la
   prescription de puissance est dérivée par le moteur. Voir note § 3.3.
3. **`force_max` vs `puissance` : un seul bloc ou deux ?** La littérature et le
   plan réel les séparent (W2-3 puis W5-6). On garde donc deux blocs distincts.
   Confirmes-tu — ou préfères-tu un continuum `force` unique géré en interne ?
4. **`maintien` vs `affutage` : faut-il vraiment deux valeurs ?** Les deux sont
   des semaines à volume réduit / intensité tenue. Différence : `maintien` est
   *intra-bloc* (voyage, articulation), `affutage` est *pré-compétition*. Cette
   distinction t'est-elle utile au niveau du template, ou une seule valeur
   « semaine allégée » suffit ?
5. **Nommage.** OK pour les identifiants `prepa_generale` / `force_max` /
   `puissance` / `maintien` / `affutage` / `pic` ? Préférences sur les libellés
   FR affichés dans l'UI ?
6. **Hypertrophie — exception jeunes / sous-musclés.** Le vocabulaire l'écarte
   comme cycle. Es-tu d'accord pour qu'un éventuel besoin de volume sur un
   nageur jeune soit couvert par un bloc `prepa_generale` allongé, plutôt que
   par un cycle dédié ?

---

## Sources

- Bompa T., Buzzichelli C., *Periodization of Strength Training for Sports*,
  4e éd., Human Kinetics — cadre des phases (adaptation anatomique, force max,
  conversion en puissance, maintien, peaking).
- *From dry-land to the water: training and testing practices of strength and
  conditioning coaches in high level French sprint swimmers*, Frontiers in
  Sports and Active Living, 2023 — séquence développement (force max) →
  construction (puissance) → compétition (vitesse) ; 3-4 reps @ ~89 % 1RM ;
  ≥ 3 séances/sem.
  <https://www.frontiersin.org/journals/sports-and-active-living/articles/10.3389/fspor.2023.1338856/full>
- *Beyond the Pool: Improving Swimming Performance with Dryland Training*, NSCA
  Coach — mise en garde sur l'hypertrophie non spécifique (traînée, efficacité
  du geste) ; contraste sprint (haute intensité, pliométrie) / fond (basse
  intensité, reps élevées, gainage).
  <https://www.nsca.com/education/articles/nsca-coach/beyond-the-pool-improving-swimming-performance-with-dryland-training/>
- Crowley E. et al., *Periodization and Programming for Individual 400 m Medley
  Swimmers*, IJERPH 2021 — structure pré-saison → pic, contraste sprint /
  demi-fond. <https://pmc.ncbi.nlm.nih.gov/articles/PMC8296310/>
- *Identifying Optimal Overload and Taper in Elite Swimmers over Time*,
  PMC3873657 — effets de l'affûtage sur les fibres IIa, puissance de pointe.
  <https://pmc.ncbi.nlm.nih.gov/articles/PMC3873657/>
- *Simple & Effective Dryland Periodization Planning for Fast Swimming*,
  SwimSwam — modèle linéaire, échange progressif force → puissance vers le pic.
  <https://swimswam.com/simple-effective-dryland-periodization-planning-for-fast-swimming/>
- *3 Steps to Get Stronger Without Gaining Muscle Mass*, SwimSwam — force par
  efficacité neuronale sans gain de masse.
  <https://swimswam.com/3-steps-to-get-stronger-without-gaining-muscle-mass/>
- *The Muscular Hypertrophy in Swimming*, Science of Swimming — masse ajoutée,
  traînée frontale, amplitude articulaire.
  <https://www.e.swimsci.net/2023/05/bulky-muscles-in-swimming-unveiling.html>
- *How To Design a Taper and Peaking Phase*, GC Performance Training ;
  *Tapering and Peaking: Why and How*, Stronger by Science — distinction
  deload / taper, intensité maintenue vs volume réduit.
  <https://gcperformancetraining.com/gc-blog/perfectingdeloadtaper2> ·
  <https://www.strongerbyscience.com/tapering/>
- Plan réel « Prépa sprint 50 m » (10 semaines), Erstein Aquatic Club —
  séquence test → force max → puissance → affûtage → pic, sans hypertrophie ni
  endurance de force.
