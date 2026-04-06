# Multi-Groups / Multi-Coaches Slot Management — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the row-based slot assignment form (1 row = 1 group + 1 coach + lane_count) with independent multi-select for groups and coaches, plus a global lane count.

**Architecture:** New DB table `training_slot_coaches` decouples coaches from groups. `lane_count` moves from `training_slot_assignments` to `training_slots`. The form uses chip-toggle multi-select instead of dropdowns. All downstream consumers (calendar, timeline, session assignment) are updated.

**Tech Stack:** Supabase migration (SQL), React, TypeScript, Tailwind, shadcn/ui Checkbox.

**Design doc:** `docs/plans/2026-04-06-slot-multi-groups-coaches-design.md`

---

### Task 1: Database Migration

**Files:**
- Create: `supabase/migrations/00069_slot_multi_coaches.sql`

**Step 1: Write the migration**

```sql
-- 1. Add lane_count to training_slots (global)
ALTER TABLE training_slots
ADD COLUMN IF NOT EXISTS lane_count SMALLINT;

-- 2. Migrate lane_count from assignments to slots (take MAX per slot)
UPDATE training_slots ts
SET lane_count = sub.max_lanes
FROM (
  SELECT slot_id, MAX(lane_count) AS max_lanes
  FROM training_slot_assignments
  WHERE lane_count IS NOT NULL
  GROUP BY slot_id
) sub
WHERE ts.id = sub.slot_id;

-- 3. Create training_slot_coaches table
CREATE TABLE training_slot_coaches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slot_id UUID NOT NULL REFERENCES training_slots(id) ON DELETE CASCADE,
  coach_id INTEGER NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (slot_id, coach_id)
);

CREATE INDEX idx_training_slot_coaches_slot ON training_slot_coaches (slot_id);

-- 4. Migrate existing coach_id from assignments to new table
INSERT INTO training_slot_coaches (slot_id, coach_id)
SELECT DISTINCT slot_id, coach_id
FROM training_slot_assignments
ON CONFLICT (slot_id, coach_id) DO NOTHING;

-- 5. Drop coach_id and lane_count from assignments
ALTER TABLE training_slot_assignments
DROP COLUMN IF EXISTS coach_id,
DROP COLUMN IF EXISTS lane_count;

-- 6. RLS for training_slot_coaches (same as training_slot_assignments)
ALTER TABLE training_slot_coaches ENABLE ROW LEVEL SECURITY;

CREATE POLICY slot_coaches_select ON training_slot_coaches
  FOR SELECT USING (true);

CREATE POLICY slot_coaches_write ON training_slot_coaches
  FOR ALL USING (app_user_role() IN ('admin', 'coach'));
```

**Step 2: Apply migration locally**

Run: `npx supabase db push` (or apply via Supabase dashboard)

**Step 3: Commit**

```bash
git add supabase/migrations/00069_slot_multi_coaches.sql
git commit -m "migration: decouple coaches from slot assignments, add lane_count to slots (§96)"
```

---

### Task 2: Update TypeScript Types

**Files:**
- Modify: `src/lib/api/types.ts:622-667`

**Step 1: Update types**

Replace the training slot types block (lines 622-667) with:

```typescript
export interface TrainingSlot {
  id: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  location: string;
  is_active: boolean;
  created_by: number | null;
  created_at: string;
  lane_count: number | null;
  assignments: TrainingSlotAssignment[];
  coaches: TrainingSlotCoach[];
}

export interface TrainingSlotAssignment {
  id: string;
  slot_id: string;
  group_id: number;
  group_name: string;
}

export interface TrainingSlotCoach {
  id: string;
  slot_id: string;
  coach_id: number;
  coach_name: string;
}

export interface TrainingSlotInput {
  day_of_week: number;
  start_time: string;
  end_time: string;
  location: string;
  lane_count: number | null;
  group_ids: number[];
  coach_ids: number[];
}
```

**Step 2: Run type check to see what breaks**

Run: `npx tsc --noEmit 2>&1 | grep -v "src/main.tsx\|CompetitionDetail\|stories" | head -40`

Note all errors — these are the files to fix in subsequent tasks.

**Step 3: Commit**

```bash
git add src/lib/api/types.ts
git commit -m "types: update TrainingSlot types for multi-groups/coaches (§96)"
```

---

### Task 3: Update API Layer

**Files:**
- Modify: `src/lib/api/training-slots.ts` (full file)

**Step 1: Update `getTrainingSlots()`**

Replace lines 16-65. The new version fetches slots, assignments (groups only), AND coaches separately, then joins them:

