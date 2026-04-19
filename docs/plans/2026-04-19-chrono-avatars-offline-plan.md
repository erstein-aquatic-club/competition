# Chrono Coach — Avatars + Offline Resilience Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add swimmer profile photos to all chrono coach cards (setup / racing / matrix / results) and make the view fully usable if the network fails at any point — photos cached locally, save queue with auto-retry on reconnect.

**Architecture:** Avatars are pre-fetched as base64 dataURLs at setup time and stored in `ChronoSwimmer.avatarUrl`, so the existing `localStorage` chrono backup naturally persists them for offline. Failed saves at results time are pushed to a localStorage queue and replayed on `window` `online` event. A new `<SwimmerAvatar>` component wraps the shadcn `Avatar` with deterministic-color initials fallback.

**Tech Stack:** React 19, TypeScript, Vitest, shadcn `Avatar` (Radix), `localStorage`, `navigator.onLine` / `online` event, existing `chronoReducer` pattern.

**Design doc:** `docs/plans/2026-04-19-chrono-avatars-offline-design.md`.

**Conventions (from CLAUDE.md):**
- Every patch must add a §N entry in `docs/implementation-log.md`, update `docs/ROADMAP.md` + `docs/FEATURES_STATUS.md` + `CLAUDE.md § Chantiers` (currently at §145 → new entry = §146).
- UI/UX refinement (CSS polish) → use `/frontend-design` in Task 7 before final commit.
- Run `npx tsc --noEmit` + `npm test` before any commit. **Do NOT** run `npm run test:rls` (no RLS changes).

---

## Task 1: Add `CHRONO_SAVE_QUEUE` storage key

**Files:**
- Modify: `src/lib/api/client.ts:35-48`

**Step 1: Edit `STORAGE_KEYS`**

Add one entry after `CHRONO_BACKUP`:

```ts
CHRONO_BACKUP: "eac-chrono-backup",
CHRONO_SAVE_QUEUE: "eac-chrono-save-queue",
```

**Step 2: Type check**

Run: `npx tsc --noEmit`
Expected: no new errors.

**Step 3: Commit**

```bash
git add src/lib/api/client.ts
git commit -m "feat(chrono): add CHRONO_SAVE_QUEUE storage key

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Avatar pre-cache module (TDD)

**Files:**
- Create: `src/lib/chrono-avatar-cache.ts`
- Test: `src/lib/__tests__/chrono-avatar-cache.test.ts`

**Step 1: Write the failing test**

Create `src/lib/__tests__/chrono-avatar-cache.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fetchAvatarAsDataUrl } from "../chrono-avatar-cache";

describe("fetchAvatarAsDataUrl", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    // Minimal FileReader polyfill for jsdom (jsdom supports it, but we use a spy)
    vi.useFakeTimers();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.useRealTimers();
  });

  it("returns a base64 data URL on success", async () => {
    const blob = new Blob(["hello"], { type: "image/webp" });
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      blob: async () => blob,
    } as unknown as Response);

    const p = fetchAvatarAsDataUrl("https://example.com/a.webp");
    await vi.runAllTimersAsync();
    const result = await p;
    expect(result).toMatch(/^data:image\/webp;base64,/);
  });

  it("returns null when fetch rejects", async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new TypeError("Failed to fetch"));
    const result = await fetchAvatarAsDataUrl("https://example.com/x.webp");
    expect(result).toBeNull();
  });

  it("returns null when response !ok", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      blob: async () => new Blob([]),
    } as unknown as Response);
    const result = await fetchAvatarAsDataUrl("https://example.com/x.webp");
    expect(result).toBeNull();
  });

  it("returns null when blob exceeds 50 KB", async () => {
    const big = new Blob([new Uint8Array(60_000)], { type: "image/webp" });
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      blob: async () => big,
    } as unknown as Response);
    const result = await fetchAvatarAsDataUrl("https://example.com/big.webp");
    expect(result).toBeNull();
  });

  it("aborts and returns null after 3s timeout", async () => {
    globalThis.fetch = vi.fn().mockImplementation(
      (_url, init: RequestInit | undefined) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () =>
            reject(new DOMException("Aborted", "AbortError")),
          );
        }),
    );
    const p = fetchAvatarAsDataUrl("https://example.com/slow.webp");
    await vi.advanceTimersByTimeAsync(3100);
    const result = await p;
    expect(result).toBeNull();
  });
});
```

**Step 2: Run test, verify it fails**

Run: `npm test -- chrono-avatar-cache`
Expected: all tests FAIL with "Cannot find module '../chrono-avatar-cache'".

**Step 3: Implement module**

Create `src/lib/chrono-avatar-cache.ts`:

```ts
const MAX_BLOB_BYTES = 50 * 1024; // 50 KB safety cap
const FETCH_TIMEOUT_MS = 3000;

