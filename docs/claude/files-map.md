# Carte des fichiers clés

*Chargé à la demande — ne PAS dupliquer dans `CLAUDE.md`.*

Ce fichier est l'annuaire détaillé des fichiers du projet. Pour les règles de mise à jour, voir `CLAUDE.md` § "Règles de mise à jour".

Convention colonnes : chemin, rôle (1 phrase), taille (mesurée via `wc -l`, jamais estimée).

---

| Fichier | Rôle | Taille |
|---------|------|--------|
| `src/lib/api/types.ts` | Interfaces TypeScript (sessions, strength, users, comps, wellness, cycles, challenges, achievements, pain, strength-planning, strength-mesocycles §293, periodization templates) | 1458 lignes |
| `src/lib/api/client.ts` | Supabase client, utilitaires | ~316 lignes |
| `src/lib/api/transformers.ts` | Fonctions de transformation strength | ~228 lignes |
| `src/lib/api/helpers.ts` | Fonctions de mapping | ~161 lignes |
| `src/lib/api/localStorage.ts` | Stockage local fallback + seedDemoData/resetCache (§219) | 171 lignes |
| `src/lib/api/index.ts` | Re-exports centralisés (point d'entrée unique post-§219) | 522 lignes |
| `src/lib/api/swim-sessions.ts` | CRUD dim_sessions (syncSession 23505 dedup, ensureSwimSession, saveSwimSessionAtomic §262 RPC+fallback, getSessions, updateSession, deleteSession, updateSessionCoachNotes, getCapabilities) — migré depuis ex-api.ts (§219) | 312 lignes |
| `src/lib/api/coach-kpis.ts` | Wrapper TS du RPC `get_coach_kpis` — 1 round-trip pour fatigue values multi-athlètes (Refacto C §223) | 56 lignes |
| `src/lib/api/strength-planning.ts` | CRUD strength_planning_* : slots groupe + overrides athlete + week meta (Phase 2 §157) | 170 lignes |
| `src/lib/api/strength-kpi.ts` | CRUD `strength_kpi_measurements` — mesures du wizard KPIs (`recordKpiMeasurement`, `getKpiHistory`, `getLatestKpiMeasurements`, `markKpiReviewed`) — Bilan Muscu §285 | 94 lignes |
| `src/lib/api/strength-assessments.ts` | CRUD `strength_assessments` — bilans muscu (`createAssessment`, `getLatestAssessment`, `getAssessment`, `listAssessments`, `getPreviousCompletedPhysicalTests` §301, `updateAssessmentQuestionnaire`, `updateAssessmentPhysicalTests`) — Bilan Muscu §285 | 132 lignes |
| `src/lib/strength/kpiProtocols.ts` | Config des 5 fiches-protocole KPI (`KPI_PROTOCOLS`, flag `allowNonPositive`) + map démo `KPI_DEMO_EXERCISE_ID` (§301) — Bilan Muscu §285 | 129 lignes |
| `src/lib/strength/kpiMeasurement.ts` | Helpers KPI : `bestAttempt`, `parseAttempts({allowNonPositive})`, `parsePositiveNumber`, `sanitizeNumericInput` (§301) — Bilan Muscu §285 | 69 lignes |
| `src/lib/strength/kpiBaremes.ts` | Barèmes KPI : `kpiScore` (interpolation + extrapolation au-delà de p90 jusqu'à 100, fin du plafond) + `KPI_BAREMES` (5 KPIs × 2 sexes × **4 bandes d'âge dont `adulte` ≥19**, dérivée des ancres 17-18, flag de confiance) + `ageBandFor`/`getBareme` + **`PerformanceTier`/`shiftAnchors`** (décalage des ancres par niveau de performance) — Bilan Muscu §290, dé-jeunification §303 | 344 lignes |
| `src/lib/strength/periodizationCycles.ts` | Stratégie de chargement par cycle de périodisation (`PERIODIZATION_CYCLES` : config des 6 cycles, union discriminée `CycleLoading` catalogue/générique) — Bilan Muscu Chantier A §292 | 166 lignes |
| `src/lib/strength/mesocycleEngine.ts` | **Moteur de génération du mésocycle** Bilan Muscu — fonctions TS pures TDD : `scoreBuckets` (6 seaux 0-100), `prioritizeBuckets` (score combiné + override sécurité + `forced_focus`), `allocateVolume` (focus/maintien), `selectExercises` (filtre douleur + substitution), `periodize` (distribution phases sur durée cible ; honore `startPhase` = tronque les phases amont §338), `cycleAtWeek(template, totalWeeks, idx)` (cycle RÉEL à un index de semaine, rejoue `periodize` — source unique « phase à la semaine N » §341 E2), `generateMesocycle` orchestrateur → `GeneratedMesocycle`. Chantier C §293 | 1712 lignes |
| `src/lib/strength/mesocycleEngine.types.ts` | Types-pivot du moteur (`GeneratedMesocycle`, `MesocycleInput` dont `startPhase?` §338, `MesocycleReasoning`, `BucketScores`/`Priority`/`Allocation`, `SelectedExercise`, `PeriodizedWeek`, `CatalogExercise`) — Chantier C §293 | 426 lignes |
| `src/lib/strength/phaseAtWeek.ts` | `phaseAtWeek(template, weekIndex0)` (TS pur) — cycle de périodisation à un index de semaine 0-based, walk **nominal** (`nominal_weeks`), `null` hors plage. ⚠️ Ne reflète PAS l'étirement `periodize` → **superseded** par `cycleAtWeek` (mesocycleEngine) pour la phase d'un plan réel (§341 E2) ; conservé pour ses tests / référence nominale — §338 | 29 lignes |
| `src/lib/strength/adjustmentFactors.ts` | `applyAdjustmentFactors(plan, vol, int)` (TS pur) — post-process d'un `GeneratedMesocycle` : `sets ×vol` (clamp ≥1), `intensityPct1rm ×int` (clamp [0,100]) ; laisse intact pct null/0 (plio/BW) ; throw sur facteur ≤0 — §338 | 39 lignes |
| `src/lib/strength/mesocycleGating.ts` | `canGenerateMesocycle(status)` — gate génération (`bilan_pending`\|`completed`), consommé par `MesocycleEntry`/`MesocycleGeneration`/`MesocyclePreview` — §299 | 22 lignes |
| `src/lib/strength/composeTemplate.ts` | **Composition nage × distance → template-like** (TS pur) : `bucket_emphasis[b] = clamp01(round2(distance.emphasis[b] × stroke.mult[b]))` (profil de distance ancré crawl × signature de nage vs crawl). Reproduit par construction les 7 emphases existantes. TDD `node:test` (8 cas) — §305 | 55 lignes |
| `src/lib/strength/mesocycleItemPayload.ts` | `preserveMesocycleTag(next, prev)` — garde `raw_payload.mesocycle_id` à l'édition (§299) ; `reconcileMesocyclePayloads(ordres, sourceByOrdre)` — corrèle/préserve `raw_payload` par `ordre` à la sauvegarde, impose le tag aux items ajoutés (§300) | 52 lignes |
| `src/lib/strength/__tests__/mesocycleEngine.test.ts` | 80 tests TDD du moteur (suites par fonction + orchestrateur ; bloc `periodize startPhase` §338) — §293 | 1961 lignes |
| `src/lib/strength/__tests__/mesocycleAdjust.integration.test.ts` | Test d'intégration moteur ajustement mid-cycle : `generateMesocycle(startPhase) → applyAdjustmentFactors` (plan tronqué + facteurs appliqués + assertion delta ≠ pass-through) — §338 | 216 lignes |
| `src/lib/strength/jumpPower.ts` | Calculs détente verticale (flightTimeToHeight, sayersPeakPower, relativePower, verticalJumpResult) — KPI puissance W/kg (§293 Phase 1) | 104 lignes |
| `src/lib/strength/medballPower.ts` | `medballThrowResult(massKg, distancesCm)` → indice balistique masse × distance (kg·m) du KPI lancer médecine-ball assis ; permet de choisir la masse du ballon, scoré sur une échelle unique (transposé des normes Seated MB Throw 2 kg) — §309 | 63 lignes |
| `src/lib/strength/zones.ts` | Mapping FR partagé des zones anatomiques granulaires (`left_shoulder`/`right_shoulder`/`lower_back`…) — consommé par `CoachMesocyclePanel` et `MesocyclePreview` — §294 | 50 lignes |
| `src/lib/strength/wrappedStats.ts` | **Module pur du récap muscu « Wrapped »** (§336) — `scoreToBand` (score KPI → bande percentile vs population), `rankKpis` (forces/axes), `computeProgressions` (top 3 Δ% 1RM 90 j), `computeVolumeStats` (tonnage/séances/exo phare), `describeObjective` (méso → objectif lisible), `hasEnoughWrappedData` (garde), `buildWrappedSlides` (liste ordonnée, saute les vides). Zéro I/O, testé `node:test` (15 tests). | 225 lignes |
| `src/lib/strength/intensityMetrics.ts` | Source unique de la métrique d'intensité par exercice (`INTENSITY_METRICS` : label/unité/`tracksOneRm`/`hasBodyweight`/`max` × 4 métriques weight_kg/height_cm/distance_cm/time_s) + `normalizeIntensityMetric` + `formatIntensity` — consommé par catalogue, builder, runner, progression — §298 | 29 lignes |
| `src/lib/strength/sessionDuration.ts` | Estimation durée d'une séance muscu (TS pur) : `estimateStrengthSessionDurationSeconds(items)` = Σ `sets × (EXEC_SECONDS_PER_SET=60 + repos)` (aperçu) + `estimateRemainingStrengthSessionDurationSeconds(items, currentStep, currentSetIndex)` (temps restant décroissant, même modèle, repos par item §339) + `formatApproxMinutes`. Consommé par `SessionDetailPreview` (total) et `RestSessionTab` (restant). TDD `node:test` (16 cas) — §331/§339 | 77 lignes |
| `src/lib/api/strength-mesocycles.ts` | Wrappers API mésocycle (`generateMesocyclePreview`, `applyMesocycle` → RPC avec `p_template_id: null` §305, `revertMesocycle` → RPC, `getMesocycle`/`getActiveMesocycle`/`listMesocycles`) + `getStrokeSignatures`/`getDistanceProfiles` (tables de référence §305) + `getCurrentMesocyclePhaseInfo` (helper pur phase/semaines restantes au pivot §338 ; phase dérivée de `cycleAtWeek`/periodize §341 E2) — Chantier D §293, taxonomie nage × distance §305 | 574 lignes |
| `src/lib/api/__tests__/strength-mesocycles.test.ts` | Tests des wrappers (mocks `client.ts` via `node:test mock.module`, sérialisation snake_case, conversion Date) + `getStrokeSignatures`/`getDistanceProfiles` §305 — §293 | 588 lignes |
| `src/lib/api/__tests__/strength-mesocycles-phase.test.ts` | Tests `getCurrentMesocyclePhaseInfo` (pivot mid-cycle, avant départ clamp 0, après fin weeksRemaining 0, transition exacte 1→0) — §338 | 99 lignes |
| `src/lib/api/strength-periodization-templates.ts` | Wrappers lecture des templates (`listStrengthPeriodizationTemplates`, `getStrengthPeriodizationTemplate`, `listStrengthTemplateEventGroups`) — §293 | 67 lignes |
| `src/lib/api/strength-catalog.ts` | Projection « taggée » de `dim_exercices` (`bucket`/`level`/`contraindication_zones`/`stroke_prehab_affinity`/`corrective_axes` §351/`supports_unilateral` §352/`is_core`/`selection_priority`) → `CatalogExercise[]` consommable par le moteur (§293) + `getExerciseGifs(ids)` (démos KPI §301) | 114 lignes |
| `src/lib/api/strength-warmup.ts` | API routines d'échauffement : lectures `getCommonWarmupRoutine()` (Bloc 1, `warmup_common_routine`, §351) + `getActivationRoutine()` (Bloc 3 par seau, `warmup_activation_routine`, §352) ; écritures `setCommonWarmupRoutine(ids)` / `setActivationRoutine(bucket, ids)` (§354, RPC atomiques `set_warmup_*`, mig 00217). Injectés dans `MesocycleInput` par l'aperçu ; fallback `[]`/`{}`. | 62 lignes |
| `supabase/migrations/00170_strength_mesocycles.sql` | Tables `strength_mesocycles` + `strength_planning_snapshots` + RLS nageur own + coach scope par CSA (corrigé en 00171) — §293 | 170 lignes |
| `supabase/migrations/00171_strength_mesocycles_coach_rls.sql` | Corrige le scope coach sur les 2 tables mésocycle : club-entier (calqué sur `strength_assessments`) — §293 | 36 lignes |
| `supabase/migrations/00172_apply_strength_mesocycle.sql` | RPC SECURITY DEFINER transactionnelle — supersede + INSERT mésocycle + snapshot + matérialisation templates/items/overrides + notification coach — §293 | 318 lignes |
| `supabase/migrations/00173_revert_strength_mesocycle.sql` | RPC SECURITY DEFINER transactionnelle — DELETE overrides + templates (identifiés via `raw_payload->>'mesocycle_id'`) + restore depuis snapshot JSONB + status='reverted' + notif athlète — §293 | 206 lignes |
| `supabase/migrations/00191_strength_athlete_settings.sql` | Table `strength_athlete_settings` (PK `athlete_id`, `practice_level`/`performance_tier` nullable + CHECK, `updated_by`/`updated_at`) + RLS asymétrique (athlète lecture seule de sa ligne `_own_read`, coach/admin lecture+écriture club-wide `_coach`) — dé-jeunification §303 | 39 lignes |
| `supabase/migrations/00193_strength_stroke_signatures.sql` | Table de référence `strength_stroke_signatures` (5 nages dont **papillon nouveau** ; multiplicateurs de seau vs crawl, crawl = réf 1.0) — RLS read-all / write coach-admin (calquée sur 00166) — taxonomie nage × distance §305 | 46 lignes |
| `supabase/migrations/00194_strength_distance_profiles.sql` | Table de référence `strength_distance_profiles` (8 lignes = 4 distances 50/100/200/400plus × 2 `kind` ; emphasis ancrée crawl + arc de périodisation + bornes de durée ; 200 m = réf, 400plus reprend 400 m) — RLS read-all / write coach-admin (calquée sur 00166) — §305 | 74 lignes |
| `supabase/migrations/00195_mesocycles_template_id_nullable.sql` | `strength_mesocycles.template_id` rendu nullable — l'event_group composé (ex. `freestyle_100`) porte la taxonomie ; RPC `apply_strength_mesocycle` inchangée — §305 | 16 lignes |
| `supabase/tests/rls/strength-mesocycle-rpc.test.ts` | 12 tests RLS d'intégration des RPC apply/revert (auth, supersede, matérialisation, notif, snapshot/restore) — §293 | 408 lignes |
| `docs/plans/bilan-muscu-mapping-mesocycle-planning.md` | Note technique du mapping mésocycle → `strength_planning_*` (conversion semaines/jours, cycle_type legacy, raw_payload, snapshot/revert) — §293 Phase 4 | 316 lignes |
| `docs/plans/bilan-muscu-barème-puissance-detente.md` | Sources et raisonnement du barème puissance détente verticale (Sayers + ancres CMJ Rodrigues 2024 par sexe × bande d'âge) — §293 Phase 1 | 303 lignes |
| `src/pages/MesocycleGeneration.tsx` | **Écran nageur de génération du mésocycle** (`/strength/mesocycle-generate`) — 6 sections : nage · épreuve · famille · durée tape-mesure + timeline compétitions · **jours de muscu** (picker 7 jours, amorce Lun/Jeu ambre vs dev violet, samedi off) · **date de départ** (input natif, 1re semaine partielle). Hand-off via sessionStorage. Mode focus dock masqué — §293 Phase 5.2, jour-aware §307 | 1244 lignes |
| `src/pages/MesocyclePreview.tsx` | **Écran nageur d'aperçu du mésocycle** (`/strength/mesocycle-preview`) — exécution locale du moteur + affichage raisonnement (6 score bars, top 3 priorités, dataConfidence) + plan détaillé (semaines collapsibles colorées par cycle, sessions avec **jour + badge rôle** amorce/dev/correctif §307, exercices avec notation `4 × 5 @ 85% · 180s`) + CTA Confirmer → `applyMesocycle(input, generated, startDate)`. **Mode ajustement mid-cycle §338** : payload `eac_pending_mesocycle_params` étendu (`adjust`/`startPhase`/`volumeFactor`/`intensityFactor`) → `input.startPhase` + post-process `applyAdjustmentFactors` + bandeau ambre (chemin génération inchangé) — §293 Phase 5.3, jour-aware §307 | 1433 lignes |
| `src/pages/MesocycleAdjust.tsx` | **Écran coach d'ajustement d'un méso actif mid-cycle** (`/strength/mesocycle-adjust/:athleteId`) — charge méso actif + signatures/profils + bilan + nom athlète, dérive stroke/distance d'`event_group`, lit le lundi de départ depuis `start_week_monday` (fallback TZ-safe `generated_at` §341 C3), calcule la phase au pivot (`getCurrentMesocyclePhaseInfo`) ; garde de rôle coach (§340 C1) ; formulaire pivot (défaut lundi prochain) + séances/jours + 2 curseurs charge + 3 présets + bannières ; tous les hooks avant early return (garde React #310) ; « Aperçu » → sessionStorage partagé + `MesocyclePreview`. Helpers purs exportés (`nextMonday`/`defaultWeekdays`/`pivotStateOf`/`formatFactorDelta`) — §338 | 653 lignes |
| `src/pages/MesocycleAdjust.vitest.tsx` | Tests vitest jsdom de `MesocycleAdjust` (4 helpers purs + composant : pivot défaut, préset Allègement, Aperçu désactivé si `weeksRemaining<1`, bannière rouge pivot passé, **garde de rôle C1**, **synchro séances↔jours C4**) — §338/§340 | 271 lignes |
| `src/pages/MesocyclePreview.vitest.tsx` | Tests vitest jsdom du helper pur `mesocyclePreviewBackTarget` (navigation retour aperçu : ajustement vs génération) — §340 | 31 lignes |
| `src/components/strength/MesocycleEntry.tsx` | Tuile d'entrée sur `/strength` (onglet S'entraîner) — variante violette « action attendue » si pas de mésocycle actif, neutre « Régénérer » sinon. Conditionnée par `canGenerateMesocycle` (`bilan_pending`\|`completed`) — §293, verrou abaissé §299 | ~115 lignes |
| `src/components/coach/CoachMesocyclePanel.tsx` | **Panneau coach** dans l'onglet Planning de `CoachSwimmerFullView` — visibilité du mésocycle actif + raisonnement parsé du `bucket_priorities` jsonb (6 score bars + top 3 priorités + flags) + bouton Rejeter avec `AlertDialog` → `revertMesocycle` + historique compact — §293 Phase 6 | 538 lignes |
| `src/lib/api/training-plans.ts` | CRUD training_plans + sessions + applications (§275.2) — 14 fonctions + helper `getActiveTrainingPlanApplicationsForUser` pour timeline derivation | 357 lignes |
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
| `src/lib/systemBanners.ts` | Queue système pour les 4 bandeaux (§210 Chantier D) — hook `useSystemBanner(key, isActive)` + module state ; priorité fixe `offline > update > push > install` → 1 seul banner visible à la fois | ~95 lignes |
| `src/lib/offlineQueue.ts` | Queue localStorage pour mutations offline — `enqueue`, `getQueue`, `markRetry`, dispatche `eac-offline-queue-updated` (§162) | 113 lignes |
| `src/components/shared/OfflineMutationSync.tsx` | Rejoue la queue offline au retour réseau ET sur `eac-offline-queue-updated` (§162) | 168 lignes |
| `src/lib/date.ts` | Helpers de date canoniques : `toISODate`/`formatLocalDateISO`/`formatDateIso`, `addDays`, `addDaysIso`, `getMonday`, `getSunday`, `mondayIsoOf`, `getMondaysBetween`, `formatSwimSessionDefaultTitle`, `computeTrainingDaysRemaining`, `formatRelativeDate` (§196, §214) | 138 lignes |
| `src/lib/__tests__/date.test.ts` | Tests unitaires des helpers de date (formatSwimSessionDefaultTitle, formatRelativeDate) | 52 lignes |
| `src/lib/schema.ts` | Schéma Drizzle (tables) | |
| `src/pages/SwimmerHome.tsx` | Home nageur (wellness, séances jour, compétition, accès rapides) | ~710 lignes |
| `src/pages/Dashboard.tsx` | Orchestrateur natation nageur (route /natation) — queries, useDashboardState, navigation, banners, settings dialog inline (§216 split) | ~784 lignes |
| `src/pages/Strength.tsx` | Module musculation perso (nageur ET coach depuis §271 — vue toujours personnelle, ignore `selectedAthleteId` du store coach) | ~1114 lignes |
| `src/pages/KpiWizard.tsx` | Assistant guidé de saisie des 5 KPIs de force (§285, routes `/strength/kpi-wizard` + `/coach/kpi-wizard/:athleteId` §302 cible imposée → saute la sélection, revient au bilan) — phases (sélection nageur coach, 5 étapes, recap diff + confiance barème §301), démos GIF catalogue §301, mode focus dock masqué | 790 lignes |
| `src/pages/StrengthQuestionnaire.tsx` | Questionnaire bilan muscu (§286, routes `/strength/questionnaire` nageur + `/coach/questionnaire/:athleteId` §299 coach) — `getLatestAssessment` → 3 cas ; 4 sections (douleurs, historique, mobilité, psychologie) ; submit `updateAssessmentQuestionnaire` + `upsertPainReports` ; done-state coach → « Noter le bilan physique » / KPIs (§302) | 560 lignes |
| `src/pages/coach/StrengthAssessmentScreen.tsx` | Bilan physique coach (§287, routes `/coach/strength-assessment` + `/coach/strength-assessment/:athleteId` §302 cible persistante, coach/admin) — sélection nageur, `getLatestAssessment` → 4 cas, rubrique 0-3 G/D par axe via `AssessmentBilateralField` (§346) + note précédente (§301), **fil conducteur `BilanProgress`** + `BilanHistorySection` (§347) ; **édition d'un ancien bilan** (§348 : `editingAssessmentId`, bandeau « Édition du bilan du {date} » + Annuler, save vise l'ancien id) ; done-state → "Générer le mésocycle" + bannière profil incomplet ; submit `updateAssessmentPhysicalTests` | 1054 lignes |
| `src/pages/coach/SwimCatalog.tsx` | Catalogue séances nage (coach) | ~1003 lignes |
| `src/pages/coach/StrengthCatalog.tsx` | Builder muscu (coach) | ~1463 lignes |
| `src/pages/Records.tsx` | Records personnels + FFN sync + virtualisation @tanstack/react-virtual grille natation (§270 R5 sub-§C) | 1517 lignes |
| `src/components/records/RecordCard.tsx` | Card record de natation memoïsée — utilisée dans Records.tsx filteredSwimRecords.map (§267 R2 sub-§C) | 56 lignes |
| `src/pages/RecordsClub.tsx` | Records club (sections nage, drill-down progressif) | ~840 lignes |
| `src/pages/RecordsAdmin.tsx` | Admin records + gestion nageurs | ~300 lignes |
| `src/pages/Login.tsx` | Login + inscription | ~340 lignes |
| `src/pages/coach/CoachCalendar.tsx` | Calendrier coach (vue mensuelle assignations) | ~266 lignes |
| `src/hooks/useCoachCalendarState.ts` | Hook état calendrier coach (grille, query, slots) | ~187 lignes |
| `src/pages/coach/CoachSwimmersOverview.tsx` | Dashboard synthétique nageurs (grille cards, KPIs) | ~648 lignes |
| `src/pages/coach/CoachSwimmerDetail.tsx` | Dispatcher thin : route vers CoachSwimmerFullView (titulaire) ou CoachSwimmerQuickView (substituant) selon hasAccess (§152) ; enveloppe `<Inner>` dans un `ErrorBoundary` inline récupérable `resetKeys={[athleteId]}` (§337) | 46 lignes |
| `src/components/shared/ErrorBoundary.tsx` | Error boundary réutilisable : variantes `fullscreen` (App.tsx, reload) et `inline` (sections récupérables, re-render sans reload) ; auto-reset via `resetKeys` ; **log prod+dev** avec `context` ; détection chunk error (§337, ex-§330) | 198 lignes |
| `src/pages/coach/CoachSwimmerFullView.tsx` | Page fiche nageur complète (4 onglets: Résumé/Planning/Échanges/Comms) — ex-CoachSwimmerDetail (§152) + CTA "Démarrer/Reprendre" bilan muscu resume-aware dans section Mésocycle muscu (§A) | 638 lignes |
| `src/pages/coach/CoachSwimmerQuickView.tsx` | Mode dépannage substituant : briefing lecture-seule + présence/commentaire/assignation avec recorded_by (§152) | 346 lignes |
| `src/pages/coach/QuickViewAttendanceDialog.tsx` | Dialog enregistrement présence substituant (Présent/Absent/Retard + commentaire) (§152) | 90 lignes |
| `src/pages/coach/QuickViewCommentDialog.tsx` | Dialog ajout commentaire séance par substituant (max 500 car.) (§152) | 78 lignes |
| `src/pages/coach/QuickViewAssignDrawer.tsx` | Sheet assignation séance : onglet Bibliothèque (search + liste) + Nouvelle (ad-hoc) (§152) | 176 lignes |
| `src/lib/api/coach-quickview.ts` | Module API QuickView : getSwimmerBriefing (RPC), recordAttendanceAsSub, addSessionCommentAsSub, assignSessionToSlotAsSub (§152) | 143 lignes |
| `src/components/coach/swimmer-kpis/SwimmerFormBadge.tsx` | Badge forme nageur (mode coach secondaire) : readiness moy. 7j 0-100 + sparkline + détail 5 sous-métriques (sommeil/fatigue/courbatures/humeur/stress) + heures sommeil + dernière note (§152, enrichi §333) | 178 lignes |
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
| `src/components/shared/Surface.tsx` | Primitive iOS-aligned (§199 Chantier B) — variant solid/glass/tinted/outline × radius sm=12/md=16/lg=22 + prop interactive ; vouée à unifier les ~8 variantes "card-like" recensées dans l'audit `docs/audits/2026-05-08-ui-ux-audit-ios.md` | 70 lignes |
| `src/components/shared/EmptyState.tsx` | Composant partagé empty state (§203 Chantier D) — API icon/title/description/cta/compact ; unifie les 4 implémentations recensées dans l'audit | ~75 lignes |
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
| `src/lib/weekTypeColor.ts` | Helper partage couleur type semaine (hash-based) | ~15 lignes |
| `src/lib/api/swimmer-slots.ts` | CRUD créneaux personnalisés par nageur | ~160 lignes |
| `src/components/coach/SwimmerSlotsTab.tsx` | Onglet Créneaux dans fiche nageur coach | ~374 lignes |
| `src/lib/pwaHelpers.ts` | Détection plateforme, gate PWA | ~30 lignes |
| `src/lib/lazyWithRetry.ts` | Util partagé `lazy()` avec retry chunk-loading PWA (§119) | ~30 lignes |
| `src/lib/push.ts` | Subscription push, helpers VAPID + `refreshPushSubscription` (silent resync au boot, cooldown 7j, anti-cleanup 90j, anti-rotation endpoint) (§194 Vague B) | 166 lignes |
| `src/lib/pushHelpers.ts` | Fonctions pures push : `urlBase64ToUint8Array`, `serializeSubscription`, `shouldRefreshPushSubscription` (cooldown), `shouldShowPushBanner` (reproposition 60j) (§194 Vague B) | 82 lignes |
| `src/hooks/usePushSubscriptionRefresh.ts` | Hook qui appelle `refreshPushSubscription` au boot une fois par session, gated par cooldown localStorage 7j. Monté dans `PushBridge` (App.tsx) (§194 Vague B) | 56 lignes |
| `src/lib/pushConfig.ts` | VAPID public key config | ~1 ligne |
| `src/components/shared/PWAInstallGate.tsx` | Gate installation PWA mobile | ~130 lignes |
| `src/components/shared/PushPermissionBanner.tsx` | Banner permission push post-login | ~70 lignes |
| `public/push-handler.js` | Service Worker push event handler — gate `focused` désormais contextuel (suppression OS uniquement si client focused sur la même page que `data.url` via `pushTargetMatchesClient`), tag par notif respecté (envoyé par push-send) (§194 Vague C) | 100 lignes |
| `supabase/functions/push-send/index.ts` | Edge Function envoi push (web-push VAPID) — auth gate refactor : décode JWT payload + check `role === 'service_role'` au lieu de comparer le token à l'env (résout les 401 silencieux du trigger pg_net après divergence vault/env) ; tag unique `eac-notif-{id}` ou `eac-manual-{ts}` envoyé au SW (§194 Vague C) | ~256 lignes |
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
| `src/pages/CompetitionDetail.tsx` | **Vue info compétition** (header J-X + section adaptée au rôle InfoMyObjectives/InfoParticipants + CTA Préparer sticky). Landing par défaut sur `/competition/:id`. | 150 lignes |
| `src/pages/CompetitionPrep.tsx` | Page préparation compétition (4 onglets Check/Courses/Routines/Jour J). Mountée sur `/competition/:id/prep`. Ancien `CompetitionDetail` renommé §191. | 324 lignes |
| `src/components/competition/info-helpers.ts` | Helpers purs `computeObjectivePerfRow` (utilise `findBestTime` pour bridger format compact ↔ FFN, §193 fix) + `groupAndSortAssignments` (§191) + `selectLinkableForCompetition` (§193, remplace `selectLinkableObjectives` §192). | 98 lignes |
| `src/components/competition/InfoMyObjectives.tsx` | Section nageur de la vue info compétition (table objectifs + PB 12 mois glissants + delta cible). Bouton "+ Objectif" + empty state CTA ouvrent `AddObjectiveSheet` inline (§192). | 173 lignes |
| `src/components/competition/AddObjectiveSheet.tsx` | Sheet bottom 2 onglets (Créer/Lier) pour ajouter ou rattacher un objectif à la compétition courante depuis la vue info. N:N support §193 — onglet Lier multi-select via Checkbox (shadcn), montre tous les objectifs sauf ceux déjà liés, avec libellé "Déjà lié à : ..." multi-comp. | 424 lignes |
| `src/components/competition/InfoParticipants.tsx` | Section coach/comité/admin de la vue info compétition (liste participants triée groupe puis nom, badge objectifs). | 128 lignes |
| `src/components/competition/RacesTab.tsx` | Onglet courses (CRUD épreuves, Sheet, couleur nage) | ~380 lignes |
| `src/components/competition/RoutinesTab.tsx` | Onglet routines (templates, steps, assignation par course) | ~530 lignes |
| `src/components/competition/TimelineTab.tsx` | Onglet Jour J (fusion chronologique courses + routines) | ~235 lignes |
| `src/components/competition/ChecklistTab.tsx` | Onglet checklist (templates, progress bar, toggle) | ~415 lignes |
| `src/components/strength/ExercisePicker.tsx` | Picker substitution/ajout exercices en mode focus (§89) — utilise ExerciseGif offline-aware (§170) | |
| `src/components/strength/ExerciseGif.tsx` | Composant `<img>` partagé focus muscu : key={src} + skeleton + onError fallback Dumbbell/ImageOff offline-aware (§170) | 83 lignes |
| `src/components/strength/MyPlanTab.tsx` | Onglet Mon plan nageur — consomme strength_planning_* BDD avec fallback cycles Phase 1 (§156+§157) (memo §267). §336 : bouton « Récap » + overlay `StrengthWrappedRecap`. §342 : bandeau `MyPlanMesocycleBanner` (objectif · Semaine X/Y · phase, props #310-safe). | 622 lignes |
| `src/components/strength/MyPlanMesocycleBanner.tsx` | Bandeau « hero » COMPACT (2 lignes, §345) de Mon plan muscu (§342 V5) — présentationnel : objectif (`formatEventGroupLabel`), Semaine X/Y + barre `role=progressbar`, chip de phase (`shortPhaseLabel`), méta `kind · Généré le …` (V8), bouton « Récap » intégré (`recapEnabled`/`onOpenRecap`). UI via `frontend-design`. | 137 lignes |
| `src/components/strength/wrapped/StrengthWrappedRecap.tsx` | **Overlay récap muscu « Wrapped »** (§336) — moteur de stories plein écran : barres de progression segmentées, autoplay 6 s, tap gauche/droite, press-hold pause, croix + swipe-down, flèches clavier + Échap, lock scroll body, focus a11y, `prefers-reduced-motion`, `key={index}` rejoue count-up + framer-motion. Props `{athleteId, open, onClose, viewerContext, displayName?}`. Monté par `MyPlanTab` (self) et `CoachSwimmerFullView` (coach). UI via skill `frontend-design`. | 296 lignes |
| `src/components/strength/wrapped/CountUp.tsx` | Animation count-up rAF du récap (§336), reduced-motion aware (valeur finale instantanée). | 86 lignes |
| `src/components/strength/wrapped/slides/*.tsx` | 8 slides présentationnelles du récap (§336) : Cover/Objective/Forces/Potential/Progressions/Volume/FunStat/Outro + `slideChrome.tsx` (shell partagé dégradé/grain/halo/kicker). Aucune valeur brute KPI/poids athlète rendue. | ~560 lignes (9 fichiers) |
| `src/components/strength/MyPlanWeekCard.tsx` | Carte semaine collapse/expand : rail dot, header S/dates/phase/chips compétitions, grille 7j (§156). §342 V6 : badge = `shortPhaseLabel(phaseName)` (vrai `week_type`, Maintien/Affûtage distincts), masqué si pas de phase. | 215 lignes |
| `src/components/strength/MyPlanSessionSheet.tsx` | Bottom Sheet aperçu séance muscu (titre, phase badge, liste items, Lancer) (§156) | 103 lignes |
| `src/components/strength/MyPlanSessionRow.tsx` | Ligne jour×séance dans carte semaine (check, badge jour, titre, compteur) (§156) | 99 lignes |
| `src/lib/strength/strengthPlanWeeks.ts` | Pure helpers : buildWeekInstances, parseWeekRange, weekInfoFromSNumber, types WeekInstance/WeekSession (§156) | 181 lignes |
| `src/lib/strength/strengthPhaseStyles.ts` | PHASE_STYLES, detectPhase (vide→reprise neutre §342 V3), type StrengthPhase, `shortPhaseLabel` (libellé phase compact §342 V6) — extraits de MyPlanTab (§156) | 43 lignes |
| `src/lib/strength/mesocycleProgress.ts` | Helpers purs guidage nageur (§342 V5) : `formatEventGroupLabel` (event_group → « 50 m crawl ») + `mesocyclePosition(startMonday, totalWeeks, currentMonday)` → `{weekNumber, totalWeeks, status}`. TDD `node:test` (10). | 74 lignes |
| `src/lib/strength/physicalTests.ts` | Module pur G/D bilan (§346) : `normalizePhysicalTests(raw)` upcaste la forme stockée (ancien number par axe OU v2 `{left,right,note}`) → forme canonique ; `effectiveAxisScore(axis)=min(left,right)`. Source unique de rétrocompat, consommé par le moteur + l'UI bilan. TDD `node:test` (4). | 30 lignes |
| `src/lib/strength/mobilityEvolution.ts` | Helper pur évolution des bilans (§347) : `buildMobilityEvolution(assessments)` → série chrono `{date,left,right,effective}` par axe (6 axes, via `normalizePhysicalTests`, ignore bilans sans physical_tests) + `MOBILITY_EVOLUTION_AXES`. TDD `node:test` (3). | 106 lignes |
| `src/lib/strength/warmupLabels.ts` | Helpers purs d'affichage de l'échauffement intelligent (§351-353) : `warmupSectionLabel(kind)` (articulaire/corrective/activation), `correctiveChipLabel(axis, side)` (« Mobilité de hanche · côté gauche », labels FR via `MOBILITY_EVOLUTION_AXES`), `warmupMetaFromItem(item)` (§353 — lit `raw_payload.warmup_kind`/`corrective_axis`/`corrective_side` d'un `StrengthSessionItem` avec garde de validation, pour le marquage vue nageur). TDD `node:test` (11). | 77 lignes |
| `src/pages/coach/strengthAssessmentPayload.ts` | Helper pur du formulaire bilan physique G/D (§346) : `ScoreState` (G/D + note par axe), `BILATERAL_KEYS`, `buildPhysicalTestsPayload` (→ jsonb v2 : axes `{left,right,note?}`, trunk single, note racine), `scoreStateFromNormalized` (préremplissage). | 144 lignes |
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
| `supabase/migrations/00156_notification_triggers_expires_at.sql` | `expires_at` adapté par type sur les 6 fonctions `auto_notify_*` (session = `scheduled_date+1d`, compétition = `start_date+2d`, slot override = `override_date+1d`, interview = `+30d`, swimmer comment = `+7d`) + backfill `created_at + 14d` sur toutes les notifs sans expires_at — masque immédiatement le backlog historique (§194). | 292 lignes |
| `src/hooks/useCompetitionsByWeek.ts` | Hook partagé : competitionsByWeek Map + getDayCompetitions par jour (§156) | 67 lignes |
| `src/hooks/useStrengthPlanByISO.ts` | Hook nageur — fusionne plan groupe + overrides (mergeStrengthSlots §157) et expose `planByISO`/`resolvedByISO`/`strengthByISO` au calendrier Dashboard et au FeedbackDrawer (§172). Helpers `buildWeekStarts`/`isoFromWeekStartAndDay` exportés (TZ-safe via local-date components, fix bug latent toISOString shift UTC). | 176 lignes |
| `src/hooks/useStrengthWrapped.ts` | Hook d'orchestration du récap muscu « Wrapped » (§336) — `useStrengthWrapped(athleteId, {active})` : 5 queries React Query (profile/méso/KPI/historique/exos), aplatit les runs en `SetEntry[]` (dual path Supabase `strength_set_logs` / localStorage `logs`), bande d'âge depuis `birthdate`, alimente `wrappedStats`. `active` gate les 2 requêtes lourdes (historique 200 + exos) → button-visibility cheap, fetch lourd seulement à l'ouverture. | 137 lignes |
| `src/hooks/__tests__/useStrengthPlanByISO.test.ts` | 8 tests unitaires sur les helpers TZ-safe (régression boundaries mois/année, dimanche edge case `getDay()=0`, no shift UTC) (§172) | 61 lignes |
| `src/hooks/useDebouncedValue.ts` | Hook debounce générique `<T>(value, delay) → T` — useState+useEffect+setTimeout/clearTimeout (§270 R5 sub-§A) | 10 lignes |
| `src/hooks/__tests__/useDebouncedValue.test.ts` | 3 tests TDD (valeur initiale, délai respecté, debounce reset) (§270 R5 sub-§A) | 56 lignes |
| `src/components/coach/strength/CopyToAthleteDialog.tsx` | Dialog copie séance/dossier vers autre nageur (§90) | |
| `src/components/coach/strength/WarmupRoutinesEditor.tsx` | Éditeur coach des routines d'échauffement (§354) — onglet « Échauffement » de `StrengthCatalog`. Sous-composant `RoutineListEditor` (liste ↑↓/×/ajouter + Enregistrer dirty-aware) ; section Bloc 1 (routine commune) + 4 sous-sections d'activation par seau. Lit `getCommonWarmupRoutine`/`getActivationRoutine`/`listCatalogExercisesTagged`, sauve via `setCommonWarmupRoutine`/`setActivationRoutine`. | 263 lignes |
| `src/components/strength/SessionBrowser.tsx` | Orchestrateur bibliothèque muscu nageur (§93) | |
| `src/components/strength/TeamPlansSection.tsx` | Plans d'équipe visibles entre nageurs (§93) | |
| `src/lib/strengthHistoryUtils.ts` | Helpers calcul historique muscu (tonnage, sRPE, groupByExercise) | ~80 lignes |
| `src/components/strength/RunDetailSheet.tsx` | Bottom sheet détail séance musculation (KPIs, exercices, ressenti) | ~170 lignes |
| `src/lib/gifEncoder.ts` | Conversion vidéo → GIF (Canvas + gifenc, 240px, ≤200KB) (§91). §164 : `loadGifenc()` async + cache pour lazy import. | ~131 lignes |
| `src/components/coach/strength/VideoTrimmer.tsx` | Trimmer vidéo dual-slider (max 5s) (§91) | ~130 lignes |
| `src/components/coach/strength/MediaSourceSheet.tsx` | Bottom sheet filmer/importer illustration (§91) | ~100 lignes |
| `src/components/strength/RestScreen.tsx` | Container repos enrichi (timer + 3 tabs swipables) (§94) | ~200 lignes |
| `src/components/strength/RestExerciseTab.tsx` | Tab exercice (GIF, prescription, muscles, notes) (§94) | ~95 lignes |
| `src/components/strength/RestSessionTab.tsx` | Tab progression séance (barre, volume, liste, temps restant via `estimateRemainingStrengthSessionDurationSeconds` §339) (§94) | ~257 lignes |
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
| `src/pages/Coach.tsx` | Hub coach (home, KPIs, Ma semaine matrice matin/aprèm §131) — coachKpisQuery refactoré en 1 RPC (§223) | ~1246 lignes |
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
| `src/pages/coach/CoachMessagesScreen.tsx` | Écran messages coach (formulaire épuré sans Cards, §196) | 244 lignes |
| `src/components/strength/WorkoutRunner.tsx` | Runner séance muscu (mode focus, sets, repos) | 1484 lignes |
| `src/components/strength/SetRow.tsx` | Ligne exercice memoïsée pour l'aperçu séance dans WorkoutRunner (§267 R2 sub-§A) | 66 lignes |
| `src/components/strength/kpi/KpiStepCard.tsx` | Étape KPI du wizard (§285) — protocole (steps, rôle binôme, mesure, GIF), N champs d'essais, valeur retenue live via `bestAttempt` ; branche `vertical_jump` → `VerticalJumpInputs`, `medball_vertical_throw` → `MedballThrowInputs` (§309) | 190 lignes |
| `src/components/strength/kpi/MedballThrowInputs.tsx` | Saisie du KPI lancer médecine-ball assis (§309) — champ masse du ballon (kg) + 3 distances (cm) → indice masse × distance (kg·m) calculé en direct ; style aligné sur `VerticalJumpInputs` (cohérence wizard) | 165 lignes |
| `src/components/strength/kpi/KpiRecap.tsx` | Recap post-submit du wizard KPIs (§285) — diff de chaque mesure vs précédente, note review coach si source athlete, pastille de confiance barème par-KPI (§301) | 281 lignes |
| `src/components/strength/kpi/KpiSwimmerPicker.tsx` | Drawer de sélection nageur du wizard KPIs (§285) — cible mesurée + binôme `assisted_by`, recherche | 141 lignes |
| `src/components/strength/kpi/KpiGifPanel.tsx` | Slot démo d'un protocole KPI — cascade : `<img>` si `gifUrl` fourni, sinon `<KpiAnimatedIllustration>` (§295) | 33 lignes |
| `src/components/strength/kpi/KpiStopwatch.tsx` | Chrono temps de vol intégré pour KPI détente (§295) — state machine idle/running/stopped, `performance.now()` sub-ms, vibration haptique, fallback `↺ Refaire` | 194 lignes |
| `src/components/strength/kpi/KpiAnimatedIllustration.tsx` | Dispatcher des 5 illustrations SVG animées des protocoles KPI (§295) — switch par `kpiKey` | 54 lignes |
| `src/components/strength/kpi/illustrations/*.tsx` | 5 SVG inline animés (`VerticalJump`, `BroadJump`, `Imtp`, `WeightedPullup`, `MedballThrow`Anim) — silhouettes monochromes `stroke-current`, CSS keyframes namespacées (§295) | ~60 lignes chacun |
| `src/components/strength/questionnaire/ScaleField.tsx` | Échelle en pilules pour le bilan muscu (§286, généralisée §287 prop `min`) — questionnaire nageur (1-5) + bilan coach (0-3) ; échelle neutre sans tokens intensité | 89 lignes |
| `src/components/strength/assessment/AssessmentContext.tsx` | Contexte read-only du bilan physique coach (§287) — questionnaire nageur (douleurs `BodyHeatMap` view, historique, mobilité, psycho) + KPIs latest, en lecture seule | 229 lignes |
| `src/components/strength/assessment/assessmentScores.ts` | Définition statique des 6 scores 0-3 du bilan physique (§287) — libellés, hints, captions, légende, `SCORE_UNSET` + **rubrique 0-3 par axe (`levels`) et repère chiffré (`gauge`)** pour la répétabilité (§301 T5) | 163 lignes |
| `src/components/strength/assessment/AssessmentScoreField.tsx` | Champ de notation 0-3 d'un axe du bilan physique (§301 T5) — slider + repère chiffré + descripteur du niveau choisi + dépliant 4 niveaux avec photos de référence (fallback gracieux) + rappel de la note précédente + illustration ROM animée (§A) | 181 lignes |
| `src/components/strength/assessment/AssessmentBilateralField.tsx` | Champ de notation **gauche/droite** d'un axe du bilan (§346) — 2× `ScaleField` 0-3 (Gauche \| Droite) + note repliable par axe + rubrique/gauge réutilisées ; affiche le côté faible (= `effectiveAxisScore` moteur) dans le descripteur. UI via `/frontend-design`. | 253 lignes |
| `src/components/strength/assessment/BilanHistorySection.tsx` | Section coach « Historique des bilans » (§347) — `listAssessments` → liste date + badge statut, ligne dépliable montrant le détail **read-only** des scores G/D + notes (via `normalizePhysicalTests`) ; bouton « Éditer » (`onEdit`, §348) sur les lignes notées ; monte `MobilityEvolutionChart`. UI via `/frontend-design`. | 271 lignes |
| `src/components/strength/assessment/MobilityEvolutionChart.tsx` | Courbe d'évolution mobilité G/D (§347) — recharts `LineChart` (style calqué `ExerciseProgressChart`) : sélecteur d'axe + mode G&D / Gauche / Droite / Côté faible ; état vide < 2 points. Alimentée par `buildMobilityEvolution`. UI via `/frontend-design`. | 213 lignes |
| `src/components/strength/assessment/AssessmentRomIllustration.tsx` | Illustration ROM animée par axe (§A) — arc SVG `stroke-dashoffset` 0°→angle score-mapped (rose/amber/cyan/vert) pour les 4 axes angulaires ; barre de stabilité segmentée pour les 2 axes qualitatifs ; re-joue à chaque score via `key=` | 218 lignes |
| `src/components/strength/assessment/BilanProgress.tsx` | Fil conducteur du bilan muscu coach (§302) — bandeau 3 étapes (Questionnaire/KPIs/Bilan physique) tappables avec état done/current/todo | 96 lignes |
| `src/components/strength/assessment/StrengthAthleteProfileCard.tsx` | Bloc coach de réglage du profil muscu (§303) — 2 selects autosave (niveau de pratique + tier de performance) → `strength_athlete_settings`, indicateur « Enregistré » transitoire, skeleton, a11y ; rendu dans la branche `bilan_pending` du bilan physique | 218 lignes |
| `src/lib/strength/bilanProgress.ts` | Logique pure du flux bilan : `computeBilanProgress`, `nextBilanStep`, `BilanStepKey`, `isProfileComplete` — §302 + §A | 83 lignes |
| `src/hooks/useBilanSteps.ts` | Hook DRY qui construit `BilanStep[]` pour le strip de progression coach — résout `onTap` + supprime le tap vers l'écran courant (`currentKey`) — §A | 72 lignes |
| `src/components/strength/StrengthBilanEntry.tsx` | Points d'entrée Bilan Muscu sur `/strength` (§288) — `QuestionnairePrompt` (carte conditionnelle, visible si `getLatestAssessment` `questionnaire_pending`, → `/strength/questionnaire`) + `KpiWizardEntry` (tuile standard, → `/strength/kpi-wizard`) | 95 lignes |
| `src/components/dashboard/FeedbackDrawer.tsx` | Drawer feedback séance natation | ~1265 lignes |
| `src/components/dashboard/DashboardCalendar.tsx` | Wrapper React.memo de CalendarHeader + CalendarGrid — isole le calendrier des re-renders d'écriture (§216) | 69 lignes |
| `src/components/dashboard/DashboardFeedbackContainer.tsx` | Conteneur React.memo du FeedbackDrawer — possède saveState/draftState/alternativeOverride + 5 mutations + handlers markAbsent/markPresent/clearOverride/saveFeedback (§216) | 440 lignes |
| `src/components/dashboard/SwimExerciseLogsHistory.tsx` | Historique logs exercices nage | ~505 lignes |
| `src/components/coach/strength/AthletePlansTab.tsx` | Onglet plans athlète (coach muscu) — legacy, conservé en sous-tab "Plans nageurs" (§275.4) | ~964 lignes |
| `src/components/coach/strength/TrainingPlansBrowser.tsx` | UI training_plans (§275.4-7 + §279) : liste plans + create dialog + éditeur grille num_weeks × 7 + add/remove week + picker session + SessionPreviewPopover sur cellules pleines (Changer / Retirer) + ApplyPlanDialog + PlanApplicationsList | 1421 lignes |
| `src/components/coach/strength/SessionPreviewPopover.tsx` | Composant partagé (§279) — popover hover/tap d'aperçu d'une séance (exercises/sets/reps/%1RM/repos). Actions Changer/Retirer optionnelles. Utilisé par Planif muscu (read-only) + Plan builder (avec actions). | 212 lignes |
| `src/pages/coach/StrengthPlanningScreen.tsx` | Aperçu read-only du plan muscu (§276.3 + §278) — timeline dérivée des `training_plan_applications` (mode nageur OU groupe). Plus de drawer : aperçu via popover inline `SessionPreviewPopover` (hover desktop / tap mobile). | 674 lignes |
| `src/components/coach/strength/StrengthPlanningTimeline.tsx` | Timeline présentationnelle planif muscu (7j × semaines, chips séance + dot phase) + `SessionPreviewPopover` (§278) pour aperçu hover/tap des cellules from-plan en mode read-only. | 962 lignes |
| `src/lib/strength/derivePlanByWeekDay.ts` | Pure function (§275.6) : applications + sessions → Map<weekKey, Map<dayIndex, DerivedCell>>. Conflict resolution = newest start_date wins. Consommé par StrengthPlanningScreen (§275.6) + MyPlanTab Phase 3 (§275.7). | 121 lignes |
| `src/components/strength/MyPlanTab.tsx` | Vue "Mon plan" nageur (§275.7 ajoute Phase 3 priorité training_plan_applications > strength_planning_slots > cycles legacy). | 457 lignes |
| `src/hooks/coach/useStrengthPlanningAthleteMode.ts` | Hook sélection athlète + merge slots/weekMeta + mutations routées groupe/overrides (§160). §271 : injecte le coach comme cible synthétique du picker pour plan perso. | 493 lignes |
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
| `src/components/profile/SwimmerMessagesView.tsx` | Vue messages nageur (accordion inline, dismiss par item, §196) | 350 lignes |
| `src/components/profile/BadgesGrid.tsx` | Grille badges/achievements | ~228 lignes |
| `src/components/shared/SwimmerWeekSlots.tsx` | Créneaux semaine nageur (vue détaillée jour par jour, swipe semaine) | ~563 lignes |
| `src/components/shared/SwimmerWeekMatrixCard.tsx` | Card "Ma semaine" compacte nageur — slots via `get_swimmer_sessions` (per-swimmer) + ressentis via `api.getSessions` (RPC retourne `log_session_id=NULL` inconditionnel) (§190 + §190-fix + §190-fix2) | 459 lignes |
| `src/components/shared/swimmerWeekMatrix.ts` | Helpers purs `classifyCell` + `foldCellStates` pour SwimmerWeekMatrixCard (§190) | 70 lignes |
| `src/components/strength/SessionDetailPreview.tsx` | Aperçu détail séance muscu | ~382 lignes |
| `src/components/strength/SessionList.tsx` | Liste séances muscu | ~399 lignes |
| `src/components/strength/ExerciseProgressChart.tsx` | Graphe progression exercice | ~335 lignes |
| `src/components/strength/HistoryTable.tsx` | Tableau historique muscu (memo §267) | 331 lignes |
| `src/components/strength/StrengthLeaderboard.tsx` | Leaderboard muscu | ~294 lignes |
| `src/components/strength/InProgressCard.tsx` | Carte séance en cours | ~212 lignes |
| `src/components/wellness/WellnessForm.tsx` | Formulaire wellness check | ~342 lignes |
| `src/components/wellness/BodySvg.tsx` | SVG corps interactif (douleurs) | ~247 lignes |
| `src/components/timesheet/TimesheetShiftForm.tsx` | Formulaire shift pointage | ~296 lignes |
| `src/components/timesheet/TimesheetTimeWheel.tsx` | Roue sélection heure | ~252 lignes |
| `src/components/layout/AppLayout.tsx` | Layout racine app — header desktop (`getNavItemsForRole`) + bottom-nav mobile (`getMobileNavItemsForRole`, §271) | ~234 lignes |
| `src/components/layout/navItems.ts` | Définition des items de nav par rôle : `getNavItemsForRole` (desktop) + `getMobileNavItemsForRole` (dock mobile coach/admin, §271) | 68 lignes |
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
| `vitest.config.unit.ts` | Config Vitest jsdom scopée aux `src/**/*.vitest.{ts,tsx}` (hooks/DOM) — chore unification runner | 20 lignes |
| `scripts/check-test-runner.mjs` | Garde-fou `pretest` : échoue si un `*.test.ts(x)` importe `vitest` (empêche les tests inertes sous node:test) — chore unification runner | 29 lignes |
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
| `src/components/coach/pace/PaceMatrix.tsx` | Matrice allures × zones (V0–MAX) — modèle non-linéaire pace-v2 + V4 conditionnel + toggle bassin 50m/25m + modèle crédit-virage 25 m multi-virages (§281, §282) + prop `compact` (masque toolbar, §188) | 350 lignes |
| `src/components/coach/pace/PaceMatrixInline.tsx` | Wrapper compact de `PaceMatrix` (lecture seule, sans toggle bassin) — utilisé sous `ObjectiveCard` nageur (§188) | 46 lignes |
| `src/components/coach/pace/PaceTargetForm.tsx` | Formulaire cible d'allure (nage + distance + temps + bassin toggle) embarqué dans SwimmerPaceCard (§184-§185) | 182 lignes |
| `src/components/coach/pace/Pace4NSegmentMatrix.tsx` | Matrice 4N segmentée par nage (NL/Dos/Brasse/Pap) avec poids selon doc §9 (§186) | 269 lignes |
| `src/components/coach/pace/PaceStrokeAdjustments.tsx` | Drawer overrides mS coach par nage × famille (`coach_stroke_adjustments`, bornes ±0.20) (§186) | 238 lignes |
| `src/components/coach/pace/PaceZonesSettings.tsx` | Drawer config zones v2 par famille × zone (V0/V1/V2/V3/V4/MAX) — refonte schema multi-row (§186) | 343 lignes |
| `src/components/coach/pace/SwimmerPaceCard.tsx` | Accordéon nageur — propage zones_v2 + strokeAdjustments + v4ByFamily ; sous-accordions repliables par cible (§186) | 244 lignes |
| `src/components/coach/pace/PdfExportDialog.tsx` | Dialog pré-export PDF avec toggle 25m/50m (§186) | 116 lignes |
| `src/components/coach/AddSwimmerToTeamDialog.tsx` | Vue unique team-creation unifiée — refonte 'Mon équipe' (§186) | 233 lignes |
| `src/lib/paceCalculatorV2.ts` | Moteur pur non-linéaire pace-v2 — `t_allure(d) = (Tobj × R_base × A_nage + Δ_mesure) / k_allure` (§186) + `turnCreditForShortCourse` crédit-virage multi-virages bassin 25 m (§281, §282) | 364 lignes |
| `src/lib/paceData.ts` | Tables data pures — `R_base(D, d)`, `A_nage(D, d, S)`, `k_allure(family, zone)` selon doc métier (§186) | 96 lignes |
| `src/lib/pdfPalette.ts` | Palette colorée pour export PDF (zones V0–MAX cohérentes avec écran) (§186) | 57 lignes |
| `src/lib/export-pace-pdf.ts` | Export PDF allures — refonte palette colorée + branding EAC (rouge + logo + club) + bassin d'origine + flèche conversion + footer épuré (§186) + modèle crédit-virage 25 m multi-virages (§281, §282) | 945 lignes |
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
