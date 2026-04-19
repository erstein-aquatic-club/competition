# Récapitulatif volume assigné — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Afficher, dans le header de `CoachTrainingSlotsScreen`, la distance totale (km) des séances assignées aux créneaux de la semaine affichée (états `draft` + `published`, `cancelled` exclu).

**Architecture:** Helper pur `sumAssignedDistance(instances)` dans `useSlotCalendar.ts`, exposé via le return du hook sous `weekTotalDistance` (en mètres). Affichage formaté (`N km` entier, sinon `N,N km`) en tant que badge à côté du libellé de semaine, côtés desktop et mobile. Zéro → badge masqué.

**Tech Stack:** React 19, TypeScript, Vitest, Tailwind CSS 4, React Query (existant).

---

## Task 1 — Helper pur `sumAssignedDistance` + test

**Files:**
- Modify: `src/hooks/useSlotCalendar.ts` (ajouter export du helper, ~après la fonction `materializeSlots` L247)
- Modify: `src/hooks/__tests__/useSlotCalendar.test.ts` (ajouter describe block en fin de fichier)

**Step 1: Écrire le test qui échoue**

Ajouter à la fin de `src/hooks/__tests__/useSlotCalendar.test.ts` :

```ts
import {
  getMondayOfWeek,
  materializeSlots,
  computeSlotState,
  getSlotScheduleBucket,
  resolveSlotAssignment,
  sumAssignedDistance,
} from "../useSlotCalendar";

// ...

describe("sumAssignedDistance", () => {
  const mkInstance = (
    state: "empty" | "draft" | "published" | "cancelled",
    distance: number | null | undefined,
  ) => ({
    date: "2026-03-02",
    slot: {} as never,
    groups: [],
    state,
    assignment: distance === undefined
      ? undefined
      : {
          id: 1,
          swim_catalog_id: null,
          training_slot_id: "s1",
          target_group_id: null,
          scheduled_date: "2026-03-02",
          scheduled_slot: null,
          visible_from: null,
          notified_at: null,
          status: "planned",
          session_name: "S1",
          session_distance: distance,
        },
  });

  it("sums distances for published and draft assignments", () => {
    const instances = [
      mkInstance("published", 3000),
      mkInstance("draft", 2500),
    ];
    expect(sumAssignedDistance(instances)).toBe(5500);
  });

  it("excludes empty instances (no assignment)", () => {
    const instances = [
      mkInstance("empty", undefined),
      mkInstance("published", 3000),
    ];
    expect(sumAssignedDistance(instances)).toBe(3000);
  });

  it("excludes cancelled instances even when an assignment is attached", () => {
    const instances = [
      mkInstance("cancelled", 4000),
      mkInstance("published", 2000),
    ];
    expect(sumAssignedDistance(instances)).toBe(2000);
  });

  it("treats null/undefined session_distance as 0", () => {
    const instances = [
      mkInstance("published", null),
      mkInstance("draft", 1500),
    ];
    expect(sumAssignedDistance(instances)).toBe(1500);
  });

  it("returns 0 for empty input", () => {
    expect(sumAssignedDistance([])).toBe(0);
  });
});
```

**Step 2: Vérifier qu'il échoue**

Run: `npm test -- src/hooks/__tests__/useSlotCalendar.test.ts`
Expected: FAIL — `sumAssignedDistance is not exported` (ou équivalent).

**Step 3: Implémenter le helper**

Dans `src/hooks/useSlotCalendar.ts`, après la fonction `materializeSlots` (juste avant `// ── React Hook ──`) :

```ts
/**
 * Somme les distances (mètres) des séances assignées aux créneaux.
 * Exclut les instances sans assignment et les instances annulées.
 */
export function sumAssignedDistance(instances: SlotInstance[]): number {
  return instances.reduce((sum, inst) => {
    if (inst.state === "cancelled") return sum;
    if (!inst.assignment) return sum;
    return sum + (inst.assignment.session_distance ?? 0);
  }, 0);
}
```

**Step 4: Vérifier que le test passe**

Run: `npm test -- src/hooks/__tests__/useSlotCalendar.test.ts`
Expected: PASS (tous les cas `sumAssignedDistance` verts, aucune régression sur les autres describe blocks).

**Step 5: Commit**

