# Claude Code Context — Suivi Natation V2

## Projet

Application web de suivi d'entraînement (natation + musculation) pour l'Erstein Aquatic Club.
4 rôles : nageur (athlete), coach, comité, admin.

## Stack

- **Frontend** : React 19, TypeScript, Vite 7, Tailwind CSS 4, Radix UI/Shadcn (55 composants), Zustand 5, React Query 5, Wouter (hash routing)
- **Backend** : Supabase (PostgreSQL, Auth, Edge Functions Deno)
- **Déploiement** : GitHub Pages (frontend), Supabase Cloud (backend)
- **Tests** : Vitest, 27 fichiers de tests

## Architecture

- SPA avec hash-based routing (`/#/path`) pour GitHub Pages
- Persistance hybride : Supabase primary, localStorage fallback offline
- Code splitting via React.lazy + Suspense
- Feature flags dans `src/lib/features.ts` (tous activés)

## Fichiers clés

| Fichier | Rôle | Taille |
|---------|------|--------|
| `src/lib/api.ts` | Façade API (stubs → modules) | ~893 lignes |
| `src/lib/api/types.ts` | Interfaces TypeScript (sessions, strength, users, comps, wellness, cycles, challenges, achievements, pain) | ~994 lignes |
| `src/lib/api/client.ts` | Supabase client, utilitaires | ~316 lignes |
| `src/lib/api/transformers.ts` | Fonctions de transformation strength | ~228 lignes |
| `src/lib/api/helpers.ts` | Fonctions de mapping | ~161 lignes |
| `src/lib/api/localStorage.ts` | Stockage local fallback | ~119 lignes |
| `src/lib/api/index.ts` | Re-exports centralisés | ~416 lignes |
| `src/lib/api/strength.ts` | Exercices, sessions, runs, logs, 1RM | ~1399 lignes |
| `src/lib/api/records.ts` | Hall of fame, records club, perfs, FFN | ~631 lignes |
| `src/lib/api/users.ts` | Profil, athlètes, approbation | ~450 lignes |
| `src/lib/api/assignments.ts` | Assignments CRUD (sessions, slots, tracking) | ~1015 lignes |
| `src/lib/api/notifications.ts` | Notifications CRUD | ~261 lignes |
| `src/lib/api/timesheet.ts` | Pointage heures CRUD | ~326 lignes |
| `src/lib/api/swim.ts` | Catalogue nage, sessions, partage public | ~416 lignes |
| `src/lib/api/wellness.ts` | Wellness checks + scoring readiness | ~84 lignes |
| `src/lib/api/challenges.ts` | CRUD challenges | ~118 lignes |
| `src/lib/api/achievements.ts` | CRUD achievements | ~55 lignes |
| `src/lib/api/painReports.ts` | CRUD pain reports | ~69 lignes |
| `src/lib/api/audit.ts` | Logs d'audit | ~32 lignes |
| `src/lib/api/notificationLog.ts` | Logs notifications envoyées | ~26 lignes |
| `src/lib/api/swim-planning.ts` | Planification séances natation | ~44 lignes |
| `src/lib/api/swim-filieres.ts` | Gestion filières natation | ~27 lignes |
| `src/components/swim/ExerciseLogInline.tsx` | Formulaire inline saisie technique par exercice (§58) | ~294 lignes |
| `src/pages/SharedSwimSession.tsx` | Page publique séance partagée (token UUID) | ~130 lignes |
| `src/lib/api/swim-logs.ts` | Notes techniques exercices natation | ~90 lignes |
| `src/lib/api/temporary-groups.ts` | CRUD groupes temporaires (stages) | ~300 lignes |
| `src/lib/api/competitions.ts` | CRUD compétitions + assignations nageurs | ~105 lignes |
| `src/lib/api/absences.ts` | CRUD absences planifiées nageur | ~90 lignes |
| `src/lib/api/objectives.ts` | CRUD objectifs par nageur | ~90 lignes |
| `src/lib/api/training-slots.ts` | CRUD créneaux d'entraînement récurrents | ~200 lignes |
| `src/lib/swimTextParser.ts` | Parser texte → SwimBlock[], normaliseurs partagés | ~400 lignes |
| `src/lib/swimConsultationUtils.ts` | Helpers partagés consultation séance (BlockGroup, groupItemsByBlock) | ~197 lignes |
| `src/components/swim/SwimSessionTimeline.tsx` | Timeline verticale colorée, rail intensité, toggle 3 niveaux | ~555 lignes |
| `src/lib/auth.ts` | Gestion auth, session, rôles | ~444 lignes |
| `src/lib/supabase.ts` | Client Supabase | ~70 lignes |
| `src/lib/features.ts` | Feature flags | 5 lignes |
| `src/lib/schema.ts` | Schéma Drizzle (tables) | |
| `src/pages/SwimmerHome.tsx` | Home nageur (wellness, séances jour, compétition, accès rapides) | ~710 lignes |
| `src/pages/Dashboard.tsx` | Calendrier natation nageur (ex-Accueil, route /natation) | ~1055 lignes |
| `src/pages/Strength.tsx` | Module musculation nageur | ~921 lignes |
| `src/pages/coach/SwimCatalog.tsx` | Catalogue séances nage (coach) | ~1003 lignes |
| `src/pages/coach/StrengthCatalog.tsx` | Builder muscu (coach) | ~1463 lignes |
| `src/pages/Records.tsx` | Records personnels + FFN sync | ~1376 lignes |
| `src/pages/RecordsClub.tsx` | Records club (sections nage, drill-down progressif) | ~840 lignes |
| `src/pages/RecordsAdmin.tsx` | Admin records + gestion nageurs | ~300 lignes |
| `src/pages/Login.tsx` | Login + inscription | ~340 lignes |
| `src/pages/coach/CoachCalendar.tsx` | Calendrier coach (vue mensuelle assignations) | ~266 lignes |
| `src/hooks/useCoachCalendarState.ts` | Hook état calendrier coach (grille, query, slots) | ~187 lignes |
| `src/pages/coach/CoachSwimmersOverview.tsx` | Dashboard synthétique nageurs (grille cards, KPIs) | ~648 lignes |
| `src/pages/coach/CoachSwimmerDetail.tsx` | Page fiche nageur (4 onglets consolidés: Résumé/Planning/Échanges/Comms) (§92) | ~120 lignes |
| `src/pages/coach/SwimmerFeedbackTab.tsx` | Onglet ressentis (liste chronologique sessions) | ~120 lignes |
| `src/pages/coach/SwimmerObjectivesTab.tsx` | Onglet objectifs CRUD (chrono + texte) | ~574 lignes |
| `src/pages/coach/CoachGroupsScreen.tsx` | UI gestion groupes temporaires (stages) | ~1012 lignes |
| `src/pages/coach/CoachCompetitionsScreen.tsx` | UI compétitions coach + assignations + SMS | ~834 lignes |
| `src/pages/coach/CoachWeekView.tsx` | Wrapper toggle semaine/mois (calendrier unifié) (§92) | ~80 lignes |
| `src/pages/coach/CoachLibrary.tsx` | Wrapper tabs bibliothèque nage/muscu (§92) | ~60 lignes |
| `src/pages/coach/CoachComms.tsx` | Wrapper tabs notifications/SMS (§92) | ~60 lignes |
| `src/lib/api/planning.ts` | CRUD macro-cycles + semaines | ~200 lignes |
| `src/lib/api/interviews.ts` | CRUD entretiens + transitions multi-phases | ~200 lignes |
| `src/pages/coach/SwimmerPlanningTab.tsx` | Onglet planification fiche nageur (timeline cycles) | ~844 lignes |
| `src/pages/coach/SwimmerInterviewsTab.tsx` | Onglet entretiens fiche nageur (workflow multi-phases) | ~1193 lignes |
| `src/components/profile/AthleteInterviewsSection.tsx` | Entretiens côté nageur (formulaire, signature, historique) | ~320 lignes |
| `src/components/shared/FolderCard.tsx` | Composant partagé dossiers (Radix Collapsible, variant root/nested, slot actions) (§125) | ~61 lignes |
| `src/components/shared/SessionRow.tsx` | Composant partagé ligne de séance (slots badge/trailing) (§125) | ~49 lignes |
| `src/components/shared/ObjectiveCard.tsx` | Composant partagé objectifs (ring SVG, grid 2x2, compact) | ~260 lignes |
| `src/lib/objectiveHelpers.ts` | Helpers partagés objectifs (FFN_EVENTS, formatTime) | ~40 lignes |
| `src/lib/imageUtils.ts` | Compression image Canvas (avatar upload, WebP/JPEG ≤200KB) | ~95 lignes |
| `src/components/profile/SwimmerObjectivesView.tsx` | Vue objectifs nageur (lecture coach + CRUD perso) | ~530 lignes |
| `src/pages/coach/CoachSmsScreen.tsx` | Écran SMS généraliste coach (groupe/nageur) | ~190 lignes |
| `src/pages/coach/CoachTrainingSlotsScreen.tsx` | Écran gestion créneaux d'entraînement (coach) | ~2839 lignes |
| `src/pages/coach/SlotSessionSheet.tsx` | Bottom sheet actions créneau (créer/modifier/visibilité/supprimer) (§85) | ~1024 lignes |
| `src/pages/coach/SlotTemplatePicker.tsx` | Picker templates bibliothèque séances (§85) | ~150 lignes |
| `src/hooks/useSlotCalendar.ts` | Hook matérialisation créneaux récurrents → instances semaine (§85) | ~230 lignes |
| `src/lib/neurotype-quiz-data.ts` | 30 questions quiz + 5 profils neurotype + couleurs | ~450 lignes |
| `src/lib/neurotype-scoring.ts` | Calcul scores neurotype (points/maxPoints) + niveaux | ~40 lignes |
| `src/components/neurotype/NeurotypQuiz.tsx` | Quiz 30 questions avec carousel + progress bar | ~250 lignes |
| `src/components/neurotype/NeurotypResult.tsx` | Affichage résultat neurotype (barres, profil, accordéons) | ~250 lignes |
| `src/lib/weekTypeColor.ts` | Helper partage couleur type semaine (hash-based) | ~15 lignes |
| `src/lib/api/swimmer-slots.ts` | CRUD créneaux personnalisés par nageur | ~160 lignes |
| `src/components/coach/SwimmerSlotsTab.tsx` | Onglet Créneaux dans fiche nageur coach | ~374 lignes |
| `src/lib/pwaHelpers.ts` | Détection plateforme, gate PWA | ~30 lignes |
| `src/lib/lazyWithRetry.ts` | Util partagé `lazy()` avec retry chunk-loading PWA (§119) | ~30 lignes |
| `src/lib/push.ts` | Subscription push, helpers VAPID | ~77 lignes |
| `src/lib/pushHelpers.ts` | Fonctions pures push (urlBase64ToUint8Array) | ~37 lignes |
| `src/lib/pushConfig.ts` | VAPID public key config | ~1 ligne |
| `src/components/shared/PWAInstallGate.tsx` | Gate installation PWA mobile | ~130 lignes |
| `src/components/shared/PushPermissionBanner.tsx` | Banner permission push post-login | ~70 lignes |
| `public/push-handler.js` | Service Worker push event handler | ~40 lignes |
| `src/pages/Suivi.tsx` | Hub Mon suivi (4 cartes aperçu → drill-down) | ~310 lignes |
| `src/pages/SuiviSemaine.tsx` | Vue semaine drill-down (timeline jour/créneau : nage + muscu + absences + wellness) | ~1240 lignes |
| `src/pages/SuiviPlanification.tsx` | Vue planification saison (natation infinite scroll + musculation Mon plan) | ~105 lignes |
| `src/pages/SuiviObjectifs.tsx` | Vue objectifs drill-down (CRUD objectifs + compétitions à venir) | ~111 lignes |
| `src/pages/SuiviProgression.tsx` | Vue progression drill-down (wrapper Progress) | ~50 lignes |
| `src/hooks/useSwipeNavigation.ts` | Hook swipe horizontal framer-motion (calendrier) | ~30 lignes |
| `src/components/shared/PullToRefresh.tsx` | Composant pull-to-refresh générique framer-motion | ~60 lignes |
| `src/hooks/useCoachEventsTimeline.ts` | Hook timeline échéances coach (fetch + normalisation) | ~130 lignes |
| `src/components/coach/CoachEventsTimeline.tsx` | Timeline verticale échéances coach (compétitions, entretiens, cycles) | ~260 lignes |
| `src/lib/api/competition-prep.ts` | API compétition nageur (races, routines, checklists) | ~325 lignes |
| `src/pages/CompetitionDetail.tsx` | Page détail compétition nageur (header + 4 onglets) | ~210 lignes |
| `src/components/competition/RacesTab.tsx` | Onglet courses (CRUD épreuves, Sheet, couleur nage) | ~380 lignes |
| `src/components/competition/RoutinesTab.tsx` | Onglet routines (templates, steps, assignation par course) | ~530 lignes |
| `src/components/competition/TimelineTab.tsx` | Onglet Jour J (fusion chronologique courses + routines) | ~235 lignes |
| `src/components/competition/ChecklistTab.tsx` | Onglet checklist (templates, progress bar, toggle) | ~415 lignes |
| `src/components/strength/ExercisePicker.tsx` | Picker substitution/ajout exercices en mode focus (§89) | |
| `src/components/strength/MyPlanTab.tsx` | Onglet Mon plan nageur (lecture cycles + lancement séance) | ~158 lignes |
| `src/components/coach/strength/CopyToAthleteDialog.tsx` | Dialog copie séance/dossier vers autre nageur (§90) | |
| `src/components/strength/SessionBrowser.tsx` | Orchestrateur bibliothèque muscu nageur (§93) | |
| `src/components/strength/TeamPlansSection.tsx` | Plans d'équipe visibles entre nageurs (§93) | |
| `src/lib/strengthHistoryUtils.ts` | Helpers calcul historique muscu (tonnage, sRPE, groupByExercise) | ~80 lignes |
| `src/components/strength/RunDetailSheet.tsx` | Bottom sheet détail séance musculation (KPIs, exercices, ressenti) | ~170 lignes |
| `src/lib/gifEncoder.ts` | Conversion vidéo → GIF (Canvas + gifenc, 240px, ≤200KB) (§91) | ~90 lignes |
| `src/components/coach/strength/VideoTrimmer.tsx` | Trimmer vidéo dual-slider (max 5s) (§91) | ~130 lignes |
| `src/components/coach/strength/MediaSourceSheet.tsx` | Bottom sheet filmer/importer illustration (§91) | ~100 lignes |
| `src/components/strength/RestScreen.tsx` | Container repos enrichi (timer + 3 tabs swipables) (§94) | ~200 lignes |
| `src/components/strength/RestExerciseTab.tsx` | Tab exercice (GIF, prescription, muscles, notes) (§94) | ~95 lignes |
| `src/components/strength/RestSessionTab.tsx` | Tab progression séance (barre, volume, liste) (§94) | ~130 lignes |
| `src/components/strength/RestPerfsTab.tsx` | Tab performances (1RM, cible, intensité) (§94) | ~140 lignes |
| `src/lib/chrono-types.ts` | Types chrono discriminés (registered/manual), builders, normalizeRecordSwimmer (§126) | ~134 lignes |
| `src/lib/chrono-reducer.ts` | State machine reducer chrono (key:string, SET_TITLE) (§126) | ~320 lignes |
| `src/lib/chronoXlsxExport.ts` | Export xlsx lazy (buildSheetData pur + sanitizeFilename) (§126) | ~83 lignes |
| `src/lib/api/coach-manual-swimmers.ts` | API CRUD nageurs manuels coach (§126) | ~42 lignes |
| `src/hooks/useChronoTimer.ts` | Hook RAF chrono 60fps + formatters | ~45 lignes |
| `src/components/chrono/ChronoSetup.tsx` | Phase préparation chrono (tabs Club/Manuels/Nouveau, titre) (§126) | ~598 lignes |
| `src/components/chrono/ChronoRace.tsx` | Phase course chrono — matrice lane × wave + full-bleed, overview align vagues/lanes (§126) | ~733 lignes |
| `src/components/chrono/ChronoResults.tsx` | Phase résultats chrono — tableau classement (podium, Δ 1er, splits inline, export xlsx) (§126) | ~613 lignes |
| `src/pages/coach/CoachChronoScreen.tsx` | Orchestrateur chrono 3 phases + localStorage | ~167 lignes |
| `src/lib/api/chrono-records.ts` | CRUD chrono records (historique coach) | ~80 lignes |
| `src/pages/coach/CoachChronoHistoryScreen.tsx` | Historique chronos + éditeur + export xlsx (§126) | ~344 lignes |
| `src/components/chrono/ChronoSplitEditor.tsx` | Éditeur splits (distance recalibrable, tabs) | ~200 lignes |
| `src/lib/api/coach-assignments.ts` | CRUD attributions coach ↔ nageur (§98) | ~110 lignes |
| `src/hooks/useMySwimmerIds.ts` | Hook filtrage nageurs par coach + helper filterByAssignment (§98) | ~45 lignes |
| `src/pages/coach/CoachMySwimmersScreen.tsx` | Écran gestion attribution nageurs coach/admin (§98) | ~555 lignes |
| `src/lib/api/coach-comments.ts` | API commentaires nageurs (fetch, mark read, count) (§99) | ~130 lignes |
| `src/components/shared/CoachBreadcrumb.tsx` | Breadcrumbs navigation coach (§100) | ~30 lignes |
| `src/components/shared/OfflineSyncBanner.tsx` | Banner reconnexion offline (§100) | ~40 lignes |
| `src/hooks/useCoachBreadcrumb.ts` | Hook breadcrumb segments coach (§100) | ~10 lignes |
| `src/pages/coach/CoachCommentsScreen.tsx` | Écran inbox commentaires coach (§99) | ~240 lignes |
| `src/pages/Profile.tsx` | Page profil nageur (hub) | ~920 lignes |
| `src/pages/Progress.tsx` | Page progression nageur (graphes, santé) | ~1150 lignes |
| `src/pages/HallOfFame.tsx` | Hall of Fame club | ~366 lignes |
| `src/pages/Coach.tsx` | Hub coach (home, KPIs) | ~969 lignes |
| `src/pages/Admin.tsx` | Hub admin (utilisateurs, configuration) | ~970 lignes |
| `src/pages/Administratif.tsx` | Vue administrative (timesheet, exports) | ~978 lignes |
| `src/pages/SuiviSaison.tsx` | Vue saison (suivi long terme) | ~797 lignes |
| `src/pages/MonthlyReport.tsx` | Rapport mensuel généré | ~462 lignes |
| `src/pages/SwimSessionView.tsx` | Vue détail séance natation | ~500 lignes |
| `src/pages/SwimNotes.tsx` | Notes techniques nage | ~306 lignes |
| `src/pages/coach/SwimPlanningAthleteView.tsx` | Vue planning athlète (coach) | ~914 lignes |
| `src/pages/coach/SwimPlanningDemo.tsx` | Démo planning natation | ~1623 lignes |
| `src/pages/coach/CoachMessagesScreen.tsx` | Écran messages coach | ~264 lignes |
| `src/components/strength/WorkoutRunner.tsx` | Runner séance muscu (mode focus, sets, repos) | ~1330 lignes |
| `src/components/dashboard/FeedbackDrawer.tsx` | Drawer feedback séance natation | ~1265 lignes |
| `src/components/dashboard/SwimExerciseLogsHistory.tsx` | Historique logs exercices nage | ~505 lignes |
| `src/components/coach/strength/AthletePlansTab.tsx` | Onglet plans athlète (coach muscu) | ~934 lignes |
| `src/components/coach/strength/StrengthSessionBuilder.tsx` | Builder séance muscu | ~282 lignes |
| `src/components/coach/strength/StrengthExerciseCard.tsx` | Carte exercice muscu | ~223 lignes |
| `src/components/coach/swim/SwimSessionBuilder.tsx` | Builder séance natation | ~532 lignes |
| `src/components/coach/swim/SwimExerciseForm.tsx` | Formulaire exercice nage | ~331 lignes |
| `src/components/coach/PlanningWizard.tsx` | Wizard planification (coach) | ~472 lignes |
| `src/components/coach/CoachChallengesSection.tsx` | Section challenges coach | ~363 lignes |
| `src/components/coach/SwimVolumeCharts.tsx` | Graphes volume nage | ~414 lignes |
| `src/components/coach/AttendancePerformanceChart.tsx` | Graphe assiduité/perf | ~305 lignes |
| `src/components/coach/TrainingLoadChart.tsx` | Graphe charge entraînement | ~291 lignes |
| `src/components/coach/WellnessTrend.tsx` | Tendance wellness | ~289 lignes |
| `src/components/profile/AthletePerformanceHub.tsx` | Hub performances athlète | ~546 lignes |
| `src/components/profile/SwimmerMessagesView.tsx` | Vue messages nageur | ~338 lignes |
| `src/components/profile/BadgesGrid.tsx` | Grille badges/achievements | ~228 lignes |
| `src/components/shared/SwimmerWeekSlots.tsx` | Créneaux semaine nageur | ~563 lignes |
| `src/components/strength/SessionDetailPreview.tsx` | Aperçu détail séance muscu | ~382 lignes |
| `src/components/strength/SessionList.tsx` | Liste séances muscu | ~399 lignes |
| `src/components/strength/ExerciseProgressChart.tsx` | Graphe progression exercice | ~335 lignes |
| `src/components/strength/HistoryTable.tsx` | Tableau historique muscu | ~329 lignes |
| `src/components/strength/StrengthLeaderboard.tsx` | Leaderboard muscu | ~294 lignes |
| `src/components/strength/InProgressCard.tsx` | Carte séance en cours | ~212 lignes |
| `src/components/wellness/WellnessForm.tsx` | Formulaire wellness check | ~342 lignes |
| `src/components/wellness/BodySvg.tsx` | SVG corps interactif (douleurs) | ~247 lignes |
| `src/components/timesheet/TimesheetShiftForm.tsx` | Formulaire shift pointage | ~296 lignes |
| `src/components/timesheet/TimesheetTimeWheel.tsx` | Roue sélection heure | ~252 lignes |
| `src/components/layout/AppLayout.tsx` | Layout racine app | ~217 lignes |
| `src/hooks/useDashboardState.ts` | Façade dashboard nageur (compose 4 sous-hooks) (§112) | ~260 lignes |
| `src/hooks/dashboard/internal.ts` | Types + helpers purs partagés dashboard (§112) | ~245 lignes |
| `src/hooks/dashboard/useDashboardSessions.ts` | Queries sessions/slots/assignments (§112) | ~282 lignes |
| `src/hooks/dashboard/useCompletionStatus.ts` | Statut complétion sessions (§112) | ~108 lignes |
| `src/hooks/dashboard/useDayMetrics.ts` | Métriques km jour/global (§112) | ~77 lignes |
| `src/hooks/dashboard/useFeedbackDraft.ts` | État draft feedback isolé (§112) | ~109 lignes |
| `src/components/coach/CompetitionDayBanner.tsx` | Bandeau compétition vue semaine coach (§114) | ~56 lignes |
| `src/components/coach/CompetitionQuickSheet.tsx` | Quick sheet résumé compétition (§114) | ~91 lignes |
| `supabase/tests/schema.sql` | Schéma hand-crafted minimal pour tests RLS (§121, élargi §124/§126) | ~511 lignes |
| `supabase/tests/seed.sql` | Fixtures tests RLS (§121) | ~25 lignes |
| `supabase/tests/rls/_helpers.ts` | Harness Vitest : pool pg, resetDb, asUser, asServiceRole (§121) | ~90 lignes |
| `supabase/tests/rls/dim_sessions.test.ts` | Regression tests §113 + coverage CRUD dim_sessions (§121) | ~160 lignes |
| `supabase/tests/rls/interviews.test.ts` | Tests RLS 6 policies stateful §74-§75 (§123) | ~285 lignes |
| `supabase/tests/rls/coach_manual_swimmers.test.ts` | Tests RLS CRUD + isolation inter-coach (§126) | ~110 lignes |
| `vitest.config.rls.ts` | Config Vitest isolée pour tests RLS (§121) | ~20 lignes |
| `scripts/test-db-bootstrap.sh` | Bootstrap manuel schéma+seed via psql (§121) | ~55 lignes |
| `docs/rls-testing.md` | Documentation complète tests RLS (§121) | ~250 lignes |
| `src/hooks/useMonthlyReport.ts` | Hook rapport mensuel | ~479 lignes |
| `src/hooks/useAttendancePerformance.ts` | Hook assiduité/perf | ~270 lignes |
| `src/hooks/useSwimAnalytics.ts` | Hook analytics natation | ~258 lignes |
| `src/hooks/useTrainingLoad.ts` | Hook charge entraînement | ~258 lignes |
| `src/hooks/useStrengthState.ts` | Hook état muscu | ~202 lignes |
| `src/lib/types.ts` | Types globaux | ~555 lignes |
| `src/lib/export-records-pdf.ts` | Export PDF records | ~456 lignes |
| `src/lib/design-tokens.ts` | Design tokens (couleurs, espacements) | ~254 lignes |
| `src/lib/schema.ts` | Schéma Drizzle (tables) | ~670 lignes |

