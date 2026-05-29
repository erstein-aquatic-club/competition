# Récap muscu « Wrapped » — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.
> **UI tasks (7, 8):** REQUIRED — invoke the `frontend-design` skill before writing the visual slide components (global CLAUDE.md rule: tout UI passe par /frontend-design).

**Goal:** Un bouton discret en haut à droite de « Mon plan » muscu (nageur) **et** dans la vue coach d'un nageur ouvre un récap plein écran façon Spotify Wrapped : pages qui défilent au tap/timer, montrant l'objectif du plan, forces/axes KPI (sans valeurs brutes, situés vs population), meilleures progressions sur 90 j, et stats fun.

**Architecture :** Tout est dérivé d'appels API **existants** (aucune table/migration/endpoint). Un module pur `wrappedStats.ts` (testé `node:test`) fait toutes les dérivations ; un hook `useStrengthWrapped(athleteId)` orchestre React Query et **aplatit** les données Supabase en entrées simples ; un composant overlay `StrengthWrappedRecap` joue les stories. Le même composant sert nageur et coach (`viewerContext`).

**Tech Stack :** React 19, TypeScript, React Query 5, Tailwind 4, `node:test` (modules purs), vitest jsdom (`*.vitest.tsx`, hooks/DOM).

---

## Données existantes réutilisées (référence)

- `getProfile({ userId })` → `UserProfile` : `sex: 'M'|'F'|null`, `birthdate: string|null`, `display_name`, `group_id`.
- `getActiveMesocycle(athleteId)` → `StrengthMesocycle | null` : `event_group` ('sprint'|'fond'|…), `kind`, `target_week_count`, `sessions_per_week`, `bucket_priorities` (JSONB, forme non garantie → best-effort).
- `getLatestKpiMeasurements(athleteId)` → `Record<StrengthKpiKey, StrengthKpiMeasurement|null>`. 5 clés : `vertical_jump`, `broad_jump`, `imtp`, `weighted_pullup`, `medball_vertical_throw`.
- `KPI_PROTOCOLS[key].label` / `.bucket` (`src/lib/strength/kpiProtocols.ts`) — libellés FR.
- `getBareme(kpiKey, sex, ageBand).anchors` + `kpiScore(anchors, value)` (`src/lib/strength/kpiBaremes.ts`) → score 0-100 = position **vs population scolaire générale** (anchors p10…p90, **non shiftés** = exactement « vs population »). `ageBandFor(age)` → `'13-14'|'15-16'|'17-18'|'adulte'|null`.
- `getStrengthHistory(athleteName, { athleteId, status:'completed', from, to, limit, order })` → `{ runs }`. **Supabase** : chaque run a `started_at` + `strength_set_logs: [{ exercise_id, reps, weight, set_number, completed_at }]` (PAS `logs`, et `exercise_summary` est `[]`). **localStorage** : run a `logs`. → le hook gère les deux.
- `estimateOneRm(weight, reps)` (`src/lib/api/client.ts`) → 1RM estimé arrondi, `null` si invalide/bodyweight.
- `getExercises()` → `Exercise[]` (`id`, `nom_exercice`/`name`) pour les noms d'exos.

**isBodyweight** : un `weight` peut être un marqueur poids-de-corps. Le hook traite `weight` non-fini ou ≤ 0 comme bodyweight (volume = 0, exclu de la progression de charge).

---

## Task 1 : `wrappedStats.ts` — score → bande de niveau

**Files:**
- Create: `src/lib/strength/wrappedStats.ts`
- Test: `src/lib/strength/__tests__/wrappedStats.test.ts`

**Step 1 — Write the failing test**

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scoreToBand } from '../wrappedStats';

test('scoreToBand: paliers percentiles', () => {
  assert.equal(scoreToBand(95).label, 'top 10%');
  assert.equal(scoreToBand(90).label, 'top 10%');
  assert.equal(scoreToBand(80).label, 'top 30%');
  assert.equal(scoreToBand(60).label, 'au-dessus de la moyenne');
  assert.equal(scoreToBand(40).label, 'dans la moyenne');
  assert.equal(scoreToBand(10).label, 'gros potentiel de gain');
});

test('scoreToBand: tier ordonné (0=plus fort)', () => {
  assert.ok(scoreToBand(95).tier < scoreToBand(10).tier);
});
```

**Step 2 — Run, expect FAIL**

Run: `npx tsx --test src/lib/strength/__tests__/wrappedStats.test.ts` (ou `npm test -- wrappedStats`)
Expected: FAIL (`scoreToBand` not exported).

**Step 3 — Implement minimal**

```ts
export interface ScoreBand {
  /** Libellé affiché au nageur (jamais de valeur brute). */
  label: string;
  /** 0 = le plus fort, 4 = le plus faible (pour trier). */
  tier: number;
}

