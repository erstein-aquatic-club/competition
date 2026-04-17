# Chrono Coach — Nageurs Manuels, Titre, Export XLSX — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Étendre l'écran Chrono coach pour supporter (1) des nageurs manuels sans compte, (2) un titre de séance libre, (3) l'export XLSX d'une séance depuis Résultats et Historique.

**Architecture:** Refactor du type `ChronoSwimmer` en type discriminé `registered | manual` avec clé composite string. Nouvelle table DB `coach_manual_swimmers` avec RLS stricte par coach. Librairie `xlsx` (SheetJS CE) en lazy-import pour n'impacter le bundle principal qu'au moment de l'export.

**Tech Stack:** React 19 + TypeScript + Vite + Tailwind, Supabase (Postgres + RLS), Vitest. Nouvelle dépendance : `xlsx` (SheetJS CE, MIT, ~300KB min). UI polish délégué au skill `frontend-design` au moment de l'exécution.

**Design de référence:** `docs/plans/2026-04-17-chrono-manual-swimmers-xlsx-design.md`.

**Règles d'or transversales :**
- Après chaque modif de fichier clé, `wc -l` pour mettre à jour `CLAUDE.md` si variation > 30 % ou nouveau fichier ≥ 150 lignes / rôle architectural.
- Migrations SQL : toujours via `mcp__plugin_supabase_supabase__apply_migration` (pas `supabase db push`).
- Commits fréquents (1 par tâche validée). Conventions FR : `feat(§126): …`, `refactor(§126): …`, `test(§126): …`, `docs(§126): …`.
- `npm run test:rls` UNIQUEMENT pour les tâches qui touchent RLS / policies / table SQL (tâches 10-12). Sinon `npm test` suffit.

---

## Vue d'ensemble des tâches

| # | Titre | Fichiers touchés | Tests |
|---|---|---|---|
| 1 | Refacto types : clé composite + title | chrono-types.ts | — |
| 2 | Helpers swimmerKey / build*Swimmer | chrono-types.ts | — |
| 3 | Migration reducer vers key: string | chrono-reducer.ts | chrono-reducer.test.ts |
| 4 | Test reducer : manuels + SET_TITLE | chrono-reducer.test.ts | idem |
| 5 | Migration ChronoRace / ChronoResults / ChronoSetup / ChronoSplitEditor | 4 fichiers | build |
| 6 | Normalisation backward-compat records | chrono-types.ts | chronoXlsxExport.test.ts |
| 7 | Champ titre — state + setup + results | ChronoSetup / ChronoResults / CoachChronoHistoryScreen | — |
| 8 | `/frontend-design` pass 1 : titre + badge manuel | idem | — |
| 9 | Migration SQL coach_manual_swimmers | supabase/migrations | rls/coach_manual_swimmers.test.ts |
| 10 | Schéma + seed tests RLS | supabase/tests/schema.sql / seed.sql | idem |
| 11 | Tests RLS coach_manual_swimmers | rls/coach_manual_swimmers.test.ts | `npm run test:rls` |
| 12 | Module API coach-manual-swimmers | src/lib/api/coach-manual-swimmers.ts | — |
| 13 | Sheet ajout : tabs Club / Manuels / Nouveau | ChronoSetup.tsx | — |
| 14 | `/frontend-design` pass 2 : tabs du sheet | idem | — |
| 15 | Module chronoXlsxExport (pur) | src/lib/chronoXlsxExport.ts | chronoXlsxExport.test.ts |
| 16 | Tests buildSheetData + sanitizeFilename | chronoXlsxExport.test.ts | `npm test` |
| 17 | Intégration bouton xlsx dans ChronoResults | ChronoResults.tsx | — |
| 18 | Intégration bouton xlsx dans Historique | CoachChronoHistoryScreen.tsx | — |
| 19 | `/frontend-design` pass 3 : boutons export | idem | — |
| 20 | Vérif bundle (rollup-visualizer) | — | build |
| 21 | Docs : log, roadmap, features, CLAUDE.md | 4 fichiers docs | — |

---

## Task 1 — Refacto `ChronoSwimmer` en type discriminé

**Files:**
- Modify: `src/lib/chrono-types.ts` (actuellement 63 lignes)

**Step 1 — Remplacer l'interface `ChronoSwimmer`**

```ts
export type ChronoSwimmerKind = "registered" | "manual";

export interface ChronoSwimmer {
  /** Clé stable unique — "a:<athleteId>" ou "m:<uuid>" */
  key: string;
  kind: ChronoSwimmerKind;
  /** ID public.users (null pour manual) */
  athleteId: number | null;
  /** UUID local chrono (null pour registered) */
  manualId: string | null;
  displayName: string;
  avatarUrl: string | null;
  wave: number;
  lane: number;
}
```

**Step 2 — Ajouter `title: string` à `ChronoState`**

```ts
export interface ChronoState {
  phase: ChronoPhase;
  laneCount: number;
  swimmers: ChronoSwimmer[];
  waves: WaveState[];
  raceData: Map<string, SwimmerRaceState>;  // ← string au lieu de number
  stoppedAt: number | null;
  totalDistanceM: number;
  splitDistanceM: number;
  seriesCount: number;
  title: string;  // ← nouveau, "" par défaut
}
```

