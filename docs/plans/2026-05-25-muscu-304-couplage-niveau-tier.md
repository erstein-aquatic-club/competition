# §304 — Couplage niveau ↔ tier + cohérence traction lestée — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Rendre la désynchronisation tier↔niveau visible/corrigeable en 1 clic, et rendre la traction lestée prescriptible dès l'intermédiaire (fix de l'écart GA de l'audit 100 m H élite).

**Architecture:** Deux pièces indépendantes. (1) UI pure : un helper de détection sans état + un encart d'alerte avec bouton d'alignement dans la carte de profil coach, et un bandeau lecture-seule dans l'aperçu du mésocycle. (2) Migration de données : re-tag d'un exercice du catalogue (`advanced → intermediate`). Aucune table/policy nouvelle.

**Tech Stack:** React 19 + TypeScript, Tailwind, Radix/shadcn, React Query, Vitest, Supabase (migration via MCP).

**Conception validée :** `docs/plans/2026-05-25-muscu-304-couplage-niveau-tier-design.md`.

**Note UI/UX :** les deux ajouts d'interface **réutilisent des patterns existants** (composant `NoteStrip` de `MesocyclePreview.tsx` et classes Tailwind de la carte). Aucun design nouveau. Si un traitement visuel sur-mesure est souhaité, lancer `/frontend-design` — sinon suivre les classes fournies ici.

---

## Setup : branche de travail

On est sur `main`. Créer une branche avant tout commit.

**Step 1 :** `git checkout -b feat/304-couplage-niveau-tier`

---

### Task 1 : Helper de détection du profil sous-calibré (TDD)

**Files:**
- Create: `src/lib/strength/strengthProfileMismatch.ts`
- Test: `src/lib/strength/__tests__/strengthProfileMismatch.test.ts`

**Step 1 : Écrire le test qui échoue**

`src/lib/strength/__tests__/strengthProfileMismatch.test.ts` :

```ts
import { describe, it, expect } from 'vitest';
import {
  hasUnderLeveledProfile,
  RECOMMENDED_LEVEL_FOR_TIER,
} from '../strengthProfileMismatch';

describe('hasUnderLeveledProfile', () => {
  it('signale national/élite quand le niveau est sous "advanced"', () => {
    expect(hasUnderLeveledProfile('intermediate', 'national')).toBe(true);
    expect(hasUnderLeveledProfile('beginner', 'national')).toBe(true);
    expect(hasUnderLeveledProfile('intermediate', 'elite')).toBe(true);
    expect(hasUnderLeveledProfile('beginner', 'elite')).toBe(true);
  });

  it('ne signale pas quand le niveau est "advanced"', () => {
    expect(hasUnderLeveledProfile('advanced', 'national')).toBe(false);
    expect(hasUnderLeveledProfile('advanced', 'elite')).toBe(false);
  });

  it('ne signale pas club/régional (sens unique)', () => {
    for (const lvl of ['beginner', 'intermediate', 'advanced'] as const) {
      expect(hasUnderLeveledProfile(lvl, 'club')).toBe(false);
      expect(hasUnderLeveledProfile(lvl, 'regional')).toBe(false);
    }
  });

  it('recommande "advanced" pour national et élite', () => {
    expect(RECOMMENDED_LEVEL_FOR_TIER.national).toBe('advanced');
    expect(RECOMMENDED_LEVEL_FOR_TIER.elite).toBe('advanced');
  });
});
```

**Step 2 : Lancer le test, vérifier l'échec**

Run: `npx vitest run src/lib/strength/__tests__/strengthProfileMismatch.test.ts`
Expected: FAIL — `Cannot find module '../strengthProfileMismatch'`.

**Step 3 : Implémenter le helper minimal**

`src/lib/strength/strengthProfileMismatch.ts` :

```ts
/**
 * Détection du profil muscu « sous-calibré » : ambition de performance élevée
 * (tier national/élite) mais niveau de pratique resté sous « confirmé »
 * (advanced) → le pool d'exercices avancés (tractions lestées, haltérophilie,
 * pliométrie avancée) n'est jamais servi par `selectExercises`. §304 (écart GA
 * de l'audit 2026-05-25). Helper pur, sans état.
 */
import type { PerformanceTier } from '@/lib/strength/kpiBaremes';

export type { PerformanceTier };
export type PracticeLevel = 'beginner' | 'intermediate' | 'advanced';

/** Niveau de pratique recommandé pour exploiter pleinement un tier donné. */
export const RECOMMENDED_LEVEL_FOR_TIER: Record<PerformanceTier, PracticeLevel> = {
  club: 'beginner', // pas de contrainte
  regional: 'intermediate',
  national: 'advanced',
  elite: 'advanced',
};

/**
 * `true` quand l'ambition de performance dépasse le niveau d'exercices :
 * tier ∈ {national, elite} ET niveau ≠ advanced. Sens unique — l'inverse
 * (niveau élevé / tier bas) n'est pas un problème et n'est pas signalé.
 */
export function hasUnderLeveledProfile(
  level: PracticeLevel,
  tier: PerformanceTier,
): boolean {
  return (tier === 'national' || tier === 'elite') && level !== 'advanced';
}
```

