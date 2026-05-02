# §188 — Lier objectifs nageur ↔ allures (plan TDD)

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

## 🟢 Resume status (2026-05-02)

**Tasks livrées (A1 → B3) — commits sur `main`, non encore push :**

| Task | Status | Commit | Notes |
|------|--------|--------|-------|
| A1 — `parseObjectiveForPace` helper | ✅ | `f46ec36ae` | 5/5 tests green, code-review approved |
| B1 — sessionStorage handoff | ✅ | `9c5ba8d94` | 4/4 tests green, approved |
| B2 — Bouton → Allures sur ObjectiveCard | ✅ | `68c05391f` | 4/4 tests green, +`export default` ajouté + `e.stopPropagation()` (justifié) |
| B3 — Wire SwimmerObjectivesTab | ✅ | `9e89564f0` | 1/1 test green, approved |
| B4 — Consume prefill (CoachPaceCalculatorScreen) | ⏸ **À FAIRE** | — | Tentative précédente échouée par limit org + working tree pollué (artefact de `git stash --theirs` lors du pull §186). Working tree restauré propre 2026-05-02. |
| C1 — `useTargetForObjective` hook | ⏸ pending | — | |
| C2 — `PaceMatrixInline` wrapper | ⏸ pending | — | |
| C3 — Inline matrix sous ObjectiveCard nageur | ⏸ pending | — | |
| D1 — Update CLAUDE/ROADMAP/log/files-map | ⏸ pending | — | |
| D2 — Smoke test UI + push origin | ⏸ pending | — | |

**Pré-conditions à vérifier au début de la nouvelle session :**

1. `git log --oneline -5` doit montrer `9e89564f0 feat(pace-link): §188 — wire ObjectiveCard onPaceLink in SwimmerObjectivesTab` en tête (HEAD).
2. `git status --short` ne doit PAS montrer `CoachPaceCalculatorScreen.tsx` ni `SwimmerPaceCard.tsx` modifiés. Si oui, c'est un artefact à `git restore`. Les `?? docs/...` (PDF, docx, plan abandonné) sont des fichiers user à laisser intacts.
3. `npm test -- --run src/lib/__tests__/objective-pace-link.test.ts src/lib/__tests__/pace-prefill-handoff.test.ts src/components/shared/__tests__/ObjectiveCard.paceLink.test.tsx src/pages/coach/__tests__/SwimmerObjectivesTab.paceLink.test.tsx` → tous green (sauf 1 fail pré-existant `transformers.test.ts`).

**Points de vigilance pour B4 :**
- `CoachPaceCalculatorScreen.tsx` côté `main` actuel = **version §186 complète** avec `useTeamForCoach`, `useCoachPaceZonesV2`, `useCoachStrokeAdjustments`, `listActiveCoaches`, `PaceStrokeAdjustments`, `EventFamily`/`Zone` de `paceData`, `buildSelectedMembers` exporté, V4 toggles. Le plan ci-dessous (§ Task B4) a été écrit avant que ces variables soient stabilisées — **vérifier les vrais noms de state/queries dans le fichier actuel** avant d'implémenter (`teamLoading`, `targetsQuery`, `setOpenSwimmerIds`, mutation existante pour `upsertPaceTarget`, etc.).
- L'implementer ajoutera UNIQUEMENT 4 morceaux : (a) imports `useEffect`+`toast`+`consumePacePrefill`+`PacePrefillPayload`, (b) export `type ConsumeResult`, (c) export `function selectAccordionTargetForPrefill` (pure), (d) un `useEffect` dans le component qui consomme le prefill via la fonction pure et déclenche un toast + accordion open + mutation.
- **Critique** : `git add` UNIQUEMENT les 2 fichiers cibles (`CoachPaceCalculatorScreen.tsx` + nouveau test). NE PAS utiliser `-A`.

**Nouvelle session : utiliser `superpowers:subagent-driven-development` ou `superpowers:executing-plans` à partir de Task B4 ci-dessous.** Les tâches A1-B3 sont déjà cochées et n'ont plus à être ré-exécutées.

---

**Goal:** Eliminer la double-saisie objectif/cible via un bouton 1-clic côté coach (préremplit le calculateur d'allures à partir d'un objectif) et afficher la matrice d'allures inline sur les `ObjectiveCard` côté nageur quand une cible correspond.

**Architecture:**
- Helper pur `parseObjectiveForPace(event_code, pool_length)` qui mappe le format compact existant `100NL/200DOS/200QN/...` → `{ stroke: PaceStroke, distance: number, pool_size: PoolSize }`. **Aucune migration DB.**
- Handoff coach → calculateur via `sessionStorage` (pattern précédent §172) — pas de modification de `coachRouteState`.
- Côté nageur : nouveau hook `useTargetForObjective(swimmer_account_id, parsed, pool_size)` + composant `PaceMatrixInline` (wrapper de `PaceMatrix` en mode `compact`) sous chaque `ObjectiveCard` quand match.

**Tech Stack:** TypeScript / React 19 / TanStack Query 5 / Wouter (hash) / Vitest+node:test / Tailwind 4 / Radix.

**Design source :** `docs/plans/2026-05-01-objectives-pace-link-188-design.md`. Toute divergence avec le design doit être traitée comme un signal de remise en question — pas d'improvisation.

---

## Pré-conditions

- Branche `main` à jour (commit ≥ `9b19efcfd`)
- Pas de migration DB nécessaire
- Tous les tests pace existants doivent rester verts pendant et après §188

---

## Phase A — Foundation : helper pur

### Task A1 : Tests `parseObjectiveForPace` (failing)

**Files:**
- Create: `src/lib/__tests__/objective-pace-link.test.ts`

**Step 1: Write the failing test**

