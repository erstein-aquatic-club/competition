# Design — Moteur de génération du mésocycle (Bilan Muscu, Chantiers C + D)

*Document de design validé le 2026-05-18. Adapte le design global
`docs/plans/2026-05-17-bilan-muscu-mesocycle-design.md` (Chantiers C « Moteur »
et D « Intégration ») au modèle livré par le Chantier A — templates de
périodisation à durée variable (`docs/plans/2026-05-18-bilan-muscu-templates-duree-variable-design.md`).*

## 1. Objet

Transformer l'**évaluation Bilan Muscu** d'un nageur (Chantier B, livré) en un
**mésocycle de musculation périodisé**, posé sur sa timeline de planification
muscu. Le « cerveau » est un **moteur de règles déterministe** — pas de LLM
(auditable, RGPD-safe pour des mineurs, le coach voit le *pourquoi*).

Ce chantier livre le **moteur** (Chantier C) **et** son **intégration**
(Chantier D) : le nageur génère son mésocycle en autonomie, le coach garde la
visibilité et la main.

## 2. Décisions de cadrage (brainstorming validé)

| # | Décision | Choix retenu |
|---|----------|--------------|
| 1 | Périmètre | **C + D** — moteur **et** intégration, immédiatement utilisable. |
| 2 | Déclenchement | **Génération autonome par le nageur** : il choisit l'épreuve, la famille et la durée, et lance lui-même. Le coach a la visibilité complète + l'édition/revert *a posteriori*, **sans être un point de blocage**. |
| 3 | Priorisation des seaux | **Score combiné** : priorité d'un seau = `bucket_emphasis × (100 − score_nageur)`. Un seau faible **et** sollicité par l'épreuve ressort en tête. |
| 4 | KPI détente verticale | Devient une **mesure de puissance** : poids saisi + temps de vol chronométré → hauteur → puissance (Sayers). Cf. § 4. |
| 5 | Choix de la durée cible | Assisté par l'affichage des **prochaines échéances** + le nombre de semaines qui en sépare le nageur. |

Décisions héritées du design global (non re-litigées) : moteur déterministe ;
sortie écrite sur la timeline `strength_planning_*` existante ; snapshot/revert
comme filet de sécurité.

## 3. Périmètre & pipeline

```
Nageur (évaluation déjà complétée — Chantier B)
   → « Générer mon mésocycle » → choisit épreuve + famille + durée cible
   → moteur déterministe → APERÇU (plan périodisé + raisonnement des seaux)
   → confirme → mésocycle matérialisé sur sa timeline muscu
   → coach notifié : visibilité complète, édition / rejet possibles
```

**Dans le périmètre** : révision du KPI détente (§ 4) · moteur `mesocycleEngine.ts`
(§ 5) · tables `strength_mesocycles` + `strength_planning_snapshots` (§ 6) · RPC
`apply`/`revert` (§ 7) · écran nageur de génération + aperçu, notification +
visibilité/édition/revert coach (§ 8).

**Hors périmètre** : Chantier E (boucle de suivi / réévaluation en fin de
mésocycle).

## 4. Révision du KPI « détente verticale » → puissance

