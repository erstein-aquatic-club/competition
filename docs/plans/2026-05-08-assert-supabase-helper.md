# §232 Helper `assertSupabase<T>()` Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Centraliser le pattern `if (error) throw new Error(error.message)` (239 occurrences dans 36 fichiers `src/lib/api/`) via un helper `assertSupabase<T>()`. Comportement byte-identical, ~-180 LOC net.

**Architecture:** Helper ajouté à `src/lib/api/client.ts`, re-exporté via `src/lib/api/index.ts`. Codemod ~190 sites simples. ~49 sites complexes (conditional throws / prefix formatting / gestion gracieuse) laissés intacts.

**Tech Stack:** TypeScript 5, Supabase JS. Tests : Vitest existants. Aucune migration DB, aucune touche aux composants/pages/hooks.

---

## Pré-requis

- Working tree propre côté docs (vérifier `git status`).
- Commits §214/§216/§217/§218/§219/§223 + parallèle user §215/§221/§222/§224/§225/§226/§227 sont sur main.
- Lire avant de coder : `docs/plans/2026-05-08-assert-supabase-helper-design.md` (design validé).

## Inventaire pré-existant

- **239 occurrences** du pattern littéral `if (error) throw new Error(error.message);` dans **36 fichiers** `src/lib/api/`.
- **Top 10 fichiers (densité)** :
  - `strength.ts` : 25
  - `users.ts` : 17
  - `records.ts` : 14
  - `competition-prep.ts` : 14
  - `timesheet.ts` : 13
  - `swim.ts` : 12
  - `interviews.ts` : 11
  - `swim-planning.ts` : 10
  - `strength-planning.ts` : 10
  - `assignments.ts` : 10
- **Helpers existants** dans `client.ts` : `parseApiError(error)`, `summarizeApiError(error, fallback)`, `loggedErrors` (Set pour dédupe). À NE PAS modifier.
- **Sites NON transformables** (~49 estimé) :
  - Conditional throws : `if (error && error.code !== '23505') throw new Error(error.message);` (ex. `swim-sessions.ts syncSession`).
  - Prefix formatting : `throw new Error(\`Failed to fetch X: ${error.message}\`);`.
  - Gestion gracieuse : `if (error) return null;` (ex. `getAppSettings`).

---

## Task 1 — Ajouter `assertSupabase<T>` à `src/lib/api/client.ts`

**Files:**
- Modify: `src/lib/api/client.ts` (ajouter le helper).
- Modify: `src/lib/api/index.ts` (re-exporter).

**Pourquoi:** introduire le helper avant tout codemod, vérifier qu'il compile et que sa signature flow bien avec les types Supabase.

**Step 1: Ajouter le helper dans `client.ts`**

Trouver la section `// --- Error handling ---` (vers ligne 98). Ajouter en fin de section, après `summarizeApiError` :

```ts
/**
 * §232 — Centralise le pattern `if (error) throw new Error(error.message)`
 * (~239 occurrences dans src/lib/api/). Comportement byte-identical aux
 * call-sites avant migration.
 *
 * Compatible avec PostgrestResponse<T> (data: T[] | null) ET
 * PostgrestSingleResponse<T> (data: T | null) — la TS inference flow
 * naturellement.
 *
 * Usage :
 *   const data = assertSupabase(await supabase.from("foo").select("*"));
 *   assertSupabase(await supabase.from("foo").delete().eq("id", id));
 *   return assertSupabase(await supabase.rpc("my_rpc", { … }));
 *
 * NE PAS utiliser pour :
 *   - Conditional throws (`if (error && error.code !== '23505')`).
 *   - Messages d'erreur enrichis (`throw new Error(\`Prefix: ${error.message}\`)`).
 *   - Gestion gracieuse (`if (error) return null;`).
 */
