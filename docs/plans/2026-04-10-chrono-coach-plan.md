# Chrono Coach — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Page "Chrono" tablette/desktop pour chronométrer les splits de nageurs par ligne/vague au bord du bassin, puis exporter les résultats vers chaque profil nageur.

**Architecture:** 3 phases (Préparation → En course → Résultats) dans un seul composant orchestrateur `CoachChronoScreen`. State local via `useReducer` pour gérer la machine à états. Chrono basé sur `performance.now()` pour la précision. Export via `createStandaloneSwimLog()` existant.

**Tech Stack:** React 19, TypeScript, Tailwind CSS 4, Shadcn (Sheet, Input, Button), Lucide icons, wouter hash routing, localStorage backup.

**Design doc:** `docs/plans/2026-04-10-chrono-coach-design.md`

---

### Task 1: Types & state machine du chrono

**Files:**
- Create: `src/lib/chrono-types.ts`
- Create: `src/lib/chrono-reducer.ts`

**Step 1: Créer les types**

```ts
// src/lib/chrono-types.ts

export interface ChronoSwimmer {
  athleteId: number;
  displayName: string;
  avatarUrl: string | null;
  wave: number; // 1-based
  lane: number; // 1-based
}

export interface SplitRecord {
  /** Cumulative time in ms since wave GO */
  cumulativeMs: number;
  /** Lap time in ms (diff from previous split) */
  lapMs: number;
}

export interface SwimmerRaceState {
  swimmer: ChronoSwimmer;
  splits: SplitRecord[];
}

export interface WaveState {
  wave: number;
  startedAt: number | null; // performance.now() timestamp
  /** True after Terminer is pressed */
  stopped: boolean;
}

export type ChronoPhase = "setup" | "racing" | "results";

export interface ChronoState {
  phase: ChronoPhase;
  laneCount: number;
  swimmers: ChronoSwimmer[];
  waves: WaveState[];
  raceData: Map<number, SwimmerRaceState>; // keyed by athleteId
  /** Timestamp when Terminer was pressed */
  stoppedAt: number | null;
}

export const WAVE_COLORS = [
  { bg: "bg-cyan-500/20", border: "border-cyan-500", text: "text-cyan-400", dot: "bg-cyan-400", label: "V1" },
  { bg: "bg-orange-500/20", border: "border-orange-500", text: "text-orange-400", dot: "bg-orange-400", label: "V2" },
  { bg: "bg-green-500/20", border: "border-green-500", text: "text-green-400", dot: "bg-green-400", label: "V3" },
  { bg: "bg-pink-500/20", border: "border-pink-500", text: "text-pink-400", dot: "bg-pink-400", label: "V4" },
  { bg: "bg-yellow-500/20", border: "border-yellow-500", text: "text-yellow-400", dot: "bg-yellow-400", label: "V5" },
  { bg: "bg-purple-500/20", border: "border-purple-500", text: "text-purple-400", dot: "bg-purple-400", label: "V6" },
] as const;
```

**Step 2: Créer le reducer**

