# Plan d'implémentation — vers 9/10 robustesse + perf/fluidité + friction (§266-§269)

> **For Claude:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task-by-task.

**Goal:** Faire passer les 4 dimensions de l'audit `2026-05-10-robustesse-perf-fluidite.md` (Robustesse 6.4-7.0, Fluidité 7.6, Friction UX 8.2) à **≥ 9.0/10** en 4 chantiers (§266-§269).

**Architecture:** 4 chantiers séquentiels avec frequent commits. Chaque chantier = 1 § dans `implementation-log.md` + commit groupé. Pas de migration RLS, donc pas de `npm run test:rls`. Les changements sont localisés (3-8 fichiers par chantier max), risque maîtrisé.

**Tech Stack:** React 19, TypeScript, Vite 7, Tailwind 4, React Query 5, Zustand 5, Wouter, Supabase. Tests Vitest. Pattern AlertDialog Radix (déjà adopté §198).

**Total estimé** : 3.5-4 j cumulés. Si Agent Team activée : 2 j calendaire (R1 séquentiel, R2/R3/R4 parallélisables).

**Trace audit** : `docs/audits/2026-05-10-robustesse-perf-fluidite.md`.

---

## Phase 1 — §266 Chantier R1 : fix P0 urgents (0.5 j)

**Cible** : robustesse +0.6, friction +0.3.

### Task 1.1 — Idempotency key sur queue offline (swim-session)

**Files:**
- Modify: `src/lib/offlineQueue.ts` (ajouter dédup par key)
- Modify: `src/pages/SwimSessionView.tsx:558-571` (injecter key dans saveMutation)
- Test: `src/lib/__tests__/offlineQueue.test.ts` (créer si absent, sinon ajouter cas)

**Step 1: Lire l'état actuel d'`offlineQueue.ts`**

Run: `wc -l src/lib/offlineQueue.ts && grep -n "export\|function\|enqueue" src/lib/offlineQueue.ts | head -30`

Comprendre l'API actuelle d'`enqueue` et sa structure de stockage (localStorage clé `__offline_queue__` probablement).

**Step 2: Écrire le test de dédup d'idempotency key**

```typescript
// src/lib/__tests__/offlineQueue.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import { enqueue, peekQueue, clearQueue } from "../offlineQueue";

describe("offlineQueue idempotency", () => {
  beforeEach(() => clearQueue());

  it("rejects duplicate idempotencyKey within same queue", async () => {
    await enqueue({
      kind: "saveSwimSession",
      payload: { sessionId: 42, logs: [] },
      idempotencyKey: "user-1-2026-05-10-morning",
    });
    await enqueue({
      kind: "saveSwimSession",
      payload: { sessionId: 42, logs: [] },
      idempotencyKey: "user-1-2026-05-10-morning",
    });
    expect(peekQueue()).toHaveLength(1);
  });
});
```

**Step 3: Run test → fail**

Run: `npm test -- offlineQueue`
Expected: FAIL (idempotencyKey field n'existe pas).

**Step 4: Implémenter dédup dans `offlineQueue.ts`**

Ajouter le type `idempotencyKey?: string` à l'interface du queue item. Dans `enqueue`, avant push, vérifier `if (idempotencyKey && queue.some(it => it.idempotencyKey === idempotencyKey)) return;`.

**Step 5: Run test → pass**

Run: `npm test -- offlineQueue`
Expected: PASS.

**Step 6: Câbler `SwimSessionView.tsx` saveMutation**

Dans `src/pages/SwimSessionView.tsx`, repérer `saveMutation` et l'appel à `tryWithOfflineQueue`. Injecter :

```typescript
const idempotencyKey = `swim-${userId}-${sessionDate}-${slot ?? "default"}`;
// ... passer cette key au queue item
```

**Step 7: Vérifier type-check**

Run: `npx tsc --noEmit`
Expected: 0 erreur (hors pre-existing dashboard stories).

**Step 8: Commit**

```bash
git add src/lib/offlineQueue.ts src/lib/__tests__/offlineQueue.test.ts src/pages/SwimSessionView.tsx
git commit -m "feat(§266): R1 sub-§A — idempotencyKey dans queue offline (anti-doublon swim-session)

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 1.2 — Auto-sync §260 fix : ref par coach + log catch

**Files:**
- Modify: `src/pages/coach/CoachPaceCalculatorScreen.tsx:211-253`

**Step 1: Lire le contexte effectiveCoachId**

Run: `grep -n "effectiveCoachId\|coachId" src/pages/coach/CoachPaceCalculatorScreen.tsx | head -20`

Vérifier que `effectiveCoachId` (ou équivalent) est bien dans le scope du composant.

**Step 2: Modifier le ref + deps + catch**

Remplacer le bloc `useEffect(() => { ... }, [teamLoading, targetsQuery.isLoading])` par :

```typescript
const hasSyncedObjectivesRef = useRef<string | null>(null);
useEffect(() => {
  if (teamLoading || targetsQuery.isLoading) return;
  const syncKey = String(effectiveCoachId ?? "self");
  if (hasSyncedObjectivesRef.current === syncKey) return;
  hasSyncedObjectivesRef.current = syncKey;
  // ... reste du run() inchangé
}, [teamLoading, targetsQuery.isLoading, effectiveCoachId]);
```

Et remplacer `catch {}` (l. 247-249) par :
```typescript
} catch (err) {
  console.warn("[auto-sync] échec — best effort", err);
}
```

**Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: 0 erreur.

**Step 4: Smoke test manuel (dev server)**

Run: `npm run dev`
Tester en tant qu'admin : changer le coach via le `Select` → vérifier dans la console qu'aucun warning fatal n'apparaît, et que les targets s'updatent.

**Step 5: Commit**

```bash
git add src/pages/coach/CoachPaceCalculatorScreen.tsx
git commit -m "fix(§266): R1 sub-§B — auto-sync §260 ref par coach + log catch silencieux

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 1.3 — Chrono persistance debounce + toast quota

