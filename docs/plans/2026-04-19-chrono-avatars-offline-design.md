# Design — Avatars nageurs & résilience offline sur le chrono coach

*Date : 2026-04-19 — Chantier cible : §146*

## Contexte & objectif

Sur la vue `/#/coach/chrono`, le coach lance des séries chronométrées en bord de bassin avec un téléphone/tablette. Aujourd'hui :

- Les cards nageurs affichent uniquement le nom → identification visuelle lente quand les noms se ressemblent.
- La course elle-même tourne offline (timer JS local + backup `localStorage` `CHRONO_BACKUP` à chaque dispatch), mais **deux dépendances réseau restent fragiles** :
  1. Les avatars sont chargés depuis Supabase Storage par URL publique → indisponibles si le réseau coupe pendant la série.
  2. Les sauvegardes finales (`createChronoRecord`, `createStandaloneSwimLog` dans `ChronoResults.handleExportAll` / `handleSaveDraft`) échouent silencieusement → la série est perdue si le coach quitte la page.

**Objectif du patch :**
1. Afficher la photo de profil des nageurs sur toutes les cards chrono (setup, racing, matrice lane×wave, results).
2. Garantir que la vue reste 100 % utilisable si le réseau fail n'importe quand pendant le cycle setup → racing → results — photos y compris, avec une queue de sauvegardes résiliente qui rejoue dès retour réseau.

## État actuel (exploration)

| Élément | Constat |
|---|---|
| `AthleteSummary.avatar_url` | Déjà fourni par `getAthletes` et `getAthletesPaginated` (`src/lib/api/users.ts`) |
| `ChronoSwimmer.avatarUrl` | Déjà défini dans `src/lib/chrono-types.ts` l.12, déjà propagé par `ChronoSetup.tsx` l.96 |
| `src/components/ui/avatar.tsx` | Composant shadcn dispo (Avatar / AvatarImage / AvatarFallback) |
| Timer & reducer | Purs (`useChronoTimer`, `chronoReducer`) — aucune dépendance réseau en phase racing |
| Backup localStorage | Déjà actif dans `CoachChronoScreen.tsx` l.84-90 — re-sérialise le state à chaque dispatch |
| `SwimmerCard` race | `ChronoRace.tsx` l.231-429 — row 1 = `[wave chip] [nom]`, row 2 = chrono |
| Sauvegarde finale | `ChronoResults.tsx` l.214-305 — `toast.error` sur échec, pas de retry |

Les URLs publiques Supabase ont un cache-buster `?t=<timestamp>` figé au moment de l'upload (voir `src/lib/api/users.ts` l.372), donc stable côté rendu — OK pour le HTTP cache navigateur.

## Décisions retenues

Issues du brainstorm avec l'utilisateur :

1. **Scope visuel** : avatars partout (setup + racing + matrice lane×wave + results).
2. **Offline cible** : à la fois cache des photos **et** save queue résiliente.
3. **Fallback** : initiales sur fond coloré dérivé du nom (style `AvatarFallback` shadcn).
4. **Placement racing** : petit avatar rond 24 px à gauche du nom en row 1 — discret, ne rogne pas le chrono XXL.
5. **Stratégie cache** : pré-cache au setup, dataURL base64 stockée dans `ChronoSwimmer.avatarUrl`. Exploite le backup localStorage déjà en place. Pas de Service Worker (interdit par `CLAUDE.md`), pas d'IndexedDB (overkill pour ce scope).
6. **Save queue** : localStorage queue + retry auto sur event `online`. Badge "X en attente" + bouton "Réessayer" dans la topbar setup.
7. **Idempotence** : on accepte de rares doublons et on clear l'entrée **avant** le retry (plus simple qu'un `clientId` UNIQUE côté DB).

## Architecture

### A. Avatars avec pré-cache au setup

**Nouveau helper `src/lib/chrono-avatar-cache.ts`** :
```ts
export async function fetchAvatarAsDataUrl(url: string): Promise<string | null>;
```
- `fetch(url, { cache: "force-cache" })` — profite du HTTP cache si déjà vu.
- Timeout 3 s (`AbortController`).
- Blob > 50 KB → `null` (safety net).
- `FileReader.readAsDataURL(blob)` → string `data:image/...`.
- Concurrence limitée à 4 en parallèle (petit sémaphore maison).

**Hook `useChronoSetupAvatarPrefetch(swimmers, dispatch)`** monté dans `ChronoSetup.tsx` :
- À chaque nouveau swimmer `registered` avec `avatarUrl` qui est encore une URL HTTP(S), lance `fetchAvatarAsDataUrl`.
- Succès → `dispatch({ type: "UPDATE_SWIMMER_AVATAR", key, dataUrl })`.
- Échec → pas d'action, l'URL publique reste (marche en ligne, fallback initiales en offline).

**Nouvelle action reducer `UPDATE_SWIMMER_AVATAR`** dans `chrono-reducer.ts` :
- `{ type: "UPDATE_SWIMMER_AVATAR", key: string, dataUrl: string | null }`
- Remplace `avatarUrl` du swimmer ciblé, no-op si clé inconnue.
- Couvert par un test unitaire.