/** Mappe un score KPI 0-100 (ancré percentiles p10…p90) vers une bande. */
export function scoreToBand(score: number): ScoreBand {
  if (score >= 90) return { label: 'top 10%', tier: 0 };
  if (score >= 70) return { label: 'top 30%', tier: 1 };
  if (score >= 50) return { label: 'au-dessus de la moyenne', tier: 2 };
  if (score >= 30) return { label: 'dans la moyenne', tier: 3 };
  return { label: 'gros potentiel de gain', tier: 4 };
}
```

**Step 4 — Run, expect PASS**

**Step 5 — Commit**

```bash
git add src/lib/strength/wrappedStats.ts src/lib/strength/__tests__/wrappedStats.test.ts
git commit -m "feat(recap): scoreToBand — bande de niveau KPI vs population"
```

---

## Task 2 : `wrappedStats.ts` — classement forces / axe de progression

But : à partir des mesures KPI + profil (sexe, bande d'âge), produire la liste scorée des KPI, triée du plus fort au plus faible, en sautant les KPI absents ou non scorables (sexe/âge manquant).

**Files:**
- Modify: `src/lib/strength/wrappedStats.ts`
- Test: `src/lib/strength/__tests__/wrappedStats.test.ts`

**Step 1 — Failing test**

```ts
import { rankKpis } from '../wrappedStats';
import type { StrengthKpiMeasurement } from '@/lib/api/types';

function meas(kpi: any, value: number): StrengthKpiMeasurement {
  return {
    id: kpi, athlete_id: 1, kpi_key: kpi, value, unit: 'kg', attempts: null,
    measured_at: '2026-05-01', measured_by: null, assisted_by: null,
    source: 'wizard_coach', coach_reviewed: true, notes: null, created_at: '2026-05-01',
  };
}

test('rankKpis: trie fort→faible, saute les absents', () => {
  const ranked = rankKpis(
    { weighted_pullup: meas('weighted_pullup', 30), imtp: meas('imtp', 60),
      vertical_jump: null, broad_jump: null, medball_vertical_throw: null },
    { sex: 'M', ageBand: 'adulte' },
  );
  assert.ok(ranked.length === 2);
  assert.ok(ranked[0].score >= ranked[1].score);
  assert.ok(ranked[0].label.length > 0);
  assert.ok('band' in ranked[0]);
});

test('rankKpis: profil incomplet → vide', () => {
  const ranked = rankKpis(
    { weighted_pullup: meas('weighted_pullup', 30) } as any,
    { sex: null, ageBand: 'adulte' },
  );
  assert.equal(ranked.length, 0);
});
```

**Step 3 — Implement**

```ts
import type { StrengthKpiKey, StrengthKpiMeasurement } from '@/lib/api/types';
import { KPI_PROTOCOLS } from './kpiProtocols';
import { getBareme, type AgeBand } from './kpiBaremes';
import { kpiScore } from './kpiBaremes';

export interface RankedKpi {
  key: StrengthKpiKey;
  label: string;     // KPI_PROTOCOLS[key].label
  bucket: string;    // KPI_PROTOCOLS[key].bucket
  score: number;     // 0-100 vs population
  band: ScoreBand;
}

export interface WrappedAthlete {
  sex: 'M' | 'F' | null;
  ageBand: AgeBand | null;
}

const KPI_KEYS: StrengthKpiKey[] = [
  'vertical_jump', 'broad_jump', 'imtp', 'weighted_pullup', 'medball_vertical_throw',
];

export function rankKpis(
  latest: Partial<Record<StrengthKpiKey, StrengthKpiMeasurement | null>>,
  athlete: WrappedAthlete,
): RankedKpi[] {
  if (!athlete.sex || !athlete.ageBand) return [];
  const out: RankedKpi[] = [];
  for (const key of KPI_KEYS) {
    const m = latest[key];
    if (!m) continue;
    const bareme = getBareme(key, athlete.sex, athlete.ageBand);
    const score = kpiScore(bareme.anchors, m.value);
    out.push({
      key,
      label: KPI_PROTOCOLS[key].label,
      bucket: KPI_PROTOCOLS[key].bucket,
      score,
      band: scoreToBand(score),
    });
  }
  return out.sort((a, b) => b.score - a.score);
}
```

> Vérifier le type exact de retour de `getBareme` : il a `.anchors`. Importer `AgeBand` depuis `kpiBaremes` (ré-exporté ou via le type). Si `AgeBand` n'est pas exporté, l'exporter dans `kpiBaremes.ts`.

**Step 4 — PASS. Step 5 — Commit** `feat(recap): rankKpis — forces/axes triés vs population`.

---

## Task 3 : `wrappedStats.ts` — podium de progression (90 j)

But : à partir d'entrées de séries **aplaties** `{ exerciseId, exerciseName, reps, weight, ts }`, calculer pour chaque exo le meilleur 1RM estimé sur les 90 derniers jours vs les 90 jours précédents, et renvoyer le top 3 des plus fortes progressions en %.

**Files:** Modify `wrappedStats.ts` + test.

**Step 1 — Failing test**

```ts
import { computeProgressions, type SetEntry } from '../wrappedStats';