```ts
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseObjectiveForPace } from "../objective-pace-link";

describe("parseObjectiveForPace", () => {
  it("parses 100NL with pool_length=50 → 100m NL 50m", () => {
    const res = parseObjectiveForPace("100NL", 50);
    assert.deepEqual(res, { stroke: "NL", distance: 100, pool_size: "50m" });
  });

  it("maps DOS → Dos, BR → Brasse, PAP → Pap, QN → 4N", () => {
    assert.equal(parseObjectiveForPace("100DOS", 50)?.stroke, "Dos");
    assert.equal(parseObjectiveForPace("50BR", 25)?.stroke, "Brasse");
    assert.equal(parseObjectiveForPace("200PAP", 50)?.stroke, "Pap");
    assert.equal(parseObjectiveForPace("400QN", 25)?.stroke, "4N");
  });

  it("uses pool_length=25 → '25m', any other → '50m'", () => {
    assert.equal(parseObjectiveForPace("100NL", 25)?.pool_size, "25m");
    assert.equal(parseObjectiveForPace("100NL", 50)?.pool_size, "50m");
    assert.equal(parseObjectiveForPace("100NL", null)?.pool_size, "50m");
    assert.equal(parseObjectiveForPace("100NL", undefined)?.pool_size, "50m");
  });

  it("returns null on invalid event_code", () => {
    assert.equal(parseObjectiveForPace(null, 50), null);
    assert.equal(parseObjectiveForPace("", 50), null);
    assert.equal(parseObjectiveForPace("WTF", 50), null);
    assert.equal(parseObjectiveForPace("100XYZ", 50), null);
    assert.equal(parseObjectiveForPace("100", 50), null);
  });

  it("preserves distance for the long-distance codes", () => {
    assert.equal(parseObjectiveForPace("800NL", 50)?.distance, 800);
    assert.equal(parseObjectiveForPace("1500NL", 50)?.distance, 1500);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- --run src/lib/__tests__/objective-pace-link.test.ts 2>&1 | head -20`
Expected: FAIL with "Cannot find module '../objective-pace-link'"

**Step 3: Write minimal implementation**

Create `src/lib/objective-pace-link.ts`:

```ts
import type { Stroke } from "./paceCalculator";
import type { PoolSize } from "./poolConversion";

const STROKE_MAP: Record<string, Stroke> = {
  NL: "NL",
  DOS: "Dos",
  BR: "Brasse",
  PAP: "Pap",
  QN: "4N",
};

export interface ParsedObjectiveTarget {
  stroke: Stroke;
  distance: number;
  pool_size: PoolSize;
}

/**
 * Parse an `objectives.event_code` (compact format, ex. "100NL", "200DOS",
 * "400QN") + `pool_length` into a pace-target shape ready to upsert.
 *
 * Returns null if the event_code does not match the FFN compact format
 * `^(\d+)(NL|DOS|BR|PAP|QN)$`.
 *
 * pool_length=25 → "25m", any other (50, null, undefined) → "50m".
 */
export function parseObjectiveForPace(
  event_code: string | null | undefined,
  pool_length: number | null | undefined,
): ParsedObjectiveTarget | null {
  if (!event_code) return null;
  const match = event_code.match(/^(\d+)(NL|DOS|BR|PAP|QN)$/);
  if (!match) return null;
  const distance = parseInt(match[1], 10);
  if (!Number.isFinite(distance) || distance <= 0) return null;
  const stroke = STROKE_MAP[match[2]];
  if (!stroke) return null;
  const pool_size: PoolSize = pool_length === 25 ? "25m" : "50m";
  return { stroke, distance, pool_size };
}
```

**Step 4: Run test to verify it passes**

Run: `npm test -- --run src/lib/__tests__/objective-pace-link.test.ts 2>&1 | tail -10`
Expected: 5 tests passing.

Run: `npx tsc --noEmit 2>&1 | grep -i "objective-pace-link"`
Expected: empty output (no type errors on new module).

**Step 5: Commit**

```bash
git add src/lib/objective-pace-link.ts src/lib/__tests__/objective-pace-link.test.ts
git commit -m "feat(pace-link): §188 — parseObjectiveForPace helper + 5 tests"
```

---

## Phase B — Coach side : bouton + handoff

### Task B1 : Tests sessionStorage handoff payload

**Files:**
- Create: `src/lib/__tests__/pace-prefill-handoff.test.ts`

**Step 1: Write the failing test**

```ts
import assert from "node:assert/strict";
import { describe, it, beforeEach } from "node:test";
import {
  PACE_PREFILL_KEY,
  setPacePrefill,
  consumePacePrefill,
  type PacePrefillPayload,
} from "../pace-prefill-handoff";

const memoryStore = new Map<string, string>();
const memoryStorage = {
  getItem: (k: string) => memoryStore.get(k) ?? null,
  setItem: (k: string, v: string) => { memoryStore.set(k, v); },
  removeItem: (k: string) => { memoryStore.delete(k); },
  clear: () => { memoryStore.clear(); },
} as unknown as Storage;

beforeEach(() => { memoryStore.clear(); });

describe("pace-prefill-handoff", () => {
  it("set then consume returns the payload exactly once", () => {
    const payload: PacePrefillPayload = {
      swimmer_account_id: 42,
      stroke: "NL",
      target_distance_m: 100,
      target_time_ms: 65500,
      target_pool_size: "50m",
    };
    setPacePrefill(payload, memoryStorage);
    const got = consumePacePrefill(memoryStorage);
    assert.deepEqual(got, payload);
    const second = consumePacePrefill(memoryStorage);
    assert.equal(second, null, "consume must clear the slot after first read");
  });

  it("returns null when nothing was set", () => {
    assert.equal(consumePacePrefill(memoryStorage), null);
  });

  it("returns null and clears on malformed JSON", () => {
    memoryStorage.setItem(PACE_PREFILL_KEY, "{not-json");
    assert.equal(consumePacePrefill(memoryStorage), null);
    assert.equal(memoryStorage.getItem(PACE_PREFILL_KEY), null);
  });

  it("returns null and clears on payload missing required fields", () => {
    memoryStorage.setItem(PACE_PREFILL_KEY, JSON.stringify({ stroke: "NL" }));
    assert.equal(consumePacePrefill(memoryStorage), null);
    assert.equal(memoryStorage.getItem(PACE_PREFILL_KEY), null);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- --run src/lib/__tests__/pace-prefill-handoff.test.ts 2>&1 | head -20`