```ts
// src/lib/chrono-reducer.ts
import type { ChronoState, ChronoSwimmer, SwimmerRaceState, SplitRecord, WaveState } from "./chrono-types";

export type ChronoAction =
  | { type: "SET_LANE_COUNT"; count: number }
  | { type: "ADD_SWIMMER"; swimmer: ChronoSwimmer }
  | { type: "REMOVE_SWIMMER"; athleteId: number }
  | { type: "MOVE_SWIMMER"; athleteId: number; toLane: number }
  | { type: "SET_WAVE"; athleteId: number; wave: number }
  | { type: "START_RACE" }
  | { type: "LAUNCH_WAVE"; wave: number; timestamp: number }
  | { type: "RECORD_SPLIT"; athleteId: number; timestamp: number }
  | { type: "UNDO_SPLIT"; athleteId: number }
  | { type: "STOP_RACE"; timestamp: number }
  | { type: "RESET_FOR_NEW_SERIES" }
  | { type: "RESTORE_STATE"; state: ChronoState };

export const initialChronoState: ChronoState = {
  phase: "setup",
  laneCount: 3,
  swimmers: [],
  waves: [],
  raceData: new Map(),
  stoppedAt: null,
};

export function chronoReducer(state: ChronoState, action: ChronoAction): ChronoState {
  switch (action.type) {
    case "SET_LANE_COUNT":
      return { ...state, laneCount: Math.max(1, Math.min(8, action.count)) };

    case "ADD_SWIMMER": {
      if (state.swimmers.some((s) => s.athleteId === action.swimmer.athleteId)) return state;
      const swimmers = [...state.swimmers, action.swimmer];
      return { ...state, swimmers, waves: computeWaves(swimmers, state.waves) };
    }

    case "REMOVE_SWIMMER": {
      const swimmers = state.swimmers.filter((s) => s.athleteId !== action.athleteId);
      return { ...state, swimmers, waves: computeWaves(swimmers, state.waves) };
    }

    case "MOVE_SWIMMER": {
      const swimmers = state.swimmers.map((s) =>
        s.athleteId === action.athleteId ? { ...s, lane: action.toLane } : s,
      );
      return { ...state, swimmers };
    }

    case "SET_WAVE": {
      const swimmers = state.swimmers.map((s) =>
        s.athleteId === action.athleteId ? { ...s, wave: action.wave } : s,
      );
      return { ...state, swimmers, waves: computeWaves(swimmers, state.waves) };
    }

    case "START_RACE": {
      const raceData = new Map<number, SwimmerRaceState>();
      for (const s of state.swimmers) {
        raceData.set(s.athleteId, { swimmer: s, splits: [] });
      }
      return { ...state, phase: "racing", raceData, stoppedAt: null };
    }

    case "LAUNCH_WAVE": {
      const waves = state.waves.map((w) =>
        w.wave === action.wave ? { ...w, startedAt: action.timestamp } : w,
      );
      return { ...state, waves };
    }

    case "RECORD_SPLIT": {
      const rd = state.raceData.get(action.athleteId);
      if (!rd) return state;
      const swimmer = rd.swimmer;
      const waveState = state.waves.find((w) => w.wave === swimmer.wave);
      if (!waveState?.startedAt) return state;
      const cumulativeMs = action.timestamp - waveState.startedAt;
      const prevCumulative = rd.splits.length > 0 ? rd.splits[rd.splits.length - 1].cumulativeMs : 0;
      const lapMs = cumulativeMs - prevCumulative;
      const newSplits = [...rd.splits, { cumulativeMs, lapMs }];
      const newRaceData = new Map(state.raceData);
      newRaceData.set(action.athleteId, { ...rd, splits: newSplits });
      return { ...state, raceData: newRaceData };
    }

    case "UNDO_SPLIT": {
      const rd = state.raceData.get(action.athleteId);
      if (!rd || rd.splits.length === 0) return state;
      const newRaceData = new Map(state.raceData);
      newRaceData.set(action.athleteId, { ...rd, splits: rd.splits.slice(0, -1) });
      return { ...state, raceData: newRaceData };
    }

    case "STOP_RACE": {
      const waves = state.waves.map((w) => ({ ...w, stopped: true }));
      return { ...state, phase: "results", waves, stoppedAt: action.timestamp };
    }

    case "RESET_FOR_NEW_SERIES": {
      const waves = state.waves.map((w) => ({ ...w, startedAt: null, stopped: false }));
      return { ...state, phase: "setup", waves, raceData: new Map(), stoppedAt: null };
    }

    case "RESTORE_STATE":
      return action.state;

    default:
      return state;
  }
}

function computeWaves(swimmers: ChronoSwimmer[], existing: WaveState[]): WaveState[] {
  const usedWaves = new Set(swimmers.map((s) => s.wave));
  const result: WaveState[] = [];
  for (const w of usedWaves) {
    const ex = existing.find((e) => e.wave === w);
    result.push(ex ?? { wave: w, startedAt: null, stopped: false });
  }
  return result.sort((a, b) => a.wave - b.wave);
}
```

**Step 3: Vérifier la compilation**

Run: `npx tsc --noEmit`
Expected: PASS (0 errors liés à ces fichiers)

**Step 4: Commit**

```bash
git add src/lib/chrono-types.ts src/lib/chrono-reducer.ts
git commit -m "feat(chrono): add types and state reducer for coach split timer"
```

---

### Task 2: Hook useChronoTimer (chrono temps réel)

**Files:**
- Create: `src/hooks/useChronoTimer.ts`

**Step 1: Créer le hook**

Ce hook gère le rafraîchissement du chrono en temps réel via `requestAnimationFrame`. Il retourne un `now` mis à jour ~60fps que les composants utilisent pour calculer le temps écoulé.

