# Performance Fixes Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Corriger 4 problèmes de performance concrets identifiés par l'audit du 2026-04-13 (batterie PWA, polling inutile, monolithe Dashboard, grille coach non-virtualisée).

**Architecture:** Fixes indépendants, appliqués du plus trivial au plus structurel. Tasks 1-2 sont des one-liners sûrs à livrer immédiatement. Tasks 3-4 sont des refactos plus lourds à isoler dans des commits dédiés.

**Tech Stack:** React 19, @tanstack/react-query 5, Zustand 5, Vite 7, Vitest, react-window (à ajouter task 4).

**Notes importantes :**
- Les "fixes" lazy-load PDF et keys FeedbackDrawer de l'audit sont faux positifs (déjà faits). Ne pas les retoucher.
- Projet utilise hash routing + GitHub Pages. Pas de SSR.
- Mettre à jour `docs/implementation-log.md`, `docs/ROADMAP.md`, `docs/FEATURES_STATUS.md` et `CLAUDE.md` à la fin (workflow obligatoire du projet).

---

## Task 1 — Désactiver `refetchOnWindowFocus` global

**Impact :** 🔥 Stoppe les refetchs Supabase à chaque retour d'arrière-plan PWA. Économie batterie mobile massive.

**Files:**
- Modify: `src/lib/queryClient.ts:44-57`

**Step 1: Modifier le defaultOptions**

Remplacer :

```ts
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: true,
      staleTime: Infinity,
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});
```

Par :

```ts
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      refetchOnReconnect: true,
      staleTime: Infinity,
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});
```

**Pourquoi `refetchOnReconnect: true` :** On veut toujours resynchroniser après perte réseau (cas offline PWA), mais pas à chaque focus fenêtre.

**Step 2: Vérifier qu'aucune query ne dépend du comportement focus**

Run:
```bash
grep -rn "refetchOnWindowFocus" src/
```

Expected: seule occurrence = `src/lib/queryClient.ts`. Si d'autres fichiers l'overrident à `true`, les laisser (ce sont des cas intentionnels).

**Step 3: Type check + tests**

```bash
npx tsc --noEmit
npm test -- --run
```

Expected: PASS (le test pre-existing `TimesheetHelpers.test.ts` qui échoue est connu, non bloquant).

**Step 4: Smoke test manuel**

```bash
npm run dev
```

Ouvrir `http://localhost:8080`, se connecter, ouvrir DevTools → Network. Changer d'onglet puis revenir → aucune requête Supabase ne doit se déclencher.

**Step 5: Commit**

```bash
git add src/lib/queryClient.ts
git commit -m "perf(query): disable refetchOnWindowFocus to save PWA battery

Stops Supabase refetch storm when user returns to the app from
background. Keeps refetchOnReconnect for offline recovery."
```

---

## Task 2 — Remplacer `refetchInterval: 30s` par `staleTime` sur objectives

**Impact :** 🟢 Économie 1 requête / 30 s quand l'écran objectifs est ouvert. Aucune raison métier de polling.

**Files:**
- Modify: `src/components/profile/SwimmerObjectivesView.tsx:72-76`

**Step 1: Modifier la query**

Remplacer :

```ts
queryKey: ["athlete-objectives"],
queryFn: () => api.getAthleteObjectives(),
enabled: !!authUid,
refetchInterval: 30_000,
```

Par :

```ts
queryKey: ["athlete-objectives"],
queryFn: () => api.getAthleteObjectives(),
enabled: !!authUid,
staleTime: 5 * 60 * 1000, // 5 min — les objectifs changent rarement
```

**Step 2: Vérifier qu'aucun autre endroit ne dépend du polling 30s**

Run:
```bash
grep -rn "athlete-objectives" src/
```

Expected: invalidation manuelle via `queryClient.invalidateQueries(["athlete-objectives"])` dans les mutations CRUD objectifs → confirmer que le cache est bien invalidé après create/update/delete.

Si une mutation oublie d'invalider, l'ajouter. Pour chaque mutation trouvée dans `SwimmerObjectivesView.tsx` qui modifie un objectif, vérifier la présence de :

```ts
onSuccess: () => {
  queryClient.invalidateQueries({ queryKey: ["athlete-objectives"] });
}
```

**Step 3: Type check**

```bash
npx tsc --noEmit
```

**Step 4: Smoke test manuel**