const NOW = Date.parse('2026-05-28T00:00:00Z');
const d = (daysAgo: number) => NOW - daysAgo * 86400_000;

test('computeProgressions: Δ% best 1RM 90j vs 90j précédents, top 3', () => {
  const sets: SetEntry[] = [
    // Traction : 90j prec best ~ 1RM(100,1)=100 ; recent best ~ 1RM(112,1)=112 → +12%
    { exerciseId: 1, exerciseName: 'Tractions lestées', reps: 1, weight: 100, ts: d(120) },
    { exerciseId: 1, exerciseName: 'Tractions lestées', reps: 1, weight: 112, ts: d(10) },
    // DC : prec 80 → recent 88 = +10%
    { exerciseId: 2, exerciseName: 'Développé couché', reps: 1, weight: 80, ts: d(100) },
    { exerciseId: 2, exerciseName: 'Développé couché', reps: 1, weight: 88, ts: d(5) },
  ];
  const prog = computeProgressions(sets, NOW);
  assert.equal(prog[0].exerciseName, 'Tractions lestées');
  assert.equal(prog[0].deltaPct, 12);
  assert.equal(prog[1].deltaPct, 10);
  assert.ok(prog.length <= 3);
});

test('computeProgressions: ignore exos sans base précédente', () => {
  const sets: SetEntry[] = [
    { exerciseId: 9, exerciseName: 'Squat', reps: 1, weight: 100, ts: d(3) },
  ];
  assert.equal(computeProgressions(sets, NOW).length, 0);
});
```

**Step 3 — Implement**

```ts
import { estimateOneRm } from '@/lib/api/client';

export interface SetEntry {
  exerciseId: number;
  exerciseName: string;
  reps: number | null;
  weight: number | null;
  ts: number; // epoch ms de la séance
}

export interface ProgressionItem {
  exerciseId: number;
  exerciseName: string;
  deltaPct: number;   // arrondi
}

const WINDOW_MS = 90 * 86400_000;

export function computeProgressions(sets: SetEntry[], now: number): ProgressionItem[] {
  // best 1RM estimé par exo, par fenêtre (recent = [now-90j, now], prev = [now-180j, now-90j])
  const best = new Map<number, { name: string; recent: number; prev: number }>();
  for (const s of sets) {
    const est = estimateOneRm(s.weight, s.reps);
    if (est == null) continue; // bodyweight / invalide
    const age = now - s.ts;
    const slot = age <= WINDOW_MS ? 'recent' : age <= 2 * WINDOW_MS ? 'prev' : null;
    if (!slot) continue;
    const cur = best.get(s.exerciseId) ?? { name: s.exerciseName, recent: 0, prev: 0 };
    cur[slot] = Math.max(cur[slot], est);
    best.set(s.exerciseId, cur);
  }
  const items: ProgressionItem[] = [];
  for (const [exerciseId, b] of best) {
    if (b.prev <= 0 || b.recent <= 0) continue;
    const deltaPct = Math.round(((b.recent - b.prev) / b.prev) * 100);
    if (deltaPct <= 0) continue; // on ne montre que les progressions
    items.push({ exerciseId, exerciseName: b.name, deltaPct });
  }
  return items.sort((a, b) => b.deltaPct - a.deltaPct).slice(0, 3);
}
```

**Step 4 — PASS. Step 5 — Commit** `feat(recap): computeProgressions — podium Δ% 1RM 90j`.

---

## Task 4 : `wrappedStats.ts` — agrégats volume + stat fun (90 j)

But : tonnage total (Σ reps×poids), nb séances distinctes, séries, reps, et l'exo le plus pratiqué (par nb de séries) sur 90 j.

**Files:** Modify `wrappedStats.ts` + test.

**Step 1 — Failing test**

```ts
import { computeVolumeStats } from '../wrappedStats';