```typescript
export async function getTrainingSlots(): Promise<TrainingSlot[]> {
  if (!canUseSupabase()) return [];

  const { data: slots, error: slotsErr } = await supabase
    .from("training_slots")
    .select("*")
    .eq("is_active", true)
    .order("day_of_week")
    .order("start_time");
  if (slotsErr) throw new Error(slotsErr.message);
  if (!slots || slots.length === 0) return [];

  const slotIds = slots.map((s: any) => s.id);

  // Fetch group assignments
  const { data: assignments, error: assignErr } = await supabase
    .from("training_slot_assignments")
    .select("*, groups:group_id(name)")
    .in("slot_id", slotIds);
  if (assignErr) throw new Error(assignErr.message);

  // Fetch coach assignments
  const { data: coachRows, error: coachErr } = await supabase
    .from("training_slot_coaches")
    .select("*, coach:coach_id(display_name)")
    .in("slot_id", slotIds);
  if (coachErr) throw new Error(coachErr.message);

  // Build lookups
  const assignmentsBySlot = new Map<string, TrainingSlotAssignment[]>();
  for (const a of assignments ?? []) {
    const mapped: TrainingSlotAssignment = {
      id: a.id,
      slot_id: a.slot_id,
      group_id: a.group_id,
      group_name: (a as any).groups?.name ?? "?",
    };
    const list = assignmentsBySlot.get(a.slot_id) ?? [];
    list.push(mapped);
    assignmentsBySlot.set(a.slot_id, list);
  }

  const coachesBySlot = new Map<string, TrainingSlotCoach[]>();
  for (const c of coachRows ?? []) {
    const mapped: TrainingSlotCoach = {
      id: c.id,
      slot_id: c.slot_id,
      coach_id: c.coach_id,
      coach_name: (c as any).coach?.display_name ?? "?",
    };
    const list = coachesBySlot.get(c.slot_id) ?? [];
    list.push(mapped);
    coachesBySlot.set(c.slot_id, list);
  }

  return slots.map((s: any) => ({
    id: s.id,
    day_of_week: s.day_of_week,
    start_time: s.start_time,
    end_time: s.end_time,
    location: s.location,
    is_active: s.is_active,
    created_by: s.created_by,
    created_at: s.created_at,
    lane_count: s.lane_count ?? null,
    assignments: assignmentsBySlot.get(s.id) ?? [],
    coaches: coachesBySlot.get(s.id) ?? [],
  }));
}
```

**Step 2: Update `createTrainingSlot()`**

Replace lines 76-108:

```typescript
export async function createTrainingSlot(input: TrainingSlotInput): Promise<TrainingSlot> {
  if (!canUseSupabase()) throw new Error("Supabase not available");

  const { data: slot, error: slotErr } = await supabase
    .from("training_slots")
    .insert({
      day_of_week: input.day_of_week,
      start_time: input.start_time,
      end_time: input.end_time,
      location: input.location,
      lane_count: input.lane_count,
    })
    .select()
    .single();
  if (slotErr) throw new Error(slotErr.message);

  // Insert group assignments
  if (input.group_ids.length > 0) {
    const groupRows = input.group_ids.map((gid) => ({ slot_id: slot.id, group_id: gid }));
    const { error } = await supabase.from("training_slot_assignments").insert(groupRows);
    if (error) throw new Error(error.message);
  }

  // Insert coach assignments
  if (input.coach_ids.length > 0) {
    const coachRows = input.coach_ids.map((cid) => ({ slot_id: slot.id, coach_id: cid }));
    const { error } = await supabase.from("training_slot_coaches").insert(coachRows);
    if (error) throw new Error(error.message);
  }

  const allSlots = await getTrainingSlots();
  return allSlots.find((s) => s.id === slot.id)!;
}
```

**Step 3: Update `updateTrainingSlot()`**

Replace lines 112-150:

```typescript
export async function updateTrainingSlot(slotId: string, input: TrainingSlotInput): Promise<TrainingSlot> {
  if (!canUseSupabase()) throw new Error("Supabase not available");

  // Update slot fields
  const { error: slotErr } = await supabase
    .from("training_slots")
    .update({
      day_of_week: input.day_of_week,
      start_time: input.start_time,
      end_time: input.end_time,
      location: input.location,
      lane_count: input.lane_count,
    })
    .eq("id", slotId);
  if (slotErr) throw new Error(slotErr.message);

  // Replace group assignments
  await supabase.from("training_slot_assignments").delete().eq("slot_id", slotId);
  if (input.group_ids.length > 0) {
    const groupRows = input.group_ids.map((gid) => ({ slot_id: slotId, group_id: gid }));
    const { error } = await supabase.from("training_slot_assignments").insert(groupRows);
    if (error) throw new Error(error.message);
  }

  // Replace coach assignments
  await supabase.from("training_slot_coaches").delete().eq("slot_id", slotId);
  if (input.coach_ids.length > 0) {
    const coachRows = input.coach_ids.map((cid) => ({ slot_id: slotId, coach_id: cid }));
    const { error } = await supabase.from("training_slot_coaches").insert(coachRows);
    if (error) throw new Error(error.message);
  }

  const allSlots = await getTrainingSlots();
  return allSlots.find((s) => s.id === slotId)!;
}
```

