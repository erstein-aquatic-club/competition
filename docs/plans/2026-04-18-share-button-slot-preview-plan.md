# Share Button in Slot Session Preview — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a share button in the header of the swim session preview inside `SlotSessionSheet.tsx`, reusing the existing share token + Web Share API pattern from `SwimCatalog.tsx`.

**Architecture:** One file modified (`src/pages/coach/SlotSessionSheet.tsx`). The bouton lives only in the preview header (mode `previewOpen`). It calls the existing `generateShareToken(catalogId)` API, then triggers `navigator.share` (Web Share API) with a `navigator.clipboard.writeText` fallback — strictly identical to `SwimCatalog.tsx:569-582` for consistency.

**Tech Stack:** React 19, TypeScript, lucide-react (`Share2` icon), `navigator.share` / `navigator.clipboard`, existing `generateShareToken` from `src/lib/api/swim.ts:239`.

**Why no automated tests:** The handler is a thin UI wrapper around an already-shipped API function. The same pattern is shipped in `SwimCatalog.tsx` without tests. Verification is manual (mobile + desktop). See design doc § Tests.

---

### Task 1: Add share handler + button to preview header

**Files:**
- Modify: `src/pages/coach/SlotSessionSheet.tsx`

**Step 1: Add `Share2` to the lucide-react imports**

In `src/pages/coach/SlotSessionSheet.tsx`, the lucide block (lines 39-55) currently imports `ArrowLeft` last. Add `Share2`:

```tsx
import {
  Plus,
  BookOpen,
  Pencil,
  Copy,
  Eye,
  EyeOff,
  Trash2,
  Clock,
  MapPin,
  CalendarDays,
  Loader2,
  Ban,
  AlertTriangle,
  ChevronRight,
  ArrowLeft,
  Share2,
} from "lucide-react";
```

**Step 2: Import `generateShareToken`**

Below the existing `getSwimSessionById` import (line 63), extend it to also pull `generateShareToken`:

```tsx
import { getSwimSessionById, generateShareToken } from "@/lib/api/swim";
```

**Step 3: Add `isSharing` local state**

Inside the `SlotSessionSheet` component, alongside the other `useState` calls (lines 142-148), add:

```tsx
const [isSharing, setIsSharing] = useState(false);
```

**Step 4: Reset `isSharing` when the instance changes**

In the `useEffect` block that resets local state when `instance` changes (lines 178-188), add `setIsSharing(false)` next to `setPreviewOpen(false)`:

```tsx
setPreviewOpen(false);
setIsSharing(false);
```

**Step 5: Add the share handler**

After `handleSheetOpenChange` (line ~274), before the `// ── Guard ──` comment, add:

```tsx
const handleShare = useCallback(async () => {
  const catalogId = instance?.assignment?.swim_catalog_id;
  if (catalogId == null || isSharing) return;
  setIsSharing(true);
  try {
    const token = await generateShareToken(catalogId);
    const url = `${window.location.origin}${window.location.pathname}#/s/${token}`;
    if (navigator.share) {
      await navigator.share({
        title: instance?.assignment?.session_name ?? "Séance",
        url,
      });
    } else {
      await navigator.clipboard.writeText(url);
      toast({
        title: "Lien copié !",
        description: "Le lien de partage a été copié dans le presse-papier.",
      });
    }
  } catch (err) {
    // navigator.share rejects with AbortError when the user cancels — silent.
    if ((err as Error)?.name !== "AbortError") {
      toast({
        title: "Erreur",
        description: "Impossible de générer le lien de partage.",
        variant: "destructive",
      });
    }
  } finally {
    setIsSharing(false);
  }
}, [instance, isSharing, toast]);
```

> **Note for the implementer:** the `AbortError` check is the one deviation from `SwimCatalog.tsx:569`. The Web Share API throws `AbortError` when the user dismisses the native sheet — surfacing a destructive toast in that case is a known UX bug in the existing handler. We silence it here. Do **not** propagate this fix to `SwimCatalog.tsx` in this task; out of scope.

**Step 6: Render the share button in the preview header**

Replace the preview header block (lines 299-313, the `<div className="flex items-center gap-2 mb-4">` and its content) with a 3-column layout: back button left, title centered, share button right.

```tsx
<div className="flex items-center gap-2 mb-4">
  <button
    type="button"
    onClick={() => setPreviewOpen(false)}
    className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted/50 text-muted-foreground active:scale-95 transition-transform"
    aria-label="Retour"
  >
    <ArrowLeft className="h-4 w-4" />
  </button>
  <h3
    className="flex-1 text-base font-bold tracking-tight uppercase truncate"
    style={{ fontFamily: "var(--font-display, 'Oswald', sans-serif)" }}
  >
    {assignment?.session_name ?? "Séance"}
  </h3>
  {assignment?.swim_catalog_id != null && (
    <button
      type="button"
      onClick={handleShare}
      disabled={isSharing}
      className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted/50 text-muted-foreground active:scale-95 transition-transform disabled:opacity-50"
      aria-label="Partager la séance"
    >
      {isSharing ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <Share2 className="h-4 w-4" />
      )}
    </button>
  )}
