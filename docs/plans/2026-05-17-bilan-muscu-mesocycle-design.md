# Design — « Bilan Muscu → Mésocycle »

*Document de design validé le 2026-05-17. Source d'inspiration : carrousel « SwimGPT — How to Design a Strength Program for Swimmers » (`docs/muscu plan/IMG_1176..1181.jpeg`).*

## 1. Objectif

Transformer une **évaluation structurée d'un nageur** en un **mésocycle de musculation
périodisé**, posé automatiquement sur sa timeline de planification muscu, le coach gardant
le contrôle *a posteriori*. Le « cerveau » n'est pas un LLM : c'est un **moteur de règles
déterministe** — le *Bucket System* du carrousel, codé.

### Le framework source (5 étapes SwimGPT)

1. **Assess the athlete** — mobilité, qualité de mouvement, performance.
2. **Mobilité + Mouvement** — flexion d'épaule, T-spine, hanche / contrôle scapulaire,
   alignement tronc-nuque, hip hinge. Mauvaise mobilité → ↓ streamline, ↓ efficacité,
   ↑ risque de blessure.
3. **Performance KPIs** — tests chiffrés ; « on ne peut pas optimiser ce qu'on ne mesure pas ».
4. **The Bucket System** — 6 « seaux » plus ou moins remplis ; on remplit d'abord les plus vides.
5. **Elite Programming** — pas de mauvais exercice, seulement de mauvaises applications ;
   monitoring continu.

## 2. Décisions de cadrage (brainstorming validé)

| # | Décision | Choix retenu |
|---|----------|--------------|
| 1 | Moteur de génération | **Déterministe** (règles encodées). Pas de LLM : auditable, RGPD-safe pour des mineurs, le coach voit le *pourquoi* de chaque choix. |
| 2 | Sortie du moteur | **Mésocycle périodisé** écrit sur la timeline de planif muscu existante (`strength_planning_*`). |
| 3 | Collecte de l'évaluation | **Auto-questionnaire nageur** (amont) **+ bilan coach guidé** (la qualité de mouvement n'est pas auto-notable). |
| 4 | Validation | **Génération directe et visible** par le nageur + **notification coach** non bloquante. Si une planif existait, **snapshot** → le coach peut **rejeter** pour restaurer la précédente. |
| 5 | Source du contenu | **Exercices taggés par seau + templates de périodisation** → nécessite un chantier de contenu (Chantier A). |
| 6 | Test puissance haut du corps | **Lancer vertical de médecine-ball 10 kg**, athlète allongé coudes au sol, propulsion verticale, mesure de la hauteur. |
| 7 | Protocole KPI | **Wizard guidé répétable**, accessible nageur *ou* coach, à deux (binôme), fiches-protocole finement décrites + GIFs. Mesures nageur-seul prises en compte immédiatement (`coach_reviewed=false`). |

## 3. Le pipeline en 5 phases

| Phase | Brique | Qui | Stockage |
|-------|--------|-----|----------|
| **0** | Questionnaire (douleurs, blessures, psy/motivation) | Nageur (téléphone) | `pain_reports` + `strength_assessments.questionnaire` |
| **1a** | Wizard KPIs — 5 tests chiffrés, répétable | Nageur **ou** coach, à deux | `strength_kpi_measurements` (série temporelle) |
| **1b** | Bilan mobilité / qualité de mouvement | Coach | `strength_assessments.physical_tests` |
| **2** | Scoring des 6 seaux | Moteur | `strength_assessments.bucket_scores` |
| **3** | Génération du mésocycle périodisé | Moteur | `strength_mesocycles` + `strength_planning_*` |
| **4** | Live + filet de sécurité | App | `strength_planning_snapshots` + `notifications` |
| **5** *(futur)* | Boucle de suivi / réévaluation | Moteur | feedback existant (RPE, fatigue, douleur) |

## 4. Les 6 seaux et leurs sources

| Seau | Source de mesure |
|------|------------------|
| Force bas du corps | Tirage isométrique mi-cuisse (IMTP) |
| Puissance bas du corps | Saut vertical + saut en longueur (broad jump) |
| Force haut du corps | Traction lestée (charge additionnelle max) |
| Puissance haut du corps | Lancer vertical médecine-ball 10 kg |
| Mobilité | Bilan mobilité coach (épaule / T-spine / hanche) |
| Psychologie | Questionnaire nageur (confiance, motivation, gestion du stress) + données `wellness` existantes |

