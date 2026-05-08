# §219 Suppression de la façade `src/lib/api.ts` Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Supprimer entièrement `src/lib/api.ts` (1039 LOC dont ~607 stubs de délégation). Migrer la vraie logique vers les sous-modules existants. Réécrire 425 call-sites + 30+ imports en named imports depuis `@/lib/api`.

**Architecture:** `@/lib/api` (= `src/lib/api/index.ts`) devient l'unique point d'entrée public. La vraie logique migrée vers `api/client.ts` (`getCapabilities`), `api/localStorage.ts` (`_get`/`_save`/`seedDemoData`/`resetCache`), et un nouveau `api/swim-sessions.ts` (`syncSession`, `ensureSwimSession`, `getSessions`, `updateSession`, `deleteSession`, `updateSessionCoachNotes`).

**Tech Stack:** TypeScript 5, Vite 7, React 19, Supabase JS. Tests Node test runner. Codemod manuel (file-by-file via Edit).

---

## Pré-requis

- Working tree status au démarrage : impl-log.md modifié (§215 audit user uncommitted) + audit doc untracked. **Ne pas toucher**, ce sont les fichiers du user.
- Les commits §214/§216/§217/§218 sont déjà sur main et déployés.
- Lire avant de coder : `docs/plans/2026-05-08-api-facade-removal-design.md` (design validé).

## Inventaire pré-existant

- **`src/lib/api.ts`** : 1039 LOC. Lignes 1-431 = imports + alias (`getProfile as _getProfile`). Lignes 432-1039 = `export const api = { ... }` avec 250 `async` méthodes.
- **Real-logic methods** (8 méthodes utilisant `this._get`/`this._save` ou logique inline) :
  - `getCapabilities` (433-449)
  - `syncSession` (452-502) ← **CRITIQUE** : try/catch 23505 dedup à préserver byte-identical
  - `ensureSwimSession` (504-547)
  - `getSessions` (549-584)
  - `updateSession` (586-618)
  - `deleteSession` (620-632)
  - `updateSessionCoachNotes` (634-641)
  - `seedDemoData` (644-679)
- **Helpers utility** (3 méthodes) :
  - `_get` (682-685)
  - `_save` (687-689)
  - `resetCache` (691-694)
- **Stubs de délégation** (~242 méthodes) : pattern `async fnX(args) { return _fnX(args); }`. Chacune est déjà importée en alias ligne 1-431.
- **API/index.ts** : 508 LOC. Re-exporte déjà types, helpers, client utilities, et certaines fonctions. **Devra être étendu** pour couvrir toutes les fonctions utilisées via `api.X`.

## Liste exacte des 201 fonctions distinctes utilisées via `api.X`

Grep préalable : `/tmp/api-functions-used.txt` contient les 201 noms (incluant `api._get`, `api._save`).

**Note :** 79 fichiers consomment `import { api } from "@/lib/api"`. Liste complète obtenue par :
```bash
grep -rln "from \"@/lib/api\"\|from '@/lib/api'" src --include="*.ts" --include="*.tsx" | xargs grep -l "{ api\| api,\|^import { api"
```

---

## Task 1 — Créer `src/lib/api/swim-sessions.ts` (migration logique critique)

**Files:**
- Create: `src/lib/api/swim-sessions.ts`

**Pourquoi:** sortir les 6 méthodes `syncSession`/`ensureSwimSession`/`getSessions`/`updateSession`/`deleteSession`/`updateSessionCoachNotes` de `api.ts` vers un sous-module dédié. Préserver byte-identical la logique 23505 dedup de `syncSession` (critique pour saisies concurrentes).

**Step 1: Créer le fichier**