**Step 4: Add `TrainingSlotCoach` import**

Update import line 8 to include `TrainingSlotCoach`:

```typescript
import type {
  TrainingSlot,
  TrainingSlotAssignment,
  TrainingSlotCoach,
  TrainingSlotOverride,
  TrainingSlotInput,
  TrainingSlotOverrideInput,
} from "./types";
```

**Step 5: Commit**

```bash
git add src/lib/api/training-slots.ts
git commit -m "api: update training-slots CRUD for multi-groups/coaches (§96)"
```

---

### Task 4: Update SlotFormSheet UI — Multi-Select Chips

**Files:**
- Modify: `src/pages/coach/CoachTrainingSlotsScreen.tsx:186-589`

**Step 1: Replace `AssignmentRow` type and form state**

Replace the `AssignmentRow` type (line 188-193) and the form state in `SlotFormSheet` (lines 218-249) with:

```typescript
// Remove AssignmentRow type entirely

// In SlotFormSheet, replace state:
const [dayOfWeek, setDayOfWeek] = useState("1");
const [startTime, setStartTime] = useState("");
const [endTime, setEndTime] = useState("");
const [location, setLocation] = useState("");
const [selectedGroupIds, setSelectedGroupIds] = useState<number[]>([]);
const [selectedCoachIds, setSelectedCoachIds] = useState<number[]>([]);
const [laneCount, setLaneCount] = useState("");

useEffect(() => {
  if (!open) return;
  if (slot) {
    setDayOfWeek(String(slot.day_of_week));
    setStartTime(formatTime(slot.start_time));
    setEndTime(formatTime(slot.end_time));
    setLocation(slot.location);
    setSelectedGroupIds(slot.assignments.map((a) => a.group_id));
    setSelectedCoachIds(slot.coaches.map((c) => c.coach_id));
    setLaneCount(slot.lane_count != null ? String(slot.lane_count) : "");
  } else {
    setDayOfWeek("1");
    setStartTime("");
    setEndTime("");
    setLocation("");
    setSelectedGroupIds([]);
    setSelectedCoachIds([]);
    setLaneCount("");
  }
}, [open, slot]);
```

**Step 2: Remove `addAssignment`, `removeAssignment`, `updateAssignment` functions (lines 251-271)**

Replace with toggle helpers:

```typescript
const toggleGroup = (id: number) => {
  setSelectedGroupIds((prev) =>
    prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
  );
};

const toggleCoach = (id: number) => {
  setSelectedCoachIds((prev) =>
    prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
  );
};
```

**Step 3: Replace `buildInput()` (lines 273-303)**

```typescript
const buildInput = (): TrainingSlotInput | null => {
  if (!startTime || !endTime) {
    toast({ title: "Horaires requis", description: "Veuillez saisir les heures de debut et fin.", variant: "destructive" });
    return null;
  }
  if (!location.trim()) {
    toast({ title: "Lieu requis", description: "Veuillez saisir un lieu.", variant: "destructive" });
    return null;
  }
  return {
    day_of_week: Number(dayOfWeek),
    start_time: startTime,
    end_time: endTime,
    location: location.trim(),
    lane_count: laneCount ? Number(laneCount) : null,
    group_ids: selectedGroupIds,
    coach_ids: selectedCoachIds,
  };
};
```

**Step 4: Replace the form JSX for assignments section (lines 442-528)**

Use `/frontend-design` to create the multi-select chips UI. Replace the assignments block with:

```tsx
<Separator />

{/* Groups — multi-select chips */}
<div className="space-y-3">
  <Label>Groupes</Label>
  {groups.length === 0 ? (
    <p className="text-xs text-muted-foreground">Aucun groupe disponible</p>
  ) : (
    <div className="flex flex-wrap gap-2">
      {groups.map((g) => {
        const selected = selectedGroupIds.includes(Number(g.id));
        return (
          <button
            key={g.id}
            type="button"
            onClick={() => toggleGroup(Number(g.id))}
            className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
              selected
                ? "border-blue-500/40 bg-blue-500/15 text-blue-700 dark:text-blue-300"
                : "border-border bg-muted/30 text-muted-foreground hover:bg-muted/50"
            }`}
          >
            <div className={`h-3.5 w-3.5 rounded-sm border flex items-center justify-center ${
              selected ? "border-blue-500 bg-blue-500" : "border-muted-foreground/40"
            }`}>
              {selected && <Check className="h-2.5 w-2.5 text-white" />}
            </div>
            {g.name}
          </button>
        );
      })}
    </div>
  )}
</div>

