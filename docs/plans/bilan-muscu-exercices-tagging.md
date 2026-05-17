# Bilan Muscu — Tagging des 94 exercices du catalogue `dim_exercices`

> **PROPOSITION — à valider par le coach.**
> Ce document n'est PAS un état définitif. Il propose un tagging des 94 exercices
> de la table `dim_exercices` pour que le moteur de génération du « Bilan Muscu »
> puisse sélectionner les exercices. Le coach doit relire, corriger les choix
> ambigus (notamment les exercices `core`, voir § Questions ouvertes), puis le
> tagging sera injecté en base.

---

## 1. Objectif

Chaque exercice reçoit 3 tags :

1. **`bucket`** — la « famille » à laquelle l'exercice appartient. **Exactement
   une** des 5 valeurs : `lower_strength`, `lower_power`, `upper_strength`,
   `upper_power`, `mobility`. Il n'existe **pas** de bucket `core` ni
   `psychology`.
2. **`contraindication_zones`** — liste (éventuellement vide) des zones de
   douleur corporelle qui rendent l'exercice déconseillé si le nageur signale
   une douleur à cet endroit.
3. **`level`** — `beginner`, `intermediate` ou `advanced`, selon l'exigence
   technique/de force de l'exercice.

---

## 2. Vocabulaire des zones corporelles (canonique)

Les clés ci-dessous sont **les identifiants exacts** utilisés par l'UI de
douleur corporelle (`src/components/wellness/BodySvg.tsx`, constante
`BODY_ZONES`). Le champ `contraindication_zones` n'utilise **que** ces clés —
aucune autre.

| Clé              | Libellé UI  | Vue   |
|------------------|-------------|-------|
| `left_shoulder`  | Épaule G    | face  |
| `right_shoulder` | Épaule D    | face  |
| `left_elbow`     | Coude G     | face  |
| `right_elbow`    | Coude D     | face  |
| `left_wrist`     | Poignet G   | face  |
| `right_wrist`    | Poignet D   | face  |
| `left_hip`       | Hanche G    | face  |
| `right_hip`      | Hanche D    | face  |
| `left_knee`      | Genou G     | face  |
| `right_knee`     | Genou D     | face  |
| `left_ankle`     | Cheville G  | face  |
| `right_ankle`    | Cheville D  | face  |
| `neck`           | Nuque       | dos   |
| `upper_back`     | Dos haut    | dos   |
| `lower_back`     | Lombaires   | dos   |
| `left_calf`      | Mollet G    | dos   |

### Convention « gauche/droite » appliquée

Le vocabulaire est **latéralisé** (G/D séparés) pour toutes les articulations
des membres, mais il n'existe **qu'un seul mollet** (`left_calf`) côté dos —
pas de `right_calf`.

Comme presque tous les exercices du catalogue sont bilatéraux (ou alternés
gauche/droite), la proposition adopte la convention suivante :

- **Mouvement bilatéral** chargeant une articulation → on liste **les deux
  côtés** de cette articulation (ex. développé militaire → `left_shoulder` +
  `right_shoulder`).
