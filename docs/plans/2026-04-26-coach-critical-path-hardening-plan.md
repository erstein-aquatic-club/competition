# Coach Critical Path — Hardening (§171) Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Corriger les bugs P0/P1 et frictions UX identifiés par l'audit du 2026-04-26 sur le chemin critique COACH (login → dashboard → builder → assign → comms), pour atteindre **0 bug en prod, ergonomie mobile maximale, et tests anti-régression**.

**Architecture:** Approche TDD stricte (test rouge → fix → vert → commit) sur 3 axes : (1) gardes API et rollbacks observables côté backend wrappers, (2) micro-corrections React (state remount, double-tap, idempotence mutations), (3) UX bottom-sheet (sticky CTA, helpers, Save&Assign muscu). Aucune migration SQL nouvelle — la contrainte `chk_visible_from_before_date` (00088) couvre déjà le serveur. Tests RLS additionnels sur `session_assignments.test.ts` pour verrouiller l'invariant `visible_from <= scheduled_date` et l'isolation cross-coach.

**Tech Stack:** React 19 + TS, Vitest, React Query 5, Supabase (RLS), Tailwind 4, Radix UI, Wouter (hash routing).

**Source d'audit :** session du 2026-04-26 (réponse Claude — voir résumé en tête de §171 dans `docs/implementation-log.md` à créer).

---

## Phase 1 — P0 Critiques (≈ 1 jour)

### Task 1: Garde `groupIds=[]` dans `bulkCreateSlotAssignments`

**Pourquoi :** Si un futur appelant oublie le pré-check côté UI, la fonction retourne `{ created: 0 }` comme un succès silencieux. Aujourd'hui les deux callers (`quickComposeMutation`, `assignFromLibraryMutation`) gardent, mais zéro défense en profondeur.

**Files:**
- Modify: `src/lib/api/assignments.ts:340-426`
- Test: `src/lib/api/__tests__/assignments.test.ts` (créer si absent)

**Step 1: Vérifier l'existence du fichier de test**

Run: `ls src/lib/api/__tests__/assignments.test.ts 2>/dev/null || echo "MISSING"`
Si MISSING : créer un squelette minimal avec `import { describe, it, expect, vi } from "vitest"` et un mock de `supabase`.

**Step 2: Écrire le test rouge**

```typescript
// src/lib/api/__tests__/assignments.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { bulkCreateSlotAssignments } from "../assignments";

vi.mock("../client", () => ({
  canUseSupabase: () => true,
  supabase: { from: vi.fn() }, // not reached in this test
  safeInt: (v: unknown, d: number) => Number(v) || d,
  safeOptionalInt: (v: unknown) => (v == null ? null : Number(v)),
  delay: () => Promise.resolve(),
  fetchUserGroupIds: vi.fn(),
  fetchUserGroupIdsWithContext: vi.fn(),
  STORAGE_KEYS: {},
}));

describe("bulkCreateSlotAssignments — defensive guards", () => {
  it("rejects empty groupIds with explicit error before any DB call", async () => {
    await expect(
      bulkCreateSlotAssignments({
        swimCatalogId: 1,
        trainingSlotId: "slot-1",
        scheduledDate: "2026-04-30",
        groupIds: [],
        scheduledSlot: "morning",
        visibleFrom: null,
        assignedBy: 42,
      }),
    ).rejects.toThrow(/Aucun groupe/);
  });
});
```

**Step 3: Run test — DOIT échouer**

Run: `npm test -- src/lib/api/__tests__/assignments.test.ts -t "rejects empty groupIds"`
Expected: FAIL — `bulkCreateSlotAssignments` insère des rows ou ne throw pas la bonne erreur.

**Step 4: Implémenter la garde**

Edit `src/lib/api/assignments.ts:357` (juste après `if (!canUseSupabase()) throw new Error("Connexion indisponible");`) :

```typescript
if (!params.groupIds.length) {
  throw new Error("Aucun groupe à assigner");
}
```

**Step 5: Run test — DOIT passer**

Run: `npm test -- src/lib/api/__tests__/assignments.test.ts -t "rejects empty groupIds"`
Expected: PASS.

**Step 6: Commit**

```bash
git add src/lib/api/assignments.ts src/lib/api/__tests__/assignments.test.ts
git commit -m "fix(assignments): §171 — garde groupIds vide dans bulkCreateSlotAssignments

Aucun caller ne devrait passer un tableau vide, mais la défense en
profondeur évite un succès silencieux ({ created: 0 }) si une régression
UI s'introduit. Test couvrant le rejet précoce avant tout appel DB."
```

---

### Task 2: Rollback observable dans `quickComposeMutation`

**Pourquoi :** Si `bulkCreateSlotAssignments` échoue après `createSwimSession` réussi, le rollback `deleteSwimSession` est best-effort silencieux. Si lui aussi échoue, le catalogue reste pollué d'une séance auto-nommée orpheline, sans télémetrie.

**Files:**
- Modify: `src/pages/coach/CoachTrainingSlotsScreen.tsx:2169-2253` (`quickComposeMutation`)

**Step 1: Lire le bloc concerné**

Run: `sed -n '2169,2253p' src/pages/coach/CoachTrainingSlotsScreen.tsx`
Repérer le `try { return await api.bulkCreateSlotAssignments(...) } catch (assignErr) { try { await api.deleteSwimSession(sessionId); } catch {} throw assignErr; }`.

