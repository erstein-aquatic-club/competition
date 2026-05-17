# Design — Chantier A « Contenu du Bilan Muscu »

*Document de design validé le 2026-05-17. Fait suite au design global `docs/plans/2026-05-17-bilan-muscu-mesocycle-design.md` (Feature « Bilan Muscu → Mésocycle ») et au Chantier B livré (§285-§289).*

## 1. Objet

Le Chantier A produit les **3 briques de contenu** que le moteur de génération (Chantier C) consommera : les **barèmes** de scoring des KPIs, le **tagging** du catalogue d'exercices, et les **templates de périodisation**. Aucun moteur ni UI ici — du contenu, des données de référence, et un peu de schéma.

## 2. Décisions de cadrage (brainstorming validé)

| # | Décision | Choix retenu |
|---|----------|--------------|
| 1 | Source des barèmes KPI | **Normes de référence publiées** (par âge/sexe). |
| 2 | Couverture des barèmes | **Tout publié, approximations assumées** : 2 KPIs sur 5 (les sauts) ont des normes directes solides ; les 3 autres (traction lestée, tirage mi-cuisse, lancer med-ball) sont **transposés** depuis des tests proches, caveat documenté. |
| 3 | Granularité d'âge | **Bandes alignées sur les catégories natation** (âge dérivé de `birthdate`). |
| 4 | Tagging des exercices | **Claude propose le mapping complet des 94 exercices, le coach valide.** |
| 5 | Structure des templates | **Quelques templates standard adossés au haut niveau** — proposés par Claude, validés par le coach. |
| 6 | Ampleur des templates | **7 familles produites d'un coup** dans le Chantier A. |

### Note sur le sourcing (transparence)

Les programmes de musculation exacts des nageurs élite (Cameron McEvoy, Florent Manaudou…) ne sont **pas publics au détail**. Les templates seront calés sur : (a) la **littérature S&C natation** — qui différencie nettement la prépa force selon le profil d'épreuve — et (b) les **approches publiquement documentées** d'athlètes de référence. Le résultat = des templates crédibles, de calibre haut niveau — **pas la copie d'un programme confidentiel**.

## 3. Brique 1 — Barèmes KPI

Config statique : `src/lib/strength/kpiBaremes.ts`.

Pour chaque **KPI × sexe × bande d'âge**, un barème transforme une **valeur brute** (cm, kg) en **score 0-100**.

- **Bandes d'âge** : alignées sur les catégories natation (l'âge se calcule depuis `users.birthdate`).
- **Source** : normes publiées par âge/sexe.
  - Saut vertical, saut en longueur → normes directes solides (batteries de tests jeunesse, EUROFIT…).
  - Traction lestée, tirage mi-cuisse à la barre, lancer vertical médecine-ball → barèmes **transposés** depuis des tests de force/puissance proches. Le fichier documente explicitement que ces 3 barèmes sont des approximations à affiner.
- **Mapping 0-100** : seuils faible / moyen / bon / excellent → bandes de score. Structure exacte (interpolation linéaire entre bornes vs paliers) fixée en implémentation (sous-tâche A1).

## 4. Brique 2 — Tagging du catalogue d'exercices

`dim_exercices` (94 exercices, tous `exercise_type = 'strength'`) est déjà swimmer-specific, déjà sous-typé (`power`, `core`, `prehab`, `plyometric`, `strength_accessory`, `conditioning`), déjà doté des paramètres séries/reps/%1RM pour 3 cycles (endurance, hypertrophie, force) et de GIFs (`illustration_gif`). → **On tagge l'existant**, pas de nouvelle bibliothèque.

Migration étendant `dim_exercices` :

| Colonne | Rôle |
|---------|------|
| `bucket` | 5 valeurs : `lower_strength` / `lower_power` / `upper_strength` / `upper_power` / `mobility`. Pas de seau « psychologie » — il n'a pas d'exercices. |
| `contraindication_zones text[]` | Zones de douleur incompatibles. **Vocabulaire = les zones de `BodyHeatMap` / `pain_reports`** déjà en place. |
| `level` | `beginner` / `intermediate` / `advanced` — consommé par le moteur (Chantier C). |