export async function fetchAvatarAsDataUrl(url: string): Promise<string | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const res = await fetch(url, { cache: "force-cache", signal: controller.signal });
    if (!res.ok) return null;
    const blob = await res.blob();
    if (blob.size > MAX_BLOB_BYTES) return null;
    return await blobToDataUrl(blob);
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

function blobToDataUrl(blob: Blob): Promise<string | null> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      resolve(typeof result === "string" ? result : null);
    };
    reader.onerror = () => resolve(null);
    reader.readAsDataURL(blob);
  });
}

/**
 * Concurrency-limited map over URLs. Resolves with dataURLs (or null on fail) in input order.
 * Used when pre-caching many avatars at once.
 */
export async function fetchAvatarsConcurrent(
  urls: string[],
  concurrency = 4,
): Promise<(string | null)[]> {
  const results: (string | null)[] = new Array(urls.length).fill(null);
  let next = 0;
  async function worker() {
    while (next < urls.length) {
      const i = next++;
      results[i] = await fetchAvatarAsDataUrl(urls[i]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, urls.length) }, worker));
  return results;
}
```

**Step 4: Run test, verify pass**

Run: `npm test -- chrono-avatar-cache`
Expected: all tests PASS.

**Step 5: Commit**

```bash
git add src/lib/chrono-avatar-cache.ts src/lib/__tests__/chrono-avatar-cache.test.ts
git commit -m "feat(chrono): avatar pre-cache helper (dataURL conversion, 3s timeout, 50KB cap)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: Save queue module (TDD)

**Files:**
- Create: `src/lib/chrono-save-queue.ts`
- Test: `src/lib/__tests__/chrono-save-queue.test.ts`

**Step 1: Write the failing test**

Create `src/lib/__tests__/chrono-save-queue.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  enqueue,
  getPending,
  flush,
  isRetriableError,
  __clearForTests,
  __setReplayerForTests,
  type PendingChronoSave,
} from "../chrono-save-queue";
import { STORAGE_KEYS } from "../api/client";

const QUEUE_KEY = STORAGE_KEYS.CHRONO_SAVE_QUEUE;

function makeRecord(): PendingChronoSave {
  return {
    kind: "record",
    createdAt: Date.now(),
    payload: {
      label: "test",
      status: "sent",
      config: { totalDistanceM: 100, splitDistanceM: 50, seriesCount: 1 },
      swimmers: [],
    } as any,
  };
}

describe("chrono save queue", () => {
  beforeEach(() => {
    localStorage.clear();
    __clearForTests();
  });

  it("isRetriableError identifies network-like errors", () => {
    expect(isRetriableError(new TypeError("Failed to fetch"))).toBe(true);
    expect(isRetriableError(new Error("NetworkError when attempting…"))).toBe(true);
    expect(isRetriableError(new Error("invalid input syntax"))).toBe(false);
    expect(isRetriableError(null)).toBe(false);
  });

  it("enqueue persists item to localStorage", () => {
    enqueue(makeRecord());
    expect(getPending()).toHaveLength(1);
    expect(JSON.parse(localStorage.getItem(QUEUE_KEY) ?? "[]")).toHaveLength(1);
  });

  it("getPending returns [] on corrupted JSON", () => {
    localStorage.setItem(QUEUE_KEY, "{bad json");
    expect(getPending()).toEqual([]);
  });

  it("flush removes entries when replay succeeds", async () => {
    __setReplayerForTests(async () => { /* ok */ });
    enqueue(makeRecord());
    enqueue(makeRecord());
    const res = await flush();
    expect(res).toEqual({ succeeded: 2, failed: 0 });
    expect(getPending()).toHaveLength(0);
  });

  it("flush keeps entry when replay fails with retriable error", async () => {
    __setReplayerForTests(async () => { throw new TypeError("Failed to fetch"); });
    enqueue(makeRecord());
    const res = await flush();
    expect(res).toEqual({ succeeded: 0, failed: 1 });
    expect(getPending()).toHaveLength(1);
  });

  it("flush drops entry when replay fails with non-retriable error", async () => {
    __setReplayerForTests(async () => { throw new Error("Forbidden"); });
    enqueue(makeRecord());
    const res = await flush();
    expect(res).toEqual({ succeeded: 0, failed: 1 });
    expect(getPending()).toHaveLength(0); // dropped to avoid infinite loop
  });
});
```

