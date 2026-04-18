# Chrono — Exercices par vague — Plan d'implémentation

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Permettre au coach de personnaliser `seriesCount`, `totalDistanceM`, `splitDistanceM` par vague dans le chrono, en gardant la config globale comme défaut (mode override).

**Architecture:** Ajout d'un sous-objet `WaveState.overrides: WaveConfigOverrides | null` (null = hérite). Helper `resolveWaveConfig(state, waveNumber)` utilisé partout où la config est consommée (Race, Results, XLSX). Aucune migration DB : on utilise le champ `jsonb` existant de `chrono_records.config` pour stocker `waveOverrides?: Record<number, WaveConfigOverrides>`.

**Tech Stack:** React 19 + TypeScript, Zustand non utilisé ici (reducer local), Vitest pour les tests unitaires.

**Design doc de référence :** `docs/plans/2026-04-18-chrono-per-wave-config-design.md`

---

## Pre-flight

Avant de commencer, vérifier :

```bash
git status                 # doit être clean ou sur la branche de travail
npx tsc --noEmit           # doit passer
npm test -- --run          # doit passer
```

**Worktree** : ce plan peut être exécuté directement sur `main` (patch contenu, pas de refactor massif) OU dans un worktree dédié (`superpowers:using-git-worktrees`).

---

## Task 1 : Types `WaveConfigOverrides` + champ `WaveState.overrides`

**Files:**
- Modify: `src/lib/chrono-types.ts`

**Step 1: Ajouter le type + étendre `WaveState`**

Dans `src/lib/chrono-types.ts`, juste après `SwimmerRaceState` :

```ts
export interface WaveConfigOverrides {
  seriesCount?: number;
  totalDistanceM?: number;
  splitDistanceM?: number;
}
```

Dans l'interface `WaveState`, ajouter :

```ts
export interface WaveState {
  wave: number;
  startedAt: number | null;
  stopped: boolean;
  currentRep: number;
  departureIntervalSec: number;
  lastFinishedAt: number | null;
  overrides: WaveConfigOverrides | null;  // ← NEW
}
```

**Step 2: Type check**

```bash
npx tsc --noEmit 2>&1 | head -30
```

Expected: va révéler des erreurs dans `chrono-reducer.ts` et éventuellement ailleurs (champ manquant). **C'est attendu** — on corrige à la Task 2.

**Step 3: Ne pas committer encore** — on groupera avec Task 2 pour un commit cohérent.

---

## Task 2 : Initialiser `overrides: null` dans `computeWaves`

**Files:**
- Modify: `src/lib/chrono-reducer.ts:36-48`

**Step 1: Update `computeWaves`**

Remplacer la ligne :
```ts
return existing ?? { wave, startedAt: null, stopped: false, currentRep: 0, departureIntervalSec: 0, lastFinishedAt: null };
```

Par :
```ts
return existing ?? { wave, startedAt: null, stopped: false, currentRep: 0, departureIntervalSec: 0, lastFinishedAt: null, overrides: null };
```

**Step 2: Type check**

```bash
npx tsc --noEmit
```