```bash
git add src/hooks/useSlotCalendar.ts src/hooks/__tests__/useSlotCalendar.test.ts
git commit -m "feat(slots): sumAssignedDistance helper (draft+published, cancelled excluded)"
```

---

## Task 2 — Exposer `weekTotalDistance` depuis le hook

**Files:**
- Modify: `src/hooks/useSlotCalendar.ts` (fonction `useSlotCalendar`, autour de L310-343)

**Step 1: Ajouter le dérivé mémoïsé et l'exposer**

Dans `useSlotCalendar`, après le `useMemo` qui calcule `instances` (L310-313) :

```ts
const weekTotalDistance = useMemo(
  () => sumAssignedDistance(instances),
  [instances],
);
```

Puis, dans le `return` (L331-343), ajouter la clé :

```ts
return {
  weekOffset,
  mondayIso,
  sundayIso,
  weekDates,
  instances,
  instancesByDate,
  isLoading,
  navigateToday,
  prevWeek,
  nextWeek,
  weekTotalDistance,
};
```

**Step 2: Type check**

Run: `npx tsc --noEmit`
Expected: aucune erreur liée au hook (ignorer les erreurs pré-existantes listées dans MEMORY.md, notamment `*.stories.tsx`).

**Step 3: Commit**

```bash
git add src/hooks/useSlotCalendar.ts
git commit -m "feat(slots): expose weekTotalDistance from useSlotCalendar"
```

---

## Task 3 — Formatter `formatAssignedKm`

**Files:**
- Modify: `src/pages/coach/CoachTrainingSlotsScreen.tsx` (ajouter au bloc de helpers locaux en haut du fichier, après les imports)

**Step 1: Ajouter le helper pur**

Dans `CoachTrainingSlotsScreen.tsx`, au niveau module (après les imports, avant tout composant) :

```ts
/**
 * Formate une distance en mètres en libellé km court.
 * Retourne null si <= 0 (pour masquer le badge).
 * Ex: 24500 → "24,5 km" ; 10000 → "10 km" ; 0 → null.
 */
function formatAssignedKm(distanceMeters: number): string | null {
  if (!distanceMeters || distanceMeters <= 0) return null;
  const km = Math.round(distanceMeters / 100) / 10;
  const label = Number.isInteger(km) ? `${km}` : km.toString().replace(".", ",");
  return `${label} km`;
}
```

Note : pas de test unitaire dédié (formatage trivial, deux cas couverts visuellement via Task 4/5). Si un cas nuancé apparaît (ex: arrondi à 1 km vs 0,9 km), ajouter un test à ce moment.

**Step 2: Type check**

Run: `npx tsc --noEmit`
Expected: aucune nouvelle erreur.

**Step 3: Commit**

```bash
git add src/pages/coach/CoachTrainingSlotsScreen.tsx
git commit -m "chore(slots): add formatAssignedKm helper"
```

---

## Task 4 — Badge volume dans nav semaine desktop

**Files:**
- Modify: `src/pages/coach/CoachTrainingSlotsScreen.tsx` (~L2696-2715)

**Step 1: Récupérer `weekTotalDistance` depuis le hook**

Localiser l'appel `useSlotCalendar()` dans le composant racine (`CoachTrainingSlotsScreen`). Ajouter `weekTotalDistance` dans le destructuring.

Grep pour le confirmer :
Run: `rg -n "useSlotCalendar\(\)" src/pages/coach/CoachTrainingSlotsScreen.tsx`

Si le hook est appelé et destructuré, ajouter simplement `weekTotalDistance` à la liste. Si `weekTotalDistance` doit traverser des props (ex: vers le composant de header qui contient la nav semaine), l'ajouter aux props du composant concerné (rechercher le composant qui rend la nav desktop L2696).

**Step 2: Ajouter le badge desktop**

À droite du bouton nav semaine (après `<Button ... onClick={nextWeek}>` L2712-2714), ajouter :

```tsx
{formatAssignedKm(weekTotalDistance) && (
  <span
    className="ml-2 inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary"
    title="Volume total assigné (brouillons + publiés) pour la semaine"
  >
    {formatAssignedKm(weekTotalDistance)}
  </span>
)}
```

**Step 3: Vérification visuelle**