Expected: FAIL with "Cannot find module '../pace-prefill-handoff'".

**Step 3: Write minimal implementation**

Create `src/lib/pace-prefill-handoff.ts`:

```ts
import type { Stroke } from "./paceCalculator";
import type { PoolSize } from "./poolConversion";

export const PACE_PREFILL_KEY = "eac-pace-prefill-v1";

export interface PacePrefillPayload {
  swimmer_account_id: number;
  stroke: Stroke;
  target_distance_m: number;
  target_time_ms: number;
  target_pool_size: PoolSize;
}

function isValidPayload(v: unknown): v is PacePrefillPayload {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o.swimmer_account_id === "number" &&
    typeof o.stroke === "string" &&
    typeof o.target_distance_m === "number" &&
    typeof o.target_time_ms === "number" &&
    (o.target_pool_size === "25m" || o.target_pool_size === "50m")
  );
}

export function setPacePrefill(
  payload: PacePrefillPayload,
  storage: Storage = sessionStorage,
): void {
  try {
    storage.setItem(PACE_PREFILL_KEY, JSON.stringify(payload));
  } catch {
    /* quota — silent */
  }
}

export function consumePacePrefill(
  storage: Storage = sessionStorage,
): PacePrefillPayload | null {
  let raw: string | null;
  try { raw = storage.getItem(PACE_PREFILL_KEY); } catch { return null; }
  if (!raw) return null;
  try { storage.removeItem(PACE_PREFILL_KEY); } catch { /* ignore */ }
  try {
    const parsed = JSON.parse(raw);
    return isValidPayload(parsed) ? parsed : null;
  } catch {
    return null;
  }
}
```

**Step 4: Run test to verify it passes**

Run: `npm test -- --run src/lib/__tests__/pace-prefill-handoff.test.ts 2>&1 | tail -10`
Expected: 4 tests passing.

**Step 5: Commit**

```bash
git add src/lib/pace-prefill-handoff.ts src/lib/__tests__/pace-prefill-handoff.test.ts
git commit -m "feat(pace-link): §188 — sessionStorage handoff for objective→pace prefill"
```

---

### Task B2 : Bouton "→ Allures" dans `ObjectiveCard` (coach uniquement)

**Files:**
- Modify: `src/components/shared/ObjectiveCard.tsx`
- Test: `src/components/shared/__tests__/ObjectiveCard.paceLink.test.tsx`

**Step 1: Write the failing test**

```tsx
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { renderToString } from "react-dom/server";
import React from "react";
import ObjectiveCard from "../ObjectiveCard";
import type { Objective } from "@/lib/api";

const baseObjective: Objective = {
  id: "obj-1",
  athlete_id: "auth-uuid",
  event_code: "100NL",
  pool_length: 50,
  target_time_seconds: 65.5,
  text: "100m NL en 1:05.50",
  created_at: "2026-01-01",
};

describe("ObjectiveCard — pace link button (coach context)", () => {
  it("renders → Allures button when context=coach + valid event_code + target_time", () => {
    const html = renderToString(
      React.createElement(ObjectiveCard, {
        objective: baseObjective,
        context: "coach",
        swimmerAccountId: 42,
        onPaceLink: () => {},
      }),
    );
    assert.ok(html.includes("→ Allures"), "button label visible");
    assert.ok(!html.includes("disabled"), "button enabled with full data");
  });

  it("does NOT render the button when context=swimmer", () => {
    const html = renderToString(
      React.createElement(ObjectiveCard, {
        objective: baseObjective,
        context: "swimmer",
      }),
    );
    assert.ok(!html.includes("→ Allures"), "button hidden in swimmer context");
  });

  it("renders disabled button when target_time_seconds is null", () => {
    const html = renderToString(
      React.createElement(ObjectiveCard, {
        objective: { ...baseObjective, target_time_seconds: null },
        context: "coach",
        swimmerAccountId: 42,
        onPaceLink: () => {},
      }),
    );
    assert.ok(html.includes("→ Allures"));
    assert.ok(html.includes("disabled"));
  });

  it("renders disabled button when event_code is unparseable", () => {
    const html = renderToString(
      React.createElement(ObjectiveCard, {
        objective: { ...baseObjective, event_code: "BIZARRE" },
        context: "coach",
        swimmerAccountId: 42,
        onPaceLink: () => {},
      }),
    );
    assert.ok(html.includes("disabled"));
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- --run src/components/shared/__tests__/ObjectiveCard.paceLink.test.tsx 2>&1 | head -20`
Expected: FAIL — props `context`, `swimmerAccountId`, `onPaceLink` not yet on `ObjectiveCard`.

**Step 3: Write minimal implementation**

Read current `ObjectiveCard.tsx` to find the props interface and bottom-of-card region. Add to `ObjectiveCard` props:

```tsx
context?: "coach" | "swimmer"; // default "swimmer"
swimmerAccountId?: number;
onPaceLink?: (parsed: ParsedObjectiveTarget, swimmerAccountId: number, target_time_ms: number) => void;
```