Chaque seau possède une source dédiée — pas de trou dans le scoring.

## 5. Le wizard KPIs (5 tests)

Module **à part entière**, répétable, accessible par le nageur *ou* le coach. Chaque test est
une **fiche-protocole** reproductible : position de départ, consigne, **rôle du binôme**,
**GIF d'illustration**, méthode de mesure chiffrée, nombre d'essais retenus (meilleur de 3).

| KPI (`kpi_key`) | Mesure | Unité | Seau |
|-----------------|--------|-------|------|
| `vertical_jump` | Hauteur de saut vertical | cm | Puissance bas |
| `broad_jump` | Distance saut en longueur | cm | Puissance bas |
| `imtp` | Force tirage isométrique mi-cuisse | kg | Force bas |
| `weighted_pullup` | Charge additionnelle max sur 1 traction | kg | Force haut |
| `medball_vertical_throw` | Hauteur lancer médecine-ball 10 kg (allongé, coudes au sol) | cm | Puissance haut |

Les fiches-protocole et barèmes âge·sexe sont du **contenu statique** (`src/lib/strength/`),
les GIFs stockés dans le bucket Storage `exercise-gifs` existant.

## 6. Modèle de données

### Nouvelles tables

**`strength_assessments`** — un bilan par athlète
- `id` uuid PK · `athlete_id` int · `coach_id` int (nullable, qui a initié)
- `status` : `questionnaire_pending` → `bilan_pending` → `completed`
- `questionnaire` jsonb — douleurs, historique blessures, psy/motivation
- `physical_tests` jsonb — scores mobilité + qualité de mouvement (coach)
- `bucket_scores` jsonb — résultat du scoring (6 seaux 0-100 + priorités)
- `data_confidence` text — flag « données partielles » si une phase manque
- `created_at`, `updated_at`

**`strength_kpi_measurements`** — série temporelle des KPIs
- `id` uuid PK · `athlete_id` int
- `kpi_key` text · `value` numeric · `unit` text
- `attempts` jsonb (nullable) — essais bruts, on retient le meilleur
- `measured_at` timestamptz · `measured_by` int · `assisted_by` int (nullable, binôme)
- `source` text : `wizard_athlete` | `wizard_coach`
- `coach_reviewed` bool default `false`
- `notes` text (nullable)

**`strength_mesocycles`** — un mésocycle généré
- `id` uuid PK · `athlete_id` int · `assessment_id` uuid
- `generated_at` timestamptz · `generated_by` int (coach) · `engine_version` text
- `week_count` int · `start_week` date (lundi ISO) · `sessions_per_week` int
- `status` text : `active` | `reverted` | `superseded`
- `bucket_priorities` jsonb — snapshot du raisonnement du moteur
- `params` jsonb — paramètres de génération

**`strength_planning_snapshots`** — filet de sécurité revert
- `id` uuid PK · `mesocycle_id` uuid · `athlete_id` int
- `slot_overrides` jsonb — copie des `strength_planning_slot_overrides` avant écrasement
- `week_overrides` jsonb — copie des `strength_planning_week_overrides`
- `created_at`

**`strength_periodization_templates`** — archétypes de périodisation
- `id` · `name` · `week_count`
- `structure` jsonb — par semaine : focus (hypertrophie/force/puissance/déload),
  sets, reps, %intensité, RPE cible

### Extension du catalogue d'exercices

Sur `dim_exercices` (ou table jointe `strength_exercise_meta`) :
- `bucket` text — `lower_strength` | `lower_power` | `upper_strength` | `upper_power` | `mobility`
- `muscle_group` text · `movement_pattern` text (squat, hinge, push, pull…)
- `contraindication_zones` text[] — zones de douleur incompatibles
- `level` text — `beginner` | `intermediate` | `advanced`
- chaînage progression/régression entre variantes

### Réutilisé tel quel

`pain_reports`, `wellness`, `notifications`, `strength_planning_slots` /
`strength_planning_slot_overrides` / `strength_planning_week_*`, `dim_sessions`.

## 7. Le moteur déterministe

Fonctions **TS pures**, sans I/O, dans `src/lib/strength/mesocycleEngine.ts` —
100 % testables en unitaire.

