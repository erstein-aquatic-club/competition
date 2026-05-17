# Bilan Muscu — Chantier A (Contenu) — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Produire les 3 briques de contenu qui alimenteront le moteur de génération (Chantier C) : les barèmes de scoring des KPIs, le tagging du catalogue d'exercices `dim_exercices`, et 7 templates de périodisation par spécialité d'épreuve.

**Architecture:** Chantier majoritairement **recherche + contenu**, pas du code TDD classique. Trois briques : (A1) une config statique de barèmes + une fonction de scoring pure testée ; (A2) une extension de schéma de `dim_exercices` + un mapping des 94 exercices ; (A3) une nouvelle table `strength_periodization_templates` + 7 templates. Chaque brique enchaîne : **tâche de recherche/contenu → artefact proposé → point de validation utilisateur → migration de seed**.

**Tech Stack:** Supabase (Postgres, migrations via MCP), TypeScript (config + fonctions pures), tests `node:test`. Recherche : `WebSearch`/`WebFetch`.

**Design de référence:** `docs/plans/2026-05-17-bilan-muscu-chantier-A-design.md` — à lire avant de commencer.

---

## Contexte & conventions (lire avant tout)

- **Migrations** : créer le fichier SQL dans `supabase/migrations/` ET l'appliquer via le MCP Supabase (`mcp__plugin_supabase_supabase__apply_migration`). Projet ID `fscnobivsgornxdwqwlk`. Dernière migration appliquée : `00163`. Les numéros ci-dessous (`00164`+) sont indicatifs — incrémenter selon l'état réel au moment d'appliquer.
- **RLS** : helpers `app_user_id()` / `app_user_role()`. `dim_exercices` est déjà sous RLS — l'ajout de colonnes ne touche pas les policies. La nouvelle table `strength_periodization_templates` aura ses policies (cf. A3.1).
- **Tests unitaires** : `node --test`, fichiers `*.test.ts`. Lancer un fichier : `node --test --experimental-test-module-mocks --import tsx <chemin>`.
- **Tests RLS** : requis seulement si une policy/table sous RLS change (cf. CLAUDE.md). A2.1 (colonnes) → non. A3.1 (nouvelle table sous RLS) → **oui**.
- **`@/` alias** = `src/`.
- **Workflow doc** : chaque § ajouté à `docs/implementation-log.md` met à jour `ROADMAP.md`, `FEATURES_STATUS.md`, `CLAUDE.md`, `files-map.md` (cf. CLAUDE.md). Dernier § : §289. Les § de ce chantier : §290+.
- **Branche** : travailler sur `main` (convention projet).
- **Points de validation** : 3 tâches produisent un artefact de contenu qui **doit être validé par l'utilisateur** avant la migration de seed correspondante (A1.2, A2.3, A3.3). Ne pas seeder du contenu non validé.

---

## Brique A1 — Barèmes KPI

### Task A1.1 : Fonction de scoring `kpiScore` (TDD — indépendante des données)

La fonction de scoring est une fonction pure, testable avec des données fixtures **avant** que les vraies normes ne soient recherchées.

**Files:**
- Create: `src/lib/strength/kpiBaremes.ts`
- Test: `src/lib/strength/__tests__/kpiBaremes.test.ts`

**Step 1 — Écrire le test d'abord.** Modèle de barème retenu : chaque barème = une liste d'**points d'ancrage** `[valeurBrute, score]` triés par valeur croissante (issus des percentiles des normes publiées). `kpiScore` fait une **interpolation linéaire par morceaux** entre ancres, bornée [0, 100].

```typescript
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { kpiScore, type Bareme } from '../kpiBaremes.ts';

const bareme: Bareme = [
  [20, 0],   // 20 cm → score 0
  [35, 50],  // 35 cm → score 50
  [50, 100], // 50 cm → score 100
];

describe('kpiScore', () => {
  it('interpole linéairement entre deux ancres', () => {
    assert.equal(kpiScore(bareme, 27.5), 25); // milieu de [20,35]
  });
  it('rend la valeur exacte sur une ancre', () => {
    assert.equal(kpiScore(bareme, 35), 50);
  });
  it('borne à 0 sous la première ancre', () => {
    assert.equal(kpiScore(bareme, 10), 0);
  });
  it('borne à 100 au-dessus de la dernière ancre', () => {
    assert.equal(kpiScore(bareme, 80), 100);
  });
  it('throw si le barème a moins de 2 ancres', () => {
    assert.throws(() => kpiScore([[10, 0]], 10), /at least 2/);
  });
});
```