**Step 4 : Lancer le test, vérifier le succès**

Run: `npx vitest run src/lib/strength/__tests__/strengthProfileMismatch.test.ts`
Expected: PASS (4 tests).

**Step 5 : Commit**

```bash
git add src/lib/strength/strengthProfileMismatch.ts src/lib/strength/__tests__/strengthProfileMismatch.test.ts
git commit -m "feat(§304): helper hasUnderLeveledProfile (détection profil sous-calibré)"
```

---

### Task 2 : Re-tag *Tractions lestées* → `intermediate` (migration MCP)

**Files:**
- Create: `supabase/migrations/00192_retag_tractions_lestees_intermediate.sql`

**Step 1 : Écrire le fichier de migration**

`supabase/migrations/00192_retag_tractions_lestees_intermediate.sql` :

```sql
-- 00192_retag_tractions_lestees_intermediate.sql
-- §304 (écart GA) — cohérence KPI ↔ prescription. Le KPI weighted_pullup est
-- mesuré dès l'intermédiaire ; l'unique exo de traction lestée doit l'être
-- aussi. Tractions lestées (id 13) : advanced → intermediate.
-- Design : docs/plans/2026-05-25-muscu-304-couplage-niveau-tier-design.md §3.
BEGIN;

UPDATE dim_exercices
  SET level = 'intermediate'
  WHERE id = 13 AND nom_exercice = 'Tractions lestées';

COMMIT;
```

**Step 2 : Appliquer via MCP Supabase** (jamais `db push`/dashboard — cf. `CLAUDE.md`)

Outil : `mcp__plugin_supabase_supabase__apply_migration`
- `project_id`: `fscnobivsgornxdwqwlk`
- `name`: `retag_tractions_lestees_intermediate`
- `query`: le contenu SQL ci-dessus.

**Step 3 : Vérifier l'effet en base**

Outil : `mcp__plugin_supabase_supabase__execute_sql`
```sql
SELECT id, nom_exercice, bucket, level, is_core
FROM dim_exercices WHERE id = 13;
```
Expected: une ligne, `level = 'intermediate'`, `bucket = 'upper_strength'`, `is_core = true`.

