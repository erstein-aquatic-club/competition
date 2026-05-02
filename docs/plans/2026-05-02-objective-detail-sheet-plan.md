# §189-ext — Objective Detail Sheet (Allures + Progression toggle) Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Remplacer l'affichage inline de `PaceMatrixInline` sous chaque `ObjectiveCard` par un drawer unifié (toggle Allures | Progression) s'ouvrant au clic sur un objectif.

**Architecture:** Extraire `EventProgressionContent` de `EventProgressionSheet` (sans wrapper Sheet), créer `ObjectiveDetailSheet` qui l'utilise dans un onglet Progression + `PaceMatrixInline` dans l'onglet Allures, puis câbler dans `SwimmerObjectivesView`.

**Tech Stack:** React 19, Radix UI Sheet + ToggleGroup (Shadcn), react-dom/server pour les tests, node:test TDD.

---

### Task 1: Extraire `EventProgressionContent` de `EventProgressionSheet.tsx`

**Files:**
- Modify: `src/components/shared/EventProgressionSheet.tsx`

No new test needed — les appels existants à `EventProgressionSheet` restent identiques.

**Step 1: Lire le fichier entier**

```bash
wc -l src/components/shared/EventProgressionSheet.tsx
# Attendu : 403 lignes
```

**Step 2: Refactoriser le fichier**

La structure actuelle est un seul composant `EventProgressionSheet` (403 lignes). L'objectif est de séparer en deux :

**`EventProgressionContentProps`** (nouveau type, avant `EventProgressionSheetProps`) :
```ts
export type EventProgressionContentProps = {
  eventCode: string;
  poolLength: 25 | 50;
  iuf: string | null;
  targetTime?: number | null;
  athleteName?: string;
  /** Si false, les queries React Query sont désactivées. Défaut: true. */
  active?: boolean;
};
```

**`EventProgressionContent`** (nouveau composant exporté) contient tout ce qui était dans `EventProgressionSheet` SAUF le wrapper `<Sheet>` et le `<SheetHeader>`. Il reçoit `active` à la place de `open` pour gate les queries :

- Remplacer `enabled: open && !!iuf` par `enabled: (active ?? true) && !!iuf` dans les deux queries.
- Le return devient `<div className="space-y-4">` (sans le `mt-5` qui sera ajouté par le parent).
- Ajouter en première ligne du JSX le subtitle (qui était dans `SheetDescription`) :
  ```tsx
  <p className="text-xs text-muted-foreground">
    {athleteName ? `${athleteName} · ` : ""}
    {eventPerfs.length} performance{eventPerfs.length !== 1 ? "s" : ""} en bassin {poolLength}m
  </p>
  ```

**`EventProgressionSheet`** (conservé, réduit à ~15 lignes) :
```tsx
export function EventProgressionSheet({
  open,
  onOpenChange,
  eventCode,
  poolLength,
  iuf,
  targetTime,
  athleteName,
}: EventProgressionSheetProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[90dvh] overflow-y-auto rounded-t-3xl">
        <SheetHeader className="text-left">
          <SheetTitle>{eventLabel(eventCode)}</SheetTitle>
        </SheetHeader>
        <div className="mt-5">
          <EventProgressionContent
            eventCode={eventCode}
            poolLength={poolLength}
            iuf={iuf}
            targetTime={targetTime}
            athleteName={athleteName}
            active={open}
          />
        </div>
      </SheetContent>
    </Sheet>
  );
}
```

Supprimer `SheetDescription` de l'import (elle n'est plus utilisée).

**Step 3: TypeScript check**

```bash
npx tsc --noEmit 2>&1 | head -20
```
Attendu : 0 erreurs.

**Step 4: Test suite**

```bash
npm test 2>&1 | grep -E "^ℹ (pass|fail)"
```
Attendu : même nombre qu'avant (635 pass, 1 fail pre-existing).

**Step 5: Commit**

```bash
git add src/components/shared/EventProgressionSheet.tsx
git commit -m "refactor(progression): extract EventProgressionContent from EventProgressionSheet"
```

---

### Task 2: Créer `ObjectiveDetailSheet.tsx` + test

**Files:**
- Create: `src/components/shared/ObjectiveDetailSheet.tsx`
- Create: `src/components/shared/__tests__/ObjectiveDetailSheet.test.tsx`

**Step 1: Écrire le test en premier (TDD)**

Créer `src/components/shared/__tests__/ObjectiveDetailSheet.test.tsx` :