Run: `npm run dev`
Ouvrir la vue coach créneaux, vérifier :
1. Badge affiché à côté du sélecteur de semaine quand la semaine a au moins une séance assignée.
2. Badge masqué sur une semaine vide.
3. Format correct (`24,5 km` / `10 km`).

**Step 4: Commit**

```bash
git add src/pages/coach/CoachTrainingSlotsScreen.tsx
git commit -m "feat(slots): show weekly assigned volume badge (desktop)"
```

---

## Task 5 — Badge volume dans nav semaine mobile

**Files:**
- Modify: `src/pages/coach/CoachTrainingSlotsScreen.tsx` (`MobileView`, L1331-1404)

**Step 1: Propager `weekTotalDistance` vers `MobileView`**

- Ajouter `weekTotalDistance: number;` à `MobileViewProps` (L1306-1330).
- Ajouter `weekTotalDistance,` aux paramètres destructurés dans `MobileView` (L1331-1344).
- Passer la prop depuis l'appel à `<MobileView ... />` (~L2791-2804) : ajouter `weekTotalDistance={weekTotalDistance}`.

**Step 2: Ajouter le badge dans la ligne nav mobile**

Après le `<span>` avec le libellé de dates (L1393-1395), dans le même conteneur `flex items-baseline gap-1.5` :

```tsx
{formatAssignedKm(weekTotalDistance) && (
  <span className="ml-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
    {formatAssignedKm(weekTotalDistance)}
  </span>
)}
```

**Step 3: Type check**

Run: `npx tsc --noEmit`
Expected: aucune nouvelle erreur.

**Step 4: Vérification visuelle mobile**

Dans le navigateur en mode responsive (<= sm), ouvrir la vue coach créneaux et vérifier le rendu compact (badge à côté du libellé de dates, pas de wrap disgracieux).

**Step 5: Commit**

```bash
git add src/pages/coach/CoachTrainingSlotsScreen.tsx
git commit -m "feat(slots): show weekly assigned volume badge (mobile)"
```

---

## Task 6 — Documentation

**Files:**
- Modify: `docs/implementation-log.md` (ajouter §127)
- Modify: `docs/ROADMAP.md` (ajouter ligne 91)
- Modify: `CLAUDE.md` (tableau "Chantiers futurs" — ajouter §127 ; tableau "Fichiers clés" — MAJ taille `CoachTrainingSlotsScreen.tsx` via `wc -l` si variation >30%, sinon laisser)

**Step 1: Mesurer les tailles réelles**

Run : `wc -l src/pages/coach/CoachTrainingSlotsScreen.tsx src/hooks/useSlotCalendar.ts`

**Step 2: Rédiger l'entrée §127 dans `docs/implementation-log.md`**

Inclure : contexte (§127 demandé par coach), changements (helper + hook + badges), fichiers modifiés, tests (5 cas `sumAssignedDistance`), décisions (draft+published inclus, cancelled exclu, 0 → masqué), limites (pas de répartition par groupe).

**Step 3: Ajouter la ligne 91 dans `docs/ROADMAP.md`**

`| 91 | Récapitulatif volume assigné vue créneaux coach | Faible | Fait (§127) |`

Mettre à jour la ligne `*Dernière mise à jour*` en tête du fichier (date 2026-04-18).

**Step 4: Mettre à jour `CLAUDE.md`**

Ajouter la ligne 91 au tableau "Chantiers futurs (ROADMAP)". Mettre à jour la taille de `CoachTrainingSlotsScreen.tsx` dans "Fichiers clés" si le delta excède 30%.

**Step 5: Commit**

```bash
git add docs/implementation-log.md docs/ROADMAP.md CLAUDE.md
git commit -m "docs(slots): log §127 — weekly assigned volume badge"
```

---

## Notes de vérification finale

Avant de clore la branche :

1. `npm test -- src/hooks/__tests__/useSlotCalendar.test.ts` → tous verts.
2. `npx tsc --noEmit` → pas de nouvelle erreur (erreurs pré-existantes `*.stories.tsx` tolérées, cf MEMORY.md).
3. Vérification UI desktop + mobile (Task 4 Step 3, Task 5 Step 4).
4. Pas de test RLS à lancer (aucune modification SQL / policy / helpers auth — cf CLAUDE.md § Tests RLS).
