# Généralisation du crédit-virage aux épreuves multi-virages (§282) — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Étendre le modèle crédit-virage de §281 (limité au 50 m) à toutes les épreuves disposant d'une majoration FFN.

**Architecture:** `turnCreditForShortCourse` devient multi-mur : pour une épreuve `D` en bassin 25 m, les murs supplémentaires vs un bassin 50 m sont à 25, 75, 125 m… (`D/50` murs), chacun crédité de `majoration / (D/50)`, rampé sur 13 m. Le câblage `PaceMatrix` / `export-pace-pdf` voit son gate passer de « épreuve = 50 m » à « majoration FFN définie ». `RATIOS_BASE` et `computeTMax` ne sont pas touchés → vues 50 m et tests §12.x intacts.

**Tech Stack:** TypeScript, React 19, tests `node:test` + `node:assert/strict` (`npm test`).

**Branche :** `main` (workflow projet — voir CLAUDE.md § Déploiement). Design validé : `docs/plans/2026-05-16-generalisation-credit-virage-design.md`.

---

### Task 1: Moteur — `turnCreditForShortCourse` multi-mur

**Files:**
- Modify: `src/lib/paceCalculatorV2.ts` (fonction `turnCreditForShortCourse`)
- Test: `src/__tests__/paceCalculatorV2.test.ts` (describe `turnCreditForShortCourse`)

**Step 1: Réécrire le test obsolète + ajouter les tests multi-mur**

Dans `src/__tests__/paceCalculatorV2.test.ts`, remplacer le test :

```ts
  it("returns 0 for non-50 m events (model scoped to the sprint)", () => {
    assert.equal(turnCreditForShortCourse({ d: 50, D: 100, poolLengthM: 25, majoration_s: 1.50 }), 0);
  });
```

par :

```ts
  it("D=100 — deux murs supplémentaires (25 m, 75 m), majoration partagée", () => {
    // majoration 1.50 → 0.75 par mur
    // d=50 : mur 25 franchi (rampe plafonnée), mur 75 pas atteint → 0.75
    assert.ok(
      Math.abs(turnCreditForShortCourse({ d: 50, D: 100, poolLengthM: 25, majoration_s: 1.50 }) - 0.75) < 1e-9,
    );
    // d=100 : les deux murs franchis → majoration pleine
    assert.equal(turnCreditForShortCourse({ d: 100, D: 100, poolLengthM: 25, majoration_s: 1.50 }), 1.50);
    // d=15 : avant le premier mur → 0
    assert.equal(turnCreditForShortCourse({ d: 15, D: 100, poolLengthM: 25, majoration_s: 1.50 }), 0);
    // d=88 = 75 + 13 : les deux rampes plafonnées → majoration pleine
    assert.equal(turnCreditForShortCourse({ d: 88, D: 100, poolLengthM: 25, majoration_s: 1.50 }), 1.50);
  });

  it("D=200 — quatre murs supplémentaires, majoration pleine à l'arrivée", () => {
    assert.equal(turnCreditForShortCourse({ d: 200, D: 200, poolLengthM: 25, majoration_s: 3.60 }), 3.60);
    // d=25 : au premier mur → 0
    assert.equal(turnCreditForShortCourse({ d: 25, D: 200, poolLengthM: 25, majoration_s: 3.60 }), 0);
    // d=38 = 25 + 13 : 1ʳᵉ rampe plafonnée, autres murs pas atteints → 3.60/4 = 0.90
    assert.ok(
      Math.abs(turnCreditForShortCourse({ d: 38, D: 200, poolLengthM: 25, majoration_s: 3.60 }) - 0.90) < 1e-9,
    );
  });

  it("D=200 — crédit non décroissant sur les lignes de la matrice", () => {
    let prev = -1;
    for (const d of [25, 50, 75, 100, 150, 200]) {
      const c = turnCreditForShortCourse({ d, D: 200, poolLengthM: 25, majoration_s: 3.60 });
      assert.ok(c >= prev, `crédit en baisse à d=${d}`);
      prev = c;
    }
  });
```

Les 6 autres tests `turnCreditForShortCourse` (cas `D=50`) restent inchangés — ils prouvent la rétro-compatibilité.