**Step 2: Améliorer le catch — logging + toast metadata**

Remplacer le bloc rollback (lignes ~2220-2228) par :

```typescript
try {
  return await api.bulkCreateSlotAssignments({
    swimCatalogId: sessionId,
    trainingSlotId: instance.slot.id,
    scheduledDate: instance.date,
    groupIds,
    scheduledSlot: deriveScheduledSlot(instance.slot.start_time),
    visibleFrom: visibleFrom || instance.date,
    assignedBy: userId,
    targetSubgroupId: subgroupId,
  });
} catch (assignErr) {
  // Best-effort rollback : si l'assignation a échoué, supprimer la séance
  // créée pour éviter de polluer le catalogue avec une séance auto-nommée
  // orpheline.
  let rollbackOk = true;
  try {
    await api.deleteSwimSession(sessionId);
  } catch (rollbackErr) {
    rollbackOk = false;
    console.error(
      "[quickCompose] rollback failed — orphan swim session in catalog",
      { sessionId, rollbackErr, assignErr },
    );
  }
  // Enrichir l'erreur pour le toast onError (l'utilisateur sait pourquoi)
  const baseMsg = assignErr instanceof Error ? assignErr.message : String(assignErr);
  const suffix = rollbackOk
    ? ""
    : " (séance créée mais non assignée — supprimez-la manuellement)";
  throw new Error(baseMsg + suffix);
}
```

**Step 3: Build typecheck**

Run: `npx tsc --noEmit`
Expected: aucune nouvelle erreur dans `CoachTrainingSlotsScreen.tsx`.

**Step 4: Tests existants — confirmer non-régression**

Run: `npm test -- --run`
Expected: 333+/333+ passent.

**Step 5: Commit**

```bash
git add src/pages/coach/CoachTrainingSlotsScreen.tsx
git commit -m "fix(coach): §171 — rollback observable du quickCompose

Si l'assignation échoue après création de la séance, on log explicitement
l'échec du rollback (avec le sessionId orphelin) et on enrichit le toast
d'erreur pour informer le coach qu'une intervention manuelle est requise.
Évite la pollution silencieuse du catalogue."
```

---

### Task 3: Notification orpheline dans `assignments_create`

**Pourquoi :** Si l'insert dans `notifications` réussit mais celui dans `notification_targets` échoue (RLS, FK, network), une notif sans cible reste en DB et `console.warn` only. L'assignment est marqué `assigned` quand même.

**Files:**
- Modify: `src/lib/api/assignments.ts:128-244` (`assignments_create`)
- Test: `src/lib/api/__tests__/assignments.test.ts` (étend Task 1)

**Step 1: Écrire le test rouge**

Ajouter dans `src/lib/api/__tests__/assignments.test.ts` :

```typescript
describe("assignments_create — notification rollback", () => {
  it("deletes orphan notification if notification_targets insert fails", async () => {
    // ... setup mock supabase.from("notifications").insert → ok
    // ... setup mock supabase.from("notification_targets").insert → error
    // ... setup mock supabase.from("notifications").delete().eq("id", X) — assert called
    // (laissé en stub pour exécution effective ; la complexité du mock chain
    //  peut justifier de tester via integration RLS dans Phase 5).
  });
});
```

**Note :** Si le mock chain Supabase est trop pénible, **migrer ce test vers `supabase/tests/rls/notification_targets.test.ts`** (déjà existant) en simulant l'échec via une RLS bloquante. Décider à l'étape suivante.

**Step 2: Implémenter la garde**

Modifier `src/lib/api/assignments.ts:181-189` :

```typescript
if (notifError) {
  console.warn('[assignments] Notification creation failed:', notifError.message);
} else if (notif) {
  const targetPayload: Record<string, unknown> = { notification_id: notif.id };
  if (data.target_user_id) targetPayload.target_user_id = data.target_user_id;
  if (data.target_group_id) targetPayload.target_group_id = data.target_group_id;
  const { error: targetError } = await supabase
    .from("notification_targets")
    .insert(targetPayload);
  if (targetError) {
    // Rollback : supprimer la notification orpheline
    await supabase.from("notifications").delete().eq("id", notif.id);
    console.warn(
      '[assignments] Notification rolled back (target insert failed):',
      targetError.message,
    );
  }
  // Push delivery handled by pg_net trigger (00044) — only triggers if target row exists
}
```

**Step 3: Build & tests**

Run: `npx tsc --noEmit && npm test -- --run`
Expected: pas de régression sur les 333 tests.

**Step 4: Commit**

```bash
git add src/lib/api/assignments.ts src/lib/api/__tests__/assignments.test.ts
git commit -m "fix(assignments): §171 — rollback notification orpheline

Si notification_targets.insert échoue après notifications.insert OK, on
supprime la notification orpheline pour éviter une notif visible sans
cible. Cohérent avec le pattern atomique des migrations 00088."
```

---

## Phase 2 — P1 Robustesse (≈ 1 jour)

### Task 4: `markRead` idempotent dans `CoachCommentsScreen`

**Pourquoi :** Le `useEffect([coachUserId, comments])` re-fire le mutation à chaque invalidation (toutes les 2 min via `coach-comments-recent-48h`), envoyant les mêmes `unreadIds` déjà marqués lus → write spam.

