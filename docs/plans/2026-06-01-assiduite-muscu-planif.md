# Assiduité muscu + mésocycles dans « Planif Muscu » — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.
> **For UI tasks (Task 4, 5, 6):** the global CLAUDE.md makes `/frontend-design` OBLIGATOIRE — invoke it before writing component JSX/CSS.

**Goal:** Sortir la liste des mésocycles muscu du home coach et la déplacer dans la vue « Planif Muscu », à côté d'un nouveau tableau d'assiduité (prévu / débuté / terminé) navigable par période, avec objectif de volume hebdo 100%.

**Architecture:** Approche hybride (C) — un agrégateur TS **pur** (`computeAttendance`, testé `node:test`) calcule prévu-vs-réalisé à partir des `strength_planning_slot_overrides` (prévu) et `strength_session_runs` (réalisé). Un helper API batché alimente l'écran. Aucune migration, aucune RPC, **lecture seule** (RLS déjà permissive pour coach/admin).

**Tech Stack:** React 19 + TS, React Query 5, Tailwind 4, Wouter, Supabase JS. Tests : `node:test` (logique pure), Vitest jsdom si hook.

**Pré-requis vérifiés (ne pas re-vérifier) :**
- `runs_select` (00001) : `athlete_id = app_user_id() OR app_user_role() IN ('admin','coach')` → coach lit tous les runs. ✅
- `strength_planning_slot_overrides_select` (00136) : `USING (true)` → coach lit tous les slots. ✅ → **pas de migration, pas de test RLS.**
- `day_of_week` : 0=Lundi … 6=Dimanche ; `week_start` = lundi ISO (`YYYY-MM-DD`).
- `CoachMesocyclePanel` : `export default function CoachMesocyclePanel({ athleteId }: { athleteId: number })` → réutilisable tel quel.
- `listActiveMesocyclesWithAthletes()` → `{ id, athlete_id, athlete_name, event_group, kind, target_week_count, sessions_per_week, generated_at, engine_version }[]`.
- Helpers date : `toISODate(d)`, `getMonday(d)` dans `src/lib/date.ts`.
- Convention test : `import { test } from 'node:test'; import assert from 'node:assert/strict';` dans `src/lib/strength/__tests__/*.test.ts`.

---

## Task 1 : Agrégateur pur `computeAttendance` (types + squelette)

**Files:**
- Create: `src/lib/strength/attendance.ts`
- Test: `src/lib/strength/__tests__/attendance.test.ts`