Le KPI `vertical_jump` passe d'une mesure de hauteur à une mesure de **puissance**
(le seau s'appelle « puissance bas du corps »).

- **Protocole** (`src/lib/strength/kpiProtocols.ts`) : le nageur saisit son
  **poids** ; 3 sauts stricts (flexion puis saut **jambes tendues**, sans tuck —
  le tuck fausserait le temps de vol) ; un binôme chronomètre le **temps de vol**
  de chaque essai ; meilleur des 3 retenu.
- **Calcul** : temps de vol `t` → hauteur `h = g·t²/8` → puissance
  `P = 60.7·h(cm) + 45.3·poids(kg) − 2055` (équation de Sayers, *Peak Power*).
- **Barème** (`src/lib/strength/kpiBaremes.ts`) : le barème `vertical_jump`
  passe de la hauteur (cm) à la **puissance (W)**, par sexe et bande d'âge — à
  re-sourcer (le barème actuel était déjà flaggé « placeholder » au §290). La
  fonction `kpiScore` (interpolation) est agnostique de l'unité, inchangée.
- **Stockage** (`strength_kpi_measurements`) : `value` = puissance (W),
  `unit` = `W` ; le poids et les 3 temps de vol sont conservés dans
  `attempts` (jsonb).
- **Wizard KPI** (écran Chantier B) : champ de saisie du poids + module de
  **chronométrage du temps de vol** sur 3 essais.

L'autre KPI du seau (`broad_jump`, distance en cm) est **inchangé** ; le seau
`lower_power` combine les deux scores 0-100 normalisés.

## 5. Le moteur `mesocycleEngine.ts`

Fonctions **TS pures, sans I/O, testées unitairement** (`src/lib/strength/`).

| Fonction | Rôle |
|----------|------|
| `scoreBuckets` | Évaluation + KPIs → **6 scores de seau 0-100**. `lower_strength` ← `imtp` ; `lower_power` ← moyenne(`vertical_jump`, `broad_jump`) ; `upper_strength` ← `weighted_pullup` ; `upper_power` ← `medball_vertical_throw` — chacun normalisé via `kpiBaremes` (`getBareme`/`kpiScore`, sexe + bande d'âge). `mobility` ← bilan coach (`strength_assessments.physical_tests`). `psychology` ← questionnaire (confiance/motivation/stress) + `wellness`. |
| `prioritizeBuckets` | Priorité d'un seau = **`bucket_emphasis × (100 − score)`** (le `bucket_emphasis` vient du template choisi). **Override sécurité** : douleur intense (`pain_reports`) ou dysfonction de mouvement (`physical_tests`) → bloc correctif / `mobility` forcé en priorité 1, quel que soit le score. |
| `allocateVolume` | Répartit les séances/semaine (`sessions_per_week` de l'évaluation) sur les **5 seaux entraînables** : 2 seaux prioritaires = focus (~60 % du volume), reste = maintien (~40 %), `mobility` en échauffement systématique. Le seau `psychology` n'a pas d'exercices → un score bas produit une **recommandation/flag** dans la sortie, pas du volume. |
| `selectExercises` | Pioche dans `dim_exercices` taggé (`bucket` + `level` adapté au nageur) ; **exclut** tout exercice dont `contraindication_zones` recoupe une zone de douleur déclarée → substitution par une régression. |
| `periodize` | Distribue les **phases du template** sur la durée cible : part des `nominal_weeks`, étire/comprime chaque phase dans `[min_weeks, max_weeks]` pour atteindre la durée saisie → séquence semaine→cycle. Le chargement (séries/reps/%1RM/récup) de chaque cycle vient de `periodizationCycles` (stratégie `catalogue` → colonnes `dim_exercices` ; stratégie `generique` → schéma du cycle). |
| `generateMesocycle` | Orchestrateur top-level → objet **mésocycle** : semaines → séances → exercices chargés, + snapshot du raisonnement (6 scores, priorités, `data_confidence`). |

**Données partielles** : le moteur tourne sur ce qui existe (bilan mobilité
manquant → `mobility` prioritaire par défaut, conservateur), abaisse
`data_confidence`, **ne bloque jamais** la génération.

## 6. Modèle de données

### Nouvelles tables

**`strength_mesocycles`** — un mésocycle généré
- `id` uuid PK · `athlete_id` int · `assessment_id` uuid
- `template_id` uuid · `event_group` text · `kind` text (snapshot du template choisi)
- `target_week_count` int · `sessions_per_week` int
- `status` text : `active` | `reverted` | `superseded`
- `bucket_priorities` jsonb — snapshot du raisonnement du moteur (6 scores, priorités, `data_confidence`)
- `engine_version` text · `generated_at` timestamptz · `generated_by` int

**`strength_planning_snapshots`** — filet de sécurité revert
- `id` uuid PK · `mesocycle_id` uuid · `athlete_id` int
- `slot_overrides` jsonb / `week_overrides` jsonb — copie des `strength_planning_*` avant écrasement
- `created_at` timestamptz

### Réutilisé tel quel

`strength_assessments` (+ `sessions_per_week`, déjà ajouté), `strength_kpi_measurements`,
`strength_periodization_templates` (14 templates), `dim_exercices` taggé,
`strength_planning_slot_overrides` / `strength_planning_week_*`, `notifications`,
`pain_reports`, `wellness`, la feature « compétitions » (échéances).

### RLS

- `strength_mesocycles` / `strength_planning_snapshots` : le **nageur** lit/écrit
  les siens (`app_user_id() = athlete_id`) ; le **coach** lit ceux de ses nageurs ;
  `admin` accès complet. Helpers `app_user_role()` / `app_user_id()`.

## 7. Persistance & RPC

- **`apply_strength_mesocycle`** (SECURITY DEFINER, transactionnelle) — appelée
  par le nageur à la confirmation de l'aperçu. En une transaction :
  1. vérifie que l'appelant est bien le nageur concerné (génération autonome) ;
  2. **snapshot** des `strength_planning_slot_overrides` / `week_*` existants ;
  3. `INSERT` `strength_mesocycles` ;
  4. **matérialise** le mésocycle dans `strength_planning_slot_overrides`
     (conforme à la représentation produite par le builder muscu coach existant) ;
  5. crée la **notification** coach.
- **`revert_strength_mesocycle`** — restaure le snapshot, marque le mésocycle
  `reverted`. Appelable par le coach (oversight) ou le nageur.
- Ces RPC touchent des tables sous RLS → **tests RLS d'intégration requis**
  (`npm run test:rls`, cf. `docs/rls-testing.md`).

> Point à instruire en implémentation : la correspondance exacte
> mésocycle → `strength_planning_slot_overrides` (structure des slots, des
> séances, des exercices) — à caler sur la représentation du builder existant.

## 8. UX

### Nageur — génération autonome

Point d'entrée dans le module muscu du nageur (`src/pages/Strength.tsx`), actif
dès qu'une évaluation est complétée. Parcours (conception via `/frontend-design`,
**obligatoire** pour toute UI) :

1. Choix de l'**épreuve** (event_group) + de la **famille** (saison / mini-prépa).
2. Choix de la **durée cible** — l'écran affiche les **prochaines échéances** du
   nageur (compétitions à venir) avec, pour chacune, le **nombre de semaines**
   qui l'en sépare. Le nageur cale sa durée pour que la semaine de `pic` tombe
   sur une compétition. La durée reste contrainte à la plage `[min, max]` du
   template ; une échéance hors plage est affichée mais signalée « hors portée
   de ce template ». `sessions_per_week` est relue de l'évaluation, ajustable.
3. **Aperçu** : le plan périodisé (semaines → cycles → séances) **+ le
   raisonnement des seaux** (6 scores, priorités, le « pourquoi »).
4. **Confirmation** → `apply_strength_mesocycle` → mésocycle matérialisé sur sa
   timeline muscu ; si un plan existait → snapshot automatique.

### Coach — visibilité & oversight (non bloquant)

- **Notification** « X a généré un mésocycle ».
- Voit le mésocycle sur la planif du nageur, **raisonnement des seaux inclus**
  (auditable — *pourquoi* chaque choix).
- **Édite** les séances via le **builder muscu existant**.
- **Rejette** le mésocycle (action revert) → `revert_strength_mesocycle`
  restaure le snapshot.

## 9. Découpage & exécution

Chantier transverse (révision KPI + moteur + tables + RPC + RLS + 2 UIs).
Découpage en couches successives :

1. **KPI détente verticale révisé** — protocole, barème puissance (re-sourcé),
   calcul, stockage, wizard.
2. **Moteur `mesocycleEngine.ts`** — `scoreBuckets`, `prioritizeBuckets`,
   `allocateVolume`, `selectExercises`, `periodize`, `generateMesocycle` ;
   fonctions pures, **TDD**.
3. **Tables** `strength_mesocycles` + `strength_planning_snapshots` + RLS.
4. **RPC** `apply_strength_mesocycle` / `revert_strength_mesocycle` + tests RLS
   d'intégration.
5. **UI nageur** — écran de génération (épreuve / famille / durée + échéances) +
   aperçu (`/frontend-design`).
6. **Notification + visibilité/édition/revert coach.**
7. **Clôture** — `npm test`, `npx tsc --noEmit`, `npm run build`, documentation
   (implementation-log, ROADMAP, FEATURES_STATUS, CLAUDE.md, files-map).

**Exécution** : chantier DB + moteur + API + frontend → le plan d'implémentation
s'appuiera sur une **équipe d'agents** (règle globale) — orchestration Opus,
développement Sonnet, tests Haiku — coordonnée sur une interface commune (le type
de l'objet mésocycle, figé tôt).

## 10. Points laissés à l'implémentation

- **Barème de puissance** `vertical_jump` — sources de référence (normes de
  *peak power* CMJ par âge/sexe) à choisir/valider, comme au §290.
- **Algorithme exact de distribution** durée cible → semaines par phase dans
  `periodize` (répartition du delta `durée − Σnominal` sur les phases dans leurs
  bornes).
- **Mapping mésocycle → `strength_planning_slot_overrides`** — structure exacte
  des slots/séances/exercices, à caler sur le builder existant.
- **Combinaison des KPIs d'un seau** à 2 sources (`lower_power`) — moyenne simple
  vs pondérée.
- **Forme exacte de la sortie « raisonnement des seaux »** affichée dans l'aperçu.