**Files:**
- Modify: `src/pages/coach/CoachCommentsScreen.tsx:62-92`
- Test: `src/pages/coach/__tests__/CoachCommentsScreen.test.tsx` (créer)

**Step 1: Test rouge — render + invalidate doit faire 1 seul markRead call**

```tsx
// src/pages/coach/__tests__/CoachCommentsScreen.test.tsx
import { describe, it, expect, vi } from "vitest";
import { render, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import CoachCommentsScreen from "../CoachCommentsScreen";

const markCommentsRead = vi.fn().mockResolvedValue({ updated: 0 });
vi.mock("@/lib/api", () => ({
  api: {
    getSwimmerComments: vi.fn().mockResolvedValue([
      { session_id: 1, athlete_id: 10, athlete_name: "Bob", is_read: false, created_at: new Date().toISOString(), session_date: "2026-04-25", comments: "ok", rpe: 3, fatigue: 2, performance: 4, engagement: 4 },
    ]),
    markCommentsRead: (...args: unknown[]) => markCommentsRead(...args),
  },
}));
vi.mock("@/lib/auth", () => ({ useAuth: () => ({ userId: 99 }) }));

it("calls markCommentsRead once even if comments query is re-fetched", async () => {
  const qc = new QueryClient();
  const { rerender } = render(
    <QueryClientProvider client={qc}>
      <CoachCommentsScreen onBack={() => {}} onOpenAthlete={() => {}} />
    </QueryClientProvider>,
  );
  await waitFor(() => expect(markCommentsRead).toHaveBeenCalledTimes(1));
  await qc.invalidateQueries({ queryKey: ["coach-comments"] });
  rerender(
    <QueryClientProvider client={qc}>
      <CoachCommentsScreen onBack={() => {}} onOpenAthlete={() => {}} />
    </QueryClientProvider>,
  );
  // Ne doit PAS être rappelé pour les mêmes IDs
  await new Promise((r) => setTimeout(r, 50));
  expect(markCommentsRead).toHaveBeenCalledTimes(1);
});
```

**Step 2: Run — DOIT échouer (markRead appelé 2× ou plus)**

Run: `npm test -- CoachCommentsScreen.test.tsx`
Expected: FAIL.

**Step 3: Implémenter — `useRef<Set<number>>` qui dédupe**

Modifier `src/pages/coach/CoachCommentsScreen.tsx:83-92` :

```tsx
const markedIdsRef = useRef<Set<number>>(new Set());

useEffect(() => {
  if (!coachUserId || comments.length === 0) return;
  const newUnreadIds = comments
    .filter((c) => !c.is_read && !markedIdsRef.current.has(c.session_id))
    .map((c) => c.session_id);
  if (newUnreadIds.length === 0) return;
  newUnreadIds.forEach((id) => markedIdsRef.current.add(id));
  markReadMutation.mutate(newUnreadIds);
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [coachUserId, comments]);
```

Ne pas oublier `import { useEffect, useRef, useState } from "react";`.

**Step 4: Run — DOIT passer**

Run: `npm test -- CoachCommentsScreen.test.tsx`
Expected: PASS.

**Step 5: Commit**

```bash
git add src/pages/coach/CoachCommentsScreen.tsx src/pages/coach/__tests__/CoachCommentsScreen.test.tsx
git commit -m "fix(comments): §171 — markRead idempotent

Garde locale via useRef<Set<number>> pour ne plus relancer markCommentsRead
sur des IDs déjà traités lors d'une invalidation de query. Évite le write
spam (toutes les 2 min via coach-comments-recent-48h)."
```

---

### Task 5: Garde double-tap sur `Créer & assigner` (QuickCompose)

**Pourquoi :** `disabled={!canSubmitText}` repose sur le state React `submitting` qui ne flippe qu'au prochain render. Sur iOS fast-tap, deux mutations peuvent partir → 2 séances créées.

**Files:**
- Modify: `src/pages/coach/SlotSessionSheet.tsx:810-848` (`handleTextSubmit`, `handleLibrarySelect`)

**Step 1: Lire la zone**

Run: `sed -n '700,720p' src/pages/coach/SlotSessionSheet.tsx`

**Step 2: Ajouter un `useRef<boolean>` synchrone**

Insérer juste après `const [submitting, setSubmitting] = useState(false);` (~ligne 708) :

```tsx
const submittingRef = useRef(false);
```

Modifier `handleTextSubmit` (~ligne 810) :

```tsx
const handleTextSubmit = async () => {
  if (!canSubmitText || submittingRef.current) return;
  submittingRef.current = true;
  setSubmitting(true);
  try {
    await onQuickCompose(instance, parsedBlocks, selectedGroups, selectedSubgroupId, visibleFrom);
  } catch {
    // Parent shows the error toast.
  } finally {
    submittingRef.current = false;
    setSubmitting(false);
  }
};
```

Idem pour `handleLibrarySelect` (~ligne 829).

**Step 3: Build typecheck**

Run: `npx tsc --noEmit`
Expected: clean.

**Step 4: Test manuel mobile (à documenter dans `docs/implementation-log.md`)**

> Sur iPhone SE 375px, ouvrir un créneau vide, coller un texte court, taper rapidement (double-tap < 100ms) sur "Créer & assigner". Attendu : 1 seule séance créée. Avant fix : 2 séances visibles dans le catalogue.