**Step 3 — Vérifier TS (build incomplet, c'est normal)**

Run: `npx tsc --noEmit`
Expected: erreurs dans chrono-reducer.ts / ChronoRace.tsx / … (on les fixe aux tâches suivantes).

**Step 4 — Pas de commit maintenant** — refacto atomique groupée à la tâche 5.

---

## Task 2 — Helpers swimmerKey + builders

**Files:**
- Modify: `src/lib/chrono-types.ts`

**Step 1 — Ajouter en bas du fichier**

```ts
export function swimmerKey(s: Pick<ChronoSwimmer, "kind" | "athleteId" | "manualId">): string {
  if (s.kind === "manual") {
    if (!s.manualId) throw new Error("Manual swimmer missing manualId");
    return `m:${s.manualId}`;
  }
  if (s.athleteId == null) throw new Error("Registered swimmer missing athleteId");
  return `a:${s.athleteId}`;
}

export function buildRegisteredSwimmer(args: {
  athleteId: number;
  displayName: string;
  avatarUrl?: string | null;
  wave?: number;
  lane: number;
}): ChronoSwimmer {
  return {
    key: `a:${args.athleteId}`,
    kind: "registered",
    athleteId: args.athleteId,
    manualId: null,
    displayName: args.displayName,
    avatarUrl: args.avatarUrl ?? null,
    wave: args.wave ?? 1,
    lane: args.lane,
  };
}

export function buildManualSwimmer(args: {
  manualId: string;
  displayName: string;
  wave?: number;
  lane: number;
}): ChronoSwimmer {
  return {
    key: `m:${args.manualId}`,
    kind: "manual",
    athleteId: null,
    manualId: args.manualId,
    displayName: args.displayName,
    avatarUrl: null,
    wave: args.wave ?? 1,
    lane: args.lane,
  };
}
```

**Step 2 — Pas de commit encore** (groupage avec tâches 3-5).

---

## Task 3 — Migrer le reducer vers `key: string`

**Files:**
- Modify: `src/lib/chrono-reducer.ts`

**Step 1 — Mise à jour du union `ChronoAction`**

Remplacer toutes les variantes `athleteId: number` par `key: string`. Ajouter `SET_TITLE`.

```ts
type ChronoAction =
  | { type: "SET_LANE_COUNT"; count: number }
  | { type: "SET_TOTAL_DISTANCE"; meters: number }
  | { type: "SET_SPLIT_DISTANCE"; meters: number }
  | { type: "SET_SERIES_COUNT"; count: number }
  | { type: "SET_TITLE"; title: string }                       // ← nouveau
  | { type: "SET_WAVE_INTERVAL"; wave: number; seconds: number }
  | { type: "ADD_SWIMMER"; swimmer: ChronoSwimmer }
  | { type: "REMOVE_SWIMMER"; key: string }                    // ← key au lieu de athleteId
  | { type: "MOVE_SWIMMER"; key: string; lane: number }
  | { type: "SET_WAVE"; key: string; wave: number }
  | { type: "START_RACE" }
  | { type: "LAUNCH_WAVE"; wave: number; timestamp: number }
  | { type: "RECORD_SPLIT"; key: string; timestamp: number }
  | { type: "UNDO_SPLIT"; key: string }
  | { type: "STOP_SWIMMER"; key: string; timestamp: number }
  | { type: "NEXT_REP"; wave: number }
  | { type: "STOP_RACE"; timestamp: number }
  | { type: "RESET_FOR_NEW_SERIES" }
  | { type: "RESTORE_STATE"; state: ChronoState };
```

**Step 2 — Mise à jour de `initialChronoState`**

```ts
export const initialChronoState: ChronoState = {
  phase: "setup",
  laneCount: 3,
  swimmers: [],
  waves: [],
  raceData: new Map(),
  stoppedAt: null,
  totalDistanceM: 0,
  splitDistanceM: 50,
  seriesCount: 0,
  title: "",                                  // ← nouveau
};
```

**Step 3 — Mise à jour des branches du switch**

Remplacer dans chaque case :
- `action.athleteId` → `action.key`
- `s.athleteId` (dans `.filter` / `.map` swimmers) → `s.key`
- `raceData.get(action.athleteId)` → `raceData.get(action.key)`
- Pour `START_RACE` : boucle `for (const swimmer of state.swimmers) raceData.set(swimmer.key, {...})`
- Pour `ADD_SWIMMER` : `if (state.swimmers.some((s) => s.key === action.swimmer.key)) return state;`

Ajouter une nouvelle branche :

```ts
case "SET_TITLE": {
  return { ...state, title: action.title };
}
```

**Step 4 — TypeCheck**

Run: `npx tsc --noEmit`
Expected: erreurs seulement dans ChronoRace.tsx / ChronoResults.tsx / ChronoSetup.tsx / ChronoSplitEditor.tsx / chrono-reducer.test.ts (logique : on les migre tâches 4-5).

---

## Task 4 — Étendre les tests du reducer

**Files:**
- Modify: `src/lib/__tests__/chrono-reducer.test.ts`

**Step 1 — Mettre à jour le helper `swimmer()`**

Remplacer :
```ts
const swimmer = (id: number, wave = 1, lane = 1) => ({
  athleteId: id, displayName: `Swimmer ${id}`, avatarUrl: null, wave, lane,
});
```

Par :
```ts
import { buildRegisteredSwimmer, buildManualSwimmer } from "../chrono-types";

const reg = (id: number, wave = 1, lane = 1) =>
  buildRegisteredSwimmer({ athleteId: id, displayName: `Swimmer ${id}`, wave, lane });

const manual = (uuid: string, name: string, wave = 1, lane = 1) =>
  buildManualSwimmer({ manualId: uuid, displayName: name, wave, lane });
```

Et remplacer TOUS les `swimmer(X, …)` par `reg(X, …)` dans les tests existants. Remplacer les dispatchs `{ type: "REMOVE_SWIMMER", athleteId: X }` par `{ type: "REMOVE_SWIMMER", key: "a:X" }` etc.

**Step 2 — Lancer les tests pour s'assurer que la migration est verte**

Run: `npm test -- chrono-reducer`
Expected: tous les tests passent.

**Step 3 — Ajouter les nouveaux tests (bloc `describe("manual swimmers")`)**

```ts
describe("manual swimmers", () => {
  it("adds a manual swimmer with composite key m:<uuid>", () => {
    const s = manual("uuid-1", "Invité 1");
    const next = chronoReducer(initialChronoState, { type: "ADD_SWIMMER", swimmer: s });
    expect(next.swimmers).toHaveLength(1);
    expect(next.swimmers[0].key).toBe("m:uuid-1");
    expect(next.swimmers[0].kind).toBe("manual");
    expect(next.swimmers[0].athleteId).toBeNull();
  });

  it("allows mixing registered and manual in the same lane/wave", () => {
    const next = reduce(initialChronoState,
      { type: "ADD_SWIMMER", swimmer: reg(10, 1, 2) },
      { type: "ADD_SWIMMER", swimmer: manual("u1", "X", 1, 2) },
    );
    expect(next.swimmers).toHaveLength(2);
    expect(next.swimmers.map(s => s.key)).toEqual(["a:10", "m:u1"]);
  });

  it("REMOVE_SWIMMER by key works for manual", () => {
    const s = manual("u1", "X");
    const next = reduce(initialChronoState,
      { type: "ADD_SWIMMER", swimmer: s },
      { type: "REMOVE_SWIMMER", key: "m:u1" },
    );
    expect(next.swimmers).toHaveLength(0);
  });

  it("START_RACE keys raceData by swimmer key (including manual)", () => {
    const next = reduce(initialChronoState,
      { type: "ADD_SWIMMER", swimmer: reg(10, 1, 1) },
      { type: "ADD_SWIMMER", swimmer: manual("u1", "X", 1, 1) },
      { type: "START_RACE" },
    );
    expect(next.raceData.has("a:10")).toBe(true);
    expect(next.raceData.has("m:u1")).toBe(true);
  });

  it("RECORD_SPLIT works with manual key", () => {
    let s: ChronoState = reduce(initialChronoState,
      { type: "ADD_SWIMMER", swimmer: manual("u1", "X", 1, 1) },
      { type: "START_RACE" },
      { type: "LAUNCH_WAVE", wave: 1, timestamp: 1000 },
      { type: "RECORD_SPLIT", key: "m:u1", timestamp: 2000 },
    );
    const race = s.raceData.get("m:u1");
    expect(race?.splitsByRep[0]).toHaveLength(1);
    expect(race?.splitsByRep[0][0].cumulativeMs).toBe(1000);
  });
});

describe("SET_TITLE", () => {
  it("updates title without touching swimmers", () => {
    const s = reduce(initialChronoState,
      { type: "ADD_SWIMMER", swimmer: reg(10) },
      { type: "SET_TITLE", title: "Stage Pâques — 100m NL" },
    );
    expect(s.title).toBe("Stage Pâques — 100m NL");
    expect(s.swimmers).toHaveLength(1);
  });

  it("allows clearing title to empty string", () => {
    const s = reduce(initialChronoState,
      { type: "SET_TITLE", title: "X" },
      { type: "SET_TITLE", title: "" },
    );
    expect(s.title).toBe("");
  });
});
```

**Step 4 — Lancer les tests**

Run: `npm test -- chrono-reducer`
Expected: tous verts (anciens + nouveaux).

**Step 5 — Commit regroupant tâches 1-4**

```bash
git add src/lib/chrono-types.ts src/lib/chrono-reducer.ts src/lib/__tests__/chrono-reducer.test.ts
git commit -m "refactor(§126): chrono swimmer key composite + title state

- ChronoSwimmer passe à type discriminé registered|manual + clé 'a:N'/'m:uuid'
- Reducer actions par key: string (au lieu de athleteId: number)
- Nouveau SET_TITLE + state.title
- Helpers buildRegisteredSwimmer / buildManualSwimmer / swimmerKey
- +10 tests reducer (manuels, mixage, SET_TITLE)"
```

---

## Task 5 — Migrer les composants consommateurs

**Files:**
- Modify: `src/components/chrono/ChronoRace.tsx` (535 lignes)
- Modify: `src/components/chrono/ChronoResults.tsx` (425 lignes)
- Modify: `src/components/chrono/ChronoSetup.tsx` (435 lignes)
- Modify: `src/components/chrono/ChronoSplitEditor.tsx`

**Step 1 — `ChronoRace.tsx`**

Grep les 5 occurrences restantes et remplacer :
- ligne 245 : la prop `athleteId: number` du sous-composant → `swimmerKey: string`
- ligne 272, 278, 294 : dispatch `{ … athleteId }` → `{ … key: swimmerKey }`
- ligne 290, 297 : deps `[…, athleteId, …]` → `[…, swimmerKey, …]`
- ligne 416 : `raceData.get(s.athleteId)` → `raceData.get(s.key)`
- ligne 419 : `key={s.athleteId}` → `key={s.key}`
- ligne 420 : `athleteId={s.athleteId}` → `swimmerKey={s.key}`
- ligne 233 : param destructuring `athleteId` → `swimmerKey`

**Step 2 — `ChronoSetup.tsx`**

- `state.swimmers.map((s) => s.athleteId)` → `.map((s) => s.key)` (pour `assignedIds`)
- `{ type: "ADD_SWIMMER", swimmer: { athleteId: a.id, displayName: …, avatarUrl: …, wave: 1, lane: addLane } }` → remplacer par `buildRegisteredSwimmer({ athleteId: a.id, displayName: a.display_name, avatarUrl: a.avatar_url ?? null, wave: 1, lane: addLane })`
- `assignedIds.has(a.id)` : toujours possible, la clé doit devenir `a:${a.id}`. Calculer `assignedKeys = new Set(state.swimmers.map(s => s.key))`, puis `assignedKeys.has(\`a:${a.id}\`)`.
- `{ type: "SET_WAVE", athleteId, wave }` → `{ type: "SET_WAVE", key, wave }`
- `{ type: "REMOVE_SWIMMER", athleteId }` → `{ type: "REMOVE_SWIMMER", key }`
- `s.athleteId` → `s.key` dans les handlers + dans `key={}` JSX

**Step 3 — `ChronoResults.tsx`**

- `state.raceData.values()` renvoie `SwimmerRaceState[]` OK (pas de changement).
- Remplacer `swimmer.athleteId` dans exportStatuses Map — passer la Map à `Map<string, ExportStatus>` keyée par `swimmer.key`.
- `newStatuses.set(athleteId, ...)` → `newStatuses.set(key, ...)` dans la boucle exportAll.
- **Skip manuels dans handleExportAll** : `swimmers.filter(e => e.swimmer.kind === "registered" && totalSplitCount(e.splitsByRep) > 0)`.
- Dans `buildChronoRecordInput`, le mapping pose `kind`, `manualId`, `athleteId` tels quels.

Adapter `ChronoRecordInput` dans `src/lib/api/types.ts` (tâche suivante incluse ici) :

```ts
export interface ChronoRecordSwimmer {
  kind?: "registered" | "manual";     // ← nouveau optionnel (backward-compat)
  athleteId: number | null;           // ← nullable
  manualId?: string | null;           // ← nouveau
  displayName: string;
  lane: number;
  wave: number;
  splitsByRep: ChronoRecordSplit[][];
}
```

**Step 4 — `ChronoSplitEditor.tsx`**

- ligne 88 : `key={sw.athleteId}` → `key={sw.athleteId ?? sw.manualId ?? \`idx-${idx}\`}` (avec `idx` du map).
- Pas d'autre impact (lecture-only vis-à-vis reducer).

**Step 5 — `CoachChronoHistoryScreen.tsx`**

- ligne 89 : `resolveAuthUid(sw.athleteId)` crash si `athleteId === null`. Ajouter garde : `if (sw.athleteId == null) { toast.info(\`${sw.displayName} (manuel) ignoré\`); continue; }`.

**Step 6 — TypeCheck + tests**

Run: `npx tsc --noEmit`
Expected: 0 erreurs.

Run: `npm test`
Expected: tous verts.

Run: `npm run build`
Expected: build OK.

**Step 7 — Commit**

```bash
git add src/components/chrono/ src/pages/coach/CoachChronoHistoryScreen.tsx src/lib/api/types.ts
git commit -m "refactor(§126): propage clé composite aux composants chrono + types Record backward-compat"
```

---

## Task 6 — Helper normalizeRecordSwimmer (backward-compat)

**Files:**
- Modify: `src/lib/chrono-types.ts`

**Step 1 — Ajouter helper de lecture**

```ts
import type { ChronoRecordSwimmer } from "./api/types";

export interface NormalizedChronoRecordSwimmer extends ChronoRecordSwimmer {
  kind: "registered" | "manual";
  manualId: string | null;
}

export function normalizeRecordSwimmer(sw: ChronoRecordSwimmer): NormalizedChronoRecordSwimmer {
  const kind = sw.kind ?? (sw.athleteId != null ? "registered" : "manual");
  return {
    ...sw,
    kind,
    manualId: sw.manualId ?? null,
  };
}
```

⚠️ Attention : import circulaire possible. Si c'est le cas, mettre plutôt ce helper dans un nouveau fichier `src/lib/chronoRecordUtils.ts` et importer depuis `./api/types` proprement.

**Step 2 — Utiliser dans `ChronoResults.tsx` / `CoachChronoHistoryScreen.tsx`**

Partout où on lit un `record.swimmers[i]`, wrapper avec `normalizeRecordSwimmer(sw)`.

**Step 3 — Test unit**

Ajouter à `src/lib/__tests__/chrono-reducer.test.ts` (ou nouveau fichier `chronoRecordUtils.test.ts`) :

```ts
describe("normalizeRecordSwimmer", () => {
  it("infers kind=registered for legacy records without kind", () => {
    const sw = { athleteId: 42, displayName: "X", lane: 1, wave: 1, splitsByRep: [] };
    expect(normalizeRecordSwimmer(sw).kind).toBe("registered");
  });
  it("infers kind=manual when athleteId is null", () => {
    const sw = { athleteId: null, displayName: "X", lane: 1, wave: 1, splitsByRep: [] };
    expect(normalizeRecordSwimmer(sw).kind).toBe("manual");
  });
  it("preserves explicit kind", () => {
    const sw = { kind: "manual" as const, athleteId: null, manualId: "u1", displayName: "X", lane: 1, wave: 1, splitsByRep: [] };
    expect(normalizeRecordSwimmer(sw).manualId).toBe("u1");
  });
});
```

**Step 4 — Run**

Run: `npm test`
Expected: vert.

**Step 5 — Commit**

```bash
git commit -am "feat(§126): normalizeRecordSwimmer backward-compat pour records legacy"
```

---

## Task 7 — Champ titre dans Setup / Results / Historique (sans polish)

**Files:**
- Modify: `src/components/chrono/ChronoSetup.tsx`
- Modify: `src/components/chrono/ChronoResults.tsx`
- Modify: `src/pages/coach/CoachChronoHistoryScreen.tsx`

**Step 1 — ChronoSetup** (ajouter au sommet du JSX, AVANT le header) :

```tsx
<Input
  placeholder="Titre de la séance (optionnel)"
  value={state.title}
  onChange={(e) => dispatch({ type: "SET_TITLE", title: e.target.value })}
  maxLength={120}
  className="mb-1"
/>
```

**Step 2 — ChronoResults** — ajouter sous le Header existant :

```tsx
<input
  type="text"
  placeholder="Sans titre — cliquer pour nommer"
  value={state.title}
  onChange={(e) => dispatch({ type: "SET_TITLE", title: e.target.value })}
  className="w-full bg-transparent text-sm italic text-muted-foreground placeholder:italic placeholder:text-muted-foreground/60 focus:not-italic focus:text-foreground outline-none"
/>
```

**Step 3 — `buildLabel` à adapter**

Remplacer dans `ChronoResults.tsx` :
```ts
function buildLabel(state: ChronoState): string {
  if (state.title.trim()) return state.title.trim();
  // fallback auto
  ...
}
```

**Step 4 — Historique — édition du label**

Dans `CoachChronoHistoryScreen.tsx` detail view, ajouter un bouton ✏️ dans le header :

```tsx
const [editingLabel, setEditingLabel] = useState(false);
const [labelDraft, setLabelDraft] = useState(selectedRecord.label ?? "");

// remplacer le h2 par :
{editingLabel ? (
  <Input
    value={labelDraft}
    autoFocus
    onChange={(e) => setLabelDraft(e.target.value)}
    onBlur={async () => {
      await updateChronoRecord(selectedRecord.id, { label: labelDraft });
      queryClient.invalidateQueries({ queryKey: ["chrono_records"] });
      setSelectedRecord({ ...selectedRecord, label: labelDraft });
      setEditingLabel(false);
    }}
    className="max-w-[20rem]"
  />
) : (
  <button onClick={() => setEditingLabel(true)} className="flex items-center gap-1 hover:text-primary">
    <h2 className="text-lg font-semibold">{selectedRecord.label || "Sans titre"}</h2>
    <Pencil className="h-3.5 w-3.5 opacity-60" />
  </button>
)}
```

**Step 5 — Build**

Run: `npm run build`
Expected: OK.

**Step 6 — Commit (sans polish UI)**

```bash
git commit -am "feat(§126): champ titre séance setup/results + édition inline historique"
```

---

## Task 8 — /frontend-design pass 1 : titre + badge manuel

**Step 1 — Invoquer le skill**

```
/frontend-design:frontend-design
```

**Brief à donner au skill :**
> Polish UI des composants chrono existants :
> 1. **Champ titre en Setup** (src/components/chrono/ChronoSetup.tsx, au-dessus du header "Préparation") : input minimal poolside-friendly, discret quand vide, prominent quand rempli. Touch target 44px.
> 2. **Champ titre en Results** (src/components/chrono/ChronoResults.tsx, en tête) : click-to-edit inline, placeholder italic muted "Sans titre — cliquer pour nommer", focus states clairs.
> 3. **Badge `M` pour nageur manuel** dans les chips des lignes (ChronoSetup.tsx lane sections + ChronoResults.tsx headers) : petit badge gris neutre discret, visible sans dominer. Cohérent avec WAVE_COLORS.
>
> Style global du projet : Tailwind 4, tokens Radix (bg-muted, text-foreground, border-border), tailwind-merge. Screens mobiles tablette (iPad portrait prioritaire).

**Step 2 — Commit du polish**

```bash
git commit -am "style(§126): polish UI titre séance + badge manuel (frontend-design pass 1)"
```

---

## Task 9 — Migration SQL `coach_manual_swimmers`

**Files:**
- Create: `supabase/migrations/00XXX_coach_manual_swimmers.sql` (⚠️ incrémenter N en listant d'abord `ls supabase/migrations/ | tail -5`)

**Step 1 — Déterminer le prochain numéro**

Run: `ls supabase/migrations/ | sort | tail -5`
Observe : noter le dernier N, utiliser N+1.

**Step 2 — Créer le fichier SQL**

```sql
-- Manual swimmers (sans compte) qu'un coach peut réutiliser dans plusieurs chronos

create table if not exists public.coach_manual_swimmers (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references auth.users(id) on delete cascade,
  display_name text not null check (length(trim(display_name)) > 0),
  created_at timestamptz not null default now()
);

create index if not exists idx_coach_manual_swimmers_coach_created
  on public.coach_manual_swimmers(coach_id, created_at desc);

alter table public.coach_manual_swimmers enable row level security;

create policy "coach_manual_swimmers_select_own"
  on public.coach_manual_swimmers for select
  using (coach_id = (select auth.uid()));

create policy "coach_manual_swimmers_insert_own"
  on public.coach_manual_swimmers for insert
  with check (coach_id = (select auth.uid()));

create policy "coach_manual_swimmers_delete_own"
  on public.coach_manual_swimmers for delete
  using (coach_id = (select auth.uid()));
```

**Step 3 — Appliquer via MCP**

```
mcp__plugin_supabase_supabase__apply_migration
  name: "coach_manual_swimmers"
  query: <contenu du fichier>
```

**Step 4 — Vérifier via MCP**

```
mcp__plugin_supabase_supabase__list_tables
  schemas: ["public"]
```

Attendu : `coach_manual_swimmers` présent.

**Step 5 — Commit**

```bash
git add supabase/migrations/00XXX_coach_manual_swimmers.sql
git commit -m "feat(§126): migration coach_manual_swimmers + RLS par coach"
```

---

## Task 10 — Étendre schéma tests RLS

**Files:**
- Modify: `supabase/tests/schema.sql`
- Modify: `supabase/tests/seed.sql`

**Step 1 — Ajouter la table au schéma**

Ajouter à `schema.sql` (reproduction minimale de la migration prod, sans `auth.users` réel — cf. pattern existant `§121`) :

```sql
create table public.coach_manual_swimmers (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null,
  display_name text not null,
  created_at timestamptz not null default now()
);

alter table public.coach_manual_swimmers enable row level security;

create policy "coach_manual_swimmers_select_own"
  on public.coach_manual_swimmers for select
  using (coach_id = (select auth.uid()));

create policy "coach_manual_swimmers_insert_own"
  on public.coach_manual_swimmers for insert
  with check (coach_id = (select auth.uid()));

create policy "coach_manual_swimmers_delete_own"
  on public.coach_manual_swimmers for delete
  using (coach_id = (select auth.uid()));
```

**Step 2 — Ajouter fixtures**

Dans `seed.sql` (si pas déjà présent) :
```sql
-- Manual swimmers seed: empty (tests créent eux-mêmes)
```

**Step 3 — Pas de commit encore** (groupé avec tâche 11).

---

## Task 11 — Tests RLS coach_manual_swimmers

**Files:**
- Create: `supabase/tests/rls/coach_manual_swimmers.test.ts`

**Step 1 — Écrire les tests (inspirés de `dim_sessions.test.ts`)**

```ts
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { asUser, asServiceRole, resetDb, closePool } from "./_helpers";

const COACH_A = "11111111-1111-1111-1111-111111111111";
const COACH_B = "22222222-2222-2222-2222-222222222222";
const ATHLETE = "33333333-3333-3333-3333-333333333333";

describe("RLS coach_manual_swimmers", () => {
  beforeAll(async () => { await resetDb(); });
  afterAll(async () => { await closePool(); });

  beforeEach(async () => {
    await asServiceRole(async (db) => {
      await db.query("delete from public.coach_manual_swimmers");
    });
  });

  it("coach A can INSERT with own coach_id", async () => {
    await asUser(COACH_A, async (db) => {
      const r = await db.query(
        "insert into public.coach_manual_swimmers(coach_id, display_name) values ($1, $2) returning id",
        [COACH_A, "Invité 1"],
      );
      expect(r.rows.length).toBe(1);
    });
  });

  it("coach A cannot INSERT with coach_id of coach B", async () => {
    await asUser(COACH_A, async (db) => {
      await expect(db.query(
        "insert into public.coach_manual_swimmers(coach_id, display_name) values ($1, $2)",
        [COACH_B, "Spoof"],
      )).rejects.toThrow();
    });
  });

  it("coach A sees only own manuals", async () => {
    await asServiceRole(async (db) => {
      await db.query("insert into public.coach_manual_swimmers(coach_id, display_name) values ($1, 'A1'), ($2, 'B1')", [COACH_A, COACH_B]);
    });
    await asUser(COACH_A, async (db) => {
      const r = await db.query("select display_name from public.coach_manual_swimmers");
      expect(r.rows.map(x => x.display_name)).toEqual(["A1"]);
    });
  });

  it("coach A cannot DELETE coach B entries", async () => {
    await asServiceRole(async (db) => {
      await db.query("insert into public.coach_manual_swimmers(coach_id, display_name) values ($1, 'B1')", [COACH_B]);
    });
    await asUser(COACH_A, async (db) => {
      const r = await db.query("delete from public.coach_manual_swimmers");
      expect(r.rowCount).toBe(0);  // RLS filtre, pas d'erreur, 0 lignes
    });
    await asServiceRole(async (db) => {
      const r = await db.query("select count(*)::int as c from public.coach_manual_swimmers");
      expect(r.rows[0].c).toBe(1);
    });
  });

  it("athlete sees nothing", async () => {
    await asServiceRole(async (db) => {
      await db.query("insert into public.coach_manual_swimmers(coach_id, display_name) values ($1, 'A1')", [COACH_A]);
    });
    await asUser(ATHLETE, async (db) => {
      const r = await db.query("select count(*)::int as c from public.coach_manual_swimmers");
      expect(r.rows[0].c).toBe(0);
    });
  });
});
```

**Step 2 — Lancer les tests RLS**

Run (Docker must be running — demander à l'utilisateur de lancer Docker Desktop si nécessaire) :
```bash
docker ps && npm run test:rls -- coach_manual_swimmers
```
Expected : 5 tests verts.

**Step 3 — Commit tâches 10-11**

```bash
git add supabase/tests/
git commit -m "test(§126): tests RLS coach_manual_swimmers (5 assertions)"
```

---

## Task 12 — Module API coach-manual-swimmers

**Files:**
- Create: `src/lib/api/coach-manual-swimmers.ts`

**Step 1 — Contenu**

```ts
import { supabase, canUseSupabase } from "./client";

export interface CoachManualSwimmer {
  id: string;
  coach_id: string;
  display_name: string;
  created_at: string;
}

export async function listManualSwimmers(): Promise<CoachManualSwimmer[]> {
  if (!canUseSupabase()) return [];
  const { data, error } = await supabase
    .from("coach_manual_swimmers")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as CoachManualSwimmer[];
}

export async function createManualSwimmer(displayName: string): Promise<CoachManualSwimmer> {
  if (!canUseSupabase()) throw new Error("Supabase not available");
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Non authentifié");
  const trimmed = displayName.trim();
  if (!trimmed) throw new Error("Nom requis");
  const { data, error } = await supabase
    .from("coach_manual_swimmers")
    .insert({ coach_id: user.id, display_name: trimmed })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as CoachManualSwimmer;
}

export async function deleteManualSwimmer(id: string): Promise<void> {
  if (!canUseSupabase()) throw new Error("Supabase not available");
  const { error } = await supabase
    .from("coach_manual_swimmers")
    .delete()
    .eq("id", id);
  if (error) throw new Error(error.message);
}
```

**Step 2 — Build**

Run: `npx tsc --noEmit`
Expected: OK.

**Step 3 — Commit**

```bash
git add src/lib/api/coach-manual-swimmers.ts
git commit -m "feat(§126): API coach-manual-swimmers (list/create/delete)"
```

---

## Task 13 — Tabs Club / Mes manuels / Nouveau dans le sheet

**Files:**
- Modify: `src/components/chrono/ChronoSetup.tsx`

**Step 1 — Refactor du sheet en 3 tabs**

Utiliser `Tabs` de Radix UI (déjà dans le projet : `@radix-ui/react-tabs`). Imports :

```tsx
import { Tabs, TabsList, TabsTrigger, TabsContent } from "../ui/tabs";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { listManualSwimmers, createManualSwimmer, deleteManualSwimmer } from "../../lib/api/coach-manual-swimmers";
import { buildRegisteredSwimmer, buildManualSwimmer } from "../../lib/chrono-types";
import { Trash2 } from "lucide-react";
```

**Step 2 — Squelette du nouveau `<SheetContent>`**

```tsx
<Tabs defaultValue="club" className="flex-1 flex flex-col overflow-hidden">
  <TabsList className="grid grid-cols-3 w-full">
    <TabsTrigger value="club">Club</TabsTrigger>
    <TabsTrigger value="manuals">Mes manuels</TabsTrigger>
    <TabsTrigger value="new">Nouveau</TabsTrigger>
  </TabsList>

  <TabsContent value="club" className="flex-1 overflow-y-auto">
    {/* contenu existant club — extraire le rendu actuel ici */}
  </TabsContent>

  <TabsContent value="manuals" className="flex-1 overflow-y-auto">
    <ManualsTabBody addLane={addLane!} onAdded={() => setAddLane(null)} />
  </TabsContent>

  <TabsContent value="new" className="flex-1">
    <NewManualTabBody addLane={addLane!} onAdded={() => setAddLane(null)} dispatch={dispatch} />
  </TabsContent>
</Tabs>
```

**Step 3 — Sous-composant `ManualsTabBody`**

```tsx
function ManualsTabBody({ addLane, onAdded, dispatch }: { addLane: number; onAdded: () => void; dispatch: React.Dispatch<ChronoAction> }) {
  const queryClient = useQueryClient();
  const { data: manuals = [] } = useQuery({
    queryKey: ["coach_manual_swimmers"],
    queryFn: listManualSwimmers,
  });
  const delMutation = useMutation({
    mutationFn: deleteManualSwimmer,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["coach_manual_swimmers"] }),
  });
  if (manuals.length === 0) {
    return <p className="py-8 text-center text-sm text-muted-foreground">Aucun manuel mémorisé. Utilisez l'onglet Nouveau.</p>;
  }
  return (
    <ul className="flex flex-col">
      {manuals.map(m => (
        <li key={m.id} className="flex items-center">
          <button
            type="button"
            onClick={() => {
              dispatch({ type: "ADD_SWIMMER", swimmer: buildManualSwimmer({
                manualId: crypto.randomUUID(),
                displayName: m.display_name,
                lane: addLane,
              })});
              onAdded();
            }}
            className="flex-1 min-h-[44px] px-3 py-2 text-left text-sm hover:bg-muted"
          >
            {m.display_name}
          </button>
          <button
            type="button"
            onClick={() => delMutation.mutate(m.id)}
            className="flex h-9 w-9 items-center justify-center text-muted-foreground hover:text-destructive"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </li>
      ))}
    </ul>
  );
}
```

**Step 4 — Sous-composant `NewManualTabBody`**

```tsx
function NewManualTabBody({ addLane, onAdded, dispatch }: { addLane: number; onAdded: () => void; dispatch: React.Dispatch<ChronoAction> }) {
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [remember, setRemember] = useState(true);
  const saveMutation = useMutation({
    mutationFn: createManualSwimmer,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["coach_manual_swimmers"] }),
  });
  const submit = async () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    if (remember) {
      try { await saveMutation.mutateAsync(trimmed); }
      catch { /* offline : on ajoute quand même en volatil */ }
    }
    dispatch({ type: "ADD_SWIMMER", swimmer: buildManualSwimmer({
      manualId: crypto.randomUUID(),
      displayName: trimmed,
      lane: addLane,
    })});
    setName("");
    onAdded();
  };
  return (
    <div className="flex flex-col gap-3 pt-4">
      <Input autoFocus value={name} placeholder="Prénom Nom" onChange={e => setName(e.target.value)} />
      <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
        <Switch checked={remember} onCheckedChange={setRemember} />
        Mémoriser pour plus tard
      </label>
      <Button disabled={!name.trim()} onClick={submit}>Ajouter</Button>
    </div>
  );
}
```

**Step 5 — Chip manuel dans les lanes**

Dans le bloc qui rend chaque swimmer dans une ligne, juste après le displayName, ajouter :
```tsx
{s.kind === "manual" && (
  <span className="inline-flex h-4 items-center rounded px-1 text-[9px] font-semibold bg-muted text-muted-foreground">M</span>
)}
```

**Step 6 — Build + tests**

Run: `npm run build && npm test`
Expected: OK.

**Step 7 — Commit (fonctionnel, polish au pass 2)**

```bash
git commit -am "feat(§126): sheet ajout nageur — tabs Club/Manuels/Nouveau + API wiring"
```

---

## Task 14 — /frontend-design pass 2 : polish du sheet

**Step 1 — Invoquer**

```
/frontend-design:frontend-design
```

**Brief :**
> Polish UI du sheet d'ajout de nageur dans ChronoSetup.tsx. 3 tabs existants :
> - Club : liste groupée (existant).
> - Mes manuels : liste avec suppression par item.
> - Nouveau : formulaire (input + switch "Mémoriser" + bouton "Ajouter").
>
> Objectifs : 
> - Touch targets 44px minimum (poolside tablet).
> - Tabs visuellement clairs, état actif prononcé.
> - État vide "Mes manuels" engageant (icône + CTA vers "Nouveau").
> - Form Nouveau : autofocus, submit sur Enter, loading spinner si mémorisation en cours.
> - Cohérence Tailwind 4 + tokens Radix (bg-muted, border, text-foreground).

**Step 2 — Commit**

```bash
git commit -am "style(§126): polish UI sheet ajout nageur (frontend-design pass 2)"
```

---

## Task 15 — Module chronoXlsxExport (pur, testable)

**Files:**
- Modify: `package.json` (ajouter `xlsx`)
- Create: `src/lib/chronoXlsxExport.ts`

**Step 1 — Ajouter la dépendance**

Run: `npm install xlsx`
(Vérifier licence MIT. Le package publié par SheetJS s'appelle `xlsx` v0.20+ en CE.)

**Step 2 — Écrire le module**

```ts
import type { ChronoRecord, ChronoRecordSwimmer } from "./api/types";
import { normalizeRecordSwimmer } from "./chrono-types";
import { formatTime } from "../hooks/useChronoTimer";

export function sanitizeFilename(s: string): string {
  const cleaned = s
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")  // strip accents
    .replace(/[\\/:*?"<>|]/g, "-")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return cleaned || "Chrono";
}

function maxSeriesCount(swimmers: ChronoRecordSwimmer[]): number {
  return Math.max(0, ...swimmers.map(sw => sw.splitsByRep.length));
}

function maxSplitsInSeries(swimmers: ChronoRecordSwimmer[], seriesIdx: number): number {
  return Math.max(0, ...swimmers.map(sw => sw.splitsByRep[seriesIdx]?.length ?? 0));
}

/** Pure — builds 2D array for xlsx. Testable without loading SheetJS. */
export function buildSheetData(record: Pick<ChronoRecord, "label" | "config" | "swimmers" | "created_at">): (string | number)[][] {
  const swimmers = record.swimmers.map(normalizeRecordSwimmer);
  const nSeries = maxSeriesCount(swimmers);
  const splitD = record.config.splitDistanceM;
  const labelFor = (i: number) => splitD > 0 ? `${(i + 1) * splitD}m` : `#${i + 1}`;

  const rows: (string | number)[][] = [];
  rows.push([record.label || "Chrono"]);
  rows.push([new Date(record.created_at).toLocaleString("fr-FR")]);
  const configParts: string[] = [];
  if (record.config.seriesCount > 0) configParts.push(`${record.config.seriesCount}×`);
  if (record.config.totalDistanceM > 0) configParts.push(`${record.config.totalDistanceM}m`);
  if (record.config.splitDistanceM > 0) configParts.push(`splits ${record.config.splitDistanceM}m`);
  configParts.push(`${record.config.laneCount} ligne${record.config.laneCount > 1 ? "s" : ""}`);
  rows.push([configParts.join(" · ")]);
  rows.push([]);

  // header
  const header: string[] = ["Nageur", "Ligne", "Vague", "Type"];
  for (let s = 0; s < nSeries; s++) {
    header.push(`S${s + 1} total`);
    const nSplits = maxSplitsInSeries(swimmers, s);
    for (let i = 0; i < nSplits; i++) {
      header.push(`S${s + 1} ${labelFor(i)}`);
    }
  }
  rows.push(header);

  for (const sw of swimmers) {
    const row: (string | number)[] = [
      sw.displayName,
      sw.lane,
      `V${sw.wave}`,
      sw.kind === "manual" ? "M" : "C",
    ];
    for (let s = 0; s < nSeries; s++) {
      const splits = sw.splitsByRep[s] ?? [];
      const total = splits.length > 0 ? splits[splits.length - 1].cumulativeMs : 0;
      row.push(total > 0 ? formatTime(total) : "");
      const nSplits = maxSplitsInSeries(swimmers, s);
      for (let i = 0; i < nSplits; i++) {
        const split = splits[i];
        row.push(split ? formatTime(split.cumulativeMs) : "");
      }
    }
    rows.push(row);
  }
  return rows;
}

export async function exportChronoToXlsx(record: Pick<ChronoRecord, "label" | "config" | "swimmers" | "created_at">): Promise<void> {
  const XLSX = await import("xlsx");
  const data = buildSheetData(record);
  const ws = XLSX.utils.aoa_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Chrono");
  const filename = sanitizeFilename(record.label || "Chrono") + ".xlsx";
  XLSX.writeFile(wb, filename);
}
```

**Step 3 — Build**

Run: `npm run build`
Expected: OK, aucun import statique de `xlsx` dans le bundle principal (vérifié task 20).

**Step 4 — Commit**

```bash
git add package.json package-lock.json src/lib/chronoXlsxExport.ts
git commit -m "feat(§126): module chronoXlsxExport (lazy xlsx + builder pur)"
```

---

## Task 16 — Tests buildSheetData + sanitizeFilename

**Files:**
- Create: `src/lib/__tests__/chronoXlsxExport.test.ts`

**Step 1 — Tests**

```ts
import { describe, it, expect } from "vitest";
import { buildSheetData, sanitizeFilename } from "../chronoXlsxExport";
import type { ChronoRecord } from "../api/types";

function fakeRecord(overrides: Partial<ChronoRecord> = {}): ChronoRecord {
  return {
    id: "rec-1",
    coach_id: "coach-1",
    status: "sent",
    label: "Test",
    config: { totalDistanceM: 100, splitDistanceM: 50, seriesCount: 2, laneCount: 2 },
    swimmers: [],
    created_at: "2026-04-17T10:00:00Z",
    updated_at: "2026-04-17T10:00:00Z",
    ...overrides,
  };
}

describe("sanitizeFilename", () => {
  it("strips slashes and colons", () => {
    expect(sanitizeFilename("Stage / Pâques : 100m")).toMatch(/^Stage-Paques-100m$/);
  });
  it("returns Chrono if empty after clean", () => {
    expect(sanitizeFilename("/////")).toBe("Chrono");
  });
  it("truncates at 80 chars", () => {
    expect(sanitizeFilename("a".repeat(200)).length).toBeLessThanOrEqual(80);
  });
});

describe("buildSheetData", () => {
  it("returns header rows even with no swimmers", () => {
    const rows = buildSheetData(fakeRecord({ label: "Vide", swimmers: [] }));
    expect(rows[0]).toEqual(["Vide"]);
    expect(rows[3]).toEqual([]);
    expect(rows[4]).toEqual(["Nageur", "Ligne", "Vague", "Type"]);
  });

  it("includes registered + manual swimmers with correct type col", () => {
    const rows = buildSheetData(fakeRecord({
      swimmers: [
        { athleteId: 10, displayName: "A", lane: 1, wave: 1, splitsByRep: [[{ distanceM: 50, cumulativeMs: 30000, lapMs: 30000 }]] },
        { athleteId: null, manualId: "u1", kind: "manual", displayName: "B", lane: 1, wave: 1, splitsByRep: [[{ distanceM: 50, cumulativeMs: 32000, lapMs: 32000 }]] },
      ],
    }));
    const dataRows = rows.slice(5);
    expect(dataRows[0][0]).toBe("A");
    expect(dataRows[0][3]).toBe("C");
    expect(dataRows[1][0]).toBe("B");
    expect(dataRows[1][3]).toBe("M");
  });

  it("formats times with centièmes precision (m:ss.cc)", () => {
    const rows = buildSheetData(fakeRecord({
      swimmers: [{ athleteId: 1, displayName: "A", lane: 1, wave: 1, splitsByRep: [[{ distanceM: 50, cumulativeMs: 65320, lapMs: 65320 }]] }],
    }));
    const dataRow = rows[5];
    expect(dataRow).toContain("1:05.32");
  });

  it("handles legacy records without kind (infers registered)", () => {
    const rows = buildSheetData(fakeRecord({
      swimmers: [{ athleteId: 42, displayName: "Legacy", lane: 1, wave: 1, splitsByRep: [] } as any],
    }));
    expect(rows[5][3]).toBe("C");
  });
});
```

**Step 2 — Lancer les tests**

Run: `npm test -- chronoXlsxExport`
Expected: tous verts.

**Step 3 — Commit**

```bash
git add src/lib/__tests__/chronoXlsxExport.test.ts
git commit -m "test(§126): buildSheetData + sanitizeFilename (xlsx export)"
```

---

## Task 17 — Bouton export XLSX dans ChronoResults

**Files:**
- Modify: `src/components/chrono/ChronoResults.tsx`

**Step 1 — Imports**

```ts
import { exportChronoToXlsx } from "../../lib/chronoXlsxExport";
import { Download } from "lucide-react";
```

**Step 2 — Handler**

```ts
const [exporting, setExportingXlsx] = useState(false);
const handleExportXlsx = useCallback(async () => {
  setExportingXlsx(true);
  try {
    const input = buildChronoRecordInput(state, "draft");
    await exportChronoToXlsx({
      label: input.label,
      config: input.config,
      swimmers: input.swimmers,
      created_at: new Date().toISOString(),
    });
    toast.success("Fichier téléchargé");
  } catch (err: any) {
    toast.error(err?.message || "Échec de l'export");
  } finally {
    setExportingXlsx(false);
  }
}, [state]);
```

**Step 3 — Bouton dans le header**

Ajouter un bouton entre "Brouillon" et "Nouvelle série" :
```tsx
<Button variant="outline" size="sm" onClick={handleExportXlsx} disabled={exporting}>
  <Download className="mr-1.5 h-4 w-4" />
  Exporter xlsx
</Button>
```

**Step 4 — Renommer le state existant pour éviter collision**

Renommer le `exporting` actuel (pour "Envoyer à tous") en `sending` pour libérer le nom `exporting` pour xlsx, ou autre solution. Ou nommer le nouveau `exportingXlsx` partout. Choisir une option et l'appliquer proprement.

**Step 5 — Build**

Run: `npm run build && npm test`
Expected: OK.

**Step 6 — Commit**

```bash
git commit -am "feat(§126): bouton 'Exporter xlsx' dans ChronoResults"
```

---

## Task 18 — Export XLSX depuis Historique (liste + détail)

**Files:**
- Modify: `src/pages/coach/CoachChronoHistoryScreen.tsx`

**Step 1 — Imports**

```ts
import { exportChronoToXlsx } from "../../lib/chronoXlsxExport";
import { Download } from "lucide-react";
```

**Step 2 — Handler**

```ts
const handleDownload = async (record: ChronoRecord) => {
  try {
    await exportChronoToXlsx(record);
    toast.success("Fichier téléchargé");
  } catch (err: any) {
    toast.error(err?.message || "Échec de l'export");
  }
};
```

**Step 3 — Bouton dans la liste**

Avant le bouton Trash2 actuel dans la liste, ajouter :
```tsx
<button
  type="button"
  onClick={(e) => { e.stopPropagation(); handleDownload(r); }}
  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
  aria-label="Exporter en xlsx"
>
  <Download className="h-4 w-4" />
</button>
```

**Step 4 — Bouton dans le header détail**

À côté du badge status :
```tsx
<Button variant="outline" size="sm" onClick={() => handleDownload(selectedRecord)}>
  <Download className="mr-1.5 h-4 w-4" />
  xlsx
</Button>
```

**Step 5 — Build + test manuel**

Run: `npm run build`
Expected: OK.

**Step 6 — Commit**

```bash
git commit -am "feat(§126): bouton export xlsx dans historique (liste + détail)"
```

---

## Task 19 — /frontend-design pass 3 : polish boutons export

**Step 1 — Invoquer**

```
/frontend-design:frontend-design
```

**Brief :**
> Polish UI des 3 points d'export xlsx :
> 1. **ChronoResults** : bouton "Exporter xlsx" dans header (à côté de Brouillon / Nouvelle série / Envoyer à tous). Loading state pendant import dynamique du module.
> 2. **CoachChronoHistoryScreen liste** : petit bouton icon-only ⬇️ par ligne, touch 44px, couleur neutre qui s'illumine au hover.
> 3. **CoachChronoHistoryScreen détail** : bouton "xlsx" dans le header éditeur à côté du badge status.
>
> Cohérence avec le style existant (icônes lucide-react, Tailwind 4, tokens bg-muted/border/text-foreground). Respect minimum touch 44px tablette.

**Step 2 — Commit**

```bash
git commit -am "style(§126): polish UI boutons export xlsx (frontend-design pass 3)"
```

---

## Task 20 — Vérification bundle

**Step 1 — Build avec analyse**

Run: `npm run build`

**Step 2 — Inspecter rollup-visualizer**

Si le plugin est configuré, consulter `dist/stats.html` (ou `stats.html`) et vérifier que :
- `xlsx` n'apparaît PAS dans le chunk principal.
- `xlsx` est bien dans un chunk dynamique séparé (lazy).

Si pas configuré, fallback : chercher la présence de `xlsx` dans les chunks main :
```bash
grep -l "xlsx" dist/assets/*.js | head -5
```

Expected : `xlsx` seulement dans un chunk `chunk-*.js` ou `chronoXlsxExport-*.js`, pas dans `index-*.js`.

**Step 3 — Si bundle principal gonflé**

Vérifier que `chronoXlsxExport` est bien importé dynamiquement depuis les composants (import statique OK, c'est `await import("xlsx")` qui split). Corriger si besoin.

**Step 4 — Pas de commit** (simple vérif).

---

## Task 21 — Documentation

**Files:**
- Modify: `docs/implementation-log.md` — ajouter §126
- Modify: `docs/ROADMAP.md` — ajouter ligne chantier 90 Fait (§126) + mise à jour "Dernière mise à jour"
- Modify: `docs/FEATURES_STATUS.md` — ajouter/mettre à jour features chrono
- Modify: `CLAUDE.md` — fichiers clés + table chantiers

**Step 1 — Log implémentation**

Ajouter à `docs/implementation-log.md` un §126 avec :
- Contexte : 3 manques identifiés
- Décisions : clé composite, tabs sheet, xlsx lazy, titre optionnel
- Fichiers créés : `coach-manual-swimmers.ts` (API), `chronoXlsxExport.ts`, migration SQL, tests
- Fichiers modifiés : chrono-types / chrono-reducer (+SET_TITLE, +kind), ChronoSetup (+tabs), ChronoResults (+xlsx + titre), CoachChronoHistoryScreen (+xlsx + edit label)
- Tests : +10 reducer, +5 RLS, +4 xlsx
- Bundle : xlsx en lazy chunk (pas d'impact main)
- Limites : pas d'export multi-séances, pas d'import xlsx, pas de groupes de manuels

**Step 2 — Roadmap**

```markdown
| 90 | Chrono : nageurs manuels + titre séance + export XLSX | Moyenne | Fait (§126) |
```

+ ligne `*Dernière mise à jour* : 2026-04-17`

**Step 3 — CLAUDE.md — fichiers clés**

Mesurer les tailles :
```bash
wc -l src/lib/chrono-types.ts src/lib/chrono-reducer.ts src/lib/chronoXlsxExport.ts src/lib/api/coach-manual-swimmers.ts src/components/chrono/ChronoSetup.tsx src/components/chrono/ChronoResults.tsx src/pages/coach/CoachChronoHistoryScreen.tsx src/pages/coach/CoachChronoScreen.tsx
```

Ajouter lignes nouvelles / mettre à jour lignes existantes dont la taille a varié >30%.

Ajouter table "Chantiers futurs" — entrée §126.

**Step 4 — FEATURES_STATUS.md**

Marquer la feature "Chrono coach" comme ✅ étendue (manuels + xlsx + titre).

**Step 5 — Commit final**

```bash
git commit -am "docs(§126): implementation log + roadmap + CLAUDE.md + features status"
```

---

## Validation finale

**Step 1 — Tests suite complète**

Run: `npm test`
Expected : tous verts (dont 10+ nouveaux sur reducer, 4 sur xlsx, éventuellement 3 sur normalizeRecordSwimmer).

**Step 2 — Tests RLS**

```bash
docker ps  # doit tourner
npm run test:rls -- coach_manual_swimmers
```
Expected : 5 verts.

**Step 3 — Build**

Run: `npm run build`
Expected : OK, pas d'erreur TS, pas de warning grave, chunk xlsx séparé.

**Step 4 — Smoke test manuel** (à faire par l'utilisateur en browser) :

Scénarios minimaux :
- [ ] Setup : ajouter 1 inscrit + 1 manuel "express" + 1 manuel via "Mes manuels" (après avoir mémorisé un). Voir badge M.
- [ ] Setup : saisir un titre, puis reload → titre restauré (localStorage backup).
- [ ] Course : RECORD_SPLIT sur un manuel fonctionne.
- [ ] Résultats : bouton "Exporter xlsx" télécharge un fichier. Ouvrir dans Excel/Numbers : titre + 1 ligne par nageur + colonnes splits.
- [ ] Résultats : "Envoyer à tous" skip les manuels proprement (toast récap).
- [ ] Résultats : édition du titre se répercute dans l'historique.
- [ ] Historique liste : icône ⬇️ télécharge xlsx depuis un record sauvé.
- [ ] Historique détail : édition du titre ✏️ + bouton xlsx OK.
- [ ] Coach A ne voit pas les manuels de coach B (test DB via Supabase dashboard ou inspecter la Network tab).

---

## Risques et rappels

- **Refacto invasive** : la migration `athleteId: number → key: string` touche 5+ fichiers. Tester exhaustivement via `npm test && npm run build` après tâche 5.
- **localStorage backup legacy** : un state ChronoState sérialisé AVANT cette migration ne contiendra pas `title` ni `kind`. `deserializeState` fait un simple `JSON.parse` — le state manquera de champs. Mitigation : au restore, appliquer `{ ...initialChronoState, ...parsed }` pour garantir les défauts. Ajouter ce patch dans `CoachChronoScreen.tsx:deserializeState`.
- **Écosystème `xlsx`** : Version MIT est publique. Vérifier au `npm install` qu'aucun warning de sécurité ne remonte (advisory audit). Si blocage : fallback `exceljs` (plus lourd ~900KB).
- **Docker manquant** pour test RLS : NE PAS lancer `open -a Docker` automatiquement. Demander à l'utilisateur avant, cf. règles CLAUDE.md.

---

## Execution Handoff

**Plan complete and saved to `docs/plans/2026-04-17-chrono-manual-swimmers-xlsx-plan.md`. Two execution options:**

1. **Subagent-Driven (this session)** — Un subagent par tâche, review entre chaque. Itération rapide, contrôle serré.
2. **Parallel Session (separate)** — Nouvelle session, skill `executing-plans`, exécution par lots avec checkpoints.

**Which approach?**
