# Bannière progression globale §358 — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Après un ajustement mi-cycle, la bannière « Mon plan » affiche la progression **globale** (« Semaine 3/6 ») au lieu de repartir à « Semaine 1/4 », via un offset stocké sur le mésocycle.

**Architecture:** Colonne `strength_mesocycles.week_offset` (défaut 0) posée par un UPDATE ciblé post-apply dans le flux d'ajustement (l'offset = `phaseInfo.weekIndex`). Le helper pur `mesocyclePosition` gagne un param `weekOffset` qui globalise weekNumber/total/status (offset>0 = continuation, jamais « upcoming »). Rétrocompat : offset 0 = comportement actuel.

**Tech Stack:** Supabase (migration MCP), TypeScript, `node:test` (helper + API) + vitest (bannière), React.

**Design :** `docs/plans/2026-05-31-banniere-progression-globale-design.md`. **Base** : `mesocycleProgress.ts` (`mesocyclePosition`), `MyPlanTab.tsx:392` (props bannière), `MyPlanMesocycleBanner.tsx` (§342), `MesocycleAdjust.tsx` (payload sessionStorage, `phaseInfo.weekIndex`), `applyMesocycle` (renvoie l'id du nouveau méso, `strength-mesocycles.ts`).

**Conventions :** migration via MCP (projet `fscnobivsgornxdwqwlk`) ; `git add` ciblé (checkout partagé — `swimPlanningShared.ts`/`date.ts`/`strengthPlanWeeks.ts` = WIP autre terminal, NE PAS committer) ; runner `node --test --experimental-test-module-mocks --import tsx <file>` ; pas de push sans demande.

---

## Task 1: Migration `00220` — colonne `week_offset` + backfill François

**Files:** Create `supabase/migrations/00220_mesocycle_week_offset.sql` ; apply via MCP.

**Step 1: SQL**
```sql
-- 00220_mesocycle_week_offset.sql — §358 progression globale après ajustement.
ALTER TABLE strength_mesocycles ADD COLUMN IF NOT EXISTS week_offset int NOT NULL DEFAULT 0;

-- Backfill one-off : méso ajusté actif de François (user 1), 2 semaines faites
-- avant le pivot (18 + 25 mai). → bannière « Semaine 3/6 » immédiate.
UPDATE strength_mesocycles SET week_offset = 2
WHERE id = 'c9c42226-4736-4faa-a3cf-365f04cc2e60';
```

**Step 2: Apply** via MCP `apply_migration` (name `00220_mesocycle_week_offset`).

**Step 3: Verify** via `execute_sql` :
```sql
SELECT id, status, target_week_count, week_offset FROM strength_mesocycles WHERE athlete_id = 1 ORDER BY generated_at DESC LIMIT 3;
```
Attendu : méso actif `c9c42226` → `week_offset = 2` ; les autres → 0.

**Step 4: Commit**
```bash
git add supabase/migrations/00220_mesocycle_week_offset.sql
git commit -m "feat(§358): colonne week_offset + backfill méso ajusté de François"
```

---

## Task 2: API `setMesocycleWeekOffset` + type `StrengthMesocycle.week_offset` (TDD)

**Files:** Modify `src/lib/api/strength-mesocycles.ts`, `src/lib/api/types.ts`, `src/lib/api/index.ts` (export), test `src/lib/api/__tests__/strength-mesocycles.test.ts` (ou un nouveau fichier ciblé si plus simple).

- `types.ts` : ajouter `week_offset: number;` à l'interface `StrengthMesocycle` (lecture via `.select('*')` → champ déjà renvoyé, juste à typer).
- `strength-mesocycles.ts` :
```typescript
/** §358 — pose l'offset de progression (semaines déjà faites avant le pivot) sur
 *  un méso ajusté. UPDATE ciblé (RLS coach/admin). No-op si Supabase indispo. */
export async function setMesocycleWeekOffset(mesocycleId: string, weekOffset: number): Promise<void> {
  if (!canUseSupabase()) return;
  assertSupabase(
    await supabase.from('strength_mesocycles').update({ week_offset: weekOffset }).eq('id', mesocycleId),
  );
}
```
- `index.ts` : exporter `setMesocycleWeekOffset`.

**Test (mocké)** : `setMesocycleWeekOffset('m1', 2)` → `supabase.from('strength_mesocycles').update({week_offset:2}).eq('id','m1')` ; no-op si `canUseSupabase()` false. (Mirror le pattern de mock du fichier choisi.)

`tsc 0`. **Commit** `feat(§358): API setMesocycleWeekOffset + type week_offset`.

---

## Task 3: `mesocyclePosition` — param `weekOffset` (pure, TDD)

**Files:** Modify `src/lib/strength/mesocycleProgress.ts` + `src/lib/strength/mesocycleProgress.test.ts`.

**Step 1: Tests (RED)** — ajouter au describe existant :
```typescript
// offset 0 → comportement actuel inchangé (régression)
test('mesocyclePosition — offset 0 inchangé', () => {
  const p = mesocyclePosition('2026-06-01', 4, '2026-06-08'); // semaine 2
  assert.equal(p.weekNumber, 2); assert.equal(p.totalWeeks, 4); assert.equal(p.status, 'active');
});
// offset>0 AVANT le pivot → continuation (jamais upcoming), semaine globale
test('mesocyclePosition — offset 2, avant pivot → continuation Semaine 2/6', () => {
  const p = mesocyclePosition('2026-06-01', 4, '2026-05-25', 2); // elapsed -1 → rawLocal 0 → global 2
  assert.equal(p.totalWeeks, 6); assert.equal(p.weekNumber, 2); assert.equal(p.status, 'active');
});
// offset>0 au pivot (semaine 1 locale) → Semaine 3/6
test('mesocyclePosition — offset 2, pivot → Semaine 3/6', () => {
  const p = mesocyclePosition('2026-06-01', 4, '2026-06-01', 2);
  assert.equal(p.weekNumber, 3); assert.equal(p.totalWeeks, 6); assert.equal(p.status, 'active');
});
// offset>0 après la fin → done
test('mesocyclePosition — offset 2, après fin → done', () => {
  const p = mesocyclePosition('2026-06-01', 4, '2026-07-13', 2); // bien après
  assert.equal(p.status, 'done'); assert.equal(p.weekNumber, 6); assert.equal(p.totalWeeks, 6);
});
```

**Step 2: Implémenter** — étendre la signature + la logique :
```typescript
export function mesocyclePosition(
  startMonday: string,
  totalWeeks: number,
  currentMonday: string,
  weekOffset = 0,
): MesocyclePosition {
  const elapsed = Math.round((parseISOUtc(currentMonday) - parseISOUtc(startMonday)) / MS_PER_WEEK);
  const rawLocal = elapsed + 1;
  const globalTotal = totalWeeks + weekOffset;
  const globalRaw = rawLocal + weekOffset;
  let status: MesocycleStatus;
  if (weekOffset > 0) {
    // continuation : jamais 'upcoming' (le nageur est mi-parcours)
    status = globalRaw > globalTotal ? 'done' : 'active';
  } else {
    status = rawLocal < 1 ? 'upcoming' : rawLocal > totalWeeks ? 'done' : 'active';
  }
  const weekNumber = Math.min(Math.max(globalRaw, 1), globalTotal);
  return { weekNumber, totalWeeks: globalTotal, status };
}
```

**Step 3: GREEN** (+ les tests §341/§342 existants restent verts — appels sans 4ᵉ arg = offset 0). **Commit** `feat(§358): mesocyclePosition globalise via weekOffset`.

---

## Task 4: Affichage bannière — `MyPlanTab` passe l'offset (+ vitest)

**Files:** Modify `src/components/strength/MyPlanTab.tsx` (~ligne 398), test `src/components/strength/MyPlanMesocycleBanner.vitest.tsx`.

- `MyPlanTab` : `const position = mesocyclePosition(planStartMonday, totalWeeks, currentMonday, activeMesocycle.week_offset ?? 0);`. (Le reste des props bannière inchangé ; `weekNumber`/`totalWeeks`/`status` viennent de `position` → déjà globalisés.)
- **Vérifier** que `MyPlanMesocycleBanner` affiche `weekNumber/totalWeeks` tels quels (pas de recomputation) — sinon adapter.
- Vitest `MyPlanMesocycleBanner` (+1) : props `weekNumber=3,totalWeeks=6,status='active'` → rend « Semaine 3 / 6 », barre `aria-valuenow=3`/`valuemax=6`, **pas** « Commence bientôt ». (Le composant a déjà des tests §342 — ajouter le cas.)

`tsc 0`, vitest vert. **Commit** `feat(§358): MyPlanTab passe week_offset → bannière progression globale`.

---

## Task 5: Câblage écriture (ajustement pose l'offset)

**Files:** Modify `src/pages/MesocycleAdjust.tsx`, `src/pages/MesocyclePreview.tsx`.

- `MesocycleAdjust` : dans le payload `eac_pending_mesocycle_params`, ajouter `weekOffset: phaseInfo.weekIndex` (à côté de `adjust: true`, `startDate: pivotMonday`, `targetWeekCount: phaseInfo.weeksRemaining`). (Le type du payload doit accepter `weekOffset?: number`.)
- `MesocyclePreview` : `applyMesocycle(...)` renvoie l'id du nouveau méso. Dans `applyMutation` (chemin succès), **si** `params.adjust && (params.weekOffset ?? 0) > 0` → `await setMesocycleWeekOffset(newMesoId, params.weekOffset)`, puis invalider `["strength-mesocycle-active", effectiveAthleteId]` (déjà invalidé §326 ?). Lire l'id retourné par `applyMesocycle` (vérifier comment `applyMutation.mutationFn` récupère le retour ; sinon `getActiveMesocycle` après apply). Échec de l'UPDATE toléré (try/catch silencieux → offset reste 0).

**Test** : pas de test neuf exigé (logique de glue) ; couvert par T2 (API) + T3 (calcul). Vérifier tsc + la `MesocycleAdjust.vitest`/`MesocyclePreview.vitest` existantes restent vertes (ajouter une assertion `weekOffset` dans le payload si simple).

`tsc 0`. **Commit** `feat(§358): l'ajustement pose week_offset post-apply`.

---

## Task 6: Vérification + doc

- `npx tsc --noEmit` 0 ; `npm run lint` 0 ; `npm test` (node:test + vitest) verts ; `npm run build` OK. **`test:rls`** : l'UPDATE `week_offset` passe par la policy UPDATE existante de `strength_mesocycles` (coach/admin) — pas de policy neuve → pas requis (sauf si l'implémenteur juge utile un test ; sinon documenter « non requis, policy existante »).
- Doc : `implementation-log.md` §358 ; `ROADMAP.md` (+ date) ; `FEATURES_STATUS.md` ; `CLAUDE.md` (Dernier § livré) ; `files-map.md` (si taille `mesocycleProgress.ts` varie >30 %) ; mémoire (limite UX bannière post-ajustement → **résolue**).
- **Commit** doc (targeted). Push uniquement si demandé.

---

## Notes transverses
- Rétrocompat : 4ᵉ param `weekOffset` optionnel (défaut 0) → tous les appels existants de `mesocyclePosition` (§341/§342 + intégration §344) inchangés.
- Offset cumulatif : un 2ᵉ ajustement repart de `phaseInfo.weekIndex` du méso alors actif (qui inclut déjà l'offset précédent dans son décompte de semaines globales — vérifier que `getCurrentMesocyclePhaseInfo` raisonne sur le bon start ; sinon documenter la limite).
- Aucune modif de la RPC apply ni de la matérialisation.
- Checkout partagé : `git add` ciblé, jamais `-A`.
