# Dé-jeunification moteur muscu (G1+G3) — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Permettre au générateur de mésocycle muscu de servir correctement une nageuse adulte / de haut niveau, en découplant deux axes coach-set : niveau de pratique muscu (filtre exercices, G3) et tier de performance (cale les barèmes KPI, G1).

**Architecture:** Approche A (transformation paramétrique). Côté barèmes purs (`kpiBaremes.ts`) : bande d'âge `adulte`, décalage d'ancres par tier, plafond extrapolé jusqu'à 100. Côté moteur : un seul chokepoint (`scoreKpi`) applique le décalage tier. Persistance : table `strength_athlete_settings` coach-set (RLS), lue à la génération. Défauts = comportement actuel (zéro régression hors effet plafond voulu). 100 % swim-independent.

**Tech Stack:** TypeScript, Vitest, React 19, Supabase (Postgres + RLS via helpers `app_user_role()`/`app_user_id()`, migrations via MCP).

**Design de référence :** [`docs/plans/2026-05-24-muscu-dejeunification-g1-g3-design.md`](./2026-05-24-muscu-dejeunification-g1-g3-design.md)
**Audit source :** [`docs/audits/2026-05-24-audit-muscu-200nl-femmes-elite-vs-generateur.md`](../audits/2026-05-24-audit-muscu-200nl-femmes-elite-vs-generateur.md)

**Branche :** `feat/muscu-dejeunification-g1-g3` (déjà créée).

---

## Phase 1 — Barème pur (`src/lib/strength/kpiBaremes.ts`)

### Task 1 : Plafond extrapolé dans `kpiScore`

**Fichiers :**
- Modifier : `src/lib/strength/kpiBaremes.ts:33-54` (fonction `kpiScore`)
- Test : `src/lib/strength/__tests__/kpiBaremes.test.ts` (vérifier le chemin exact ; sinon créer)

**Étape 1 — Test qui échoue**

```ts
import { kpiScore } from '../kpiBaremes';

describe('kpiScore — plafond extrapolé (Task 1)', () => {
  const bareme = [[0, 10], [10, 50], [20, 90]] as const; // dernier segment slope = 4 pts/unité

  it('atteint 90 pile sur la dernière ancre', () => {
    expect(kpiScore(bareme, 20)).toBe(90);
  });
  it('extrapole au-dessus de p90 au lieu de plafonner à 90', () => {
    expect(kpiScore(bareme, 22.5)).toBe(100); // 90 + 2.5*4 = 100
  });
  it('clampe à 100 pour les valeurs très au-dessus', () => {
    expect(kpiScore(bareme, 50)).toBe(100);   // 90 + 30*4 = 210 → clamp
  });
  it('garde le plancher sous la première ancre', () => {
    expect(kpiScore(bareme, -5)).toBe(10);
  });
});
```

**Étape 2 — Lancer le test, vérifier l'échec**

Run: `npx vitest run src/lib/strength/__tests__/kpiBaremes.test.ts -t "plafond extrapolé"`
Attendu : FAIL — `kpiScore(bareme, 22.5)` renvoie `90` (plafonnement actuel).

**Étape 3 — Implémentation minimale**

Remplacer la branche « ≥ dernière ancre » dans `kpiScore` :

```ts
  const first = bareme[0];
  const last = bareme[bareme.length - 1];
  if (value <= first[0]) return clamp(first[1]);
  if (value >= last[0]) {
    // Extrapole la pente du dernier segment au-delà de l'ancre haute (p90→100),
    // pour que les profils > p90 restent discriminables (au lieu de saturer à 90).
    const [xPrev, sPrev] = bareme[bareme.length - 2];
    const [xLast, sLast] = last;
    const slope = (sLast - sPrev) / (xLast - xPrev);
    return clamp(sLast + (value - xLast) * slope);
  }
```

(Le reste de la fonction — interpolation entre ancres — est inchangé.)

**Étape 4 — Lancer le test, vérifier le succès**

Run: `npx vitest run src/lib/strength/__tests__/kpiBaremes.test.ts -t "plafond extrapolé"`
Attendu : PASS.

**Étape 5 — Commit**

```bash
git add src/lib/strength/kpiBaremes.ts src/lib/strength/__tests__/kpiBaremes.test.ts
git commit -m "feat(muscu G1): kpiScore extrapole au-delà de p90 (fin du plafond à 90)"
```

---

### Task 2 : Bande d'âge `adulte`