Expected: PASS (plus d'erreurs liées à `WaveState`).

**Step 3: Tests existants passent toujours**

```bash
npm test -- --run src/lib/__tests__/chrono-reducer.test.ts
```

Expected: tous verts (le champ `overrides: null` est compatible avec les assertions actuelles qui ne l'inspectent pas).

**Step 4: Commit**

```bash
git add src/lib/chrono-types.ts src/lib/chrono-reducer.ts
git commit -m "feat(chrono): add WaveConfigOverrides type + overrides field on WaveState"
```

---

## Task 3 : TDD `resolveWaveConfig` helper

**Files:**
- Create: `src/lib/__tests__/chrono-types.test.ts`
- Modify: `src/lib/chrono-types.ts`

**Step 1: Écrire le fichier de test (doit échouer)**

Créer `src/lib/__tests__/chrono-types.test.ts` :

```ts
import { describe, it, expect } from "vitest";
import { resolveWaveConfig } from "../chrono-types";
import type { ChronoState } from "../chrono-types";

function baseState(): Pick<ChronoState, "seriesCount" | "totalDistanceM" | "splitDistanceM" | "waves"> {
  return {
    seriesCount: 3,
    totalDistanceM: 200,
    splitDistanceM: 50,
    waves: [
      { wave: 1, startedAt: null, stopped: false, currentRep: 0, departureIntervalSec: 0, lastFinishedAt: null, overrides: null },
      { wave: 2, startedAt: null, stopped: false, currentRep: 0, departureIntervalSec: 0, lastFinishedAt: null, overrides: null },
    ],
  };
}

describe("resolveWaveConfig", () => {
  it("falls back to global when wave not found", () => {
    const s = baseState();
    expect(resolveWaveConfig(s, 99)).toEqual({
      seriesCount: 3, totalDistanceM: 200, splitDistanceM: 50,
    });
  });

  it("falls back to global when overrides is null", () => {
    const s = baseState();
    expect(resolveWaveConfig(s, 1)).toEqual({
      seriesCount: 3, totalDistanceM: 200, splitDistanceM: 50,
    });
  });

  it("merges partial override with global", () => {
    const s = baseState();
    s.waves[1].overrides = { seriesCount: 6 };
    expect(resolveWaveConfig(s, 2)).toEqual({
      seriesCount: 6, totalDistanceM: 200, splitDistanceM: 50,
    });
  });

  it("returns full override when all fields set", () => {
    const s = baseState();
    s.waves[1].overrides = { seriesCount: 6, totalDistanceM: 100, splitDistanceM: 25 };
    expect(resolveWaveConfig(s, 2)).toEqual({
      seriesCount: 6, totalDistanceM: 100, splitDistanceM: 25,
    });
  });
});
```

**Step 2: Lancer et voir échouer**

```bash
npm test -- --run src/lib/__tests__/chrono-types.test.ts
```

Expected: FAIL avec "resolveWaveConfig is not a function" / "not exported".

**Step 3: Implémenter `resolveWaveConfig`**

Ajouter à la fin de `src/lib/chrono-types.ts` :

```ts
export function resolveWaveConfig(
  state: Pick<ChronoState, "seriesCount" | "totalDistanceM" | "splitDistanceM" | "waves">,
  wave: number,
): { seriesCount: number; totalDistanceM: number; splitDistanceM: number } {
  const w = state.waves.find((w) => w.wave === wave);
  return {
    seriesCount:    w?.overrides?.seriesCount    ?? state.seriesCount,
    totalDistanceM: w?.overrides?.totalDistanceM ?? state.totalDistanceM,
    splitDistanceM: w?.overrides?.splitDistanceM ?? state.splitDistanceM,
  };
}
```

**Step 4: Lancer les tests — doivent passer**

```bash
npm test -- --run src/lib/__tests__/chrono-types.test.ts
```

Expected: PASS 4/4.

**Step 5: Commit**

```bash
git add src/lib/chrono-types.ts src/lib/__tests__/chrono-types.test.ts
git commit -m "feat(chrono): add resolveWaveConfig helper (overrides ?? global)"
```

---

## Task 4 : TDD action `SET_WAVE_OVERRIDES`

**Files:**
- Modify: `src/lib/chrono-reducer.ts:11-30`
- Modify: `src/lib/__tests__/chrono-reducer.test.ts`

**Step 1: Écrire le test (doit échouer)**

Ajouter dans `src/lib/__tests__/chrono-reducer.test.ts` (à la fin, avant la dernière ligne) :

```ts
describe("SET_WAVE_OVERRIDES", () => {
  it("sets the full override object on the target wave", () => {
    const s0 = reduce(initialChronoState,
      { type: "ADD_SWIMMER", swimmer: reg(1, 1) },
      { type: "ADD_SWIMMER", swimmer: reg(2, 2) },
    );
    const s1 = chronoReducer(s0, {
      type: "SET_WAVE_OVERRIDES",
      wave: 2,
      overrides: { seriesCount: 6, totalDistanceM: 100, splitDistanceM: 25 },
    });
    expect(s1.waves.find((w) => w.wave === 2)?.overrides).toEqual({
      seriesCount: 6, totalDistanceM: 100, splitDistanceM: 25,
    });
    expect(s1.waves.find((w) => w.wave === 1)?.overrides).toBeNull();
  });

  it("resets the override when null is passed", () => {
    const s0 = reduce(initialChronoState,
      { type: "ADD_SWIMMER", swimmer: reg(1, 1) },
      { type: "SET_WAVE_OVERRIDES", wave: 1, overrides: { seriesCount: 4 } },
    );
    const s1 = chronoReducer(s0, { type: "SET_WAVE_OVERRIDES", wave: 1, overrides: null });
    expect(s1.waves.find((w) => w.wave === 1)?.overrides).toBeNull();
  });

  it("no-op on non-existent wave", () => {
    const s0 = reduce(initialChronoState, { type: "ADD_SWIMMER", swimmer: reg(1, 1) });
    const s1 = chronoReducer(s0, {
      type: "SET_WAVE_OVERRIDES",
      wave: 99,
      overrides: { seriesCount: 6 },
    });
    expect(s1.waves).toEqual(s0.waves);
  });
});
```

**Step 2: Lancer et voir échouer**

```bash
npm test -- --run src/lib/__tests__/chrono-reducer.test.ts -t "SET_WAVE_OVERRIDES"
```

Expected: FAIL (action non gérée, reducer retourne l'état inchangé).

**Step 3: Ajouter l'action au union type + au switch**

Dans `src/lib/chrono-reducer.ts`, dans le type `ChronoAction`, ajouter après `SET_WAVE_INTERVAL` :

```ts
| { type: "SET_WAVE_OVERRIDES"; wave: number; overrides: WaveConfigOverrides | null }
```

Ajouter l'import en haut :

```ts
import type {
  ChronoState,
  ChronoSwimmer,
  SplitRecord,
  SwimmerRaceState,
  WaveState,
  WaveConfigOverrides,   // ← NEW
} from "./chrono-types";
```

Dans le `switch`, ajouter le case après `SET_WAVE_INTERVAL` :

```ts
case "SET_WAVE_OVERRIDES": {
  const target = state.waves.find((w) => w.wave === action.wave);
  if (!target) return state;
  const waves = state.waves.map((w) =>
    w.wave === action.wave ? { ...w, overrides: action.overrides } : w,
  );
  return { ...state, waves };
}
```

**Step 4: Lancer les tests — doivent passer**

```bash
npm test -- --run src/lib/__tests__/chrono-reducer.test.ts -t "SET_WAVE_OVERRIDES"
```

Expected: PASS 3/3.

**Step 5: Commit**

```bash
git add src/lib/chrono-reducer.ts src/lib/__tests__/chrono-reducer.test.ts
git commit -m "feat(chrono): SET_WAVE_OVERRIDES action"
```

---

## Task 5 : TDD action `SET_WAVE_OVERRIDE_FIELD`

**Files:**
- Modify: `src/lib/chrono-reducer.ts`
- Modify: `src/lib/__tests__/chrono-reducer.test.ts`

**Step 1: Écrire le test**

Ajouter dans le fichier de test :

```ts
describe("SET_WAVE_OVERRIDE_FIELD", () => {
  it("updates a single field, leaving others untouched", () => {
    const s0 = reduce(initialChronoState,
      { type: "ADD_SWIMMER", swimmer: reg(1, 1) },
      { type: "SET_WAVE_OVERRIDES", wave: 1, overrides: { seriesCount: 3, totalDistanceM: 200, splitDistanceM: 50 } },
      { type: "SET_WAVE_OVERRIDE_FIELD", wave: 1, field: "seriesCount", value: 6 },
    );
    expect(s0.waves[0].overrides).toEqual({
      seriesCount: 6, totalDistanceM: 200, splitDistanceM: 50,
    });
  });

  it("clamps negative values to 0", () => {
    const s0 = reduce(initialChronoState,
      { type: "ADD_SWIMMER", swimmer: reg(1, 1) },
      { type: "SET_WAVE_OVERRIDES", wave: 1, overrides: { seriesCount: 3 } },
      { type: "SET_WAVE_OVERRIDE_FIELD", wave: 1, field: "seriesCount", value: -5 },
    );
    expect(s0.waves[0].overrides?.seriesCount).toBe(0);
  });

  it("no-op if overrides is null (coach must activate Personnaliser first)", () => {
    const s0 = reduce(initialChronoState,
      { type: "ADD_SWIMMER", swimmer: reg(1, 1) },
      { type: "SET_WAVE_OVERRIDE_FIELD", wave: 1, field: "seriesCount", value: 6 },
    );
    expect(s0.waves[0].overrides).toBeNull();
  });
});
```

**Step 2: Voir échouer**

```bash
npm test -- --run src/lib/__tests__/chrono-reducer.test.ts -t "SET_WAVE_OVERRIDE_FIELD"
```

Expected: FAIL.

**Step 3: Implémenter**

Ajouter à `ChronoAction` :

```ts
| { type: "SET_WAVE_OVERRIDE_FIELD"; wave: number; field: keyof WaveConfigOverrides; value: number }
```

Ajouter le case :

```ts
case "SET_WAVE_OVERRIDE_FIELD": {
  const target = state.waves.find((w) => w.wave === action.wave);
  if (!target || !target.overrides) return state;
  const clamped = Math.max(0, action.value);
  const waves = state.waves.map((w) =>
    w.wave === action.wave
      ? { ...w, overrides: { ...w.overrides, [action.field]: clamped } as WaveConfigOverrides }
      : w,
  );
  return { ...state, waves };
}
```

**Step 4: Tests passent**

```bash
npm test -- --run src/lib/__tests__/chrono-reducer.test.ts -t "SET_WAVE_OVERRIDE_FIELD"
```

Expected: PASS 3/3.

**Step 5: Commit**

```bash
git add src/lib/chrono-reducer.ts src/lib/__tests__/chrono-reducer.test.ts
git commit -m "feat(chrono): SET_WAVE_OVERRIDE_FIELD action"
```

---

## Task 6 : TDD `computeWaves` préserve overrides + `RESET_FOR_NEW_SERIES` préserve overrides

**Files:**
- Modify: `src/lib/__tests__/chrono-reducer.test.ts`

**Step 1: Écrire les tests**

```ts
describe("overrides persistence", () => {
  it("computeWaves preserves overrides when recomputed after ADD/REMOVE", () => {
    const s0 = reduce(initialChronoState,
      { type: "ADD_SWIMMER", swimmer: reg(1, 1) },
      { type: "ADD_SWIMMER", swimmer: reg(2, 2) },
      { type: "SET_WAVE_OVERRIDES", wave: 2, overrides: { seriesCount: 6 } },
      { type: "ADD_SWIMMER", swimmer: reg(3, 2) }, // triggers computeWaves
    );
    expect(s0.waves.find((w) => w.wave === 2)?.overrides).toEqual({ seriesCount: 6 });
  });

  it("RESET_FOR_NEW_SERIES preserves overrides", () => {
    const s0 = reduce(initialChronoState,
      { type: "ADD_SWIMMER", swimmer: reg(1, 1) },
      { type: "SET_WAVE_OVERRIDES", wave: 1, overrides: { seriesCount: 4, totalDistanceM: 100 } },
      { type: "START_RACE" },
      { type: "LAUNCH_WAVE", wave: 1, timestamp: 1000 },
      { type: "STOP_RACE", timestamp: 5000 },
      { type: "RESET_FOR_NEW_SERIES" },
    );
    expect(s0.phase).toBe("setup");
    expect(s0.waves[0].overrides).toEqual({ seriesCount: 4, totalDistanceM: 100 });
    expect(s0.waves[0].startedAt).toBeNull();
    expect(s0.waves[0].currentRep).toBe(0);
  });
});
```

**Step 2: Lancer**

```bash
npm test -- --run src/lib/__tests__/chrono-reducer.test.ts -t "overrides persistence"
```

Expected: PASS — `computeWaves` préserve déjà les vagues existantes (via `existingMap.get(wave)`), et `RESET_FOR_NEW_SERIES` reset spécifiquement `startedAt/stopped/currentRep/lastFinishedAt` (pas overrides).

Si un test échoue, corriger le reducer en conséquence. Sinon, **aucune modif code requise** → passer directement à Step 3.

**Step 3: Commit**

```bash
git add src/lib/__tests__/chrono-reducer.test.ts
git commit -m "test(chrono): verify overrides survive computeWaves + RESET_FOR_NEW_SERIES"
```

---

## Task 7 : Étendre `ChronoRecordConfig` avec `waveOverrides` optionnel

**Files:**
- Modify: `src/lib/api/types.ts:973-978`

**Step 1: Update du type**

Dans `src/lib/api/types.ts`, modifier `ChronoRecordConfig` :

```ts
export interface ChronoRecordConfig {
  totalDistanceM: number;
  splitDistanceM: number;
  seriesCount: number;
  laneCount: number;
  /** Optional per-wave overrides. Wave number → partial config. Absent = all waves use global. */
  waveOverrides?: Record<number, {
    seriesCount?: number;
    totalDistanceM?: number;
    splitDistanceM?: number;
  }>;
}
```

**Step 2: Type check**

```bash
npx tsc --noEmit
```

Expected: PASS.

**Step 3: Commit**

```bash
git add src/lib/api/types.ts
git commit -m "feat(chrono): extend ChronoRecordConfig with optional waveOverrides"
```

---

## Task 8 : ChronoSetup — refonte bloc vagues en cartes

**Files:**
- Modify: `src/components/chrono/ChronoSetup.tsx:186-231`

**Contexte** : on remplace le bloc actuel « Départ toutes les : [V1] [3] min [00] sec » par une liste de cartes, une par vague.

**Step 1: Remplacer le bloc JSX (lignes ~186-231)**

Le bloc actuel :

```tsx
{activeWaves.length > 0 && (
  <div className="flex flex-col gap-2">
    <span className="text-sm text-muted-foreground">Départ toutes les :</span>
    <div className="flex flex-wrap items-center gap-3">
      {activeWaves.map((w) => { ... })}
    </div>
  </div>
)}
```

Doit devenir :

```tsx
{activeWaves.length > 0 && (
  <div className="flex flex-col gap-2">
    <div className="flex items-baseline justify-between">
      <span className="text-sm text-muted-foreground">Par vague</span>
      {state.waves.some((w) => w.overrides !== null) && (
        <span className="text-[10px] text-muted-foreground/70 italic">
          {state.waves.filter((w) => w.overrides !== null).length} personnalisée{state.waves.filter((w) => w.overrides !== null).length > 1 ? "s" : ""}
        </span>
      )}
    </div>
    <div className="flex flex-col gap-2">
      {activeWaves.map((w) => (
        <WaveConfigCard
          key={w}
          wave={w}
          state={state}
          dispatch={dispatch}
        />
      ))}
    </div>
  </div>
)}
```

**Step 2: Ajouter le composant `WaveConfigCard`** — à la fin du fichier, avant `SwimmerChip` :

```tsx
function WaveConfigCard({
  wave,
  state,
  dispatch,
}: {
  wave: number;
  state: ChronoState;
  dispatch: React.Dispatch<ChronoAction>;
}) {
  const c = WAVE_COLORS[wave - 1];
  const waveState = state.waves.find((ws) => ws.wave === wave);
  if (!waveState) return null;

  const totalSec = waveState.departureIntervalSec;
  const minutes = Math.floor(totalSec / 60);
  const seconds = totalSec % 60;
  const isCustom = waveState.overrides !== null;

  const updateInterval = (min: number, sec: number) => {
    dispatch({ type: "SET_WAVE_INTERVAL", wave, seconds: min * 60 + sec });
  };

  const activatePersonalize = () => {
    dispatch({
      type: "SET_WAVE_OVERRIDES",
      wave,
      overrides: {
        seriesCount: state.seriesCount,
        totalDistanceM: state.totalDistanceM,
        splitDistanceM: state.splitDistanceM,
      },
    });
  };

  const resetPersonalize = () => {
    dispatch({ type: "SET_WAVE_OVERRIDES", wave, overrides: null });
  };

  return (
    <div
      className={`rounded-lg border p-3 transition-colors ${
        isCustom ? `${c.border} bg-card` : "border-border bg-card/50"
      }`}
    >
      {/* Header row : chip + status + action */}
      <div className="flex items-center gap-2">
        <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold text-white ${c.dot}`}>
          {c.label}
        </span>
        {isCustom ? (
          <>
            <span className={`inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-semibold ${c.bg} ${c.border} ${c.text}`}>
              <Check className="h-2.5 w-2.5" />
              Personnalisée
            </span>
            <button
              type="button"
              onClick={resetPersonalize}
              className="ml-auto text-[11px] text-muted-foreground hover:text-destructive hover:underline transition-colors"
            >
              Réinitialiser
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={activatePersonalize}
            className="ml-auto inline-flex items-center gap-1 text-[11px] font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            <Pencil className="h-3 w-3" />
            Personnaliser
          </button>
        )}
      </div>

      {/* Interval row — always visible */}
      <div className="mt-2 flex items-center gap-1.5">
        <span className="text-xs text-muted-foreground">Départ toutes les</span>
        <input
          type="text"
          inputMode="numeric"
          value={minutes || ""}
          placeholder="0"
          onChange={(e) => updateInterval(Number(e.target.value.replace(/\D/g, "")) || 0, seconds)}
          className="w-8 text-center font-mono text-sm font-bold bg-transparent border-b border-border outline-none focus:border-primary"
        />
        <span className="text-xs text-muted-foreground">min</span>
        <input
          type="text"
          inputMode="numeric"
          value={seconds || ""}
          placeholder="0"
          onChange={(e) => {
            const val = Number(e.target.value.replace(/\D/g, "")) || 0;
            updateInterval(minutes, Math.min(59, val));
          }}
          className="w-8 text-center font-mono text-sm font-bold bg-transparent border-b border-border outline-none focus:border-primary"
        />
        <span className="text-xs text-muted-foreground">sec</span>
      </div>

      {/* Override row — visible only when personalized */}
      {isCustom && waveState.overrides && (
        <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-border/50 pt-2">
          <WaveOverrideField
            wave={wave}
            field="seriesCount"
            value={waveState.overrides.seriesCount ?? state.seriesCount}
            placeholder="∞"
            width="w-10"
            suffix="×"
            dispatch={dispatch}
          />
          <WaveOverrideField
            wave={wave}
            field="totalDistanceM"
            value={waveState.overrides.totalDistanceM ?? state.totalDistanceM}
            placeholder="—"
            width="w-16"
            suffix="m"
            dispatch={dispatch}
          />
          <span className="text-xs text-muted-foreground">splits à</span>
          <WaveOverrideField
            wave={wave}
            field="splitDistanceM"
            value={waveState.overrides.splitDistanceM ?? state.splitDistanceM}
            placeholder="50"
            width="w-14"
            suffix="m"
            dispatch={dispatch}
          />
        </div>
      )}
    </div>
  );
}

