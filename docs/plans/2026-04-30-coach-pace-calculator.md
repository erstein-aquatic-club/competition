# Coach Pace Calculator + "Mon équipe" Refactor — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task-by-task.

**Goal:** Build a coach-facing pace calculator with a per-swimmer, per-stroke target → matrix view, and centralize manual swimmer creation in the existing "Mes nageurs" screen (which becomes "Mon équipe").

**Architecture:** Three concentric rings. Innermost = pure pace math (`paceCalculator.ts`). Middle = data access (Supabase tables `coach_pace_targets`, `coach_pace_zones`; extension of `coach_manual_swimmers`; shared hook `useMyTeam`). Outer = UI (refactored `CoachMySwimmersScreen` + new `CoachPaceCalculatorScreen` + `ChronoSetup` consuming the shared hook).

**Tech Stack:** React 19, TypeScript, Vite, Tailwind, Radix/Shadcn, Zustand, React Query 5, Wouter, Vitest, Supabase (PostgreSQL + RLS), MCP Supabase plugin for migrations.

**Reference design:** `docs/plans/2026-04-30-coach-pace-calculator-design.md` (committed `fb091f27f`).

**Key conventions (read before starting):**
- Migrations: numbered `00148_*.sql`, applied via MCP (`mcp__plugin_supabase_supabase__apply_migration`), **never via `supabase db push` or dashboard**. Project ID `fscnobivsgornxdwqwlk`.
- RLS: use `app_user_role()` / `app_user_id()` helpers, **not** `auth.uid()` directly in subqueries.
- API modules live in `src/lib/api/<name>.ts`; re-exported via `src/lib/api/index.ts` and aggregated façade `src/lib/api.ts`.
- Tests: Vitest (`npm test`), type check (`npx tsc --noEmit`), RLS integration tests (`npm run test:rls`, requires Docker).
- Coach sections registered in `src/pages/Coach.tsx` switch on `activeSection`. Routes are hash-based: `/#/coach?section=<name>`.
- Strokes used in app: `NL`, `Dos`, `Brasse`, `Pap`, `4N` (also `NAC`, `Spé` exist but are out of scope here).
- After implementation, update `docs/implementation-log.md`, `docs/ROADMAP.md`, `docs/FEATURES_STATUS.md`, `CLAUDE.md` (per workflow in `CLAUDE.md` § "Workflow de documentation obligatoire"), and `docs/claude/files-map.md` for new ≥150 LOC files.

**Worktree:** Recommend running this plan in a dedicated worktree (`@superpowers:using-git-worktrees`) named `chantier/184-coach-pace-calculator`.

**TDD order:** Pure logic first (no Docker needed), then API + hook, then UI. RLS tests batch at the end with one Docker startup.

---

## Phase 1 — Pure pace math (no DB, no UI)

### Task 1: Pure pace calculator — types + zone defaults

**Files:**
- Create: `src/lib/paceCalculator.ts`
- Test: `src/__tests__/paceCalculator.test.ts`

**Step 1: Write the failing test**

```ts
// src/__tests__/paceCalculator.test.ts
import { describe, it, expect } from "vitest";
import {
  DEFAULT_ZONES,
  type Stroke,
  type Zone,
  type ZoneConfig,
} from "../lib/paceCalculator";

describe("paceCalculator — types & defaults", () => {
  it("DEFAULT_ZONES has the agreed % values", () => {
    expect(DEFAULT_ZONES).toEqual({
      v0_pct: 140,
      v1_pct: 130,
      v2_pct: 115,
      v3_pct: 110,
      max_pct: 105,
    });
  });

  it("DEFAULT_ZONES respects ordering V0 ≥ V1 ≥ V2 ≥ V3 ≥ Max", () => {
    const z = DEFAULT_ZONES;
    expect(z.v0_pct).toBeGreaterThanOrEqual(z.v1_pct);
    expect(z.v1_pct).toBeGreaterThanOrEqual(z.v2_pct);
    expect(z.v2_pct).toBeGreaterThanOrEqual(z.v3_pct);
    expect(z.v3_pct).toBeGreaterThanOrEqual(z.max_pct);
  });
});
```

**Step 2: Run — expect FAIL**

```bash
npx vitest run src/__tests__/paceCalculator.test.ts
```
Expected: FAIL "Cannot find module ... paceCalculator".

**Step 3: Minimal implementation**

```ts
// src/lib/paceCalculator.ts
export type Stroke = "NL" | "Dos" | "Brasse" | "Pap" | "4N";
export type Zone = "V0" | "V1" | "V2" | "V3" | "Max";

export interface ZoneConfig {
  v0_pct: number;
  v1_pct: number;
  v2_pct: number;
  v3_pct: number;
  max_pct: number;
}

export const DEFAULT_ZONES: ZoneConfig = {
  v0_pct: 140,
  v1_pct: 130,
  v2_pct: 115,
  v3_pct: 110,
  max_pct: 105,
};
```

**Step 4: Run — expect PASS**

```bash
npx vitest run src/__tests__/paceCalculator.test.ts
```

**Step 5: Commit**

```bash
git add src/lib/paceCalculator.ts src/__tests__/paceCalculator.test.ts
git commit -m "feat(pace): scaffold pure paceCalculator types and zone defaults"
```

---

### Task 2: `pacePer100m` + `zoneTime`

**Files:**
- Modify: `src/lib/paceCalculator.ts`
- Modify: `src/__tests__/paceCalculator.test.ts`

**Step 1: Add failing tests**

Append to `src/__tests__/paceCalculator.test.ts`:

```ts
import { pacePer100m, zoneTime } from "../lib/paceCalculator";

describe("pacePer100m", () => {
  it("100m in 65s → 65 000 ms / 100m", () => {
    expect(pacePer100m(65_000, 100)).toBe(65_000);
  });
  it("200m in 130s → 65 000 ms / 100m", () => {
    expect(pacePer100m(130_000, 200)).toBe(65_000);
  });
  it("50m in 27s → 54 000 ms / 100m", () => {
    expect(pacePer100m(27_000, 50)).toBe(54_000);
  });
  it("throws on non-positive distance", () => {
    expect(() => pacePer100m(60_000, 0)).toThrow();
    expect(() => pacePer100m(60_000, -50)).toThrow();
  });
});

describe("zoneTime", () => {
  it("at 100m on a 65s/100m pace at 105% (Max) → 68 250 ms", () => {
    expect(zoneTime(100, 65_000, 105)).toBe(68_250);
  });
  it("at 50m on a 65s/100m pace at 110% (V3) → 35 750 ms", () => {
    expect(zoneTime(50, 65_000, 110)).toBe(35_750);
  });
  it("at 25m on a 65s/100m pace at 140% (V0) → 22 750 ms", () => {
    expect(zoneTime(25, 65_000, 140)).toBe(22_750);
  });
  it("V0 always > V1 > V2 > V3 > Max in time at any distance", () => {
    const pace = 65_000;
    const t = (p: number) => zoneTime(50, pace, p);
    const z = DEFAULT_ZONES;
    expect(t(z.v0_pct)).toBeGreaterThan(t(z.v1_pct));
    expect(t(z.v1_pct)).toBeGreaterThan(t(z.v2_pct));
    expect(t(z.v2_pct)).toBeGreaterThan(t(z.v3_pct));
    expect(t(z.v3_pct)).toBeGreaterThan(t(z.max_pct));
  });
});
```

**Step 2: Run — expect FAIL**

```bash
npx vitest run src/__tests__/paceCalculator.test.ts
```

**Step 3: Implement**

Append to `src/lib/paceCalculator.ts`:

```ts
export function pacePer100m(targetTimeMs: number, targetDistanceM: number): number {
  if (targetDistanceM <= 0) {
    throw new Error("targetDistanceM must be > 0");
  }
  return Math.round((targetTimeMs * 100) / targetDistanceM);
}

export function zoneTime(distanceM: number, pacePer100mMs: number, zonePct: number): number {
  return Math.round((pacePer100mMs * distanceM * zonePct) / (100 * 100));
}
```

**Step 4: Run — expect PASS.**

**Step 5: Commit**

```bash
git add src/lib/paceCalculator.ts src/__tests__/paceCalculator.test.ts
git commit -m "feat(pace): pacePer100m + zoneTime pure helpers with bounds checks"
```

---

### Task 3: `getDistanceRows` mapping

**Files:**
- Modify: `src/lib/paceCalculator.ts`
- Modify: `src/__tests__/paceCalculator.test.ts`

**Step 1: Add failing tests**

```ts
import { getDistanceRows } from "../lib/paceCalculator";

describe("getDistanceRows", () => {
  // Single-stroke events (NL/Dos/Brasse/Pap)
  it.each([
    [50,   ["NL", "Dos", "Brasse", "Pap"], [15, 20, 25, 50]],
    [100,  ["NL", "Dos", "Brasse", "Pap"], [15, 25, 50, 75, 100]],
    [200,  ["NL", "Dos", "Brasse", "Pap"], [25, 50, 100, 150, 200]],
    [400,  ["NL"],                          [50, 100, 200, 300, 400]],
    [800,  ["NL"],                          [100, 200, 400, 600, 800]],
    [1500, ["NL"],                          [100, 200, 400, 800, 1200, 1500]],
  ])("distance %i for %j strokes returns %j", (dist, strokes, expected) => {
    for (const stroke of strokes as Array<"NL"|"Dos"|"Brasse"|"Pap">) {
      expect(getDistanceRows(dist, stroke)).toEqual(expected);
    }
  });

  // 4N
  it.each([
    [100, [25, 50, 75, 100]],
    [200, [50, 100, 150, 200]],
    [400, [100, 200, 300, 400]],
  ])("4N distance %i returns %j", (dist, expected) => {
    expect(getDistanceRows(dist, "4N")).toEqual(expected);
  });

  it("returns empty array for unsupported (distance, stroke) combo", () => {
    expect(getDistanceRows(50, "4N")).toEqual([]);
    expect(getDistanceRows(800, "Brasse")).toEqual([]);
  });
});
```

**Step 2: Run — expect FAIL.**

**Step 3: Implement**

Append to `src/lib/paceCalculator.ts`:

```ts
const ROWS_BY_DIST_SINGLE: Record<number, number[]> = {
  50:   [15, 20, 25, 50],
  100:  [15, 25, 50, 75, 100],
  200:  [25, 50, 100, 150, 200],
  400:  [50, 100, 200, 300, 400],
  800:  [100, 200, 400, 600, 800],
  1500: [100, 200, 400, 800, 1200, 1500],
};

const ROWS_BY_DIST_4N: Record<number, number[]> = {
  100: [25, 50, 75, 100],
  200: [50, 100, 150, 200],
  400: [100, 200, 300, 400],
};

export function getDistanceRows(targetDistanceM: number, stroke: Stroke): number[] {
  if (stroke === "4N") return ROWS_BY_DIST_4N[targetDistanceM] ?? [];
  return ROWS_BY_DIST_SINGLE[targetDistanceM] ?? [];
}
```