```ts
// src/hooks/useChronoTimer.ts
import { useState, useEffect, useRef, useCallback } from "react";

/**
 * Returns a high-resolution timestamp that updates at ~60fps
 * while `running` is true. Uses performance.now() for precision.
 */
export function useChronoTimer(running: boolean) {
  const [now, setNow] = useState(() => performance.now());
  const rafRef = useRef<number>(0);

  useEffect(() => {
    if (!running) {
      cancelAnimationFrame(rafRef.current);
      return;
    }
    const tick = () => {
      setNow(performance.now());
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [running]);

  const getTimestamp = useCallback(() => performance.now(), []);

  return { now, getTimestamp };
}

/** Format ms to MM:SS.d (1 decimal) */
export function formatTime(ms: number): string {
  if (ms < 0) return "--:--.--";
  const totalSeconds = ms / 1000;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toFixed(1).padStart(4, "0")}`;
}

/** Format ms to SS.dd (2 decimals, no minutes) for lap times */
export function formatLap(ms: number): string {
  if (ms < 0) return "--.--";
  const seconds = ms / 1000;
  if (seconds >= 60) return formatTime(ms);
  return seconds.toFixed(1);
}
```

**Step 2: Vérifier la compilation**

Run: `npx tsc --noEmit`

**Step 3: Commit**

```bash
git add src/hooks/useChronoTimer.ts
git commit -m "feat(chrono): add useChronoTimer hook with formatTime helpers"
```

---

### Task 3: Composant ChronoSetup (phase Préparation)

**Files:**
- Create: `src/components/chrono/ChronoSetup.tsx`

**Step 1: Implémenter le composant Setup**

Affiche les lignes d'eau, les nageurs assignés, le picker pour ajouter des nageurs, et les contrôles de vague. Utilise le pattern SwimmerPicker existant de `CoachGroupsScreen.tsx`.

Props :
- `state: ChronoState`
- `dispatch: Dispatch<ChronoAction>`
- `athletes: AthleteSummary[]` (liste complète des nageurs de l'app)

Contenu :
- Contrôle nombre de lignes (+/-)
- Pour chaque ligne : row de cartes nageurs + bouton "+ Ajouter"
- Chaque carte : nom, chip vague coloré (cliquable pour cycler), bouton ✕ pour retirer
- Bouton "+ Ajouter" ouvre un Sheet avec SwimmerPicker (Input recherche + liste groupée + Checkbox)
- Bouton "Lancer" en haut (désactivé si 0 nageurs)

**Consulter :** `src/pages/coach/CoachGroupsScreen.tsx` lignes 79-152 pour le pattern SwimmerPicker, et `src/components/ui/sheet.tsx` pour le Sheet.

**Step 2: Utiliser /frontend-design pour le design**

Appeler `/frontend-design` pour obtenir le CSS/layout précis du composant Setup avec l'esthétique "Olympic Scoreboard" (fond sombre, monospace, couleurs vagues).

**Step 3: Vérifier la compilation**

Run: `npx tsc --noEmit`

**Step 4: Commit**

```bash
git add src/components/chrono/ChronoSetup.tsx
git commit -m "feat(chrono): add ChronoSetup component (lane config + swimmer picker)"
```

---

### Task 4: Composant ChronoRace (phase En course)

**Files:**
- Create: `src/components/chrono/ChronoRace.tsx`

**Step 1: Implémenter le composant Race**

C'est le composant critique — ergonomie poolside.

Props :
- `state: ChronoState`
- `dispatch: Dispatch<ChronoAction>`
- `now: number` (timestamp temps réel du hook useChronoTimer)
- `getTimestamp: () => number`

**Barre de vagues (haut)** :
- Une carte par vague triée par numéro
- Vague non lancée : gros bouton "▶ GO" avec pulse animation (couleur de la vague)
- Vague lancée : chrono live en monospace + "En course"
- Clic sur GO → `dispatch({ type: "LAUNCH_WAVE", wave, timestamp: getTimestamp() })`

**Zone lignes d'eau** :
- Chaque ligne = row horizontale avec label "Ligne N"
- Cartes nageurs en grille responsive dans chaque ligne
- Chaque carte = bouton split (toute la surface cliquable)
  - Bordure gauche + fond teinté couleur vague
  - Nom + chip vague
  - Chrono live : `formatTime(now - waveStartedAt)` en gros monospace
  - Dernier split : `Split N` + temps cumulé + `(lap)` en petit
  - Si vague pas lancée : carte grisée + "En attente", `pointer-events-none`
- `onClick` → `dispatch({ type: "RECORD_SPLIT", athleteId, timestamp: getTimestamp() })`
- Feedback : `active:scale-95` + flash bg via `animate-ping` one-shot
- `navigator.vibrate?.(50)` au tap

**Bouton Terminer** (haut droite) :
- `dispatch({ type: "STOP_RACE", timestamp: getTimestamp() })`
- Confirmé par un AlertDialog "Terminer la série ?"

**Annuler dernier split** :
- Double-tap rapide (< 300ms) sur une carte → `dispatch({ type: "UNDO_SPLIT", athleteId })` + toast

**Step 2: Utiliser /frontend-design pour le design**

Appeler `/frontend-design` pour les gros boutons tactiles, le layout des cartes dans les lignes, les animations de feedback.

**Step 3: Vérifier la compilation**

Run: `npx tsc --noEmit`

**Step 4: Commit**

```bash
git add src/components/chrono/ChronoRace.tsx
git commit -m "feat(chrono): add ChronoRace component (wave launch + split capture)"
```

---

### Task 5: Composant ChronoResults (phase Résultats & Export)

**Files:**
- Create: `src/components/chrono/ChronoResults.tsx`

**Step 1: Implémenter le composant Results**

Props :
- `state: ChronoState`
- `dispatch: Dispatch<ChronoAction>`
- `onExportComplete: () => void`

Contenu :
- Cartes résultats groupées par ligne
- Chaque carte nageur :
  - Nom + vague
  - Liste splits : `#N  cumulative  (lap)` — meilleur partiel surligné en vert
  - Temps total, nombre de splits
  - Statut export : ⏳ / ✓ / ✗