function WaveOverrideField({
  wave,
  field,
  value,
  placeholder,
  width,
  suffix,
  dispatch,
}: {
  wave: number;
  field: "seriesCount" | "totalDistanceM" | "splitDistanceM";
  value: number;
  placeholder: string;
  width: string;
  suffix: string;
  dispatch: React.Dispatch<ChronoAction>;
}) {
  return (
    <div className="inline-flex items-center gap-1">
      <input
        type="text"
        inputMode="numeric"
        value={value || ""}
        placeholder={placeholder}
        onChange={(e) =>
          dispatch({
            type: "SET_WAVE_OVERRIDE_FIELD",
            wave,
            field,
            value: Number(e.target.value.replace(/\D/g, "")) || 0,
          })
        }
        className={`${width} text-center font-mono text-sm font-bold bg-transparent border-b border-border outline-none focus:border-primary`}
      />
      <span className="text-xs text-muted-foreground">{suffix}</span>
    </div>
  );
}
```

**Step 3: Mettre à jour les imports en haut du fichier**

Ajouter `Pencil` et `Check` aux imports `lucide-react` si pas déjà présents (ils le sont — vérifier ligne 2).

**Step 4: Type check**

```bash
npx tsc --noEmit
```

Expected: PASS.

**Step 5: Smoke test visuel**

```bash
npm run dev
```

Ouvrir `http://localhost:8080/#/coach/chrono`, ajouter 2 nageurs en V1 et V2, vérifier :
- 2 cartes affichées (une par vague)
- Bouton "Personnaliser" sur V1 → clic → carte s'étend avec pré-remplissage de la globale
- Badge "✓ Personnalisée" + lien "Réinitialiser"
- Inputs des 3 champs fonctionnent (min 0, clamp)
- Indicateur "1 personnalisée" en haut à droite

