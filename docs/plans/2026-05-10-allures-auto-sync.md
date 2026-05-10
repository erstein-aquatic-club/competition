# Auto-sync objectifs chronométriques → Allures équipe — Plan d'implémentation

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Quand le coach ouvre l'onglet « Allures équipe », les nageurs dont les objectifs chronométriques n'ont pas encore de cible d'allure correspondante reçoivent celle-ci automatiquement et silencieusement.

**Architecture:** Un `useEffect` dans `CoachPaceCalculatorScreen` se déclenche une seule fois après le chargement initial de l'équipe et des cibles. Il récupère les objectifs + le mapping auth_uid→accountId, calcule les ops manquantes via une pure function exportable `buildObjectiveSyncOps`, puis upsert silencieusement. Aucune migration, aucun nouveau fichier.

**Tech Stack:** React 19, TypeScript, React Query 5, Supabase JS client, Vitest.

---

### Task 1 : Extraire et exporter `buildObjectiveSyncOps` + ses types

**Files:**
- Modify: `src/pages/coach/CoachPaceCalculatorScreen.tsx` (après les imports existants, avant `CoachPaceCalculatorScreen`)

**Step 1 : Ajouter les imports manquants**

Dans `CoachPaceCalculatorScreen.tsx`, ligne 1, ajouter `useRef` au destructuring React :

```typescript
import { useState, useMemo, useEffect, useRef } from "react";
```

Après la ligne 20 (`import { listMyPaceTargets... }`), ajouter :

```typescript
import { supabase } from "@/lib/supabase";
import { getObjectives } from "@/lib/api";
import { parseObjectiveForPace, shouldAutoSyncToPaceTarget } from "@/lib/objective-pace-link";
import type { Objective } from "@/lib/api/types";
```

**Step 2 : Ajouter le type `ObjectiveSyncOp` et la fonction pure**

Juste avant la ligne `const FAMILIES: EventFamily[] = ...`, insérer :

```typescript
export type ObjectiveSyncOp = {
  ref: SwimmerRef;
  stroke: PaceTarget["stroke"];
  target_distance_m: number;
  target_time_ms: number;
  target_pool_size: PaceTarget["target_pool_size"];
};

/**
 * Calcule les upserts de cibles d'allures manquantes à partir des objectifs
 * chronométriques. Pure function — testable sans Supabase.
 *
 * Règles :
 * - Ignore les objectifs sans target_time_seconds
 * - Ignore les event_code non-FFN (parseObjectiveForPace → null)
 * - Ignore si une cible (nage + distance + bassin) existe déjà (ne pas écraser)
 * - Ignore si le nageur n'est pas dans l'équipe (auth_uid absent du Map)
 */
export function buildObjectiveSyncOps(
  objectives: Objective[],
  authUidToAccountId: Map<string, number>,
  existingTargets: PaceTarget[],
): ObjectiveSyncOp[] {
  const ops: ObjectiveSyncOp[] = [];
  for (const obj of objectives) {
    if (obj.target_time_seconds == null) continue;
    const accountId = authUidToAccountId.get(obj.athlete_id ?? "");
    if (accountId == null) continue;
    const parsed = parseObjectiveForPace(obj.event_code, obj.pool_length);
    if (!parsed) continue;
    if (!shouldAutoSyncToPaceTarget(obj, parsed, existingTargets, accountId)) continue;
    ops.push({
      ref: { kind: "account", accountId },
      stroke: parsed.stroke,
      target_distance_m: parsed.distance,
      target_time_ms: obj.target_time_seconds * 1000,
      target_pool_size: parsed.pool_size,
    });
  }
  return ops;
}
```

**Step 3 : Vérifier le build TypeScript**

```bash
npx tsc --noEmit 2>&1 | head -20
```

Résultat attendu : aucune erreur liée aux nouveaux imports ou à `buildObjectiveSyncOps`.