Add at the bottom of the card body (before closing `</div>`), conditional on `context === "coach"`:

```tsx
{context === "coach" && (() => {
  const parsed = parseObjectiveForPace(objective.event_code, objective.pool_length);
  const canCalculate = !!parsed && objective.target_time_seconds != null && swimmerAccountId != null;
  const tooltipText = !objective.event_code ? "Code épreuve manquant"
    : !parsed ? `Code épreuve "${objective.event_code}" non reconnu`
    : objective.target_time_seconds == null ? "Temps cible manquant"
    : swimmerAccountId == null ? "Nageur sans compte (manuel) — non lié aux allures"
    : "Pré-remplir le calculateur d'allures";
  return (
    <button
      type="button"
      disabled={!canCalculate}
      title={tooltipText}
      onClick={() => {
        if (canCalculate && parsed && onPaceLink && swimmerAccountId != null && objective.target_time_seconds != null) {
          onPaceLink(parsed, swimmerAccountId, Math.round(objective.target_time_seconds * 1000));
        }
      }}
      className="mt-2 inline-flex h-9 items-center gap-1.5 rounded-md border border-input bg-background px-3 text-xs font-medium hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
    >
      <Calculator className="h-3.5 w-3.5" />
      → Allures
    </button>
  );
})()}
```

Add imports: `import { Calculator } from "lucide-react";` and `import { parseObjectiveForPace, type ParsedObjectiveTarget } from "@/lib/objective-pace-link";`.

**Step 4: Run test to verify it passes**

Run: `npm test -- --run src/components/shared/__tests__/ObjectiveCard.paceLink.test.tsx 2>&1 | tail -10`
Expected: 4 tests passing.

Run: `npx tsc --noEmit 2>&1 | grep -i "ObjectiveCard"`
Expected: empty output.

**Step 5: Commit**

```bash
git add src/components/shared/ObjectiveCard.tsx src/components/shared/__tests__/ObjectiveCard.paceLink.test.tsx
git commit -m "feat(pace-link): §188 — bouton → Allures sur ObjectiveCard (context=coach)"
```

---

### Task B3 : Wire `onPaceLink` dans `SwimmerObjectivesTab.tsx`

**Files:**
- Modify: `src/pages/coach/SwimmerObjectivesTab.tsx`
- Test: `src/pages/coach/__tests__/SwimmerObjectivesTab.paceLink.test.tsx`

**Step 1: Write the failing test**

```tsx
import assert from "node:assert/strict";
import { describe, it, beforeEach } from "node:test";
import { setPacePrefill, consumePacePrefill } from "@/lib/pace-prefill-handoff";
import { handlePaceLinkClick } from "../SwimmerObjectivesTab";

const memoryStore = new Map<string, string>();
const memoryStorage = {
  getItem: (k: string) => memoryStore.get(k) ?? null,
  setItem: (k: string, v: string) => { memoryStore.set(k, v); },
  removeItem: (k: string) => { memoryStore.delete(k); },
  clear: () => { memoryStore.clear(); },
} as unknown as Storage;

beforeEach(() => { memoryStore.clear(); });

describe("SwimmerObjectivesTab — handlePaceLinkClick", () => {
  it("writes pace prefill to sessionStorage and returns the target URL hash", () => {
    const url = handlePaceLinkClick(
      { stroke: "NL", distance: 100, pool_size: "50m" },
      42,
      65500,
      memoryStorage,
    );
    assert.equal(url, "#/coach?section=pace-calculator");
    const consumed = consumePacePrefill(memoryStorage);
    assert.deepEqual(consumed, {
      swimmer_account_id: 42,
      stroke: "NL",
      target_distance_m: 100,
      target_time_ms: 65500,
      target_pool_size: "50m",
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- --run src/pages/coach/__tests__/SwimmerObjectivesTab.paceLink.test.tsx 2>&1 | head -20`
Expected: FAIL — `handlePaceLinkClick` not exported.

**Step 3: Write minimal implementation**

In `src/pages/coach/SwimmerObjectivesTab.tsx`, add export:

```ts
import { setPacePrefill } from "@/lib/pace-prefill-handoff";
import type { ParsedObjectiveTarget } from "@/lib/objective-pace-link";

export function handlePaceLinkClick(
  parsed: ParsedObjectiveTarget,
  swimmerAccountId: number,
  target_time_ms: number,
  storage: Storage = (typeof window !== "undefined" ? sessionStorage : ({} as Storage)),
): string {
  setPacePrefill({
    swimmer_account_id: swimmerAccountId,
    stroke: parsed.stroke,
    target_distance_m: parsed.distance,
    target_time_ms,
    target_pool_size: parsed.pool_size,
  }, storage);
  return "#/coach?section=pace-calculator";
}
```

In the JSX where `<ObjectiveCard objective={...}>` is rendered, add:

```tsx
context="coach"
swimmerAccountId={athleteId}  // bigint, from parent props
onPaceLink={(parsed, accountId, time_ms) => {
  const target = handlePaceLinkClick(parsed, accountId, time_ms);
  window.location.hash = target;
}}
```

**Step 4: Run test to verify it passes**

Run: `npm test -- --run src/pages/coach/__tests__/SwimmerObjectivesTab.paceLink.test.tsx 2>&1 | tail -10`
Expected: test passing.

Run: `npx tsc --noEmit 2>&1 | grep -i "SwimmerObjectivesTab"`
Expected: empty.

**Step 5: Commit**

```bash
git add src/pages/coach/SwimmerObjectivesTab.tsx src/pages/coach/__tests__/SwimmerObjectivesTab.paceLink.test.tsx
git commit -m "feat(pace-link): §188 — wire ObjectiveCard onPaceLink in SwimmerObjectivesTab"
```