```ts
/**
 * Swim sessions API - CRUD pour la table dim_sessions.
 * §219 — Migré depuis src/lib/api.ts (kill de la façade).
 *
 * NOTE 23505 dedup dans syncSession :
 * Depuis migration 00116 l'index unique est (athlete_id, session_date,
 * time_slot) sans assignment_id. Sur conflit on UPDATE l'existant en place,
 * preservant assignment_id si l'incoming est null (sinon on perdrait le
 * lien coach ↔ log lors d'une saisie via flow non-coach).
 */

import { supabase } from "./client";
import { canUseSupabase } from "./client";
import { delay } from "./client";
import { expandScaleToTen, normalizeScaleToFive } from "./client";
import { mapToDbSession, mapFromDbSession, type SyncSessionInputWithId } from "./helpers";
import { localStorageGet, localStorageSave } from "./localStorage";
import { STORAGE_KEYS } from "./client";
import type { Session, ApiCapabilities } from "./types";

export async function getCapabilities(): Promise<ApiCapabilities> {
  if (!canUseSupabase()) {
    return {
      mode: "local",
      version: null,
      timesheet: { available: true },
      messaging: { available: true },
    };
  }
  return {
    mode: "supabase",
    version: null,
    timesheet: { available: true },
    messaging: { available: true },
  };
}

export async function syncSession(
  session: SyncSessionInputWithId,
): Promise<{ status: string; sessionId: number }> {
  // [COPIER VERBATIM le corps de api.ts:452-502]
  // ATTENTION : préserver le bloc try/catch 23505 EXACTEMENT.
  // Remplacer `this._save(STORAGE_KEYS.SESSIONS, [...sessions, newSession])`
  // par `localStorageSave(STORAGE_KEYS.SESSIONS, [...sessions, newSession])`.
  // Remplacer `this._get(STORAGE_KEYS.SESSIONS)` par `localStorageGet<Session[]>(STORAGE_KEYS.SESSIONS)`.
}

export async function ensureSwimSession(params: {
  athleteName: string;
  athleteId?: number | string | null;
  date: string;
  slot: string;
}): Promise<number> {
  // [COPIER VERBATIM api.ts:504-547]
  // Aucune référence à `this`, copie directe.
}

export async function getSessions(
  athleteName: string,
  athleteId?: number | string | null,
): Promise<Session[]> {
  // [COPIER VERBATIM api.ts:549-584]
  // Remplacer `this._get(STORAGE_KEYS.SESSIONS)` par `localStorageGet<Session[]>(STORAGE_KEYS.SESSIONS)`.
}

export async function updateSession(session: Session): Promise<{ status: string }> {
  // [COPIER VERBATIM api.ts:586-618]
  // Remplacer `this._get`/`this._save` par localStorageGet/Save.
}

export async function deleteSession(sessionId: number): Promise<{ status: string }> {
  // [COPIER VERBATIM api.ts:620-632]
  // Remplacer `this._get`/`this._save` par localStorageGet/Save.
}

export async function updateSessionCoachNotes(
  sessionId: number,
  notes: string | null,
): Promise<void> {
  // [COPIER VERBATIM api.ts:634-641]
  // Aucune référence à `this`, copie directe.
}
```

**IMPORTANT pour l'implementer** : utiliser `git show HEAD:src/lib/api.ts` pour récupérer la source byte-identical. Ne PAS réécrire la logique 23505. Le bloc try/catch dans `syncSession` (lignes 463-491) est critique.

**Step 2: Vérifier la compilation isolée**

Run: `npx tsc --noEmit 2>&1 | head -10`
Expected: Pas d'erreur dans `swim-sessions.ts`. Erreurs ailleurs OK temporairement (api.ts toujours présent).

---

## Task 2 — Étendre `src/lib/api/localStorage.ts` (helpers + seedDemoData)

**Files:**
- Modify: `src/lib/api/localStorage.ts`

**Pourquoi:** ajouter `seedDemoData` (utilisé par dev-tools, pas externalisé mais conservé) et exposer les noms `_get`/`_save` historiques (UNIQUEMENT pour la compat du test `sessions-crud.test.ts:41,46,54,57` qui les utilise).

**Step 1: Ajouter `seedDemoData` à la fin du fichier**

