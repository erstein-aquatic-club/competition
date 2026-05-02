# Carte des fichiers clés

*Chargé à la demande — ne PAS dupliquer dans `CLAUDE.md`.*

Ce fichier est l'annuaire détaillé des fichiers du projet. Pour les règles de mise à jour, voir `CLAUDE.md` § "Règles de mise à jour".

Convention colonnes : chemin, rôle (1 phrase), taille (mesurée via `wc -l`, jamais estimée).

---

| Fichier | Rôle | Taille |
|---------|------|--------|
| `src/lib/api.ts` | Façade API (stubs → modules) | 966 lignes |
| `src/lib/api/types.ts` | Interfaces TypeScript (sessions, strength, users, comps, wellness, cycles, challenges, achievements, pain, strength-planning) | 1179 lignes |
| `src/lib/api/client.ts` | Supabase client, utilitaires | ~316 lignes |
| `src/lib/api/transformers.ts` | Fonctions de transformation strength | ~228 lignes |
| `src/lib/api/helpers.ts` | Fonctions de mapping | ~161 lignes |
| `src/lib/api/localStorage.ts` | Stockage local fallback | ~119 lignes |
| `src/lib/api/index.ts` | Re-exports centralisés | 460 lignes |
| `src/lib/api/strength-planning.ts` | CRUD strength_planning_* : slots groupe + overrides athlete + week meta (Phase 2 §157) | 170 lignes |
| `src/lib/api/strength.ts` | Exercices, sessions, runs, logs, 1RM | ~1399 lignes |
| `src/lib/api/records.ts` | Hall of fame, records club, perfs, FFN | ~631 lignes |
| `src/lib/api/users.ts` | Profil, athlètes, approbation | ~450 lignes |
| `src/lib/api/assignments.ts` | Assignments CRUD (sessions, slots, tracking) | ~1015 lignes |
| `src/lib/api/notifications.ts` | Notifications CRUD + `notifications_clear_all` serveur (§161) + filtre `expires_at` côté client (§163) | 359 lignes |
| `src/lib/api/timesheet.ts` | Pointage heures CRUD | ~326 lignes |
| `src/lib/api/swim.ts` | Catalogue nage, sessions, partage public | ~416 lignes |
| `src/lib/api/wellness.ts` | Wellness checks + scoring readiness | ~84 lignes |
| `src/lib/api/challenges.ts` | CRUD challenges | ~118 lignes |
| `src/lib/api/achievements.ts` | CRUD achievements | ~55 lignes |
| `src/lib/api/painReports.ts` | CRUD pain reports | ~69 lignes |
| `src/lib/api/audit.ts` | Logs d'audit | ~32 lignes |
| `src/lib/api/notificationLog.ts` | Logs notifications envoyées | ~26 lignes |
| `src/lib/api/swim-planning.ts` | Planification séances natation + overrides par nageur (slot, week_meta, week_overrides) | ~169 lignes |
| `src/lib/swimPlanningMerge.ts` | Pur — `mergeSlots` / `mergeWeekMeta` (group + athlete) pour planning natation (§153) | ~112 lignes |
| `src/hooks/coach/useSwimPlanningAthleteMode.ts` | Hook coach — sélection nageur + URL sync + queries overrides + merge + mutations routées (§153) | ~449 lignes |
| `src/lib/api/swim-filieres.ts` | CRUD filières : patch partiel + `resetSwimFiliere` (§134) | ~65 lignes |
| `src/pages/coach/FilieresEditor.tsx` | Overlay liste → détail plein écran (15 champs + jauges + reset + aperçu nageur live) (§134) | ~1087 lignes |
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
| `src/lib/offlineQueue.ts` | Queue localStorage pour mutations offline — `enqueue`, `getQueue`, `markRetry`, dispatche `eac-offline-queue-updated` (§162) | 113 lignes |
| `src/components/shared/OfflineMutationSync.tsx` | Rejoue la queue offline au retour réseau ET sur `eac-offline-queue-updated` (§162) | 168 lignes |
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
| `src/pages/coach/CoachSwimmerDetail.tsx` | Dispatcher thin : route vers CoachSwimmerFullView (titulaire) ou CoachSwimmerQuickView (substituant) selon hasAccess (§152) | 33 lignes |
| `src/pages/coach/CoachSwimmerFullView.tsx` | Page fiche nageur complète (4 onglets: Résumé/Planning/Échanges/Comms) — ex-CoachSwimmerDetail (§152) | 528 lignes |
| `src/pages/coach/CoachSwimmerQuickView.tsx` | Mode dépannage substituant : briefing lecture-seule + présence/commentaire/assignation avec recorded_by (§152) | 346 lignes |
| `src/pages/coach/QuickViewAttendanceDialog.tsx` | Dialog enregistrement présence substituant (Présent/Absent/Retard + commentaire) (§152) | 90 lignes |
| `src/pages/coach/QuickViewCommentDialog.tsx` | Dialog ajout commentaire séance par substituant (max 500 car.) (§152) | 78 lignes |
| `src/pages/coach/QuickViewAssignDrawer.tsx` | Sheet assignation séance : onglet Bibliothèque (search + liste) + Nouvelle (ad-hoc) (§152) | 176 lignes |
| `src/lib/api/coach-quickview.ts` | Module API QuickView : getSwimmerBriefing (RPC), recordAttendanceAsSub, addSessionCommentAsSub, assignSessionToSlotAsSub (§152) | 143 lignes |
| `src/components/coach/swimmer-kpis/SwimmerFormBadge.tsx` | Badge couleur readiness_score (vert/ambre/rouge) + heure du relevé (§152) | 51 lignes |
| `src/components/coach/swimmer-kpis/PainIndicator.tsx` | Indicateur douleur : dot couleur selon reports_7d (§152) | 36 lignes |
| `src/components/coach/swimmer-kpis/LoadMini.tsx` | KPI charge : grille km 7j/28j / séances / RPE moyen (§152) | 34 lignes |
| `src/components/coach/swimmer-kpis/ObjectiveChips.tsx` | Chips objectifs (event_code + temps) max 4 (§152) | 37 lignes |
| `src/pages/coach/SwimmerFeedbackTab.tsx` | Onglet ressentis (liste chronologique sessions) | ~120 lignes |
| `src/pages/coach/SwimmerObjectivesTab.tsx` | Onglet objectifs CRUD (chrono + texte) — export `handlePaceLinkClick` (handoff sessionStorage, §188) | ~574 lignes |
| `src/pages/coach/CoachPaceCalculatorScreen.tsx` | Calculateur d'allures coach — sélecteur coach, accordéon nageurs, upsert/delete cibles, export PDF, prefill depuis objectif via `selectAccordionTargetForPrefill` + `useEffect` (§186-§188) | 405 lignes |
| `src/pages/coach/CoachGroupsScreen.tsx` | UI gestion groupes temporaires (stages) | ~1012 lignes |
| `src/pages/coach/CoachCompetitionsScreen.tsx` | UI compétitions coach + assignations + SMS | ~834 lignes |
| `src/pages/coach/CoachWeekView.tsx` | Wrapper toggle semaine/mois (calendrier unifié) (§92), prop `initialWeekDate` pour deep-link (§145) | ~130 lignes |
| `src/pages/coach/CoachLibrary.tsx` | Wrapper tabs bibliothèque nage/muscu (§92) | ~60 lignes |
| `src/pages/coach/CoachComms.tsx` | Wrapper tabs notifications/SMS (§92) | ~60 lignes |
| `src/lib/api/planning.ts` | CRUD macro-cycles + semaines | ~200 lignes |
| `src/lib/api/interviews.ts` | CRUD entretiens + transitions multi-phases | ~200 lignes |
| `src/pages/coach/SwimmerPlanningPanel.tsx` | Panneau inline planning nageur sur fiche (read-only, 7 semaines, Plein écran vers /coach/swim-planning) — remplace `SwimmerPlanningTab` (§153) | ~170 lignes |
| `src/pages/coach/SwimmerInterviewsTab.tsx` | Onglet entretiens fiche nageur (workflow multi-phases) | ~1193 lignes |
| `src/components/profile/AthleteInterviewsSection.tsx` | Entretiens côté nageur (formulaire, signature, historique) | ~320 lignes |
| `src/components/shared/FolderCard.tsx` | Composant partagé dossiers (Radix Collapsible, variant root/nested, slot actions) (§125) | ~61 lignes |
| `src/components/shared/SessionRow.tsx` | Composant partagé ligne de séance (slots badge/trailing) (§125) | ~49 lignes |
| `src/components/shared/ShareMenu.tsx` | Dropdown partage unifié (WhatsApp + Copier + Partager natif) + `ShareMenuInline` (§133) | ~183 lignes |
| `src/components/shared/icons/WhatsAppIcon.tsx` | Icône WhatsApp SVG inline (#25D366) (§133) | ~15 lignes |
| `src/lib/share/types.ts` | Types partage (`SharePayload`, `ShareOptionId`, `ShareOption`) (§133) | ~20 lignes |
| `src/lib/share/buildShareOptions.ts` | Fonction pure options partage selon payload + capacités navigateur (§133) | ~38 lignes |
| `src/lib/share/shareActions.ts` | Side-effects partage (WhatsApp, clipboard, native, download) (§133) | ~47 lignes |
| `src/components/shared/ObjectiveCard.tsx` | Composant partagé objectifs (ring SVG, grid 2x2, compact) | ~260 lignes |
| `src/components/shared/ObjectiveDetailSheet.tsx` | Drawer objectif nageur (Radix Sheet bottom) — toggle [Allures\|Progression] : `PaceMatrixInline` ou `EventProgressionContent` selon onglet (§189-ext) | 94 lignes |
| `src/lib/objectiveHelpers.ts` | Helpers partagés objectifs (FFN_EVENTS, formatTime) | ~40 lignes |
| `src/lib/imageUtils.ts` | Compression image Canvas (avatar upload, WebP/JPEG ≤200KB) | ~95 lignes |
| `src/components/profile/SwimmerObjectivesView.tsx` | Vue objectifs nageur (lecture coach + CRUD perso) — clic objectif ouvre `ObjectiveDetailSheet` (§189-ext) | 493 lignes |
| `src/pages/coach/CoachSmsScreen.tsx` | Écran SMS généraliste coach (groupe/nageur) | ~190 lignes |
| `src/pages/coach/CoachTrainingSlotsScreen.tsx` | Écran gestion créneaux d'entraînement (coach) — inclut les mutations quick-compose + assign-from-library (§142) | ~3174 lignes |
| `src/pages/coach/lib/slotTiming.ts` | Pures : constantes timeline + timeToPx/durationPx/durationLabel (§168) | 48 lignes |
| `src/pages/coach/lib/weekDates.ts` | Pures : getMonday/getISOWeek/toIsoDate + iterateDatesInclusive (§168) | 96 lignes |
| `src/pages/coach/lib/slotDisplay.ts` | Pures : isSwimSlot + getSlotCompletionState + formatAssignedKmParts (§168) | 55 lignes |
| `src/pages/coach/lib/swimLibraryContext.ts` | Pures : buildSwimLibraryContext (nav catalog depuis timeline) (§168) | 43 lignes |
| `src/pages/coach/__tests__/fixtures/slots.ts` | Fixtures canoniques pour tests training slots (makeTrainingSlot, makeSlotInstance, etc.) (§168) | 151 lignes |
| `src/pages/coach/SlotSessionSheet.tsx` | Bottom sheet créneau — quick-compose (texte + bibliothèque inline) + édition/visibilité/suppression (§85, §142) | ~1380 lignes |
| `src/hooks/useSlotCalendar.ts` | Hook matérialisation créneaux récurrents → instances semaine (§85) | ~358 lignes |
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
| `src/components/strength/ExercisePicker.tsx` | Picker substitution/ajout exercices en mode focus (§89) — utilise ExerciseGif offline-aware (§170) | |
| `src/components/strength/ExerciseGif.tsx` | Composant `<img>` partagé focus muscu : key={src} + skeleton + onError fallback Dumbbell/ImageOff offline-aware (§170) | 83 lignes |
| `src/components/strength/MyPlanTab.tsx` | Onglet Mon plan nageur — consomme strength_planning_* BDD avec fallback cycles Phase 1 (§156+§157) | 325 lignes |
| `src/components/strength/MyPlanWeekCard.tsx` | Carte semaine collapse/expand : rail dot, header S/dates/phase/chips compétitions, grille 7j (§156) | 215 lignes |
| `src/components/strength/MyPlanSessionSheet.tsx` | Bottom Sheet aperçu séance muscu (titre, phase badge, liste items, Lancer) (§156) | 103 lignes |
| `src/components/strength/MyPlanSessionRow.tsx` | Ligne jour×séance dans carte semaine (check, badge jour, titre, compteur) (§156) | 99 lignes |
| `src/lib/strength/strengthPlanWeeks.ts` | Pure helpers : buildWeekInstances, parseWeekRange, weekInfoFromSNumber, types WeekInstance/WeekSession (§156) | 181 lignes |
| `src/lib/strength/strengthPhaseStyles.ts` | PHASE_STYLES, detectPhase, type StrengthPhase extraits de MyPlanTab (§156) | 21 lignes |
| `src/lib/strengthPlanningMerge.ts` | mergeStrengthSlots + mergeStrengthWeekMeta — merge group slots + athlete overrides (Phase 2 §157) | 121 lignes |
| `src/lib/__tests__/strengthPlanningMerge.test.ts` | 13 tests unitaires merge slots et weekMeta strength planning (§157) | 164 lignes |
| `supabase/tests/rls/strength_planning.test.ts` | Tests RLS intégration : 4 tables strength_planning_* — SELECT/INSERT/UPDATE/DELETE + §113 regression (§157) | 389 lignes |
| `src/lib/unsavedDraftStore.ts` | Helpers saveDraft/loadDraft/clearDraft — snapshot localStorage résilient (quota OK, corruption-safe) pour WorkoutRunner + FeedbackDrawer (§158) | 90 lignes |
| `src/lib/__tests__/unsavedDraftStore.test.ts` | 9 sous-tests `node:test` — round-trip, corrupted blob, quota exceeded, storage absent (§158) | 127 lignes |
| `src/lib/__tests__/strengthAtomicSet.test.ts` | 7 tests `node:test` — log_strength_set_atomic RPC + reconcile error aggregation (§158) | 209 lignes |
| `supabase/migrations/00137_log_strength_set_atomic.sql` | RPC atomique set-log + 1RM upsert (SECURITY DEFINER, search_path public, authz via app_user_id/role) — transaction unique (§158) | 142 lignes |
| `supabase/migrations/00138_fix_strength_run_column_names.sql` | Fix live bug §83 — recrée `save_strength_run_atomic` (INSERT `set_index` au lieu de `set_number`, clé 1RM `weight`, authz `app_user_id`/`app_user_role`) + `get_strength_run_summary` (ORDER BY `set_index`) (§159) | 156 lignes |
| `supabase/migrations/00139_notification_clear_server_side.sql` | DELETE policy sur `notification_targets` + table `notification_dismissals` pour masquage persistant par user des notifs de groupe (§161) | 66 lignes |
| `supabase/migrations/00142_notification_text_alignment.sql` | Cohérence textuelle notifs — titre `Nouvelle compétition` + tutoiement body compétition/entretien (§163) | 94 lignes |
| `supabase/migrations/00143_notification_auto_expire_crons.sql` | `expires_at = J+1` sur crons `send_wellness_morning_push` et `slot-session-reminder` + backfill 25 notifs existantes (§163) | 124 lignes |
| `src/hooks/useCompetitionsByWeek.ts` | Hook partagé : competitionsByWeek Map + getDayCompetitions par jour (§156) | 67 lignes |
| `src/hooks/useStrengthPlanByISO.ts` | Hook nageur — fusionne plan groupe + overrides (mergeStrengthSlots §157) et expose `planByISO`/`resolvedByISO`/`strengthByISO` au calendrier Dashboard et au FeedbackDrawer (§172). Helpers `buildWeekStarts`/`isoFromWeekStartAndDay` exportés (TZ-safe via local-date components, fix bug latent toISOString shift UTC). | 176 lignes |
| `src/hooks/__tests__/useStrengthPlanByISO.test.ts` | 8 tests unitaires sur les helpers TZ-safe (régression boundaries mois/année, dimanche edge case `getDay()=0`, no shift UTC) (§172) | 61 lignes |
| `src/components/coach/strength/CopyToAthleteDialog.tsx` | Dialog copie séance/dossier vers autre nageur (§90) | |
| `src/components/strength/SessionBrowser.tsx` | Orchestrateur bibliothèque muscu nageur (§93) | |
| `src/components/strength/TeamPlansSection.tsx` | Plans d'équipe visibles entre nageurs (§93) | |
| `src/lib/strengthHistoryUtils.ts` | Helpers calcul historique muscu (tonnage, sRPE, groupByExercise) | ~80 lignes |
| `src/components/strength/RunDetailSheet.tsx` | Bottom sheet détail séance musculation (KPIs, exercices, ressenti) | ~170 lignes |
| `src/lib/gifEncoder.ts` | Conversion vidéo → GIF (Canvas + gifenc, 240px, ≤200KB) (§91). §164 : `loadGifenc()` async + cache pour lazy import. | ~131 lignes |
| `src/components/coach/strength/VideoTrimmer.tsx` | Trimmer vidéo dual-slider (max 5s) (§91) | ~130 lignes |
| `src/components/coach/strength/MediaSourceSheet.tsx` | Bottom sheet filmer/importer illustration (§91) | ~100 lignes |
| `src/components/strength/RestScreen.tsx` | Container repos enrichi (timer + 3 tabs swipables) (§94) | ~200 lignes |
| `src/components/strength/RestExerciseTab.tsx` | Tab exercice (GIF, prescription, muscles, notes) (§94) | ~95 lignes |
| `src/components/strength/RestSessionTab.tsx` | Tab progression séance (barre, volume, liste) (§94) | ~130 lignes |
| `src/components/strength/RestPerfsTab.tsx` | Tab performances (1RM, cible, intensité) (§94) | ~140 lignes |
| `src/lib/chrono-types.ts` | Types chrono (registered/manual) + WaveConfigOverrides + resolveWaveConfig (§130) | ~155 lignes |
| `src/lib/chrono-reducer.ts` | State machine chrono + SET_WAVE_OVERRIDES/SET_WAVE_OVERRIDE_FIELD (§130) | ~343 lignes |
| `src/lib/chronoXlsxExport.ts` | Export xlsx lazy + subtitle vagues personnalisées (§130) | ~562 lignes |
| `src/lib/api/coach-manual-swimmers.ts` | API CRUD nageurs manuels coach (§126) | ~42 lignes |
| `src/hooks/useChronoTimer.ts` | Hook RAF chrono 60fps + formatters | ~45 lignes |
| `src/components/chrono/ChronoSetup.tsx` | Phase préparation chrono + WaveConfigCard + preset chips Distance/Splits + section Avancé collapsible + sticky footer (§130, §155) | 1189 lignes |
| `src/components/chrono/ChronoRace.tsx` | Phase course chrono — résolution per-wave + affichage config sous GO (§130) | ~827 lignes |
| `src/components/chrono/ChronoResults.tsx` | Phase résultats chrono + badge Personnalisée sur ranking rows (§130) | ~652 lignes |
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
| `src/pages/Coach.tsx` | Hub coach (home, KPIs, Ma semaine matrice matin/aprèm §131) | ~1114 lignes |
| `src/pages/Admin.tsx` | Hub admin (utilisateurs, configuration) | ~970 lignes |
| `src/pages/Administratif.tsx` | Vue administrative (timesheet, exports) | ~978 lignes |
| `src/pages/SuiviSaison.tsx` | Vue saison (suivi long terme) | ~797 lignes |
| `src/pages/MonthlyReport.tsx` | Rapport mensuel généré | ~462 lignes |
| `src/pages/SwimSessionView.tsx` | Vue détail séance natation | ~500 lignes |
| `src/pages/SwimNotes.tsx` | Notes techniques nage | ~306 lignes |
| `src/pages/coach/SwimPlanningAthleteView.tsx` | Vue planning athlète (côté nageur) — merge overrides perso + badge "Perso" (§153) | ~1007 lignes |
| `src/pages/coach/SwimPlanningDemo.tsx` | Planning natation coach — sélecteur nageur/groupe + override mode (§153), consomme `useSwimPlanningAthleteMode` | ~1034 lignes |
| `src/components/coach/swim/SwimPlanningTimeline.tsx` | Timeline semaines + micro-grille jour × créneau + chips filière (présentationnel, partagé coach/nageur) — ring+icon override, opacity inherited, `readOnly` (§153) | ~780 lignes |
| `src/components/coach/swim/swimPlanningShared.ts` | Helpers/constantes partagés timeline swim (WeekInfo, DAY_ROWS, getMonday, generateWeeks, fmtDD_MM, isCurrentWeek) | ~75 lignes |
| `src/pages/coach/CoachMessagesScreen.tsx` | Écran messages coach | ~264 lignes |
| `src/components/strength/WorkoutRunner.tsx` | Runner séance muscu (mode focus, sets, repos) | ~1330 lignes |
| `src/components/dashboard/FeedbackDrawer.tsx` | Drawer feedback séance natation | ~1265 lignes |
| `src/components/dashboard/SwimExerciseLogsHistory.tsx` | Historique logs exercices nage | ~505 lignes |
| `src/components/coach/strength/AthletePlansTab.tsx` | Onglet plans athlète (coach muscu) | ~934 lignes |
| `src/pages/coach/StrengthPlanningScreen.tsx` | Écran coach planification muscu (timeline groupe/nageur, picker séances, sheets détail/compétitions) (§160) | 1074 lignes |
| `src/components/coach/strength/StrengthPlanningTimeline.tsx` | Timeline présentationnelle planif muscu (7j × semaines, chips séance + dot phase) (§160) | 749 lignes |
| `src/hooks/coach/useStrengthPlanningAthleteMode.ts` | Hook sélection athlète + merge slots/weekMeta + mutations routées groupe/overrides (§160) | 460 lignes |
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
| `src/components/shared/SwimmerWeekSlots.tsx` | Créneaux semaine nageur (vue détaillée jour par jour, swipe semaine) | ~563 lignes |
| `src/components/shared/SwimmerWeekMatrixCard.tsx` | Card "Ma semaine" compacte nageur — matrice 7j × matin/aprèm via `get_swimmer_sessions` (résolution per-swimmer individual/subgroup/group) (§190 + §190-fix) | 415 lignes |
| `src/components/shared/swimmerWeekMatrix.ts` | Helpers purs `classifyCell` + `foldCellStates` pour SwimmerWeekMatrixCard (§190) | 70 lignes |
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
| `supabase/tests/schema.sql` | Schéma hand-crafted minimal pour tests RLS (§121, élargi §124/§126/§182/§184-§185 — pace tables + get_pace_share_payload avec swimmer_sex) | 1121 lignes |
| `supabase/tests/seed.sql` | Fixtures tests RLS (§121) | ~25 lignes |
| `supabase/tests/rls/_helpers.ts` | Harness Vitest : pool pg, resetDb, asUser, asServiceRole, asAnon (§121, §184) | 135 lignes |
| `supabase/tests/rls/dim_sessions.test.ts` | Regression tests §113 + coverage CRUD dim_sessions (§121) | ~160 lignes |
| `supabase/tests/rls/interviews.test.ts` | Tests RLS 6 policies stateful §74-§75 (§123) | ~285 lignes |
| `supabase/tests/rls/coach_manual_swimmers.test.ts` | Tests RLS CRUD + isolation inter-coach (§126) | ~110 lignes |
| `supabase/tests/rls/session_assignments.test.ts` | Tests RLS visible_from gate + group_members + cross-coach ownership §174 P0 #1 (§182) | 268 lignes |
| `supabase/tests/rls/save_strength_run_authz.test.ts` | Tests RLS authz check de `save_strength_run_atomic` via stub fonction §174 P0/P1 #5 migration 00146 (§182) | 171 lignes |
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
| `src/lib/export-session-pdf.ts` | Génère un PDF A4 d'une séance natation (jsPDF + branding EAC, pour bord de bassin) | ~434 |
| `src/lib/design-tokens.ts` | Design tokens (couleurs, espacements) | ~254 lignes |
| `src/lib/schema.ts` | Schéma Drizzle (tables) | ~670 lignes |
| `src/lib/poolConversion.ts` | Table FFN de conversion bassin 50m↔25m (17 entrées, sex-dépendant) + `convertTargetTime` + `getPoolMajorationMs` (§185) | 78 lignes |
| `src/__tests__/poolConversion.test.ts` | 17 tests `node:test` — majorations FFN, no-op, round-trips, nulls, sex fallback (§185) | 165 lignes |
| `src/components/coach/pace/PaceMatrix.tsx` | Matrice allures × zones (V0–MAX) — modèle non-linéaire pace-v2 + V4 conditionnel + toggle bassin 50m/25m + prop `compact` (masque toolbar, §188) | 270 lignes |
| `src/components/coach/pace/PaceMatrixInline.tsx` | Wrapper compact de `PaceMatrix` (lecture seule, sans toggle bassin) — utilisé sous `ObjectiveCard` nageur (§188) | 46 lignes |
| `src/components/coach/pace/PaceTargetForm.tsx` | Formulaire cible d'allure (nage + distance + temps + bassin toggle) embarqué dans SwimmerPaceCard (§184-§185) | 182 lignes |
| `src/components/coach/pace/Pace4NSegmentMatrix.tsx` | Matrice 4N segmentée par nage (NL/Dos/Brasse/Pap) avec poids selon doc §9 (§186) | 269 lignes |
| `src/components/coach/pace/PaceStrokeAdjustments.tsx` | Drawer overrides mS coach par nage × famille (`coach_stroke_adjustments`, bornes ±0.20) (§186) | 238 lignes |
| `src/components/coach/pace/PaceZonesSettings.tsx` | Drawer config zones v2 par famille × zone (V0/V1/V2/V3/V4/MAX) — refonte schema multi-row (§186) | 343 lignes |
| `src/components/coach/pace/SwimmerPaceCard.tsx` | Accordéon nageur — propage zones_v2 + strokeAdjustments + v4ByFamily ; sous-accordions repliables par cible (§186) | 244 lignes |
| `src/components/coach/pace/PdfExportDialog.tsx` | Dialog pré-export PDF avec toggle 25m/50m (§186) | 116 lignes |
| `src/components/coach/AddSwimmerToTeamDialog.tsx` | Vue unique team-creation unifiée — refonte 'Mon équipe' (§186) | 233 lignes |
| `src/lib/paceCalculatorV2.ts` | Moteur pur non-linéaire pace-v2 — `t_allure(d) = (Tobj × R_base × A_nage + Δ_mesure) / k_allure` (§186) | 238 lignes |
| `src/lib/paceData.ts` | Tables data pures — `R_base(D, d)`, `A_nage(D, d, S)`, `k_allure(family, zone)` selon doc métier (§186) | 96 lignes |
| `src/lib/pdfPalette.ts` | Palette colorée pour export PDF (zones V0–MAX cohérentes avec écran) (§186) | 57 lignes |
| `src/lib/export-pace-pdf.ts` | Export PDF allures — refonte palette colorée + branding EAC (rouge + logo + club) + bassin d'origine + flèche conversion + footer épuré (§186) | 906 lignes |
| `src/lib/objective-pace-link.ts` | Parse `event_code` compact FFN (`"100NL"` etc.) → `{ stroke, distance, pool_size }` — utilisé par bouton coach + matrice nageur (§188) | 40 lignes |
| `src/lib/pace-prefill-handoff.ts` | Handoff sessionStorage coach→calculateur : `setPacePrefill` / `consumePacePrefill` (consume-once, §188) | 50 lignes |
| `src/lib/api/pace-targets.ts` | CRUD cibles d'allures via RPC `upsert_pace_target` (§184) — inclut `target_pool_size` (§185) | 62 lignes |
| `src/lib/api/pace-share.ts` | Création/lecture liens partage allures (`pace_share_links`) — inclut `swimmer_sex` dans payload (§185), zones_v2 (§186) | 47 lignes |
| `src/lib/api/pace-zones.ts` | CRUD zones v2 (multi-row family × zone) — `useCoachPaceZonesV2` shape (§186) | 126 lignes |
| `src/lib/api/pace-stroke-adjustments.ts` | CRUD overrides mS coach par nage × famille (§186) | 49 lignes |
| `src/lib/api/coaches.ts` | Liste des coaches pour vue Allures cross-coach (§186) | 30 lignes |
| `src/hooks/useTargetForObjective.ts` | `findMatchingTarget` (pure, tri updated_at desc) + hook React Query cibles nageur par swimmer_account_id (§188) | 39 lignes |
| `src/hooks/useCoachPaceZonesV2.ts` | Hook React Query schema v2 + `deletePaceZoneCell` (§186) | 71 lignes |
| `src/hooks/useCoachStrokeAdjustments.ts` | Hook React Query overrides mS coach (§186) | 60 lignes |
| `supabase/tests/rls/coach_pace_zones.test.ts` | Tests RLS coach_pace_zones : SELECT isolation + INSERT/UPDATE upsert + DELETE refus (§184 Phase 10) | 120 lignes |
| `supabase/tests/rls/coach_pace_targets.test.ts` | Tests RLS coach_pace_targets : isolation coach + upsert + DELETE + anon blocked (§184 Phase 10) | 159 lignes |
| `supabase/tests/rls/coach_manual_swimmers_update.test.ts` | Tests RLS UPDATE/DELETE sur coach_manual_swimmers + isolation cross-coach (§184 Phase 10) | 94 lignes |
| `supabase/tests/rls/pace_share_links.test.ts` | Tests RLS pace_share_links : INSERT/SELECT/DELETE + token partage anon read (§184 Phase 10) | 139 lignes |
| `docs/claude/files-map.md` | Annuaire détaillé des fichiers du projet (chargé à la demande) | |