**Step 6: Commit**

```bash
git add src/components/chrono/ChronoSetup.tsx
git commit -m "feat(chrono): per-wave config cards with Personnaliser toggle in setup"
```

---

## Task 9 : ChronoRace — résoudre la config par vague dans `LaneRow`

**Files:**
- Modify: `src/components/chrono/ChronoRace.tsx:527-618` (`LaneWaveMatrix` + `LaneRow`)
- Modify: `src/components/chrono/ChronoRace.tsx:205-474` (`SwimmerCard` props)

**Contexte** : aujourd'hui `SwimmerCard` reçoit `splitDistanceM` et `totalDistanceM` globaux. Il faut les passer **résolus par vague**.

**Step 1: Importer `resolveWaveConfig` en haut**

```ts
import { WAVE_COLORS, resolveWaveConfig } from "../../lib/chrono-types";
```

**Step 2: Dans `LaneRow`, résoudre une fois par vague**

Dans la boucle `activeWaves.map((w) => ...`, juste avant `if (cellSwimmers.length === 0)` :

```tsx
{activeWaves.map((w) => {
  const cellSwimmers = swimmers.filter(
    (s) => s.lane === lane && s.wave === w,
  );
  const resolved = resolveWaveConfig(
    { seriesCount: 0, totalDistanceM: 0, splitDistanceM: 0, waves } as any,
    w,
  );
  // ...
```