---

### Task B4 : `CoachPaceCalculatorScreen` consume prefill on mount

**Files:**
- Modify: `src/pages/coach/CoachPaceCalculatorScreen.tsx`
- Test: `src/pages/coach/__tests__/CoachPaceCalculatorScreen.prefill.test.tsx`

**Step 1: Write the failing test**

```tsx
import assert from "node:assert/strict";
import { describe, it, beforeEach } from "node:test";
import { setPacePrefill } from "@/lib/pace-prefill-handoff";
import {
  selectAccordionTargetForPrefill,
  type ConsumeResult,
} from "../CoachPaceCalculatorScreen";

const memoryStore = new Map<string, string>();
const memoryStorage = {
  getItem: (k: string) => memoryStore.get(k) ?? null,
  setItem: (k: string, v: string) => { memoryStore.set(k, v); },
  removeItem: (k: string) => { memoryStore.delete(k); },
  clear: () => { memoryStore.clear(); },
} as unknown as Storage;

beforeEach(() => { memoryStore.clear(); });

describe("CoachPaceCalculatorScreen — selectAccordionTargetForPrefill", () => {
  const team = [
    { id: "account-42", kind: "account", accountId: 42, displayName: "Léo" },
    { id: "account-43", kind: "account", accountId: 43, displayName: "Sara" },
  ] as const;
  const targets = [
    { id: "t1", swimmer_account_id: 42, stroke: "NL", target_distance_m: 100, target_pool_size: "50m" } as const,
    { id: "t2", swimmer_account_id: 43, stroke: "Dos", target_distance_m: 200, target_pool_size: "25m" } as const,
  ];

  it("returns 'open-existing' when a matching target already exists", () => {
    const r = selectAccordionTargetForPrefill({
      payload: { swimmer_account_id: 42, stroke: "NL", target_distance_m: 100, target_time_ms: 65500, target_pool_size: "50m" },
      team: team as unknown as Parameters<typeof selectAccordionTargetForPrefill>[0]["team"],
      targets: targets as unknown as Parameters<typeof selectAccordionTargetForPrefill>[0]["targets"],
    });
    const expected: ConsumeResult = { kind: "open-existing", swimmerAccordionId: "account-42", targetId: "t1" };
    assert.deepEqual(r, expected);
  });

  it("returns 'open-create' when swimmer found but no matching target", () => {
    const r = selectAccordionTargetForPrefill({
      payload: { swimmer_account_id: 42, stroke: "Brasse", target_distance_m: 50, target_time_ms: 32500, target_pool_size: "50m" },
      team: team as unknown as Parameters<typeof selectAccordionTargetForPrefill>[0]["team"],
      targets: targets as unknown as Parameters<typeof selectAccordionTargetForPrefill>[0]["targets"],
    });
    assert.equal(r.kind, "open-create");
    if (r.kind === "open-create") {
      assert.equal(r.swimmerAccordionId, "account-42");
      assert.equal(r.payload.stroke, "Brasse");
    }
  });

  it("returns 'unknown-swimmer' when account not in team", () => {
    const r = selectAccordionTargetForPrefill({
      payload: { swimmer_account_id: 999, stroke: "NL", target_distance_m: 100, target_time_ms: 65500, target_pool_size: "50m" },
      team: team as unknown as Parameters<typeof selectAccordionTargetForPrefill>[0]["team"],
      targets: targets as unknown as Parameters<typeof selectAccordionTargetForPrefill>[0]["targets"],
    });
    assert.equal(r.kind, "unknown-swimmer");
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- --run src/pages/coach/__tests__/CoachPaceCalculatorScreen.prefill.test.tsx 2>&1 | head -20`
Expected: FAIL — `selectAccordionTargetForPrefill` and `ConsumeResult` not exported.

**Step 3: Write minimal implementation**

In `src/pages/coach/CoachPaceCalculatorScreen.tsx`, add (above the component):

```ts
import type { PacePrefillPayload } from "@/lib/pace-prefill-handoff";

export type ConsumeResult =
  | { kind: "open-existing"; swimmerAccordionId: string; targetId: string }
  | { kind: "open-create"; swimmerAccordionId: string; payload: PacePrefillPayload }
  | { kind: "unknown-swimmer" };

export function selectAccordionTargetForPrefill(args: {
  payload: PacePrefillPayload;
  team: Array<{ id: string; kind: string; accountId?: number }>;
  targets: PaceTarget[];
}): ConsumeResult {
  const { payload, team, targets } = args;
  const member = team.find(
    (m) => m.kind === "account" && m.accountId === payload.swimmer_account_id,
  );
  if (!member) return { kind: "unknown-swimmer" };
  const existing = targets.find((t) =>
    t.swimmer_account_id === payload.swimmer_account_id &&
    t.stroke === payload.stroke &&
    t.target_distance_m === payload.target_distance_m &&
    t.target_pool_size === payload.target_pool_size,
  );
  if (existing) {
    return { kind: "open-existing", swimmerAccordionId: member.id, targetId: existing.id };
  }
  return { kind: "open-create", swimmerAccordionId: member.id, payload };
}
```

Add a `useEffect` inside the component (after `team`/`zonesQuery`/`targetsQuery` are defined, only when both are loaded):