**Step 2: Lancer les tests, vérifier l'échec**

Run: `node --test --import tsx src/__tests__/paceCalculatorV2.test.ts`
Expected: FAIL sur les 3 nouveaux tests (la fonction actuelle, gatée `D !== 50`, renvoie 0 pour `D=100`/`D=200`). Les 6 tests `D=50` passent toujours.

**Step 3: Implémenter la fonction multi-mur**

Dans `src/lib/paceCalculatorV2.ts`, remplacer le bloc commentaire + fonction `turnCreditForShortCourse` par :

```ts
/**
 * Short-course turn credit (25 m pool).
 *
 * A 25 m pool adds one wall every 50 m of the race vs a 50 m pool — at 25,
 * 75, 125 m … (D/50 extra turns). The pool-length gain (FFN majoration) is
 * shared equally between those turns; each turn's share is banked after its
 * wall, ramping in linearly over the breakout zone. The race up to the first
 * extra wall (25 m) stays identical to the 50 m-pool race.
 *
 * Returns the seconds to SUBTRACT from the long-course split. Returns 0 for
 * the 50 m pool and when no majoration is available.
 */
export function turnCreditForShortCourse(args: {
  d: number;
  D: number;
  poolLengthM: number;
  majoration_s: number;
}): number {
  const { d, D, poolLengthM, majoration_s } = args;
  if (poolLengthM !== 25 || majoration_s <= 0) return 0;
  const extraTurns = Math.round(D / 50);
  if (extraTurns < 1) return 0;
  const creditPerTurn = majoration_s / extraTurns;
  let credit = 0;
  for (let k = 0; k < extraTurns; k++) {
    const wall = 50 * k + 25; // walls a 25 m pool adds: 25, 75, 125 …
    if (d > wall) {
      credit += creditPerTurn * Math.min(1, (d - wall) / TURN_RAMP_M);
    }
  }
  return credit;
}
```

`TURN_RAMP_M = 13` (constante existante) est conservée telle quelle.

**Step 4: Lancer les tests, vérifier le succès**

Run: `node --test --import tsx src/__tests__/paceCalculatorV2.test.ts`
Expected: PASS — tous les tests `turnCreditForShortCourse` (6 §281 + 3 nouveaux) verts.

**Step 5: Commit**

```bash
git add src/lib/paceCalculatorV2.ts src/__tests__/paceCalculatorV2.test.ts
git commit -m "$(cat <<'EOF'
feat(§282): turnCreditForShortCourse multi-mur

Le crédit-virage se généralise à toutes les épreuves : D/50 virages
supplémentaires (murs à 50k+25), crédit = majoration FFN / N par virage.
D=50 inchangé (1 virage).

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Câblage écran — `PaceMatrix.tsx`

**Files:**
- Modify: `src/components/coach/pace/PaceMatrix.tsx`
- Test: `src/components/coach/pace/__tests__/PaceMatrix.test.tsx`

**Step 1: Écrire le test d'intégration 100 m**

Dans `src/components/coach/pace/__tests__/PaceMatrix.test.tsx`, ajouter avant le test `"distance cible (d=D) présente comme ligne dans le tableau"` :

```ts
  it("verrouille la 1ère longueur d'un 100 m : 15 m/25 m identiques entre bassins", () => {
    // 100 m en 1'00 grand bassin ; équivalent FFN 25 m = 60.00 − 1.50 = 58.50 s
    const longCourse = render({
      ...BASE_PROPS, targetPool: "50m", targetTimeMs: 60_000,
      targetDistanceM: 100, stroke: "crawl",
    });
    const shortCourse = render({
      ...BASE_PROPS, targetPool: "25m", targetTimeMs: 58_500,
      targetDistanceM: 100, stroke: "crawl",
    });
    for (const html of [longCourse, shortCourse]) {
      assert.ok(html.includes(">6.8<"), "split 15 m MAX = 6.8 attendu");
      assert.ok(html.includes(">12.8<"), "split 25 m MAX = 12.8 attendu");
    }
    assert.ok(shortCourse.includes(">58.5<"), "cible 25 m = 58.5 attendue");
  });