- Bouton **"Envoyer à tous"** :
  - Pour chaque nageur, appeler `createStandaloneSwimLog(userId, { exercise_label: "Chrono coach", split_times: [...], notes: "Série chrono — Ligne N" })`
  - Mapper `SplitRecord.cumulativeMs` → `SplitTimeEntry.time_seconds` (diviser par 1000)
  - Afficher le statut individuel en temps réel
- Bouton **"Nouvelle série"** :
  - `dispatch({ type: "RESET_FOR_NEW_SERIES" })`
  - Retour en phase setup avec nageurs conservés

**Consulter :** `src/lib/api/swim-logs.ts` pour `createStandaloneSwimLog()` et `SplitTimeEntry`.

**Step 2: Vérifier la compilation**

Run: `npx tsc --noEmit`

**Step 3: Commit**

```bash
git add src/components/chrono/ChronoResults.tsx
git commit -m "feat(chrono): add ChronoResults component (splits display + export)"
```

---

### Task 6: Orchestrateur CoachChronoScreen + routing

**Files:**
- Create: `src/pages/coach/CoachChronoScreen.tsx`
- Modify: `src/pages/Coach.tsx` — ajouter section "chrono"
- Modify: `src/components/layout/navItems.ts` — ajouter nav item (optionnel, ou accessible via home)
- Modify: `src/components/layout/AppLayout.tsx` — ajouter label section dans `COACH_SECTION_LABELS`

**Step 1: Créer l'orchestrateur**

```tsx
// src/pages/coach/CoachChronoScreen.tsx
import { useReducer, useMemo } from "react";
import { chronoReducer, initialChronoState } from "../../lib/chrono-reducer";
import { useChronoTimer } from "../../hooks/useChronoTimer";
import { ChronoSetup } from "../../components/chrono/ChronoSetup";
import { ChronoRace } from "../../components/chrono/ChronoRace";
import { ChronoResults } from "../../components/chrono/ChronoResults";
import type { AthleteSummary } from "../../lib/api/types";

interface Props {
  athletes: AthleteSummary[];
}

export default function CoachChronoScreen({ athletes }: Props) {
  const [state, dispatch] = useReducer(chronoReducer, initialChronoState);

  const isRacing = state.phase === "racing" && state.waves.some((w) => w.startedAt && !w.stopped);
  const { now, getTimestamp } = useChronoTimer(isRacing);

  // Mobile guard
  const isMobile = typeof window !== "undefined" && window.innerWidth < 768;
  if (isMobile) {
    return (
      <div className="flex items-center justify-center h-[60vh] text-center p-8">
        <div>
          <p className="text-lg font-semibold">Chrono non disponible sur mobile</p>
          <p className="text-sm text-muted-foreground mt-2">
            Utilisez une tablette ou un ordinateur pour accéder au chronomètre.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto p-4">
      {state.phase === "setup" && (
        <ChronoSetup state={state} dispatch={dispatch} athletes={athletes} />
      )}
      {state.phase === "racing" && (
        <ChronoRace state={state} dispatch={dispatch} now={now} getTimestamp={getTimestamp} />
      )}
      {state.phase === "results" && (
        <ChronoResults state={state} dispatch={dispatch} />
      )}
    </div>
  );
}
```

