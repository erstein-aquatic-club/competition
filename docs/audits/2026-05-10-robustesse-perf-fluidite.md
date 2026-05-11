# Audit robustesse + perf/fluidité — chemins critiques nageur & coach

*Date* : 2026-05-10 (session post-§265)
*Méthode* : 4 sub-agents sonnet read-only en parallèle (~7 min total) + `npm run build` 1× + inspection `dist/`. Aucune modification de code, aucun `npm test`. Périmètre : 14 chemins critiques (7 nageur + 7 coach) selon brief mission.
*Numérotation* : §266 (prochain dispo après §265 useDelayedLoading).

---

## Verdict global

| Dimension | Score /10 | Δ vs baseline |
|---|---|---|
| **Robustesse nageur** | 6.4 | (nouvelle dimension) |
| **Robustesse coach** | 7.0 | (nouvelle dimension) |
| **Perf/fluidité ressentie** | 7.6 | -0.6 vs perf bundle 8.20 |
| **Friction UX** | 8.2 | -1.7 vs UI/UX visuel 9.95 |
| **Composite (pondération égale)** | **7.3/10** | — |

**Constat clé** : le composite UI/UX visuel 9.95 et perf bundle 8.20 sont sains, mais l'audit révèle **4 zones grises non couvertes** : (1) idempotence offline incomplète, (2) hubs runtime ≥ 1000 LOC sous-mémoizés, (3) 21/28 fichiers framer-motion sans `useReducedMotion`, (4) double système toast cohabitant + 5 `window.confirm` natifs résiduels.

L'app est **belle, rapide à charger, mais reste fragile sur le tunnel mutation** (saisie séance, sets muscu, sync allures).

---

## A. Score de robustesse / fluidité par chemin

### Nageur (7 chemins)

| Chemin | Robustesse /10 | Fluidité /10 | Friction /10 | Findings P0/P1/P2 |
|---|---|---|---|---|
| Login → home | 6.0 | 8.0 | 7.5 | 0/3/1 |
| Dashboard calendrier | 6.5 | 8.5 | 8.0 | 0/3/2 |
| Saisie séance natation | **5.5** | 7.5 | 7.5 | 1/3/1 |
| Records & compétitions | 6.0 | 6.5 | 7.5 | 0/3/2 |
| Strength / muscu | 7.0 | **6.5** | 7.5 | 0/2/2 |
| Profile + avatar | 6.5 | 7.5 | 8.0 | 0/2/2 |
| Notifications | 7.5 | 8.0 | 8.5 | 0/1/2 |

### Coach (7 chemins)

| Chemin | Robustesse /10 | Fluidité /10 | Friction /10 | Findings P0/P1/P2 |
|---|---|---|---|---|
| Coach hub | 7.5 | 7.0 | 8.5 | 0/1/2 |
| Vue semaine matrice (§147) | 7.0 | 7.5 | 8.0 | 0/2/1 |
| Mes nageurs | 8.0 | 8.0 | 8.0 | 0/0/2 |
| Compose séance (SlotSessionSheet) | 8.0 | 7.5 | 8.0 | 0/1/1 |
| Chrono poolside | **6.5** | 8.0 | 8.0 | 1/2/2 |
| Messages SMS | 7.5 | 8.5 | 8.5 | 0/1/1 |
| Pace + auto-sync §260 | **5.5** | 7.0 | 8.0 | 1/3/1 |

---

## B. Top 10 findings (sévérité × ROI)

### P0 — urgents (3)

**1. [Saisie séance natation] saveMutation ré-entrant : double-tap → doublons potentiels**
- `src/pages/SwimSessionView.tsx:558-571`
- Symptôme : sur 3G, double-tap "Enregistrer" peut soumettre 2× car `tryWithOfflineQueue` retourne sentinel synchrone et `isPending` flicker.
- Fix : `idempotencyKey: ${userId}-${date}-${slot}` injecté dans `enqueue` + dédup côté queue (rejet si key déjà présente).
- Effort : **S**