test('computeVolumeStats: tonnage/séries/reps + exo le plus pratiqué', () => {
  const NOW = Date.parse('2026-05-28T00:00:00Z');
  const day = (n: number) => NOW - n * 86400_000;
  const sets = [
    { exerciseId: 1, exerciseName: 'Tractions', reps: 5, weight: 20, ts: day(1), runKey: 'A' },
    { exerciseId: 1, exerciseName: 'Tractions', reps: 5, weight: 20, ts: day(1), runKey: 'A' },
    { exerciseId: 2, exerciseName: 'Squat', reps: 3, weight: 100, ts: day(2), runKey: 'B' },
    { exerciseId: 9, exerciseName: 'Vieux', reps: 5, weight: 50, ts: day(200), runKey: 'Z' },
  ];
  const v = computeVolumeStats(sets as any, NOW);
  assert.equal(v.totalTonnageKg, 5*20 + 5*20 + 3*100); // 500, l'ancien exclu
  assert.equal(v.totalSets, 3);
  assert.equal(v.totalReps, 13);
  assert.equal(v.sessions, 2);
  assert.equal(v.topExerciseName, 'Tractions');
});
```

**Step 3 — Implement** (ajouter `runKey?: string` à `SetEntry`)

```ts
export interface VolumeStats {
  totalTonnageKg: number;
  totalSets: number;
  totalReps: number;
  sessions: number;       // séances distinctes (runKey)
  topExerciseName: string | null;
}

export function computeVolumeStats(sets: SetEntry[], now: number): VolumeStats {
  let tonnage = 0, totalSets = 0, totalReps = 0;
  const runs = new Set<string>();
  const setsByExo = new Map<number, { name: string; n: number }>();
  for (const s of sets) {
    if (now - s.ts > WINDOW_MS) continue;
    const reps = Number(s.reps ?? 0) || 0;
    const w = Number.isFinite(s.weight) && (s.weight ?? 0) > 0 ? (s.weight as number) : 0;
    tonnage += reps * w;
    totalSets += 1;
    totalReps += reps;
    if (s.runKey) runs.add(s.runKey);
    const e = setsByExo.get(s.exerciseId) ?? { name: s.exerciseName, n: 0 };
    e.n += 1;
    setsByExo.set(s.exerciseId, e);
  }
  let top: { name: string; n: number } | null = null;
  for (const e of setsByExo.values()) if (!top || e.n > top.n) top = e;
  return {
    totalTonnageKg: Math.round(tonnage),
    totalSets, totalReps,
    sessions: runs.size,
    topExerciseName: top?.name ?? null,
  };
}
```

> Ajouter `runKey?: string` au type `SetEntry` (Task 3).

**Step 4 — PASS. Step 5 — Commit** `feat(recap): computeVolumeStats — tonnage/séances/exo phare 90j`.

---

## Task 5 : `wrappedStats.ts` — objectif du plan + assemblage des slides + garde

But : (a) traduire le mésocycle en libellé d'objectif lisible ; (b) `hasEnoughWrappedData` ; (c) `buildWrappedSlides` qui assemble la liste ordonnée des slides en **sautant les vides**.

**Files:** Modify `wrappedStats.ts` + test.

**Step 1 — Failing test**

```ts
import { describeObjective, hasEnoughWrappedData, buildWrappedSlides } from '../wrappedStats';

test('describeObjective: libellé lisible', () => {
  const o = describeObjective({ event_group: 'sprint', target_week_count: 8, sessions_per_week: 3 } as any);
  assert.ok(o.title.length > 0);
  assert.equal(o.weeks, 8);
  assert.equal(o.sessionsPerWeek, 3);
});

test('hasEnoughWrappedData: vrai si au moins une source', () => {
  assert.equal(hasEnoughWrappedData({ hasMeso: false, kpiCount: 0, completedRuns: 0 }), false);
  assert.equal(hasEnoughWrappedData({ hasMeso: true, kpiCount: 0, completedRuns: 0 }), true);
  assert.equal(hasEnoughWrappedData({ hasMeso: false, kpiCount: 1, completedRuns: 0 }), true);
  assert.equal(hasEnoughWrappedData({ hasMeso: false, kpiCount: 0, completedRuns: 3 }), true);
  assert.equal(hasEnoughWrappedData({ hasMeso: false, kpiCount: 0, completedRuns: 2 }), false);
});

test('buildWrappedSlides: saute les sections vides, garde cover+outro', () => {
  const slides = buildWrappedSlides({
    objective: null, forces: [], potentialAxis: null,
    progressions: [], volume: null,
  });
  // cover + outro toujours présents
  assert.deepEqual(slides.map(s => s.kind), ['cover', 'outro']);
});

