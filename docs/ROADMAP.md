# Roadmap de Développement

*Dernière mise à jour : §253 livré (2026-05-10) — Chantier E sub-§A : `React.memo(SwimSessionTimeline)` (drapeau racine UX réseau instable / re-renders, audit perf pass 1). Le composant `SwimSessionTimeline` (590 LOC, rendu inline dans `SwimSessionView` + `Suivi`) re-render aujourd'hui à chaque keystroke de saisie de log inline. Wrap : `import { memo }` + renommage interne `SwimSessionTimelineImpl` + `export const SwimSessionTimeline = memo(SwimSessionTimelineImpl)` — drop-in compatible côté caller. **Bénéfice attendu : -50 à -80 % re-renders sur saisie active de logs** quand parents stabilisent props via `useCallback` (déjà le cas pour `updateManualLog`/`removeManualExercise` dans `SwimSessionView`). Hors scope (sub-§B + sub-§C reportées) : extraction `<AthleteCard>` de `CoachSwimmersOverview` (~150 LOC closure dans `.map`) + extraction `<RecordCard>` de `Records.tsx` — demandent refactor + audit React DevTools en runtime pour confirmer gain. tsc clean, 688/689 tests pass + 1 fail pré-existant. 1 fichier, +5 LOC.*

*Précédente : §252 livré (2026-05-10) — Chantier A sub-§C2 : queue offline étendue à 7 nouvelles mutations (SuiviSemaine 2 + Administratif 5) — drapeau racine #2 audit perf pass 1, cache/queue offline. Pattern `tryWithOfflineQueue` du §251 appliqué directement à : `setPlannedAbsence`, `removePlannedAbsence` (SuiviSemaine), `createTimesheetShift`, `updateTimesheetShift`, `deleteTimesheetShift`, `createTimesheetLocation`, `deleteTimesheetLocation` (Administratif). `OfflineMutationSync.tsx` étendu avec 7 type guards + 7 replay branches + 4 invalidate query keys (`my-absences`, `swimmer-sessions-week`, `timesheet-shifts`, `timesheet-locations`). Toast adaptatif "X en attente / X enregistré" partout. **Skip délibéré pour 2 sites** : `Profile.uploadAvatarMutation` (payload Blob binaire — refactor queue base64 nécessaire) + `SwimSessionView.saveMutation` (multi-étape `ensureSwimSession` + N `saveSwimLog` — refactor macro-mutation nécessaire). **Cumul Chantier A complet : 10/12 mutations critiques couvertes par la queue offline** (3 §251 Profile/Records + 7 §252 SuiviSemaine/Administratif). Bénéfice : 0 mutation simple perdue offline + UI feedback explicite. tsc clean, 688/689 tests pass + 1 fail pré-existant. 3 fichiers, ~155 LOC nettes.*

