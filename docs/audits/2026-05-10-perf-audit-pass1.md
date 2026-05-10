# Audit performance & fluidité ressentie — pass 1 (3 contextes)

*Date* : 2026-05-10
*Méthode* : 3 audits parallèles (forks general-purpose Sonnet) sur 3 contextes orthogonaux : (1) **en ligne stable** (4G+/WiFi), (2) **hors ligne** (PWA + localStorage fallback + queue mutations), (3) **réseau instable** (Slow 3G, EDGE, RTT 400ms+, pertes paquets). Évidence file:line systématique. Read-only (zéro edit).

---

## Verdict global

**6.1/10 pondéré** (online 7.3/10 × 50% + offline 4.1/10 × 25% + 3G 5.8/10 × 25%).

**Online : solide.** Bundle initial ~166 KB gzip, code splitting 6 vendors, PWA précache 247 entrées 7.2 MB, 306 `useQuery` bien guardés, React Query 10/60 min, hash routing GitHub Pages. **TTI 4G+ estimé 1.2–1.8 s.** Couverture skeletons correcte (8/9 pages). Pas de subscription Supabase Realtime (architecture polling = robuste).

**Hors ligne : fragile.** Service Worker présent (`registerType: 'prompt'`, NetworkFirst REST 5s), mais **React Query cache non persisté** → reload offline = écran vide. **80 % des mutations sans queue de replay** (Profile, Records 1RM, Dashboard absences, SuiviSemaine, Admin). Seuls Strength + WorkoutRunner + chrono coach sont vraiment offline-first (queue dédiée, optimistic, recovery localStorage). 10 modules API sans fallback (`return []` ou throw). Edge Functions non précachées.

**Réseau instable : moyen.** Login = waterfall 4 requêtes auth séquentielles (~1200–1600 ms RTT pur sur 3G). 40+ modules API **sans timeout explicite** (fetch peut bloquer 30 s+). 4 `SELECT *` non bornés (`getSessions`, `getSwimRecords`, `getSwimmerPerformances`, `getClubPerformances`) → payloads disproportionnés. Coach home : waterfall 3 niveaux athletes → coach-kpis. Aucun feedback >5 s ("ça prend du temps…") sur l'ensemble du codebase.

| Surface | Online /10 | Offline /10 | 3G /10 | Composite | Top défaut transverse |
|---|---|---|---|---|---|
| **Strength / WorkoutRunner** | 7.0 | 8.0 | 7.0 | **7.3** | Le plus mûr — exercices GIF non précachés SW |
| **Dashboard** | 7.5 | 4.0 | 6.0 | **5.8** | `getSessions` SELECT* + cache RQ non persisté + waterfall challenges |
| **Records** | 7.5 | 5.0 | 5.0 | **5.8** | 4 SELECT* perfs non paginés + 1RM/swimRecord sans queue |
| **Profile** | 7.0 | 3.0 | 7.0 | **5.7** | `updateProfile`/`uploadAvatar` perdus offline (pas de queue) |
| **SwimmerHome** | 7.0 | 4.0 | 5.0 | **5.3** | Clé `assignments` divergente (fetch redondant) + cache RQ non persisté |
| **Coach hub** | 6.5 | 3.0 | 5.0 | **4.8** | 13 useQuery + waterfall 3 niveaux + `coach-kpis`/`quickview` sans fallback |
| **Admin** | 7.5 | 1.0 | 6.0 | **4.8** | 100 % dépendant Supabase + Edge Functions non précachées |
| **Login** | 8.5 | 1.0 | 4.0 | **4.5** | Waterfall 4 requêtes auth post-signIn ; pas d'auth offline |

**Métriques clés** : bundle initial 166 KB gzip · framer-motion 38 KB **dans le critical path** (regression évitable) · SW precache 7.2 MB **dont ~455 KB gzip d'exports rarement utilisés** (exceljs/jspdf/html2canvas) · React Query global `staleTime 10min/gcTime 60min` · `withTimeout()` utilisé **3 fois sur 40+ modules API** · 0 subscription Realtime · 3 `React.memo` sur 156 composants.

