# Audit complet — Flux de génération & exécution du mésocycle muscu

> **Date** : 2026-05-30
> **Périmètre** : NAGEUR + COACH, de bout en bout (bilan → génération → ajustement → aperçu → confirmation → visualisation → exécution).
> **Axes** : (1) Robustesse (répétable, zéro bug, zéro régression cachée) · (2) Frictions UI/UX (compréhension + guidage).
> **Méthode** : 5 agents de lecture parallèles (moteur / API+RPC / UI visualisation / UI exécution / parcours coach), chaque finding vérifié `file:line` dans le code source. Le finding le plus sévère (autorisation `MesocycleAdjust`) a été re-vérifié manuellement par l'orchestrateur.
> **Statut** : PHASE 1 = AUDIT, lecture seule. **Aucun code corrigé.** Le plan de remédiation (§5) doit être validé avant tout patch.

---

## 1. Cartographie du flux de bout en bout

### 1.1 Parcours NAGEUR

| Étape | Écran / Route | Fichier | Sortie |
|-------|---------------|---------|--------|
| Bilan questionnaire | `/strength/questionnaire` | `StrengthQuestionnaire.tsx` | `updateAssessmentQuestionnaire` + pain reports |
| Bilan KPIs | `/strength/kpi-wizard` | `KpiWizard.tsx` | `recordKpiMeasurement` (idempotent `client_dedup_key` §315) |
| Entrée méso | onglet S'entraîner | `MesocycleEntry.tsx` (gate `canGenerateMesocycle`) | → génération |
| Génération | `/strength/mesocycle-generate` | `MesocycleGeneration.tsx` | écrit `sessionStorage['eac_pending_mesocycle_params']` |
| Aperçu + confirmation | `/strength/mesocycle-preview` | `MesocyclePreview.tsx` | exécute le moteur localement, `applyMesocycle(input, generated, startDate)` |
| Visualisation plan | onglet « Mon plan » | `MyPlanTab.tsx` → `MyPlanWeekCard` / `MyPlanSessionRow` / `MyPlanSessionSheet` | lecture `strength_planning_*` fusionnée |
| Détail séance | reader | `SessionDetailPreview.tsx` | aperçu items + durée (`estimateStrengthSessionDurationSeconds`) |
| Exécution | runner | `WorkoutRunner.tsx` → `RestScreen` / `RestSessionTab` / `RestExerciseTab` / `RestPerfsTab` → `SessionSummary` | `log_strength_set_atomic`, draft `unsavedDraftStore` |
| Récap | overlay « Wrapped » | `StrengthWrappedRecap.tsx` (§336) | lecture seule |

### 1.2 Parcours COACH

