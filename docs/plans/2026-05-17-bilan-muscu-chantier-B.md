# Bilan Muscu — Chantier B (Évaluation) — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Construire la fondation « Évaluation » du feature *Bilan Muscu → Mésocycle* : les deux tables d'évaluation, leur couche API testée, et les trois écrans de collecte (questionnaire nageur, wizard KPIs, bilan coach).

**Architecture:** Deux nouvelles tables Postgres sous RLS (`strength_assessments`, `strength_kpi_measurements`), une couche API en wrappers Supabase suivant le pattern existant de `src/lib/api/`, des helpers purs testés en unitaire, et trois écrans React câblés via routing hash Wouter. Aucun moteur ni génération ici — uniquement la collecte et le stockage des données.

**Tech Stack:** React 19 + TypeScript + Vite, Supabase (Postgres + RLS), Wouter (hash routing), React Query 5, Tailwind 4 / Shadcn. Tests unitaires via `node:test` + `node:assert`, tests RLS via le harness `supabase/tests/rls/`.

**Design de référence:** `docs/plans/2026-05-17-bilan-muscu-mesocycle-design.md` — à lire avant de commencer.

---

## Contexte & conventions du projet (lire avant tout)

- **Migrations** : créer le fichier SQL dans `supabase/migrations/` ET l'appliquer via le MCP Supabase (`mcp__plugin_supabase_supabase__apply_migration`). Jamais `supabase db push`. Projet ID `fscnobivsgornxdwqwlk`.
- **RLS** : les policies utilisent les helpers `app_user_id()` et `app_user_role()` — jamais `auth.uid()` en direct.
- **API** : pas de fichier `src/lib/api.ts` (CLAUDE.md est obsolète sur ce point). Les modules vivent dans `src/lib/api/*.ts` et sont re-exportés par `src/lib/api/index.ts`. L'app importe depuis `@/lib/api`.
- **Tests unitaires** : runner `node --test`, fichiers `*.test.ts` dans `src/lib/api/__tests__/`. Pattern de mock : voir `src/lib/api/__tests__/pace-targets.test.ts` (mock de `../client.ts` via `mock.module`).
  - Lancer un fichier : `node --test --experimental-test-module-mocks --import tsx <chemin>`
- **Tests RLS** : harness `supabase/tests/rls/`, schéma hand-crafted dans `supabase/tests/schema.sql` + `supabase/tests/seed.sql`. Nécessite Docker + `supabase start`. Doc : `docs/rls-testing.md`.
- **UI** : règle globale du projet — tout développement d'interface passe **obligatoirement** par le skill `frontend-design`. Les phases 6-8 ci-dessous délèguent explicitement le rendu visuel à ce skill ; le plan fournit le contrat de données, pas le JSX.
- **Workflow doc** : chaque tâche du plan = un commit. Chaque § ajouté à `docs/implementation-log.md` met à jour `docs/ROADMAP.md`, `docs/FEATURES_STATUS.md`, `CLAUDE.md` (cf. CLAUDE.md § « Workflow de documentation obligatoire »). Le n° de § courant est à lire dans `docs/implementation-log.md` (dernier livré : §284).
- **Branche** : le projet travaille directement sur `main` (cf. historique git + CLAUDE.md § Déploiement). Rester sur `main`.

---

## Phase 1 — Migration : tables d'évaluation

### Task 1.1 : Écrire la migration SQL

**Files:**
- Create: `supabase/migrations/00163_strength_assessments.sql`

**Step 1: Créer le fichier de migration**