Ouvrir la vue objectifs, créer / modifier / supprimer un objectif → la liste se met à jour immédiatement (via invalidation, pas via polling).

**Step 5: Commit**

```bash
git add src/components/profile/SwimmerObjectivesView.tsx
git commit -m "perf(objectives): replace 30s polling with staleTime + invalidation

Objectives rarely change; polling was wasteful. Rely on explicit
invalidation from mutations instead."
```

---

## Task 3 — Découper `useDashboardState` (907 LOC) en hooks ciblés

**Impact :** 🔥 Réduit les re-renders en cascade du nageur (Dashboard.tsx + FeedbackDrawer + SwimExerciseLogsHistory). Chaque keystroke ne doit plus re-rendre 50+ composants.

**Stratégie :** Extraction progressive sans changer l'API du hook racine. On découpe en 4 sous-hooks, puis `useDashboardState` devient une façade qui les compose. Les consommateurs ne changent pas. On valide par tests d'intégration existants.

**Files:**
- Modify: `src/hooks/useDashboardState.ts` (façade)
- Create: `src/hooks/dashboard/useDashboardSessions.ts`
- Create: `src/hooks/dashboard/useFeedbackDraft.ts`
- Create: `src/hooks/dashboard/useDayMetrics.ts`
- Create: `src/hooks/dashboard/useCompletionStatus.ts`
- Test: `src/hooks/dashboard/__tests__/*.test.ts` (nouveaux)

### Step 1 — Lire et cartographier le hook existant

Run:
```bash
wc -l src/hooks/useDashboardState.ts
```

Lire le fichier complet. Identifier et noter :
- Les `useState` / `useReducer` utilisés.
- Les `useQuery` exécutés.
- Les `useMemo` / `useCallback`.
- Les valeurs exportées par le hook.

Produire une carte mentale :
- **sessions** : tout ce qui touche à `PlannedSession`, queries assignments, slots, semaine courante.
- **draft** : `DraftState`, `strokes`, `exerciseLogs`, handlers onChange, save.
- **metrics** : `globalKm`, `dayKm`, `weekKm`, totaux.
- **completion** : statut "complétée" / "à remplir" par session, presence defaults, attendance overrides.

**Commit (optionnel) :** juste la carte si on veut la sauvegarder dans une note, sinon passer.

### Step 2 — Créer `useDashboardSessions`

Écrire un test d'abord :

Create `src/hooks/dashboard/__tests__/useDashboardSessions.test.tsx`:

```tsx
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, it, expect, vi } from "vitest";
import { useDashboardSessions } from "../useDashboardSessions";

vi.mock("@/lib/api/assignments", () => ({
  resolveSwimmerAssignmentsBatch: vi.fn(async () => ({})),
}));

function wrapper({ children }: { children: React.ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe("useDashboardSessions", () => {
  it("returns empty sessions for unknown swimmer", async () => {
    const { result } = renderHook(
      () => useDashboardSessions({ swimmerId: "unknown", weekStart: new Date("2026-04-13") }),
      { wrapper },
    );
    await waitFor(() => expect(result.current.sessions).toEqual([]));
  });
});
```

Run:
```bash
npm test -- --run src/hooks/dashboard/__tests__/useDashboardSessions.test.tsx
```

Expected: FAIL (hook not defined).

### Step 3 — Implémenter `useDashboardSessions`

Create `src/hooks/dashboard/useDashboardSessions.ts` : extraire **uniquement** la logique sessions/slots/assignments depuis `useDashboardState.ts`. Signature :

```ts
export function useDashboardSessions(params: {
  swimmerId: string | null;
  weekStart: Date;
}): {
  sessions: PlannedSession[];
  slots: SwimmerTrainingSlot[];
  isLoading: boolean;
};
```

Déplacer les `useQuery` concernées, leurs `useMemo` de mapping, et les types `PlannedSession` / `SlotKey` (les re-exporter).

Run test → PASS.

### Step 4 — Commit useDashboardSessions

```bash
git add src/hooks/dashboard/useDashboardSessions.ts src/hooks/dashboard/__tests__/useDashboardSessions.test.tsx
git commit -m "refactor(dashboard): extract useDashboardSessions from monolith"
```

### Step 5 — Répéter Steps 2-4 pour `useFeedbackDraft`

Responsabilité : `DraftState`, reducers/setters onChange, save mutation, reset.