**Step 2 — Lancer, vérifier l'échec.**
Run: `node --test --experimental-test-module-mocks --import tsx src/lib/strength/__tests__/kpiBaremes.test.ts`
Expected: FAIL (module introuvable).

**Step 3 — Implémenter** `src/lib/strength/kpiBaremes.ts` : le type `Bareme = readonly (readonly [number, number])[]` et `kpiScore(bareme, value)` (interpolation linéaire par morceaux, clamp [0,100], throw si < 2 ancres). Pas encore de données — juste le type + la fonction.

**Step 4 — Lancer, vérifier le succès.** Même commande. Expected: PASS.

**Step 5 — Commit.**
```bash
git add src/lib/strength/kpiBaremes.ts src/lib/strength/__tests__/kpiBaremes.test.ts
git commit -m "feat(§290): fonction de scoring kpiScore (interpolation barème)"
```

### Task A1.2 : Recherche des normes + données de barèmes — **ARTEFACT À VALIDER**

**Files:**
- Create: `docs/plans/bilan-muscu-baremes-sources.md` (note de recherche — sources + valeurs)
- Modify: `src/lib/strength/kpiBaremes.ts` (ajout des données `KPI_BAREMES`)

**Type de tâche : recherche + contenu.** Pas du TDD.

**Step 1 — Recherche.** Via `WebSearch`/`WebFetch`, sourcer les normes publiées par sexe et bande d'âge natation pour les 5 KPIs :
- `vertical_jump`, `broad_jump` → normes directes (batteries de tests jeunesse, EUROFIT, données athlétiques jeunes).
- `weighted_pullup`, `imtp` (tirage mi-cuisse barre, charge max), `medball_vertical_throw` → **transposition** depuis des tests de force/puissance proches ; documenter le raisonnement de transposition.
Définir les **bandes d'âge** (alignées catégories natation FFN — ex. ~11-12 / 13-14 / 15-16 / 17+ ; arrêter la liste exacte dans la note de recherche).

**Step 2 — Rédiger `docs/plans/bilan-muscu-baremes-sources.md`** : pour chaque KPI × sexe × bande, les points d'ancrage `[valeur, score]` proposés, avec la source et (pour les 3 KPIs transposés) le raisonnement + le caveat.

**Step 3 — ⛔ POINT DE VALIDATION** : présenter la note de recherche à l'utilisateur. Ne pas continuer sans son accord (il peut corriger des valeurs).

**Step 4 — Encoder** les barèmes validés dans `KPI_BAREMES` (`kpiBaremes.ts`) : structure `Record<StrengthKpiKey, Record<'M'|'F', Record<AgeBand, Bareme>>>` (ou équivalent), + un helper `getBareme(kpiKey, sex, ageBand)`. Commenter le caveat des 3 KPIs transposés.

**Step 5 — Type check + commit.**
Run: `npx tsc --noEmit` → PASS.
```bash
git add src/lib/strength/kpiBaremes.ts docs/plans/bilan-muscu-baremes-sources.md
git commit -m "feat(§290): barèmes KPI — normes publiées par sexe et bande d'âge"
```

---

## Brique A2 — Tagging du catalogue d'exercices

### Task A2.1 : Migration — colonnes de tagging sur `dim_exercices`

**Files:**
- Create: `supabase/migrations/00164_dim_exercices_tagging.sql`

**Step 1 — Écrire la migration** (colonnes nullable — le seed viendra en A2.3) :

```sql
-- 00164_dim_exercices_tagging.sql
-- §291 — Chantier A : colonnes de tagging du catalogue d'exercices pour le
-- moteur Bilan Muscu. Colonnes nullable ; le mapping des 94 exercices est
-- seedé après validation coach (migration séparée).
BEGIN;

ALTER TABLE dim_exercices
  ADD COLUMN bucket TEXT
    CHECK (bucket IN ('lower_strength','lower_power','upper_strength','upper_power','mobility')),
  ADD COLUMN contraindication_zones TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN level TEXT
    CHECK (level IN ('beginner','intermediate','advanced'));

CREATE INDEX dim_exercices_bucket_idx ON dim_exercices (bucket) WHERE bucket IS NOT NULL;

COMMIT;
```