```ts
import assert from "node:assert/strict";
import { describe, it, before, mock } from "node:test";
import React from "react";
import { renderToString } from "react-dom/server";

before(async () => {
  mock.module("@/components/ui/sheet", {
    namedExports: {
      Sheet: ({ open, children }: any) => open ? React.createElement(React.Fragment, null, children) : null,
      SheetContent: ({ children }: any) => React.createElement("div", null, children),
      SheetHeader: ({ children }: any) => React.createElement("div", null, children),
      SheetTitle: ({ children }: any) => React.createElement("h2", null, children),
    },
  });
  mock.module("@/components/ui/toggle-group", {
    namedExports: {
      ToggleGroup: ({ children }: any) => React.createElement("div", { "data-testid": "toggle-group" }, children),
      ToggleGroupItem: ({ children }: any) => React.createElement("button", null, children),
    },
  });
  mock.module("@/components/coach/pace/PaceMatrixInline", {
    namedExports: {
      default: () => React.createElement("div", { "data-testid": "pace-matrix" }, "PaceMatrixInline"),
    },
  });
  mock.module("@/components/shared/EventProgressionSheet", {
    namedExports: {
      EventProgressionContent: () => React.createElement("div", { "data-testid": "progression" }, "EventProgressionContent"),
    },
  });
});

describe("ObjectiveDetailSheet", () => {
  it("affiche le toggle Allures/Progression quand matchingTarget est non-null", async () => {
    const { ObjectiveDetailSheet } = await import("../ObjectiveDetailSheet");
    const obj = {
      id: "1", event_code: "100NL", pool_length: 50, target_time_seconds: 65,
    } as any;
    const target = {
      id: "t1", target_time_ms: 65_000, target_distance_m: 100,
      stroke: "NL", target_pool_size: "50m",
    } as any;
    const html = renderToString(
      React.createElement(ObjectiveDetailSheet, {
        open: true, onOpenChange: () => {}, objective: obj, matchingTarget: target, iuf: null,
      }),
    );
    assert.ok(html.includes("Allures"), "doit contenir le label Allures");
    assert.ok(html.includes("Progression"), "doit contenir le label Progression");
  });

  it("n'affiche pas le toggle quand matchingTarget est null", async () => {
    const { ObjectiveDetailSheet } = await import("../ObjectiveDetailSheet");
    const obj = {
      id: "1", event_code: "100NL", pool_length: 50, target_time_seconds: 65,
    } as any;
    const html = renderToString(
      React.createElement(ObjectiveDetailSheet, {
        open: true, onOpenChange: () => {}, objective: obj, matchingTarget: null, iuf: null,
      }),
    );
    assert.ok(!html.includes("Allures"), "ne doit pas contenir le label Allures");
  });
});
```

**Step 2: Run pour vérifier l'échec**

```bash
npm test -- src/components/shared/__tests__/ObjectiveDetailSheet.test.tsx 2>&1 | tail -10
```
Attendu : erreur d'import (module non trouvé).

**Step 3: Créer `src/components/shared/ObjectiveDetailSheet.tsx`**

```tsx
import React, { useEffect, useState } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { Objective } from "@/lib/api";
import type { PaceTarget } from "@/lib/api/pace-targets";
import PaceMatrixInline from "@/components/coach/pace/PaceMatrixInline";
import { EventProgressionContent } from "@/components/shared/EventProgressionSheet";
import { eventLabel } from "@/lib/objectiveHelpers";

type Tab = "allures" | "progression";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  objective: Objective | null;
  matchingTarget: PaceTarget | null;
  iuf: string | null;
}

export function ObjectiveDetailSheet({
  open,
  onOpenChange,
  objective,
  matchingTarget,
  iuf,
}: Props) {
  const [tab, setTab] = useState<Tab>("allures");

  useEffect(() => {
    if (open) setTab("allures");
  }, [open]);

  if (!objective?.event_code) return null;

  const hasTarget = matchingTarget != null;
  const poolLength: 25 | 50 = objective.pool_length === 50 ? 50 : 25;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[90dvh] overflow-y-auto rounded-t-3xl">
        <SheetHeader className="text-left">
          <SheetTitle>{eventLabel(objective.event_code)}</SheetTitle>
        </SheetHeader>

        {hasTarget && (
          <div className="mt-4">
            <ToggleGroup
              type="single"
              variant="outline"
              value={tab}
              onValueChange={(v) => {
                if (v) setTab(v as Tab);
              }}
              className="w-full"
            >
              <ToggleGroupItem value="allures" className="flex-1 text-xs h-8">
                Allures
              </ToggleGroupItem>
              <ToggleGroupItem value="progression" className="flex-1 text-xs h-8">
                Progression
              </ToggleGroupItem>
            </ToggleGroup>
          </div>
        )}

        <div className="mt-4">
          {hasTarget && tab === "allures" ? (
            <PaceMatrixInline
              targetTimeMs={matchingTarget.target_time_ms}
              targetDistance={matchingTarget.target_distance_m}
              stroke={matchingTarget.stroke}
              targetPoolSize={matchingTarget.target_pool_size}
              swimmerSex={null}
            />
          ) : (
            <EventProgressionContent
              eventCode={objective.event_code}
              poolLength={poolLength}
              iuf={iuf}
              targetTime={objective.target_time_seconds}
              active={tab === "progression" || !hasTarget}
            />
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
```