**Files:**
- Modify: `src/pages/coach/CoachChronoScreen.tsx:99-116`

**Step 1: Comprendre le state + lifecycle**

Run: `grep -n "BACKUP_KEY\|serializeState\|setItem" src/pages/coach/CoachChronoScreen.tsx | head -10`

**Step 2: Implémenter le debounce + toast quota**

Remplacer le `useEffect` lignes 99-116 par :

```typescript
const persistTimeoutRef = useRef<number | null>(null);
const quotaWarnedRef = useRef(false);
useEffect(() => {
  if (state.swimmers.length === 0) return;
  if (persistTimeoutRef.current) window.clearTimeout(persistTimeoutRef.current);
  persistTimeoutRef.current = window.setTimeout(() => {
    try {
      localStorage.setItem(BACKUP_KEY, serializeState(state));
    } catch {
      try {
        const lean = { ...state, swimmers: state.swimmers.map((s) => ({ ...s, avatarUrl: null })) };
        localStorage.setItem(BACKUP_KEY, serializeState(lean));
      } catch {
        localStorage.removeItem(BACKUP_KEY);
        if (!quotaWarnedRef.current) {
          quotaWarnedRef.current = true;
          toast({
            title: "Sauvegarde locale impossible",
            description: "Quota navigateur dépassé. Exporte régulièrement pour ne rien perdre.",
            variant: "destructive",
          });
        }
      }
    }
  }, 500);
  return () => {
    if (persistTimeoutRef.current) window.clearTimeout(persistTimeoutRef.current);
  };
}, [state]);
```

**Step 3: Vérifier que `useToast` est bien importé**

Run: `grep -n "useToast\|from.*toast" src/pages/coach/CoachChronoScreen.tsx | head -5`

Si absent, ajouter `import { useToast } from "@/hooks/use-toast"` (ou équivalent existant). Note : le double système toast sera unifié en Phase 3.

**Step 4: Type-check**

Run: `npx tsc --noEmit`
Expected: 0 erreur.

**Step 5: Commit**