**Step 4: Run — expect PASS.**

**Step 5: Commit**

```bash
git add src/lib/paceCalculator.ts src/__tests__/paceCalculator.test.ts
git commit -m "feat(pace): getDistanceRows mapping per design §3.5"
```

---

### Task 4: `formatPaceTime` + `parsePaceTime`

**Files:**
- Modify: `src/lib/paceCalculator.ts`
- Modify: `src/__tests__/paceCalculator.test.ts`

**Step 1: Add failing tests**

```ts
import { formatPaceTime, parsePaceTime } from "../lib/paceCalculator";

describe("formatPaceTime", () => {
  it("under 1 min → ss.x", () => {
    expect(formatPaceTime(45_500)).toBe("45.5");
    expect(formatPaceTime(8_300)).toBe("8.3");
  });
  it("≥ 1 min → m:ss.x with zero-padded seconds", () => {
    expect(formatPaceTime(65_400)).toBe("1:05.4");
    expect(formatPaceTime(125_900)).toBe("2:05.9");
    expect(formatPaceTime(600_000)).toBe("10:00.0");
  });
  it("rounds half-up to nearest 100 ms", () => {
    expect(formatPaceTime(65_449)).toBe("1:05.4");
    expect(formatPaceTime(65_450)).toBe("1:05.5");
  });
});

describe("parsePaceTime", () => {
  it.each([
    ["1:05",     65_000],
    ["1:05.4",   65_400],
    ["01:05.40", 65_400],
    ["65.4",     65_400],
    ["65",       65_000],
    [" 1:05.4 ", 65_400],
  ])("parses %s → %i ms", (s, ms) => {
    expect(parsePaceTime(s)).toBe(ms);
  });

  it("returns null on invalid input", () => {
    expect(parsePaceTime("")).toBeNull();
    expect(parsePaceTime("abc")).toBeNull();
    expect(parsePaceTime("1:60")).toBeNull(); // seconds out of range
    expect(parsePaceTime("-1")).toBeNull();
  });
});
```

**Step 2: Run — expect FAIL.**

**Step 3: Implement**

```ts
export function formatPaceTime(ms: number): string {
  const rounded = Math.round(ms / 100) * 100;
  const totalSeconds = rounded / 1000;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds - minutes * 60;
  if (minutes === 0) {
    return seconds.toFixed(1);
  }
  return `${minutes}:${seconds.toFixed(1).padStart(4, "0")}`;
}

const PACE_RE = /^(?:(\d{1,2}):)?(\d{1,2})(?:\.(\d{1,2}))?$/;

export function parsePaceTime(input: string): number | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  const m = trimmed.match(PACE_RE);
  if (!m) return null;
  const minutes = m[1] ? parseInt(m[1], 10) : 0;
  const seconds = parseInt(m[2], 10);
  const decimals = m[3] ? parseInt(m[3].padEnd(2, "0").slice(0, 2), 10) : 0;
  if (seconds >= 60) return null;
  if (minutes < 0 || seconds < 0 || decimals < 0) return null;
  return minutes * 60_000 + seconds * 1_000 + decimals * 10;
}
```

**Step 4: Run — expect PASS, also `npx tsc --noEmit` clean.**

**Step 5: Commit**

```bash
git add src/lib/paceCalculator.ts src/__tests__/paceCalculator.test.ts
git commit -m "feat(pace): formatPaceTime + parsePaceTime with bounds + tests"
```

---

## Phase 2 — Database migration

### Task 5: Write migration `00148_pace_calculator_and_team.sql`

**Files:**
- Create: `supabase/migrations/00148_pace_calculator_and_team.sql`

Copy the SQL from design doc §4.1 verbatim into the migration file. Notable points:
- Use `CREATE POLICY ... USING ((SELECT auth.uid()) = coach_id)` pattern (consistent with existing `coach_manual_swimmers` policies).
- `coach_pace_targets` policy: prefer single FOR ALL policy (`coach_pace_targets_all_own`).
- Add the partial unique indexes (`uq_pace_targets_account` / `uq_pace_targets_manual`) — full-column UNIQUE doesn't work because of the NULL-XOR constraint.

**Step 1: Apply via MCP**

```
mcp__plugin_supabase_supabase__apply_migration
  project_id: fscnobivsgornxdwqwlk
  name: "00148_pace_calculator_and_team"
  query: <contents of the .sql file>
```

**Step 2: Verify in DB**

```
mcp__plugin_supabase_supabase__execute_sql
  query: |
    SELECT table_name FROM information_schema.tables
    WHERE table_schema='public'
      AND table_name IN ('coach_pace_targets','coach_pace_zones','pace_share_links');
    SELECT column_name FROM information_schema.columns
    WHERE table_schema='public' AND table_name='coach_manual_swimmers'
    ORDER BY ordinal_position;
```

Expected: 3 rows for the new tables; `coach_manual_swimmers` columns include `birthdate`, `sex`.

**Step 3: Commit**

```bash
git add supabase/migrations/00148_pace_calculator_and_team.sql
git commit -m "feat(db): 00148 — pace calculator tables + manual swimmers extension

- coach_pace_targets (cibles par coach × nageur × nage × distance)
- coach_pace_zones (override % zones par coach)
- pace_share_links (token public lecture seule)
- coach_manual_swimmers : +birthdate +sex + UPDATE policy"
```

---

### Task 6: Mirror migration in test schema

**Files:**
- Modify: `supabase/tests/schema.sql`