export function assertSupabase<T>(
  res: { data: T; error: { message: string } | null },
): T {
  if (res.error) throw new Error(res.error.message);
  return res.data;
}
```

**Step 2: Re-exporter depuis `index.ts`**

Trouver le bloc qui re-exporte les helpers de `client.ts` (vers ligne 39-66 selon les commits). Ajouter `assertSupabase` à la liste :

```ts
export {
  // … exports existants …
  assertSupabase,
} from "./client";
```

(Ordre alphabétique pas nécessaire — placer en cohérence avec le style existant du fichier.)

**Step 3: Vérifier la compilation**

```bash
npx tsc --noEmit 2>&1 | tail -10; echo EXITCODE=$?
```
Expected: `EXITCODE=0`.

**Step 4: Smoke test inline**

Aucun test unitaire dédié n'est requis (le helper est trivial et son comportement sera vérifié par les 684 tests existants une fois le codemod appliqué). Si l'implementer veut être exhaustif, un mini test inline OK :

```ts
// src/lib/api/__tests__/client.test.ts (si fichier existe — sinon skip)
import { test } from "node:test";
import assert from "node:assert/strict";
import { assertSupabase } from "../client";

test("assertSupabase returns data when error is null", () => {
  const result = assertSupabase({ data: 42, error: null });
  assert.equal(result, 42);
});