**Step 5: Commit**

```bash
git add src/pages/coach/SlotSessionSheet.tsx
git commit -m "fix(slot-sheet): §171 — garde double-tap synchrone

useRef<boolean> bloque immédiatement la 2e invocation pendant la frame de
render React (avant que setSubmitting → true ne désactive le bouton).
Évite la création de 2 séances sur iOS fast-tap."
```

---

### Task 6: Garde dossier supprimé dans `handleMoveToFolder` (SwimCatalog)

**Pourquoi :** Si un autre coach supprime le dossier en parallèle, l'update silencieux met `folder` à un chemin orphelin → la séance "disparaît" jusqu'au prochain re-fetch.

**Files:**
- Modify: `src/pages/coach/SwimCatalog.tsx:564-567`

**Step 1: Modifier la fonction**

```tsx
const handleMoveToFolder = (folder: string | null) => {
  if (!pendingMoveSession) return;
  if (folder !== null && !allFolders.includes(folder)) {
    toast({
      title: "Dossier introuvable",
      description: "Ce dossier a été supprimé entre-temps. Rafraîchissez la page.",
      variant: "destructive",
    });
    setPendingMoveSession(null);
    return;
  }
  moveMutation.mutate({ sessionId: pendingMoveSession.id, folder });
};
```

**Step 2: Build**

Run: `npx tsc --noEmit`
Expected: clean.

**Step 3: Commit**

```bash
git add src/pages/coach/SwimCatalog.tsx
git commit -m "fix(swim-catalog): §171 — garde dossier supprimé dans handleMoveToFolder

Vérifie que le dossier cible existe encore dans allFolders avant de lancer
la mutation, sinon toast destructif. Évite la séance qui 'disparaît' dans
un dossier orphelin lors d'une suppression concurrente."
```

---

### Task 7: Validation client `visible_from` dans `assignments_create`

**Pourquoi :** Le check existe en DB (`chk_visible_from_before_date` migration 00088) mais aucun garde JS — le coach voit un message PostgreSQL brut.

**Files:**
- Modify: `src/lib/api/assignments.ts:128-244`
- Test: `src/lib/api/__tests__/assignments.test.ts`

**Step 1: Test rouge**

```typescript
it("rejects visible_from > scheduled_date with friendly message", async () => {
  await expect(
    assignments_create({
      assignment_type: "swim",
      session_id: 1,
      target_group_id: 1,
      scheduled_date: "2026-04-30",
      // @ts-expect-error — visible_from n'est pas dans la signature actuelle, on l'ajoute
      visible_from: "2026-05-15",
    }, 99),
  ).rejects.toThrow(/visible.*postérieure|date|visibilité/i);
});
```

> **Note :** `visible_from` n'apparaît pas dans la signature actuelle de `assignments_create` (ligne 128). Ce wrapper est legacy ; `bulkCreateSlotAssignments` est le chemin actuel. **Si la signature ne propage pas `visible_from`, ce test devient un no-op** — préférer alors étendre le check à `bulkCreateSlotAssignments` (ligne 357) où `params.visibleFrom` est typé. Décision à l'exécution.

**Step 2: Implémenter dans `bulkCreateSlotAssignments` (chemin actif)**

Ajouter après la garde `groupIds` (Task 1) :

```typescript
if (
  params.visibleFrom &&
  params.scheduledDate &&
  params.visibleFrom > params.scheduledDate
) {
  throw new Error(
    "La date de visibilité ne peut pas être postérieure au jour du créneau",
  );
}
```

**Step 3: Run tests**

Run: `npm test -- src/lib/api/__tests__/assignments.test.ts`
Expected: PASS.

**Step 4: Commit**

```bash
git add src/lib/api/assignments.ts src/lib/api/__tests__/assignments.test.ts
git commit -m "fix(assignments): §171 — validation client visible_from <= scheduled_date

Garde JS en miroir de la contrainte CHECK chk_visible_from_before_date
(migration 00088). Toast lisible côté coach plutôt qu'un message
PostgreSQL brut."
```

---

### Task 8: Sheet remount via `key` (SlotSessionSheet)

**Pourquoi :** State leak entre instances : si l'utilisateur tape rapidement sur 2 créneaux, `selectedGroups` peut partir cross-instance avant que le `useEffect([instance])` ne reset.

**Files:**
- Modify: `src/pages/coach/CoachTrainingSlotsScreen.tsx` (callsite de `<SlotSessionSheet>`, ligne ~3135-3145)

**Step 1: Localiser le callsite**

Run: `grep -n "SlotSessionSheet" src/pages/coach/CoachTrainingSlotsScreen.tsx | head -5`

**Step 2: Ajouter une `key` distinctive**

```tsx
<SlotSessionSheet
  key={selectedInstance ? `${selectedInstance.slot.id}-${selectedInstance.date}` : "none"}
  instance={selectedInstance}
  ...
/>
```

**Step 3: Build typecheck**

Run: `npx tsc --noEmit`
Expected: clean.

**Step 4: Commit**

```bash
git add src/pages/coach/CoachTrainingSlotsScreen.tsx
git commit -m "fix(slot-sheet): §171 — remount par key sur changement d'instance

Force un remount de SlotSessionSheet à chaque changement de slot+date pour
éviter les fuites de state (selectedGroups, visibleFrom, etc.) entre
instances quand le coach tape rapidement plusieurs créneaux."
```