test('buildWrappedSlides: ordre complet quand tout présent', () => {
  const slides = buildWrappedSlides({
    objective: { title: 'Sprint', focusLabel: null, weeks: 8, sessionsPerWeek: 3 },
    forces: [{ key: 'imtp', label: 'X', bucket: 'B', score: 80, band: scoreToBand(80) }],
    potentialAxis: { key: 'weighted_pullup', label: 'Y', bucket: 'B', score: 20, band: scoreToBand(20) },
    progressions: [{ exerciseId: 1, exerciseName: 'Tractions', deltaPct: 12 }],
    volume: { totalTonnageKg: 700, totalSets: 40, totalReps: 200, sessions: 12, topExerciseName: 'Tractions' },
  });
  assert.deepEqual(slides.map(s => s.kind),
    ['cover', 'objective', 'forces', 'potential', 'progressions', 'volume', 'funstat', 'outro']);
});
```

**Step 3 — Implement**

```ts
import type { StrengthMesocycle } from '@/lib/api/types';

export interface ObjectiveInfo {
  title: string;
  focusLabel: string | null;
  weeks: number;
  sessionsPerWeek: number;
}

const EVENT_GROUP_LABELS: Record<string, string> = {
  sprint: 'Préparation sprint',
  fond: 'Préparation demi-fond / fond',
};

export function describeObjective(meso: StrengthMesocycle): ObjectiveInfo {
  return {
    title: EVENT_GROUP_LABELS[meso.event_group] ?? `Plan ${meso.event_group}`,
    focusLabel: extractFocusLabel(meso.bucket_priorities), // best-effort, peut être null
    weeks: meso.target_week_count,
    sessionsPerWeek: meso.sessions_per_week,
  };
}

/** Best-effort : tente d'extraire le seau prioritaire du JSONB ; null si forme inconnue. */
function extractFocusLabel(bp: StrengthMesocycle['bucket_priorities']): string | null {
  if (!bp || typeof bp !== 'object') return null;
  // forme attendue best-effort : { focus?: string[] } ou { priorities?: {bucket,score}[] }
  const focus = (bp as any).focus;
  if (Array.isArray(focus) && typeof focus[0] === 'string') {
    return BUCKET_FR[focus[0]] ?? null;
  }
  return null;
}

const BUCKET_FR: Record<string, string> = {
  upper_strength: 'Force du haut du corps',
  upper_power: 'Puissance du haut du corps',
  lower_strength: 'Force du bas du corps',
  lower_power: 'Puissance du bas du corps',
  core: 'Gainage / tronc',
};

export function hasEnoughWrappedData(d: {
  hasMeso: boolean; kpiCount: number; completedRuns: number;
}): boolean {
  return d.hasMeso || d.kpiCount >= 1 || d.completedRuns >= 3;
}

export type WrappedSlideKind =
  | 'cover' | 'objective' | 'forces' | 'potential'
  | 'progressions' | 'volume' | 'funstat' | 'outro';

export interface WrappedSlide { kind: WrappedSlideKind }

export interface WrappedData {
  objective: ObjectiveInfo | null;
  forces: RankedKpi[];
  potentialAxis: RankedKpi | null;
  progressions: ProgressionItem[];
  volume: VolumeStats | null;
}

export function buildWrappedSlides(data: WrappedData): WrappedSlide[] {
  const slides: WrappedSlide[] = [{ kind: 'cover' }];
  if (data.objective) slides.push({ kind: 'objective' });
  if (data.forces.length > 0) slides.push({ kind: 'forces' });
  if (data.potentialAxis) slides.push({ kind: 'potential' });
  if (data.progressions.length > 0) slides.push({ kind: 'progressions' });
  if (data.volume && data.volume.totalSets > 0) slides.push({ kind: 'volume' });
  if (data.volume && data.volume.topExerciseName) slides.push({ kind: 'funstat' });
  slides.push({ kind: 'outro' });
  return slides;
}
```

> `forces` = `rankKpis(...).slice(0, 2)` (les 2 meilleurs) ; `potentialAxis` = dernier de `rankKpis` **si** son tier ≥ 3 (sinon pas d'axe faible à montrer) — décidé dans le hook (Task 6), pas dans le pur (le pur prend déjà les valeurs filtrées). Les tests ci-dessus passent les valeurs déjà filtrées.

**Step 4 — PASS. Step 5 — Commit** `feat(recap): describeObjective + buildWrappedSlides + garde données`.

---

## Task 6 : hook `useStrengthWrapped(athleteId)`

But : orchestrer les appels existants, **aplatir** runs→`SetEntry[]` (gérer Supabase `strength_set_logs` ET localStorage `logs`), calculer `ageBand` depuis `birthdate`, exposer `{ enabled, data: WrappedData & {...}, athleteName, isLoading }`.

**Files:**
- Create: `src/hooks/useStrengthWrapped.ts`
- Test (léger) : `src/hooks/useStrengthWrapped.vitest.tsx`

**Step 1 — Implement le hook**

```ts
import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  getProfile, getActiveMesocycle, getLatestKpiMeasurements,
  getStrengthHistory, getExercises,
} from '@/lib/api';
import { ageBandFor } from '@/lib/strength/kpiBaremes';
import {
  rankKpis, computeProgressions, computeVolumeStats, describeObjective,
  hasEnoughWrappedData, buildWrappedSlides,
  type SetEntry, type WrappedData, type WrappedSlide,
} from '@/lib/strength/wrappedStats';