The RLS test harness has a hand-crafted minimal schema (per CLAUDE.md). Add the new tables + the column extensions so RLS tests can be written.

**Step 1: Append to `supabase/tests/schema.sql`**

```sql
-- ─── §184 pace calculator ─────────────────────────────────────
ALTER TABLE coach_manual_swimmers
  ADD COLUMN IF NOT EXISTS birthdate date,
  ADD COLUMN IF NOT EXISTS sex char(1) CHECK (sex IN ('M','F'));

DROP POLICY IF EXISTS "coach_manual_swimmers_update_own" ON coach_manual_swimmers;
CREATE POLICY "coach_manual_swimmers_update_own"
  ON coach_manual_swimmers FOR UPDATE
  USING (coach_id = (SELECT auth.uid()))
  WITH CHECK (coach_id = (SELECT auth.uid()));

CREATE TABLE IF NOT EXISTS coach_pace_zones ( ... );  -- copy from migration
ALTER TABLE coach_pace_zones ENABLE ROW LEVEL SECURITY;
-- ... policies ...

CREATE TABLE IF NOT EXISTS coach_pace_targets ( ... );  -- copy from migration
-- ... unique indexes + policy ...

CREATE TABLE IF NOT EXISTS pace_share_links ( ... );  -- copy from migration
-- ... policy ...
```

**Step 2: Commit**

```bash
git add supabase/tests/schema.sql
git commit -m "test(rls): mirror §184 schema in test harness"
```

---

## Phase 3 — API modules

### Task 7: `src/lib/api/pace-zones.ts` — read/upsert with default fallback

**Files:**
- Create: `src/lib/api/pace-zones.ts`
- Test: `src/lib/api/__tests__/pace-zones.test.ts`

**Step 1: Failing test**

> ⚠️ **Pattern obligatoire : `node:test` + `mock.module`, PAS Vitest.**
> `npm test` utilise `node --test --experimental-test-module-mocks`. Ne pas utiliser `vi.mock`/`vi.fn`/`expect`.
> Voir `src/lib/api/__tests__/assignments.test.ts` pour le pattern de référence.

```ts
// src/lib/api/__tests__/pace-zones.test.ts
import assert from "node:assert/strict";
import { describe, it, before, beforeEach } from "node:test";
import { mock } from "node:test";

let fromImpl: (...args: unknown[]) => unknown;
let getUserImpl: () => unknown;

before(async () => {
  const real = await import("../client.ts");
  mock.module("../client.ts", {
    namedExports: {
      ...real,
      canUseSupabase: () => true,
      supabase: {
        from: (...args: unknown[]) => fromImpl(...args),
        auth: { getUser: () => getUserImpl() },
      },
    },
  });
});

beforeEach(() => {
  fromImpl = () => { throw new Error("fromImpl not configured"); };
  getUserImpl = () => { throw new Error("getUserImpl not configured"); };
});

describe("pace-zones API", () => {
  it("returns DEFAULT_ZONES when no row exists", async () => {
    fromImpl = () => ({
      select: () => ({ maybeSingle: () => Promise.resolve({ data: null, error: null }) }),
    });
    const { getMyPaceZones } = await import("../pace-zones.ts");
    const { DEFAULT_ZONES } = await import("../../paceCalculator.ts");
    assert.deepEqual(await getMyPaceZones(), DEFAULT_ZONES);
  });

  it("returns the persisted row when present", async () => {
    const row = { v0_pct: 145, v1_pct: 132, v2_pct: 116, v3_pct: 111, max_pct: 106 };
    fromImpl = () => ({
      select: () => ({ maybeSingle: () => Promise.resolve({ data: row, error: null }) }),
    });
    const { getMyPaceZones } = await import("../pace-zones.ts");
    assert.deepEqual(await getMyPaceZones(), row);
  });

  it("upsertMyPaceZones calls supabase upsert with coach_id and onConflict", async () => {
    getUserImpl = () => Promise.resolve({ data: { user: { id: "coach-uuid" } } });
    let capturedRow: Record<string, unknown> | undefined;
    let capturedOpts: Record<string, unknown> | undefined;
    fromImpl = () => ({
      upsert: (row: unknown, opts: unknown) => {
        capturedRow = row as Record<string, unknown>;
        capturedOpts = opts as Record<string, unknown>;
        return { select: () => ({ single: () => Promise.resolve({ data: {}, error: null }) }) };
      },
    });
    const { upsertMyPaceZones } = await import("../pace-zones.ts");
    await upsertMyPaceZones({ v0_pct: 140, v1_pct: 130, v2_pct: 115, v3_pct: 110, max_pct: 105 });
    assert.equal(capturedRow?.coach_id, "coach-uuid");
    assert.equal(capturedRow?.v0_pct, 140);
    assert.equal(capturedOpts?.onConflict, "coach_id");
  });
});
```

**Step 2: Run — expect FAIL.**

**Step 3: Implement**

```ts
// src/lib/api/pace-zones.ts
import { supabase, canUseSupabase } from "./client";
import { DEFAULT_ZONES, type ZoneConfig } from "../paceCalculator";

export async function getMyPaceZones(): Promise<ZoneConfig> {
  if (!canUseSupabase()) return DEFAULT_ZONES;
  const { data, error } = await supabase
    .from("coach_pace_zones")
    .select("v0_pct, v1_pct, v2_pct, v3_pct, max_pct")
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? (data as ZoneConfig) : DEFAULT_ZONES;
}

export async function upsertMyPaceZones(zones: ZoneConfig): Promise<void> {
  if (!canUseSupabase()) throw new Error("Supabase not available");
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Non authentifié");
  const { error } = await supabase
    .from("coach_pace_zones")
    .upsert({ coach_id: user.id, ...zones, updated_at: new Date().toISOString() },
            { onConflict: "coach_id" })
    .select()
    .single();
  if (error) throw new Error(error.message);
}
```