**Step 2: Run test, verify it fails**

Run: `npm test -- chrono-save-queue`
Expected: FAIL — module not found.

**Step 3: Implement module**

Create `src/lib/chrono-save-queue.ts`:

```ts
import { STORAGE_KEYS } from "./api/client";
import type { ChronoRecordInput, SwimExerciseLogInput } from "./api/types";
import { createChronoRecord } from "./api/chrono-records";
import { createStandaloneSwimLog } from "./api/swim-logs";

export type PendingChronoSave =
  | { kind: "record"; payload: ChronoRecordInput; createdAt: number }
  | { kind: "export"; payload: { authUid: string; log: SwimExerciseLogInput }; createdAt: number };

const QUEUE_KEY = STORAGE_KEYS.CHRONO_SAVE_QUEUE;

// Indirection so tests can inject a fake replayer.
type Replayer = (item: PendingChronoSave) => Promise<void>;
let replayer: Replayer = async (item) => {
  if (item.kind === "record") {
    await createChronoRecord(item.payload);
  } else {
    await createStandaloneSwimLog(item.payload.authUid, item.payload.log);
  }
};

export function __setReplayerForTests(r: Replayer): void {
  replayer = r;
}
export function __clearForTests(): void {
  // default replayer reinjection if needed
}

export function isRetriableError(err: unknown): boolean {
  if (err instanceof TypeError) return true; // fetch() threw — network-level
  const msg = (err as { message?: string })?.message ?? "";
  return /NetworkError|Failed to fetch|network/i.test(msg);
}

export function getPending(): PendingChronoSave[] {
  try {
    const raw = localStorage.getItem(QUEUE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as PendingChronoSave[]) : [];
  } catch {
    localStorage.removeItem(QUEUE_KEY);
    return [];
  }
}

function writePending(items: PendingChronoSave[]): void {
  try {
    localStorage.setItem(QUEUE_KEY, JSON.stringify(items));
  } catch {
    // Quota exceeded — drop oldest and retry once
    localStorage.setItem(QUEUE_KEY, JSON.stringify(items.slice(-10)));
  }
}

export function enqueue(item: PendingChronoSave): void {
  const current = getPending();
  current.push(item);
  writePending(current);
  notifySubscribers();
}

export async function flush(): Promise<{ succeeded: number; failed: number }> {
  const initial = getPending();
  if (initial.length === 0) return { succeeded: 0, failed: 0 };

  // Clear-before-retry: pop items into a working copy, re-enqueue only retriable failures.
  writePending([]);
  let succeeded = 0;
  let failed = 0;
  const retained: PendingChronoSave[] = [];

  for (const item of initial) {
    try {
      await replayer(item);
      succeeded++;
    } catch (err) {
      failed++;
      if (isRetriableError(err)) {
        retained.push(item);
      } else {
        console.error("[chrono-save-queue] dropping non-retriable item", err);
      }
    }
  }

  if (retained.length > 0) writePending(retained);
  notifySubscribers();
  return { succeeded, failed };
}

// ── Subscribers (pendingCount UI) ────────────────────────────────
const listeners = new Set<() => void>();

export function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function notifySubscribers(): void {
  listeners.forEach((fn) => fn());
}
```

**Step 4: Run test, verify pass**

Run: `npm test -- chrono-save-queue`
Expected: PASS (6 tests).

**Step 5: Commit**