```sql
-- 00163_strength_assessments.sql
-- §XXX — Chantier B "Bilan Muscu → Mésocycle" : tables d'évaluation.
-- Design : docs/plans/2026-05-17-bilan-muscu-mesocycle-design.md
--
-- strength_assessments      : un bilan par nageur (questionnaire nageur +
--                             bilan mobilité/mouvement coach + scoring seaux).
-- strength_kpi_measurements : série temporelle des 5 KPIs du wizard.
--
-- RLS : calquée sur pain_reports (00068) — le nageur possède ses lignes,
-- coach/admin lisent ET écrivent (le coach renseigne physical_tests / valide
-- les mesures KPI).

BEGIN;

-- ────────────────────────────────────────────────────────────────────────
-- strength_assessments
-- ────────────────────────────────────────────────────────────────────────
CREATE TABLE strength_assessments (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  athlete_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  coach_id         INTEGER REFERENCES users(id) ON DELETE SET NULL,
  status           TEXT NOT NULL DEFAULT 'questionnaire_pending'
                     CHECK (status IN ('questionnaire_pending','bilan_pending','completed')),
  questionnaire    JSONB,
  physical_tests   JSONB,
  bucket_scores    JSONB,
  data_confidence  TEXT NOT NULL DEFAULT 'full'
                     CHECK (data_confidence IN ('full','partial','low')),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX strength_assessments_athlete_idx
  ON strength_assessments (athlete_id, created_at DESC);

-- ────────────────────────────────────────────────────────────────────────
-- strength_kpi_measurements
-- ────────────────────────────────────────────────────────────────────────
CREATE TABLE strength_kpi_measurements (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  athlete_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kpi_key         TEXT NOT NULL CHECK (kpi_key IN (
                    'vertical_jump','broad_jump','imtp',
                    'weighted_pullup','medball_vertical_throw')),
  value           NUMERIC NOT NULL CHECK (value >= 0),
  unit            TEXT NOT NULL,
  attempts        JSONB,
  measured_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  measured_by     INTEGER REFERENCES users(id) ON DELETE SET NULL,
  assisted_by     INTEGER REFERENCES users(id) ON DELETE SET NULL,
  source          TEXT NOT NULL CHECK (source IN ('wizard_athlete','wizard_coach')),
  coach_reviewed  BOOLEAN NOT NULL DEFAULT false,
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX strength_kpi_measurements_athlete_idx
  ON strength_kpi_measurements (athlete_id, kpi_key, measured_at DESC);

-- ────────────────────────────────────────────────────────────────────────
-- updated_at trigger (réutilise set_updated_at_timestamp, créée en 00162)
-- ────────────────────────────────────────────────────────────────────────
CREATE TRIGGER strength_assessments_set_updated_at
  BEFORE UPDATE ON strength_assessments
  FOR EACH ROW EXECUTE FUNCTION set_updated_at_timestamp();

-- ────────────────────────────────────────────────────────────────────────
-- RLS — strength_assessments
-- ────────────────────────────────────────────────────────────────────────
ALTER TABLE strength_assessments ENABLE ROW LEVEL SECURITY;

CREATE POLICY strength_assessments_own ON strength_assessments
  FOR ALL TO authenticated
  USING (athlete_id = app_user_id())
  WITH CHECK (athlete_id = app_user_id());

CREATE POLICY strength_assessments_coach ON strength_assessments
  FOR ALL TO authenticated
  USING (app_user_role() IN ('coach','admin'))
  WITH CHECK (app_user_role() IN ('coach','admin'));

-- ────────────────────────────────────────────────────────────────────────
-- RLS — strength_kpi_measurements
-- ────────────────────────────────────────────────────────────────────────
ALTER TABLE strength_kpi_measurements ENABLE ROW LEVEL SECURITY;

CREATE POLICY strength_kpi_measurements_own ON strength_kpi_measurements
  FOR ALL TO authenticated
  USING (athlete_id = app_user_id())
  WITH CHECK (athlete_id = app_user_id());

CREATE POLICY strength_kpi_measurements_coach ON strength_kpi_measurements
  FOR ALL TO authenticated
  USING (app_user_role() IN ('coach','admin'))
  WITH CHECK (app_user_role() IN ('coach','admin'));

COMMIT;
```

**Step 2: Appliquer la migration via MCP**

Appeler `mcp__plugin_supabase_supabase__apply_migration` avec `name: "00163_strength_assessments"` et le SQL ci-dessus (sans le `BEGIN;`/`COMMIT;` si le MCP encapsule déjà — sinon les garder ; vérifier le retour).

Expected: succès, pas d'erreur.

**Step 3: Vérifier les tables**

Appeler `mcp__plugin_supabase_supabase__list_tables` et confirmer la présence de `strength_assessments` et `strength_kpi_measurements`.

**Step 4: Commit**

```bash
git add supabase/migrations/00163_strength_assessments.sql
git commit -m "feat(§XXX): tables strength_assessments + strength_kpi_measurements (RLS)"
```

---

## Phase 2 — Types TypeScript

### Task 2.1 : Déclarer les interfaces