**Step 4: Run — expect PASS.**

**Step 5: Commit**

```bash
git add src/lib/api/pace-zones.ts src/lib/api/__tests__/pace-zones.test.ts
git commit -m "feat(api): coach_pace_zones read/upsert with DEFAULT_ZONES fallback"
```

---

### Task 8: `src/lib/api/pace-targets.ts` — list/upsert/delete

**Files:**
- Create: `src/lib/api/pace-targets.ts`
- Test: `src/lib/api/__tests__/pace-targets.test.ts`

API surface :

```ts
export interface PaceTarget {
  id: string;
  coach_id: string;
  swimmer_account_id: number | null;
  swimmer_manual_id: string | null;
  stroke: Stroke;
  target_distance_m: number;
  target_time_ms: number;
  updated_at: string;
}
export type SwimmerRef =
  | { kind: "account"; accountId: number }
  | { kind: "manual"; manualId: string };

export async function listMyPaceTargets(): Promise<PaceTarget[]>;
export async function upsertPaceTarget(args: {
  swimmer: SwimmerRef;
  stroke: Stroke;
  target_distance_m: number;
  target_time_ms: number;
}): Promise<PaceTarget>;
export async function deletePaceTarget(id: string): Promise<void>;
```

**Step 1: Failing test** — write 3 tests covering list ordering, account vs manual upsert (correct conflict target), delete by id.

**Step 2: Implement** with `.upsert({...}, { onConflict: "coach_id,swimmer_account_id,stroke,target_distance_m" })` for accounts and the manual variant for manuals. Use the partial unique indexes.

**Step 3: Commit**

```bash
git commit -m "feat(api): coach_pace_targets list/upsert/delete (account + manual)"
```

---

### Task 9: Extend `src/lib/api/coach-manual-swimmers.ts` with update + new fields

**Files:**
- Modify: `src/lib/api/coach-manual-swimmers.ts`
- Modify: `src/lib/api/__tests__/coach-manual-swimmers.test.ts` (create if missing)

Add `birthdate?: string | null`, `sex?: "M" | "F" | null` to `CoachManualSwimmer` interface. Add:

```ts
export async function updateManualSwimmer(
  id: string,
  patch: { displayName?: string; birthdate?: string | null; sex?: "M" | "F" | null },
): Promise<CoachManualSwimmer>;
```

Update `createManualSwimmer` signature to accept the optional fields.

**Step 1-4:** TDD with mocked supabase.
**Step 5: Commit**

```bash
git commit -m "feat(api): coach_manual_swimmers — add birthdate/sex + update mutation"
```

---

### Task 10: `src/lib/api/pace-share.ts` + RPC for public read

**Files:**
- Modify: `supabase/migrations/00148_pace_calculator_and_team.sql` (add RPC at the end before commit; if migration already applied, do a follow-up `00149_pace_share_rpc.sql`)
- Create: `src/lib/api/pace-share.ts`
- Test: `src/lib/api/__tests__/pace-share.test.ts`

The RPC:

```sql
CREATE OR REPLACE FUNCTION get_pace_share_payload(token_in uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  link record;
  swimmer_name text;
  zones jsonb;
  targets jsonb;
BEGIN
  SELECT * INTO link FROM pace_share_links
   WHERE token = token_in AND expires_at > now();
  IF NOT FOUND THEN RETURN NULL; END IF;
  -- name
  IF link.swimmer_account_id IS NOT NULL THEN
    SELECT display_name INTO swimmer_name FROM users WHERE id = link.swimmer_account_id;
  ELSE
    SELECT display_name INTO swimmer_name FROM coach_manual_swimmers WHERE id = link.swimmer_manual_id;
  END IF;
  SELECT row_to_json(z)::jsonb INTO zones FROM coach_pace_zones z WHERE coach_id = link.coach_id;
  SELECT jsonb_agg(t) INTO targets FROM coach_pace_targets t
    WHERE coach_id = link.coach_id
      AND ((swimmer_account_id IS NOT NULL AND swimmer_account_id = link.swimmer_account_id)
        OR (swimmer_manual_id IS NOT NULL AND swimmer_manual_id = link.swimmer_manual_id));
  RETURN jsonb_build_object('swimmer_name', swimmer_name, 'zones', COALESCE(zones, '{}'::jsonb), 'targets', COALESCE(targets, '[]'::jsonb));
END;
$$;
GRANT EXECUTE ON FUNCTION get_pace_share_payload(uuid) TO anon, authenticated;
```

API:

```ts
export async function createPaceShareLink(swimmer: SwimmerRef): Promise<{ token: string; url: string }>;
export async function getPaceSharePayload(token: string): Promise<{ swimmer_name: string; zones: ZoneConfig; targets: PaceTarget[] } | null>;
```

**Step 5: Commit**

```bash
git commit -m "feat(api): pace_share_links + get_pace_share_payload RPC"
```

---

### Task 11: Re-export new APIs

**Files:**
- Modify: `src/lib/api/index.ts`
- Modify: `src/lib/api.ts` (façade — add stubs that delegate)

