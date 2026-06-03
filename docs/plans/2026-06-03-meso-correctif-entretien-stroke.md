# §366 — Correctif unilatéral visible · Entretien force basse garanti · Tirage signature par nage — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Corriger 3 défauts terrain du générateur de mésocycle muscu, constatés sur le plan de Victoria (100 dos) : (A) la mobilité corrective unilatérale est calculée mais invisible, (B) l'entretien force basse n'est pas garanti/visible, (C) le dos reçoit les mêmes tirages que crawl/papillon.

**Architecture :** Moteur TS pur (`mesocycleEngine.ts`) → sérialisé en `p_weeks` → matérialisé par la RPC SQL `apply_strength_mesocycle`. A = fix RPC (la chaîne de lecture/affichage existe déjà, §351-353). C = nouvelle colonne `dim_exercices.stroke_main_affinity` + tri stroke-aware dans `selectExercises`. B = invariant testé d'abord (peut déjà être satisfait par le pairing McEvoy).

**Tech Stack :** TypeScript, `node:test` (runner principal), Postgres/Supabase (migrations via MCP `apply_migration`, projet `fscnobivsgornxdwqwlk`).

**Design doc :** `docs/plans/2026-06-03-meso-correctif-entretien-stroke-design.md`

**Refs code clés (vérifiés) :**
- `src/lib/strength/mesocycleEngine.types.ts:316` interface `CatalogExercise` (champ `selectionPriority:350`)
- `src/lib/strength/mesocycleEngine.ts:563` `selectExercises` (comparateur tri `:597-611`)
- `src/lib/strength/mesocycleEngine.ts:1161` `ensureMaintienRepresentation` (appel `:1138`)
- `src/lib/api/strength-catalog.ts:63` mapper catalogue
- `supabase/migrations/00216_mesocycle_start_week_monday.sql:282-293` `raw_payload` jsonb_build_object (RPC apply)
- `src/lib/strength/warmupLabels.ts` (lecture/labels — DÉJÀ EN PLACE) ; consommé par `MyPlanSessionSheet.tsx`, `SessionDetailPreview.tsx`, `MesocyclePreview.tsx`
- Tests moteur : `src/lib/strength/__tests__/mesocycleEngine.test.ts`

**Commandes :** `npm test -- <file>` (cible un fichier), `npx tsc --noEmit`, `npm run lint`.

---

## Task 1 — C: champ `strokeMainAffinity` sur le type + mapper

**Files:**
- Modify: `src/lib/strength/mesocycleEngine.types.ts` (après `selectionPriority`, ~:350)
- Modify: `src/lib/api/strength-catalog.ts:63` (mapper + Row type du `select`)

**Step 1 — Ajouter le champ au type `CatalogExercise`** (après la ligne `selectionPriority: number;`) :
```ts
  /**
   * §366 — affinité de nage des exos *principaux* (distincte de
   * `strokePrehabAffinity`, qui est préhab). Non-vide ⇒ exo « signature »
   * conditionnel : épinglé staple pour les nages listées, rétrogradé neutre pour
   * les autres. `[]`/absent ⇒ sélection inchangée (rétrocompat).
   * Source : `dim_exercices.stroke_main_affinity`.
   */
  strokeMainAffinity: string[];
```

**Step 2 — Mapper** : dans `strength-catalog.ts`, à côté de `strokePrehabAffinity: row.stroke_prehab_affinity ?? []`, ajouter :
```ts
    strokeMainAffinity: row.stroke_main_affinity ?? [],
```
Ajouter `stroke_main_affinity` au type `Row` local ET à la liste de colonnes `.select('…')` si elle est explicite (sinon `select('*')` la prend). Vérifier le nom exact de la requête dans le fichier.

**Step 3 — Type check** : `npx tsc --noEmit`. Attendu : erreurs sur TOUTES les fixtures de test qui construisent un `CatalogExercise` littéral sans `strokeMainAffinity` (champ requis). C'est attendu — passer au Step 4.