const DAYS_180 = 180;

function ageFromBirthdate(birthdate: string | null | undefined): number | null {
  if (!birthdate) return null;
  const b = new Date(birthdate + 'T00:00:00');
  if (Number.isNaN(b.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - b.getFullYear();
  const m = now.getMonth() - b.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < b.getDate())) age--;
  return age;
}

/** Aplati les runs (Supabase: strength_set_logs / localStorage: logs) en SetEntry[]. */
function flattenRuns(runs: any[], nameById: Map<number, string>): SetEntry[] {
  const out: SetEntry[] = [];
  for (const run of runs) {
    const logs = run.strength_set_logs ?? run.logs ?? [];
    const ts = new Date(run.started_at ?? run.date ?? run.created_at ?? 0).getTime();
    const runKey = String(run.id ?? run.started_at ?? Math.random());
    for (const log of logs) {
      const exerciseId = Number(log.exercise_id);
      if (!Number.isFinite(exerciseId)) continue;
      out.push({
        exerciseId,
        exerciseName: nameById.get(exerciseId) ?? `Exercice ${exerciseId}`,
        reps: log.reps != null ? Number(log.reps) : null,
        weight: log.weight != null ? Number(log.weight) : null,
        ts,
        runKey,
      });
    }
  }
  return out;
}

export interface UseStrengthWrappedResult {
  enabled: boolean;          // assez de données → bouton visible
  isLoading: boolean;
  athleteName: string;
  slides: WrappedSlide[];
  data: WrappedData;
}