**Step 2: Modifier Coach.tsx**

- Ajouter `"chrono"` au type `CoachSection` (ligne ~28)
- Ajouter lazy import : `const CoachChronoScreen = lazy(() => import("./coach/CoachChronoScreen"));`
- Ajouter le bloc de rendu conditionnel :
  ```tsx
  {activeSection === "chrono" ? (
    <Suspense fallback={<PageSkeleton />}>
      <CoachChronoScreen athletes={athletes} />
    </Suspense>
  ) : null}
  ```

**Step 3: Modifier navItems.ts**

Ajouter le nav item coach (avec icône `Timer` de Lucide) :
```tsx
{ href: "/coach?section=chrono", icon: Timer, label: "Chrono" },
```

Note : la nav coach a déjà 4 items (max recommandé pour mobile bottom nav). Comme le Chrono est tablette/desktop uniquement, l'ajouter seulement dans la nav desktop (top bar), ou l'ajouter comme 5e item visible uniquement en `hidden md:flex`.

**Step 4: Modifier AppLayout.tsx**

Ajouter dans `COACH_SECTION_LABELS` :
```tsx
chrono: "Chrono",
```

**Step 5: Vérifier la compilation + test dev server**

Run: `npx tsc --noEmit && npm run dev`

**Step 6: Commit**

```bash
git add src/pages/coach/CoachChronoScreen.tsx src/pages/Coach.tsx src/components/layout/navItems.ts src/components/layout/AppLayout.tsx
git commit -m "feat(chrono): add CoachChronoScreen orchestrator + routing + nav"
```

---

### Task 7: localStorage backup + restauration

**Files:**
- Modify: `src/pages/coach/CoachChronoScreen.tsx`
- Modify: `src/lib/api/client.ts` — ajouter clé STORAGE_KEYS

**Step 1: Ajouter la clé de stockage**

Dans `src/lib/api/client.ts`, ajouter dans `STORAGE_KEYS` :
```tsx
CHRONO_BACKUP: "eac-chrono-backup",
```

**Step 2: Ajouter la persistance dans l'orchestrateur**

- `useEffect` qui sauvegarde `state` dans localStorage à chaque changement (sérialiser la Map en tableau)
- Au mount, vérifier s'il y a un backup et proposer de le restaurer via un dialog "Reprendre la série en cours ?"
- Supprimer le backup après export réussi ou reset volontaire

**Step 3: Commit**

```bash
git add src/pages/coach/CoachChronoScreen.tsx src/lib/api/client.ts
git commit -m "feat(chrono): add localStorage backup and restore for active series"
```

---

### Task 8: Polish UI — /frontend-design pass final

**Files:**
- Modify: tous les composants chrono

**Step 1: Appeler /frontend-design**

Passer en revue l'ensemble des 3 composants (Setup, Race, Results) avec `/frontend-design` pour :
- Esthétique "Olympic Scoreboard" cohérente (dark theme, monospace, couleurs vagues)
- Animations : pulse sur GO, flash sur split, transitions entre phases
- Touch targets vérifiés (min 48px)
- Responsive tablette (grille adaptative selon nombre de nageurs par ligne)

**Step 2: Tester manuellement**

- Scénario : 3 lignes, 4 nageurs, 3 vagues, 2-3 splits chacun
- Vérifier : fluidité chrono, précision splits, feedback tactile, export

**Step 3: Commit**

```bash
git add src/components/chrono/
git commit -m "feat(chrono): polish UI with Olympic Scoreboard aesthetic"
```

---

### Task 9: Documentation

**Files:**
- Modify: `CLAUDE.md` — ajouter fichiers clés
- Modify: `docs/ROADMAP.md` — ajouter chantier
- Modify: `docs/FEATURES_STATUS.md` — ajouter feature
- Modify: `docs/implementation-log.md` — ajouter entrée

**Step 1: Mettre à jour les 4 fichiers de documentation**

Suivre le workflow de documentation obligatoire du projet.

**Step 2: Commit**

```bash
git add CLAUDE.md docs/ROADMAP.md docs/FEATURES_STATUS.md docs/implementation-log.md
git commit -m "docs: add chrono coach feature to project documentation"
```