---

### Task 9: Dialog "split distance" dans le parser texte

**Pourquoi :** Le warning `split_distance` est informatif mais pas bloquant — le coach peut envoyer une séance avec 30% de distance perdue sans s'en rendre compte.

**Files:**
- Modify: `src/components/coach/swim/SwimSessionBuilder.tsx:364-385` (bouton "Convertir en séance")
- Modify: `src/pages/coach/SlotSessionSheet.tsx:1062-1078` (bouton "Créer & assigner")

**Step 1: Dans SwimSessionBuilder, intercepter avant `onSessionChange`**

Ajouter avant `onSessionChange({ ...session, blocks, description: rawText })` :

```tsx
const splitWarnings = textWarnings.filter((w) => w.type === "split_distance");
if (splitWarnings.length > 0) {
  const proceed = window.confirm(
    `${splitWarnings.length} ligne(s) avec distance partielle (ex: "10 EZ" perdu après le /). Convertir quand même ?`,
  );
  if (!proceed) return;
}
```

**Step 2: Dans SlotSessionSheet QuickCompose, idem juste avant `onQuickCompose`**

```tsx
const splitWarnings = textWarnings.filter((w) => w.type === "split_distance");
if (splitWarnings.length > 0) {
  const proceed = window.confirm(
    `${splitWarnings.length} distance(s) partielle(s) détectée(s). Assigner quand même ?`,
  );
  if (!proceed) return;
}
```

**Step 3: Build & test**

Run: `npx tsc --noEmit && npm test -- --run`
Expected: clean + 333+ pass.

**Step 4: Commit**

```bash
git add src/components/coach/swim/SwimSessionBuilder.tsx src/pages/coach/SlotSessionSheet.tsx
git commit -m "fix(swim-parser): §171 — confirmation bloquante sur split_distance

Le warning split_distance était informatif mais pas bloquant : le coach
pouvait envoyer une séance avec 30% de distance perdue. Confirm() ajoute
un palier conscient avant la conversion / l'assignation."
```

> **Note design :** `window.confirm` est OK pour ce palier rare (mauvais format texte). Si l'usage devient fréquent, migrer vers un AlertDialog avec aperçu des lignes concernées (Task 9-bis non-prioritaire).

---

## Phase 3 — UX critique (≈ 1 jour)

### Task 10: Sticky CTA QuickCompose

**Files:**
- Modify: `src/pages/coach/SlotSessionSheet.tsx:849-1085` (`<div className="space-y-5">` racine de QuickComposeBody → wrapper + footer)

**Step 1: Restructurer en flex column avec footer sticky**

Remplacer la structure :

```tsx
return (
  <div className="space-y-5">
    {/* Groupes / sous-groupes / visible_from / tabs / textarea / stats / Voir blocs */}
    ...
    <button onClick={handleTextSubmit}>Créer & assigner</button>
  </div>
);
```

par :

```tsx
return (
  <div className="flex max-h-[calc(90dvh-9rem)] flex-col">
    <div className="flex-1 space-y-5 overflow-y-auto pb-4">
      {/* Groupes / sous-groupes / visible_from / tabs / textarea / stats / Voir blocs */}
      ...
    </div>
    <div className="sticky bottom-0 -mx-5 border-t border-border/50 bg-background/95 px-5 py-3 backdrop-blur-sm">
      <button onClick={handleTextSubmit}>Créer & assigner</button>
    </div>
  </div>
);
```

**Step 2: Test manuel**

> Ouvrir QuickCompose sur iPhone SE 375px, scroller la textarea : le bouton CTA reste visible en bas.

**Step 3: Commit**

```bash
git add src/pages/coach/SlotSessionSheet.tsx
git commit -m "feat(slot-sheet): §171 — sticky CTA Créer & assigner

Le bouton submit reste visible en footer pendant le scroll de la sheet,
évitant 4-5 scrolls sur iPhone SE pour atteindre l'action principale."
```

---

### Task 11: Helper text `visible_from`

**Files:**
- Modify: `src/pages/coach/SlotSessionSheet.tsx:912-936` (QuickCompose) + `:1352-1376` (FilledBody)

**Step 1: Ajouter un `<p>` helper sous le label**

Dans QuickCompose (~ligne 920), juste après le `<Label>` :

```tsx
<p className="text-[11px] text-muted-foreground -mt-1 mb-1.5">
  Laissez sur aujourd'hui pour publier immédiatement. Sinon, les nageurs
  verront la séance à partir de cette date.
</p>
```

Idem dans FilledBody (~ligne 1357).

**Step 2: Commit**

```bash
git add src/pages/coach/SlotSessionSheet.tsx
git commit -m "ux(slot-sheet): §171 — helper text visible_from

Petit message pour clarifier que laisser la date du jour publie
immédiatement, et qu'une date future sert à programmer la publication."
```

---

### Task 12: Bouton "Save & Assign" StrengthSessionBuilder

**Pourquoi :** Créer une séance muscu pour 1 nageur impose 5+ taps. Friction documentée dans l'audit.

**Files:**
- Modify: `src/components/coach/strength/StrengthSessionBuilder.tsx:83-281`
- Modify: `src/components/coach/shared/FormActions.tsx` (probablement étendre les props)

**Step 1: Inspecter FormActions**

