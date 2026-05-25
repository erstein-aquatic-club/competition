# Conception — Unification du runner de tests (`node:test` + vitest jsdom scopé)

*Date : 2026-05-25. Conception validée en brainstorming. Chore d'intégrité des tests.*
*Découvert pendant la revue de code §305 (cf. `docs/implementation-log.md`).*

## 1. Problème

`npm test` exécute `node --test --experimental-test-module-mocks --import tsx "src/**/*.test.ts" "src/**/*.test.tsx"`. **32 fichiers de tests importent `describe/it/expect` depuis `vitest`** : sous `node --test`, leurs suites s'enregistrent dans le collecteur vitest (jamais lancé) → **0 assertion exécutée**, mais le fichier compte comme « 1 test passé ». Ce sont des **gardes faux-verts** (ex. `paceCalculator.test.ts` = 15 `it()`, 0 exécuté). La dette s'est accumulée silencieusement.

## 2. Contexte réel du dépôt (déterminant)

- **131 fichiers `node:test` vs 32 vitest** — `node:test` est la convention dominante.
- Le dépôt **teste déjà des composants `.tsx` sous `node:test`** via **`renderToStaticMarkup`** (react-dom/server → assertions sur le HTML), **sans jsdom** (ex. `RestScreen.test.tsx`, `Admin.test.tsx`).
- `node --test` tourne avec **`--experimental-test-module-mocks`** → le **mock de modules est disponible sans vitest** (précédent en place : `strength-mesocycles.test.ts` utilise `mock.module`).
- devDeps présents : `vitest ^4`, `jsdom ^28`, `@testing-library/react`, `@testing-library/dom`. Deux configs vitest existent déjà (`vitest.config.e2e.ts`, `vitest.config.rls.ts`), **hors** `npm test`.

→ La majorité des 32 fichiers peut tourner sous `node:test` ; seule une poignée de **tests de hooks interactifs** (`renderHook` + timers/serviceWorker) exige un vrai DOM.

## 3. Décision (approche C)

**Un runner canonique (`node:test`), vitest scopé au seul DOM réel.** Partition **par nom de fichier** :
- `*.test.ts(x)` → `node:test` (glob existant) ;
- `*.vitest.ts(x)` → nouvelle config **`vitest.config.unit.ts`** (jsdom). Comme `*.vitest.ts` ne finit pas par `.test.ts`, le glob `node --test` ne le capte pas → partition **sans recouvrement**, sans renommage massif.

Décisions confirmées : (a) convention de nom **`.vitest.ts`** pour la poignée DOM ; (b) **garde-fou** anti-récidive inclus.

## 4. Catégorisation des 32 fichiers

**A. Portés vers `node:test` en place (~29)** :
- *Logique pure (~22)* : `info-helpers`, `prDetection`, `useTrainingLoad`, `swimAnalytics`, `strengthHistoryUtils`, `paceCalculator`, `export-pace-pdf`, `dashboard-hooks(.tsx)`, `useStrengthPlanByISO`, `useMyTeam`, `useSlotCalendar`, `strengthPlanningMerge`, `push`, `chronoXlsxExport`, `chrono-reducer`, `swimPlanningMerge`, `gifEncoder`, `chrono-types`, `withTimeout`, `assignments-slot`, `strengthPlanWeeks`, `derivePlanByWeekDay`, `CoachMySwimmersScreen(.tsx)`, `CoachPaceCalculatorScreen(.tsx)`.
- *Mock/DOM (~5)* : `offlineSync`, `chrono-avatar-cache` (→ `mock.module`/`mock.method`) ; `offlineQueue`, `auth-state`, `chrono-save-queue` (→ stub minimal `localStorage`/`navigator` ; **escaladés en vitest si le stub ne suffit pas** — décision par fichier à l'exécution).

**B. Déplacés en `*.vitest.ts` (jsdom, ~3)** : `useDebouncedValue`, `useDelayedLoading`, `useInAppPushBridge` (hooks interactifs `renderHook` + timers/serviceWorker).

## 5. Mécanique de portage (référence)

| vitest | node:test |
|---|---|
| `import { describe, it, expect } from 'vitest'` | `import { describe, it } from 'node:test'; import assert from 'node:assert/strict'` |
| `expect(a).toBe(b)` / `.toEqual(b)` | `assert.equal(a,b)` / `assert.deepEqual(a,b)` |
| `.toBeCloseTo(b,n)` | `assert.ok(Math.abs(a-b) < tol)` |
| `.toThrow()` / `.rejects` | `assert.throws(fn)` / `await assert.rejects(p)` |
| `.toContain(x)` / `.toBeNull()` / `.toBeTruthy()` | `assert.ok(a.includes(x))` / `assert.equal(a,null)` / `assert.ok(a)` |
| `vi.fn()` / `vi.spyOn(o,'m')` | `import { mock } from 'node:test'` → `mock.fn()` / `mock.method(o,'m')` |
| `vi.mock('mod', factory)` | `mock.module('mod', { namedExports: … })` (déjà utilisé dans `strength-mesocycles.test.ts`) |
| component render | `renderToStaticMarkup(<…/>)` + assertions HTML |

## 6. Câblage `npm test` + garde-fou

- `package.json` : `"test": "node --test --experimental-test-module-mocks --import tsx \"src/**/*.test.ts\" \"src/**/*.test.tsx\" && vitest run --config vitest.config.unit.ts"`. (Le `&&` : si node:test échoue, on n'enchaîne pas — acceptable ; alternative `;` si on veut les deux rapports — à trancher au plan.)
- `vitest.config.unit.ts` : `environment: 'jsdom'`, `include: ['src/**/*.vitest.{ts,tsx}']`, `globals: true`, setup `@testing-library/jest-dom` si déjà dispo (sinon sans).
- **Garde-fou** `scripts/check-test-runner.mjs` (lancé en `pretest` ou en tête de `test`) : échoue si un `*.test.ts(x)` importe `from 'vitest'`. Empêche la récidive (la cause racine = inertie silencieuse).

## 7. Règle de triage (transversale, critique)

Activer ~32 fichiers jamais exécutés **fera apparaître des échecs** (attentes périmées ou **vrais bugs**). Par fichier : si échec → diagnostiquer **attente-de-test erronée vs bug réel du code**, **reporter**, et **ne JAMAIS affaiblir une assertion pour forcer le vert**. **Un vrai bug de code → on s'arrête et on le remonte à l'utilisateur** (ce chore ne doit pas se transformer en correctifs de code silencieux).

## 8. Risques

- **Échecs au réveil** : impossible de prédire combien des 32 passeront tels quels. Le plan procède par lots avec triage ; les vrais bugs sont escaladés, pas masqués.
- **Stub vs jsdom** pour les 3 DOM-global : décision par fichier ; fallback = `.vitest.ts`.
- **`mock.module` ESM** : sémantique node parfois plus stricte que vitest ; certains mocks peuvent demander un léger reshape.

## 9. Hors périmètre

Migration des 131 fichiers `node:test` (ils marchent) ; refonte des configs e2e/rls ; nouveaux tests. On **active** l'existant, on ne le réécrit pas au-delà du portage.

## 10. Références

- `docs/implementation-log.md` (§305 § Limites — dette ~32 tests).
- `package.json` scripts ; `vitest.config.e2e.ts` / `vitest.config.rls.ts` (modèles de config).
- Précédent `mock.module` : `src/lib/api/__tests__/strength-mesocycles.test.ts`.
- Précédent composant node:test : `src/components/strength/__tests__/RestScreen.test.tsx`.