**Step 4 : Commit**

```bash
git add src/pages/coach/CoachPaceCalculatorScreen.tsx
git commit -m "feat: export buildObjectiveSyncOps pure function pour auto-sync objectifs"
```

---

### Task 2 : Tests unitaires de `buildObjectiveSyncOps`

**Files:**
- Modify: `src/pages/coach/__tests__/CoachPaceCalculatorScreen.test.tsx`

**Step 1 : Écrire les tests (ajouter à la fin du fichier)**

```typescript
describe("buildObjectiveSyncOps — auto-sync objectifs → pace targets", () => {
  const makeTarget = (accountId: number, stroke: string, distance: number, pool = "50m"): PaceTarget => ({
    id: `t-${accountId}-${stroke}-${distance}`,
    coach_id: "coach1",
    swimmer_account_id: accountId,
    swimmer_manual_id: null,
    stroke: stroke as PaceTarget["stroke"],
    target_distance_m: distance,
    target_time_ms: 60000,
    target_pool_size: pool as PaceTarget["target_pool_size"],
    updated_at: "2026-01-01",
  });

  const makeObjective = (
    authUid: string,
    eventCode: string | null,
    poolLength: number | null,
    targetTimeSeconds: number | null,
  ) => ({
    id: `obj-${authUid}`,
    athlete_id: authUid,
    competition_ids: [],
    event_code: eventCode,
    pool_length: poolLength,
    target_time_seconds: targetTimeSeconds,
  });

  it("génère un op pour un objectif valide sans cible existante", async () => {
    const { buildObjectiveSyncOps } = await import("../CoachPaceCalculatorScreen");
    const map = new Map([["uuid-1", 42]]);
    const objectives = [makeObjective("uuid-1", "100NL", 50, 60)];
    const ops = buildObjectiveSyncOps(objectives, map, []);
    expect(ops).toHaveLength(1);
    expect(ops[0]).toMatchObject({
      ref: { kind: "account", accountId: 42 },
      stroke: "NL",
      target_distance_m: 100,
      target_time_ms: 60000,
      target_pool_size: "50m",
    });
  });

  it("ignore un objectif sans target_time_seconds", async () => {
    const { buildObjectiveSyncOps } = await import("../CoachPaceCalculatorScreen");
    const map = new Map([["uuid-1", 42]]);
    const objectives = [makeObjective("uuid-1", "100NL", 50, null)];
    const ops = buildObjectiveSyncOps(objectives, map, []);
    expect(ops).toHaveLength(0);
  });

  it("ignore un objectif avec event_code invalide", async () => {
    const { buildObjectiveSyncOps } = await import("../CoachPaceCalculatorScreen");
    const map = new Map([["uuid-1", 42]]);
    const objectives = [makeObjective("uuid-1", "TRIATHLON", 50, 120)];
    const ops = buildObjectiveSyncOps(objectives, map, []);
    expect(ops).toHaveLength(0);
  });

  it("ignore un objectif si une cible identique existe déjà", async () => {
    const { buildObjectiveSyncOps } = await import("../CoachPaceCalculatorScreen");
    const map = new Map([["uuid-1", 42]]);
    const objectives = [makeObjective("uuid-1", "100NL", 50, 60)];
    const existingTargets = [makeTarget(42, "NL", 100, "50m")];
    const ops = buildObjectiveSyncOps(objectives, map, existingTargets);
    expect(ops).toHaveLength(0);
  });

  it("ignore un objectif si le nageur n'est pas dans l'équipe", async () => {
    const { buildObjectiveSyncOps } = await import("../CoachPaceCalculatorScreen");
    const map = new Map<string, number>(); // équipe vide
    const objectives = [makeObjective("uuid-orphan", "200DOS", 25, 130)];
    const ops = buildObjectiveSyncOps(objectives, map, []);
    expect(ops).toHaveLength(0);
  });

  it("convertit pool_length 25 → '25m'", async () => {
    const { buildObjectiveSyncOps } = await import("../CoachPaceCalculatorScreen");
    const map = new Map([["uuid-2", 7]]);
    const objectives = [makeObjective("uuid-2", "200DOS", 25, 130)];
    const ops = buildObjectiveSyncOps(objectives, map, []);
    expect(ops[0].target_pool_size).toBe("25m");
  });

  it("traite plusieurs objectifs d'une même équipe correctement", async () => {
    const { buildObjectiveSyncOps } = await import("../CoachPaceCalculatorScreen");
    const map = new Map([["uuid-a", 1], ["uuid-b", 2]]);
    const objectives = [
      makeObjective("uuid-a", "100NL", 50, 60),   // valide
      makeObjective("uuid-a", "200NL", 50, null),  // pas de temps → skip
      makeObjective("uuid-b", "50BR", 25, 35),     // valide
      makeObjective("uuid-c", "400QN", 50, 260),   // hors équipe → skip
    ];
    const ops = buildObjectiveSyncOps(objectives, map, []);
    expect(ops).toHaveLength(2);
    expect(ops.map((o) => o.ref.kind === "account" && o.ref.accountId)).toEqual([1, 2]);
  });
});
```

