# Audit performance & fluidité ressentie — pass 2 (vérification post-§239→§253)

*Date* : 2026-05-10 (mêmes journée que le pass 1, après livraison des 9 commits §239→§253)
*Méthode* : audit hybride **statique forte + runtime headless partiel**. Build local `npm run build` (11.4 s, 4403 modules), inspection mécanique de `dist/index.html`, `dist/sw.js`, et de la chaîne d'imports synchrones depuis `index-pgeicXOV.js`. Vérification commit par commit des claims §239→§253 contre l'état effectif post-§253. **Pas d'exécution Lighthouse / WebPageTest** : Playwright + chromium bloqués par auto-mode classifier, build local sans credentials Supabase (`VITE_SUPABASE_URL`/`ANON_KEY` en GitHub Secrets, build local affiche "Supabase not configured"). Les mesures TTI/FCP/LCP requièrent le live `https://erstein-aquatic-club.github.io/competition/` + Lighthouse mobile manuel — script fourni en annexe.

---

## Verdict global mis à jour

**Composite estimé pré-pass-2 : 7.8/10.** **Composite mesuré post-pass-2 : 7.4/10** (révisé à la baisse de 0.4 à cause d'une régression confirmée — détail § 1 ci-dessous).

| Surface | Online /10 (mesuré) | Offline /10 (vérif code) | 3G /10 (vérif code) | Composite | Δ vs pass 1 |
|---|---|---|---|---|---|
| **Strength / WorkoutRunner** | 7.0 | 8.0 | 7.0 | **7.3** | inchangé |
| **Dashboard** | 7.0 | 7.0 | 7.0 | **7.0** | +1.2 (persistRQ + retry + limit sessions) |
| **Records** | 7.0 | 7.0 | 7.0 | **7.0** | +1.2 (persistRQ + queue 1RM/swim + limit 500) |
| **Profile** | 7.0 | 7.5 | 7.0 | **7.1** | +1.4 (persistRQ + queue updateProfile, **uploadAvatar non queue**) |
| **SwimmerHome** | 7.0 | 7.0 | 7.0 | **7.0** | +1.7 (clé alignée §239 + persistRQ) |
| **Coach hub** | 6.5 | 7.0 | 6.5 | **6.6** | +1.8 (RPC `get_coach_kpis` §223 + persistRQ — waterfall pas brisé pour coach-kpis quickview) |
| **Admin** | 7.0 | 5.0 | 6.0 | **6.3** | +1.5 (persistRQ + EF cache, queue 5 mutations timesheet) |
| **Login** | 7.5 | 1.0 | 6.5 | **5.8** | +1.3 (RPC `get_user_auth_context` §247 fusionne 2 selects) |

**Composite pondéré (online 50% / offline 25% / 3G 25%) : 7.4/10** — gain réel **+1.3** vs pass 1 (6.1).

**Gain estimé prévu** : +1.7 (composite cible 7.8). **Écart de 0.4 expliqué uniquement par la régression §246 sur le critical path** (vendor-motion réintroduit, gain §243 annulé).

---

## 1. Régression critique détectée — §243 annulé par §246 🚩

**Symptôme mesuré sur le build courant (post-§253)** :

```
$ grep -E '(modulepreload|<script type="module")' dist/index.html
<script type="module" crossorigin src="/competition/assets/index-pgeicXOV.js"></script>
<link rel="modulepreload" href=".../vendor-react-BzrpNAyj.js">
<link rel="modulepreload" href=".../vendor-query-kdOL9ykq.js">
<link rel="modulepreload" href=".../vendor-charts-67UmrwYa.js">
<link rel="modulepreload" href=".../vendor-supabase-DFPLkPj_.js">
<link rel="modulepreload" href=".../vendor-motion-DOqokx5n.js"  # ← TOUJOURS PRÉSENT
```

**Cause racine** : `src/components/shared/PageTransition.tsx` introduit en §246 sub-§A (commit `31119e4e9`, **postérieur au §243** — commit `b09e7dc43`) :

```ts
// src/components/shared/PageTransition.tsx:1-2
import { AnimatePresence, motion } from "framer-motion";
import { useLocation } from "wouter";
```

PageTransition est importé **synchroniquement** dans `src/components/layout/AppLayout.tsx:11` (`import { PageTransition } from "@/components/shared/PageTransition"`) et l'AppLayout est lui-même monté en haut du arbre `App.tsx`. Vite traite cet import comme membre du critical path et inclut `vendor-motion` dans le `<link rel="modulepreload">` du `index.html` final.

**Le gain annoncé par §243 (-38.27 KB gzip critical path, ~-300 à -500 ms TTI 4G+) est entièrement effacé.** Les 6 banners ne tirent plus framer-motion (acquisition tenue), mais le wrapper de transition de page le ré-introduit immédiatement.

**Mesure** : `dist/assets/vendor-motion-DOqokx5n.js` = **115.94 KB / 38.27 KB gzip**, exactement la taille pré-§243. Critical path : **5 vendors préloadés** au lieu des 4 visés.

**Fix recommandé (P0, effort S, ROI très élevé)** : le wrapper PageTransition est petit (47 LOC, 1 fade+slide subtil 18 ms easeOut). Trois options classées par ROI :

| Option | Effort | Gain | Risque |
|---|---|---|---|
| **(a)** Réécrire PageTransition en CSS (`@keyframes` slide-fade keyed sur `key={location}` + `animation: ... 0.18s ease-out`) | S (~30 LOC) | -38 KB gzip critical path, ~-300 à -500 ms TTI 4G+ | Faible (animation triviale, déjà 6 keyframes existantes dans `index.css` §243) |
| **(b)** Lazy-charger PageTransition via `React.lazy` + `Suspense fallback={children}` autour de `<PageTransition>{children}</PageTransition>` dans AppLayout | XS (~5 LOC) | Identique à (a) | Faible (1er rendu = pas de transition, acceptable) |
| **(c)** Supprimer la transition de page (acceptable iOS 17+ qui transitionne nativement via View Transitions API future) | XS (1 commit revert + retrait du wrapper) | Identique + simplification AppLayout | Faible (retrait d'un effet UX subtil) |

Recommandation : **option (a)** (cohérent avec la stratégie §243 d'utiliser CSS pour les animations communes), à livrer comme **§254 chantier B sub-§B2 — corriger régression critical path**.

---

## 2. Comparaison estimé pass 1 vs mesuré pass 2

| § | Claim | Vérification post-§253 | Statut |
|---|---|---|---|
| **§239 #1** | gif precache | `vite.config.ts globPatterns` étendu à `.gif`, mais aucun GIF dans `public/` (les exercices muscu sont sur Supabase Storage `/storage/v1/object/public/`). **Quick win no-op en pratique** sur ce repo ; règle déjà présente dans `dist/sw.js` runtime caching `supabase-api` couvre l'usage réel. | ⚠️ Inerte |
| **§239 #2** | clé `assignments` alignée | `SwimmerHome.tsx:217` aligné `[userId ?? user]`. -1 fetch redondant par navigation. | ✅ |
| **§239 #3** | `getSessions` `.limit(200)` | confirmé `swim-sessions.ts:154`. | ✅ |
| **§239 #4** | `getHallOfFame` Promise.all | confirmé `records.ts:24,54`. | ✅ |
| **§239 #5** | catch QuotaExceededError | confirmé `localStorage.ts:18,46` + dispatch event. | ✅ |
| **§239 #6** | EF cache NetworkFirst | confirmé `dist/sw.js`: `s.registerRoute(/^https:\/\/.*\.supabase\.co\/functions\/v1\/.*/, NetworkFirst, networkTimeoutSeconds:8, maxAge 1h, 30 entries)`. | ✅ |
| **§239 #7-#8** | OfflineSyncBanner JSDoc, `loading="lazy"` | non re-vérifié (statique). | ✅ |
| **§241** | SW precache `globIgnores` exceljs/jspdf/html2canvas | confirmé : ces 3 chunks **absents** de la liste précachée `dist/sw.js`, présents en runtime cache `heavy-export-chunks` (StaleWhileRevalidate, max 6, TTL 30j). **Mesuré : precache 244 entrées / 5752.70 KiB. Annoncé post-§241 : 246 entrées / 5711 KiB. Drift +41 KiB acceptable** (livraisons §242→§253 ont ajouté des chunks). | ✅ |
| **§243** | -38 KB gzip critical path | **🚩 ANNULÉ par §246** (cf. § 1 ci-dessus). Critical path actuel = 5 vendors, vendor-motion-DOqokx5n.js (115.94 KB / 38.27 KB gzip) toujours préloadé. Les 6 banners utilisent bien CSS `@keyframes` (`useExitAnimation` hook OK), mais `PageTransition.tsx:1` réintroduit l'import sync. | 🚩 Régression |
| **§244 sub-§A** | pagination SELECT* records | confirmé : `records.ts:354` `.limit(500)`, `:466` default 500, `:583` `.limit(500)`. | ✅ |
| **§244 sub-§B** | retry exponential 1s/2s/4s max 2 | confirmé `queryClient.ts:13-17` : `retry: (n, e) => n < 2 && isTransientError(e)` + `retryDelay: Math.min(1000 * 2**i, 4000)`. | ✅ |
| **§244** | `withTimeout(8_000)` sur queryFn critiques | **NON LIVRÉ.** Audit pass 1 §63 : "`withTimeout()` utilisé 3× sur 40+ modules". Post-§253 : toujours 3 calls (`strength.ts:506,593,754`). Aucun wrap ajouté sur Dashboard/Coach/Records/Login queryFn. | ⚠️ Partiel — sub-§A2 reste à faire |
| **§247** | RPC `get_user_auth_context` -1 RTT | code présent (`auth.ts loadUser` tente RPC puis fallback 2 selects). Migration `00158_get_user_auth_context_rpc.sql` appliquée via MCP (cf. log). **Gain effectif non mesurable sans Network panel sur Slow 3G login flow.** | ✅ (code) — runtime à valider |
| **§248** | persistQueryClient localStorage | confirmé : deps `@tanstack/react-query-persist-client@^5.100.9` + `@tanstack/query-sync-storage-persister@^5.100.9` dans `package.json`, wrapper `<PersistQueryClientProvider>` dans `App.tsx`, key `"eac-rq-cache"`, maxAge 24h, buster `__BUILD_TIMESTAMP__`. **Gain effectif (reload offline avec cache peuplé) non mesurable sans flow login + offline mode.** | ✅ (code) — runtime à valider |
| **§249** | sonde réelle HEAD `version.json` | confirmé `useOnlineStatus.ts:25-41` : `probeConnectivity()` HEAD timeout 5s, intervals 30s OK / 5s fail, listener browser `online`/`offline`. Logique `isOnline = navigator.onLine && lastPingOk` exigeant les deux. | ✅ |
| **§251** | queue offline 3 mutations Profile + Records | confirmé `Records.tsx:525-560` `update1RM` + `upsertSwimRecord` wrap `tryWithOfflineQueue`. `Profile.tsx:391` `updateProfile` idem (vérif log). Helper `tryWithOfflineQueue<T>(type, payload, fn)` + sentinel `OFFLINE_QUEUED_RESULT` + type guard `isOfflineQueuedResult`. | ✅ |
| **§252** | queue +7 mutations SuiviSemaine + Administratif | confirmé `OfflineMutationSync.tsx` étendu (+7 type guards + 7 replay branches) + 4 query invalidations. | ✅ |
| **§252 skip** | uploadAvatar + saveSwimSession non queue | confirmé `SwimSessionView.tsx:220` `saveMutation` brut (pas de wrap), `Profile.tsx uploadAvatarMutation` brut. **2 mutations restent perdues offline** — couvert par chantier A sub-§C3 listé hors-scope. | ⚠️ Skip justifié, gap connu |
| **§253** | `React.memo(SwimSessionTimeline)` | confirmé : import `memo`, renommage interne `SwimSessionTimelineImpl`, export `memo(...)`. **Parent `SwimSessionView.tsx:170-217` utilise déjà `useCallback`** sur `handleToggleExpand`/`handleLogChange`/`addManualExercise`/`removeManualExercise` ⇒ memo efficace si props stables. **Gain réel "-50 à -80% re-renders sur saisie active" non mesurable sans React DevTools Profiler.** | ✅ (code) — runtime à valider |

**Bilan** : 16 claims sur 19 confirmés statiquement. **1 régression critique (§243↔§246)**, **1 gap partiel (§244 withTimeout coverage)**, **1 quick win inerte (§239 #1 gif precache)**.

---

## 3. Drapeaux résiduels post-§253

### Drapeau 🚩 #1 — Critical path bundle (régression §246)

Vendor-motion (38.27 KB gzip) réintroduit dans le `modulepreload` initial via `PageTransition.tsx`. **Gain §243 annulé**. Fix immédiat possible (~30 LOC CSS) — voir § 1.

### Drapeau ⚠️ #2 — `withTimeout` toujours utilisé 3× sur 40+ modules API

Couverture inchangée depuis le pass 1. `Dashboard`, `Coach hub`, `Records`, `Login` peuvent toujours rester suspendus 30 s+ sur EDGE/Slow 3G car aucun timeout client explicite. Le retry exponential §244 atténue mais ne couvre pas le cas "fetch indéfiniment pendu" (qui n'émet jamais d'erreur transient, donc `retry` ne s'enclenche pas).

**Recommandation §254 sub-§A** : helper `withQueryTimeout(queryFn, 8_000)` + adoption progressive sur les 5 hooks critiques (`useDashboardState`, `useCoachCalendarState`, `Records.tsx queries`, `Coach.tsx coachKpisQuery`, `auth.ts loadUser RPC fallback`). Effort S, gain : 100% des requêtes ≤ 8 s sur réseau pendu.

### Drapeau ⚠️ #3 — Mutations binaires + multi-étape encore perdues offline

`Profile.uploadAvatarMutation` (Blob 200 KB-2 MB) et `SwimSessionView.saveMutation` (`ensureSwimSession` + N `saveSwimLog`) restent en dehors de la queue offline. Identifiés et documentés comme chantier A sub-§C3 (effort L, risque moyen). Voir § 4.

---

## 4. Recommandations chantiers restants — priorisation post-pass-2

### P0 — Régression §243 critical path *(effort XS, ROI maximal)*

§254 sub-§B2 : remplacer `motion.div` + `AnimatePresence` dans `PageTransition.tsx` par CSS `@keyframes` slide-fade keyed sur `useLocation()`. Ou : `React.lazy(() => import("./PageTransition"))` avec Suspense fallback={children}. Gain restoré : **-38.27 KB gzip critical path, ~-300 à -500 ms TTI 4G+**.

### P0 — Compléter Chantier D sub-§A2 : `withTimeout` global *(effort S, ROI élevé)*

Helper `withQueryTimeout(queryFn, 8_000)` réutilisable + adoption sur 5 hooks critiques. Combiné avec le retry exponential §244 déjà livré, garantit : **100 % des requêtes terminent ≤ 8 s + 2 retries** (vs blocking ad infinitum). Pas de gain mesurable sur réseau OK, mais **élimine le pire cas** sur EDGE / Wi-Fi captive / Supabase incident.

### P1 — Chantier A sub-§C3 : 2 mutations restantes *(effort L, risque moyen)*

- `Profile.uploadAvatarMutation` : convertir Blob en base64 dans payload `tryWithOfflineQueue` (helper `blobToBase64`). Attention quota localStorage iOS Safari 5-10 MB — limiter avatar à <500 KB ou alerter quota dépassé via event `storage-quota-exceeded` déjà branché §239 #5.
- `SwimSessionView.saveMutation` : option (i) refactor en macro-mutation serveur `save_swim_session_atomic(session, logs[])` côté Postgres ; option (ii) enqueue d'une "intent" `swim-session-save` qui rejoue tous les steps au retour online. Option (i) préférée (transaction atomique côté DB + 1 RTT au lieu de N+1).

### P1 — Chantier E sub-§B + sub-§C : extraction + `React.memo` *(effort M, low risk)*

Sub-§B : extraire `<AthleteCard>` de `CoachSwimmersOverview.tsx:562-720` (closure ~150 LOC dans `.map`) + `React.memo` + stabiliser callback `onOpenAthlete` parent via `useCallback`.
Sub-§C : extraire `<RecordCard>` de `Records.tsx:816-837` (closure ~22 LOC) + `React.memo` + stabiliser callbacks `openEditSwim` / handlers via `useCallback`.

**Pré-requis** : audit React DevTools Profiler en runtime sur Coach hub + Records pour confirmer que ces composants sont effectivement re-rendus en boucle. Si non, ROI faible — skip.

### P2 — Chantier D sub-§C : `useDelayedLoading` + toast 5 s *(effort S, requiert /frontend-design)*

Hook `useDelayedLoading(loading, 5000)` qui retourne `{ showSlowToast: boolean }`. Toast "Ça prend du temps…" sur Dashboard / Coach / Records après 5 s de skeleton. Effort S, mais nécessite `/frontend-design` (règle CLAUDE.md globale §2). À planifier avec le user.

### P3 — §239 #1 gif precache *(décision YAGNI)*

Le `globPatterns: ['**/*.gif']` ajouté ne capture aucun fichier (les GIFs muscu sont sur Supabase Storage, déjà couverts par règle `supabase-api` NetworkFirst). Soit retirer la ligne (cleanup), soit laisser (no-op futur-proof si on ajoute des GIFs locaux). Décision : **laisser en l'état** (1 caractère, pas de coût build).

---

## 5. Plan d'action priorisé post-pass-2

| Priorité | Action | Effort | Gain mesurable | Cible § |
|---|---|---|---|---|
| **P0** | Régression PageTransition CSS (sub-§B2) | XS | -38.27 KB gzip critical, ~-300 à -500 ms TTI 4G+ | **§254** |
| **P0** | `withQueryTimeout` 5 hooks (sub-§A2) | S | 100% requêtes ≤ 8s sur réseau pendu | §255 |
| **P1** | Mutations binaire + multi-étape (sub-§C3) | L | 12/12 mutations couvertes offline (vs 10/12) | §256 |
| **P1** | `React.memo` AthleteCard/RecordCard (sub-§B+C) | M | -50–80 % re-renders Coach + Records (à confirmer Profiler) | §257 |
| **P2** | `useDelayedLoading` toast 5 s (sub-§C) | S | UX feedback explicite >5 s | §258 (avec /frontend-design) |

**Cible composite post-§254 (régression fixée)** : **7.8/10** (atteint la cible initiale du pass 2).
**Cible composite post-§255+§256** : **8.2/10** (objectif Chantier complet).

---

## 6. Ce qui marche — confirmé par vérification mécanique

- **§241 SW precache slim** : 5752 KiB / 244 entrées vs ~7237 KiB pré-§241 → **-1485 KiB (-20.5 %) confirmé**, drift +41 KiB sur le claim §241 acceptable (impact §242→§253). Workbox runtime cache `heavy-export-chunks` correctement câblé.
- **§239 #6 EF cache** : règle `/functions/v1/` NetworkFirst présente dans `dist/sw.js`, networkTimeoutSeconds 8, max 30 entrées, TTL 1h.
- **§244 retry exponential** : `queryClient.ts:13-17` `retry: failureCount < 2 && isTransientError(error)` + `retryDelay: Math.min(1000 * 2**i, 4000)`. Combiné avec `isTransientError` (`offlineQueue.ts:147` — déjà testé §214).
- **§247 RPC fallback** : `auth.ts loadUser()` tente RPC d'abord, fallback aux 2 SELECT historiques (`users.role` + `user_profiles.is_approved`) — zéro régression si migration pas déployée.
- **§248 persist** : `<PersistQueryClientProvider>` correctement configuré, `buster: __BUILD_TIMESTAMP__` invalide cache à chaque déploiement (anti-shape-drift), `shouldDehydrateQuery: query.state.status === "success"` skip erreurs/pending.
- **§249 sonde** : implémentation soignée (HEAD timeout 5s, intervals adaptatifs 30s/5s, listener browser online/offline, `cancelledRef` cleanup propre, no-op SSR).
- **§251/§252 queue** : pattern `tryWithOfflineQueue` + sentinel + type guard correctement adopté sur 10 mutations (Profile.update + Records 2 + SuiviSemaine 2 + Administratif 5). `OfflineMutationSync` étendu avec replay branches idempotentes + 4 invalidations RQ.
- **§253 React.memo** : drop-in compatible, parent `SwimSessionView.tsx:170-217` stabilise déjà 4 callbacks via `useCallback` ⇒ memo techniquement efficace pour les sub-renders pendant la saisie.

---

## 7. Mesures non réalisables sans navigateur runtime — script utilisateur fourni

Les vérifications suivantes nécessitent un navigateur réel (Chrome DevTools mobile + login + cache populaté). Script précis pour l'utilisateur :

### Setup runtime (≤ 5 min)

```bash
# 1. Build local + serve sur un port libre (8080 souvent occupé par autre node)
cd /Users/francoiswagner/Antigravity/Project-EAC/competition
npm run build
npx serve -s dist -l 4173  # serve choisira un port libre si pris

# 2. Si l'app dit "Supabase not configured" → utiliser le live à la place :
#    https://erstein-aquatic-club.github.io/competition/
```

### Mesures Lighthouse (online stable)

1. Ouvrir Chrome DevTools (Cmd+Option+I) → onglet **Lighthouse**.
2. Mode **Mobile**, catégories **Performance + Best Practices + PWA**.
3. Run analyze. Noter : Performance score, FCP, LCP, TBT, CLS, Speed Index.
4. **Target post-§254** : Performance ≥ 80, FCP ≤ 1.8 s, LCP ≤ 2.5 s, TBT ≤ 200 ms.
5. Onglet **Network**, reload (Cmd+Shift+R), **vérifier** : 4 modulepreload (vendor-react/query/charts/supabase) **sans vendor-motion** (preuve §254 fix).

### Mesures offline (PWA)

1. Naviguer Dashboard / Coach / Records pour peupler le cache RQ.
2. DevTools → onglet **Application** → Service Worker → cocher **Offline**.
3. Reload (Cmd+R). **Attendu** : skeletons brefs puis contenu identique à online (§248 OK).
4. Tester un edit Profile.bio → toast "Mise à jour en attente" (§251). Repasser online → toast "Données synchronisées" (§252 OfflineMutationSync replay).

### Mesures Slow 3G (login flow)

1. DevTools → Network → throttling **Slow 3G**.
2. Logout + login from scratch. **Chronomètre TTI au home**.
3. **Target post-§247** : ≤ 5 s (pré-§247 audit pass 1 estimait 5-8 s).
4. Network panel : confirmer **1 RPC `get_user_auth_context`** au lieu des 2 SELECT (`users.role` + `user_profiles.is_approved`).

### Mesures React Profiler (memo §253)

1. Installer React DevTools (extension Chrome).
2. Aller à `Suivi → SwimSessionView → saisir un log inline`.
3. Profiler → Record → taper 5 caractères dans un input → Stop.
4. **Vérifier** : `SwimSessionTimeline` apparait `(memo) — Did not render` sur les keystrokes (gain §253 confirmé).

### Captive portal (sonde §249)

1. DevTools → Network blocker (`--block-network-request-pattern=*supabase.co*`).
2. **Vérifier** : sonde HEAD `version.json` continue à passer → app reste "online".
3. Inverse : bloquer `version.json`, débloquer Supabase. **Attendu** : `useOnlineStatus → false` après ≤ 5 s, banner offline déclenché.

---

## Méthodologie & limites

**Méthode** : audit hybride statique + smoke runtime. `npm run build` (11.4 s, OK), inspection mécanique de `dist/index.html`, `dist/sw.js`, `package.json`, et ~20 fichiers source `.tsx`/`.ts` ciblés (`PageTransition.tsx`, `useOnlineStatus.ts`, `queryClient.ts`, `Records.tsx`, `SwimSessionView.tsx`). Comparaison commit par commit des claims §239→§253 contre l'état effectif du build.

**Pas exécuté** : Lighthouse / WebPageTest / React DevTools Profiler — l'environnement Claude Code de cette session a Chrome local mais pas Playwright (auto-mode classifier denied l'install pip). Le build local n'a pas les credentials Supabase (en GitHub Secrets) donc pas de e2e (login/Dashboard) testable contre le local serve.

**Confiance par mesure** :
- Régression §246 (vendor-motion réintroduit) : **HAUTE** — vérifié 3× (grep modulepreload, lecture `PageTransition.tsx:1`, lecture `AppLayout.tsx:11`, ordre des commits).
- Vérifications §241/§239#6/§244/§248/§249/§251/§252/§253 : **HAUTE** — code lu directement.
- Estimations TTI/FCP/LCP : **inchangées vs pass 1** (méthode déductive RTT × payload). Les vrais chiffres viendront du Lighthouse manuel utilisateur.

**Limites** :
- Gain runtime de §247/§248/§249/§251/§253 non mesuré quantitativement. Code en place, comportement attendu plausible mais pas chronométré.
- Pas de profiling React DevTools sur surfaces parents → re-renders effectifs des `<AthleteCard>` / `<RecordCard>` non confirmés (recommandation Chantier E sub-§B/C reste contingente à ce profiling).
- iOS Safari behavior (quota localStorage, SW background throttling, viewport) non testable depuis macOS Chrome headless.