Mais **problème** : `LaneRow` ne reçoit pas `seriesCount/totalDistanceM/splitDistanceM` globaux directement. Il faut les propager depuis `LaneWaveMatrix` qui les reçoit déjà.

Solution : ajouter un paramètre `globalConfig` à `LaneRow`. Modifier la signature :

```tsx
function LaneRow({
  lane,
  isAlt,
  activeWaves,
  swimmers,
  waves,
  raceData,
  globalConfig,     // ← NEW { seriesCount, totalDistanceM, splitDistanceM }
  now,
  dispatch,
  getTimestamp,
}: {
  // ...
  globalConfig: { seriesCount: number; totalDistanceM: number; splitDistanceM: number };
  // ...
})
```

Supprimer les anciens params `splitDistanceM` et `totalDistanceM` de `LaneRow` (ils sont dans `globalConfig`).

**Step 3: Dans `LaneWaveMatrix`, construire `globalConfig` et l'passer**

Dans `LaneWaveMatrix`, juste avant `return` :

```tsx
const globalConfig = { seriesCount, totalDistanceM, splitDistanceM };
```

Dans la JSX `<LaneRow>`, remplacer les 2 props par `globalConfig={globalConfig}`.

**Step 4: Dans `LaneRow`, utiliser `resolveWaveConfig` par vague**

```tsx
{activeWaves.map((w) => {
  const cellSwimmers = swimmers.filter(
    (s) => s.lane === lane && s.wave === w,
  );
  const resolved = resolveWaveConfig(
    { ...globalConfig, waves },
    w,
  );
  if (cellSwimmers.length === 0) {
    return (/* ... unchanged */);
  }
  return (
    <div key={`${lane}-${w}`} className="...">
      {cellSwimmers.map((s) => {
        const waveState = waves.find((wv) => wv.wave === s.wave);
        const race = raceData.get(s.key);
        return (
          <SwimmerCard
            key={s.key}
            swimmerKey={s.key}
            displayName={s.displayName}
            wave={s.wave}
            waveStartedAt={waveState?.startedAt ?? null}
            currentSplits={race ? race.splitsByRep[race.splitsByRep.length - 1] : []}
            swimmerStoppedAt={race?.stoppedAt ?? null}
            splitDistanceM={resolved.splitDistanceM}      // ← RESOLVED
            totalDistanceM={resolved.totalDistanceM}      // ← RESOLVED
            now={now}
            dispatch={dispatch}
            getTimestamp={getTimestamp}
          />
        );
      })}
    </div>
  );
})}
```

**Step 5: Type check**

```bash
npx tsc --noEmit
```

Expected: PASS.

**Step 6: Smoke test**

Setup avec V1 globale (3×200m splits 50m) et V2 personnalisée (6×100m splits 25m). Lancer la course. Vérifier que la progress bar V2 montre 1/4, 2/4, 3/4, 4/4 (4 splits de 25m pour 100m) et non 1/4 basé sur la globale.

**Step 7: Commit**

```bash
git add src/components/chrono/ChronoRace.tsx
git commit -m "feat(chrono): LaneRow resolves per-wave config for SwimmerCard"
```

---

## Task 10 : ChronoRace — `WaveHeaderCell` utilise le `seriesCount` résolu + affiche la config mini

**Files:**
- Modify: `src/components/chrono/ChronoRace.tsx:38-201` (`WaveHeaderCell`)
- Modify: `src/components/chrono/ChronoRace.tsx:527-617` (`LaneWaveMatrix` — passage du param)

**Step 1: Signature `WaveHeaderCell`**

Remplacer `seriesCount: number` par :

```ts
resolvedConfig: { seriesCount: number; totalDistanceM: number; splitDistanceM: number };
```

Puis dans le corps, remplacer chaque `seriesCount` par `resolvedConfig.seriesCount`.

**Step 2: Afficher la config mini sous le bouton GO**

Dans `WaveHeaderCell`, pour chacun des trois cases (non lancée, between reps, active), juste sous le label `{c.label}` (ou juste avant/après le bouton), ajouter un sous-texte :

Sur le bouton GO (case 1 et case 2) — **remplacer** la ligne :
```tsx
<span className="text-[11px] font-bold uppercase tracking-widest text-white/90 leading-none mb-1">
  {wc.label}{wave.currentRep > 0 ? ` S${wave.currentRep + 1}${resolvedConfig.seriesCount > 0 ? `/${resolvedConfig.seriesCount}` : ""}` : ""}
</span>
```