Re-export every new public symbol; add façade methods like `api.listMyPaceTargets()`, `api.upsertPaceTarget()`, `api.deletePaceTarget()`, `api.getMyPaceZones()`, `api.upsertMyPaceZones()`, `api.updateManualSwimmer()`, `api.createPaceShareLink()`, `api.getPaceSharePayload()`.

**Run:** `npx tsc --noEmit` (must pass).

**Commit:** `chore(api): re-export pace + manual swimmer mutations via façade`

---

## Phase 4 — `useMyTeam` hook

### Task 12: Hook + test

**Files:**
- Create: `src/hooks/useMyTeam.ts`
- Test: `src/hooks/__tests__/useMyTeam.test.tsx`

**Step 1: Failing test (using `@testing-library/react-hooks` style with React Query wrapper, mirror existing hook tests in repo)**

Cases:
- Returns `{ team: [], accounts: [], manuals: [], isLoading: true }` while loading.
- Joins `getMySwimmers()` IDs against `athletes` (passed via prop or read from cache).
- Sorts by `displayName` alpha (case-insensitive).
- Manuals come from `listManualSwimmers()` and produce `{ kind: "manual", id: "manual-<uuid>", displayName, sex, birthdate }`.
- Combined `team` = accounts + manuals, alpha sorted.

**Step 3: Implement** — uses React Query with two parallel queries, joins to athletes via either prop or `getAthleteSummaries()`.

```ts
export interface TeamMember {
  kind: "account" | "manual";
  id: string;
  accountId?: number;
  manualId?: string;
  displayName: string;
  birthdate?: string | null;
  sex?: "M" | "F" | null;
  avatarUrl?: string | null;
}
export function useMyTeam(allAthletes?: AthleteSummary[]): {
  team: TeamMember[];
  accounts: TeamMember[];
  manuals: TeamMember[];
  isLoading: boolean;
  error: Error | null;
};
```

**Step 5: Commit** `feat(hooks): useMyTeam — unified accounts + manuals for the connected coach`

---

## Phase 5 — Refactor `CoachMySwimmersScreen` (Mon équipe)

### Task 13: Add Tabs (Mon équipe / Disponibles), no behavior change yet

**Files:**
- Modify: `src/pages/coach/CoachMySwimmersScreen.tsx`
- Test: `src/pages/coach/__tests__/CoachMySwimmersScreen.test.tsx`

**Step 1: Test** — render the 2 tabs, default to "Mon équipe", switch to "Disponibles" reveals available swimmers.
**Step 2: Run — FAIL.**
**Step 3: Wrap existing two sections in `<Tabs>`, default value `team`.** Available swimmers section moves into the second tab.
**Step 5: Commit** `refactor(coach): MySwimmers — tabs Mon équipe / Disponibles`

---

### Task 14: Add manuals to "Mon équipe" tab via `useMyTeam`

**Files:** same as task 13.

**Step 1: Test** — manual swimmers from `useMyTeam()` show up in "Mon équipe" with a "sans compte" pill.
**Step 3: Implement** — replace `mySwimmers` derivation with `team.accounts` + `team.manuals`. Render a small `Badge` "Sans compte" for manuals.
**Commit** `refactor(coach): MySwimmers — render manual swimmers via useMyTeam`

---

### Task 15: "Ajouter un nageur sans compte" dialog

**Files:**
- Create: `src/components/coach/ManualSwimmerDialog.tsx`
- Modify: `src/pages/coach/CoachMySwimmersScreen.tsx`
- Test: `src/components/coach/__tests__/ManualSwimmerDialog.test.tsx`

Dialog fields: nom (required, trim), sexe (M/F radio), date de naissance (date input, optional). Validation: name ≥ 1 char trimmed, sex required.

On submit → `createManualSwimmer({ displayName, sex, birthdate })` → invalidate `["my-team"]` → close.

Wire CTA `[+ Ajouter un nageur sans compte]` at top of "Mon équipe" tab.

**Commit** `feat(coach): MySwimmers — dialog ajout nageur sans compte (nom/sexe/date)`

---

### Task 16: "Éditer / Supprimer" actions on manual swimmer rows

**Files:** same files as task 15 + reuse the dialog (in "edit" mode).

Add actions to manual rows: pencil icon → opens dialog prefilled (calls `updateManualSwimmer`), trash icon → AlertDialog confirm → `deleteManualSwimmer`. Optimistic invalidation.

**Commit** `feat(coach): MySwimmers — éditer / supprimer nageurs sans compte`

---

### Task 17: Deep-link `?action=new-manual` opens the dialog directly

**Files:**
- Modify: `src/pages/Coach.tsx` (forward URL params)
- Modify: `src/pages/coach/CoachMySwimmersScreen.tsx`

`useEffect` reads URLSearchParams; if `action=new-manual`, opens dialog and strips the query param.

**Test:** unit covering open-on-mount + cleanup of the param.
**Commit** `feat(coach): MySwimmers — deep-link ?action=new-manual ouvre le dialog`

---

## Phase 6 — Refactor `ChronoSetup`

### Task 18: Replace local manual CRUD with `useMyTeam`

**Files:**
- Modify: `src/components/chrono/ChronoSetup.tsx`
- Modify: `src/components/chrono/__tests__/ChronoSetup.test.tsx` (if exists, else create)

**Step 1: Test** — chrono shows manuals from `useMyTeam`, no longer triggers `createManualSwimmer` from inside the sheet.
**Step 3:** Remove the `manuals` and `new` tab content; keep the visual tab structure but relabel "Mon équipe" / "Tous les comptes". Add a CTA "Gérer mon équipe →" that routes to `/coach?section=swimmers&action=new-manual` (deep-link from task 17).

