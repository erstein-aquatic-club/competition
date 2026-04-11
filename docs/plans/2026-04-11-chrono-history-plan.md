# Chrono History — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Sauvegarder les séries chrono en DB, historique consultable, éditeur de splits avec recalage des distances avant envoi aux nageurs.

**Architecture:** Table `chrono_records` en Supabase (JSONB pour swimmers/config), API CRUD, vue historique comme section coach, éditeur de splits par nageur/série avec distances éditables.

**Tech Stack:** React 19, TypeScript, Tailwind CSS 4, Shadcn, Supabase (PostgreSQL + RLS), React Query.

**Design doc:** `docs/plans/2026-04-11-chrono-history-design.md`

---

### Task 1: Migration DB — table `chrono_records`

**Files:**
- Create: `supabase/migrations/00078_chrono_records.sql`

**Step 1: Créer la migration**

```sql
CREATE TABLE chrono_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id UUID NOT NULL REFERENCES auth.users(id),
  status TEXT NOT NULL DEFAULT 'draft',
  label TEXT,
  config JSONB NOT NULL DEFAULT '{}',
  swimmers JSONB NOT NULL DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE chrono_records ENABLE ROW LEVEL SECURITY;

-- Coaches see/manage their own records
CREATE POLICY "Coaches manage own chrono records"
  ON chrono_records FOR ALL
  USING (coach_id = auth.uid());

CREATE INDEX idx_chrono_records_coach ON chrono_records(coach_id);
CREATE INDEX idx_chrono_records_status ON chrono_records(coach_id, status);
```

**Step 2: Appliquer via MCP Supabase**

Utiliser `mcp__plugin_supabase_supabase__apply_migration` avec project_id `fscnobivsgornxdwqwlk`.

**Step 3: Commit**

```bash
git add supabase/migrations/00078_chrono_records.sql
git commit -m "feat(chrono): add chrono_records table for history persistence"
```

---

### Task 2: Types + API CRUD `chrono-records`

**Files:**
- Modify: `src/lib/api/types.ts` — ajouter types ChronoRecord
- Create: `src/lib/api/chrono-records.ts` — CRUD
- Modify: `src/lib/api/index.ts` — re-exports

**Step 1: Ajouter les types dans `src/lib/api/types.ts`**

À la fin du fichier :

```ts
// ── Chrono Records ──────────────────────────────────────────────────

export interface ChronoRecordSplit {
  distanceM: number;
  cumulativeMs: number;
  lapMs: number;
}

export interface ChronoRecordSwimmer {
  athleteId: number;
  displayName: string;
  lane: number;
  wave: number;
  splitsByRep: ChronoRecordSplit[][];
}

export interface ChronoRecordConfig {
  totalDistanceM: number;
  splitDistanceM: number;
  seriesCount: number;
  laneCount: number;
}

export interface ChronoRecord {
  id: string;
  coach_id: string;
  status: "draft" | "sent";
  label: string | null;
  config: ChronoRecordConfig;
  swimmers: ChronoRecordSwimmer[];
  created_at: string;
  updated_at: string;
}

export interface ChronoRecordInput {
  status: "draft" | "sent";
  label: string;
  config: ChronoRecordConfig;
  swimmers: ChronoRecordSwimmer[];
}
```

**Step 2: Créer `src/lib/api/chrono-records.ts`**

```ts
import { supabase, canUseSupabase } from "./client";
import type { ChronoRecord, ChronoRecordInput } from "./types";

export async function getChronoRecords(): Promise<ChronoRecord[]> {
  if (!canUseSupabase()) return [];
  const { data, error } = await supabase
    .from("chrono_records")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as ChronoRecord[];
}

export async function createChronoRecord(input: ChronoRecordInput): Promise<ChronoRecord> {
  if (!canUseSupabase()) throw new Error("Supabase not available");
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Non authentifié");
  const { data, error } = await supabase
    .from("chrono_records")
    .insert({
      coach_id: user.id,
      status: input.status,
      label: input.label,
      config: input.config,
      swimmers: input.swimmers,
    })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as ChronoRecord;
}

export async function updateChronoRecord(
  id: string,
  patch: Partial<ChronoRecordInput>,
): Promise<void> {
  if (!canUseSupabase()) throw new Error("Supabase not available");
  const row: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.status !== undefined) row.status = patch.status;
  if (patch.label !== undefined) row.label = patch.label;
  if (patch.config !== undefined) row.config = patch.config;
  if (patch.swimmers !== undefined) row.swimmers = patch.swimmers;
  const { error } = await supabase
    .from("chrono_records")
    .update(row)
    .eq("id", id);
  if (error) throw new Error(error.message);
}

export async function deleteChronoRecord(id: string): Promise<void> {
  if (!canUseSupabase()) throw new Error("Supabase not available");
  const { error } = await supabase
    .from("chrono_records")
    .delete()
    .eq("id", id);
  if (error) throw new Error(error.message);
}
```

