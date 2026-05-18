# Templates de périodisation à durée variable — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Faire passer les templates de périodisation du Bilan Muscu d'un modèle à durée fixe à un modèle à durée variable (phases à bornes min/nominal/max), produire 14 templates (7 saison + 7 mini-prépa inter-compétitions), et capter la capacité hebdomadaire de l'athlète dans l'évaluation.

**Architecture:** Le `structure` jsonb d'un template décrit une liste ordonnée de phases, chacune portant `[min_weeks, nominal_weeks, max_weeks]`. La table `strength_periodization_templates` (vide) est altérée — `week_count` fixe remplacé par `kind` + `min/max_week_count`. La capacité hebdo est une colonne sur `strength_assessments`. Le moteur qui distribue la durée cible sur les phases est hors scope (Chantier C).

**Tech Stack:** Supabase (Postgres, migrations via MCP), TypeScript (types), tests RLS (`node:test` + Postgres local Docker). Aucun frontend.

**Design de référence:** `docs/plans/2026-05-18-bilan-muscu-templates-duree-variable-design.md` — à lire avant de commencer.

---

## Contexte & conventions (lire avant tout)

- **Migrations** : créer le fichier SQL dans `supabase/migrations/` ET l'appliquer via le MCP Supabase (`mcp__plugin_supabase_supabase__apply_migration`). Projet ID `fscnobivsgornxdwqwlk`. Dernière migration appliquée : `00166`. Prochains numéros : `00167`, `00168`, `00169`.
- **RLS** : helpers `app_user_id()` / `app_user_role()`. Aucune policy n'est modifiée par ce plan ; mais Task 3 modifie `supabase/tests/schema.sql` → `npm run test:rls` requis (cf. CLAUDE.md).
- **`@/` alias** = `src/`.
- **Branche** : `main` (convention projet).
- **Point de validation** : Task 6 est **bloquante** — le contenu des 14 templates doit être validé par le coach avant la migration de seed (Task 7). Ne pas seeder du contenu non validé.
- **Tests unitaires** : `node --test --experimental-test-module-mocks --import tsx <chemin>`.
- Ce plan **remplace** la sous-tâche A3.4 du Chantier A (seed de l'ancien modèle figé, jamais exécuté).

---

## Task 1 : Types TypeScript — modèle de phases

**Files:**
- Modify: `src/lib/api/types.ts` (bloc `PeriodizationCycle` → `StrengthPeriodizationTemplate`, ~lignes 959-988)

**Step 1 — Vérifier les consommateurs.**
Run: `grep -rn "PeriodizationStructure\|StrengthPeriodizationTemplate\|\.weeks\b" src/`
Expected: `PeriodizationStructure` et `StrengthPeriodizationTemplate` ne sont consommés que dans `types.ts` (aucun wrapper API, aucun composant — le moteur est Chantier C). Si un consommateur existe, le signaler avant de continuer.

**Step 2 — Remplacer le bloc de types.** Dans `src/lib/api/types.ts`, remplacer l'interface `PeriodizationStructure` actuelle (`weeks: { cycle: PeriodizationCycle }[]`) et l'interface `StrengthPeriodizationTemplate` par :

```ts
/** Une phase de périodisation : un cycle tenu sur une plage de semaines.
 *  Le moteur (Chantier C) part de nominal_weeks et étire/comprime la phase
 *  dans [min_weeks, max_weeks] pour atteindre la durée cible. */
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
  /** Emphase de l'épreuve par seau, poids 0-1 (le moteur la combine avec
   *  la priorité « seau le plus faible » de l'évaluation — Chantier C). */
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

Le type `PeriodizationCycle` (6 valeurs) et `StrengthBucket` (5 valeurs) restent inchangés. Ne PAS toucher `src/lib/strength/periodizationCycles.ts`.

**Step 3 — Type check.**
Run: `npx tsc --noEmit`
Expected: exit 0.

**Step 4 — Suite de tests (rapide, garde-fou).**
Run: `npm test`
Expected: vert (aucun test ne consomme ces types ; régression improbable).

**Step 5 — Commit.**
```bash
git add src/lib/api/types.ts
git commit -m "feat(§292): types de templates à durée variable (phases min/nominal/max)"
```

---

## Task 2 : Migration 00167 — table `strength_periodization_templates` à durée variable

**Files:**
- Create: `supabase/migrations/00167_periodization_templates_variable.sql`

**Step 1 — Écrire la migration.** La table est **vide** (aucun template seedé) → `DROP COLUMN` / `ADD COLUMN NOT NULL` sans défaut sont sûrs.

```sql
-- 00167_periodization_templates_variable.sql
-- Design : docs/plans/2026-05-18-bilan-muscu-templates-duree-variable-design.md
-- La table strength_periodization_templates est vide → ALTER sans migration de
-- données. Durée variable : week_count fixe remplacé par min/max_week_count,
-- + colonne kind (season / inter_competition). Aucune policy RLS modifiée.
BEGIN;

ALTER TABLE strength_periodization_templates
  DROP COLUMN week_count,
  ADD COLUMN kind TEXT NOT NULL
    CHECK (kind IN ('season','inter_competition')),
  ADD COLUMN min_week_count INTEGER NOT NULL
    CHECK (min_week_count > 0 AND min_week_count <= 24),
  ADD COLUMN max_week_count INTEGER NOT NULL
    CHECK (max_week_count > 0 AND max_week_count <= 24),
  ADD CONSTRAINT spt_week_count_order CHECK (min_week_count <= max_week_count);

COMMIT;
```

**Step 2 — Appliquer** via `mcp__plugin_supabase_supabase__apply_migration` (`name: "00167_periodization_templates_variable"`, `query`: le contenu SQL).

**Step 3 — Vérifier.** Via `mcp__plugin_supabase_supabase__execute_sql` :
`SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_name = 'strength_periodization_templates' ORDER BY ordinal_position;`
Expected: plus de `week_count` ; présence de `kind`, `min_week_count`, `max_week_count`.

**Step 4 — Commit.**
```bash
git add supabase/migrations/00167_periodization_templates_variable.sql
git commit -m "feat(§292): table strength_periodization_templates à durée variable"
```

---

## Task 3 : Schéma de test RLS aligné + re-run

**Files:**
- Modify: `supabase/tests/schema.sql` (définition de `strength_periodization_templates`)
- Modify: `supabase/tests/rls/strength-periodization-templates.test.ts` (INSERT de fixtures)

**Step 1 — Repérer les références obsolètes.**
Run: `grep -rn "week_count\|periodization_templates" supabase/tests/`
Expected: localise la définition de table dans `schema.sql` et les `INSERT` de fixtures dans le test.

**Step 2 — Aligner `schema.sql`.** Reporter dans la définition de `strength_periodization_templates` de `supabase/tests/schema.sql` exactement les changements de la migration 00167 : retirer `week_count`, ajouter `kind`, `min_week_count`, `max_week_count` + les `CHECK`.

**Step 3 — Aligner les fixtures du test.** Dans `supabase/tests/rls/strength-periodization-templates.test.ts`, mettre à jour chaque `INSERT` de fixture pour fournir `kind`, `min_week_count`, `max_week_count` (valeurs arbitraires valides, p.ex. `kind='season'`, `min_week_count=8`, `max_week_count=12`) au lieu de `week_count`. La logique testée (policies `spt_select`/`spt_write`) ne change pas — seules les colonnes des `INSERT` changent.

**Step 4 — Vérifier Docker.**
Run: `docker ps`
Si Docker ne tourne pas : **demander à l'utilisateur** de lancer Docker Desktop et attendre confirmation (cf. CLAUDE.md — ne pas lancer Docker soi-même). Si Docker tourne mais pas de containers Supabase : `supabase start`.

**Step 5 — Lancer les tests RLS.**
Run: `npm run test:rls`
Expected: les tests `strength_periodization_templates` verts ; hors 2 échecs pré-existants connus (`coach_pace_zones`, cf. memory).

**Step 6 — Commit.**
```bash
git add supabase/tests/schema.sql supabase/tests/rls/strength-periodization-templates.test.ts
git commit -m "test(§292): schéma de test RLS aligné sur la table à durée variable"
```

---

## Task 4 : Migration 00168 — `sessions_per_week` sur `strength_assessments`

**Files:**
- Create: `supabase/migrations/00168_strength_assessments_sessions_per_week.sql`

**Step 1 — Écrire la migration.** `strength_assessments` est déployée et peut contenir des lignes → `DEFAULT 3` couvre les lignes existantes.

```sql
-- 00168_strength_assessments_sessions_per_week.sql
-- Design : docs/plans/2026-05-18-bilan-muscu-templates-duree-variable-design.md
-- Capacité hebdomadaire de muscu de l'athlète, saisie à l'auto-évaluation
-- (nageur) et ajustable par le coach. Défaut 3 (sourcé Frontiers 2023 :
-- ≥3 séances/sem. chez 83 % des coaches S&C). Aucune policy RLS modifiée.
BEGIN;

ALTER TABLE strength_assessments
  ADD COLUMN sessions_per_week INTEGER NOT NULL DEFAULT 3
    CHECK (sessions_per_week BETWEEN 1 AND 7);

COMMIT;
```

**Step 2 — Appliquer** via `mcp__plugin_supabase_supabase__apply_migration` (`name: "00168_strength_assessments_sessions_per_week"`).

**Step 3 — Vérifier.** Via `execute_sql` :
`SELECT column_name, column_default FROM information_schema.columns WHERE table_name = 'strength_assessments' AND column_name = 'sessions_per_week';`
Expected: 1 ligne, défaut `3`.

> Pas de `npm run test:rls` : simple ajout de colonne avec défaut, aucune policy modifiée, aucune fixture de test cassée (les INSERT existants restent valides grâce au `DEFAULT`). Ne mettre à jour `supabase/tests/schema.sql` que si un test échoue effectivement.

**Step 4 — Commit.**
```bash
git add supabase/migrations/00168_strength_assessments_sessions_per_week.sql
git commit -m "feat(§292): colonne sessions_per_week sur strength_assessments"
```

---

## Task 5 : Re-rédaction du doc des 14 templates (modèle de phases) — **ARTEFACT À VALIDER**

**Files:**
- Modify: `docs/plans/bilan-muscu-templates-sources.md` (réécriture)

**Type de tâche : contenu.** Pas de code, pas de test.

**Step 1 — Lire le contexte.** Lire `docs/plans/bilan-muscu-templates-sources.md` (état actuel : 7 templates de saison, séquences semaine→cycle validées), `docs/plans/2026-05-18-bilan-muscu-templates-duree-variable-design.md` (§ 4 et § 5), et `docs/plans/bilan-muscu-cycles-vocabulaire.md` (§ 2-3).

**Step 2 — Convertir les 7 templates « saison » au modèle de phases.** Pour chaque template T1-T7, transformer la table semaine→cycle en **liste de phases** : chaque suite contiguë de semaines d'un même cycle = une phase `{ cycle, min_weeks, nominal_weeks, max_weeks }`. `nominal_weeks` = le nombre de semaines validé (point 1). Proposer `min_weeks`/`max_weeks` par phase — ordres de grandeur S&C :
- `prepa_generale` : large (socle) — p.ex. `min` = nominal−2, `max` = nominal+3.
- `force_max`, `puissance` : étroits (fenêtre efficace ~2-4 sem.) — `min` 2, `max` 4.
- `maintien` : 1-3.
- `affutage` : 1-3.
- `pic` : figé — `min` = `nominal` = `max` = 1.
Renseigner `kind: season`. Conserver les `bucket_emphasis` et rationales S&C.

**Step 3 — Rédiger les 7 templates « mini-prépa ».** Un par `event_group`, `kind: inter_competition`, format court ~3-6 sem. Phases : `maintien` (léger deload) → reload → `affutage` → `pic`. Cycle de reload : `puissance` pour les profils explosifs (sprint, dos, brasse, medley, 200 m) ; `force_max` pour les profils de fond (400 m, distance) — à argumenter. `bucket_emphasis` **réutilisé** du template saison de la même spécialité. Donner `min/nominal/max_weeks` par phase.

**Step 4 — Tableau récapitulatif.** Mettre à jour le § 3 : 14 lignes, colonnes `event_group`, `kind`, `name`, `min_week_count` (Σ min), `max_week_count` (Σ max), durée nominale (Σ nominal), séquence de phases.

**Step 5 — Cohérence.** Vérifier pour les 14 templates : phases ordonnées ; `min_weeks ≤ nominal_weeks ≤ max_weeks` par phase ; `pic` figé à 1 ; `min_week_count`/`max_week_count` annoncés = sommes correctes ; bornes globales dans `]0, 24]`.

**Step 6 — ⛔ NE PAS COMMITER NI SEEDER.** Passer à Task 6 (validation). Le commit du doc se fait avec les valeurs validées (Task 6, Step 3).

---

## Task 6 : ⛔ POINT DE VALIDATION — coach

**Présenter les 14 templates** (les 7 saison convertis en phases avec leurs bornes + les 7 mini-prépa) au coach. Il corrige (bornes de phases, cycle de reload, durées). **Ne pas continuer sans son accord.**

**Step 1 —** Présenter une synthèse lisible : par template, la séquence de phases avec `[min/nominal/max]` et la durée globale `[min_week_count, max_week_count]`.

**Step 2 —** Intégrer les corrections du coach dans `docs/plans/bilan-muscu-templates-sources.md`.

**Step 3 — Commit du doc validé.**
```bash
git add docs/plans/bilan-muscu-templates-sources.md
git commit -m "docs(§292): 14 templates de périodisation en modèle de phases (validés coach)"
```

---

## Task 7 : Migration 00169 — seed des 14 templates validés

**Files:**
- Create: `supabase/migrations/00169_strength_periodization_templates_seed.sql`

**Step 1 — Écrire la migration de seed.** `INSERT` des 14 templates **validés** (Task 6). Un `INSERT` par template ; `structure` = jsonb conforme à `PeriodizationStructure` (clé `phases` : liste de `{cycle, min_weeks, nominal_weeks, max_weeks}` ; clé `bucket_emphasis`). `min_week_count`/`max_week_count` = sommes des bornes des phases.

Forme (exemple, valeurs réelles = celles du doc validé) :
```sql
-- 00169_strength_periodization_templates_seed.sql
-- Design : docs/plans/2026-05-18-bilan-muscu-templates-duree-variable-design.md
-- Seed des 14 templates (7 saison + 7 mini-prépa) validés par le coach.
BEGIN;

