# §228 — Helper `assertSupabase<T>()` dans `api/client.ts`

*Date : 2026-05-08 — Suite §223 (RPC coach KPIs), §219 (kill façade api.ts), §214 (audit perf/maintenabilité).*

## Contexte

L'audit §214 (code-simplifier sub-agent) a identifié 234 occurrences du pattern `if (error) throw new Error(error.message)` dans `src/lib/api/` (mesure courante : 239). Pattern dupliqué qui :

- Perd la stack trace Postgres d'origine.
- Perd les codes d'erreur (`23505`, `PGRST116`, etc.).
- Bloque toute future télémétrie centralisée.
- Alourdit visuellement chaque CRUD (3 lignes de boilerplate par opération).

Reporté à un § dédié → c'est §228.

Helpers existants dans `client.ts` (à conserver intacts) :
- `parseApiError(error)` (l. 102-112) : extrait `{message, code, status}`.
- `summarizeApiError(error, fallback)` (l. 114+) : ajoute des messages FR pour 401/403, `unknown_action`, `table_missing`. Dédupe les logs.

Ces helpers ne sont PAS appelés systématiquement à chaque throw — le pattern actuel est `throw new Error(error.message)` direct.

## Décisions de design

### Approche retenue : Simple (validée)

Le helper retourne le `data` ou throw `Error(error.message)` byte-identical.

```ts
/**
 * Centralise le pattern `const { data, error } = await ...; if (error)
 * throw new Error(error.message); return data;` qui apparaît ~239 fois
 * dans src/lib/api/. Comportement byte-identical aux call-sites actuels.
 */
export function assertSupabase<T>(
  res: { data: T; error: { message: string } | null },
): T {
  if (res.error) throw new Error(res.error.message);
  return res.data;
}
```

Trade-off accepté :
- ✅ Risque le plus faible : 0 changement de comportement runtime.
- ✅ Codemod mécanique pur (texte).
- ✅ Type générique compatible `PostgrestResponse<T>` ET `PostgrestSingleResponse<T>`.
- ⚠️ Ne capitalise pas sur `parseApiError` existant — décision YAGNI : si on veut enrichir plus tard, on modifie le helper en 1 endroit.

### Rejetées

- **Enrichi** (utiliser `parseApiError` pour throw avec `code`/`status`) : changement de shape sur l'Error throwée. Aucun consumer ne lit `e.code` aujourd'hui sur les Error tirées de `api/`. Pas de gain immédiat, risque de drift.
- **Rich + contexte** (`assertSupabase(res, 'fetch competitions')` avec `summarizeApiError`) : 239 sites à éditer manuellement avec un contexte humain. Trop invasif pour un § de cleanup mécanique.

### Codemod scope

**Cible** : `src/lib/api/*.ts` et sous-modules. **PAS** `src/hooks/`, `src/pages/`, `src/components/` (consommateurs hors API qui font parfois des queries Supabase directes — out of scope, ils ont leurs propres patterns).

**Patterns transformés** (cas simple, ~190 sur 239) :

**A. Sélection avec retour data** :

```ts
// AVANT
const { data, error } = await supabase.from("foo").select("*");
if (error) throw new Error(error.message);
return data ?? [];
```
→
```ts
// APRÈS
const data = assertSupabase(await supabase.from("foo").select("*"));
return data ?? [];
```

**B. Mutation sans data utilisé** :

```ts
// AVANT
const { error } = await supabase.from("foo").delete().eq("id", id);
if (error) throw new Error(error.message);
```
→
```ts
// APRÈS
assertSupabase(await supabase.from("foo").delete().eq("id", id));
```

**C. RPC** :

```ts
// AVANT
const { data, error } = await supabase.rpc("my_rpc", { … });
if (error) throw new Error(error.message);
return data;
```
→
```ts
// APRÈS
return assertSupabase(await supabase.rpc("my_rpc", { … }));
```

### Patterns NON transformés (~49 cas, intacts)

- `if (error && error.code !== '23505') throw...` (conditional throw, ex: `syncSession` 23505 dedup).
- `throw new Error(\`Prefix: ${error.message}\`)` (messages enrichis avec contexte humain).
- `if (error) return null;` (gestion gracieuse, ex: `getAppSettings`).
- Sites avec multiple `data, error` destructurations dans un même bloc (ex: 2 queries successives).
- Tests `__tests__/`.

L'implementer **lit chaque fichier** avant remplacement, **pas de sed brut sur le repo**.

### Architecture

```
src/lib/api/client.ts              ← +1 export `assertSupabase<T>`
src/lib/api/<sub-module>.ts        ← codemod ~190 sites (12-15 fichiers)
```

Files high-density (à attaquer en premier d'après l'audit §214) :
- `api/strength.ts` (39 occurrences)
- `api/records.ts` (probable haute densité)
- `api/competitions.ts` (déjà ~6 visibles dans le grep initial)
- `api/swim-sessions.ts` (NEW §219, n'a peut-être que peu d'occurrences)
- Autres modules (10-30 occurrences chacun).

### Bénéfice net

- ~190 sites × 1 ligne supprimée = **-190 LOC** dans `src/lib/api/`.
- + helper ~10 LOC dans `client.ts`.
- **Net : ~-180 LOC**.
- Bonus : 1 source de vérité — toute future télémétrie/log/enrichissement = 1 modif.

### Risques & mitigations

| Risque | Mitigation |
|---|---|
| Codemod casse un conditional throw (e.g., `error.code !== '23505'` swallow) | Implementer lit chaque site avant remplacement. Grep cible `if (error) throw new Error(error.message);` **literal exact**, pas regex large. |
| `data` peut être `null` après `.maybeSingle()` | Pas de changement de comportement : avant, `data` était aussi `null` après le `if (error) throw`. Helper retourne `T` qui peut être `null` selon le type Supabase. |
| Type breakage TS | `npx tsc --noEmit` à chaque batch (5-10 fichiers). |
| Comportement runtime modifié (message d'Error différent) | Helper utilise `error.message` verbatim — byte-identical. |
| Tests qui mock `error.message` cassent | Improbable car `error.message` reste identique. Mais surveillance via `npm test`. |

### Validation

- `npx tsc --noEmit` exit 0
- `npm test` 684 pass + 1 fail pré-existant
- Smoke test prod : flows critiques (login, save séance, save absence, navigation coach/nageur).
- Grep résiduel post-codemod : `grep -c "if (error) throw new Error(error.message);" src/lib/api/` → entre 30 et 50 (cas non transformables — conditional throws + prefix formatting).

### Hors scope §228

- Pas de migration vers `summarizeApiError`/messages FR.
- Pas de modification des sites avec `if (error.code !== ...)`.
- Pas de touche aux consumers `src/hooks/`, `src/pages/`, `src/components/`.
- Refacto D (trio Records), suppression `seedDemoData`/`resetCache` reportés à des § dédiés.
