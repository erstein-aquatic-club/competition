# Vue Info Compétition — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Remplacer le menu de préparation compétition par une vue info au tap sur la bannière (`/competition/:id`), avec lien vers les tabs prep déplacés sous `/competition/:id/prep`.

**Architecture:**
- Renommer `CompetitionDetail.tsx` (tabs prep) → `CompetitionPrep.tsx`. Le composant est inchangé sauf le back arrow.
- Réécrire un nouveau `CompetitionDetail.tsx` qui rend une vue info adaptée au rôle (header + section nageur OU section coach/comité + CTA "Préparer").
- 4 nouveaux fichiers : 2 composants UI + 2 helpers purs testés en TDD.

**Tech Stack:** React 19, Wouter (hash routing), React Query 5, Tailwind 4, Radix UI/Shadcn, Vitest.

**Design source:** `docs/plans/2026-05-03-competition-info-view-design.md`

**Branche:** travail direct sur `main` avec commits fréquents (cohérent avec le pattern récent du projet — voir CLAUDE.md § Chantiers).

---

## Task 1: Rename CompetitionDetail → CompetitionPrep (file move only)

**Goal:** Déplacer le composant existant sous le nom `CompetitionPrep.tsx` SANS changer la logique. À la fin de cette task, `/competition/:id` continue de marcher exactement comme avant — on n'introduit pas encore l'info view.

**Files:**
- Move: `src/pages/CompetitionDetail.tsx` → `src/pages/CompetitionPrep.tsx`
- Modify: `src/App.tsx` (import + 2 routes)

### Step 1.1: Vérifier qu'aucun autre fichier n'importe `CompetitionDetail` par nom

Run: `grep -rn "CompetitionDetail\b" src/ --include="*.tsx" --include="*.ts"`
Expected: seul match dans `src/App.tsx` (ligne 283).

### Step 1.2: Faire la copie avec git mv

```bash
git mv src/pages/CompetitionDetail.tsx src/pages/CompetitionPrep.tsx
```

### Step 1.3: Renommer le default export

Modifier `src/pages/CompetitionPrep.tsx` :
- Ligne ~58 : `export default function CompetitionDetail()` → `export default function CompetitionPrep()`

### Step 1.4: Mettre à jour `App.tsx`

Modifier `src/App.tsx` :
- Remplacer `import CompetitionDetail from "@/pages/CompetitionDetail";` par `import CompetitionPrep from "@/pages/CompetitionPrep";`
- Remplacer la route :
  ```tsx
  <Route path="/competition/:id" component={CompetitionDetail} />
  ```
  par les 2 routes (l'ordre compte — Wouter évalue ligne par ligne, plus spécifique d'abord) :
  ```tsx
  <Route path="/competition/:id/prep" component={CompetitionPrep} />
  <Route path="/competition/:id" component={CompetitionPrep} />
  ```

À ce stade, **les deux routes pointent sur la prep** — c'est temporaire, on swappe en Task 6.

### Step 1.5: Type check & smoke

Run: `npx tsc --noEmit`
Expected: 0 erreur (les erreurs pré-existantes des `*.stories.tsx` restent).

Run: `npm run dev`
Aller sur `/#/competition/<id>` et `/#/competition/<id>/prep` → les deux affichent le menu tabs comme avant.

### Step 1.6: Commit

```bash
git add src/pages/CompetitionPrep.tsx src/App.tsx
git commit -m "refactor(competition): rename CompetitionDetail to CompetitionPrep, add /prep route alias

Préparation pour l'introduction de la vue info au tap sur la bannière.
Les deux routes /competition/:id et /competition/:id/prep pointent encore
sur le menu tabs prep — l'info view sera introduite dans une task suivante.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 2: Helper `computeObjectivePerfRow` (TDD)

**Goal:** Helper pur qui prend un objectif + une liste de perfs, et retourne `{ eventLabel, target, pb, deltaSeconds }`.

**Files:**
- Create: `src/components/competition/info-helpers.ts`
- Test: `src/components/competition/__tests__/info-helpers.test.ts`

### Step 2.1: Écrire les tests qui échouent

Créer `src/components/competition/__tests__/info-helpers.test.ts` :

```ts
import { describe, it, expect } from "vitest";
import { computeObjectivePerfRow } from "../info-helpers";
import type { Objective, SwimmerPerformance } from "@/lib/api/types";

const baseObjective = (over: Partial<Objective> = {}): Objective => ({
  id: "o1",
  athlete_id: "a1",
  competition_id: "c1",
  event_code: "50_FREE",
  pool_length: 50,
  target_time_seconds: 24.5,
  text: null,
  ...over,
});