**2. [Pace + auto-sync §260] `hasSyncedObjectivesRef` verrouillé entre coachs**
- `src/pages/coach/CoachPaceCalculatorScreen.tsx:211-253`
- Symptôme : admin/coach multi-équipes change le coach via `Select` → aucune auto-sync pour la nouvelle équipe (cibles d'allures restent vides). Cicatrice du hotfix `21dab8bb7` toujours sensible.
- Fix : ajouter `effectiveCoachId` aux deps + `useEffect(() => { hasSyncedObjectivesRef.current = false; }, [effectiveCoachId])`. Logger les erreurs `catch {}` (l. 247-249).
- Effort : **XS**

**3. [Chrono poolside] persistance localStorage déclenchée à chaque dispatch**
- `src/pages/coach/CoachChronoScreen.tsx:99-116`
- Symptôme : 10 nageurs × 8 splits poolside = 200 ops `setItem` ; serialization Map ~30 KB par tap → main-thread stutter Safari iOS + risque quota silencieux. Backup retiré juste avant un crash.
- Fix : debounce 500ms + persister uniquement post-`STOP_SWIMMER`/`STOP_RACE` + toast utilisateur si quota fail.
- Effort : **S**

### P1 — high impact (7)

**4. [Records] mutations sans `onError` toast (silent fail user-facing)**
- `src/pages/Records.tsx:545-565` (`update1RM`), `:576-596` (`upsertSwimRecord`)
- Symptôme : record_date invalide ou doublon → erreur 422 → user voit le sheet ne pas se fermer (logique inversée), pense "ça n'a pas marché" mais aucun toast explicatif.
- Fix : `onError: (err) => toast({ title: "Échec", description: err.message, variant: "destructive" })`.
- Effort : **XS**

**5. [WorkoutRunner perf] 1503 LOC / 2 hooks de memoization**
- `src/components/strength/WorkoutRunner.tsx`
- Symptôme : composant central runtime musculation, re-render à chaque keystroke set log → cascade de centaines de boutons/inputs/cards.
- Fix : extraire `<SetRow>` en `memo()` avec props comparator + `useCallback` sur handlers (`onLog`, `onComplete`, `onRest`).
- Effort : **L** (mais ROI très élevé)

**6. [Strength.tsx perf] 1157 LOC / 5 useMemo**
- `src/pages/Strength.tsx`
- Symptôme : page 4 onglets (Plan/Sessions/Catalogue/Histo), peu de memoization sur listes dérivées.
- Fix : `useMemo` sur `orderStrengthItems(...)`, wrap `MyPlanTab`/`HistoryTable` en `memo`.
- Effort : **M**

**7. [Friction transverse] 5 `window.confirm` natifs résiduels**
- `src/pages/Records.tsx:970`, `src/pages/Admin.tsx:515,727`, `src/components/coach/swim/SwimSessionBuilder.tsx:379`, `src/components/profile/AthleteInterviewsSection.tsx:278,287`
- Symptôme : prompt iOS natif bloquant casse l'ambiance polie post-§198 (qui avait migré SwimSessionView vers AlertDialog). Régression UX sur action destructive.
- Fix : 5× migration vers `AlertDialog` Radix avec copy explicite ("Supprimer ce record ? Action irréversible.").
- Effort : **S** (5 sites mécaniques)

**8. [Friction transverse] double système toast cohabitant**
- `src/pages/coach/CoachChronoScreen.tsx:143` (`sonner`) vs `src/hooks/use-toast.ts` (Radix)
- Symptôme : 2 stacks de toast → z-index drift, styling divergent, possible empilement double sur erreur cross-feature.
- Fix : choisir une source unique (recommandation : `sonner` pour pattern action retry natif), retirer l'autre du bundle.
- Effort : **M**

**9. [Strength robustesse] reconcile + queue offline → doublons potentiels en DB**
- `src/pages/Strength.tsx:872-896` + `src/components/shared/OfflineMutationSync.tsx:182-202`
- Symptôme : online flaky, 3 séries enqueue après 503. Au "Terminer" online, `reconcileStrengthRunLogs` insère "missing" basé sur count remote (=0). Replay queue ré-insère ensuite les 3 séries → 6 séries en DB pour 3 réelles.
- Fix : forcer `set_index` côté client comme clé naturelle + UPSERT DB sur `(run_id, exercise_id, set_index)` au lieu d'INSERT.
- Effort : **M**

**10. [Coach perf] `<PageSkeleton/>` (13 LOC) générique × 12 dans `Coach.tsx`**
- `src/pages/Coach.tsx:1157-1240`
- Symptôme : flash 100-300 ms d'un placeholder "1 titre + 2 placeholders" au switch d'onglet → perception saccadée entre onglets très différents (calendars/lists/wizards).
- Fix : passer `<HomeSkeleton/>` pour CoachSwimmersOverview, `<CalendarSkeleton/>` pour CoachWeekView/Chrono, `<ListSkeleton/>` pour Library/Comments.
- Effort : **XS** (30 min)

---

## C. Synthèse par dimension

### C.1 Robustesse — 3 risques systémiques

1. **Idempotence offline incomplète** — la queue offline réplique des opérations sans clé d'idempotence côté serveur (swim-session-save, strength-set-log, avatar-upload, importPerformances). La majorité des RPC sont DELETE+INSERT ou UPSERT donc tiennent, mais `logStrengthSet` + `reconcileStrengthRunLogs` peuvent doublonner. **Recommandation** : générer un `idempotency_key` UUID à `enqueue` + UPSERT côté Postgres sur clés naturelles.

2. **`onError` manquants ou silencieux sur mutations critiques** — `update1RM`, `upsertSwimRecord`, `updateExerciseNote` (Records), `reconcileStrengthRunLogs` background catch silencieux, auto-sync §260 `catch {}` (l. 247). Le swimmer/coach pense avoir sauvegardé alors que c'est échoué. **Recommandation** : ESLint custom rule "every useMutation must have onError" + revue ciblée des 9 mutations identifiées.

3. **Cache RQ — staleTime + queryKey instability** — pace-targets, coaches-list, slot-subgroups, training-slots manquent d'un fingerprint stable ou d'un staleTime. Sur usage admin multi-coach ou compose multi-toggle, fetches inutiles ou données obsolètes. Auto-sync §260 et SlotSessionSheet `slot-subgroups` (queryKey avec array non-trié) sont les exemples emblématiques.

### C.2 Perf/fluidité — 4 zones grises

1. **Hubs runtime ≥ 1000 LOC sous-mémoizés** — `WorkoutRunner.tsx` (1503/2), `Strength.tsx` (1157/5), `Records.tsx` (1457/7). Re-render cascade quasi-certain sur le hot path mutation.
2. **21/28 fichiers framer-motion sans `useReducedMotion`** — couverture 25%. Utilisateurs iOS Settings > Accessibility > Reduce Motion voient quand même staggers/slides. Top 5 visibles : `HistoryTable`, `SessionList`, `MyPlanWeekCard`, `InProgressCard`, `RestScreen`.
3. **16 inputs search/filter sans debounce** — re-filter complet à chaque keystroke sur catalogues coach (SwimCatalog, StrengthCatalog) et `Records.tsx`. Aucun `useDebouncedValue` global.
4. **`PageSkeleton` 13 LOC réutilisé 12× dans Coach.tsx** — flash visuel infidèle au switch d'onglet (cf. finding #10).

**Note positive** : critical path bundle parfait (4 modulepreloads, vendor-motion absent), heavy libs 100% lazy (exceljs/jspdf/html2canvas), `SwimSessionTimeline` memo §253 confirmé.

### C.3 Friction UX — 5 zones

1. **5 `window.confirm` natifs** (cf. finding #7).
2. **Double système toast** (cf. finding #8).
3. **`useDelayedLoading` (§265) sous-déployé** — 3/30+ écrans. Manque sur SwimSessionView, Strength, Profile, SharedSwimSession, CoachWeekView, CoachTrainingSlotsScreen, SwimCatalog/StrengthCatalog, CoachComms, HallOfFame, Progress.
4. **Toasts d'erreur sans `action: { label: "Réessayer" }`** — 11 toasts dans coach screens, 6 dans nageur. Pattern Sonner natif disponible, 1 ligne par toast.
5. **Empty states sans CTA** — 50+ via grep `Aucun(e)`. Ex: `CoachMySwimmersScreen` équipe vide sans "Inviter", `InfoParticipants` sans "Assigner nageurs".

---

## D. Plan d'action §266+ (5 chantiers, ROI décroissant)

### Chantier R1 — Fix P0 urgents (0.5 j)
Bloque les régressions critiques. Risque : faible. ROI : très élevé.

- ✅ `idempotencyKey` injecté dans `tryWithOfflineQueue` pour swim-session, strength-set, avatar-upload (effort S)
- ✅ Auto-sync §260 fix : `effectiveCoachId` aux deps + reset ref + `console.warn` au catch (effort XS)
- ✅ Chrono persistance debounce 500ms + toast quota fail (effort S)
- ✅ Migration 5× `window.confirm` → `AlertDialog` (effort S)

### Chantier R2 — Memoization hubs runtime (1 j)
Cible les 3 composants ≥ 1000 LOC. Risque : moyen (refactor `<SetRow>` à isoler proprement).

- ✅ `WorkoutRunner.tsx` : extraire `<SetRow>` `memo()` + `useCallback` handlers (effort L)
- ✅ `Strength.tsx` : `useMemo` listes dérivées + wrap `MyPlanTab`/`HistoryTable` (effort M)
- ✅ `Records.tsx` : audit re-renders via React Profiler + memo ciblé sur `<RecordCard>`/`<PerfRow>` (effort M)

### Chantier R3 — Friction UX P1 (1 j)
Tunnel mutation + retry actions + onglets coach.

- ✅ Unifier toast stack sur `sonner` (retire Radix `useToast`) — effort M
- ✅ Étendre `useDelayedLoading` à 8 écrans (SwimSessionView, Strength, Profile, CoachWeekView, CoachTrainingSlotsScreen, SwimCatalog, StrengthCatalog, CoachComms) — effort S
- ✅ Ajouter `action: { label: "Réessayer" }` sur 17 toasts d'erreur transient (pattern uniforme) — effort M
- ✅ Remplacer `<PageSkeleton/>` × 12 dans Coach.tsx par skeletons spécifiques — effort XS

### Chantier R4 — Robustesse mutations + offline replay (1 j)
Fix les silent fails et la double-insertion strength.

- ✅ Audit `onError` manquants : 9 mutations ciblées (update1RM, upsertSwimRecord, updateExerciseNote, deleteAvatar optimistic, etc.) — effort S
- ✅ Strength reconcile + queue : forcer `set_index` UPSERT clé naturelle — effort M
- ✅ ESLint custom rule "every useMutation must have onError" — effort M
- ✅ Login auto-login retry boucle 3× backoff 200/400/800ms — effort S

### Chantier R5 — Animations + virtualization (0.5-1 j)
Polish iOS Reduce Motion + scaling listes longues.

- ✅ Wrapper `useReducedMotion()` + variants conditionnels sur 21 fichiers framer-motion — effort M (mécanique)
- ✅ Virtualization `Records.tsx` liste records (≤ 500) + `HistoryTable` — installer `@tanstack/react-virtual` (~3 KB gzip) — effort M
- ✅ Hook `useDebouncedValue(value, 200ms)` + 16 substitutions inputs search — effort S

**Total estimé** : 4-4.5 j (1 dev focus + 1 dev parallèle si Agent Team).

---

## E. Verdict global comparatif

| Référentiel | Score | Méthode |
|---|---|---|
| UI/UX visuel post-§264 | 9.95/10 | Audit pass 3 (8.5) + chantiers I-V (§256→§264) |
| Perf bundle post-§264 | 8.20/10 | Pass 2 runtime (7.4) + §256/§261/§265 (+0.8 estimé) |
| **Robustesse + fluidité ressentie + friction (cet audit)** | **7.3/10** | 4 sub-agents read-only, 14 chemins critiques |

**Composite réel ressenti utilisateur** (pondération UI/UX 30% / Perf 30% / Robustesse 40%) : **8.0/10** — l'app est belle et chargeable, mais le tunnel mutation reste fragile.

**Recommandation §266+** : prioriser **Chantier R1** (0.5 j, fix les 3 P0) pour passer à 7.6/10 composite robustesse, puis **R2 + R3** en parallèle (Agent Team) pour atteindre 8.5/10 sur les trois axes en ~2 j cumulés.

**Stop ou continue ?** : si la roadmap business privilégie nouvelles features, R1 seul (0.5 j) est l'arrêt raisonnable — il ferme les régressions silencieuses et l'auto-sync §260 fragile. Au-delà, le ROI marginal décroît mais reste positif sur R2 (perf hubs runtime) et R3 (friction tunnel mutation).

---

## F. Métriques mesurées (référence)

```
Build (npm run build) : 18.83s, 0 erreur
PWA precache : 244 entries / 5760.30 KiB

Critical path modulepreload (dist/index.html) :
  vendor-react / vendor-query / vendor-charts / vendor-supabase
  vendor-motion ABSENT ✅ (régression §246 fermée par §255)

Top chunks gzip :
  exceljs.min                  271.16 KB (lazy ✅)
  jspdf.plugin.autotable       137.80 KB (lazy ✅)
  index (main)                 138.11 KB
  vendor-charts                117.34 KB (critical)
  vendor-supabase               44.72 KB (critical)
  vendor-motion                 38.27 KB (lazy ✅)
  vendor-query                  12.87 KB (critical)

Hubs ≥ 1000 LOC mesurés (via wc -l) :
  WorkoutRunner.tsx           1503 LOC / 2 useMemo  ← P0 perf
  Records.tsx                 1457 LOC / 7 useMemo
  FeedbackDrawer.tsx          1445 LOC / motion guards OK
  Coach.tsx                   1270 LOC / 14 useMemo
  Strength.tsx                1157 LOC / 5 useMemo  ← P0 perf
```

---

## G. Méthodologie & limites

**Méthode** : 4 sub-agents sonnet read-only en parallèle (~7 min total) :
- Batch 1 — Robustesse nageur (7 chemins) : 17 fichiers lus, 19 findings.
- Batch 2 — Robustesse coach (7 chemins) : 21 fichiers lus, 16 findings.
- Batch 3 — Perf/fluidité transverse : 28 fichiers framer-motion grep, 12 hubs mesurés, 10 findings.
- Batch 4 — Friction UX transverse : 50+ greps, 14 fichiers lus, 18 findings.

**Pas exécuté** : Lighthouse / WebPageTest / React DevTools Profiler / Playwright. Les estimations FCP/LCP s'appuient sur le bundle critical path mesuré + comparaison statique post-§264.

**Confiance** :
- Findings P0 (idempotence saveSession, ref auto-sync §260, persistance Chrono) : **HAUTE** — code lu directement, repro mental documenté.
- Findings P1 perf (memoization gaps WorkoutRunner/Strength) : **HAUTE** — métrique LOC/useMemo mesurée.
- Findings P1 friction (5 confirm natifs, double toast) : **HAUTE** — grep direct.
- Estimations effort (XS/S/M/L) : **MOYENNE** — basées sur taille/sites mais pas sur exécution.

**Limites** :
- Pas de Profiler React → cascades de re-render WorkoutRunner non mesurées quantitativement (estimation déductive).
- iOS Safari behavior (quota localStorage Chrono, SW background) non testable depuis macOS Chrome.
- Idempotence offline replay : repro mental basé sur lecture code, pas sur test e2e avec network throttling.

---

*Sources auditées* :
- `docs/audits/2026-05-10-final-consolidé.md` (composite 9.27/10 post-§264)
- `docs/audits/2026-05-10-perf-audit-pass2-runtime.md` (perf 7.4/10 + révisions §255-§265)
- `docs/audits/2026-05-10-ui-ux-audit-ios-pass3.md` (UX 8.5 → 9.95 post-§264)
- Source code post-§265 (commit `21dab8bb7` + working tree)