```bash
git add src/lib/chrono-save-queue.ts src/lib/__tests__/chrono-save-queue.test.ts
git commit -m "feat(chrono): offline save queue with auto-retry on network errors

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: Reducer action `UPDATE_SWIMMER_AVATAR` (TDD)

**Files:**
- Modify: `src/lib/chrono-reducer.ts:12-33` (action union), `:94-` (switch statement)
- Modify: `src/lib/__tests__/chrono-reducer.test.ts` (append)

**Step 1: Write the failing test — append to `src/lib/__tests__/chrono-reducer.test.ts`**

Append at end of file:

```ts
describe("UPDATE_SWIMMER_AVATAR", () => {
  it("replaces avatarUrl of the targeted swimmer", () => {
    const s = reduce(
      initialChronoState,
      { type: "ADD_SWIMMER", swimmer: reg(1, 1, 1) },
      { type: "ADD_SWIMMER", swimmer: reg(2, 1, 2) },
      { type: "UPDATE_SWIMMER_AVATAR", key: "a:1", avatarUrl: "data:image/webp;base64,AAA" },
    );
    expect(s.swimmers.find((x) => x.key === "a:1")?.avatarUrl)
      .toBe("data:image/webp;base64,AAA");
    expect(s.swimmers.find((x) => x.key === "a:2")?.avatarUrl).toBeNull();
  });

  it("is a no-op for unknown key", () => {
    const before = reduce(
      initialChronoState,
      { type: "ADD_SWIMMER", swimmer: reg(1) },
    );
    const after = chronoReducer(before, {
      type: "UPDATE_SWIMMER_AVATAR",
      key: "a:999",
      avatarUrl: "data:…",
    });
    expect(after.swimmers).toEqual(before.swimmers);
  });

  it("accepts null to clear avatar", () => {
    const s = reduce(
      initialChronoState,
      { type: "ADD_SWIMMER", swimmer: { ...reg(1), avatarUrl: "data:old" } },
      { type: "UPDATE_SWIMMER_AVATAR", key: "a:1", avatarUrl: null },
    );
    expect(s.swimmers[0].avatarUrl).toBeNull();
  });
});
```

**Step 2: Run test, verify it fails**

Run: `npm test -- chrono-reducer`
Expected: FAIL — TypeScript error "UPDATE_SWIMMER_AVATAR is not assignable to ChronoAction".

**Step 3: Add action type**

In `src/lib/chrono-reducer.ts`, add to the union (line 33, before the closing `| { type: "RESTORE_STATE"; ... };`):

```ts
  | { type: "UPDATE_SWIMMER_AVATAR"; key: string; avatarUrl: string | null }
  | { type: "RESTORE_STATE"; state: ChronoState };
```

**Step 4: Implement the case**

In the same file, add to the `switch (action.type)` (anywhere before `default`, match style of `REMOVE_SWIMMER`):

```ts
    case "UPDATE_SWIMMER_AVATAR": {
      let changed = false;
      const swimmers = state.swimmers.map((s) => {
        if (s.key !== action.key) return s;
        changed = true;
        return { ...s, avatarUrl: action.avatarUrl };
      });
      if (!changed) return state;
      return { ...state, swimmers };
    }
```

**Step 5: Run test, verify pass**

Run: `npm test -- chrono-reducer`
Expected: PASS (all existing + 3 new tests).

**Step 6: Commit**

```bash
git add src/lib/chrono-reducer.ts src/lib/__tests__/chrono-reducer.test.ts
git commit -m "feat(chrono): UPDATE_SWIMMER_AVATAR reducer action

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: `<SwimmerAvatar>` component

**Files:**
- Create: `src/components/chrono/SwimmerAvatar.tsx`

**Step 1: Implement component**

Create `src/components/chrono/SwimmerAvatar.tsx`:

```tsx
import { Avatar, AvatarFallback, AvatarImage } from "../ui/avatar";
import type { ChronoSwimmer } from "../../lib/chrono-types";

type AvatarSize = "xs" | "sm" | "md";

const SIZE_CLASS: Record<AvatarSize, string> = {
  xs: "h-6 w-6 text-[9px]",   // 24px
  sm: "h-8 w-8 text-[11px]",  // 32px
  md: "h-10 w-10 text-sm",    // 40px
};

export function SwimmerAvatar({
  swimmer,
  size = "sm",
  className = "",
}: {
  swimmer: Pick<ChronoSwimmer, "displayName" | "avatarUrl">;
  size?: AvatarSize;
  className?: string;
}) {
  const initials = computeInitials(swimmer.displayName);
  const { bg, fg } = colorFromName(swimmer.displayName);
  return (
    <Avatar className={`${SIZE_CLASS[size]} ring-1 ring-border/40 ${className}`}>
      {swimmer.avatarUrl && (
        <AvatarImage
          src={swimmer.avatarUrl}
          alt={swimmer.displayName}
          loading="lazy"
          decoding="async"
        />
      )}
      <AvatarFallback
        className="font-bold uppercase tracking-tight"
        style={{ backgroundColor: bg, color: fg }}
      >
        {initials}
      </AvatarFallback>
    </Avatar>
  );
}

function computeInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function colorFromName(name: string): { bg: string; fg: string } {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 31 + name.charCodeAt(i)) | 0;
  }
  const hue = Math.abs(hash) % 360;
  return { bg: `hsl(${hue}, 55%, 45%)`, fg: "#fff" };
}
```