const perf = (over: Partial<SwimmerPerformance> = {}): SwimmerPerformance => ({
  id: 1,
  user_id: 1,
  swimmer_iuf: "X",
  event_code: "50_FREE",
  pool_length: 50,
  time_seconds: 24.82,
  competition_date: "2025-12-01",
  ...over,
} as SwimmerPerformance);

describe("computeObjectivePerfRow", () => {
  it("returns label, target, pb and positive delta when PB is above target", () => {
    const row = computeObjectivePerfRow(baseObjective(), [perf()]);
    expect(row.targetSeconds).toBe(24.5);
    expect(row.pbSeconds).toBe(24.82);
    expect(row.deltaSeconds).toBeCloseTo(0.32, 2);
  });

  it("returns negative delta when PB is below target", () => {
    const row = computeObjectivePerfRow(baseObjective(), [perf({ time_seconds: 24.10 })]);
    expect(row.deltaSeconds).toBeCloseTo(-0.40, 2);
  });

  it("returns null pb when no perf matches event_code+poolLength", () => {
    const row = computeObjectivePerfRow(baseObjective(), [perf({ event_code: "100_FREE" })]);
    expect(row.pbSeconds).toBeNull();
    expect(row.deltaSeconds).toBeNull();
  });

  it("picks the minimum (best) time when multiple perfs match", () => {
    const row = computeObjectivePerfRow(baseObjective(), [
      perf({ time_seconds: 25.10 }),
      perf({ time_seconds: 24.55 }),
      perf({ time_seconds: 24.95 }),
    ]);
    expect(row.pbSeconds).toBe(24.55);
  });

  it("returns null target and pb when objective has no target_time_seconds", () => {
    const row = computeObjectivePerfRow(baseObjective({ target_time_seconds: null }), [perf()]);
    expect(row.targetSeconds).toBeNull();
    expect(row.deltaSeconds).toBeNull();
    // pb is still computed because it doesn't depend on target
    expect(row.pbSeconds).toBe(24.82);
  });

  it("respects pool_length when filtering perfs", () => {
    const row = computeObjectivePerfRow(
      baseObjective({ pool_length: 25 }),
      [perf({ pool_length: 50, time_seconds: 24.10 })],
    );
    expect(row.pbSeconds).toBeNull();
  });
});
```

### Step 2.2: Lancer les tests pour confirmer qu'ils échouent

Run: `npx vitest run src/components/competition/__tests__/info-helpers.test.ts`
Expected: FAIL — module `../info-helpers` introuvable.

### Step 2.3: Implémenter le helper

Créer `src/components/competition/info-helpers.ts` :

```ts
import type { Objective, SwimmerPerformance } from "@/lib/api/types";

export interface ObjectivePerfRow {
  objectiveId: string;
  eventCode: string | null;
  poolLength: number | null;
  targetSeconds: number | null;
  pbSeconds: number | null;
  deltaSeconds: number | null;
  /** Free-text fallback when objective has no parseable target. */
  text: string | null;
}

export function computeObjectivePerfRow(
  objective: Objective,
  perfs: SwimmerPerformance[],
): ObjectivePerfRow {
  const eventCode = objective.event_code ?? null;
  const poolLength = objective.pool_length ?? null;
  const targetSeconds = objective.target_time_seconds ?? null;

  const matching = perfs.filter(
    (p) =>
      p.event_code === eventCode &&
      (poolLength == null || p.pool_length === poolLength),
  );
  const pbSeconds =
    matching.length > 0 ? Math.min(...matching.map((p) => p.time_seconds)) : null;

  const deltaSeconds =
    targetSeconds != null && pbSeconds != null ? pbSeconds - targetSeconds : null;

  return {
    objectiveId: objective.id,
    eventCode,
    poolLength,
    targetSeconds,
    pbSeconds,
    deltaSeconds,
    text: objective.text ?? null,
  };
}
```

### Step 2.4: Lancer les tests pour vérifier qu'ils passent

Run: `npx vitest run src/components/competition/__tests__/info-helpers.test.ts`
Expected: PASS — 6 tests verts.

### Step 2.5: Commit

```bash
git add src/components/competition/info-helpers.ts src/components/competition/__tests__/info-helpers.test.ts
git commit -m "feat(competition-info): pure helper computeObjectivePerfRow + tests

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 3: Helper `groupAndSortAssignments` (TDD)