```ts
import { assignments_create } from "./assignments"; // ou le nom exact depuis api/assignments.ts

/**
 * §219 — Migré depuis api.ts:644-679. Initialise le localStorage avec des
 * données de démo (exercices, séances strength + swim, 1 assignment).
 * Utilisé en dev pour démarrer sans Supabase.
 */
export async function seedDemoData() {
  const exercises = [
    { id: 1, nom_exercice: "Squat", description: "Flexion des jambes", exercise_type: "strength" },
    { id: 2, nom_exercice: "Développé Couché", description: "Poussée horizontale", exercise_type: "strength" },
    { id: 3, nom_exercice: "Tractions", description: "Tirage vertical", exercise_type: "strength" },
    { id: 4, nom_exercice: "Rotations Élastique", description: "Coiffe des rotateurs", exercise_type: "warmup" },
  ];
  localStorageSave(STORAGE_KEYS.EXERCISES, exercises);

  const sSession = {
    id: 101, title: "Full Body A", description: "Séance globale", cycle: "Endurance",
    items: [
      { exercise_id: 4, exercise_name: "Rotations Élastique", category: "warmup", order_index: 0, sets: 2, reps: 15, rest_seconds: 30, percent_1rm: 0 },
      { exercise_id: 1, exercise_name: "Squat", category: "strength", order_index: 1, sets: 4, reps: 10, rest_seconds: 90, percent_1rm: 70 },
      { exercise_id: 2, exercise_name: "Développé Couché", category: "strength", order_index: 2, sets: 4, reps: 10, rest_seconds: 90, percent_1rm: 70 },
    ],
  };
  localStorageSave(STORAGE_KEYS.STRENGTH_SESSIONS, [sSession]);

  const swSession = {
    id: 201,
    name: "VMA 100",
    description: "Travail de vitesse",
    created_by: 1,
    items: [
      { label: "Échauffement 4N", distance: 400, intensity: "Souple", notes: "Progressif" },
      { label: "Corps NL", distance: 1000, intensity: "Max", notes: "10x100 départ 1:30" },
    ],
  };
  localStorageSave(STORAGE_KEYS.SWIM_SESSIONS, [swSession]);

  const today = new Date().toISOString().split("T")[0];
  await assignments_create({ session_id: 101, assignment_type: "strength", target_athlete: "Camille", assigned_date: today });

  return { status: "seeded" };
}

/**
 * §219 — Migré depuis api.ts:691-694. Vide le localStorage et reload la page.
 * Helper dev-tools.
 */
export function resetCache() {
  Object.values(STORAGE_KEYS).forEach((key) => localStorage.removeItem(key));
  window.location.reload();
}
```

**Step 2: Ajouter aliases historiques `_get` / `_save`**

Pas nécessaire d'ajouter de nouvelles exports — les fonctions `localStorageGet` et `localStorageSave` existent déjà. Le test `sessions-crud.test.ts` sera mis à jour pour utiliser les noms canoniques.

**Step 3: Vérifier la compilation**

Run: `npx tsc --noEmit 2>&1 | head -10`
Expected: si `assignments_create` n'a pas le bon nom dans `api/assignments.ts`, ajuster l'import. Sinon clean.

---

## Task 3 — Étendre `src/lib/api/index.ts` (re-exports complets)

**Files:**
- Modify: `src/lib/api/index.ts`

**Pourquoi:** garantir que toutes les 201 fonctions utilisées via `api.X` sont exportées depuis `@/lib/api` après le codemod. Sinon les call-sites échoueront à la compilation.

**Step 1: Audit des exports actuels**

Run :
```bash
grep -rn "api\." /Users/francoiswagner/Antigravity/Project-EAC/competition/src --include="*.ts" --include="*.tsx" 2>/dev/null \
  | grep -v "^.*://" \
  | grep -E "api\.[a-zA-Z]+\(" \
  | grep -oE "api\.[a-zA-Z][a-zA-Z0-9_]*" \
  | sed 's/^api\.//' \
  | sort -u > /tmp/api-functions-needed.txt

cat /tmp/api-functions-needed.txt | wc -l
# Expected: ~201
```

**Step 2: Compare aux exports actuels**

Run :
```bash
# Extraire les exports actuels de api/index.ts
grep -E "^  [a-zA-Z]" /Users/francoiswagner/Antigravity/Project-EAC/competition/src/lib/api/index.ts \
  | grep -v "^  //" \
  | sed -E 's/^[[:space:]]*([a-zA-Z_][a-zA-Z0-9_]*).*$/\1/' \
  | grep -v "^export" \
  | grep -v "^from" \
  | sort -u > /tmp/api-index-exports.txt

# Diff
comm -23 /tmp/api-functions-needed.txt /tmp/api-index-exports.txt > /tmp/api-missing-exports.txt
cat /tmp/api-missing-exports.txt
```