test("assertSupabase throws Error(error.message) when error present", () => {
  assert.throws(
    () => assertSupabase({ data: null, error: { message: "boom" } }),
    /boom/,
  );
});
```

**Critère de réussite Task 1:** helper compilé, exporté, tsc clean.

---

## Task 2 — Codemod 36 fichiers `src/lib/api/`

**Files:** modifications dans tous les fichiers de `src/lib/api/` ayant ≥ 1 occurrence du pattern, ordre par densité décroissante.

**Pourquoi:** appliquer la transformation sur ~190 sites (sur 239) en évitant les ~49 cas spéciaux.

### Workflow par fichier

Pour chaque fichier (commencer par les plus denses) :

**Step 1: Grep des occurrences**

```bash
grep -n "if (error) throw new Error(error.message);" src/lib/api/<fichier>.ts
```

**Step 2: Lire chaque site et classifier**

Pour chaque ligne matchée, lire les 5 lignes avant + 2 lignes après pour identifier :

- ✅ **Cas A — Sélection avec data utilisé** :
  ```ts
  const { data, error } = await supabase.from("foo").select("*");
  if (error) throw new Error(error.message);
  return data ?? [];
  ```
  → transformer.

- ✅ **Cas B — Mutation sans data** :
  ```ts
  const { error } = await supabase.from("foo").delete().eq("id", id);
  if (error) throw new Error(error.message);
  ```
  → transformer.

- ✅ **Cas C — RPC** :
  ```ts
  const { data, error } = await supabase.rpc("my_rpc", { … });
  if (error) throw new Error(error.message);
  return data;
  ```
  → transformer.

- ❌ **Cas D — Conditional throw** :
  ```ts
  const { data, error } = await supabase…
  if (error) {
    if (error.code === '23505') { … }
    throw new Error(error.message);
  }
  ```
  → **laisser intact**.

- ❌ **Cas E — Multiple destructuration dans un bloc** :
  ```ts
  const { data: a, error: errA } = await ...;
  if (errA) throw new Error(errA.message);
  const { data: b, error: errB } = await ...;
  if (errB) throw new Error(errB.message);
  ```
  → **laisser intact** OU transformer chaque ligne séparément si lisible. **Décision par cas, lecture du contexte requise.**

- ❌ **Cas F — Message enrichi avec prefix** :
  ```ts
  if (error) throw new Error(`Failed to load X: ${error.message}`);
  ```
  → **laisser intact** (déjà différent du pattern littéral, ne devrait pas matcher le grep mais double-check).

**Step 3: Appliquer la transformation pour les Cas A/B/C**

**Cas A (sélection avec data)** :

AVANT :
```ts
const { data, error } = await supabase.from("foo").select("*").order("id");
if (error) throw new Error(error.message);
return data ?? [];
```

APRÈS :
```ts
const data = assertSupabase(await supabase.from("foo").select("*").order("id"));
return data ?? [];
```

**Cas B (mutation sans data)** :

AVANT :
```ts
const { error } = await supabase.from("foo").delete().eq("id", id);
if (error) throw new Error(error.message);
```

APRÈS :
```ts
assertSupabase(await supabase.from("foo").delete().eq("id", id));
```

**Cas C (RPC)** :

AVANT :
```ts
const { data, error } = await supabase.rpc("my_rpc", { p_id: id });
if (error) throw new Error(error.message);
return data;
```

APRÈS :
```ts
return assertSupabase(await supabase.rpc("my_rpc", { p_id: id }));
```

**Step 4: Ajouter l'import si pas déjà présent**

En haut du fichier, ajouter `assertSupabase` à l'import depuis `./client` :

```ts
import {
  // … imports existants …
  assertSupabase,
} from "./client";
```

OU :

```ts
import { existingHelper, assertSupabase } from "./client";
```

(Cohérent avec le style existant du fichier.)

**Step 5: tsc local après chaque batch (5-10 fichiers)**

```bash
npx tsc --noEmit 2>&1 | head -20
```
Si erreur → corriger avant de continuer.

### Ordre d'attaque (par densité)

1. `strength.ts` (25) — gros bloc, attention aux 23505 dedup éventuels.
2. `users.ts` (17)
3. `records.ts` (14)
4. `competition-prep.ts` (14)
5. `timesheet.ts` (13)
6. `swim.ts` (12)
7. `interviews.ts` (11)
8. `swim-planning.ts` (10)
9. `strength-planning.ts` (10)
10. `assignments.ts` (10)
11. … autres fichiers (≤ 8 occurrences chacun) jusqu'à épuisement.

**Step 6: Validation finale après tous les fichiers**

```bash
# Comptage post-codemod (doit être ~30-50, les cas non-transformables)
grep -c "if (error) throw new Error(error.message);" src/lib/api/*.ts | awk -F: '{sum += $2} END {print sum}'

# Comptage des assertSupabase (doit être ~190)
grep -c "assertSupabase(" src/lib/api/*.ts | awk -F: '{sum += $2} END {print sum}'

# tsc clean
npx tsc --noEmit 2>&1 | tail -5; echo EXITCODE=$?

# Tests pass
npm test 2>&1 | grep "ℹ pass\|ℹ fail" | tail -2
```

Expected:
- Pattern littéral résiduel : **30-50** (cas non transformables, OK).
- `assertSupabase(` count : **~190**.
- `EXITCODE=0`.
- `pass 684`, `fail 1` (transformers.test.ts:18 pré-existant).

**Critère de réussite Task 2:** tsc clean + tests pass + pattern résiduel raisonnable + ~190 nouveaux call-sites `assertSupabase`.

---

## Task 3 — Validation post-codemod

**Files:** aucune modification.

**Step 1: tsc**

```bash
npx tsc --noEmit 2>&1 | tail -5; echo EXITCODE=$?
```
Expected: `EXITCODE=0`.

**Step 2: vitest**

```bash
npm test 2>&1 | grep "ℹ pass\|ℹ fail" | tail -2
```
Expected: `pass 684`, `fail 1` (pré-existant).

**Step 3: Grep résiduel**

```bash
# Aucun pattern littéral oublié dans les cas simples ?
grep -rn "if (error) throw new Error(error.message);" src/lib/api/*.ts | head -20
```
Lire chaque ligne restante pour confirmer qu'elle entre dans Cas D/E/F.

**Step 4: Smoke test mental**

Ouvrir 2-3 fichiers transformés (e.g., `strength.ts`, `records.ts`) et lire 1-2 fonctions modifiées pour vérifier la lisibilité.

**Critère de réussite Task 3:** tous checks verts, pattern résiduel justifié.

---

## Task 4 — Smoke test prod (utilisateur)

L'implementer NE commit PAS. Task 5 gère docs + commit.

**Step 1: User valide en prod après push**

Tester quelques flows critiques :
- Login (admin ou coach).
- `/coach` home charge.
- `/natation` charge.
- `/strength` Mon Plan charge.
- `/records` charge.
- Save d'une séance natation (DevTools : Network → POST `/dim_sessions` réussit).

Si une erreur runtime apparaît (e.g., `Cannot read properties of undefined`), c'est qu'un type cast a sauté quelque part — l'implementer doit re-vérifier ce site précis.

**Critère de réussite Task 4:** user smoke OK.

---

## Task 5 — Documentation §232 + commit final

**Files:**
- Modify: `docs/implementation-log.md` (entry §232 en tête).
- Modify: `docs/ROADMAP.md` (Dernière mise à jour).
- Modify: `CLAUDE.md` (Dernier § livré).
- Modify: `docs/claude/files-map.md` (`api/client.ts` taille mise à jour si > 30 % de variation, sinon skip).

**Step 1: Vérifier l'état impl-log**

```bash
head -10 /Users/francoiswagner/Antigravity/Project-EAC/competition/docs/implementation-log.md
```

Si le user a livré d'autres § en parallèle entre-temps, le top entry change. Adapter le numéro si nécessaire (mais §232 doit être le prochain disponible — `grep "^## §" docs/implementation-log.md | head -3` confirme).

**Step 2: Ajouter §232 entry**

```markdown
## §232 — Helper `assertSupabase<T>()` dans api/client.ts (Refacto audit §214) (2026-05-08)

**Contexte :** Refacto cleanup mécanique de l'audit §214 (perf/maintenabilité). 239 occurrences du pattern `if (error) throw new Error(error.message)` dans 36 fichiers `src/lib/api/` — perdait la stack Postgres + codes d'erreur, alourdissait chaque CRUD de 3 lignes de boilerplate.

**Architecture :**

- `src/lib/api/client.ts` : ajout du helper `assertSupabase<T>(res): T`. Comportement **byte-identical** aux call-sites avant migration : `if (res.error) throw new Error(res.error.message); return res.data;`. Compatible avec `PostgrestResponse<T>` ET `PostgrestSingleResponse<T>` via inference générique.
- `src/lib/api/index.ts` : re-export `assertSupabase`.
- 36 fichiers `src/lib/api/*.ts` : codemod ~190 sites sur 239 (les ~49 restants sont conditional throws / prefix formatting / gestion gracieuse, intentionnellement préservés).

**Patterns transformés :**

- Cas A (sélection) : `const { data, error } = ...; if (error) throw...; return data` → `const data = assertSupabase(await ...);`
- Cas B (mutation) : `const { error } = ...; if (error) throw...` → `assertSupabase(await ...);`
- Cas C (RPC) : `const { data, error } = await supabase.rpc(...); if (error) throw...; return data` → `return assertSupabase(await supabase.rpc(...));`

**Patterns préservés (out of scope codemod) :**

- Conditional throws : `if (error && error.code !== '23505') throw...` (ex: `swim-sessions.ts syncSession` 23505 dedup).
- Messages enrichis : `throw new Error(\`Prefix: ${error.message}\`)`.
- Gestion gracieuse : `if (error) return null;` (ex: `getAppSettings`).

**Méthode :** subagent-driven (1 implementer Tasks 1-3 batchés, spec compliance review, code quality review, smoke test user prod, commit final).

**Tests :** `npx tsc --noEmit` clean. `npm test` 684 pass + 1 fail pré-existant.

**Bénéfice net :** ~-180 LOC dans `src/lib/api/` + 1 source de vérité pour le pattern d'erreur Supabase. Toute future télémétrie/log/enrichissement → 1 modification.

**Hors scope §232 :**

- Pas de migration vers `summarizeApiError`/messages FR (Option C écartée).
- Pas de modification des sites avec conditional throws ou prefix formatting.
- Pas de touche aux consumers `src/hooks/`, `src/pages/`, `src/components/`.
- Refacto D (trio Records), suppression `seedDemoData`/`resetCache` reportés.

**Fichiers** : Modifiés : `src/lib/api/client.ts` (+~15 LOC helper), `src/lib/api/index.ts` (+1 re-export), 36 fichiers `src/lib/api/*.ts` (codemod ~190 sites). **Doc** : `docs/plans/2026-05-08-assert-supabase-helper-design.md` (déjà commité), `docs/plans/2026-05-08-assert-supabase-helper.md`, `docs/implementation-log.md`, `docs/ROADMAP.md`, `CLAUDE.md`.
```

**Step 3: Mettre à jour ROADMAP.md, CLAUDE.md**

Patterns identiques à §219/§223 (déplacer ancien en "Précédente" + résumé ≤ 15 mots dans CLAUDE.md).

**Step 4: files-map.md**

Vérifier la taille de `client.ts` :
```bash
wc -l src/lib/api/client.ts
```
Si la taille a varié > 30 %, mettre à jour `docs/claude/files-map.md`. Sinon skip (helper de 15 LOC dans un fichier de ~340 LOC = +4 % seulement).

**Step 5: Commit**

```bash
git add docs/implementation-log.md docs/ROADMAP.md CLAUDE.md docs/claude/files-map.md \
        docs/plans/2026-05-08-assert-supabase-helper.md \
        src/lib/api/client.ts src/lib/api/index.ts \
        src/lib/api/*.ts

git commit -m "feat(§232): helper assertSupabase<T> dans api/client.ts (Refacto audit §214)

Centralise le pattern `if (error) throw new Error(error.message)` (239
occurrences dans 36 fichiers src/lib/api/) via un helper byte-identical.

- src/lib/api/client.ts : +1 export assertSupabase<T>(res): T.
  Compatible PostgrestResponse<T> et PostgrestSingleResponse<T>.
- src/lib/api/index.ts : +1 re-export.
- 36 fichiers src/lib/api/*.ts : codemod ~190 sites sur 239
  (~49 cas conditional throws / prefix formatting / gestion
  gracieuse intentionnellement préservés).

Patterns transformés :
- Sélection : const { data, error } = ...; if (error) throw...; return data
  → const data = assertSupabase(await ...);
- Mutation : const { error } = ...; if (error) throw...
  → assertSupabase(await ...);
- RPC : const { data, error } = await supabase.rpc(...); if (error) throw...;
  return data → return assertSupabase(await supabase.rpc(...));

Net : ~-180 LOC + 1 source de vérité pour le pattern d'erreur Supabase.
Aucune modification de comportement runtime.

tsc clean. 684 tests pass + 1 fail pré-existant transformers.test.ts:18
(non lié, déjà documenté §214/§216/§217/§218/§219/§223).

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
"

git push
```

**Critère de réussite Task 5:** commit + push, workflow GH Pages green.

---

## Critères de validation finale

Avant de marquer §232 fait :

- [ ] `assertSupabase<T>` défini dans `src/lib/api/client.ts`
- [ ] Re-exporté depuis `src/lib/api/index.ts`
- [ ] ~190 call-sites transformés (`grep -c "assertSupabase(" src/lib/api/*.ts | awk -F: '{sum += $2} END {print sum}'`)
- [ ] Pattern littéral résiduel raisonnable : 30-50 (cas non-transformables)
- [ ] `npx tsc --noEmit` exit 0
- [ ] `npm test` 684 pass + 1 fail pré-existant
- [ ] Smoke test prod : login + flows critiques OK
- [ ] Documentation §232 ajoutée
- [ ] 1 commit unique `feat(§232): …` sur main + push
- [ ] Workflow GH Pages green

## Risques connus & mitigations

| Risque | Mitigation |
|---|---|
| Codemod casse un conditional throw (23505 swallow) | Step 2 du codemod : lire le contexte avant transform |
| `data: null` après `.maybeSingle()` mal géré | Pattern préservé : avant aussi `data` était nullable |
| Tests qui mock `error.message` cassent | Improbable car comportement byte-identical |
| Messages enrichis (prefix) accidentellement transformés | Cas F préservé — grep cible le pattern littéral exact |
| Pattern résiduel > 50 ou < 30 | Si > 50 : grep manqué des transformations possibles, lire ; si < 30 : possible faux positif (transformation de Cas D/E/F par erreur), reverter |