Test minimal :
```tsx
it("updates distance without touching strokes", () => {
  const { result } = renderHook(() => useFeedbackDraft({ sessionId: "s1" }));
  act(() => result.current.setDistance(1500));
  expect(result.current.draft.distanceMeters).toBe(1500);
  expect(result.current.draft.strokes).toEqual(emptyStrokeDraft);
});
```

Commit dédié.

### Step 6 — Répéter pour `useDayMetrics`

Responsabilité : calculs dérivés `globalKm`, `dayKm`, `weekKm`. **Pur** — aucun useQuery, juste `useMemo` sur `sessions`.

```ts
export function useDayMetrics(sessions: PlannedSession[], selectedDayISO: string) {
  return useMemo(() => {
    const dayKm = sessions
      .filter(s => s.iso === selectedDayISO)
      .reduce((acc, s) => acc + (s.km ?? 0), 0);
    const weekKm = sessions.reduce((acc, s) => acc + (s.km ?? 0), 0);
    return { dayKm, weekKm };
  }, [sessions, selectedDayISO]);
}
```

Test unitaire trivial, commit.

### Step 7 — Répéter pour `useCompletionStatus`

Responsabilité : `PresenceDefaults`, `AttendanceOverrides`, dérivation statut par session.

### Step 8 — Refactorer `useDashboardState` en façade

Modifier `src/hooks/useDashboardState.ts` pour qu'il ne fasse plus qu'appeler les 4 sous-hooks et recomposer l'objet de retour avec l'API identique :

```ts
export function useDashboardState() {
  const { swimmerId } = useAuth();
  const [selectedDay, setSelectedDay] = useState(() => new Date());
  const weekStart = useMemo(() => startOfWeek(selectedDay), [selectedDay]);

  const { sessions, slots, isLoading } = useDashboardSessions({ swimmerId, weekStart });
  const selectedDayISO = toISODate(selectedDay);
  const metrics = useDayMetrics(sessions, selectedDayISO);
  const completion = useCompletionStatus(sessions);
  const draft = useFeedbackDraft({ /* ... */ });

  return { sessions, slots, isLoading, ...metrics, ...completion, draft, selectedDay, setSelectedDay };
}
```

Le fichier doit passer de ~907 LOC à < 150 LOC.

### Step 9 — Vérifier non-régression

```bash
npx tsc --noEmit
npm test -- --run
npm run dev
```

Smoke test Dashboard nageur :
- Navigation semaine OK.
- Ouvrir FeedbackDrawer, taper dans un champ → saisie fluide, pas de lag.
- Save session → confirmation + invalidation OK.

### Step 10 — Mesurer l'amélioration (optionnel mais recommandé)

Avant/après via React DevTools Profiler : enregistrer un changement de draft, comparer le nombre de composants re-rendus. Noter le chiffre dans le commit message ou implementation-log.

### Step 11 — Commit final façade

```bash
git add src/hooks/useDashboardState.ts
git commit -m "refactor(dashboard): useDashboardState becomes thin façade over 4 hooks

Reduces re-render cascade on draft updates: keystrokes no longer
trigger re-render of sessions list, metrics and completion status."
```

---

## Task 4 — Virtualiser `CoachTrainingSlotsScreen` (2836 LOC)

**Impact :** 🔥 Scroll timeline coach fluide, TTI −2 s sur club avec beaucoup de nageurs. Risque moyen car composant central coach.

**Files:**
- Modify: `src/pages/coach/CoachTrainingSlotsScreen.tsx`
- Add dep: `react-window` (si pas déjà présent)

### Step 1 — Vérifier la dépendance

```bash
grep -E '"react-window"' package.json
```

Si absent :
```bash
npm install react-window
npm install -D @types/react-window
```

### Step 2 — Identifier le ou les `.map()` critiques

```bash
grep -n "\.map(" src/pages/coach/CoachTrainingSlotsScreen.tsx | head -40
```

Repérer la liste la plus longue (typiquement : liste nageurs assignés à un slot, ou liste des slots de la semaine). Noter les lignes exactes.

### Step 3 — Extraire la ligne virtualisée dans un sous-composant

Si le fichier fait 2836 LOC, il faut d'abord isoler proprement la liste concernée. Créer un composant enfant `SlotSwimmerList.tsx` qui reçoit le tableau en props. Le parent passe `swimmers` et un `renderItem` stable (`useCallback`).

### Step 4 — Ajouter `FixedSizeList` de react-window