**Step 2: Type check**

Run: `npx tsc --noEmit`
Expected: no errors.

**Step 3: Commit**

```bash
git add src/components/chrono/SwimmerAvatar.tsx
git commit -m "feat(chrono): SwimmerAvatar component with deterministic-color initials fallback

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: Wire avatar pre-cache into `ChronoSetup`

**Files:**
- Modify: `src/components/chrono/ChronoSetup.tsx`

**Step 1: Add hook & usage**

At the top of the file, import:

```tsx
import { useEffect } from "react";
import { fetchAvatarAsDataUrl } from "../../lib/chrono-avatar-cache";
import { SwimmerAvatar } from "./SwimmerAvatar";
```

Inside the component, immediately after the swimmers/selection state is available (find the main component function), add the pre-fetch effect:

```tsx
// Pre-cache avatars to base64 dataURL so the race phase survives offline.
useEffect(() => {
  const pending = state.swimmers.filter(
    (s) => s.kind === "registered" && s.avatarUrl && !s.avatarUrl.startsWith("data:"),
  );
  if (pending.length === 0) return;
  let cancelled = false;
  (async () => {
    for (const s of pending) {
      const url = s.avatarUrl;
      if (!url) continue;
      const dataUrl = await fetchAvatarAsDataUrl(url);
      if (cancelled || !dataUrl) continue;
      dispatch({ type: "UPDATE_SWIMMER_AVATAR", key: s.key, avatarUrl: dataUrl });
    }
  })();
  return () => { cancelled = true; };
}, [state.swimmers, dispatch]);
```

**Step 2: Render `<SwimmerAvatar>` in the selected-swimmers list and picker**

Find the two render spots (selected swimmers list, athlete multi-select picker) by grepping:

```bash
grep -n "display_name\|displayName" src/components/chrono/ChronoSetup.tsx
```

In each row render, add `<SwimmerAvatar swimmer={...} size="sm" className="shrink-0" />` **before** the name span (or before the first text element of the row). For athlete picker items, pass a synthetic object `{ displayName: a.display_name, avatarUrl: a.avatar_url }`.

**Step 3: Run type check + tests**

Run: `npx tsc --noEmit && npm test`
Expected: all pass.

**Step 4: Commit**

```bash
git add src/components/chrono/ChronoSetup.tsx
git commit -m "feat(chrono): avatars in setup + background dataURL pre-cache

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 7: Avatar in `ChronoRace` `SwimmerCard` + matrix

**Files:**
- Modify: `src/components/chrono/ChronoRace.tsx`

**Step 1: Propagate swimmer data to `SwimmerCard`**

`SwimmerCard` currently receives `displayName` as a string prop (line 233-257). We need `avatarUrl` too. Either:
- (a) Add `avatarUrl: string | null` prop and pass it from the matrix (line 720),
- (b) Pass the whole `swimmer: ChronoSwimmer` object.

Use (a) for minimal surface:

In the prop type, add:
```ts
  avatarUrl: string | null;
```

In the matrix render (line 720-735), pass:
```tsx
<SwimmerCard
  key={s.key}
  swimmerKey={s.key}
  displayName={s.displayName}
  avatarUrl={s.avatarUrl}
  // …rest
/>
```

**Step 2: Render `<SwimmerAvatar>` in row 1**

At the top of the file, add:
```tsx
import { SwimmerAvatar } from "./SwimmerAvatar";
```

Find row 1 (around line 365-380), change:
```tsx
<div className="flex items-center gap-1.5 px-2.5 pt-2 pb-0.5">
  <span className={`inline-flex h-5 min-w-[1.75rem] ...`}>…</span>
  <SwimmerAvatar
    swimmer={{ displayName, avatarUrl }}
    size="xs"
    className="shrink-0"
  />
  <span className={`text-sm font-semibold ...`}>{displayName}</span>
</div>
```