INSERT INTO strength_periodization_templates
  (event_group, kind, name, min_week_count, max_week_count, structure)
VALUES
  ('sprint_50', 'season', 'Sprint 50 m — Force-vitesse', 7, 15,
   '{"phases":[
       {"cycle":"force_max","min_weeks":2,"nominal_weeks":2,"max_weeks":4},
       {"cycle":"maintien","min_weeks":1,"nominal_weeks":1,"max_weeks":3},
       {"cycle":"puissance","min_weeks":2,"nominal_weeks":2,"max_weeks":4},
       {"cycle":"affutage","min_weeks":1,"nominal_weeks":3,"max_weeks":3},
       {"cycle":"pic","min_weeks":1,"nominal_weeks":1,"max_weeks":1}],
     "bucket_emphasis":{"upper_power":1.0,"lower_power":0.95,"upper_strength":0.6,"lower_strength":0.55,"mobility":0.4}}'::jsonb);
  -- … les 13 autres INSERT, valeurs issues du doc validé.

-- Garde-fou : 14 lignes, et cohérence min/max_week_count ↔ structure.
DO $$
DECLARE bad int;
BEGIN
  SELECT count(*) INTO bad FROM strength_periodization_templates;
  IF bad <> 14 THEN RAISE EXCEPTION 'Attendu 14 templates, trouvé %', bad; END IF;

  SELECT count(*) INTO bad FROM strength_periodization_templates t
  WHERE t.min_week_count <> (
      SELECT sum((p->>'min_weeks')::int)
      FROM jsonb_array_elements(t.structure->'phases') p)
     OR t.max_week_count <> (
      SELECT sum((p->>'max_weeks')::int)
      FROM jsonb_array_elements(t.structure->'phases') p);
  IF bad > 0 THEN
    RAISE EXCEPTION '% template(s) : min/max_week_count incohérent avec structure', bad;
  END IF;
