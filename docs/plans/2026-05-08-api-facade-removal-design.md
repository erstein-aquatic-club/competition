# §219 — Suppression de la façade `src/lib/api.ts` (Refacto A)

*Date : 2026-05-08 — Suite §218 (drawer perf), §216 (Dashboard split), §214 (audit perf/maintenabilité).*

## Contexte

`src/lib/api.ts` (1039 LOC) expose un objet monolithique `export const api = { ... }` avec ~150 méthodes. La grande majorité (lignes 506-1039, ~530 LOC) sont des **stubs de délégation** identiques :

```ts
async fnX(args) { return _fnX(args); }
```

Ces stubs alourdissent la base sans rien apporter — chaque ajout d'API touche désormais 4 endroits (sous-module + types + façade + index re-export). Une nouvelle façade par-dessus une façade existante (`src/lib/api/index.ts`).

L'audit perf/maintenabilité §214 (code-simplifier sub-agent) avait classé cette façade comme la plus grosse opportunité de cleanup mécanique. Reportée à un § dédié → c'est §219.

## Décisions de design

### Architecture cible

```
src/lib/api/
├── index.ts              ← seul point d'entrée public (re-exporte tout)
├── client.ts             ← supabase client + utilitaires + getCapabilities (élargi)
├── localStorage.ts       ← _get/_save/STORAGE_KEYS/seedDemoData/resetCache (élargi)
├── helpers.ts            ← mapToDbSession etc. (existant)
├── swim.ts (ou nouveau swim-logs.ts) ← syncSession/ensureSwimSession migrés
├── types.ts              ← (existant)
└── ... 35+ autres sous-modules (existants, intacts)

src/lib/api.ts            ← SUPPRIMÉ
```

### Style d'import (validé)

**Named imports** : `import { fnX, fnY } from "@/lib/api"` partout. Pas de namespace import (`* as api`).

Trade-off accepté : 425 call-sites à modifier (`api.fnX` → `fnX`) + 30+ import statements à réécrire. Bénéfice : tree-shaking optimal, code idiomatique React/TS, 1 source de vérité stricte.

### Scope (validé)

**Tuer complètement `api.ts`** — pas de version slim. Toute la vraie logique migre dans les sous-modules.

### Phases d'exécution

| Phase | Action | LOC affecté | Risque |
|---|---|---|---|
| 1 | Migration vraie logique (`syncSession`, `ensureSwimSession`, `getCapabilities`, `_get`/`_save`/`STORAGE_KEYS`/`seedDemoData`/`resetCache`) vers sous-modules | ~150 LOC déplacés | **Moyen** — `syncSession` doit rester byte-identical (try/catch 23505 dedup critique) |
| 2 | Compléter `api/index.ts` re-exports pour couvrir les 198 fonctions distinctes | ~50 LOC ajoutés | Faible |
| 3 | Codemod 425 call-sites + 30+ imports (`api.fnX(...)` → `fnX(...)`) | ~30 fichiers | Faible — `tsc` attrape les oublis |
| 4 | `git rm src/lib/api.ts` | -1039 LOC | Faible |
| 5 | Validation `tsc` + `npm test` + grep résiduel | — | — |

### Méthodologie

Subagent-driven, 1 implementer batché Phases 1-4 (comme §216). Spec review + code quality review obligatoires. Smoke test prod par l'utilisateur avant commit final.

L'implementer reçoit :
- La liste exacte des fichiers à modifier (grep préalable).
- Le pattern verbatim de `syncSession` à préserver byte-identical.
- L'exigence de `tsc --noEmit` exit 0 + 684 tests pass + 1 fail pré-existant attendu.

### Risques & mitigations

| Risque | Mitigation |
|---|---|
| `syncSession` réécrite ≠ originale (perte de la logique 23505) | Spec dans le plan : copie verbatim, l'implementer doit lire l'original via `git show HEAD:src/lib/api.ts` |
| Call-site oublié → fonction non importée | `tsc --noEmit` exit ≠ 0 = blocant. Smoke test si tsc passe. |
| Type alias `import { api, type Foo }` mal géré | Spec : préserver tous les `type` imports, ajouter les fonctions à côté |
| Tests cassés sur un nom mal codemodé | `npm test` doit retourner 684 pass + 1 fail attendu (transformers.test.ts:18) |
| Régression silencieuse côté offline localStorage | `_get`/`_save`/`STORAGE_KEYS` migrés via export simple, pas de changement de comportement |

### Bénéfice net

- `api.ts` : 1039 → 0 LOC (fichier supprimé).
- `api/swim.ts` (ou nouveau) + `api/localStorage.ts` + `api/client.ts` : +~150 LOC (la vraie logique migrée).
- `api/index.ts` : ~+50 LOC de re-exports.
- **Net : -800 à -900 LOC** + 1 source de vérité stricte + suppression du double-export.

### Out of scope §219

- Pas de modification fonctionnelle. Strictement structural.
- Pas de réécriture de la logique 23505 dedup.
- Pas de pattern `assertSupabase<T>()` (dette tech identifiée par l'audit §214 mais reportée à un § dédié).
- Refactos C (RPC coach KPIs) et D (trio Records) restent reportés.

## Validation

- `npx tsc --noEmit` exit 0
- `npm test` 684 pass + 1 fail pré-existant (`transformers.test.ts:18`)
- Grep résiduel : aucun `api.fnX(` dans `src/` (sauf commentaires)
- `wc -l src/lib/api.ts` retourne 0 (fichier supprimé)
- Smoke test prod : login, save séance, save absence, navigation coach/nageur — flux critiques OK