**Fichiers :**
- Modifier : `src/lib/strength/kpiBaremes.ts` (type `AgeBand` l.62, fonction `ageBandFor` l.251-256, et dérivation de `KPI_BAREMES`)
- Test : `src/lib/strength/__tests__/kpiBaremes.test.ts`

**Étape 1 — Test qui échoue**

```ts
import { ageBandFor, getBareme, KPI_BAREMES } from '../kpiBaremes';

describe('bande adulte (Task 2)', () => {
  it('mappe 18 ans sur 17-18 et 19+ sur adulte', () => {
    expect(ageBandFor(18)).toBe('17-18');
    expect(ageBandFor(19)).toBe('adulte');
    expect(ageBandFor(27)).toBe('adulte');
  });
  it('initialise adulte sur les ancres 17-18 pour chaque KPI×sexe', () => {
    expect(getBareme('weighted_pullup', 'F', 'adulte').anchors)
      .toEqual(getBareme('weighted_pullup', 'F', '17-18').anchors);
    expect(getBareme('imtp', 'M', 'adulte').anchors)
      .toEqual(getBareme('imtp', 'M', '17-18').anchors);
  });
});
```

**Étape 2 — Lancer / vérifier l'échec**

Run: `npx vitest run src/lib/strength/__tests__/kpiBaremes.test.ts -t "bande adulte"`
Attendu : FAIL (type `'adulte'` inexistant → erreur TS/test).

**Étape 3 — Implémentation minimale**

1. Type : `export type AgeBand = '13-14' | '15-16' | '17-18' | 'adulte';`
2. `ageBandFor` :
```ts
export function ageBandFor(age: number): AgeBand | null {
  if (age < 13) return null;
  if (age <= 14) return '13-14';
  if (age <= 16) return '15-16';
  if (age <= 18) return '17-18';
  return 'adulte';
}
```
3. Dériver les entrées `adulte` sans dupliquer les ancres. Renommer le **littéral existant** `KPI_BAREMES` en `KPI_BAREMES_BASE` typé sur 3 bandes, puis exporter `KPI_BAREMES` dérivé :
```ts
type AgeBandBase = '13-14' | '15-16' | '17-18';

const KPI_BAREMES_BASE: Record<
  StrengthKpiKey, Record<BaremeSex, Record<AgeBandBase, BaremeEntry>>
> = { /* …littéral inchangé… */ };

/** 'adulte' réutilise les ancres 17-18 (plateau de maturité) — cf. design §2a. */
export const KPI_BAREMES: Record<
  StrengthKpiKey, Record<BaremeSex, Record<AgeBand, BaremeEntry>>
> = Object.fromEntries(
  (Object.keys(KPI_BAREMES_BASE) as StrengthKpiKey[]).map((kpi) => [
    kpi,
    {
      M: { ...KPI_BAREMES_BASE[kpi].M, adulte: KPI_BAREMES_BASE[kpi].M['17-18'] },
      F: { ...KPI_BAREMES_BASE[kpi].F, adulte: KPI_BAREMES_BASE[kpi].F['17-18'] },
    },
  ]),
) as Record<StrengthKpiKey, Record<BaremeSex, Record<AgeBand, BaremeEntry>>>;
```
4. `baremeConfidenceFor` (l.278) lit `KPI_BAREMES[kpiKey].M['15-16']` → toujours valide.

**Étape 4 — Lancer / vérifier le succès**