**Step 4: Run tests**

```bash
npm test -- src/components/shared/__tests__/ObjectiveDetailSheet.test.tsx 2>&1 | tail -10
```
Attendu : 2/2 pass.

**Step 5: TypeScript check**

```bash
npx tsc --noEmit 2>&1 | head -20
```
Attendu : 0 erreurs.

**Step 6: Commit**

```bash
git add src/components/shared/ObjectiveDetailSheet.tsx src/components/shared/__tests__/ObjectiveDetailSheet.test.tsx
git commit -m "feat(objective-detail): ObjectiveDetailSheet avec toggle Allures/Progression + 2 tests"
```

---

### Task 3: Câbler dans `SwimmerObjectivesView.tsx`

**Files:**
- Modify: `src/components/profile/SwimmerObjectivesView.tsx`
- Modify: `src/components/profile/__tests__/SwimmerObjectivesView.paceLink.test.tsx`

**Step 1: Lire le fichier**

Lire `src/components/profile/SwimmerObjectivesView.tsx` (535 lignes).

**Step 2: Modifier `SwimmerObjectivesView.tsx`**

**a) Remplacer les imports :**

Supprimer :
```ts
import PaceMatrixInline from "@/components/coach/pace/PaceMatrixInline";
```

Ajouter :
```ts
import { ObjectiveDetailSheet } from "@/components/shared/ObjectiveDetailSheet";
```

Garder (déjà présents) :
```ts
import { parseObjectiveForPace } from "@/lib/objective-pace-link";
import { listMyPaceTargets, type PaceTarget } from "@/lib/api/pace-targets";
import { findMatchingTarget } from "@/hooks/useTargetForObjective";
```

**b) Supprimer l'export `shouldRenderInlineMatrix`** (lignes 51-61 actuellement) — la fonction entière.

**c) Remplacer le state `progressionObj` par `detailObj` + `detailMatchingTarget` :**

Remplacer :
```ts
const [progressionObj, setProgressionObj] = useState<Objective | null>(null);
```

Par :
```ts
const [detailObj, setDetailObj] = useState<Objective | null>(null);
const [detailMatchingTarget, setDetailMatchingTarget] = useState<PaceTarget | null>(null);
```

**d) Ajouter helper `openDetail` juste avant `handleSubmit` :**

```ts
const openDetail = (obj: Objective) => {
  const parsed = parseObjectiveForPace(obj.event_code, obj.pool_length);
  const target = findMatchingTarget(paceTargets, swimmerAccountId ?? -1, parsed);
  setDetailMatchingTarget(target);
  setDetailObj(obj);
};
```

**e) Modifier les `onClick` des cartes :**

Pour `coachObjectives.map` — remplacer :
```tsx
onClick={obj.event_code ? () => setProgressionObj(obj) : undefined}
```
Par :
```tsx
onClick={obj.event_code ? () => openDetail(obj) : undefined}
```

Pour `personalObjectives.map` — remplacer :
```tsx
onClick={obj.event_code ? () => setProgressionObj(obj) : () => openEdit(obj)}
```
Par :
```tsx
onClick={obj.event_code ? () => openDetail(obj) : () => openEdit(obj)}
```

**f) Supprimer les blocs `PaceMatrixInline` inline** (les deux blocs `{shouldRenderInlineMatrix(...) && matchingTarget && ...}`) et les `<div key={obj.id}>` wrappers correspondants. Revenir à un rendu direct de `<ObjectiveCard>` dans le map (sans div wrapper ni matrix inline).

Le map `coachObjectives` devient :
```tsx
{coachObjectives.map((obj) => (
  <ObjectiveCard
    key={obj.id}
    objective={obj}
    performances={performances}
    showCoachBadge
    onClick={obj.event_code ? () => openDetail(obj) : undefined}
  />
))}
```

Le map `personalObjectives` devient :
```tsx
{personalObjectives.map((obj) => (
  <ObjectiveCard
    key={obj.id}
    objective={obj}
    performances={performances}
    onClick={obj.event_code ? () => openDetail(obj) : () => openEdit(obj)}
    onEdit={obj.event_code ? () => openEdit(obj) : undefined}
  />
))}
```