**Step 3: Ajouter re-exports dans `src/lib/api/index.ts`**

À la fin :

```ts
// Chrono records
export {
  getChronoRecords,
  createChronoRecord,
  updateChronoRecord,
  deleteChronoRecord,
} from './chrono-records';
```

**Step 4: Vérifier compilation**

Run: `npx tsc --noEmit`

**Step 5: Commit**

```bash
git add src/lib/api/types.ts src/lib/api/chrono-records.ts src/lib/api/index.ts
git commit -m "feat(chrono): add ChronoRecord types + CRUD API"
```

---

### Task 3: Modifier ChronoResults — sauvegarde + brouillon

**Files:**
- Modify: `src/components/chrono/ChronoResults.tsx`
- Modify: `src/lib/chrono-types.ts` — ajouter distanceM aux splits

**Step 1: Ajouter `distanceM` dans SplitRecord**

Dans `src/lib/chrono-types.ts`, modifier SplitRecord :

```ts
export interface SplitRecord {
  cumulativeMs: number;
  lapMs: number;
  /** Distance in meters for this split (for recalibration) */
  distanceM?: number;
}
```

**Step 2: Modifier ChronoResults**

Ajouter un bouton "Enregistrer (brouillon)" à côté de "Envoyer à tous".

Importer `createChronoRecord` depuis `../../lib/api/chrono-records`.

Créer une fonction helper `buildChronoRecordInput` qui construit le `ChronoRecordInput` depuis le state :

```ts
function buildChronoRecordInput(state: ChronoState, status: "draft" | "sent"): ChronoRecordInput {
  const raceEntries = Array.from(state.raceData.values());
  return {
    status,
    label: buildLabel(state),
    config: {
      totalDistanceM: state.totalDistanceM,
      splitDistanceM: state.splitDistanceM,
      seriesCount: state.seriesCount,
      laneCount: state.laneCount,
    },
    swimmers: raceEntries.map((rs) => ({
      athleteId: rs.swimmer.athleteId,
      displayName: rs.swimmer.displayName,
      lane: rs.swimmer.lane,
      wave: rs.swimmer.wave,
      splitsByRep: rs.splitsByRep.map((rep) =>
        rep.map((s, i) => ({
          distanceM: state.splitDistanceM > 0 ? (i + 1) * state.splitDistanceM : 0,
          cumulativeMs: s.cumulativeMs,
          lapMs: s.lapMs,
        })),
      ),
    })),
  };
}

function buildLabel(state: ChronoState): string {
  const parts: string[] = [];
  if (state.seriesCount > 0) parts.push(`${state.seriesCount}×`);
  if (state.totalDistanceM > 0) parts.push(`${state.totalDistanceM}m`);
  else parts.push("Chrono");
  return parts.join("") || "Chrono";
}
```

Modifier `handleExportAll` pour aussi créer le `chrono_record` en status "sent" après les logs.

Ajouter `handleSaveDraft` :

```ts
const handleSaveDraft = useCallback(async () => {
  try {
    await createChronoRecord(buildChronoRecordInput(state, "draft"));
    toast.success("Brouillon enregistré");
    onSaveDraft?.();
  } catch (err: any) {
    toast.error(err.message || "Erreur de sauvegarde");
  }
}, [state, onSaveDraft]);
```

Ajouter prop `onSaveDraft?: () => void` à l'interface.

**Step 3: Commit**

```bash
git add src/lib/chrono-types.ts src/components/chrono/ChronoResults.tsx
git commit -m "feat(chrono): save chrono records on export and draft"
```

---

### Task 4: Vue historique — `CoachChronoHistoryScreen`

**Files:**
- Create: `src/pages/coach/CoachChronoHistoryScreen.tsx`
- Modify: `src/pages/Coach.tsx` — ajouter section + lazy import + quick link
- Modify: `src/components/layout/AppLayout.tsx` — ajouter label

**Step 1: Créer le composant historique**

Liste chronologique de `chrono_records` avec :
- useQuery pour fetch `getChronoRecords()`
- Chaque entrée : date relative (formatDistance), label, nombre de nageurs, pastille statut
- Brouillon (orange) / Envoyé (vert)
- Clic → ouvre l'éditeur (brouillon) ou la vue lecture (envoyé)
- Bouton supprimer avec confirmation

Utiliser `/frontend-design` pour le design du composant.

**Step 2: Modifier Coach.tsx**