```tsx
useEffect(() => {
  if (teamLoading || zonesQuery.isLoading || targetsQuery.isLoading) return;
  const payload = consumePacePrefill();
  if (!payload) return;
  const result = selectAccordionTargetForPrefill({
    payload,
    team,
    targets: targetsQuery.data ?? [],
  });
  if (result.kind === "unknown-swimmer") {
    toast.error("Nageur introuvable dans votre équipe");
    return;
  }
  setOpenSwimmerIds((prev) => prev.includes(result.swimmerAccordionId) ? prev : [...prev, result.swimmerAccordionId]);
  if (result.kind === "open-existing") {
    toast.success("Cible déjà calibrée — modification possible");
  } else {
    upsertPaceTargetMutation.mutate({
      swimmer: { kind: "account", accountId: payload.swimmer_account_id },
      stroke: payload.stroke,
      target_distance_m: payload.target_distance_m,
      target_time_ms: payload.target_time_ms,
      target_pool_size: payload.target_pool_size,
    });
    toast.success("Cible créée depuis l'objectif");
  }
}, [teamLoading, zonesQuery.isLoading, targetsQuery.isLoading]);
```

(`upsertPaceTargetMutation` should already exist — if not, wire it via `useMutation({ mutationFn: upsertPaceTarget })`.)

Imports : `import { useEffect } from "react"; import { consumePacePrefill } from "@/lib/pace-prefill-handoff"; import { toast } from "sonner";`.

**Step 4: Run test to verify it passes**

Run: `npm test -- --run src/pages/coach/__tests__/CoachPaceCalculatorScreen.prefill.test.tsx 2>&1 | tail -10`
Expected: 3 tests passing.

Run: `npx tsc --noEmit 2>&1 | grep -i "CoachPaceCalculatorScreen"`
Expected: empty (or only pre-existing target_pool_size errors from §185 stories).

**Step 5: Commit**

```bash
git add src/pages/coach/CoachPaceCalculatorScreen.tsx src/pages/coach/__tests__/CoachPaceCalculatorScreen.prefill.test.tsx
git commit -m "feat(pace-link): §188 — CoachPaceCalculatorScreen consume prefill on mount"
```

---

## Phase C — Swimmer side : matrice inline

### Task C1 : Hook `useTargetForObjective`

**Files:**
- Create: `src/hooks/useTargetForObjective.ts`
- Test: `src/hooks/__tests__/useTargetForObjective.test.ts`

**Step 1: Write the failing test**

```ts
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { findMatchingTarget } from "../useTargetForObjective";

const targets = [
  { id: "t1", swimmer_account_id: 42, stroke: "NL", target_distance_m: 100, target_pool_size: "50m", updated_at: "2026-04-01" } as const,
  { id: "t2", swimmer_account_id: 42, stroke: "NL", target_distance_m: 100, target_pool_size: "50m", updated_at: "2026-05-01" } as const,
  { id: "t3", swimmer_account_id: 42, stroke: "Dos", target_distance_m: 100, target_pool_size: "50m", updated_at: "2026-04-15" } as const,
  { id: "t4", swimmer_account_id: 99, stroke: "NL", target_distance_m: 100, target_pool_size: "50m", updated_at: "2026-04-01" } as const,
];

describe("useTargetForObjective — findMatchingTarget", () => {
  it("returns the most recent (updated_at desc) when multiple match", () => {
    const r = findMatchingTarget(targets, 42, { stroke: "NL", distance: 100, pool_size: "50m" });
    assert.equal(r?.id, "t2");
  });
  it("returns null when no row matches the swimmer", () => {
    const r = findMatchingTarget(targets, 5, { stroke: "NL", distance: 100, pool_size: "50m" });
    assert.equal(r, null);
  });
  it("returns null when stroke doesn't match", () => {
    const r = findMatchingTarget(targets, 42, { stroke: "Brasse", distance: 100, pool_size: "50m" });
    assert.equal(r, null);
  });
  it("returns null when pool_size differs", () => {
    const r = findMatchingTarget(targets, 42, { stroke: "NL", distance: 100, pool_size: "25m" });
    assert.equal(r, null);
  });
  it("returns null on null parsed input", () => {
    const r = findMatchingTarget(targets, 42, null);
    assert.equal(r, null);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- --run src/hooks/__tests__/useTargetForObjective.test.ts 2>&1 | head -20`
Expected: FAIL — module missing.

**Step 3: Write minimal implementation**

Create `src/hooks/useTargetForObjective.ts`:

```ts
import { useQuery } from "@tanstack/react-query";
import { listMyPaceTargets, type PaceTarget } from "@/lib/api/pace-targets";
import type { ParsedObjectiveTarget } from "@/lib/objective-pace-link";

export function findMatchingTarget(
  targets: PaceTarget[],
  swimmer_account_id: number,
  parsed: ParsedObjectiveTarget | null,
): PaceTarget | null {
  if (!parsed) return null;
  const matches = targets.filter((t) =>
    t.swimmer_account_id === swimmer_account_id &&
    t.stroke === parsed.stroke &&
    t.target_distance_m === parsed.distance &&
    t.target_pool_size === parsed.pool_size,
  );
  if (matches.length === 0) return null;
  matches.sort((a, b) => (a.updated_at < b.updated_at ? 1 : -1));
  return matches[0];
}

export function useTargetForObjective(args: {
  swimmer_account_id: number | null;
  parsed: ParsedObjectiveTarget | null;
}): { target: PaceTarget | null; isLoading: boolean } {
  const enabled = args.swimmer_account_id != null && args.parsed != null;
  const q = useQuery({
    queryKey: ["pace-targets-for-swimmer", args.swimmer_account_id],
    queryFn: listMyPaceTargets,
    enabled,
    staleTime: 30_000,
  });
  if (!enabled) return { target: null, isLoading: false };
  if (q.isLoading || !q.data) return { target: null, isLoading: q.isLoading };
  return {
    target: findMatchingTarget(q.data, args.swimmer_account_id!, args.parsed),
    isLoading: false,
  };
}
```

**Step 4: Run test to verify it passes**

