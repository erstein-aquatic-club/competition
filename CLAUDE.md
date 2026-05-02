# Claude Code Context — Suivi Natation V2

## Projet

Application web de suivi d'entraînement (natation + musculation) pour l'Erstein Aquatic Club.
4 rôles : nageur (athlete), coach, comité, admin.

## Stack

- **Frontend** : React 19, TypeScript, Vite 7, Tailwind CSS 4, Radix UI/Shadcn (55 composants), Zustand 5, React Query 5, Wouter (hash routing)
- **Backend** : Supabase (PostgreSQL, Auth, Edge Functions Deno)
- **Déploiement** : GitHub Pages (frontend), Supabase Cloud (backend)
- **Tests** : Vitest, 31 fichiers de tests

## Architecture

- SPA avec hash-based routing (`/#/path`) pour GitHub Pages
- Persistance hybride : Supabase primary, localStorage fallback offline
- Code splitting via React.lazy + Suspense
- Feature flags dans `src/lib/features.ts` (tous activés)

## Fichiers clés

Annuaire détaillé (140+ fichiers) : **`docs/claude/files-map.md`** — à lire quand tu cherches un fichier précis.

### Hubs & orchestrateurs critiques

| Fichier | Rôle |
|---------|------|
| `src/lib/api.ts` | Façade API (stubs → 14 modules) |
| `src/lib/api/index.ts` | Re-exports centralisés |
| `src/lib/api/client.ts` | Supabase client, utilitaires |
| `src/lib/api/types.ts` | Interfaces TypeScript |
| `src/lib/auth.ts` | Gestion auth, session, rôles |
| `src/lib/schema.ts` | Schéma Drizzle (tables) |
| `src/lib/features.ts` | Feature flags |
| `src/pages/Dashboard.tsx` | Calendrier natation nageur |
| `src/pages/SwimmerHome.tsx` | Home nageur |
| `src/pages/Strength.tsx` | Module musculation nageur |
| `src/pages/Coach.tsx` | Hub coach |
| `src/pages/Admin.tsx` | Hub admin |
| `src/hooks/useDashboardState.ts` | Façade dashboard nageur |
| `src/hooks/useCoachCalendarState.ts` | État calendrier coach |
| `src/hooks/useStrengthState.ts` | État muscu |
| `supabase/tests/rls/` | Tests RLS intégration (voir `docs/rls-testing.md`) |

**Pour tout autre fichier**, lire `docs/claude/files-map.md` (annuaire complet).

## Edge Functions Supabase

| Fonction | Statut | Chemin |
|----------|--------|--------|
| `admin-user` | Fonctionnelle (ACTIVE, v97) | `supabase/functions/admin-user/` |
| `ffn-sync` | Fonctionnelle (ACTIVE, v53) — cron sync FFN | `supabase/functions/ffn-sync/` |
| `ffn-performances` | Fonctionnelle (ACTIVE, v64) — capte `club_name` depuis cellule club FFN | `supabase/functions/ffn-performances/` |
| `import-club-records` | Fonctionnelle (ACTIVE, v74) — recalc filtré sur `app_settings.home_club_name` | `supabase/functions/import-club-records/` |
| `push-send` | Fonctionnelle (ACTIVE, v33) | `supabase/functions/push-send/` |

## Documentation

Lire ces fichiers dans cet ordre pour reprendre le contexte :

1. **Ce fichier** (`CLAUDE.md`) — Vue d'ensemble rapide
2. **`docs/FEATURES_STATUS.md`** — Matrice complète des fonctionnalités (ce qui marche, ce qui manque)
3. **`docs/ROADMAP.md`** — Plan de développement futur (4 chantiers détaillés)
4. **`docs/implementation-log.md`** — Historique des implémentations
5. **`docs/patch-report.md`** — Audit UI/UX (items restants)
6. **`README.md`** — Stack, déploiement, structure

## Chantiers

**Historique complet (99 chantiers, tous livrés)** : `docs/ROADMAP.md` + `docs/implementation-log.md`.

Dernière entrée en date : §190-ui2 (SwimmerHome — compteur séances restantes sur card "Prochaine compétition". Réutilise la fonction pure `computeTrainingDaysRemaining` de `lib/date.ts` (même calcul que le bandeau du calendrier nageur). Query `["my-planned-absences"]` partagée avec Dashboard via cache react-query, gated `enabled: !!nextCompetition`. `presenceDefaults` lu depuis localStorage avec la clé `swim-dashboard-v2:${userId ?? user ?? "anon"}:presenceDefaults` écrite par Dashboard, fallback `initPresenceDefaults()` (tous les jours AM/PM ON par défaut) si le nageur n'a jamais ouvert le calendrier. Affichage `N séance(s) avant` dans la 3e ligne d'infos de la card (entre `N courses` et `Checklist X/Y`), en `font-semibold` pour souligner. `SwimmerHome.tsx` 673 → 710 LOC. 3 tests inchangés. `npx tsc` clean.)