**Step 3: Type check**

Run: `npx tsc --noEmit`
Expected: no errors.

**Step 4: Commit**

```bash
git add src/components/chrono/ChronoRace.tsx
git commit -m "feat(chrono): 24px avatar on SwimmerCard race row 1

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 8: Avatar in `ChronoResults` ranking table

**Files:**
- Modify: `src/components/chrono/ChronoResults.tsx`

**Step 1: Import**

```tsx
import { SwimmerAvatar } from "./SwimmerAvatar";
```

**Step 2: Insert avatar column**

Locate the ranking row rendering (the grid with rank / name / wave / total / splits). Add a `<SwimmerAvatar swimmer={entry.swimmer} size="sm" />` element **inside the name cell**, to the left of the name text. Use `size="xs"` on narrow viewports:

```tsx
<div className="flex items-center gap-2 min-w-0">
  <SwimmerAvatar swimmer={entry.swimmer} size="sm" className="shrink-0 md:h-8 md:w-8 h-6 w-6" />
  <span className="truncate">{entry.swimmer.displayName}</span>
</div>
```

No grid-column change needed (name cell just gets an inline avatar).

**Step 3: Type check**

Run: `npx tsc --noEmit`
Expected: no errors.

**Step 4: Commit**

```bash
git add src/components/chrono/ChronoResults.tsx
git commit -m "feat(chrono): avatars in results ranking table

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 9: Wire save queue into `ChronoResults` error paths

**Files:**
- Modify: `src/components/chrono/ChronoResults.tsx`
- Modify: `src/lib/chrono-save-queue.ts` (if default replayer needs adjustment — probably not)

**Step 1: Import queue**

```tsx
import { enqueue, isRetriableError } from "../../lib/chrono-save-queue";
```

**Step 2: Modify `handleSaveDraft` (around line 214)**

Wrap the error branch:

```tsx
} catch (err: any) {
  if (isRetriableError(err)) {
    enqueue({
      kind: "record",
      payload: buildChronoRecordInput(state, "draft"),
      createdAt: Date.now(),
    });
    toast.info("Brouillon sauvegardé localement — renvoi auto dès retour réseau");
    onSaveDraft?.();
  } else {
    toast.error(err.message || "Erreur de sauvegarde");
  }
}
```

**Step 3: Modify `handleExportAll` (around line 246)**

Inside the `Promise.allSettled` loop result inspection (around line 280-290), detect retriable failures and enqueue them. Replace the existing failure branch:

```tsx
for (let i = 0; i < results.length; i++) {
  const result = results[i];
  const entry = swimmers[i];
  const key = entry.swimmer.key;
  if (result.status === "fulfilled") {
    newStatuses.set(key, "sent");
    successCount++;
    continue;
  }
  // result.status === "rejected"
  if (isRetriableError(result.reason)) {
    const authUid = await resolveAuthUid(entry.swimmer.athleteId!).catch(() => null);
    if (authUid) {
      enqueue({
        kind: "export",
        payload: {
          authUid,
          log: {
            exercise_label: "Chrono coach",
            split_times: flattenSplits(entry.splitsByRep),
            notes: `Série chrono — Ligne ${entry.swimmer.lane}`,
          },
          createdAt: Date.now(),
        } as any,
      });
      newStatuses.set(key, "queued" as any); // existing type likely accepts string; widen if needed
      successCount++; // treat as "accepted"
    } else {
      newStatuses.set(key, "error");
      errorCount++;
    }
  } else {
    newStatuses.set(key, "error");
    errorCount++;
  }
}
```

Adjust the toast at the end so that if all failures were queued, show `toast.info` instead of `toast.error`.

**Step 4: Also queue the record on network error (line 295-297)**

Currently:
```tsx
try {
  await createChronoRecord(buildChronoRecordInput(state, "sent"));
} catch { /* non-blocking */ }
```

Replace:
```tsx
try {
  await createChronoRecord(buildChronoRecordInput(state, "sent"));
} catch (err) {
  if (isRetriableError(err)) {
    enqueue({
      kind: "record",
      payload: buildChronoRecordInput(state, "sent"),
      createdAt: Date.now(),
    });
  }
}
```

**Step 5: Type check + tests**

Run: `npx tsc --noEmit && npm test`
Expected: pass.

**Step 6: Commit**