**Step 2 — Appliquer** via `mcp__plugin_supabase_supabase__apply_migration` (`name: "00164_dim_exercices_tagging"`).
**Step 3 — Vérifier** via `list_tables` que les 3 colonnes existent.
**Step 4 — Commit.**
```bash
git add supabase/migrations/00164_dim_exercices_tagging.sql
git commit -m "feat(§291): colonnes de tagging bucket/contraindication/level sur dim_exercices"
```

### Task A2.2 : Mapping des 94 exercices — **ARTEFACT À VALIDER**

**Files:**
- Create: `docs/plans/bilan-muscu-exercices-tagging.md`

**Type de tâche : contenu.** Pas du TDD.

**Step 1 — Récupérer les 94 exercices** : `mcp__plugin_supabase_supabase__execute_sql` →
`SELECT id, nom_exercice, exercise_subtype FROM dim_exercices ORDER BY id;`

**Step 2 — Proposer le mapping.** Pour chaque exercice : `bucket` (parmi les 5), `contraindication_zones` (zones de douleur — vocabulaire = celui de `src/components/wellness/BodySvg.tsx` / `BodyHeatMap` ; les lire pour le set exact), `level`. S'appuyer sur `nom_exercice` + `exercise_subtype` (`power`/`plyometric` → `*_power` ; `prehab` → `mobility` ; etc.). Produire un tableau markdown dans `docs/plans/bilan-muscu-exercices-tagging.md` (colonnes : id, nom, bucket, contraindication_zones, level).

**Step 3 — ⛔ POINT DE VALIDATION** : présenter le tableau à l'utilisateur. Il corrige. Ne pas seeder sans validation.

### Task A2.3 : Migration de seed du mapping validé

**Files:**
- Create: `supabase/migrations/001XX_dim_exercices_tagging_seed.sql` (numéro = prochain libre)

**Step 1 — Écrire la migration de seed** : `UPDATE dim_exercices SET bucket=…, contraindication_zones=…, level=… WHERE id=…;` pour les 94 exercices, avec les valeurs **validées** en A2.2. Encapsuler dans `BEGIN;`/`COMMIT;`.
**Step 2 — Appliquer** via MCP.
**Step 3 — Vérifier** : `SELECT bucket, count(*) FROM dim_exercices GROUP BY bucket;` — aucun `bucket` NULL inattendu.
**Step 4 — Commit** : `feat(§291): seed du tagging des 94 exercices`.

> Pas de `npm run test:rls` : ajout de colonnes + UPDATE de données, aucune policy modifiée.

---

## Brique A3 — Templates de périodisation

### Task A3.1 : Migration — table `strength_periodization_templates`

**Files:**
- Create: `supabase/migrations/001XX_strength_periodization_templates.sql`

**Step 1 — Écrire la migration** :

```sql
-- 001XX_strength_periodization_templates.sql
-- §292 — Chantier A : table des templates de périodisation du Bilan Muscu.
BEGIN;

CREATE TABLE strength_periodization_templates (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_group  TEXT NOT NULL,            -- 'sprint_50' | 'breaststroke' | 'backstroke'
                                         -- | '200m' | '400m' | 'distance' | 'medley'
  name         TEXT NOT NULL,
  week_count   INTEGER NOT NULL CHECK (week_count > 0 AND week_count <= 24),
  structure    JSONB NOT NULL,           -- séquence semaine→cycle + emphase par seau
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER strength_periodization_templates_set_updated_at
  BEFORE UPDATE ON strength_periodization_templates
  FOR EACH ROW EXECUTE FUNCTION set_updated_at_timestamp();

ALTER TABLE strength_periodization_templates ENABLE ROW LEVEL SECURITY;

-- Référentiel partagé : lecture pour tout authentifié, écriture admin/coach.
CREATE POLICY spt_select ON strength_periodization_templates
  FOR SELECT TO authenticated USING (true);
CREATE POLICY spt_write ON strength_periodization_templates
  FOR ALL TO authenticated
  USING (app_user_role() IN ('coach','admin'))
  WITH CHECK (app_user_role() IN ('coach','admin'));

COMMIT;
```