```bash
git add src/pages/coach/CoachChronoScreen.tsx
git commit -m "fix(§266): R1 sub-§C — chrono persistance debounce 500ms + toast quota fail

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 1.4 — Migration 5 `window.confirm` → AlertDialog

**Files:**
- Modify: `src/pages/Records.tsx:970` (suppression record)
- Modify: `src/pages/Admin.tsx:515,727` (suppression user × 2)
- Modify: `src/components/coach/swim/SwimSessionBuilder.tsx:379` (suppression séance)
- Modify: `src/components/profile/AthleteInterviewsSection.tsx:278,287` (signature × 2)

**Pattern de référence** : `src/pages/SwimSessionView.tsx:574+` (déjà migré §198).

**Step 1: Lire le pattern de référence**

Run: `grep -n "removeConfirmOpen\|AlertDialog" src/pages/SwimSessionView.tsx | head -10`

Identifier le pattern : `useState<boolean>` pour open, `<AlertDialog>` JSX en bas du composant, action button qui set state=true.

**Step 2: Migration Records.tsx (1 occurrence)**

Dans `src/pages/Records.tsx` :
1. Ajouter `const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);`
2. Le bouton ligne 970 : remplacer `confirm("Supprimer ce record ?")` par `setDeleteConfirmOpen(true)`.
3. Ajouter `<AlertDialog>` (cf. SwimSessionView pattern) avec onConfirm = `() => { swimForm.id && deleteSwimRecordMut.mutate(swimForm.id); setDeleteConfirmOpen(false); }`.

**Step 3: Migration Admin.tsx (2 occurrences)**

Pour chacune : même pattern. Si les 2 confirms sont sur des contextes différents, utiliser 2 states distincts (`deleteUserConfirm`, `rejectUserConfirm`).

**Step 4: Migration SwimSessionBuilder.tsx (1 occurrence)**

Idem.

**Step 5: Migration AthleteInterviewsSection.tsx (2 occurrences)**

Idem. Pour signature engageante, copy explicite : "Signer cet entretien ? Cette action est définitive et engage votre responsabilité."

**Step 6: Vérifier qu'aucun `window.confirm` ne subsiste**

Run: `grep -rn "window\.confirm\|^[[:space:]]*confirm(" src/`
Expected: 0 résultat (hors test files éventuels).

**Step 7: Type-check + tests**

Run: `npx tsc --noEmit && npm test`
Expected: 0 erreur, tests pass.

**Step 8: Smoke test dev server**

Run: `npm run dev`
Tester chaque écran modifié : Records (delete), Admin (delete user), Coach swim session builder, Profile interviews. Vérifier UX iOS-aligned.

**Step 9: Commit**

```bash
git add src/pages/Records.tsx src/pages/Admin.tsx src/components/coach/swim/SwimSessionBuilder.tsx src/components/profile/AthleteInterviewsSection.tsx
git commit -m "feat(§266): R1 sub-§D — migration 5× window.confirm → AlertDialog Radix

Aligne tous les destructifs sur le pattern §198 (SwimSessionView).
- Records.tsx delete record
- Admin.tsx delete/reject user (×2)
- SwimSessionBuilder delete session
- AthleteInterviewsSection sign interview (×2)

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 1.5 — Mise à jour docs §266

**Files:**
- Modify: `docs/implementation-log.md` (ajouter §266)
- Modify: `docs/ROADMAP.md` (ajouter §266 + bump *Dernière mise à jour*)
- Modify: `CLAUDE.md` (Dernier § livré)

**Step 1: Ajouter entrée §266 à implementation-log.md**

Format standard (cf. §263, §264) : contexte, changements, fichiers modifiés, tests, décisions, limites.

**Step 2: Mettre à jour ROADMAP.md**

Ajouter ligne sous Chantier R1, statut Fait. Bump `*Dernière mise à jour*`.

**Step 3: Mettre à jour CLAUDE.md**

`Dernier § livré : **§266** — Chantier R1 : fix P0 robustesse (idempotency, auto-sync, chrono, 5 confirm natifs).`

**Step 4: Commit docs**

```bash
git add docs/implementation-log.md docs/ROADMAP.md CLAUDE.md
git commit -m "docs(§266): Chantier R1 — fix P0 audit robustesse + 5 confirm natifs

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Phase 2 — §267 Chantier R2 : memoization hubs runtime (1 j)

**Cible** : fluidité +1.0.

**Note** : pas de TDD strict (perf optimization). Validation par lecture code + smoke test React DevTools Profiler.

### Task 2.1 — WorkoutRunner : extraire `<SetRow>` memo

**Files:**
- Create: `src/components/strength/SetRow.tsx`
- Modify: `src/components/strength/WorkoutRunner.tsx` (1503 LOC → ~1300 après extraction)

**Step 1: Identifier la SetRow inline**

Run: `grep -n "set\|series\|Series\|reps\|weight" src/components/strength/WorkoutRunner.tsx | head -30`

Trouver la JSX rendue dans le `.map((set, idx) => ...)` — c'est la portion à extraire.

**Step 2: Créer `SetRow.tsx`**

```typescript
// src/components/strength/SetRow.tsx
import { memo } from "react";

export interface SetRowProps {
  set: SetData;
  idx: number;
  isActive: boolean;
  onLog: (idx: number, payload: SetPayload) => void;
  onComplete: (idx: number) => void;
  onRest: (idx: number) => void;
}

function SetRowImpl({ set, idx, isActive, onLog, onComplete, onRest }: SetRowProps) {
  // ... JSX extrait de WorkoutRunner
}