</div>
```

Changes vs the original:
- Title gets `flex-1` + `truncate` so long names don't push the share button off-screen.
- New right-side share button, gated on `assignment?.swim_catalog_id != null`.
- Loader replaces the icon while sharing.
- `aria-label` added to both buttons for a11y.

**Step 7: Type check**

Run: `npx tsc --noEmit`
Expected: no new errors. Pre-existing errors in `src/components/dashboard/*.stories.tsx` (per memory) are tolerated, not new ones.

**Step 8: Manual verification**

```bash
npm run dev
```

Then in the browser (coach role, hash route `/#/coach/training-slots`):

1. Open a published slot → tap the session card → preview opens → share button visible top-right.
2. Open a draft slot → same behavior (the gate is `swim_catalog_id != null`, not state).
3. Open an empty slot → preview is unreachable (no session), nothing to verify.
4. Desktop browser without Web Share API: click share → URL copied to clipboard, toast "Lien copié !".
5. Long session name: title truncates with ellipsis, share button stays visible.
6. Click share twice fast → second click ignored (button disabled while `isSharing`).
7. Mobile / Safari iOS PWA: click share → native share sheet opens. Cancel it → no destructive toast appears.

**Step 9: Commit**

```bash
git add src/pages/coach/SlotSessionSheet.tsx
git commit -m "$(cat <<'EOF'
feat(slots): share button in slot session preview

Adds a share button to the header of the swim session preview inside
SlotSessionSheet, reusing the existing generateShareToken + Web Share
API pattern from SwimCatalog. Silently swallows AbortError when the user
cancels the native share sheet.
EOF
)"
```

---

### Task 2: Update documentation per project workflow

**Files:**
- Modify: `docs/implementation-log.md` (add new § entry)
- Modify: `docs/ROADMAP.md` (add new line to "Chantiers futurs" + update `*Dernière mise à jour*`)
- Modify: `docs/FEATURES_STATUS.md` (mark sharing-from-slots row, if a relevant row exists; otherwise skip)
- Modify: `CLAUDE.md` (add the new chantier line referencing the new § number)

**Step 1: Determine the next § number**

Run: `grep -E '^## §[0-9]+' docs/implementation-log.md | tail -3`

Pick the next integer after the highest §N currently in the log.

**Step 2: Append the implementation-log entry**

Add a new `## §N — Bouton partage preview séance vue créneaux` section at the end of `docs/implementation-log.md` covering:
- Contexte (lien vers le design doc `docs/plans/2026-04-18-share-button-slot-preview-design.md`)
- Changements (les 6 modifications de `SlotSessionSheet.tsx`)
- Fichiers modifiés
- Tests (vérification manuelle, pas de tests automatisés)
- Décisions (AbortError silencieux, layout 3 colonnes)
- Limites (pas appliqué à `SwimCatalog.tsx` — out of scope)

**Step 3: Update ROADMAP.md**

- Update the `*Dernière mise à jour*` line at the top to today's date.
- Add a new row to the "Chantiers futurs" table: `| 91 | Bouton partage preview séance vue créneaux | Faible | Fait (§N) |` (substitute N from step 1).

**Step 4: Update CLAUDE.md "Chantiers futurs (ROADMAP)" table**

Add the same line as in step 3 to the table inside `CLAUDE.md`. Per the project rule, the table in `CLAUDE.md` must always point to the latest § in the log.

**Step 5: File size check for `SlotSessionSheet.tsx`**

Run: `wc -l src/pages/coach/SlotSessionSheet.tsx`

Compare to the entry in `CLAUDE.md` ("Fichiers clés" table) which currently lists ~1024 lignes. If the new size deviates by > 30 % from that figure, update the line. Most likely it stays well within range and no update is needed.

**Step 6: Commit docs**

```bash
git add docs/implementation-log.md docs/ROADMAP.md CLAUDE.md
# add docs/FEATURES_STATUS.md only if it was actually modified
git commit -m "$(cat <<'EOF'
docs: log §N share button in slot session preview

Updates implementation-log, ROADMAP and CLAUDE.md per the project's
documentation workflow.
EOF
)"
```

---

## Out of Scope (do NOT implement)

- Sharing button in the regular `FilledBody` action list (user explicitly asked for "depuis la preview").
- Fixing the same `AbortError` silent-cancel issue in `SwimCatalog.tsx:569`.
- Any change to `generateShareToken` or to the `getSharedSession` page.
- Adding a share-token revocation UI.
- Automated tests — see design doc § Tests.