> **Pas de `npm run test:rls`** : simple `UPDATE` de données catalogue, aucune
> policy/helper/rôle touché (règles RLS de `CLAUDE.md`). La logique de gating
> (`selectExercises`, `LEVEL_ORDER`) est déjà couverte ; aucun nouveau test
> moteur requis (l'effet est porté par la donnée, pas le code).

**Step 4 : Commit**

```bash
git add supabase/migrations/00192_retag_tractions_lestees_intermediate.sql
git commit -m "feat(§304): re-tag Tractions lestées advanced→intermediate (cohérence KPI weighted_pullup)"
```

---

### Task 3 : Encart d'alerte + bouton d'alignement (carte de profil coach)

**Files:**
- Modify: `src/components/strength/assessment/StrengthAthleteProfileCard.tsx`

**Step 1 : Ajouter l'import du helper et de l'icône**

En tête de fichier, après l'import `lucide-react` existant (ligne 31, `Check, Loader2, SlidersHorizontal`), ajouter `AlertTriangle` :

```tsx
import { AlertTriangle, Check, Loader2, SlidersHorizontal } from "lucide-react";
```

Et ajouter, sous le bloc d'imports :

```tsx
import { hasUnderLeveledProfile } from "@/lib/strength/strengthProfileMismatch";
```

**Step 2 : Calculer le mismatch**

Dans le composant, après la déclaration de `persist` (ligne ~109), ajouter :

```tsx
const underLeveled = hasUnderLeveledProfile(level, tier);
```

**Step 3 : Rendre l'encart**

Dans le `<>...</>` de la branche non-loading, **après** la `div` du sélecteur
« Niveau de performance » (juste avant la fermeture `</>`, ligne ~213), insérer :

```tsx
{underLeveled && (
  <div className="flex items-start gap-2.5 rounded-md border border-amber-300 bg-amber-50 px-3 py-2.5 text-amber-900 dark:border-amber-800/60 dark:bg-amber-950/30 dark:text-amber-100">
    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
    <div className="min-w-0 space-y-1.5 leading-tight">
      <p className="text-[11px]">
        Niveau «&nbsp;
        {PERFORMANCE_TIERS.find((t) => t.value === tier)?.label}&nbsp;» mais
        pratique «&nbsp;
        {PRACTICE_LEVELS.find((l) => l.value === level)?.label}&nbsp;» : les
        tractions lestées, l'haltérophilie et la pliométrie avancée ne seront
        pas proposées.
      </p>
      <button
        type="button"
        onClick={() => {
          setLevel("advanced");
          persist({ practice_level: "advanced", performance_tier: tier });
        }}
        className="rounded-md border border-amber-400 bg-amber-100 px-2 py-1 text-[11px] font-semibold text-amber-900 transition-colors hover:bg-amber-200 dark:border-amber-700 dark:bg-amber-900/40 dark:text-amber-100"
      >
        Aligner sur Confirmé
      </button>
    </div>
  </div>
)}
```

**Step 4 : Type-check**

Run: `npx tsc --noEmit`
Expected: aucune erreur.

**Step 5 : Commit**

```bash
git add src/components/strength/assessment/StrengthAthleteProfileCard.tsx
git commit -m "feat(§304): encart + bouton « Aligner sur Confirmé » sur la carte profil muscu"
```

---

### Task 4 : Bandeau lecture-seule dans l'aperçu du mésocycle

**Files:**
- Modify: `src/pages/MesocyclePreview.tsx`

**Step 1 : Ajouter l'import du helper**

Avec les imports `@/lib/strength/...` existants en tête de fichier :

```tsx
import { hasUnderLeveledProfile } from "@/lib/strength/strengthProfileMismatch";
```

**Step 2 : Rendre le bandeau dans `ReasoningPanel`**

Dans `ReasoningPanel`, dans le bloc « Notes additionnelles », **après** le
`NoteStrip` `bilanPending` (ligne ~657, avant le footer « Normes ») insérer :

```tsx
{hasUnderLeveledProfile(
  normesContext.level,
  normesContext.performanceTier,
) && (
  <NoteStrip
    tone="amber"
    icon={<AlertCircle className="h-4 w-4" />}
    title="Profil sous-calibré pour ce niveau"
    body={`Tier « ${normesContext.performanceTier} » mais pratique « ${normesContext.level} » : les exercices avancés (tractions lestées, haltérophilie, pliométrie avancée) ne sont pas débloqués. Ajuste le niveau de pratique dans « Profil muscu ».`}
  />
)}
```

> `AlertCircle` et `NoteStrip` sont déjà importés/définis dans le fichier ;
> `normesContext.level` / `.performanceTier` sont les valeurs résolues (défauts
> appliqués) passées par le parent (ligne ~440-444).

**Step 3 : Type-check**

Run: `npx tsc --noEmit`
Expected: aucune erreur.

**Step 4 : Commit**

```bash
git add src/pages/MesocyclePreview.tsx
git commit -m "feat(§304): bandeau « profil sous-calibré » dans l'aperçu du mésocycle"
```

---

### Task 5 : Vérification globale + documentation projet

**Step 1 : Suite de tests + type-check**

Run: `npm test`
Expected: vert (les nouveaux tests `strengthProfileMismatch` inclus ; aucune régression).

Run: `npx tsc --noEmit`
Expected: aucune erreur.

> Si `npm test` est lent/instable, cibler : `npx vitest run src/lib/strength`.
> **Ne pas** lancer `npm run test:rls` (cf. Task 2).

**Step 2 : Documentation obligatoire** (cf. `CLAUDE.md` § Workflow)

- `docs/implementation-log.md` : ajouter une entrée **§304** (contexte = écart GA
  de l'audit 2026-05-25 ; changements = helper + encart carte + bandeau aperçu +
  migration 00192 ; fichiers modifiés ; tests ; décisions = sens unique du
  mismatch, re-tag id 13 ; limites = préférence par tier hors scope → §305).
- `docs/ROADMAP.md` : ajouter une ligne §304 + mettre à jour la ligne
  `*Dernière mise à jour*` en tête.
- `docs/FEATURES_STATUS.md` : statut de la feature « Générateur mésocycle / profil
  athlète » (⚠️→✅ sur l'axe cohérence niveau/tier).
- `CLAUDE.md` : mettre à jour **uniquement** la ligne « Dernier § livré » :
  > Dernier § livré : **§304** — Couplage niveau↔tier (alerte + alignement 1-clic) + re-tag traction lestée intermédiaire (fix GA audit 100 NL H).

`docs/claude/files-map.md` : `strengthProfileMismatch.ts` < 150 lignes et non
architectural → pas d'ajout requis.

**Step 3 : Commit**

```bash
git add docs/ CLAUDE.md
git commit -m "docs(§304): implementation-log + ROADMAP + FEATURES_STATUS + CLAUDE"
```

---

## Hors périmètre (→ §305 ou autres §)

Taxonomie **nage × distance**, template `sprint_100`, papillon manquant,
*préférence* de la traction lestée aux tiers élevés, bump emphasis `upper_power`
(GB), autorégulation/VBT (GC), couplage macrocycle natation (hors périmètre
produit).