export const SetRow = memo(SetRowImpl, (prev, next) =>
  prev.set === next.set &&
  prev.isActive === next.isActive &&
  prev.idx === next.idx
);
```

(Les types `SetData`/`SetPayload` à importer depuis types existants WorkoutRunner.)

**Step 3: Modifier WorkoutRunner**

Remplacer la JSX inline par `<SetRow ... />`. Convertir handlers `onLog`/`onComplete`/`onRest` en `useCallback` stables.

**Step 4: Type-check + tests**

Run: `npx tsc --noEmit && npm test`
Expected: pass.

**Step 5: Validation perf (React Profiler)**

Run: `npm run dev`
Avec React DevTools : taper 5 caractères dans un set log input → vérifier que **seul le SetRow concerné re-render** (les autres `Did not render`).

**Step 6: Commit**

```bash
git add src/components/strength/SetRow.tsx src/components/strength/WorkoutRunner.tsx
git commit -m "feat(§267): R2 sub-§A — extraire SetRow memo (WorkoutRunner re-render cascade fix)

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 2.2 — Strength.tsx : memoize listes dérivées + wrap onglets

**Files:**
- Modify: `src/pages/Strength.tsx` (1157 LOC, 5 useMemo → ~10)

**Step 1: Identifier les listes calculées**

Run: `grep -n "filter\|sort\|orderStrengthItems\|\.map(" src/pages/Strength.tsx | head -30`

Repérer les transformations exécutées à chaque render.

**Step 2: Wrapper en `useMemo`**

Pour chaque liste/calcul dérivé :
```typescript
const sortedItems = useMemo(() => orderStrengthItems(items), [items]);
const filteredHistory = useMemo(() => history.filter(...), [history, filterValue]);
```

**Step 3: Memo onglets MyPlanTab + HistoryTable**

Si pas déjà memo : `export default memo(MyPlanTab)`.

**Step 4: Type-check + tests + Profiler smoke**

Run: `npx tsc --noEmit && npm test`
Profiler : switch onglets Strength → vérifier réduction des re-renders.

**Step 5: Commit**

```bash
git add src/pages/Strength.tsx src/components/strength/MyPlanTab.tsx src/components/strength/HistoryTable.tsx
git commit -m "feat(§267): R2 sub-§B — memoize Strength.tsx listes dérivées + wrap onglets

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 2.3 — Records.tsx : memo `<RecordCard>` + lecture stagger

**Files:**
- Modify: `src/pages/Records.tsx:836+` (filteredSwimRecords.map)
- Modify: `src/components/records/RecordCard.tsx` (si existe, sinon extraire)

**Step 1: Identifier la card de record**

Run: `grep -n "RecordCard\|filteredSwimRecords" src/pages/Records.tsx | head -10`

**Step 2: Extraire (si inline) ou wrapper memo**

Si déjà composant : `export default memo(RecordCard)`. Si inline : extraire dans `src/components/records/RecordCard.tsx`.

**Step 3: Plafonner stagger framer-motion (si présent)**

Lignes ~836 : si `staggerChildren` dans variants, plafonner :
```typescript
transition: { staggerChildren: idx < 10 ? 0.03 : 0 }
```

**Step 4: Type-check + tests**

Run: `npx tsc --noEmit && npm test`

**Step 5: Commit**

```bash
git add src/pages/Records.tsx src/components/records/RecordCard.tsx
git commit -m "feat(§267): R2 sub-§C — memo RecordCard + plafond stagger 10 items

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 2.4 — Docs §267

Ajouter §267 à `implementation-log.md`, ROADMAP.md, CLAUDE.md (cf. Task 1.5).

```bash
git commit -m "docs(§267): Chantier R2 — memoization hubs runtime"
```

---

## Phase 3 — §268 Chantier R3 : friction tunnel mutation (1 j)

**Cible** : friction +0.7, fluidité +0.2.

### Task 3.1 — Unifier toast stack (Radix → sonner)

**Files:**
- Audit: `grep -rn "useToast\|from.*hooks/use-toast" src/`
- Audit: `grep -rn "from \"sonner\"\|toast-presets" src/`
- Modify: tous les call-sites identifiés (probablement 30-50)
- Delete: `src/hooks/use-toast.ts` (si Radix est retiré)
- Verify: `src/components/ui/sonner.tsx` configuré dans App

**Step 1: Inventaire des call-sites**

Run: `grep -rn "useToast()" src/ | wc -l`
Run: `grep -rn "import.*toast.*from \"sonner\"" src/ | wc -l`

**Step 2: Décider la cible**