---

## Trois drapeaux rouges racines (P0 transverses)

### 1. Bundle & SW precache mal calibrés — frais payés à chaque visite/install

**Symptômes mesurés** :

- **framer-motion (38.3 KB gzip) dans le critical path online** alors qu'il alimente 6 composants partagés s'affichant <5 % du temps : `UpdateNotification.tsx:3`, `InstallPrompt.tsx:3`, `OfflineBanner.tsx:3`, `InlineBanner.tsx:2`, `OfflineSyncBanner.tsx:3`, `OfflineDetector.tsx:3`. Importés statiquement depuis `App.tsx:18–22` et `AppLayout.tsx:8–10`.
- **SW precache exhaustif** : `vite.config.ts:40` `globPatterns: ['**/*.{js,css,html,png,svg,ico,woff2}']` + `dist/sw.js` 247 entrées 7.2 MB. Tous les chunks lazy téléchargés à l'install — y compris `exceljs` (271 KB gzip, utilisé seulement par `chronoXlsxExport.ts:301`), `jspdf+autotable` (137 KB gzip, exports records/séances/pace), `html2canvas` (48 KB gzip). **~455 KB gzip téléchargés inutilement** pour 90 % des installs.
- **`.gif` non précachés** : `vite.config.ts:40` exclut `.gif` du `globPatterns`. Les exercices muscu (~50 GIFs Supabase Storage, 200 KB–2 MB chacun) sont retéléchargés à chaque séance sur réseau lent.
- **Pas de chunk `vendor-ui` Radix** : `vite.config.ts:126–133` définit 6 manualChunks (react, query, supabase, motion, charts, date) mais Radix est éclaté en ~80 micro-chunks (0.1–5 KB) — charge SW de 200+ entrées précachées.