END $$;

COMMIT;
```

**Step 2 — Appliquer** via `mcp__plugin_supabase_supabase__apply_migration` (`name: "00169_strength_periodization_templates_seed"`). Le bloc `DO` fait échouer la migration si une incohérence subsiste.

**Step 3 — Vérifier.** Via `execute_sql` :
`SELECT kind, count(*) FROM strength_periodization_templates GROUP BY kind;`
Expected: `season` 7, `inter_competition` 7.

**Step 4 — Commit.**
```bash
git add supabase/migrations/00169_strength_periodization_templates_seed.sql
git commit -m "feat(§292): seed des 14 templates de périodisation"
```

---

## Task 8 : Clôture & documentation

**Files:**
- Modify: `docs/implementation-log.md`, `docs/ROADMAP.md`, `docs/FEATURES_STATUS.md`, `CLAUDE.md`, `docs/claude/files-map.md`

**Step 1 — Vérification finale.**
Run: `npm test` → vert ; `npx tsc --noEmit` → exit 0 ; `npm run build` → succès.

**Step 2 — `docs/implementation-log.md`.** Compléter l'entrée §292 (ou ajouter une sous-entrée) : modèle de phases, durée variable, 14 templates, `sessions_per_week`, migrations `00167`-`00169`. Mentionner que ce design remplace la sous-tâche A3.4.

**Step 3 — `docs/ROADMAP.md`.** Statut du Chantier A → Fait (A3 inclus). Mettre à jour la ligne `*Dernière mise à jour*` en tête.

**Step 4 — `docs/FEATURES_STATUS.md`.** Statut de la feature Bilan Muscu / templates de périodisation.

**Step 5 — `CLAUDE.md`.** Mettre à jour la ligne « Dernier § livré » (≤ 15 mots).

**Step 6 — `docs/claude/files-map.md`.** Vérifier les fichiers touchés : `periodizationCycles.ts` (déjà ajouté en §292), `kpiBaremes.ts` (§290). Aucun nouveau fichier ≥ 150 lignes ici. Mettre à jour si une taille a varié de > 30 %.

**Step 7 — Commit.**
```bash
git add docs/ CLAUDE.md
git commit -m "docs(§292): clôture — templates à durée variable + mini-prépas"
```

---

## Notes d'exécution

- **Ordre** : 1 → 2 → 3 → 4 → 5 → 6 (validation bloquante) → 7 → 8. Task 5 (contenu) peut être préparée en parallèle des migrations, mais le seed (Task 7) attend la validation (Task 6).
- **Hors scope (→ Chantier C)** : la distribution durée-cible → semaines par phase, la lecture de `sessions_per_week`, la génération du mésocycle, l'UI de saisie.
- **A4 (5 GIFs des protocoles KPI)** reste une tâche utilisateur (production d'assets), hors plan de code.