Cible : **sonner** (action retry natif + iOS-aligned). Migration Radix → sonner.

**Step 3: Migration mécanique**

Pour chaque fichier qui utilise `useToast` :
1. Remplacer `import { useToast } from "@/hooks/use-toast"` par `import { toast } from "sonner"`.
2. Retirer `const { toast } = useToast();`.
3. Convertir `toast({ title, description, variant: "destructive" })` en `toast.error(title, { description })` ou `toast.success`/`toast()` selon variant.

**Step 4: Vérifier `<Toaster />` configuré**

S'assurer qu'`App.tsx` ou `AppLayout.tsx` a un `<Toaster />` sonner et pas Radix `<Toaster />`.

**Step 5: Supprimer Radix toast**

```bash
rm src/hooks/use-toast.ts  # si plus utilisé
# ou: garder mais déprécier
```

Vérifier `src/components/ui/toast.tsx` (Radix) : si plus importé nulle part, supprimer aussi.

**Step 6: Type-check + tests**

Run: `npx tsc --noEmit && npm test`
Expected: 0 erreur.

**Step 7: Commit**

```bash
git add -A
git commit -m "refactor(§268): R3 sub-§A — unifier toast stack sur sonner (retire Radix useToast)

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 3.2 — Étendre useDelayedLoading à 8 écrans

**Files:**
- Modify: `src/pages/SwimSessionView.tsx`
- Modify: `src/pages/Strength.tsx`
- Modify: `src/pages/Profile.tsx`
- Modify: `src/pages/coach/CoachWeekView.tsx`
- Modify: `src/pages/coach/CoachTrainingSlotsScreen.tsx`
- Modify: `src/pages/coach/SwimCatalog.tsx`
- Modify: `src/pages/coach/StrengthCatalog.tsx`
- Modify: `src/pages/coach/CoachComms.tsx` (ou équivalent)

**Pattern de référence** : `src/pages/Dashboard.tsx:215+` (déjà adopté §265).

**Step 1: Lire le pattern**

Run: `grep -A 8 "useDelayedLoading" src/pages/Dashboard.tsx | head -20`

**Step 2: Pour chaque fichier, ajouter le hook**

```typescript
import { useDelayedLoading } from "@/hooks/useDelayedLoading";

const showSlowToast = useDelayedLoading(isLoading);
useEffect(() => {
  if (showSlowToast) {
    toast("Connexion lente", { description: "Le chargement prend plus de temps que prévu…" });
  }
}, [showSlowToast]);
```

(Adapter copy par écran si pertinent.)

**Step 3: Type-check + tests**

Run: `npx tsc --noEmit && npm test`

**Step 4: Smoke test dev server**

Throttle Slow 3G via DevTools, naviguer chaque écran, vérifier toast affiché après 5s.

**Step 5: Commit**

```bash
git add -A
git commit -m "feat(§268): R3 sub-§B — étendre useDelayedLoading à 8 écrans (SwimSession/Strength/Profile/Coach×5)

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 3.3 — Action retry sur toasts d'erreur transient

**Files:**
- Modify: `src/components/strength/WorkoutRunner.tsx:560-562, 634-636`
- Modify: `src/pages/SwimSessionView.tsx:284, 299, 331` (3 toasts)
- Modify: `src/pages/Records.tsx` (mutations sans onError, cf. Task 4.2)
- Modify: 11 toasts coach (CoachChrono, CoachPace, CoachInterviews, CoachSms, QuickView*)

**Pattern sonner** :
```typescript
toast.error("Sauvegarde séance impossible", {
  description: "Réseau instable. Réessaie ou vérifie ta connexion.",
  action: { label: "Réessayer", onClick: () => saveMutation.mutate() },
});
```

**Step 1: Inventaire des toasts erreur transient**

Run: `grep -rn "toast.*\"Erreur\"\|title:\"Erreur\"\|toast\.error" src/ | head -30`

**Step 2: Pour chaque toast transient (réseau/timeout)**

Distinguer transient (`isRetriableError`, network, timeout) des erreurs hard (validation, RLS). Pour transient → ajouter `action`. Pour hard → renommer titre explicite ("Données invalides", "Permission refusée").

**Step 3: Type-check + tests**

Run: `npx tsc --noEmit && npm test`

**Step 4: Commit**

