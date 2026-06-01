# État des fonctionnalités

*Dernière mise à jour : 2026-06-01 (§361 — **Liste de départ liveffn par compétition** : nouvelle vue coach, parse liveffn + appariement + perf/objectif. Le coach colle l'URL d'une « liste de départ par structure » liveffn sur une compétition → `CompetitionStartlist` (bouton dans `CompetitionFormSheet`/`CoachCompetitionsScreen`) affiche quand chaque nageur du club court + sa meilleure perf récente et son temps objectif (MÊMES chiffres que les fiches objectifs via `objectiveHelpers`). Edge function `liveffn-startlist` (v1, ACTIVE, `verify_jwt`) = proxy fetch mince (garde coach/admin + validation host `liveffn.com`/path `startlist.php`, liveffn sans CORS) ; parsing côté client (`src/lib/liveffn/parseStartlist.ts` regex, `matchSwimmers.ts` token-set + overrides persistés ambigu→null, `buildStartlistRows.ts` enrichi). Mig **00221** (`competitions.liveffn_startlist_url` + `startlist_athlete_map` jsonb ; aucun changement RLS → pas de `test:rls`). Pont UUID→numérique via rpc `get_auth_uids_for_users`. 19 nouveaux node:test ; node:test 1572, vitest 71, tsc 0, lint 0. Limites : vérif live en attente de déploiement github.io, pas de départage par date de naissance, robustesse réseau faible = future. Précédent §360 — **Remplacement YTW échauffement Bloc 1** : data-only, feature échauffement inchangée. Précédent §359 — **Clôture ROADMAP §6 (timers PWA iOS)** : doc-only, aucune feature impactée. Le fix « timestamps absolus + `visibilitychange` » proposé par §6 est **déjà en place** dans `WorkoutRunner.tsx` (depuis §343) → affichage des timers fiable après un passage en arrière-plan iOS ; l'alerte sonore de fin de repos écran verrouillé est **écartée par décision coach** (`navigator.vibrate` non supporté Safari/PWA, bip Web Audio silencé par l'interrupteur Silencieux, Web Push disproportionné). Chantier §6 clos sans suite. Précédent §358 — **Bannière : report de la progression globale après ajustement** : un méso ajusté (§338) repartait à « Semaine 1/N » au pivot → la bannière affiche désormais la progression GLOBALE (« Semaine 3/6 »). Colonne `strength_mesocycles.week_offset` (défaut 0, mig **00220**, backfill méso de François =2) posée à l'ajustement (`MesocycleAdjust` weekOffset=weekIndex → `setMesocycleWeekOffset` post-apply) ; `mesocyclePosition(...,weekOffset)` globalise (offset>0 = continuation, jamais « Commence bientôt ») ; `MyPlanTab` passe l'offset. node:test 1553, vitest 71, tsc 0, lint 0, build OK. (§357 — « Mettre à jour l'app » purge le cache même sur erreur.) Précédent §356 — **Raise = rameur ergomètre + correctif flexion d'épaule dédié** : retour terrain (matériel rameur + élastique). (1) Le « Raise » du Bloc 1 (exo 97) passe de corde/montées de genoux au **rameur ergomètre (~3 min)**. (2) Comble le 3ᵉ trou de dédup : `shoulder_flexion` n'avait que Y-T-W + Shoulder Dislocates (dans la routine commune → dédupliqués) → ajout (mig **00219**) du correctif dédié **id 101** « Mobilité flexion d'épaule (overhead élastique / wall slide) » (unilatéral, hors routine commune). Tous les axes mobilité ont désormais ≥1 correctif non dédupliqué. Data-only, aucun code moteur. Précédent §355 — **Comble 2 trous de seed correctif (rotation thoracique + scapulaire unilatéral)** : vérif terrain → `t_spine` n'avait que Cat-Cow (dédupliqué avec la routine commune) et les exos `scapula_control` étaient tous bilatéraux (raffinement unilatéral §352 inopérant). Fix data (mig **00218**, validé coach) : 2 nouveaux exos d'échauffement par-côté — « Rotation thoracique (open book) » (`t_spine`, unilatéral) + « Rowing scapulaire unilatéral » (`scapula_control`, unilatéral). Aucun code moteur modifié. Précédent §354 — **Écrans coach d'édition des routines d'échauffement** : nouvel onglet « Échauffement » dans `StrengthCatalog` (`WarmupRoutinesEditor`) pour éditer la routine articulaire commune (Bloc 1) + l'activation par seau (Bloc 3) — listes ↑↓ / ajouter (catalogue) / retirer + « Enregistrer » par section. Persistance via 2 RPC atomiques `SECURITY INVOKER` (`set_warmup_common_routine`/`set_warmup_activation_routine`, mig **00217**, RLS coach/admin enforce sur l'INSERT). API `setCommonWarmupRoutine`/`setActivationRoutine`. S'applique aux prochains mésocycles générés. node:test 1548, vitest 71, tsc 0, lint 0, build OK, RLS 5/5 nouveaux. **CHANTIER (8) « échauffement intelligent » CLOS** (génération Blocs 1+2+3 + marquage coach/nageur + édition coach). Reliquat optionnel : édition per-séance + tags Bloc 2. Précédent §353 — **Marquage de l'échauffement dans la vue exécution nageur** : les sous-sections « Échauffement articulaire / Mobilité corrective (+ pastille axe·côté) / Activation musculaire » apparaissent désormais dans `MyPlanSessionSheet` + `SessionDetailPreview` (plus seulement à l'aperçu coach). **Zéro migration** : `warmup_kind`/`corrective_axis`/`corrective_side` déjà persistés dans `raw_payload` → helper pur `warmupMetaFromItem` ; `isWarmupItem = meta.kind != null || block === 'warmup'` (warmup_kind prioritaire → corrige aussi la classification des items activation à bucket non-mobility). Réutilise `BLOCK_STYLES` + `warmupSectionLabel`/`correctiveChipLabel` (pattern aperçu §351). `WorkoutRunner` hors scope. node:test 1545, vitest 69, tsc 0, lint 0, build OK. **Vision 4 blocs complète + marquée coach ET nageur.** Reste (8) : écrans d'édition coach des tables warmup. Précédent §352 — **Échauffement intelligent : Bloc 3 (activation) + correctif unilatéral + Raise** : complète la vision 4 blocs (suite §351), **fondé sur une recherche documentaire** (deep-research : cadre RAMP, dynamique>statique, correctif unilatéral réduit l'asymétrie, activation légère sans fatigue). **Bloc 3** = table `warmup_activation_routine` (mig **00215**, RLS) + `selectActivation` (1 exo/seau de travail primaire+complément, plafond 2, dédup vs Blocs 1+2, **développement seulement** — l'amorce PAP est déjà une activation). **Bloc 2 unilatéral** = `dim_exercices.supports_unilateral` → axe asymétrique préfère un exo unilatéral côté faible (repli bilatéral). **Bloc 1 Raise** + seeds dynamiques ; 3 nouveaux exos légers (`exercise_type='warmup'`). `getActivationRoutine` + injection aperçu ; `warmup_kind='activation'` round-trip ; marquage aperçu 3ᵉ sous-section « Activation musculaire ». node:test 1539, vitest 67, tsc 0, lint 0, build OK, RLS 9/9 nouveaux. **Suite** : écrans d'édition coach des tables + sous-labels vue exécution nageur. Précédent §351 — **Échauffement intelligent (Blocs 1+2) piloté par les déficits de mobilité G/D** : chaque séance muscu (dév + amorce PAP) s'ouvre par un **échauffement articulaire commun** (Bloc 1, table `warmup_common_routine` seedée) + une **mobilité corrective** (Bloc 2) générée des déficits G/D du bilan (`min(G,D)≤1` OU `|G−D|≥2`, plafond 2 + rotation déterministe des axes, aucun `Date.now`/`random`). Tags `dim_exercices.corrective_axes` + table `warmup_common_routine` (mig **00214**, RLS lecture authentifié/écriture coach-admin). Matérialisé à la génération (moteur pur, remplace le warmup générique, hors `MAX_SESSION_ITEMS`). Marquage aperçu (`SessionCard`) : sous-sections « Échauffement articulaire »/« Mobilité corrective » + pastille axe·côté faible. node:test 1525, vitest 67, tsc 0, lint 0, build OK, RLS 9/9 nouveaux. **Suite §352** : écran d'édition routine commune + per-séance, sous-labels dans la vue exécution nageur (`warmupKind` persisté `raw_payload`, pas encore threadé dans `StrengthSessionItem`), Bloc 3 (activation musculaire). Précédent §350 — **Infra eslint : garde-fou `react-hooks/rules-of-hooks` en CI** : eslint 9 flat config **minimal** (`eslint.config.js`, react-hooks v5) — `rules-of-hooks: error` + `exhaustive-deps: warn` ; script `npm run lint` ; **étape lint dans `pages.yml` avant le build** (un #310 bloque le déploiement). Le lint a attrapé 4 `useAuth` conditionnels (garde SSR/test légitime → `eslint-disable` justifié). Leçon : le garde `typeof window` n'était PAS mort (load-bearing pour le rendu node:test sans window). Lint 0 erreur (42 warnings non bloquants), node:test 1501, tsc 0, build OK. **Audit flux mésocycle : 100 % traité + garde-fou #310 en place.** Précédent §349 — **Polish audit flux mésocycle (V7, UX1/UX2/UX3)** : derniers findings mineurs (cosmétique/a11y). V7 `SessionDetailPreview` masque le badge de cycle legacy en mode plan (plus de « Force » rouge trompeur) ; UX1 `RestSessionTab` centre anneau = exercices faits `(currentStep−1)/total` (cohérent anneau+rail) ; UX2 rail basé sur le total (ne sature plus au dernier exo) ; UX3 minuteur repos `RestScreen` `role="timer"`+`aria-label`+`aria-live="off"`. tsc 0, node:test 1501, vitest 67, build OK ; aucune migration. **Audit flux mésocycle : tous findings traités** (sauf lint rules-of-hooks = infra eslint). Précédent §348 — **Bilan muscu : édition coach d'un ancien bilan (scores physiques G/D)** : suite §347. Bouton « Éditer » sur les lignes notées de l'historique (`BilanHistorySection.onEdit`, `role="button"` + `stopPropagation`) → `StrengthAssessmentScreen` ouvre le formulaire en mode édition (`editingAssessmentId`, bandeau « Édition du bilan du {date} » + Annuler, préremplissage gardé, save vise l'ancien id via `editingAssessmentId ?? assessment.id`, invalide `assessment-history`). Scope strict = scores physiques (pas questionnaire/KPIs). UI via `/frontend-design`. TDD (`StrengthAssessmentScreen.edit.vitest` + `BilanHistorySection.vitest` +2) ; tsc 0, node:test 1501, build OK ; aucune migration. Précédent §347 — **Bilan muscu : historique des bilans + courbe d'évolution G/D (Slice B)** : demande terrain (6). Helper pur `mobilityEvolution.ts` (`buildMobilityEvolution` → série chrono `{date,left,right,effective}` par axe via `normalizePhysicalTests`) ; UI (`/frontend-design`) `BilanHistorySection` (carte « Historique » = `listAssessments` → date + badge statut + détail read-only G/D dépliable) + `MobilityEvolutionChart` (recharts, sélecteur d'axe + mode G&D/G/D/côté faible, ≥2 bilans), montés dans `StrengthAssessmentScreen`, query invalidée à create/submit. TDD (`mobilityEvolution` 3, vitest 4). tsc 0, node:test 1501, vitest 64, build OK. **Chantier (6)+(7) clos** ; reste (8) [FUTUR] routines d'échauffement. Précédent §346 — **Bilan muscu : mobilité gauche/droite + notes (Slice A : data + moteur + saisie)** : demande terrain (7). Forme uniforme `{left,right,note?}` par axe dans le jsonb `physical_tests` (**aucune migration**) ; module pur `physicalTests.ts` (`normalizePhysicalTests` upcaste l'ancien number → `{left:n,right:n}`, `effectiveAxisScore=min`) ; moteur `scoreMobility`/`dysfunctionFlags` consomme `min(G,D)` → asymétrie unilatérale = dysfonction (rétrocompat anciens bilans) ; UI (`/frontend-design`) `AssessmentBilateralField` (2× ScaleField G|D + note repliable), `trunk_neck_alignment` unique, note de synthèse globale, préremplissage via normaliseur ; axes G/D shoulder/t_spine/hip/scapula/hip_hinge. TDD ; tsc 0, node:test 1498, vitest 60, build OK. Slice B (§347) = historique bilans + courbe d'évolution. Précédent §345 — **Retour terrain François : polish UI mésocycle + fix routing bilan coach** : (1) bandeau « Mon plan » condensé 2 lignes + bouton **Récap intégré** ; (2) overflow titres séances ; (3) overflow date pivot coach ; (4) presets charge clairs ; (5) **bug** « Refaire le bilan » coach → `/coach/strength-assessment/:athleteId`. tsc 0, node:test 1491, vitest 57, build OK. Précédent §344 — **Audit flux mésocycle, Lot 5 (filet anti-régression) — AUDIT CLÔTURÉ** : verrouille les invariants. **A** smoke-test d'intégration du parcours (plan étiré + invariant E2 « phase au pivot == phase réelle du plan à chaque semaine » + invariant V5 position) ; **B** garde `withTimeout` (scan statique : les 6 fonctions critiques apply/revert+reads restent bornées). node:test 1480→1491, tsc 0, vitest 55, build OK ; aucun code prod modifié. Non livré (documenté) : lint `rules-of-hooks` = chantier infra (pas d'eslint dans le dépôt). Lots 1-5 terminés ; restent V7/UX1-3 (polish) + lint hooks. Précédent §343 — **Audit flux mésocycle, Lot 4 (finitions moteur, runner & a11y)** : **moteur** E1 (Majeur) `papPreferLegPower` périmé après le swap §327 → fonction pure `papPreferLegPowerFor` calculée après le swap (fini l'exo `upper_power` superflu en PAP), E4 clamp `scorePsychology`, E3 doc schémas non appliqués ; **runner** R5 arrondi durée aligné aperçu, R3 ressenti restauré au kill PWA, R4 durée totale juste après reprise (`startedAt` persisté), R6 dead code ; **a11y/UX** UX4 confettis reduced-motion, V9 message d'erreur clair, V10 aria expansion semaine. TDD `mesocycleEngine` +6. tsc 0, node:test 1480, vitest 55, build OK. Différés mineurs : V7/UX1/UX2/UX3. Précédent §342 — **Audit flux mésocycle, Lot 3 (guidage nageur)** : frictions UX « Mon plan » muscu. **V5** bandeau « hero » `MyPlanMesocycleBanner` (objectif lisible, « Semaine X/Y » + barre de progression, phase en cours, « Généré le … » = V8) sur helpers purs `mesocycleProgress.ts` (`formatEventGroupLabel`/`mesocyclePosition`), props #310-safe dans `MyPlanTab`, s'appuie sur `start_week_monday` §341. **V6** badges de phase = `shortPhaseLabel(week_type)` (« Affûtage »/« Pic » au lieu de la clé « TAPER » ; Maintien/Affûtage distincts), masqués sans phase. **V3** `detectPhase("")` neutre (gris) au lieu de « force » rouge. UI via `frontend-design`. TDD : `mesocycleProgress` 10 / `strengthPhaseStyles` 4 / banner 4. tsc 0, node:test 1474, vitest 55, build OK. Précédent §341 — **Audit flux mésocycle, Lot 2 (source unique phase/semaine au pivot)** : les 2 findings du maillon faible de l'ajustement mid-cycle. **E2** — `getCurrentMesocyclePhaseInfo` dérive la phase de l'allocation RÉELLE via nouvelle fonction pure `cycleAtWeek` (rejoue `periodize`) au lieu du walk `nominal_weeks` (`phaseAtWeek`) qui divergeait quand le plan est étiré/compressé. **C3** — migration **00216** : colonne `start_week_monday` sur `strength_mesocycles` (RPC recréée pour la stocker, appliquée via MCP, prod vérifiée) → `MesocycleAdjust` n'approxime plus le lundi de départ depuis `generated_at` (fin de la dérive de fuseau) ; fallback TZ-safe pour les mésos antérieurs. TDD `cycleAtWeek` +3 / phase +1 ; `test:rls` strength-mesocycle 17→18. tsc 0, node:test 1460, vitest 51, build OK. Précédent §340 — **Audit flux mésocycle + Lot 1 (sécu & robustesse)** : audit complet `docs/audits/2026-05-30-audit-flux-mesocycle.md` (5 agents, 37 findings, 0 #310 actif, 0 corruption RPC). Lot 1 livré — **C1** garde de rôle `MesocycleAdjust` (un nageur pouvait auto-ajuster son plan ; pas d'escalade inter-athlète, RPC `00212:73`+RLS bloquent), **C4** synchro séances↔jours, **C2/C5** retour mode-ajustement (helper `mesocyclePreviewBackTarget`) + purge payload, **A1/A3** reads méso `withTimeout(10s)`, **R2** `update1RM` borné 8s, **R1** anti double-tap runner, **A2** toast description booléen→message. Features inchangées (durcissement). TDD ; tsc 0, node:test 1456, vitest 51, build OK ; aucune migration/RLS. Lots suivants à valider (Lot 2 = source unique phase/semaine + migration `start_date`). Précédent §336 — **Récap muscu « Wrapped »** : bouton discret « Mon plan » muscu + vue coach → overlay stories plein écran façon Spotify Wrapped — objectif du plan, forces/axes KPI **sans valeurs brutes** (bandes de percentile), top 3 progressions 90 j, tonnage & stats fun. Module pur `wrappedStats.ts` + hook `useStrengthWrapped` (fetch lourd gaté à l'ouverture) + overlay `StrengthWrappedRecap` (frontend-design). Zéro migration. node:test 1418, vitest 34, tsc 0, build 0. Précédent §332 — **cohérence de durée des séances muscu** : le repos des cycles dérivés (`puissance`/`maintien`/`affutage`/`pic`) est borné dans la bande `periodizationCycles.ts` (`clampToRange` dans `toMesocycleExercise` Règle 3) — fin du repos catalogue 330 s propagé jusqu'en semaine de pic ; `force_max` & amorce PAP non touchés. Mig **00214** allège tractions #13 / trap bar #7 (repos 330→210 s) & médecine-ball #53 (6→4 séries). Effet à la prochaine régénération (séances de construction ~77→60 min) — plans déjà matérialisés inchangés. Précédent §331 — **durée estimée d'une séance muscu** : helper pur `sessionDuration.ts` (`estimateStrengthSessionDurationSeconds` = Σ `sets × (60s + repos)`, 1 repos/série, tous items inclus ; `formatApproxMinutes` « ~X min ») + badge `⏱ ~X min` dans l'en-tête de `SessionDetailPreview` (rendu si > 0) → visible bibliothèque + Mon plan. 9 tests node:test, tsc 0, vitest 24, build 0. Précédent §330 — **auto-réparation du cache PWA** : `lazyWithRetry` purge les caches du SW avant reload sur échec de chunk lazy → fin des crashes post-déploiement (PWA périmé). Précédent §322 — **focus événement forcé sprints** : `PeriodizationStructure.forced_focus` (dans le `structure` jsonb) → `prioritizeBuckets` remonte ces seaux en focus malgré le score, après l'override mobilité ; seedé `["upper_power"]` sur 50/100 (mig 00209) → la puissance explosive est garantie sur un sprint quel que soit le niveau de l'athlète. Limite : par distance (stroke-agnostic). §321 (autre terminal) — fix inscription sélecteur de groupe (RLS anon sur `groups`, mig 00208). Précédent §320 — **édition UI de `selection_priority`** : composant `ExercisePrioritySelector` (paliers Prioritaire/Préféré/Normal/À éviter + saisie + pastilles) dans les dialogs catalogue (édition/création) ; `Exercise.selection_priority` threadé read+write dans les mappers (anti-clobber à l'édition). Le coach règle ses staples sans migration. Précédent §319 — **préférence de sélection d'exercices** : champ `selection_priority` (coach-pilotable, trié en 1er dans `selectExercises`, rétrocompat défaut 0) → impose les staples (tractions lestées, box jump, roue abdos, pull-over fly = 90-100) et démote les exotiques (Front Lever, gainage lesté = -10), mig 00207. Fini les exos exotiques/arbitraires. Précédent §318 — **50 m crawl plus fidèle à McEvoy** : soulevé trap-bar re-tagué `lower_strength` (anti-répétition), `upper_power` 50 m 0.50→0.95 (traction explosive domine), plafond séance 5 exos (le bloc core §313 n'ajoute plus), mig 00206. §317 fix 409 sync records ; §316 fix React #310. Précédent §314-§315 — **bilan muscu hors-ligne (#3) COMPLET** : questionnaire + physique + KPIs branchés sur la file offline (localStorage + replay) → le coach mesure tout le bilan au bord du bassin sous réseau coupé, synchronisé à la reconnexion. KPIs rendus idempotents par `client_dedup_key` + index unique (mig 00205) + UPSERT ON CONFLICT (pas de doublon au replay). Précédent §313 — **seau tronc/core (R5) livré + déployé** : 6ᵉ seau entraînable `core` composé comme les autres (papillon ×1.40 = max, dos ×1.25, 4N ×1.30, brasse ×0.85 ; distances 0.45→0.70), **non scoré** (façon mobilité, hors priorisation → pas de sur-priorisation sans KPI), 12 exos re-taggés `→ core`, mig 00203/00204 appliquées MCP, valeurs validées coach. §312 — garde double-apply #5 (`applyLikelySucceededDespiteError`, retry-safe après timeout). npm test 1377+20. Précédent §311 — audit robustesse/perf/élite + 3 correctifs : `withTimeout` sur apply/revert (fin du spinner infini), garde-fou remplacement §308 (bannière ambre sur l'aperçu), profil de distance `fond` ≥800 m demi-fond (mig `00202`, R4). npm test 1365+20, tsc 0, build 0. Précédent §309 — KPI `medball_vertical_throw` fiabilisé : l'ancien lancer vertical allongé (hauteur estimée à l'œil, barème `placeholder`) devient un **lancer médecine-ball assis pour la distance** (Seated MB Throw, normé), scoré sur un **indice masse × distance** (kg·m) qui laisse choisir la masse du ballon. Barème **`transposed`** (normes scolaires 2 kg sexe × âge) → confiance à l'aperçu améliorée. `medballPower.ts` (TDD) + `MedballThrowInputs.tsx` (/frontend-design) + branche wizard ; masse dans `attempts` jsonb (pas de migration). npm test 1357+20, tsc 0, build 0. Précédent §308 — Mésocycle muscu : remplacement propre d'un plan en cours. La RPC `apply_strength_mesocycle` purge les slot/week overrides de l'athlète **à partir de la date de départ** (jours pré-départ préservés) avant de matérialiser → re-générer avec un autre jeu de jours ne laisse plus de séances orphelines (mig **00201**). Harness RLS remis à niveau (était à 00181) + 4 tests §308. RLS 17/17, npm test 1353+20, tsc 0, build 0. Précédent §307 — UI mésocycle jour-aware. Précédent §304 — couplage niveau ↔ tier (alerte + alignement 1-clic) + re-tag traction lestée intermédiaire (fix écart GA de l'audit 100 NL H) : helper pur `strengthProfileMismatch.ts` (`hasUnderLeveledProfile` — mismatch à sens unique, signale seulement tier ∈ {national, élite} & niveau ≠ advanced) ; encart « Profil sous-calibré » + bouton « Aligner sur Confirmé » dans `StrengthAthleteProfileCard.tsx` (passe `practice_level='advanced'` via l'upsert existant) ; bandeau read-only dans l'aperçu `MesocyclePreview.tsx` ; migration `00192` re-tague `Tractions lestées` (id 13) advanced→intermediate (cohérence KPI `weighted_pullup` ↔ prescription). 983/983 npm test (+4), tsc clean, pas de `test:rls` (migration data-only). Reste → §305 : préférence (vs disponibilité) de la traction lestée aux tiers élevés, taxonomie nage × distance, template `sprint_100`, papillon. Précédent §303 — dé-jeunification du moteur de mésocycle muscu (G1+G3) : barèmes `kpiBaremes.ts` débridés au-delà de p90 (fin du plafond à 90) + bande d'âge `adulte` (≥19, dérivée des ancres 17-18) + `PerformanceTier`/`shiftAnchors` (décalage des ancres par niveau de performance) branché au chokepoint `scoreKpi` du moteur ; niveau de pratique enfin lu depuis la table `strength_athlete_settings` (mig `00191`, RLS asymétrique athlète lecture seule / coach lecture+écriture) au lieu du `"intermediate"` codé en dur ; carte coach `StrengthAthleteProfileCard` (2 selects autosave niveau+tier). 982/982 npm test (+16), RLS 233 passed. Précédent §302 — fluidité parcours coach : fil conducteur `BilanProgress` 3 étapes, route `/coach/kpi-wizard/:athleteId` (KPI ciblé), cible nageur persistante entre écrans, fin du cul-de-sac questionnaire→notation. Précédent §301 — fiabilité de la mesure : T1 `weighted_pullup` accepte 0/assisté (mig `00190`), T2 démos KPI câblées sur GIFs catalogue, T3 confiance barème par-KPI au recap, T4 détente verticale = moyenne des temps de vol + écart-type (au lieu du max biaisé), T5 rubrique mobilité/mouvement 0-3 par niveau + repères chiffrés + note du bilan précédent (répétabilité). §301 complet (recos 1,2,5,6,7) ; fluidité parcours coach → §302. Précédent §299 — parcours mésocycle 2 modes : autonomie nageur (verrou abaissé à `bilan_pending` + auto-démarrage) + génération/questionnaire pilotés coach (`athleteId`) ; édition fine coach différée. Précédent §292 — clôture du Chantier A « Contenu du Bilan Muscu » : A1 barèmes KPI + A2 tagging du catalogue + A3 templates de périodisation à durée variable, 14 templates seedés. Couche données complète ; moteur de génération Chantier C non livré.)*

## Légende

| Statut | Signification |
|--------|---------------|
| ✅ | Fonctionnel |
| ⚠️ | Partiel / En cours |
| ❌ | Non implémenté |
| 🔧 | Dépend de la configuration |
| 🗓️ | Planifié (roadmap) |

---

## Feature Flags

Fichier : `src/lib/features.ts`

```typescript
export const FEATURES = {
  strength: true,        // ✅ Musculation nageur
  hallOfFame: true,      // ✅ Hall of Fame
  coachStrength: true,   // ✅ Builder musculation coach
} as const;
```

Tous les feature flags sont activés.

---

## Matrice des fonctionnalités

### Authentification

| Fonctionnalité | Statut | Fichiers | Notes |
|----------------|--------|----------|-------|
| Login email/password | ✅ | `Login.tsx`, `auth.ts` | Supabase Auth |
| Gestion des rôles | ✅ | `auth.ts` | nageur, coach, comité, admin |
| Refresh token | ✅ | `auth.ts` | JWT automatique Supabase |
| Inscription self-service | ✅ | `Login.tsx`, `auth.ts`, `App.tsx`, `Admin.tsx` | Option B : validation coach/admin, écran post-inscription, gate approbation. §321 : fix sélecteur de groupe bloqué — `groups_select` rouvert au rôle `anon` (mig 00208), `getGroups()` lit avant login |
| Approbation inscriptions | ✅ | `Admin.tsx`, `api.ts` | Section "Inscriptions en attente" pour coach/admin |
| Mot de passe oublié | ✅ | `Login.tsx`, `App.tsx`, `auth.ts` | Flow complet : email de reset + route `/#/reset-password` + detection token recovery |
| Création compte (admin) | ✅ | `Admin.tsx` | Via panel admin |
| Désactivation compte | 🔧 | `api.ts` | Retourne "skipped" si Supabase offline |

### Natation — Nageur

| Fonctionnalité | Statut | Fichiers | Notes |
|----------------|--------|----------|-------|
| Dashboard calendrier | ✅ | `Dashboard.tsx`, `DayCell.tsx`, `CalendarHeader.tsx`, `CalendarGrid.tsx`, `useDashboardState.ts`, `useStrengthPlanByISO.ts` | Pills dynamiques par créneau (AM/PM), vert si rempli, gris si attendu, repos avec icône Minus. §172 : pills 14×14 avec mini Sun/Moon (couleur statut préservée), icône Dumbbell haut-gauche si séance muscu prévue (Trophy compétition prioritaire). Source plan muscu = `strength_planning_slots` + overrides via `useStrengthPlanByISO` (sémantique §157, plan individuel jamais écrasé). |
| Saisie ressenti | ✅ | `Dashboard.tsx`, `FeedbackDrawer.tsx` | Difficulté, fatigue, perf, engagement, distance, commentaire. §172 : carte muscu jour rendue dans le drawer (handoff → /strength), hint permanent "Remplis les 4 indicateurs", boutons ressenti h-11/h-12, fermeture session différée à mutation.onSuccess. |
| Notes techniques exercice | ✅ | `ExerciseLogInline.tsx`, `SwimSessionTimeline.tsx`, `swim-logs.ts` | Saisie inline depuis la timeline (§58), expansion par exercice, auto-détection reps, temps/coups par rep |
| Historique notes techniques | ✅ | `SwimExerciseLogsHistory.tsx` | Vue chronologique groupée par date |
| Présence/absence | ✅ | `Dashboard.tsx` | Toggle par créneau |
| Consultation séances | ✅ | `SwimSessionView.tsx`, `SwimSessionTimeline.tsx` | Timeline + saisie technique inline (§58), rail d'intensité, toggle 3 niveaux, icônes matériel SVG (§55) |
| Partage public séance | ✅ | `SwimSessionView.tsx`, `SharedSwimSession.tsx`, `swim.ts` | Lien partageable UUID, page publique sans auth, CTA inscription (§57) |
| Historique/Progression | ✅ | `Progress.tsx` | Apple Health style: hero KPI + tendance, sticky header compact (§46), AreaChart gradient, ProgressBar ressentis, Collapsible detail |

### Natation — Coach

| Fonctionnalité | Statut | Fichiers | Notes |
|----------------|--------|----------|-------|
| Création séance | ✅ | `SwimCatalog.tsx`, `SwimSessionBuilder.tsx` | Blocs, exercices, intensité, matériel, récupération départ/repos |
| Édition séance | ✅ | `SwimCatalog.tsx`, `SwimSessionBuilder.tsx` | Vue accordion inline, duplication exercice |
| Récupération entre exercices | ✅ | `SwimExerciseForm.tsx`, `SwimSessionTimeline.tsx` | Départ (temps de départ) OU Repos (pause), affiché côté nageur |
| Catalogue | ✅ | `SwimCatalog.tsx` | Dossiers/sous-dossiers, archivage BDD, restauration, déplacement |
| Partage public séance | ✅ | `SwimCatalog.tsx`, `swim.ts` | Bouton partage dans preview, génération token UUID (§57) |
| Intensité Progressif | ✅ | `IntensityDots.tsx`, `IntensityDotsSelector.tsx` | Intensité "Prog" avec icône TrendingUp, couleur orange |
| Conversion texte → blocs | ✅ | `swimTextParser.ts`, `SwimSessionBuilder.tsx` | Parser déterministe, 50 tests, format coach structuré (§49). Fix §52 : exercices parents préservés avec sous-détails Form A en modalities |
| Assignation | ✅ | `CoachAssignScreen.tsx` | Nage + muscu |
| Calendrier créneaux | ✅ | `CoachSlotCalendar.tsx`, `useSlotCalendar.ts` | Vue semaine créneaux récurrents, états (vide/brouillon/publié/annulé), navigation ←→ (§85) |
| Assignation par créneau | ✅ | `SlotSessionSheet.tsx`, `assignments.ts` | Auto-assignation groupes, visible_from, bulk create, delete, visibilité (§85) |
| Quick-compose séance sur créneau vide | ✅ | `SlotSessionSheet.tsx` (QuickComposeBody), `CoachTrainingSlotsScreen.tsx` | Onglets texte/bibliothèque inline, parse live, stats, disclosure blocs, mutation chaînée create+assign atomique avec rollback, nommage auto `Jour DD/MM matin\|soir · XXXXm` (§142) |
| Créneaux non assignés 30j sur home | ✅ | `Coach.tsx` (CoachHome), `src/lib/api/assignments.ts`, `00117_unassigned_slot_instances_30d.sql`, `coachRouteState.ts` | Section accordéon entre "Ma semaine" et "Alertes", RPC serveur J-30 → J-1, click → deep-link `?section=week&weekDate=YYYY-MM-DD` sur la semaine concernée (§145) |
| Notifications rappel ressenti | ✅ | `00054_slot_centric_sessions.sql` | pg_cron 15min, push 30min avant fin créneau (§85) |
| Chrono split timer (tablette/desktop) | ✅ | `chrono-reducer.ts`, `ChronoSetup.tsx`, `ChronoRace.tsx`, `ChronoResults.tsx` | Coach chronomètre splits par ligne/vague, nageurs club + manuels (badge M), titre séance, export xlsx (§97, §126) |
| Attribution coach ↔ nageur | ✅ | `coach-assignments.ts`, `CoachMySwimmersScreen.tsx`, `useMySwimmerIds.ts` | 1 coach principal par nageur, écran gestion, filtrage vues, historique (§98) |
| Commentaires nageurs → push coach | ✅ | `coach-comments.ts`, `CoachCommentsScreen.tsx`, `Coach.tsx` | Push immédiat au coach, badge home 48h, inbox dédié, lu/non-lu (§99) |
| Historique chronos + éditeur splits | ✅ | `chrono-records.ts`, `CoachChronoHistoryScreen.tsx`, `ChronoSplitEditor.tsx` | Sauvegarde DB, brouillons, édition distances, envoi depuis historique, export xlsx, édition titre inline (§98, §126) |
| Nageurs manuels chrono | ✅ | `coach-manual-swimmers.ts`, `ChronoSetup.tsx` | Carnet mémorisé par coach, ajout à la volée, badge M dans résultats, exclus de l'envoi profil (§126) |
| Calculateur d'allures (matrice zones) | ✅ | `CoachPaceCalculatorScreen.tsx`, `PaceMatrix.tsx`, `paceCalculatorV2.ts`, `poolConversion.ts` | Cible course → matrice passages × zones V0–MAX, modèle non-linéaire pace-v2, modulations bassin/départ/combinaison. §281 — modèle crédit-virage : la courbe 25 m verrouille la 1ère longueur, gain de bassin concentré après le mur. §282 — généralisé aux épreuves multi-virages (100 m et plus). §283 — colonne MAX affichée à 2 décimales |
| Coach QuickView (mode dépannage) | ✅ | `CoachSwimmerDetail.tsx` (dispatcher), `CoachSwimmerQuickView.tsx`, `QuickViewAttendanceDialog.tsx`, `QuickViewCommentDialog.tsx`, `QuickViewAssignDrawer.tsx`, `SwimmerFormBadge.tsx`, `coach-quickview.ts`, migrations 00133–00135 | Accès lecture-seule aux fiches non-attribuées ; enregistrement présence/commentaire/session avec `recorded_by` ; RPC SECURITY DEFINER ; attribution badges (TODO §futur) (§152). §333 : section Forme enrichie — readiness 0-100 (fix échelle), détail 5 sous-métriques 7j + heures sommeil + dernière note |

### Musculation — Nageur

| Fonctionnalité | Statut | Fichiers | Notes |
|----------------|--------|----------|-------|
| Liste séances assignées | ✅ | `Strength.tsx` | Segmented control, cards compactes, auto-start, AlertDialog |
| Preview séance | ✅ | `Strength.tsx`, `SessionDetailPreview.tsx`, `src/lib/strength/sessionDuration.ts` | Mode "reader", dock masqué, lancement unique. **§331** : badge **durée estimée** `⏱ ~X min` dans l'en-tête (calcul pur `estimateStrengthSessionDurationSeconds` = Σ `sets × (60s + repos)`, 1 repos/série, tous items inclus ; rendu si > 0). |
| Mode focus (WorkoutRunner) | ✅ | `WorkoutRunner.tsx` | Header compact, bouton "Passer", notes visibles, timer simplifié. §172 : mode tunnel charge→reps (1/2→2/2 dans drawer), confirmation skip exercice si logs>0, boutons difficulté h-9 (24→36px), safe-area-inset-top sur exit bar PWA iOS. |
| Saisie depuis "Mon plan" jour-J | ✅ | `MyPlanWeekCard.tsx`, `MyPlanTab.tsx`, `Strength.tsx` (§172) | Bouton CTA "Démarrer maintenant" sur la séance du jour J + semaine courante → court-circuite le reader via `autoLaunchKey`. Handoff Dashboard drawer → /strength via sessionStorage `eac_pending_strength_focus_slot_id`. |
| Timer repos enrichi | ✅ | `RestScreen.tsx`, `RestExerciseTab.tsx`, `RestSessionTab.tsx`, `RestPerfsTab.tsx` | 3 tabs swipables (exercice/séance/perfs), timer glow, progression, volume, 1RM (§94). §95 : GIF full ratio, notes perso éditables, pastilles série X/Y, estimation temps restant, sparkline 1RM, fix swipe/scroll |
| Saisie charge/reps | ✅ | `WorkoutRunner.tsx` | Auto-sauvegarde, volume formaté fr-FR, option "Poids du corps" (PDC) (§64). §297 : exos `is_bodyweight=true` masquent entièrement la tile "Charge" (layout reps-only) et auto-log `BODYWEIGHT_SENTINEL`. |
| Exo au poids de corps (catalogue PDC) | ✅ | `dim_exercices.is_bodyweight`, `StrengthCatalog.tsx`, `WorkoutRunner.tsx` | §297 — Flag `is_bodyweight BOOLEAN` (migration `00183`) marqué via checkbox dans le catalogue coach. Quand TRUE : `OneRmGate` ignore l'exo (jamais de demande de 1RM) et le runner affiche uniquement les reps. Backfill manuel pour les classiques (pompes, tractions, dips, gainage). |
| Estimation 1RM inline (ramp-up) | ✅ | `OneRmGate.tsx`, `WorkoutRunner.tsx`, `Strength.tsx`, `useStrengthState.ts`, `src/lib/strength/missing1rmFilter.ts` | §297 — Le `OneRmGate` propose `Estimer pendant la séance` (remplace l'ancien `Poids libre`). Les exos non saisis entrent en mode estimation (Set lifted dans `useStrengthState`, persisté dans le focus snapshot). Sur série 1 : bandeau ambré + chauffes éphémères en mémoire (`warmupHistory`) + 2 boutons (`+ Chauffe suivante` / `C'est ma série de référence → calculer 1RM`). Calcul via `estimateOneRM` (Epley+RIR), persist via `update1RM`, log série 1 standard, avance à série 2 au target weight recalculé. |
| Recalcul 1RM en cours de séance | ✅ | `WorkoutRunner.tsx`, `Strength.tsx` | §297 — Bouton ghost `Recalculer ma 1RM` (icône `RefreshCw`) visible sur série 1 de tout exo chargé non encore loggé (et non déjà en estimation). Tap → l'exo bascule en mode estimation inline, l'utilisateur fait sa chauffe + série de référence, 1RM mis à jour. Persiste à travers reload PWA. |
| Métrique d'intensité par exercice (hauteur/distance/temps) | ✅ | `dim_exercices.intensity_metric`, `src/lib/strength/intensityMetrics.ts`, `StrengthCatalog.tsx`, `StrengthExerciseCard.tsx`, `WorkoutRunner.tsx`, `ExerciseProgressChart.tsx` | §298 — Enum `intensity_metric` (`weight_kg` défaut / `height_cm` / `distance_cm` / `time_s`, migration `00186`) choisi via `Select` au catalogue coach. Box Jump → Hauteur (cm), saut longueur → Distance, gainage → Temps. Pour les métriques non-poids : pas de %1RM ni PDC (catalogue), cible absolue `target_intensity` au builder, tile runner adaptative (label/unité/numpad), AUCUN calcul 1RM/PR (gating `skip_one_rm` client+serveur), valeur loggée dans la colonne `weight`. `ExerciseProgressChart` affiche la meilleure valeur (unité adaptée) au lieu du 1RM. Limites V1 : pas de PR sur non-poids ; backfill manuel. |
| Noms exercices français | ✅ | `dim_exercices` (DB) | 59 exercices traduits en français (§64) |
| Historique | ✅ | `Strength.tsx` | Tab "Historique", 1RM, graphiques |
| Fiche exercice avec GIF | 🔧 | `Strength.tsx` | Dépend des URLs dans `dim_exercices` |
| Wizard de saisie des KPIs de force | ✅ | `KpiWizard.tsx`, `src/components/strength/kpi/*`, `src/components/strength/StrengthBilanEntry.tsx`, `App.tsx` | §285 (Feature "Bilan Muscu → Mésocycle", Chantier B, Phase 6). Route `/strength/kpi-wizard` accessible nageur ET coach. Assistant guidé : sélection nageur (coach), 5 étapes (1 KPI/étape, protocole binôme complet — déroulé, rôle binôme, mesure, GIF placeholder), N champs d'essais avec `bestAttempt` live, skip autorisé (bilan partiel), champ binôme `assisted_by`, recap avec diff vs précédente mesure, mode focus dock masqué. Source `wizard_coach | wizard_athlete`. §288 — point d'entrée `KpiWizardEntry` ajouté dans l'onglet "S'entraîner" de `/strength`. **§301 (fiabilité, Part 1)** : T1 `weighted_pullup` accepte 0 (poids de corps) et charges assistées (négatif) — saisie `−` autorisée + `parseAttempts({allowNonPositive})`, mig `00190` (CHECK relâché) ; T2 démos KPI câblées sur les GIFs catalogue (`broad_jump`/`weighted_pullup`) via `getExerciseGifs`, SVG en fallback ; T3 pastille de confiance barème par-KPI au recap (`baremeConfidenceFor`) + note « mesure brute fiable / score 0-100 indicatif » ; T4 détente verticale retient la moyenne des temps de vol + écart-type (au lieu de `Math.max` biaisé), UI « Moyenne retenue » + avertissement essais incohérents. **§309 (fiabilité, medball)** : le KPI `medball_vertical_throw` passe d'un lancer vertical allongé (hauteur estimée à l'œil, barème `placeholder`) à un **lancer assis pour la distance** (Seated MB Throw, normé) ; étape custom `MedballThrowInputs` (masse du ballon kg + 3 distances cm) → indice **masse × distance** (kg·m, `medballPower.ts`) qui laisse choisir la masse ; barème **`transposed`** (normes scolaires 2 kg sexe × âge), masse persistée dans `attempts` jsonb. |
| Questionnaire bilan muscu (auto-évaluation nageur) | ✅ | `StrengthQuestionnaire.tsx`, `src/components/strength/questionnaire/ScaleField.tsx`, `src/components/strength/StrengthBilanEntry.tsx`, `App.tsx` | §286 (Feature "Bilan Muscu → Mésocycle", Chantier B, Phase 7). Route `/strength/questionnaire` (nageur). `getLatestAssessment` → 3 cas : formulaire éditable (`questionnaire_pending`), lecture seule "déjà rempli" (`bilan_pending`/`completed`), état vide (aucun bilan). 4 sections : douleurs (`BodyHeatMap`), historique blessures, mobilité 1-5, psychologie 3×1-5. Submit : `updateAssessmentQuestionnaire` + `upsertPainReports`. §288 — point d'entrée conditionnel `QuestionnairePrompt` sur `/strength` (visible si bilan `questionnaire_pending`). L'entrée par notification reste un chantier ultérieur. |
| Flux bilan coach unifié (Continuer →, reprise, ROM) | ✅ | `src/hooks/useBilanSteps.ts`, `src/lib/strength/bilanProgress.ts`, `src/components/strength/assessment/AssessmentRomIllustration.tsx`, `StrengthQuestionnaire.tsx`, `KpiWizard.tsx`, `StrengthAssessmentScreen.tsx`, `CoachSwimmerFullView.tsx` | **§A (§310)** — Flux bilan coach unifié. `nextBilanStep()` + `useBilanSteps` hook DRY (strip de progression + `onTap` résolu). Bouton "Continuer →" en done-state à chaque étape (Q→KPI→Physique→Génération). CTA "Démarrer/Reprendre — [étape]" depuis la page nageur (reprise automatique). Bannière amber "Profil incomplet" si `!isProfileComplete`. Illustrations ROM : arc SVG animé (`stroke-dashoffset`) par axe angulaire (épaule/thoracique/hanche/hip-hinge) + barre de stabilité pour les axes qualitatifs ; couleurs rose/amber/cyan/vert selon score 0-3 ; re-joue à chaque score change. 1362+20 tests, tsc 0, build 0. |
| Bilan physique coach (scores mobilité & mouvement) | ✅ | `src/pages/coach/StrengthAssessmentScreen.tsx`, `src/components/strength/assessment/*`, `Coach.tsx`, `App.tsx` | §287 (Feature "Bilan Muscu → Mésocycle", Chantier B, Phase 8). Route `/coach/strength-assessment` (coach/admin). Sélection nageur (pattern `KpiWizard`), puis `getLatestAssessment` → 4 cas : CTA "Démarrer un bilan" (aucun bilan ou `completed`, `createAssessment`), état d'attente (`questionnaire_pending`), formulaire de notation (`bilan_pending`). 6 scores 0-3 mappés à `StrengthPhysicalTests` + contexte read-only (questionnaire nageur + KPIs `getLatestKpiMeasurements`). Submit : `updateAssessmentPhysicalTests`. §288 — tuile "Bilan muscu" ajoutée aux accès rapides du hub coach. L'entrée déclenchée par notification reste un chantier ultérieur. **§301 T5 (fiabilité)** : chaque axe porte une rubrique 0-3 complète (`levels` + `gauge`), composant `AssessmentScoreField` (descripteur du niveau choisi, dépliant 4 niveaux + photos de référence en fallback gracieux, rappel de la note du dernier bilan via `getPreviousCompletedPhysicalTests`). **§302** : fil conducteur `BilanProgress` (3 étapes tappables) + bouton « Mesurer les KPIs » (route `/coach/kpi-wizard/:athleteId`), cible nageur persistante (`/coach/strength-assessment/:athleteId`). **§303** : carte coach `StrengthAthleteProfileCard` (2 selects autosave — niveau de pratique muscu + tier de performance — vers `strength_athlete_settings`, mig `00191`, RLS asymétrique) rendue dans la branche `bilan_pending` ; alimente la dé-jeunification du moteur (G3 niveau + G1 tier). **§304 (couplage niveau ↔ tier)** : helper pur `strengthProfileMismatch.ts` (`hasUnderLeveledProfile` : tier ∈ {national, élite} & niveau ≠ advanced) → encart d'alerte « Profil sous-calibré » + bouton « Aligner sur Confirmé » dans la carte (passe `practice_level='advanced'` via l'upsert existant) ; lève la désynchronisation niveau ↔ tier qui empêchait le moteur de servir les exos `advanced`. **§346** : 5 axes saisis en bilatéral G/D + notes (`AssessmentBilateralField`), `trunk_neck_alignment` unique, note de synthèse. **§347** : `BilanHistorySection` (historique + courbe d'évolution G/D). **§348** : édition d'un ancien bilan depuis l'historique (bouton « Éditer » → mode édition `editingAssessmentId`, bandeau + Annuler, save sur l'ancien id) — scope = scores physiques uniquement. |
| Génération autonome du mésocycle (nageur) | ✅ | `src/pages/MesocycleGeneration.tsx`, `src/pages/MesocyclePreview.tsx`, `src/components/strength/MesocycleEntry.tsx`, `src/lib/strength/mesocycleEngine.ts`, `src/lib/strength/composeTemplate.ts`, `src/lib/api/strength-mesocycles.ts`, `App.tsx`, `Strength.tsx` | §293 (Feature "Bilan Muscu → Mésocycle", Chantiers C+D). Une fois le bilan complété, le nageur voit une tuile violette "Génère ton mésocycle muscu" sur `/strength` (onglet S'entraîner). Parcours en 2 écrans : **génération** (`/strength/mesocycle-generate`) — sélection épreuve × famille × durée tape-mesure alignée sur les compétitions (réutilise `useCompetitionsByWeek`) × séances/sem. relue du bilan ; **aperçu** (`/strength/mesocycle-preview`) — exécution locale du moteur (`generateMesocyclePreview`), affichage du **raisonnement auditable** (6 score bars 0-100, top 3 priorités avec rationale FR + badge OVERRIDE, dataConfidence 3-segments, psychFlag, contre-indications avec traduction des zones) + **plan détaillé** (semaines collapsibles colorées par cycle, sessions, exercices avec notation `4 × 5 @ 85% · 180s`, intention en italique). Confirmer → `applyMesocycle` (RPC) → matérialisation sur la timeline → toast + retour `/strength`. Mode focus dock masqué. **§299** : (a) autonomie réelle — verrou abaissé de `completed` à `bilan_pending` via `canGenerateMesocycle` (les 3 écrans) + tuile `StartBilanEntry` (démarrage en autonomie, `coach_id=null`) + bandeau confiance réduite ; (b) mode coach — écrans paramétrés par `athleteId` (route `/coach/mesocycle-generate/:athleteId`, `athleteId` porté dans le payload), entrées « Générer le mésocycle » (done-state bilan) + « Régénérer » (panel). **§303** : `MesocyclePreview` lit `level`/`performanceTier` depuis `strength_athlete_settings` (au lieu du `"intermediate"` codé en dur) → `selectExercises` sert enfin les exos `advanced` ; le raisonnement auditable affiche « Normes : {ageBand} · niveau · tier ». **§304** : bandeau read-only « Profil sous-calibré » dans le raisonnement auditable (ReasoningPanel) quand `hasUnderLeveledProfile` (l'action d'alignement vit dans la carte profil coach) ; migration `00192` re-tague `Tractions lestées` (id 13) advanced→intermediate pour aligner la prescription sur le KPI `weighted_pullup` mesuré dès l'intermédiaire. **§305 (taxonomie nage × distance)** : l'écran de génération devient 2 étapes **Nage → Épreuve** (distances filtrées — 50/100/200 toutes nages, 400+ crawl/4n seulement ; **100 m ajouté** et **papillon ajouté**) ; l'aperçu **compose** le template via `composeTemplate` (`bucket_emphasis = clamp01(round2(distance.emphasis × stroke.mult))`, emphasis ancrée crawl × signature de nage) au lieu de fetch un template unique, avec état d'erreur récupérable si la combinaison est introuvable. Tables de référence `strength_stroke_signatures` (mig `00193`, 5 nages dont papillon) + `strength_distance_profiles` (mig `00194`, 8 lignes) ; `applyMesocycle` envoie `p_template_id: null` (`strength_mesocycles.template_id` nullable, mig `00195` — l'event_group composé porte la taxonomie). **Barèmes 100 m / papillon de-novo, à valider par le coach avant déploiement.** **§307** : génération jour-aware — picker jours de muscu (amorce Lun/Jeu) + date de départ (1re semaine partielle), aperçu avec badge rôle par séance. **§308** : la RPC `apply` fait désormais un **remplacement propre** — purge des slot/week overrides à partir de la date de départ (jours pré-départ préservés) avant matérialisation → re-générer avec un autre jeu de jours ne laisse plus de séances orphelines (mig `00201`, replace pur 12-arg ; harness RLS remis à niveau + 4 tests). **§311 (audit robustesse/perf/élite)** : (a) `applyMesocycle`/`revertMesocycle` bornés par `withTimeout` (30 s / 15 s) — plus de spinner infini sur connexion coupée (invariant §298) ; (b) **garde-fou §308** — bannière ambre « Remplace le plan en cours » (`ReasoningPanel`) quand un mésocycle actif existe, juste au-dessus du CTA (l'écrasement des édits coach à partir de la date de départ était silencieux) ; (c) **profil de distance `fond` ≥ 800 m** (demi-fond `{LS .75, LP .40, US 1.0, UP .45, MOB 1.0}`, sans bloc puissance, mig `00202`) exposé pour le crawl — le 1500 ne reçoit plus l'emphase 400 m (R4 de l'audit matrice). |
| Moteur de génération du mésocycle (TS pur) | ✅ | `src/lib/strength/mesocycleEngine.ts`, `src/lib/strength/mesocycleEngine.types.ts`, `src/lib/strength/jumpPower.ts`, `src/lib/strength/kpiBaremes.ts`, `src/lib/strength/periodizationCycles.ts` | §293 (Chantier C). 6 fonctions pures TDD : `scoreBuckets` (6 seaux 0-100, mapping KPI→seau, null si donnée manquante), `prioritizeBuckets` (score combiné `bucket_emphasis × (100 − score)` + override sécurité douleur/dysfonction), `allocateVolume` (top-2 focus ~60% / reste maintien ~40%, mobility en échauffement systématique), `selectExercises` (filtre seau + niveau + exclusion contre-indications, substitution marquée), `periodize` (distribution des phases sur durée cible dans `[min, max]`), `generateMesocycle` orchestrateur → `GeneratedMesocycle` complet (semaines → séances → exercices chargés via `catalogue`/`generique`, raisonnement snapshot, `dataConfidence` calculée). 49 tests verts. Données partielles tolérées, jamais bloquant. Phase 1 a aussi révisé le KPI détente verticale en puissance relative W/kg (équation de Sayers, ancres CMJ Rodrigues 2024). **§303 (dé-jeunification G1)** : `scoreKpi` (unique chokepoint) appelle désormais `kpiScore(shiftAnchors(bareme.anchors, athlete.performanceTier), value)` — `kpiScore` extrapole au-delà de p90 jusqu'à 100 (fin du plafond), bande d'âge `adulte` (≥19) + `PerformanceTier`/`shiftAnchors` ajoutés à `kpiBaremes.ts` ; `MesocycleInput.athlete.performanceTier` requis. **§313 (seau core R5)** : 6ᵉ seau entraînable `core` ajouté (`StrengthBucket += 'core'`, `EMPHASIS_BUCKETS` avec garde rétrocompat anti-NaN) ; **non scoré** (`scoreBuckets.core=null`, hors `ALL_BUCKETS` → jamais sur-priorisé) ; bloc core systématique en séance de développement (`buildCoreExercise`). Composition via `composeTemplate` (clé `core` en base, mig 00203). **§332 (cohérence de durée)** : `toMesocycleExercise` Règle 3 borne le repos catalogue dans la bande `restSeconds` du cycle dérivé (`clampToRange` + `periodizationCycles.ts`) — fini le 330 s propagé jusqu'en semaine pic/affûtage ; `force_max` (Règle 2 `catalogue`) et amorce PAP non concernés. Mig **00214** allège 3 staples : tractions #13 / trap bar #7 `recup_series_force` 330→210 s, médecine-ball #53 `nb_series_force` 6→4. Effet à la prochaine régénération (séances de construction ~77→60 min). |
| Vue coach mésocycle muscu + revert | ✅ | `src/components/coach/CoachMesocyclePanel.tsx`, `src/pages/coach/CoachSwimmerFullView.tsx` | §293 (Chantier D, Phase 6). Panneau violet inséré dans l'onglet "Planning" de la fiche nageur (CollapsibleSection, ouvert par défaut). Affiche le mésocycle actif (event_group, kind, durée, sessions/sem, generated_at, engine v) + raisonnement auditable parsé du `bucket_priorities` jsonb (6 score bars + top 3 priorités + flags psy/contraindications + footer dataConfidence + lowestBaremeConfidence) + historique compact des mésocycles non-actifs. Bouton "Rejeter" avec `AlertDialog` de confirmation → `revertMesocycle` (RPC) → invalidations + toast + notif côté nageur. L'édition séance par séance reste au builder existant (les templates générés sont des `strength_sessions` standards). **§299** : bouton « Régénérer » ajouté au panel ; **édition fine d'une séance générée DIFFÉRÉE** (⚠️) — `updateStrengthSession` force `raw_payload:null` (`strength.ts:291`), donc éditer une séance `[Méso]` par l'éditeur catalogue actuel détruirait `mesocycle_id` (orphelins au revert) ; helper `preserveMesocycleTag` posé pour le chantier dédié. **§300 Part 1** : le chemin de sauvegarde est désormais sûr — `updateStrengthSession` préserve `raw_payload` (`reconcileMesocyclePayloads`, corrélation par `ordre`, tag imposé aux items ajoutés) au lieu de le forcer à `null` ; la RPC écrivait déjà `raw_payload` (pas de changement RPC). **§300 Part 2** ✅ : `getStrengthSessionForEdit(id)` (charge par id avec `raw_payload`, hors liste) + bouton « Éditer la séance » sur la preview planif coach → deeplink vers l'éditeur catalogue → save préserve `raw_payload` → revert cohérent (T14 RLS 13/13). **L'édition coach séance-par-séance d'un mésocycle est désormais atteignable de bout en bout.** |
| Récap muscu « Wrapped » (stories) | ✅ | `src/lib/strength/wrappedStats.ts`, `src/hooks/useStrengthWrapped.ts`, `src/components/strength/wrapped/StrengthWrappedRecap.tsx` (+ `slides/*`, `CountUp.tsx`), `MyPlanTab.tsx`, `src/pages/coach/CoachSwimmerFullView.tsx` | **§336** — Bouton discret en haut à droite de « Mon plan » muscu (et dans la vue coach du nageur) → overlay plein écran façon *Spotify Wrapped* (stories qui défilent au tap/timer). Slides : objectif du plan, forces & axes (KPI du bilan **sans valeurs brutes**, situés vs population par bande de percentile via `scoreToBand`), top 3 progressions des 90 j (Δ% 1RM estimé), tonnage & stats fun. Module pur `wrappedStats.ts` (`node:test`) + hook `useStrengthWrapped(athleteId, {active})` (requêtes lourdes `getStrengthHistory`/`getExercises` gatées derrière l'ouverture, `staleTime` aligné voisins) + moteur de stories (autoplay 6 s, tap/hold/swipe, reduced-motion, focus a11y, `key={index}` rejoue les animations). **Zéro migration/endpoint** — tout dérivé d'API existantes. Confidentialité : aucune valeur brute KPI/poids athlète côté nageur (`body-weight-coach-only`). Coach/admin : `viewerContext="coach"`. Bouton conditionnel (`hasEnoughWrappedData` : ≥1 méso OU ≥1 KPI OU ≥3 séances). UI via skill `frontend-design`. node:test 1418, vitest 34, tsc 0, build 0. Mergé sur `main`. |

### Musculation — Coach

| Fonctionnalité | Statut | Fichiers | Notes |
|----------------|--------|----------|-------|
| Builder séance | ✅ | `StrengthCatalog.tsx`, `StrengthSessionBuilder.tsx`, `StrengthExerciseCard.tsx` | Mobile-first : cards expand/collapse, DragDropList touch-friendly, SessionMetadataForm partagé (§30) |
| Catalogue exercices | ✅ | `StrengthCatalog.tsx` | Par cycle (endurance/hypertrophie/force), barre de recherche, liste compacte (§30) |
| Dossiers séances | ✅ | `StrengthCatalog.tsx`, `FolderSection.tsx`, `MoveToFolderPopover.tsx` | 1 niveau, renommage inline, suppression, déplacement (§32) |
| Dossiers exercices | ✅ | `StrengthCatalog.tsx`, `FolderSection.tsx`, `MoveToFolderPopover.tsx` | Même système que séances, types séparés (§32) |
| Assignation | ✅ | `CoachAssignScreen.tsx` | Via écran d'assignation partagé |
| Dossiers par nageur (hiérarchiques) | ✅ | `StrengthCatalog.tsx`, `FolderSection.tsx`, `CopyToAthleteDialog.tsx` | Filtre nageur, dossiers 2 niveaux (cycle → séances), copie inter-nageurs, assignation rapide (§90) |
| Vue nageur Mon plan muscu | ✅ | `MyPlanTab.tsx`, `MyPlanWeekCard.tsx`, `MyPlanSessionSheet.tsx`, `Strength.tsx`, `strengthPlanningMerge.ts`, `strength-planning.ts` | Timeline hebdomadaire ISO collapse/expand, badge phase, Sheet aperçu séance, intégration compétitions. Phase 2 (§157) : données depuis `strength_planning_slot_overrides` BDD (backfill 32 overrides) avec fallback cycles Phase 1. |
| Éditeur coach planif. muscu | ✅ | `StrengthPlanningScreen.tsx`, `StrengthPlanningTimeline.tsx`, `useStrengthPlanningAthleteMode.ts`, `Coach.tsx` | Route `/coach/strength-planning` miroir `SwimPlanningDemo` : timeline groupe/nageur avec sync URL `?athlete=<id>`, picker séances searchable, sheet détail (changer/détacher/supprimer), sheet compétitions, tuile "Planif. Muscu" dans Coach home (§160). §271 : le coach apparaît lui-même dans le picker (entrée synthétique "<Nom> (moi)") pour planifier son plan perso. |
| Module muscu perso coach | ✅ | `navItems.ts`, `AppLayout.tsx`, `Coach.tsx`, `Strength.tsx`, `useStrengthPlanningAthleteMode.ts` | §271 — Coach accède à `/strength` comme un nageur : nav desktop 6 items + dock mobile 6 items (Profil/Chrono swappés) + tuile "Mon entraînement" dans hub Coach. Vue toujours perso (neutralisation `selectedAthleteId`). 1RM, focus mode, historique, plan via overrides — RLS déjà permissive. §273 — Parité finale : la carte "Mon entraînement" du hub affiche la séance muscu du jour avec CTA Démarrer + carte secondaire "Mes records muscu" → `/records?tab=1rm` pour édition inline des 1RM. |
| Dashboard coach | ✅ | `Coach.tsx` | Mobile first, KPI unifié, grille 2x2 avec compteurs, cards nageurs (§35) |
| Calendrier coach | ✅ | `CoachCalendar.tsx`, `useCoachCalendarState.ts` | Vue mensuelle assignations, filtre groupe/nageur, 3 slots éditables inline (Nage Matin, Nage Soir, Muscu), indicateur musculation DayCell (§53, §54) |
| Bilan Muscu — Chantiers A + C + D (contenu + moteur + intégration) | ✅ | `src/lib/strength/kpiBaremes.ts`, `dim_exercices` (tagging), `strength_periodization_templates` (DB), `src/lib/strength/periodizationCycles.ts`, `src/lib/strength/mesocycleEngine.ts`, `src/lib/api/strength-mesocycles.ts`, `supabase/migrations/00170-00173`, `src/pages/MesocycleGeneration.tsx`, `src/pages/MesocyclePreview.tsx`, `src/components/coach/CoachMesocyclePanel.tsx` | **Chantier A clos** (§290 barèmes, §291 tagging 94 exercices, §292 14 templates à durée variable). **Chantier C clos** (§293) : moteur `mesocycleEngine.ts` TS pur, 6 fonctions TDD, 49 tests. **Chantier D clos** (§293) : tables `strength_mesocycles` + `strength_planning_snapshots` (mig `00170`-`00171`), RPC `apply_strength_mesocycle` + `revert_strength_mesocycle` (mig `00172`-`00173`, SECURITY DEFINER, snapshot/revert garanti, notif coach via group_members), wrappers API JS, écrans nageur génération + aperçu, vue coach + revert. Reste Chantier E (boucle de suivi en fin de mésocycle), hors §293. A4 (5 GIFs protocoles KPI) = tâche utilisateur (assets). |

### Records & FFN

| Fonctionnalité | Statut | Fichiers | Notes |
|----------------|--------|----------|-------|
| Records personnels (CRUD) | ✅ | `Records.tsx` | Redesign complet mobile first : nav aplatie, pool toggle unifié 25/50, formulaire compact, empty states (§42) |
| Records compétition (vue) | ✅ | Vue `swim_records_comp`, `records.ts` | Dérivés automatiquement de swimmer_performances via DISTINCT ON (§80) |
| Import toutes performances | ✅ | Edge Function `ffn-performances` | Import historique complet depuis FFN |
| Auto-sync FFN hebdomadaire | ✅ | `pg_cron`, `RecordsAdmin.tsx`, `app_settings` | Import auto configurable (jour/heure) depuis admin (§80) |
| Historique performances | ✅ | `Records.tsx` | Cartes dépliables par épreuve, graphique intégré, best time Trophy (§41) |
| Records club (consultation) | ✅ | `RecordsClub.tsx` | Épuré mobile : filtres 1 ligne (Select dropdown), sections par nage, 1 carte/épreuve, drill-down progressif (§47) |
| Import records club (FFN) | ✅ | `RecordsAdmin.tsx`, Edge Function `import-club-records` | Import bulk + recalcul records club. **§169** : recalcul filtré sur appartenance historique au club via `app_settings.home_club_name` — un nageur arrivé d'un autre club ne contamine plus le palmarès EAC avec ses bests pré-EAC. |
| Gestion nageurs records | ✅ | `RecordsAdmin.tsx` | Ajout/édition/activation swimmers, card-based mobile first (§36) |
| Hall of Fame | ✅ | `HallOfFame.tsx` | Podium visuel top 3 + rangs 4-5 compacts, sticky header compact, sélecteur période (7j/30j/3mois/1an), refresh auto après ajout séance (§38, §46, §51) |
| Gestion coach imports perfs | ✅ | `RecordsAdmin.tsx` | Import individuel par nageur + historique des imports |
| Sécurité RLS renforcée | ✅ | Migration `00046` | Policies restreintes sur 4 tables (app_settings, swimmer_performances, import_logs, strength_folders) (§80) |
| RLS audit log lock-down | ✅ | Migration `00102` | `admin_audit_log` INSERT restreint à `app_user_role()='admin'` (était `WITH CHECK (true)`) (§110) |
| RLS training_slots ownership | ✅ | Migration `00102` | UPDATE/DELETE sur slots + assignments + overrides exige `created_by = app_user_id()` ou admin (§110) |
| RLS storage avatars/gifs | ✅ | Migration `00102` | Avatars ownership par `split_part(name,'.',1)`, exercise-gifs mutations coach/admin only (§110) |
| CHECK strength_set_logs bornes | ✅ | Migration `00106` | `difficulty ∈ [1,5]`, `rpe ∈ [1,10]` en défense profondeur (§110) |
| CHECK session_assignments visible_from | ✅ | Migration `00105` | `chk_visible_from_before_date` activée (était `NOT VALID`) (§110) |
| Anti-injection `ffn-performances` user_id | ✅ | Edge Function `ffn-performances` v63 | `user_id` dérivé du JWT côté serveur ; admin/coach peuvent attribuer on-behalf, athlete forcé à son propre id (§158) |
| `admin-user` password leak mitigated | ✅ | Edge Function `admin-user` v98 | `initial_password` retourné uniquement si généré serveur (admin-supplied → `null`) ; audit log déjà clean (§158) |
| Atomicité strength set + 1RM | ✅ | Migration `00137`, `src/lib/api/strength.ts` | RPC `log_strength_set_atomic` SECURITY DEFINER — insert set + upsert 1RM en une transaction ; `reconcileStrengthRunLogs` agrège les erreurs sans avorter ; `updateStrengthRun` check 2e write (§158) |
| Résilience brouillons WorkoutRunner / FeedbackDrawer | ✅ | `src/lib/unsavedDraftStore.ts`, WorkoutRunner, FeedbackDrawer | Snapshot localStorage debounced + flush sur pagehide/visibilitychange ; restore-on-mount avec toast ; quota-safe (§158) |
| Complétion séance muscu (batch commit) | ✅ | Migration `00138`, `src/lib/api/strength.ts:707` | Fix live bug §83 : `save_strength_run_atomic` écrivait dans colonne inexistante `set_number` (actuelle = `set_index`) → séance jamais marquée `completed` ; 8 séances complétées vs 3 orphelines sur 30j avant fix. Migration 00138 corrige INSERT (`set_index`), aligne clé 1RM sur `weight`, ajoute authz `app_user_id()`/`app_user_role()`, corrige aussi `get_strength_run_summary` (00082 ORDER BY set_index) (§159) |

### Messagerie

| Fonctionnalité | Statut | Fichiers | Notes |
|----------------|--------|----------|-------|
| Email coach (mailto:) | ✅ | `CoachMessagesScreen.tsx` | Ouvre mailto: avec BCC, remplace l'ancienne messagerie in-app |

### Groupes temporaires (stages)

| Fonctionnalité | Statut | Fichiers | Notes |
|----------------|--------|----------|-------|
| Création groupe temporaire | ✅ | `CoachGroupsScreen.tsx`, `temporary-groups.ts` | Nom + sélection nageurs avec checkboxes par groupe permanent |
| Sous-groupes hiérarchiques | ✅ | `CoachGroupsScreen.tsx`, `temporary-groups.ts` | Membres limités au parent, cascade désactivation |
| Suspension automatique | ✅ | `client.ts`, `assignments.ts` | Nageur en stage ne voit que les assignations du temporaire |
| Désactivation/réactivation | ✅ | `CoachGroupsScreen.tsx`, `temporary-groups.ts` | Guard: pas de doublon temporaire actif |
| Suppression (si inactif) | ✅ | `CoachGroupsScreen.tsx`, `temporary-groups.ts` | Cascade sous-groupes |
| Sélecteur enrichi assignation | ✅ | `CoachAssignScreen.tsx` | Temporaires en premier avec badge "Stage", sous-groupes indentés |
| Gestion membres | ✅ | `CoachGroupsScreen.tsx` | Ajout/retrait avec confirmation |

### Compétitions

| Fonctionnalité | Statut | Fichiers | Notes |
|----------------|--------|----------|-------|
| CRUD compétitions coach | ✅ | `CoachCompetitionsScreen.tsx`, `competitions.ts` | Nom, date, lieu, multi-jours, description (§59) |
| Assignation compétitions (groupes/nageurs) | ✅ | `CoachCompetitionsScreen.tsx`, `competitions.ts` | Multiselect avec pré-cochage groupe, compteur assignés (§62) |
| Liste de départ liveffn par compétition | ✅ | `CompetitionStartlist.tsx`, `parseStartlist.ts`, `matchSwimmers.ts`, `buildStartlistRows.ts`, `competitions.ts`, `supabase/functions/liveffn-startlist/` | §361 — Coach colle l'URL « liste de départ par structure » liveffn → vue coach (bouton dans `CompetitionFormSheet`) : quand chaque nageur du club court + meilleure perf récente + temps objectif (mêmes données que les fiches objectifs via `objectiveHelpers`). Edge proxy fetch mince (coach/admin, host `liveffn.com`), parsing regex côté client, appariement nom token-set + overrides persistés (`startlist_athlete_map`), 2 vues (nageur/chrono). Mig 00221 (URL + map jsonb). Pont UUID→numérique via rpc `get_auth_uids_for_users` |
| Filtrage compétitions par assignation | ✅ | `Dashboard.tsx` | Nageur ne voit que ses compétitions assignées, fallback tout (§62) |
| Marqueurs compétition calendrier nageur | ✅ | `Dashboard.tsx`, `DayCell.tsx`, `CalendarGrid.tsx` | Trophy icon ambre sur les jours de compétition |
| Bannière prochaine compétition | ✅ | `Dashboard.tsx` | Card ambre avec J-X au-dessus du calendrier |
| Compteur séances avant compétition | ✅ | `Dashboard.tsx`, `Progress.tsx` | "X séance(s) d'ici là" — créneaux assignés uniques (§62) |
| SMS groupé coach (compétition) | ✅ | `CoachCompetitionsScreen.tsx` | URI sms: sur mobile, clipboard desktop (§62) |
| SMS généraliste coach | ✅ | `CoachSmsScreen.tsx` | Écran dédié, tout groupe/nageur, message optionnel (§65) |
| Vue détail compétition nageur | ✅ | `CompetitionDetail.tsx` | Route `/competition/:id`, header + 4 onglets (§87) |
| Courses (races) nageur | ✅ | `RacesTab.tsx`, `competition-prep.ts` | CRUD épreuves FFN, jour, heure, notes, couleur par nage (§87) |
| Routines pré-course | ✅ | `RoutinesTab.tsx`, `competition-prep.ts` | Templates réutilisables, steps offset_minutes, assignation par course (§87) |
| Timeline Jour J | ✅ | `TimelineTab.tsx`, `competition-prep.ts` | Fusion chronologique courses + étapes routine, heures absolues (§87) |
| Checklist compétition | ✅ | `ChecklistTab.tsx`, `competition-prep.ts` | Templates réutilisables, progress bar, toggle optimistic (§87) |
| Navigation vers détail compétition | ✅ | `Dashboard.tsx`, `AthletePerformanceHub.tsx` | 3 entry points : calendrier, bannière, planification (§87) |

### Absences planifiées

| Fonctionnalité | Statut | Fichiers | Notes |
|----------------|--------|----------|-------|
| Signalement absence nageur | ✅ | `FeedbackDrawer.tsx`, `Dashboard.tsx`, `absences.ts` | Bouton inline jour futur, raison optionnelle (§62) |
| Marqueurs absences calendrier nageur | ✅ | `DayCell.tsx`, `CalendarGrid.tsx` | "X" circulaire sur les jours marqués (§62) |
| Absences visibles coach calendrier | ✅ | `useCoachCalendarState.ts`, `CoachCalendar.tsx` | Marqueur X + bannière rouge "Absence prévue" (§62) |

### Objectifs

| Fonctionnalité | Statut | Fichiers | Notes |
|----------------|--------|----------|-------|
| CRUD objectifs coach | ✅ | `CoachObjectivesScreen.tsx`, `objectives.ts` | Par nageur, chrono (épreuve FFN + temps) et/ou texte libre (§60) |
| Lien compétition optionnel | ✅ | `CoachObjectivesScreen.tsx` | Objectif rattachable à une compétition |
| Vue objectifs nageur (lecture coach + CRUD perso) | ✅ | `SwimmerObjectivesView.tsx`, `Profile.tsx` | Hub Profil, objectifs coach RO + objectifs perso CRUD, bottom sheet form (§61) |
| ObjectiveCard partagé (grid 2x2) | ✅ | `shared/ObjectiveCard.tsx` | Composant unique : ring SVG par %, barre nage, delta 2 déc., timeAgo, grid/compact (§86) |
| Créneaux dans Planif nageur | ✅ | `AthletePerformanceHub.tsx` | Section lecture seule au-dessus de Cycle, même design coach (§86) |

### Pointage heures

| Fonctionnalité | Statut | Fichiers | Notes |
|----------------|--------|----------|-------|
| Création shift | ✅ | `Administratif.tsx` | Date, heures, lieu, trajet |
| Édition shift | ✅ | `Administratif.tsx` | |
| Lieux de travail | ✅ | `Administratif.tsx` | Gestion CRUD lieux |
| Dashboard totaux | ✅ | `Administratif.tsx` | KPI hero, grille work/travel, comparaison période (§39) |
| Sélecteur de période | ✅ | `Administratif.tsx` | ToggleGroup 7j/mois/mois-1/custom (§39) |
| Donut chart travail/trajet | ✅ | `Administratif.tsx` | Recharts PieChart avec centre label (§39) |
| Bar chart empilé par jour | ✅ | `Administratif.tsx` | BarChart stacked work + travel (§39) |
| Top lieux par heures | ✅ | `Administratif.tsx` | Classement avec barres de progression (§39) |
| Comparaison période | ✅ | `Administratif.tsx` | Delta badge TrendingUp/Down (§39) |
| Groupes encadrés par shift | ✅ | `Administratif.tsx`, `TimesheetShiftForm.tsx` | Multi-checkbox groupes permanents + custom labels (§66) |
| Vue comité | ✅ | `Comite.tsx` | Tous les coachs, filtrage |

### Admin

| Fonctionnalité | Statut | Fichiers | Notes |
|----------------|--------|----------|-------|
| Liste utilisateurs | ✅ | `Admin.tsx` | Recherche, filtre rôle |
| Création utilisateur | 🔧 | `Admin.tsx` | Retourne "skipped" si offline |
| Modification rôle | 🔧 | `Admin.tsx` | Idem |
| Désactivation | 🔧 | `Admin.tsx` | Idem |

### Profil

| Fonctionnalité | Statut | Fichiers | Notes |
|----------------|--------|----------|-------|
| Hub Profil (grille navigation) | ✅ | `Profile.tsx` | State machine home/objectives, grille 2x2 (Mon profil, Sécurité, Records, Objectifs) (§61) |
| Affichage infos | ✅ | `Profile.tsx` | Hero banner bg-accent, avatar ring, badge rôle (§38) |
| Édition profil | ✅ | `Profile.tsx` | Sheet bottom mobile-friendly, formulaire complet + téléphone (§38, §62) |
| Changement de groupe → sync group_members | ✅ | `Profile.tsx`, migration `00032` | Trigger PostgreSQL BEFORE UPDATE sync `group_members` + `group_label` automatiquement (§67) |
| Changement mot de passe | ✅ | `Profile.tsx` | Bottom sheet dédié Sécurité (§61, was Collapsible §38) |
| FFN & Records | ✅ | `Profile.tsx` | Card fusionnée sync FFN + lien records (§38) |
| Entretiens nageur | ✅ | `AthleteInterviewsSection.tsx`, `Profile.tsx` | Formulaire 4 sections en draft_athlete, lecture seule + signature en sent, historique en signed (§74) |

### Planification natation (granularité nageur, §153 — remplace macro-cycles)

| Fonctionnalité | Statut | Fichiers | Notes |
|----------------|--------|----------|-------|
| Sélecteur "nageur" sur `/coach/swim-planning` | ✅ | `SwimPlanningDemo.tsx`, `useSwimPlanningAthleteMode.ts` | Dropdown à côté du groupe, URL `?athlete=<id>`, bandeau avec avatar + "Retour plan groupe" (§153) |
| Override filière par nageur (slot) | ✅ | `swim_planning_slot_overrides`, `mergeSlots` | Ring dashed + icône User sur la chip ; remplace l'edit direct en mode athlete (§153) |
| Override week_type + notes par nageur | ✅ | `swim_planning_week_overrides`, `mergeWeekMeta` | Source `"athlete"` identifiée via `mergeWeekMeta` (§153) |
| Week meta groupe persistée en DB | ✅ | `swim_planning_week_meta` | Remplace l'ancien localStorage `swim-plan-meta-*` (§153) |
| Panneau inline nageur sur fiche coach | ✅ | `SwimmerPlanningPanel.tsx`, `SwimPlanningTimeline readOnly` | 7 semaines, lien "Plein écran" → `/coach/swim-planning?athlete=<id>` (§153, remplace `SwimmerPlanningTab`) |
| Vue côté nageur — merge + badge "Perso" | ✅ | `SwimPlanningAthleteView.tsx` | Merge `mergeSlots` + `mergeWeekMeta`, badge outline primary sur chip et header, tooltip "Personnalisé par ton coach" (§153) |
| Macro-cycles (training_cycles/training_weeks) | 🗄️ Retiré | `SwimmerPlanningTab.tsx` supprimé (§153) | Tables conservées pour rollback, drop prévu §T10 après validation prod |

### Entretiens individuels (coach)

| Fonctionnalité | Statut | Fichiers | Notes |
|----------------|--------|----------|-------|
| Workflow multi-phases | ✅ | `SwimmerInterviewsTab.tsx`, `interviews.ts` | draft_athlete → draft_coach → sent → signed avec guards (§74) |
| Initiation coach | ✅ | `SwimmerInterviewsTab.tsx` | Crée en draft_athlete, nageur reçoit le formulaire (§74) |
| Sections nageur (4) | ✅ | `AthleteInterviewsSection.tsx` | Réussites, difficultés, objectifs, engagements (§74) |
| Sections coach (3) | ✅ | `SwimmerInterviewsTab.tsx` | Commentaires, objectifs ajoutés, actions à suivre (§74) |
| Cloisonnement phases | ✅ | `interviews.ts`, migration 00035 | RLS phase-based : nageur masqué en draft_coach, coach masqué en draft_athlete (§74) |
| Panneau contextuel | ✅ | `SwimmerInterviewsTab.tsx` | Accordéon objectifs + planification + compétitions en phase draft_coach (§74) |
| Signature nageur | ✅ | `AthleteInterviewsSection.tsx` | Bouton signer en statut sent, passe à signed (§74) |
| Historique entretiens | ✅ | `SwimmerInterviewsTab.tsx`, `AthleteInterviewsSection.tsx` | Liste chronologique coach + archive collapsible nageur (§74) |

### Coach Events Timeline (§84)

| Fonctionnalité | Statut | Fichiers | Notes |
|----------------|--------|----------|-------|
| Timeline verticale échéances coach | ✅ | `CoachEventsTimeline.tsx`, `useCoachEventsTimeline.ts` | Mois groupés, points colorés lumineux, badges urgency (§84) |
| Fetch parallèle 3 sources | ✅ | `useCoachEventsTimeline.ts` | Compétitions, entretiens pending, fins de cycles via 3 useQuery (§84) |
| Normalisation TimelineEvent[] | ✅ | `useCoachEventsTimeline.ts` | Merge + tri chronologique, calcul urgency (now/soon/upcoming) (§84) |
| Filtres type/période | ✅ | `useCoachEventsTimeline.ts`, `CoachEventsTimeline.tsx` | Filtre par type d'événement et horizon temporel (§84) |
| getAllPendingInterviews() | ✅ | `interviews.ts`, `api/index.ts`, `api.ts` | Join users pour athlete_name, filtre status != signed (§84) |

### Créneaux d'entraînement récurrents

| Fonctionnalité | Statut | Fichiers | Notes |
|----------------|--------|----------|-------|
| CRUD créneaux (jour + horaire + lieu) | ✅ | `CoachTrainingSlotsScreen.tsx`, `training-slots.ts` | Création, modification, soft delete (§76) |
| Multi-groupes par créneau | ✅ | `CoachTrainingSlotsScreen.tsx`, `training-slots.ts` | N assignations groupe/coach/lignes par créneau (§76) |
| Nombre de lignes d'eau par coach | ✅ | `CoachTrainingSlotsScreen.tsx` | Saisie manuelle dans le formulaire d'assignation (§76) |
| Exceptions par date (annulation/modification) | ✅ | `CoachTrainingSlotsScreen.tsx`, `training-slots.ts` | Override avec statut cancelled/modified, motif optionnel (§76) |
| Vue nageur "Mon planning" | ✅ | `Profile.tsx` | Liste compacte jour/horaire/lieu + exceptions à venir (§76) |
| Navigation coach | ✅ | `Coach.tsx` | Bouton "Créneaux" dans la grille du dashboard coach (§76) |

### Créneaux personnalisés par nageur

| Fonctionnalité | Statut | Fichiers | Notes |
|----------------|--------|----------|-------|
| Table `swimmer_training_slots` | ✅ | `00042_swimmer_training_slots.sql` | UUID PK, FK vers `training_slot_assignments`, RLS coach/admin (§78) |
| API CRUD module | ✅ | `swimmer-slots.ts` | get, has, init, create, update, delete, reset, affected (§78) |
| Timeline mobile scroll horizontal | ✅ | `CoachTrainingSlotsScreen.tsx` | Colonnes 80px fixes, auto-scroll sur aujourd'hui (§78) |
| Select filtre (remplace pills) | ✅ | `CoachTrainingSlotsScreen.tsx` | Groupes + coaches + nageurs dans Select unique (§78) |
| Vue nageur dans timeline coach | ✅ | `CoachTrainingSlotsScreen.tsx` | Sélection nageur → affiche créneaux perso ou hérités (§78) |
| Onglet Créneaux fiche nageur | ✅ | `SwimmerSlotsTab.tsx`, `CoachSwimmerDetail.tsx` | CRUD complet, init/reset depuis groupe (§78) |
| Résolution créneaux profil nageur | ✅ | `Profile.tsx` | hasCustomSlots → créneaux perso, sinon fallback groupe (§78) |

### Notifications push (§79)

| Fonctionnalité | Statut | Fichiers | Notes |
|----------------|--------|----------|-------|
| Gate installation PWA mobile | ✅ | `PWAInstallGate.tsx`, `pwaHelpers.ts` | Bloquant sur mobile si pas standalone. Android: bouton install. iOS: instructions visuelles |
| Table push_subscriptions | ✅ | `00043_push_subscriptions.sql` | RLS via app_user_id(), UNIQUE(user_id, endpoint) |
| Service Worker push handler | ✅ | `public/push-handler.js`, `vite.config.ts` | importScripts dans Workbox generateSW |
| Client push helpers | ✅ | `pushHelpers.ts`, `push.ts` | Subscribe/unsubscribe/check, split pur/browser |
| Push permission banner | ✅ | `PushPermissionBanner.tsx`, `App.tsx` | Banner post-login, dismissible localStorage |
| Edge Function push-send | ✅ | `supabase/functions/push-send/index.ts` | npm:web-push@3.6.7, nettoyage tokens expirés, auth webhook service_role + JWT coach/admin (§110 v33) |
| Database webhook trigger | ✅ | `00044_push_webhook_trigger.sql` | pg_net trigger sur notification_targets INSERT |
| Push toggle dans Profil | ✅ | `Profile.tsx` | Activer/désactiver depuis la page profil |
| VAPID keys config | ✅ | `pushConfig.ts`, `pages.yml` | GitHub Secrets + Supabase Secrets |
| Nettoyage notifications nageur | ✅ | `00139_notification_clear_server_side.sql`, `notifications.ts`, `SwimmerMessagesView.tsx` | §161 DELETE policy notification_targets + table notification_dismissals pour group-targeted + API `notifications_clear_all` + bouton "Effacer toutes les notifications" |
| Cohérence textuelle notifications | ✅ | `00142_notification_text_alignment.sql` | §163 tutoiement aligné sur compétition/entretien + titre "Nouvelle compétition" + point final sur body compétition/entretien/wellness |
| Auto-purge notifications crons (TTL) | ✅ | `00143_notification_auto_expire_crons.sql`, `notifications.ts` | §163 `expires_at` = J+1 sur wellness matin et slot-session-reminder + backfill 25 notifs existantes + filtrage client `expires_at <= now()` dans `notifications_list` |
| Auto-mark à la complétion d'action | ✅ | `notifications.ts`, `WellnessForm.tsx`, `DashboardFeedbackContainer.tsx`, `AthleteInterviewsSection.tsx` | §235 helper `notifications_mark_read_by_filter({ userId, type, titleContains })` (jointure `notifications!inner` + UPDATE idempotent `is read_at null`). Branchements : wellness (`type: 'wellness'` après `upsertWellness`), ressenti séance (`type: 'assignment'` + `titleContains: 'Séance terminée'` sur `mutation`/`updateMutation`), entretien (`type: 'interview'` sur `submitMut`/`signMut`). Logique pure `applyMarkReadFilter` testée (4 cas) |
| Parallélisation reconcileStrengthRunLogs | ✅ | `src/lib/api/strength.ts` | §164 `Promise.allSettled` remplace boucle `for-await` — 20 sets séquentiels → parallèles (~×10 sur complétion séance muscu) |
| Parallélisation push-send | ✅ | `supabase/functions/push-send/index.ts` | §164 `Promise.allSettled` sur envois webpush — 10 abonnés ~1 s → ~100 ms, 404/410 toujours collectées pour cleanup |
| React Query defaults durcis | ✅ | `src/lib/queryClient.ts` | §164 staleTime 10 min, gcTime 60 min, refetchOnMount false, refetchOnWindowFocus false, refetchOnReconnect true, retry 1 |
| Tree-shaking Rollup via sideEffects | ✅ | `package.json` | §164 `"sideEffects": ["**/*.css"]` — réduction bundle chunks inutilisés |
| Lazy import gifenc | ✅ | `src/lib/gifEncoder.ts` | §164 `loadGifenc()` async + cache — ~20 KB sortent du chunk principal (chargés à la volée dans VideoTrimmer) |
| Indexes FK planning (8) | ✅ | `00140_fk_indexes_planning_tables.sql` | §164 indexes sur FK manquantes (planned_absences, session_attendance, session_comments, strength_planning_*, swim_planning_*) |
| Drop indexes redondants | ✅ | `00141_drop_redundant_indexes.sql` | §164 drop 2 indexes strictement couverts par UNIQUE (session_attendance_session_idx, idx_notification_dismissals_user) |
| Bridge push foreground in-app | ✅ | `src/hooks/useInAppPushBridge.ts`, `src/App.tsx` | §180 listener React sur messages SW eac-push, toast + invalidation queries notifications/coach-comments |

### UI/UX & Design System (Phase 6)

| Fonctionnalité | Statut | Fichiers | Notes |
|----------------|--------|----------|-------|
| PWA Icons (EAC branding) | ✅ | `public/icon-192.png`, `public/icon-512.png`, `public/apple-touch-icon.png`, `public/favicon.png` | 4 tailles (192, 512, 180, 128), logo EAC rouge |
| Theme color (EAC red) | ✅ | `index.html`, `public/manifest.json` | #E30613 (was #3b82f6) |
| Login page moderne | ✅ | `Login.tsx` | Split layout desktop, mobile thème clair avec bande rouge EAC (§46) |
| Animations Framer Motion | ✅ | `Dashboard.tsx`, `Strength.tsx`, `Records.tsx`, `Profile.tsx`, `HallOfFame.tsx` | fadeIn, slideInFromBottom, staggerChildren, successBounce |
| Animation library | ✅ | `src/lib/animations.ts` | 8 presets: fadeIn, slideUp, scaleIn, staggerChildren, listItem, successBounce, slideInFromBottom, slideInFromRight |
| Button patterns standardisés | ✅ | `BUTTON_PATTERNS.md`, `Strength.tsx`, `SwimCatalog.tsx`, `StrengthCatalog.tsx`, `Admin.tsx` | h-12 mobile (48px), h-10 desktop (40px), variants (default, outline, ghost) |
| Code splitting & lazy loading | ✅ | `App.tsx`, `Coach.tsx` | React.lazy + Suspense pour pages lourdes (Dashboard, Strength, Records, SwimCatalog, StrengthCatalog) |
| Skeleton loading states | ✅ | `Dashboard.tsx`, `Strength.tsx`, `HallOfFame.tsx`, `RecordsClub.tsx`, `Admin.tsx`, `Profile.tsx` | Toutes les pages data-heavy |

### Accessibilité

| Fonctionnalité | Statut | Fichiers | Notes |
|----------------|--------|----------|-------|
| ARIA live regions | ✅ | `WorkoutRunner.tsx`, `BottomActionBar.tsx` | Annonces pour les changements dynamiques (timers, sauvegarde) |
| PWA install prompt | ✅ | `InstallPrompt.tsx`, `App.tsx` | Banner iOS-optimized avec guide d'installation |
| Service Worker (Workbox) | ✅ | `vite.config.ts` (vite-plugin-pwa) | Workbox generateSW, 102 entries precachées, auto-update (§48) |
| Runtime caching API | ✅ | `vite.config.ts` | NetworkFirst Supabase, CacheFirst Google Fonts (§48) |
| Bundle optimization | ✅ | `vite.config.ts`, `RecordsClub.tsx` | Modulepreloads réduits de 5→3, lazy-load PDF export (§48) |
| DNS prefetch | ✅ | `index.html` | dns-prefetch + preconnect Supabase (~200ms saved) (§48) |
| Navigation clavier (Dashboard) | ✅ | `Dashboard.tsx` | Flèches (calendrier), Enter/Espace (ouvrir jour), Escape (fermer) |
| Navigation clavier (Strength) | ✅ | `Strength.tsx` | Flèches (liste séances), Enter (ouvrir), Escape (retour liste) |
| Focus trap (modals/drawers) | ✅ | Composants Radix UI | Natif dans Dialog/Sheet |
| Indicateurs de focus visuels | ✅ | `Dashboard.tsx`, `Strength.tsx` | Anneau bleu (`ring-2 ring-primary`) |

---

## Dépendances Supabase

| Fonctionnalité | Comportement si offline |
|----------------|-------------------------|
| Auth login | Erreur |
| Création utilisateur | `{ status: "skipped" }` |
| Modification rôle | `{ status: "skipped" }` |
| Sync FFN | Erreur Edge Function |
| Données générales | Fallback localStorage |

### UI/UX & Design System

| Fonctionnalité | Statut | Fichiers | Notes |
|----------------|--------|----------|-------|
| **Phase 6: Visual Polish & Branding** |
| PWA Icons (EAC branded) | ✅ | `public/icon-*.png`, `manifest.json` | 4 sizes (192, 512, 180, 128), theme-color #E30613 |
| Login Page (modern redesign) | ✅ | `Login.tsx` | Split layout, animations, password strength |
| Animation System | ✅ | `lib/animations.ts` | 8 Framer Motion presets (fadeIn, slideUp, stagger, etc.) |
| Button Standardization | ✅ | `docs/BUTTON_PATTERNS.md` | 3 variants (default, outline, ghost), height standards |
| App-wide Animations | ✅ | Dashboard, Strength, Records, Profile, Login | Consistent motion design |
| **Phase 7: Component Architecture** |
| Dashboard Components | ✅ | `components/dashboard/` (6 files) | CalendarHeader, DayCell, CalendarGrid, StrokeDetailForm, FeedbackDrawer, useDashboardState hook |
| Strength Components | ✅ | `components/strength/` (3 files) | HistoryTable, SessionDetailPreview, SessionList, useStrengthState hook |
| Swim Coach Shared | ✅ | `components/coach/shared/` (4 files) | SessionListView (générique T), SessionMetadataForm, FormActions, DragDropList (reusable) |
| Swim Coach Components | ✅ | `components/coach/swim/` (2 files) | SwimExerciseForm, SwimSessionBuilder |
| Strength Coach Components | ✅ | `components/coach/strength/` (4 files) | StrengthExerciseCard, StrengthSessionBuilder, FolderSection, MoveToFolderPopover (§30, §32) |
| **Phase 8: Design System** |
| Storybook Setup | ✅ | `.storybook/`, story files (5) | Dark mode support, 36 story variants |
| Design Tokens | ✅ | `lib/design-tokens.ts` | 57+ tokens (colors, durations, spacing, typography, z-index) |
| Centralized Utilities | ✅ | `lib/design-tokens.ts` | getContrastTextColor (eliminated duplicates) |
| Zero Hardcoded Values | ✅ | All src/ files | No hex/rgb colors remaining (excluding CSS) |
| z-index consistency | ✅ | `BottomActionBar.tsx`, `WorkoutRunner.tsx`, `toast.tsx` | Tous les z-index utilisent les design tokens CSS (z-bar, z-modal, z-toast) |
| BottomActionBar position modes | ✅ | `BottomActionBar.tsx`, `FeedbackDrawer.tsx` | Prop `position="static"` pour usage dans drawers sans overflow |
| Touch targets 44px compliance | ✅ | 10 fichiers coach | Tous les boutons interactifs ≥ 40px (h-10 w-10), chips py-2 (§81) |
| FeedbackDrawer scale labels | ✅ | `FeedbackDrawer.tsx` | Labels min/max (Facile↔Très dur, Mauvaise↔Excellente) sur les 5 boutons (§81) |
| FeedbackDrawer AlertDialog | ✅ | `FeedbackDrawer.tsx` | Remplacement window.confirm par Shadcn AlertDialog (§81) |
| FeedbackDrawer distance directe | ✅ | `FeedbackDrawer.tsx` | Tap sur valeur → input numérique direct, arrondi 100m (§81) |
| Records shortcut Dashboard | ✅ | `Dashboard.tsx` | Chip "Mes records" accès direct /records (§81) |
| Coach bottom nav 5 items | ✅ | `navItems.ts`, `AppLayout.tsx`, `Coach.tsx` | Natation, Calendrier, Nageurs promus en bottom nav (§81) |
| KPIs fiche nageur Resume | ✅ | `CoachSwimmerDetail.tsx` | 4 tuiles avec données réelles (ressenti, entretiens, cycle, objectifs) (§81) |
| Wizard inscription 3 étapes | ✅ | `Login.tsx` | Formulaire découpé en 3 steps avec progress dots et validation (§81) |
| CORS production domain only | ✅ | `_shared/cors.ts`, 4 Edge Functions | Origin restreint à erstein-aquatic-club.github.io (§82) |
| Migrations reproductibles | ✅ | `00050_missing_tables_reproducibility.sql` | competitions, competition_assignments, objectives, planned_absences, app_settings (§82) |
| Nettoyage tables legacy | ✅ | `00051_drop_legacy.sql`, `schema.ts` | auth_login_attempts supprimée (§82) |
| RPC atomique strength session | ✅ | `00052_rpc.sql`, `strength.ts` | Transaction unique UPDATE+DELETE+INSERT (§82) |
| Pagination listes longues | ✅ | `Admin.tsx`, `SwimCatalog.tsx`, `CoachSwimmersOverview.tsx` | "Voir plus" client-side, cap 30-50 items (§82) |
| Coach deep linking URL | ✅ | `Coach.tsx` | URL synchro activeSection via replaceState (§82) |
| Page Suivi hub + drill-down | ✅ | `Suivi.tsx`, `SuiviSemaine.tsx`, `SuiviPlanification.tsx`, `SuiviObjectifs.tsx`, `SuiviProgression.tsx` | Hub /suivi avec 4 cartes aperçu → sous-routes dédiées (semaine, planification, objectifs, progression) (§103/§104) |
| Profil allégé | ✅ | `Profile.tsx` | Retrait sections suivi, ajout tuile Club, redirect compat (§83) |
| Swipe calendrier | ✅ | `useSwipeNavigation.ts`, `CalendarGrid.tsx`, `Dashboard.tsx` | Navigation mois par swipe horizontal framer-motion (§83) |
| Drag-to-dismiss drawer | ✅ | `FeedbackDrawer.tsx` | Geste drag handle pour fermer le drawer (§83) |
| Pull-to-refresh Dashboard | ✅ | `PullToRefresh.tsx`, `Dashboard.tsx` | Geste pull-down pour rafraîchir les données (§83) |


### Suivi nageur — détail sous-vues (§104)

| Fonctionnalité | Statut | Fichiers | Notes |
|----------------|--------|----------|-------|
| Vue semaine enrichie (natation + muscu) | ✅ | `SuiviSemaine.tsx` | Timeline jour par jour : sessions loggées (nage + muscu), manquées, absences. Navigation semaine ←→. Indicateurs ressentis colorés (diff/fatigue/perf/engagement). Expansion inline. Intégration résultats musculation (strength runs) à côté des ressentis nage |
| Vue semaine — sources d'assignation | ✅ | `SuiviSemaine.tsx`, `assignments.ts` | 3 sources : créneaux perso résolus (priorité), fallback individuel, fallback groupe. Badge couleur par source (individual/subgroup/group) |
| Vue semaine — wellness banner | ✅ | `SuiviSemaine.tsx`, `WellnessForm.tsx` | Bannière si bien-être non saisi aujourd'hui + Sheet overlay (semaine courante uniquement) |
| Vue planification (natation) | ✅ | `SuiviPlanification.tsx`, `SwimPlanningAthleteView.tsx` | Toggle Natation/Musculation. Mode Natation : timeline verticale infinie des semaines avec types, dots filière, expansion micro-grille 6j×2 créneaux (matin/soir). Mode Musculation : Mon plan muscu (MyPlanTab) |
| Vue planification — infinite scroll | ✅ | `SwimPlanningAthleteView.tsx` | IntersectionObserver avec re-création correcte après chaque load-more (rootMargin 100px). Bug décalage scroll corrigé (§104) |
| Vue planification — fiche filière | ✅ | `SwimPlanningAthleteView.tsx`, `FILIERE_MAP` | Sheet bottom au tap sur chip : nom, description DB, exemples, accordion détails techniques (9 métriques) |
| Vue objectifs nageur drill-down | ✅ | `SuiviObjectifs.tsx`, `SwimmerObjectivesView.tsx` | CRUD objectifs perso + lecture objectifs coach (ObjectiveCard ring SVG). Compétitions à venir avec J-X badge et accès direct détail compétition |
| Affichage créneaux perso Ma semaine | ✅ | `SwimmerWeekSlots.tsx` | Bug décalage d'un jour corrigé (convention day_of_week : 1=Lundi..7=Dimanche, cohérente avec SwimmerHome) |

### Stabilité PWA (§104)

| Fonctionnalité | Statut | Fichiers | Notes |
|----------------|--------|----------|-------|
| Fix page blanche au retour arrière-plan | ✅ | `auth.ts`, `App.tsx`, `main.tsx` | Triple fix : (1) `onAuthStateChange` ne remet plus `isLoaded=false` si user déjà chargé — mise à jour tokens uniquement. (2) `useVersionCheck` ne déclenche plus de reload au `visibilitychange`. (3) SW `r.update()` supprimé au `visibilitychange` |
| Refresh token sans interruption session | ✅ | `auth.ts` | Si `INITIAL_SESSION`/`SIGNED_IN` arrive (retour premier plan iOS) : tokens mis à jour sans toucher à `isLoaded` ni re-render du router |


### Performance & offline (post-pass-2 — §254 → §265)

Voir l'audit complet `docs/audits/2026-05-10-perf-audit-pass2-runtime.md` pour les mesures détaillées. Composite mesuré 6.1/10 (pass 1) → 7.4/10 (pass 2 post-§253) → **~8.4/10 estimé** (post §256/§262/§263/§265).

| Fonctionnalité | Statut | Fichiers | Notes |
|----------------|--------|----------|-------|
| Audit perf pass 2 runtime (hybride statique + smoke) | ✅ | `docs/audits/2026-05-10-perf-audit-pass2-runtime.md` (242 lignes) | Vérifie chaque claim §239→§253 contre l'état effectif du build. Identifie 1 régression critique §246 ↔ §243 (`vendor-motion` réintroduit critical path par PageTransition sync) + 3 gaps résiduels (§265) |
| Fix régression PageTransition CSS | ✅ | `PageTransition.tsx`, `index.css` (§255, bundlé §259) | `<AnimatePresence><motion.div>` → `<div key={location} className="anim-page-transition">` + `@keyframes page-transition-in`. **Critical path 5 vendors → 4 mesurés** (vendor-motion 38.27 KB gzip sorti). Drop-in compatible |
| Cache React Query persisté localStorage | ✅ | `App.tsx`, `package.json` (§248) | `<PersistQueryClientProvider>` + `createSyncStoragePersister` (key `eac-rq-cache`, maxAge 24h, buster `__BUILD_TIMESTAMP__`). Reload PWA offline désormais peuplé |
| Sonde connectivité réelle | ✅ | `src/hooks/useOnlineStatus.ts` (§249) | HEAD `version.json` toutes les 30 s (5 s si fail), élimine faux positifs captive portal / VPN coupé / Supabase down |
| Queue offline 12/12 mutations critiques | ✅ | `OfflineMutationSync.tsx`, `tryWithOfflineQueue` (§251 + §252 + §262 + §263) | 3 §251 (Profile.update + Records 1RM + swim) + 7 §252 (SuiviSemaine 2 + Administratif 5) + 1 §262 (SwimSessionView atomique) + 1 §263 (uploadAvatar dataURL). Chantier A 100% livré |
| RPC `save_swim_session_atomic` (1 RTT vs N+1) | ✅ | Migration `00159`, `swim-sessions.ts` (§262) | SECURITY INVOKER, RLS héritée. Body : SELECT/INSERT dim_sessions + DELETE/INSERT swim_exercise_logs en transaction. Fallback legacy byte-identical si RPC absent. Sur 8 blocs Slow 3G : ~3.2 s économisées + 0 session orpheline |
| Upload avatar offline (dataURL base64) | ✅ | `users.ts` (`blobToDataUrl`/`dataUrlToBlob`), `Profile.tsx` (§263) | Blob sérialisé en data URL pour localStorage. Quota guard 1 MB pré-enqueue. Replay : `dataUrlToBlob` → `uploadAvatar`. Idempotent via `upsert: true` |
| `withTimeout(8s)` sur queryFn critiques | ✅ | `src/lib/api/client.ts` + 5 sites (§256) | Adoption 3× → 13× : Dashboard `getSessions` + `getAssignments`, SwimmerHome `getProfile/Assignments/Sessions`, Records `1RM/swim/performances`, Coach `getCoachKpis`, auth.ts RPC. Worst case 27 s end-to-end via retry §244 vs blocking infinite |
| Retry exponentiel transient errors | ✅ | `src/lib/queryClient.ts` (§244) | `retry: (n,e) => n<2 && isTransientError(e)` + `retryDelay: 1000 * 2^i max 4000`. Combine avec `withTimeout` §256 et `isTransientError` (§offlineQueue) |
| RPC `get_user_auth_context` (login -1 RTT) | ✅ | Migration `00158`, `auth.ts loadUser` (§247) | Fusionne `users.role` + `user_profiles.is_approved` en 1 round-trip. Fallback byte-identical sur 2 selects si RPC absent. ~400-800 ms gagnés au login Slow 3G |
| Toast "Ça prend du temps…" après 5 s | ✅ | `src/hooks/useDelayedLoading.ts`, branchements Dashboard/Coach/Records (§265) | Hook pur + 6 tests vitest fake-timers. Élimine le drapeau "aucun feedback >5 s" du pass 1. Couplé §244 + §256 : skeleton → toast 5 s → retry → 27 s max |
| SW precache slim (-1485 KiB mesurés) | ✅ | `vite.config.ts` (§241) | `globIgnores` Workbox sur `exceljs.min-*` + `jspdf.plugin.autotable-*` + `html2canvas.esm-*` (455 KB gzip cumulés). Servis en runtime via `StaleWhileRevalidate` cache `heavy-export-chunks` (max 6, TTL 30j) |
| Edge Functions runtime cache | ✅ | `vite.config.ts` (§239 #6) | `NetworkFirst` sur `/functions/v1/*` (timeout 8s, max 30, TTL 1h). Admin / records import résilient offline |
| Pagination 500 SELECT* records | ✅ | `records.ts:354,466,583` (§244 sub-§A + §239 #3) | `.limit(500)` sur `getSwimRecords`, `getSwimmerPerformances`, `getClubRanking`. `getSessions` `.limit(200)`. -70% payload sur nageur actif multi-saisons |
| `React.memo(SwimSessionTimeline)` | ✅ | `SwimSessionTimeline.tsx` (§253) | `export const SwimSessionTimeline = memo(SwimSessionTimelineImpl)`. Parent `SwimSessionView.tsx` stabilise déjà 4 callbacks via `useCallback`. -50 à -80 % re-renders sur saisie active de logs (mesure runtime à confirmer Profiler) |
| Extraction `<AthleteCard>`/`<RecordCard>` + memo | ⏸ | `CoachSwimmersOverview.tsx`, `Records.tsx` (§266) | Bloqué par profiling React DevTools en runtime sur le live — sans données réelles, ROI < risque refactor. Action utilisateur : Chrome + React DevTools Profiler sur Coach hub + Records |


## Exercices sans GIF

Les exercices suivants n'ont pas d'URL `illustration_gif` dans `dim_exercices` :

- 39: Sliding Leg Curl
- 40: Back Extension 45°
- 41: Standing Calf Raise
- 42: Seated Soleus Raise
- 43: Pogo Hops
- 44: Ankle Isometric Hold
- 53: Rotational Med Ball Throw
- 54: Med Ball Side Toss
- 55: Med Ball Shot Put
- 56: Drop Jump to Stick
- 57: Isometric Split Squat Hold
- 58: Copenhagen Plank
- 59: Hip Airplane

Pour ajouter les GIFs manquants, mettre à jour la colonne `illustration_gif` dans Supabase.

---

## Voir aussi

- [`docs/ROADMAP.md`](./ROADMAP.md) — Plan de développement futur
- [`README.md`](../README.md) — Vue d'ensemble du projet
- [`docs/implementation-log.md`](./implementation-log.md) — Journal des implémentations