**Nouveau composant `src/components/chrono/SwimmerAvatar.tsx`** :
- Props : `{ swimmer: ChronoSwimmer, size: "xs" | "sm" | "md" }` (24 / 32 / 40 px).
- Wrapper `Avatar` shadcn.
- `AvatarImage` avec `loading="lazy"`, `decoding="async"`, `onError` → force fallback.
- `AvatarFallback` : initiales (1-2 lettres majuscules de `displayName`) sur fond coloré. Couleur = hash stable du nom → HSL (satur 55 %, lum 45 %) pour garantir un contraste lisible sur texte blanc.

**Intégration** :
- `ChronoRace.tsx` `SwimmerCard` row 1 : `[wave chip] [<SwimmerAvatar size="xs">] [nom]`.
- `ChronoSetup.tsx` liste des nageurs sélectionnés + picker multi-select : `size="sm"`.
- `ChronoResults.tsx` tableau classement : colonne avatar `size="sm"` (mobile : `xs`).
- `LaneWaveMatrix` (dans `ChronoRace`) : couvert automatiquement via `SwimmerCard`.

**Safety net `QuotaExceededError`** sur backup localStorage : dans `CoachChronoScreen.tsx` l.87, try/catch existant → si quota dépassé, 2ᵉ tentative avec swimmers `avatarUrl: null` (strip), sinon remove backup + toast discret.

### B. Save queue offline

**Nouveau module `src/lib/chrono-save-queue.ts`** :
```ts
type PendingChronoSave =
  | { kind: "record"; payload: ChronoRecordInput; createdAt: number }
  | { kind: "export"; payload: { authUid: string; log: SwimExerciseLogInput }; createdAt: number };

export function enqueue(item: PendingChronoSave): void;
export function getPending(): PendingChronoSave[];
export function flush(): Promise<{ succeeded: number; failed: number }>;
export function isRetriableError(err: unknown): boolean;
```
- Stockage `localStorage` key `CHRONO_SAVE_QUEUE` (tableau JSON).
- `flush()` tente chaque entrée. Si `isRetriableError(err)` → conservée. Sinon (erreur applicative 4xx non-retriable) → retirée + `console.error` (évite boucle infinie).
- Un clear-before-retry : on retire l'entrée de la queue **avant** l'appel réseau, et on la re-enqueue si échec retriable. Évite les doublons en cas de double-flush concurrent.

**Critère `isRetriableError`** :
```ts
if (err instanceof TypeError) return true; // fetch failed (CORS/offline)
const msg = (err as Error)?.message ?? "";
return /NetworkError|Failed to fetch|network/i.test(msg);
```
Les codes Supabase 5xx seront traités comme retriables via leur message (`PostgrestError.code` commence par `PGRST`). Les 401/403/400 → non-retriables.

**Hook `useChronoSaveQueue()`** monté une fois dans `CoachChronoScreen.tsx` :
- `const [pendingCount, setPendingCount] = useState(() => getPending().length)`
- `useEffect(() => window.addEventListener("online", flushAndUpdate), cleanup)`
- Tentative `flush()` au mount (event `online` peut avoir été raté).
- Retourne `{ pendingCount, flushNow, enqueueRecord, enqueueExport }`.

**Badge UI `<PendingSaveBadge />`** dans la topbar chrono (au-dessus du setup), visible si `pendingCount > 0` :
```
⚠️ 2 série(s) en attente d'envoi    [Réessayer]
```
Style cohérent avec le banner "Reprendre série" existant (`CoachChronoScreen.tsx` l.143-162, amber theme).

**Modification `ChronoResults.tsx`** :
- `handleExportAll` (l.246) : sur échec d'un `createStandaloneSwimLog`, si `isRetriableError` → `enqueueExport({ authUid, log })` au lieu de marquer `"error"`. Le marker UI devient `"queued"`. Toast final : si toutes les erreurs sont queued → `toast.info("N série(s) sauvegardées localement, renvoi auto dès retour réseau")` au lieu de `toast.error`.
- `handleSaveDraft` (l.214) : idem pour `createChronoRecord`.

## Data flow

### Flux avatar offline-ready
```
1. ChronoSetup : coach ajoute nageur
2. useChronoSetupAvatarPrefetch lance fetchAvatarAsDataUrl en background
3. Succès → dispatch UPDATE_SWIMMER_AVATAR → state.swimmers[i].avatarUrl = "data:image/webp;base64,..."
4. useEffect backup → localStorage eac_chrono_backup_v2 contient la dataURL
5. Hard refresh offline → deserializeState restore l'état → <img src="data:..."> rendu sans réseau
```

### Flux save queue
```
1. Fin de série, clic "Envoyer aux nageurs"
2. Pour chaque nageur, createStandaloneSwimLog(...)
3. Rejected + isRetriableError → enqueueExport(...) → localStorage CHRONO_SAVE_QUEUE
4. UI : badge "N en attente" apparaît + toast info
5. Plus tard : window "online" event → flush() → replays → queue vidée
6. Ou clic "Réessayer" manuel → flushNow()
```