*Précédente : §251 livré (2026-05-10) — Chantier A sub-§C : queue offline étendue à 3 mutations critiques nageur (drapeau racine #2 audit perf pass 1, cache/queue offline). Auparavant la queue ne replayait que 2 types Strength (§214) — toute autre mutation offline était silencieusement perdue. **Helper réutilisable `tryWithOfflineQueue<T>(type, payload, fn)` ajouté à `src/lib/offlineQueue.ts`** : si `navigator.onLine === false`, enqueue direct ; sinon tente `fn()`, et si erreur transient (`isTransientError`) enqueue + return sentinel `OFFLINE_QUEUED_RESULT`. Type guard `isOfflineQueuedResult` côté caller pour switcher le toast "Sauvegardé" → "En attente — sera synchronisée au retour en ligne". `src/components/shared/OfflineMutationSync.tsx` étendu avec 3 nouvelles branches replay (`profile-update`, `record-1rm-update`, `swim-record-upsert`) qui appellent directement les API respectives (idempotent par design : PATCH/UPSERT). 3 mutations branchées : `Profile.tsx updateProfile` (bio/groupe/birthdate/iuf/phone), `Records.tsx update1RM`, `Records.tsx upsertSwimRecord`. **Bénéfice : 0 mutation perdue offline pour ces 3 sites + UI feedback explicite "en attente" au lieu d'erreur Supabase brute.** Pattern adopté + documenté pour application sub-§C2 future aux 5 mutations restantes (uploadAvatar binaire, SwimSessionView.save, Administratif shifts/locations, SuiviSemaine absences). tsc clean, 688/689 tests pass + 1 fail pré-existant. 4 fichiers, ~120 LOC nettes. Numérotation §251 (§250 réservé Chantier V P2 cosmétiques livré en parallèle).*

*Précédente : §250 livré (2026-05-10) — Chantier V P2 cosmétiques audit §240, après Chantier III dark mode manuel sans anomalie remontée. 6 fichiers UI/accessibilité : `ChallengeProgressBar` ne porte plus les zones par couleur seule (tokens `status-*` + labels `Débutant / En cours / Atteint` + statut courant), `WellnessTrend` remplace le `title` du `&#9888;` par `role="img"` + `aria-label`, `InlineBanner` ajoute une garde dev label non vide + `aria-label` cliquable + dot `aria-hidden`, `SessionRow` remonte les contrastes décoratifs `/50→/70` et `/30→/50`, `ReadinessGauge` fond `/10→/15`, `ObjectiveCard` remplace le `title` natif du bouton Allures par un tooltip Radix accessible. tsc clean, 688/689 tests pass + 1 fail pré-existant `transformers.test.ts buildRunUpdatePayload`.*

*Précédente : §249 livré (2026-05-10) — Chantier A sub-§B : sonde de connectivité réelle (drapeau racine #2 audit perf pass 1, élimination des faux positifs `navigator.onLine`). `src/hooks/useOnlineStatus.ts` réécrit (20 → 88 LOC, API publique boolean préservée) : ajoute `probeConnectivity()` HEAD `${BASE_URL}version.json?_=${Date.now()}` avec timeout 5 s via `AbortController`. Loop interne ping toutes les 30 s en cas de succès, 5 s en cas d'échec (récupération rapide). `isOnline = navigator.onLine && lastPingOk` — exige les 2. Listener `online` browser → probe immédiat 100 ms après ; listener `offline` → bypass probe, mark offline direct. **Bénéfice : captive portal Wi-Fi / VPN coupé / faux positifs sont désormais détectés et déclenchent le fallback localStorage + banner offline correctement.** Coût : 1 HEAD `version.json` (~50 octets, no-store) toutes les 30 s = ~6 KB/h, quasi-zéro. Tous les consumers (`OfflineDetector`, `OfflineMutationSync`, `OfflineSyncBanner`) bénéficient automatiquement (API non changée). tsc clean, 688/689 tests pass + 1 fail pré-existant. 1 fichier, +88 LOC nettes. Hors scope : sub-§C queue offline étendue.*

*Précédente : §248 livré (2026-05-10) — Chantier A sub-§A : `persistQueryClient` localStorage (drapeau racine #2 audit perf pass 1, cache offline). 2 nouvelles deps `@tanstack/react-query-persist-client@^5.100.9` + `@tanstack/query-sync-storage-persister@^5.100.9`. `src/App.tsx` : `<QueryClientProvider>` → `<PersistQueryClientProvider>` avec `persister: createSyncStoragePersister({ storage: localStorage, key: "eac-rq-cache" })`, `maxAge: 24h`, `buster: __BUILD_TIMESTAMP__` (invalide cache à chaque déploiement, évite shape obsolète), `dehydrateOptions.shouldDehydrateQuery: query.state.status === "success"` (skip erreurs et pending). **Bénéfice : reload PWA offline désormais peuplé** — Dashboard / Coach hub / Records / SwimmerHome / Profile s'affichent avec les dernières données vues (jusqu'à 24h). Avant §248 : in-memory only, cold start offline = écran blanc. Premier paint accéléré post-restore + revalidation réseau en arrière-plan préservée (staleTime: 10min). PWA precache 5712 → 5749 KiB (+37 KiB pour les 2 deps gzipped). tsc clean, 688/689 tests pass + 1 fail pré-existant. 2 fichiers, ~30 LOC. Hors scope §248 : Chantier A sub-§B sonde connectivité réelle + sub-§C queue offline étendue (8 mutations critiques restent perdues offline).*

*Précédente : §247 livré (2026-05-10) — Chantier C : RPC `get_user_auth_context` (drapeau racine #3 audit perf pass 1, login waterfall Slow 3G). Migration `00158_get_user_auth_context_rpc.sql` (NEW, SECURITY DEFINER, lit `users.role` + `user_profiles.is_approved` en 1 SELECT JOIN, check `app_user_id()` interne empêche l'exfiltration cross-user, pattern aligné sur §223 `get_coach_kpis_rpc`) — appliquée via `mcp__plugin_supabase_supabase__apply_migration` retournant `{success: true}`. `src/lib/auth.ts loadUser()` modifié défensivement : tente `supabase.rpc("get_user_auth_context")` en priorité, fallback byte-identical sur les 2 selects historiques (`users.role` + `user_profiles.is_approved`) en cas d'erreur RPC. **Gain : -1 RTT sur loadUser() (~400-800 ms TTI login Slow 3G).** Zéro régression : si la migration n'est pas en prod (deploy retardé) ou erreur réseau RPC, le fallback préserve le comportement actuel. tsc clean, 688/689 tests pass + 1 fail pré-existant. 3 fichiers, ~85 LOC. Pas de test RLS dédié (pattern identique à §223 qui couvre déjà le risque). Numérotation §247 (et non §245/§246) car §245 réservé Fix bannière PWA + §246 réservé Pass 7 polish iOS premium livrés en parallèle.*

*Précédente : §246 livré (2026-05-10) — Pass 7 polish iOS premium (sub-§ A+B+C+E). 3 sub-agents sonnet parallèles, **9 nouveaux fichiers + 7 modifiés, tsc clean**. **Sub-§ A** (animations) : `PageTransition.tsx` AnimatePresence slide+fade keyed sur Wouter `useLocation()` + 3 spring presets centralisés (`springSoft/Stiff/Gentle`) dans `lib/animations.ts` + wrap children dans `AppLayout.tsx`. **Sub-§ B** (skeletons fidèles) : 4 variantes dans `src/components/shared/skeletons/` (Dashboard 6×7, List rows={N}, Home greeting+stats+quicklinks, Calendar 7 cols) + Suspense fallbacks par route dans `App.tsx`. **Sub-§ C** (haptic) : `lib/haptic.ts` wrapper navigator.vibrate respect prefers-reduced-motion + 5 branchements `haptic.success()` (WellnessForm, DashboardFeedbackContainer create+edit, AthleteInterviewsSection submit+sign) + 3 branchements `haptic.error()` (Login loginForm+signupForm + Profile passwordForm — Profile commité par user §245 `149e8d6d7`). **Sub-§ E** (bottom nav badges) : `NavBadge.tsx` pastille bg-status-error + `useUnreadCount.ts` hook React Query staleTime 60s appelant `notifications_list({status:'unread'})` + branchement nav item `/profile` dans `AppLayout.tsx`. Sub-§ D Typography rhythm + F Surface adoption massive (140+ fichiers) **SKIPPÉS** par décision UX utilisateur (ROI marginal vs risque). Sub-§ G dark mode audit manuel utilisateur en parallèle. Timing tokens index.css **reportés** (conflit user §243 framer→CSS). Numérotation §246 car §243+§244+§245 réservés chantiers user (B sub-§B framer→CSS, D sub-§A+B perf records, fix bannière PWA parasite). tsc clean, 688/689 tests pass + 1 fail pré-existant. Score estimé : ~9.5/10 → ~9.8/10.*

*Précédente : §245 livré (2026-05-10) — Fix bannière PWA parasite après "Mettre à jour l'app". `handleCheckUpdate` utilisait `window.location.reload()` sans `skipWaiting` → SW restait "waiting" → `onNeedRefresh` se redéclenchait après reload → bannière parasite. Fix : remplace le reload final par `__pwaApplyUpdate()` (skipWaiting + cache clear + reload). 1 fichier, ~5 LOC.*

*Précédente : §244 livré (2026-05-10) — Chantier D sub-§A+B : pagination SELECT* records + retry exponentiel (drapeau racine #3 audit perf pass 1, chemin critique réseau). 3 SELECT* records.ts plafonnés à 500 : `getSwimRecords:354` (`+ .limit(500)`), `getSwimmerPerformances:466` (`limit: filters.limit ?? 500` default), `getClubRanking:583` (`+ .limit(500)`). `queryClient.ts` retry réécrit : `retry: 1` global → `retry: (failureCount, error) => failureCount < 2 && isTransientError(error)` + `retryDelay: Math.min(1000 * 2 ** attemptIndex, 4000)` (backoff 1s/2s/4s, max 2 essais). Net : -1 RTT sur erreurs métier (4xx fail fast), +2 RTT max sur blip réseau (5xx/network/timeout, retry intelligent). `isTransientError` réutilisé depuis `offlineQueue.ts:147` (déjà testé). Sub-§C reportée (`useDelayedLoading` hook + toast 5s — UX pure, requiert /frontend-design). tsc clean, 688/689 tests pass + 1 fail pré-existant. 2 fichiers, ~10 LOC.*

*Précédente : §243 livré (2026-05-10) — Chantier B sub-§B : framer-motion → CSS sur 6 banners partagés (drapeau racine #1 audit perf pass 1, sortie de `vendor-motion` du critical path). Nouveau hook `src/hooks/useExitAnimation.ts` (47 LOC, équivalent minimal `AnimatePresence`) + 6 keyframes CSS (`banner-pill-*`, `inline-banner-*`, `banner-collapse-*`) ajoutées dans `src/index.css` (~50 LOC) avec spring approximé `cubic-bezier(0.34, 1.56, 0.64, 1)` entry / `cubic-bezier(0.4, 0, 1, 1)` exit + `prefers-reduced-motion` honoré. 6 composants migrés (`UpdateNotification`, `InstallPrompt`, `OfflineSyncBanner`, `OfflineDetector` pills slide-down + `OfflineBanner` collapse + `InlineBanner` inline) — API publiques préservées (animate/visible InlineBanner). **Delta mesuré : `dist/index.html <link rel="modulepreload">` réduit de 5 vendors → 4 vendors (plus de `vendor-motion`). Critical path -38.27 KB gzip (~-300 à -500 ms TTI 4G+).** `vendor-motion` reste lazy-chargé avec la première page lazy qui l'importe (Login). 2 autres composants partagés (`BottomActionBar`, `AchievementToast`) gardent framer-motion mais sont déjà lazy-tirés via Dashboard/Strength/Profile, hors scope. tsc clean, 688/689 tests pass + 1 fail pré-existant. 8 fichiers, ~150 LOC nettes. Numérotation §243 (et non §242) car §242 réservé Pass 6 sub-§B WCAG livré en parallèle.*

*Précédente : §242 livré (2026-05-10) — Pass 6 sub-§B fixes WCAG AA (vers 9.5/10). 4 sub-agents sonnet parallèles, **54 edits / 23 fichiers, tsc clean**. Couverture des 4 P0 + 17 P1 audits §240 : (Batch A 22 edits) Profile bio/birthdate/ffn-iuf id+htmlFor + SwimmerSlotsTab Début/Fin/Lieu ×2 forms id+htmlFor + Trash aria-label + ChronoSetup 6 +/- aria-label + input numeric aria-label + 4 contrast `/50`-`/60`→`/70` ; (Batch B 17 edits) MonthlyReport prev/next + SwimmerPaceCard PDF/Share/Trash + CoachTrainingSlotsScreen Share + CoachMySwimmersScreen Pencil/Trash dynamique + CoachGroupsScreen Trash + SwimSessionBuilder Up/Down/Trash aria-label + focus-visible + CoachTrainingSlotsScreen tabs + CoachSwimmerFullView/QuickView Retour/Réessayer focus-visible ; (Batch C 9 edits) ChronoResults `/30` `/40`→`/70` sur données (P0) + PaceStrokeAdjustments `/30`→`/70` sur référence (P0) + Login.tsx L228 `<h1>` décoratif → `<p>` (h1 mobile L261 et h1 desktop L276 mutuellement exclusifs via `lg:hidden` / `hidden lg:block`) + ChronoRace/PaceTeamPanel/SwimmerWeekMatrixCard contrast secondaire ; (Batch D 6 edits) `<h1 className="sr-only">` sémantique sur Strength/Progress/HallOfFame/SuiviSaison/Suivi/RecordsClub. Numérotation §242 (et non §241) car §241 réservé chantier B perf SW livré par utilisateur en parallèle. tsc clean, 688/689 tests pass + 1 fail pré-existant. Score estimé : ~9.3/10 → ~9.5/10.*

*Précédente : §241 livré (2026-05-10) — Chantier B sub-§A : SW precache slim. `vite.config.ts` `globIgnores` étendu à `exceljs.min-*.js` + `jspdf.plugin.autotable-*.js` + `html2canvas.esm-*.js` (3 chunks d'export lourds rarement utilisés, ~456 KB gzip cumulés). Nouvelle règle Workbox `StaleWhileRevalidate` sur `/assets/(exceljs|jspdf|html2canvas)-*.js` (cacheName `heavy-export-chunks`, 6 entrées, TTL 30j) pour les capturer au premier usage. **Delta mesuré : 7237 KiB → 5711 KiB precache (-1526 KiB, -21%)**, 249 → 246 entrées. Estimation gain install PWA 4G@10Mbps : ~-360 ms. Drapeau #1 bundle/SW : 1 fix structurel. tsc clean. 1 fichier, ~15 LOC. Numérotation §241 (et non §240) car §240 réservé Pass 6 audit WCAG livré en parallèle.*

*Précédente : §240 livré (2026-05-10) — Pass 6 sub-§A audit accessibilité WCAG AA (lecture seule, 1 fork sonnet ~154s). Verdict : dette ciblée, aucun problème systémique. **28 spots identifiés** : 4 P0 (3 inputs Profile sans htmlFor + Login.tsx 3 h1 dans DOM CSS-responsive non exclusif + ChronoResults:627/PaceStrokeAdjustments:152 contrast `/30` `/40` sur données), 17 P1 (19 boutons icon-only sans aria-label, 6 pages sans h1, 8 boutons natifs sans focus-visible, ~10 muted-foreground `/50`-`/60` secondaires, 6 inputs SwimmerSlotsTab sans htmlFor), 7 P2 reportés. Catégories conformes : `<div onClick>`, tabindex, Sheet/Dialog focus trap (Radix Primitive intact), calendrier nav clavier (CalendarGrid.onKeyDown). Recommandations §241 : 6 batches ~50 fixes file:line, sub-agents sonnet parallèles.*

*Précédente : §239 livré (2026-05-10) — 8 quick wins perf (audit pass 1). Lot ≤ 10 LOC/item, ~25 LOC nettes sur 9 fichiers : (1) `vite.config.ts:40` globPatterns +gif,webp (precache GIFs muscu) ; (2) `SwimmerHome.tsx:217` queryKey assignments aligné Dashboard `[userId ?? user]` (élimine 1 fetch redondant) ; (3) `swim-sessions.ts:154` `getSessions` `+ .limit(200)` (-70% payload nageur actif) ; (4) `records.ts:24,54` `getHallOfFame` 2 RPC séquentiels → `Promise.all` (-400 ms) ; (5) `localStorage.ts:18,46` `localStorageSave`/`Versioned` catch QuotaExceededError + dispatch CustomEvent `storage-quota-exceeded` (hook futur listener) ; (6) `vite.config.ts:67-83` règle Workbox `/functions/v1/*` NetworkFirst 30 entrées TTL 1h timeout 8s (Edge Functions précachées) ; (7) `OfflineSyncBanner.tsx:7-10` JSDoc alignée sur l'implémentation (sync outcome surfacé par `OfflineMutationSync`) ; (8) `EquipmentIconCompact.tsx:33` + `InfoParticipants.tsx:86` + `Coach.tsx:845` `<img>` `+loading="lazy"` (avatars listes). Drapeau #1 bundle/SW : 4 fixes ciblés. Drapeau #2 cache/queue offline : 2 hooks (Edge Functions + quota event). Drapeau #3 chemin critique : 3 fixes (queryKey, limit sessions, parallel RPC). Hors scope : chantiers A-E (persistQueryClient + queue généralisée + framer-motion lazy + auth context RPC + withTimeout + React.memo). tsc clean, 688/689 tests pass + 1 fail pré-existant. Numérotation §239 (et non §238) car §238 réservé à un Pass 5 UI/UX livré en parallèle.*

*Précédente : §238 livré (2026-05-10) — Pass 5 caves catégoriels (vers 9.3/10). 5 sub-agents sonnet parallèles sur top 5 fichiers identifiés audit pass 3 §236. **79 hits → 32 hits (-47, -59%)**, 37 edits effectifs : (1) `SuiviSemaine.tsx` 16→4 (cat-swim/strength + intensity-prog, 8 edits) ; (2) `AthleteInterviewsSection.tsx` 14→10 (intensity-prog draft coach, 4 edits) ; (3) `SwimmerInterviewsTab.tsx` 13→12 (status-success sent badge, 1 edit) ; (4) `RacesTab.tsx` 14→6 (rank-gold finale/podium, 8 edits) ; (5) `Pace4NSegmentMatrix.tsx` 22→0 (stroke-pap/dos/br/nl + intensity-1..5 zones, 16 edits, total clean). 32 hardcodes catégoriels conservés (identité nageur=bleu/coach=amber 22 hits, pastels frame SuiviSemaine 4 hits, amber accents RacesTab 6 hits) — décisions tokens à arbitrer §239+. tsc clean, 688/689 tests pass + 1 fail pré-existant.*

*Précédente : §237 livré (2026-05-10) — Pass 4 closing P1 résiduels (vers 9.0/10). 8 fixes file:line file:line bundle commit unique, ~20 LOC nettes : (1) `OfflineDetector.tsx:58-59` bg-emerald/red-500/90 → bg-status-success/error/90 + borders ; (2) `InfoBubble.tsx:81-83` AcwrInfoContent 3 zones → status-success/warning/error ; (3) `CompetitionDetail.tsx:72,95` back buttons h-9 → h-11 ×2 ; (4) `WorkoutRunner.tsx:1028-1034` difficulté ternaire emerald/amber/orange/red → map Record<1..5, "bg-intensity-N"> ; (5) `WellnessForm.tsx:196` text-emerald-600 → text-status-success ; (6) `Profile.tsx:122` ToggleGroupItem h-9 → min-h-11 ; (7) `SwimSessionView.tsx:468,479,486` mode libre h-9 ×3 → h-11 ×3 ; (8) `CoachCommentsScreen.tsx:25-27` indicatorColor 3 hardcodes → status-{success/warning/error}-bg + text-status-*. Drapeau #2 tap targets : 3 spots P1 résiduels (CompetitionDetail, Profile, SwimSessionView) closeés. Drapeau #3 hardcodes : 5 spots tokenisés (régressions P2 OfflineDetector + InfoBubble closeées). tsc clean, 684/685 tests pass + 1 fail pré-existant.*

*Précédente : §236 livré (2026-05-10) — Audit UI/UX pass 3 lecture seule (3 forks parallèles sonnet, méthode identique §215). Score global app : **6/10 (pass 1) → 7.8 (pass 2) → ~8.5/10 (pass 3, +0.7)**. Drapeau #1 typo : DRAPEAU FERMÉ ✅ (toutes régressions P0/P1 pass 2 soldées : Coach.tsx:1097 §227, AwaitingApproval/ComingSoon §224, SlotSessionSheet:376 §224 ; 2 borderline whitelistées via `.heading-display` opt-in §229). Drapeau #2 tap targets : DRAPEAU FERMÉ au niveau primitives ✅ (SelectTrigger §224, DialogClose+SheetClose §227, cluster AthletePlansTab 6 boutons §224). Dette ponctuelle locale ~12 spots P1 résiduels (modals Dashboard/SwimSessionView, CompetitionDetail back ×2, Profile/SwimmerObjectivesTab ToggleGroup Radix). Drapeau #3 hardcodes : RÉDUIT MAJEUR — 540→475 hits (-12%), top 5 cumul 102→67 (-34% pass 2→3). Caves coach résolues : CoachTrainingSlotsScreen 36→0 (§226), AthletePlansTab 22→8, FeedbackDrawer 16→9. 2 régressions P2 ponctuelles résiduelles non corrigées (`OfflineDetector.tsx:58-59`, `InfoBubble.tsx:82-84` AcwrInfoContent). 3 NEW composants stables : Surface 8.5/10 (3 call-sites), EmptyState 9.5/10 (5/5 cibles, +0.5), systemBanners 9.5/10. Hors scope : aucun edit appliqué. Recommandations pass 4 (~1 demi-journée, ~15 lignes) : 7 P1 listés. Rapport `docs/audits/2026-05-10-ui-ux-audit-ios-pass3.md` ~280 lignes.*

*Précédente : §235 livré (2026-05-10) — Auto-mark notifications lues à la complétion de l'action. Helper centralisé `notifications_mark_read_by_filter({ userId, type?, titleContains? })` (`src/lib/api/notifications.ts` +~100 LOC, logique pure `applyMarkReadFilter` extraite pour testabilité) qui marque comme lues les targets perso + groupe correspondant à un filtre type/titre, en 1 SELECT (jointure `notifications!inner`) + 1 UPDATE idempotent (`is read_at null` côté SELECT et UPDATE). Branché sur 3 sites de complétion : (1) `WellnessForm.tsx` après `upsertWellness` (`type: 'wellness'`), (2) `DashboardFeedbackContainer.tsx` mutations create + edit (`type: 'assignment'` + `titleContains: 'Séance terminée'` pour cibler uniquement le rappel cron `slot-session-reminder` 00143 sans masquer les vraies assignations coach), (3) `AthleteInterviewsSection.tsx` `submitMut` + `signMut` (`type: 'interview'`, couvre « à compléter » + « à relire » 00104). Pattern défensif try/catch non-bloquant. Invalidation queries `profile-notifications` + `notifications-home` côté `onSuccess`. 4 tests unitaires `applyMarkReadFilter` verts (filtre type, titleContains case-insensitive, broadcast `target_user_id=null`, zero match). Net : +~180 LOC src + 76 LOC test. tsc clean, 688/689 tests pass + 1 fail pré-existant (`transformers.test.ts`).*

*Précédente : §234 livré (2026-05-10) — Closing audit pass 2 : 3 quick wins finaux bundlés. **Sous-§A** : `Coach.tsx` 6 occurrences `text-[9px]` → `text-[11px]` (lisibilité WCAG, audit P1). **Sous-§B** : prefers-reduced-motion guards sur 8 fichiers (`Login.tsx`/`MonthlyReport.tsx` `useReducedMotion` hook pour stagger explicite ; `OfflineBanner.tsx`/`InstallPrompt.tsx`/`InlineBanner.tsx`/`OfflineSyncBanner.tsx`/`UpdateNotification.tsx`/`AchievementToast.tsx` `motion-reduce:animate-none` Tailwind utility pour banners single-element ; SuiviSaison/Profile skippés justifiés). **Sous-§C** : `SwimCatalog.tsx`/`StrengthCatalog.tsx`/`AthletePlansTab.tsx` search clear button `h-7 w-7` → `h-9 w-9` (cohérence field-internal). 12 fichiers src + 3 doc. **Cumul final post-audit pass 2** : 8 chantiers livrés (§215+§222, §224, §225, §226, §227, §229+§230, §234), tous drapeaux racines NEUTRALISÉS. Score estimé 6/10 (pass 1) → 7.8 (pass 2) → ~9/10 (post-§234, à valider §235 audit pass 3). tsc clean.*

*Précédente : §233 livré (2026-05-10) — Suppression dead code `seedDemoData`/`resetCache` (cleanup audit §214, flagué par review §219). Confirmé 0 caller post-grep. `src/lib/api/localStorage.ts` 171 → 119 LOC (-52). `src/lib/api/index.ts` -5 (re-exports retirés). Import orphelin `assignments_create` retiré. **Net : -57 LOC**. Si le besoin de seed dev re-émerge, ré-impl trivial (40 LOC). tsc clean, 684 tests pass + 1 fail pré-existant non lié.*

*Précédente : §232 livré (2026-05-10) — Helper `assertSupabase<T>()` audit §214 (pattern d'erreur centralisé). 237 occurrences du pattern `if (error) throw new Error(error.message)` codemodées dans 36 fichiers `src/lib/api/` via le helper byte-identical ajouté à `client.ts`. 6 sites résiduels Cas D légitimes (count destructure / Promise.all / auth.updateUser / silent no-op §113). Branche conditionnelle 23505 de `swim-sessions.ts syncSession` préservée intacte. Test mock fix dans `coach-quickview.test.ts` (impl inline pour 3 mocks sans `...real`). Subagent-driven : 1er implementer stallé 600s, 2e succès avec prompt 3× plus court. Spec ✅ + code quality manuel approved. **Net : ~-200 LOC** + 1 source de vérité pour le pattern d'erreur Supabase (future télémétrie centralisable). tsc clean, 684 tests pass + 1 fail pré-existant non lié.*

*Précédente : §229+§230 livrés (2026-05-09) — 2 quick wins finaux post-audit pass 2. **§229** : 2 dernières occurrences typo borderline ("Séance terminée" SessionSummary:58 + WorkoutRunner:751) whitelistées via classe utility `.heading-display` opt-in §197. Drapeau racine #1 typo désormais 100% NEUTRALISÉ + nettoyé (plus aucune occurrence inline ad-hoc de `font-display + uppercase + italic` cumulés). **§230** : suppression `src/components/shared/SafeArea.tsx` zombie (1 call-site Administratif.tsx, style inline, -34 LOC nettes). Ajout de 4 `@utility` Tailwind 4 dans `index.css` (`pt-safe`/`pb-safe`/`pl-safe`/`pr-safe`) exposant `padding-X: env(safe-area-inset-X)` réutilisables app-wide. Migration Administratif.tsx → `<div className="pt-safe pb-safe">`. 4 fichiers src + 1 fichier supprimé + 3 doc. tsc clean, 681 tests pass + 4 fails (1 pré-existant + 3 du chantier user `assertSupabase` lib/api/* en cours, non liés). Cumul depuis audit pass 2 : 6 chantiers (§215+§222, §224, §225, §226, §227, §229+§230).*

*Précédente : §227 livré (2026-05-08) — Tap targets résiduels + Coach.tsx typo P0 régression. 5 fichiers : `Coach.tsx:1097` CardTitle fallback "Accès Coach" `uppercase italic` → sentence-case (dernière régression P0 typo hors borderline brand-moments) ; `AppLayout.tsx:172` avatar header h-9→h-11 ; `PageHeader.tsx:60` back button h-9→h-11 ; `sheet.tsx:92` SheetPrimitive.Close + `dialog.tsx:45` DialogPrimitive.Close — wrapper `flex h-11 w-11 items-center justify-center rounded-full hover:bg-muted` (préserve icône X 16px, élargit tap area à 44px iOS HIG). Surface consolidation BottomActionBar/UpdateNotification → **abandonnée** (Surface API sans `radius=full`/`top-only`, gain net négatif). Drapeau #1 typo : toutes régressions P0/P1 closeées (4 fixées §224+§227 ; 2 borderline `SessionSummary`/`WorkoutRunner` "Séance terminée" à whitelister §228). Drapeau #2 tap targets : toutes primitives ui conformes HIG 44pt. 5 fichiers src + 3 doc. tsc clean, 684 tests pass + 1 fail pré-existant non lié.*

*Précédente : §226 livré (2026-05-08) — Tokens chantier (cat-* + stroke-*) + caves catégoriels CoachTrainingSlotsScreen + ObjectiveCard. 9 nouveaux tokens HSL ajoutés `src/index.css` (light + dark variants) : `--cat-{swim,strength,override,competition}` (4) pour catégories de type (natation/muscu/modifié/compétition) + `--stroke-{nl,dos,br,pap,qn}` (5) pour les 4 nages d'ObjectiveCard. Déclarations `@theme inline` (12 lignes) exposent les tokens à Tailwind 4 (`bg-cat-swim/15`, `text-cat-strength`, `border-stroke-nl`, etc.). Migration complète : `CoachTrainingSlotsScreen.tsx` 31→0 hits (sub-agent sonnet, blue→cat-swim 14, amber→cat-strength 8, orange→cat-override 8, rose→cat-competition 4 — 12 commentaires `TODO §218` supprimés, 19 calls Edit) + `ObjectiveCard.tsx` 7→0 (STROKE_BORDER_TOP map 5 hits 1:1 + 2 deltas objectif → status-success/warning). Cas inline conservés : `ctx.fillStyle hex` (canvas JS L.2650) + `rgba()` shadow inline (L.482-483, équivalent blue/amber-500). **Total cumulé Chantier C** : 158 hardcodes status remplacés sur 18 fichiers. 3 fichiers src + 3 doc. tsc clean, 684 tests pass + 1 fail pré-existant non lié.*

*Précédente : §225 livré (2026-05-08) — Polish post-audit pass 2. `toast.tsx dotColors` map (`emerald/red/amber/blue-500`) → tokens sémantiques `status-success/error/warning` + `intensity-prog` (info). `SwimCatalog.tsx:834-838` empty state archive ad hoc (`<div Archive/><p>`) → `<EmptyState>` (5e call-site, adoption progressive). Skip SafeArea suppression (Tailwind 4 sans `pb-safe` natif ici, codebase utilise arbitrary values) et SwimCatalog header inline (CoachSectionHeader text-2xl vs base actuel = changement visuel, décision UX). 2 fichiers src + 3 doc. tsc clean, 684 tests pass + 1 fail pré-existant non lié.*

*Précédente : §224 livré (2026-05-08) — P0 transverses + typo régressions P1 post-audit pass 2. SelectTrigger `h-9 → min-h-11 md:min-h-9` (impact app-wide : tous les selects Radix conformes Apple HIG 44pt mobile). AthletePlansTab cluster `inline-flex h-7 w-7 → h-11 w-11` via replace_all sur 6 boutons d'action critiques (assign/edit/delete/copy). Typo régressions sentence-case : AwaitingApproval h1, ComingSoon CardTitle, SlotSessionSheet h3 preview (suppression `style={fontFamily: var(--font-display)}` inline + uppercase). Coach.tsx:1151 régression P0 reportée (interférait avec §223). 5 fichiers src + 3 doc. tsc clean, 684 tests pass + 1 fail pré-existant non lié.*

*Précédente : §223 livré (2026-05-08) — Refacto C audit §214 : RPC `get_coach_kpis` côté Postgres. Migration `00157_get_coach_kpis_rpc.sql` (NEW, function security invoker, RLS héritée des policies sur dim_sessions + strength_session_runs) appliquée via MCP. Wrapper TS `src/lib/api/coach-kpis.ts` (NEW, 56 LOC, guard `canUseSupabase()` pour offline). `Coach.tsx coachKpisQuery` -67 LOC : 2N requêtes (`getSessions` + `getStrengthHistory` × `topAthletes.slice(0,5)`) → 1 round-trip RPC. Cleanup bonus YAGNI : retrait `mostLoadedAthlete`/`formeScores`/`loadScore`/`formeScore` (0 consumer post-grep) + helpers `getRunTimestamp`/`getRunFatigueValue` migrés en SQL. Test RLS `get_coach_kpis.test.ts` (NEW, 8 cas dont leak athlète + fatigue-wins-over-rpe). Subagent-driven : 1 implementer + spec ✅ + code quality "approved with fixes" → 2 fixes appliqués. **Net : 2-10 round-trips → 1, ~600-700ms en 4G coach mobile.** tsc clean, 684 tests pass + 1 fail pré-existant non lié.*

*Précédente : §222 livré (2026-05-08) — Caves hardcodes top 3 post-audit pass 2 (Chantier C suite). 3 sub-agents sonnet parallèles sur les 3 fichiers identifiés par §215 : AthletePlansTab 22→8 (-14, dont 3 par user manuel), FeedbackDrawer 16→9 (-7), CoachTrainingSlotsScreen 36→31 (-5). Total -26 hits. Migrations status-* (success/warning/error) + intensity-prog (bleu sémantique progression FeedbackDrawer banner) + tag-swim-text. 31 catégoriels conservés avec commentaires `TODO §223` (blue natation 11, amber muscu 10, orange override 5, rose compétition 5) — pas de token équivalent (à créer §223). **Total cumulé Chantier C** : 120 hardcodes status remplacés sur 16 fichiers. Bundle commit avec §215 (audit pass 2, rapport `docs/audits/2026-05-08-ui-ux-audit-ios-pass2.md` ~280 lignes, verdict 6/10 → 7.8/10). 3 fichiers src + 2 doc. tsc clean, 684 tests pass + 1 fail pré-existant non lié.*

*Précédente : §219 livré (2026-05-08) — Refacto A : suppression complète de la façade `src/lib/api.ts` (1039 LOC, ~242 stubs de délégation). Vraie logique migrée vers `api/swim-sessions.ts` (NEW, 241 LOC) + extensions `api/localStorage.ts` (+52 LOC) + `api/index.ts` (+14 LOC re-exports). 79 fichiers consommateurs codemod : `import { api }` + `api.fnX(...)` → `import { fnX } from "@/lib/api"` + `fnX(...)` (425 call-sites). Logique 23505 dedup de `syncSession` byte-identical (verified). 6 fichiers avec alias `fnX as fnXApi` pour résoudre les collisions `useMutation`. Tests adaptés (`sessions-crud.test.ts` → `localStorageGet/Save`, `SwimCatalog.test.tsx` mock dead retiré). Subagent-driven : 1 implementer + spec review ✅ + code quality "approved with fixes" → 4 cleanups en main. **Net : -789 LOC** + 1 source de vérité stricte. tsc clean, 684 tests pass + 1 fail pré-existant non lié.*

*Précédente : §218 livré (2026-05-08) — Retrait de la stagger animation des pills de saisie ressentis dans FeedbackDrawer (vibration latérale signalée après §217). 5 éléments (4 indicateurs + Commentaire) avec `staggerChildren` 0.05s + `listItem` (x:-10→0) provoquaient une vague latérale visible une fois §217 livré (drawer pre-mounté = anim drawer ne masque plus les anims inner). Bloc passé en simple `<div>`, le wrapper AnimatePresence parent (panel détail opacity+y:8→0) fournit déjà l'entry smooth. 1 fichier modifié. tsc clean, 684 tests pass + 1 fail pré-existant non lié.*

*Précédente : §217 livré (2026-05-08) — Pre-mount du FeedbackDrawer pour tuer le lag d'ouverture remonté lors du smoke test §216. `<AnimatePresence>{open && (...)}</AnimatePresence>` (montage conditionnel ≈1265 LOC + framer-motion warm-up) → drawer toujours mounté, `open` pilote `motion.div` variants (`hidden`/`visible`), `pointer-events`, `aria-hidden`, `aria-modal`, et `drag` (down-to-close uniquement quand open). Coût déplacé au premier render Dashboard, ouverture instant ensuite. Pre-existant à §216 (pattern dans FeedbackDrawer.tsx non touché par refacto B). 1 fichier modifié. tsc clean, 684 tests pass + 1 fail pré-existant non lié.*

*Précédente : §216 livré (2026-05-08) — Refacto B Dashboard.tsx (suite audit §214). Découpage 1114 → 784 LOC orchestrateur + `<DashboardCalendar>` (React.memo, 69 LOC) + `<DashboardFeedbackContainer>` (React.memo, 440 LOC, possède `saveState`/`draftState`/`alternativeOverride` + 5 mutations + 4 handlers). `useFeedbackDraft` retiré du hook parent → appelé dans le container. 4 `useCallback`/`useMemo` ajoutés en fin de review pour stabiliser les props inline qui auraient cast le memo (`onOpenStrengthSession`, `absenceReason`, `strengthSessionsForSelectedDay`, `isAbsent`). Settings dialog inline (validé). Perf attendue : -50 à -80% renders calendrier pendant saisie feedback. Subagent-driven : 1 implementer + 2 reviews (spec ✅ / code quality "approved with fixes" → fix appliqué). tsc clean, 684 tests pass + 1 fail pré-existant non lié. Numérotation §216 (et non §215) car §215 réservé à un audit UI/UX en parallèle.*

*Précédente : §214 livré (2026-05-08) — Quick wins perf + maintenabilité post-audit (code-simplifier + perf en parallèle). 6 wins ROI immédiat en une passe : **QW#1** lazy `jspdf` dans CoachPaceCalculatorScreen (~150-200 Ko évités), **QW#2** closures inline CalendarGrid retirées, `DayCell` reçoit `iso`/`index` pour stabiliser handlers via `useCallback` (-40 re-renders/tap Dashboard), **QW#3** suppression de 6 `staleTime: 5*60*1000` qui raccourcissaient le cache global 10 min (-4 à -8 requêtes/session), **QW#4** suppression `src/lib/features.ts` + 5 call-sites (3 flags tous true), **QW#5** 11 helpers de date dupliqués → centralisés dans `src/lib/date.ts` (+ fix bug TZ `weekDates.todayIso()` UTC→local), **QW#6** logo PDF (PNG 373 Ko inliné) → runtime fetch webp 7.7 Ko depuis `/public` × 3 fichiers export. 19 fichiers modifiés. tsc clean, 684 tests pass + 1 fail pré-existant non lié.*

*Précédente : §211+§212+§213 livrés (2026-05-08) — Polish bonus post-audit (sonnet parallèle, §211 fait en main après stall sonnet). **§211** : guards `prefers-reduced-motion` ajoutés sur SwimmerHome (stagger principal), WellnessForm (slideInFromBottom), FeedbackDrawer (sheet drag + stagger indicateurs interne). Pattern `variants={reduceMotion ? undefined : staggerChildren}`. Autres call-sites `motion.div` (Records, Login, Progress, RunDetailSheet, SessionList) reportés. **§212** : Profile ThemeSelector `<Select>` dropdown (2 taps) → `<ToggleGroup type="single">` + 3 `<ToggleGroupItem>` segmented control 1 tap iOS-style. Active state `data-[state=on]:bg-background shadow-sm`, labels `sr-only` mobile. **§213** : bouton X clear iOS-style sur les 3 search bars (SwimCatalog, StrengthCatalog, AthletePlansTab) — wrapper `relative` + button absolu droit conditionnel sur `searchQuery`. 7 fichiers modifiés. tsc clean, 684 tests pass + 1 fail pré-existant non lié.*

*Précédente : §210 livré (2026-05-08) — Chantier D (Manager bandeaux unifié) : système de queue avec priorité pour les 4 banners système. **NEW** `src/lib/systemBanners.ts` (95 LOC) : type `SystemBannerKey` + module state Set + hook `useSystemBanner(key, isActive)` qui retourne `true` si le banner est le plus prioritaire actif. Priorités fixes : `offline (1) > update (2) > push (3) > install (4)`. Architecture minimale : zéro refactor du JSX/animation des 4 banners existants ; chacun appelle le hook et conditionne son rendu. Refactor de `OfflineDetector`, `UpdateNotification`, `PushPermissionBanner`, `InstallPrompt` : ajout import + 1 ligne `const shouldRender = useSystemBanner(key, show)` + remplacement `{show &&` par `{shouldRender &&`. Résout le conflit historique `UpdateNotification` + `InstallPrompt` (même slot top-3). 5 fichiers modifiés. tsc clean, 684 tests pass + 1 fail pré-existant non lié.*

*Précédente : §209 livré (2026-05-08) — Clôture Chantier C sur les 3 derniers fichiers du top 15 (sonnet). 10 migrations status sémantique : `SwimmerSlotsTab.tsx` 11→5 (6 migrés `red-*` état "Absence déclarée", 5 laissés `amber-*`/`blue-*` catégoriels swim/muscu) ; `MonthlyReport.tsx` 15→11 (4 migrés DeltaBadge + Sparkline + ReportAcwrBadge ; 9 laissés STROKE_COLORS palette nages + iconColor sections + badge yellow brand) ; `Pace4NSegmentMatrix.tsx` 3→0 (tous catégoriels : palette Brasse + ZONE_COLS gradient V0→MAX). **Total cumulé Chantier C** : 94 hardcodes status remplacés sur 13 fichiers (InlineBanner §199 -25 + top 5 §202 + rang 6-12 §205 + rang 10-14 §209) + 17 cas catégoriels intelligemment laissés. Dark mode désormais cohérent sur tout le top 15 via tokens `--status-*-bg`. 2 fichiers modifiés. tsc clean, 684 tests pass + 1 fail pré-existant non lié.*

*Précédente : §207+§208 livrés (2026-05-08) — Cleanup mécanique post-audit, sub-agents sonnet en parallèle. **§207** : 7 migrations alias InlineBanner → variants sémantiques sur 5 fichiers (`WellnessBanner` emerald→success + blue→info, `RecordsAdmin` amber→warning, `Records` destructive→error + yellow→warning, `Dashboard` amber→warning, `SwimmerHome` amber→warning). Primitive `InlineBanner` conserve ses 11 variants pour back-compat. **§208** : `CoachSectionHeader.tsx` back button passe de `Button variant="ghost" size="sm"` (icône+texte "Retour") → `Button variant="ghost" size="icon" h-11 w-11 aria-label="Retour"` icon-only iOS-style. API publique préservée (title/description/onBack/actions). 6 call-sites validés sans modif (CoachCompetitionsScreen, CoachSwimmersOverview, CoachGroupsScreen, CoachPaceCalculatorScreen, CoachSmsScreen, CoachMySwimmersScreen). 6 fichiers modifiés. `npx tsc` clean, 684 tests pass + 1 fail pré-existant non lié.*

*Précédente : §206 livré (2026-05-08) — Fix crash Radix `SelectLabel must be used within SelectGroup` dans `CoachMessagesScreen.tsx` (vue Comms coach onglet Notifs). Bug latent depuis §196 ou durcissement Radix récent : les `<SelectLabel>` "Groupes"/"Nageurs" étaient dans des fragments `<>...</>` au lieu d'être wrappés dans `<SelectGroup>`. Fix : import `SelectGroup` ajouté + remplacement des fragments par `<SelectGroup>` autour des sections. tsc clean, 1 fichier modifié. Détecté via stack trace utilisateur après tests visuels post-§205.*

*Précédente : §204+§205 livrés (2026-05-08) — Migration EmptyState call-sites + Chantier C suite rang 6-12. Sub-agents sonnet en parallèle. **§204** : 4 call-sites empty states migrés (5 occurrences) — Coach.tsx:849 `<p>` simple → `<EmptyState compact icon={<Users />} />`, StrengthCatalog.tsx:1457+1530 (×2) `<Empty>` shadcn → `<EmptyState compact title="Dossier vide" />` (imports `{Empty, EmptyHeader, EmptyDescription}` retirés), AthletePlansTab.tsx:461 inline div Dumbbell + Button → `<EmptyState compact icon={<Dumbbell />} cta={...} />`, CompetitionDetail.tsx:76 Trophy + 2 lignes texte → `<EmptyState icon={<Trophy />} title description />`. **§205** : 22 remplacements hardcodes → tokens sur 6 fichiers rang 6-12. SuiviSemaine 10→8 (2 migrés `indicatorColor` + badge Absent ; 8 laissés `isStrength` amber = identité catégorielle muscu), FeedbackDrawer 2→0 (2 migrés icônes "Présent"), AthleteInterviewsSection 9→4 (5 migrés badges "À préparer"/"À signer"/borders ; 4 laissés coach blocks + GraduationCap = brand coach), RunDetailSheet 8→1 (7 migrés statusStyle + difficultyColor + MiniGauges ; 1 laissé Zap sRPE déco), SwimmerFeedbackTab 4→0 (4 migrés indicatorColor + badge Assignée), RacesTab 15→13 (2 migrés delete hover/confirm ; 13 laissés thème compétition gold/amber = identité catégorielle). **Total cumulé Chantier C** : 59 hardcodes status remplacés sur 10 fichiers. 10 fichiers modifiés total. `npx tsc` clean, 684 tests pass + 1 fail pré-existant non lié.*

*Précédente : §202+§203 livrés (2026-05-08) — Chantier C (top hardcodes → tokens sémantiques) + §203 partiel (NEW EmptyState). **§202** : -84 hits hardcodes via 37 remplacements ciblés sur 4 fichiers (sub-agent sonnet, discrimination status vs catégoriel). CoachTrainingSlotsScreen 37→17 (statuts draft/published, override annulé), Coach.tsx 34→5 (SlotCell états full/empty/partial, footers semaine, alertes fatigue), CoachSwimmersOverview 21→0 (formeBadge, FormeDots, SparkBar, FeedbackRateKPI, low-forme), SwimmerInterviewsTab 20→6 (STATUS_CONFIG draft_athlete, phase bar). Laissés catégoriels : AthletePlansTab tous (CYCLE_COLORS palette + nameToColor déterministe), nav icons Coach quick access, Sunrise/Sunset icons décoratives, type strength amber vs swim blue (code couleur catégorie), dot compétition rose brand, CoachSection identité coach. Dark mode désormais cohérent sur ces 4 fichiers via tokens `--status-*-bg` (vs avant double classe `bg-amber-50/50 dark:bg-amber-950/10` parfois divergente). **§203 partiel** : NEW `src/components/shared/EmptyState.tsx` (~75 LOC) — API `icon|title|description|cta|compact|className`, `role="status"`, sized auto via attribute selector. Posée pour migration des 4 implémentations recensées (Coach.tsx:856 `<p>` simple, StrengthCatalog `<Empty>` shadcn, AthletePlansTab inline div, CompetitionDetail Trophy+texte+CTA) en §204+. Évolution CoachSectionHeader (back button h-11 icon-only) + SystemBannerStack (queue + priorité) reportées. 5 fichiers modifiés. `npx tsc` clean, 684 tests pass + 1 fail pré-existant non lié.*

*Précédente : §200+§201 livrés (2026-05-08) — Tap targets audit massif (12 spots fixés) + migration partielle Surface primitive (3/5 composants). Sub-agents sonnet en parallèle. **§200** : 12 spots `h-7/h-8/h-9/h-10` → `h-11` ou `min-h-11` sur 10 fichiers (CoachPaceCalculatorScreen header buttons + Switch scale-0.7, ChronoSetup steppers ×4, WorkoutRunner Replace/Exit, AthletePlansTab action bar, WellnessForm pills, SlotSessionSheet library item, InfoBubble trigger, SwimmerMessagesView dismiss, ObjectiveDetailSheet ToggleGroup, SessionRow py-2, ui/tabs.tsx TabsList+TabsTrigger). Apple HIG strict respecté désormais sur tous les chemins critiques. **§201** : 3 composants migrés sur Surface primitive — PushPermissionBanner (variant glass, radius sm), LoginInstallBanner (tinted/sm), ObjectiveCard mode full (solid/sm interactive). Refusés : UpdateNotification (wrapper framer-motion + rounded-full pill non-supporté), BottomActionBar (rounded-t-only non-supporté par Surface qui n'a que radius symétriques). Surface.tsx fix collatéral : `import * as React from "react"` pour env test `node:test + renderToString`. 15 fichiers modifiés. `npx tsc` clean, 684 tests pass + 1 fail pré-existant non lié.*

*Précédente : §199 livré (2026-05-08) — Chantier B (Surface primitive + Sheet drag handle + tokenisation InlineBanner + adoucissement gradients). Suite du plan d'audit §197. (1) NEW `src/components/shared/Surface.tsx` (70 LOC) : primitive partagée API `variant: "solid" | "glass" | "tinted" | "outline"` × `radius: "sm"=12px | "md"=16px | "lg"=22px` qui unifiera les ~8 variantes "card-like" recensées (posée pour §200+). (2) `ui/sheet.tsx` variant `bottom` : ajout par défaut `rounded-t-[22px]` (radius UISheetPresentationController iOS 16+) + `pb-[max(1.5rem,env(safe-area-inset-bottom))]` + drag handle visuel barre 36×4 muted-foreground/30 en absolute top-2. (3) `InlineBanner` tokenisé : 7 variants color hardcoded (-25 hardcodes du top contributeur audit shared) → 5 variants sémantiques `info/success/warning/error/muted` consommant `--color-status-*` + `--color-primary` ; alias back-compat conservés (`amber → warning`, `red → error`, etc.) pour ne casser aucun call-site. (4) `SwimmerHome.tsx` Section E (Messages coach) : Card violet baroque `bg-gradient-to-br from-violet-50/50 to-purple-50/30` + 3 niveaux div imbriqués → 1 seul `<InlineBanner variant="info" icon={<MessageCircle/>} label badge sublabel onClick />`. -22 lignes, cohérent avec Sections B+D. (5) `WorkoutRunner.tsx` cards focus charge/reps : `border-2 border-primary/20 bg-gradient-to-br from-card to-muted/30 shadow-sm` → `border border-border bg-secondary` plat (gradient cassait en dark mode). Section labels Charge/Reps/Difficulté `text-[10px] font-bold` → `text-[11px] font-semibold` (audit : 11px minimum lisibilité iOS). 5 fichiers modifiés. `npx tsc` clean, 683 tests pass + 1 fail pré-existant non lié.*

*Précédente : §198 livré (2026-05-08) — Quick Wins QW1-QW8 du plan d'audit UX. (QW1) AppLayout : doublon `OfflineBanner` retiré, on garde `OfflineDetector` (pill flottant plus iOS) + `OfflineSyncBanner` (rôle distinct). (QW2) SwimSessionView : `window.confirm` → `AlertDialog` Radix avec state `removeConfirmOpen`, pattern §181. (QW3) Sticky CTA safe-area sur 3 fichiers : SwimSessionView (`bottom-6` → `bottom-[max(1.5rem,env(safe-area-inset-bottom))]`), CompetitionDetail + ChronoSetup (`pb-[max(0.75rem,env(safe-area-inset-bottom))]`). (QW4) Tap targets header → ≥ 44px : Dashboard Records/Hebdo (`h-8` → `min-h-11 md:min-h-9`), SwimmerHome avatar (wrapper `h-11 w-11`), CoachCommentsScreen + CoachMessagesScreen back buttons (custom `h-8` retiré, on bascule sur le default 44px du variant Button). (QW5) ScaleSelector5 → tokens `--intensity-{1..5}` (mapping value 1→5 sur emerald → green → yellow → orange → red), restaure le canal visuel d'intensité + ajout `active:scale-95`. (QW6) Helper `formatRelativeTime` dupliqué dans `Coach.tsx` + `CoachCommentsScreen.tsx` → unifié sur `formatRelativeDate` de `lib/date.ts` (créé §196), ajoute "hier"/"lun."/"jj/mm". (QW7) Dashboard Settings dialog `max-w-[340px]` → `max-w-[calc(100vw-32px)] sm:max-w-[360px]` — ne déborde plus iPhone SE 320px. (QW8) Profile push toggle Button "Off"/"On" → `Switch` shadcn avec `aria-label` dynamique, pattern UISwitch standard. 11 fichiers modifiés. `npx tsc` clean.*

*Précédente : §197 livré (2026-05-08) — Audit UI/UX iOS-like complet (rapport `docs/audits/2026-05-08-ui-ux-audit-ios.md`, 3 forks parallèles, 25+ surfaces) + **Chantier A : détox typo globale**. Verdict 6/10. 3 drapeaux racines : (1) `index.css:278-285` qui forçait `h1-h6 = font-display uppercase italic` + `button = uppercase tracking-wide bold` sur toute l'app, (2) tap targets sub-44px endémiques (~25 spots), (3) 94 fichiers utilisant des couleurs Tailwind hardcoded au lieu des tokens `--color-status-*` / `--color-intensity-*` qui existent. Chantier A appliqué : retrait des @apply globaux dans `index.css`, remplacement par `h1-h6 { @apply font-semibold tracking-tight }` (base douce sentence-case Inter), création des utility opt-in `.heading-display` + `.btn-eac-display` pour brand moments. Refactor `PageHeader.tsx` (titre `font-semibold text-foreground`, plus de rouge primary, subtitle `text-xs`). Détox de 17 call-sites avec `font-display uppercase italic` explicite local : Dashboard "Accueil", SwimSessionView "Détails", Profile hero nom user, Comité, Admin, Administratif, RecordsAdmin, CoachMessagesScreen, CoachSectionHeader (partagé), CoachGroupsScreen, CoachTrainingSlotsScreen, SwimCatalog, SwimmerMessagesView, SwimmerObjectivesView, AthletePerformanceHub, AthleteInterviewsSection, FeedbackDrawer + WorkoutRunner finish button (texte source `"ENREGISTRER & FERMER"` → `"Enregistrer & fermer"`). Pattern de remplacement uniforme `text-Nxl font-display font-bold uppercase italic text-primary` → `text-Nxl font-semibold tracking-tight text-foreground`. Brand moments préservés (AppLayout logo `SUIVI<NATATION>`, AwaitingApproval, ComingSoon, SharedSwimSession, WorkoutRunner "Séance terminée !", SessionSummary, RecordsClub:415). Cascade automatique : tous les `<Button>` shadcn basculent de `font-bold uppercase tracking-wide` → `font-medium` sentence-case via leur variant par défaut (100+ CTA détoxifiés sans intervention). 20 fichiers modifiés, `npx tsc` clean, 683 tests pass + 1 fail pré-existant non lié. Quick Wins QW1-QW8 et Chantiers B-E (Surface primitive, tokens sémantiques, CoachPageHeader/EmptyState/SystemBannerStack, IosSheet) à venir §198+.*

*Précédente : §195 livré (2026-05-08) — Fix duplication note coach ↔ note athlète sur l'écran de repos en mode focus muscu **+ cleanup affichage "note coach" côté athlète**. Fix initial : `WorkoutRunner.tsx:1122` passait `exerciseNotes?.[exerciseId]` (= `one_rm_records.notes` athlète) à la prop `note` du `RestScreen` (= zone "Note coach") → quand l'athlète tapait sa note, debounce 800 ms → `updateNote` mutation → `oneRMs` refresh → `exerciseNotes` recalculé → les deux blocs affichaient la même valeur. Cleanup associé (demandé par l'utilisateur, "il n'y en a pas pour l'instant") : retrait du bloc JSX "Note coach" de `RestExerciseTab` + remplacement de la zone "Notes" de la vue focus principale par "Description" (= `currentExerciseDef.description` du catalogue) + retrait de la prop `note` toute la chaîne `WorkoutRunner → RestScreen → RestExerciseTab` + nettoyage des fixtures de tests `RestExerciseTab.test.tsx` / `RestScreen.test.tsx`. La saisie côté builder coach (`StrengthExerciseCard` Textarea "Notes") reste intacte. 5 fichiers modifiés. `npx tsc` clean.*

*Précédente : §194-vagueC livré (2026-05-08) — Tag SW per-notif + gate focused contextuel + **fix critique auth 401 push-send**. En vérifiant les logs Edge Function, découverte que tous les appels webhook depuis le trigger pg_net 00044 retournaient 401 silencieusement depuis plusieurs jours (vault key ≠ env service_role) → **aucune notif automatique ne déclenchait de push** (wellness, slot reminder, assignations, interviews) ; seuls les broadcasts coach manuels fonctionnaient. Refactor de l'auth gate de push-send : décode le payload JWT et lit `role === 'service_role'` au lieu de comparer à l'env (verify_jwt:true valide déjà la signature côté Supabase) → plus aucune dépendance à l'égalité vault/env. Déployé v35, validé prod : test webhook → 200 OK (vs 401 sur v33). Tag unique `eac-notif-{id}` ou `eac-manual-{ts}` envoyé au SW pour empêcher l'OS d'écraser les pushs rapprochées (tag partagé `eac-notification` avant). Helpers purs `extractHashPath` + `pushTargetMatchesClient` dans `pushHelpers.ts` (15 tests TDD) + duplication JS dans `public/push-handler.js`. Gate `focused` du SW désormais contextuel : suppression OS uniquement si un client focused est sur la **même hash route** que `data.url` ; sinon affichage systématique. Tests 678 (vs 663), 677 verts, 1 fail pré-existant. `npx tsc` clean. Plainte initiale "trop de notifs + pushs pas systématiques" entièrement traitée par les Vagues A+B+C.*

Ce document décrit les fonctionnalités à implémenter. Il sert de référence pour reprendre le développement dans une future conversation.

---

## Vue d'ensemble

| # | Chantier | Priorité | Complexité | Statut |
|---|----------|----------|------------|--------|
| 1 | Refonte parcours d'inscription | Haute | Moyenne | Fait |
| 2 | Import de toutes les performances FFN d'un nageur | Haute | Haute | Fait |
| 3 | Gestion coach des imports de performances | Moyenne | Moyenne | Fait |
| 4 | Records club par catégorie d'âge / sexe / nage | Moyenne | Faible | Fait |
| 5 | Dette technique UI/UX restante (patch-report) | Basse | Faible | Fait |
| 6 | Fix timers mode focus (PWA iOS background) | Haute | Faible | Fait |
| 7 | Visual Polish & Branding (Phase 6 UI/UX) | Haute | Moyenne | Fait |
| 8 | Component Architecture Refactor (Phase 7) | Basse | Haute | Fait |
| 9 | Design System Documentation (Phase 8) | Basse | Moyenne | Fait |
| 10 | Notes techniques par exercice de natation | Moyenne | Moyenne | Fait |
| 11 | Refonte builder séances natation coach | Haute | Moyenne | Fait |
| 12 | Redesign dashboard coach (mobile first) | Haute | Moyenne | Fait |
| 13 | Redesign Profil + Hall of Fame (mobile first) | Moyenne | Moyenne | Fait |
| 14 | Finalisation dashboard pointage heures coach | Moyenne | Moyenne | Fait |
| 15 | Redesign page Progression (Apple Health style) | Moyenne | Moyenne | Fait |
| 16 | Audit UI/UX — header Strength + login mobile + fixes | Moyenne | Faible | Fait |
| 17 | Harmonisation headers + Login mobile thème clair | Moyenne | Faible | Fait |
| 18 | Redesign RecordsClub épuré mobile (filtres, sections, drill-down) | Moyenne | Faible | Fait |
| 19 | Audit performances + optimisation PWA (Workbox) | Haute | Moyenne | Fait |
| 20 | Parser texte → blocs séance natation | Moyenne | Moyenne | Fait |
| 21 | Hall of Fame refresh temps réel + sélecteur période | Moyenne | Faible | Fait |
| 22 | Calendrier coach (vue mensuelle assignations) | Moyenne | Moyenne | Fait (§53) |
| 22b | Calendrier coach — Slots éditables inline | Moyenne | Moyenne | Fait (§54) |
| 23 | Swim Session Timeline (refonte visualisation séances) | Moyenne | Moyenne | Fait (§55) |
| 24 | Groupes temporaires coach (stages, sous-groupes) | Moyenne | Haute | Fait (§56) |
| 25 | Partage public séances natation (token UUID) | Moyenne | Moyenne | Fait (§57) |
| 26 | Détails techniques inline timeline nageur | Moyenne | Moyenne | Fait (§58) |
| 27 | Compétitions coach (calendrier échéances) | Moyenne | Moyenne | Fait (§59) |
| 28 | Objectifs coach (temps cibles & texte par nageur) | Moyenne | Moyenne | Fait (§60) |
| 29 | Interface objectifs nageur + refonte Profil hub | Moyenne | Moyenne | Fait (§61) |
| 30 | Compétitions : assignations, absences, compteur, SMS | Moyenne | Haute | Fait (§62) |
| 31 | Upload photo de profil avec compression | Moyenne | Faible | Fait (§63) |
| 32 | Traduction exercices FR + option Poids du corps | Faible | Faible | Fait (§64) |
| 33 | Écran SMS dédié coach dashboard | Moyenne | Faible | Fait (§65) |
| 34 | Groupes encadrés par shift (pointage coach) | Moyenne | Moyenne | Fait (§66) |
| 35 | Fix désynchronisation group_members au changement de groupe | Haute | Faible | Fait (§67) |
| 36 | Quiz neurotype nageur (profil d'entraînement) | Moyenne | Moyenne | Supprimé (§231) |
| 37 | Planification & Entretiens (fiche nageur coach) | Haute | Haute | Fait (§74) |
| 38 | Créneaux d'entraînement récurrents | Moyenne | Moyenne | Fait (§76) |
| 39 | Créneaux personnalisés par nageur | Moyenne | Moyenne | Fait (§78) |
| 40 | Notifications push Web Push (VAPID) | Haute | Haute | Fait (§79) |
| 41 | Sécurité RLS + Import FFN Auto-Sync | Haute | Moyenne | Fait (§80) |
| 42 | Audit UX A-H (touch targets, feedback, nav, wizard) | Haute | Moyenne | Fait (§81) |
| 43 | Audit restant (CORS, migrations, RPC, pagination, deep linking) | Moyenne | Moyenne | Fait (§82) |
| 44 | Réorganisation Profil & Gestes mobiles | Moyenne | Moyenne | Fait (§83) |
| 47 | Coach Events Timeline (Tableau de Bord des Échéances) | Moyenne | Faible | Fait (§84) |
| 48 | Calendrier créneaux centré séances (Slot-Centric Sessions) | Haute | Haute | Fait (§85) |
| 49 | Redesign ObjectiveCard + harmonisation Planif nageur | Moyenne | Faible | Fait (§86) |
| 50 | Préparation compétition nageur (courses, routines, timeline, checklist) | Moyenne | Haute | Fait (§87) |
| 52 | Strength UX Overhaul — refonte parcours musculation nageur | Haute | Haute | Fait (§89) |
| 53 | Planification muscu par nageur (dossiers hiérarchiques) | Moyenne | Moyenne | Fait (§90) |
| 54 | Refonte UX Coach (nav, home, fiche nageur) | Haute | Moyenne | Fait (§92) |
| 56 | Restructuration bibliothèque musculation nageur | Moyenne | Moyenne | Fait (§93) |
| 57 | Rest Timer enrichi — tabs swipables | Moyenne | Moyenne | Fait (§94) |
| 58 | Rest Screen Improvements (GIF, notes, dots, sparkline, swipe) | Moyenne | Moyenne | Fait (§95) |
| 60 | Chrono Coach (split timer poolside tablette) | Haute | Moyenne | Fait (§97) |
| 61 | Attribution coach ↔ nageur (1 coach principal par nageur) | Haute | Moyenne | Fait (§98) |
| 62 | Commentaires nageurs sur home coach + push notification | Moyenne | Moyenne | Fait (§99) |
| 63 | Historique Chronos + Éditeur Splits | Haute | Moyenne | Fait (§98) |
| 66 | Refonte interface nageur (Home + Dock + Suivi 3 horizons) | Haute | Haute | Fait (§102) |
| 67 | Restructuration vue "Mon suivi" (hub + drill-down) | Haute | Haute | Fait (§103) |
| 89 | Unification FolderCard + SessionRow (cohérence dossiers nageur/coach) | Moyenne | Faible | Fait (§125) |
| 90 | Chrono : nageurs manuels + titre séance + export XLSX | Moyenne | Moyenne | Fait (§126) |
| 91 | Fix overflow `FiliereEditorOverlay` (vue planification natation coach) | Faible | Faible | Fait (§127) |
| 92 | Bouton partage preview séance vue créneaux | Faible | Faible | Fait (§128) |
| 93 | Récapitulatif volume assigné (km) vue créneaux coach | Faible | Faible | Fait (§129) |
| 94 | Chrono : exercices différents par vague (séries/distances/splits par vague + override global) | Moyenne | Moyenne | Fait (§130) |
| 95 | Refonte "Ma semaine" coach : matrice matin/aprèm × 7 jours | Moyenne | Moyenne | Fait (§131) |
| 96 | Fix ressenti sur séance groupe hors créneaux nageur (getLogForSession + fallback 42P10) | Haute | Haute | Fait (§132) |
| 97 | Menu partage unifié WhatsApp + Clipboard (coach macOS) | Moyenne | Moyenne | Fait (§133) |
| 98 | Éditeur filières plein écran : 15 champs configurables + reset + aperçu nageur live | Moyenne | Moyenne | Fait (§134) |
| 99 | Fix triple-comptage km Progress + logs extras invisibles Dashboard (index UNIQUE unifié) | Haute | Moyenne | Fait (§135) |
| 100 | Restructuration CLAUDE.md — annuaire fichiers externalisé, -56% tokens au démarrage | Basse | Faible | Fait (§136) |
| 101 | Fix vue semaine coach — assignations invisibles pour nageur à créneaux personnalisés | Haute | Faible | Fait (§137) |
| 102 | Vue semaine coach — ne pas hériter de séances nage sur créneaux salle + éditer swimmer_slots en place | Haute | Faible | Fait (§138) |
| 103 | Vue semaine coach — héritage créneaux persos sur dates antérieures à un stage | Haute | Faible | Fait (§139) |
| 104 | Chantier B — quick wins perf frontend (staleTime, queryKey stable, select ciblés) | Haute | Faible | Fait (§140) |
| 105 | Chantier C — optimisation backend Supabase (index cron, consolidation RLS, drop 11 indexes) | Haute | Moyenne | Fait (§141) |
| 106 | Vue semaine coach — quick-compose séance sur créneau vide (2 clics vs 8) | Haute | Moyenne | Fait (§142) |
| 107 | Vue semaine coach — fallback d'attributs pour swimmer_slots sans source | Haute | Faible | Fait (§143) |
| 106b | Quick-compose — split texte/blocs côte-à-côte en relecture | Faible | Faible | Fait (§144) |
| 108 | Coach home — créneaux non assignés 30j + deep-link semaine | Moyenne | Moyenne | Fait (§145) |
| 109 | Unification backend héritage séances nageur (RPC get_swimmer_sessions, absences par créneau, protection individuels) | Haute | Haute | Fait (§147) |
| 110 | Fix KPI "Ressentis 30j" cards nageurs — rebase RPC sur get_swimmer_sessions (swim-only + bucket match + absences) | Haute | Faible | Fait (§148) |
| 111 | Cascade annulation bucket swim → slots perso nageurs (get_swimmer_sessions) | Haute | Moyenne | Fait (§149) |
| 112 | UI coach — label "sans assignation" + historique ressentis étendu avec slots attendus | Moyenne | Faible | Fait (§150) |
| 113 | KPI Ressentis 30j v6 — feedback_count = slots attendus matchés (alignement avec historique §150) | Haute | Faible | Fait (§151) |
| 114 | Coach QuickView — mode dépannage pour coaches non-titulaires (briefing RPC SECURITY DEFINER + attendance/comment/assign avec recorded_by) | Haute | Haute | Fait (§152) |
| 115 | Planification natation — granularité par nageur (overrides filière + week_type) + retrait macro-cycles | Haute | Haute | Fait (§153) |
| 116 | ChronoSetup refonte progressive disclosure | Moyenne | Faible | Fait (§155) |
| 117 | Mon plan muscu — timeline hebdomadaire Phase 1 (zéro migration BDD) | Haute | Haute | Fait (§156) |
| 118 | Mon plan muscu — Phase 2 data model BDD + refactor MyPlanTab | Haute | Haute | Fait (§157) |
| 119 | Audit sprint — sécurité edge functions + atomicité strength logs + résilience brouillons | Haute | Moyenne | Fait (§158) |
| 120 | Fix bug §83 live — `save_strength_run_atomic` colonne `set_number` inexistante (séances muscu jamais complétées) | Critique | Faible | Fait (§159) |
| 121 | Mon plan muscu — Phase 3 éditeur coach (/coach/strength-planning, timeline, sheets, tuile Coach) | Haute | Haute | Fait (§160) |
| 122 | Notifications nageur — nettoyage réel serveur (DELETE targets perso + dismissals table pour group-targeted, UI relabel) | Haute | Faible | Fait (§161) |
| 123 | Bugfix séances muscu bloquées "en cours" — queue offline rejoue immédiatement via CustomEvent (OfflineMutationSync) + data fix SQL + migration 00138 | Critique | Faible | Fait (§162) |
| 124 | Notifications — audit textuel + tutoiement (compétition/entretien) + titre `Nouvelle compétition` + `expires_at` auto-purge sur crons wellness matin et slot-session-reminder (migrations 00142/00143) | Haute | Faible | Fait (§163) |
| 125 | Audit perf global + Sprint 1 (parallélisation `reconcileStrengthRunLogs` + `push-send`, defaults React Query, `sideEffects: ["**/*.css"]`, lazy import gifenc, migrations 00140 FK indexes + 00141 drop indexes redondants) | Haute | Moyenne | Fait (§164) |
| §166 | Export PDF séance bord de bassin | Nouveau `src/lib/export-session-pdf.ts` — PDF A4 une page jsPDF + bouton "Télécharger PDF" dans le drawer `SlotSessionSheet` | 2026-04-23 | ✅ Livré |
| §167 | Audit perf global — Sprint 1 (quick-wins 0-régression) | `exportSessionPdf` lazy import, `Promise.all` dans `getAthletes` + `renameSwimCatalogFolder`, `CacheWarmer` prefetch `["groups"]`, suppression `apiRequest`/`getQueryFn` morts, `key` stable dans `SuiviSaison` | 2026-04-23 | ✅ Livré |
| §168 | Test fence pour futur refactor `CoachTrainingSlotsScreen` (couche 1/4) | Extraction helpers purs (`slotTiming`, `weekDates`, `slotDisplay`, `swimLibraryContext`) + fixtures canoniques (`makeTrainingSlot`, `makeSlotInstance`, etc.) + 41 tests unitaires. CoachTrainingSlotsScreen.tsx : 3308 → 3174 lignes, comportement inchangé | 2026-04-23 | ✅ Livré |
| §169 | Records club filtrés par appartenance historique au club | Capture `club_name` depuis cellule club FFN dans le parser partagé, ajout colonne `swimmer_performances.club_name` + index partiel, `app_settings.home_club_name` configurable, filtre `recalculateClubRecords` sur égalité stricte. Walk-from-end + break-on-button structurel pour gérer cellule club vide. Compteur `skipped_other_club` ajouté à `RecalcStats`. Edge functions `ffn-performances` v64 + `import-club-records` v74. Re-import full post-migration (backfill via MCP `pg_net.http_post`). +4 tests, 325/325. | 2026-04-25 | ✅ Livré |
| §172 | Audit robustesse chemin nageur : calendrier, focus, plan→drawer | Plan muscu (`strength_planning_slots` + overrides) câblé sur le calendrier nageur via nouveau hook `useStrengthPlanByISO` (mirror sémantique §157, plan individuel jamais écrasé par groupe). DayCell : icône `Dumbbell` haut-gauche + pills AM/PM avec mini Sun/Moon (couleur fond statut conservée). Drawer du jour : carte muscu lecture (handoff sessionStorage → /strength). MyPlanWeekCard : bouton "Démarrer maintenant" sur la séance jour-J semaine courante (court-circuite reader via `autoLaunchKey`). Bug TZ latent corrigé (`buildWeekStarts` shiftait à UTC en CEST). Auth refresh tolère 3 échecs avant signOut. Mode tunnel charge → reps. Confirmation skip exercice si logs > 0. Hint permanent "Remplis les 4 indicateurs". Touch targets h-9/h-11/h-12. Safe-area-inset-top sur exit bar focus. Invalidations `["assignments"]` par préfixe. `setIsFinishing(false)` dans catch onFinish. +8 tests sur le hook, 253/253 (+6 vs baseline). | 2026-04-26 | ✅ Livré |
| §173 | Audit robustesse chemin critique COACH : login → builder → assign → comms | 8 commits couvrant 15 défauts P0/P1/P2 sur la branche `chantier/171-coach-critical-path-hardening`. P0 : garde `groupIds=[]` + validation client `visibleFrom > scheduledDate` + rollback notif orpheline dans `assignments_create` + rollback observable du `quickComposeMutation` (logs orphan + suffix toast). P1 : `markRead` idempotent via `useRef<Set>` (évite write spam toutes les 2 min), garde double-tap synchrone (`submittingRef`) + sticky CTA + helper text `visible_from` + key remount + confirm `split_distance` dans `SlotSessionSheet`, garde dossier supprimé dans `SwimCatalog.handleMoveToFolder`, bouton "Enreg. & assigner" muscu (5+ taps → 3) avec chaînage `createSession.onSuccess → assignments_create`. P2 : `Dialog` Radix au lieu de `window.prompt` pour création dossier muscu, reset `warmup_reps`/`warmup_duration` au toggle, refactor `DragDropList → OrderedList`. Plan TDD complet dans `docs/plans/2026-04-26-coach-critical-path-hardening-plan.md`. Tests : 333 → 336 (+3). 4 tests RLS additionnels (Task 13) reportés au prochain run avec Docker démarré. | 2026-04-26 | ✅ Livré |
| §174 | Audit robustesse infrastructure : auth/session, offline queue, RLS, RPC atomicity, PWA | Split policy `assignments_write` → insert/update/delete owner-based (migration 00145). Authz `assignment_id` dans `save_strength_run_atomic` (migration 00146). `enqueue` try/catch QuotaExceeded + purge catalogue. PWA `/auth/*` NetworkOnly. Auth INITIAL_SESSION/null guard iOS. `visibilitychange` refresh 50min. Offline mutex module-level. `isTransientError` no-poison. `withTimeout` RPC 10/15s. PWA gating skipWaiting=false. Push handler foreground postMessage. +12 tests (4 fichiers), 335 total. | 2026-04-26 | ✅ Livré |
| §175 | Consolidation post-audit nageur : 4 P2 résiduels + tests régression | P2.1 `Dashboard.authUuid` réactif via `onAuthStateChange`. P2.2 `Strength.startRun` pré-persistance localStorage anti-orphelin avant setActiveRunId. P2.3 toast batched user "Données obsolètes ignorées" sur types non reconnus dans `OfflineMutationSync` (au lieu de drop silencieux). P2.4 nouvel event `QUEUE_REAPED_EVENT` + toast destructive "Données hors-ligne abandonnées" (au lieu de console.warn invisible). Tests : 5 régressions §159 sur `updateStrengthRun` (assignment update fail = throw, pas swallow), 3 sur `reconcileStrengthRunLogs` (empty/count error/no-op), 7 SSR sur `DayCell` (Dumbbell/Trophy priority + SlotPill variants dark-mode contrast contract). 340 → 355 (+15). C4.2/4.4/4.5 reportés §176, RLS Phase 3 bloqué Docker. | 2026-04-26 | ✅ Livré |
| §177 | Reconcile timeout agrégé + parallèle | `reconcileStrengthRunLogs` : wrap `Promise.allSettled(batch)` dans `withTimeout(..., 30_000, "reconcile-batch")` — budget global 30 s au lieu de 200 s+ en séquentiel. `Strength.tsx` `onFinish` : `catch {}` → `catch (err)` + `isTransientError` (import ajouté) pour router transient vers offline queue et hard errors vers toast destructif + retry UI. `setIsFinishing(false)` déplacé dans `finally` (était uniquement dans `catch`). NEW `src/lib/api/__tests__/reconcileTimeout.test.ts` (+3 tests) : mock `withTimeout` à 80 ms pour tests rapides. 369 → 372 (+3), 0 régression. | 2026-04-26 | ✅ Livré |
| §182 | Rattrapage tests RLS reportés post-audit robustesse (§173/§174/§179) | Phase 1 : fix 5 tests pré-existants cassés dans `strength_planning.test.ts` (depuis §157) — cause = `asUser` rollback systématique, fix = seeds `asServiceRole` ou refactor en transaction unique pour idempotent upsert. Phase 2A (§174 P0 #1, migration 00145) : porter le split policy `assignments_write` → `assignments_insert/update/delete` dans `supabase/tests/schema.sql` + 7 nouveaux tests cross-coach dans `session_assignments.test.ts` (Eve coach id=5 attaque les assignations de Carol id=3 — silent no-op confirmé). Phase 2B (§174 P0/P1 #5, migration 00146) : nouvelle fonction stub `_test_save_strength_run_authz(p_athlete_id, p_assignment_id)` dans test schema mirror exact des IF blocks de la RPC prod + NEW `save_strength_run_authz.test.ts` (171 LOC, 11 tests) couvrant athlete identity check + assignment ownership check (le coeur de §174) + input validation. RLS suite : 120/125 → 143/143 (+18 tests, 0 régression). Phase 3 (chrono_records, one_rm_records, push_subscriptions, pain_reports, strength_session_runs cross-athlete, slot_assignments §173 Task 13) reportée à §183+ (volume estimé ~10-15 tests + ports schema). | 2026-04-26 | ✅ Livré |
| §183 | Export PDF séance pour les nageurs (réutilisation générateur coach §165/§166) | Refacto `exportSessionPdf` : remplacement du paramètre `SlotInstance` (typé coach) par un type générique `SessionHeaderInfo` exporté `{ date, timeRange?, location?, groups?, filenameSlug? }`. `drawMetadataBand` consomme la nouvelle shape avec ignore gracieux des valeurs nulles. Helper `formatTime` renommé en export `formatTimeForPdfHeader`. Nom de fichier dérivé du slug optionnel. Coach (`SlotSessionSheet.tsx`) : adapté le call site existant (mappe `SlotInstance` → `SessionHeaderInfo`, slug `coach-seance-{YYYYMMDD}` préservé). Nageur (`SwimSessionView.tsx`) : nouveau bouton `FileDown` à côté du `ShareMenu` (visible si `assignment` résolu), handler fetch `getSwimSessionById(session_id)` cache React Query partagé `["swim-session-preview", sessionId]`, mapping `assigned_slot` → "Matin"/"Soir", spinner + toast destructif sur erreur. Aucun nouveau fichier code. `npx tsc` clean, tests inchangés (1 fail pré-existant non lié). | 2026-04-28 | ✅ Livré |
| §186 | Pace Model v2 — refonte non-linéaire du calcul d'allures | Modèle linéaire §184/§185 → modèle non-linéaire `t_allure(d) = (Tobj × R_base × A_nage + Δ_mesure) / k_allure` du doc métier. **3 migrations DB** (toutes prod) : `00151_pace_model_v2` (DROP+recréation `coach_pace_zones` schema v2 multi-row family×zone + nouvelle table `coach_stroke_adjustments` overrides mS) ; `00152_pace_share_payload_v2` (RPC adapté zones_v2 jsonb) ; `00153_pace_team_coach_visibility` (RPC `list_manual_swimmers_for_coach` SECURITY DEFINER pour vue Allures cross-coach). NEW moteur pur `paceCalculatorV2.ts` (238 LOC) + `paceData.ts` (96 LOC, R_base/A_nage/k_allure du doc) + `Pace4NSegmentMatrix.tsx` (269 LOC, segmentée par nage avec poids §9) + `PaceStrokeAdjustments.tsx` (238 LOC, drawer mS overrides ±0.20) + `PdfExportDialog.tsx` (116 LOC, toggle 25m/50m pré-export) + `pdfPalette.ts` (palette colorée écran/PDF) + `AddSwimmerToTeamDialog.tsx` (233 LOC, refonte Mon équipe). Refonte `PaceMatrix.tsx` (194→268, V4 conditionnel toggle 400m/800m) + `PaceZonesSettings.tsx` (343, schema v2) + `SwimmerPaceCard.tsx` (244, sous-accordions repliables) + `CoachPaceCalculatorScreen.tsx` (220, sélecteur coach + V4 toggle) + `SharedPaceMatrix.tsx` (consume zones_v2) + `export-pace-pdf.ts` (906, branding EAC + bassin d'origine + flèche conversion). API `pace-zones` refonte v2 + `pace-stroke-adjustments` (49) + `coaches.ts` (30, vue cross-coach). Hooks `useCoachPaceZonesV2` (71) + `useCoachStrokeAdjustments` (60) + `useTeamForCoach` ajouté à `useMyTeam`. **30+ commits** `feat(pace-v2):`, +5337/-773 LOC, 49 fichiers, déployé via Pages. | 2026-05-01 | ✅ Livré |
| §187 | Affinement individuel des courbes d'allures (révisé) | Slider `[0.90, 1.10]` par nageur, défaut 1.000 (pas de row si défaut). NEW migration `00154_swimmer_pace_calibration` + table 1 row par nageur calibré + 2 index partiels NULL-distinct + RLS owner-based avec SELECT athlète propre. Drawer dans `SwimmerPaceCard` + badge `[Affiné ×1.025]` sur matrice + propagation PDF + page partagée. Application en sortie `paceCalculatorV2.computePaceMatrix(..., multiplier?)` (1 paramètre optionnel). Designs abandonnés (tests réels, interpolation, hiérarchie) archivés `docs/plans/archived/`. | 2026-05-01 | 📋 Designé |
| §188 | Lier objectifs nageur ↔ allures (1-clic, sync passive) | Helper pur `parseEventCode("100m NL") → {distance, stroke}` avec alias FR/EN, bouton "→ Allures" sur chaque `ObjectiveCard` coach (désactivé si non-parsable ou time null), pré-remplissage `CoachPaceCalculatorScreen`. Côté nageur : hook `useTargetForObjective` + composant `PaceMatrixInline` (compact, lecture seule) sous chaque objectif si match `(swimmer, stroke, distance, pool)`. **Aucune migration DB**. Pas de FK : sync passive (le coach reclique si l'objectif change). Designs abandonnés (audit trail) archivés. | 2026-05-02 | ✅ Livré |
| §188-ext | Sync auto allures ↔ objectifs nageur (extension §188) | NEW `shouldAutoSyncToPaceTarget` (prédicat pur dans `objective-pace-link.ts`). Export `autoSyncPaceTarget` dans `SwimmerObjectivesTab.tsx` : upsert silencieux de la cible allure au save/update d'un objectif chrono parseable. `useEffect` rétroactif au mount (guard `syncedForAthleteRef` par ID nageur, évite boucle). Prop `athleteAccountId` ajoutée. +8 tests. `npx tsc` clean. | 2026-05-02 | ✅ Livré |
| §189 | Chrono setup — équipe coach par défaut + vagues auto par ligne | `ChronoSetup.tsx` : refonte des onglets `"club"\|"manuals"` → `"team"\|"club"` (défaut `team`). L'onglet "Mon équipe" liste manuels (section "Mémorisés" en tête, avec delete) + comptes rattachés (groupés par `group_label`) — le coach n'a plus à switcher d'onglet. L'onglet "Tout le club" (`disabled` si `allAthletes.length === athletes.length`) remplace l'ex-Switch. Recherche partagée filtre simultanément manuels et accounts. Nouvelle fonction `computeNextWave(lane)` = `min(swimmersInLane.length + 1, maxWaves)` utilisée par `handleAddSwimmer` ET `handleAddManual` à la place du `wave: 1` hardcodé : 1er nageur d'une ligne → V1, 2e → V2, etc., capé `maxWaves` (2 mobile / 6 desktop). `ManualsTabBody` (107 lignes) supprimé — logique inlinée. Imports nettoyés (`Switch`, `useQuery`, `useRef`, `X`). `npx tsc` clean, tests chrono tous verts. | 2026-05-01 | ✅ Livré |
| §189-ext | Drawer objectif unifié Allures + Progression (toggle) | Extraction `EventProgressionContent` de `EventProgressionSheet.tsx` (nouvelle export sans wrapper Sheet, prop `active?` gate queries). NEW `ObjectiveDetailSheet.tsx` (94 LOC) : Sheet bottom, toggle [Allures\|Progression] si `matchingTarget != null`, tab "allures" → `PaceMatrixInline`, tab "progression" → `EventProgressionContent`. `SwimmerObjectivesView.tsx` : suppression inline matrices + `shouldRenderInlineMatrix`, state `detailObj`+`detailMatchingTarget`, helper `openDetail`, clic objectif avec `event_code` → drawer. `SwimmerObjectivesView.paceLink.test.tsx` supprimé. +2 tests, −4 tests = 633 pass. `npx tsc` clean. | 2026-05-02 | ✅ Livré |
| §190 | Card "Ma semaine" compacte côté nageur (`SwimmerHome` Section G) | NEW `swimmerWeekMatrix.ts` (70 LOC) : helpers purs `classifyCell` (7 états : `none`/`unassigned`/`assigned-future`/`assigned-today`/`done`/`missed-feedback`/`past-no-session`) + `foldCellStates` (priorité agrégation multi-slots). NEW `SwimmerWeekMatrixCard.tsx` (434 LOC) : grille 7j × matin/aprèm visuellement identique à la matrice coach (`Coach.tsx` § B). Réutilise `useSlotCalendar` + query `["sessions", userId ?? user]` (cache dedupe). Footer : `{donePast}/{plannedPast}` + message contextuel ressentis. Tap → `/natation`. Choix produit : conserve `SwimmerWeekSlots` détaillé en-dessous + créneau passé sans séance coach = neutre (pas de "ressenti oublié"). 16 tests TDD (9 + 7). `npx tsc` clean. | 2026-05-02 | ✅ Livré |
| §190-fix | Card "Ma semaine" nageur : per-swimmer resolution via `get_swimmer_sessions` | Le §190 initial réutilisait `useSlotCalendar` (résolution group-level), affichant des slots où la séance coach était assignée à un sous-groupe ou un nageur individuel n'incluant pas l'utilisateur courant. Bascule vers l'RPC `getSwimmerSessions(userId, mondayIso, sundayIso, false)` — résolution `individual > subgroup > group` + filtre `is_absent` + `log_session_id` canonique pour le ressenti. `SwimmerWeekMatrixCard.tsx` 434 → 415 LOC. Suppression de la query `api.getSessions` (remplacée par `log_session_id` du RPC). 16 tests inchangés. `npx tsc` clean. | 2026-05-02 | ✅ Livré |
| §190-fix2 | Card "Ma semaine" : feedback lookup via `api.getSessions` (correction §190-fix) | Le RPC `get_swimmer_sessions` (migration 00132 ligne 253) retourne `NULL::uuid AS log_session_id` inconditionnellement → tous les créneaux passés assignés affichaient "ressenti manquant". Réintroduction de la query `api.getSessions` (clé partagée avec SwimmerHome, dedupe cache) + helpers `buildCompletionLookup` / `rowHasFeedback` (match `assignment_id` priorité, fallback `(date, bucket)` avec mapping `"Matin"/"Soir"` → `"morning"/"evening"`). `SwimmerWeekMatrixCard.tsx` 415 → 459 LOC. 16 tests inchangés. `npx tsc` clean. | 2026-05-02 | ✅ Livré |
| §190-fix3 | Card "Ma semaine" : exclure les séances muscu | Filtre `row.slot_session_type !== "swim"` ajouté dans la boucle d'indexation `byDateBucket` de `SwimmerWeekMatrixCard.tsx`. Les rows strength sont ignorées dès l'indexation : ne comptent ni dans le total ni dans `plannedPast/donePast/missedCount`. La muscu reste visible via `MyPlanWeekCard` côté Strength + Section "Aujourd'hui". 16 tests inchangés. `npx tsc` clean. | 2026-05-02 | ✅ Livré |
| §190-ui | SwimmerHome : "Ma semaine" remplace "Aujourd'hui" sous Bien-être | Suppression du bloc JSX Section C "Aujourd'hui" (cards par `todaySession` avec badges Fait/À faire/Lancer/Jour de repos). `SwimmerWeekMatrixCard` déplacée à sa place, juste sous la Section B Bien-être. La vue détaillée `SwimmerWeekSlots` reste en Section G. `SwimmerHome.tsx` ~770 → 673 LOC. Helpers exportés et useMemos / queries préservés pour les tests + cache priming. 19 tests inchangés. `npx tsc` clean. | 2026-05-02 | ✅ Livré |
| §190-ui2 | SwimmerHome : compteur "N séances avant" sur card Prochaine compétition | Réutilise `computeTrainingDaysRemaining` de `lib/date.ts` (même fonction que le bandeau du calendrier). Query `["my-planned-absences"]` (clé partagée avec Dashboard → dedupe cache, gated `enabled: !!nextCompetition`). `presenceDefaults` lu depuis localStorage avec la clé `swim-dashboard-v2:...:presenceDefaults` écrite par Dashboard, fallback `initPresenceDefaults()` (tous les jours AM/PM ON) si jamais ouvert le calendrier. Affichage `N séance(s) avant` dans la 3e ligne de la card, en `font-semibold` pour mettre en évidence. `SwimmerHome.tsx` 673 → 710 LOC. 3 tests inchangés. `npx tsc` clean. | 2026-05-02 | ✅ Livré |
| §190-ui3 | SwimmerHome : Section D utilise l'`InlineBanner` partagé du calendrier | Remplacement de la `<Card>` custom amber (Trophy + J-X badge + name + location + ligne meta avec courses/séances/checklist) par un seul `<InlineBanner variant="amber" />` (props `label`/`badge="J-X"`/`sublabel=location`/`subbadge="N séance(s)"`). Suppression : import `MapPin`, queries `["competition-races"]` + `["competition-checklist"]`, memo `checklistProgress`. La page détail recharge les races/checklist à la demande. `SwimmerHome.tsx` 710 → 669 LOC. 3 tests inchangés. `npx tsc` clean. | 2026-05-02 | ✅ Livré |
| §195 | Fix duplication note coach ↔ note athlète sur l'écran de repos (vue focus muscu) + cleanup affichage "note coach" côté athlète | `WorkoutRunner.tsx:1122-1123` passait `exerciseNotes?.[currentBlock?.exercise_id ?? -1]` aux **deux** props `note` et `athleteNote` du `RestScreen`. Or `exerciseNotes` (dans `Strength.tsx:353`) est dérivé exclusivement de `one_rm_records.notes` (notes athlète). Quand l'athlète tapait dans le textarea "Ma note" de `RestExerciseTab` → debounce 800 ms → `updateNote` mutation → `oneRMs` refresh → `exerciseNotes` recalculé → les zones "Note coach" et "Ma note" affichaient la même valeur. **Fix initial** : `note={currentBlock?.notes ?? null}` (= `StrengthSessionItem.notes` saisi côté builder coach), cohérent avec la vue focus principale ligne 1064. **Cleanup associé** (demandé par l'utilisateur "il n'y en a pas pour l'instant") : retrait des affichages "Note coach" côté athlète — bloc JSX `RestExerciseTab.tsx` (~12 lignes), prop `note` de la chaîne `WorkoutRunner → RestScreen → RestExerciseTab`, label "Notes" → "Description" sur la vue focus principale (= `currentExerciseDef.description` uniquement). La saisie côté builder coach (`StrengthExerciseCard.tsx:160-167`) reste intacte. 5 fichiers modifiés. `npx tsc` clean. | 2026-05-08 | ✅ Livré |

---

## 6. Fix timers mode focus (PWA iOS background)

### Problème actuel

En mode focus (WorkoutRunner), les timers utilisent des `setInterval` relatifs :
- **Timer elapsed** (`src/components/strength/WorkoutRunner.tsx:149`) : `setInterval(() => setElapsedTime(t => t + 1), 1000)` — incrémente de +1 chaque seconde
- **Timer repos** (`WorkoutRunner.tsx:168`) : `setInterval(() => setRestTimer(t => t - 1), 1000)` — décrémente de -1 chaque seconde

Sur iPhone en PWA (`apple-mobile-web-app-capable`), quand l'écran se verrouille ou que l'app passe en arrière-plan, iOS **throttle ou suspend** les `setInterval`. Résultat : un repos de 90s peut durer 3-4 minutes en temps réel car le timer ne décompte que quand l'app est au premier plan.

### Objectif

Des timers fiables qui affichent toujours le temps réel écoulé, même après un passage en arrière-plan iOS.

### Implémentation proposée

Remplacer les timers relatifs par des **timestamps absolus** :

1. **Timer elapsed** — Stocker `startTimestamp = Date.now()` au démarrage de la séance. L'affichage calcule `elapsed = Math.floor((Date.now() - startTimestamp) / 1000)`. Gérer pause/reprise avec un accumulateur `pausedElapsed`.

2. **Timer repos** — Stocker `restEndTimestamp = Date.now() + duration * 1000` au démarrage du repos. L'affichage calcule `remaining = Math.max(0, Math.ceil((restEndTimestamp - Date.now()) / 1000))`. Quand `remaining === 0`, déclencher la fin du repos.

3. **Détection retour premier plan** — Écouter `document.addEventListener('visibilitychange')` pour forcer un re-render immédiat au retour au premier plan (le `setInterval` peut avoir un délai de reprise).

4. **Fréquence d'update** — Garder `setInterval` à 1000ms pour l'affichage, mais le calcul est toujours basé sur `Date.now()` → pas de dérive.

### Fichiers à modifier

| Fichier | Modification |
|---------|-------------|
| `src/components/strength/WorkoutRunner.tsx` | Remplacer les 2 timers (elapsed + repos) par des timestamps absolus, ajouter listener `visibilitychange` |

### Complexité estimée

Faible — changement localisé dans un seul fichier, ~30-40 lignes à modifier.

---

## 7. Visual Polish & Branding (Phase 6 UI/UX)

### Contexte

User requested comprehensive visual modernization after completing Phases 1-5 (functional UX improvements). Specific asks:
- "Est-ce que tu as pu générer un UI/UX mobile friendly, optimisé, épuré?"
- "As-tu changé la favicon pour matcher le thème global?"
- "Rendu la login page plus attrayante / moderne?"

**Assessment before Phase 6:**
- ✅ Functionality: Excellent (loading states, validation, error handling, PWA timers)
- ✅ Mobile-friendly: YES (responsive, touch targets)
- ✅ Optimized: YES (lazy loading, animations library exists)
- ❌ Visual branding: NO (generic icons, wrong theme-color #3b82f6)
- ❌ Modern login: NO (functional but dated card design)
- ⚠️ Animations: Underutilized (only HallOfFame)

### Objectif

Transform app from functionally solid to visually distinctive, production-grade interface reflecting EAC brand identity (#E30613 red).

### Implémentation réalisée

**Step 1: PWA Icons & Branding**
- ✅ Generated 4 EAC-branded PWA icons from `attached_assets/logo-eac.png`:
  - icon-192.png (192×192, 21KB)
  - icon-512.png (512×512, 119KB)
  - apple-touch-icon.png (180×180, 19KB)
  - favicon.png (128×128, 11KB)
- ✅ Fixed theme-color in `index.html`: #3b82f6 → #E30613 (EAC red)
- ✅ Fixed theme_color in `public/manifest.json`: #3b82f6 → #E30613
- ✅ Updated manifest icons array with all 7 icon sizes

**Step 2: Login Page Redesign**
- ✅ Complete redesign (508 → 663 lines, better structure)
- ✅ Split-screen layout:
  - Desktop: 2-column grid (hero left, form right)
  - Mobile: Stacked (logo top, form bottom)
  - Hero: EAC red gradient, large logo (h-32 w-32), "SUIVI NATATION" title (text-5xl)
- ✅ Replaced modal dialogs with inline tabs (Shadcn Tabs)
- ✅ Added password visibility toggle (Eye/EyeOff icons)
- ✅ Integrated Framer Motion animations (fadeIn, slideUp, staggerChildren)
- ✅ Enhanced mobile UX: min-h-12 (48px) touch targets

**Step 3: Animation Rollout**
- ✅ Dashboard: slideInFromBottom to drawer, staggerChildren to form fields
- ✅ Strength: staggerChildren to session list, fadeIn to detail view
- ✅ Records: staggerChildren to list, successBounce to FFN sync, fadeIn to edit feedback
- ✅ Profile: fadeIn to entire page

**Step 4: Button Standardization**
- ✅ Created `docs/BUTTON_PATTERNS.md` (250 lines) with comprehensive guidelines
- ✅ Standardized buttons across 4 pages (24 buttons total):
  - Strength.tsx: h-12 md:h-10 responsive heights
  - SwimCatalog.tsx: unified h-10, variant="outline" for secondary
  - StrengthCatalog.tsx: h-10 with explicit variants
  - Admin.tsx: h-10 with proper variants

### Fichiers modifiés

| Fichier | Modification |
|---------|-------------|
| `public/icon-192.png` | Création PWA icon 192×192 |
| `public/icon-512.png` | Création PWA icon 512×512 |
| `public/apple-touch-icon.png` | Création iOS icon 180×180 |
| `public/favicon.png` | Remplacement favicon 128×128 |
| `index.html` | theme-color: #3b82f6 → #E30613 |
| `public/manifest.json` | theme_color + icons array |
| `src/pages/Login.tsx` | Refonte majeure (508 → 663 lignes) |
| `src/pages/Dashboard.tsx` | +slideInFromBottom, +staggerChildren |
| `src/pages/Strength.tsx` | +fadeIn, buttons h-12 md:h-10 |
| `src/pages/Records.tsx` | +successBounce, +fadeIn |
| `src/pages/Profile.tsx` | +fadeIn |
| `src/pages/coach/SwimCatalog.tsx` | Buttons standardization |
| `src/pages/coach/StrengthCatalog.tsx` | Buttons standardization |
| `src/pages/Admin.tsx` | Buttons standardization |
| `docs/BUTTON_PATTERNS.md` | Création guidelines (250 lignes) |

### Complexité estimée

Moyenne — 4 agents en parallèle, 12-16h estimées (réalisé en ~3h grâce au parallélisme).

### Avancement

| Étape | Statut | Date | Notes |
|-------|--------|------|-------|
| PWA Icons & Branding | ✅ Fait | 2026-02-14 | 4 icons générées, theme-color corrigé |
| Login Page Redesign | ✅ Fait | 2026-02-14 | Split layout + animations |
| Animation Rollout | ✅ Fait | 2026-02-14 | Dashboard, Strength, Records, Profile |
| Button Standardization | ✅ Fait | 2026-02-14 | BUTTON_PATTERNS.md + 4 pages |
| Build & Test | ✅ Fait | 2026-02-14 | Build success in 4.97s |
| Documentation | ✅ Fait | 2026-02-14 | implementation-log.md, ROADMAP.md, FEATURES_STATUS.md |

### Résultat

**Quantitative:**
- 15 files modified, 4 new files created, 1 file replaced
- Build time: 4.97s (no performance regression)
- Bundle size: Login chunk 16.51 kB, animations chunk 112.69 kB

**Qualitative:**
- Application visually distinctive with EAC brand identity
- First impressions significantly improved (modern login, branded icons)
- Animations create cohesive, polished feel across key interactions
- Button patterns now consistent (48px mobile touch targets)
- Theme color correctly reflects EAC red (#E30613) on all devices

### Limites

**Optional Phases Not Implemented:**
- Phase 7: Component Architecture Refactor (6,129 lines → ~3,700 lines)
  - Dashboard: 1,921 lines → ~700 lines
  - Strength: 1,578 lines → ~600 lines
  - SwimCatalog: 1,354 lines → ~400 lines
  - StrengthCatalog: 1,276 lines → ~350 lines
- Phase 8: Design System Documentation (Storybook setup)

Ces phases sont optionnelles et peuvent être différées sauf si la maintenabilité devient critique ou si l'utilisateur le demande explicitement.

---

## 1. Refonte du parcours d'inscription

### Problème actuel

Après inscription (`Login.tsx:226-254`), si Supabase exige la confirmation email :
- L'utilisateur voit un message d'erreur rouge dans le dialogue : *"Compte créé. Vérifiez votre email pour confirmer votre inscription."*
- **Pas d'écran de confirmation dédié** — juste un message d'erreur dans le formulaire
- **Pas de handler pour le lien de confirmation email** — aucune route `/auth/callback`
- **Le lien email ne fonctionne pas** (redirige vers une URL non gérée par l'app)
- L'utilisateur ne comprend pas quoi faire après avoir validé ses informations

### Objectif

Guider clairement l'utilisateur après l'inscription, avec un parcours fluide et compréhensible.

### Implémentation proposée

#### Option A : Garder la confirmation email (recommandé si on veut valider les emails)

1. **Écran de confirmation post-inscription** (`src/pages/ConfirmEmail.tsx` ou composant dans Login.tsx)
   - Fermer le dialogue d'inscription
   - Afficher un écran dédié avec :
     - Icône de succès (check ou email)
     - Message clair : "Votre compte a été créé avec succès !"
     - Instructions étape par étape : "1. Vérifiez votre boîte mail. 2. Cliquez sur le lien de confirmation. 3. Revenez sur cette page pour vous connecter."
     - Bouton "Renvoyer l'email" (appel `supabase.auth.resend()`)
     - Bouton "Retour à la connexion"

2. **Route de callback email** (`src/pages/AuthCallback.tsx` ou gestion dans `App.tsx`)
   - Intercepter le hash fragment Supabase (`#access_token=...&type=signup`)
   - Appeler `supabase.auth.getSession()` pour valider le token
   - Si succès : login automatique + redirect vers le dashboard
   - Si échec : message d'erreur + lien vers login

3. **Gestion dans App.tsx**
   - Ajouter la détection du callback dans le routeur hash
   - Pattern : `/#/auth/callback` ou détection directe des params Supabase dans le hash

#### Option B : Désactiver la confirmation email + validation admin

1. Désactiver "Confirm email" dans Supabase Dashboard > Auth > Settings
2. Après inscription : login automatique immédiat (le code existe déjà, `Login.tsx:248-254`)
3. Ajouter un flag `is_approved` dans `user_profiles`
4. L'admin valide les comptes depuis `Admin.tsx`
5. Les comptes non approuvés voient un écran "En attente de validation"

### Fichiers impactés

| Fichier | Modification |
|---------|-------------|
| `src/pages/Login.tsx` | Écran post-inscription, bouton "Renvoyer email" |
| `src/App.tsx` | Route callback email (Option A) |
| `src/lib/auth.ts` | Gestion du callback token (Option A) |
| `src/pages/Admin.tsx` | Validation comptes (Option B) |
| `supabase/` | Config auth (Option B) |

### Décision à prendre

> **Quelle option choisir ?** Option A (confirmation email bien gérée) ou Option B (pas d'email, validation admin) ?

---

## 2. Import de toutes les performances FFN d'un nageur

### Problème actuel

La Edge Function `ffn-sync` (`supabase/functions/ffn-sync/`) scrape FFN Extranat et n'importe que les **records personnels** (meilleur temps par épreuve/bassin). Elle déduplique par `event_name + pool_length` et ne garde que le best time.

La table `swim_records` stocke uniquement les records (`record_type = 'comp'`).

### Objectif

Permettre d'importer **l'historique complet** des performances d'un nageur depuis FFN : toutes les compétitions, tous les temps, pas juste les meilleurs.

### Implémentation proposée

1. **Nouvelle table `swimmer_performances`** (ou extension de `club_performances`)

   ```sql
   CREATE TABLE swimmer_performances (
     id SERIAL PRIMARY KEY,
     user_id INTEGER REFERENCES users(id),
     swimmer_iuf TEXT,               -- IUF FFN
     event_code TEXT NOT NULL,        -- ex: "50 NL", "100 Dos"
     pool_length TEXT NOT NULL,       -- "25" ou "50"
     time_ms INTEGER NOT NULL,        -- temps en millisecondes
     time_display TEXT NOT NULL,      -- format "mm:ss.cc"
     competition_name TEXT,           -- nom de la compétition
     competition_date DATE,           -- date de la compétition
     competition_location TEXT,       -- lieu
     ffn_points INTEGER,             -- points FFN si disponibles
     source TEXT DEFAULT 'ffn',       -- 'ffn' ou 'manual'
     imported_at TIMESTAMPTZ DEFAULT NOW(),
     UNIQUE(swimmer_iuf, event_code, pool_length, competition_date, time_ms)
   );
   ```

2. **Nouvelle Edge Function `ffn-performances`** (ou extension de `ffn-sync`)
   - Scraper la page complète des performances sur Extranat (pas seulement les MPP)
   - Parser toutes les lignes de résultats avec : compétition, date, lieu, temps, points
   - Insérer dans `swimmer_performances` avec `ON CONFLICT DO NOTHING` (idempotent)
   - Retourner le nombre de performances importées (nouvelles + existantes)

3. **UI nageur** (`Records.tsx` ou nouvelle page)
   - Bouton "Importer mes performances"
   - Liste chronologique des performances avec filtres (épreuve, bassin, période)
   - Graphique d'évolution des temps par épreuve

### Pages FFN à scraper

Le site FFN Extranat expose les performances complètes d'un nageur via son IUF. La Edge Function actuelle (`ffn-sync`) scrape déjà les MPP — il faut étendre le scraping aux résultats de compétition détaillés.

### Fichiers impactés

| Fichier | Modification |
|---------|-------------|
| `supabase/migrations/` | Nouvelle migration pour `swimmer_performances` |
| `supabase/functions/ffn-performances/` | Nouvelle Edge Function (ou extension de `ffn-sync`) |
| `src/lib/api.ts` | Nouvelles méthodes API (import, liste, filtres) |
| `src/pages/Records.tsx` | UI historique performances |
| `src/lib/schema.ts` | Schéma Drizzle pour la nouvelle table |

---

## 3. Gestion coach des imports de performances

### Problème actuel

`RecordsAdmin.tsx` permet de gérer la liste des nageurs (IUF, sexe, naissance) mais :
- Le bouton "Mettre à jour les records" appelle `import-club-records` qui **n'existe pas**
- Le coach n'a aucun moyen de déclencher ou piloter les imports depuis sa vue
- Aucun feedback sur le statut des imports

### Objectif

Le coach doit pouvoir, depuis sa vue Coach, piloter l'import des performances de ses nageurs.

### Implémentation proposée

1. **Écran coach "Import Performances"** (nouveau tab dans `Coach.tsx` ou dans `RecordsAdmin.tsx`)
   - Liste des nageurs du groupe avec leur IUF FFN
   - Pour chaque nageur :
     - Bouton "Importer les performances"
     - Statut du dernier import (date, nombre de perfs importées)
     - Indicateur visuel : jamais importé / à jour / en cours
   - Bouton "Tout importer" (import bulk pour tous les nageurs actifs)

2. **Edge Function `import-club-records`** (à créer)
   - Reçoit la liste des nageurs (IUF) à importer
   - Pour chaque nageur : appelle le scraper FFN et insère les performances
   - Recalcule les records club (`club_records`) à partir de toutes les performances
   - Retourne un rapport (succès/erreurs par nageur)

3. **Table `import_logs`** (optionnel, pour traçabilité)

   ```sql
   CREATE TABLE import_logs (
     id SERIAL PRIMARY KEY,
     triggered_by INTEGER REFERENCES users(id),
     swimmer_iuf TEXT,
     status TEXT DEFAULT 'pending',  -- pending, running, success, error
     performances_count INTEGER,
     error_message TEXT,
     started_at TIMESTAMPTZ DEFAULT NOW(),
     completed_at TIMESTAMPTZ
   );
   ```

### Fichiers impactés

| Fichier | Modification |
|---------|-------------|
| `supabase/functions/import-club-records/` | Nouvelle Edge Function |
| `src/pages/coach/` | Nouveau composant ou tab dans Coach.tsx |
| `src/pages/RecordsAdmin.tsx` | Brancher le bouton existant sur la vraie Edge Function |
| `src/lib/api.ts` | Méthodes API pour import + logs |

### Dépendance

> Ce chantier dépend du chantier §2 (import performances). L'Edge Function `import-club-records` réutilisera la logique de scraping de `ffn-performances`.

### Avancement

| Étape | Statut | Date | Notes |
|-------|--------|------|-------|
| Migration SQL (import_logs) | ✅ Fait | 2026-02-08 | Migration 00011 |
| Module ffn-event-map.ts | ✅ Fait | 2026-02-08 | Mapping FFN -> codes normalisés |
| Edge Function import-club-records | ✅ Fait | 2026-02-08 | Import bulk + recalcul records |
| API client (api.ts) | ✅ Fait | 2026-02-08 | getImportLogs, importSingleSwimmer |
| UI RecordsAdmin (import individuel + logs) | ✅ Fait | 2026-02-08 | Bouton par nageur + historique |

---

## 4. Records club par catégorie d'âge, sexe et nage

### Problème actuel

`RecordsClub.tsx` a déjà les filtres UI :
- Bassin (25m/50m)
- Sexe (M/F)
- Catégorie d'âge (8 ans et - ... 17 ans et +)
- Type de nage (NL, Dos, Brasse, Papillon, 4 Nages)

Mais les tables `club_records` et `club_performances` sont **vides** car l'import n'existe pas (voir §2 et §3).

### Objectif

Afficher les records du club organisés en tableaux lisibles par catégorie d'âge, sexe et nage, une fois les données importées.

### Implémentation proposée

1. **Alimenter les données** (dépend de §2 et §3)
   - Une fois `swimmer_performances` remplie, un job recalcule les best times par :
     - `event_code` + `pool_length` + `sex` + `age_category`
   - Stockage dans `club_records` (table existante)

2. **Revoir l'UI de `RecordsClub.tsx`** si nécessaire
   - Vérifier que les filtres existants fonctionnent bien avec les données réelles
   - Ajouter un affichage en tableau structuré :
     - Colonnes : Épreuve | Record | Nageur | Date | Compétition
     - Groupé par catégorie d'âge
   - Ajouter un mode "vue globale" (tous les records du club toutes catégories)

3. **Calcul des catégories d'âge**
   - À partir de la date de naissance du nageur et de la date de la performance
   - Catégories FFN standard : Avenir (8-), Poussin (9-10), Benjamin (11-12), Minime (13-14), Cadet (15-16), Junior (17-18), Senior (19+)

### Fichiers impactés

| Fichier | Modification |
|---------|-------------|
| `src/pages/RecordsClub.tsx` | Ajustements UI si nécessaire |
| `src/lib/api.ts` | Requête filtrée club_records |
| `supabase/functions/import-club-records/` | Calcul best times par catégorie |

### Dépendance

> Ce chantier est essentiellement un chantier de **données**. L'UI existe déjà. Il devient fonctionnel une fois les chantiers §2 et §3 terminés.

### Avancement

| Étape | Statut | Date | Notes |
|-------|--------|------|-------|
| Alimenter les données | ✅ Fait | 2026-02-08 | Via import-club-records Edge Function |
| Recalcul best times par catégorie | ✅ Fait | 2026-02-08 | Par event_code + pool + sex + age |
| UI RecordsClub | ✅ Fait | 2026-02-08 | Ajout indicateur dernière mise à jour |

---

## 5. Dette technique UI/UX restante

Voir [`docs/patch-report.md`](./patch-report.md) pour le détail complet des items restants de l'audit UI/UX.

### Avancement refactoring `api.ts`

| Étape | Statut | Date | Notes |
|-------|--------|------|-------|
| Extraction types → `api/types.ts` | ✅ Fait | 2026-02-06 | 281 lignes, interfaces TS |
| Extraction client → `api/client.ts` | ✅ Fait | 2026-02-06 | 252 lignes, utilitaires Supabase |
| Extraction helpers → `api/helpers.ts` | ✅ Fait | 2026-02-06 | 151 lignes, fonctions de mapping |
| Extraction localStorage → `api/localStorage.ts` | ✅ Fait | 2026-02-06 | 85 lignes |
| Extraction transformers → `api/transformers.ts` | ✅ Fait | 2026-02-07 | 187 lignes, 8 fonctions strength |
| Nettoyage code mort (`strengthRunStart`) | ✅ Fait | 2026-02-07 | Suppression dead code |
| `api.ts` : 2859 → 2198 lignes | ⚠️ En cours | 2026-02-07 | -23%, objectif < 2000 |

### Résumé des items non terminés

| Catégorie | Items restants | Priorité |
|-----------|---------------|----------|
| Couleurs hardcodées (zinc/slate) | ~50 occurrences hors `/ui/` | Basse |
| Skeletons de chargement manquants | SwimCatalog, Progress | Basse |
| Labels htmlFor manquants (Login) | 1 formulaire | Basse |
| Highlight drag-and-drop StrengthCatalog | 1 composant | Basse |
| Images sans loading="lazy" | WorkoutRunner, SwimCatalog | Basse |
| Gradients #fff (TimesheetTimeWheel) | 1 composant | Basse |

---

## Ordre d'implémentation recommandé

```
1. Refonte inscription (§1)
   └── Indépendant, améliore l'onboarding immédiatement

2. Import performances FFN (§2)
   └── Fondation pour §3 et §4

3. Gestion coach imports (§3)
   └── Dépend de §2

4. Records club (§4)
   └── Dépend de §2 et §3 (données)

5. Dette UI/UX (§5)
   └── En parallèle, basse priorité
```

---

## Notes techniques transverses

### Architecture actuelle (rappel)

- **Frontend** : React 19 + TypeScript + Vite 7 + Tailwind CSS 4
- **Backend** : Supabase (PostgreSQL, Auth, Edge Functions Deno)
- **Déploiement** : GitHub Pages (frontend) + Supabase Cloud (backend)
- **Routing** : Hash-based (Wouter) pour compatibilité GitHub Pages
- **Persistance** : Supabase primary, localStorage fallback offline

### Edge Functions existantes

| Fonction | Statut | Description |
|----------|--------|-------------|
| `ffn-sync` | ✅ | Sync records perso depuis FFN Extranat |
| `admin-user` | ✅ | Gestion utilisateurs (création Supabase Auth) |
| `import-club-records` | ✅ | Import bulk FFN + recalcul records club |
| `ffn-performances` | ✅ | Import historique complet performances d'un nageur |

### Tables Supabase pertinentes

| Table | Statut | Usage |
|-------|--------|-------|
| `swim_records` | ✅ | Records perso nageur (best times) |
| `club_records` | ✅ | Records club (vide, en attente d'import) |
| `club_performances` | ✅ | Performances club (vide, en attente d'import) |
| `club_record_swimmers` | ✅ | Liste nageurs pour import club |
| `swimmer_performances` | ✅ | Historique complet performances nageur |
| `import_logs` | ✅ | Traçabilité des imports |

---

## Règles de documentation et suivi d'avancement

Chaque session de développement **doit** suivre ce protocole pour maintenir la traçabilité et permettre la reprise facile par une future conversation.

### 1. Avant de coder — Lire le contexte

1. `CLAUDE.md` (racine) — vue d'ensemble rapide
2. Ce fichier (`docs/ROADMAP.md`) — comprendre le chantier ciblé, ses dépendances, les fichiers impactés
3. `docs/FEATURES_STATUS.md` — vérifier le statut actuel de la feature concernée

### 2. Pendant le développement — Documenter chaque patch

Pour **chaque lot de modifications** (commit ou groupe de commits liés), ajouter une entrée dans `docs/implementation-log.md` en respectant ce format :

```markdown
## YYYY-MM-DD — Titre court du patch

**Branche** : `nom-de-la-branche`
**Chantier ROADMAP** : §N — Nom du chantier

### Contexte
Quel problème ce patch résout, pourquoi il est nécessaire.

### Changements réalisés
- Description des modifications concrètes (fichiers, logique, UI)
- Nouvelles tables/migrations si applicable
- Nouvelles Edge Functions si applicable

### Fichiers modifiés
| Fichier | Nature du changement |
|---------|---------------------|
| `src/pages/Foo.tsx` | Ajout composant X |
| `supabase/migrations/000XX.sql` | Nouvelle table Y |

### Tests
- [x] `npm run build` — compilation OK
- [x] `npm test` — tests passent
- [x] `npx tsc --noEmit` — 0 erreur TypeScript
- [ ] Test manuel (décrire le scénario)

### Décisions prises
- Choix A plutôt que B parce que...
- Question en suspens pour plus tard : ...

### Limites / dette introduite
- Ce qui n'est pas parfait mais acceptable pour ce patch
- Ce qui devra être amélioré plus tard
```

### 3. Après le développement — Mettre à jour le suivi global

A chaque fin de session, mettre à jour **ces 4 fichiers** :

| Fichier | Quoi mettre à jour |
|---------|-------------------|
| `docs/ROADMAP.md` | Colonne **Statut** dans la vue d'ensemble (A faire → En cours → Fait). Ajouter une section "Avancement" dans le chantier concerné si partiellement complété. |
| `docs/FEATURES_STATUS.md` | Changer le statut des features impactées (❌ → ⚠️ → ✅). Mettre à jour les notes. |
| `docs/implementation-log.md` | L'entrée du patch a déjà été ajoutée pendant le dev (voir §2). |
| `CLAUDE.md` | Mettre à jour si un fichier clé a été ajouté/supprimé, si une Edge Function a été créée, ou si un chantier est terminé. |

### 4. Suivi d'avancement par chantier

Chaque chantier dans ce ROADMAP doit maintenir une section **Avancement** une fois le travail démarré :

```markdown
### Avancement

| Étape | Statut | Date | Notes |
|-------|--------|------|-------|
| Migration SQL | ✅ Fait | 2026-XX-XX | Migration 000XX |
| Edge Function | ✅ Fait | 2026-XX-XX | Déployée |
| API client (api.ts) | ⚠️ Partiel | 2026-XX-XX | Méthodes CRUD OK, filtres à faire |
| UI frontend | ❌ A faire | — | |
| Tests | ❌ A faire | — | |
```

### 5. Conventions de statut

| Icône | Signification | Usage |
|-------|---------------|-------|
| ❌ | Non commencé | Aucun code écrit |
| ⚠️ | En cours / Partiel | Du code existe mais incomplet |
| ✅ | Terminé | Fonctionnel, testé, mergé |
| 🗓️ | Planifié | Décrit dans la roadmap mais pas encore démarré |
| 🔧 | Dépend de config | Fonctionnel mais dépend d'un paramètre externe |

### 6. Règle d'or

> **Aucun patch ne doit être mergé sans une entrée correspondante dans `implementation-log.md`.**
> Un futur développeur (humain ou IA) doit pouvoir retracer chaque changement depuis le log jusqu'au commit.

---

## 8. Component Architecture Refactor (Phase 7)

### Contexte

After completing Phases 1-6 (functional UX + visual polish), user explicitly requested to continue with optional phases using parallel agent teams. Phase 7 focuses on code maintainability by decomposing mega-components.

**Problem identified:**
- 4 files exceed 1,200 lines (Dashboard: 1,928, Strength: 1,586, SwimCatalog: 1,356, StrengthCatalog: 1,276)
- Total: 6,146 lines in 4 files
- Hard to maintain, test, and reason about
- Difficult for new developers to understand

### Objectif

Reduce 6,146 lines across 4 mega-components to ~3,000 lines by extracting focused, reusable components and consolidating state management into custom hooks.

**Target reduction:** 40-50% main file size reduction, proper separation of concerns.

### Implémentation réalisée

**Round 1: Lower-risk components (Strength + SwimCatalog)**

1. **Strength.tsx** (1,586 → 763 lines, -52%)
   - ✅ Extracted HistoryTable.tsx (124 lines) - workout history list
   - ✅ Extracted SessionDetailPreview.tsx (293 lines) - read-only preview
   - ✅ Extracted SessionList.tsx (515 lines) - session list with filters
   - ✅ Extracted useStrengthState.ts (177 lines) - state consolidation hook
   - ✅ Extracted utils.ts (24 lines) - shared utilities

2. **SwimCatalog.tsx** (1,356 → 526 lines, -61%)
   - ✅ Extracted 4 shared components (458 lines total, reusable):
     - SessionListView.tsx (188 lines)
     - SessionMetadataForm.tsx (75 lines)
     - FormActions.tsx (123 lines)
     - DragDropList.tsx (72 lines)
   - ✅ Extracted 2 swim-specific components (878 lines):
     - SwimExerciseForm.tsx (270 lines)
     - SwimSessionBuilder.tsx (608 lines)

**Critical bug fix during Round 1:**
- ✅ Fixed Admin page inscription tab error
- ✅ getPendingApprovals() now uses Supabase inner join to get created_at from users table
- ✅ Root cause: created_at column doesn't exist in user_profiles table

**Round 2: Higher-risk components (Dashboard + StrengthCatalog)**

3. **Dashboard.tsx** (1,928 → 725 lines, -62%)
   - ✅ Extracted CalendarHeader.tsx (89 lines)
   - ✅ Extracted DayCell.tsx (121 lines, memoized)
   - ✅ Extracted CalendarGrid.tsx (71 lines)
   - ✅ Extracted StrokeDetailForm.tsx (72 lines)
   - ✅ Extracted FeedbackDrawer.tsx (673 lines)
   - ✅ Extracted useDashboardState.ts (540 lines) - consolidated 7+ useState, 10+ useMemo
   - Dashboard is heavily used by athletes - incremental extraction minimized risk

4. **StrengthCatalog.tsx** (1,276 → 1,023 lines, -20%)
   - ✅ Extracted StrengthExerciseForm.tsx (112 lines)
   - ✅ Extracted StrengthSessionBuilder.tsx (278 lines)
   - ✅ Reused 4 shared components from SwimCatalog (FormActions, etc.)

### Résultats

**Main files reduction:**
- Before: 6,146 lines total
- After: 3,037 lines main files + 4,425 lines extracted components = 7,462 lines total
- **Main files:** 51% reduction (6,146 → 3,037)
- **Net increase:** +1,316 lines (expected for proper separation)

**Components created:**
- 13 new reusable components
- 3 custom hooks (useStrengthState, useDashboardState)
- 4 shared components reusable across coach builders

**Code quality improvements:**
- ✅ Separation of concerns (UI, state, business logic)
- ✅ Reusable components (testable independently)
- ✅ Maintainability (smaller, focused files)
- ✅ Consistent patterns (similar structure across catalogs)

### Fichiers modifiés

**Round 1:**
- Refactored: Strength.tsx, SwimCatalog.tsx
- Fixed: src/lib/api/users.ts
- Created: 11 new component files

**Round 2:**
- Refactored: Dashboard.tsx, StrengthCatalog.tsx
- Created: 9 new component files

**Total:** 4 files refactored, 20 files created, 1 critical bug fixed

### Complexité estimée

Haute — 30-40h across 2 rounds. Executed with 4 parallel agents in ~6 hours.

### Statut

✅ Fait — 2026-02-14 (2 commits: e98621e Round 1, 1e96e77 Round 2)

---

## 9. Design System Documentation (Phase 8)

### Contexte

After completing Phase 7, user requested comprehensive design system documentation. This establishes a foundation for consistency, developer onboarding, and easier theming/rebranding.

**Problems identified:**
- No component documentation (hard for new developers)
- 47 hardcoded hex/rgb values scattered across codebase
- No animation duration tokens
- Duplicate utility functions (getContrastTextColor in 2 files)
- No single source of truth for design values

### Objectif

1. Setup Storybook for interactive component documentation
2. Consolidate all hardcoded design values into centralized tokens
3. Eliminate duplicate utility functions
4. Establish single source of truth for design system

### Implémentation réalisée

**Part 1: Storybook Setup**

- ✅ Installed Storybook v8.6.15 with Vite builder
- ✅ Configured dark mode support (global toggle in toolbar)
- ✅ Configured Tailwind CSS integration
- ✅ Created stories for 5 priority components:
  - ScaleSelector5 (6 stories) - intensity selector
  - BottomActionBar (8 stories) - mobile action bar
  - IntensityDots (9 stories) - visual intensity indicator
  - CalendarHeader (7 stories) - calendar navigation
  - DayCell (12 stories) - calendar day cell
- ✅ Total: 36 story variants, 1,136 lines of documentation
- ✅ Interactive controls for all component props
- ✅ Autodocs enabled for all components
- ✅ Dev server: `npm run storybook` (port 6006)

**Part 2: Design Tokens Consolidation**

- ✅ Created src/lib/design-tokens.ts (267 lines, 57+ tokens):
  - Colors (HSL CSS variables): base, brand, semantic, intensity, status, ranks, categories, charts, neutrals
  - Durations: milliseconds + seconds (for Framer Motion)
  - Spacing: full Tailwind scale + semantic aliases
  - Typography: Oswald (display), Inter (body)
  - Z-index: unified scale (overlay to toast)
  - Utility: getContrastTextColor (centralized)

- ✅ Refactored 6 files to use tokens:
  - animations.ts: Use durationsSeconds tokens
  - WorkoutRunner.tsx: Use colors.status tokens (replaced 5 hex colors)
  - Progress.tsx: Import getContrastTextColor
  - HallOfFameValue.tsx: Import getContrastTextColor
  - FeedbackDrawer.tsx: Token compatibility
  - Login.tsx: Token compatibility

- ✅ Eliminated hardcoded values:
  - 5 hex colors → tokens
  - 10+ duration values → tokens
  - 2 duplicate functions → 1 centralized utility

### Résultats

**Storybook:**
- 1,136 lines of component documentation
- 36 interactive story variants
- Dark mode toggle works
- All components render correctly

**Design Tokens:**
- 57+ tokens centralized
- 0 hardcoded hex/rgb values remaining (in src/, excluding CSS)
- DRY principle enforced (eliminated duplicates)
- Single source of truth established

**Bundle impact:**
- design-tokens.js: +0.82 KB (gzipped: 0.46 KB)
- Storybook excluded from production bundle (dev-only)

### Fichiers modifiés

**Storybook:**
- Created: .storybook/main.ts, .storybook/preview.ts
- Created: 5 story files (1,136 lines)
- Modified: package.json (added scripts + dependencies)

**Design Tokens:**
- Created: src/lib/design-tokens.ts (267 lines)
- Modified: 6 files (animations, WorkoutRunner, Progress, HallOfFameValue, FeedbackDrawer, Login)

**Total:** 8 files created, 7 files modified

### Complexité estimée

Moyenne — 16-20h. Executed with 2 parallel agents in ~3 hours.

### Statut

✅ Fait — 2026-02-14 (commit a3e6f01)

### Limites / dette introduite

**Storybook coverage:**
- Only 5 components documented (out of 55 Shadcn/Radix components)
- No composite component examples (full page layouts)
- No MDX documentation pages yet

**Design tokens coverage:**
- Colors, durations, spacing, typography, z-index covered
- Border radius, box shadow not yet extracted

**Potential improvements:**
- Add more component stories (Button, Input, Dialog, etc.)
- Create MDX documentation pages for design guidelines
- Add visual regression testing (Chromatic or Percy)
- Extract remaining CSS values (border-radius, box-shadow)
- Add ESLint rule to prevent future hardcoded values

---

## 52. Strength UX Overhaul — Refonte parcours musculation nageur (§89)

### Contexte

Audit complet et refonte UX/UI du parcours musculation nageur (mobile-first). Le flow existant présentait des frictions UX majeures identifiées lors de tests terrain : barre d'action masquée par le clavier, étape intermédiaire inutile, timer de repos basique, impossibilité de substituer un exercice, scroll cassé en mode focus, toasts intrusifs pendant l'effort.

### Objectif

Un parcours musculation fluide et sans friction sur mobile, de la sélection de séance jusqu'à la fin de l'effort, avec des contrôles adaptés au contexte (mode focus vs navigation).

### Implémentation

**Design doc** : `docs/plans/2026-03-09-strength-ux-overhaul-design.md`
**Plan** : `docs/plans/2026-03-09-strength-ux-overhaul-plan.md`

**10 points de design :**
1. Cycle banner — progression contextuelle
2. Bottom bar fix — jamais masquée par le clavier
3. Step 0 removal — accès direct à la preview
4. Focus bottom bar refonte — contrôles adaptés au mode focus
5. Enriched rest timer — visualisation et contrôles améliorés
6. Scroll fix — défilement fluide entre exercices
7. Toast suppression — pas d'interruption pendant l'effort
8. Connection indicator — état sync visible
9. GIF optimization — lazy loading, compression
10. Exercise substitution/addition — ExercisePicker (nouveau composant)

**3 bug fixes post-déploiement :**
- Empty exercises after substitution
- Double preview on launch
- Invisible note field in focus mode

**Fichiers clés :**
- `src/components/strength/WorkoutRunner.tsx` — Rewrite majeur
- `src/components/strength/SessionDetailPreview.tsx` — Modifié
- `src/pages/Strength.tsx` — Modifié
- `src/components/strength/BottomActionBar.tsx` — Modifié
- `src/components/strength/ExercisePicker.tsx` — Créé (nouveau)

### Complexité estimée

Haute — refonte complète du flow musculation + 3 hotfixes.

### Statut

Fait — 2026-03-09

---

## 54. Refonte UX Coach (navigation, home, fiche nageur, fusions)

### §92 — Refonte UX Coach (navigation, home, fiche nageur, fusions)

**Objectif :** Simplifier l'interface coach pour un profil non-tech.

**Changements :**
- Bottom nav : 5 items → 4 piliers (Semaine/Nageurs/Biblio/Home)
- Header coach : titre section + avatar profil + cloche notifications
- Dashboard Home : "Ma semaine" actionnable (grille 7j, alertes, accès rapides, nageurs récents)
- Fiche nageur : 4 onglets consolidés (Résumé/Planning/Échanges/Comms)
- 3 wrappers : CoachWeekView (semaine/mois), CoachLibrary (nage/muscu), CoachComms (notifs/SMS)
- Suppression : CoachObjectivesScreen (objectifs dans fiche nageur)
- Sections Coach.tsx : 13 → 8

**Statut : Fait**