**Goal:** Helper pur qui prend `competition_assignments` + map de profils + map d'objectifs comptés, et retourne une liste ordonnée groupe ASC → nom ASC.

**Files:**
- Modify: `src/components/competition/info-helpers.ts` (ajouter export)
- Modify: `src/components/competition/__tests__/info-helpers.test.ts` (ajouter describe)

### Step 3.1: Ajouter les tests qui échouent

Append à `info-helpers.test.ts` :

```ts
import { groupAndSortAssignments } from "../info-helpers";
import type { CompetitionAssignment } from "@/lib/api/types";

interface TestProfile {
  user_id: number;
  display_name: string;
  group_label: string | null;
  avatar_url: string | null;
}

describe("groupAndSortAssignments", () => {
  const a = (id: number): CompetitionAssignment => ({
    id,
    competition_id: "c1",
    athlete_id: id,
    assigned_at: null,
  });

  it("sorts by group ASC then name ASC", () => {
    const profiles = new Map<number, TestProfile>([
      [1, { user_id: 1, display_name: "Charlie", group_label: "Compet M", avatar_url: null }],
      [2, { user_id: 2, display_name: "Alice", group_label: "Compet F", avatar_url: null }],
      [3, { user_id: 3, display_name: "Bob", group_label: "Compet F", avatar_url: null }],
    ]);
    const objectivesByAthlete = new Map<number, number>();
    const rows = groupAndSortAssignments(
      [a(1), a(2), a(3)],
      profiles,
      objectivesByAthlete,
    );
    expect(rows.map((r) => r.displayName)).toEqual(["Alice", "Bob", "Charlie"]);
  });

  it("attaches objectives count from map", () => {
    const profiles = new Map<number, TestProfile>([
      [1, { user_id: 1, display_name: "Alice", group_label: "G1", avatar_url: null }],
    ]);
    const objectivesByAthlete = new Map<number, number>([[1, 3]]);
    const [row] = groupAndSortAssignments([a(1)], profiles, objectivesByAthlete);
    expect(row.objectivesCount).toBe(3);
  });

  it("buckets athletes without group into 'Sans groupe' at the end", () => {
    const profiles = new Map<number, TestProfile>([
      [1, { user_id: 1, display_name: "Alice", group_label: null, avatar_url: null }],
      [2, { user_id: 2, display_name: "Bob", group_label: "G1", avatar_url: null }],
    ]);
    const rows = groupAndSortAssignments([a(1), a(2)], profiles, new Map());
    expect(rows.map((r) => r.groupLabel)).toEqual(["G1", "Sans groupe"]);
  });

  it("skips assignments whose profile is missing", () => {
    const profiles = new Map<number, TestProfile>();
    const rows = groupAndSortAssignments([a(1)], profiles, new Map());
    expect(rows).toEqual([]);
  });
});
```

### Step 3.2: Lancer les tests pour confirmer l'échec

Run: `npx vitest run src/components/competition/__tests__/info-helpers.test.ts`
Expected: FAIL — `groupAndSortAssignments` non défini.

### Step 3.3: Implémenter le helper

Append à `src/components/competition/info-helpers.ts` :

```ts
import type { CompetitionAssignment } from "@/lib/api/types";

export interface ParticipantProfile {
  user_id: number;
  display_name: string;
  group_label: string | null;
  avatar_url: string | null;
}

export interface ParticipantRow {
  athleteId: number;
  displayName: string;
  groupLabel: string;
  avatarUrl: string | null;
  objectivesCount: number;
}

const NO_GROUP_BUCKET = "Sans groupe";

export function groupAndSortAssignments(
  assignments: CompetitionAssignment[],
  profilesByUserId: Map<number, ParticipantProfile>,
  objectivesByAthlete: Map<number, number>,
): ParticipantRow[] {
  const rows: ParticipantRow[] = [];
  for (const assignment of assignments) {
    const profile = profilesByUserId.get(assignment.athlete_id);
    if (!profile) continue;
    rows.push({
      athleteId: assignment.athlete_id,
      displayName: profile.display_name,
      groupLabel: profile.group_label ?? NO_GROUP_BUCKET,
      avatarUrl: profile.avatar_url,
      objectivesCount: objectivesByAthlete.get(assignment.athlete_id) ?? 0,
    });
  }
  rows.sort((a, b) => {
    // "Sans groupe" toujours en queue
    const aLast = a.groupLabel === NO_GROUP_BUCKET;
    const bLast = b.groupLabel === NO_GROUP_BUCKET;
    if (aLast !== bLast) return aLast ? 1 : -1;
    if (a.groupLabel !== b.groupLabel) return a.groupLabel.localeCompare(b.groupLabel, "fr");
    return a.displayName.localeCompare(b.displayName, "fr");
  });
  return rows;
}
```