**Files:**
- Modify: `src/lib/api/types.ts` (ajouter après l'interface `PainReport`, ~ligne 877)

**Step 1: Ajouter les types**

```typescript
// ── Bilan Muscu — Évaluation (Chantier B) ──

export type StrengthAssessmentStatus =
  | 'questionnaire_pending'
  | 'bilan_pending'
  | 'completed';

export type StrengthDataConfidence = 'full' | 'partial' | 'low';

/** Une zone de douleur déclarée dans le questionnaire nageur. */
export interface QuestionnairePainEntry {
  body_zone: string;
  intensity: number; // 1-3, cohérent avec pain_reports
}

/** Contenu JSONB de strength_assessments.questionnaire. */
export interface StrengthQuestionnaire {
  pain: QuestionnairePainEntry[];
  injury_history: string;        // texte libre
  mobility_feel: number;         // ressenti 1-5
  psychology: {
    confidence: number;          // 1-5
    motivation: number;          // 1-5
    stress: number;              // 1-5
  };
  filled_at: string;             // ISO timestamp
}

/** Contenu JSONB de strength_assessments.physical_tests (saisi par le coach). */
export interface StrengthPhysicalTests {
  mobility: {
    shoulder_flexion: number;    // score 0-3
    t_spine: number;             // score 0-3
    hip: number;                 // score 0-3
  };
  movement: {
    scapula_control: number;     // score 0-3
    trunk_neck_alignment: number;// score 0-3
    hip_hinge: number;           // score 0-3
  };
  filled_at: string;
}

export interface StrengthAssessment {
  id: string;
  athlete_id: number;
  coach_id: number | null;
  status: StrengthAssessmentStatus;
  questionnaire: StrengthQuestionnaire | null;
  physical_tests: StrengthPhysicalTests | null;
  bucket_scores: Record<string, number> | null;
  data_confidence: StrengthDataConfidence;
  created_at: string;
  updated_at: string;
}

export type StrengthKpiKey =
  | 'vertical_jump'
  | 'broad_jump'
  | 'imtp'
  | 'weighted_pullup'
  | 'medball_vertical_throw';

export type StrengthKpiSource = 'wizard_athlete' | 'wizard_coach';

export interface StrengthKpiMeasurement {
  id: string;
  athlete_id: number;
  kpi_key: StrengthKpiKey;
  value: number;
  unit: string;
  attempts: number[] | null;
  measured_at: string;
  measured_by: number | null;
  assisted_by: number | null;
  source: StrengthKpiSource;
  coach_reviewed: boolean;
  notes: string | null;
  created_at: string;
}
```

**Step 2: Type check**

Run: `npx tsc --noEmit`
Expected: PASS (pas d'erreur nouvelle ; les erreurs pré-existantes des `*.stories.tsx` sont tolérées — cf. MEMORY).

**Step 3: Commit**

```bash
git add src/lib/api/types.ts
git commit -m "feat(§XXX): types StrengthAssessment + StrengthKpiMeasurement"
```

---

## Phase 3 — Couche API + tests unitaires

### Task 3.1 : Module API `strength-kpi.ts` (TDD)

**Files:**
- Create: `src/lib/api/strength-kpi.ts`
- Test: `src/lib/api/__tests__/strength-kpi.test.ts`

**Step 1: Écrire les tests d'abord**

Créer `src/lib/api/__tests__/strength-kpi.test.ts` en suivant exactement le pattern de `pace-targets.test.ts` (mock de `../client.ts`). Couvrir :

- `recordKpiMeasurement` → appelle `.from('strength_kpi_measurements').insert(...)` avec les bons champs et retourne la ligne.
- `getKpiHistory(athleteId, kpiKey)` → `.select().eq('athlete_id').eq('kpi_key').order('measured_at', desc)`.
- `getLatestKpiMeasurements(athleteId)` → retourne un `Record<StrengthKpiKey, StrengthKpiMeasurement | null>` avec la mesure la plus récente de chaque clé, `null` si absente.
- `markKpiReviewed(id)` → `.update({ coach_reviewed: true }).eq('id', id).select('id')` ; throw si retour vide (anti no-op §113).
- chaque fonction throw sur erreur Supabase.

**Step 2: Lancer les tests — doit échouer**

Run: `node --test --experimental-test-module-mocks --import tsx src/lib/api/__tests__/strength-kpi.test.ts`
Expected: FAIL (module introuvable).

**Step 3: Implémenter le module**

Créer `src/lib/api/strength-kpi.ts` suivant le pattern de `painReports.ts` et `strength-planning.ts` (imports `supabase, canUseSupabase, assertSupabase` depuis `./client`). Fonctions :

```typescript
/** API Strength KPI — mesures du wizard KPIs (Chantier B). */
import { supabase, canUseSupabase, assertSupabase } from './client';
import type { StrengthKpiKey, StrengthKpiMeasurement } from './types';

const ALL_KPI_KEYS: StrengthKpiKey[] = [
  'vertical_jump', 'broad_jump', 'imtp', 'weighted_pullup', 'medball_vertical_throw',
];

export interface RecordKpiInput {
  athlete_id: number;
  kpi_key: StrengthKpiKey;
  value: number;
  unit: string;
  attempts?: number[];
  measured_by: number;
  assisted_by?: number | null;
  source: 'wizard_athlete' | 'wizard_coach';
  notes?: string | null;
}

export async function recordKpiMeasurement(
  input: RecordKpiInput,
): Promise<StrengthKpiMeasurement> {
  if (!canUseSupabase()) throw new Error('Supabase not available');
  const data = assertSupabase(
    await supabase
      .from('strength_kpi_measurements')
      .insert({
        athlete_id: input.athlete_id,
        kpi_key: input.kpi_key,
        value: input.value,
        unit: input.unit,
        attempts: input.attempts ?? null,
        measured_by: input.measured_by,
        assisted_by: input.assisted_by ?? null,
        source: input.source,
        notes: input.notes ?? null,
      })
      .select()
      .single(),
  );
  return data as StrengthKpiMeasurement;
}

export async function getKpiHistory(
  athleteId: number,
  kpiKey: StrengthKpiKey,
): Promise<StrengthKpiMeasurement[]> {
  if (!canUseSupabase()) return [];
  const data = assertSupabase(
    await supabase
      .from('strength_kpi_measurements')
      .select('*')
      .eq('athlete_id', athleteId)
      .eq('kpi_key', kpiKey)
      .order('measured_at', { ascending: false }),
  );
  return (data ?? []) as StrengthKpiMeasurement[];
}

export async function getLatestKpiMeasurements(
  athleteId: number,
): Promise<Record<StrengthKpiKey, StrengthKpiMeasurement | null>> {
  const result = Object.fromEntries(
    ALL_KPI_KEYS.map((k) => [k, null]),
  ) as Record<StrengthKpiKey, StrengthKpiMeasurement | null>;
  if (!canUseSupabase()) return result;
  const data = assertSupabase(
    await supabase
      .from('strength_kpi_measurements')
      .select('*')
      .eq('athlete_id', athleteId)
      .order('measured_at', { ascending: false }),
  );
  for (const row of (data ?? []) as StrengthKpiMeasurement[]) {
    if (result[row.kpi_key] === null) result[row.kpi_key] = row;
  }
  return result;
}

export async function markKpiReviewed(id: string): Promise<void> {
  if (!canUseSupabase()) throw new Error('Supabase not available');
  const data = assertSupabase(
    await supabase
      .from('strength_kpi_measurements')
      .update({ coach_reviewed: true })
      .eq('id', id)
      .select('id'),
  );
  if (!data || data.length === 0) {
    throw new Error('KPI measurement not found or not allowed to update');
  }
}
```

**Step 4: Lancer les tests — doivent passer**

Run: `node --test --experimental-test-module-mocks --import tsx src/lib/api/__tests__/strength-kpi.test.ts`
Expected: PASS.

**Step 5: Commit**

```bash
git add src/lib/api/strength-kpi.ts src/lib/api/__tests__/strength-kpi.test.ts
git commit -m "feat(§XXX): API strength-kpi (CRUD mesures wizard KPIs)"
```

### Task 3.2 : Module API `strength-assessments.ts` (TDD)

**Files:**
- Create: `src/lib/api/strength-assessments.ts`
- Test: `src/lib/api/__tests__/strength-assessments.test.ts`

**Step 1: Écrire les tests d'abord** — couvrir :
- `createAssessment({ athlete_id, coach_id })` → `.insert(...).select().single()`, status par défaut `questionnaire_pending`.
- `getLatestAssessment(athleteId)` → `.select().eq('athlete_id').order('created_at', desc).limit(1)` → 1ʳᵉ ligne ou `null`.
- `getAssessment(id)` → ligne ou `null`.
- `updateAssessmentQuestionnaire(id, questionnaire)` → `.update({ questionnaire, status: 'bilan_pending' }).eq('id').select('id')` ; throw si no-op.
- `updateAssessmentPhysicalTests(id, physicalTests)` → `.update({ physical_tests, status: 'completed' }).eq('id').select('id')` ; throw si no-op.
- throw sur erreur Supabase.

**Step 2: Lancer — doit échouer**

Run: `node --test --experimental-test-module-mocks --import tsx src/lib/api/__tests__/strength-assessments.test.ts`
Expected: FAIL.

**Step 3: Implémenter** `strength-assessments.ts` (même pattern : `supabase/canUseSupabase/assertSupabase`). Fonctions : `createAssessment`, `getLatestAssessment`, `getAssessment`, `listAssessments`, `updateAssessmentQuestionnaire`, `updateAssessmentPhysicalTests`. Les `update*` renvoient `void` et utilisent `.select('id')` + garde anti no-op (cf. `deleteStrengthPlanningSlotOverride` dans `strength-planning.ts`).

**Step 4: Lancer — doivent passer**

Run: `node --test --experimental-test-module-mocks --import tsx src/lib/api/__tests__/strength-assessments.test.ts`
Expected: PASS.

**Step 5: Commit**

```bash
git add src/lib/api/strength-assessments.ts src/lib/api/__tests__/strength-assessments.test.ts
git commit -m "feat(§XXX): API strength-assessments (CRUD bilan)"
```

### Task 3.3 : Re-exports dans `index.ts`

**Files:**
- Modify: `src/lib/api/index.ts` (après le bloc `painReports`, ~ligne 369)

**Step 1: Ajouter les exports**

```typescript
// Bilan Muscu — Évaluation (Chantier B)
export {
  recordKpiMeasurement,
  getKpiHistory,
  getLatestKpiMeasurements,
  markKpiReviewed,
} from './strength-kpi';
export type { RecordKpiInput } from './strength-kpi';

export {
  createAssessment,
  getLatestAssessment,
  getAssessment,
  listAssessments,
  updateAssessmentQuestionnaire,
  updateAssessmentPhysicalTests,
} from './strength-assessments';
```

**Step 2: Type check**

Run: `npx tsc --noEmit`
Expected: PASS.

**Step 3: Commit**

```bash
git add src/lib/api/index.ts
git commit -m "feat(§XXX): re-export API évaluation muscu dans index.ts"
```

---

## Phase 4 — Tests RLS d'intégration

> **Obligatoire** : Phase 1 ajoute deux tables sous RLS → cf. CLAUDE.md § « Tests RLS intégration », règle 1. Vérifier Docker (`docker ps`, 1× max) ; si éteint, demander à l'utilisateur de lancer Docker Desktop et attendre confirmation. Si Docker tourne mais pas `supabase start`, le lancer.

### Task 4.1 : Étendre le schéma de test

**Files:**
- Modify: `supabase/tests/schema.sql` (ajouter les 2 tables + RLS, copie fidèle de la migration 00163)
- Modify: `supabase/tests/seed.sql` (si des lignes seed sont nécessaires — sinon laisser)

**Step 1:** Lire `supabase/tests/schema.sql` et `docs/rls-testing.md § Ajouter un test` pour comprendre la structure du harness, puis ajouter les `CREATE TABLE` + `ENABLE ROW LEVEL SECURITY` + `CREATE POLICY` identiques à la migration 00163.

**Step 2: Commit** (groupé avec Task 4.2).

### Task 4.2 : Écrire le test RLS

**Files:**
- Create: `supabase/tests/rls/strength-assessments.test.ts`

**Step 1:** Écrire les cas (suivre un fichier `supabase/tests/rls/*.test.ts` existant comme modèle) :
- Un nageur lit/écrit **uniquement** ses propres `strength_assessments` et `strength_kpi_measurements`.
- Un nageur ne voit **pas** le bilan d'un autre nageur.
- Un coach lit ET écrit les lignes de n'importe quel nageur.
- Un coach peut passer `coach_reviewed` à `true` sur une mesure d'un nageur.

**Step 2: Lancer les tests RLS**

Run: `npm run test:rls`
Expected: PASS (tous les cas verts).

**Step 3: Commit**

```bash
git add supabase/tests/schema.sql supabase/tests/seed.sql supabase/tests/rls/strength-assessments.test.ts
git commit -m "test(§XXX): tests RLS strength_assessments + strength_kpi_measurements"
```

---

## Phase 5 — Config protocoles KPI + helper « meilleur essai » (TDD)

### Task 5.1 : Helper `bestAttempt` (TDD)

**Files:**
- Create: `src/lib/strength/kpiMeasurement.ts`
- Test: `src/lib/strength/__tests__/kpiMeasurement.test.ts`

**Step 1: Test d'abord**

```typescript
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { bestAttempt } from '../kpiMeasurement.ts';

describe('bestAttempt', () => {
  it('returns the max — tous les KPIs sont "plus = mieux"', () => {
    assert.equal(bestAttempt([38, 41, 39]), 41);
  });
  it('handles a single attempt', () => {
    assert.equal(bestAttempt([55]), 55);
  });
  it('throws on empty input', () => {
    assert.throws(() => bestAttempt([]), /at least one/);
  });
});
```

**Step 2: Lancer — échoue**

Run: `node --test --experimental-test-module-mocks --import tsx src/lib/strength/__tests__/kpiMeasurement.test.ts`
Expected: FAIL.

**Step 3: Implémenter**

```typescript
/** Sélection de l'essai retenu pour un KPI. Les 5 KPIs sont tous
 *  "valeur haute = meilleure" → on retient le maximum. */
export function bestAttempt(attempts: number[]): number {
  if (attempts.length === 0) {
    throw new Error('bestAttempt: need at least one attempt');
  }
  return Math.max(...attempts);
}
```

**Step 4: Lancer — passe**

Run: `node --test --experimental-test-module-mocks --import tsx src/lib/strength/__tests__/kpiMeasurement.test.ts`
Expected: PASS.

**Step 5: Commit**

```bash
git add src/lib/strength/kpiMeasurement.ts src/lib/strength/__tests__/kpiMeasurement.test.ts
git commit -m "feat(§XXX): helper bestAttempt (sélection essai KPI)"
```

### Task 5.2 : Config des fiches-protocole KPI

**Files:**
- Create: `src/lib/strength/kpiProtocols.ts`

**Step 1: Créer la config** — un objet typé décrivant les 5 tests. Le contenu fin (illustrations, GIFs) relève du Chantier A : ici les `gifUrl` sont `null` (placeholder), les protocoles texte sont renseignés depuis le design.

```typescript
import type { StrengthKpiKey } from '@/lib/api/types';

export interface KpiProtocol {
  key: StrengthKpiKey;
  label: string;          // "Saut vertical"
  bucket: string;         // seau alimenté
  unit: string;           // "cm" | "kg"
  attempts: number;       // nombre d'essais (meilleur retenu)
  /** Étapes du protocole, dans l'ordre, affichées dans le wizard. */
  steps: string[];
  /** Rôle du binôme pendant la mesure. */
  partnerRole: string;
  /** Méthode de mesure chiffrée. */
  measurement: string;
  gifUrl: string | null;  // Chantier A
}

export const KPI_PROTOCOLS: Record<StrengthKpiKey, KpiProtocol> = {
  vertical_jump: {
    key: 'vertical_jump',
    label: 'Saut vertical',
    bucket: 'Puissance bas du corps',
    unit: 'cm',
    attempts: 3,
    steps: [
      'Debout, pieds écartés largeur de hanches.',
      'Fléchir puis sauter le plus haut possible, bras tendus vers le haut.',
      'Toucher le mur / la mire le plus haut possible.',
    ],
    partnerRole: 'Repère la hauteur atteinte (doigts) et la mesure au mètre.',
    measurement: 'Hauteur atteinte − hauteur bras tendu debout, en cm. Meilleur de 3.',
    gifUrl: null,
  },
  broad_jump: {
    key: 'broad_jump',
    label: 'Saut en longueur',
    bucket: 'Puissance bas du corps',
    unit: 'cm',
    attempts: 3,
    steps: [
      'Debout derrière une ligne, pieds joints.',
      'Sauter le plus loin possible vers l\'avant, réception stable.',
    ],
    partnerRole: 'Mesure la distance ligne de départ → talon le plus reculé.',
    measurement: 'Distance en cm, réception stabilisée. Meilleur de 3.',
    gifUrl: null,
  },
  imtp: {
    key: 'imtp',
    label: 'Tirage isométrique mi-cuisse',
    bucket: 'Force bas du corps',
    unit: 'kg',
    attempts: 2,
    steps: [
      'Barre fixée à mi-cuisse, dos droit, prise pronation.',
      'Tirer au maximum vers le haut pendant 3-5 s sans bouger la barre.',
    ],
    partnerRole: 'Lance le chrono et lit la valeur sur le dynamomètre / la jauge.',
    measurement: 'Force maximale développée, en kg. Meilleur de 2.',
    gifUrl: null,
  },
  weighted_pullup: {
    key: 'weighted_pullup',
    label: 'Traction lestée',
    bucket: 'Force haut du corps',
    unit: 'kg',
    attempts: 3,
    steps: [
      'Ceinture de lest, prise pronation largeur d\'épaules.',
      'Réaliser 1 traction complète menton au-dessus de la barre.',
      'Augmenter la charge jusqu\'à la charge max sur 1 répétition.',
    ],
    partnerRole: 'Valide l\'amplitude complète et note la charge réussie.',
    measurement: 'Charge additionnelle max sur 1 traction stricte, en kg.',
    gifUrl: null,
  },
  medball_vertical_throw: {
    key: 'medball_vertical_throw',
    label: 'Lancer vertical médecine-ball',
    bucket: 'Puissance haut du corps',
    unit: 'cm',
    attempts: 3,
    steps: [
      'Allongé sur le dos, médecine-ball 10 kg tenu poitrine, coudes au sol.',
      'Propulser le ballon verticalement le plus haut possible.',
    ],
    partnerRole: 'Se place de côté, estime la hauteur max atteinte par le ballon.',
    measurement: 'Hauteur verticale du lancer, en cm. Médecine-ball 10 kg. Meilleur de 3.',
    gifUrl: null,
  },
};
```

**Step 2: Type check**

Run: `npx tsc --noEmit`
Expected: PASS.

**Step 3: Commit**

```bash
git add src/lib/strength/kpiProtocols.ts
git commit -m "feat(§XXX): config fiches-protocole des 5 KPIs muscu"
```

---

## Phase 6 — Wizard KPIs (UI — via frontend-design)

> **Règle projet** : invoquer le skill `frontend-design` pour cette phase. Le plan fournit le contrat fonctionnel ; `frontend-design` produit le rendu.

### Task 6.1 : Écran Wizard KPIs

**Files:**
- Create: `src/pages/KpiWizard.tsx`
- Create: `src/components/strength/kpi/` (sous-composants au besoin)

**Spécification fonctionnelle (input pour `frontend-design`) :**

- **Route & accès** : `/#/strength/kpi-wizard` (câblé en Phase 9). Accessible nageur ET coach. Pour un coach, un sélecteur de nageur en amont (réutiliser le pattern de sélection d'athlète de `StrengthPlanningScreen.tsx` / `useStrengthPlanningAthleteMode.ts`). Pour un nageur, l'athlète = lui-même.
- **Déroulé** : assistant pas-à-pas, 1 KPI par étape, dans l'ordre de `KPI_PROTOCOLS`. Chaque étape affiche : `label`, `steps[]`, `partnerRole` (mis en avant — c'est un protocole à deux), `measurement`, le GIF si `gifUrl` non nul (sinon un placeholder neutre).
- **Saisie** : `attempts` champs numériques (autant que `protocol.attempts`). À la validation d'une étape : `value = bestAttempt(attempts)` (Phase 5.1). Possibilité de sauter un KPI (mesure partielle autorisée).
- **Binôme** : un champ optionnel « accompagné par » (sélecteur nageur) → alimente `assisted_by`.
- **Soumission** : pour chaque KPI renseigné, appeler `recordKpiMeasurement` avec `source = 'wizard_coach'` si l'utilisateur courant est coach, sinon `'wizard_athlete'` ; `measured_by = utilisateur courant`.
- **Après soumission** : écran récap (valeurs + comparaison à la dernière mesure via `getLatestKpiMeasurements` avant soumission). Si `wizard_athlete`, message « Ton coach relira ces mesures ».
- **State serveur** : React Query (`useQuery`/`useMutation`) — voir `useStrengthState.ts` pour le pattern du module muscu.
- **Mobile-first**, dock masqué pendant le wizard (cf. mode focus de `WorkoutRunner.tsx`).

**Acceptance:**
- `npm run dev`, naviguer `/#/strength/kpi-wizard`, dérouler les 5 étapes, soumettre.
- Vérifier en base (`mcp__plugin_supabase_supabase__execute_sql`: `SELECT * FROM strength_kpi_measurements ORDER BY created_at DESC LIMIT 5`) que les lignes sont créées avec le bon `source`, `value = max(attempts)`, `coach_reviewed = false`.
- `npx tsc --noEmit` PASS.

**Commit:** `feat(§XXX): wizard KPIs muscu (5 tests, protocole à deux)`

---

## Phase 7 — Questionnaire nageur (UI — via frontend-design)

### Task 7.1 : Écran Questionnaire d'évaluation

**Files:**
- Create: `src/pages/StrengthQuestionnaire.tsx`

**Spécification fonctionnelle :**

- **Route** : `/#/strength/questionnaire` (Phase 9). Accès nageur.
- **Déclenchement** : le nageur y arrive via une notification « Ton coach demande un bilan » (le déclenchement par le coach + la notification relèvent du Chantier D — ici, la route est accessible et fonctionne en autonomie). Au chargement, récupérer le bilan ouvert via `getLatestAssessment(athleteId)` ; n'éditer que si `status === 'questionnaire_pending'`.
- **Sections** (mappées sur `StrengthQuestionnaire`) :
  1. **Douleurs** : sélection de zones du corps + intensité 1-3. Réutiliser le set de zones et le pattern UI existant de saisie douleur (chercher le composant courant : `grep -rl "body_zone\|pain" src/components`). Les douleurs alimentent `questionnaire.pain` ET un `upsertPainReports(athleteId, today, pain)` (réutilise l'API existante `painReports.ts`).
  2. **Historique blessures** : zone de texte libre → `injury_history`.
  3. **Ressenti mobilité** : échelle 1-5 → `mobility_feel`.
  4. **Psychologie** : 3 échelles 1-5 (confiance, motivation, stress) → `psychology`.
- **Soumission** : `updateAssessmentQuestionnaire(assessmentId, questionnaire)` (passe le `status` à `bilan_pending`) + `upsertPainReports(...)`. `filled_at = now`.
- **Mobile-first.** Écran court, une section par carte.

**Acceptance:**
- `npm run dev`, route accessible, remplir, soumettre.
- Vérifier `SELECT status, questionnaire FROM strength_assessments ORDER BY created_at DESC LIMIT 1` → `status = 'bilan_pending'`, `questionnaire` peuplé.
- Vérifier que `pain_reports` reçoit bien les lignes.
- `npx tsc --noEmit` PASS.

**Commit:** `feat(§XXX): questionnaire d'évaluation muscu nageur`

---

## Phase 8 — Bilan coach mobilité/mouvement (UI — via frontend-design)

### Task 8.1 : Écran Bilan coach

**Files:**
- Create: `src/pages/coach/StrengthAssessmentScreen.tsx`

**Spécification fonctionnelle :**

- **Route** : `/#/coach/strength-assessment` (Phase 9). Accès coach/admin uniquement.
- **Sélection nageur** : même pattern d'athlète que `StrengthPlanningScreen.tsx`.
- **Initiation d'un bilan** : si aucun bilan `questionnaire_pending`/`bilan_pending` pour le nageur, bouton « Démarrer un bilan » → `createAssessment({ athlete_id, coach_id })`.
- **Saisie** (visible quand `status === 'bilan_pending'`, c.-à-d. questionnaire nageur déjà rempli — sinon afficher « En attente du questionnaire nageur ») — 6 scores 0-3, mappés sur `StrengthPhysicalTests` :
  - Mobilité : flexion d'épaule, T-spine, hanche.
  - Mouvement : contrôle scapulaire, alignement tronc/nuque, hip hinge.
  - Chaque item : un libellé + un sélecteur 0-3 avec légende courte (0 = dysfonctionnel … 3 = optimal).
- **Contexte** : afficher en lecture seule le `questionnaire` du nageur (douleurs, ressenti) et les `getLatestKpiMeasurements` — le coach voit les données avant de noter.
- **Soumission** : `updateAssessmentPhysicalTests(assessmentId, physicalTests)` (passe `status` à `completed`). `filled_at = now`.
- **Mobile-first.**

**Acceptance:**
- `npm run dev`, en compte coach, route accessible, sélectionner un nageur ayant un bilan `bilan_pending`, noter les 6 items, soumettre.
- Vérifier `SELECT status, physical_tests FROM strength_assessments ...` → `status = 'completed'`, `physical_tests` peuplé.
- `npx tsc --noEmit` PASS.

**Commit:** `feat(§XXX): écran bilan coach mobilité/mouvement`

---

## Phase 9 — Routing & navigation

### Task 9.1 : Enregistrer les routes

**Files:**
- Modify: `src/App.tsx` (déclarations `lazyWithRetry` ~lignes 106-139 + `<Route>` dans `AppRouter` ~lignes 312+)

**Step 1: Ajouter les imports lazy**

```typescript
const KpiWizard = lazyWithRetry(() => import("@/pages/KpiWizard"));
const StrengthQuestionnaire = lazyWithRetry(() => import("@/pages/StrengthQuestionnaire"));
const StrengthAssessmentScreen = lazyWithRetry(() => import("@/pages/coach/StrengthAssessmentScreen"));
```

**Step 2: Ajouter les routes** dans `AppRouter` (suivre le pattern des routes `/strength` et `/coach/strength-planning` existantes, y compris le `<Suspense>`/skeleton utilisé) :

```tsx
<Route path="/strength/kpi-wizard">{() => <Suspense fallback={<PageSkeleton />}><KpiWizard /></Suspense>}</Route>
<Route path="/strength/questionnaire">{() => <Suspense fallback={<PageSkeleton />}><StrengthQuestionnaire /></Suspense>}</Route>
<Route path="/coach/strength-assessment">{() => <Suspense fallback={<PageSkeleton />}><StrengthAssessmentScreen /></Suspense>}</Route>
```

> Vérifier dans `src/App.tsx` la forme exacte des routes voisines (`/strength`, lignes ~350-354) et s'y conformer (wrapper, skeleton, garde de rôle éventuelle).

**Step 3: Type check + smoke test**

Run: `npx tsc --noEmit` → PASS
Run: `npm run dev`, naviguer manuellement vers les 3 routes → écrans chargés sans erreur console.

**Step 4: Commit**

```bash
git add src/App.tsx
git commit -m "feat(§XXX): routes wizard KPIs + questionnaire + bilan coach"
```

### Task 9.2 : Points d'entrée navigation

**Files:**
- Modify: `src/components/layout/navItems.ts` et/ou les hubs concernés (`src/pages/Strength.tsx`, `src/pages/Coach.tsx`)

**Step 1:** Ajouter les points d'entrée (décision UI — passer par `frontend-design` si ajout visuel) :
- Côté nageur : un accès au wizard KPIs depuis le module `/strength` (le questionnaire reste atteint via notification — Chantier D).
- Côté coach : une tuile « Bilan muscu » dans le hub `Coach.tsx` menant à `/coach/strength-assessment`.

**Step 2:** `npx tsc --noEmit` PASS + vérif visuelle `npm run dev`.

**Step 3: Commit**

```bash
git add src/components/layout/navItems.ts src/pages/Strength.tsx src/pages/Coach.tsx
git commit -m "feat(§XXX): points d'entrée navigation bilan muscu"
```

---

## Phase 10 — Suite de tests complète & documentation

### Task 10.1 : Vérification globale

**Step 1:** Run: `npm test` → la suite passe (les échecs pré-existants connus — `TimesheetHelpers.test.ts` — restent tolérés, cf. MEMORY ; aucun nouvel échec).
**Step 2:** Run: `npx tsc --noEmit` → aucune erreur nouvelle.
**Step 3:** Run: `npm run build` → build OK.

### Task 10.2 : Documentation (workflow obligatoire CLAUDE.md)

**Files:**
- Modify: `docs/implementation-log.md` — une entrée § par phase livrée (contexte, changements, fichiers, tests, décisions, limites).
- Modify: `docs/ROADMAP.md` — ligne par § + `*Dernière mise à jour*` en tête ; statut du chantier « Bilan Muscu — Chantier B » → Fait.
- Modify: `docs/FEATURES_STATUS.md` — nouvelles lignes pour Questionnaire d'évaluation / Wizard KPIs / Bilan coach (statut ✅).
- Modify: `CLAUDE.md` — ligne « Dernier § livré » ; table Edge Functions inchangée ; `docs/claude/files-map.md` — ajouter les nouveaux fichiers ≥ 150 lignes ou à rôle architectural (`KpiWizard.tsx`, `StrengthQuestionnaire.tsx`, `StrengthAssessmentScreen.tsx`, `strength-assessments.ts`, `strength-kpi.ts`, `kpiProtocols.ts`) avec taille mesurée via `wc -l`.

**Commit:** `docs(§XXX): journal, roadmap, features, files-map — Chantier B bilan muscu`

---

## Notes pour l'exécution

- **`§XXX`** dans les messages de commit : remplacer par le n° de § réel. Lire le dernier § dans `docs/implementation-log.md` et incrémenter. Une phase peut couvrir un ou plusieurs §.
- **Ordre** : les phases 1→5 sont séquentielles (chaque phase dépend de la précédente). Les phases 6, 7, 8 sont indépendantes entre elles (3 écrans distincts) — parallélisables si exécution multi-agents. La phase 9 dépend de 6+7+8. La phase 10 clôt.
- **Hors périmètre Chantier B** (→ Chantiers A/C/D) : barèmes de normalisation, scoring des seaux, templates de périodisation, tagging du catalogue d'exercices, GIFs des protocoles, moteur de génération, RPC d'écriture, snapshot/revert, notifications coach. Ne pas les implémenter ici.
- **`bucket_scores`** reste `null` à l'issue du Chantier B — il sera peuplé par le moteur (Chantier C).