**Step 2 : Lancer les tests**

```bash
npm test -- --reporter=verbose CoachPaceCalculatorScreen 2>&1 | tail -30
```

Résultat attendu : tous les tests du fichier passent (les anciens + les nouveaux).

**Step 3 : Commit**

```bash
git add src/pages/coach/__tests__/CoachPaceCalculatorScreen.test.tsx
git commit -m "test: buildObjectiveSyncOps — cas limites auto-sync objectifs"
```

---

### Task 3 : Ajouter le `useEffect` de sync au montage

**Files:**
- Modify: `src/pages/coach/CoachPaceCalculatorScreen.tsx` — dans le corps du composant `CoachPaceCalculatorScreen`

**Step 1 : Ajouter le ref et le useEffect**

Dans le composant `CoachPaceCalculatorScreen`, juste **après** la déclaration des `useState` existants (ligne ~136 : `const [openSwimmerIds, setOpenSwimmerIds] = useState<string[]>([]);`), insérer :

```typescript
// Auto-sync : objectifs chronométriques → cibles d'allures (§260)
// S'exécute une fois après le chargement initial. Silent best-effort.
const hasSyncedObjectivesRef = useRef(false);
useEffect(() => {
  if (teamLoading || targetsQuery.isLoading) return;
  if (hasSyncedObjectivesRef.current) return;
  hasSyncedObjectivesRef.current = true;

  const accountIds = team
    .filter((m): m is Extract<typeof m, { kind: "account" }> => m.kind === "account")
    .map((m) => m.accountId);
  if (accountIds.length === 0) return;

  const run = async () => {
    try {
      const [{ data: userRows }, objectives] = await Promise.all([
        supabase.from("users").select("id, auth_uid").in("id", accountIds),
        getObjectives(),
      ]);
      const authUidToAccountId = new Map<string, number>();
      for (const row of userRows ?? []) {
        if (row.auth_uid) authUidToAccountId.set(row.auth_uid, row.id);
      }
      const ops = buildObjectiveSyncOps(objectives, authUidToAccountId, targets);
      if (ops.length === 0) return;
      await Promise.all(
        ops.map((op) =>
          upsertPaceTarget({
            swimmer: op.ref,
            stroke: op.stroke,
            target_distance_m: op.target_distance_m,
            target_time_ms: op.target_time_ms,
            target_pool_size: op.target_pool_size,
          }),
        ),
      );
      qc.invalidateQueries({ queryKey: ["pace-targets"] });
    } catch {
      // silent — best-effort sync
    }
  };
  void run();
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [teamLoading, targetsQuery.isLoading]);
```