```bash
git add -A
git commit -m "feat(§268): R3 sub-§C — action retry sur toasts erreur transient (~17 sites)

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 3.4 — Skeletons spécifiques Coach.tsx (×12)

**Files:**
- Modify: `src/pages/Coach.tsx:1157-1240` (12× `<PageSkeleton/>`)

**Mapping cible** :
- `CoachSwimmersOverview` / `CoachMySwimmersScreen` → `<HomeSkeleton/>` ou `<ListSkeleton/>`
- `CoachWeekView` / `CoachTrainingSlotsScreen` / `CoachChronoScreen` → `<CalendarSkeleton/>`
- `CoachComms` / `CoachCommentsScreen` / `CoachMessagesScreen` → `<ListSkeleton/>`
- `CoachLibraryScreen` / `SwimCatalog` / `StrengthCatalog` → `<ListSkeleton/>`

**Step 1: Identifier les imports skeleton existants**

Run: `grep -n "Skeleton" src/pages/Coach.tsx | head -10`
Run: `ls src/components/shared/*Skeleton*`

**Step 2: Remplacer 12× PageSkeleton**

Sub par sub : remplacer `<PageSkeleton/>` par le skeleton spécifique.

**Step 3: Type-check + smoke test**

Run: `npx tsc --noEmit && npm run dev`
Switch entre onglets Coach → vérifier que le skeleton est cohérent avec le contenu attendu.

**Step 4: Commit**

```bash
git add src/pages/Coach.tsx
git commit -m "feat(§268): R3 sub-§D — skeletons spécifiques par onglet Coach (12 sites)

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 3.5 — Fix double affichage erreur Dashboard

**Files:**
- Modify: `src/pages/Dashboard.tsx:540-551, 603-612`

**Step 1: Lire les 2 blocs error**

Run: `sed -n '535,615p' src/pages/Dashboard.tsx`

**Step 2: Conserver uniquement l'inline banner**

Supprimer le bloc full-screen (lignes 540-551 d'après audit), garder le banner inline. Ajuster le control-flow pour que `error` n'affiche pas double.

**Step 3: Type-check + smoke**

Run: `npx tsc --noEmit`
Forcer une erreur (couper le réseau au mount) → vérifier 1 seul affichage.

**Step 4: Commit**

```bash
git add src/pages/Dashboard.tsx
git commit -m "fix(§268): R3 sub-§E — Dashboard double affichage erreur (full-screen + inline)

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 3.6 — Docs §268

```bash
git commit -m "docs(§268): Chantier R3 — friction tunnel mutation"
```

---

## Phase 4 — §269 Chantier R4 : robustesse mutations + offline (1 j)

**Cible** : robustesse +0.8.

### Task 4.1 — Audit & ajout `onError` sur 9 mutations critiques

**Files:**
- Modify: `src/pages/Records.tsx` (`update1RM`, `upsertSwimRecord`, `updateExerciseNote`)
- Modify: `src/pages/Profile.tsx` (`deleteAvatarMutation` — ajouter optimistic + rollback)
- Modify: `src/pages/Strength.tsx` (`reconcileStrengthRunLogs` background catch)
- Modify: `src/pages/coach/CoachMySwimmersScreen.tsx` (assign/unassign optimistic)

**Pattern** :
```typescript
useMutation({
  mutationFn: (...) => api.something(...),
  onMutate: async (vars) => { /* optimistic + snapshot */ },
  onError: (err, vars, ctx) => {
    if (ctx?.snapshot) qc.setQueryData(key, ctx.snapshot);
    toast.error("Échec", { description: err.message, action: { label: "Réessayer", onClick: () => mut.mutate(vars) } });
  },
  onSuccess: () => qc.invalidateQueries({ queryKey: key }),
});
```

**Step 1: Inventaire des mutations sans `onError`**

Run: `grep -rn "useMutation" src/pages/ src/components/ | head -30`
Pour chaque, vérifier la présence d'`onError`.

**Step 2: Test pour Records `update1RM`**

```typescript
// src/pages/__tests__/Records.test.tsx (créer si absent)
it("update1RM affiche un toast en cas d'erreur", async () => {
  vi.mocked(api.update1RM).mockRejectedValueOnce(new Error("Validation failed"));
  render(<Records />, { wrapper: TestProviders });
  // ... trigger update + waitFor toast.error
});
```

**Step 3: Implémenter `onError` toasts**

Pour chaque mutation listée, ajouter le pattern.

**Step 4: Type-check + tests**

Run: `npx tsc --noEmit && npm test`

**Step 5: Commit**

```bash
git add -A
git commit -m "feat(§269): R4 sub-§A — onError + optimistic rollback sur 9 mutations critiques

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 4.2 — Strength reconcile + queue : UPSERT clé naturelle