- Ajouter `"chrono-history"` au type `CoachSection`
- Lazy import : `const CoachChronoHistoryScreen = lazy(() => import("./coach/CoachChronoHistoryScreen"));`
- Bloc conditionnel de rendu
- Ajouter dans `quickAccess` : `{ label: "Chronos", icon: Timer, action: () => onNavigate("chrono-history"), color: "text-rose-500", bg: "bg-rose-100 dark:bg-rose-900/30" }`
- Ajouter un badge de compteur de brouillons (query `chrono_records` filtrée status=draft)

**Step 3: Modifier AppLayout.tsx**

Ajouter dans `COACH_SECTION_LABELS` : `"chrono-history": "Historique Chronos"`

**Step 4: Commit**

```bash
git add src/pages/coach/CoachChronoHistoryScreen.tsx src/pages/Coach.tsx src/components/layout/AppLayout.tsx
git commit -m "feat(chrono): add chrono history screen + coach home shortcut"
```

---

### Task 5: Éditeur de splits — `ChronoSplitEditor`

**Files:**
- Create: `src/components/chrono/ChronoSplitEditor.tsx`

**Step 1: Créer le composant éditeur**

Props :
- `record: ChronoRecord`
- `onUpdate: (swimmers: ChronoRecordSwimmer[]) => Promise<void>`
- `onSend: (swimmerIdx?: number) => Promise<void>`
- `onDelete: () => Promise<void>`

Structure :
- **Tabs nageurs** : row horizontale de tabs (nom + chip vague), un onglet par nageur
- **Tabs séries** : sous-tabs "S1 | S2 | S3..." si multi-rep
- **Tableau** pour le nageur/série sélectionné :
  - Colonnes : Distance (input éditable) | Cumul (lecture) | Partiel (auto-recalcul) | ✕
  - Chaque ligne = un split
  - Distance pré-remplie depuis `split.distanceM`
  - Partiel recalculé : `lapMs = cumulativeMs - previousCumulativeMs`
  - ✕ supprime le split
- **Actions** : "Envoyer ce nageur", "Envoyer tous", "Supprimer le chrono"

Utiliser `/frontend-design` pour le design du tableau et des tabs.

**Step 2: Commit**

```bash
git add src/components/chrono/ChronoSplitEditor.tsx
git commit -m "feat(chrono): add split editor with distance recalibration"
```

---

### Task 6: Intégration éditeur dans historique

**Files:**
- Modify: `src/pages/coach/CoachChronoHistoryScreen.tsx` — state pour record sélectionné, affichage éditeur
- Modify: `src/components/chrono/ChronoSplitEditor.tsx` — brancher les mutations

**Step 1: Ajouter state de sélection**

- `selectedRecordId: string | null`
- Si sélectionné et brouillon → afficher `ChronoSplitEditor`
- Si sélectionné et envoyé → afficher vue lecture seule (réutiliser le tableau en mode disabled)

**Step 2: Brancher les mutations**

- `onUpdate` → `updateChronoRecord(id, { swimmers })` + invalidate query
- `onSend` → pour chaque nageur : `resolveAuthUid` → `createStandaloneSwimLog` → `updateChronoRecord(id, { status: "sent" })`
- `onDelete` → `deleteChronoRecord(id)` + invalidate query

**Step 3: Commit**

```bash
git add src/pages/coach/CoachChronoHistoryScreen.tsx src/components/chrono/ChronoSplitEditor.tsx
git commit -m "feat(chrono): wire split editor mutations (update, send, delete)"
```

---

### Task 7: Fil rouge — brouillon depuis CoachChronoScreen

**Files:**
- Modify: `src/pages/coach/CoachChronoScreen.tsx` — passer `onSaveDraft` à ChronoResults
- Modify: `src/components/chrono/ChronoResults.tsx` — utiliser `onSaveDraft`

**Step 1: Ajouter `onSaveDraft` dans l'orchestrateur**

Quand le coach clique "Enregistrer (brouillon)" :
1. Sauvegarder le chrono_record en DB
2. Supprimer le backup localStorage
3. Dispatch `RESET_FOR_NEW_SERIES`
4. Toast "Brouillon enregistré — retrouvez-le dans Chronos"

**Step 2: Commit**

```bash
git add src/pages/coach/CoachChronoScreen.tsx src/components/chrono/ChronoResults.tsx
git commit -m "feat(chrono): save draft from results + reset for new series"
```

---

### Task 8: Documentation

**Files:**
- Modify: `CLAUDE.md`, `docs/ROADMAP.md`, `docs/FEATURES_STATUS.md`, `docs/implementation-log.md`

Suivre le workflow de documentation obligatoire du projet.

```bash
git add CLAUDE.md docs/
git commit -m "docs: add chrono history feature to documentation"
```