export function useStrengthWrapped(athleteId: number | null): UseStrengthWrappedResult {
  const { data: profile, isLoading: lp } = useQuery({
    queryKey: ['profile', athleteId],
    queryFn: () => getProfile({ userId: athleteId! }),
    enabled: athleteId != null,
  });
  const { data: meso, isLoading: lm } = useQuery({
    queryKey: ['active-mesocycle', athleteId],
    queryFn: () => getActiveMesocycle(athleteId!),
    enabled: athleteId != null,
  });
  const { data: kpis, isLoading: lk } = useQuery({
    queryKey: ['kpi-latest', athleteId],
    queryFn: () => getLatestKpiMeasurements(athleteId!),
    enabled: athleteId != null,
  });
  const athleteName = profile?.display_name ?? '';
  const fromISO = useMemo(() => {
    const d = new Date(); d.setDate(d.getDate() - DAYS_180);
    return d.toISOString().slice(0, 10);
  }, []);
  const { data: history, isLoading: lh } = useQuery({
    queryKey: ['strength-wrapped-history', athleteId, fromISO],
    queryFn: () => getStrengthHistory(athleteName, {
      athleteId: athleteId!, status: 'completed', from: fromISO, limit: 200, order: 'desc',
    }),
    enabled: athleteId != null,
  });
  const { data: exercises } = useQuery({
    queryKey: ['exercises'],
    queryFn: () => getExercises(),
  });

  return useMemo(() => {
    const now = Date.now();
    const nameById = new Map<number, string>(
      (exercises ?? []).map((e: any) => [Number(e.id), e.nom_exercice ?? e.name ?? `Exercice ${e.id}`]),
    );
    const sets = flattenRuns(history?.runs ?? [], nameById);
    const age = ageFromBirthdate(profile?.birthdate);
    const ageBand = age != null ? ageBandFor(age) : null;
    const ranked = rankKpis(kpis ?? {}, { sex: profile?.sex ?? null, ageBand });
    const forces = ranked.slice(0, 2);
    const last = ranked[ranked.length - 1];
    const potentialAxis = last && last.band.tier >= 3 && !forces.includes(last) ? last : null;
    const progressions = computeProgressions(sets, now);
    const volume = sets.length > 0 ? computeVolumeStats(sets, now) : null;
    const objective = meso ? describeObjective(meso) : null;

    const data: WrappedData = { objective, forces, potentialAxis, progressions, volume };
    const completedRuns = (history?.runs ?? []).length;
    const kpiCount = Object.values(kpis ?? {}).filter(Boolean).length;
    const enabled = hasEnoughWrappedData({ hasMeso: !!meso, kpiCount, completedRuns });

    return {
      enabled,
      isLoading: lp || lm || lk || lh,
      athleteName,
      slides: buildWrappedSlides(data),
      data,
    };
  }, [profile, meso, kpis, history, exercises, athleteName, lp, lm, lk, lh]);
}
```

**Step 2 — vitest léger** (`useStrengthWrapped.vitest.tsx`) : mock `@/lib/api` (vi.mock) avec un méso + 4 séances → assert `enabled === true`, `slides` contient `objective` et `volume`. Mock minimal, pas de réseau.

> Pattern hooks-order (cf. mémoire) : ce hook appelle des hooks inconditionnellement ; il sera lui-même appelé **avant tout early-return** dans les composants hôtes.

**Step 3 — Run vitest** : `npm test` (vitest scopé exécute les `*.vitest.tsx`). Expected: PASS.

**Step 4 — Commit** `feat(recap): useStrengthWrapped — orchestration + aplatissement runs`.

---

## Task 7 : moteur de stories `StrengthWrappedRecap.tsx`

> **REQUIRED:** invoquer le skill `frontend-design` AVANT d'écrire le visuel (overlay, dégradés, count-up, barres de progression).

**Files:**
- Create: `src/components/strength/wrapped/StrengthWrappedRecap.tsx`
- Test: `src/components/strength/wrapped/StrengthWrappedRecap.vitest.tsx`

**Props:**

```ts
interface StrengthWrappedRecapProps {
  athleteId: number;
  open: boolean;
  onClose: () => void;
  /** 'self' = nageur ('Ton récap') ; 'coach' = coach/admin ('Le récap de {prénom}'). */
  viewerContext: 'self' | 'coach';
  /** Prénom affiché côté coach (cover). */
  displayName?: string;
}
```

**Comportement (moteur de stories) :**
- Appelle `useStrengthWrapped(athleteId)` → `slides`.
- État `index` (0..slides.length-1). Barres de progression segmentées en haut (une par slide), la barre courante s'anime sur la durée (`SLIDE_MS = 6000`).
- **Autoplay** : `setInterval`/`setTimeout` avance l'index ; à la fin → `onClose()` (ou boucle ? → ferme).
- **Tap droite** (50% droit de l'écran) → suivant ; **tap gauche** → précédent. **Press-hold** → pause (clear timer) ; relâche → reprend.
- **Croix** en haut à droite + **swipe-down** → `onClose`.
- `prefers-reduced-motion` : pas d'auto-advance agressif (timer plus long ou nav manuelle uniquement) + pas de count-up.
- Rendu de la slide courante par `kind` → composant slide (Task 8), nourri par `data`.
- Si `!open` → `null`. Si `open` mais `isLoading` → écran de chargement plein écran (dégradé + spinner discret).

**Step — vitest** (`StrengthWrappedRecap.vitest.tsx`) — mock `useStrengthWrapped` (vi.mock du hook) renvoyant des slides connues :
1. rend → nombre de barres de progression == `slides.length` ;
2. tap droite → avance l'index (la slide suivante est rendue) ;
3. dépasser la dernière → `onClose` appelé ;
4. clic sur la croix → `onClose` appelé.

> Mock du hook (pas de l'API) pour rester unitaire. Respecter le pattern hooks-order : pas de hook après un early-return conditionnel.

**Commit** `feat(recap): moteur de stories StrengthWrappedRecap (nav tap/timer, fermeture)`.

---

## Task 8 : slides présentationnelles

> **REQUIRED:** skill `frontend-design` pour le style (dégradés vifs par slide, gros chiffres count-up, accents façon Wrapped).

**Files (create):**
- `src/components/strength/wrapped/slides/CoverSlide.tsx`
- `.../ObjectiveSlide.tsx`
- `.../ForcesSlide.tsx`
- `.../PotentialSlide.tsx`
- `.../ProgressionsSlide.tsx`
- `.../VolumeSlide.tsx`
- `.../FunStatSlide.tsx`
- `.../OutroSlide.tsx`
- (option) `.../CountUp.tsx` — petit composant d'animation de nombre (respecte reduced-motion).

Chaque slide = présentation pure, props typées issues de `WrappedData`. Contenu :
- **Cover** : « Ton récap muscu » / « Le récap de {prénom} » + sous-titre période (« 90 derniers jours »).
- **Objective** : `objective.title`, focus (`focusLabel` si présent), `{weeks} semaines`, `{sessionsPerWeek} séances/sem`.
- **Forces** : 1-2 `RankedKpi` → `label` + `band.label` (jamais `score` ni valeur brute).
- **Potential** : `potentialAxis.label` + formulation positive (« ton plus gros gain à venir », `band.label`).
- **Progressions** : podium des `ProgressionItem` (`exerciseName` + `+{deltaPct}%`).
- **Volume** : `totalTonnageKg` en count-up (« kg soulevés »), `sessions`, `totalSets`, `totalReps`.
- **FunStat** : `topExerciseName` (« ton exo fétiche »).
- **Outro** : récap + encouragement.

> **Aucune valeur brute de KPI/poids athlète** sur les slides nageur (règle `body-weight-coach-only`). Le tonnage cumulé d'entraînement n'est pas une donnée de poids de corps → OK à afficher.

Pas de test unitaire par slide (présentation pure) ; couverture via le vitest du moteur (Task 7) + revue visuelle. **Commit** `feat(recap): slides visuelles (frontend-design)`.

---

## Task 9 : bouton dans « Mon plan » (nageur)

**Files:** Modify `src/components/strength/MyPlanTab.tsx`

**Étapes :**
1. Importer `useStrengthWrapped` et `StrengthWrappedRecap`. **Appeler le hook en HAUT du composant** (avant tout early-return : loading/empty states) — `const wrapped = useStrengthWrapped(athleteId);` + `const [recapOpen, setRecapOpen] = useState(false);`.
2. Ajouter un header discret au-dessus de la timeline (dans le `return` final ET visible aussi sur les états « plan vide » si `wrapped.enabled`), bouton en haut à droite :
   ```tsx
   {wrapped.enabled && (
     <div className="flex justify-end -mt-1 mb-1">
       <Button variant="ghost" size="sm" className="gap-1.5 text-muted-foreground"
               onClick={() => setRecapOpen(true)}>
         <Sparkles className="h-4 w-4" /> Récap
       </Button>
     </div>
   )}
   ```
3. Monter l'overlay :
   ```tsx
   <StrengthWrappedRecap athleteId={athleteId} open={recapOpen}
     onClose={() => setRecapOpen(false)} viewerContext="self" />
   ```
4. `tsc --noEmit` → 0. **Commit** `feat(recap): bouton Récap dans Mon plan (nageur)`.

---

## Task 10 : bouton dans la vue coach du nageur

**Files:** Modify `src/pages/coach/CoachSwimmerFullView.tsx`

**Étapes :**
1. Importer `useStrengthWrapped` + `StrengthWrappedRecap`. Appeler `const wrapped = useStrengthWrapped(athleteId);` **au-dessus du early-return `if (!athleteId)`** (cf. mémoire hooks-order §316/§326 — sinon React #310). `athleteId` peut être null → le hook gère (`enabled` interne false).
2. Dans l'onglet planning (là où le mésocycle / plan muscu du nageur est affiché — `CoachMesocyclePanel`), ajouter le bouton « Récap » discret en haut à droite, visible si `wrapped.enabled`.
3. Monter l'overlay avec `viewerContext="coach"` et `displayName={profile?.display_name?.split(' ')[0]}`.
4. `tsc --noEmit` 0. **Commit** `feat(recap): bouton Récap dans la vue coach du nageur`.

---

## Task 11 : vérification finale + documentation obligatoire

**Étapes :**
1. `npx tsc --noEmit` → **0 erreur**.
2. `npm test` → node:test + vitest **verts** (noter les compteurs).
3. `npm run build` → **0 erreur**.
4. **PAS** de `npm run test:rls` (aucune migration / aucune logique RLS touchée).
5. Mettre à jour la doc (workflow obligatoire CLAUDE.md) :
   - `docs/implementation-log.md` — nouvelle entrée § (contexte, fichiers, tests, décisions, limites).
   - `docs/ROADMAP.md` — ligne du chantier + `*Dernière mise à jour*`.
   - `docs/FEATURES_STATUS.md` — feature « Récap muscu Wrapped » ✅.
   - `docs/claude/files-map.md` — ajouter `wrappedStats.ts`, `useStrengthWrapped.ts`, `StrengthWrappedRecap.tsx`, dossier `wrapped/slides/` (tailles via `wc -l`).
   - `CLAUDE.md` — mettre à jour **uniquement** la ligne « Dernier § livré ».
6. **Commit** `docs: §XXX récap muscu Wrapped (log + roadmap + features + files-map + CLAUDE)`.

---

## Notes / pièges

- **Hooks-order** (mémoire §316/§326) : `useStrengthWrapped` doit être appelé **avant** tout early-return dans `MyPlanTab` et `CoachSwimmerFullView`. Vérifier en revue.
- **PWA cache** (mémoire §330) : après déploiement, vérifier `[EAC] Build:` avant de conclure à un bug ; un chunk lazy n'est PAS ajouté (overlay monté in-place, pas de route).
- **`bucket_priorities`** : forme JSONB non garantie → `extractFocusLabel` est best-effort, `null` si inconnue (la slide objectif masque alors le focus). Ne pas inventer.
- **Pas de valeur brute** : forces/potentiel = bandes uniquement ; aucune charge/poids de corps athlète affichée côté nageur.
- **Réutilisation** : ne pas réimplémenter `estimateOneRm` / `kpiScore` / `getBareme` / `ageBandFor` — importer l'existant.
```
