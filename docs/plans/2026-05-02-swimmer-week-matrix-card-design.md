# SwimmerWeekMatrixCard — design

## Goal

Add a compact at-a-glance "Ma semaine" card on the swimmer home page (`SwimmerHome.tsx`),
analog to the coach's matrix card on `Coach.tsx`. Lets the swimmer see in one tap:

1. Which slots have a coach session assigned.
2. Which past slots are missing a feedback (ressenti).

## Placement

- **File**: `SwimmerHome.tsx`, Section G.
- **Order**: compact card on top, existing detailed `SwimmerWeekSlots` kept below. (Validated.)

## Layout

7-day × 2 (Matin / Aprèm) grid, same DOM shape as `Coach.tsx` § B. Today is highlighted
with a primary ring + underline. Tapping the card navigates to `/natation`.

Footer:

- Left: `{done}` séances faites / `{plannedPast}` planifiées passées.
- Right (one of):
  - `Y ressentis à compléter` (amber) — only if Y > 0.
  - `Semaine complète ✓` (emerald) — when all past planned slots are logged.
  - `Aucun créneau cette semaine` (muted) — when no slots configured.

## Cell states

Per cell `(date, half-day)` — half-day = morning if slot.start < 13:00, else evening:

| State | Visual | Condition |
|---|---|---|
| `none` | small dot | no slot this half-day |
| `unassigned` | dashed amber square | slot exists, no coach session assigned, slot date >= today |
| `assigned-future` | sky filled square | slot has a session, slot date > today |
| `assigned-today` | sky filled square + ring | slot has a session, slot date == today |
| `done` | emerald square + check | past slot, session assigned, feedback present |
| `missed-feedback` | red square + alert | past slot, session assigned, feedback missing |
| `past-no-session` | muted dot | past slot, no session assigned (free training, neutral — validated) |

Multiple slots in the same half-day → fold to the most "actionable" state in this priority:
`missed-feedback` > `unassigned` > `assigned-today` > `assigned-future` > `done` > `past-no-session` > `none`.
Show a `n×` badge if 2+ slots.

## Data sources

- `useSlotCalendar()` — already in use by `SwimmerWeekSlots`. Returns `instancesByDate` with
  `state: "published"|"empty"|"draft"|"cancelled"` and `assignment` per instance.
  - `state === "empty"` → cell is `unassigned` (or `past-no-session` if past).
  - `state === "published"` with assignment → check feedback presence.
  - `state === "draft"` or `cancelled` → ignore (treat as no session).
- `getSwimmerSessions(userId, mondayIso, sundayIso, false)` — flat row per resolved slot
  (already used for today). Each row links a `swimmer_slot_id` and an `assignment_id` and
  has a `date`. A row in this list whose `(date, slot)` match an instance → feedback present
  (the row is created when the swimmer logs a session).
  - Actually rechecked: a "session row" exists when the swimmer has logged it. The card
    treats `(assignment_id ∈ loggedAssignmentIds)` OR `(date__slot ∈ loggedSlotKeys)` as
    "feedback saved" — same lookup as `buildTodaySessionCompletionLookup` in `SwimmerHome.tsx`.

## Pure classifier

```ts
type CellState =
  | "none" | "unassigned"
  | "assigned-future" | "assigned-today"
  | "done" | "missed-feedback" | "past-no-session";

type ClassifyInput = {
  state: "empty" | "published" | "draft" | "cancelled" | undefined;
  hasAssignment: boolean;
  hasFeedback: boolean;
  isPast: boolean;
  isToday: boolean;
};

function classifyCell(input: ClassifyInput): CellState
```

Tested with vitest in `src/components/swimmer/__tests__/swimmerWeekMatrix.test.ts`.

## Tap behavior

- Whole card → `navigate("/natation")`.
- Footer "Y ressentis à compléter" → same destination (deep-link refinement deferred).

## YAGNI exclusions

- No week navigation in this card (current week only — swipe lives in `/natation`).
- No Groupe/Perso toggle (the card is read-only summary of group slots).
- No deep link to a specific slot.
- No service worker / offline considerations beyond what `useSlotCalendar` already does.

## File map impact

- New: `src/components/swimmer/SwimmerWeekMatrixCard.tsx` (~250 LOC).
- New: `src/components/swimmer/__tests__/swimmerWeekMatrix.test.ts` (pure unit tests).
- Modified: `src/pages/SwimmerHome.tsx` (~ +6 LOC mount).

## Test plan

- Pure classifier: 7 states × edge cases (today-as-past=false, fold priority).
- Manual: load home page in dev with a known swimmer → check the card matches the detailed view below.

## Out of scope (future)

- Distinguishing swim vs muscu in cells (icon overlay).
- Past weeks browsing.
- Push reminder when `missed-feedback > 0`.