## Gestion d'erreurs

| Scénario | Comportement |
|---|---|
| Nageur sans `avatar_url` | Fallback initiales direct, aucun fetch |
| Fetch avatar timeout 3 s | `null` retourné, URL publique conservée, fallback `onError` |
| Blob > 50 KB | Skip conversion (safety), URL publique conservée |
| `QuotaExceededError` sur backup | 2ᵉ tentative sans avatars, sinon remove backup + warn |
| Nageur `manual` | `avatarUrl: null` par construction → initiales du nom saisi |
| Export réseau échoue (TypeError) | `enqueue` + toast info + UI reset succès |
| Retry en tâche de fond réussit | Toast discret "Série envoyée" |
| Retry échoue encore | Reste en queue, pas de toast (évite spam) |
| Queue corrompue (JSON) | `removeItem` + warn, pas de crash |
| `navigator.onLine === true` mais serveur down | Flush échoue, reste en queue |
| Erreur 401/403 | Non-retriable → retirée de la queue + toast erreur classique |

## Tests

**Unitaires (Vitest) :**

1. `src/lib/__tests__/chrono-avatar-cache.test.ts` — fetch succès / timeout / blob > 50 KB / reject → null.
2. `src/lib/__tests__/chrono-save-queue.test.ts` — enqueue / flush success / flush fail retriable / flush fail non-retriable / JSON corrompu / `isRetriableError` cases.
3. `src/lib/__tests__/chrono-reducer.test.ts` (extension) — action `UPDATE_SWIMMER_AVATAR` remplace bonne clé, no-op sur clé inconnue.

**Pas de test e2e** (pas de harness e2e sur ce flux aujourd'hui).
**Pas de test RLS** : aucun changement policies Supabase. Critères `CLAUDE.md` § "Quand lancer `npm run test:rls`" — aucun déclenché.

**Manuel (à documenter dans implementation-log) :**
- Ouvrir setup en ligne, ajouter 3 nageurs → DevTools → backup localStorage contient dataURLs.
- Couper réseau + hard refresh → restore → photos toujours visibles.
- "Envoyer aux nageurs" offline → toast "sauvegardé localement" + badge visible.
- Reconnecter → badge disparaît, toast succès.

## Impact perf

Race view re-render à ~30 Hz (display refresh du timer). L'avatar :
- `<img src>` stable après le premier render (dataURL ne change pas) → React skip la reconciliation.
- `loading="lazy" decoding="async"` pour le premier paint.
- 12 nageurs × ~10-20 KB dataURL = 120-240 KB en mémoire JS : négligeable.
- localStorage : idem 200 KB au pire, bien sous la limite 5 MB des navigateurs.

Pas de régression attendue. Le MOBILE_LIMITS (3 lignes × 2 nageurs × 2 vagues = 12 max) garantit qu'on ne dépasse pas ce budget sur les config lourdes.

## Fichiers touchés

**Nouveaux :**
- `src/lib/chrono-avatar-cache.ts`
- `src/lib/chrono-save-queue.ts`
- `src/components/chrono/SwimmerAvatar.tsx`
- `src/lib/__tests__/chrono-avatar-cache.test.ts`
- `src/lib/__tests__/chrono-save-queue.test.ts`

**Modifiés :**
- `src/lib/chrono-types.ts` — (éventuellement) type `PendingChronoSave` si on le co-localise.
- `src/lib/chrono-reducer.ts` — action `UPDATE_SWIMMER_AVATAR`.
- `src/lib/__tests__/chrono-reducer.test.ts` — couverture nouvelle action.
- `src/lib/api/client.ts` — ajouter `STORAGE_KEYS.CHRONO_SAVE_QUEUE`.
- `src/pages/coach/CoachChronoScreen.tsx` — mount `useChronoSaveQueue`, rendre `<PendingSaveBadge>`, safety net `QuotaExceededError`.
- `src/components/chrono/ChronoSetup.tsx` — `useChronoSetupAvatarPrefetch`, intégration `<SwimmerAvatar>`.
- `src/components/chrono/ChronoRace.tsx` — `<SwimmerAvatar size="xs">` dans row 1 de `SwimmerCard`.
- `src/components/chrono/ChronoResults.tsx` — colonne avatar + bascule erreurs vers queue.

## Hors scope

- Cache d'avatars partagé entre pages (ex: profils coach/swimmer detail) — si besoin, chantier dédié avec IndexedDB.
- Service Worker offline global — interdit par `CLAUDE.md` § "Cache bust".
- `clientId` UNIQUE côté DB pour idempotence stricte — on accepte rares doublons, clear-before-retry.
- Migration des données historiques (aucune n'est stockée différemment).

## Suites

Document `writing-plans` à produire juste après ce design.

Le chantier sera enregistré en §146 dans `docs/ROADMAP.md` et `docs/implementation-log.md` à l'implémentation.

L'UI fine (CSS, micro-animations, poli visuel du badge et des avatars dans les 3 vues) devra passer par `/frontend-design` au moment de l'implémentation, conformément à `~/.claude/CLAUDE.md` règle 2.