Run: `npm test -- --run src/hooks/__tests__/useTargetForObjective.test.ts 2>&1 | tail -10`
Expected: 5 tests passing.

**Step 5: Commit**

```bash
git add src/hooks/useTargetForObjective.ts src/hooks/__tests__/useTargetForObjective.test.ts
git commit -m "feat(pace-link): §188 — useTargetForObjective hook + findMatchingTarget"
```

---

### Task C2 : Wrapper `PaceMatrixInline` (compact, lecture seule)

**Files:**
- Create: `src/components/coach/pace/PaceMatrixInline.tsx`
- Test: `src/components/coach/pace/__tests__/PaceMatrixInline.test.tsx`

**Decision :** réutiliser `PaceMatrix` existant via une prop `compact?: boolean` plutôt que dupliquer. Si `compact=true` :
- Pas de toolbar (pas de toggle 25↔50, pas de bouton zones)
- Pas de footer disclaimer (déjà visible au niveau page nageur)
- Hauteur réduite (max-h auto, pas de stretch)

**Step 1: Write the failing test**

```tsx
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { renderToString } from "react-dom/server";
import React from "react";
import PaceMatrixInline from "../PaceMatrixInline";

describe("PaceMatrixInline (compact)", () => {
  it("renders cells for V0/V1/V2/V3/MAX without the toolbar controls", () => {
    const html = renderToString(
      React.createElement(PaceMatrixInline, {
        targetTimeMs: 65500,
        targetDistance: 100,
        stroke: "NL",
        targetPoolSize: "50m",
        swimmerSex: null,
      }),
    );
    assert.ok(html.includes("V1") || html.includes("V0"), "matrix renders zones");
    assert.ok(!html.includes("Bassin"), "no pool toggle");
    assert.ok(!html.includes("Personnaliser zones"), "no zones drawer button");
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- --run src/components/coach/pace/__tests__/PaceMatrixInline.test.tsx 2>&1 | head -20`
Expected: FAIL — module missing.

**Step 3: Write minimal implementation**

Create `src/components/coach/pace/PaceMatrixInline.tsx` :

```tsx
import { PaceMatrix } from "./PaceMatrix";
import type { Stroke } from "@/lib/paceCalculator";
import type { PoolSize } from "@/lib/poolConversion";

interface Props {
  targetTimeMs: number;
  targetDistance: number;
  stroke: Stroke;
  targetPoolSize: PoolSize;
  swimmerSex: "M" | "F" | null;
}

/** Lecture seule, pas de toolbar, hauteur compacte. Utilisé sur ObjectiveCard nageur. */
export default function PaceMatrixInline(props: Props) {
  return (
    <PaceMatrix
      targetTimeMs={props.targetTimeMs}
      targetDistance={props.targetDistance}
      stroke={props.stroke}
      targetPoolSize={props.targetPoolSize}
      swimmerSex={props.swimmerSex}
      compact
    />
  );
}
```

Then add `compact?: boolean` to `PaceMatrix` props interface (in `src/components/coach/pace/PaceMatrix.tsx`) and gate the toolbar JSX behind `!compact`.

**Step 4: Run test to verify it passes**

Run: `npm test -- --run src/components/coach/pace/__tests__/PaceMatrixInline.test.tsx 2>&1 | tail -10`
Expected: test passing.

Run: `npm test -- --run src/components/coach/pace/__tests__/PaceMatrix.test.tsx 2>&1 | tail -5`
Expected: existing 177 lines of tests still passing (regression check).

**Step 5: Commit**

```bash
git add src/components/coach/pace/PaceMatrixInline.tsx src/components/coach/pace/PaceMatrix.tsx src/components/coach/pace/__tests__/PaceMatrixInline.test.tsx
git commit -m "feat(pace-link): §188 — PaceMatrix compact mode + PaceMatrixInline wrapper"
```

---

### Task C3 : Render `PaceMatrixInline` sous chaque `ObjectiveCard` côté nageur

**Files:**
- Modify: `src/components/profile/SwimmerObjectivesView.tsx`
- Test: `src/components/profile/__tests__/SwimmerObjectivesView.paceLink.test.tsx`

**Step 1: Write the failing test**

```tsx
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { shouldRenderInlineMatrix } from "../SwimmerObjectivesView";

describe("SwimmerObjectivesView — shouldRenderInlineMatrix", () => {
  it("returns true when objective has parseable code + target_time + accountId + matching target", () => {
    const r = shouldRenderInlineMatrix({
      objective: { event_code: "100NL", pool_length: 50, target_time_seconds: 65.5, athlete_id: "u" } as any,
      swimmerAccountId: 42,
      matchingTarget: { id: "t1", target_pool_size: "50m" } as any,
    });
    assert.equal(r, true);
  });
  it("returns false when target_time_seconds is null", () => {
    const r = shouldRenderInlineMatrix({
      objective: { event_code: "100NL", pool_length: 50, target_time_seconds: null, athlete_id: "u" } as any,
      swimmerAccountId: 42,
      matchingTarget: { id: "t1" } as any,
    });
    assert.equal(r, false);
  });
  it("returns false when no matching target", () => {
    const r = shouldRenderInlineMatrix({
      objective: { event_code: "100NL", pool_length: 50, target_time_seconds: 65.5, athlete_id: "u" } as any,
      swimmerAccountId: 42,
      matchingTarget: null,
    });
    assert.equal(r, false);
  });
  it("returns false when accountId is null (manual swimmer — N/A)", () => {
    const r = shouldRenderInlineMatrix({
      objective: { event_code: "100NL", pool_length: 50, target_time_seconds: 65.5, athlete_id: "u" } as any,
      swimmerAccountId: null,
      matchingTarget: { id: "t1" } as any,
    });
    assert.equal(r, false);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- --run src/components/profile/__tests__/SwimmerObjectivesView.paceLink.test.tsx 2>&1 | head -20`