**Step 3: Ajouter les re-exports manquants**

Pour chaque nom dans `/tmp/api-missing-exports.txt`, identifier son sous-module via :
```bash
grep -rln "^export.*function NAME\|^export const NAME" src/lib/api/ --include="*.ts"
```

Puis ajouter à `api/index.ts` (regrouper par sous-module pour la lisibilité) :
```ts
export {
  fnA,
  fnB,
  fnC,
} from "./<sous-module>";
```

**IMPORTANT** : les fonctions migrées en Task 1+2 (`getCapabilities`, `syncSession`, `ensureSwimSession`, `getSessions`, `updateSession`, `deleteSession`, `updateSessionCoachNotes`, `seedDemoData`, `resetCache`) doivent aussi être ajoutées :

```ts
export {
  getCapabilities,
  syncSession,
  ensureSwimSession,
  getSessions,
  updateSession,
  deleteSession,
  updateSessionCoachNotes,
} from "./swim-sessions";

export {
  seedDemoData,
  resetCache,
  localStorageGet,
  localStorageSave,
} from "./localStorage";
```

**Step 4: Vérifier la compilation**

Run: `npx tsc --noEmit 2>&1 | head -20`
Expected: pas d'erreurs nouvelles dans `api/index.ts`. Erreurs sur consumers (encore en `api.X`) OK temporairement.

---

## Task 4 — Codemod call-sites (79 fichiers)

**Files:**
- Modify: tous les fichiers identifiés par `grep -rln "from \"@/lib/api\"" src/ | xargs grep -l "{ api"` ET les fichiers de tests.

**Pourquoi:** remplacer `api.fnX(...)` par `fnX(...)` dans 425 occurrences, et réécrire les imports correspondants.

**Step 1: Lister les fichiers consommateurs**

Run :
```bash
grep -rln "from \"@/lib/api\"\|from '@/lib/api'" /Users/francoiswagner/Antigravity/Project-EAC/competition/src --include="*.ts" --include="*.tsx" 2>/dev/null \
  | xargs grep -l "{ api\| api,\|^import { api" 2>/dev/null \
  > /tmp/api-consumer-files.txt

cat /tmp/api-consumer-files.txt | wc -l
# Expected: ~79
```

**Step 2: Pour chaque fichier consommateur, faire la transformation**

Pattern de transformation (exemple) :

**AVANT** (`src/components/dashboard/DashboardFeedbackContainer.tsx:3`):
```tsx
import { api } from "@/lib/api";
import type { Session, Assignment, PlannedAbsence } from "@/lib/api";
// ...
api.deleteSession(Number(existing.id));
api.syncSession({ ... });
api.saveSwimExerciseLogs(result.sessionId, authUid, _exerciseLogs);
```

**APRÈS** :
```tsx
import {
  deleteSession,
  syncSession,
  saveSwimExerciseLogs,
  type Session,
  type Assignment,
  type PlannedAbsence,
} from "@/lib/api";
// ...
deleteSession(Number(existing.id));
syncSession({ ... });
saveSwimExerciseLogs(result.sessionId, authUid, _exerciseLogs);
```

**Workflow recommandé pour chaque fichier** :
1. Grep `api\.` dans ce fichier → liste les fonctions utilisées.
2. Réécrire la ligne d'import : combiner la liste des fonctions + les types existants.
3. Remplacer chaque `api.fnX(` par `fnX(` (le `(` final est important pour ne pas matcher des références non-call comme `api.someProperty`).
4. Vérifier qu'il ne reste pas de `api.` dans le fichier (sauf commentaires).

**Cas spéciaux à gérer** :

- Fichiers avec `import { api, type Foo, type Bar } from "@/lib/api"` :
  → garder les types, ajouter les fonctions.
- Fichiers avec `import { api, StrengthCycleType, StrengthSessionTemplate } from "@/lib/api"` (types sans `type` keyword, anciens) :
  → ajouter `type` pour ces noms s'il s'agit de types : `import { fnX, type StrengthCycleType }`. Vérifier avec `grep -n "export type StrengthCycleType\|export interface StrengthCycleType" src/lib/api/types.ts`.