```tsx
import { FixedSizeList } from "react-window";

function SlotSwimmerList({ swimmers, onToggle }: Props) {
  const Row = useCallback(
    ({ index, style }: { index: number; style: React.CSSProperties }) => {
      const s = swimmers[index];
      return (
        <div style={style} className="flex items-center gap-2 px-3">
          {/* ...contenu existant de l'ancien map... */}
        </div>
      );
    },
    [swimmers, onToggle],
  );

  return (
    <FixedSizeList
      height={400}
      itemCount={swimmers.length}
      itemSize={56}
      width="100%"
    >
      {Row}
    </FixedSizeList>
  );
}
```

**Points d'attention :**
- `itemSize` doit matcher la hauteur réelle des items (mesurer dans DevTools).
- Si les items ont des hauteurs variables → `VariableSizeList` + cache de hauteurs.
- `useCallback` sur `Row` est critique, sinon re-mount de toute la liste.

### Step 5 — Vérifier les interactions

Les features suivantes doivent continuer à marcher après virtualisation :
- Drag & drop (si présent dans le scope de la liste virtualisée — react-window ne gère pas nativement dnd-kit, peut nécessiter `outerElementType`).
- Sélection multiple.
- Scroll vers un item précis → `listRef.current.scrollToItem(index)`.

Si drag & drop concerne la liste virtualisée, **arrêter et brainstormer** : il faut soit sortir la liste de la virtualisation (scope too big), soit utiliser `react-window` + `dnd-kit` ensemble (faisable mais non trivial).

### Step 6 — Tests + smoke

```bash
npx tsc --noEmit
npm test -- --run
npm run dev
```

Se connecter en coach, ouvrir l'écran créneaux, scroller rapidement → pas de saccade, DOM garde ~15 items au lieu de 700+.

### Step 7 — Commit

```bash
git add package.json package-lock.json src/pages/coach/CoachTrainingSlotsScreen.tsx src/pages/coach/SlotSwimmerList.tsx
git commit -m "perf(coach): virtualize training slots swimmer list

Uses react-window FixedSizeList on the hottest .map() in the slots
screen. DOM nodes: ~700 → ~15. TTI improves noticeably on tablets."
```

---

## Task 5 — Documentation obligatoire (workflow projet)

**Files:**
- Modify: `docs/implementation-log.md` — ajouter entrée `§111 — Performance fixes (batterie PWA, polling objectives, split useDashboardState, virtualisation slots coach)` avec contexte, changements, fichiers touchés, mesures avant/après.
- Modify: `docs/ROADMAP.md` — ajouter ligne `75 | Performance fixes post-audit | Haute | Fait (§111)` et mettre à jour la date en tête de fichier.
- Modify: `docs/FEATURES_STATUS.md` — si une feature "performance" existe, passer à ✅.
- Modify: `CLAUDE.md` — ajouter la ligne chantier 75 dans le tableau "Chantiers futurs". Mettre à jour les tailles LOC de `useDashboardState.ts` (devrait être < 150 LOC maintenant) via `wc -l`, idem pour les nouveaux hooks dashboard/.

**Step final : commit doc**

```bash
git add docs/ CLAUDE.md
git commit -m "docs(§111): log performance fixes batch"
```

---

## Ordre d'exécution recommandé

1. **Task 1** (2 min, zéro risque) → livrable immédiat, déploiable seul.
2. **Task 2** (15 min, risque faible) → livrable immédiat.
3. **Task 4** (2-4 h, risque moyen) → PR dédiée, QA coach.
4. **Task 3** (2-3 h, risque plus élevé car touche un hook central nageur) → PR dédiée en dernier, QA nageur approfondie.

Raison : Task 3 est la plus invasive. La garder en dernier permet de livrer les 3 autres rapidement et de focaliser la review sur ce refacto isolément.

## Critères de succès

- ✅ Aucune requête Supabase déclenchée au changement d'onglet navigateur (task 1).
- ✅ Aucun refetch polling toutes les 30 s sur l'écran objectifs (task 2).
- ✅ `wc -l src/hooks/useDashboardState.ts` < 150 (task 3).
- ✅ `document.querySelectorAll('[data-slot-row]').length` reste constant (~15) indépendamment du nombre de nageurs affichés dans CoachTrainingSlotsScreen (task 4).
- ✅ `npx tsc --noEmit` passe.
- ✅ `npm test -- --run` passe (hors tests pré-existants flaky).
- ✅ Smoke tests manuels nageur + coach OK.