**Step 4 — Réparer les fixtures** : dans les fichiers de test qui construisent des `CatalogExercise` en dur (chercher `correctiveAxes:` ou `selectionPriority:` dans `src/lib/strength/__tests__/`), ajouter `strokeMainAffinity: []` à chaque littéral. Helper factory s'il existe → l'ajouter au défaut. `npx tsc --noEmit` doit repasser vert.

**Step 5 — Commit** :
```bash
git add src/lib/strength/mesocycleEngine.types.ts src/lib/api/strength-catalog.ts src/lib/strength/__tests__/
git commit -m "feat(§366): champ strokeMainAffinity sur CatalogExercise + mapper"
```

---

## Task 2 — C: tri stroke-aware dans `selectExercises`

**Files:**
- Modify: `src/lib/strength/mesocycleEngine.ts:597-611` (comparateur de tri)
- Test: `src/lib/strength/__tests__/mesocycleEngine.test.ts`

**Step 1 — Écrire les tests qui échouent.** Ajouter dans `mesocycleEngine.test.ts` (adapter au helper de fixture existant — lire un test `selectExercises` voisin pour le motif exact de construction du `CatalogExercise` et de l'`allocation`) :

```ts
test('§366 selectExercises — dos: tirage uni supi épinglé, pulldown pap rétrogradé', () => {
  const catalog = [
    mkExo({ id: 13, bucket: 'upper_strength', isCore: true,  selectionPriority: 100, strokeMainAffinity: [] }),
    mkExo({ id: 12, bucket: 'upper_strength', isCore: false, selectionPriority: 90,  strokeMainAffinity: ['freestyle','butterfly','breaststroke','medley'] }),
    mkExo({ id: 11, bucket: 'upper_strength', isCore: false, selectionPriority: 0,   strokeMainAffinity: ['backstroke'] }),
  ];
  const allocs = [{ bucket: 'upper_strength' as const, sessionsPerWeek: 1, role: 'focus' as const }];
  const out = selectExercises(allocs, catalog, 'advanced', [], 'backstroke').upper_strength!;
  const ids = out.map((s) => s.exercise.id);
  assert.equal(ids[0], 13);                 // tractions lestées restent 1er (pri 100)
  assert.equal(ids[1], 11);                 // tirage uni supi épinglé 2e (dos)
  assert.ok(ids.indexOf(12) > ids.indexOf(11)); // pulldown pap rétrogradé sous id 11
});

test('§366 selectExercises — crawl: pulldown pap reste staple, uni supi rétrogradé', () => {
  const catalog = [
    mkExo({ id: 13, bucket: 'upper_strength', isCore: true,  selectionPriority: 100, strokeMainAffinity: [] }),
    mkExo({ id: 12, bucket: 'upper_strength', isCore: false, selectionPriority: 90,  strokeMainAffinity: ['freestyle','butterfly','breaststroke','medley'] }),
    mkExo({ id: 11, bucket: 'upper_strength', isCore: false, selectionPriority: 0,   strokeMainAffinity: ['backstroke'] }),
  ];
  const allocs = [{ bucket: 'upper_strength' as const, sessionsPerWeek: 1, role: 'focus' as const }];
  const ids = selectExercises(allocs, catalog, 'advanced', [], 'freestyle').upper_strength!.map((s) => s.exercise.id);
  assert.equal(ids[0], 13);
  assert.equal(ids[1], 12);                 // pulldown pap staple pour crawl
  assert.ok(ids.indexOf(11) > ids.indexOf(12));
});

test('§366 selectExercises — strokeKey null (legacy): ordre inchangé', () => {
  const catalog = [
    mkExo({ id: 12, bucket: 'upper_strength', isCore: false, selectionPriority: 90, strokeMainAffinity: ['freestyle','butterfly','breaststroke','medley'] }),
    mkExo({ id: 11, bucket: 'upper_strength', isCore: false, selectionPriority: 0,  strokeMainAffinity: ['backstroke'] }),
  ];
  const allocs = [{ bucket: 'upper_strength' as const, sessionsPerWeek: 1, role: 'focus' as const }];
  const ids = selectExercises(allocs, catalog, 'advanced', [], null).upper_strength!.map((s) => s.exercise.id);
  assert.equal(ids[0], 12);                 // pas de gating quand strokeKey null
});
```
> Si aucun helper `mkExo` n'existe, en créer un local dans le fichier de test (défaut tous champs neutres : `strokePrehabAffinity:[]`, `correctiveAxes:[]`, `supportsUnilateral:false`, `contraindicationZones:[]`, `level:'intermediate'`, `selectionPriority:0`, `strokeMainAffinity:[]`).

**Step 2 — Lancer, vérifier l'échec** : `npm test -- src/lib/strength/__tests__/mesocycleEngine.test.ts`. Attendu : les 2 premiers tests échouent (id 11 pas en position 2 pour dos).

**Step 3 — Implémenter.** Dans `selectExercises`, juste avant `const ordered = safe.slice().sort(...)` (~:597), insérer :
```ts
    // §366 — priorité effective stroke-aware. Un exo « signature » (affinité
    // non-vide) est épinglé staple pour ses nages, rétrogradé neutre pour les
    // autres. Affinité vide OU strokeKey legacy (null) ⇒ aucune modification.
    const STROKE_STAPLE = 90;
    const effPriority = (e: CatalogExercise): number => {
      const aff = e.strokeMainAffinity ?? [];
      if (aff.length === 0 || strokeKey === null) return e.selectionPriority;
      if (aff.includes(strokeKey)) return Math.max(e.selectionPriority, STROKE_STAPLE);
      return Math.min(e.selectionPriority, 0);
    };
```
Puis remplacer la 1re clé du comparateur (lignes ~601-603, le bloc `if (a.selectionPriority !== b.selectionPriority) return b.selectionPriority - a.selectionPriority;`) par :
```ts
      const ap = effPriority(a);
      const bp = effPriority(b);
      if (ap !== bp) return bp - ap;
```
Laisser les clés suivantes (isCore, matchesStroke préhab, niveau) inchangées.

**Step 4 — Vérifier le vert** : `npm test -- src/lib/strength/__tests__/mesocycleEngine.test.ts` → tous verts. Puis `npx tsc --noEmit` + `npm run lint`.

**Step 5 — Commit** :
```bash
git add src/lib/strength/mesocycleEngine.ts src/lib/strength/__tests__/mesocycleEngine.test.ts
git commit -m "feat(§366): selectExercises stroke-aware — tirage signature par nage (C)"
```

---

## Task 3 — C: migration colonne + tags catalogue

**Files:**
- Create: `supabase/migrations/00217_stroke_main_affinity.sql`

**Step 1 — Écrire la migration** :
```sql
-- §366 — affinité de nage des exercices principaux (tirage signature par nage).
ALTER TABLE dim_exercices ADD COLUMN IF NOT EXISTS stroke_main_affinity text[];

-- Dos : tirage vertical unilatéral supination devient le staple dos.
UPDATE dim_exercices SET stroke_main_affinity = ARRAY['backstroke'] WHERE id = 11;
-- Straight-arm pulldown « schéma papillon » : staple pour toutes les nages SAUF
-- le dos (retiré du dos uniquement, comportement inchangé ailleurs).
UPDATE dim_exercices SET stroke_main_affinity = ARRAY['freestyle','butterfly','breaststroke','medley'] WHERE id = 12;
```

**Step 2 — Appliquer via MCP** : `mcp__plugin_supabase_supabase__apply_migration` (name `00217_stroke_main_affinity`, projet `fscnobivsgornxdwqwlk`). NE PAS utiliser `supabase db push`.

**Step 3 — Vérifier** : `execute_sql` →
```sql
select id, nom_exercice, stroke_main_affinity from dim_exercices where id in (11,12);
```
Attendu : id 11 = `{backstroke}`, id 12 = `{freestyle,butterfly,breaststroke,medley}`.

**Step 4 — Regénérer les types** (si le projet versionne les types Supabase) puis commit :
```bash
git add supabase/migrations/00217_stroke_main_affinity.sql
git commit -m "feat(§366): mig 00217 — stroke_main_affinity + tags dos/pap (C)"
```

---

## Task 4 — B: invariant « ≥1 bloc force basse / microcycle » (test d'abord)

**Files:**
- Test: `src/lib/strength/__tests__/mesocycleEngine.test.ts`
- Modify (si le test échoue): `src/lib/strength/mesocycleEngine.ts:1161` `ensureMaintienRepresentation`

**Step 1 — Écrire le test-contrat.** Reproduire le cas Victoria : `forced_focus` 100 % haut (`['upper_strength','upper_power']`), `lower_strength` en maintien, 2 séances/sem. Lire un test de génération de semaine voisin (`buildWeek`/`generateMesocyclePreview`) pour le motif d'entrée exact, puis asserter :
```ts
test('§366 invariant — focus 100% haut: ≥1 bloc lower_strength dans le microcycle', () => {
  // … construire l'input all-upper forced_focus (cf. fixtures buildWeek voisines) …
  const week = /* générer une semaine de développement */;
  const hasLowerStrength = week.sessions.some((s) => s.buckets.includes('lower_strength'));
  assert.ok(hasLowerStrength, 'au moins une séance doit porter lower_strength (entretien force basse)');
});
```

**Step 2 — Lancer le test.** `npm test -- src/lib/strength/__tests__/mesocycleEngine.test.ts`.
- **S'il PASSE** : l'invariant est déjà satisfait par le pairing McEvoy (cas Victoria : `lower_strength` en complément J1). B = juste ce test de non-régression. Aller au Step 4.
- **S'il ÉCHOUE** : il existe un trou réel → Step 3.

**Step 3 — (Seulement si rouge) Implémenter le fallback** dans `ensureMaintienRepresentation`. Le mécanisme actuel ne garantit le top seau maintien jambes que via un *complément redondant* (`idx < 0` → no-op). Étendre : si `idx < 0` ET `target` toujours absent de toutes les séances, injecter `target` (top exo `selected[target]`) comme complément d'une séance de développement dont le complément actuel est `null` ou `mobility` (donc sans écraser le bloc unique d'un autre seau), en respectant `MAX_SESSION_ITEMS`. Préserver les 2 focus. Reconstruire la séance via `buildSession(..., complement=target, ...)`. Re-lancer jusqu'au vert. Lire `buildSession`/`buildWeek` (~:836-967, :1131-1145) avant d'écrire.
> Contrainte : NE PAS promouvoir `lower_strength` en focus (doctrine « l'épreuve dicte le focus » — design doc). Entretien seulement, 1×/microcycle.

**Step 4 — Vérifier** : suite moteur verte + `npx tsc --noEmit`.

**Step 5 — Commit** :
```bash
git add src/lib/strength/mesocycleEngine.ts src/lib/strength/__tests__/mesocycleEngine.test.ts
git commit -m "feat(§366): invariant entretien force basse garanti (B)"
```

---

## Task 5 — A: la RPC apply matérialise les champs correctifs

**Files:**
- Create: `supabase/migrations/00218_apply_mesocycle_carry_corrective_payload.sql`

**Contexte :** la chaîne de LECTURE/affichage existe déjà (`warmupLabels.ts`, `getMesocycleSessions:511-523`, `MyPlanSessionSheet`/`SessionDetailPreview`/`MesocyclePreview`). Le seul maillon cassé : la RPC `apply_strength_mesocycle` (dernière def : `00216`) ne recopie pas `warmup_kind`/`corrective_axis`/`corrective_side` dans `raw_payload` (lignes 282-293). `serializeExercise` (`strength-mesocycles.ts:52`) les fournit déjà dans `p_weeks`.

**Step 1 — Créer la migration** = `CREATE OR REPLACE FUNCTION apply_strength_mesocycle(...)` **recopiant intégralement** le corps de `00216_mesocycle_start_week_monday.sql` (lire le fichier en entier d'abord), avec **trois lignes ajoutées** dans le `jsonb_build_object` du `raw_payload` (après `'session_number', v_session_number`) :
```sql
            'session_number',       v_session_number,
            'warmup_kind',          v_exercise->>'warmup_kind',
            'corrective_axis',      v_exercise->>'corrective_axis',
            'corrective_side',      v_exercise->>'corrective_side'
```
> Aucun autre changement : même signature, mêmes GRANT, même logique §308/§328 (table rase), même nommage de séance. Vérifier la virgule après `v_session_number`.

**Step 2 — Appliquer via MCP** `apply_migration` (name `00218_apply_mesocycle_carry_corrective_payload`).

**Step 3 — Tester RLS** (on recrée la RPC apply qui matérialise sous RLS). Vérifier Docker (`docker ps`), puis `npm run test:rls` — cible `strength-mesocycle-rpc` (attendu 17/17, le changement est additif au payload, n'affecte pas l'autorisation). Si Docker absent → demander à l'utilisateur de le lancer (cf. CLAUDE.md), ne pas forcer.

**Step 4 — Commit** :
```bash
git add supabase/migrations/00218_apply_mesocycle_carry_corrective_payload.sql
git commit -m "fix(§366): apply RPC matérialise warmup_kind/corrective_axis/side (A)"
```

---

## Task 6 — Vérification end-to-end + régénération Victoria

**Step 1 — Régénérer le méso de Victoria** (athlete 8). L'apply RPC via MCP est bloqué (usurpation JWT — cf. mémoire) → **régénération par le coach via l'UI** (un plan figé ne se réécrit jamais). Noter ce point à l'utilisateur comme action manuelle post-merge.

**Step 2 — Vérifier en base** après régén (`execute_sql`) sur le nouveau méso actif de l'athlete 8 :
```sql
-- A: raw_payload porte désormais le correctif + côté
select si.ordre, e.nom_exercice, si.raw_payload->>'warmup_kind' wk,
       si.raw_payload->>'corrective_axis' ax, si.raw_payload->>'corrective_side' side
from strength_session_items si join dim_exercices e on e.id=si.exercise_id
where si.session_id = <nouvelle séance J1> and si.block='warmup' order by si.ordre;
-- attendu : la ligne « Rowing scapulaire unilatéral » → wk=corrective, ax=scapula_control, side=left

-- C: le dos ne tire plus le pulldown pap, mais le tirage uni supi (id 11)
-- B: présence d'au moins un exo bucket=lower_strength dans le microcycle
```

**Step 3 — Vérif UI** (coach) : ouvrir la séance dans `MyPlanSessionSheet` → la pastille « Scapula · côté gauche » sous « Mobilité corrective » s'affiche ; le dos montre le tirage uni supi ; le bloc force basse est lisible.

---

## Task 7 — Documentation (obligatoire, cf. CLAUDE.md)

**Step 1 — `docs/implementation-log.md`** : entrée §366 (contexte terrain Victoria, A/B/C, fichiers, migrations 00217/00218, tests, limites : régén manuelle requise).

**Step 2 — `docs/ROADMAP.md`** : ligne §366 + `*Dernière mise à jour*` en tête.

**Step 3 — `docs/FEATURES_STATUS.md`** : statut mobilité corrective (mesocycle) ⚠️→✅, spécificité nage muscu.

**Step 4 — `CLAUDE.md`** : mettre à jour UNIQUEMENT la ligne « Dernier § livré » → §366 (≤15 mots). Table « Edge Functions » inchangée. `files-map.md` : seulement si un fichier a varié >30 % (peu probable ici).

**Step 5 — Mémoire** : mettre à jour `muscle-meso-audit-victoria-100dos.md` (les 3 points traités §366) et, si utile, une note sur le bug latent « §351-353 corrective UI morte car RPC apply ne forwardait pas les champs ».

**Step 6 — Commit** :
```bash
git add docs/ CLAUDE.md
git commit -m "docs(§366): log + roadmap + features + CLAUDE.md"
```

---

## Notes transverses
- **DRY/YAGNI** : pas de seuil élargi (axes 2/2), pas de tirages brasse/4N, pas de force basse 2×/séance — tous hors scope (design doc).
- **Pas de redéploiement auto** : `git push` sur la branche → PR. Le déploiement Pages se fait sur `main` (cf. CLAUDE.md). L'effet n'est visible qu'après **régénération** du méso.
- **Working tree partagé** : ne JAMAIS `git add -A` (WIP d'autres terminaux). Toujours `git add <chemins explicites>`.