1. **`scoreBuckets`** — normalise chaque test via barèmes âge·sexe → score 0-100 par seau.
2. **`prioritizeBuckets`** — trie les seaux du plus vide au plus plein.
   **Override sécurité** : une douleur intense *ou* une dysfonction de mouvement force un
   bloc correctif/mobilité en priorité 1, quel que soit le score.
3. **`allocateVolume`** — répartit les séances/semaine : les 2 seaux les plus faibles =
   focus (~60 % du volume), les autres = maintien (~40 %), mobilité en échauffement
   systématique.
4. **`selectExercises`** — pioche dans la bibliothèque taggée par seau + niveau de
   l'athlète ; **exclut** tout exercice contre-indiqué par une zone de douleur déclarée
   (substitution par une régression).
5. **`periodize`** — applique un template (ex. 6 sem. → 2 hypertrophie / 2 force /
   1 puissance / 1 déload) ; exercices stables sur le bloc, charge montante.
6. **`generateMesocycle`** — orchestrateur top-level → produit l'objet mésocycle.

**Données partielles** : le moteur tourne sur ce qui existe. Bilan mobilité/mouvement
manquant → seau mobilité en priorité par défaut (conservateur) + `data_confidence`
abaissé. La génération n'est jamais bloquée.

**Persistance** : RPC transactionnelle `apply_strength_mesocycle` (SECURITY DEFINER) qui,
en une transaction : snapshot des overrides existants → insert `strength_mesocycles` →
écrit les `strength_planning_slot_overrides` → crée la notification coach.
RPC `revert_strength_mesocycle` : restaure le snapshot, marque le mésocycle `reverted`.

> Ces RPC touchent des tables sous RLS → **tests RLS d'intégration requis**
> (`npm run test:rls`, cf. `docs/rls-testing.md`).

## 8. Parcours utilisateur

**Coach** — depuis l'écran planif muscu (`StrengthPlanningScreen.tsx`) → bouton
« Générer un mésocycle » sur un nageur → choisit cadence (séances/sem.) + durée →
déclenche le questionnaire nageur → renseigne le bilan mobilité/mouvement → aperçu →
génère.

**Nageur** — notif « Ton coach demande un bilan » → remplit le questionnaire ; peut lancer
le wizard KPIs quand il veut (seul avec un binôme ou avec le coach) → voit plus tard son
nouveau plan apparaître sur sa timeline.

**Filet de sécurité** — à la génération, si une planif existait → snapshot. Le coach
reçoit « Nouveau mésocycle généré pour X » → il peut **éditer** chaque séance (builder
existant) ou **rejeter** → restauration du snapshot. Rien ne bloque le nageur entre-temps.

## 9. Découpage en chantiers

| Chantier | Contenu | Dépend de |
|----------|---------|-----------|
| **A — Contenu** | Bibliothèque d'exercices taggée (seau / muscle / contre-indications) · barèmes âge·sexe · templates de périodisation · fiches-protocole KPI + GIFs | — (parallélisable) |
| **B — Évaluation** | Tables `strength_assessments` / `strength_kpi_measurements` · questionnaire nageur · wizard KPIs · écran bilan coach | — |
| **C — Moteur** | `mesocycleEngine.ts` : scoring + priorisation + allocation + sélection + périodisation (TS pur, testé unitairement) | A |
| **D — Intégration** | RPC `apply_strength_mesocycle` / `revert_strength_mesocycle` · snapshot/revert · notifications · bouton coach + aperçu | B, C |
| **E — Suivi** *(futur)* | Boucle monitoring (RPE/fatigue/douleur) → suggestion de réévaluation en fin de mésocycle | D |

## 10. Points ouverts (à trancher en phase d'implémentation)

- **Barèmes âge·sexe** — sources de référence à choisir/valider pour la normalisation
  0-100 des 5 KPIs.
- **Templates de périodisation** — nombre et structure exacte (6 / 8 / 10 semaines).
- **Catalogue d'exercices** — taguer les ~59 `dim_exercices` existants vs créer une
  bibliothèque nageur dédiée (probablement un mix : tagger + compléter).
- **Mapping exact test → score de seau** — formules de normalisation par KPI.
- **Wizard mobilité** *(extension future)* — certains tests de mobilité (ROM épaule)
  pourraient rejoindre le wizard en binôme ; la qualité de mouvement reste coach-only.