## Edge Functions Supabase

| Fonction | Statut | Chemin |
|----------|--------|--------|
| `admin-user` | Fonctionnelle (ACTIVE, v97) | `supabase/functions/admin-user/` |
| `ffn-sync` | Fonctionnelle (ACTIVE, v53) — cron sync FFN | `supabase/functions/ffn-sync/` |
| `ffn-performances` | Fonctionnelle (ACTIVE, v62) | `supabase/functions/ffn-performances/` |
| `import-club-records` | Fonctionnelle (ACTIVE, v73) | `supabase/functions/import-club-records/` |
| `push-send` | Fonctionnelle (ACTIVE, v33) | `supabase/functions/push-send/` |

## Documentation

Lire ces fichiers dans cet ordre pour reprendre le contexte :

1. **Ce fichier** (`CLAUDE.md`) — Vue d'ensemble rapide
2. **`docs/FEATURES_STATUS.md`** — Matrice complète des fonctionnalités (ce qui marche, ce qui manque)
3. **`docs/ROADMAP.md`** — Plan de développement futur (4 chantiers détaillés)
4. **`docs/implementation-log.md`** — Historique des implémentations
5. **`docs/patch-report.md`** — Audit UI/UX (items restants)
6. **`README.md`** — Stack, déploiement, structure

