# Marquage échauffement — vue exécution nageur §353 — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Afficher les sous-sections d'échauffement (« Échauffement articulaire » / « Mobilité corrective » + axe·côté / « Activation musculaire ») dans les vues nageur `MyPlanSessionSheet` et `SessionDetailPreview`, en lisant `raw_payload.warmup_kind` déjà persisté.

**Architecture:** Aucune migration. Un helper pur `warmupMetaFromItem` lit `StrengthSessionItem.raw_payload` (warmup_kind / corrective_axis / corrective_side, avec garde de validation). Les deux composants détectent l'échauffement via `meta.kind != null || block === 'warmup'` (warmup_kind prioritaire — corrige aussi la mauvaise classification des items activation à bucket non-mobility par la RPC §296) et rendent des sous-sections par `warmup_kind`, réutilisant `warmupSectionLabel`/`correctiveChipLabel`/`BLOCK_STYLES` (§351).

**Tech Stack:** TypeScript, `node:test` (helper) + vitest (composant), React/Tailwind (`/frontend-design`).

**Design :** `docs/plans/2026-05-31-echauffement-marquage-vue-execution-design.md`. **Base §351/§352** : `warmupLabels.ts` (`warmupSectionLabel`, `correctiveChipLabel`, type `WarmupKind`), `BLOCK_STYLES` (`src/lib/strength/blockStyles.ts`), aperçu `SessionCard` (`MesocyclePreview.tsx`) = patron visuel des sous-sections.