**Production** : Claude propose le mapping des 94 exercices (seau + contre-indications + niveau) en s'appuyant sur les noms et l'`exercise_subtype` existant ; le coach revoit et corrige. Le mapping validé est **seedé par la migration**.

## 5. Brique 3 — Templates de périodisation (7 familles)

Nouvelle table `strength_periodization_templates` + **7 templates** :

| # | Famille | Logique force dominante |
|---|---------|--------------------------|
| T1 | Sprint 50 crawl/papillon | Puissance max, qualité > volume |
| T2 | Brasse | Hanches, adducteurs, puissance jambes |
| T3 | Dos | Chaîne postérieure, épaules |
| T4 | 200 m | Puissance-endurance |
| T5 | 400 m | Force-endurance mixte |
| T6 | 800/1500 m | Endurance de force, prévention blessure |
| T7 | 4 nages | Polyvalent |

Chaque template porte :
- `event_group`, `name`.
- `week_count` **propre au template** — la méthode élite dicte la durée ; le coach **choisit un template** (qui porte sa durée), il ne fixe pas un nombre de semaines arbitraire. *(Révision mineure de l'hypothèse du Chantier B : `strength_mesocycles.week_count` sera renseigné depuis le template.)*
- `structure` jsonb :
  - séquence **semaine → cycle** (`endurance` / `hypertrophie` / `force` / `deload`) — les paramètres séries/reps/%1RM viennent de `dim_exercices` ; `deload` est un type de semaine interprété par le moteur (volume réduit).
  - **profil d'emphase par seau** — quels seaux l'épreuve sollicite. C'est le cœur du « adossé au haut niveau ».

**Production** : recherche documentaire (littérature S&C natation + approches publiquement documentées d'athlètes de référence par spécialité) → rédaction des 7 templates → le coach valide.

## 6. Brique 4 — GIFs

Les exercices de `dim_exercices` ont déjà `illustration_gif`. Le seul manque réel : les **5 GIFs de démonstration des protocoles KPI** (`src/lib/strength/kpiProtocols.ts`, `gifUrl: null` pour les 5). C'est de la **production d'assets** (filmer, convertir, héberger dans le bucket Storage `exercise-gifs`) — hors scope code, traité comme une sous-tâche séparée.

## 7. Découpage en sous-tâches

| Sous-tâche | Contenu | Nature |
|------------|---------|--------|
| **A1 — Barèmes** | Recherche des normes publiées + `src/lib/strength/kpiBaremes.ts` (config + mapping 0-100) | Recherche + config |
| **A2 — Tagging** | Migration colonnes `dim_exercices` (`bucket`, `contraindication_zones`, `level`) + mapping des 94 exercices (proposé, validé, seedé) | Schéma + contenu |
| **A3 — Templates** | Table `strength_periodization_templates` + recherche S&C + rédaction des 7 templates (données seedées) | Schéma + recherche + contenu |
| **A4 — GIFs KPI** | 5 GIFs de démonstration des protocoles KPI | Production d'assets (séparée) |

## 8. Points laissés au Chantier C (moteur)

- **Combinaison emphase-épreuve / seau le plus faible** : comment le moteur arbitre entre le profil d'emphase du template (ce que l'épreuve exige) et la priorité « seau le plus faible » issue de l'évaluation du nageur. Règle attendue : on traite **les deux** — le limiteur (seau faible, surtout si risque blessure) ET la qualité spécifique à l'épreuve.
- **Détermination du `level`** de l'athlète (pour la sélection d'exercices par niveau).
- Sélection du template par spécialité du nageur : le coach la choisit à la génération (le modèle de données prévoit l'`event_group`).

## 9. Points ouverts (tranchés en implémentation)

- Structure exacte du mapping 0-100 des barèmes (interpolation vs paliers).
- Sources documentaires précises retenues pour les barèmes et les templates.
- Forme exacte du `structure` jsonb des templates.