```bash
git add src/components/chrono/ChronoResults.tsx
git commit -m "feat(chrono): enqueue failed saves on network errors instead of losing them

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 10: Mount save queue hook + badge in `CoachChronoScreen`

**Files:**
- Modify: `src/pages/coach/CoachChronoScreen.tsx`

**Step 1: Add hook and badge**

Top imports:
```tsx
import { flush, getPending, subscribe } from "../../lib/chrono-save-queue";
```

Inside `CoachChronoScreen`:

```tsx
const [pendingCount, setPendingCount] = useState<number>(() => getPending().length);

useEffect(() => {
  const refresh = () => setPendingCount(getPending().length);
  const unsubscribe = subscribe(refresh);
  const onOnline = () => { flush().finally(refresh); };
  window.addEventListener("online", onOnline);
  // Initial attempt in case the online event happened before mount
  if (navigator.onLine) flush().finally(refresh);
  return () => {
    unsubscribe();
    window.removeEventListener("online", onOnline);
  };
}, []);

const handleRetryQueue = useCallback(async () => {
  const res = await flush();
  setPendingCount(getPending().length);
  if (res.succeeded > 0) toast.success(`${res.succeeded} sauvegarde(s) renvoyée(s)`);
  else if (res.failed > 0) toast.error("Renvoi impossible — pas de réseau ?");
}, []);
```

**Step 2: Render badge above setup**

In the JSX, inside the `{state.phase !== "racing" && (…)}` block, add **above** the existing restore banner:

```tsx
{pendingCount > 0 && state.phase !== "racing" && (
  <div className="mb-4 rounded-xl border border-amber-400/50 bg-amber-950/60 p-4 flex items-center justify-between gap-4 shadow-lg shadow-amber-900/20">
    <div className="flex items-center gap-3">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-amber-500/20">
        <Timer className="h-4 w-4 text-amber-400" />
      </div>
      <p className="text-sm font-medium text-amber-100">
        {pendingCount} sauvegarde{pendingCount > 1 ? "s" : ""} en attente — renvoi auto dès retour réseau
      </p>
    </div>
    <Button
      size="sm"
      className="bg-amber-500 text-amber-950 font-semibold hover:bg-amber-400"
      onClick={handleRetryQueue}
    >
      Réessayer
    </Button>
  </div>
)}
```

**Step 3: Add `QuotaExceededError` safety net**

In the existing backup effect (line 84-90), replace:

```tsx
useEffect(() => {
  if (state.swimmers.length > 0) {
    try {
      localStorage.setItem(BACKUP_KEY, serializeState(state));
    } catch {
      // Avatar dataURLs may have blown the quota — retry without them
      try {
        const lean: ChronoState = {
          ...state,
          swimmers: state.swimmers.map((s) => ({ ...s, avatarUrl: null })),
        };
        localStorage.setItem(BACKUP_KEY, serializeState(lean));
      } catch {
        localStorage.removeItem(BACKUP_KEY);
      }
    }
  }
}, [state]);
```

**Step 4: Import missing `toast`**

At the top of the file, ensure `import { toast } from "sonner";` is present (it may already be — check first).

**Step 5: Type check + tests**

Run: `npx tsc --noEmit && npm test`
Expected: pass.

**Step 6: Commit**

```bash
git add src/pages/coach/CoachChronoScreen.tsx
git commit -m "feat(chrono): save queue badge + auto-flush on online + quota safety net

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 11: UI polish via `/frontend-design`

**Files:**
- Modify: any of the touched components, based on design review.

**Step 1: Invoke `/frontend-design`**

Per `~/.claude/CLAUDE.md` rule 2, UI changes require this skill. Run the slash command and ask it to review:

- `SwimmerCard` row 1 with avatar (is the 24px size right? is the gap visually balanced?)
- `ChronoSetup` swimmer rows (alignment, spacing)
- `ChronoResults` ranking row (grid alignment with the new avatar)
- `PendingSaveBadge` inline banner (matches the restore banner style from the design doc)

**Step 2: Apply recommended tweaks, re-run type check + tests**

Run: `npx tsc --noEmit && npm test`
Expected: pass.

**Step 3: Commit**