**Note :** La dépendance eslint est intentionnellement limitée à `[teamLoading, targetsQuery.isLoading]`. Le `hasSyncedObjectivesRef` garantit qu'on ne sync qu'une fois par montage. Les variables `team`, `targets`, `qc` sont stables (React Query + hooks) mais les inclure déclencherait des re-syncs non désirés.

**Step 2 : Vérifier le build TypeScript**

```bash
npx tsc --noEmit 2>&1 | head -20
```

Résultat attendu : aucune erreur.

**Step 3 : Lancer la suite de tests complète**

```bash
npm test -- --reporter=verbose 2>&1 | tail -40
```

Résultat attendu : tous les tests passent (pré-existants inclus). En particulier, `CoachPaceCalculatorScreen.test.tsx` doit être vert intégralement.

**Step 4 : Commit**

```bash
git add src/pages/coach/CoachPaceCalculatorScreen.tsx
git commit -m "feat(§260): auto-sync objectifs chronométriques → allures équipe au montage"
```

---

### Task 4 : Documentation et mise à jour des fichiers de suivi

**Files:**
- Modify: `docs/implementation-log.md` — ajouter l'entrée §260
- Modify: `docs/ROADMAP.md` — mettre à jour le statut du chantier
- Modify: `CLAUDE.md` — mettre à jour la ligne "Dernier § livré"

**Step 1 : Ajouter l'entrée dans `docs/implementation-log.md`**

En tête du fichier (après le premier titre `#`), insérer :

```markdown
## §260 — Auto-sync objectifs chronométriques → Allures équipe

**Date :** 2026-05-10
**Chantier :** Feature autonome (cross-chantier objectifs + allures)

### Contexte
Le mécanisme `autoSyncPaceTarget` dans `SwimmerObjectivesTab` ne couvrait pas le cas
où les objectifs existaient avant ce mécanisme ou avaient été créés côté nageur.
Quand le coach ouvrait « Allures équipe » directement, aucune cible n'était générée.

### Changements
- `CoachPaceCalculatorScreen.tsx` : ajout imports (`supabase`, `getObjectives`,
  `parseObjectiveForPace`, `shouldAutoSyncToPaceTarget`, `useRef`, `Objective`),
  extraction de `buildObjectiveSyncOps` (pure function exportée), ajout du
  `useEffect` de sync au montage (gated par `hasSyncedObjectivesRef`).
- `CoachPaceCalculatorScreen.test.tsx` : 7 nouveaux tests pour `buildObjectiveSyncOps`.

### Décisions
- Pure function extractée pour testabilité sans Supabase mock.
- `hasSyncedObjectivesRef` évite les re-syncs si le composant se re-rend.
- Ne pas écraser les cibles existantes (shouldAutoSyncToPaceTarget retourne false si
  une cible (nage + distance + bassin) existe déjà).
- Erreurs silencieuses — best-effort, cohérent avec le pattern existant.

### Limites
- Le sync est côté frontend (N appels `upsertPaceTarget`). Pour une équipe de 30
  nageurs avec 3 objectifs chacun = max 90 upserts au premier chargement.
  Sur les visites suivantes : 0 upsert (toutes les cibles existent déjà).
- Le sync ne se déclenche pas si le coach change d'équipe (coach selector) en cours
  de session — acceptable pour la V1.
```

**Step 2 : Mettre à jour `CLAUDE.md`**

Modifier la ligne `Dernier § livré` :

```
Dernier § livré : **§260** — Auto-sync objectifs chronométriques → cibles allures équipe.
```

**Step 3 : Commit doc**

```bash
git add docs/implementation-log.md docs/ROADMAP.md CLAUDE.md
git commit -m "docs: §260 auto-sync objectifs → allures équipe"
```

---

## Vérification finale

```bash
npm test 2>&1 | tail -20
npx tsc --noEmit 2>&1 | head -10
```

Les deux commandes doivent retourner 0 erreur.