Par (ajoute le sous-texte juste après) :
```tsx
<span className="text-[11px] font-bold uppercase tracking-widest text-white/90 leading-none mb-0.5">
  {wc.label}{wave.currentRep > 0 ? ` S${wave.currentRep + 1}${resolvedConfig.seriesCount > 0 ? `/${resolvedConfig.seriesCount}` : ""}` : ""}
</span>
{(resolvedConfig.totalDistanceM > 0 || resolvedConfig.seriesCount > 0) && (
  <span className="text-[9px] font-medium text-white/70 leading-none mb-1 tabular-nums">
    {resolvedConfig.seriesCount > 0 ? `${resolvedConfig.seriesCount}×` : ""}
    {resolvedConfig.totalDistanceM > 0 ? `${resolvedConfig.totalDistanceM}m` : ""}
    {resolvedConfig.splitDistanceM > 0 ? ` · splits ${resolvedConfig.splitDistanceM}m` : ""}
  </span>
)}
```

Pour la case 3 (actively racing), la configuration résolue peut être affichée à côté du chrono en petit :
```tsx
<span className="font-mono tabular-nums font-bold tracking-tight ml-auto text-base text-foreground">
  {formatTime(elapsed)}
</span>
```

Remplacer ce bloc par :
```tsx
<div className="flex flex-col items-end gap-0 ml-auto">
  <span className={`font-mono tabular-nums font-bold tracking-tight ${intervalMs > 0 ? "text-sm text-muted-foreground" : "text-base text-foreground"}`}>
    {formatTime(elapsed)}
  </span>
  {resolvedConfig.totalDistanceM > 0 && (
    <span className="text-[9px] font-medium text-muted-foreground/70 leading-none tabular-nums">
      {resolvedConfig.totalDistanceM}m
      {resolvedConfig.splitDistanceM > 0 ? ` · ${resolvedConfig.splitDistanceM}m` : ""}
    </span>
  )}
</div>
```

**Step 3: Dans `LaneWaveMatrix`, passer `resolvedConfig` à chaque `WaveHeaderCell`**

Remplacer le prop `seriesCount={seriesCount}` par :
```tsx
resolvedConfig={resolveWaveConfig(
  { seriesCount, totalDistanceM, splitDistanceM, waves },
  w,
)}
```

**Step 4: Type check**

```bash
npx tsc --noEmit
```

**Step 5: Smoke test**

Vérifier que sous le chip V1 en mode GO, on voit `3×200m · splits 50m`, et pour V2 personnalisée `6×100m · splits 25m`.

**Step 6: Commit**

```bash
git add src/components/chrono/ChronoRace.tsx
git commit -m "feat(chrono): WaveHeaderCell shows resolved per-wave config inline"
```

---

## Task 11 : ChronoResults — `buildChronoRecordInput` utilise `resolveWaveConfig`

**Files:**
- Modify: `src/components/chrono/ChronoResults.tsx:71-99` (`buildChronoRecordInput`)

**Step 1: Importer le helper**

```ts
import { WAVE_COLORS, resolveWaveConfig } from "../../lib/chrono-types";
```

**Step 2: Refondre `buildChronoRecordInput`**

```ts
function buildChronoRecordInput(state: ChronoState, status: "draft" | "sent"): ChronoRecordInput {
  const raceEntries = Array.from(state.raceData.values());

  // Collect per-wave overrides for the config payload (only non-null ones).
  const waveOverrides: Record<number, { seriesCount?: number; totalDistanceM?: number; splitDistanceM?: number }> = {};
  for (const w of state.waves) {
    if (w.overrides) waveOverrides[w.wave] = { ...w.overrides };
  }
  const hasOverrides = Object.keys(waveOverrides).length > 0;

  return {
    status,
    label: buildLabel(state),
    config: {
      totalDistanceM: state.totalDistanceM,
      splitDistanceM: state.splitDistanceM,
      seriesCount: state.seriesCount,
      laneCount: state.laneCount,
      ...(hasOverrides ? { waveOverrides } : {}),
    },
    swimmers: raceEntries.map((rs) => {
      const resolved = resolveWaveConfig(state, rs.swimmer.wave);
      return {
        kind: rs.swimmer.kind,
        athleteId: rs.swimmer.athleteId,
        manualId: rs.swimmer.manualId,
        displayName: rs.swimmer.displayName,
        lane: rs.swimmer.lane,
        wave: rs.swimmer.wave,
        splitsByRep: rs.splitsByRep.map((rep) =>
          rep.map((s, i) => ({
            distanceM: resolved.splitDistanceM > 0 ? (i + 1) * resolved.splitDistanceM : 0,
            cumulativeMs: s.cumulativeMs,
            lapMs: s.lapMs,
          })),
        ),
      };
    }),
  };
}
```

**Step 3: Type check**

```bash
npx tsc --noEmit
```

**Step 4: Commit**

```bash
git add src/components/chrono/ChronoResults.tsx
git commit -m "feat(chrono): buildChronoRecordInput uses resolveWaveConfig per swimmer"
```

---

## Task 12 : ChronoResults — afficher sous-titre "Personnalisée : …" par carte

**Files:**
- Modify: `src/components/chrono/ChronoResults.tsx:320-352` (swimmer header section)

**Step 1: Résoudre la config dans le map par nageur**

Dans la boucle `byLane.get(lane)!.map((raceState) => {` :

```tsx
{byLane.get(lane)!.map((raceState) => {
  const { swimmer, splitsByRep } = raceState;
  const wc = WAVE_COLORS[(swimmer.wave - 1) % WAVE_COLORS.length];
  const status = exportStatuses.get(swimmer.key);
  const total = totalSplitCount(splitsByRep);
  const bestSeriesIdx = findBestSeriesIdx(splitsByRep);
  const completedSeries = splitsByRep.filter((s) => s.length > 0);
  const cardKey = swimmer.key;
  const isExpanded = expandedCards.has(cardKey);
  const waveState = state.waves.find((w) => w.wave === swimmer.wave);
  const isCustomWave = waveState?.overrides != null;
  const resolved = resolveWaveConfig(state, swimmer.wave);
  // ...
```

**Step 2: Afficher le sous-titre dans le header de carte**

Juste après le `<div className="flex items-center justify-between px-4 pt-3 pb-2">` et son fermeture, ajouter un second div (AVANT le `{total === 0 ? ...}` ou les résultats) :