Run: `cat src/components/coach/shared/FormActions.tsx`
Repérer les props existantes (`onSave`, `onCancel`, `onPreview`) et étendre avec `onSaveAndAssign?: () => void`.

**Step 2: Côté StrengthSessionBuilder, ajouter une prop optionnelle**

```tsx
interface StrengthSessionBuilderProps {
  // ... existing
  onSaveAndAssign?: () => void;
}

<FormActions
  // ... existing
  onSaveAndAssign={onSaveAndAssign}
/>
```

**Step 3: Côté FormActions, rendre le bouton secondaire**

```tsx
{onSaveAndAssign && (
  <button
    type="button"
    onClick={onSaveAndAssign}
    disabled={isSaving}
    className="inline-flex items-center gap-1.5 rounded-full border border-primary/40 bg-primary/10 px-3 py-1.5 text-xs font-semibold text-primary hover:bg-primary/15"
  >
    <Send className="h-3.5 w-3.5" />
    Enreg. & assigner
  </button>
)}
```

**Step 4: Brancher dans StrengthCatalog (callsite)**

Dans `src/pages/coach/StrengthCatalog.tsx:1064-1088`, ajouter un handler qui ouvre un dialog `<AthletePicker>` simple et appelle `assignments_create({ session_type: "strength", session_id, target_user_id })` après save.

> **Détail :** créer un nouveau composant léger `<AthletePickerDialog>` ou réutiliser celui de `CopyToAthleteDialog` (déjà importé via `lazyWithRetry`).

**Step 5: Test manuel**

> Coach → Planif Muscu → Nouvelle → builder → "Enreg. & assigner" → picker athlète → confirm → toast "Séance enregistrée et assignée à {Nom}".

**Step 6: Commit**

```bash
git add src/components/coach/strength/StrengthSessionBuilder.tsx src/components/coach/shared/FormActions.tsx src/pages/coach/StrengthCatalog.tsx
git commit -m "feat(strength-builder): §171 — bouton Enreg. & assigner

Réduit le chemin 'créer séance muscu pour 1 nageur' de 5+ taps à 3 taps.
Dialog AthletePicker réutilise CopyToAthleteDialog pour la cohérence."
```

---

## Phase 4 — Tests RLS additionnels (≈ 0,5 jour)

### Task 13: 4 tests RLS dans `session_assignments.test.ts`

**Pré-requis :** Docker démarré + `supabase start` (cf. CLAUDE.md § Tests RLS). **Demander confirmation utilisateur avant `docker ps`.**

**Files:**
- Modify: `supabase/tests/rls/session_assignments.test.ts`

**Step 1: Demander à l'utilisateur de démarrer Docker**

> "Le test RLS nécessite Docker. Peux-tu lancer Docker Desktop manuellement et me dire quand c'est prêt ?"

Une fois confirmé : `docker ps` (1× pour vérifier).

**Step 2: Si containers down, lancer**

Run: `supabase start` (si pas déjà up).

**Step 3: Ajouter les tests**

```typescript
// supabase/tests/rls/session_assignments.test.ts
it("rejects insert with target_group_id not owned by coach (RLS)", async () => {
  // Carol = coach owning group A. Bob's group B is not Carol's.
  const carolClient = await loginAsCoach("carol");
  const { error } = await carolClient
    .from("session_assignments")
    .insert({
      assignment_type: "swim",
      swim_catalog_id: 1,
      target_group_id: BOB_GROUP_ID,
      scheduled_date: "2026-05-01",
      assigned_by: CAROL_USER_ID,
      status: "assigned",
    });
  expect(error).not.toBeNull();
  expect(error!.message).toMatch(/policy|permission|denied/i);
});

it("CHECK chk_visible_from_before_date rejects visible_from > scheduled_date", async () => {
  const carolClient = await loginAsCoach("carol");
  const { error } = await carolClient
    .from("session_assignments")
    .insert({
      assignment_type: "swim",
      swim_catalog_id: CAROL_SESSION_ID,
      target_group_id: CAROL_GROUP_ID,
      scheduled_date: "2026-05-01",
      visible_from: "2026-05-15", // > scheduled_date
      assigned_by: CAROL_USER_ID,
      status: "assigned",
    });
  expect(error).not.toBeNull();
  expect(error!.message).toMatch(/chk_visible_from|check constraint/i);
});

it("athlete cannot SELECT assignment where visible_from > today", async () => {
  // Setup : insert assignment with visible_from = tomorrow as Carol
  const carolClient = await loginAsCoach("carol");
  await carolClient.from("session_assignments").insert({
    assignment_type: "swim",
    swim_catalog_id: CAROL_SESSION_ID,
    target_group_id: BOB_GROUP_ID, // Bob is in this group
    scheduled_date: "2026-05-30",
    visible_from: TOMORROW_ISO,
    assigned_by: CAROL_USER_ID,
    status: "assigned",
  });
  const bobClient = await loginAsAthlete("bob");
  const { data } = await bobClient
    .from("session_assignments")
    .select("id")
    .eq("scheduled_date", "2026-05-30");
  expect(data ?? []).toHaveLength(0);
});

it("idx_sa_unique_slot_group_v2 blocks duplicate group assignment on same slot+date", async () => {
  const carolClient = await loginAsCoach("carol");
  await carolClient.from("session_assignments").insert({
    assignment_type: "swim",
    swim_catalog_id: CAROL_SESSION_ID,
    training_slot_id: SLOT_ID,
    target_group_id: CAROL_GROUP_ID,
    scheduled_date: "2026-06-01",
    assigned_by: CAROL_USER_ID,
    status: "assigned",
  });
  const { error } = await carolClient.from("session_assignments").insert({
    assignment_type: "swim",
    swim_catalog_id: CAROL_SESSION_ID_2,
    training_slot_id: SLOT_ID,
    target_group_id: CAROL_GROUP_ID,
    scheduled_date: "2026-06-01",
    assigned_by: CAROL_USER_ID,
    status: "assigned",
  });
  expect(error?.code).toBe("23505");
});
```

