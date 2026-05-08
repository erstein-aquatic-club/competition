# §216 Dashboard Split Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Casser `src/pages/Dashboard.tsx` (1114 LOC) en orchestrateur fin (~250 LOC) + `<DashboardCalendar>` (memo) + `<DashboardFeedbackContainer>` (memo) pour stopper les re-renders du calendrier pendant la saisie d'un feedback.

**Architecture:**
- `<DashboardCalendar>` = wrapper React.memo de `CalendarHeader` + `CalendarGrid`. Reçoit uniquement les props lecture-seule du calendrier. Ne re-render plus quand `saveState`/`draftState`/`alternativeOverride` changent.
- `<DashboardFeedbackContainer>` = host de tout l'état write : `saveState`, `alternativeOverride`, `draftState` (via `useFeedbackDraft` déplacé dedans), 5 mutations, et tous les handlers de save/absence/override.
- `Dashboard.tsx` reste l'orchestrateur : queries, `useDashboardState`, navigation, banners, settings dialog inline.

**Tech Stack:** React 19 + TypeScript 5 + Vite 7 + React Query 5 + Wouter (déjà en place).

---

## Pré-requis

État `git status` propre, branche `main`. Les §214 (quick wins) sont déjà mergés et pushés.

Lire avant de coder :
- `src/pages/Dashboard.tsx` (1114 LOC actuel)
- `src/hooks/useDashboardState.ts` (262 LOC, **ne pas re-fusionner** — l'audit l'a noté comme exemplaire)
- `src/hooks/dashboard/useFeedbackDraft.ts` (sera appelé depuis le container au lieu du hook parent)
- `src/components/dashboard/FeedbackDrawer.tsx` (API publique préservée — c'est juste son host qui change)
- `docs/plans/2026-05-08-dashboard-split-design.md` (design validé)

---

## Task 1 : Sortir `useFeedbackDraft` de `useDashboardState`

**Files:**
- Modify: `src/hooks/useDashboardState.ts:181-187,230,256`

**Pourquoi:** Tant que `useFeedbackDraft` est appelé dans `useDashboardState`, chaque keystroke → `setDraftState` → re-render Dashboard. On extrait l'appel pour que le container l'invoque directement.

**Step 1: Retirer l'appel à useFeedbackDraft du hook parent**

Edit `src/hooks/useDashboardState.ts` :

Supprimer le bloc lignes 181-187 :
```ts
const { draftState, setDraftState } = useFeedbackDraft({
  activeSessionId,
  sessionsForSelectedDay,
  otherGroupSessions,
  assignments,
  getLogForSession,
});
```

Retirer `draftState,` du return (ligne 230).
Retirer `setDraftState,` du return (ligne 256).
Retirer l'import de `useFeedbackDraft` en haut du fichier s'il n'est plus utilisé (`grep useFeedbackDraft` après pour vérifier).

**Step 2: Vérifier que TypeScript râle dans Dashboard.tsx**

Run: `npx tsc --noEmit 2>&1 | grep -E "draftState|setDraftState"`
Expected: 2-4 erreurs `Property 'draftState' does not exist` dans `Dashboard.tsx`. C'est attendu — résolu en Task 4.

**Step 3: Pas de commit ici** — laisser TS rouge en attendant la fin de Task 4. Le commit unique en fin de chantier évite des étapes broken.

---

## Task 2 : Créer `<DashboardCalendar>` (memo)

**Files:**
- Create: `src/components/dashboard/DashboardCalendar.tsx`

**Step 1: Écrire le composant**

```tsx
import React from "react";
import { CalendarHeader } from "./CalendarHeader";
import { CalendarGrid } from "./CalendarGrid";

interface DashboardCalendarProps {
  monthCursor: Date;
  selectedDayStatus: { completed: number; total: number };
  onPrevMonth: () => void;
  onNextMonth: () => void;
  onJumpToday: () => void;
  gridDates: Date[];
  completionByISO: Record<string, { completed: number; total: number; slots: Array<{ slotKey: "AM" | "PM"; expected: boolean; completed: boolean; absent: boolean; slotTime?: string }> }>;
  strengthByISO?: Record<string, boolean>;
  competitionDates?: Set<string>;
  absenceDates?: Set<string>;
  selectedISO: string;
  selectedDayIndex: number | null;
  today: Date;
  onDayClick: (iso: string) => void;
  onKeyDown: (e: React.KeyboardEvent, index: number) => void;
}

/**
 * Wrapper React.memo de CalendarHeader + CalendarGrid.
 * Isole le calendrier des re-renders déclenchés par l'état d'écriture
 * (saveState, draftState, alternativeOverride) qui vit dans
 * DashboardFeedbackContainer (§216).
 */
export const DashboardCalendar = React.memo(function DashboardCalendar({
  monthCursor,
  selectedDayStatus,
  onPrevMonth,
  onNextMonth,
  onJumpToday,
  gridDates,
  completionByISO,
  strengthByISO,
  competitionDates,
  absenceDates,
  selectedISO,
  selectedDayIndex,
  today,
  onDayClick,
  onKeyDown,
}: DashboardCalendarProps) {
  return (
    <div className="mt-3 rounded-3xl border border-border bg-card overflow-hidden">
      <CalendarHeader
        monthCursor={monthCursor}
        selectedDayStatus={selectedDayStatus}
        onPrevMonth={onPrevMonth}
        onNextMonth={onNextMonth}
        onJumpToday={onJumpToday}
      />
      <CalendarGrid
        monthCursor={monthCursor}
        gridDates={gridDates}
        completionByISO={completionByISO}
        strengthByISO={strengthByISO}
        competitionDates={competitionDates}
        absenceDates={absenceDates}
        selectedISO={selectedISO}
        selectedDayIndex={selectedDayIndex}
        today={today}
        onDayClick={onDayClick}
        onKeyDown={onKeyDown}
      />
    </div>
  );
});
```

**Step 2: typecheck**

Run: `npx tsc --noEmit 2>&1 | grep DashboardCalendar`
Expected: aucune erreur (le composant n'est pas encore consommé).

---

## Task 3 : Créer `<DashboardFeedbackContainer>` (memo)

**Files:**
- Create: `src/components/dashboard/DashboardFeedbackContainer.tsx`

**Pourquoi:** ce composant héberge tout l'état d'écriture. `React.memo` empêche la re-render dès que les props (qui sont stables ou changent rarement) ne bougent pas.

**Step 1: Écrire le composant**

Le composant fait ~350 LOC. Voici les responsabilités précises (à coder dans cet ordre dans le fichier) :

**Imports (haut du fichier)** :
```tsx
import React, { useCallback, useState, useTransition } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { supabase } from "@/lib/supabase";
import type { Session, Assignment, PlannedAbsence } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { FeedbackDrawer } from "./FeedbackDrawer";
import { useFeedbackDraft } from "@/hooks/dashboard/useFeedbackDraft";
import type { SaveState } from "@/components/shared/BottomActionBar";
```

**Constantes / helpers locaux** (dupliqués depuis Dashboard.tsx car privés à ce flow) :
```tsx
const INDICATORS = [
  { key: "difficulty" as const },
  { key: "fatigue_end" as const },
  { key: "performance" as const },
  { key: "engagement" as const },
];

function parseSessionId(sessionId: string) {
  const parts = String(sessionId).split("__");
  const rawSlot = parts[1] || "";
  const slotKey = (rawSlot === "AM" || rawSlot === "PM") ? rawSlot : "";
  return { iso: parts[0], slotKey: slotKey as "AM" | "PM" | "", swimmerSlotId: rawSlot.length > 2 ? rawSlot : undefined };
}

function clampToStep(value: number, step: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.round(value / step) * step;
}
```

**Type des props** :
```tsx
interface DashboardFeedbackContainerProps {
  // Drawer state (Dashboard owns)
  drawerOpen: boolean;
  activeSessionId: string | null;
  detailsOpen: boolean;
  setActiveSessionId: (id: string | null) => void;
  setDetailsOpen: (open: boolean | ((v: boolean) => boolean)) => void;
  setDrawerOpen: (open: boolean) => void;
  setAutoCloseArmed: (v: boolean) => void;
  onCloseDay: () => void;
  onOpenSession: (sessionId: string) => void;

  // Data (Dashboard derives from useDashboardState + queries)
  selectedDate: Date;
  selectedISO: string;
  sessionsForSelectedDay: Array<any>; // PlannedSession — réutiliser le type
  otherGroupSessions: Array<any>;
  assignments: Assignment[] | undefined;
  selectedDayStatus: { completed: number; total: number; slots: any[] };
  dayKm: string;
  isPending: boolean;
  logsBySessionId: Map<string, Session>;
  getLogForSession: (sessionId: string) => Session | undefined;
  getSessionStatus: (session: any, date: Date) => any;
  isAbsent: boolean;
  absenceReason: string | null;
  strengthSessionsForSelectedDay: any[]; // ResolvedStrengthSession[]
  onOpenStrengthSession: (slotId: string) => void;

  // User context
  user: string | null;
  userId: number | null;
  authUuid: string | null;

  // From useDashboardState (write-back to attendance state)
  setAttendanceOverrideBySessionId: React.Dispatch<React.SetStateAction<Record<string, "absent" | "present">>>;
  stableDurationMin: number;
}
```

**Composant principal** (squelette) :
```tsx
export const DashboardFeedbackContainer = React.memo(function DashboardFeedbackContainer({
  drawerOpen, activeSessionId, detailsOpen, setActiveSessionId, setDetailsOpen,
  setDrawerOpen, setAutoCloseArmed, onCloseDay, onOpenSession,
  selectedDate, selectedISO, sessionsForSelectedDay, otherGroupSessions,
  assignments, selectedDayStatus, dayKm, isPending, logsBySessionId,
  getLogForSession, getSessionStatus, isAbsent, absenceReason,
  strengthSessionsForSelectedDay, onOpenStrengthSession,
  user, userId, authUuid,
  setAttendanceOverrideBySessionId, stableDurationMin,
}: DashboardFeedbackContainerProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, startTransition] = useTransition();

  // ── State propre au container
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [alternativeOverride, setAlternativeOverride] = useState<{
    sessionId: string; assignmentId: number; title: string; km: number | null;
  } | null>(null);

  const { draftState, setDraftState } = useFeedbackDraft({
    activeSessionId,
    sessionsForSelectedDay,
    otherGroupSessions,
    assignments,
    getLogForSession,
  });

  // ── 5 mutations (copier-coller depuis Dashboard.tsx:246-393)
  const deleteMutation = useMutation({ /* … */ });
  const mutation = useMutation({ /* … */ });
  const updateMutation = useMutation({ /* … */ });
  const absenceMutation = useMutation({ /* … */ });
  const removeAbsenceMutation = useMutation({ /* … */ });

  // ── Handlers (copier-coller + adapter)
  const markAbsent = useCallback(/* … */, [/* … */]);
  const markPresent = useCallback(/* … */, [/* … */]);
  const clearOverride = useCallback(/* … */, [/* … */]);
  const saveFeedback = useCallback(/* … */, [/* … */]);

  return (
    <FeedbackDrawer
      open={drawerOpen}
      // ... toutes les props du FeedbackDrawer (cf. Dashboard.tsx:1041-1109)
    />
  );
});
```

**Détails clés pour le copier-coller des mutations** :

Toutes les mutations sont copiées **mot pour mot** depuis `Dashboard.tsx:246-393`. Adapter uniquement :
- `setSaveState` reste local (déjà ici).
- `setDrawerOpen(false)` etc. dans `onSuccess` → utiliser le setter passé en props (même nom).
- `setAlternativeOverride(null)` → utilise le state local.

**Détails clés pour `saveFeedback`** :

Copier `Dashboard.tsx:613-680` mot pour mot. Le `parseSessionId` et `clampToStep` sont disponibles localement (re-déclarés en début de fichier).

**Détails clés pour `markAbsent`/`markPresent`/`clearOverride`** :

Copier `Dashboard.tsx:555-587` mot pour mot. Le `setAttendanceOverrideBySessionId` vient des props.

**Le JSX FeedbackDrawer** :

Coller `Dashboard.tsx:1041-1109` quasi tel quel. Adapter :
- `selectedDate={selectedDate}` reste props
- `dayKm` reste prop
- `onClose={onCloseDay}` (renommé)
- `onOpenSession={onOpenSession}` (prop)
- `onCloseSession={() => { setActiveSessionId(null); setDetailsOpen(false); }}` (utilise setters props)
- `onToggleDetails={() => setDetailsOpen((v) => !v)}` (utilise setter prop)
- `alternativeOverrideTitle` calculé depuis le state local
- `onSwitchAlternative` set le state local + appelle `onOpenSession`

**Step 2: typecheck**

Run: `npx tsc --noEmit 2>&1 | grep DashboardFeedbackContainer`
Expected: aucune erreur dans le nouveau fichier (les erreurs dans Dashboard.tsx sont attendues, résolues en Task 4).

---

## Task 4 : Re-câbler `Dashboard.tsx`

**Files:**
- Modify: `src/pages/Dashboard.tsx` (réduction massive)

**Pourquoi:** maintenant que les composants extraits existent, on remplace tout l'inline.

**Step 1: Imports**

Ajouter en haut :
```tsx
import { DashboardCalendar } from "@/components/dashboard/DashboardCalendar";
import { DashboardFeedbackContainer } from "@/components/dashboard/DashboardFeedbackContainer";
```

Retirer si plus utilisés :
- `import { CalendarHeader } from "@/components/dashboard/CalendarHeader";`
- `import { CalendarGrid } from "@/components/dashboard/CalendarGrid";`
- `import { FeedbackDrawer } from "@/components/dashboard/FeedbackDrawer";`
- `import { useMutation } from "@tanstack/react-query";` (si plus de mutations dans le fichier — vérifier `useQueryClient` aussi)
- `import { supabase } from "@/lib/supabase";` ne reste utilisé que pour authUuid effect — garder
- `import type { SaveState } …` : retirer
- `import { computeTrainingDaysRemaining }` : reste utilisé
- `import { Session, Competition, PlannedAbsence }` : `Session` peut partir si plus utilisé directement

Faire un `grep` après suppression pour vérifier.

**Step 2: Retirer l'état et les handlers déplacés**

Supprimer dans Dashboard.tsx (par ordre d'apparition) :
- ligne 148 : `const [saveState, setSaveState] = React.useState<SaveState>("idle");` → supprimé
- lignes 150-155 : `const [alternativeOverride, setAlternativeOverride] = …` → supprimé
- lignes 246-265 : `const deleteMutation = useMutation({…});` → supprimé
- lignes 267-307 : `const mutation = useMutation({…});` → supprimé
- lignes 309-349 : `const updateMutation = useMutation({…});` → supprimé
- lignes 351-372 : `const absenceMutation = useMutation({…});` → supprimé
- lignes 374-393 : `const removeAbsenceMutation = useMutation({…});` → supprimé
- lignes 555-587 : `markAbsent`, `markPresent`, `clearOverride` (la `dayOffAll` peut rester si utilisée ailleurs — `grep` confirme : non, elle ne l'est pas → la supprimer aussi de Dashboard.tsx puisqu'elle vivait là pour le drawer mais elle n'apparaît pas dans les props passées au drawer ; vérifier)
- lignes 613-680 : `saveFeedback` → supprimé
- destructuring `draftState` et `setDraftState` du `useDashboardState` — déjà fait en Task 1 (le hook ne les expose plus)

**Step 3: Remplacer les 2 blocs JSX**

Dans le `return` du composant Dashboard (lignes ~870-893) :

```tsx
{/* Calendar */}
<div className="mt-3 rounded-3xl border border-border bg-card overflow-hidden">
  <CalendarHeader … />
  <CalendarGrid … />
</div>
```

→ devient :

```tsx
<DashboardCalendar
  monthCursor={monthCursor}
  selectedDayStatus={selectedDayStatus}
  onPrevMonth={prevMonth}
  onNextMonth={nextMonth}
  onJumpToday={jumpToday}
  gridDates={gridDates}
  completionByISO={completionByISO}
  strengthByISO={strengthByISO}
  competitionDates={competitionDates}
  absenceDates={absenceDates}
  selectedISO={selectedISO}
  selectedDayIndex={selectedDayIndex}
  today={today}
  onDayClick={openDay}
  onKeyDown={handleCalendarKeyDown}
/>
```

Lignes ~1040-1109 (le `<FeedbackDrawer>` inline) :

```tsx
<FeedbackDrawer ... />
```

→ devient :

```tsx
<DashboardFeedbackContainer
  drawerOpen={drawerOpen}
  activeSessionId={activeSessionId}
  detailsOpen={detailsOpen}
  setActiveSessionId={setActiveSessionId}
  setDetailsOpen={setDetailsOpen}
  setDrawerOpen={setDrawerOpen}
  setAutoCloseArmed={setAutoCloseArmed}
  onCloseDay={closeDay}
  onOpenSession={openSession}
  selectedDate={selectedDate}
  selectedISO={selectedISO}
  sessionsForSelectedDay={sessionsForSelectedDay}
  otherGroupSessions={otherGroupSessions}
  assignments={assignments}
  selectedDayStatus={selectedDayStatus}
  dayKm={dayKm}
  isPending={isPending}
  logsBySessionId={logsBySessionId}
  getLogForSession={getLogForSession}
  getSessionStatus={getSessionStatus}
  isAbsent={absenceDates.has(selectedISO)}
  absenceReason={myAbsences.find((a) => a.date === selectedISO)?.reason ?? null}
  strengthSessionsForSelectedDay={strengthResolvedByISO.get(selectedISO) ?? []}
  onOpenStrengthSession={(slotId) => {
    try {
      sessionStorage.setItem("eac_pending_strength_focus_slot_id", String(slotId));
    } catch { /* private mode / quota */ }
    navigate("/strength");
  }}
  user={user}
  userId={userId}
  authUuid={authUuid}
  setAttendanceOverrideBySessionId={setAttendanceOverrideBySessionId}
  stableDurationMin={stableDurationMin}
/>
```

**Step 4: Vérifier que le keyboard nav handler reste cohérent**

Lignes 689-713 (handler keyboard global) reste dans Dashboard. Il appelle `closeDay` et `openSession` — déjà locaux. OK.

L'effect d'auto-close drawer (dans `useDashboardState.ts:204-213`) reste en place.

**Step 5: typecheck**

Run: `npx tsc --noEmit 2>&1 | tail -20`
Expected: `EXITCODE=0`. Sinon corriger.

**Step 6: tests**

Run: `npm test 2>&1 | tail -10`
Expected: 684 pass + 1 fail pré-existant `transformers.test.ts:18` (non lié, attendu).

**Step 7: Pas de commit ici** — on documente d'abord puis 1 commit unique pour le §216.

---

## Task 5 : Vérification manuelle (smoke test)

**Step 1: lance dev server**

Run: `npm run dev` (background)
Open: `http://localhost:8080`

Connectez-vous comme nageur.

**Step 2: Test calendrier**

- Clique sur un jour → drawer s'ouvre.
- Clique sur un autre jour → drawer change de contexte.
- ⚠️ Vérifie que le mois précédent/suivant fonctionne.
- ⚠️ Vérifie que le bouton "Aujourd'hui" recentre correctement.

**Step 3: Test save flow**

- Ouvre un jour avec une séance assignée.
- Clique sur la séance → l'écran détails s'ouvre.
- Remplis les 4 indicateurs + distance.
- Clique "Sauvegarder" → toast vert + drawer se ferme après 1.2s.
- Re-ouvre → vérifie que les valeurs sont persistées (read).
- Modifie une valeur → re-sauvegarde → toast vert.

**Step 4: Test absences**

- Marque une journée entière en absence → indicateur sur le calendrier (gris) + drawer ferme.
- Re-ouvre la journée → bouton "Restaurer la disponibilité" → click → indicateur disparaît.

**Step 5: Test alternative override**

- Si un jour a > 1 séance possible, clique l'alternative → vérifie que le titre dans le drawer change.

**Step 6: Test perf (DevTools React Profiler)**

- Ouvre React DevTools → Profiler.
- Démarre un enregistrement.
- Ouvre un jour → tape dans le champ "Commentaire" 5-10 caractères.
- Stop l'enregistrement.
- ⚠️ **Vérifier** : `<DashboardCalendar>` ne doit pas apparaître dans les commits provoqués par le typing. Seuls FeedbackDrawer et ses descendants doivent re-render.

Si ces 6 étapes passent, le refacto est validé.

**Step 7: Si le dev server est resté en background, tuer le process**

Run: `pkill -f "vite"` (avec attention si d'autres projets Vite tournent).

---

## Task 6 : Documentation §216 + commit final

**Files:**
- Modify: `docs/implementation-log.md` (ajouter entrée §216 en tête)
- Modify: `docs/ROADMAP.md` (mettre à jour ligne "Dernière mise à jour" + déplacer ancienne en "Précédente")
- Modify: `CLAUDE.md` (ligne "Dernier § livré" → §216)
- Modify: `docs/claude/files-map.md` (Dashboard.tsx taille mise à jour + 2 nouveaux fichiers ajoutés)

**Step 1: implementation-log.md**

Ajouter en tête (après le H1 et la note de règle) :

```markdown
## §216 — Découpage Dashboard.tsx en orchestrateur + Calendar + FeedbackContainer (2026-05-08)

**Contexte :** Refacto B post-audit §214. Dashboard.tsx (1114 LOC) re-rendait à chaque keystroke dans le drawer (saveState, draftState, alternativeOverride co-localisés). Cible : isoler le calendrier des re-renders d'écriture.

**Architecture :**
- `useDashboardState.ts` : `useFeedbackDraft` retiré du hook parent → appelé directement dans le container. `draftState` ne re-render plus Dashboard.
- `<DashboardCalendar>` (memo) : wrapper CalendarHeader + CalendarGrid. Reçoit uniquement props lecture-seule du calendrier.
- `<DashboardFeedbackContainer>` (memo) : possède `saveState`, `alternativeOverride`, `draftState`, et les 5 mutations (save/update/delete/absence/removeAbsence). Reçoit drawer state + setters de Dashboard.
- `Dashboard.tsx` : orchestrateur (queries, useDashboardState, navigation, banners, settings dialog inline laissé en place — décision du design).

**Fichiers** :
- Créés : `src/components/dashboard/DashboardCalendar.tsx` (~80 LOC), `src/components/dashboard/DashboardFeedbackContainer.tsx` (~350 LOC).
- Modifiés : `src/pages/Dashboard.tsx` (1114 → ~270 LOC), `src/hooks/useDashboardState.ts` (262 → ~250 LOC).

**Tests :** `npx tsc --noEmit` clean. `npm test` 684 pass + 1 fail pré-existant `transformers.test.ts:18` non lié. Smoke test manuel : save/update/delete/absence/alternative OK ; React Profiler confirme que DashboardCalendar ne re-render plus pendant la saisie.

**Hors scope §216 :** Settings dialog reste inline (validé). Refactos A/C/D du plan d'audit reportés à des § dédiés.
```

**Step 2: ROADMAP.md**

Remplacer la ligne `*Dernière mise à jour : §214 livré …*` par :

```markdown
*Dernière mise à jour : §216 livré (2026-05-08) — Refacto B Dashboard.tsx. Découpage en orchestrateur (~270 LOC vs 1114) + `<DashboardCalendar>` (React.memo) + `<DashboardFeedbackContainer>` (React.memo, possède saveState/draftState/alternativeOverride + 5 mutations). `useFeedbackDraft` retiré du hook parent → appelé dans le container, le calendrier ne re-render plus pendant la saisie. Settings dialog laissé inline. tsc clean, 684 tests pass + 1 fail pré-existant non lié.*

*Précédente : §214 livré (2026-05-08) — Quick wins perf + maintenabilité …*
```

(la ligne "Précédente" déjà présente devient le second paragraphe — pas de duplication.)

**Step 3: CLAUDE.md**

Remplacer la ligne `Dernier § livré : **§214** …` par :

```markdown
Dernier § livré : **§216** — Refacto B Dashboard.tsx. Découpage 1114 → ~270 LOC : `<DashboardCalendar>` (memo) + `<DashboardFeedbackContainer>` (memo, host saveState/draftState/alternativeOverride + 5 mutations). `useFeedbackDraft` sorti du hook parent. Calendrier ne re-render plus pendant la saisie. tsc clean.
```

**Step 4: files-map.md**

Modifier la ligne actuelle de Dashboard.tsx (taille) :
- `src/pages/Dashboard.tsx | Calendrier natation nageur (ex-Accueil, route /natation) | ~1055 lignes` → `~270 lignes`

Ajouter 2 lignes dans la section Dashboard components :
- `src/components/dashboard/DashboardCalendar.tsx` | Wrapper React.memo CalendarHeader + CalendarGrid (§216) | ~80 lignes
- `src/components/dashboard/DashboardFeedbackContainer.tsx` | Host React.memo du FeedbackDrawer : saveState, draftState, alternativeOverride, 5 mutations (save/update/delete/absence/removeAbsence) (§216) | ~350 lignes

**Step 5: Commit**

```bash
git add src/pages/Dashboard.tsx src/hooks/useDashboardState.ts \
        src/components/dashboard/DashboardCalendar.tsx \
        src/components/dashboard/DashboardFeedbackContainer.tsx \
        docs/implementation-log.md docs/ROADMAP.md CLAUDE.md docs/claude/files-map.md

git commit -m "$(cat <<'EOF'
feat(§216): découpage Dashboard.tsx en orchestrateur + Calendar + FeedbackContainer (Refacto B)

Cible audit §214 (perf) : Dashboard.tsx 1114 LOC re-rendait à chaque
keystroke dans le drawer (saveState, draftState, alternativeOverride
co-localisés).

- useDashboardState.ts : useFeedbackDraft retiré du hook parent
  → appelé directement dans le container. draftState ne re-render
  plus Dashboard.
- <DashboardCalendar> (React.memo) : wrapper CalendarHeader +
  CalendarGrid. Props lecture-seule du calendrier uniquement.
- <DashboardFeedbackContainer> (React.memo) : host de saveState,
  alternativeOverride, draftState, et les 5 mutations
  (save/update/delete/absence/removeAbsence). Reçoit drawer state
  + setters de Dashboard.
- Dashboard.tsx : 1114 → ~270 LOC, orchestrateur (queries,
  useDashboardState, navigation, banners, settings dialog inline).

Settings dialog laissé inline (out of scope §216, validé).

Smoke test manuel OK : save/update/delete/absence/alternative.
React Profiler confirme que DashboardCalendar ne re-render plus
pendant la saisie d'un feedback (audit estimait -50 à -80%).

tsc clean. 684 tests pass + 1 fail pré-existant transformers.test.ts:18
non lié (déjà documenté §214).

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

**Step 6: Push (sur demande utilisateur uniquement)**

Ne PAS pousser automatiquement. Attendre l'instruction utilisateur (déploiement GH Pages déclenché par push sur main).

---

## Critères de validation finale

Avant de marquer §216 fait :

- [ ] `npx tsc --noEmit` retourne 0
- [ ] `npm test` retourne 684 pass + 1 fail attendu (`transformers.test.ts:18`)
- [ ] Smoke test manuel : 6 étapes Task 5 OK
- [ ] React Profiler : DashboardCalendar absent des commits déclenchés par le typing
- [ ] `wc -l src/pages/Dashboard.tsx` retourne ~250-300 lignes
- [ ] Documentation §216 ajoutée à 4 fichiers (impl-log, ROADMAP, CLAUDE.md, files-map)
- [ ] 1 commit unique `feat(§216): …` sur la branche `main`