Run: `npx vitest run src/lib/strength/__tests__/kpiBaremes.test.ts -t "bande adulte"` → PASS
Run: `npx tsc --noEmit` → 0 erreur (vérifie l'exhaustivité du `Record<AgeBand, …>`).

**Étape 5 — Commit**

```bash
git add src/lib/strength/kpiBaremes.ts src/lib/strength/__tests__/kpiBaremes.test.ts
git commit -m "feat(muscu G1): bande d'âge adulte (>=19) dérivée des ancres 17-18"
```

---

### Task 3 : Tier de performance + `shiftAnchors`

**Fichiers :**
- Modifier : `src/lib/strength/kpiBaremes.ts` (ajouter type + map + fonction, après `kpiScore`)
- Test : `src/lib/strength/__tests__/kpiBaremes.test.ts`

**Étape 1 — Test qui échoue**

```ts
import { kpiScore, shiftAnchors, type PerformanceTier } from '../kpiBaremes';

describe('shiftAnchors / tier (Task 3)', () => {
  const wp = [[-5, 10], [0, 30], [5, 50], [10, 70], [20, 90]] as const; // weighted_pullup F 17-18

  it('club = identité', () => {
    expect(shiftAnchors(wp, 'club')).toEqual(wp);
  });
  it('relève la barre : à valeur égale, score décroît quand le tier monte', () => {
    const v = 10;
    const sClub = kpiScore(shiftAnchors(wp, 'club'), v);
    const sReg = kpiScore(shiftAnchors(wp, 'regional'), v);
    const sNat = kpiScore(shiftAnchors(wp, 'national'), v);
    const sElite = kpiScore(shiftAnchors(wp, 'elite'), v);
    expect(sClub).toBeGreaterThanOrEqual(sReg);
    expect(sReg).toBeGreaterThanOrEqual(sNat);
    expect(sNat).toBeGreaterThanOrEqual(sElite);
    expect(sClub).toBe(70);          // inchangé au tier club
    expect(sNat).toBeCloseTo(35, 0); // Δ = 0.35*(20-(-5)) = 8.75 ; kpiScore(wp, 1.25) = 35
  });
  it('gère les ancres négatives (décalage en espace valeur brute)', () => {
    expect(shiftAnchors(wp, 'national')[0][0]).toBeCloseTo(3.75, 2); // -5 + 8.75
  });
});
```

**Étape 2 — Lancer / vérifier l'échec**

Run: `npx vitest run src/lib/strength/__tests__/kpiBaremes.test.ts -t "shiftAnchors"`
Attendu : FAIL (`shiftAnchors` / `PerformanceTier` non définis).

**Étape 3 — Implémentation minimale**

```ts
export type PerformanceTier = 'club' | 'regional' | 'national' | 'elite';

/** Décalage du barème par tier, en fraction de l'étendue (val_dernière − val_première). */
const TIER_SHIFT_K: Record<PerformanceTier, number> = {
  club: 0,
  regional: 0.18,
  national: 0.35,
  elite: 0.5,
};

/**
 * Décale les ancres vers la droite de Δ = k(tier) × (val_dernière − val_première)
 * pour relever la barre au tier supérieur (à perf égale, score plus bas).
 * Translation en espace valeur brute → robuste aux unités et aux ancres
 * négatives. `club` (k=0) → identité. Cf. design §2b.
 */
export function shiftAnchors(anchors: Bareme, tier: PerformanceTier): Bareme {
  const k = TIER_SHIFT_K[tier];
  if (k === 0) return anchors;
  const spread = anchors[anchors.length - 1][0] - anchors[0][0];
  const delta = k * spread;
  return anchors.map(([x, s]) => [x + delta, s] as const);
}
```

**Étape 4 — Lancer / vérifier le succès**

Run: `npx vitest run src/lib/strength/__tests__/kpiBaremes.test.ts -t "shiftAnchors"` → PASS

**Étape 5 — Commit**

```bash
git add src/lib/strength/kpiBaremes.ts src/lib/strength/__tests__/kpiBaremes.test.ts
git commit -m "feat(muscu G1): tier de performance + shiftAnchors (décalage barème)"
```

---

## Phase 2 — Moteur

### Task 4 : Brancher le tier dans `scoreKpi`

**Fichiers :**
- Modifier : `src/lib/strength/mesocycleEngine.types.ts:321-326` (ajouter `performanceTier` à `athlete`)
- Modifier : `src/lib/strength/mesocycleEngine.ts:20` (import) et `:54-63` (`scoreKpi`)
- Test : `src/lib/strength/__tests__/mesocycleEngine.test.ts` (vérifier le chemin ; ajouter un cas)

**Étape 1 — Test qui échoue**

Construire un athlète « adulte fort » et vérifier que le tier abaisse les scores de seau (donc restaure la discrimination). Réutiliser les helpers de fabrication d'input du fichier de test existant ; sinon mesure directe via `scoreBuckets` :

```ts
import { scoreBuckets } from '../mesocycleEngine';

const kpis = [
  { kpi_key: 'weighted_pullup', value: 20, measured_at: '2026-05-01T00:00:00Z' },
  // …compléter les autres KPI au besoin selon le type StrengthKpiMeasurement
] as any;
const assessment = { physical_tests: null, questionnaire: null } as any;

it('le tier national abaisse upper_strength vs club (Task 4)', () => {
  const club = scoreBuckets(assessment, kpis, { sex: 'F', ageBand: 'adulte', level: 'intermediate', performanceTier: 'club' });
  const nat  = scoreBuckets(assessment, kpis, { sex: 'F', ageBand: 'adulte', level: 'intermediate', performanceTier: 'national' });
  expect(nat.upper_strength!).toBeLessThan(club.upper_strength!);
});
```

**Étape 2 — Lancer / vérifier l'échec**

Run: `npx vitest run src/lib/strength/__tests__/mesocycleEngine.test.ts -t "tier national abaisse"`
Attendu : FAIL (type `performanceTier` manquant → erreur TS, ou scores égaux).

**Étape 3 — Implémentation minimale**

1. `mesocycleEngine.types.ts` — ajouter dans `athlete` :
```ts
    /** Niveau de pratique muscu (filtre les exercices). */
    level: 'beginner' | 'intermediate' | 'advanced';
    /** Tier de performance (cale les barèmes KPI). Défaut applicatif : 'club'. */
    performanceTier: import('@/lib/strength/kpiBaremes').PerformanceTier;
```
2. `mesocycleEngine.ts:20` — `import { getBareme, kpiScore, shiftAnchors } from './kpiBaremes';`
3. `mesocycleEngine.ts:61-62` — `scoreKpi` :
```ts
  const bareme = getBareme(kpi, athlete.sex, athlete.ageBand);
  return kpiScore(shiftAnchors(bareme.anchors, athlete.performanceTier), m.value);
```

**Étape 4 — Lancer / vérifier le succès**

Run: `npx vitest run src/lib/strength/__tests__/mesocycleEngine.test.ts` → PASS
Run: `npx tsc --noEmit` → 0 erreur. ⚠️ Toute construction de `MesocycleInput.athlete` dans les tests existants devra ajouter `performanceTier: 'club'` (corriger les fixtures qui cassent).

**Étape 5 — Commit**

```bash
git add src/lib/strength/mesocycleEngine.ts src/lib/strength/mesocycleEngine.types.ts src/lib/strength/__tests__/mesocycleEngine.test.ts
git commit -m "feat(muscu G1): scoreKpi applique le décalage tier (shiftAnchors)"
```

---

## Phase 3 — Persistance + API

### Task 5 : Table `strength_athlete_settings` + RLS

**Fichiers :**
- Créer : `supabase/migrations/00XXX_strength_athlete_settings.sql` (numéro = prochain dispo ; confirmer via `list_migrations`, ≥ 00191)
- Modifier : `supabase/tests/schema.sql` (ajouter la table au schéma de test RLS)
- Test : `supabase/tests/rls/strength_athlete_settings.test.ts` (créer ; calquer un test RLS existant)

**Étape 1 — Écrire la migration**

```sql
-- 00XXX_strength_athlete_settings.sql
-- §3XX — Dé-jeunification moteur muscu (G1+G3) : niveau de pratique muscu +
-- tier de performance, coach-set, par athlète. 1 ligne / athlète.
-- Design : docs/plans/2026-05-24-muscu-dejeunification-g1-g3-design.md

BEGIN;

CREATE TABLE strength_athlete_settings (
  athlete_id        INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  practice_level    TEXT CHECK (practice_level IN ('beginner','intermediate','advanced')),
  performance_tier  TEXT CHECK (performance_tier IN ('club','regional','national','elite')),
  updated_by        INTEGER REFERENCES users(id) ON DELETE SET NULL,
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER strength_athlete_settings_set_updated_at
  BEFORE UPDATE ON strength_athlete_settings
  FOR EACH ROW EXECUTE FUNCTION set_updated_at_timestamp();

ALTER TABLE strength_athlete_settings ENABLE ROW LEVEL SECURITY;

-- Athlète : lecture seule de sa ligne (les niveaux sont coach-set).
CREATE POLICY strength_athlete_settings_own_read ON strength_athlete_settings
  FOR SELECT TO authenticated
  USING (athlete_id = app_user_id());

-- Coach / admin : lecture + écriture club-wide (même modèle que strength_assessments).
CREATE POLICY strength_athlete_settings_coach ON strength_athlete_settings
  FOR ALL TO authenticated
  USING (app_user_role() IN ('coach','admin'))
  WITH CHECK (app_user_role() IN ('coach','admin'));

COMMIT;
```

**Étape 2 — Appliquer via MCP**

Utiliser `mcp__plugin_supabase_supabase__apply_migration` (PAS `supabase db push`) — projet `fscnobivsgornxdwqwlk`. Créer le fichier dans `supabase/migrations/` ET l'appliquer dans la même session (cf. CLAUDE.md).

**Étape 3 — Test RLS**

⚠️ Touche la RLS → `npm run test:rls` requis. **Avant de lancer**, vérifier Docker (`docker ps`) ; s'il n'est pas lancé, **demander à l'utilisateur** de démarrer Docker Desktop et attendre confirmation (cf. CLAUDE.md). Puis `supabase start` si besoin.

- Ajouter `strength_athlete_settings` (DDL + policies) à `supabase/tests/schema.sql`.
- Créer `supabase/tests/rls/strength_athlete_settings.test.ts` calqué sur un test existant du dossier. Cas à couvrir :
  - athlète lit **sa** ligne ; ne peut PAS lire celle d'un autre ;
  - athlète ne peut **pas** écrire (INSERT/UPDATE bloqués) ;
  - coach lit + upsert n'importe quelle ligne du club ;
  - admin idem.

Run: `npm run test:rls`
Attendu : PASS (les 2 échecs pré-existants `coach_pace_zones` v1/v2 restent — non liés).

**Étape 4 — Commit**

```bash
git add supabase/migrations/00XXX_strength_athlete_settings.sql supabase/tests/schema.sql supabase/tests/rls/strength_athlete_settings.test.ts
git commit -m "feat(muscu G1+G3): table strength_athlete_settings + RLS coach/athlete"
```

---

### Task 6 : Types + wrappers API

**Fichiers :**
- Modifier : `src/lib/api/types.ts` (interface `StrengthAthleteSettings`)
- Modifier : `src/lib/api/strength.ts` (wrappers get/upsert) ; re-export via `src/lib/api/index.ts` si nécessaire
- Test : `src/lib/api/__tests__/strength.test.ts` (vérifier le chemin ; ajouter un cas avec mock Supabase)

**Étape 1 — Test qui échoue**

```ts
it('getStrengthAthleteSettings renvoie null si pas de ligne (Task 6)', async () => {
  // mock client : .from().select().eq().maybeSingle() → { data: null, error: null }
  const res = await getStrengthAthleteSettings(42);
  expect(res).toBeNull();
});
```

**Étape 2 — Lancer / vérifier l'échec**

Run: `npx vitest run src/lib/api/__tests__/strength.test.ts -t "getStrengthAthleteSettings"` → FAIL (fonction absente)

**Étape 3 — Implémentation minimale**

`types.ts` :
```ts
export interface StrengthAthleteSettings {
  athlete_id: number;
  practice_level: 'beginner' | 'intermediate' | 'advanced' | null;
  performance_tier: 'club' | 'regional' | 'national' | 'elite' | null;
  updated_by: number | null;
  updated_at: string;
}
```
`strength.ts` (calquer les autres wrappers du module : client `supabase`, gestion d'erreur existante) :
```ts
export async function getStrengthAthleteSettings(
  athleteId: number,
): Promise<StrengthAthleteSettings | null> {
  const { data, error } = await supabase
    .from('strength_athlete_settings')
    .select('*')
    .eq('athlete_id', athleteId)
    .maybeSingle();
  if (error) throw error;
  return data ?? null;
}

export async function upsertStrengthAthleteSettings(
  athleteId: number,
  patch: Pick<StrengthAthleteSettings, 'practice_level' | 'performance_tier'>,
): Promise<void> {
  const { error } = await supabase
    .from('strength_athlete_settings')
    .upsert({ athlete_id: athleteId, ...patch }, { onConflict: 'athlete_id' });
  if (error) throw error;
}
```

**Étape 4 — Lancer / vérifier le succès**

Run: `npx vitest run src/lib/api/__tests__/strength.test.ts` → PASS

**Étape 5 — Commit**

```bash
git add src/lib/api/types.ts src/lib/api/strength.ts src/lib/api/index.ts src/lib/api/__tests__/strength.test.ts
git commit -m "feat(muscu G1+G3): API get/upsert strength_athlete_settings"
```

---

## Phase 4 — UI

### Task 7 : Brancher les niveaux dans `MesocyclePreview`

**Fichiers :**
- Modifier : `src/pages/MesocyclePreview.tsx` (fetch settings + remplacer `level: "intermediate"` l.304 + ajouter `performanceTier` + afficher le contexte dans le raisonnement)

**Étapes :**
1. Charger les settings de l'athlète (hook React Query, à côté des fetchs profil/assessment/kpi existants) : `getStrengthAthleteSettings(athleteId)`.
2. Dans la construction de `input.athlete` (l.301-305) :
```ts
      athlete: {
        sex: profile.sex,
        ageBand,
        level: settings?.practice_level ?? "intermediate",
        performanceTier: settings?.performance_tier ?? "club",
      },
```
3. Afficher en lecture seule le contexte dans le bloc de raisonnement auditable existant : `Normes : {ageBand} · tier {performanceTier}`.
4. Vérifier : `npx tsc --noEmit` (0 erreur) + `npm test` (les tests preview existants passent).

**Commit :**
```bash
git add src/pages/MesocyclePreview.tsx
git commit -m "feat(muscu G3): MesocyclePreview lit practice_level + performanceTier (fin du niveau figé)"
```

---

### Task 8 : Bloc coach de réglage des niveaux

> **UI/UX — REQUIRED :** invoquer `/frontend-design` pour ce composant (convention projet globale : tout dev UI passe par frontend-design).

**Fichiers :**
- Modifier : la page coach `/coach/strength-assessment/:athleteId` (localiser via `grep -rn "strength-assessment" src/` — route §302) ou son composant enfant.

**Comportement :**
- Bloc « Profil muscu de l'athlète » avec **deux `Select`** (shadcn) : *Niveau de pratique muscu* (`beginner`/`intermediate`/`advanced`) et *Niveau de performance* (`club`/`regional`/`national`/`elite`).
- Pré-remplis depuis `getStrengthAthleteSettings` ; défauts visibles `intermediate` / `club` si null.
- Sauvegarde via `upsertStrengthAthleteSettings` (mutation React Query + invalidation).
- Tooltips courts : « affine la sélection d'exercices » / « cale les barèmes sur le bon niveau ».
- Accès coach/admin uniquement (la RLS le garantit côté serveur ; masquer le bloc côté nageur).

**Vérif :** `npx tsc --noEmit` + lancer l'app (`npm run dev`) et vérifier la sauvegarde/relecture.

**Commit :**
```bash
git add src/pages/  # (chemins exacts touchés)
git commit -m "feat(muscu G1+G3): UI coach — réglage niveau pratique + tier performance"
```

---

## Phase 5 — Finalisation

### Task 9 : Vérification complète

- Run: `npx tsc --noEmit` → 0 erreur
- Run: `npm test` → vert (régénérer les snapshots impactés par le plafond extrapolé : `npx vitest run -u` ciblé, et **inspecter le diff** pour confirmer que les seuls changements sont des scores > 90 désormais > 90, pas des régressions inattendues).
- Run: `npm run test:rls` (si Docker dispo, déjà couvert Task 5).
- Commit éventuel des snapshots : `git commit -m "test(muscu): régénère snapshots impactés par plafond extrapolé"`

### Task 10 : Documentation obligatoire (workflow projet)

Ce patch est un **§** → mettre à jour (cf. CLAUDE.md « Workflow de documentation obligatoire ») :
- `docs/implementation-log.md` : nouvelle entrée § (contexte = audit G1+G3, changements, fichiers, tests, décisions, limites).
- `docs/ROADMAP.md` : 1 ligne + `*Dernière mise à jour*` en tête.
- `docs/FEATURES_STATUS.md` : statut de la feature « génération mésocycle » (différenciation niveau/âge) ⚠️→✅.
- `CLAUDE.md` : ligne « Dernier § livré » (≤ 15 mots) + `docs/claude/files-map.md` (nouveau fichier migration ; `kpiBaremes.ts` si taille a varié > 30 %).

**Commit :**
```bash
git add docs/ CLAUDE.md
git commit -m "docs(muscu G1+G3): implementation-log + ROADMAP + FEATURES + files-map"
```

---

## Notes transverses

- **DRY** : `'adulte'` dérivé de `'17-18'` (pas de duplication d'ancres) ; tier = une constante `k` par niveau (pas de table par KPI).
- **YAGNI** : pas de saisie nageur, pas de normes élite réelles par KPI, pas de tier-adjusted confidence (suites possibles, non engagées).
- **No-régression** : défauts `intermediate`/`club` reproduisent le comportement actuel ; seul l'effet plafond change des scores (voulu, documenté, snapshots à régénérer).
- **Swim-independent** : aucune lecture du calendrier/charge/résultats natation.
- **Ordre** : Phase 1 (pur, testable seul) → Phase 2 (moteur) → Phase 3 (DB/API) → Phase 4 (UI) → Phase 5 (vérif + doc). Phases 1-2 livrables et vertes même sans la DB.
