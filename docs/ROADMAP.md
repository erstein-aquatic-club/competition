# Roadmap de Développement

*Dernière mise à jour : §192 livré — Ajout objectif inline sur la vue info compétition. Sheet bottom à 2 onglets (Créer/Lier) ouvert depuis l'empty state ("Ajouter un objectif") ou le header de section (bouton "+ Objectif"). L'onglet "Créer" reproduit le form du profil avec `competition_id` pré-rempli ; l'onglet "Lier" radio-sélectionne un objectif sans comp et appelle `updateObjective(id, { competition_id })`. Helper pur `selectLinkableObjectives` (4 tests TDD). `useQuery(["auth-uid"])` dans CompetitionDetail pour récupérer l'UUID auth (fix §191). §187 (slider affinement) designé mais pas livré. (2026-05-04)*

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
| 36 | Quiz neurotype nageur (profil d'entraînement) | Moyenne | Moyenne | Fait (§71) |
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