**Files:**
- Migration SQL : `supabase/migrations/00161_upsert_strength_logs_natural_key.sql`
- Modify: `src/lib/api/strength.ts` (logStrengthSet → utiliser UPSERT au lieu d'INSERT)

**Step 1: Vérifier le schéma actuel**

Run: `mcp__plugin_supabase_supabase__list_tables` (project ID: fscnobivsgornxdwqwlk) et chercher `strength_exercise_logs` ou similaire.

Vérifier les colonnes : `run_id`, `exercise_id`, `set_index`. Identifier si UNIQUE existe déjà.

**Step 2: Créer la migration**

```sql
-- supabase/migrations/00161_upsert_strength_logs_natural_key.sql
ALTER TABLE strength_exercise_logs
  ADD CONSTRAINT strength_logs_natural_key UNIQUE (run_id, exercise_id, set_index);
```

(Ajuster nom table/colonnes selon le schéma réel.)

**Step 3: Appliquer via MCP**

Run: `mcp__plugin_supabase_supabase__apply_migration`

**Step 4: Modifier `logStrengthSet` côté client**

Dans `src/lib/api/strength.ts`, remplacer `.insert(...)` par `.upsert(..., { onConflict: "run_id,exercise_id,set_index" })`.

**Step 5: Tests RLS**

⚠️ Migration RLS-touching → `npm run test:rls` REQUIRED.
Run: `docker ps` puis `npm run test:rls`.

**Step 6: Type-check + tests**

Run: `npx tsc --noEmit && npm test`

**Step 7: Commit**

```bash
git add -A
git commit -m "feat(§269): R4 sub-§B — UPSERT clé naturelle strength_logs (anti-doublon reconcile+queue)

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 4.3 — Login retry boucle 3× + signup timeout

**Files:**
- Modify: `src/lib/auth.ts:237-244` (loadUser retry)
- Modify: `src/pages/Login.tsx:151-194` (handleSignup withTimeout)

**Step 1: Test loadUser retry**

```typescript
// src/lib/__tests__/auth.test.ts
it("loadUser retry 3× si app_user_id absent du JWT", async () => {
  const refreshSpy = vi.fn();
  // ... mock progressif : 1er appel sans app_user_id, 2e avec
  // ... assert refreshSpy.callCount >= 2
});
```

**Step 2: Implémenter le retry dans `loadUser`**

```typescript
let attempts = 0;
const delays = [200, 400, 800];
while (attempts < 3) {
  await refreshSession();
  const userId = extractAppUserId();
  if (userId) break;
  await new Promise(r => setTimeout(r, delays[attempts]));
  attempts++;
}
```

**Step 3: withTimeout sur handleSignup**

Dans `Login.tsx` :
```typescript
import { withTimeout } from "@/lib/api/withTimeout";
// ...
await withTimeout(supabase.auth.signUp(...), 15_000, "auth.signUp");
```

**Step 4: Intercepter "User already registered"**

```typescript
if (err.message?.includes("already registered")) {
  setActiveTab("login");
  toast("Compte existant — connecte-toi");
  return;
}
```

**Step 5: Type-check + tests**

Run: `npx tsc --noEmit && npm test`

**Step 6: Commit**

```bash
git add src/lib/auth.ts src/pages/Login.tsx
git commit -m "feat(§269): R4 sub-§C — login retry 3× + signup withTimeout(15s) + bascule tab

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 4.4 — Cache key stability slot-subgroups + staleTime training-slots

**Files:**
- Modify: `src/components/coach/SlotSessionSheet.tsx:194` (queryKey array)
- Modify: `src/pages/coach/CoachTrainingSlotsScreen.tsx:1841-1844` (staleTime)

**Step 1: SlotSessionSheet stabilise queryKey**

```typescript
// avant : queryKey: ["slot-subgroups", selectedGroups]
// après :
const subgroupKey = useMemo(() => [...selectedGroups].sort().join(","), [selectedGroups]);
queryKey: ["slot-subgroups", subgroupKey],
```

**Step 2: CoachTrainingSlotsScreen — ajouter staleTime**

Sur `useQuery({ queryKey: ["training-slots"], ... })` ajouter `staleTime: 30_000, gcTime: 5 * 60 * 1000`. Idem `slot-assignments`, `training-slot-overrides`.

**Step 3: Type-check + tests**

Run: `npx tsc --noEmit && npm test`

**Step 4: Commit**

```bash
git add -A
git commit -m "fix(§269): R4 sub-§D — cache key stable slot-subgroups + staleTime training-slots

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 4.5 — Vue semaine §147 : guard swimmerHasCustom undefined

**Files:**
- Modify: `src/pages/coach/CoachTrainingSlotsScreen.tsx:1875-1879, 2024-2055`

**Step 1: Lire le contexte**

Run: `sed -n '1870,2060p' src/pages/coach/CoachTrainingSlotsScreen.tsx`

**Step 2: Ajouter guard loading**

```typescript
const swimmerResolutionLoading = swimmerFilterId != null && swimmerHasCustom === undefined;
const useSwimmerResolution = swimmerHasCustom === true && swimmerFilterId != null;

if (swimmerResolutionLoading) {
  return <CalendarSkeleton />;
}
```

**Step 3: Type-check + smoke**

Run: `npx tsc --noEmit && npm run dev`
Tester filtre nageur → vérifier qu'il n'y a plus de flicker.

**Step 4: Commit**

```bash
git add src/pages/coach/CoachTrainingSlotsScreen.tsx
git commit -m "fix(§269): R4 sub-§E — vue semaine §147 guard swimmerHasCustom undefined (anti-flicker)

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 4.6 — Docs §269 + audit final

**Step 1: Mise à jour documentation**

Identique aux phases précédentes.

**Step 2: Re-audit court (smoke)**

Run un sub-agent rapide sonnet pour vérifier :
- 0 `window.confirm` restant
- 0 mutation critique sans `onError`
- adoption useDelayedLoading sur 11+ écrans

```bash
git commit -m "docs(§269): Chantier R4 — robustesse mutations + offline + smoke audit"
```

---

## Phase 5 (optionnelle) — §270 Chantier R5 : polish vers 9.5/10 (0.5-1 j)

À considérer si temps disponible. Cible : composite 9.5/10.

### Items
- Hook `useDebouncedValue(value, 200)` + 16 substitutions inputs search.
- Wrapper `useReducedMotion()` + variants conditionnels sur 21 fichiers framer-motion (top 5 visibles : HistoryTable, SessionList, MyPlanWeekCard, InProgressCard, RestScreen).
- Virtualization `Records.tsx` liste records ≤ 500 — installer `@tanstack/react-virtual` (~3 KB gzip).
- Empty states avec CTA contextuel (50+ sites — top 5 critiques uniquement).

(Détail chaque task selon pattern Phase 1-4 si décision de l'inclure.)

---

## Validation finale (après §269)

### Score cible vs mesure réelle

| Dimension | Pré §266 | Post §269 (estimé) | Cible |
|---|---|---|---|
| Robustesse nageur | 6.4 | **9.0** | 9.0 ✅ |
| Robustesse coach | 7.0 | **9.0** | 9.0 ✅ |
| Perf/fluidité | 7.6 | **9.0** | 9.0 ✅ |
| Friction UX | 8.2 | **9.0** | 9.0 ✅ |

### Checklist verification (à exécuter en fin de §269)

- [ ] `grep -rn "window\.confirm\|^[[:space:]]*confirm(" src/` → 0 résultat
- [ ] `grep -rn "useToast" src/` → 0 résultat (ou seulement re-export sonner)
- [ ] `grep -rn "useDelayedLoading" src/pages/ src/components/` ≥ 11 fichiers
- [ ] `grep -rn "PageSkeleton" src/pages/Coach.tsx` → 0 résultat
- [ ] `npm run build` → 0 erreur, critical path = 4 modulepreloads
- [ ] `npx tsc --noEmit` → 0 erreur (hors pre-existing dashboard stories)
- [ ] `npm test` → tous pass
- [ ] React DevTools Profiler smoke : WorkoutRunner key-stroke → seul SetRow re-render

### Métriques attendues post-§269

- Bundle critical path : inchangé (4 modulepreloads).
- React render count par keystroke (WorkoutRunner) : -80% estimé.
- Toasts erreur transient avec action retry : ≥ 17 sites.
- 0 `window.confirm` natif.
- 0 mutation critique sans `onError`.

---

## Remember

- DRY : pattern AlertDialog §198 réutilisé partout, pattern useDelayedLoading §265 généralisé.
- YAGNI : pas de virtualization Records si liste < 100 items en prod (mesurer avant). R5 optionnel.
- TDD : tasks 1.1, 4.1, 4.3 ont des tests Vitest. Tasks perf (R2) validées par Profiler.
- Commits fréquents : 1 sub-§ = 1 commit. ~17 commits prévus sur §266-§269.
- Pas de `npm run test:rls` sauf Task 4.2 (migration UNIQUE).
- Migration via MCP uniquement (Task 4.2).
