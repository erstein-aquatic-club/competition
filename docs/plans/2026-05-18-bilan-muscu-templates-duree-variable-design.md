# Design — Templates de périodisation à durée variable + mini-prépas (Bilan Muscu)

*Document de design validé le 2026-05-18. Fait suite au Chantier A « Contenu du
Bilan Muscu » (`docs/plans/2026-05-17-bilan-muscu-chantier-A-design.md`) et au
vocabulaire de cycles validé (`docs/plans/bilan-muscu-cycles-vocabulaire.md`).*

## 1. Objet

Le point de validation des 7 templates de périodisation (§292, Task B) a fait
émerger trois besoins que le modèle figé du Chantier A ne couvre pas :

1. **Durée variable** — un template ne doit pas avoir un `week_count` fixe. Le
   coach veut piloter la durée réelle d'un mésocycle pour la caler sur son
   calendrier de saison.
2. **Mini-prépas inter-compétitions** — un format court (~1 mois) par
   spécialité, pour relancer fraîcheur et puissance entre deux compétitions
   rapprochées, en partant d'une base déjà solide (sortie de macrocycle).
3. **Capacité hebdomadaire de l'athlète** — le nombre de séances de musculation
   réalisables par semaine doit être saisi, sinon le plan généré peut être
   irréaliste.

Ce design couvre le **modèle de données et de contenu**. Le moteur de
génération qui consomme ces données reste le **Chantier C** (hors scope).

## 2. Décisions de cadrage (validées avec le coach)

| # | Question | Décision retenue |
|---|----------|------------------|
| 1 | Comment fixer la durée d'un mésocycle ? | **Durée cible saisie** à la génération (nombre de semaines ou dates) ; le moteur garde les phases et répartit la durée. |
| 2 | Mini-prépa : longueur fixe ou étirable ? | **Étirable** — même mécanique que les templates de saison. Modèle de données **uniforme**, 14 templates au total. |
| 3 | Où vont les semaines quand on étire ? | **Chaque phase porte une plage** `[min, max]` ; le moteur répartit la durée cible sur l'ensemble des phases. |
| 4 | Où saisir les séances/semaine ? | Dans l'**évaluation Bilan Muscu** (`strength_assessments`) — renseigné par le nageur, ajustable par le coach. |
| 5 | Calibrage des longueurs de blocs (point 1 du doc des templates) | **Validé** tel quel — les séquences servent de `nominal`. |

## 3. Modèle de données — `strength_periodization_templates`

La table (migration `00166`) est **vide** : aucun template n'a été seedé. On la
fait donc évoluer sans migration de données.

Migration `00167` :

| Changement | Détail |
|------------|--------|
| ➖ `week_count` | retiré — la durée n'est plus fixe. |
| ➕ `kind` | `TEXT NOT NULL CHECK (kind IN ('season','inter_competition'))`. |
| ➕ `min_week_count` | `INTEGER NOT NULL CHECK (min_week_count > 0 AND min_week_count <= 24)`. |
| ➕ `max_week_count` | `INTEGER NOT NULL CHECK (max_week_count > 0 AND max_week_count <= 24)`. |
| ➕ contrainte | `CHECK (min_week_count <= max_week_count)`. |
| `structure` jsonb | nouveau modèle — cf. § 4. |
| RLS | **inchangée** (`spt_select` lecture tout authentifié, `spt_write` écriture coach/admin). |

`min_week_count` / `max_week_count` sont les **bornes globales** du template
(= Σ des `min_weeks` / `max_weeks` des phases). Ils sont dénormalisés en
colonnes — pratique pour l'UI de génération (« ce template tient sur X-Y
semaines », validation de la durée cible saisie). Le seed les renseigne en
cohérence avec le `structure` jsonb (14 lignes statiques — redondance maîtrisée).

Le schéma de test RLS (`supabase/tests/schema.sql`) doit refléter le nouveau
schéma → `npm run test:rls` à re-jouer.

## 4. Le `structure` jsonb — modèle de phases

Le `structure` ne décrit plus une liste figée de semaines mais une **liste
ordonnée de phases**, chacune portant une plage de durée :

```jsonc
{
  "phases": [
    { "cycle": "prepa_generale", "min_weeks": 2, "nominal_weeks": 3, "max_weeks": 6 },
    { "cycle": "force_max",      "min_weeks": 2, "nominal_weeks": 3, "max_weeks": 4 },
    { "cycle": "puissance",      "min_weeks": 2, "nominal_weeks": 3, "max_weeks": 4 },
    { "cycle": "affutage",       "min_weeks": 1, "nominal_weeks": 2, "max_weeks": 3 },
    { "cycle": "pic",            "min_weeks": 1, "nominal_weeks": 1, "max_weeks": 1 }
  ],
  "bucket_emphasis": { "upper_power": 1.0, "lower_power": 0.95, ... }
}
```

- `nominal_weeks` — la durée **validée par le coach** (point 1). Point de départ
  du moteur.
- `min_weeks` / `max_weeks` — bornes de flexibilité de **chaque** phase. Une
  phase rigide (`pic`) a `min == nominal == max`.
- Durée plancher du template = Σ `min_weeks` ; plafond = Σ `max_weeks` ; défaut
  = Σ `nominal_weeks`.
- `bucket_emphasis` — **inchangé** (emphase par seau, poids 0-1).

### Types TypeScript (`src/lib/api/types.ts`)

Le type `PeriodizationStructure` livré en Task A (§292) — actuellement
`weeks: { cycle }[]` — est **révisé** (non seedé, déployé nulle part) :