> **Note :** adapter les noms de helpers (`loginAsCoach`, `loginAsAthlete`) au harness existant — voir `supabase/tests/rls/_helpers.ts`.

**Step 4: Run tests RLS**

Run: `npm run test:rls`
Expected: 4 nouveaux tests PASS.

**Step 5: Commit**

```bash
git add supabase/tests/rls/session_assignments.test.ts
git commit -m "test(rls): §171 — couverture session_assignments coach/athlete invariants

4 tests RLS additionnels :
- reject insert avec target_group_id non possédé (cross-coach)
- reject CHECK chk_visible_from_before_date (visible_from > scheduled_date)
- athlete ne SELECT pas un assignment avec visible_from > today
- unique index idx_sa_unique_slot_group_v2 bloque les doublons"
```

---

## Phase 5 — P2 cosmétiques (≈ 0,5 jour)

### Task 14: `window.prompt` → Dialog dans StrengthCatalog (créer dossier)

**Files:**
- Modify: `src/pages/coach/StrengthCatalog.tsx:1230-1240` (header "Dossier" button)

**Step 1: Ajouter un state + Dialog comme dans SwimCatalog**

```tsx
const [showCreateFolder, setShowCreateFolder] = useState(false);
const [newFolderName, setNewFolderName] = useState("");

// Remplacer le onClick:
onClick={() => setShowCreateFolder(true)}

// Dialog en bas du return:
<Dialog open={showCreateFolder} onOpenChange={setShowCreateFolder}>
  <DialogContent>
    <DialogHeader>
      <DialogTitle>Nouveau dossier</DialogTitle>
    </DialogHeader>
    <Input
      placeholder="Nom du dossier"
      value={newFolderName}
      onChange={(e) => setNewFolderName(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter" && newFolderName.trim()) {
          createFolder.mutate({
            name: newFolderName.trim(),
            type: catalogTab === "sessions" ? "session" : "exercise",
          });
          setShowCreateFolder(false);
          setNewFolderName("");
        }
      }}
      autoFocus
    />
    <div className="flex justify-end gap-2">
      <Button variant="outline" onClick={() => setShowCreateFolder(false)}>Annuler</Button>
      <Button
        onClick={() => {
          createFolder.mutate({
            name: newFolderName.trim(),
            type: catalogTab === "sessions" ? "session" : "exercise",
          });
          setShowCreateFolder(false);
          setNewFolderName("");
        }}
        disabled={!newFolderName.trim()}
      >
        Créer
      </Button>
    </div>
  </DialogContent>
</Dialog>
```

**Step 2: Idem pour FolderDropdown.onRename (ligne 318)** — remplacer `window.prompt` par un AlertDialog ou un mini-popup avec Input.

**Step 3: Commit**

```bash
git add src/pages/coach/StrengthCatalog.tsx
git commit -m "ux(strength-catalog): §171 — Dialog au lieu de window.prompt

Pour create/rename de dossier. Cohérent avec SwimCatalog (§163), focus
auto, validation visuelle, intégré au design system Radix."
```

---

### Task 15: Reset warmup fields au toggle (StrengthCatalog)

**Files:**
- Modify: `src/pages/coach/StrengthCatalog.tsx:836-841` (et le miroir create ligne ~948)

**Step 1: Étendre les onCheckedChange**

```tsx
onCheckedChange={(checked) => {
  const isWarmup = checked === true;
  setEditingExercise({
    ...editingExercise,
    exercise_type: isWarmup ? "warmup" : "strength",
    // Reset fields irrelevant au type cible
    ...(isWarmup
      ? {} // garde pct_1rm/series/reps si user veut revenir
      : { warmup_reps: null, warmup_duration: null }),
  });
}}
```

**Step 2: Commit**

```bash
git add src/pages/coach/StrengthCatalog.tsx
git commit -m "fix(strength-catalog): §171 — reset warmup fields au toggle

warmup_reps/warmup_duration sont nullifiés quand l'exercice passe en
'strength' pour éviter des champs orphelins persistés en DB."
```

---

### Task 16: Renommer `DragDropList` en `OrderedList`

**Pourquoi :** Le nom est trompeur (3 boutons, pas de DnD réel).

**Files:**
- Rename: `src/components/coach/shared/DragDropList.tsx` → `OrderedList.tsx`
- Modify: callsites (grep)

**Step 1: Localiser les callsites**

Run: `grep -rn "DragDropList" src --include="*.tsx" --include="*.ts"`

**Step 2: Rename + replace**

Run:
```bash
git mv src/components/coach/shared/DragDropList.tsx src/components/coach/shared/OrderedList.tsx
sed -i '' 's/DragDropList/OrderedList/g' $(grep -rln "DragDropList" src/)
```