- **Zone de mollet** → on utilise `left_calf` comme **proxy unique de « mollet »**
  (le vocabulaire UI n'offre pas de mollet droit). À valider par le coach :
  c'est une limite du vocabulaire actuel de l'app, pas un choix métier.
- Le moteur de génération devra interpréter « douleur à un genou » comme
  suffisante pour exclure un exercice tagué `left_knee, right_knee`.

> **Limite connue (à arbitrer)** : la grille de douleur ne couvre pas
> explicitement les **adducteurs / aine** ni les **ischios / face postérieure
> de cuisse**. Pour les exercices qui chargent fortement ces zones (Copenhagen
> Plank, fente latérale ; curl nordique, RDL), la zone retenue est la plus
> proche disponible (`left_hip`/`right_hip` pour l'aine, `lower_back` pour la
> chaîne postérieure lombaire). Voir § Questions ouvertes.

---

## 3. Tableau de tagging — 94 exercices

> `contraindication_zones` vide = `[]` (aucune zone limitante identifiée).

| id | nom_exercice | exercise_subtype | bucket | contraindication_zones | level |
|----|--------------|------------------|--------|------------------------|-------|
| 1 | Développé militaire | strength_accessory | upper_strength | `left_shoulder, right_shoulder, lower_back` | intermediate |
| 2 | Développé couché barre | strength_accessory | upper_strength | `left_shoulder, right_shoulder, left_elbow, right_elbow` | intermediate |
| 3 | Soulevé de terre roumain | strength_accessory | lower_strength | `lower_back` | intermediate |
| 4 | Rowing haltères incliné | strength_accessory | upper_strength | `left_shoulder, right_shoulder` | beginner |
| 5 | Tractions prise neutre | strength_accessory | upper_strength | `left_shoulder, right_shoulder, left_elbow, right_elbow` | intermediate |
| 6 | Squat avant | strength_accessory | lower_strength | `left_knee, right_knee, lower_back, left_wrist, right_wrist` | intermediate |
| 7 | Soulevé de terre trap bar | power | lower_power | `lower_back` | intermediate |
| 8 | Box Jump | plyometric | lower_power | `left_knee, right_knee, left_ankle, right_ankle` | intermediate |
| 9 | Lancer de médecine-ball | power | upper_power | `left_shoulder, right_shoulder, lower_back` | beginner |
| 10 | Corde à sauter | conditioning | lower_power | `left_ankle, right_ankle, left_calf` | beginner |
| 11 | Tirage vertical unilatéral supination assis bas | strength_accessory | upper_strength | `left_shoulder, right_shoulder, left_elbow, right_elbow` | beginner |
| 12 | Straight-Arm Pulldown barre (schéma papillon) | power | upper_strength | `left_shoulder, right_shoulder` | beginner |
| 13 | Tractions lestées | power | upper_strength | `left_shoulder, right_shoulder, left_elbow, right_elbow` | advanced |
| 14 | Dips | strength_accessory | upper_strength | `left_shoulder, right_shoulder, left_elbow, right_elbow` | intermediate |
| 15 | L-Sit | core | upper_strength | `left_wrist, right_wrist, left_hip, right_hip` | advanced |
| 16 | Tirage vertical prise neutre | strength_accessory | upper_strength | `left_shoulder, right_shoulder, left_elbow, right_elbow` | beginner |
| 17 | Bench Pull explosif | power | upper_power | `left_shoulder, right_shoulder` | intermediate |
| 18 | Rowing unilatéral haltère | strength_accessory | upper_strength | `left_shoulder, right_shoulder, lower_back` | beginner |
| 19 | Pull-over barre | strength_accessory | upper_strength | `left_shoulder, right_shoulder` | intermediate |
| 20 | Squat sauté chargé léger | plyometric | lower_power | `left_knee, right_knee, left_ankle, right_ankle, lower_back` | intermediate |
| 21 | Saut en longueur | plyometric | lower_power | `left_knee, right_knee, left_ankle, right_ankle` | intermediate |
| 22 | Hip Thrust explosif | power | lower_power | `lower_back, left_hip, right_hip` | intermediate |
| 23 | Relevés de jambes suspendu | core | upper_strength | `left_shoulder, right_shoulder, lower_back` | intermediate |
| 24 | Y-T-W épaules | prehab | mobility | `[]` | beginner |
| 25 | Développé incliné haltères avec rotation | _(null)_ | upper_strength | `left_shoulder, right_shoulder, lower_back` | intermediate |
| 26 | Squat arrière | _(null)_ | lower_strength | `left_knee, right_knee, lower_back` | intermediate |
| 27 | Squat sauté | _(null)_ | lower_power | `left_knee, right_knee, left_ankle, right_ankle` | intermediate |
| 28 | Flexion ischio-jambiers | _(null)_ | lower_strength | `left_knee, right_knee` | beginner |
| 29 | Presse à cuisses | _(null)_ | lower_strength | `left_knee, right_knee` | beginner |
| 30 | Farmer Walk | _(null)_ | upper_strength | `upper_back, left_wrist, right_wrist` | beginner |
| 31 | Burpee | _(null)_ | lower_power | `left_knee, right_knee, left_wrist, right_wrist, left_shoulder, right_shoulder` | beginner |
| 32 | Abdos | _(null)_ | upper_strength | `neck, lower_back` | beginner |
| 33 | Squat bulgare | _(null)_ | lower_strength | `left_knee, right_knee, left_hip, right_hip` | intermediate |
| 34 | Step-Up | _(null)_ | lower_strength | `left_knee, right_knee` | beginner |
| 35 | Fente inversée | _(null)_ | lower_strength | `left_knee, right_knee, left_hip, right_hip` | beginner |
| 36 | Soulevé de terre roumain unilat. | _(null)_ | lower_strength | `lower_back, left_hip, right_hip` | intermediate |
| 37 | Fente latérale | _(null)_ | lower_strength | `left_knee, right_knee, left_hip, right_hip` | beginner |
| 38 | Curl nordique | _(null)_ | lower_strength | `left_knee, right_knee` | advanced |
| 39 | Flexion ischio-jambiers glissée | _(null)_ | lower_strength | `left_knee, right_knee, lower_back` | intermediate |
| 40 | Extension dorsale 45° | _(null)_ | lower_strength | `lower_back` | beginner |
| 41 | Mollets debout | _(null)_ | lower_strength | `left_ankle, right_ankle, left_calf` | beginner |
| 42 | Mollets assis (soléaire) | _(null)_ | lower_strength | `left_ankle, right_ankle, left_calf` | beginner |
| 43 | Pogo Hops | _(null)_ | lower_power | `left_ankle, right_ankle, left_calf, left_knee, right_knee` | intermediate |
| 44 | Maintien isométrique cheville | _(null)_ | mobility | `left_ankle, right_ankle, left_calf` | beginner |
| 45 | Pallof Press | _(null)_ | upper_strength | `[]` | beginner |
| 46 | Dead Bug | _(null)_ | upper_strength | `[]` | beginner |
| 47 | Planche latérale | _(null)_ | upper_strength | `left_shoulder, right_shoulder` | beginner |
| 48 | Suitcase Carry | _(null)_ | upper_strength | `left_wrist, right_wrist, lower_back` | beginner |
| 49 | Face Pull | _(null)_ | mobility | `[]` | beginner |
| 50 | Rotation externe épaule (câble/élastique) | _(null)_ | mobility | `[]` | beginner |
| 51 | Serratus Wall Slide | _(null)_ | mobility | `[]` | beginner |
| 52 | Pompe scapulaire (Scap Push-Up) | _(null)_ | mobility | `left_wrist, right_wrist` | beginner |
| 53 | Lancer rotatif médecine-ball | _(null)_ | upper_power | `lower_back, left_shoulder, right_shoulder` | intermediate |
| 54 | Lancer latéral médecine-ball | _(null)_ | upper_power | `lower_back, left_shoulder, right_shoulder` | intermediate |
| 55 | Lancer type poids médecine-ball | _(null)_ | upper_power | `left_shoulder, right_shoulder, lower_back` | intermediate |
| 56 | Drop Jump to Stick | _(null)_ | lower_power | `left_knee, right_knee, left_ankle, right_ankle` | advanced |
| 57 | Maintien isométrique fente | _(null)_ | lower_strength | `left_knee, right_knee, left_hip, right_hip` | beginner |
| 58 | Planche Copenhague | _(null)_ | lower_strength | `left_hip, right_hip` | intermediate |
| 59 | Hip Airplane | _(null)_ | mobility | `left_hip, right_hip` | intermediate |
| 60 | Bench Pull | _(null)_ | upper_strength | `left_shoulder, right_shoulder` | intermediate |
| 61 | Gainage lesté | _(null)_ | upper_strength | `lower_back, neck` | intermediate |
| 62 | Front Lever | _(null)_ | upper_strength | `left_shoulder, right_shoulder, left_elbow, right_elbow, lower_back` | advanced |
| 63 | Power Clean | _(null)_ | lower_power | `lower_back, left_wrist, right_wrist, left_shoulder, right_shoulder` | advanced |
| 64 | Hang Clean | _(null)_ | lower_power | `lower_back, left_wrist, right_wrist, left_shoulder, right_shoulder` | advanced |
| 65 | Front Lever — Tuck Hold | _(null)_ | upper_strength | `left_shoulder, right_shoulder, left_elbow, right_elbow` | intermediate |
| 66 | Front Lever — Advanced Tuck Hold | _(null)_ | upper_strength | `left_shoulder, right_shoulder, left_elbow, right_elbow` | advanced |
| 67 | Front Lever — Négatives | _(null)_ | upper_strength | `left_shoulder, right_shoulder, left_elbow, right_elbow, lower_back` | advanced |
| 68 | Front Lever — Ice Cream Maker | _(null)_ | upper_power | `left_shoulder, right_shoulder, left_elbow, right_elbow, lower_back` | advanced |
| 69 | Front Lever Raises (tuck) | _(null)_ | upper_strength | `left_shoulder, right_shoulder, left_elbow, right_elbow` | advanced |
| 70 | Tirage inversé (Australian Pull-Up) | _(null)_ | upper_strength | `left_shoulder, right_shoulder, left_elbow, right_elbow` | beginner |
| 71 | Scapula Pull-Up | _(null)_ | mobility | `left_shoulder, right_shoulder` | beginner |
| 72 | Ab Wheel Rollout | core | upper_strength | `lower_back, left_shoulder, right_shoulder` | advanced |
| 73 | Rowing élastique unilatéral debout | strength_accessory | upper_strength | `left_shoulder, right_shoulder` | beginner |
| 74 | Rowing élastique penché bilatéral | strength_accessory | upper_strength | `left_shoulder, right_shoulder, lower_back` | beginner |
| 75 | Plank walkout (Inchworm) | core | upper_strength | `left_shoulder, right_shoulder, left_wrist, right_wrist, lower_back` | beginner |
| 76 | Fente sautée alternée | plyometric | lower_power | `left_knee, right_knee, left_ankle, right_ankle` | intermediate |
| 77 | Pike Push-Up (pieds surélevés) | strength_accessory | upper_strength | `left_shoulder, right_shoulder, left_wrist, right_wrist, left_elbow, right_elbow` | intermediate |
| 78 | Hollow Body Hold | core | upper_strength | `lower_back, neck` | beginner |
| 79 | Planche instable (Swiss Ball) | core | upper_strength | `left_shoulder, right_shoulder, lower_back` | intermediate |
| 80 | Superman dynamique | core | lower_strength | `lower_back` | beginner |
| 81 | Mountain Climbers | conditioning | lower_power | `left_wrist, right_wrist, left_shoulder, right_shoulder, lower_back` | beginner |
| 82 | Planche dynamique (touché épaule) | core | upper_strength | `left_shoulder, right_shoulder, left_wrist, right_wrist` | beginner |
| 83 | Streamline Hold au sol | core | mobility | `left_shoulder, right_shoulder, lower_back` | beginner |
| 84 | Shoulder Dislocates | prehab | mobility | `left_shoulder, right_shoulder` | beginner |
| 85 | 90/90 Hip Switch | prehab | mobility | `left_hip, right_hip` | beginner |
| 86 | Hip Flexor Stretch | prehab | mobility | `left_hip, right_hip` | beginner |
| 87 | Cat-Cow | prehab | mobility | `[]` | beginner |
| 88 | Ankle Stretch | prehab | mobility | `left_ankle, right_ankle` | beginner |
| 89 | Flexion cheville lestée (kettlebell) | prehab | mobility | `left_ankle, right_ankle, left_knee, right_knee` | beginner |
| 90 | Trap Bar Jump | power | lower_power | `lower_back, left_ankle, right_ankle` | intermediate |
| 91 | Pompes claquées | _(null)_ | upper_power | `left_shoulder, right_shoulder, left_wrist, right_wrist, left_elbow, right_elbow` | advanced |
| 92 | départ avec ceinture | _(null)_ | lower_power | `left_knee, right_knee, left_ankle, right_ankle` | intermediate |
| 93 | glute machine | _(null)_ | lower_strength | `left_hip, right_hip` | beginner |
| 94 | elastique jump | _(null)_ | lower_power | `left_knee, right_knee, left_ankle, right_ankle` | intermediate |

---

## 4. Répartition par bucket (vérification)

Décompte recalculé ligne par ligne à partir de la colonne `bucket` du
tableau § 3 (source de vérité).

| bucket            | nombre d'exercices |
|-------------------|--------------------|
| `lower_strength`  | 19 |
| `lower_power`     | 17 |
| `upper_strength`  | 36 |
| `upper_power`     | 7  |
| `mobility`        | 15 |
| **Total**         | **94** |

Détail des ids par bucket :

- **`lower_strength` (19)** — ids : 3, 6, 26, 28, 29, 33, 34, 35, 36, 37, 38,
  39, 40, 41, 42, 57, 58, 80, 93.
- **`lower_power` (17)** — ids : 7, 8, 10, 20, 21, 22, 27, 31, 43, 56, 63, 64,
  76, 81, 90, 92, 94.
- **`upper_strength` (36)** — ids : 1, 2, 4, 5, 11, 12, 13, 14, 15, 16, 18, 19,
  23, 25, 30, 32, 45, 46, 47, 48, 60, 61, 62, 65, 66, 67, 69, 70, 72, 73, 74,
  75, 77, 78, 79, 82.
- **`upper_power` (7)** — ids : 9, 17, 53, 54, 55, 68, 91.
- **`mobility` (15)** — ids : 24, 44, 49, 50, 51, 52, 59, 71, 83, 84, 85, 86,
  87, 88, 89.

**Vérification : 19 + 17 + 36 + 7 + 15 = 94.** ✅ Les 94 exercices sont couverts,
sans trou ni doublon.

---

## 5. Questions ouvertes pour le coach

### O-1 — Exercices `core` : bucket ambigu (POINT PRINCIPAL)

Il n'existe **pas de bucket `core`**. Tous les exercices ci-dessous ont été
rangés par défaut, le plus souvent en `upper_strength` (gainage anti-extension
/ anti-rotation = travail de tronc qui « tient » la ceinture scapulaire). Mais
plusieurs pourraient légitimement aller ailleurs. **Le coach doit trancher
chacun :**

| id | nom | exercise_subtype | bucket proposé | hésitation |
|----|-----|------------------|----------------|------------|
| 15 | L-Sit | core | `upper_strength` | Très fort sur fléchisseurs de hanche + triceps + dépression scapulaire — pourrait être `lower_strength` (hip flexors) ou rester `upper_strength`. |
| 23 | Relevés de jambes suspendu | core | `upper_strength` | Grip + suspension = haut du corps, mais le travail moteur est hanche/abdos. |
| 72 | Ab Wheel Rollout | core | `upper_strength` | Forte composante grand dorsal / épaule en extension → `upper_strength` cohérent, mais c'est avant tout du tronc. `advanced`. |
| 75 | Plank walkout (Inchworm) | core | `upper_strength` | Substitut de l'Ab Wheel — même logique. |
| 78 | Hollow Body Hold | core | `upper_strength` | Gainage pur, aucune charge membre — pourrait être `mobility` (travail de posture) selon l'intention du coach. |
| 79 | Planche instable (Swiss Ball) | core | `upper_strength` | Gainage + stabilité scapulaire. |
| 80 | Superman dynamique | core | `lower_strength` | **Exception** : rangé en `lower_strength` car extension de hanche/chaîne postérieure dominante. À confirmer — pourrait aussi être `upper_strength`. |
| 82 | Planche dynamique (touché épaule) | core | `upper_strength` | Anti-rotation + appui bras. |
| 83 | Streamline Hold au sol | core | `mobility` | **Exception** : rangé en `mobility` car c'est une posture de gainage très orientée « tenue de position / hydrodynamisme » plus que renforcement. Pourrait être `upper_strength`. |
| 32 | Abdos | _(null)_ | `upper_strength` | Libellé générique « Abdos » — pas de subtype mais c'est clairement un exercice de tronc. Même problème de bucket que les `core`. Le coach voudra peut-être le préciser ou le scinder. |

> **Recommandation** : si le moteur de génération a besoin d'une vraie notion
> de « tronc / gainage », il faudrait soit ajouter un 6ᵉ bucket `core`, soit un
> tag secondaire `is_core`. En l'état (5 buckets imposés), le rangement
> ci-dessus est un compromis.

### O-2 — Exercices au libellé pauvre / sans description

Plusieurs entrées récentes n'ont **ni `exercise_subtype` ni description** — le
tagging repose uniquement sur le nom, parfois ambigu :

- **id 60 — « Bench Pull »** : supposé tirage horizontal banc-couché (force) →
  `upper_strength`. À confirmer (vs la variante explosive id 17).
- **id 61 — « Gainage lesté »** : supposé planche/gainage avec charge →
  `upper_strength`. À confirmer (pourrait être `core` si bucket créé).
- **id 91 — « Pompes claquées »** : pompes pliométriques (claquées) →
  `upper_power`, `advanced`. À confirmer.
- **id 92 — « départ avec ceinture »** : libellé minuscule, pas de description.
  Interprété comme **travail de départ plongé en résistance (ceinture
  élastique au plot)** → `lower_power`, `intermediate`. **Très incertain — le
  coach doit confirmer la nature exacte de l'exercice.**
- **id 93 — « glute machine »** (description : « W sur les 2 jambes ») :
  interprété comme machine fessiers (glute kickback / hip extension machine,
  bilatérale) → `lower_strength`, `beginner`. À confirmer — la mention « W »
  est obscure.
- **id 94 — « elastique jump »** : interprété comme saut avec résistance
  élastique → `lower_power`, `intermediate`. À confirmer.

### O-3 — Buckets `power` vs `strength` à la frontière

- **id 12 — Straight-Arm Pulldown « schéma papillon »** : `exercise_subtype =
  power` en base, mais l'exercice est décrit comme un travail technique de
  prise d'eau à amplitude contrôlée, **pas un mouvement balistique**. Rangé en
  `upper_strength` (et non `upper_power`) malgré le subtype. À arbitrer : si le
  coach veut respecter strictement le subtype `power`, le passer en
  `upper_power`.
- **id 13 — Tractions lestées** : `exercise_subtype = power` mais la
  description parle de **force maximale** (charge lourde, exécution stricte),
  pas de vitesse. Rangé en `upper_strength`. Même arbitrage que id 12.
- **id 7 — Soulevé de terre trap bar** : `exercise_subtype = power`, rangé en
  `lower_power` car la description insiste sur « l'intention explosive ». Mais
  un trap bar deadlift classique est un exercice de force. Le coach peut
  préférer `lower_strength`.
- **id 68 — Front Lever Ice Cream Maker** : seul exercice de la série Front
  Lever rangé en `upper_power` (mouvement dynamique tiré/poussé) ; les autres
  (62, 65, 66, 67, 69) sont en `upper_strength` (tenues isométriques /
  négatives). À valider.

### O-4 — `lower` vs `upper` pour les exercices full-body / med-ball

- **ids 9, 53, 54, 55 — lancers de médecine-ball** : rangés en `upper_power`
  car le geste final est une projection bras/épaules. Mais ils sont décrits
  comme des transferts **hanches → épaules** : le coach peut considérer
  certains (lancer rotatif id 53, lancer latéral id 54) comme un travail de
  puissance globale. Pas de bucket « full-body / rotational ».
- **id 31 — Burpee** et **id 81 — Mountain Climbers** : rangés en
  `lower_power` (composante saut / drive jambes en `conditioning`). Ce sont des
  exercices métaboliques full-body — choix discutable, le coach peut préférer
  `upper_strength` (gros volume de poussée bras) ou les exclure du Bilan Muscu.
- **id 30 — Farmer Walk** et **id 48 — Suitcase Carry** : carries rangés en
  `upper_strength` (grip, trapèzes, stabilité scapulaire). Ils chargent aussi
  fortement jambes et tronc. À confirmer.

### O-5 — Contraindications incertaines (limites du vocabulaire de zones)

La grille de douleur **n'a pas de zone « aine/adducteurs » ni « ischios »** :

- **id 37 — Fente latérale** et **id 58 — Planche Copenhague** : chargent
  surtout les **adducteurs / l'aine**. Faute de zone dédiée, `left_hip` +
  `right_hip` est utilisé comme proxy. Si un nageur a une douleur d'aine, il ne
  la signalera peut-être pas comme « hanche » dans l'UI → **le filtrage peut
  manquer ces cas**. À signaler au coach comme limite produit.
- **id 38 — Curl nordique** et **id 28/39 — leg curls** : chargent les
  **ischios**. Zone retenue : `left_knee` + `right_knee` (le curl mobilise le
  genou en flexion). Imparfait — une douleur d'ischio pure n'a pas de clé.
- **id 3, 36 — RDL / RDL unilatéral** : chargent ischios + lombaires. Zone
  retenue : `lower_back` (± `hip`). La composante ischio n'est pas couverte.
- **Mollets (ids 10, 41, 42, 43, 44)** : `left_calf` est utilisé comme **zone
  unique de mollet** faute de `right_calf` dans le vocabulaire. Le coach et/ou
  l'équipe produit doivent décider si on accepte cette asymétrie ou si la
  grille de douleur doit gagner un `right_calf`.
- **Cou/nuque (`neck`)** : ajouté sur les exercices d'abdos en flexion (id 32),
  Hollow Body (id 78), gainage lesté (id 61) où une mauvaise exécution tire sur
  la nuque. Discutable — à valider.

### O-6 — Niveau (`level`) à la frontière

- **id 38 — Curl nordique** : classé `advanced`. C'est un exercice sans charge
  externe et techniquement simple, mais l'exigence excentrique est très élevée
  (peu de gens contrôlent la descente). Le coach peut préférer `intermediate`.
- **id 56 — Drop Jump to Stick** : classé `advanced` (réception depuis hauteur
  = risque, demande maîtrise de l'amorti). Pourrait être `intermediate`.
- **id 91 — Pompes claquées** : classé `advanced` (pliométrie du haut du
  corps). À confirmer faute de description.
- **Série Front Lever (62, 65–69)** : niveaux échelonnés selon la progression
  calisthénique standard (Tuck = `intermediate`, Advanced Tuck / Négatives /
  Raises / Ice Cream Maker / full = `advanced`). À valider avec le coach
  calisthénie.

---

## 6. Récapitulatif des points à valider

1. **O-1** : trancher le bucket des 10 exercices `core` (point principal).
2. **O-2** : confirmer la nature de 6 exercices sans description (ids 60, 61,
   91, 92, 93, 94).
3. **O-3** : arbitrer `power` vs `strength` (ids 7, 12, 13, 68).
4. **O-4** : valider le rangement `lower`/`upper` des exercices full-body
   (ids 9, 30, 31, 48, 53, 54, 55, 81).
5. **O-5** : décider quoi faire des zones manquantes (aine, ischios,
   mollet droit).
6. **O-6** : revoir les niveaux frontières (ids 38, 56, 91, série Front Lever).