**g) Remplacer le bloc `EventProgressionSheet`** en bas du JSX :

Supprimer :
```tsx
{progressionObj?.event_code && (
  <EventProgressionSheet
    open={!!progressionObj}
    onOpenChange={(open) => { if (!open) setProgressionObj(null); }}
    eventCode={progressionObj.event_code}
    poolLength={(progressionObj.pool_length === 50 ? 50 : 25) as 25 | 50}
    iuf={iuf}
    targetTime={progressionObj.target_time_seconds}
  />
)}
```

Ajouter :
```tsx
<ObjectiveDetailSheet
  open={!!detailObj}
  onOpenChange={(open) => { if (!open) setDetailObj(null); }}
  objective={detailObj}
  matchingTarget={detailMatchingTarget}
  iuf={iuf}
/>
```

**h) Supprimer l'import `EventProgressionSheet`** (plus utilisé directement).

**Step 3: Mettre à jour le fichier test**

`src/components/profile/__tests__/SwimmerObjectivesView.paceLink.test.tsx` teste uniquement `shouldRenderInlineMatrix` (fonction supprimée). Supprimer le fichier :

```bash
rm src/components/profile/__tests__/SwimmerObjectivesView.paceLink.test.tsx
```

**Step 4: TypeScript check**

```bash
npx tsc --noEmit 2>&1 | head -20
```
Attendu : 0 erreurs.

**Step 5: Full test suite**

```bash
npm test 2>&1 | grep -E "^ℹ (pass|fail)"
```
Attendu : 633 pass (635 - 4 tests shouldRenderInlineMatrix + 2 nouveaux ObjectiveDetailSheet), 1 fail pre-existing.

**Step 6: Commit**

```bash
git add src/components/profile/SwimmerObjectivesView.tsx
git rm src/components/profile/__tests__/SwimmerObjectivesView.paceLink.test.tsx
git commit -m "feat(objective-detail): brancher ObjectiveDetailSheet dans SwimmerObjectivesView, supprimer inline matrices"
```

---

### Task 4: Docs + push

**Files:**
- `docs/implementation-log.md`
- `docs/ROADMAP.md`
- `CLAUDE.md`
- `docs/claude/files-map.md`

**Step 1: Vérifier les tailles de fichiers**

```bash
wc -l src/components/shared/ObjectiveDetailSheet.tsx \
       src/components/shared/EventProgressionSheet.tsx \
       src/components/profile/SwimmerObjectivesView.tsx
```

**Step 2: Mettre à jour `docs/implementation-log.md`**

Ajouter une entrée §189-ext en tête du fichier :
- Feature : drawer objectif unifié (Allures | Progression) pour le nageur
- Extraction `EventProgressionContent` de `EventProgressionSheet`
- Nouveau composant `ObjectiveDetailSheet.tsx`
- Suppression inline `PaceMatrixInline` + `shouldRenderInlineMatrix`
- Tests : +2 (`ObjectiveDetailSheet.test.tsx`), -4 (`SwimmerObjectivesView.paceLink.test.tsx` supprimé)

**Step 3: Mettre à jour `docs/ROADMAP.md`**

Ajouter §189-ext dans la liste des chantiers livrés.

**Step 4: Mettre à jour `CLAUDE.md`**

Remplacer la ligne "Dernière entrée en date : §188-ext ..." par §189-ext.

**Step 5: Mettre à jour `docs/claude/files-map.md`**

- Ajouter `src/components/shared/ObjectiveDetailSheet.tsx` (nouveau, ~75 lignes, drawer objectif Allures+Progression)
- Vérifier si `EventProgressionSheet.tsx` a varié de >30% (403→~30 lignes = oui → mettre à jour)
- Vérifier si `SwimmerObjectivesView.tsx` a varié de >30% (535→~490 lignes ≈ -8% = non)

**Step 6: Commit docs**

```bash
git add docs/implementation-log.md docs/ROADMAP.md CLAUDE.md docs/claude/files-map.md
git commit -m "docs(§189-ext): objective detail sheet — implementation log + ROADMAP + files-map"
```

**Step 7: Push**

```bash
git push origin main
```

---

## Résumé

| Tâche | Fichiers | Tests |
|-------|----------|-------|
| 1 | `EventProgressionSheet.tsx` refactorisé | 0 nouveaux |
| 2 | `ObjectiveDetailSheet.tsx` créé | +2 |
| 3 | `SwimmerObjectivesView.tsx` câblé | -4 (supprimés) |
| 4 | Docs + push | — |

Net tests : +2 -4 = **-2** (de 635 → 633 pass).