**Conventions :** `git add` ciblé (checkout partagé — d'autres fichiers WIP `swimPlanningShared.ts`/`date.ts`/`strengthPlanWeeks.ts` ne sont PAS à moi) ; runner `node --test --experimental-test-module-mocks --import tsx <file>` ; pas de push sans demande.

---

## Task 1: `warmupMetaFromItem` (helper pur, TDD)

**Files:** Modify `src/lib/strength/warmupLabels.ts` ; Test `src/lib/strength/__tests__/warmupLabels.test.ts`.

**Step 1: Tests (RED)**
```typescript
import { warmupMetaFromItem } from "../warmupLabels";

it("warmupMetaFromItem — common", () => {
  const m = warmupMetaFromItem({ raw_payload: { warmup_kind: "common" } });
  assert.deepEqual(m, { kind: "common", correctiveAxis: null, correctiveSide: null });
});
it("warmupMetaFromItem — corrective + axe/côté", () => {
  const m = warmupMetaFromItem({ raw_payload: { warmup_kind: "corrective", corrective_axis: "hip", corrective_side: "left" } });
  assert.deepEqual(m, { kind: "corrective", correctiveAxis: "hip", correctiveSide: "left" });
});
it("warmupMetaFromItem — activation", () => {
  assert.equal(warmupMetaFromItem({ raw_payload: { warmup_kind: "activation" } }).kind, "activation");
});
it("warmupMetaFromItem — valeurs invalides → null", () => {
  const m = warmupMetaFromItem({ raw_payload: { warmup_kind: "bogus", corrective_side: "up" } });
  assert.deepEqual(m, { kind: null, correctiveAxis: null, correctiveSide: null });
});
it("warmupMetaFromItem — raw_payload absent/null → tout null", () => {
  assert.equal(warmupMetaFromItem({}).kind, null);
  assert.equal(warmupMetaFromItem({ raw_payload: null }).kind, null);
});
```

**Step 2: Run (RED)** — `node --test --experimental-test-module-mocks --import tsx src/lib/strength/__tests__/warmupLabels.test.ts` → FAIL (non exporté).

**Step 3: Implémenter** (dans `warmupLabels.ts`)
```typescript
/** Métadonnées d'échauffement (§353) lues depuis le raw_payload d'un item de séance. */
export interface WarmupMeta {
  kind: WarmupKind | null;
  correctiveAxis: string | null;
  correctiveSide: "left" | "right" | "both" | null;
}

/**
 * §353 — lit `warmup_kind`/`corrective_axis`/`corrective_side` depuis le
 * `raw_payload` d'un `StrengthSessionItem` (persisté par §351/§352), avec le même
 * garde de validation que `getMesocycleSessionsContent`. Tout `null` si absent/invalide.
 */
export function warmupMetaFromItem(item: { raw_payload?: Record<string, unknown> | null }): WarmupMeta {
  const p = item.raw_payload ?? null;
  if (!p) return { kind: null, correctiveAxis: null, correctiveSide: null };
  const k = p.warmup_kind;
  const kind: WarmupKind | null =
    k === "common" || k === "corrective" || k === "activation" ? k : null;
  const s = p.corrective_side;
  const correctiveSide = s === "left" || s === "right" || s === "both" ? s : null;
  const correctiveAxis = kind === "corrective" && p.corrective_axis != null ? String(p.corrective_axis) : null;
  return { kind, correctiveAxis, correctiveSide };
}
```

**Step 4: Run (GREEN)**. **Step 5: Commit**
```bash
git add src/lib/strength/warmupLabels.ts src/lib/strength/__tests__/warmupLabels.test.ts
git commit -m "feat(§353): warmupMetaFromItem (lecture raw_payload warmup_kind, helper pur)"
```

---

## Task 2: `MyPlanSessionSheet` — sous-sections échauffement (`/frontend-design`)

> **Règle projet : invoquer `/frontend-design`** (rendu visuel calqué sur l'aperçu `SessionCard`).

**Files:** Modify `src/components/strength/MyPlanSessionSheet.tsx` (`ItemsList`) ; Test `src/components/strength/MyPlanSessionSheet.vitest.tsx` (créer).

**Structure cible.** Dans `ItemsList` :
- `isWarmupItem(i) = warmupMetaFromItem(i).kind != null || i.block === "warmup"` → remplace `i.block === "warmup"` pour `warmupItems`/`mainItems`.
- Rendu du groupe warmup : au lieu de l'eyebrow unique « Échauffement · Mobilité », **walk** les `warmupShown` en insérant un eyebrow `warmupSectionLabel(meta.kind)` à chaque changement de `meta.kind`. Si **aucun** item warmup n'a de `kind` (legacy), garder l'eyebrow unique « Échauffement · Mobilité ».
- `renderItem` : pour un item dont `meta.kind === "corrective"`, afficher une pastille `correctiveChipLabel(meta.axis, meta.side)` (style `BLOCK_STYLES.warmup.badge`, calqué sur l'aperçu) à côté du nom.

**Tests vitest (RED→GREEN)** : monter `MyPlanSessionSheet` avec un `session.items` portant `raw_payload.warmup_kind` (common, corrective+hip/left, activation) → assert les 3 libellés de sous-section + la pastille « côté gauche » présents ; un item legacy (`block:'warmup'`, sans `raw_payload`) → eyebrow unique « Échauffement ». **Hooks #310** : aucun hook après early return.

**Commit:** `git add src/components/strength/MyPlanSessionSheet.tsx src/components/strength/MyPlanSessionSheet.vitest.tsx && git commit -m "feat(§353): MyPlanSessionSheet — sous-sections échauffement + pastille axe·côté"`

---

## Task 3: `SessionDetailPreview` — mêmes sous-sections (`/frontend-design`)

**Files:** Modify `src/components/strength/SessionDetailPreview.tsx`.

Le rendu est par index avec `isWarmup`/`showWarmupHeader`/`showMainDivider` (§296, ~ligne 205). Adapter :
- `const meta = warmupMetaFromItem(item);` ; `const isWarmup = meta.kind != null || item.block === "warmup";`
- en-tête de sous-section : afficher l'eyebrow `warmupSectionLabel(meta.kind)` quand `meta.kind` change vs l'item précédent (et au 1ᵉʳ item warmup) ; legacy (kind null) → garder « Échauffement » comme aujourd'hui.
- `showMainDivider` : basé sur `prevIsWarmup && !isWarmup` (recalculer `prevIsWarmup` via le helper sur `items[index-1]`).
- pastille `correctiveChipLabel(meta.axis, meta.side)` sur les items correctifs (réutilise le style aperçu).

Pas de nouveau test composant exigé si la logique est couverte par Task 1 + Task 2 ; sinon ajout vitest léger. tsc 0, lint 0.

**Commit:** `git add src/components/strength/SessionDetailPreview.tsx && git commit -m "feat(§353): SessionDetailPreview — sous-sections échauffement + pastille axe·côté"`

---

## Task 4: Vérification + doc

- `npx tsc --noEmit` 0 ; `npm run lint` 0 erreur ; `npm test` verts ; `npm run build` OK. (Pas de migration → pas de `test:rls`.)
- Doc : `implementation-log.md` §353 ; `ROADMAP.md` (+ date) ; `FEATURES_STATUS.md` ; `CLAUDE.md` (Dernier § livré = §353) ; `files-map.md` (taille `warmupLabels.ts` si > 30 %) ; mémoire `muscu-bilan-warmup-roadmap` (sous-labels vue exécution **livrés** → reste : écrans d'édition coach des tables).
- **Commit** doc (targeted). Push uniquement si demandé.

---

## Notes transverses
- Zéro migration, zéro RPC (la donnée `warmup_kind` est déjà dans `raw_payload`).
- `WorkoutRunner` (mode focus) **hors scope** — garde son style warmup actuel.
- Legacy (plans pré-§351 sans `warmup_kind`) : repli sur `block` → comportement §296 inchangé (un seul en-tête « Échauffement »).
- Checkout partagé : `git add` ciblé, jamais `-A`.