**Step 1 — Écrire les types et la signature (pas d'impl encore).**

Dans `src/lib/strength/attendance.ts` :

```ts
/**
 * attendance.ts — Agrégateur PUR d'assiduité muscu (lecture seule).
 *
 * Prévu = strength_planning_slot_overrides (semaine + jour + template).
 * Réalisé = strength_session_runs ('completed').
 * Débuté  = strength_session_runs ('in_progress').
 *
 * Tolérance au décalage : le % est calculé À LA SEMAINE ISO (un slot lundi
 * raté mais une séance faite mardi = semaine 100%). La granularité jour ne
 * sert qu'à l'affichage de la bande (repérer le décalage).
 */

/** Un slot prévu, déjà résolu à un athlète. */
export interface AttendancePlannedSlot {
  athleteId: number;
  /** Lundi ISO de la semaine, "YYYY-MM-DD". */
  weekStart: string;
  /** 0=Lundi … 6=Dimanche. */
  dayOfWeek: number;
  /** null = slot vide (pas de séance) → ignoré. */
  sessionTemplateId: number | null;
}

/** Un run réel (exécution). */
export interface AttendanceRun {
  athleteId: number;
  /** = strength_sessions.id (session_template_id pour un run de méso). */
  sessionId: number | null;
  status: "in_progress" | "completed" | "abandoned";
  /** ISO datetime. */
  startedAt: string | null;
  /** ISO datetime, null tant que pas terminé. */
  completedAt: string | null;
}

export type AttendanceDayStatus =
  | "completed" // séance terminée ce jour
  | "started" // séance débutée (in_progress) ce jour
  | "planned" // prévu ce jour, dans le futur (>= aujourd'hui)
  | "shifted" // prévu ce jour passé, vide, MAIS semaine déjà 100% → déplacée
  | "todo" // prévu ce jour passé, vide, semaine incomplète → à faire/rattraper
  | "none"; // rien prévu ce jour

export interface AttendanceDay {
  /** "YYYY-MM-DD". */
  date: string;
  status: AttendanceDayStatus;
}

export interface AttendanceWeek {
  weekStart: string;
  planned: number;
  completed: number;
  /** null si planned === 0. */
  pct: number | null;
}

export interface AttendanceAthlete {
  athleteId: number;
  weeks: AttendanceWeek[];
  days: AttendanceDay[];
}

export interface ComputeAttendanceInput {
  athleteIds: number[];
  plannedSlots: AttendancePlannedSlot[];
  runs: AttendanceRun[];
  /** Lundis ISO des semaines de la période, ordonnés. */
  periodWeekStarts: string[];
  /** "YYYY-MM-DD" = aujourd'hui (injecté pour testabilité). */
  today: string;
}

export function computeAttendance(
  input: ComputeAttendanceInput,
): AttendanceAthlete[] {
  throw new Error("not implemented");
}
```

**Step 2 — Vérifier la compilation.**
Run: `npx tsc --noEmit`
Expected: PASS (types only, fonction stub).

**Step 3 — Commit.**
```bash
git add src/lib/strength/attendance.ts
git commit -m "feat(assiduité): types + signature computeAttendance (stub)"
```

---

## Task 2 : Helpers de date internes + tests

**Files:**
- Modify: `src/lib/strength/attendance.ts`
- Test: `src/lib/strength/__tests__/attendance.test.ts`

**Step 1 — Écrire les tests des 2 helpers internes (date d'un slot, liste des jours).**

Dans `src/lib/strength/__tests__/attendance.test.ts` :

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { slotDate, periodDays } from "../attendance";

test("slotDate: lundi + dayOfWeek=0 = le lundi lui-même", () => {
  assert.equal(slotDate("2026-06-01", 0), "2026-06-01"); // 2026-06-01 = lundi
});

test("slotDate: lundi + dayOfWeek=1 = mardi", () => {
  assert.equal(slotDate("2026-06-01", 1), "2026-06-02");
});

test("slotDate: lundi + dayOfWeek=6 = dimanche", () => {
  assert.equal(slotDate("2026-06-01", 6), "2026-06-07");
});

test("periodDays: 2 semaines = 14 jours du 1er lundi au dernier dimanche", () => {
  const days = periodDays(["2026-06-01", "2026-06-08"]);
  assert.equal(days.length, 14);
  assert.equal(days[0], "2026-06-01");
  assert.equal(days[13], "2026-06-14");
});
```

**Step 2 — Run, vérifier l'échec.**
Run: `node --import tsx --test src/lib/strength/__tests__/attendance.test.ts`
(Si `tsx` indispo, utiliser la commande de test du repo — voir `npm test`. Vérifier d'abord comment un test pur est lancé : `grep '"test"' package.json`.)
Expected: FAIL — `slotDate`/`periodDays` non exportés.

**Step 3 — Implémenter les helpers (UTC-safe, pas de dépendance fuseau).**

Dans `attendance.ts`, ajouter :

```ts
/** Ajoute n jours à une date ISO "YYYY-MM-DD" en UTC (déterministe). */
function addDaysISO(iso: string, n: number): string {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Date calendaire d'un slot : lundi (weekStart) + dayOfWeek jours. */
export function slotDate(weekStart: string, dayOfWeek: number): string {
  return addDaysISO(weekStart, dayOfWeek);
}

/** Tous les jours (ISO) d'une période = chaque semaine × 7 jours. */
export function periodDays(periodWeekStarts: string[]): string[] {
  const out: string[] = [];
  for (const ws of periodWeekStarts) {
    for (let i = 0; i < 7; i++) out.push(addDaysISO(ws, i));
  }
  return out;
}
```

**Step 4 — Run, vérifier le succès.**
Run: `node --import tsx --test src/lib/strength/__tests__/attendance.test.ts`
Expected: PASS (4 tests).

**Step 5 — Commit.**
```bash
git add src/lib/strength/attendance.ts src/lib/strength/__tests__/attendance.test.ts
git commit -m "feat(assiduité): helpers slotDate + periodDays (TDD)"
```

---

## Task 3 : Cœur `computeAttendance` (semaines + jours + décalage)

**Files:**
- Modify: `src/lib/strength/attendance.ts`
- Test: `src/lib/strength/__tests__/attendance.test.ts`

**Step 1 — Écrire les tests métier.** Ajouter dans le fichier de test :

```ts
import { computeAttendance } from "../attendance";

const baseInput = {
  athleteIds: [1],
  periodWeekStarts: ["2026-06-01"], // 1 semaine
  today: "2026-06-10", // mercredi semaine suivante → toute la semaine est passée
};

function slot(dayOfWeek: number, tpl = 100) {
  return { athleteId: 1, weekStart: "2026-06-01", dayOfWeek, sessionTemplateId: tpl };
}
function run(date: string, status: "in_progress" | "completed", sessionId = 100) {
  return {
    athleteId: 1,
    sessionId,
    status,
    startedAt: date + "T07:00:00Z",
    completedAt: status === "completed" ? date + "T08:00:00Z" : null,
  } as const;
}

test("semaine 100% quand toutes les séances prévues sont terminées", () => {
  const res = computeAttendance({
    ...baseInput,
    plannedSlots: [slot(0), slot(2), slot(4)], // Lun/Mer/Ven
    runs: [run("2026-06-01", "completed"), run("2026-06-03", "completed"), run("2026-06-05", "completed")],
  });
  assert.equal(res[0].weeks[0].planned, 3);
  assert.equal(res[0].weeks[0].completed, 3);
  assert.equal(res[0].weeks[0].pct, 100);
});

test("décalage toléré : prévu lundi fait mardi => semaine 100%, lundi 'shifted'", () => {
  const res = computeAttendance({
    ...baseInput,
    plannedSlots: [slot(0)], // prévu lundi seulement
    runs: [run("2026-06-02", "completed")], // fait mardi
  });
  assert.equal(res[0].weeks[0].pct, 100);
  const lundi = res[0].days.find((d) => d.date === "2026-06-01")!;
  assert.equal(lundi.status, "shifted"); // déplacée (semaine complète)
});

test("séance ratée non rattrapée : lundi 'todo', semaine < 100%", () => {
  const res = computeAttendance({
    ...baseInput,
    plannedSlots: [slot(0), slot(2)],
    runs: [run("2026-06-02", "completed")], // 1 faite sur 2
  });
  assert.equal(res[0].weeks[0].completed, 1);
  assert.equal(res[0].weeks[0].pct, 50);
  const mer = res[0].days.find((d) => d.date === "2026-06-03")!;
  assert.equal(mer.status, "todo"); // prévu mercredi, vide, semaine incomplète
});

test("débutée = état intermédiaire, ne compte pas dans le %", () => {
  const res = computeAttendance({
    ...baseInput,
    plannedSlots: [slot(0)],
    runs: [run("2026-06-01", "in_progress")],
  });
  assert.equal(res[0].weeks[0].completed, 0);
  assert.equal(res[0].weeks[0].pct, 0);
  const lundi = res[0].days.find((d) => d.date === "2026-06-01")!;
  assert.equal(lundi.status, "started");
});

test("completed plafonné au nombre prévu (séances bonus n'inflent pas le %)", () => {
  const res = computeAttendance({
    ...baseInput,
    plannedSlots: [slot(0)], // 1 prévue
    runs: [run("2026-06-01", "completed"), run("2026-06-03", "completed")], // 2 faites
  });
  assert.equal(res[0].weeks[0].completed, 1); // plafonné à planned
  assert.equal(res[0].weeks[0].pct, 100);
});

test("run d'un template hors méso (session_id inconnu) ne compte pas", () => {
  const res = computeAttendance({
    ...baseInput,
    plannedSlots: [slot(0, 100)],
    runs: [run("2026-06-01", "completed", 999)], // template 999 pas dans les slots
  });
  assert.equal(res[0].weeks[0].completed, 0);
});

test("jour futur prévu = 'planned', pas 'todo'", () => {
  const res = computeAttendance({
    ...baseInput,
    today: "2026-06-01", // lundi : mercredi est dans le futur
    plannedSlots: [slot(2)], // prévu mercredi
    runs: [],
  });
  const mer = res[0].days.find((d) => d.date === "2026-06-03")!;
  assert.equal(mer.status, "planned");
});

test("athlète sans slot ni run apparaît avec semaines à 0 / null", () => {
  const res = computeAttendance({ ...baseInput, plannedSlots: [], runs: [] });
  assert.equal(res.length, 1);
  assert.equal(res[0].weeks[0].planned, 0);
  assert.equal(res[0].weeks[0].pct, null);
});
```

**Step 2 — Run, vérifier l'échec** (toujours `throw new Error("not implemented")`).
Run: `node --import tsx --test src/lib/strength/__tests__/attendance.test.ts`
Expected: FAIL.

**Step 3 — Implémenter `computeAttendance`.** Remplacer le stub par :

```ts
export function computeAttendance(
  input: ComputeAttendanceInput,
): AttendanceAthlete[] {
  const { athleteIds, plannedSlots, runs, periodWeekStarts, today } = input;
  const days = periodDays(periodWeekStarts);

  return athleteIds.map((athleteId) => {
    const aSlots = plannedSlots.filter(
      (s) => s.athleteId === athleteId && s.sessionTemplateId != null,
    );
    const aRuns = runs.filter((r) => r.athleteId === athleteId);

    // Templates appartenant au méso de l'athlète (pour filtrer les runs perso).
    const templateIds = new Set(aSlots.map((s) => s.sessionTemplateId!));

    // ── Stats par semaine (granularité du % = la semaine, décalage toléré) ──
    const weeks: AttendanceWeek[] = periodWeekStarts.map((weekStart) => {
      const weekEnd = addDaysISO(weekStart, 6);
      const planned = aSlots.filter((s) => s.weekStart === weekStart).length;
      // runs terminés CETTE semaine, sur un template du méso
      const completedRuns = aRuns.filter((r) => {
        if (r.status !== "completed") return false;
        if (r.sessionId == null || !templateIds.has(r.sessionId)) return false;
        const d = (r.completedAt ?? r.startedAt ?? "").slice(0, 10);
        return d >= weekStart && d <= weekEnd;
      }).length;
      const completed = Math.min(completedRuns, planned);
      const pct = planned > 0 ? Math.round((completed / planned) * 100) : null;
      return { weekStart, planned, completed, pct };
    });

    const pctByWeek = new Map(weeks.map((w) => [w.weekStart, w.pct]));

    // index des runs par date (jour) pour la bande
    const runDay = (r: AttendanceRun) =>
      (r.status === "completed"
        ? r.completedAt ?? r.startedAt
        : r.startedAt ?? "") ?? "";

    // ── Statut par jour (affichage / repérage du décalage) ──
    const dayList: AttendanceDay[] = days.map((date) => {
      const weekStart = date <= "" ? date : mondayOf(date, periodWeekStarts);
      const dayRuns = aRuns.filter(
        (r) =>
          r.sessionId != null &&
          templateIds.has(r.sessionId) &&
          runDay(r).slice(0, 10) === date,
      );
      const hasCompleted = dayRuns.some((r) => r.status === "completed");
      const hasStarted = dayRuns.some((r) => r.status === "in_progress");
      const plannedThisDay = aSlots.some(
        (s) => slotDate(s.weekStart, s.dayOfWeek) === date,
      );

      let status: AttendanceDayStatus;
      if (hasCompleted) status = "completed";
      else if (hasStarted) status = "started";
      else if (plannedThisDay) {
        if (date >= today) status = "planned";
        else {
          const weekComplete = (pctByWeek.get(weekStart) ?? 0) === 100;
          status = weekComplete ? "shifted" : "todo";
        }
      } else status = "none";

      return { date, status };
    });

    return { athleteId, weeks, days: dayList };
  });
}

/** Lundi ISO de la semaine contenant `date`, choisi parmi les semaines connues. */
function mondayOf(date: string, periodWeekStarts: string[]): string {
  for (const ws of periodWeekStarts) {
    if (date >= ws && date <= addDaysISO(ws, 6)) return ws;
  }
  return periodWeekStarts[0] ?? date;
}
```

> Note d'impl : `mondayOf` remplace la ligne bancale `date <= "" ? ...` du squelette — bien recopier la version finale ci-dessus (la branche `date <= ""` n'existe pas dans la version correcte ; utiliser directement `const weekStart = mondayOf(date, periodWeekStarts);`).

**Step 4 — Run, vérifier le succès.**
Run: `node --import tsx --test src/lib/strength/__tests__/attendance.test.ts`
Expected: PASS (tous les tests Task 2 + Task 3).

**Step 5 — Type check global.**
Run: `npx tsc --noEmit`
Expected: PASS.

**Step 6 — Commit.**
```bash
git add src/lib/strength/attendance.ts src/lib/strength/__tests__/attendance.test.ts
git commit -m "feat(assiduité): computeAttendance (semaine 100% tolérante au décalage) + tests"
```

---

## Task 4 : Helper API batché `getStrengthAttendanceData`

**Files:**
- Create: `src/lib/api/strength-attendance.ts`
- Modify: `src/lib/api/index.ts` (re-export)

**Step 1 — Écrire le helper.** Dans `src/lib/api/strength-attendance.ts` :

```ts
/**
 * strength-attendance.ts — récupération batchée des données d'assiduité muscu
 * pour le tableau coach (§XXX). Lecture seule, RLS coach/admin déjà permissive.
 */
import { supabase, canUseSupabase, assertSupabase } from "./client";
import type {
  AttendancePlannedSlot,
  AttendanceRun,
} from "@/lib/strength/attendance";

export interface StrengthAttendanceData {
  plannedSlots: AttendancePlannedSlot[];
  runs: AttendanceRun[];
}

/**
 * @param athleteIds nageurs à mésocycle actif
 * @param weekStarts lundis ISO de la période
 * @param fromISO    borne basse runs (= 1er lundi, "YYYY-MM-DD")
 * @param toISO      borne haute runs (= dernier dimanche, "YYYY-MM-DD")
 */
export async function getStrengthAttendanceData(
  athleteIds: number[],
  weekStarts: string[],
  fromISO: string,
  toISO: string,
): Promise<StrengthAttendanceData> {
  if (!canUseSupabase() || athleteIds.length === 0 || weekStarts.length === 0) {
    return { plannedSlots: [], runs: [] };
  }

  const slotsRaw = assertSupabase(
    await supabase
      .from("strength_planning_slot_overrides")
      .select("athlete_id, week_start, day_of_week, session_template_id")
      .in("athlete_id", athleteIds)
      .in("week_start", weekStarts),
  );

  const runsRaw = assertSupabase(
    await supabase
      .from("strength_session_runs")
      .select("athlete_id, session_id, status, started_at, completed_at")
      .in("athlete_id", athleteIds)
      .gte("started_at", fromISO)
      .lte("started_at", toISO + "T23:59:59"),
  );

  const plannedSlots: AttendancePlannedSlot[] = ((slotsRaw ?? []) as any[]).map(
    (s) => ({
      athleteId: s.athlete_id,
      weekStart: s.week_start,
      dayOfWeek: s.day_of_week,
      sessionTemplateId: s.session_template_id ?? null,
    }),
  );

  const runs: AttendanceRun[] = ((runsRaw ?? []) as any[]).map((r) => ({
    athleteId: r.athlete_id,
    sessionId: r.session_id ?? null,
    status: r.status,
    startedAt: r.started_at ?? null,
    completedAt: r.completed_at ?? null,
  }));

  return { plannedSlots, runs };
}
```

**Step 2 — Re-export.** Dans `src/lib/api/index.ts`, ajouter à la liste des exports (suivre le style existant des `export { ... } from "./..."`) :
```ts
export { getStrengthAttendanceData } from "./strength-attendance";
export type { StrengthAttendanceData } from "./strength-attendance";
```
Vérifier au préalable la forme exacte des re-exports dans ce fichier (`grep -n "from \"./strength-planning\"" src/lib/api/index.ts`) et s'aligner dessus.

**Step 3 — Type check.**
Run: `npx tsc --noEmit`
Expected: PASS.

**Step 4 — Commit.**
```bash
git add src/lib/api/strength-attendance.ts src/lib/api/index.ts
git commit -m "feat(assiduité): helper API batché getStrengthAttendanceData"
```

---

## Task 5 : Hook de période + tableau d'assiduité (UI)

> **INVOQUER `/frontend-design` AVANT d'écrire le JSX/Tailwind de ce composant.**

**Files:**
- Create: `src/components/coach/strength/StrengthAttendanceBoard.tsx`
- (option) Create: `src/components/coach/strength/useAttendancePeriod.ts` (logique période, testable)
- Test (logique période) : `src/lib/strength/__tests__/attendancePeriod.test.ts` si la logique est extraite en fonction pure.

**Step 1 — Logique de période pure + test.** Extraire la dérivation de période dans une fonction pure (testable `node:test`), p.ex. dans `attendance.ts` :

```ts
/** Dérive les lundis ISO d'une période de `weeks` semaines, décalée de
 *  `offset` blocs (offset 0 = période courante contenant today). */
export function derivePeriodWeekStarts(
  todayMondayISO: string,
  weeks: 1 | 2 | 4,
  offset: number,
): string[] {
  // La période courante (offset 0) se termine sur la semaine de today et
  // remonte `weeks-1` semaines en arrière.
  const lastMonday = addDaysISO(todayMondayISO, offset * weeks * 7);
  const firstMonday = addDaysISO(lastMonday, -(weeks - 1) * 7);
  const out: string[] = [];
  for (let i = 0; i < weeks; i++) out.push(addDaysISO(firstMonday, i * 7));
  return out;
}
```

Tests (`attendancePeriod.test.ts`) :
```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { derivePeriodWeekStarts } from "../attendance";

test("offset 0, 2 semaines = semaine courante + précédente", () => {
  // today lundi 2026-06-08 → période [2026-06-01, 2026-06-08]
  assert.deepEqual(derivePeriodWeekStarts("2026-06-08", 2, 0), [
    "2026-06-01",
    "2026-06-08",
  ]);
});
test("offset -1, 2 semaines = bloc précédent", () => {
  assert.deepEqual(derivePeriodWeekStarts("2026-06-08", 2, -1), [
    "2026-05-18",
    "2026-05-25",
  ]);
});
test("offset 0, 1 semaine = la semaine courante seule", () => {
  assert.deepEqual(derivePeriodWeekStarts("2026-06-08", 1, 0), ["2026-06-08"]);
});
```
Run: `node --import tsx --test src/lib/strength/__tests__/attendancePeriod.test.ts` → FAIL puis (après impl déjà ci-dessus) PASS.

**Step 2 — Composant `StrengthAttendanceBoard`.** Props : aucune (autonome). Comportement :
- State local : `weeks: 1|2|4` (défaut 2), `offset: number` (défaut 0).
- `useQuery(['active-mesocycles-coach'], listActiveMesocyclesWithAthletes)` → athlètes + noms.
- Dérive `periodWeekStarts = derivePeriodWeekStarts(toISODate(getMonday(new Date())), weeks, offset)`.
- `fromISO = periodWeekStarts[0]`, `toISO = addDaysISO(dernier lundi, 6)` (exposer `addDaysISO` ou recalculer via `periodDays`).
- `useQuery(['strength-attendance', athleteIds, periodWeekStarts], () => getStrengthAttendanceData(athleteIds, periodWeekStarts, fromISO, toISO))`.
- `computeAttendance({ athleteIds, plannedSlots, runs, periodWeekStarts, today: toISODate(new Date()) })`.
- Rendu (design via `/frontend-design`) :
  - En-tête : segmented control `1 sem / 2 sem / 4 sem` + flèches `◀ ▶` + libellé période (ex. « 25 mai – 7 juin »). Flèche droite désactivée si `offset >= 0` (pas de futur lointain au-delà de la période courante).
  - Une ligne par nageur : nom + pour chaque semaine une **jauge** `completed/planned` colorée (vert ≥100%, orange partiel, gris 0), + une **bande de jours** (pastilles selon `AttendanceDayStatus` : `completed`=🟢, `started`=🟠, `todo`=⚪ contour rouge, `shifted`=⚪ pointillé, `planned`=⚪, `none`=vide).
  - États : skeleton pendant loading, vide « Aucun mésocycle actif » si `athleteIds.length === 0`.

**Step 3 — Type check + tests.**
Run: `npx tsc --noEmit` puis `node --import tsx --test src/lib/strength/__tests__/attendancePeriod.test.ts`
Expected: PASS.

**Step 4 — Commit.**
```bash
git add src/lib/strength/attendance.ts src/lib/strength/__tests__/attendancePeriod.test.ts src/components/coach/strength/StrengthAttendanceBoard.tsx
git commit -m "feat(assiduité): StrengthAttendanceBoard + dérivation de période (TDD)"
```

---

## Task 6 : Accordéon mésocycles + refonte `StrengthPlanningScreen`

> **INVOQUER `/frontend-design` AVANT d'écrire le JSX/Tailwind.**

**Files:**
- Create: `src/components/coach/strength/CoachMesocyclesAccordion.tsx`
- Modify: `src/pages/coach/StrengthPlanningScreen.tsx` (refonte)

**Step 1 — `CoachMesocyclesAccordion`.**
- `useQuery(['active-mesocycles-coach'], listActiveMesocyclesWithAthletes)`.
- Liste d'items repliés (réutiliser le style carte de `CoachActiveMesocyclesSection` : nom, event, durée, date génération).
- Au clic → déplie et **monte `<CoachMesocyclePanel athleteId={m.athlete_id} />`** (lazy : ne monter le panel que si l'item est ouvert, pour éviter N fetchs simultanés).
- Réutiliser le composant `Accordion` Radix si présent dans `src/components/ui/` (sinon état `openId` local).

**Step 2 — Refonte `StrengthPlanningScreen`.**
- Conserver l'en-tête (titre + `ArrowLeft` retour).
- Remplacer le corps (sélecteur groupe/nageur + timeline read-only + `MyPlanTab`) par :
  ```tsx
  <div className="space-y-6">
    <StrengthAttendanceBoard />
    <CoachMesocyclesAccordion />
  </div>
  ```
- Supprimer les imports/états devenus inutiles (groupes, `getStrengthSessions`, `derivePlanByWeekDay`, `StrengthPlanningTimeline`, `MyPlanTab`, `MyPlanSessionSheet`, compétitions…). **Ne pas supprimer** les composants/fonctions partagés eux-mêmes (`StrengthPlanningTimeline`, `derivePlanByWeekDay` restent utilisés ailleurs — vérifier via `grep -rn "StrengthPlanningTimeline" src/` avant suppression d'import).

**Step 3 — Type check + lint.**
Run: `npx tsc --noEmit && npm run lint`
Expected: PASS (warnings exhaustive-deps tolérés).

**Step 4 — Commit.**
```bash
git add src/components/coach/strength/CoachMesocyclesAccordion.tsx src/pages/coach/StrengthPlanningScreen.tsx
git commit -m "feat(assiduité): Planif Muscu = assiduité + accordéon mésocycles"
```

---

## Task 7 : Retirer la section du home coach

**Files:**
- Modify: `src/pages/Coach.tsx` (retirer `<CoachActiveMesocyclesSection />` + son import)
- Delete (si plus aucun usage) : `src/components/coach/CoachActiveMesocyclesSection.tsx`

**Step 1 — Vérifier les usages restants.**
Run: `grep -rn "CoachActiveMesocyclesSection" src/`
Expected: usages uniquement dans `Coach.tsx` (+ sa def).

**Step 2 — Retirer le rendu et l'import** dans `Coach.tsx` (le bloc `{/* §296 — Mésocycles muscu actifs */}` + `<CoachActiveMesocyclesSection />`, ~ligne 821, et la ligne d'import).

**Step 3 — Supprimer le fichier** `CoachActiveMesocyclesSection.tsx` **uniquement si** plus aucune référence. Conserver l'export `COACH_SWIMMER_INITIAL_TAB_KEY` s'il est consommé ailleurs :
Run: `grep -rn "COACH_SWIMMER_INITIAL_TAB_KEY" src/`
→ s'il est utilisé par `CoachSwimmerFullView`, **déplacer la constante** vers un module neutre (ex. `src/lib/coachNav.ts`) plutôt que supprimer ; sinon suppression franche.

**Step 4 — Type check + lint + build.**
Run: `npx tsc --noEmit && npm run lint && npm run build`
Expected: PASS.

**Step 5 — Commit.**
```bash
git add -A
git commit -m "refactor(assiduité): retire les mésocycles du home coach (déplacés dans Planif Muscu)"
```

---

## Task 8 : Vérification finale + suite de tests

**Step 1 — Suite complète.**
Run: `npm test`
Expected: tous verts (les nouveaux `node:test` inclus).

**Step 2 — Type check + build.**
Run: `npx tsc --noEmit && npm run build`
Expected: PASS, build timestamp injecté.

**Step 3 — Vérif visuelle (optionnel mais recommandé).** Via `/run` ou `npm run dev` : ouvrir Coach → « Planif. Muscu », vérifier (a) toggle 1/2/4 sem + flèches, (b) au moins un nageur à méso actif affiche jauge + bande jours, (c) accordéon déplie le `CoachMesocyclePanel`, (d) le home coach n'affiche plus la section mésocycles.

**Step 4 — Documentation obligatoire (workflow CLAUDE.md).**
- `docs/implementation-log.md` : nouvelle entrée §XXX (contexte, fichiers, tests, décisions, limites = lecture seule, périmètre méso actif).
- `docs/ROADMAP.md` : ligne + `*Dernière mise à jour*`.
- `docs/FEATURES_STATUS.md` : statut feature assiduité muscu.
- `docs/claude/files-map.md` : ajouter `attendance.ts`, `strength-attendance.ts`, `StrengthAttendanceBoard.tsx`, `CoachMesocyclesAccordion.tsx` (chemin + rôle + `wc -l`).
- `CLAUDE.md` : ligne « Dernier § livré » + (si pertinent) tableau Hubs.

**Step 5 — Commit doc.**
```bash
git add docs/ CLAUDE.md
git commit -m "docs(§XXX): assiduité muscu + mésocycles dans Planif Muscu"
```

---

## Notes d'exécution

- **Lancement des `node:test` purs** : confirmer la commande exacte du repo au début (Task 2 Step 2). Le repo utilise `node:test` comme runner principal — `npm test` exécute la suite ; pour un seul fichier, adapter (`node --import tsx --test <path>` ou l'équivalent configuré dans `package.json`).
- **Pas de migration, pas de `npm run test:rls`** (lecture seule, RLS déjà permissive).
- **Numéro de §** : prendre le prochain libre dans `implementation-log.md` au moment de l'exécution (collisions possibles entre terminaux — cf. mémoire « Shared working tree »).
- **`/frontend-design` obligatoire** pour Tasks 5 & 6 (rendu visuel) avant d'écrire le JSX.