### Step 3.4: Lancer les tests pour vérifier qu'ils passent

Run: `npx vitest run src/components/competition/__tests__/info-helpers.test.ts`
Expected: PASS — 10 tests verts (6 + 4).

### Step 3.5: Commit

```bash
git add src/components/competition/info-helpers.ts src/components/competition/__tests__/info-helpers.test.ts
git commit -m "feat(competition-info): pure helper groupAndSortAssignments + tests

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 4: Component `InfoMyObjectives.tsx`

**Goal:** Composant React qui rend la table objectifs + PB pour un nageur.

**Files:**
- Create: `src/components/competition/InfoMyObjectives.tsx`

### Step 4.1: Implémenter le composant

```tsx
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { api } from "@/lib/api";
import { eventLabel } from "@/lib/objectiveHelpers";
import { formatTime } from "@/lib/objectiveHelpers";
import { computeObjectivePerfRow } from "./info-helpers";
import { Target } from "lucide-react";

interface Props {
  competitionId: string;
  userId: number | null;
  userUuid: string | null;
}

export default function InfoMyObjectives({ competitionId, userId, userUuid }: Props) {
  const [, navigate] = useLocation();

  const { data: objectives = [] } = useQuery({
    queryKey: ["my-objectives", userUuid],
    queryFn: () => (userUuid ? api.getObjectives(userUuid) : Promise.resolve([])),
    enabled: !!userUuid,
  });

  const competitionObjectives = useMemo(
    () => objectives.filter((o) => o.competition_id === competitionId),
    [objectives, competitionId],
  );

  // Fetch swimmer performances for the last 365 days
  const today = new Date();
  const fromDate = new Date(today);
  fromDate.setDate(today.getDate() - 365);
  const fromDateIso = fromDate.toISOString().slice(0, 10);

  const { data: perfs = [] } = useQuery({
    queryKey: ["swimmer-performances-rolling-12m", userId, fromDateIso],
    queryFn: () =>
      userId
        ? api.getSwimmerPerformances({ userId, fromDate: fromDateIso })
        : Promise.resolve([]),
    enabled: !!userId,
  });

  const rows = useMemo(
    () => competitionObjectives.map((o) => computeObjectivePerfRow(o, perfs)),
    [competitionObjectives, perfs],
  );

  if (competitionObjectives.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-card p-4">
        <div className="flex items-center gap-2 mb-2">
          <Target className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold">Mes objectifs</h2>
        </div>
        <p className="text-xs text-muted-foreground">
          Aucun objectif défini sur cette compétition.{" "}
          <button
            onClick={() => navigate("/profile?section=objectives")}
            className="underline hover:text-foreground"
          >
            En définir un
          </button>
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-card p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Target className="h-4 w-4 text-muted-foreground" />
        <h2 className="text-sm font-semibold">Mes objectifs</h2>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-muted-foreground border-b border-border">
              <th className="text-left font-medium pb-2 pr-3">Épreuve</th>
              <th className="text-right font-medium pb-2 pr-3">Cible</th>
              <th className="text-right font-medium pb-2 pr-3">PB 12 mois</th>
              <th className="text-right font-medium pb-2">Δ</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.objectiveId} className="border-b border-border last:border-0">
                <td className="py-2 pr-3">{r.eventCode ? eventLabel(r.eventCode) : (r.text ?? "—")}</td>
                <td className="py-2 pr-3 text-right tabular-nums">
                  {r.targetSeconds != null ? formatTime(r.targetSeconds) : "—"}
                </td>
                <td className="py-2 pr-3 text-right tabular-nums">
                  {r.pbSeconds != null ? formatTime(r.pbSeconds) : "—"}
                </td>
                <td
                  className={`py-2 text-right tabular-nums ${
                    r.deltaSeconds == null
                      ? "text-muted-foreground"
                      : r.deltaSeconds > 0
                        ? "text-rose-600 dark:text-rose-400"
                        : "text-emerald-600 dark:text-emerald-400"
                  }`}
                >
                  {r.deltaSeconds == null
                    ? "—"
                    : `${r.deltaSeconds > 0 ? "+" : ""}${r.deltaSeconds.toFixed(2)}`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
```

### Step 4.2: Vérifier le typecheck

Run: `npx tsc --noEmit`
Expected: 0 nouvelle erreur.

### Step 4.3: Commit

```bash
git add src/components/competition/InfoMyObjectives.tsx
git commit -m "feat(competition-info): InfoMyObjectives section component

Tableau objectifs + PB 12 mois glissants avec delta vs cible. Utilise
les helpers purs computeObjectivePerfRow + queries react-query partagées
avec le reste de l'app (clés my-objectives, swimmer-performances-rolling-12m).

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 5: Component `InfoParticipants.tsx`

**Goal:** Composant React qui rend la liste des participants avec mini-stats (badge nb objectifs).

**Files:**
- Create: `src/components/competition/InfoParticipants.tsx`

### Step 5.1: Implémenter le composant

```tsx
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { api } from "@/lib/api";
import { groupAndSortAssignments, type ParticipantProfile } from "./info-helpers";
import { Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface Props {
  competitionId: string;
}

export default function InfoParticipants({ competitionId }: Props) {
  const [, navigate] = useLocation();

  const { data: assignments = [] } = useQuery({
    queryKey: ["competition-assignments", competitionId],
    queryFn: () => api.getCompetitionAssignments(competitionId),
  });

  const { data: profiles = [] } = useQuery({
    queryKey: ["all-user-profiles"],
    queryFn: () => api.getUserProfiles({}),
  });

  const { data: objectives = [] } = useQuery({
    queryKey: ["competition-objectives", competitionId],
    queryFn: () => api.getObjectivesByCompetition(competitionId),
  });

  const profilesByUserId = useMemo(() => {
    const map = new Map<number, ParticipantProfile>();
    for (const p of profiles) {
      map.set(p.user_id, {
        user_id: p.user_id,
        display_name: p.display_name ?? `Nageur ${p.user_id}`,
        group_label: p.group_label ?? null,
        avatar_url: p.avatar_url ?? null,
      });
    }
    return map;
  }, [profiles]);

  const objectivesByAthlete = useMemo(() => {
    const map = new Map<number, number>();
    for (const o of objectives) {
      const id = Number(o.athlete_id);
      if (Number.isFinite(id)) {
        map.set(id, (map.get(id) ?? 0) + 1);
      }
    }
    return map;
  }, [objectives]);

  const rows = useMemo(
    () => groupAndSortAssignments(assignments, profilesByUserId, objectivesByAthlete),
    [assignments, profilesByUserId, objectivesByAthlete],
  );

  return (
    <div className="rounded-xl border border-border bg-card p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Users className="h-4 w-4 text-muted-foreground" />
        <h2 className="text-sm font-semibold">
          Nageurs participants ({rows.length})
        </h2>
      </div>

      {rows.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          Aucun nageur assigné pour le moment.
        </p>
      ) : (
        <ul className="divide-y divide-border">
          {rows.map((row) => (
            <li key={row.athleteId}>
              <button
                type="button"
                onClick={() => navigate(`/profile/${row.athleteId}`)}
                className="w-full flex items-center gap-3 py-2 hover:bg-muted/40 rounded-md px-2 -mx-2 transition"
              >
                <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center overflow-hidden shrink-0">
                  {row.avatarUrl ? (
                    <img src={row.avatarUrl} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <span className="text-[10px] font-medium text-muted-foreground">
                      {row.displayName.slice(0, 2).toUpperCase()}
                    </span>
                  )}
                </div>
                <div className="min-w-0 flex-1 text-left">
                  <p className="text-xs font-medium truncate">{row.displayName}</p>
                  <p className="text-[10px] text-muted-foreground truncate">{row.groupLabel}</p>
                </div>
                {row.objectivesCount > 0 ? (
                  <Badge variant="secondary" className="text-[10px] shrink-0">
                    {row.objectivesCount} obj
                  </Badge>
                ) : (
                  <span className="text-[10px] text-muted-foreground shrink-0">—</span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
```

### Step 5.2: Vérifier les exports API utilisés

Run: `grep -n "getUserProfiles\|getObjectivesByCompetition" src/lib/api/index.ts src/lib/api.ts`

Si `getObjectivesByCompetition` n'existe pas, l'ajouter dans `src/lib/api/objectives.ts` :

```ts
export async function getObjectivesByCompetition(competitionId: string): Promise<Objective[]> {
  if (!canUseSupabase()) return [];
  const { data, error } = await supabase
    .from("objectives")
    .select("*")
    .eq("competition_id", competitionId);
  if (error) throw new Error(error.message);
  return (data ?? []).map((row: any) => ({
    id: row.id,
    athlete_id: row.athlete_id,
    competition_id: row.competition_id,
    event_code: row.event_code,
    pool_length: row.pool_length,
    target_time_seconds: row.target_time_seconds != null ? Number(row.target_time_seconds) : null,
    text: row.text,
    created_by: row.created_by,
    created_at: row.created_at,
  })) as Objective[];
}
```

Et l'exporter via `src/lib/api/index.ts` (ajouter à la liste des exports `objectives`) ainsi que dans `src/lib/api.ts` si la façade legacy est utilisée.

Pour `getUserProfiles`, vérifier qu'elle existe (sinon, examiner `src/lib/api/users.ts` L25-30 pour la signature exacte). Si la signature attend `{ groupId? }`, passer `{}` est OK.

### Step 5.3: Type check

Run: `npx tsc --noEmit`
Expected: 0 nouvelle erreur.

### Step 5.4: Commit

```bash
git add src/components/competition/InfoParticipants.tsx src/lib/api/objectives.ts src/lib/api/index.ts src/lib/api.ts
git commit -m "feat(competition-info): InfoParticipants section component + getObjectivesByCompetition

Liste compacte des nageurs assignés au meet avec badge objectifs et
navigation tap → /profile/:id. Trie groupe ASC → nom ASC, bucket
'Sans groupe' en queue. Nouveau helper API getObjectivesByCompetition
pour agréger le compteur par athlète.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 6: Réécrire `CompetitionDetail.tsx` (vue info)

**Goal:** Remplacer l'ancien composant tabs (déjà déplacé en Task 1) par la nouvelle vue info qui orchestre header + section rôle + CTA.

**Files:**
- Create: `src/pages/CompetitionDetail.tsx`
- Modify: `src/App.tsx` (mettre à jour le mapping des routes)

### Step 6.1: Créer le nouveau composant

```tsx
import { useMemo } from "react";
import { useRoute, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import InfoMyObjectives from "@/components/competition/InfoMyObjectives";
import InfoParticipants from "@/components/competition/InfoParticipants";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowLeft, ArrowRight, Trophy, MapPin, CalendarDays } from "lucide-react";

function formatDate(iso: string): string {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
}

function formatDateRange(start: string, end?: string | null): string {
  if (!end || end === start) return formatDate(start);
  const s = new Date(start + "T00:00:00");
  const e = new Date(end + "T00:00:00");
  if (s.getMonth() === e.getMonth() && s.getFullYear() === e.getFullYear()) {
    return `${s.getDate()} – ${e.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })}`;
  }
  return `${formatDate(start)} – ${formatDate(end)}`;
}

function daysUntil(iso: string): number {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const target = new Date(iso + "T00:00:00");
  return Math.round((target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

function countdownBadge(days: number): { label: string; variant: "default" | "secondary" | "outline" } {
  if (days < 0) return { label: "Terminée", variant: "outline" };
  if (days === 0) return { label: "Aujourd'hui", variant: "default" };
  return { label: `J-${days}`, variant: "secondary" };
}

export default function CompetitionDetail() {
  const [, params] = useRoute("/competition/:id");
  const [, navigate] = useLocation();
  const competitionId = params?.id ?? null;

  const user = useAuth((s) => s.user);
  const userId = useAuth((s) => s.userId);
  const role = user?.role ?? "athlete";

  const { data: competitions = [] } = useQuery({
    queryKey: ["competitions"],
    queryFn: () => api.getCompetitions(),
  });

  const competition = useMemo(
    () => competitions.find((c) => c.id === competitionId) ?? null,
    [competitions, competitionId],
  );

  const days = competition ? daysUntil(competition.date) : null;
  const badge = days != null ? countdownBadge(days) : null;

  if (!competition) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-4">
        <button
          type="button"
          onClick={() => navigate("/")}
          className="h-9 w-9 rounded-xl border border-border bg-card flex items-center justify-center hover:bg-muted transition"
          aria-label="Retour"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div className="mt-8 text-center">
          <Trophy className="mx-auto h-10 w-10 text-muted-foreground/40" />
          <p className="mt-3 text-sm font-medium">Compétition introuvable</p>
          <p className="mt-1 text-xs text-muted-foreground">Elle a peut-être été supprimée.</p>
        </div>
      </div>
    );
  }

  const isAthlete = role === "athlete";

  return (
    <div className="mx-auto max-w-3xl px-4 py-4 pb-28 space-y-4">
      {/* Header */}
      <div className="flex items-start gap-3">
        <button
          type="button"
          onClick={() => (window.history.length > 1 ? window.history.back() : navigate("/"))}
          className="mt-0.5 h-9 w-9 rounded-xl border border-border bg-card flex items-center justify-center hover:bg-muted transition shrink-0"
          aria-label="Retour"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>

        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="flex items-start gap-2 flex-wrap">
            <h1 className="text-lg font-bold">{competition.name}</h1>
            {badge && (
              <Badge variant={badge.variant} className="text-[10px] px-2 py-0.5 shrink-0">
                {badge.label}
              </Badge>
            )}
          </div>

          <div className="flex items-center gap-3 flex-wrap text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <CalendarDays className="h-3 w-3" />
              {formatDateRange(competition.date, competition.end_date)}
            </span>
            {competition.location && (
              <span className="flex items-center gap-1">
                <MapPin className="h-3 w-3" />
                {competition.location}
              </span>
            )}
          </div>

          {competition.description && (
            <p className="text-xs text-muted-foreground/80">{competition.description}</p>
          )}
        </div>
      </div>

      {/* Section adaptée au rôle */}
      {isAthlete ? (
        <InfoMyObjectives
          competitionId={competition.id}
          userId={userId ?? null}
          userUuid={user?.id ?? null}
        />
      ) : (
        <InfoParticipants competitionId={competition.id} />
      )}

      {/* Sticky CTA */}
      <div className="fixed bottom-0 left-0 right-0 border-t border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 px-4 py-3 z-10">
        <div className="mx-auto max-w-3xl">
          <Button
            type="button"
            className="w-full h-11"
            onClick={() => navigate(`/competition/${competition.id}/prep`)}
          >
            Préparer la compétition
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
```

### Step 6.2: Mettre à jour `App.tsx`

Modifier `src/App.tsx` :
- Ajouter `import CompetitionDetail from "@/pages/CompetitionDetail";` (en plus de l'import `CompetitionPrep` ajouté en Task 1).
- Remplacer la route `<Route path="/competition/:id" component={CompetitionPrep} />` par `<Route path="/competition/:id" component={CompetitionDetail} />`.
- Garder `<Route path="/competition/:id/prep" component={CompetitionPrep} />` placée AVANT (plus spécifique).

### Step 6.3: Type check

Run: `npx tsc --noEmit`
Expected: 0 nouvelle erreur.

### Step 6.4: Smoke test manuel

Run: `npm run dev`
- `/#/competition/<id>` → vue info (header + section + CTA sticky).
- Click CTA → `/#/competition/<id>/prep` → tabs prep.
- Tab nageur (login en `athlete`) : vérifier la section objectifs.
- Tab coach (login en `coach`) : vérifier la liste participants.

### Step 6.5: Commit

```bash
git add src/pages/CompetitionDetail.tsx src/App.tsx
git commit -m "feat(competition-info): vue info devient la landing au tap sur la bannière

/competition/:id rend désormais la vue info (header + section adaptée
au rôle + CTA Préparer). /competition/:id/prep continue de pointer
sur les tabs prep existants.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 7: Ajuster le back arrow de `CompetitionPrep`

**Goal:** Quand l'utilisateur arrive sur `/prep` depuis l'info view et tape Back, on revient à l'info — pas à la page d'avant l'info (sinon double back nécessaire).

**Files:**
- Modify: `src/pages/CompetitionPrep.tsx`

### Step 7.1: Modifier le handler back

Dans `src/pages/CompetitionPrep.tsx`, repérer le bouton back (~ligne 222-228) :

```tsx
onClick={() => window.history.length > 1 ? window.history.back() : navigate("/")}
```

Le remplacer par :

```tsx
onClick={() => navigate(`/competition/${competition.id}`)}
```

Ainsi le back de `prep` ramène toujours à l'info de la même compétition.

### Step 7.2: Smoke test

Run: `npm run dev`
- Aller sur info → tap CTA → prep → tap back → retour sur info.

### Step 7.3: Commit

```bash
git add src/pages/CompetitionPrep.tsx
git commit -m "refactor(competition-prep): back arrow → /competition/:id (vue info)

Préserve la chaîne info → prep → info (1 tap back au lieu de 2 ou
écran d'avant l'info).

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 8: Vérification finale + documentation

**Goal:** Type check propre, suite de tests verte, docs mises à jour.

**Files:**
- Modify: `CLAUDE.md` (ligne § Chantiers — ajouter §191 + déplacer §190-ui3)
- Modify: `docs/ROADMAP.md` (ajouter ligne)
- Modify: `docs/FEATURES_STATUS.md` (statut compétition — déjà ✅, mais affiner)
- Modify: `docs/implementation-log.md` (ajouter §191)
- Modify: `docs/claude/files-map.md` (ajouter 4 nouveaux fichiers + maj CompetitionPrep/CompetitionDetail)

### Step 8.1: Type check global

Run: `npx tsc --noEmit`
Expected: seules les erreurs pré-existantes des `*.stories.tsx` (cf. MEMORY.md).

### Step 8.2: Suite de tests

Run: `npm test`
Expected: les nouveaux tests passent ; régressions = 0 (le test pré-existant `transformers.test.ts` peut continuer de fail — non lié, cf. MEMORY.md).

### Step 8.3: Tests RLS

Pas de modif RLS dans ce chantier (juste UI + helpers purs + queries via API existantes). **NE PAS lancer `npm run test:rls`** (cf. CLAUDE.md § "Tests RLS intégration").

### Step 8.4: Mesurer les LOC des nouveaux fichiers

Run:
```bash
wc -l src/components/competition/info-helpers.ts src/components/competition/InfoMyObjectives.tsx src/components/competition/InfoParticipants.tsx src/pages/CompetitionDetail.tsx src/pages/CompetitionPrep.tsx
```

Noter les valeurs réelles pour la doc.

### Step 8.5: Mettre à jour `docs/claude/files-map.md`

Ajouter ces lignes (ajuster les chiffres exacts mesurés au step 8.4) :
- `src/components/competition/info-helpers.ts` — Helpers purs `computeObjectivePerfRow` + `groupAndSortAssignments` + types associés. (~100 LOC)
- `src/components/competition/InfoMyObjectives.tsx` — Section nageur de la vue info compétition : table objectifs + PB 12 mois glissants. (~120 LOC)
- `src/components/competition/InfoParticipants.tsx` — Section coach/comité de la vue info compétition : liste participants triée groupe puis nom, badge objectifs. (~105 LOC)

Mettre à jour la ligne existante :
- `src/pages/CompetitionDetail.tsx` — **Vue info compétition** (header + section adaptée au rôle + CTA Préparer). Ancienne version (tabs prep) déplacée vers `CompetitionPrep.tsx`. (~150 LOC)

Ajouter :
- `src/pages/CompetitionPrep.tsx` — Tabs préparation compétition (Check, Courses, Routines, Jour J). Ancienne version de `CompetitionDetail.tsx` renommée. (~325 LOC, inchangé)

### Step 8.6: Mettre à jour `docs/implementation-log.md`

Ajouter une entrée §191 avec contexte, changements, fichiers modifiés, tests, décisions, limites (suivre le format des entrées récentes).

### Step 8.7: Mettre à jour `docs/ROADMAP.md`

Ajouter la ligne §191 dans la section appropriée + maj la date "Dernière mise à jour".

### Step 8.8: Mettre à jour `CLAUDE.md` § Chantiers

- Mettre à jour la phrase "Dernière entrée en date : §191 (Vue info compétition — ...)".
- Pousser §190-ui3 en "Précédente :".
- Garder un résumé court mais informatif (~200 mots) du chantier §191.

### Step 8.9: Commit final

```bash
git add CLAUDE.md docs/ROADMAP.md docs/implementation-log.md docs/claude/files-map.md docs/FEATURES_STATUS.md
git commit -m "docs(§191): vue info compétition — annuaire + log + roadmap

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Récap final

8 commits :
1. Refactor file move (CompetitionDetail → CompetitionPrep, route alias).
2. Helper `computeObjectivePerfRow` + tests.
3. Helper `groupAndSortAssignments` + tests.
4. Composant `InfoMyObjectives`.
5. Composant `InfoParticipants` + `getObjectivesByCompetition`.
6. Nouveau `CompetitionDetail` (vue info) + maj routes.
7. Back arrow `CompetitionPrep` → info.
8. Documentation §191.

**Touchpoints externes** (fichiers existants modifiés) : `src/App.tsx`, `src/pages/CompetitionPrep.tsx` (back arrow), `src/lib/api/objectives.ts`, `src/lib/api/index.ts`, `src/lib/api.ts`. Aucune migration DB. Aucun test RLS impacté.

## Execution Handoff

**Two execution options:**

1. **Subagent-Driven (this session)** — I dispatch fresh subagent per task, review between tasks, fast iteration.
2. **Parallel Session (separate)** — Open new session with executing-plans, batch execution with checkpoints.

**Which approach?**