**Sanity:** Ensure no chrono regression — the kind="manual" payload still flows through to the chrono runs, just now the manuals come from React Query (not local state).

**Commit** `refactor(chrono): ChronoSetup consume useMyTeam, drop local manual CRUD`

---

## Phase 7 — Pace components (matrix + form)

### Task 19: `PaceMatrix` component

**Files:**
- Create: `src/components/coach/pace/PaceMatrix.tsx`
- Test: `src/components/coach/pace/__tests__/PaceMatrix.test.tsx`

Props:
```ts
interface Props {
  targetTimeMs: number;
  targetDistanceM: number;
  stroke: Stroke;
  zones: ZoneConfig;
}
```

Render: rows = `getDistanceRows(...)`, columns = V0/V1/V2/V3/Max, each cell = `formatPaceTime(zoneTime(d, pace, zones[zone]))`. Sticky first column (distance), responsive table.

**Test:**
- Empty rows when stroke/distance unsupported → renders an "Ouverture non gérée" placeholder.
- Cells contain expected formatted values for known input.
- ColorChips per zone (use existing intensity colors `text-intensity-*`).

**Commit** `feat(pace): PaceMatrix — render zones × distances`

---

### Task 20: `PaceTargetForm` component

**Files:**
- Create: `src/components/coach/pace/PaceTargetForm.tsx`
- Test sibling.

Inputs: stroke (Select), distance (Select limited to allowed distances per stroke), time (text with `parsePaceTime` validation, placeholder "1:05.4"). Submit disabled until valid.

**Commit** `feat(pace): PaceTargetForm — saisie cible (nage/distance/temps)`

---

### Task 21: `SwimmerPaceCard` component (accordion)

**Files:**
- Create: `src/components/coach/pace/SwimmerPaceCard.tsx`
- Test sibling.

Props:
```ts
interface Props {
  swimmer: TeamMember;
  targets: PaceTarget[];
  zones: ZoneConfig;
  onUpsert: (t: { stroke; target_distance_m; target_time_ms }) => void;
  onDelete: (targetId: string) => void;
  onExportPdf: () => void;
  onShare: () => void;
}
```

Render: Radix Accordion item. Trigger = name + count of targets + actions [PDF] [↗]. Content = list of `(stroke + distance + time editor) → matrix` blocks + `[+ ajouter cible]` opens `PaceTargetForm` inline.

**Commit** `feat(pace): SwimmerPaceCard — accordéon nageur + matrices`

---

### Task 22: `PaceZonesSettings` drawer

**Files:**
- Create: `src/components/coach/pace/PaceZonesSettings.tsx`
- Test sibling.

Drawer (Radix `Sheet`) with 5 sliders + numeric inputs, range 100-200, step 1. CHECK constraint enforced client-side (V0 ≥ V1 ≥ V2 ≥ V3 ≥ Max). Save calls `upsertMyPaceZones`. Reset-to-default button.

**Commit** `feat(pace): PaceZonesSettings — drawer config % zones`

---

### Task 23: `PaceTeamPanel` component

**Files:**
- Create: `src/components/coach/pace/PaceTeamPanel.tsx`
- Test sibling.

Props: `team`, `allAthletes`, `selectedIds`, `onChange`. Default = entire `team` selected. Toggle "Inclure d'autres nageurs du club" reveals chips of accounts not in team. Link "Gérer mon équipe →" to `/coach?section=swimmers`.

**Commit** `feat(pace): PaceTeamPanel — sélection nageurs + cross-team`

---

## Phase 8 — Page assembly

### Task 24: `CoachPaceCalculatorScreen.tsx`

**Files:**
- Create: `src/pages/coach/CoachPaceCalculatorScreen.tsx`
- Test: `src/pages/coach/__tests__/CoachPaceCalculatorScreen.test.tsx`

Compose: `useMyTeam`, `useQuery(["pace-zones"], getMyPaceZones)`, `useQuery(["pace-targets"], listMyPaceTargets)`, mutations for upsert/delete with optimistic updates + invalidations.

Layout: header + zones settings button + team panel + accordion list of cards.

**Commit** `feat(pace): CoachPaceCalculatorScreen — page principale`

---

### Task 25: Wire `pace-calculator` section in `Coach.tsx`

**Files:**
- Modify: `src/pages/Coach.tsx`

Add `const CoachPaceCalculatorScreen = lazyWithRetry(...)`. Add to the section conditional:

```tsx
{activeSection === "pace-calculator" ? (
  <Suspense fallback={<SectionSkeleton />}>
    <CoachPaceCalculatorScreen athletes={athletes} myAthletes={myAthletes} />
  </Suspense>
) : null}
```

Update the `loadCatalogs` / `loadComms` flags as appropriate (likely none needed — no comms/catalog calls).

**Run:** `npx tsc --noEmit` clean.
**Commit** `feat(coach): register pace-calculator section route`

---

### Task 26: Home coach card "Calculateur d'allures"

**Files:**
- Modify: `src/pages/Coach.tsx` or the Home subcomponent rendering action cards

Add a card with icon (Lucide `Gauge`), label "Allures équipe", description "Projeter les allures d'entraînement par nageur", onClick navigates to `/coach?section=pace-calculator`.

**Commit** `feat(coach): home — card d'accès au calculateur d'allures`

---

## Phase 9 — Export PDF + Share

### Task 27: PDF export (per swimmer)

**Files:**
- Create: `src/lib/export-pace-pdf.ts`
- Test: `src/__tests__/export-pace-pdf.test.ts`

