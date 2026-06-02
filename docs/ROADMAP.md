# Roadmap de Développement

*Dernière mise à jour : 2026-06-02 — **§364 — Synthèse Résultats club (liveffn)** : import de la page liveffn « Résultats par structure » d'une compétition dans un **snapshot par compétition** (affichage figé, pas de refetch live) + **synthèse par nageur** dans un 4ᵉ onglet « Résultats » de `CompetitionDetail`. Migration **00224** (`competitions` += `liveffn_results_url`, `results_snapshot` jsonb, `results_imported_at`). Parseur DOM-free `parseResults.ts` (place / phase finale A·B·C|série / temps / points / splits, frère de `parseStartlist` dont les helpers `clean`/`extractCell`/`parseInteger`/`parseSwimmerHeading` sont exportés en DRY). Verdicts **purs** `resultVerdicts.ts` (`collapseByEvent` + `eventVerdict` : record perso / atteinte objectif / rang historique en repli, **bassin-aware**, pont event_code FFN « 50 NL » ↔ compact « 50NL » via `eventCodeFromFfnName`). Synthèse **pure** `resultsSynthesis.ts` (`buildResultsSynthesis` → totaux records/podiums/finales A/objectifs + résultats par nageur ; stats de place sur TOUS les nageurs, stats base sur les nageurs LIÉS). UI `CompetitionResultsTab.tsx` (en-tête tuiles de stats + cartes par nageur + badges verdict + splits dépliables). **Snapshot display-only** : n'écrit JAMAIS `swimmer_performances` (verdicts recalculés au rendu depuis notre base). Réutilise l'edge fn `liveffn-startlist` (allowlist étendue à `resultats.php`, **v5**, `verify_jwt=false`, **aucune nouvelle fonction**) + `matchSwimmers`/`startlist_athlete_map`/`seasonBest`. `parseResults` 10/10, `resultVerdicts` 10/10, `resultsSynthesis` 9/9, `parseStartlist` 5/5 ; node:test **1636** + vitest **71**, tsc 0, lint clean, build OK. **Pas de `test:rls`** (migration = colonnes additives, policies inchangées). Limites : pas de rafraîchissement live (réimport manuel) ; `clubName` reconnu uniquement « \* AQUATIC CLUB » ; détection finale dépendante du label liveffn ; nageurs non appariés listés (pas écartés). Design `docs/plans/2026-06-02-competition-results-synthesis-design.md` ; plan `docs/plans/2026-06-02-competition-results-synthesis.md`. ⚠️ §364 livré **après** §365 (working tree partagé : §364 réservé à ce terminal liveffn, §365 déjà sur `main`) → numéro inférieur mais postérieur dans le temps. **Précédent §365 — Assiduité muscu + mésocycles dans « Planif Muscu »** : la liste des mésocycles sort du home coach et rejoint l'écran « Planif Muscu » (refonte `StrengthPlanningScreen` 721→47 l), aux côtés d'un nouveau **tableau d'assiduité** — par nageur à méso actif : jauge `terminées/prévues` par semaine ISO + bande 7 pastilles Lun→Dim (terminé/débuté/à faire/déplacée/prévu), toggle période **1/2/4 sem** navigable (◀▶). Objectif **volume hebdo 100%** tolérant au décalage (lundi raté + mardi fait = semaine OK) : calcul **à la semaine**, « débutée » = état intermédiaire orange qui ne compte pas dans le %. Agrégateur **pur** testé `attendance.ts` (`computeAttendance` + helpers période UTC-safe), helper API batché lecture seule `getStrengthAttendanceData`, accordéon `CoachMesocyclesAccordion` (single-open, **lazy mount** du `CoachMesocyclePanel`). Constante deeplink relocalisée `coachNav.ts` ; `CoachActiveMesocyclesSection` supprimé. **Aucune migration / RLS** (RLS coach/admin déjà permissive sur runs + slot_overrides → pas de `test:rls`) ; v1 **lecture seule** (relance push / marquage « excusée » différés). 18 node:test `attendance` ; vitest 71, tsc 0, lint 0, build OK. Exécuté en **subagent-driven**. Design `docs/plans/2026-06-01-assiduite-muscu-planif-design.md` ; plan `docs/plans/2026-06-01-assiduite-muscu-planif.md`. ⚠️ Working tree partagé → § renuméroté §364→**§365** (§364 réservé au terminal liveffn « Résultats club »). **Précédent §363 — Jour J détail nageur + Paramètres v2 (bassin)** : 3 retours terrain François après §362. (1) **Fix tuile « Échéances »** (`Coach.tsx`) — elle ouvrait directement une compétition au lieu de la timeline ; désormais elle ouvre la **timeline complète** (le hero y met la prochaine compé en avant), aperçu nom + J-X conservé, deep-link direct retiré de la tuile (les cartes de la timeline gardent le leur). (2) Migration **00223** `competitions.pool_length` (bassin 25/50 m, nullable) + types. (3) **Onglet Paramètres v2** (`CompetitionDetail.tsx`, 723 l) — re-layout en 3 sections (Infos / Liste de départ / Zone danger) + **sélecteur bassin** (25 m / 50 m / —) persisté en `pool_length`. (4) **`SwimmerRaceSheet`** (nouveau, 199 l, `src/components/coach/competition/`) — **bottom sheet** au clic d'un nageur LIÉ en Jour J : **meilleur temps saison** (depuis 1er sept FFN) + **record perso** (best all-time) avec dates + **tableau d'allures** (`PaceMatrixInline` réutilisé) pour l'objectif du nageur ; bassin des allures = **bassin de la compétition** (fallback objectif). Lignes Jour J rendues **tactiles** (`CompetitionStartlist.tsx`, 616 l). Aucun fetch supplémentaire (réutilise les données déjà chargées). (5) 2 helpers purs testés `currentSeasonStart` + `bestForEvent` (`src/lib/competitions/seasonBest.ts`, 28 l) ; `userId` exposé sur `StartlistRow`. Décisions : best **saison** vs **record perso** (all-time) ; le **bassin de la compétition** pilote le bassin du tableau d'allures (fallback bassin objectif) ; réutilise `PaceMatrixInline`/`parseObjectiveForPace`/`findBestPerformance`, aucun fetch ajouté. 5 nouveaux node:test (seasonBest 4 + userId-row 1) ; node:test **1587**, vitest **71**, tsc **0**, lint **0**. Migration via MCP. **Pas de `test:rls`** (pas de RLS). Limites : `swimmerSex` passé `null` (non exposé dans `AthleteSummary`) → matrice non sexo-spécifique ; best par bassin (25 vs 50) écarté (saison vs all-time) ; vérif end-to-end live post-déploiement github.io. Design : `docs/plans/2026-06-01-jourj-detail-params-v2-design.md` ; plan : `docs/plans/2026-06-01-jourj-detail-params-v2.md`. **Précédent §362 — Refonte UX module Compétitions (3 workflows coach)** : la timeline « Échéances » (peu visuelle, mal optimisée mobile) et le menu d'édition d'une compétition (panneau latéral étroit) sont refondus. Nouvelle vue **détail plein écran 3 onglets** `CompetitionDetail` (`src/components/coach/competition/CompetitionDetail.tsx`, 663 l) — **Nageurs** (sélection participants + recherche + ajout par groupe + bandeau suggestion liveffn), **Paramètres** (nom/dates/lieu/notes + lien liveffn source unique + suppression), **Jour J** (listing liveffn enrichi embarqué). **Timeline refondue** (`CoachCompetitionsScreen.tsx`, 687 l) = **hero « prochaine compétition »** (J-X, lieu, nb nageurs, bouton Jour J) + **cartes scannables** (liste mixte compétitions/entretiens/fins de cycle, couleur par type) ; tap compétition → détail plein écran ; création slim (nom+dates+lieu) → Paramètres ; ancien panneau latéral + rail vertical supprimés. **Tuile hub vivante** (`Coach.tsx`) : « Echéances » affiche la prochaine compétition + J-X et **deep-link** vers son détail (route `competitionId` dans `coachRouteState.ts`). `CompetitionStartlistPanel` (refactor `CompetitionStartlist.tsx`, 547 l) = corps de §361 extrait en panneau embarquable (sans Sheet), URL liveffn déplacée en Paramètres (source unique). 2 helpers purs testés (`nextCompetition` `competitionSelectors.ts` 9 l, `suggestedParticipants` `suggestParticipants.ts` 7 l) ; clé React Query commune `["startlist", id, url]` (un seul fetch pour suggestion Nageurs + panneau Jour J). Décisions : Nageurs ↔ Jour J liés avec suggestion (bandeau « N nageurs engagés liveffn détectés — les ajouter ? », ajout 1 tap, sélection = assignation manuelle) ; URL liveffn source unique en Paramètres ; hero = prochaine compétition. 10 nouveaux node:test (nextCompetition 4 / suggestedParticipants 3 / coachRouteState 3) ; node:test 1582, vitest 71, tsc 0, lint 0. **Pas de migration ni RLS** (réutilise `competition_assignments` + colonnes §361) → pas de `test:rls`. Limites : vérif live en attente de déploiement github.io ; pas de notification/partage du Jour J aux nageurs (futur) ; cache offline du listing parsé (robustesse réseau faible) reste future §361. Design : `docs/plans/2026-06-01-competition-ux-redesign-design.md` ; plan : `docs/plans/2026-06-01-competition-ux-redesign.md`. **Précédent §361 — Liste de départ liveffn par compétition** : le coach colle l'URL d'une « liste de départ par structure » liveffn sur une compétition → nouvelle vue coach `CompetitionStartlist` (bouton « Liste de départ liveffn » dans `CompetitionFormSheet`/`CoachCompetitionsScreen`) affichant **quand chaque nageur du club court** + sa meilleure perf récente et son temps objectif (MÊMES données que les fiches objectifs via `objectiveHelpers`). Edge function `liveffn-startlist` (v1, ACTIVE, `verify_jwt`) = proxy fetch mince (garde coach/admin + validation host `liveffn.com`/path `startlist.php`) car liveffn n'a pas de CORS ; parsing côté client (`src/lib/liveffn/parseStartlist.ts` regex, `matchSwimmers.ts` appariement nom token-set + overrides persistés ambigu→null, `buildStartlistRows.ts` assemblage enrichi). Mig **00221** (`competitions.liveffn_startlist_url` + `startlist_athlete_map` jsonb ; aucun changement RLS → pas de `test:rls`). Pont objectifs UUID→numérique via rpc `get_auth_uids_for_users`. 19 nouveaux node:test (parse 5 / match 8 / rows 6) ; node:test 1572, vitest 71, tsc 0, lint 0. Limites : vérif live en attente de déploiement github.io (CORS edge verrouillé + builds locaux sans creds) ; pas de départage par date de naissance (ambigu→null) ; robustesse réseau faible (cache local) = future. **Précédent §360 — Remplacement YTW (id=24) par Mobilisation épaules 3 axes (id=102) dans la routine commune Bloc 1** : data-only (mig **00222**) — UPDATE `warmup_common_routine` ordre=3 + 18 `strength_session_items` migrés ; `strength_set_logs` conservés (historique réel) ; YTW catalogue intact. Mock test `strength-warmup.test.ts` (id 24→102). **Précédent §359 — Clôture ROADMAP §6 (timers PWA iOS)** : doc-only, aucun code. Le fix proposé par §6 (timestamps absolus + `visibilitychange`) est **déjà implémenté** dans `WorkoutRunner.tsx` (posé en §343) → l'affichage des timers est fiable après un passage en arrière-plan iOS. Seul trou restant — l'**alerte sonore de fin de repos écran verrouillé** — **écarté par décision coach** (contraintes iOS : `navigator.vibrate` non supporté sur Safari/PWA, bip Web Audio pré-programmé silencé par l'interrupteur Silencieux, Web Push disproportionné). Chantier §6 marqué **Clos sans suite**. **Précédent §358 — Bannière : report de la progression globale après ajustement**. L'ajustement mi-cycle (§338) repartait à « Semaine 1/N » au pivot ; désormais la bannière affiche la progression GLOBALE (« Semaine 3/6 »). Colonne `strength_mesocycles.week_offset` (défaut 0, mig **00220**, backfill méso de François =2) posée à l'ajustement (`MesocycleAdjust` → `weekOffset=phaseInfo.weekIndex` → `setMesocycleWeekOffset` post-apply) ; `mesocyclePosition` globalise (offset>0 = continuation, jamais « Commence bientôt ») ; `MyPlanTab` passe l'offset. node:test 1548→1553, vitest 71, tsc 0, lint 0, build OK. Limite UX §357 résolue. **Précédent §357 — « Mettre à jour l'app » purge le cache même sur erreur**. Le bouton Profil → « Mettre à jour l'app » purgeait déjà le Cache Storage + hard reload dans toutes les branches sauf le `catch` d'erreur → ajout `clearAllCaches()` dans le catch (toujours cache propre). Note : la bannière « Commence bientôt » après un ajustement de méso est **correcte** (nouveau méso démarrant au pivot = lundi prochain), pas une perte (4 semaines matérialisées en base) ; limite UX = progression globale non reportée. tsc 0, lint 0, UI-only. **Précédent §356 — Raise = rameur ergomètre + correctif flexion d'épaule dédié**. Retour terrain (matériel : rameur + élastique). (1) Le « Raise » du Bloc 1 passe de corde/montées de genoux au **rameur ergomètre** (UPDATE exo 97). (2) Comble le 3ᵉ trou de dédup : `shoulder_flexion` n'avait que Y-T-W + Shoulder Dislocates (dans la routine commune → dédupliqués) → ajout (mig **00219**) d'un correctif dédié « Mobilité flexion d'épaule (overhead élastique) » (id 101, unilatéral, hors routine commune). Tous les axes mobilité ont désormais ≥1 correctif non dédupliqué. Data-only, aucun code moteur. **Précédent §355 — Comble 2 trous de seed correctif (rotation thoracique + scapulaire unilatéral)**. Vérif terrain (déficit scapulaire D + rotation de torse) → 2 trous Bloc 2 : `t_spine` n'avait que Cat-Cow (dans la routine commune → dédupliqué) ; les 4 exos `scapula_control` sont bilatéraux (raffinement unilatéral §352 inopérant). Fix data (mig **00218**, validé coach) : 2 nouveaux exos d'échauffement par-côté — « Rotation thoracique (open book) » (`t_spine`, unilatéral) + « Rowing scapulaire unilatéral » (`scapula_control`, unilatéral). Aucun code moteur modifié. **Précédent §354 — Écrans coach d'édition des routines d'échauffement**. Dernier reliquat du chantier (8) : nouvel onglet « Échauffement » dans `StrengthCatalog` (`WarmupRoutinesEditor`) pour éditer la routine articulaire commune (Bloc 1) + l'activation par seau (Bloc 3) — réordonner ↑↓ / ajouter (catalogue) / retirer + « Enregistrer » par section. Persistance via 2 RPC atomiques `SECURITY INVOKER` (`set_warmup_common_routine`/`set_warmup_activation_routine`, mig **00217**, RLS coach/admin enforce sur l'INSERT). API `setCommonWarmupRoutine`/`setActivationRoutine`. S'applique aux prochains mésocycles générés. node:test 1545→1548, vitest 69→71, tsc 0, lint 0, build OK, RLS 5/5 nouveaux. **CHANTIER (8) « échauffement intelligent » CLOS** (génération Blocs 1+2+3 + marquage coach/nageur + édition coach). Reliquat optionnel : édition per-séance + tags Bloc 2. **Précédent §353 — Marquage de l'échauffement dans la vue exécution nageur**. Reliquat §351/§352 : les sous-sections « Échauffement articulaire / Mobilité corrective (+ axe·côté) / Activation musculaire » apparaissent désormais dans les vues nageur `MyPlanSessionSheet` + `SessionDetailPreview` (et plus seulement à l'aperçu coach). **Zéro migration** : `warmup_kind`/`corrective_axis`/`corrective_side` sont déjà persistés dans `raw_payload` ; helper pur `warmupMetaFromItem` les lit ; `isWarmupItem = meta.kind != null || block === 'warmup'` (warmup_kind prioritaire → corrige aussi la classification des items activation à bucket non-mobility). Réutilise `BLOCK_STYLES` + `warmupSectionLabel`/`correctiveChipLabel` (pattern aperçu §351). `WorkoutRunner` hors scope. node:test 1539→1545, vitest 67→69, tsc 0, lint 0, build OK ; aucune migration. **Vision 4 blocs complète + marquée coach ET nageur.** Reste (8) : écrans d'édition coach des tables warmup. **Précédent §352 — Échauffement intelligent : Bloc 3 (activation) + correctif unilatéral + Raise**. Complète la vision 4 blocs (suite §351), **fondé sur une recherche documentaire** (deep-research, cadre RAMP, dynamique>statique, correctif unilatéral réduit l'asymétrie, activation légère). **Bloc 3** : table `warmup_activation_routine` (mig **00215**) + `selectActivation` (1 exo/seau de travail, plafond 2, dédup vs Blocs 1+2, **développement seulement** — l'amorce PAP est déjà une activation). **Bloc 2 unilatéral** : `dim_exercices.supports_unilateral` → axe asymétrique préfère un exo unilatéral côté faible. **Bloc 1 Raise** : item de mise en route + seeds dynamiques. 3 nouveaux exos légers (Raise, Glute bridge, Monster walk). Marquage aperçu (3ᵉ sous-section « Activation musculaire »). node:test 1525→1539, vitest 67, tsc 0, lint 0, build OK, RLS 9/9 nouveaux. **Suite** : écrans d'édition coach des tables, sous-labels vue exécution nageur. **Précédent §351 — Échauffement intelligent (Blocs 1+2) piloté par les déficits de mobilité G/D**. Chantier (8) du backlog terrain. Chaque séance muscu (développement + amorce PAP) s'ouvre désormais par un **échauffement articulaire commun** (Bloc 1, table `warmup_common_routine` seedée) + une **mobilité corrective** (Bloc 2) générée à partir des déficits G/D du bilan (`effective=min(G,D)≤1` OU `|G−D|≥2`), plafond 2 exos + rotation déterministe des axes sur la semaine (aucun `Date.now`/`random`). Tags catalogue `dim_exercices.corrective_axes` + table `warmup_common_routine` (mig **00214**, MCP, RLS lecture authentifié/écriture coach-admin). Matérialisé à la génération (moteur pur, remplace le warmup générique §296/§318, hors `MAX_SESSION_ITEMS`). Marquage à l'aperçu (`SessionCard`) : sous-sections « Échauffement articulaire » / « Mobilité corrective » + pastille axe·côté faible. node:test 1501→1525, vitest 67, tsc 0, lint 0, build OK, RLS 9/9 nouveaux. **Suite §352** : écran d'édition de la routine commune + édition per-séance, sous-labels dans la vue exécution nageur (`warmupKind` persisté dans `raw_payload` mais pas encore threadé dans `StrengthSessionItem`), **Bloc 3** (activation musculaire des groupes sollicités). **Précédent §350 — Infra eslint : garde-fou `react-hooks/rules-of-hooks` en CI**. Dernier point ouvert de l'audit (§344) : aucun garde-fou auto contre #310 (a frappé 3×). Livré : eslint 9 flat config **minimal** (`eslint.config.js`, parser typescript-eslint sans type-aware + plugin react-hooks v5) — `rules-of-hooks: error` + `exhaustive-deps: warn` ; ignore stories/config/supabase ; script `npm run lint` ; **étape lint dans `pages.yml` avant le build** (un vrai #310 bloque le déploiement). Le lint a attrapé 4 vraies violations `useAuth` conditionnel (`Admin`/`Administratif`/`Comite`). ⚠️ **Leçon** : j'ai d'abord cru le garde `typeof window` mort et l'ai retiré → 5 tests node:test cassés (le `getState()` est load-bearing pour rendre la page en node:test SANS window) ; restauré + `eslint-disable` justifié (condition constante par environnement, pas un #310 réel). Vérif : lint **0 erreur** (42 warnings exhaustive-deps non bloquants) + preuve qu'un #310 injecté fait échouer le lint ; node:test 1501, tsc 0, build OK. **Audit flux mésocycle : 100 % traité + garde-fou #310 en place.** **Précédent §349 — Polish audit flux mésocycle : V7 + UX1/UX2/UX3**. Derniers findings mineurs de l'audit (cosmétique/a11y, sans logique). **V7** : `SessionDetailPreview` masque le badge de cycle legacy en mode plan (plus de « Force » rouge trompeur pour les phases méso). **UX1** : `RestSessionTab` centre de l'anneau = exercices FAITS `(currentStep−1)/total` (cohérent avec anneau+rail, plus « 2/5 » lu « 2 faits »). **UX2** : rail basé sur le total → ne sature plus à 100 % pendant le repos du dernier exo. **UX3** : minuteur de repos `RestScreen` a `role="timer"` + `aria-label` + `aria-live="off"`. tsc 0, node:test 1501, vitest 67, build OK ; aucune migration. **Audit flux mésocycle : tous les findings traités** (sauf lint `rules-of-hooks` = chantier infra eslint). **Précédent §348 — Bilan muscu : édition coach d'un ancien bilan (scores physiques G/D)**. Suite §347. Depuis l'historique, bouton « Éditer » (icône `Pencil`, `role="button"` car imbriqué dans le `<button>` de ligne, `stopPropagation`) sur les lignes notées → `BilanHistorySection.onEdit`. `StrengthAssessmentScreen` : état `editingAssessmentId` + `handleEditPast` (précharge `scoreStateFromNormalized(normalizePhysicalTests(...))`), effet de préremplissage **gardé** (`if editing return`), formulaire rendu quand `isScoring || editing` (branches start/done/questionnaire gardées `!isEditing`), bandeau « Édition du bilan du {date} » + Annuler, save vise `editingAssessmentId ?? assessment.id`, invalide `assessment-history`. Scope strict = scores physiques (pas questionnaire/KPIs). UI via `/frontend-design`. TDD (RED→GREEN) : `StrengthAssessmentScreen.edit.vitest.tsx` (édite old-1 → save sur old-1, right=0) + `BilanHistorySection.vitest.tsx` +2 (bouton présent/absent). tsc 0, node:test 1501, build OK ; aucune migration. **Précédent §347 — Bilan muscu : historique des bilans + courbe d'évolution G/D (Slice B)**. Demande terrain (6). Helper pur `mobilityEvolution.ts` (`buildMobilityEvolution` → série chrono `{date,left,right,effective}` par axe, réutilise `normalizePhysicalTests`, ignore bilans sans physical_tests). UI (`/frontend-design`) : `BilanHistorySection` (carte « Historique des bilans » = `listAssessments` → date + badge statut, ligne dépliable montrant le détail read-only des scores G/D + notes) + `MobilityEvolutionChart` (recharts, sélecteur d'axe + mode G&D/Gauche/Droite/Côté faible, ≥2 bilans), montés dans `StrengthAssessmentScreen`, query invalidée à create/submit. TDD (`mobilityEvolution` 3, vitest 4). tsc 0, node:test 1501, vitest 64, build OK. Évolution KPI hors scope (déjà via le Wrapped). **Chantier (6)+(7) clos** ; reste (8) [FUTUR] routines d'échauffement. Exécuté en subagent-driven. **Précédent §346 — Bilan muscu : mobilité gauche/droite + notes (Slice A : data + moteur + saisie)**. Demande terrain (7). Forme uniforme `{left,right,note?}` par axe dans le jsonb `physical_tests` (**aucune migration**) : types `MobilityAxisScore`/`AxisScoreRaw`, module pur `physicalTests.ts` (`normalizePhysicalTests` upcaste l'ancien number → `{left:n,right:n}`, `effectiveAxisScore=min`). Moteur (`scoreMobility`/`dysfunctionFlags`) consomme `min(G,D)` → asymétrie unilatérale = dysfonction (rétrocompat anciens bilans). UI (`/frontend-design`) : `AssessmentBilateralField` (2× ScaleField G|D + note repliable), `trunk_neck_alignment` unique, note de synthèse globale, préremplissage via normaliseur. Axes G/D : shoulder/t_spine/hip/scapula/hip_hinge. TDD (physicalTests 4, moteur +3, vitest 3). tsc 0, node:test 1498, vitest 60, build OK. Exécuté en subagent-driven. **Slice B (§347) à venir** : historique bilans + courbe d'évolution. **Précédent §345 — Retour terrain François : polish UI mésocycle + fix routing bilan coach**. 5 correctifs : (1) bandeau « Mon plan » condensé en 2 lignes avec bouton **Récap intégré** (hauteur ~−50 %) ; (2) overflow titres de séances (`MyPlanSessionSheet` → `truncate min-w-0`) ; (3) overflow date pivot coach (`input[type=date]` iOS → `min-w-0 max-w-full`) ; (4) presets de charge clarifiés (« Alléger / Standard / Augmenter » + effets) ; (5) **bug** « Refaire le bilan » coach → routait vers le questionnaire perso du coach (`/strength/questionnaire`, message nageur incohérent) → corrigé vers `/coach/strength-assessment/:athleteId`. tsc 0, node:test 1491, vitest 57, build OK. **Backlog terrain coach (à concevoir)** : (6) historique des bilans muscu + initier depuis la vue Bilan ; (7) mobilité G/D dissociée + notes (asymétries rotation thoracique/scapulaire — change le modèle de données) ; (8) [FUTUR] routines d'échauffement pilotées par déficits de mobilité (séance = articulaire commun → mobilité nageur → échauffement musculaire spécifique → séance principale). **Précédent §344 — Audit flux mésocycle, Lot 5 (filet anti-régression) — AUDIT CLÔTURÉ**. Verrouille les invariants de la synthèse. **A** smoke-test d'intégration du parcours (`mesocycleParcours.integration.test.ts`) : plan étiré (12 > Σnominal 10) + invariant E2 (`getCurrentMesocyclePhaseInfo.phaseKey == generated.weeks[i].cycle` à chaque semaine → un retour à `phaseAtWeek` = rouge) + invariant V5 (`mesocyclePosition` suit le plan). **B** garde `withTimeout` (`apiTimeoutGuards.test.ts`) : scan statique → les 6 fonctions critiques (apply/revert + 4 reads) restent bornées, aucune RPC apply/revert awaitée hors withTimeout. node:test 1480→1491 (+11), tsc 0, vitest 55, build OK ; aucun code prod modifié. **Non livré (documenté)** : lint `rules-of-hooks` (le dépôt n'a aucun eslint → chantier infra dédié recommandé en CI). Audit Lots 1-5 terminé ; restent V7/UX1-3 (polish mineur) + le lint hooks. **Précédent §343 — Audit flux mésocycle, Lot 4 (finitions moteur, runner & a11y)**. Batch de correctifs. **Moteur** : E1 (Majeur) `papPreferLegPower` périmé après le swap §327 → extrait en fonction pure `papPreferLegPowerFor`, calculée DANS `buildWeek` après le swap (plus d'exo `upper_power` superflu dans la PAP) ; E4 clamp `scorePsychology` [0,100] ; E3 doc des schémas génériques non appliqués (seul `restSeconds` clampé, §332). **Runner** : R5 arrondi durée restante aligné sur l'aperçu (`Math.round` au lieu de `Math.ceil`) ; R3 ressenti seul restauré au kill PWA ; R4 `startedAt` persisté → durée totale juste après reprise ; R6 dead code. **A11y/UX** : UX4 confettis gardés `prefers-reduced-motion` ; V9 message d'erreur swim-friendly ; V10 `aria-expanded`/label/focus sur l'expansion semaine. TDD `mesocycleEngine` +6. tsc 0, node:test 1480, vitest 55, build OK ; aucune migration. Différés (mineurs) : V7 badge reader, UX1/UX2 anneau/rail, UX3 aria-live ; reste Lot 5 (smoke e2e + lints). **Précédent §342 — Audit flux mésocycle, Lot 3 (guidage nageur : objectif · position · phases)**. Frictions UX « Mon plan » muscu. **V5** : nouveau bandeau « hero » `MyPlanMesocycleBanner` (objectif lisible via `formatEventGroupLabel`, « Semaine X/Y » + barre via `mesocyclePosition`, phase en cours, « Généré le … » = V8) — helpers purs `mesocycleProgress.ts`, props calculées dans `MyPlanTab` (#310-safe), s'appuie sur `start_week_monday` §341. **V6** : badges de phase = `shortPhaseLabel(phaseName)` (le vrai `week_type` : « Affûtage »/« Pic »… au lieu de la clé « TAPER » ; Maintien/Affûtage enfin distincts), masqué si pas de phase. **V3** : `detectPhase("")` → neutre (gris) au lieu de « force » rouge trompeur. UI via `frontend-design`. TDD : `mesocycleProgress` 10, `strengthPhaseStyles` 4, banner vitest 4. tsc 0, node:test 1474, vitest 55, build OK ; aucune migration. **Précédent §341 — Audit flux mésocycle, Lot 2 (source unique phase/semaine au pivot)**. Les 2 findings du maillon faible de l'ajustement mid-cycle. **E2** : `getCurrentMesocyclePhaseInfo` dérivait la phase d'un walk `nominal_weeks` (`phaseAtWeek`) qui diverge de `periodize` (étirement/compression) dès que `targetWeekCount ≠ Σ nominal` → reprise à la mauvaise phase ; fix = nouvelle fonction pure `cycleAtWeek(template, totalWeeks, idx)` qui rejoue `periodize` (source unique fidèle à la construction). **C3** : `MesocycleAdjust` approximait le lundi de départ via `getMonday(generated_at)` → dérive de fuseau (timestamp UTC tardif = mauvais jour local = `weeksRemaining` faux) ; fix = migration **00216** (colonne `start_week_monday` sur `strength_mesocycles`, RPC recréée pour la stocker, appliquée via MCP) + UI préférant la valeur stockée, fallback TZ-safe (strip horaire) pour les mésos antérieurs. TDD : `cycleAtWeek` +3, phase +1, `test:rls` strength-mesocycle 17→18 (+ persistance start_week_monday). tsc 0, node:test 1460, vitest 51, build OK. Lot 3 (guidage nageur « Semaine X/Y ») débloqué. **Précédent §340 — Audit flux mésocycle, Lot 1 (sécurité & robustesse rapides)**. Audit complet du flux méso (`docs/audits/2026-05-30-audit-flux-mesocycle.md`, 5 agents parallèles, 37 findings priorisés en 5 lots, 0 #310 actif, 0 corruption RPC). Lot 1 (effort S, validé François) : **C1** garde de rôle sur `MesocycleAdjust` (un nageur pouvait auto-ajuster son plan ; PAS d'escalade inter-athlète — RPC `00212:73` + RLS bloquent) ; **C4** synchro RadioGroup↔weekdays + avertissement ; **C2/C5** navigation retour mode-ajustement (helper pur `mesocyclePreviewBackTarget`) + purge payload sessionStorage ; **A1/A3** reads méso bornés `withTimeout(10s)` ; **R2** `update1RM` borné 8s ; **R1** garde anti double-tap `handleReferenceSet` ; **A2** toast description booléen→message. TDD : `MesocycleAdjust.vitest` 8→10, `MesocyclePreview.vitest` neuf. tsc 0, node:test 1456/1456, vitest 51/51, build OK ; aucune migration/RLS. Lots suivants à valider (Lot 2 = source unique phase/semaine + migration `start_date`). **Précédent §339 — Durée séance muscu : aperçu et écran inter-séries cohérents** (bug terrain François). Deux symptômes, une cause : `RestSessionTab` réinventait le calcul de durée au lieu de réutiliser `estimateStrengthSessionDurationSeconds` (§331). (A) aperçu ≠ inter-séries (modèles incompatibles : repos par item + exec vs repos global seul, sans temps d'exécution) ; (B) l'estimation inter-séries **explosait** mi-séance (≈15→90 min) car le repos de l'exo EN COURS était multiplié par les séries des AUTRES exos → non-monotone. Fix (TDD, décision coach « temps restant décroissant ») : nouvelle fonction pure `estimateRemainingStrengthSessionDurationSeconds(items, currentStep, currentSetIndex)` — même modèle que l'aperçu (60 s exec + repos PROPRE à chaque item), travail restant uniquement → `restant ≤ total`, décroissance monotone, jamais d'explosion ; props scalaires trompeuses `restSecondsPerSet`/`restSecondsPerExercise` **supprimées** (`RestSessionTab`/`RestScreen`/`WorkoutRunner`). `sessionDuration.test.ts` 9→16 (régression explicite symptôme B : warmup 30 s → gros exo 300 s DOIT faire baisser l'estimation). tsc 0, node:test vert, build 0 ; aucune migration/RLS. **Précédent §338 — Ajustement du mésocycle en cours (recalcul mid-cycle)** (brainstorming coach François, design `docs/plans/2026-05-28-mesocycle-adjust-design.md`). 3ᵉ levier coach (après édition séance-par-séance et régénération complète) : re-rouler les **semaines restantes** d'un méso actif sur retour terrain mid-cycle. Approche **B (re-roll engine partiel)** : `generateMesocycle()` avec `targetWeekCount` tronqué + nouveau `startPhase` + post-process facteurs vol/int, apply via la RPC existante (`apply_strength_mesocycle`, snapshot §308 + table rase §328 = **1 niveau d'undo gratuit, 0 code revert**). **Slice A (moteur, fonctions pures TDD)** : `phaseAtWeek(template, weekIndex0)` (cycle à un index de semaine, null hors plage) ; `applyAdjustmentFactors(plan, vol, int)` (multiplie `sets` clamp ≥1 et `intensityPct1rm` clamp [0,100] ; **laisse intact** pct null/0 = plio/BW ; throw sur facteur ≤0) ; `MesocycleInput.startPhase` + `periodize(template, target, startPhase?)` tronque les phases amont (`slice` à `findIndex`, bornes min/max recalculées sur le sous-ensemble, fallback défensif si phase absente) ; `generateMesocycle` câblé pour transmettre `startPhase` ; test d'intégration end-to-end (plan tronqué + facteurs appliqués + assertion delta ≠ pass-through). **Slice B (UI + branchement coach)** : helper pur `getCurrentMesocyclePhaseInfo({startMonday, totalWeeks, template, pivotMonday})` → `{weekIndex, weeksRemaining, phaseKey}` (parse UTC-stable, pivot mi-semaine retombe sur sa semaine) ; écran `MesocycleAdjust.tsx` (`/strength/mesocycle-adjust/:athleteId`, mode coach) — charge méso actif + signatures/profils + bilan + nom athlète, dérive stroke/distance d'`event_group`, **approxime le lundi de départ depuis `generated_at`** (start_date §307 non persisté = limite documentée), formulaire pivot (défaut lundi prochain) + séances/jours + 2 curseurs charge + 3 présets (Allègement 0.8/0.9, Standard 1/1, Surcharge 1.15/1.05) + bannières (pivot passé rouge / semaine en cours ambre / aucune semaine restante), **tous les hooks avant tout early return** (garde React #310 §316/§326) ; « Aperçu » écrit un payload étendu dans la clé sessionStorage **partagée** `eac_pending_mesocycle_params` et navigue vers `MesocyclePreview` (validation gardée `adjust===true`, `input.startPhase`, post-process facteurs, bandeau ambre ; **chemin génération inchangé** ; apply réutilise `params.startDate` = pivot) ; bouton « Ajuster le méso » (`CoachMesocyclePanel`, icône `SlidersHorizontal`) **gardé sur méso actif**. Exécuté en **subagent-driven-development** (implémenteur + revue spec + revue qualité par tâche). TDD : `mesocycleEngine.test.ts` 75→80, **+33 tests neufs** (phaseAtWeek 9, factors 9, phase-info 5, intégration 2, vitest UI 8) ; **tsc 0, node:test full suite verte (1433), vitest verte (32), `npm run build` OK** ; aucune migration, aucune RLS touchée (RPC réutilisée → 17/17 intacts). Limites documentées : lundi de départ approximé, phase au pivot basée sur `nominal_weeks` (peut décaler d'une phase pour un plan étiré), clé sessionStorage partagée (relecture périmée non-destructive), hors scope = multi-undo / substitution exo en masse / édits multi-coachs. **Précédent §337 — Robustesse + observabilité de la fiche nageur (crash PWA mésocycle)** : le tap sur une ligne « Mésocycles muscu actifs » → fiche nageur (onglet Planning) crashait la PWA (« Une erreur est survenue »), bug récurrent depuis §326/§330. Audit complet (hooks + données prod des 4 nageurs) : ordre des hooks correct partout, `sex` normalisé `M/F`, données méso bien formées → **aucun throw déterministe en lecture statique**. Cause systémique : `ErrorBoundary.componentDidCatch` ne loguait **qu'en DEV** → crash prod muet (d'où la récurrence non diagnosticable), et un throw détruit tout le `<Switch>`. Livré : (1) `ErrorBoundary` enrichi — variante `inline` (confine sans détruire le shell), `resetKeys` (auto-reset au changement de nageur), **log prod+dev** avec `context` ; (2) `CoachSwimmerDetail` + `CoachMesocyclePanel` enveloppés en boundary inline récupérable ; (3) durcissement `rankKpis` (`getBareme` runtime-undefined → garde `anchors`/`Number.isFinite`). node:test 1419, vitest 38, tsc 0, build 0, pas de `test:rls`. **Honnêteté** : throw prod exact non confirmé (console PWA non capturée) ; ce patch CONFINE + logue → la prochaine occurrence laissera `[EAC ErrorBoundary] […]` + stack à transmettre pour pin-pointer. **Précédent §336 — Récap muscu « Wrapped » (stories plein écran, nageur + coach)** : bouton discret en haut à droite de « Mon plan » muscu → récap façon *Spotify Wrapped* (pages plein écran, défilement tap/timer). Slides : objectif du plan, forces & axes (KPI du bilan **sans valeurs brutes**, situés vs population par bande de percentile), top 3 progressions des 90 j (Δ% 1RM estimé), tonnage & stats fun. Le coach/admin peut le lancer depuis `CoachSwimmerFullView`. **Zéro migration / endpoint / table** — module pur `wrappedStats.ts` (`node:test`) + hook `useStrengthWrapped` (les 2 requêtes lourdes `getStrengthHistory`/`getExercises` gatées derrière l'ouverture du récap, `staleTime` aligné voisins) + overlay `StrengthWrappedRecap` (moteur de stories : barres de progression, autoplay 6 s, tap/hold/swipe, reduced-motion, focus a11y ; UI via skill `frontend-design`). Confidentialité : aucune valeur brute KPI/poids athlète côté nageur (`body-weight-coach-only`). node:test 1418, vitest 34, tsc 0, build 0, **pas de `test:rls`**. Mergé sur `main` (demande coach « commit et push sur main »). **Précédent §335 — Garantie « minimum haut du corps » quand le focus monopolise un segment** (terrain François, 100 m brasse Samuel id 16) : méso généré 100 % jambes (`forced_focus` §323 = 2 seaux jambes) → `ensureMaintienRepresentation` (`buildWeek`, jour-aware) injecte le top seau maintien en complément d'une séance de dév redondante si absent de toute la semaine (symétrique §324/§325/§329) ; node:test 1403, plan actif de Samuel patché SQL (complément trap bar→tractions lestées). **Précédent §334 — Trigger d'inscription persiste enfin le sexe + débloque méso Ines** (terrain François). Demande coach : générer 5 sem 50 m crawl à Ines (user_id 18). Génération bloquée par `ProfileIncompleteScreen` (`MesocyclePreview.tsx:393/:507`) — le moteur exige `profile.sex ∈ {'M','F'}` (barèmes KPI sexués `kpiBaremes.ts`). Cause racine : `handle_new_auth_user` ne lisait pas `sex` du `raw_user_meta_data` alors que `Login.tsx:43` le requiert et l'envoie ; tout nouveau compte landait `sex=NULL` (4 coachs encore NULL, non bloquant — pas de bilan). Fix : mig **00215** ajoute extraction défensive (domaine `{'M','F'}`, sinon NULL → gate se déclenche proprement plutôt que corrompre le lookup de barème). Data : Ines `sex='F'`, `body_weight=80` (estimation coach validée AskUserQuestion). Audit codebase : `body_weight` jamais athlete-facing (uniquement `src/lib/api/types.ts` + `src/lib/api/users.ts`) → règle déjà respectée structurellement, mémoire `body-weight-coach-only.md` posée. Bilan KPI Ines (F / 17-18) transmis coach : vertical_jump 61.4 W/kg ≫p90 / broad_jump 185 cm ≫p90 / IMTP 160 kg ≫p90 / weighted_pullup **0 kg ≈p30** / medball 16.25 kg·m ≫p90 → profil force-puissance d'élite, **tirage haut du corps = levier #1** pour 50 m crawl (template `sprint_50/inter_competition` ✓, focus §323 `[upper_strength, upper_power]`). Pas de code TS modifié (trigger SQL pure) → pas de `npm test`/`test:rls` requis. **Précédent §333 — Mode coach secondaire : plus de détail sur l'état de forme des nageurs** (demande François). En mode coach secondaire (`CoachSwimmerQuickView`, nageur hors prise en charge), la section « Forme » se résumait à `SwimmerFormBadge`, qui avait un **bug d'échelle** : il traitait `readiness_score` comme /10 alors qu'il est stocké 0-100 partout (ReadinessGauge/WellnessBanner `%`, bandes WellnessTrend 70/40) → libellé toujours « Bonne », texte « Bonne — 70.0/10 », sparkline surdimensionnée/toujours verte. Fix : bandes alignées (>70 Bonne / 40-70 Moyenne / <40 Basse), affichage `%`, sparkline remise à l'échelle 0-100. Ajout (demande) : grille des **5 sous-métriques** moyennées 7j (Sommeil/Fatigue/Courbatures/Humeur/Stress, /5, colorées bon↔mauvais, libellés & icônes alignés `WellnessForm`), heures de sommeil moyennes, dernière note bien-être. `SwimmerFormBadge` importé uniquement par le QuickView → portée = mode coach secondaire. tsc 0, `npm test` 1401+24, build 0 ; pas de migration/RLS (UI + lecture). **Précédent §332 — Cohérence de durée des séances muscu** (vérification François, plan `butterfly_50`). Audit de durée (suite §331) : séances de développement à 77-81 min (amorces OK à 26-27). Deux causes corrigées. **(1) Bug latent moteur** — `toMesocycleExercise` Règle 3 (cycles dérivés `puissance`/`maintien`/`affutage`/`pic`) ne lisait que `scheme.intention` de `periodizationCycles.ts` ; le repos catalogue (330 s tractions) était propagé tel quel **même en semaine pic/affûtage** (config validée coach = 120-180 s). Fix (décision AskUserQuestion = repos seulement) : nouveau helper `clampToRange` borne `baseRest` dans `scheme.restSeconds` ; séries/reps/intensité inchangés ; `force_max` (Règle 2 `catalogue`) non concerné ; amorce PAP immunisée (repos codés en dur). **(2) Valeurs catalogue** (mig **00214**, MCP, prod vérifiée) : tractions #13 + trap bar #7 `recup_series_force` 330→**210 s** ; médecine-ball #53 `nb_series_force` 6→**4**. Effet (à la prochaine régénération) : construction ~77→60 min, pic/affûtage ~37→31 min, amorces inchangées. ⚠️ Plans déjà matérialisés inchangés → régénérer pour en bénéficier. TDD `mesocycleEngine.test.ts` (RED→GREEN) ; `npm test` 1401+24, tsc 0, build 0 ; pas de `test:rls` (data pure). **Précédent §331 — Durée estimée d'une séance muscu affichée dans le preview** (demande François). Aucun calcul de durée n'existait côté muscu (la natation a une `estimated_duration` saisie coach ; la muscu n'avait ni colonne DB, ni calcul, ni affichage). Modèle validé (AskUserQuestion) : par exercice `sets × (60s exec + repos)` — **1 repos par série** (couvre la transition inter-exo), **tous les items comptent** (échauffement/mobilité inclus), `repos` = `rest_seconds` (= repos entre séries `rest_series_s`) ; garde-fous `sets`≤0/non-fini → 0, `rest_seconds` invalide → 0. Nouveau helper pur `src/lib/strength/sessionDuration.ts` (`estimateStrengthSessionDurationSeconds` + `formatApproxMinutes` « ~X min » arrondi/plancher 1 min + `EXEC_SECONDS_PER_SET=60`) + **badge dédié** `⏱ ~X min` dans `SessionDetailPreview` (header, rendu si > 0, réutilise la pastille du design system) → visible aux deux sites du composant (bibliothèque catalogue + Mon plan). TDD `sessionDuration.test.ts` (9 tests : N-repos, somme multi-exos, repos absent, vide, sets nul/négatif/NaN, repos invalide, warmup inclus, format). tsc 0, `npm test` node:test fail 0 + vitest 24, build 0. Pas de migration/RLS. **Précédent §330 — Auto-réparation du cache PWA sur échec de chargement de chunk** (retour terrain François : crash PWA après confirmation d'un mésocycle). L'apply réussit (plan §329 matérialisé en base), `CoachSwimmerFullView` (destination post-apply) est sain + lazy-loadé → profil typique d'un cache PWA périmé servant d'anciens chunks hashés (échec `import()` dynamique). `lazyWithRetry` rechargeait une fois MAIS sans purger le cache du SW → reload re-sert les mêmes chunks périmés → 2ᵉ échec → crash. Fix : `lazyWithRetry` **vide les caches** (`caches.delete`) AVANT `location.reload()` (même geste que `applyUpdate` main.tsx) → re-fetch réseau de chunks frais ; garde-fou anti-boucle `sessionStorage.chunk_reload` inchangé. S'applique à toutes les routes lazy → fin des crashes post-déploiement sur PWA périmé. Régression vitest `lazyWithRetry.vitest.tsx` (2 tests : purge+reload au 1ᵉʳ échec, pas de boucle au 2ᵉ). tsc 0, vitest 24, build 0. **Honnêteté** : correctif = hypothèse la + probable (cache lazy périmé), non confirmé par l'erreur exacte (PWA, console non capturée) ; si ça persiste sur version fraîche vérifiée → bug de rendu spécifique, besoin du texte console. **Précédent §329 — L'amorce porte un exo jambes PAP (box jump lundi / trap bar squat jeudi)** (retour terrain François, papillon 50). Une nage upper-dominante a une amorce 100 % haut-du-corps → ni box jump ni trap bar dans tout le plan. Coach : ajouter ces staples jambes aux jours d'amorce, en plus de l'activation SNC (set de travail réel sur jour de décharge assumé). Fix : `buildWeek` calcule le rang d'amorce et passe un `papLegBucket` alterné (`lower_power`/box jump le 1ᵉʳ jour d'amorce, `lower_strength`/trap bar le 2ᵉ) ; `buildPapSession` ajoute l'exo jambes (PAP explosif/lourd), **dédupliqué** (nage jambes-dominante comme la brasse, ou `lower_power` déjà posé par §325 → aucun ajout). Mig **00213** : `selection_priority` du trap bar squat (id 7) → 100 (staple `lower_strength`, pair de Box Jump). TDD `mesocycleEngine.test.ts` (amorce lundi inclut `lower_power`, jeudi `lower_strength`) RED→GREEN, suite moteur 72/72 ; `npm test` 1391+22, tsc 0, build 0. Migration data (pas de RLS) → pas de `test:rls`. **Précédent §328 — Table rase à la régénération d'un plan** (retour terrain François, admin). En régénérant, la semaine en cours mélangeait ancien + nouveau plan : le lundi pré-départ de l'ANCIEN plan (mésocycle superseded, template fantôme) survivait à côté des jours du nouveau. Cause : §308 préservait délibérément les jours pré-départ (« déjà entraînés ») — déroutant pour le workflow coach (régénérations fréquentes). Décision coach : table rase. Fix : `apply_strength_mesocycle` (mig **00212**) — le `DELETE` des slot_overrides perd la garde `>= date de départ` → purge TOUTE la fenêtre du plan ; snapshot (pris AVANT) intact → revert OK ; jours pré-départ non ré-écrits = vides. Schema RLS hand-crafted répliqué ; test §308 mid-week réécrit (« table rase », `daysOf == [3]`) ; `test:rls` strength-mesocycle-rpc **17/17** (2 suites pace en échec pré-existant). Nettoyage one-off du créneau lundi fantôme de François en base. tsc 0. **Précédent §327 — Le seau focus#1 forcé décroche un bloc de DÉVELOPPEMENT (tirage poulie papillon)** (retour terrain François — papillon 50, suite §326-C). Le tirage poulie « schéma papillon » (`upper_strength`, staple §319) n'apparaissait dans aucune séance : `forced_focus`=[upper_strength, upper_power] donnait 2 créneaux primaires à `upper_strength` mais ils tombaient tous deux sur les jours d'amorce PAP (Lun/Jeu) → rendus en duo lourd+explosif, jamais le bloc force 2 exos ; en dév, `upper_strength` n'était que complément (1 exo, tractions=100 bat tirage=90). Fix : `ensureFocusDevelopmentSession` (dans `buildWeek`, jour-aware) échange un créneau focus#1 d'un jour d'amorce avec un créneau dév d'un seau non-focus → une séance de dév prend `upper_strength` en primaire (tractions lestées + tirage poulie). L'échange réassigne les créneaux aux jours (ensemble conservé) → invariants §324/§325 préservés. TDD `mesocycleEngine.test.ts` (RED→GREEN, suite moteur 71/71) ; `npm test` 1390+22, tsc 0, build 0. **Précédent §326 — Confirmation planif : fix crash React #310 + suppression des notifs broadcast** (retour terrain François). Deux bugs à la confirmation d'un mésocycle côté coach : **(A)** écran « Une erreur est survenue ». L'apply réussit (plan matérialisé) mais `finishApplied` navigue vers `/coach/swimmer/:id` et `CoachSwimmerFullView` crashait — `useMemo(breadcrumbSegments)` était APRÈS le `return` anticipé `if (!athleteId)` → la bascule athleteId falsy→truthy de la navigation post-apply ajoute un hook → React #310 (même classe que §316). Fix : hoist du `useMemo` au-dessus du return + régression vitest `CoachSwimmerFullView.vitest.tsx` (RED→GREEN, guard validé via ErrorBoundary). **(B)** Tous les nageurs du groupe recevaient une notif « nouveau mésocycle » (la RPC `apply_strength_mesocycle` ciblait `notification_targets.target_group_id`). Décision coach : supprimer ces notifs. Mig **00211** recrée la RPC à l'identique **sans le bloc notification** (autorisation/matérialisation/§308 intacts, vérifié en base) ; `MesocyclePreview` sans mention « notifié ». `npm test` 1389+22, tsc 0, build 0. **Différé (concurrence)** : tirage poulie papillon absent (`upper_strength` jamais en bloc dév 2 exos) → fix « garantir 1 séance dév haut-force » à faire dans `mesocycleEngine.ts` après §325. **Précédent §325 — Amorce PAP event-aware : jambes jamais à zéro** (retour terrain — régénération 100 dos de Victoria : « il n'y a plus rien sur les jambes »). Cause reproduite : défaut 3 séances = **[Lun, Mar, Jeu]** → `isPrimerWeekday = {Lun, Jeu}` → 2 amorces/3, et le seul créneau jambes (Jeu) converti en amorce **haut-du-corps** → zéro jambes. Fix : (1) `generateMesocycle` détecte si aucun seau jambes n'est couvert par une séance de **développement** ; si oui, `buildPapSession` bascule son **explosif** sur `lower_power` (saut) au lieu de répéter la puissance haute (potentiateur reste haut) ; (2) défaut 3 séances **[0,1,3]→[0,2,4]** (Lun unique amorce, Mer+Ven dev). TDD `mesocycleEngine.test.ts` (weekdays [0,1,3] → amorce porte un explosif `lower_power`) RED→GREEN ; `npm test` 1389+21, tsc 0. **Précédent §324 — Pas de seau entraînable « fantôme »** (retour terrain — audit bilan + méso 100 dos de Victoria Schnepf, F, advanced/national). Le plan généré n'incluait `lower_power` (puissance jambes / ondulation sous-marine, arme du dos sprint) dans **aucune** séance bien qu'alloué : avec `forced_focus` = {upper_strength, upper_power} (§323) + 3 séances/sem, 4 seaux non-mobilité se disputent 3 créneaux primaires → 1 maintien orphelin, et son complément ré-utilisait un focus déjà couvert → disparition du plan. Fix `distributeSessionSlots` : l'orphelin entraînable sort en **complément** d'une séance à primaire maintien (sibling anatomique d'abord → jour jambes = force bas + puissance bas / Box Jump), **0 volume ajouté** (créneau complément, respecte le plafond `MAX_SESSION_ITEMS = 5` §318) ; séances focus inchangées. TDD `mesocycleEngine.test.ts` (invariant « tout seau entraînable alloué apparaît dans ≥1 séance ») RED→GREEN ; `npm test` 1388+21, tsc 0. Suite : régénérer le plan de Victoria (focus stroke-aware §323 + dose `lower_power`). **Précédent §323 — Focus événement forcé STROKE-AWARE (par nage)** (validation coach « ok aussi pour forced focus pr nage », suite §322). Le `forced_focus` du §322 vivait sur le profil de **distance** (stroke-agnostique) → `["upper_power"]` au 50 m s'appliquait aussi à la **brasse 50** (jambes-dominante) ; et un seul seau forcé ne garantissait pas les **tractions lestées** (`upper_strength`, pilier du 50 m McEvoy). Fix : `StrokeSignature.forcedFocus` (par nage) ; `composeTemplate` l'applique aux sprints (`SPRINT_DISTANCE_KEYS = {50, 100}`), l'ordre du tableau fixant primaire (2 exos) vs complément (1) ; `getStrokeSignatures` mappe la nouvelle colonne. Seeds doctrine (mig **00210**) : crawl/papillon/dos `["upper_strength","upper_power"]` (tractions lestées primaire + bench pull explosif), brasse `["lower_strength","lower_power"]`, 4 nages `["upper_power","lower_power"]` ; retire le `forced_focus` per-distance §322 (single-source). TDD ; `npm test` 1387+21, tsc 0, build 0. **Précédent §322 — Focus événement forcé pour les sprints** (retour terrain François). La priorisation `emphasis × (100 − score)` entraîne le point FAIBLE → pour un sprinteur déjà puissant, la puissance explosive (que l'épreuve demande) n'était pas forcément travaillée. Fix : `PeriodizationStructure.forced_focus` (dans le `structure` jsonb), `prioritizeBuckets` remonte ces seaux en focus malgré le score (après l'override mobilité sécurité), `composeTemplate` le propage ; seedé `["upper_power"]` sur 50/100 (mig **00209**). La puissance explosive est désormais garantie sur un sprint quel que soit le niveau. Limite : `forced_focus` par distance (stroke-agnostic) — une version par nage×distance serait plus fine (brasse 50 jambes-dominante). TDD ; `npm test` 1386+21, tsc 0, build 0. **Précédent §321 — Fix inscription : sélecteur de groupe bloqué (RLS anon sur `groups`)** (autre terminal) : `getGroups()` lit `groups` en rôle anon avant login, mais la mig `00126` avait re-scopé `groups_select` en `TO authenticated` → 0 ligne → sélecteur grisé ; mig **00208** rouvre le SELECT à `anon` (écritures inchangées). **Précédent §320 — Édition UI de `selection_priority` au catalogue coach**. La priorité de sélection (§319) était seedée par migration → désormais éditable dans l'app : nouveau composant `ExercisePrioritySelector` (saisie numérique + paliers Prioritaire/Préféré/Normal/À éviter + pastilles rapides, via `/frontend-design`) câblé dans les dialogs édition/création du catalogue. `Exercise.selection_priority` threadé dans les mappers read (`normalizeExercise`/`mapDbExerciseToApi`) + write (`mapApiExerciseToDb`) — catch data-safety : sans la LECTURE, éditer un exo écraserait la priorité seedée à 0. Pas de migration (colonne déjà en §319). TDD mappers ; `npm test` 1384+21, tsc 0, build 0. **Précédent §319 — Préférence de sélection d'exercices** (retour terrain François). L'engine servait des exos exotiques/arbitraires (Front Lever au lieu de tractions lestées, gainage lesté au lieu de roue abdos, Trap Bar au lieu de Box Jump) car `selectExercises` triait `is_core → niveau décroissant → ordre catalogue`, sans notion d'« exo préféré coach ». Fix : colonne `selection_priority` (coach-pilotable, défaut 0, triée EN PREMIER ; rétrocompat), seedée staples sprint façon McEvoy — tractions lestées/box jump/roue abdos = 100, pull-over fly/relevé jambes = 90, Front Lever + variantes/gainage lesté = -10 (mig **00207**). TDD ; `npm test` 1379+21, tsc 0, build 0. **Précédent §318 — 50 m crawl plus fidèle à McEvoy** (retour terrain François). 3 correctifs validés coach : **(#1)** `Soulevé de terre trap bar` re-tagué `lower_power → lower_strength` (mig **00206**) — supprime la répétition trap-bar (puissance vs force séparées) ; **(#3)** `upper_power` du profil 50 m 0.50 → **0.95** (réf McEvoy : « le 50 m est une épreuve de puissance quasi pure, la traction explosive domine ») → la puissance haute explosive redevient focus ; **(#2)** plafond séance **5 exos** (`MAX_SESSION_ITEMS`, warmup dimensionné dynamiquement) → le bloc core §313 n'ajoute plus un 6ᵉ exo. tsc 0, 1378+21 tests, build 0. **Précédent §317 — Fix 409 sync nageurs records** : `syncClubRecordSwimmersFromUsers()` INSERTait sans vérifier l'unicité de l'IUF → 409 au chargement de RecordsAdmin quand un nageur manuel (non fusionné) avait le même IUF. Fix : requête étendue + guard `occupiedIufs`. **§316 — Fix React #310 `StrengthAssessmentScreen`** : hoist `useBilanSteps` avant les `return` anticipés + test de régression vitest. tsc 0, 1378+21 tests. **Précédent §314-§315 — Bilan muscu hors-ligne (#3) COMPLET**. Réseau salle instable/coupé → les écritures du bilan (Supabase-only) bloquaient le coach au bord du bassin. Branché sur la file offline générique (localStorage + replay) : **§314 Slice A** questionnaire (composé pain+questionnaire) + bilan physique (UPDATE idempotents) ; **§315 Slice B** KPIs — `recordKpiMeasurement` append-only rendu idempotent par une **clé de dédup** (`client_dedup_key` + index unique, mig **00205**) + UPSERT `ON CONFLICT`, clé stable par KPI dans le `KpiWizard` (retry/replay safe), KPIs en file = `queued` (≠ échec). Le coach mesure tout le bilan hors-ligne → replay idempotent à la reconnexion. `npm test` 1378+20, tsc 0, build 0. **Précédent §313 — Seau tronc/core (R5) livré + déployé** : 6ᵉ seau entraînable `core` (ondulation/rotation/gainage/streamline), composé comme les autres (papillon ×1.40 = max, dos ×1.25, 4N ×1.30, brasse ×0.85 ; distances 0.45→0.70). **Non scoré (option a)** — traité comme la mobilité (socle permanent, hors priorisation) pour éviter la sur-priorisation d'un seau sans KPI. 12 exos re-taggés `→ core`, migrations **00203/00204** (appliquées MCP, prod vérifiée). Valeurs validées coach. `npm test` 1377+20, tsc 0, build 0. **Précédent §312 — Garde double-apply (#5)** : helper `applyLikelySucceededDespiteError` + `MesocyclePreview` re-lit le méso actif sur erreur réseau (retry-safe après timeout) ; #7 revu sans changement. **Précédent §311 — Audit robustesse/perf/élite + 3 correctifs**. Audit transversal lecture-seule (`docs/audits/2026-05-26-audit-robustesse-perf-elite-edition.md`) : élite largement fermée (R1/R2/R3/R6 ont landé, vérifié en base) ; 4 fragilités restantes. 3 correctifs validés coach : **(#1)** `withTimeout` sur `applyMesocycle` (30 s) / `revertMesocycle` (15 s) — fin du spinner infini sur connexion coupée (invariant §298), 2 tests TDD ; **(#2)** garde-fou §308 — bannière ambre « Remplace le plan en cours » sur l'aperçu quand un mésocycle actif existe (l'écrasement des édits coach à partir de la date de départ était silencieux) ; **(#4)** profil de distance `fond` ≥800 m (demi-fond `{LS .75, LP .40, US 1.0, UP .45, MOB 1.0}`, sans bloc puissance, mig **00202**) — le 1500 ne reçoit plus le profil 400 m. `npm test` 1365+20, tsc 0, build 0. Différés : file offline bilan (#3), seau core (R5), garde double-apply (#5). **Précédent §A (§310) — Flux bilan coach unifié** : `nextBilanStep()` + `useBilanSteps` hook DRY + bouton "Continuer →" à chaque étape (Questionnaire → KPIs → Physique → Génération) + CTA "Démarrer/Reprendre" depuis la page nageur (reprise automatique) + illustrations ROM animées (arc SVG `stroke-dashoffset` par axe, couleurs score-aware). 1362+20 tests, tsc 0, build 0. **Précédent §309 — KPI `medball_vertical_throw` fiabilisé**. L'ancien test (allongé, ballon 10 kg, hauteur estimée à l'œil, barème `placeholder`) est remplacé par un **lancer médecine-ball assis pour la distance** (Seated MB Throw, normé ICC>0,9), scoré sur un **indice masse × distance** (kg·m, ∝ énergie au lâcher) qui laisse **choisir la masse du ballon** tout en gardant une échelle unique. Barème **`transposed`** (normes scolaires 2 kg sexe × âge), confiance affichée à l'aperçu améliorée. Nouveau `medballPower.ts` (TDD) + `MedballThrowInputs.tsx` (via `/frontend-design`, style aligné `VerticalJumpInputs`) + branche wizard ; masse stockée dans `attempts` jsonb (pas de migration). `npm test` 1357+20, tsc 0, build 0. **Précédent §308** — remplacement propre d'un plan mésocycle en cours (la RPC `apply` purge les slot/week overrides à partir de la date de départ avant matérialisation → plus de séances orphelines ; mig **00201**, harness RLS + 4 tests). **Précédent §307 Phase 4** — UI jour-aware (picker jours + date de départ, aperçu badges rôle). Différé : badges `MyPlanTab` (Task 4.3).*

*Précédente : 2026-05-25 — **Audit matrice R3 + R6 (recalibration dos + 100 m)**. Migration `00199` (MCP, `jsonb_set`) : **R3** signature backstroke `lower_strength` ×0.857→×0.95 (coup de pied dauphin au mur + départs ; ⚠️ override d'une valeur seedée historiquement → à valider coach) ; **R6** profil 100 m `upper_power` 0.60→0.65 (2 kinds, nudge optionnel — 100 m déjà ✅). Effet composé : dos `lower_strength` 50 .73→.81 / 100 .70→.78 / 200 .60→.67 / 400+ .69→.76 ; `upper_power` 100 m crawl .60→.65, papillon .81→.88, dos .68→.73, brasse .45→.49, 4n .60→.65. Pas un § (data) ; pas de tests/RLS ; réversible. **Restes audit : R4 (profil fond 800/1500 distinct), R5 (seau tronc/core).***

*Précédente : 2026-05-25 — **§306 COMPLET — préhab ciblée par nage (Phase 1 défensif + Phase 2 proactif event-aware)**. Reco R2 de l'audit matrice (seul écart 🔴). **Phase 2** (suite) : couche proactive « élite » — préférer les exos préhab spécifiques à la nage. Livré : migration `00198` (colonne `dim_exercices.stroke_prehab_affinity text[]`, V1 brasse→adducteurs 58/37/33, MCP) ; `CatalogExercise.strokePrehabAffinity` + mapping `strength-catalog.ts` ; `selectExercises(…, strokeKey?)` — passe de préférence qui remonte les exos à affinité-nage au-dessus des non-cores ordinaires **sans déloger un core de force** ; `deriveStrokeKey(event_group)` (`breaststroke_100`→`breaststroke`, legacy→null/inactif) câblé dans `generateMesocycle`. Tests : +1 cas affinité ; `npm test` 1343 node:test + 20 vitest verts, tsc 0, pas de `test:rls`. **Limite** : préférence (remontée dans le pool), pas garantie d'entrée dans le bloc primaire de 2 exos (slot préhab dédié = hors périmètre). Affinité = choix coach (extensible coiffe/épaule). **Restes audit hors §306** : R3 dos `lower_strength`, R4 profil fond, R5 seau tronc/core, R6 nudge `upper_power` 100 m.*

*Précédente : 2026-05-25 — **§306 Phase 1 livrée — préhab ciblée par nage (défensif : zone aine déclarable)**. Reco R2 de l'audit matrice (seul écart 🔴). Design `docs/plans/2026-05-25-muscu-306-prehab-ciblee-nage-design.md`, plan `docs/plans/2026-05-25-muscu-306-prehab-ciblee-nage.md`. Livré (données + UI, **zéro logique moteur** — l'override douleur et le filtre contre-indication sont déjà génériques) : (1) `zones.ts` label `left_groin`/`right_groin` (« aine G/D ») ; (2) `BodySvg.tsx` +2 marqueurs body-map (intérieur de cuisse, rendu identique aux zones existantes → propagé à BodyHeatMap/PainHistoryMap/AssessmentContext) ; (3) migration `00197` (MCP) — contre-indication `left_groin`/`right_groin` sur 6 exos adducteurs (Copenhague, Fente latérale, Squat bulgare, RDL unilat., Fente sautée, départ ceinture), append gardé idempotent, vérifiée SELECT. Effet : douleur aine → ces exos exclus + override mobilité si intense → le brasseur (emphasis jambes max) n'est plus chargé sur une aine blessée. Tests : nouveau `zones.test.ts` + garde-fou `mesocycleEngine.test.ts` ; `npm test` 1342 node:test + 20 vitest verts, tsc 0, pas de `test:rls`. **Phase 2 (préhab proactif event-aware : colonne `stroke_prehab_affinity` + passe de préférence dans `selectExercises`) à suivre.** Liste d'exos = choix coach (à valider, réversible).*

*Précédente : 2026-05-25 — **Audit matrice complète muscu (§305) + R1 papillon appliqué**. Audit `docs/audits/2026-05-25-audit-muscu-matrice-complete-vs-elite.md` : cohérence de toute la matrice sexe × distance × nage + modulation (douleurs/KPI) vs élite mondiale. **Calibration vérifiée par SQL** (signatures × profil 200 m reproduisent au bit près les anciens templates dos/brasse/4n ; crawl → sprint_50/200m/400m). **Cibles de-novo : 100 m ✅ validé** (interpolation 50↔200 cohérente, arc sain) ; **papillon 🟠 sous-pondéré** (`upper_power` ×1.05, `mobility` ×1.15 trop bas). Findings : 🔴 brasse douleur adducteurs/aine non déclarable (→ §306) ; 🟠 fond 800/1500 servi en profil 400 m ; 🟠 dos `lower_strength` ×0.857 non étayé ; 🟠 pas de seau tronc/core ; ✅ sexe correct (emphasis non sexuée, seuls barèmes KPI le sont) ; modulation douleurs/KPI saine. **R1 appliqué** (mig `00196`, MCP) : signature papillon `upper_power` ×1.05→1.35 + `mobility` ×1.15→1.35 (effet immédiat sans déploiement, à valider coach, réversible). Pas un § (recalibration 1-ligne) — §306 reste réservé à la préhab ciblée par nage. Restes : R2 zone aine, R3 dos, R4 profil fond, R5 seau tronc, R6 nudge `upper_power` 100 m.*

*Précédente : 2026-05-25 — §305 livré — **Taxonomie nage × distance** (reports §304 : taxonomie nage × distance manquante, template `sprint_100` absent, papillon non couvert). Design `docs/plans/2026-05-25-muscu-305-taxonomie-nage-distance-design.md`, plan `docs/plans/2026-05-25-muscu-305-taxonomie-nage-distance.md`. Livré : (1) `composeTemplate.ts` (TS pur, TDD `node:test` 8 cas) — `bucket_emphasis[b] = clamp01(round2(distance.emphasis[b] × stroke.mult[b]))`, reproduit par construction les 7 emphases existantes (6 reproductions ±0.01) ; (2) 2 tables de référence sous RLS read-all / write coach-admin (calquées sur 00166) : `strength_stroke_signatures` (mig `00193`, 5 nages dont **papillon nouveau** ; mult vs crawl, crawl = réf 1.0) + `strength_distance_profiles` (mig `00194`, 8 lignes = 4 distances 50/100/200/400plus × 2 kinds ; emphasis ancrée crawl + arc + bornes ; 200 m = réf, 400plus reprend 400 m) ; (3) `strength_mesocycles.template_id` rendu nullable (mig `00195`) — l'event_group composé (`freestyle_100`) porte la taxonomie ; (4) API `getStrokeSignatures`/`getDistanceProfiles`, `applyMesocycle` envoie `p_template_id: null` (RPC inchangée) ; (5) UI génération 2 étapes **Nage → Épreuve** (distances filtrées : 50/100/200 toutes nages, 400+ crawl/4n only), aperçu **compose** le template au lieu de fetch un template unique + état d'erreur récupérable si combo introuvable ; (6) cleanup : 3 tests vitest inertes portés en `node:test` (dont `strengthProfileMismatch.test.ts` de §304) → assertions enfin exécutées, suite 983 → **1025**. 1025/1025 npm test, tsc clean, pas de `test:rls` (tables read-only calquées sur 00166, RPC inchangée → aucune autorisation modifiée). **Simplification vs design (YAGNI)** : PAS de colonnes `stroke`/`distance` ni réécriture RPC — seul `template_id` devient nullable. Limites : **100 m et papillon = barèmes de-novo, À VALIDER PAR LE COACH avant déploiement (TENU)** ; préhab ciblée par nage → §306. **Mergé sur `main` + déployé le 2026-05-25** ; 100 m & papillon à valider via l'audit de cohérence matrice complète sexe × distance × nage (à venir).*

*Précédente : Chore **Unification du runner de tests** (2026-05-25) — 35 fichiers `*.test.ts(x)` importaient `vitest` → inertes sous `node --test` (faux vert). Livré : 31 portés `node:test`, 4 → `*.vitest.ts` (jsdom via `vitest.config.unit.ts`), `npm test` enchaîne les 2 runners, garde-fou `pretest` (`scripts/check-test-runner.mjs`). node:test 980→1324 (+344 assertions réactivées), vitest 4/20, tsc 0. Tests périmés corrigés sans toucher au code produit (`export-pace-pdf` v1→v2 §186, `useSlotCalendar` §95b) — aucun bug produit révélé.*

*Précédente : §304 livré (2026-05-25) — **Couplage niveau ↔ tier (alerte + alignement 1-clic) + re-tag traction lestée intermédiaire** (écart GA de l'audit `docs/audits/2026-05-25-audit-muscu-100nl-hommes-elite-vs-generateur.md`). Le pool d'exercices avancés (tractions lestées, haltéro, pliométrie avancée) était verrouillé derrière `practice_level='advanced'`, désynchronisable du `performance_tier` ; et le KPI `weighted_pullup` était mesuré mais l'exo de traction lestée n'était prescrit qu'au niveau confirmé. Livré : (1) helper pur `strengthProfileMismatch.ts` (`hasUnderLeveledProfile`, `RECOMMENDED_LEVEL_FOR_TIER` ; mismatch à sens unique : signale seulement tier ∈ {national, élite} & niveau ≠ advanced) ; (2) encart d'alerte « Profil sous-calibré » + bouton « Aligner sur Confirmé » dans `StrengthAthleteProfileCard.tsx` (passe `practice_level='advanced'` via l'upsert existant) ; (3) bandeau read-only « Profil sous-calibré » dans l'aperçu (`MesocyclePreview.tsx`, ReasoningPanel) ; (4) migration `00192_retag_tractions_lestees_intermediate.sql` — `Tractions lestées` (id 13) advanced→intermediate, appliquée via MCP et vérifiée en base. 983/983 npm test (+4 `strengthProfileMismatch.test.ts`), tsc clean, pas de `test:rls` (migration data-only). Limites : la préférence de la traction lestée aux tiers élevés (vs simple disponibilité) → §305 ; le bandeau aperçu affiche les tokens bruts (`national`/`intermediate`) — polish i18n possible ; taxonomie nage × distance + template `sprint_100` + papillon manquant → §305.*

*Précédente : §303 livré (2026-05-24) — **Dé-jeunification du moteur de mésocycle muscu (G1+G3)** (audit `docs/audits/2026-05-24-audit-muscu-200nl-femmes-elite-vs-generateur.md`, 2 écarts swim-independent). **G1 barèmes** (`kpiBaremes.ts`) : `kpiScore` extrapole la pente du dernier segment au-delà de p90 jusqu'à 100 (fin du plafond à 90, `Math.max(0, slope)` + plancher), bande d'âge `adulte` (≥19) dérivée des ancres 17-18 via `KPI_BAREMES_BASE` + `Object.fromEntries` (DRY, zéro duplication), `PerformanceTier` (`club|regional|national|elite`) + `shiftAnchors(anchors, tier)` (décalage `Δ = k(tier)×(p90−p10)` en espace valeur brute, k = 0/0.18/0.35/0.5) ; branché à l'unique chokepoint `scoreKpi` du moteur (`MesocycleInput.athlete.performanceTier` requis). **G3 niveau figé** : `MesocyclePreview` lit `level`/`performanceTier` depuis la table au lieu du `"intermediate"` codé en dur → `selectExercises` sert enfin les exos `advanced`. **Persistance** : table `strength_athlete_settings` (mig `00191`, PK `athlete_id`, RLS asymétrique — athlète lecture seule de sa ligne `_own_read`, coach/admin lecture+écriture club-wide `_coach`) + wrappers `getStrengthAthleteSettings`/`upsertStrengthAthleteSettings`. **UI** : `StrengthAthleteProfileCard` (2 selects autosave niveau+tier) dans la branche `bilan_pending` du bilan coach ; `MesocyclePreview` affiche « Normes : {ageBand} · niveau · tier » dans le raisonnement auditable. 982/982 npm test (+16), tsc clean, RLS 233 passed (nouveau `strength_athlete_settings.test.ts` 9 cas ; 2 échecs `coach_pace_zones`/`pace_share_links` pré-existants). Limites : `k(tier)` à calibrer, bande adulte = ancres 17-18 (confiance affichée), `updated_by` non rempli. **Écartés** : G2/G6 (couplage natation) hors périmètre, G4 (autorégulation) autre chantier.*

*Précédente : §302 livré (2026-05-24) — **Fluidité du parcours coach : intégration KPI + fil conducteur** (audit recos 3+4). L'étape KPI était orpheline du flux coach, la cible nageur non partagée entre écrans, le questionnaire coach en cul-de-sac. Livré : `bilanProgress.ts` (`computeBilanProgress`, TS pur TDD) + composant `BilanProgress` (bandeau 3 étapes tappables) ; routes `/coach/kpi-wizard/:athleteId` (KPI ciblé, saute la sélection, revient au bilan) + `/coach/strength-assessment/:athleteId` (cible persistante) ; `StrengthAssessmentScreen` affiche le fil conducteur + bouton « Mesurer les KPIs » et initialise la cible depuis le param ; `StrengthQuestionnaire` en mode coach revient au bilan avec CTA « Noter le bilan physique »/« Mesurer les KPIs » (fin du cul-de-sac). 966/966 npm test (+5), tsc clean, build OK. Pas de RLS touchée.*

*Précédente : §301 livré (2026-05-23) — **Fiabilité de la mesure (Bilan Muscu) — T1→T5 (complet)**. Issu de l'audit `docs/audits/2026-05-23-audit-mesure-coach-robustesse.md` (plan `docs/plans/2026-05-23-fiabilite-mesure-coach-design.md`). **T1** : `weighted_pullup` accepte 0 (poids de corps) et charges assistées (négatif) — `parseAttempts({allowNonPositive})` + `sanitizeNumericInput` (garde un `−` en tête), flag `allowNonPositive` sur le protocole, migration `00190` relâche le CHECK `value>=0` pour ce KPI (aucune RLS touchée). **T2** : démos KPI câblées sur les GIFs catalogue (`KPI_DEMO_EXERCISE_ID` : broad_jump→21, weighted_pullup→13 ; les 3 autres restent SVG faute de match exact), helper `getExerciseGifs`, `KpiGifPanel` reçoit l'URL résolue. **T3** : confiance barème par-KPI au recap (`baremeConfidenceFor`) — pastille « indicatif »/« à calibrer » + note « la mesure brute reste fiable, le score 0-100 dérivé est approximatif ». **T4** : détente verticale → `verticalJumpResult` retient la **moyenne** des temps de vol (pas `Math.max`, qui biaisait vers le haut sur chrono manuel) + écart-type ; UI « Moyenne retenue », mention « estimation », avertissement si essais incohérents (CV > 8 %). **T5** : rubrique mobilité/mouvement — `assessmentScores` étendu avec descripteur observable par niveau 0-3 (`levels`) + repère chiffré (`gauge`), composant `AssessmentScoreField` (descripteur du niveau choisi surfacé, dépliant 4 niveaux + photos de référence en fallback gracieux), `getPreviousCompletedPhysicalTests` → rappel de la note du dernier bilan + delta par axe. 961/961 npm test (+26), tsc clean, build OK. **§301 complet** (recos 1,2,5,6,7). À suivre : descripteurs/photos à valider par le coach (le code marche sans) ; recos fluidité parcours coach (3,4) → §302.*

*Précédente : §300 livré (2026-05-23) — **Édition coach séance générée, Part 1 (préservation raw_payload)**. Découverte décisive : la RPC `update_strength_session_atomic` écrit déjà `raw_payload` ; le blocage était purement JS (`updateStrengthSession` forçait `null`). Fix isolé : `reconcileMesocyclePayloads` corrèle les items reconstruits aux items source par `ordre`, préserve le `raw_payload` complet des items édités et impose le `mesocycle_id` de la séance aux items ajoutés (revert cohérent, zéro orphelin) ; `raw_payload` ajouté à `StrengthSessionItem` + porté dans le draft. Ne touche pas les transforms partagés (blast radius minimal). **Part 2 LIVRÉE** : `getStrengthSessionForEdit(id)` charge une séance par id avec `raw_payload` (hors liste) ; bouton « Éditer la séance » sur la preview planif coach → deeplink (`localStorage` tab=strength + `sessionStorage` id + `#/coach?section=library`) → `StrengthCatalog` ouvre l'éditeur au mount ; au save, `raw_payload` préservé → revert cohérent (le revert identifie les séances `[Méso]` via le tag `mesocycle_id` puis CASCADE delete). 935/935 npm test, 13/13 RLS (T14 édit→revert→0 orphelin), tsc clean, build OK. Cf. `docs/plans/2026-05-23-coach-edit-mesocycle-part2.md`.*

*Précédente : §299 livré (2026-05-23) — **Parcours mésocycle 2 modes**. Autonomie nageur réelle : verrou de génération abaissé de `completed` à `bilan_pending` (`canGenerateMesocycle`) dans `MesocycleEntry`/`MesocycleGeneration`/`MesocyclePreview`, + tuile `StartBilanEntry` qui démarre le bilan en autonomie (`createAssessment` `coach_id=null`), + bandeau confiance réduite sur la preview. Génération + questionnaire pilotés coach : `MesocycleGeneration`/`MesocyclePreview`/`StrengthQuestionnaire` paramétrés par `athleteId` (routes `/coach/mesocycle-generate/:athleteId`, `/coach/questionnaire/:athleteId`, `athleteId` porté dans le payload sessionStorage), entrées « Générer le mésocycle » (done-state bilan) + « Régénérer » (panel) + « Remplir avec le nageur » (attente bilan). Migrations `00188_pain_coach_write` + `00189_notify_assessment_started` (MCP). **Édition fine coach (T13/T14) DIFFÉRÉE** : `updateStrengthSession` force `raw_payload:null` → éditer une séance `[Méso]` casserait le revert ; helper `preserveMesocycleTag` posé pour le chantier dédié. 911/911 npm test verts (+10), tsc clean, build OK, 32 RLS verts. Cf. `docs/plans/2026-05-23-bilan-muscu-parcours-fixes-design.md` + `docs/plans/2026-05-23-bilan-muscu-parcours-fixes.md` + audit `docs/audits/2026-05-23-audit-parcours-creation-mesocycle.md`.*

*Précédente : §298 livré (2026-05-23) — **Métrique d'intensité par exercice (hauteur/distance/temps)**. Permet de tracker un Box Jump en cm, un saut en longueur en cm, du gainage en s — au lieu de forcer des kg. (1) Migration `00186` ajoute `dim_exercices.intensity_metric` (enum `weight_kg|height_cm|distance_cm|time_s`, défaut `weight_kg`) + `strength_session_items.target_intensity` (cible absolue coach) ; `00187` recompile le RPC `update_strength_session_atomic` pour threader `target_intensity` (sinon perdu silencieusement à chaque update). (2) Module `src/lib/strength/intensityMetrics.ts` = source unique (labels/unités/`tracksOneRm`/`hasBodyweight`/`max` + `formatIntensity`). (3) La valeur loggée réutilise la colonne `strength_set_logs.weight` (unité portée par l'exo). (4) Catalogue coach : `Select` métrique (masque PDC + grise les %1RM si non-poids). Builder : champ "Cible (cm/s)" conditionnel → `target_intensity`. (5) WorkoutRunner : tile/label/unité/numpad adaptatifs, bouton PDC seulement si `weight_kg`, cible depuis `target_intensity`. (6) **Gating strict** : aucun calcul 1RM/PR pour les métriques non-poids — `skip_one_rm` armé côté client (online + offline replay) + `shouldSkipOneRm` côté serveur + PR detection gardée `tracksWeight`. (7) `ExerciseProgressChart` : courbe "meilleure valeur" + unité adaptée, volume kg masqué. Résumés (`SessionSummary`/`RestSessionTab`/`RestPerfsTab`) : `formatIntensity` + volume kg exclut les non-poids. 917/917 npm test verts (+13 dédiés), tsc clean. **Limites V1** : pas de PR sur métriques non-poids ; `bestSet` non-poids sélectionné via Epley (peut rater le max brut dans de rares cas charge×reps) ; logs kg historiques ré-interprétés si bascule de métrique. Cf. `docs/plans/2026-05-22-intensity-metric-height-distance-time-design.md` + `.../2026-05-22-intensity-metric-height-distance-time.md`.*

*Précédente : §297 livré (2026-05-21) — **Flag is_bodyweight + estimation 1RM inline (ramp-up)**. (1) Migration `00183` ajoute `is_bodyweight BOOLEAN` sur `dim_exercices` ; checkbox dans le catalogue coach (création + édition) qui reset les `pct_1rm_*` à null. (2) Le `WorkoutRunner` masque entièrement la tile "Charge" pour les exos PDC (layout `grid-cols-1` reps-only) et auto-log `BODYWEIGHT_SENTINEL`. (3) `OneRmGate` refait : `Poids libre` remplacé par `Estimer pendant la séance` — populates un Set `inlineEstimationExercises` lifted dans `useStrengthState` (persisté dans le focus snapshot localStorage). (4) Mode estimation sur série 1 : bandeau ambré + `warmupHistory` éphémère (chauffes en mémoire React) + 2 boutons : `+ Chauffe suivante` (push history, reset inputs) et `C'est ma série de référence → calculer 1RM` (Epley+RIR via `estimateOneRM`, persist via `update1RM`, log série 1, avance à série 2 au target weight fraichement calculé). (5) Bouton ghost `Recalculer ma 1RM` sur série 1 de tout exo chargé non encore loggé. Filtre `missing1RmExercises` extrait dans `src/lib/strength/missing1rmFilter.ts` (3 filtres : %1RM > 0, pas PDC, pas de 1RM existant) avec 4 tests unitaires. 901/901 npm test verts (+9 dédiés), tsc clean. Cf. `docs/plans/2026-05-21-bodyweight-flag-and-inline-1rm-estimation-design.md` et `docs/plans/2026-05-21-bodyweight-flag-and-inline-1rm-estimation.md`.*

*Précédente : §296 livré (2026-05-21) — **Fixes test réel Bilan Muscu**. 3 bugs critiques remontés au premier test bout-en-bout : (1) mésocycle généré invisible dans « Mon plan » nageur (cascade Phase 3 > Phase 2 masquait les slot_overrides quand un training_plan_application actif coexiste — fix `MyPlanTab.tsx` qui priorise Phase 2 si `getActiveMesocycle` non-null) ; (2) bibliothèque coach polluée par les 20 templates `[Méso XX]` (fix mig `00180` qui filtre la RPC `get_strength_catalog_paginated` sur `name NOT LIKE '[Méso %'`) ; (3) panel coach `CoachMesocyclePanel` existait déjà mais découverte UX zéro — fix : section conditionnelle `CoachActiveMesocyclesSection` sur le hub coach (liste cliquable des nageurs avec mésocycle actif, deeplink onglet Planning via sessionStorage). 892/892 npm test verts, tsc clean, build OK. Cf. `docs/audits/2026-05-20-audit-bilan-muscu-293.md` § findings (root causes).*

*Précédente : §295 livré (2026-05-21) — **Chrono temps de vol + illustrations SVG animées KPI**. Remplace la saisie texte manuelle des 3 temps de vol du KPI détente verticale par un module chrono tactile intégré (`KpiStopwatch.tsx`, state machine idle/running/stopped, mesure `performance.now()` sub-ms, vibration haptique, fallback saisie manuelle révélable). Remplace les placeholders « démonstration à venir » des 5 protocoles KPI par des illustrations SVG inline animées via CSS keyframes (silhouettes monochromes `stroke-current` adaptatives dark/light mode, ratio 16:9, cycles 1.8-2.5s, 1 composant par KPI). Slot `gifUrl` conservé prioritaire — un asset binaire fourni plus tard remplace l'animation SVG automatiquement. 892/892 npm test verts (+6 dédiés), tsc clean, build OK. Cf. `docs/plans/2026-05-21-kpi-chrono-illustrations-design.md`.*

*Précédente précédente : §294 livré (2026-05-20) — **Clôture qualité Bilan Muscu** (suite à l'audit §293 du même jour). 3 migrations DB : `00177` nettoie `is_core` sur `upper_strength` (retire les 8 exercices de gainage hérités §291, ajoute « Tractions élastiques » comme pilier accessible `beginner`) ; `00178` indexe `strength_session_items.raw_payload->>'mesocycle_id'` (utilisé par revert + lecture coach) ; `00179` aligne Σ_max_weeks=16 du template sprint_50 saison sur `max_week_count=16` (phase puissance max 4→3). Code : `ZONE_LABEL_FR` extrait dans `src/lib/strength/zones.ts` (zones granulaires `left_*`/`right_*` complétées) consommé par `CoachMesocyclePanel` + `MesocyclePreview` ; coach panel passe en « toutes semaines repliées par défaut » (cohérent avec l'aperçu nageur). Doc : `bilan-muscu-guide-utilisateurs.md` complété (séances multi-bucket vague C, McEvoy, pilier beginner Tractions élastiques). 886/886 tests verts, 25 RLS §293 verts, tsc clean. Rapport d'audit : `docs/audits/2026-05-20-audit-bilan-muscu-293.md`.*

*Précédente précédente : §293 livré (2026-05-20) — **Chantiers C « Moteur » + D « Intégration » du Bilan Muscu clos**. Le nageur peut générer son mésocycle muscu en autonomie : à partir de son bilan (Chantier B) + des templates (Chantier A), un moteur déterministe TS pur (`mesocycleEngine.ts`) calcule un plan périodisé (6 scores → priorités → allocation → sélection d'exercices → distribution sur la durée cible), affiché en aperçu avec son raisonnement auditable, puis matérialisé sur la timeline `strength_planning_*` via 2 RPC transactionnelles `apply_strength_mesocycle` / `revert_strength_mesocycle` (migrations `00172` + `00173`, snapshot pré-écriture → revert garanti). Côté coach : visibilité totale du mésocycle actif + raisonnement (auditable, le « pourquoi ») + bouton « Rejeter » dans l'onglet Planning. Phase 1 livre aussi la révision du KPI détente verticale en **puissance relative W/kg** (équation de Sayers, ancres CMJ Rodrigues 2024). 884/884 tests verts (+76 dédiés), 25 RLS §293, tsc clean. Reste hors §293 : Chantier E (boucle de suivi en fin de mésocycle). Cf. `docs/plans/2026-05-18-bilan-muscu-moteur-generation-design.md`, `bilan-muscu-mapping-mesocycle-planning.md`, `bilan-muscu-barème-puissance-detente.md`.*

*Précédente précédente : §292 livré (2026-05-18) — **Chantier A « Contenu du Bilan Muscu » clos** (A1 barèmes §290 + A2 tagging §291 + A3 templates §292). Brique A3 livrée selon un design évolué : templates de périodisation à **durée variable**. Le modèle figé `week_count` est abandonné au profit d'un modèle de **phases à bornes** `[min, nominal, max]` ; nouveau `kind` (`season` / `inter_competition`) ; **14 templates seedés** (7 saison + 7 mini-prépa inter-compétitions, un par `event_group`). Migrations `00167` (ALTER table : `kind`/`min_week_count`/`max_week_count`), `00168` (`sessions_per_week` sur `strength_assessments`), `00169` (seed des 14 templates). Types TS révisés (`PeriodizationPhase`, `PeriodizationStructure.phases[]`, `PeriodizationTemplateKind`). Schéma de test RLS aligné, `npm run test:rls` vert. Moteur de génération (Chantier C) hors scope. A4 (5 GIFs protocoles KPI) = tâche utilisateur. Cf. `docs/plans/2026-05-18-bilan-muscu-templates-duree-variable-design.md` + `bilan-muscu-templates-sources.md`.*

*Précédente : §291 livré (2026-05-17) — Bilan Muscu Chantier A brique A2 (tagging). Migrations `00164` (colonnes `bucket`/`contraindication_zones`/`level` sur `dim_exercices`) + `00165` (colonne `is_core` + seed des 94 exercices). Mapping proposé par Claude, validé coach « seede tel quel ». Core/tronc → drapeau `is_core` (pas de 6e bucket).*

*Précédente : §290 livré (2026-05-17) — Bilan Muscu Chantier A brique A1 (barèmes KPI). `src/lib/strength/kpiBaremes.ts` : fonction de scoring `kpiScore` (interpolation) + `KPI_BAREMES` (5 KPIs × 2 sexes × 3 bandes d'âge 13-14/15-16/17-18) avec flag de confiance. Normes publiées (population scolaire générale), transposition assumée pour 4 KPIs sur 5. 36 tests.*

*Précédente : §289 livré (2026-05-17) — Bilan Muscu, protocoles KPI ajustés au matériel du club (`src/lib/strength/kpiProtocols.ts`, retour terrain). Le tirage isométrique mi-cuisse (plateau de force absent du club) devient un tirage mi-cuisse à la barre, charge max en kg — barre sur les pins d'un rack à hauteur mi-cuisse. Le saut vertical passe en détente sèche : le nageur colle 3 scotchs au mur au sommet de chaque saut (bout des doigts), le binôme mesure sol → haut du scotch. Contenu de config uniquement — aucun schéma, API ni type touché.*

*Précédente : §288 livré (2026-05-17) — Points d'entrée navigation pour le Bilan Muscu (Feature "Bilan Muscu → Mésocycle", Chantier B, Phase 9). Les 3 écrans (§285-287) étaient routés mais inaccessibles depuis l'UI. Ajoute : sur `/strength` (onglet "S'entraîner") une carte conditionnelle `QuestionnairePrompt` (visible si `getLatestAssessment(userId).status === 'questionnaire_pending'`, style prioritaire violet, → `/strength/questionnaire`) + une tuile `KpiWizardEntry` standard (→ `/strength/kpi-wizard`) ; sur le hub coach une tuile "Bilan muscu" dans les accès rapides (→ `/coach/strength-assessment`). 1 fichier neuf (`StrengthBilanEntry.tsx`).*

*Précédente : §287 livré (2026-05-17) — Bilan physique coach, scores mobilité & mouvement (Feature "Bilan Muscu → Mésocycle", Chantier B, Phase 8). Écran `/coach/strength-assessment` (coach/admin) : sélection nageur (pattern `KpiWizard`), puis `getLatestAssessment` et branchement sur 4 cas — aucun bilan ou `completed` → CTA "Démarrer un bilan" (`createAssessment`), `questionnaire_pending` → état d'attente, `bilan_pending` → formulaire de notation. 6 scores 0-3 (mobilité : flexion épaule / thoracique / hanche ; mouvement : scapulaire / alignement tronc-nuque / charnière hanche) mappés à `StrengthPhysicalTests`. Contexte read-only : questionnaire nageur + KPIs (`getLatestKpiMeasurements`). Submit `updateAssessmentPhysicalTests`. `ScaleField` généralisé (prop `min`). 3 fichiers neufs (page + `AssessmentContext` + `assessmentScores`).*

*Précédente : §286 livré (2026-05-17) — Questionnaire bilan muscu, auto-évaluation nageur (Feature "Bilan Muscu → Mésocycle", Chantier B, Phase 7). Écran `/strength/questionnaire` : `getLatestAssessment` puis 3 cas (formulaire éditable si `questionnaire_pending`, état lecture seule "déjà rempli" si `bilan_pending`/`completed`, état vide si aucun bilan). 4 sections (douleurs via `BodyHeatMap`, historique blessures, mobilité 1-5, psychologie 3×1-5). Submit : `updateAssessmentQuestionnaire` + `upsertPainReports`. 2 fichiers neufs (page + `ScaleField`).*

*Précédente : §285 livré (2026-05-17) — KpiWizard, assistant guidé de saisie des 5 KPIs de force (Feature "Bilan Muscu → Mésocycle", Chantier B, Phase 6). Écran autonome `/strength/kpi-wizard` accessible nageur ET coach : 3 phases (sélection nageur coach, 5 étapes 1 KPI/étape avec protocole binôme complet, recap diff vs précédente mesure). Skip de KPI autorisé (bilan partiel), champ binôme `assisted_by`, source `wizard_coach | wizard_athlete`, mode focus dock masqué. 5 fichiers neufs (page + 4 sous-composants `src/components/strength/kpi/`).*

*Précédente : §285 livré (2026-05-17) — Bilan Muscu, fondation Chantier B (Phases 1-5) (Feature "Bilan Muscu → Mésocycle"). Migration `00163` (tables `strength_assessments` + `strength_kpi_measurements` sous RLS), types, API (`strength-kpi.ts`, `strength-assessments.ts` + re-exports `index.ts`), tests RLS d'intégration (20), helpers (`bestAttempt`, `kpiProtocols`). Socle données/API du Bilan Muscu — sans UI ni moteur. ~34 tests unitaires verts. Design : `docs/plans/2026-05-17-bilan-muscu-mesocycle-design.md`.*

*Précédente : §284 livré (2026-05-16) — Factorisation de `fmtTime` dans `src/lib/formatTime.ts` : les 3 copies identiques (PaceMatrix, matrice 4 nages, export PDF) remplacées par un import unique ; `fmtTimeCs` devient un wrapper. Refactor sans changement de comportement.*

*Précédente : §283 livré (2026-05-16) — Colonne MAX du calculateur d'allures à 2 décimales.*

*Précédente : §282 livré (2026-05-16) — Crédit-virage généralisé aux épreuves multi-virages : `turnCreditForShortCourse` multi-mur, gate `isTurnModelEvent`.*

*Précédente : §281 livré (2026-05-16) — Modèle crédit-virage pour la courbe d'allures 25 m du sprint.*

*Précédente : §280 livré (2026-05-13) — Bouton "Enregistrer" dans le plan builder.*

*Précédente : §279 livré (2026-05-13) — SessionPreviewPopover partagé + actions Changer/Retirer.*

*Précédente : §278-fix livré (2026-05-13) — Hover preview lag fix (delays cumulés).*

*Précédente : §278 livré (2026-05-13) — Aperçu hover/tap des cellules dans Planif muscu (SessionPreviewPopover).*

*Précédente : §276 livré (2026-05-13) — Simplification UX muscu (Planning read-only).*

*Précédente : §275.8-fix livré (2026-05-13) — Refonte lisibilité 5s du drawer détail session.*

*Précédente : §275.8 livré (2026-05-13) — Plan editor : add/remove week + drawer détail session.*

*Précédente : §275.7-fix livré (2026-05-13) — Hotfix React error #310 dans TrainingPlanEditor.*

*Précédente : §275.7 livré (2026-05-13) — Athlete-side : Phase 3 dans MyPlanTab.*

*Précédente : §275.6 livré (2026-05-13) — Timeline Planif muscu coach dérivée des training_plan_applications.*

*Précédente : §275.5 livré (2026-05-13) — Application d'un training_plan à un nageur ou un groupe (ApplyPlanDialog + PlanApplicationsList).*

*Précédente : §275.4 livré (2026-05-13) — Refonte biblio>plans UI : TrainingPlansBrowser (liste + dialog création + éditeur grille num_weeks × 7).*

*Précédente : §275.2 livré (2026-05-13) — Module API `src/lib/api/training-plans.ts` : 14 fonctions CRUD + helper derivation.*

*Précédente : §275.0/.1/.3 livré (2026-05-13) — Revert §274.1/§274.3 auto-fill ghost + nouveau modèle DB pour plans d'entraînement génériques.*

*Précédente : §274.3 livré (2026-05-13) — Auto-fill Planif muscu : mapping cycle ↔ semaine via parsing `S<n>` du nom de cycle (revert §275.0).*

*Précédente : §274.2 livré (2026-05-13) — Fix fiabilité bouton « Mettre à jour l'app » du Profil. Root cause : `reg.update()` racé contre 3 s mais le SW est encore en `installing` quand on appelle `updateSW(true)` → `messageSkipWaiting()` no-op (pas de `waiting`) + listener `controllerchange` jamais armé. Réécriture : on attend explicitement `reg.installing.state === "installed"` (timeout 15 s), on attache notre propre listener `controllerchange`, on `postMessage SKIP_WAITING`, et on hard-reload avec `?_t=now` pour bust le cache navigateur même quand aucune update n'est trouvée. tsc clean.*

*Précédente : §274.1 livré (2026-05-13) — Auto-fill timeline Planif muscu : en mode nageur, les cellules sans slot explicite affichent en "ghost" la séance du plan biblio matchant le préfixe jour-de-semaine. Mini-dots du header replié distingués plein (slot) vs creux (hérité). Tap → picker pour adoption/override. tsc clean.*

*Précédente : §274 livré (2026-05-13) — Planif muscu coach : grille 1 slot/jour (suppression colonnes Matin/Soir, fallback morning→evening sur données legacy, écritures neuves toujours `morning`) + picker bottom-sheet nourri par les cycles du plan biblio du nageur sélectionné, badge "Suggéré" sur les séances matchant le préfixe jour-de-semaine. tsc clean, tests merge/ISO OK.*

*Précédente : §273 livré (2026-05-13) — Parité finale muscu coach : carte "Mon entraînement" du hub coach affiche la séance muscu du jour (détection via `getAssignments` scopé coach.userId) avec CTA Démarrer, + carte secondaire "Mes records muscu" → `/records?tab=1rm` (édition 1RM). Ferme les 2 deltas UX restants vs nageur. 701/701 pass, tsc clean, build OK.*

*Précédente : §272 livré (2026-05-13) — Dock mobile coach/admin : item Chrono remplacé par Profil sur ≤ md (navItems + AppLayout + 6 tests). 701/701 pass, tsc clean.*

*Précédente : §271 livré (2026-05-13) — Module muscu perso coach : `/strength` ouvert à coach/admin via nav desktop 6 items + dock mobile 6 items spécifique (Profil ajouté / Chrono retiré) + tuile "Mon entraînement" dans hub Coach, vue toujours personnelle (neutralisation `selectedAthleteId`), picker `strength-planning` injecte le coach comme cible synthétique pour plan perso, aucune migration RLS nécessaire. 700/701 tests pass (1 fail pré-existant transformers), tsc clean, build OK.*

*Précédente : §270 livré (2026-05-11) — Chantier R5 : polish vers 9.5/10 (useDebouncedValue hook TDD + 17 substitutions, useReducedMotion 5 composants, @tanstack/react-virtual Records.tsx, empty states CTA ×5). tsc clean.*

*Précédente : §269 livré (2026-05-11) — Chantier R4 : robustesse mutations + offline (onError ×9, UPSERT strength_logs clé naturelle + dédup 14 groupes, login retry 3×, signup withTimeout 15s, cache key stable slot-subgroups, swimmerHasCustom guard anti-flicker). 695/696 tests pass, tsc clean, migration 00161 appliquée.*

*Précédente : §268 livré (2026-05-11) — Chantier R3 : friction tunnel mutation (toast unifié sonner 52 fichiers + 3 supprimés, useDelayedLoading ×8 écrans, retry action ×17 toasts transient, skeletons spécifiques Coach ×12, fix double erreur Dashboard). 695/696 tests pass, tsc clean.*

*Précédente : §267 livré (2026-05-11) — Chantier R2 : memoization hubs runtime (SetRow extrait WorkoutRunner, memo MyPlanTab+HistoryTable+RecordCard, stagger cap Records). 695/696 tests pass, tsc clean.*

*Précédente : §266 livré (2026-05-10) — Chantier R1 : fix P0 robustesse (idempotencyKey queue offline, auto-sync ref coach, chrono debounce 500ms, 5× window.confirm → AlertDialog). 695/696 tests pass, tsc clean.*

*Précédente : §265 livré (2026-05-10) — Chantier D sub-§C : `useDelayedLoading` hook + toast 5 s sur Dashboard / Coach / Records (plan post-pass-2 P2). Dernier drapeau UX résiduel pré-§265 : « aucun feedback >5 s » sur surfaces critiques — sur Slow 3G/Wi-Fi captive l'utilisateur voyait un skeleton ad infinitum sans signal. **NEW** `src/hooks/useDelayedLoading.ts` (42 LOC) : hook pur `(loading, delayMs=5000) => { showSlowToast: boolean }`. `setTimeout` interne, reset si `loading` redevient false, cleanup propre, 1 toast par épisode (true→false→true = 2 épisodes). 6 tests vitest fake-timers couvrant initial state, flip exact à delayMs, no-flip si complete avant, reset, ré-épisode, custom delayMs. Branchements symétriques sur 3 surfaces : Dashboard (`sessionsLoading \|\| assignmentsLoading`), Coach (`athletesLoading` gate du hub home), Records (`oneRmLoading \|\| swimLoading \|\| exercisesLoading`). Toast verbatim « Ça prend du temps… / Le réseau semble lent. On continue d'essayer. » sur les 3. **Chaîne complète post-§265** : skeleton bref → toast à 5 s (§265) → retry exponentiel 1/2/4s (§244) → timeout 8s par tentative (§256) → worst case 27 s end-to-end vs infinite. **Stratégie d'intégration** : pure logique + primitive existante (`useToast` Shadcn), hors scope `/frontend-design` historique du projet (aligné §242/§250/§246). Décision validée avec utilisateur. **Cumul plan post-pass-2** : 5/6 chantiers livrés (P0 §255 PageTransition CSS, P0 §256 withTimeout, P1 §262 RPC save_swim_session_atomic, P1 §263 uploadAvatar offline, P2 §265 useDelayedLoading). Reste P1 §266 extraction memo bloqué par profiling React DevTools runtime. tsc clean, 695/696 tests pass + 1 fail pré-existant, build 45.33 s OK. Régression §255 préservée (vendor-motion absent modulepreload). **Cible composite estimée post-§265 : ~8.4/10** (dépasse cible plan 8.2). 5 fichiers, ~140 LOC nettes (2 NEW hook + test, 3 branchements pages).*

*Précédente : §264 livré (2026-05-10) — Fix 3 régressions audit final consolidé `docs/audits/2026-05-10-final-consolidé.md`. **Gap #1** Chantier II Surface NON LIVRÉ → résolu via refactor architectural unique : `src/components/ui/card.tsx` wrappe désormais `Surface` en interne (`variant="solid"` `radius="sm"` + `shadow` + `text-card-foreground` ajoutés via className) — 0 fichier call-site touché, primitive consolidation atteinte sans risque visuel sur les 16 fichiers complexes (`CardHeader/Content/Title/Footer/Description` préservés). **Gap #2** Tap targets contournés : 14 spots P2 fixés dans 5 fichiers (CoachTrainingSlotsScreen 11 + Records + MonthlyReport + AthletePlansTab) avec pattern `min-h-11 md:h-X` (44 px mobile WCAG 2.5.5, dense desktop préservé). **Gap #3** Migration mécanique tracking arbitraires → tokens : 47 hits → 1 résiduel whitelist (`Coach.tsx:111` 0.28em SectionLabel brand). Mapping : 0.08-0.12em→`tracking-eyebrow-sm`, 0.14-0.16em→`tracking-eyebrow`, 0.18-0.22em→`tracking-eyebrow-lg`. 14 fichiers migrés via sed mass-replace. **Vérifications** : tsc clean, 694/695 tests pass (+1 pré-existant whitelisté §214), build 25.4 s, precache 243 entries / 5758 KiB, modulepreload 4 vendors (vendor-motion absent ✅ §255 préservé). **Score composite estimé** : 9.23 → ~9.27 (UI/UX 9.90 → ~9.95, A11y 9.60 → 9.65). 24 fichiers modifiés (1 atomique card.tsx + 5 tap targets + 15 tracking + 3 docs) — 132 insertions / 71 deletions.*

*Précédente : §263 livré (2026-05-10) — Chantier A sub-§C3b : `uploadAvatarMutation` offline (dataURL + quota guard) — **Chantier A complet 12/12 mutations couvertes**. Bloqueur §262 résiduel : la mutation `Profile.uploadAvatarMutation` a un payload **Blob binaire** non sérialisable JSON par `tryWithOfflineQueue` §251. **Stratégie** : round-trip Blob ↔ data URL base64 (`data:image/png;base64,XXX` — embarque le MIME, 1 string sérialisable suffit). NEW helpers `blobToDataUrl` (FileReader) + `dataUrlToBlob` (atob + Uint8Array) co-locatés avec `uploadAvatar` dans `src/lib/api/users.ts`. **Quota guard** : refus pré-enqueue si data URL >1 MB en mode offline (iOS Safari plafonne localStorage à 5-10 MB partagés). Replay côté `OfflineMutationSync` : `dataUrlToBlob` → `uploadAvatar({ userId, blob, mimeType, extension })`. Idempotence garantie par `upsert: true` Storage sur path `{userId}.{extension}`. **Cumul Chantier A : 12/12 mutations critiques offline** (3 §251 Profile/Records + 7 §252 SuiviSemaine/Administratif + 1 §262 SwimSessionView + 1 §263 avatar). Chantier A 100 % livré. tsc clean, 694/695 tests pass + 1 fail pré-existant, build 21.03 s OK. Régression §255 préservée (vendor-motion absent modulepreload). 4 fichiers, ~80 LOC nettes. Reste à faire : §264 Chantier E sub-§B/C extraction memo (bloqué par profiling React DevTools runtime), §265+ Chantier D sub-§C useDelayedLoading (bloqué par /frontend-design).*

*Précédente : §262 livré (2026-05-10) — Chantier A sub-§C3a : RPC `save_swim_session_atomic` (1 RTT vs N+1, transactionnel, queue offline) — plan post-pass-2 P1 (`docs/audits/2026-05-10-perf-audit-pass2-runtime.md` § 4). `SwimSessionView.saveMutation` était la dernière mutation **multi-étape** non couverte par la queue offline (N+1 round-trips : `ensureSwimSession` + N × `saveSwimLog`) — risque session orpheline en cas de crash réseau au milieu. **Migration 00159** `save_swim_session_atomic(p_date, p_slot, p_logs jsonb) RETURNS bigint` (SECURITY INVOKER, RLS héritée). Body : SELECT/INSERT dim_sessions sur (athlete_id, date, slot), DELETE puis INSERT swim_exercise_logs (replay-safe idempotent). Appliquée via MCP `apply_migration` → `{success: true}`. **Côté client** : `saveSwimSessionAtomic({athleteName, athleteId?, date, slot, logs})` tente RPC + fallback byte-identical sur séquence legacy (`ensureSwimSession` + `saveSwimExerciseLogs`) — pattern §247 zéro régression possible. `SwimSessionView.saveMutation` réécrit pour wrapper dans `tryWithOfflineQueue("swim-session-save", payload, ...)` + toast "Sauvegarde en attente" si offline. `OfflineMutationSync` étendu avec type guard + replay branch + invalidations `swim-exercise-logs-*`. **Cumul Chantier A : 11/12 mutations critiques couvertes offline** (3 §251 + 7 §252 + 1 §262, reste §263 uploadAvatar). **Gains mesurables** : 1 RTT vs N+1 (Slow 3G 8 blocs = ~3.2 s économisées), atomicité transactionnelle (0 session orpheline), zéro régression via fallback. tsc clean, 694/695 tests pass + 1 fail pré-existant, build 19.96 s. Régression §255 préservée (vendor-motion absent modulepreload). 5 fichiers, ~190 LOC nettes : 1 migration SQL NEW + 4 fichiers TS modifiés.*

*Précédente : §261 livré (2026-05-10) — Chantier IV Timing tokens (plan UI/UX `docs/plans/2026-05-10-ui-ux-roadmap-to-10.md`, post-§259 Chantier I). Sub-§A audit grep + Sub-§B tokens `@theme` + migration ciblée 3 surfaces. **Audit** : 7 valeurs `duration-*` (44 hits, top 4 = 86%) + 5 `cubic-bezier(...)` (8 hits dont 6 dans `index.css` keyframes §242/§255). **Tokens** ajoutés dans `@theme inline` : `--duration-{fast/normal/slow/slower}` (200/300/500/700ms — calibrés sur usage existant pour éviter régression vs HIG strict du plan), `--ease-{spring-soft/out-quart/out-cubic/in-cubic}` (covers spring entry banners + ease-out-quart du plan + 2 eases extraites des keyframes existantes). 4 `@utility duration-*` exposent les classes Tailwind ; les `--ease-*` génèrent automatiquement `ease-*` via Tailwind 4. **Migration `index.css` keyframes** : 4 keyframes `cubic-bezier(...)` littérales remplacées par `var(--ease-*)` ; 3 utilisent désormais `var(--duration-fast)` (résultat runtime identique, source maintenable). Conservé ad-hoc : `inline-banner-enter` 240ms `(0.34, 1.4, 0.64, 1)` (spring variant unique), `page-transition-in` 180ms `ease-out` (180ms ≠ token). **Migration ciblée 3 surfaces** (10 hits sur 38 migrables) : RestSessionTab (4× 200/300/500/700→fast/normal/slow/slower), RestScreen (3), CoachTrainingSlotsScreen (3). Hot files restants hors scope (28 hits sur `ui/*` shadcn primitives + fichiers à 1 hit unique) prêts pour migration §262+ mécanique. tsc clean, 694/695 tests pass + 1 fail pré-existant. Build 15.73 s confirme génération CSS des 4 duration-* + 4 ease-* (8 classes nouvelles). 4 fichiers, ~30 LOC nettes (22 CSS + 10 migrations). Score ~9.85 → ~9.90/10.*

*Précédente : §260 livré (2026-05-10) — Auto-sync objectifs chronométriques → cibles allures équipe au montage. `buildObjectiveSyncOps` (pure function exportée) extraite de `CoachPaceCalculatorScreen.tsx` pour testabilité sans Supabase mock. `useEffect` gated par `hasSyncedObjectivesRef` (anti-re-render) + `qc.getQueryData` (anti-staleness). Ne pas écraser les cibles existantes (`shouldAutoSyncToPaceTarget` retourne false si cible nage+distance+bassin existe déjà). 11 nouveaux tests unitaires `buildObjectiveSyncOps`. Erreurs silencieuses — best-effort cohérent avec pattern `autoSyncPaceTarget`. 2 fichiers, ~80 LOC nettes.*

*Précédente : §256 livré (2026-05-10) — Chantier D sub-§A2 : `withTimeout(8s)` sur 10 queryFn critiques (audit perf pass 2 § 4 P0). Réservation §256 préservée par le parallèle §259. Le helper `withTimeout` (déjà dans `src/lib/api/client.ts:349-363`, déjà testé) n'était utilisé que 3× sur 40+ modules avant §256 (`strength.ts:506,593,754`). Adoption sur **10 nouveaux sites** : Dashboard `getSessions` + `getAssignments`, SwimmerHome `getProfile` + `getAssignments` + `getSessions`, Records `get1RM` + `getSwimRecords` + `getSwimmerPerformances`, Coach `getCoachKpis`, auth.ts RPC `get_user_auth_context` (§247 fallback 2-select préservé). **Total adoption post-§256 : 13 calls (vs 3 pré).** Pas de nouveau helper — réutilisation directe. Signature `withTimeout` relâchée `Promise<T>` → `PromiseLike<T>` pour accepter les builders Supabase thenables sans wrap supplémentaire. Combiné au retry exponential §244 (`isTransientError` reconnaît `"timeout"`), garantit **worst case end-to-end ≤ 27s** (8s + retry 1s + 8s + retry 2s + 8s) vs blocking ad infinitum sur EDGE/Wi-Fi captive/Supabase incident. 0 ms overhead réseau OK. tsc clean, 694/695 tests pass + 1 fail pré-existant. Régression §255 fix préservée (vendor-motion toujours absent du modulepreload). 7 fichiers, ~30 LOC nettes.*

*Précédente : §259 livré (2026-05-10) — Chantier I Typography rhythm (plan UI/UX `docs/plans/2026-05-10-ui-ux-roadmap-to-10.md`). Sub-§A audit grep + Sub-§B scale @utility Tailwind 4 + migration ciblée bundle commit unique. **Audit** : 6 valeurs `leading-*` (saine) vs 17 valeurs `tracking-*` dont **11 ad-hoc `tracking-[0.XXem]`** (dérive nette, 62 hits cumulés). **Scale** : 5 `@utility type-*` sentence-case (`type-display/title/headline/body/caption`, calibrés sur `tracking-tight` -0.025em existant pour éviter régression visuelle vs HIG strict) + 4 `@utility tracking-*` (`tracking-eyebrow-sm` 0.08em, `tracking-eyebrow` 0.15em, `tracking-eyebrow-lg` 0.20em, `tracking-hero` 0.30em). Brand opt-in `.heading-display` (Oswald uppercase italic §197) inchangé. **Migration ciblée** : 3 surfaces sur 5 prévues — Login (2× `tracking-hero`), Coach (5 spots week grid + week label), Profile (7× `tracking-eyebrow-sm` + 2× h1 modaux `type-headline` validation scale). Dashboard/SwimmerHome non migrés car aucun ad-hoc présent. Conservé ad-hoc : `Coach.tsx:110` SectionLabel `[0.28em]` (cas unique). 12 hot files identifiés audit hors scope (ChronoRace 6 distincts, SwimmerWeekMatrixCard, ChronoResults, etc.) — tokens prêts pour migration progressive §260+. tsc clean, 694/695 tests pass + 1 fail pré-existant. `npm run build` 14.61 s confirme génération CSS des 9 nouvelles classes. 4 fichiers, ~80 LOC nettes (50 CSS + 30 migrations). Numérotation §259 (sauts §256-258 réservations user plan post-pass-2 perf : §256 `withQueryTimeout`, §257 mutations binaires, §258 extractions memo). Score estimé ~9.8 → ~9.85/10 (delta attendu pour Chantier I polish). Hors scope : Chantier IV timing tokens (à converger après §255 PageTransition CSS), Chantier II Surface adoption massive (risque élevé, session dédiée).*

*Précédente : §255 livré (2026-05-10) — Fix régression §254 : `PageTransition.tsx` framer-motion → CSS `@keyframes`. **Critical path 5 vendors → 4 vendors mesurés** (`grep modulepreload dist/index.html` post-build = `vendor-react`, `vendor-query`, `vendor-charts`, `vendor-supabase` — **vendor-motion absent**). Stratégie : `<div key={location} className="anim-page-transition">` au lieu de `<AnimatePresence><motion.div>`, key force unmount/remount au changement de route, mount déclenche `@keyframes page-transition-in` (180 ms ease-out, `opacity 0→1, translateX 16px→0`) ajouté dans `src/index.css` § §242 banners. Animation d'exit (~18 ms slide-out vers x:-8) volontairement abandonnée — imperceptible et la conserver imposait l'import sync framer-motion. `prefers-reduced-motion` honoré via media query existante étendue. **Bénéfice mesuré : -38.27 KB gzip critical path online (vendor-motion-DOqokx5n.js, 115.94 KB minified, sorti du chemin critique — chargé désormais lazy uniquement par les pages qui l'importent : Login, Profile, Strength, Records, etc.)**. Estimation TTI 4G+ ~-300 à -500 ms restoré tel qu'attendu par §243 initial. Drop-in compatible côté caller (`AppLayout.tsx:11` inchangé). tsc clean, 688/689 tests pass + 1 fail pré-existant (`transformers.test.ts`). 2 fichiers modifiés : `src/components/shared/PageTransition.tsx` (-2 LOC nettes), `src/index.css` (+13 LOC : keyframe + classe + 1 ajout liste reduced-motion).*

*Précédente : §254 livré (2026-05-10) — Audit perf pass 2 runtime — vérification mécanique post-§253 des 9 commits §239→§253 + identification d'1 régression critique. **Composite mesuré 7.4/10** (vs 6.1 pass 1, +1.3) — gain réel inférieur à la cible 7.8/10 à cause d'une régression critique : le `dist/index.html` post-§253 contient toujours `<link rel="modulepreload" href="vendor-motion-DOqokx5n.js">` dans le critical path car `src/components/shared/PageTransition.tsx:1` (introduit en §246 sub-§A, **après §243**) importe `framer-motion` synchroniquement et est consommé par `AppLayout.tsx:11`. **Le gain §243 (-38.27 KB gzip TTI critical path) est annulé**. Fix §255 P0 : réécrire PageTransition en CSS `@keyframes` (effort XS, ROI maximal). 16/19 claims §239→§253 confirmés (§241 SW -1485 KiB, §244 retry, §247 RPC, §248 persistRQ, §249 sonde, §251/§252 10/12 mutations queue, §253 memo). 3 gaps : régression §243↔§246, `withTimeout` 3/40+ modules (Dashboard/Coach/Records/Login non couverts par §244), §239 #1 gif precache inerte (no-op repo). Plan post-pass-2 : P0 §255 PageTransition CSS, P0 §256 `withQueryTimeout` 5 hooks, P1 §257 mutations binaires/multi-étapes, P1 §258 extraction `<AthleteCard>`/`<RecordCard>` + memo. Pas d'edit code (audit lecture-seule). `docs/audits/2026-05-10-perf-audit-pass2-runtime.md` (NEW, 242 lignes).*

*Précédente : §253 livré (2026-05-10) — Chantier E sub-§A : `React.memo(SwimSessionTimeline)` (drapeau racine UX réseau instable / re-renders, audit perf pass 1). Le composant `SwimSessionTimeline` (590 LOC, rendu inline dans `SwimSessionView` + `Suivi`) re-render aujourd'hui à chaque keystroke de saisie de log inline. Wrap : `import { memo }` + renommage interne `SwimSessionTimelineImpl` + `export const SwimSessionTimeline = memo(SwimSessionTimelineImpl)` — drop-in compatible côté caller. **Bénéfice attendu : -50 à -80 % re-renders sur saisie active de logs** quand parents stabilisent props via `useCallback` (déjà le cas pour `updateManualLog`/`removeManualExercise` dans `SwimSessionView`). Hors scope (sub-§B + sub-§C reportées) : extraction `<AthleteCard>` de `CoachSwimmersOverview` (~150 LOC closure dans `.map`) + extraction `<RecordCard>` de `Records.tsx` — demandent refactor + audit React DevTools en runtime pour confirmer gain. tsc clean, 688/689 tests pass + 1 fail pré-existant. 1 fichier, +5 LOC.*

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
| 6 | Fix timers mode focus (PWA iOS background) | Haute | Faible | Fait (§343 ; clos §359) |
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

## 6. Fix timers mode focus (PWA iOS background) — ✅ CLOS (§359, 2026-06-01)

> **Statut : clos sans nouvelle implémentation.** L'affichage des timers est **déjà fiable** (fix posé en §343) ; le seul trou restant (alerte sonore de fin de repos écran verrouillé) a été **volontairement écarté** par décision coach (contraintes iOS, bénéfice marginal). Détail : `docs/implementation-log.md` §359.

### Problème historique

En mode focus (`WorkoutRunner`), les timers utilisaient à l'origine des `setInterval` **relatifs** (`setElapsedTime(t => t + 1)` / `setRestTimer(t => t - 1)`). Sur iPhone en PWA, iOS throttle/suspend les `setInterval` à l'écran verrouillé ou en arrière-plan → un repos de 90 s pouvait afficher 3-4 min en temps réel.

### Ce qui est déjà fait (§343, vérifié 2026-06-01)

Le fix proposé ci-dessous est **intégralement implémenté** dans `src/components/strength/WorkoutRunner.tsx` :

1. **Timer elapsed** — `elapsedStartRef = useRef(Date.now())` (L196) ; affichage `elapsed = Math.floor((Date.now() - elapsedStartRef.current)/1000) + elapsedPausedRef.current` (L250) ; pause/reprise via accumulateur `elapsedPausedRef`.
2. **Timer repos** — `restEndRef.current = Date.now() + duration*1000` (L586) ; affichage `remaining = Math.max(0, Math.ceil((restEndRef.current - Date.now())/1000))` (L275).
3. **Retour premier plan** — listener `visibilitychange` qui force un `tick()` immédiat sur les 2 timers (L256, L287).
4. **Persistance §343** — `startedAt` réinjecté au remount (le chrono ne se réinitialise pas).

→ L'affichage est toujours juste après un passage en arrière-plan iOS. Aucune dérive.

### Trou restant — écarté (décision coach §359)

L'**alerte sonore/vibration de fin de repos écran verrouillé** n'est pas couverte : `notifyRestEnd()` (bip Web Audio + `navigator.vibrate`, L48) part du `tick()` du `setInterval`, suspendu en arrière-plan iOS → pas de bip à l'instant exact (rejoué au retour via `visibilitychange`). Options et limites iOS :
- **Bip Web Audio pré-programmé** (horloge matérielle + contexte maintenu vivant) : marche écran verrouillé, **mais silencé par l'interrupteur Silencieux** ; `navigator.vibrate` **non supporté** sur Safari/PWA iOS.
- **Web Push** (`push-send` existe) : silencieux-proof mais timing à la seconde sur 90 s peu fiable + serveur + permission — disproportionné.
- **Wake Lock** : garde l'écran allumé (coût batterie).

**Décision : abandon.** L'affichage juste au retour + le bip belated suffisent en pratique (entraînement son activé). Si le besoin réémerge → rouvrir avec l'approche « bip Web Audio pré-programmé » comme point de départ.

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

## Backlog — Audit muscu matrice §305 (reste à faire)

> Issu de `docs/audits/2026-05-25-audit-muscu-matrice-complete-vs-elite.md`.
> **Déjà livré** : 100 m validé ✅ ; R1 papillon (mig `00196`) ; §306 zone aine
> défensive + préhab proactif event-aware (mig `00197`/`00198`) ; R3 dos + R6
> 100 m (mig `00199`). Ci-dessous le reste, non commencé.

### R4 — Profil fond 800/1500 distinct (🟠)
- **Problème** : tout ≥ 400 mappe sur `400plus`, qui reproduit l'ancien template **400 m**. L'ancien profil **demi-fond** (`{LP .4, UP .45, MOB 1.0}`) n'est plus exprimé → 800/1500 sur-puissés / sous-préhabilités.
- **Implémentation proposée** : préférer une nouvelle `distance_key` (`fond`/`800plus`) dans `strength_distance_profiles` (CHECK + 2 lignes season/inter, emphasis demi-fond + arc) **et l'exposer dans le sélecteur** `MesocycleGeneration.tsx` ; alternative = seuil dans `composeTemplate` abaissant `lower_power` au-delà de 800 m.
- **Complexité** : Moyenne (table + sélecteur UI). **Brainstorm conseillé.**

### R5 — Seau tronc/core (🟠)
- **Problème** : pas de 6e seau entraînable ; ondulation (papillon/4N), rotation (crawl/dos), gainage streamline ne sont pilotables qu'indirectement (dispersés dans `upper_strength`/`lower_strength`).
- **Implémentation proposée** : ajouter un bucket `trunk` à `StrengthBucket` + `EMPHASIS_BUCKETS`/`ALL_BUCKETS`, un mult par nage (`strength_stroke_signatures`) + emphasis par distance, taguer `dim_exercices.bucket='trunk'`, propager dans le moteur (scoring/priorisation/allocation/sélection) + UI. KPI tronc à définir (sinon score conservateur).
- **Complexité** : Haute (2 tables + `composeTemplate` + `mesocycleEngine` + catalogue + UI + tests). **Brainstorm + plan obligatoires.**

### Divers — `right_calf` absent du body-map (🟡)
- **Problème** : `BodySvg.tsx` n'a que `left_calf` → un mollet droit n'est ni déclarable ni contre-indiquable (asymétrie ; `dim_exercices` n'utilise aussi que `left_calf`).
- **Implémentation proposée** : +1 entrée `BODY_ZONES`/`BACK_POSITIONS` (`right_calf`) — label `zones.ts` déjà présent (« mollet D ») — + retag des exos mollet. Même forme que §306 Phase 1.
- **Complexité** : Faible.

### Validation coach (transverse)
- Les valeurs **de-novo / recalibrées** (papillon R1, dos R3, listes d'exos contre-indication aine + affinité brasse §306) sont **directionnelles** — à faire trancher par le coach. Toutes ajustables par une petite migration sur `strength_stroke_signatures` / `strength_distance_profiles` / `dim_exercices`. **Réversibles.**

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