```ts
/** Une phase de périodisation : un cycle tenu sur une plage de semaines. */
export interface PeriodizationPhase {
  cycle: PeriodizationCycle;
  /** Durée plancher (incompressible) de la phase, en semaines. */
  min_weeks: number;
  /** Durée par défaut validée — point de départ du moteur. */
  nominal_weeks: number;
  /** Durée plafond de la phase, en semaines. */
  max_weeks: number;
}

/** Contenu JSONB de strength_periodization_templates.structure. */
export interface PeriodizationStructure {
  /** Phases ordonnées. Durée du template ∈ [Σ min_weeks, Σ max_weeks]. */
  phases: PeriodizationPhase[];
  /** Emphase de l'épreuve par seau, poids 0-1. */
  bucket_emphasis: Partial<Record<StrengthBucket, number>>;
}

/** Famille d'un template : prépa de saison ou mini-prépa inter-compétitions. */
export type PeriodizationTemplateKind = 'season' | 'inter_competition';

export interface StrengthPeriodizationTemplate {
  id: string;
  event_group: string;
  kind: PeriodizationTemplateKind;
  name: string;
  min_week_count: number;
  max_week_count: number;
  structure: PeriodizationStructure;
  created_at: string;
  updated_at: string;
}
```

`src/lib/strength/periodizationCycles.ts` (chargement par cycle) n'est **pas**
touché — la stratégie de chargement est portée par le cycle, orthogonale à la
durée des phases.

## 5. Les 14 templates

**7 templates « saison »** (`kind = 'season'`) — un par `event_group`
(`sprint_50`, `breaststroke`, `backstroke`, `200m`, `400m`, `distance`,
`medley`). Dérivés des 7 séquences validées : chaque suite de semaines d'un
même cycle devient une phase, `nominal_weeks` = la valeur validée. Fourchettes
`min`/`max` par phase, à calibrer dans le doc de contenu (ordres de grandeur :
`force_max`/`puissance` étroits ~2-4 sem., `prepa_generale` large, `maintien`/
`affutage` 1-3, `pic` figé à 1).

**7 templates « mini-prépa »** (`kind = 'inter_competition'`) — un par
`event_group`, format court ~3-6 sem. Forme : `maintien` (léger deload) →
reload (`puissance`, ou `force_max` pour les profils de fond / 400 m) →
`affutage` → `pic`. Objectif : relancer fraîcheur et puissance entre deux
compétitions, en partant d'une base déjà acquise. `bucket_emphasis` **réutilisé**
du template saison de la même spécialité (les exigences de l'épreuve ne changent
pas selon la famille).

➡️ Les valeurs exactes — `min`/`nominal`/`max` de chaque phase, cycle de reload
par spécialité — relèvent du **contenu S&C**. Elles sont rédigées dans le doc
des templates (réécriture de `docs/plans/bilan-muscu-templates-sources.md` en
modèle de phases) et **soumises à validation coach** avant le seed, comme les
7 templates l'ont été.

## 6. Séances/semaine — `strength_assessments.sessions_per_week`

Nouvelle colonne sur `strength_assessments` (table du Chantier B, déployée) :

| Colonne | Définition |
|---------|------------|
| `sessions_per_week` | `INTEGER NOT NULL DEFAULT 3 CHECK (sessions_per_week BETWEEN 1 AND 7)`. |

- **Défaut 3** — sourcé : enquête Frontiers 2023, ≥ 3 séances/semaine chez 83 %
  des coaches S&C de sprinteurs élite. `DEFAULT` couvre les lignes existantes.
- Renseigné par le **nageur** lors de son auto-évaluation Bilan Muscu,
  **ajustable par le coach**.
- RLS **inchangée** (simple ajout de colonne ; aucune policy modifiée).
- Consommé par le moteur (Chantier C) : croisé avec le template choisi et la
  durée cible pour produire un plan réaliste.

## 7. Périmètre & découpage

Ce design **remplace** la fin prévue du Chantier A (sous-tâche A3.4 — seed de
l'ancien modèle à 7 templates figés, jamais exécuté). Travail à faire :

1. Réviser les types TS (`PeriodizationPhase`, `PeriodizationStructure`,
   `StrengthPeriodizationTemplate`).
2. Re-rédiger `docs/plans/bilan-muscu-templates-sources.md` : 14 templates en
   modèle de phases → **validation coach**.
3. Migration `00167` — ALTER `strength_periodization_templates` (`kind`,
   `min/max_week_count`, drop `week_count`).
4. Mettre à jour `supabase/tests/schema.sql` (+ le test RLS de la table) et
   re-jouer `npm run test:rls`.
5. Migration — ADD `sessions_per_week` sur `strength_assessments`.
6. Seed des 14 templates (après validation coach).
7. Clôture — `npm test`, `npx tsc --noEmit`, `npm run build`, documentation
   (implementation-log, ROADMAP, FEATURES_STATUS, CLAUDE.md, files-map).

## 8. Hors scope — Chantier C (moteur de génération)

- La **distribution durée-cible → semaines par phase** : à partir des `nominal`,
  étirer/comprimer chaque phase dans sa plage `[min, max]` pour atteindre la
  durée saisie par le coach.
- La lecture de `sessions_per_week` et la **répartition des séances** dans la
  semaine.
- La génération du mésocycle lui-même (`strength_mesocycles` + tables de
  planification).
- L'UI de saisie de la durée cible et de `sessions_per_week`.