```

**Step 2: Lancer le test, vérifier l'échec**

Run: `node --test --import tsx src/components/coach/pace/__tests__/PaceMatrix.test.tsx`
Expected: FAIL — le gate actuel `isSprintTurnModel = targetDistanceM === 50` exclut le 100 m ; `shortCourse` affiche les valeurs ré-étirées (15 m ≈ 6.7, pas 6.8).

**Step 3: Généraliser le gate**

Dans `src/components/coach/pace/PaceMatrix.tsx`, remplacer le bloc :

```ts
  // Turn-credit model — the 50 m sprint pace curve is anchored in long course;
  // the 25 m-pool curve locks the first length and banks the pool gain after
  // the wall. See turnCreditForShortCourse / docs/pace-calculator-scenarios.md.
  const isSprintTurnModel = targetDistanceM === 50;
  const lcTargetMs = isSprintTurnModel
    ? convertTargetTime({
        targetTimeMs,
        fromPool: targetPool,
        toPool: "50m",
        stroke: poolStroke,
        distanceM: targetDistanceM,
        sex: swimmerSex,
      }) ?? targetTimeMs
    : targetTimeMs;
  const sprintMajorationMs = isSprintTurnModel
    ? getPoolMajorationMs(poolStroke, targetDistanceM, swimmerSex ?? null) ?? 0
    : 0;
```

par :

```ts
  // Turn-credit model — the pace curve is anchored in long course; the 25 m-pool
  // curve locks the first length and banks the pool gain after each extra wall.
  // Active for every event with an FFN majoration. See turnCreditForShortCourse
  // / docs/pace-calculator-scenarios.md.
  const turnMajorationMs = getPoolMajorationMs(
    poolStroke,
    targetDistanceM,
    swimmerSex ?? null,
  );
  const isTurnModelEvent = turnMajorationMs !== null;
  const lcTargetMs = isTurnModelEvent
    ? convertTargetTime({
        targetTimeMs,
        fromPool: targetPool,
        toPool: "50m",
        stroke: poolStroke,
        distanceM: targetDistanceM,
        sex: swimmerSex,
      }) ?? targetTimeMs
    : targetTimeMs;