{/* Lane count — global */}
<div className="space-y-2">
  <Label htmlFor="slot-lanes">Lignes d'eau</Label>
  <Input
    id="slot-lanes"
    type="number"
    min={0}
    max={10}
    placeholder="Nombre de lignes"
    value={laneCount}
    onChange={(e) => setLaneCount(e.target.value)}
    className="w-32"
  />
</div>

<Separator />

{/* Coaches — multi-select chips */}
<div className="space-y-3">
  <Label>Coachs</Label>
  {coaches.length === 0 ? (
    <p className="text-xs text-muted-foreground">Aucun coach disponible</p>
  ) : (
    <div className="flex flex-wrap gap-2">
      {coaches.map((c) => {
        const selected = selectedCoachIds.includes(c.id);
        return (
          <button
            key={c.id}
            type="button"
            onClick={() => toggleCoach(c.id)}
            className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
              selected
                ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                : "border-border bg-muted/30 text-muted-foreground hover:bg-muted/50"
            }`}
          >
            <div className={`h-3.5 w-3.5 rounded-sm border flex items-center justify-center ${
              selected ? "border-emerald-500 bg-emerald-500" : "border-muted-foreground/40"
            }`}>
              {selected && <Check className="h-2.5 w-2.5 text-white" />}
            </div>
            {c.display_name}
          </button>
        );
      })}
    </div>
  )}
</div>
```

Ensure `Check` is imported from `lucide-react` (already imported in this file).

**Step 5: Run type check**

Run: `npx tsc --noEmit 2>&1 | grep -v "src/main.tsx\|CompetitionDetail\|stories" | head -20`

**Step 6: Commit**

```bash
git add src/pages/coach/CoachTrainingSlotsScreen.tsx
git commit -m "ui: replace slot form with multi-select chips for groups/coaches (§96)"
```

---

### Task 5: Update Timeline and List View Coach Display

**Files:**
- Modify: `src/pages/coach/CoachTrainingSlotsScreen.tsx:850-940` (TimelineSlot) and `~1230-1245` (list view)

**Step 1: Update TimelineSlot coach display**

Line 935: Replace `slot.assignments.map((a) => a.coach_name)` with `slot.coaches?.map((c) => c.coach_name)`:

```typescript
{!isShort && height >= 70 && (slot.coaches?.length ?? 0) > 0 && (
  <span className="text-[9px] text-muted-foreground truncate">
    {slot.coaches.map((c) => c.coach_name).join(", ")}
  </span>
)}
```

**Step 2: Update list view card coach display**

Line ~1241: Replace `a.coach_name` and `a.lane_count` references:

Find the section that renders `{a.coach_name ? ...}` and `{a.lane_count ? ...}` in the list view card, and replace with coach/lane_count from the slot level:

```typescript
{/* After group badges, show coaches */}
{slot.coaches?.length > 0 && (
  <span className="text-[10px] text-muted-foreground">
    {slot.coaches.map((c) => c.coach_name.split(" ")[0]).join(", ")}
  </span>
)}
{slot.lane_count && (
  <span className="text-[10px] text-muted-foreground">
    · {slot.lane_count}L
  </span>
)}
```

**Step 3: Update coach filter** 

Line ~1408: Replace `s.assignments.some((a) => a.coach_id === cid)` with:

```typescript
s.coaches?.some((c) => c.coach_id === cid)
```

**Step 4: Commit**

```bash
git add src/pages/coach/CoachTrainingSlotsScreen.tsx
git commit -m "ui: update timeline and list views for new coach data source (§96)"
```

---

### Task 6: Update api.ts Facade and Re-exports

**Files:**
- Modify: `src/lib/api.ts` (if needed)
- Modify: `src/lib/api/index.ts` (if TrainingSlotCoach needs re-export)

**Step 1: Check if `TrainingSlotCoach` needs to be re-exported**

Search for existing re-exports of training slot types. Add `TrainingSlotCoach` to the same export list.

**Step 2: Run full type check to find remaining errors**

Run: `npx tsc --noEmit 2>&1 | grep -v "src/main.tsx\|CompetitionDetail\|stories"`

Fix any remaining type errors (likely in swimmer slots tab or other files referencing `coach_id`/`coach_name`/`lane_count` on `TrainingSlotAssignment`).

**Step 3: Run tests**

Run: `npm test -- --run`

**Step 4: Commit**

```bash
git add -u
git commit -m "fix: resolve remaining type errors from slot model change (§96)"
```

---

### Task 7: Final Verification and Documentation

**Files:**
- Modify: `docs/implementation-log.md`

**Step 1: Full build check**

Run: `npm run build 2>&1 | tail -5`

**Step 2: Update implementation log**

Add entry for §96 with all changes documented.

**Step 3: Commit and push**

```bash
git add docs/implementation-log.md
git commit -m "docs: log multi-groups/coaches slot implementation (§96)"
git push
```