```tsx
{isCustomWave && (
  <div className="px-4 -mt-1 pb-1.5">
    <span className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium ${wc.bg} ${wc.text}`}>
      <Check className="h-2.5 w-2.5" />
      Personnalisée : {resolved.seriesCount > 0 ? `${resolved.seriesCount}×` : ""}{resolved.totalDistanceM > 0 ? `${resolved.totalDistanceM}m` : ""}{resolved.splitDistanceM > 0 ? ` splits ${resolved.splitDistanceM}m` : ""}
    </span>
  </div>
)}
```

**Step 3: Importer `Check` si nécessaire**

Vérifier que `Check` est bien importé de `lucide-react` en haut du fichier (il l'est déjà).

**Step 4: Type check + smoke test**

```bash
npx tsc --noEmit
npm run dev
```

Flow : setup avec V2 personnalisée, lancer course, terminer, vérifier carte résultat V2 affiche le badge "Personnalisée : 6×100m splits 25m".

**Step 5: Commit**

```bash
git add src/components/chrono/ChronoResults.tsx
git commit -m "feat(chrono): show Personnalisée badge on per-wave results cards"
```

---

## Task 13 : XLSX — sous-titre mentionne les overrides

**Files:**
- Modify: `src/lib/chronoXlsxExport.ts:130-149` (`buildSubtitle`)

**Contexte** : `buildSubtitle` construit aujourd'hui la ligne "Date · 3×200m · Splits 50m · 3 lignes". On ajoute en fin de ligne la liste des vagues personnalisées. Pas de refonte du layout tabulaire — **hors scope** (documenté dans design doc).

**Step 1: Modifier `buildSubtitle`**

```ts
function buildSubtitle(record: ChronoRecordInputLike): string {
  const dateFr = new Date(record.created_at).toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  const parts: string[] = [dateFr];
  const cfg = record.config;
  if (cfg.seriesCount > 0 && cfg.totalDistanceM > 0) {
    parts.push(`${cfg.seriesCount} × ${cfg.totalDistanceM} m`);
  } else if (cfg.totalDistanceM > 0) {
    parts.push(`${cfg.totalDistanceM} m`);
  } else if (cfg.seriesCount > 0) {
    parts.push(`${cfg.seriesCount} séries`);
  }
  if (cfg.splitDistanceM > 0) parts.push(`Splits ${cfg.splitDistanceM} m`);
  parts.push(`${cfg.laneCount} ligne${cfg.laneCount > 1 ? "s" : ""}`);
  if (cfg.waveOverrides && Object.keys(cfg.waveOverrides).length > 0) {
    const customWaves = Object.keys(cfg.waveOverrides).map((w) => `V${w}`).join(", ");
    parts.push(`${customWaves} personnalisée${Object.keys(cfg.waveOverrides).length > 1 ? "s" : ""}`);
  }
  return parts.join(" · ");
}
```

**Step 2: Tests XLSX existants passent**

```bash
npm test -- --run src/lib/__tests__/chronoXlsxExport.test.ts
```

Expected: PASS (le champ `waveOverrides` est absent des fixtures existantes → branche skippée).

**Step 3: Smoke test**

Depuis la page résultats avec V2 personnalisée, cliquer "Exporter xlsx". Ouvrir le fichier. Le sous-titre doit contenir « … · V2 personnalisée ».

**Step 4: Commit**

```bash
git add src/lib/chronoXlsxExport.ts
git commit -m "feat(chrono): XLSX subtitle lists customized waves"
```

---

## Task 14 : Type check final + suite de tests complète

**Step 1: Full type check**

```bash
npx tsc --noEmit
```

Expected: PASS.

**Step 2: Full test suite**

```bash
npm test -- --run
```

Expected: PASS (hors `TimesheetHelpers.test.ts` qui est pré-existant cassé — voir MEMORY.md).

**Step 3: Vérification manuelle end-to-end**

Scénario complet :

1. Ouvrir `/#/coach/chrono` → setup vide.
2. Ajouter 2 nageurs : un en V1 L1, un en V2 L2.
3. Vérifier les 2 cartes vague s'affichent.
4. Cliquer "Personnaliser" sur V2 → inputs pré-remplis avec la globale.
5. Modifier V2 : `6 × 100m splits 25m`.
6. Vérifier que le sous-titre global indique "1 personnalisée".
7. Lancer la course (bouton Lancer).
8. En phase Race : observer que sous le bouton GO de V1 on lit `3×200m · splits 50m` et sous V2 `6×100m · splits 25m`.
9. Cliquer GO pour V1 et V2. Taper des splits sur chaque nageur.
10. La progress bar de chaque nageur respecte la config de sa vague (4 splits pour V1 = 200m/50m, 4 splits pour V2 = 100m/25m).
11. Cliquer Terminer.
12. En Results : la carte V2 montre le badge "Personnalisée : 6×100m splits 25m".
13. Cliquer "Exporter xlsx". Ouvrir le fichier. Sous-titre contient "V2 personnalisée".
14. Cliquer "Brouillon" → rechargez la page → "Reprendre" → la config per-vague est restaurée depuis localStorage.

**Step 4: Si tout passe, rien à committer ici** (les commits précédents couvrent le code). Si un bug est trouvé, ouvrir un commit fix spécifique.

---

## Task 15 : Documentation (CLAUDE.md + ROADMAP + implementation-log)

**Files:**
- Modify: `docs/implementation-log.md`
- Modify: `docs/ROADMAP.md`
- Modify: `CLAUDE.md`
- Modify: `docs/FEATURES_STATUS.md` (si une feature chrono y est listée — sinon skip)

**Step 1: Ajouter §127 dans `implementation-log.md`**