Précédente : §190-ui (SwimmerHome — "Ma semaine" remplace "Aujourd'hui" sous Bien-être. Suppression du bloc JSX Section C "Aujourd'hui" qui affichait des cards par session du jour avec badges Fait/À faire/Lancer + état "Jour de repos". `SwimmerWeekMatrixCard` déplacée à sa place. La vue détaillée `SwimmerWeekSlots` reste en Section G. Helpers exportés `buildTodaySessionCompletionLookup` + `isTodaySessionLogged` conservés. useMemos + queries de la Section C préservés (cache priming). `SwimmerHome.tsx` ~770 → 673 LOC.)

Précédente : §190-fix3 (Card "Ma semaine" — exclure les séances muscu. Ajout du filtre `row.slot_session_type !== "swim"` dans la boucle d'indexation `byDateBucket`. Les rows strength sont ignorées dès l'indexation, ne comptent ni dans `totalSlots` ni dans `plannedPast/donePast/missedCount`. La muscu reste visible via `MyPlanWeekCard` (côté Strength). 16 tests inchangés. `npx tsc` clean.)

Précédente : §190-fix2 (Card "Ma semaine" — fix régression `log_session_id`. Le RPC `get_swimmer_sessions` migration 00132 retourne `NULL::uuid AS log_session_id` ligne 253 — il ne fait pas de jointure vers la table de sessions loggées. Côté front, `row.log_session_id != null` était toujours `false` → tous les créneaux passés assignés affichaient "ressenti manquant" (l'utilisateur a vu "2 partout" car swim + strength même bucket = 2 lignes RPC, deux flagués missed). Réintroduction de la query `api.getSessions` (clé `["sessions", userId ?? user]` partagée avec SwimmerHome → cache dedupe) + helpers locaux `buildCompletionLookup(sessions)` + `rowHasFeedback(row, lookup)` qui matche par `assignment_id` en priorité avec fallback `(date, bucket)` avec mapping FR `"Matin"/"Soir"` → `"morning"/"evening"`. `SwimmerWeekMatrixCard.tsx` 415 → 459 LOC. 16 tests inchangés. `npx tsc` clean.)

Précédente : §190-fix (Card "Ma semaine" nageur — bascule sur `get_swimmer_sessions` RPC pour résolution per-swimmer. Le §190 initial réutilisait `useSlotCalendar` (résolution group-level), affichant des slots où la séance coach était assignée à un sous-groupe ou nageur individuel ne concernant pas l'utilisateur courant. Nouvelle source : `getSwimmerSessions(userId, mondayIso, sundayIso, false)` — résolution `individual > subgroup > group` + skip `is_absent`. `SwimmerWeekMatrixCard.tsx` 434 → 415 LOC. 16 tests inchangés. `npx tsc` clean.)

Précédente : §190 (Card "Ma semaine" compacte côté nageur — NEW `src/components/shared/swimmerWeekMatrix.ts` (70 LOC, helpers purs `classifyCell` + `foldCellStates` avec 7 états : `none` / `unassigned` / `assigned-future` / `assigned-today` / `done` / `missed-feedback` / `past-no-session`). NEW `src/components/shared/SwimmerWeekMatrixCard.tsx` (grille 7j × matin/aprèm visuellement identique à la matrice coach `Coach.tsx` § B). Footer `{donePast}/{plannedPast} séances faites` + message contextuel ressentis (rose si manquants, emerald si à jour, sky si futur). Tap → `/natation`. Choix produit : conserve `SwimmerWeekSlots` détaillé en-dessous + créneau passé sans séance coach = neutre. `SwimmerHome.tsx` Section G dédoublée. 16 tests TDD.)

Précédente : §189-ext (Drawer objectif unifié Allures + Progression — extraction `EventProgressionContent` de `EventProgressionSheet`, nouveau `ObjectiveDetailSheet.tsx` (Sheet bottom, toggle [Allures|Progression] si cible allure, onglet allures → `PaceMatrixInline`, onglet progression → `EventProgressionContent`). `SwimmerObjectivesView` : suppression inline matrices + `shouldRenderInlineMatrix`, state `detailObj`+`detailMatchingTarget`, helper `openDetail`. +2 tests, −4 tests. `npx tsc` clean.)

Précédente : §188-ext (Sync auto allures ↔ objectifs (§188 extension) — auto-upsert cible allure quand coach sauvegarde un objectif chrono parseable + rattrapage rétroactif au mount. `shouldAutoSyncToPaceTarget` pur dans `objective-pace-link.ts`. `autoSyncPaceTarget` exporté depuis `SwimmerObjectivesTab.tsx`. `syncedForAthleteRef` correctif multi-nageur. +8 tests. `npx tsc` clean.)

Précédente : §188 (Lier objectifs nageur ↔ allures — bouton "→ Allures" 1-clic sur `ObjectiveCard` côté coach (context=coach, désactivé si event_code non-parsable ou temps null) ; handoff via `sessionStorage` (`pace-prefill-handoff.ts`) ; `CoachPaceCalculatorScreen` consomme le prefill au mount via `selectAccordionTargetForPrefill` + `useEffect`, ouvre l'accordéon du nageur et upsert/affiche la cible. Côté nageur : `findMatchingTarget` (pure) + hook `useTargetForObjective` ; `PaceMatrix` reçoit prop `compact` pour masquer le pool toggle ; `PaceMatrixInline` (wrapper compact, nage par alias FR) affiché sous chaque `ObjectiveCard` si match `(swimmer, stroke, distance, pool)` dans `SwimmerObjectivesView`. Aucune migration DB. 13 tests TDD, `npx tsc` clean.)

Précédente : §189 (Chrono setup — équipe coach par défaut + vagues auto par ligne — `src/components/chrono/ChronoSetup.tsx`. Refonte tabs `"club"|"manuals"` → `"team"|"club"`, défaut `"team"`. L'onglet "Mon équipe" liste manuels (section "Mémorisés" en tête, delete inline) + comptes rattachés (groupés par `group_label`). L'onglet "Tout le club" (`disabled` si `allAthletes.length === athletes.length`) remplace l'ex-Switch `showAll`. Recherche partagée filtre simultanément manuels et accounts. NEW `computeNextWave(lane)` = `min(swimmersInLane.length + 1, maxWaves)` utilisé par `handleAddSwimmer` ET `handleAddManual` (extrait de `ManualsTabBody`) à la place du `wave: 1` hardcodé : 1er → V1, 2e → V2, etc., capé maxWaves (2 mobile / 6 desktop). `ManualsTabBody` (107 lignes) supprimé — logique inlinée dans le parent. Imports nettoyés (`Switch`, `useQuery`, `useRef`, `X`). `npx tsc` clean, tous les tests chrono verts.)

Précédente : §186 (Pace Model v2 — refonte non-linéaire du moteur d'allures, rétrospectif. Modèle linéaire §184/§185 → `t_allure(d) = (Tobj × R_base × A_nage + Δ_mesure) / k_allure` du doc métier. 3 migrations DB prod : `00151_pace_model_v2` (DROP+recréation `coach_pace_zones` schema v2 multi-row family×zone + nouvelle table `coach_stroke_adjustments`) ; `00152_pace_share_payload_v2` (RPC zones_v2 jsonb) ; `00153_pace_team_coach_visibility` (RPC `list_manual_swimmers_for_coach`). NEW `paceCalculatorV2.ts` (238 LOC moteur pur), `paceData.ts` (96 LOC R_base/A_nage/k_allure), `Pace4NSegmentMatrix.tsx` (269 LOC), `PaceStrokeAdjustments.tsx` (238 LOC drawer mS), `PdfExportDialog.tsx` (116 LOC), `pdfPalette.ts` (57 LOC), `AddSwimmerToTeamDialog.tsx` (233 LOC refonte Mon équipe). Refonte `PaceMatrix.tsx` (194→268, V4 conditionnel) + `PaceZonesSettings.tsx` (343, schema v2) + `SwimmerPaceCard.tsx` (244, sous-accordions) + `CoachPaceCalculatorScreen.tsx` (220, sélecteur coach) + `SharedPaceMatrix.tsx` + `export-pace-pdf.ts` (906, branding EAC + bassin d'origine). API `pace-zones` v2 + `pace-stroke-adjustments` (49) + `coaches.ts` (30). Hooks `useCoachPaceZonesV2` (71) + `useCoachStrokeAdjustments` (60) + `useTeamForCoach` dans `useMyTeam`. 30+ commits `feat(pace-v2):`, +5337/-773 LOC, 49 fichiers, déployé Pages.)

Précédente : §185 (Bassin 50m/25m sur les cibles d'allures — migration `00150_pace_targets_pool_size` : `target_pool_size text NOT NULL DEFAULT '50m'` sur `coach_pace_targets` + `upsert_pace_target` recréé avec `p_pool_size DEFAULT '50m'` + `get_pace_share_payload` inclut `swimmer_sex`. NEW `src/lib/poolConversion.ts` : table FFN 17 entrées sex-dépendant + `convertTargetTime` + `getPoolMajorationMs` + `FFN_DISCLAIMER`. `PaceTargetForm.tsx` : toggle [50m|25m] inline. `PaceMatrix.tsx` : toggle bassin avec état local `viewPool` + Tooltip disabled + conversion via `convertTargetTime()` + footer disclaimer. `SwimmerPaceCard.tsx` / `CoachPaceCalculatorScreen.tsx` / `SharedPaceMatrix.tsx` / `export-pace-pdf.ts` : passent `target_pool_size` et `swimmerSex`. Phase 10 RLS : 4 nouveaux fichiers de tests, `asAnon()` dans `_helpers.ts`, `schema.sql` mis à jour.)

Précédente : §183 (Export PDF séance pour les nageurs — Refacto `src/lib/export-session-pdf.ts` : remplacement du paramètre `SlotInstance` (typé coach uniquement) par un type générique exporté `SessionHeaderInfo` `{ date, timeRange?, location?, groups?, filenameSlug? }`. `drawMetadataBand` consomme la nouvelle shape avec ignore gracieux des valeurs nulles. Helper `formatTime` renommé en export `formatTimeForPdfHeader`. Nom de fichier dérivé du slug optionnel ou fallback `seance-{YYYYMMDD}.pdf`. `SlotSessionSheet.tsx` (coach) : adapté l'appel existant (mappe `SlotInstance` → `SessionHeaderInfo`, conserve slug `coach-seance-{YYYYMMDD}` pour ne rien casser côté UX coach). `SwimSessionView.tsx` (nageur) : nouveau bouton `FileDown` dans la toolbar à côté du `ShareMenu` (visible uniquement si `assignment` résolu), handler `handleExportPdf` fetch `getSwimSessionById(session_id)` via React Query (clé `["swim-session-preview", sessionId]` partagée avec le coach), mapping `assigned_slot` → "Matin"/"Soir" (pas d'horaire précis dispo nageur), pas de `location`/`groups`. Spinner `Loader2` + toast destructif sur erreur, `setExportingPdf(false)` dans `finally`. Bouton absent dans `SharedSwimSession` par choix produit. Aucun nouveau fichier code. `npx tsc --noEmit` clean, `npm test` 367 pass + 1 fail pré-existant non lié (`transformers.test.ts`).)

Précédente : §182 (Rattrapage tests RLS reportés post-audit robustesse — Phase 1 : fix 5 tests cassés dans `strength_planning.test.ts` cause `asUser` rollback systématique, solution seeds `asServiceRole` + refactor idempotent upsert en transaction unique. Phase 2A : porter migration 00145 `assignments_write` split insert/update/delete dans `supabase/tests/schema.sql` + 7 tests cross-coach (Eve id=5 attaque Carol id=3) dans `session_assignments.test.ts`. Phase 2B : nouvelle fonction stub `_test_save_strength_run_authz` dans test schema (mirror exact migration 00146 IF blocks) + NEW `supabase/tests/rls/save_strength_run_authz.test.ts` (171 LOC, 11 tests). RLS suite 120/125 → 143/143 (+18 tests, 0 régression). Phase 3 reportée §183+ (chrono_records, one_rm_records, push_subscriptions, pain_reports, strength_session_runs cross-athlete, slot_assignments §173 Task 13).)

Précédente : §181 (UX polish post-audit consolidé Opus — WorkoutRunner Replace/Exit buttons h-8→h-10 (40 px), difficulty buttons h-9→h-11 (44 px Apple HIG). SlotSessionSheet sticky CTA py-3→py-3.5. navItems.ts coach/admin 6→5 items (Profil retiré, accessible via avatar UserCircle ajouté dans le sticky header coach de AppLayout.tsx). CoachCommentsScreen markReadMutation passe en optimistic update (onMutate cancelQueries+setQueryData unreadCount=0/is_read mapping, onError rollback prev, onSettled invalidate) → badge home disparaît immédiatement, plus de lag 1-2 s. SlotSessionSheet split_distance window.confirm → AlertDialog Radix (state splitDistanceAlertOpen + Promise resolver dans splitDistanceConfirmRef, 2 boutons Annuler + Assigner quand même destructive). AppLayoutLogic.test.ts assertions mises à jour (5 items, Profil exclu). 367 pass, 1 fail pré-existant transformers.test.ts non lié.)

Précédente : §180 (Foreground push bridge in-app — Service Worker `push-handler.js` envoie `postMessage({type:'eac-push', payload})` aux clients focused (§174 P2) mais aucun listener React ne le consommait → notifs foreground silencieuses. NEW `src/hooks/useInAppPushBridge.ts` (69 LOC) hook qui s'abonne à `navigator.serviceWorker.addEventListener('message', ...)`, filtre type `eac-push`, déclenche un toast (`useToast`) et invalide React Query `['notifications']` + `['coach-comments-recent-48h']`. Garde-fous SSR + no-SW. Monté dans App.tsx via wrapper PushBridge component (pattern DarkModeApplier/CacheWarmer). 5/5 tests passants.)

Précédente : §179 (Coach hardening résiduel — `StrengthCatalog.tsx` createSession mutation reçoit `onError: () => setAssignAfterSaveId(null)` pour éviter qu'un échec de création laisse l'state armé vers un targetId stale. `assignments.ts` rollback notif orpheline (DELETE notification après échec target insert §173) wrappé dans try/catch dédié — préserve la traçabilité du targetError.message original si le DELETE échoue lui-même. Test "rollback delete failure does not mask targetError" ajouté. Migration 00147 `assigned_by` WITH CHECK reportée — nécessite tests RLS Docker.)

Précédente : §178 (Auth hardening — `auth.ts` loadUser + handleAuthEvent hydratent `lastRefreshAt` depuis `session.expires_at * 1000 - 3600_000` au lieu de `Date.now()` à l'init module → le check elapsed > 50 min sur visibilitychange évalue contre l'âge réel du token, pas le module load time. visibilitychange listener reset `consecutiveRefreshFailures = 0` + update `lastRefreshAt` sur succès — cohérence avec le timer L473, évite signOut prématuré après visibilitychange réussi suivi d'échec timer. +2 tests sur auth-state.test.ts.)

Précédente : §177 (Reconcile timeout agrégé + parallèle — `reconcileStrengthRunLogs` wrappé dans `withTimeout(Promise.allSettled(...), 30_000, "reconcile-batch")` → budget global 30 s sur le batch parallèle au lieu de N×10s séquentiels. `Strength.tsx onFinish` : `catch` typé avec branchement `isTransientError` (transient → enqueue + summary, non-transient → toast destructif rester sur WorkoutRunner). `setIsFinishing(false)` déplacé en `finally` (était `catch` only — bouton restait disabled sur erreur non-transiente). NEW `reconcileTimeout.test.ts` (3 tests via `mock.module`).)

Précédente : §176 (Fix PWA update gate régression — `UpdateNotification` refonte : suppression auto-reload 10 s, ajout bouton "Plus tard" (ghost dismiss), bouton "Recharger" (primary explicite), guard focus-mode via `useStrengthState().activeRunId` + `useRef<boolean>` pendingUpdateDuringFocus pour re-trigger dès fin de WorkoutRunner. `OfflineDetector` décalé `top-3→top-12` pour stagger position. 9 nouveaux tests logique pure.)

Précédente : §173 (Audit robustesse chemin critique COACH — login → builder → assign → comms : 15 défauts P0/P1/P2 corrigés sur 8 commits, branche `chantier/171-coach-critical-path-hardening`. P0 : garde `groupIds=[]` dans `bulkCreateSlotAssignments` (défense en profondeur API + validation client `visibleFrom > scheduledDate` en miroir du CHECK 00088) ; rollback notif orpheline dans `assignments_create` (DELETE notification si `notification_targets` insert échoue) ; rollback observable du `quickComposeMutation` (console.error sur orphan + suffix toast informe le coach qu'une intervention manuelle est requise). P1 : `markRead` idempotent dans `CoachCommentsScreen` via `useRef<Set<sessionId>>` (évite write spam toutes les 2 min via invalidation `coach-comments-recent-48h`) ; double-tap guard synchrone `submittingRef` sur "Créer & assigner" et "Bibliothèque" du `SlotSessionSheet` (évite double mutation iOS fast-tap) ; sticky CTA QuickCompose + helper text `visible_from` ("publier immédiatement" vs "programmer pour plus tard") + confirm bloquant si `split_distance` détecté (perte de mètres) + `key={slot.id+date}` remount complet du sheet à chaque changement d'instance (évite state leak `selectedGroups`) ; garde dossier supprimé dans `SwimCatalog.handleMoveToFolder` (`allFolders.includes(folder)`) ; bouton "Enreg. & assigner" dans `StrengthSessionBuilder` via `FormActions.onSaveAndAssign` + dialog inline `<AssignAthleteSelect>` + chaînage `createSession.onSuccess → assignments_create` (5+ taps → 3 pour créer une séance muscu et l'assigner à un nageur). P2 : `Dialog` Radix au lieu de `window.prompt` pour création dossier muscu (focus auto, validation Enter) ; reset `warmup_reps`/`warmup_duration` quand l'exercice repasse en `strength` (évite champs orphelins persistés) ; refactor `DragDropList → OrderedList` (le composant n'avait pas de DnD réel, 0 callsite externe). Plan TDD dans `docs/plans/2026-04-26-coach-critical-path-hardening-plan.md`. Tests : 333 → 336 (+2 gardes assignments + 1 Save & Assign), 0 régression. 4 tests RLS additionnels (Task 13 du plan : `chk_visible_from_before_date`, isolation cross-coach, `idx_sa_unique_slot_group_v2`) reportés au prochain run avec Docker démarré).

Pour ajouter un nouveau chantier, suivre le workflow § "Workflow de documentation obligatoire" ci-dessous.

## Workflow de documentation obligatoire

Chaque session de développement doit suivre ce protocole (détail complet dans `docs/ROADMAP.md` § "Règles de documentation") :

1. **Avant** : Lire `CLAUDE.md` → `docs/ROADMAP.md` (chantier ciblé) → `docs/FEATURES_STATUS.md`
2. **Pendant** : Ajouter une entrée dans `docs/implementation-log.md` pour chaque patch (contexte, changements, fichiers modifiés, tests, décisions, limites)
3. **Après** : Mettre à jour les 4 fichiers de suivi :
   - `docs/ROADMAP.md` — statut du chantier (A faire → En cours → Fait) **+ ligne `*Dernière mise à jour*` en tête du fichier**
   - `docs/FEATURES_STATUS.md` — statut des features impactées (❌ → ⚠️ → ✅)
   - `docs/implementation-log.md` — entrée déjà ajoutée au §2
   - `CLAUDE.md` — voir règles ci-dessous

### Règles de mise à jour de CLAUDE.md (obligatoires)

L'annuaire `docs/claude/files-map.md` et la section "Chantiers" dérivent rapidement si on ne les met pas à jour à chaque patch. À la fin de chaque § :

1. **Annuaire de fichiers** — pour CHAQUE fichier touché par le patch :
   - **Nouveau fichier** créé ≥ 150 lignes OU jouant un rôle architectural → **ajouter une ligne** dans `docs/claude/files-map.md`, avec : chemin exact, rôle en 1 phrase, taille mesurée via `wc -l`.
   - **Fichier existant** dont la taille a varié de **> 30 %** → **mettre à jour la taille** dans `docs/claude/files-map.md`.
   - **Fichier supprimé/renommé** → **mettre à jour** `docs/claude/files-map.md`.
   - **Hubs/orchestrateurs critiques** (nouveau module API majeur, nouvelle page principale) → aussi mettre à jour le petit tableau de `CLAUDE.md` § "Hubs & orchestrateurs critiques".
   - **Ne jamais inventer de taille.** Si pas mesurée, ne pas écrire de chiffre.

2. **Pour chaque § ajouté à `implementation-log.md`** : ajouter une ligne dans `docs/ROADMAP.md` (plus dans CLAUDE.md). Mettre à jour la phrase "Dernière entrée en date : §N" dans CLAUDE.md § "Chantiers".

3. **Edge Functions** — si une Edge Function est ajoutée/supprimée/renommée dans `supabase/functions/`, mettre à jour la table "Edge Functions Supabase".

> **Règle d'or : aucun patch sans entrée dans `implementation-log.md` ET sans mise à jour correspondante de CLAUDE.md (fichiers clés + chantier).**

## Migrations Supabase

**IMPORTANT : Toujours appliquer les migrations via le MCP Supabase (`mcp__plugin_supabase_supabase__apply_migration`), jamais via `supabase db push` ou le dashboard.**

- Le projet ID est `fscnobivsgornxdwqwlk` (EAC Databases, région eu-west-1)
- Les policies RLS utilisent les helpers `app_user_role()` et `app_user_id()` — ne PAS utiliser `auth.uid()` directement dans les subqueries
- Toujours créer le fichier SQL dans `supabase/migrations/` ET l'appliquer via MCP dans la même session
- Convention de nommage : `00XXX_<nom_descriptif>.sql` (incrémenter le numéro)

## Déploiement

**IMPORTANT : Ne JAMAIS déployer localement avec `npx gh-pages -d dist`.**

Le déploiement se fait exclusivement via **GitHub Actions** (`.github/workflows/pages.yml`). Les credentials Supabase (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`) sont stockées dans les **GitHub Secrets** et injectées au build par le workflow CI/CD. Un build local n'a pas ces variables → l'app affiche "Supabase not configured".

**Comment déployer :**
1. Pousser sur `main` → le workflow se lance automatiquement
2. Ou déclencher manuellement : `gh workflow run "Deploy to GitHub Pages"`

**Ne PAS faire :**
- `npx gh-pages -d dist` (écrase le déploiement avec un build sans credentials)
- `npm run build && deploy` localement (même problème)

## Cache bust

L'application est servie sur GitHub Pages avec les meta tags `apple-mobile-web-app-capable`. Les navigateurs (surtout Safari iOS) cachent agressivement `index.html`.

**Mécanisme en place :**
- `index.html` contient les meta tags `Cache-Control: no-cache, no-store, must-revalidate`
- `vite.config.ts` injecte `__BUILD_TIMESTAMP__` automatiquement à chaque build (visible dans la console navigateur)
- Les assets JS/CSS ont des content hashes automatiques (Vite default)

**Règle obligatoire** : À chaque patch/déploiement, vérifier que :
1. Le build timestamp est bien injecté (vérifier dans la console : `[EAC] Build: <date>`)
2. Si un changement ne se reflète pas après déploiement, demander aux utilisateurs de vider le cache ou faire un hard refresh (Ctrl+Shift+R)
3. Ne jamais ajouter de service worker sans mécanisme de mise à jour automatique (risque de cache permanent)

## Points d'attention

- `api.ts` a été refactoré de ~2277 à ~426 lignes — 7 modules extraits dans `src/lib/api/` (strength, records, users, assignments, notifications, timesheet, swim)
- Le routing est hash-based (`useHashLocation` de Wouter) — les URLs sont `/#/path`
- L'inscription utilise `supabase.auth.signUp()` avec metadata (name, birthdate, group_id)
- Un trigger PostgreSQL (`handle_new_auth_user`) crée automatiquement les entrées `users`, `user_profiles`, `group_members` à l'inscription
- Les migrations sont dans `supabase/migrations/`
- Le fallback localStorage est activé quand Supabase n'est pas disponible

## Agents & coût — règles anti-hallucination

Un agent spawné coûte **~20x plus** qu'un Grep/Glob direct (contexte dupliqué + appels internes cumulés). Règles :

- **Grep/Glob/Read directs** pour toute recherche simple (fichier, symbole, signature). Agents = recherches multi-étapes uniquement.
- **Prompts d'agents** : donner des **chemins précis**, demander **fichier + ligne** en retour, **scope étroit**.
- **Vérifier avant d'agir** : avant d'éditer ou de rapporter un fait précis à l'utilisateur, confirmer avec un Read/Grep que le fichier/symbole existe réellement. Ne pas re-vérifier ce qui est déjà connu (tableau "Fichiers clés", info non actionnable).
- **Résultats contradictoires** entre agents → trancher dans le code source directement.

## Commandes

```bash
npm install          # Installation
npm run dev          # Dev server (localhost:8080)
npm run build        # Build production
npm test             # Tests Vitest
npm run test:rls     # Tests RLS intégration (nécessite Docker + supabase start — voir docs/rls-testing.md)
npx tsc --noEmit     # Type check
```

## Tests RLS intégration (§121)

Tests contre un Postgres local pour attraper les régressions de policies silencieuses (type §113 : DELETE no-op pris pour un succès). Harness complet dans `supabase/tests/rls/` avec schéma hand-crafted minimal (pas de replay des 108 migrations prod — schema drift trop important).

**Setup** (une fois) : Docker Desktop + `brew install supabase/tap/supabase libpq`, puis `supabase start`.

**Documentation complète** : `docs/rls-testing.md` (setup, API du harness, ajout d'un test, pièges fréquents, relation avec migrations prod).

### Règles d'usage pour Claude (obligatoire)

**Quand lancer `npm run test:rls` :** uniquement si le patch touche à **au moins un** des éléments suivants :

1. **Migration SQL** qui modifie une policy RLS (`CREATE/ALTER/DROP POLICY`) ou une table sous RLS (`ALTER TABLE ... ENABLE/DISABLE ROW LEVEL SECURITY`).
2. **Helpers auth** : `app_user_id()`, `app_user_role()`, `auth.uid()` ou équivalents (toute fonction SQL qui alimente les clauses `USING`/`WITH CHECK`).
3. **Wrapper API JS** dans `src/lib/api/*.ts` qui ajoute/modifie un appel Supabase pour une table sous RLS, **si la nouvelle logique peut dépendre du rôle appelant** (ex: nouveau CRUD coach/athlète, nouveau `.select()` qui suppose filtrage serveur).
4. **Schéma de test** lui-même : modification de `supabase/tests/schema.sql` ou `seed.sql`.
5. **Debug ciblé** : l'utilisateur soupçonne une régression RLS sur une feature existante et demande explicitement de reproduire.

**Quand NE PAS lancer :**

- Modifications purement UI/UX (composants React, Tailwind, CSS, routing, typage).
- Ajout/modif de helpers purs (`src/lib/*.ts` non-API).
- Fix de bug JS sans relation avec les permissions (mémoïsation, effet, state).
- Refactor interne d'un module API qui **ne change pas** la logique d'autorisation.
- Tests `npm test`, `npm run test:e2e`, type check — qui tournent vite et n'ont pas besoin de Docker.

**Docker n'est pas démarré par Claude automatiquement.** Avant de lancer `supabase start` ou `npm run test:rls`, Claude doit :

1. Vérifier si Docker tourne : `docker ps` (silencieux si OK, erreur sinon).
2. **Si Docker n'est pas lancé**, **demander à l'utilisateur** de lancer Docker Desktop manuellement et **attendre confirmation** avant de continuer. Ne pas tenter `open -a Docker` sans permission explicite — le user contrôle ses ressources système.
3. Si Docker tourne mais `supabase start` n'a pas été exécuté, lancer `supabase start` directement (zéro risque, juste du démarrage de containers).

**Si un test échoue :** ne pas commit, diagnostiquer via `docs/rls-testing.md § Débugger`.

### Économie de tokens (obligatoire)

Coûts mesurés — chaque token gaspillé est un token en moins pour le raisonnement :

| Action | Tokens (~) | Règle |
|---|---|---|
| `docker ps` | 690 | **1× par session max.** Si déjà vérifié et OK, ne pas re-vérifier. Retenir le résultat. |
| `npm run test:rls` output | 300 | OK si critères ci-dessus remplis. **Jamais "pour vérifier" sur un patch UI.** |
| `supabase start` | 750 | **1× par session.** Si containers déjà up (docker ps OK), ne pas relancer. |
| Lire 1 fichier test (~170 LOC) | 1 700 | **Uniquement si on le modifie.** Ne pas lire "pour comprendre" si on ne touche pas aux tests. |
| Lire TOUS les fichiers test | 23 000 | **INTERDIT** sauf demande explicite de l'utilisateur ou audit global. Lire uniquement le fichier ciblé. |
| Lire `docs/rls-testing.md` | 2 600 | **Uniquement pour debug** d'un test qui échoue ou ajout d'un nouveau test. Pas pour un simple run. |
| Lire `supabase/tests/schema.sql` | 4 800 | **Uniquement si on ajoute une table/policy au schéma de test.** Pas pour un simple run. |

**Règle générale** : le workflow normal (patch RLS → run tests → commit) coûte **~990 tokens** (docker ps + test output). Toute lecture de fichier test supplémentaire doit être justifiée par un besoin concret (modification, debug, ajout).

### Gestion stricte du Contexte et des Sessions (NOUVEAU)

L'utilisation de Claude Code consomme très vite le quota quotidien parce que le contexte de la session grossit à chaque question. **Il est vital de suivre cette hygiène** :

1. **Cycle de vie court des sessions et Auto-nettoyage (IMPORTANT)**
   - L'accumulation d'historique coûte extrêmement cher en tokens. 
   - **Règle absolue pour toi (Claude)** : Dès que tu as validé un plan d'implémentation complet ou passé un jalon majeur sur une tâche, tu DOIS vider ou compacter ton contexte de manière totalement autonome sans demander d'intervention à l'utilisateur. 
   - Utilise l'outil ou la commande appropriée à ta disposition (par ex. commande interne de compactage ou exécution autonome d'un vidage avec résumé).
   - Assure-toi de garder en mémoire courte l'objectif principal et la référence au fichier de suivi (ex: `docs/ROADMAP.md`) lors du vidage pour ne pas perdre le fil. Ne notifie l'utilisateur que pour confirmer la complétion de la tâche et ton avancement, sans lui demander de taper de commandes de maintenance.

2. **Choix du Modèle (Scaling) pour Claude Code**
   - `claude --model claude-3-haiku-20240307` (ou alias `haiku`) : À utiliser en priorité pour des petits refactorings, des alignements visuels Tailwind, de l'édition d'un seul fichier, ou la rédaction d'un log. C'est presque gratuit.
   - `claude` (par défaut Sonnet/Opus) : À réserver UNIQUEMENT pour les tâches où l'agent doit arpenter de nombreux fichiers, pour le design architectural global, ou la résolution d'un bug incompréhensible nécessitant une grande compréhension systémique.

3. **Environnement purifié via `.claudeignore`**
   Un fichier `.claudeignore` est désormais en place (ignorant `dist`, `node_modules`, `public`, `.git`, etc.) pour empêcher le glob/grep de siphonner des fichiers minifiés ou massifs non pertinents. Ne pas le supprimer. S'il y a un dossier lourd temporaire, ajoutez-le.