| Étape | Écran / Route | Fichier |
|-------|---------------|---------|
| Bilan physique | `/coach/strength-assessment[/:athleteId]` | `StrengthAssessmentScreen.tsx` (#310 corrigé §316) |
| Génération (cible imposée) | `/coach/mesocycle-generate/:athleteId` | `MesocycleGeneration.tsx` |
| **Ajustement mid-cycle** | `/strength/mesocycle-adjust/:athleteId` | `MesocycleAdjust.tsx` (§338) |
| Aperçu + confirmation | `/strength/mesocycle-preview` (payload `adjust`) | `MesocyclePreview.tsx` |
| Panneau de suivi | onglet Planning fiche nageur | `CoachMesocyclePanel.tsx` (revert) |
| Fiche nageur | `/coach/swimmer/:id` | `CoachSwimmerFullView.tsx` (#310 corrigé §326) |

### 1.3 Moteur & données (TS pur)

`mesocycleEngine.ts` (1687 l. : `scoreBuckets` → `prioritizeBuckets` → `allocateVolume` → `selectExercises` → `periodize` → `buildWeek`/`buildSession`/`buildPapSession` → `generateMesocycle`) · `composeTemplate.ts` (nage × distance) · `periodizationCycles.ts` · `phaseAtWeek.ts` · `adjustmentFactors.ts` · `sessionDuration.ts` (source unique de durée §339) · `mesocycleGating.ts` (`canGenerate` + `applyLikelySucceededDespiteError` §312).

### 1.4 RPC SQL

`apply_strength_mesocycle` (00172 → recréée 00200/00201/00211/**00212** « table rase ») : authz `app_user_id()`/`app_user_role()` → supersede → snapshot AVANT delete → DELETE fenêtre plan → matérialisation `strength_sessions` + `strength_session_items` + `slot_overrides` + `week_overrides`. `revert_strength_mesocycle` (00173) : DELETE + restore snapshot JSONB + notif athlète.

---

## 2. Tableau des FINDINGS priorisés

### Légende sévérité
**Bloquant** = casse le flux ou corrompt des données · **Majeur** = bug observable / friction forte / mauvaise donnée · **Mineur** = cosmétique, edge case rare, dette.

### 2.1 ROBUSTESSE

| ID | Sév. | Localisation | Cause racine (résumé) | Effort |
|----|------|--------------|------------------------|--------|
| **C1** | Majeur | `MesocycleAdjust.tsx:138` + `App.tsx:401` | Écran coach **sans garde de rôle** → un nageur atteint `/strength/mesocycle-adjust/:athleteId` et **auto-ajuste son propre plan** mid-cycle (décision réservée au coach par doctrine). **Pas d'escalade inter-athlète** : RPC `00212:73` + RLS « nageur own » bloquent toute action/lecture sur un AUTRE athlète. | S |
| **A2** | Majeur | `OfflineMutationSync.tsx:461` | `description: lastError instanceof Error` passe un **booléen** en ReactNode → description invisible quand tout le replay offline échoue. Devrait être `… ? lastError.message : String(lastError)`. | S |
| **A1** | Majeur | `MesocyclePreview.tsx:523` | `getActiveMesocycle` dans le `onError` de l'apply **non borné** (`withTimeout` absent) → toast d'erreur retardé jusqu'à ~60 s + fenêtre de double-apply (bouton déjà réactivé). Invariant §298 non appliqué au chemin de récupération. | S |
| **R1** | Majeur | `WorkoutRunner.tsx:606-656` | `handleReferenceSet` ne pose `isLoggingRef=true` qu'**après** l'await → double-tap sur « série de référence » = double 1RM upsert + double log `set_number:1`. La garde existe déjà dans `handleValidateSet:660` mais pas ici. | S |
| **R2** | Majeur | `Strength.tsx:643-659` + `OneRmGate.tsx:38` | `update1RM` (estimation 1RM) **non borné** → réseau instable = UI figée jusqu'au timeout TCP (~1-2 min). Invariant §298/§311 non appliqué. | S |
| **E1** | Majeur | `mesocycleEngine.ts:811` vs `:871` | `papPreferLegPower` calculé sur les slots **pré-swap**, devient périmé après `ensureFocusDevelopmentSession` (§327) → PAP gagne un exo `upper_power` superflu (4 items au lieu de 3) chez un sprinteur upper-dominant. Le flag doit être recalculé après le swap. | S |
| **E2** | Majeur | `phaseAtWeek.ts:19` + `strength-mesocycles.ts:547` | `phaseAtWeek` parcourt `nominal_weeks`, mais `periodize()` étire/compresse → divergence quand `targetWeekCount ≠ Σ nominal_weeks` : l'ajustement mid-cycle reprend à la **mauvaise phase** (saute une semaine de prépa). Limite §338, **deux algorithmes sur la même donnée**. | M |
| **C3** | Majeur | `MesocycleAdjust.tsx:217-219` | `getMonday(new Date(meso.generated_at))` : un timestamp UTC tardif (jeudi 22:30Z = vendredi local Paris) décale `startMonday` d'une semaine → `weeksRemaining` faux → gate « Aperçu » désactivé à tort en fin de cycle. **Pas de `start_date` stocké** ; approximation via `generated_at`. | M |
| **C4** | Majeur | `MesocycleAdjust.tsx:420-462` | `sessionsPerWeek` (RadioGroup) et `weekdays` (cases) **désynchronisés** : changer le radio ne met pas à jour les cases ; le moteur lit `weekdays.length`. Le coach croit régler 4 séances, en obtient 3. Aucun avertissement. | S |
| **C2** | Majeur | `MesocyclePreview.tsx:597, 663` | En mode ajustement, « Retour » / « Modifier les paramètres » naviguent vers `/strength/mesocycle-generate` (écran de **génération**, pas d'ajustement) → la config pivot/facteurs du coach est perdue. `params.adjust`/`params.athleteId` disponibles mais inutilisés. | S |
| **V1** | Majeur | `MyPlanTab.tsx:453` | Un seul guard de chargement (`foldersLoading`, Phase 1) → **flash des anciens cycles Phase 1** avant que le mésocycle (Phase 2) ne charge (cache froid). Les `isLoading` de `activeMesocycle`/overrides ne gardent pas la sélection de source. | S |
| **A3** | Mineur | `strength-mesocycles.ts:211,230,251,385` | `getMesocycle`/`getActiveMesocycle`/`listMesocycles`/`getMesocycleSessionsContent` : reads non bornés → spinner long sur connexion dégradée (écrans coach). | S |
| **A4** | Mineur | `mesocycleGating.ts:49` | `applyLikelySucceededDespiteError` : `createdMs >= attemptStartedAtMs` sans tolérance de dérive NTP → faux négatif (toast trompeur, méso superseded inutile). | S |
| **A5** | Mineur | `00173_revert.sql:99-118` | Edge case rare : `startDate` = samedi/dimanche → `week_override` semaine 1 **orphelin après revert** (fenêtre reconstruite depuis les slots, pas depuis les métadonnées du méso). | M |
| **E3** | Mineur | `periodizationCycles.ts:109` + `mesocycleEngine.ts:1569` | Schémas génériques `sets`/`reps`/`intensityPct1rm` **déclarés mais jamais appliqués** (seul `restSeconds` est clampé). Un 5×10 catalogue reste 5×10 en cycle puissance (sauf `pic`). | S |
| **E4** | Mineur | `mesocycleEngine.ts:107` | `scorePsychology` non clampé → input hors `[1,5]` (DB corrompue) produit un score négatif ou >100 propagé au raisonnement UI. | S (1 l.) |
| **R3** | Mineur | `WorkoutRunner.tsx:378-384` | Draft restore : `hasContent` ignore `difficulty`/`fatigue` ≠ 3 → la note de ressenti seule est perdue au kill PWA. | S |
| **R4** | Mineur | `WorkoutRunner.tsx:194-198` | Durée écoulée non persistée au draft → « Durée totale » fausse après kill+reprise (`elapsedStartRef` remis à `Date.now()`). `inProgressRun.started_at` serveur déjà disponible. | S |
| **R5** | Mineur | `RestSessionTab.tsx:62` | `Math.ceil(secsLeft/60)` vs `formatApproxMinutes`=`Math.round` → écart de 1 min sur la dernière minute (preview ≠ runner). Modèle §339 OK, divergence seulement à l'arrondi d'affichage. | S |
| **C5** | Mineur | `MesocyclePreview.tsx:516-538` | Payload ajustement non purgé du sessionStorage sur le chemin **erreur-toast** (purge seulement sur succès) → ancien payload au retour. | S |
| **V2** | Mineur | `MyPlanTab.tsx:281` | Ternaire mort : `relativeWeek != null ? \`S${weekNumber}\` : \`S${weekNumber}\`` → la position relative au plan n'atteint jamais l'affichage. | S |
| **V3** | Mineur | `strengthPhaseStyles.ts:21` + `MyPlanTab.tsx:338` | `detectPhase("")` → `"force"` par défaut → semaines sans `week_override` affichent un badge **FORCE rouge** trompeur. | S |
| **V4** | Mineur | `MyPlanTab.tsx:47` vs `useStrengthPlanByISO.ts:46` | Deux `buildWeekStarts` divergents (offset −1) → `queryKey` incompatibles → requête `slot_overrides` dupliquée entre Dashboard et Strength. | M |
| **R6** | Mineur | `RestSessionTab.tsx:147` | `isUpcoming` déclaré jamais utilisé (dead code). | S |

### 2.2 UX / FRICTION

| ID | Sév. | Localisation | Problème | Effort |
|----|------|--------------|----------|--------|
| **V5** | Majeur | `MyPlanTab.tsx:499-569` ; `MyPlanWeekCard.tsx:73` | **Aucune indication de position dans le cycle** (« Semaine 3/12 »), ni objectif (épreuve cible / `event_group`), ni durée totale. `getCurrentMesocyclePhaseInfo` existe mais n'est pas appelé côté nageur. | M |
| **V6** | Majeur | `MyPlanWeekCard.tsx:86` | Badge = `instance.phase.toUpperCase()` (clé enum brute « TAPER ») au lieu de `phaseName` (« Affûtage »). **Maintien et Affûtage indiscernables** (tous deux « TAPER »). | S |
| **V7** | Mineur | `Strength.tsx:1146` ; `SessionDetailPreview.tsx:121` ; `00172.sql:151` | En reader, badge rouge **« Force »** pour toutes les phases méso sauf prépa (legacy `cycle_type='force'`). La phase réelle (puissance) n'est pas affichée. | M |
| **V8** | Mineur | `MyPlanTab.tsx:499` ; `MesocyclePreview.tsx:490` | Après régénération/ajustement, **rien ne signale au nageur que son plan a changé** (toast fugace seul). `generated_at`/`updated_at` non surfacés. | S |
| **V9** | Mineur | `Strength.tsx:843` | État d'erreur expose `(error as Error).message` brut (« Failed to fetch ») au nageur. | S |
| **V10** | Mineur | `MyPlanWeekCard.tsx:65` ; `MyPlanSessionRow.tsx:25` | Boutons expand/collapse sans `aria-expanded`/`aria-label` ni `focus-visible`. | S |
| **C6** | Mineur | `MesocycleAdjust.tsx:353` | Label « Crawl **Fond m** » / « 400+ **m** » : suffixe `" m"` ajouté inconditionnellement aux labels non métriques. | S |
| **C7** | Mineur | `MesocyclePreview.tsx:1283,1298` | En mode ajustement coach, CTA affiche un texte **nageur-centré** (« ta planif », « ton coach ») + bouton générique « Modifier les paramètres ». | S |
| **UX1** | Mineur | `RestSessionTab.tsx:79,84` | Anneau : remplissage `(currentStep−1)/N` mais label `currentStep/N` → « 2/5 » avec anneau à 20 % se lit « 2 faits ». | S |
| **UX2** | Mineur | `RestSessionTab.tsx:136-140` | Rail vertical à 100 % pendant le repos du dernier exo (séance non terminée). | S |
| **UX3** | Mineur | `RestScreen.tsx:151-161` | Timer de repos sans `role="timer"`/`aria-live` → invisible au lecteur d'écran. | S |
| **UX4** | Mineur | `WorkoutRunner.tsx:453-492` | Confettis (`element.animate`) non gardés par `prefers-reduced-motion` (les autres animations le sont). | S |

---

## 3. Trous de couverture de tests le long du flux

| Zone | Couvert | **Trou** (un bug y passerait inaperçu) |
|------|---------|------------------------------------------|
| Moteur | 80 tests `mesocycleEngine.test.ts` + intégration ajustement | **Pas de test** sur l'interaction `papPreferLegPower` × `ensureFocusDevelopmentSession` (E1), ni sur la divergence `phaseAtWeek` vs `periodize` quand le plan est étiré (E2), ni sur les clamps de `scorePsychology` (E4) ou l'application des schémas génériques (E3). |
| API/RPC | `strength-mesocycles.test.ts`, `strength-mesocycles-phase.test.ts`, RLS `strength-mesocycle-rpc.test.ts` (17/17) | **Aucun test** ne vérifie que les chemins de récupération (`onError` → `getActiveMesocycle`, A1) ou les reads (A3) sont bornés. **Aucun test** sur la tolérance NTP (A4) ni l'orphelin revert week-1 (A5). |
| Garde de rôle | — | **Aucun test** ne vérifie qu'un écran coach refuse un rôle nageur (C1). Classe entière non testée (les routes ne sont pas testées pour l'autorisation). |
| Runner | `sessionDuration.test.ts` (16), `unsavedDraftStore.test.ts`, `strengthAtomicSet.test.ts` | **Pas de test** double-tap concurrent (R1), ni de borne timeout sur `update1RM` (R2), ni de fidélité durée/ressenti à travers un kill PWA (R3/R4). |
| Visualisation / Coach UI | `StrengthAssessmentScreen.vitest.tsx`, `MesocycleAdjust.vitest.tsx`, `CoachSwimmerFullView` #310 | **Aucun test** de cohérence du label de phase affiché (V6), de la synchro RadioGroup↔weekdays (C4), de la navigation retour en mode ajustement (C2), ni du flash Phase 1 (V1). |
| Bout en bout | — | **Aucun smoke-test e2e** du parcours complet bilan→génération→aperçu→apply→« Mon plan »→runner. Le « on corrige un bug, un autre apparaît » vient en grande partie de l'absence de ce filet. |

---

## 4. Synthèse — « pourquoi ça rejouait »

Cinq patterns récurrents expliquent la série de régressions historiques. Le but de la remédiation est de transformer chacun en **invariant testé** plutôt qu'en correctif ponctuel.

1. **React #310 (hooks après early return)** — §316, §326. *Bonne nouvelle* : les 5 écrans du périmètre sont aujourd'hui **propres** (vérifié). Pérenniser : lint `react-hooks/rules-of-hooks` en CI bloquant + le pattern de test ErrorBoundary déjà établi en mémoire.

2. **Calculs dupliqués d'une même grandeur** — §339 (durée). Reste : **phase/semaine en cours** calculée par `phaseAtWeek` (nominal) ≠ `periodize` (réel) (E2) ; **durée** affichée avec deux arrondis (R5) ; **buildWeekStarts** en double (V4). Invariant : *une grandeur = une fonction pure source unique* ; ici reconstruire la phase depuis le résultat `periodize` (déjà disponible sur `GeneratedMesocycle.weeks[].cycle`).

3. **État async non borné** — invariant §298/§311 appliqué sur `apply`/`revert` mais **pas** sur les chemins de récupération (A1), les reads (A3), ni le runner 1RM (R2). Invariant : *tout await sur un chemin réseau qui bloque l'UI doit être `withTimeout`* — vérifiable par un lint/grep CI sur `src/lib/api/strength*` et les handlers.

4. **Cache PWA confondu avec un bug de code** — §326-§330. Mitigé par `lazyWithRetry` + purge caches (§330). À garder en discipline : exiger `[EAC] Build:` + erreur console exacte avant de conclure à un bug.

5. **Frontières d'autorisation non testées** — C1 montre qu'un écran coach peut être ajouté sans garde, le filet RPC/RLS masquant l'absence de garde UI. Invariant : *toute route coach passe par un wrapper de rôle*, testé.

**Stratégie de robustesse durable** : (a) source unique par grandeur (phase, durée, week-starts) ; (b) borne `withTimeout` généralisée + lint ; (c) wrapper de rôle sur les routes coach + test ; (d) **un smoke-test e2e** du parcours complet ; (e) tests de régression ciblés pour E1/E2/R1/C2/C3/C4.

---

## 5. Plan de remédiation séquencé (à valider AVANT tout code)

Chaque correctif suivra ensuite le TDD + le workflow de doc obligatoire (numérotation § dans `implementation-log.md`). Séquencement par dépendance et par risque.

### Lot 1 — Sécurité & robustesse rapides (S, indépendants, fort ROI)
- **C1** : garde de rôle sur `MesocycleAdjust` (+ wrapper de rôle réutilisable pour les routes coach) — test rôle nageur → refus.
- **A2** : corriger `description` booléen → `.message`.
- **A1 + R2 + A3** : généraliser `withTimeout` sur les chemins de récupération, le runner 1RM et les reads.
- **R1** : garde de concurrence `isLoggingRef` avant l'await dans `handleReferenceSet`.
- **C2 + C5** : navigation retour mode-ajustement + purge sessionStorage sur erreur.
- **C4** : synchro RadioGroup↔weekdays + avertissement.

### Lot 2 — Source unique de la grandeur « phase / semaine en cours » (M, cœur du « ça rejoue »)
- **E2 + C3** : reconstruire la phase au pivot depuis le résultat `periodize` (et non `nominal_weeks`) ; stocker/lire un vrai `start_date` (migration colonne) pour supprimer l'approximation `generated_at`. **Débloque** ensuite l'affichage fiable « Semaine X/Y » (V5).
- **V6 + V7 + V3** : afficher `phaseName` (label métier) partout, supprimer le fallback « FORCE » trompeur.

### Lot 3 — Guidage nageur (UX, dépend du Lot 2 pour la position dans le cycle)
- **V5** : bandeau « épreuve cible · Semaine X/Y · phase » en tête de « Mon plan ».
- **V8** : ligne « Plan généré/mis à jour le … ».
- **V1 + V9** : guard de chargement complet + message d'erreur swim-friendly.
- **C6 + C7** : labels distance + textes CTA contextualisés coach.

### Lot 4 — Moteur & finitions (S/M, faible risque)
- **E1** : recalculer `papPreferLegPower` post-swap (+ test).
- **E3 + E4** : appliquer/retirer les schémas génériques ; clamp `scorePsychology`.
- **R3 + R4 + R5 + R6 + UX1-4 + V2 + V4 + V10 + A4 + A5** : dette runner/visu/a11y/edge cases.

### Lot 5 — Filet anti-régression (à faire en parallèle)
- **Smoke-test e2e** du parcours complet (bilan→apply→Mon plan→runner).
- Lint CI : `rules-of-hooks` bloquant + grep `withTimeout` sur les paths réseau bloquants.
- Tests de régression nommés pour E1, E2, R1, C1, C2, C3, C4.

---

> **Prochaine action attendue** : validation du périmètre et de l'ordre des lots (notamment : faut-il une migration `start_date` sur `strength_mesocycles` au Lot 2 ?), avant d'ouvrir le premier § d'implémentation.