Reuse pdf-lib + helpers from `src/lib/export-session-pdf.ts` (per §183). One A4 page per swimmer with:
- Header: club logo (optional), swimmer name, generated-at date, coach name
- For each (stroke, distance) target → a small matrix block

Returns `Blob`; the caller `downloads` it via existing helper.

**Wire:** `SwimmerPaceCard` `onExportPdf` calls `exportPacePdf(swimmer, targets, zones)`.

**Commit** `feat(pace): export PDF par nageur`

---

### Task 28: ShareMenu + public route

**Files:**
- Modify: `src/components/coach/pace/SwimmerPaceCard.tsx` (wire ShareMenu)
- Create: `src/pages/SharedPaceMatrix.tsx`
- Modify: `src/App.tsx` (route `/share/pace/:token`)
- Test: smoke test on the public page

Public page calls `getPaceSharePayload(token)`; renders read-only matrices. No auth required. Token expiration handled via "Lien expiré".

**Commit** `feat(pace): partage public via token (lecture seule)`

---

## Phase 10 — RLS integration tests

### Task 29: RLS test `coach_pace_zones`

**Files:**
- Create: `supabase/tests/rls/coach_pace_zones.test.ts`

Test cases (using existing `asUser` / `asServiceRole` harness):
1. Coach A inserts zones row; coach B SELECT returns nothing.
2. Coach A UPDATE own row OK.
3. Coach B UPDATE coach A row → 0 rows affected.
4. CHECK `v0 >= v1 >= v2 >= v3 >= max` rejects `{v0:100,v1:130,...}`.

**Step:** *Wait for Phase 11 task 31 to actually run RLS tests.*

---

### Task 30: RLS test `coach_pace_targets` + `coach_manual_swimmers_update` + `pace_share_links`

**Files:**
- Create: `supabase/tests/rls/coach_pace_targets.test.ts`
- Create: `supabase/tests/rls/coach_manual_swimmers_update.test.ts`
- Create: `supabase/tests/rls/pace_share_links.test.ts`

Each covers cross-coach isolation (insert/update/delete, both account_id and manual_id paths) + the `((account_id IS NULL) <> (manual_id IS NULL))` CHECK.

`pace_share_links` test: anon role calls `get_pace_share_payload(token)` and gets the payload; expired token returns NULL.

---

### Task 31: Run the full RLS suite

**Pre-flight (token-cheap):**
1. `docker ps` (1× max — see CLAUDE.md § Économie de tokens).
2. If Docker is not running, **stop and ask the user** to start Docker Desktop.
3. If supabase containers are not started: `supabase start`.

**Run:**
```bash
npm run test:rls
```

Expected: all new tests pass; no existing test regressed (143/143 from §182 → 143+N/143+N).

**Commit** `test(rls): coverage for §184 pace calculator + manuals update`

---

## Phase 11 — Documentation & wrap-up

### Task 32: Update `docs/implementation-log.md`

Add a `§184` entry: context, changes per file (with `wc -l`), tests added, decisions, limits.

### Task 33: Update `docs/ROADMAP.md` + "Dernière mise à jour"

Add a row for §184; bump the header timestamp.

### Task 34: Update `docs/FEATURES_STATUS.md`

Toggle the relevant features to ✅ (manual swimmers UI in MySwimmers, pace calculator).

### Task 35: Update `CLAUDE.md`

- Bump "Dernière entrée en date : §184 (... description ...)".
- If any new file ≥150 LOC or any file changed by >30%, update `docs/claude/files-map.md`.
- Hubs table likely doesn't change — but `CoachPaceCalculatorScreen.tsx` and `useMyTeam.ts` might warrant a row.

### Task 36: Final verifications + PR

```bash
npx tsc --noEmit
npm test
npm run test:rls   # already done in task 31, skip if cache fresh
git status         # clean
git log --oneline -20  # review the chantier commits
```

If on a worktree, push the branch:
```bash
git push -u origin chantier/184-coach-pace-calculator
gh pr create --title "feat(coach): calculateur d'allures + 'Mon équipe' (§184)" --body "..."
```

---

## Risks & gotchas (read before each phase)

- **Migration applied via MCP only** — never `supabase db push`. If you accidentally run something locally, fix the prod DB via MCP.
- **RLS partial unique indexes** — supabase `.upsert({...}, {onConflict: ...})` requires a *constraint*, not just an index. Convert `uq_pace_targets_account` / `_manual` to actual partial UNIQUE constraints (since v15+ Postgres allows `CREATE UNIQUE INDEX` to back a `UNIQUE` constraint reference). If supabase-js refuses partial conflict, fall back to `select-then-insert-or-update` in JS.
- **Don't break ChronoSetup** — the chrono "kind: manual" pipe must keep working end-to-end. Run a manual smoke test (open chrono, add a manual, run a chrono, save) before the PR.
- **Auto-save UX** — the matrices recompute as the user types in the time input. Use `parsePaceTime` for live validation; only persist on blur (or after 500 ms of idle) to avoid Supabase write storms.
- **PDF perf** — the per-swimmer PDF must stay < 2 s on a 12-swimmer team (do them sequentially with a small loader). Don't spawn 12 PDFs in parallel.
- **Public share** — keep the page minimal. No PII beyond display_name. The token is the secret; do NOT log it.

---

## Out of scope (acted §futur)

Affichage allure projetée dans la séance côté nageur (`SwimSessionView` chip "🎯 1:14.7 (V2)"). To be picked up after §184 lands and feedback is gathered.