```

Puis dans `cellTimeStr`, remplacer `isSprintTurnModel` par `isTurnModelEvent` et l'appel `turnCreditForShortCourse` — remplacer le bloc :

```ts
      const tMax = isSprintTurnModel
        ? computeTMax({
            Tobj_s: lcTargetMs / 1000,
            D: targetDistanceM,
            d,
            stroke: stroke as SingleStroke,
            adjustmentOverrides: strokeAdjustments as StrokeAdjustmentOverrides,
          }) -
          turnCreditForShortCourse({
            d,
            D: targetDistanceM,
            poolLengthM: viewPool === "25m" ? 25 : 50,
            majoration_s: sprintMajorationMs / 1000,
          })
        : computeTMax({
```

par :

```ts
      const tMax = isTurnModelEvent
        ? computeTMax({
            Tobj_s: lcTargetMs / 1000,
            D: targetDistanceM,
            d,
            stroke: stroke as SingleStroke,
            adjustmentOverrides: strokeAdjustments as StrokeAdjustmentOverrides,
          }) -
          turnCreditForShortCourse({
            d,
            D: targetDistanceM,
            poolLengthM: viewPool === "25m" ? 25 : 50,
            majoration_s: (turnMajorationMs ?? 0) / 1000,
          })
        : computeTMax({
```

**Step 4: Lancer le test + le type check, vérifier le succès**

Run: `node --test --import tsx src/components/coach/pace/__tests__/PaceMatrix.test.tsx`
Expected: PASS — 11 tests verts.
Run: `npx tsc --noEmit`
Expected: aucune erreur hors `*.stories.tsx` pré-existants.

**Step 5: Commit**

```bash
git add src/components/coach/pace/PaceMatrix.tsx src/components/coach/pace/__tests__/PaceMatrix.test.tsx
git commit -m "$(cat <<'EOF'
feat(§282): PaceMatrix — crédit-virage pour toutes les épreuves FFN

Le gate passe de « épreuve = 50 m » à « majoration FFN définie ».

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Câblage PDF — `export-pace-pdf.ts`

**Files:**
- Modify: `src/lib/export-pace-pdf.ts` (fonction `drawSingleSection`)

Pas de nouveau test : la logique du crédit est couverte par les tests unitaires de Task 1, et le contenu du PDF (Blob binaire) n'est pas assertable. Le câblage est garanti par les tests de fumée existants (`src/lib/__tests__/export-pace-pdf.test.ts` — dont « cible 100 NL outputPool=50m » et « cible 50 NL outputPool=25m ») + la suite complète.

**Step 1: Généraliser le gate**

Dans `src/lib/export-pace-pdf.ts`, dans `drawSingleSection`, remplacer le bloc :

```ts
  // Turn-credit model — mirror PaceMatrix: lock the first length, bank the
  // pool gain after the wall (50 m sprint only). See turnCreditForShortCourse.
  const isSprintTurnModel = target_distance_m === 50;
  const lcTimeMs = isSprintTurnModel
    ? convertTargetTime({
        targetTimeMs: target.target_time_ms,
        fromPool: target.target_pool_size ?? "50m",
        toPool: "50m",
        stroke: stroke as Stroke,
        distanceM: target_distance_m,
        sex,
      }) ?? effectiveTimeMs
    : effectiveTimeMs;
  const sprintMajorationMs = isSprintTurnModel
    ? getPoolMajorationMs(stroke as Stroke, target_distance_m, sex) ?? 0
    : 0;
```

par :

```ts
  // Turn-credit model — mirror PaceMatrix: lock the first length, bank the pool
  // gain after each extra wall. Active for every event with an FFN majoration.
  const turnMajorationMs = getPoolMajorationMs(stroke as Stroke, target_distance_m, sex);
  const isTurnModelEvent = turnMajorationMs !== null;
  const lcTimeMs = isTurnModelEvent
    ? convertTargetTime({
        targetTimeMs: target.target_time_ms,
        fromPool: target.target_pool_size ?? "50m",
        toPool: "50m",
        stroke: stroke as Stroke,
        distanceM: target_distance_m,
        sex,
      }) ?? effectiveTimeMs
    : effectiveTimeMs;
```

Puis dans le `distRows.map`, remplacer le bloc :

```ts
    const tMax_s = isSprintTurnModel
      ? computeTMax({
          Tobj_s: lcTimeMs / 1000,
          D: target_distance_m,
          d,
          stroke: singleStroke,
          adjustmentOverrides: strokeAdjustments as Record<SingleStroke, Partial<Record<EventFamily, number>>>,
        }) -
        turnCreditForShortCourse({
          d,
          D: target_distance_m,
          poolLengthM: effectivePool === "25m" ? 25 : 50,
          majoration_s: sprintMajorationMs / 1000,
        })
      : computeTMax({
```

par :

```ts
    const tMax_s = isTurnModelEvent
      ? computeTMax({
          Tobj_s: lcTimeMs / 1000,
          D: target_distance_m,
          d,
          stroke: singleStroke,
          adjustmentOverrides: strokeAdjustments as Record<SingleStroke, Partial<Record<EventFamily, number>>>,
        }) -
        turnCreditForShortCourse({
          d,
          D: target_distance_m,
          poolLengthM: effectivePool === "25m" ? 25 : 50,
          majoration_s: (turnMajorationMs ?? 0) / 1000,
        })
      : computeTMax({
```

**Step 2: Lancer les tests de fumée PDF + le type check**

Run: `node --test --import tsx --experimental-test-module-mocks src/lib/__tests__/export-pace-pdf.test.ts src/__tests__/export-pace-pdf.test.ts`
Expected: PASS — tous les tests de fumée verts (Blob non vide).
Run: `npx tsc --noEmit`
Expected: aucune erreur hors `*.stories.tsx`.

**Step 3: Commit**

```bash
git add src/lib/export-pace-pdf.ts
git commit -m "$(cat <<'EOF'
feat(§282): export-pace-pdf — crédit-virage pour toutes les épreuves FFN

Même gate que PaceMatrix : « majoration FFN définie ».

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Documentation §282

**Files:**
- Modify: `docs/implementation-log.md` (nouvelle entrée §282 en tête, après la ligne **Règle**)
- Modify: `docs/ROADMAP.md` (ligne `Dernière mise à jour` → §282 ; §281 devient `Précédente`)
- Modify: `docs/FEATURES_STATUS.md` (ligne « Calculateur d'allures » — mentionner §282)
- Modify: `CLAUDE.md` (ligne `Dernier § livré` → §282)
- Modify: `docs/claude/files-map.md` (uniquement si une taille dérive de > 30 %)
- Modify: `docs/pace-calculator-scenarios.md` (§6 — retirer « limité au 50 m »)

**Step 1: Mesurer les tailles de fichiers**

Run: `wc -l src/lib/paceCalculatorV2.ts src/components/coach/pace/PaceMatrix.tsx src/lib/export-pace-pdf.ts`
Mettre à jour `files-map.md` uniquement pour les fichiers dont la taille dérive de > 30 % vs la valeur enregistrée (règle CLAUDE.md). Mentionner §282 dans les descriptions des 3 fichiers (à côté de §281).

**Step 2: Rédiger l'entrée `implementation-log.md` §282**

Suivre le format des entrées existantes (Contexte, Fix, Fichiers modifiés, Tests, Décisions, Limites). Points clés à couvrir :
- Généralisation de §281 ; `turnCreditForShortCourse` multi-mur ; gate `isTurnModelEvent`.
- Couverture : 100/200 m (4 nages) + 400/800/1500 m (crawl).
- Test §281 `"returns 0 for non-50 m events"` réécrit (changement voulu, pas une régression).
- `computeTMax` / `RATIOS_BASE` non touchés → tests §12.x intacts.
- Tests RLS non lancés (patch UI/calcul pur).
- Limites : rampe `TURN_RAMP_M` uniforme ; 4N hors scope.

**Step 3: Mettre à jour `ROADMAP.md`, `FEATURES_STATUS.md`, `CLAUDE.md`, `pace-calculator-scenarios.md`**

- `ROADMAP.md` : nouvelle ligne `Dernière mise à jour : §282 …`, §280 reste, §281 devient `Précédente`.
- `FEATURES_STATUS.md` : compléter la ligne « Calculateur d'allures (matrice zones) » — « §282 — modèle crédit-virage généralisé aux épreuves multi-virages ».
- `CLAUDE.md` : `Dernier § livré : **§282** — …`.
- `docs/pace-calculator-scenarios.md` §6 : remplacer le dernier paragraphe (« Ce modele est aujourd'hui limite au 50 m… ») par une formulation multi-mur (le crédit se répartit sur D/50 virages ; seul le 4N reste hors modèle).

**Step 4: Commit**

```bash
git add docs/implementation-log.md docs/ROADMAP.md docs/FEATURES_STATUS.md CLAUDE.md docs/claude/files-map.md docs/pace-calculator-scenarios.md
git commit -m "$(cat <<'EOF'
docs(§282): journal, roadmap, features, files-map, scénarios

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: Vérification finale & push

**Step 1: Suite de tests complète**

Run: `npm test`
Expected: 0 fail. Le total monte de ~4 tests vs §281 (3 nouveaux dans Task 1 + 1 dans Task 2 ; le test réécrit de Task 1 ne change pas le compte).

**Step 2: Type check**

Run: `npx tsc --noEmit`
Expected: aucune erreur hors `*.stories.tsx` pré-existants.

**Step 3: Push**

```bash
git push origin main
```

Vérifier que le workflow GitHub Actions de déploiement se déclenche (CLAUDE.md § Déploiement).

---

## Notes

- **DRY** : toute la logique de crédit vit dans `turnCreditForShortCourse` ; `PaceMatrix` et `export-pace-pdf` ne font que router.
- **YAGNI** : rampe uniforme 13 m, pas de rampe par famille ; pas d'override « qualité de virage » par nageur.
- **TDD** : chaque tâche de code écrit le test, le voit échouer, implémente, le voit passer.
- **Pas de tests RLS** : patch purement UI/calcul (critères CLAUDE.md § Tests RLS).