- Fichiers de tests (`__tests__/`) qui utilisent `api._get` / `api._save` :
  → remplacer par `localStorageGet` / `localStorageSave`.

**Step 3: Validation par batch**

Recommandation : faire 5-10 fichiers à la fois, puis :
```bash
npx tsc --noEmit 2>&1 | head -30
```
Si erreurs : corriger avant de continuer.

**Step 4: Validation finale**

Quand tous les fichiers consommateurs sont migrés :
```bash
# Aucun `import { api }` ou `import { api, ...}` ne doit rester
grep -rn "import { api" /Users/francoiswagner/Antigravity/Project-EAC/competition/src --include="*.ts" --include="*.tsx" 2>/dev/null
# Expected: 0 résultats

# Aucun `api.fnX(` ne doit rester (sauf dans les commentaires)
grep -rn "[^a-zA-Z_]api\.[a-zA-Z]" /Users/francoiswagner/Antigravity/Project-EAC/competition/src --include="*.ts" --include="*.tsx" 2>/dev/null \
  | grep -v "^.*://"
# Expected: 0 résultats (sauf api.ts lui-même qui sera supprimé en Task 5)
```

**Step 5: tsc + tests intermédiaires**

Run: `npx tsc --noEmit 2>&1 | tail -10; echo EXITCODE=$?`
Expected: `EXITCODE=0`.

Run: `npm test 2>&1 | grep "ℹ pass\|ℹ fail" | tail -2`
Expected: `pass 684`, `fail 1` (le `transformers.test.ts:18` pré-existant).

---

## Task 5 — Supprimer `src/lib/api.ts`

**Files:**
- Delete: `src/lib/api.ts`

**Step 1: Suppression**

Run :
```bash
git rm /Users/francoiswagner/Antigravity/Project-EAC/competition/src/lib/api.ts
```

**Step 2: Validation finale**

Run :
```bash
npx tsc --noEmit 2>&1 | tail -10
echo "EXITCODE=$?"
```
Expected: `EXITCODE=0`. Si erreurs → revenir en Task 4 et compléter le codemod.

Run :
```bash
npm test 2>&1 | grep "ℹ pass\|ℹ fail" | tail -2
```
Expected: `pass 684`, `fail 1`.

**Step 3: Vérifier la taille de l'impact**

Run :
```bash
wc -l /Users/francoiswagner/Antigravity/Project-EAC/competition/src/lib/api/index.ts \
       /Users/francoiswagner/Antigravity/Project-EAC/competition/src/lib/api/swim-sessions.ts \
       /Users/francoiswagner/Antigravity/Project-EAC/competition/src/lib/api/localStorage.ts \
       /Users/francoiswagner/Antigravity/Project-EAC/competition/src/lib/api/client.ts 2>/dev/null
```
Expected: la somme des nouveaux LOC + ajouts ≈ 350-450 LOC. Net : -600 à -700 LOC.

---

## Task 6 — Validation utilisateur (smoke test prod)

**Files:** aucun (test manuel utilisateur)

L'implementer NE commit PAS. La doc + commit + push sont gérés en Task 7 par le contrôleur après le smoke test du user.

**Step 1: Préparer le smoke test**

L'utilisateur teste en prod après push. Tester :
- Login + navigation nageur (route `/`).
- Ouvrir un jour, saisir un feedback, sauvegarder → toast vert.
- Re-ouvrir → valeurs persistées.
- Marquer un jour absent → re-restaurer.
- Navigation coach (route `/coach`) : load la home, voir les athlètes, ouvrir une fiche.
- Records (route `/records`) : chargement de la liste.
- Strength (route `/strength`) : chargement de Mon Plan.

Si ça plante visiblement → revenir en arrière (revert le commit) et investigation.

---

## Task 7 — Documentation §219 + commit final

**Files:**
- Modify: `docs/implementation-log.md` (ajouter entrée §219 en tête)
- Modify: `docs/ROADMAP.md` (ligne "Dernière mise à jour" + déplacer §218 en "Précédente")
- Modify: `CLAUDE.md` (ligne "Dernier § livré" → §219)
- Modify: `docs/claude/files-map.md` (api.ts supprimé, swim-sessions.ts ajouté, localStorage.ts taille mise à jour)

**Step 1: Stash le travail user**

```bash
mkdir -p /tmp/eac-stash
cp /Users/francoiswagner/Antigravity/Project-EAC/competition/docs/implementation-log.md /tmp/eac-stash/impl-log-with-user-215.md
git -C /Users/francoiswagner/Antigravity/Project-EAC/competition checkout HEAD -- docs/implementation-log.md
```

**Step 2: Ajouter l'entrée §219**

Insérer en tête (après le H1 + règle), au-dessus de §218 :

```markdown
## §219 — Suppression de la façade `src/lib/api.ts` (Refacto A) (2026-05-08)

**Contexte :** Refacto A de l'audit §214 (perf/maintenabilité). `src/lib/api.ts` (1039 LOC) exposait `export const api = { ... }` avec ~242 stubs de délégation (`async fnX() { return _fnX(); }`) + 8 méthodes à vraie logique. Façade redondante par-dessus `src/lib/api/index.ts`. Toute addition d'API forçait à toucher 4 fichiers (sous-module + types + façade + index).

**Architecture :** suppression complète de `api.ts`. Vraie logique migrée vers `api/swim-sessions.ts` (NEW), `api/localStorage.ts` (élargi), `api/client.ts` (élargi). `api/index.ts` re-exporte tout. Imports passent de `import { api } from "@/lib/api"` + `api.fnX(...)` à named imports `import { fnX } from "@/lib/api"` + `fnX(...)`.

**Migrations :**
- `getCapabilities` → `api/client.ts`
- `syncSession`, `ensureSwimSession`, `getSessions`, `updateSession`, `deleteSession`, `updateSessionCoachNotes` → `api/swim-sessions.ts` (NEW). Logique 23505 dedup de `syncSession` préservée byte-identical.
- `seedDemoData`, `resetCache` → `api/localStorage.ts`. `_get`/`_save` remplacés par les `localStorageGet`/`localStorageSave` existants (renommage des call-sites internes).

**Codemod :** 425 call-sites `api.fnX(` → `fnX(` dans 79 fichiers consommateurs. Imports réécrits (`{ api }` → `{ fnA, fnB, ..., type Foo }`). Tests `__tests__/sessions-crud.test.ts:41,46,54,57` mis à jour pour utiliser `localStorageGet`/`localStorageSave`.

**Méthode :** subagent-driven (1 implementer batch Tasks 1-5, 2 reviews spec + code quality, smoke test user, commit final). Plan détaillé dans `docs/plans/2026-05-08-api-facade-removal.md`. Design dans `docs/plans/2026-05-08-api-facade-removal-design.md`.

**Tests :** `npx tsc --noEmit` clean. `npm test` 684 pass + 1 fail pré-existant `transformers.test.ts:18` (déjà documenté §214/§216/§217/§218).

**Bénéfice net :** `api.ts` 1039 → 0 LOC. `api/swim-sessions.ts` ~150 LOC + extensions `api/localStorage.ts`/`api/client.ts`/`api/index.ts` ~50-100 LOC. Net : **~-800 LOC** + 1 source de vérité stricte + suppression du double-export façade/index.

**Hors scope §219 :**
- Pas de modification fonctionnelle. Strictement structural.
- `seedDemoData`/`resetCache` migrés mais pas appelés (dead-code candidate, à supprimer dans un § dédié).
- Refactos C (RPC coach KPIs), D (trio Records), helper `assertSupabase<T>()` reportés.

**Fichiers** : Créés : `src/lib/api/swim-sessions.ts` (~150 LOC). Modifiés : `src/lib/api/index.ts`, `src/lib/api/localStorage.ts`, `src/lib/api/client.ts`, 79 fichiers consommateurs. **Supprimé : `src/lib/api.ts`**. **Doc** : `docs/plans/2026-05-08-api-facade-removal-design.md`, `docs/plans/2026-05-08-api-facade-removal.md`, `docs/implementation-log.md`, `docs/ROADMAP.md`, `CLAUDE.md`, `docs/claude/files-map.md`.
```

**Step 3: Mettre à jour ROADMAP.md, CLAUDE.md, files-map.md**

Voir patterns dans §216/§217/§218 (déjà commités) pour le format. La règle `claude.md` : updater UNIQUEMENT la ligne "Dernier § livré" + déplacer l'ancienne en "Précédente" dans ROADMAP.

**Step 4: Restaurer le travail user**

```bash
# Re-insérer le §215 audit user entre §218 et §216 (chronologique inverse)
# Note : le user §215 est dans /tmp/eac-stash/impl-log-with-user-215.md
# Lire la section §215 (lignes 7-52 du fichier stashé) et la coller dans le nouveau impl-log.md APRÈS §216 entry.
```

**Step 5: Commit + push**

```bash
git add docs/implementation-log.md docs/ROADMAP.md CLAUDE.md docs/claude/files-map.md \
        src/lib/api/index.ts src/lib/api/swim-sessions.ts src/lib/api/localStorage.ts src/lib/api/client.ts \
        [list all modified consumer files via git status --short | grep "^ M src" | awk '{print $2}']

git commit -m "feat(§219): suppression de la façade src/lib/api.ts (Refacto A)

Cible audit §214 : api.ts 1039 LOC dont ~242 stubs de délégation
(async fnX() { return _fnX(); }) supprimée. Tout passe par
@/lib/api (= src/lib/api/index.ts) en named imports.

- api.ts SUPPRIMÉ (-1039 LOC)
- src/lib/api/swim-sessions.ts NEW (~150 LOC) : syncSession (avec
  logique 23505 dedup préservée byte-identical), ensureSwimSession,
  getSessions, updateSession, deleteSession, updateSessionCoachNotes,
  getCapabilities (déplacé ici aussi).
- api/localStorage.ts élargi : seedDemoData, resetCache.
- api/index.ts élargi : re-exports complets pour les 201 fonctions
  utilisées via api.X dans le projet.
- 79 fichiers consommateurs migrés : import { api } from \"@/lib/api\"
  + api.fnX(...) → import { fnX } from \"@/lib/api\" + fnX(...).
- Tests sessions-crud.test.ts mis à jour (api._get/_save →
  localStorageGet/Save).

Net : ~-800 LOC + 1 source de vérité stricte. Aucune modification
fonctionnelle.

tsc clean. 684 tests pass + 1 fail pré-existant transformers.test.ts:18
(non lié, déjà documenté §214/§216/§217/§218).

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"

git push
```

**Step 6: Cleanup stash**

```bash
rm -rf /tmp/eac-stash
```

---

## Critères de validation finale

Avant de marquer §219 fait :

- [ ] `wc -l src/lib/api.ts` → file does not exist (0)
- [ ] `npx tsc --noEmit` → exit 0
- [ ] `npm test` → 684 pass + 1 fail attendu
- [ ] `grep -rn "import { api" src/ --include="*.ts" --include="*.tsx"` → 0 résultats
- [ ] `grep -rn "[^a-zA-Z_]api\.[a-zA-Z]" src/ --include="*.ts" --include="*.tsx" | grep -v "^.*://"` → 0 résultats
- [ ] Smoke test utilisateur en prod : login + save séance + navigation coach → OK
- [ ] Documentation §219 ajoutée à 4 fichiers + 1 entry dans implementation-log
- [ ] 1 commit unique `feat(§219): …` sur branche main
- [ ] Workflow GH Pages green

## Risques connus & mitigations

| Risque | Mitigation |
|---|---|
| `syncSession` réécrit ≠ original (perte 23505 dedup) | L'implementer doit utiliser `git show HEAD:src/lib/api.ts` pour la copie verbatim |
| Call-site oublié → `tsc` rouge | Validation Step 5 par batch, validation finale Task 5 Step 2 |
| Type alias mal préservé (`import { api, type Foo }`) | Le pattern de transformation Task 4 Step 2 préserve explicitement les types |
| Test `sessions-crud.test.ts` casse | Spec Task 4 Step 2 prévoit le remplacement `api._get`/`_save` → `localStorageGet`/`localStorageSave` |
| Régression silencieuse offline localStorage | `localStorageGet`/`localStorageSave` sont byte-identical à `_get`/`_save` (mêmes try/catch JSON parse/stringify) |
| Volume du diff (>800 LOC modifiées) | Validation `tsc --noEmit` à chaque batch + smoke test prod final |