**Step 2 — Appliquer** via MCP. **Step 3 — Vérifier** via `list_tables`.
**Step 4 — TS type** : ajouter dans `src/lib/api/types.ts` l'interface `StrengthPeriodizationTemplate` + le type du `structure` jsonb (`week_count` semaines, chacune `{ cycle: 'endurance'|'hypertrophie'|'force'|'deload'; ... }` + `bucket_emphasis: Record<bucket, number>`). `npx tsc --noEmit` → PASS.
**Step 5 — Commit** : `feat(§292): table strength_periodization_templates (RLS) + types`.

### Task A3.2 : Tests RLS de la nouvelle table

**Files:**
- Modify: `supabase/tests/schema.sql` (ajout table + RLS, copie de A3.1)
- Create: `supabase/tests/rls/strength-periodization-templates.test.ts`

Vérifier Docker (`docker ps`, 1×). Cas : lecture pour un nageur authentifié ✅ ; écriture refusée pour un nageur ; écriture autorisée coach/admin. Run `npm run test:rls` → vert (hors 2 échecs pré-existants connus — cf. memory). Commit : `test(§292): tests RLS strength_periodization_templates`.

### Task A3.3 : Recherche S&C + rédaction des 7 templates — **ARTEFACT À VALIDER**

**Files:**
- Create: `docs/plans/bilan-muscu-templates-sources.md`

**Type de tâche : recherche + contenu.** Gros morceau.

**Step 1 — Recherche** via `WebSearch`/`WebFetch` : littérature S&C natation (périodisation force par profil d'épreuve) + approches publiquement documentées d'athlètes de référence par spécialité (sprint, brasse, dos, demi-fond, fond, 4 nages).

**Step 2 — Rédiger** les 7 templates dans `docs/plans/bilan-muscu-templates-sources.md` : pour chaque (T1 Sprint 50, T2 Brasse, T3 Dos, T4 200 m, T5 400 m, T6 800/1500 m, T7 4 nages) — `week_count`, la séquence semaine→cycle, le profil d'emphase par seau, et la justification S&C + sources.

**Step 3 — ⛔ POINT DE VALIDATION** : présenter les 7 templates à l'utilisateur. Il corrige. Ne pas seeder sans validation.

### Task A3.4 : Migration de seed des 7 templates validés

**Files:**
- Create: `supabase/migrations/001XX_strength_periodization_templates_seed.sql`

`INSERT` des 7 templates validés (`structure` jsonb). Appliquer via MCP. Vérifier `SELECT event_group, name, week_count FROM strength_periodization_templates;` → 7 lignes. Commit : `feat(§292): seed des 7 templates de périodisation`.

---

## A4 — GIFs des protocoles KPI (hors plan de code)

Les 5 GIFs de démonstration des protocoles KPI (`src/lib/strength/kpiProtocols.ts`, `gifUrl: null`) sont une **production d'assets** (filmer, convertir, héberger dans le bucket Storage `exercise-gifs`). Hors scope de ce plan de code — tâche à mener par l'utilisateur. Une fois les GIFs hébergés, renseigner les 5 `gifUrl` dans `kpiProtocols.ts` (1 petit commit).

---

## Phase finale — Vérification & documentation

- `npm test` (suite complète) → vert ; `npx tsc --noEmit` → exit 0 ; `npm run build` → succès.
- Documentation (workflow CLAUDE.md) : entrées § dans `implementation-log.md` (§290 barèmes, §291 tagging, §292 templates), lignes `ROADMAP.md` + `*Dernière mise à jour*`, `FEATURES_STATUS.md`, `files-map.md` (nouveaux fichiers : `kpiBaremes.ts` ; nouvelle table), `CLAUDE.md` « Dernier § livré ».

## Notes d'exécution

- **Ordre & parallélisme** : A2 (tagging) est purement code+contenu, sans recherche externe — exécutable en premier. A1 et A3 contiennent chacun une recherche documentaire — parallélisables entre elles. Les migrations de seed (A2.3, A3.4) viennent **après** leur point de validation.
- **Numéros de migration** : `00164` est le premier libre. Les suivants (`001XX`) — prendre le prochain libre au moment d'appliquer.
- **Les 3 points de validation** (A1.2, A2.2, A3.3) sont bloquants : le contenu proposé doit être revu par l'utilisateur avant la migration de seed. C'est le cœur du « je propose, tu valides » décidé en cadrage.
- **Hors scope** (→ Chantier C) : le moteur de scoring des seaux, la combinaison emphase-épreuve / seau faible, la détermination du `level` de l'athlète, la génération du mésocycle.