```bash
git add -A
git commit -m "chore(chrono): UI polish from /frontend-design review

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 12: Manual validation checklist

No code change — perform these checks on the dev server.

**Step 1: Start dev server**

Run: `npm run dev` (localhost:8080)

**Step 2: Run through the checklist**

- [ ] `/#/coach/chrono` setup → add 3 nageurs avec photos → console DevTools : `localStorage.getItem("eac-chrono-backup")` contient des `data:image/...base64`
- [ ] Avatars visibles sur : liste setup, picker multi-select
- [ ] Démarrer série → avatars visibles 24 px sur chaque `SwimmerCard` en phase racing
- [ ] Avatars visibles dans la matrice lane×wave (c'est la même card)
- [ ] DevTools → Network → Offline → hard refresh → banner "Reprendre série" → reprendre → avatars toujours visibles
- [ ] Terminer série → `ChronoResults` → avatars dans le classement
- [ ] Toujours offline : clic "Envoyer aux nageurs" → toast info "sauvegardé localement" → `localStorage.getItem("eac-chrono-save-queue")` non vide
- [ ] Retour setup → badge "X sauvegarde(s) en attente"
- [ ] Remettre réseau online → badge disparaît en quelques secondes, toast succès
- [ ] Nageur `manual` (sans athleteId) → fallback initiales correctes
- [ ] Nageur `registered` sans photo (avatar_url null) → fallback initiales

**Step 3: Lighthouse / perf spot-check (mobile, racing phase)**

- [ ] FPS reste stable pendant course (DevTools → Performance → record 10s)
- [ ] Pas de warning React sur key duplicate ou props

---

## Task 13: Documentation mise à jour

**Files:**
- Modify: `docs/implementation-log.md` — append §146 entry
- Modify: `docs/ROADMAP.md` — add §146 line + update "Dernière mise à jour"
- Modify: `docs/FEATURES_STATUS.md` — update chrono row to reflect offline readiness
- Modify: `CLAUDE.md` l.74 — update "Dernière entrée en date : §146"
- Modify: `docs/claude/files-map.md` — add new files (SwimmerAvatar, chrono-avatar-cache, chrono-save-queue)

**Step 1: §146 entry in implementation-log.md**

Follow the exact pattern of §145 (the most recent entry). Cover: contexte, changements, fichiers modifiés, tests, décisions (dataURL cache vs SW vs IndexedDB, clear-before-retry vs clientId), limites.

**Step 2: Update ROADMAP.md header**

`*Dernière mise à jour : 2026-04-19*`

**Step 3: Add line in ROADMAP.md for §146**

Reference design + plan docs.

**Step 4: Update CLAUDE.md l.74**

`Dernière entrée en date : §146 (...)`.

**Step 5: Measure file sizes and update files-map.md**

```bash
wc -l src/components/chrono/SwimmerAvatar.tsx src/lib/chrono-avatar-cache.ts src/lib/chrono-save-queue.ts
```

Add lines only for files ≥ 150 LOC **or** architectural. SwimmerAvatar probably < 150 LOC → skip. `chrono-save-queue.ts` likely > 100 LOC → add only if ≥ 150.

For existing files that grew > 30%, re-measure: `wc -l src/components/chrono/ChronoRace.tsx src/components/chrono/ChronoSetup.tsx src/components/chrono/ChronoResults.tsx src/pages/coach/CoachChronoScreen.tsx` and update if threshold crossed.

**Step 6: Final commit**

```bash
git add docs/ CLAUDE.md
git commit -m "docs(chrono): §146 — avatars + offline resilience

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Wrap-up

After all tasks complete:

**Sanity pass:**
- `npx tsc --noEmit` → clean
- `npm test` → all pass (note: pre-existing failure in `TimesheetHelpers.test.ts` per MEMORY.md, ignore)
- `git log --oneline -15` → 12-13 focused commits telling a clear story

**Do NOT:**
- Deploy locally (`npx gh-pages`) — push to `main` or use `gh workflow run "Deploy to GitHub Pages"` per CLAUDE.md § Déploiement.
- Run `npm run test:rls` (no RLS changes).

**Known edge not addressed (documented in implementation-log as "limites") :**
- Avatar pre-cache misses photos for athletes added while offline in a future session that didn't have them before. Acceptable: coach plans series in club, photos cached once, online only required once per nageur.
- Rare duplicate saves if flush is interrupted mid-replay. Mitigated by clear-before-retry (single in-flight replay at a time), but in a kill -9 scenario a second flush could produce dups. Design doc flags this as accepted trade-off.