## Chantiers futurs (ROADMAP)

| # | Chantier | Priorité | Statut |
|---|----------|----------|--------|
| 1 | Refonte parcours d'inscription | Haute | Fait |
| 2 | Import toutes performances FFN | Haute | Fait |
| 3 | Gestion coach des imports | Moyenne | Fait |
| 4 | Records club alimentés | Moyenne | Fait |
| 5 | Dette technique UI/UX | Basse | Fait |
| 6 | Fix timers mode focus (PWA iOS background) | Haute | Fait (§14) |
| 10 | Notes techniques par exercice natation | Moyenne | Fait |
| 12 | Redesign dashboard coach (mobile first) | Haute | Fait (§35) |
| 13 | Redesign Profil + Hall of Fame (mobile first) | Moyenne | Fait (§38) |
| 14 | Finalisation dashboard pointage heures coach | Moyenne | Fait (§39) |
| 15 | Redesign page Progression (Apple Health style) | Moyenne | Fait (§44) |
| 16 | Audit UI/UX — header Strength + login mobile + fixes | Moyenne | Fait (§45) |
| 17 | Harmonisation headers + Login mobile thème clair | Moyenne | Fait (§46) |
| 18 | Redesign RecordsClub épuré mobile | Moyenne | Fait (§47) |
| 19 | Audit performances + optimisation PWA (Workbox) | Haute | Fait (§48) |
| 20 | Parser texte → blocs séance natation | Moyenne | Fait (§49) |
| 21 | Hall of Fame refresh temps réel + sélecteur période | Moyenne | Fait (§51) |
| 22 | Calendrier coach (vue mensuelle assignations) | Moyenne | Fait (§53) |
| 23 | Swim Session Timeline (refonte visualisation séances) | Moyenne | Fait (§55) |
| 24 | Groupes temporaires coach (stages, sous-groupes) | Moyenne | Fait (§56) |
| 25 | Partage public séances natation (token UUID) | Moyenne | Fait (§57) |
| 26 | Détails techniques inline timeline nageur | Moyenne | Fait (§58) |
| 27 | Compétitions coach (calendrier échéances) | Moyenne | Fait (§59) |
| 28 | Objectifs coach (temps cibles & texte par nageur) | Moyenne | Fait (§60) |
| 29 | Interface objectifs nageur + refonte Profil hub | Moyenne | Fait (§61) |
| 30 | Compétitions : assignations, absences, compteur, SMS | Moyenne | Fait (§62) |
| 31 | Upload photo de profil avec compression | Moyenne | Fait (§63) |
| 32 | Traduction exercices FR + option Poids du corps | Faible | Fait (§64) |
| 33 | Écran SMS dédié coach dashboard | Moyenne | Fait (§65) |
| 34 | Groupes encadrés par shift (pointage coach) | Moyenne | Fait (§66) |
| 35 | Fix désynchronisation group_members au changement de groupe | Haute | Fait (§67) |
| 37 | Planification & Entretiens (fiche nageur coach) | Haute | Fait (§74) |
| 36 | Quiz neurotype nageur (profil d'entraînement) | Moyenne | Fait (§71) |
| 37 | Dashboard synthétique nageurs (coach) | Moyenne | Fait (§72) |
| 38 | Fiche nageur coach (ressentis, objectifs, onglets) | Moyenne | Fait (§73) |
| 39 | Refonte entretiens conversationnels + planif inline | Haute | Fait (§75) |
| 40 | Créneaux d'entraînement récurrents | Moyenne | Fait (§76) |
| 41 | Créneaux personnalisés par nageur | Moyenne | Fait (§78) |
| 42 | Notifications push Web Push (VAPID) | Haute | Fait (§79) |
| 43 | Sécurité RLS + Import FFN Auto-Sync | Haute | Fait (§80) |
| 44 | Audit UX A-H (touch targets, feedback, nav coach, wizard) | Haute | Fait (§81) |
| 45 | Audit restant (CORS, migrations, RPC, pagination, deep linking) | Moyenne | Fait (§82) |
| 46 | Réorganisation Profil & Gestes mobiles (E5+E7) | Moyenne | Fait (§83) |
| 47 | Coach Events Timeline (Tableau de Bord des Échéances) | Moyenne | Fait (§84) |
| 49 | Redesign ObjectiveCard + harmonisation Planif nageur | Moyenne | Fait (§86) |
| 48 | Calendrier créneaux centré séances (Slot-Centric Sessions) | Haute | Fait (§85) |
| 50 | Préparation compétition nageur (courses, routines, timeline, checklist) | Moyenne | Fait (§87) |
| 51 | Notes techniques enrichies (épreuve, bassin, équipement) | Moyenne | Fait (§88) |
| 52 | Strength UX Overhaul — refonte parcours musculation nageur | Haute | Fait (§89) |
| 53 | Planification muscu par nageur (dossiers hiérarchiques) | Moyenne | Fait (§90) |
| 54 | Vidéo → GIF pour illustration exercices musculation | Moyenne | Fait (§91) |
| 55 | Refonte UX Coach (nav, home, fiche nageur) | Haute | Fait (§92) |
| 56 | Restructuration bibliothèque musculation nageur | Moyenne | Fait (§93) |
| 57 | Rest Timer enrichi — tabs swipables | Moyenne | Fait (§94) |
| 58 | Rest Screen Improvements (GIF, notes, dots, sparkline, swipe) | Moyenne | Fait (§95) |
| 59 | Notification matinale bien-être (push 6h00) | Moyenne | Fait (§96) |
| 60 | Chrono Coach (split timer poolside tablette) | Haute | Fait (§97) |
| 61 | Attribution coach ↔ nageur (1 coach principal par nageur) | Haute | Fait (§98) |
| 62 | Commentaires nageurs sur home coach + push notification | Moyenne | Fait (§99) |
| 63 | Historique Chronos + Éditeur Splits | Haute | Fait (§98) |
| 64 | Remédiation audit (sécurité, perf, UX, robustesse) | Haute | Fait (§100) |
| 65 | Refonte assignation avec héritage créneau perso | Haute | Fait (§101) |
| 66 | Refonte interface nageur (Home + Dock + Suivi 3 horizons) | Haute | Fait (§102) |
| 67 | Restructuration vue "Mon suivi" (hub + drill-down) | Haute | Fait (§103) |
| 68 | Sous-vues Suivi enrichies (Semaine nage+muscu, Planification, Objectifs) + bugs PWA | Haute | Fait (§104) |
| 69 | Onglet "Santé" dans Ma progression | Moyenne | Fait (§105) |
| 70 | Icônes filières dans Ma planification nageur | Faible | Fait (§106) |
| 71 | Jauges comparatives de filières (Ma planification) | Moyenne | Fait (§107) |
| 72 | Rafraîchissement planning nageur (fix cache) | Haute | Fait (§108) |
| 73 | Fix blank "Ma planification" au premier rendu | Haute | Fait (§109) |
| 74 | Audit sécurité & robustesse (Sprint post-audit, RLS, Edge Fns, contraintes) | Haute | Fait (§110) |
| 75 | Fix infinite loop IntersectionObserver Ma planification | Haute | Fait (§111) |
| 76 | Performance fixes batch (refetchOnWindowFocus, staleTime objectives, découpe useDashboardState, memo coach slots) | Haute | Fait (§112) |
| 77 | Fix FeedbackDrawer — suppression ressenti (RLS) + distance affichée | Haute | Fait (§113) |
| 78 | Jours de compétition dans vue semaine coach (bandeau + quick sheet) | Moyenne | Fait (§114) |
| 79 | Suppression code orphelin `CoachSlotCalendar.tsx` (766 LOC) | Basse | Fait (§115) |
| 80 | Session 1 urgences backend (cron `rec.id`, push-send vault service_role, bucket list policies) | Haute | Fait (§116) |
| 81 | Session 2 backend perf (9 index FK, 13 policies RLS auth.uid() initplan wrap) | Haute | Fait (§117) |
| 82 | Session 3 dead code frontend (12 composants shadcn/ui orphelins + 9 deps npm) | Moyenne | Fait (§118) |
| 83 | Session 4 frontend perf (lazy-load CoachTrainingSlotsScreen sheets, -26 % bundle wrapper) | Moyenne | Fait (§119) |
| 84 | Session 3bis réplication lazy (StrengthCatalog -43 % + migration Coach.tsx vers lazyWithRetry) | Moyenne | Fait (§120) |
| 85 | Infrastructure tests RLS intégration (Docker Postgres + schéma hand-crafted + §113 regression coverage) | Haute | Fait (§121) |
| 86 | Simplification RLS timesheet (remplacement email-join par `app_user_role()` sur 6 policies) | Basse | Fait (§122) |
| 87 | Tests RLS `interviews` (6 policies stateful + 17 assertions) | Haute | Fait (§123) |
| 88 | Audit perf/UX complet + wrap 4 dernières policies `auth_rls_initplan` (advisor 4 → 0) | Haute | Fait (§124) |
| 89 | Unification FolderCard + SessionRow (cohérence dossiers nageur/coach) | Moyenne | Fait (§125) |
| 90 | Chrono : nageurs manuels + titre séance + export XLSX | Moyenne | Fait (§126) |
| 91 | Fix overflow `FiliereEditorOverlay` (vue planification natation coach) | Faible | Fait (§127) |

Détail complet dans `docs/ROADMAP.md`.

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

Le tableau "Fichiers clés" et la table "Chantiers futurs" dérivent rapidement si on ne les met pas à jour à chaque patch. À la fin de chaque § :

1. **Tableau "Fichiers clés"** — pour CHAQUE fichier touché par le patch :
   - **Nouveau fichier** créé ≥ 150 lignes OU jouant un rôle architectural (page, hook, module API, écran coach, composant orchestrateur) → **ajouter une ligne** au tableau, avec : chemin exact, rôle en 1 phrase, taille mesurée via `wc -l` (jamais estimée).
   - **Fichier existant** dont la taille a varié de **> 30 %** depuis la dernière entrée → **mettre à jour la colonne taille** (toujours via `wc -l`, format `~N lignes`).
   - **Fichier supprimé/renommé** → **supprimer/renommer la ligne** correspondante.
   - **Ne jamais inventer de taille.** Si pas mesurée, ne pas écrire de chiffre.

2. **Tableau "Chantiers futurs (ROADMAP)"** — pour CHAQUE § ajouté à `implementation-log.md` :
   - Ajouter une ligne au tableau avec le numéro de chantier suivant, titre court, priorité, et `Fait (§N)` où N = numéro de l'entrée dans `implementation-log.md`.
   - **Le tableau de CLAUDE.md doit toujours pointer vers le dernier § du log.** Si le log a §N et CLAUDE.md s'arrête à §N-1, c'est un bug à corriger immédiatement.

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