**Impact estimé** : online TTI +300–500 ms (framer-motion sur tous les visiteurs), install PWA fresh +360 ms (~455 KB gzip d'exports inutiles), séance muscu Slow 3G +1–3 s par exercice (GIF retéléchargé).

**Fix recommandé** : (1) remplacer `motion.div` par CSS `@keyframes` / `animate-*` Tailwind dans les 6 composants partagés (effort M, ROI très élevé) ; (2) `globIgnores` Workbox sur `**/exceljs*`, `**/jspdf*`, `**/html2canvas*` + laisser en `NetworkFirst` à la demande (effort S) ; (3) ajouter `gif` au `globPatterns` (effort XS — 1 caractère).

### 2. Cache & queue offline sans persistance ni replay

**Symptômes mesurés** :

- **React Query cache non persisté** : `src/lib/queryClient.ts:3-20` — `staleTime 10min`/`gcTime 60min`/`networkMode: 'always'` mais cache **in-memory uniquement**. Pas de `persistQueryClient`. Reload PWA offline = cache vide = pages vides pour toutes les surfaces sans fallback localStorage.
- **80 % des mutations sans queue de replay** : `src/components/shared/OfflineMutationSync.tsx:123-137` ne replay que 2 types (`strength-run-completed`, `strength-set-log`). Les mutations suivantes sont **silencieusement perdues offline** : `Profile.tsx:391` `updateProfile`, `Profile.tsx:435` `uploadAvatarMutation`, `Records.tsx:524` `update1RM`, `Records.tsx:541` `upsertSwimRecord`, `SuiviSemaine.tsx:500` `absenceMutation`, `SwimSessionView.tsx:220` `saveMutation`, `Administratif.tsx:199-269` (shifts, locations, groupLabels). Aucun `onMutate` (optimistic) sur ces sites — double peine : UI ne reflète pas + donnée perdue.
- **`navigator.onLine` comme seul détecteur** : `src/lib/api/client.ts:16-18` + `src/hooks/useOnlineStatus.ts:4`. Faux positifs sur captive portal Wi-Fi, VPN coupé, Supabase incident → fallback ne se déclenche pas, l'utilisateur voit des erreurs Supabase au lieu du banner offline.
- **10 modules API sans fallback localStorage** : `planning.ts`, `coach-quickview.ts`, `coach-kpis.ts`, `wellness.ts`, `competitions.ts`, `objectives.ts`, `absences.ts`, `interviews.ts`, `swim-logs.ts`, `chrono-records.ts` — tous `return []` / `return null` / throw offline.
- **Edge Functions non précachées** : `vite.config.ts:67-83` cache `/rest/*` mais pas `/functions/v1/*`. `users.ts:250` `admin-user`, `records.ts:299,331,489,507` `import-club-records` + `ffn-performances` x2 → crash offline (Admin + Records import).
- **`localStorageSave` sans gestion `QuotaExceededError`** : `src/lib/api/localStorage.ts:18-24` console.error puis perte silencieuse. Risque concret iOS Safari (5–10 MB) avec catalogue exercices + queue + sessions historiques.

**Impact estimé** : reload PWA offline = écran majoritairement vide (sauf Strength/WorkoutRunner) ; mutations critiques nageur perdues sans signal ; faux positifs réseau ≈ erreur Supabase brute affichée à l'utilisateur ; admin/records bloqués.

**Fix recommandé** : (1) `persistQueryClient` + `createSyncStoragePersister` localStorage sur queryClient (effort M, **ROI le plus élevé du projet**) ; (2) étendre la queue offline aux 8 mutations listées + ajouter `onMutate` optimistic (effort L, ROI élevé) ; (3) sonde de connectivité réelle (HEAD `version.json` ou ping Supabase) en complément de `navigator.onLine` (effort M) ; (4) règle Workbox `NetworkFirst` sur `/functions/v1/` (effort S) ; (5) catch `QuotaExceededError` + toast user dans `localStorageSave` (effort S).

### 3. Chemin critique réseau lent — waterfalls, timeouts absents, SELECT* non bornés

**Symptômes mesurés** :

- **Login : waterfall 4 requêtes auth séquentielles** : `src/lib/auth.ts:214-298` exécute `getSession()` → (optionnel) `refreshSession()` → `users.select("role")` → `user_profiles.select("is_approved")`. Sur Slow 3G (RTT 400 ms) = 1 200–1 600 ms RTT pur **avant** la première vue utile. Les 2 dernières peuvent fusionner en un RPC unique.
- **Coach home : waterfall 3 niveaux** : `src/pages/Coach.tsx:986-1033` — `coach-kpis` query (L.1033) `enabled: ... && topAthletes.length > 0` ⇒ attend `athletes` (L.988) ⇒ attend l'auth. 3 RTTs séquentiels ⇒ TTI Coach home ~3–5 s sur Slow 3G.
- **`withTimeout()` utilisé 3× sur 40+ modules API** : défini dans `src/lib/api/client.ts:349-363`, appelé seulement dans `src/lib/api/strength.ts:506,593,754`. Tous les autres modules (swim, records, assignments, coach-kpis, users, notifications, planning, …) peuvent rester suspendus 30 s+ sur EDGE — skeleton bloqué sans feedback.
- **4 `SELECT *` non paginés** : `src/lib/api/swim-sessions.ts:154` `getSessions` (toutes les sessions historiques), `src/lib/api/records.ts:354` `getSwimRecords`, `src/lib/api/records.ts:466` `getSwimmerPerformances`, `src/lib/api/records.ts:579` `getClubPerformances`. Payloads peuvent atteindre plusieurs centaines de lignes pour un nageur actif sur plusieurs saisons.
- **Clé `assignments` divergente** : `SwimmerHome.tsx:217` `["assignments", user]` vs `Dashboard.tsx:158` `["assignments", userId ?? user]` — déclenche une seconde requête réseau pour les mêmes données quand le nageur navigue. Fix d'1 caractère.
- **`React.memo` quasi inexistant** : 3 composants memoized sur 156 (2 %). `SwimSessionTimeline` (28.9 KB, liste de blocs), `CoachSwimmersOverview` (16.4 KB), items `Records` re-rendent intégralement à chaque state change parent.
- **Aucun feedback >5 s** : confirmé par grep — pas de toast "ça prend du temps…", pas de `loadingDelay`. Skeleton OU rien.

**Impact estimé** : login Slow 3G 5–8 s ; payload `getSessions` peut faire +1–3 s sur Slow 3G ; requêtes API peuvent bloquer indéfiniment sur EDGE ; listes scrollables = 20–80 re-renders/interaction.

**Fix recommandé** : (1) RPC `get_user_auth_context(user_id)` fusionnant rôle + statut approbation (effort M, gain -800 ms login) ; (2) wrapper `withTimeout(8_000)` autour des queryFn critiques + `isTransientError` retry (effort M, ROI très élevé) ; (3) `.limit(200)` ou pagination par saison sur les 4 SELECT* listés (effort S, gain -70 % payload) ; (4) corriger clé `assignments` dans `SwimmerHome.tsx:217` (effort XS, gain -1 fetch par nav) ; (5) prefetch `["athletes"]` dans `CacheWarmer` (`App.tsx:381`) pour rôle coach (effort S, gain -150–300 ms) ; (6) `React.memo` + props inline stables sur `SwimSessionTimeline`, `CoachSwimmersOverview`, items `Records` (effort M).

---

## Asymétries online ↔ offline ↔ instable

| Pattern | Online | Offline | 3G | Commentaire |
|---|---|---|---|---|
| **Strength sessions** | ✅ | ✅ (queue + LS) | ✅ (timeout 10s) | Référence : seul module avec les 3 contextes traités. À cloner. |
| **WorkoutRunner** | ✅ | ✅ (recovery LS) | ✅ (preload GIF suivant) | Excellent — patterns à généraliser. |
| **Login** | ✅ | ❌ (auth `NetworkOnly`) | ⚠️ (4 séq) | Asymétrie extrême : top online, bloqué sans réseau si pas de session cachée. |
| **Dashboard** | ✅ | ⚠️ (cache RQ in-mem) | ⚠️ (SELECT* sessions) | Reload offline = vide ; payload non borné en 3G. |
| **Coach kpis/quickview** | ✅ | ❌ (`return null`) | ⚠️ (waterfall 3 niveaux) | Casse silencieusement offline ; lent en 3G. |
| **Profile édition** | ✅ | ❌ (mutations perdues) | ✅ | Online OK, mais mutation offline = perte sans signal. |
| **Records 1RM / swim record** | ✅ | ❌ (mutations perdues) | ⚠️ | Comme Profile : offline = perte. |
| **Records leaderboard** | ✅ | ⚠️ (cache RQ uniquement) | ❌ (4 SELECT*) | Online OK, payloads non bornés en 3G. |
| **Admin** | ✅ | ❌ (`!canUseSupabase()` partout) | ⚠️ | Acceptable — admin rarement offline. |
| **GIFs exercices** | ⚠️ (Supabase Storage) | ❌ (pas dans precache SW) | ❌ (200 KB–2 MB par GIF) | Devrait être runtime-cached `.gif`. |
| **Edge Functions** | ✅ | ❌ (pas dans precache) | ✅ (cold start) | Manque `/functions/v1/` dans runtime caching. |
| **Real-time** | n/a | n/a | n/a | 0 subscription — point fort robustesse 3G. |

**Conclusion asymétries** : Strength a "résolu" les 3 contextes, le reste de l'app est traité **majoritairement online-first**. Login offline est le cas limite à clarifier (PWA assume une session pré-existante). Les mutations nageur (profile, records, absences) sont la plus grande dette : elles **paraissent fonctionner online** mais le silent-fail offline est un piège ergonomique.

---

## 5 chantiers structurels recommandés

### Chantier A — Persistance React Query + queue offline généralisée  *(P0, ROI maximal)*

- `persistQueryClient` + `createSyncStoragePersister` sur localStorage (toutes queries survivent au reload offline).
- Étendre `OfflineMutationSync` aux 8 mutations identifiées (Profile, Records 1RM/swim, Dashboard absences, SuiviSemaine, Admin shifts).
- Ajouter `onMutate` optimistic + `onError` rollback sur ces mutations.
- Sonde de connectivité réelle (`fetch HEAD /version.json` toutes les 30 s) en complément de `navigator.onLine`.

**Effort** : L. **Gain** : reload PWA offline reste fonctionnel, mutations nageur jamais perdues, faux positifs réseau éliminés. **Risque** : cache invalidation à gérer côté schema bumps.

### Chantier B — Bundle critical path & SW precache  *(P0, ROI très élevé)*

- Remplacer `motion.div` par CSS animations dans les 6 composants partagés (UpdateNotification, InstallPrompt, OfflineBanner, InlineBanner, OfflineSyncBanner, OfflineDetector).
- `globIgnores` Workbox sur exceljs/jspdf+autotable/html2canvas (NetworkFirst à la demande).
- Ajouter `gif` au `globPatterns` Workbox.
- Ajouter règle runtime cache `/functions/v1/*` (NetworkFirst).
- Ajouter chunk `vendor-ui` pour Radix (réduction du nombre d'entrées SW).

**Effort** : M. **Gain** : -38 KB gzip critical path, -455 KB gzip install PWA, GIFs muscu offline-first, Edge Functions resilient. **Risque** : faible.

### Chantier C — Auth flow Slow 3G  *(P1, ROI élevé)*

- RPC Supabase `get_user_auth_context(user_id)` retournant rôle + `is_approved` + groupes en 1 round-trip.
- Adapter `loadUser()` (`src/lib/auth.ts:214-298`) pour utiliser le RPC unique au lieu de 2 selects.
- Prefetch `["athletes"]` dans `CacheWarmer` pour rôle coach (cassage waterfall coach-kpis).

**Effort** : M. **Gain** : -800–1 200 ms login Slow 3G ; -150–300 ms TTI Coach home. **Risque** : dépend ajout de RLS function (à valider avec MCP Supabase).

### Chantier D — Timeouts & retry stratégiques sur queryFn critiques  *(P1)*

- Wrapper `withTimeout(8_000)` autour des queryFn `useDashboardState`, `useCoachCalendarState`, Records, Coach hub, SwimmerHome.
- Détection `isTransientError` (`offlineQueue.ts:147`) + retry exponentiel (1s, 2s, 4s) max 2 essais.
- Toast "ça prend du temps…" après 5 s de skeleton (`useDelayedLoading` hook réutilisable).
- Pagination/`limit` sur les 4 `SELECT *` identifiés.

**Effort** : M. **Gain** : 100 % requêtes ≤ 8 s (vs blocking ad infinitum), payloads -70 %, feedback UX explicite. **Risque** : faible (retry idempotent sur read).

### Chantier E — Mémorisation listes & props inline  *(P2)*

- `React.memo` sur `SwimSessionTimeline`, `CoachSwimmersOverview`, items `Records`.
- `useCallback`/`useMemo` sur les props passées à ces composants depuis les pages parents.
- Audit ciblé des listes scrollables avec >50 items.

**Effort** : M. **Gain** : -50–80 % re-renders sur interactions parents. **Risque** : faible.

---

## 8 quick wins (≤ 10 LOC chacun, déployables en 1 patch)

1. **`vite.config.ts:40`** — ajouter `gif` au `globPatterns` (1 caractère). GIFs muscu précachés.
2. **`src/pages/SwimmerHome.tsx:217`** — `["assignments", user]` → `["assignments", userId ?? user]`. Élimine 1 fetch redondant.
3. **`src/lib/api/swim-sessions.ts:154`** — ajouter `.limit(200).order('date', { ascending: false })`. -70 % payload nageur actif.
4. **`src/lib/api/records.ts:24,54`** — paralléliser les 2 RPC `get_hall_of_fame` + `get_hall_of_fame_strength` via `Promise.all`. -400 ms HallOfFame.
5. **`src/lib/api/localStorage.ts:18-24`** — catch `QuotaExceededError` + dispatch event `storage-quota-exceeded` pour toast user.
6. **`vite.config.ts:67-83`** — ajouter règle runtime cache `urlPattern: /supabase\.co\/functions\/v1\//, handler: 'NetworkFirst'`.
7. **`src/components/shared/OfflineSyncBanner.tsx:51`** — supprimer le banner trompeur ou aligner avec le toast `OfflineMutationSync` (source de vérité unique sur la sync).
8. **`src/components/swim/EquipmentIconCompact.tsx:33`** + `src/pages/Coach.tsx:845` + `src/components/competition/InfoParticipants.tsx:86` — ajouter `loading="lazy"` sur les `<img>` listés (4 spots).

---

## Plan d'action priorisé

| Priorité | Action | Effort | Gain mesurable | Cible |
|---|---|---|---|---|
| **P0** | Quick wins #1, #2, #6 (1 patch) | XS | 1 fetch en moins, GIFs+Edge Functions précachés | §238 |
| **P0** | Chantier B (bundle + SW) | M | -38 KB gzip TTI, -455 KB install | §239 |
| **P0** | Chantier A (RQ persist + queue) | L | reload offline fonctionnel, 0 mutation perdue | §240 |
| **P1** | Quick wins #3, #4, #5, #7, #8 | S | -70 % payload sessions, -400 ms HallOfFame, toast quota, banner cohérent | §241 |
| **P1** | Chantier C (auth flow) | M | -800 ms login Slow 3G | §242 |
| **P1** | Chantier D (timeouts) | M | 100 % requêtes <8 s | §243 |
| **P2** | Chantier E (memo) | M | -50–80 % re-renders | §244 |

**Cibles de score post-implementation** :
- Online : 7.3 → **8.5/10** (chantier B + quick wins + memo)
- Offline : 4.1 → **7.5/10** (chantier A + edge functions cache)
- 3G : 5.8 → **7.5/10** (chantier C + D + pagination)
- **Composite** : 6.1 → **8.0/10**

---

## Ce qui marche bien (à ne pas casser)

- **Strength / WorkoutRunner** : référence interne — queue dédiée, recovery localStorage, preload GIF suivant, timeouts. À cloner pour les autres modules.
- **Code splitting** : 6 vendors séparés, toutes les pages lazy via `lazyWithRetry` (§120 anti-stale chunks). exceljs/jspdf/html2canvas en `await import()`.
- **Pas de Realtime Supabase** : architecture polling = robuste sur 3G/EDGE, pas de reconnect loop.
- **`isTransientError`** (`offlineQueue.ts:147`) : helper bien conçu, à généraliser au-delà de la queue mutations.
- **`useTransition`** dans `useDashboardState.ts:98` : bonne pratique React 19 sur les nav de mois.
- **`registerType: 'prompt'`** SW (§171) : choix délibéré, à conserver — évite le cache permanent invisible.
- **Skeletons** : couverture 8/9 pages, pattern Dashboard/Strength à conserver.

---

## Méthodologie & limites

**Méthode** : audit statique 100 % code-source. `npm run build` exécuté 1 fois (12.7 s, 4403 modules) pour mesurer chunks gzipped. Pas d'exécution browser headless (Lighthouse, Chrome DevTools throttling) — les estimations TTI 3G sont déduites du nombre de requêtes séquentielles × RTT 400 ms + payload / débit 400 KB/s. Marge d'erreur ±20 % sur TTI estimés.

**Limites** :
- TTI réels à confirmer avec Lighthouse mobile + WebPageTest profile Slow 3G.
- Quotas localStorage iOS Safari à mesurer en runtime (pas vérifiable statiquement).
- Comportement réel `OfflineSyncBanner` vs `OfflineMutationSync` à valider avec un device en flight mode.
- Pas de profiling React DevTools — re-renders estimés à partir de `React.memo` + props inline.

**Prochain pass recommandé** : pass 2 = Lighthouse mobile + WebPageTest 3G slow + profiling React DevTools sur Dashboard/Coach/Records pour confirmer les hypothèses chiffrées et identifier les long tasks réels >50 ms.