Créer une nouvelle entrée en haut du fichier (sous l'en-tête, au-dessus de §126) :

```markdown
## §127 — Chrono : exercices par vague (nombre de séries/distances/splits)

### Contexte
Le coach pouvait configurer `seriesCount`, `totalDistanceM`, `splitDistanceM` uniquement en global. Besoin métier : faire tourner plusieurs vagues en parallèle avec des exercices différents (ex. V1 4×200m splits 50m, V2 6×100m splits 25m).

### Changements
- Nouveau type `WaveConfigOverrides` + champ `WaveState.overrides: WaveConfigOverrides | null`.
- Helper pur `resolveWaveConfig(state, wave)` — source unique de vérité pour résoudre la config d'une vague (override ?? global).
- 2 nouvelles actions reducer : `SET_WAVE_OVERRIDES` (activation/reset complet), `SET_WAVE_OVERRIDE_FIELD` (édition unitaire d'un champ).
- UI Setup : chaque vague devient une carte compacte avec toggle "Personnaliser" → déploie les 3 champs override pré-remplis depuis la globale. Badge "✓ Personnalisée" + lien "Réinitialiser".
- UI Race : `LaneRow` résout la config une fois par vague et la passe à `SwimmerCard` ; `WaveHeaderCell` affiche la config résolue sous chaque bouton GO.
- UI Results : badge "Personnalisée : …" sur les cartes des nageurs dont la vague est customisée.
- XLSX : `buildSubtitle` liste les vagues personnalisées (ex. "V2 personnalisée"). Layout tabulaire inchangé (hors scope).
- Payload DB : `ChronoRecordConfig.waveOverrides?: Record<number, …>` — champ optionnel dans la colonne `jsonb` existante, aucune migration.

### Fichiers modifiés
- `src/lib/chrono-types.ts` — +WaveConfigOverrides, +resolveWaveConfig, WaveState.overrides
- `src/lib/chrono-reducer.ts` — +2 actions, init overrides:null dans computeWaves
- `src/lib/api/types.ts` — +waveOverrides optionnel
- `src/components/chrono/ChronoSetup.tsx` — cartes vague + composants WaveConfigCard/WaveOverrideField
- `src/components/chrono/ChronoRace.tsx` — résolution per-wave + affichage config sous GO
- `src/components/chrono/ChronoResults.tsx` — badge Personnalisée + resolveWaveConfig dans buildChronoRecordInput
- `src/lib/chronoXlsxExport.ts` — subtitle liste vagues custom
- `src/lib/__tests__/chrono-types.test.ts` — 4 tests resolveWaveConfig (nouveau fichier)
- `src/lib/__tests__/chrono-reducer.test.ts` — +cas SET_WAVE_OVERRIDES, SET_WAVE_OVERRIDE_FIELD, persistence

### Tests
- Unitaires Vitest : +9 cas (4 resolveWaveConfig + 3 SET_WAVE_OVERRIDES + 3 SET_WAVE_OVERRIDE_FIELD + 2 persistence).
- Tests RLS : non applicables (pas de changement policy/schéma).
- Vérification manuelle end-to-end passée.

### Décisions
- Modèle **sous-objet `overrides`** (vs champs à plat) : flag `overrides !== null` direct pour le badge UI + groupement logique.
- Mode **global par défaut + override explicite** (vs config par vague systématique) : zéro friction sur le cas simple, rétrocompat totale des anciens backups.
- `RESET_FOR_NEW_SERIES` **préserve** les overrides : le coach relance typiquement la même structure d'exo par vague.
- Layout tabulaire XLSX inchangé : rendu "ligne par ligne" contraindrait les colonnes, complexité >> valeur. Les overrides sont signalés en sous-titre.

### Limites
- L'XLSX ne fait pas de colonnes distinctes par vague (tous les splits sont interprétés avec le label global). Acceptable car le payload stocke `distanceM` par split (disponible si besoin ultérieur).
- Une seule direction d'override (vague écrase global). Pas de config par nageur individuel — non demandé.
```

**Step 2: Ajouter la ligne dans `ROADMAP.md`**

Dans le tableau "Chantiers futurs", ajouter en bas :

```markdown
| 91 | Chrono : exercices différents par vague (series/distance/splits par vague) | Moyenne | Fait (§127) |
```

Mettre à jour la ligne `*Dernière mise à jour*` en tête du fichier : `*Dernière mise à jour : 2026-04-18 — §127 Chrono per-wave config*`.

**Step 3: Ajouter la ligne dans le tableau "Chantiers futurs" de `CLAUDE.md`**

Même ligne que ROADMAP :

```markdown
| 91 | Chrono : exercices différents par vague (series/distance/splits par vague) | Moyenne | Fait (§127) |
```

**Step 4: Mesurer les tailles des fichiers modifiés**

```bash
wc -l src/lib/chrono-types.ts src/lib/chrono-reducer.ts src/components/chrono/ChronoSetup.tsx src/components/chrono/ChronoRace.tsx src/components/chrono/ChronoResults.tsx src/lib/chronoXlsxExport.ts
```

Mettre à jour les colonnes "Taille" dans la table "Fichiers clés" de `CLAUDE.md` pour les fichiers dont la taille varie de > 30 % depuis la dernière entrée.

**Step 5: Commit final docs**

```bash
git add docs/implementation-log.md docs/ROADMAP.md CLAUDE.md docs/FEATURES_STATUS.md
git commit -m "docs(chrono): log §127 — per-wave config overrides"
```

---

## Résumé des commits attendus

1. `feat(chrono): add WaveConfigOverrides type + overrides field on WaveState`
2. `feat(chrono): add resolveWaveConfig helper (overrides ?? global)`
3. `feat(chrono): SET_WAVE_OVERRIDES action`
4. `feat(chrono): SET_WAVE_OVERRIDE_FIELD action`
5. `test(chrono): verify overrides survive computeWaves + RESET_FOR_NEW_SERIES`
6. `feat(chrono): extend ChronoRecordConfig with optional waveOverrides`
7. `feat(chrono): per-wave config cards with Personnaliser toggle in setup`
8. `feat(chrono): LaneRow resolves per-wave config for SwimmerCard`
9. `feat(chrono): WaveHeaderCell shows resolved per-wave config inline`
10. `feat(chrono): buildChronoRecordInput uses resolveWaveConfig per swimmer`
11. `feat(chrono): show Personnalisée badge on per-wave results cards`
12. `feat(chrono): XLSX subtitle lists customized waves`
13. `docs(chrono): log §127 — per-wave config overrides`

**Note `/frontend-design` :** ce plan produit du code directement. Pour un sprint de polish visuel (animations sur l'expand/collapse, couleur override plus marquée, etc.), le coach peut lancer `/frontend-design` sur le résultat en lui pointant `ChronoSetup.tsx:WaveConfigCard` et `ChronoRace.tsx:WaveHeaderCell`. Les hooks d'animation Radix/Tailwind sont déjà en place ailleurs dans le projet.