Expected: FAIL — `shouldRenderInlineMatrix` not exported.

**Step 3: Write minimal implementation**

In `src/components/profile/SwimmerObjectivesView.tsx`, add export :

```ts
import type { Objective } from "@/lib/api";
import type { PaceTarget } from "@/lib/api/pace-targets";

export function shouldRenderInlineMatrix(args: {
  objective: Objective;
  swimmerAccountId: number | null;
  matchingTarget: PaceTarget | null;
}): boolean {
  return !!(
    args.objective.target_time_seconds &&
    args.swimmerAccountId != null &&
    args.matchingTarget
  );
}
```

In the JSX, for each rendered `ObjectiveCard`, inject below it :

```tsx
const parsed = parseObjectiveForPace(objective.event_code, objective.pool_length);
const { target } = useTargetForObjective({ swimmer_account_id: swimmerAccountId, parsed });
return (
  <>
    <ObjectiveCard objective={objective} context="swimmer" />
    {shouldRenderInlineMatrix({ objective, swimmerAccountId, matchingTarget: target }) && target && (
      <div className="mt-2 rounded-lg border border-border bg-card/40 p-3">
        <PaceMatrixInline
          targetTimeMs={target.target_time_ms}
          targetDistance={target.target_distance_m}
          stroke={target.stroke}
          targetPoolSize={target.target_pool_size}
          swimmerSex={swimmerSex}
        />
      </div>
    )}
  </>
);
```

(`swimmerAccountId` and `swimmerSex` come from the parent component already.)

**Step 4: Run test to verify it passes**

Run: `npm test -- --run src/components/profile/__tests__/SwimmerObjectivesView.paceLink.test.tsx 2>&1 | tail -10`
Expected: 4 tests passing.

Run: `npx tsc --noEmit 2>&1 | grep -i "SwimmerObjectivesView"`
Expected: empty.

**Step 5: Commit**

```bash
git add src/components/profile/SwimmerObjectivesView.tsx src/components/profile/__tests__/SwimmerObjectivesView.paceLink.test.tsx
git commit -m "feat(pace-link): §188 — render PaceMatrixInline under matching ObjectiveCard (swimmer view)"
```

---

## Phase D — Doc & verification

### Task D1 : Update `CLAUDE.md` / `ROADMAP.md` / `implementation-log.md` / `files-map.md`

**Files:**
- Modify: `CLAUDE.md` (Dernière entrée → §188)
- Modify: `docs/ROADMAP.md` (table row §188 statut → ✅ Livré + ligne "Dernière mise à jour")
- Modify: `docs/implementation-log.md` (new section `## §188` above §189)
- Modify: `docs/claude/files-map.md` (5-7 new entries: parsers, hooks, PaceMatrixInline)

**Step 1: Run final test sweep**

```bash
npm test -- --run 2>&1 | tail -10
npx tsc --noEmit 2>&1 | grep -v "target_pool_size" | grep -i error
```

Expected: net new tests all green, type errors only pre-existing `target_pool_size` (§185 stories).

**Step 2: Apply doc updates**

Format identical to §189 entry already in the log. Use the §188 entry from §6 of the design doc as content backbone.

**Step 3: Commit**

```bash
git add CLAUDE.md docs/ROADMAP.md docs/implementation-log.md docs/claude/files-map.md
git commit -m "docs: §188 — entries CLAUDE/ROADMAP/log/files-map (objectives↔pace link delivered)"
```

---

### Task D2 : Manual smoke test + push

**Step 1: Local smoke test (UI)**

```bash
npm run dev
```

Open http://localhost:8080 in browser :
1. Login as coach
2. Navigate to a swimmer with at least one objective (e.g. "100m NL en 1:05.50, bassin 50m")
3. On the objective card → click "→ Allures"
4. Verify : redirected to pace calculator, swimmer accordion opens, target created or already existing
5. Logout, login as that swimmer
6. Open Objectives page → verify the matrix is rendered below the matching objective

**Step 2: Push**

```bash
git push origin main
```

**Step 3: Verify GitHub Actions**

```bash
gh run list --workflow="Deploy to GitHub Pages" --limit 1
```

Expected: latest run `completed success`.

---

## Risks & mitigations

| Risque | Mitigation |
|---|---|
| `event_code` non standardisé (objectifs anciens en format texte libre) | `parseObjectiveForPace` retourne null → bouton désactivé avec tooltip clair. Aucun crash. |
| Coach modifie objectif après création de la cible → désync silencieuse | Choix assumé (cf. design C1). UI affiche la cible (source de vérité), pas l'objectif. À voir en V2 si remontée. |
| Conflit avec §187 (slider) si livré entre temps | Aucun couplage code. La cible créée par §188 supportera le slider §187 sans modif (le slider s'applique en sortie de moteur). |
| Tests Vitest vs node:test mix | Tous les nouveaux tests utilisent `node:test` (cohérent avec `chrono-types.test.ts`, `objectiveHelpers`, etc.). |
| Mutation `upsertPaceTarget` échoue dans le useEffect prefill | Le toast d'erreur sonner s'affiche, le sessionStorage est déjà clear (consume), le coach peut recliquer depuis l'objectif. |

---

## Hors scope (rappel design)

- Pas de FK `coach_pace_targets.objective_id`
- Pas de sync continue / reverse-sync (objectif ← cible)
- Pas de support des nageurs manuels (pas d'objectifs)
- Pas de PaceMatrixInline pour 4N segmenté (réutilise PaceMatrix standard, le segmenté arrive en V2 si demandé)