**Step 3: Build**

Run: `npx tsc --noEmit && npm test -- --run`
Expected: clean.

**Step 4: Commit**

```bash
git add -A
git commit -m "refactor(coach): §171 — DragDropList → OrderedList

Le composant n'implémente pas de drag&drop réel (juste 3 boutons up/down/
delete). Renommer pour refléter la réalité et éviter une confusion future
si on veut ajouter un vrai DnD."
```

---

## Phase 6 — Documentation (CLAUDE.md workflow obligatoire)

### Task 17: Mettre à jour la doc de suivi

**Files:**
- Modify: `docs/implementation-log.md` (ajouter §171)
- Modify: `docs/ROADMAP.md` (ligne §171 + "Dernière mise à jour")
- Modify: `docs/FEATURES_STATUS.md` (mettre à jour les features touchées)
- Modify: `CLAUDE.md` (mettre à jour "Dernière entrée en date : §171")
- Modify: `docs/claude/files-map.md` si nouveau fichier ≥ 150 LOC créé (ex: AthletePickerDialog en Task 12)

**Step 1: Rédiger l'entrée §171 dans `docs/implementation-log.md`**

Suivre le pattern des entrées existantes : contexte, changements, fichiers modifiés, tests, décisions, limites. Référencer ce plan.

**Step 2: Ajouter dans `docs/ROADMAP.md`**

Sous "Chantiers livrés" :

```markdown
- §171 — Audit robustesse chemin critique COACH (P0/P1/P2 + tests RLS) — Fait
```

Et mettre à jour la ligne `*Dernière mise à jour : 2026-04-26 — §171*` en tête.

**Step 3: Mettre à jour `CLAUDE.md`**

Remplacer "Dernière entrée en date : §170" par "Dernière entrée en date : §171 (Audit robustesse chemin critique COACH : ...)".

**Step 4: Si AthletePickerDialog créé (Task 12), ajouter dans `files-map.md`**

```markdown
| `src/components/coach/strength/AthletePickerDialog.tsx` | Picker simple pour Save & Assign muscu | XX LOC |
```

(Mesurer la taille via `wc -l` à l'instant.)

**Step 5: Commit final**

```bash
git add docs/ CLAUDE.md
git commit -m "docs: §171 — log audit robustesse chemin critique COACH

Tracé complet des P0/P1/P2 + 4 tests RLS additionnels + UX critiques.
Cf. docs/plans/2026-04-26-coach-critical-path-hardening-plan.md."
```

---

## Récapitulatif des commits attendus

| # | Phase | Commit |
|---|---|---|
| 1 | P0 | fix(assignments): garde groupIds vide |
| 2 | P0 | fix(coach): rollback observable quickCompose |
| 3 | P0 | fix(assignments): rollback notification orpheline |
| 4 | P1 | fix(comments): markRead idempotent |
| 5 | P1 | fix(slot-sheet): garde double-tap synchrone |
| 6 | P1 | fix(swim-catalog): garde dossier supprimé |
| 7 | P1 | fix(assignments): validation client visible_from |
| 8 | P1 | fix(slot-sheet): remount par key |
| 9 | P1 | fix(swim-parser): confirmation split_distance |
| 10 | UX | feat(slot-sheet): sticky CTA |
| 11 | UX | ux(slot-sheet): helper text visible_from |
| 12 | UX | feat(strength-builder): Enreg. & assigner |
| 13 | RLS | test(rls): 4 tests session_assignments |
| 14 | P2 | ux(strength-catalog): Dialog au lieu de prompt |
| 15 | P2 | fix(strength-catalog): reset warmup fields |
| 16 | P2 | refactor(coach): DragDropList → OrderedList |
| 17 | Doc | docs: §171 — log audit |

**Total : 17 commits**, ~4 jours d'effort, 0 migration SQL nouvelle.

---

## Critères de complétion

- [ ] Tous les tests Vitest passent (333 + 4 nouveaux ≥ 337)
- [ ] `npm run test:rls` passe (incluant les 4 nouveaux RLS)
- [ ] `npx tsc --noEmit` clean
- [ ] Build production clean (`npm run build`)
- [ ] Test manuel iPhone SE 375px sur les 3 chemins critiques (créer/assign/comments)
- [ ] `docs/implementation-log.md` contient §171 complet
- [ ] `CLAUDE.md` à jour ("Dernière entrée en date : §171")
- [ ] PR ou push sur `main` (selon habitude utilisateur)

---

## Notes finales

- **Pas de migration SQL nouvelle** : la contrainte CHECK `chk_visible_from_before_date` (00088) et l'index unique `idx_sa_unique_slot_group_v2` (00130) sont déjà en place.
- **`npm run test:rls`** uniquement à la Phase 4. Les autres phases ne touchent ni à RLS ni aux helpers auth → pas besoin de Docker.
- **Frequent commits** : chaque task = 1 commit atomique pour faciliter le revert si une régression apparaît.
- **TDD strict** sur les Phases 1-2 (tests rouges d'abord). Phases 3-5 sont plus visuelles → tests manuels documentés.
- Si l'exécution révèle un blocage non anticipé (ex: mock Supabase trop pénible Task 3), basculer sur un test RLS d'intégration en Phase 4.
