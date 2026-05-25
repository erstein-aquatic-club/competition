# Audit transversal — Robustesse & perf (dont réseau) / UI-UX / Cohérence élite / Éditabilité — 2026-05-26

*Audit lecture seule de bout en bout de la génération de plans muscu + mesure du
bilan, branche `feat/coach-bilan-unifie` (post-§A). Tous les faits code/DB sont
vérifiés (`fichier:ligne`, sortie de commande, ou requête SQL prod projet
`fscnobivsgornxdwqwlk`, 2026-05-26). Bâti sur l'audit matrice
`2026-05-25-audit-muscu-matrice-complete-vs-elite.md` (findings non redécouverts —
vérifiés fermés ou ouverts via les tables LIVE).*

---

## Synthèse exécutive

| Axe | Verdict | Tendance |
|---|---|---|
| **Robustesse & perf** (moteur, RPC, perf lecture) | 🟢 Solide | §308 a fermé les orphelins ; perf bornée |
| **Robustesse réseau** (offline / dégradé / coupure) | 🟠 À durcir | Bilan **Supabase-only** ; `apply`/`revert` **non bornés** ; pas de garde-fou double-apply |
| **Cohérence élite** (matrice distance × nage × sexe) | 🟢 Largement fermée | **R1/R2/R3/R6 ont landé** (00196-00199) ; restent R4 (fond) + R5 (core) |
| **Éditabilité a posteriori** | 🟠 Fonctionnelle mais piégeuse | `mesocycle_id` préservé + revert propre ✅ ; **écrasement §308 silencieux** ❌ |

**Vérifs vertes (annexes)** : `npx tsc --noEmit` → **0** ; `npm test` → **1362/1362 node:test + 20/20 vitest** ; les correctifs élite R1/R2/R3/R6 confirmés **dans les tables prod** (pas les seeds).

### Top 5 frictions (impact terrain décroissant)

1. **🔴 Bilan Supabase-only — coach bloqué hors-ligne au bord du bassin.** Questionnaire, KPIs, bilan physique et `apply`/`revert` lèvent tous `Error('Supabase not available')` hors-ligne (`canUseSupabase()` garde). La file d'attente offline (`offlineQueue.ts` / `OfflineMutationSync`) **ne sert que la natation/chrono** — aucun chemin bilan. La persistance hybride annoncée (`CLAUDE.md`) ne couvre **pas** la mesure muscu.
2. **🟠 Écrasement §308 silencieux des édits coach.** Re-générer un méso purge le plan (et les ajustements manuels du coach) à partir de la date de départ — **aucun avertissement** sur l'écran génération/aperçu ni sur le bouton « Régénérer » de `CoachMesocyclePanel`. Comportement voulu, mais non signalé = piégeux.
3. **🟠 `applyMesocycle`/`revertMesocycle` non bornés (`withTimeout` absent).** Sur connexion coupée, le `await supabase.rpc(...)` peut traîner très longtemps → **spinner infini** sans cul-de-sac propre. Viole l'esprit de l'invariant §298 (awaits bornés sur les chemins apply).
4. **🟠 Régression fond ≥ 800 (R4) toujours ouverte.** `distance_key` s'arrête à `400plus` (SQL) → un 1500 reçoit le profil 400 m (`LP 0.60` vs demi-fond ~0.40, `MOB 0.80` vs ~1.0). Trop de puissance, pas assez de préhab pour le fond pur.
5. **🟠 Pas de seau tronc/core (R5).** Buckets LIVE = `lower_strength/lower_power/upper_strength/upper_power/mobility` uniquement (SQL `GROUP BY bucket`). La qualité transmissive du tronc (ondulation, rotation, streamline) reste pilotable seulement indirectement — plus saillant papillon/4N.

**Correctif borné proposé (code, sûr, testable) : envelopper `apply`/`revert` dans `withTimeout`** (cf. §1bis-A et Recommandations). Les autres correctifs (R4 fond, R5 core, garde-fou §308) sont des **décisions métier / UI** → proposés, à valider coach + `/frontend-design`.

---

## 1. Robustesse & perf

### 1.1 — Données partielles & cas limites — 🟢
- **KPIs partiels / `physical_tests` null** : le moteur tolère (`scoreKpi` → score 0 conservateur, `mesocycleEngine.ts:222`), `data_confidence` abaissée (`computeDataConfidence`), override sécurité douleur ≥3 / dysfonction → mobilité rang 1 (`mesocycleEngine.ts:170-189, 235-245`). Vérifié exhaustivement dans l'audit matrice §6 — **rien à rouvrir**.
- **Jours-aware §307, sous-ensembles** : `jourAware = !!(input.weekdays && input.weekdays.length > 0)` (`mesocycleEngine.ts:692`) ; absence ⇒ fallback `legacyWeekdays(sessionsPerWeek)` avec MAP + `[0..6].slice(0, n)` (`584-594`). Le **0-jour est gaté à l'UI** (`canSubmit` exige `weekdays.length >= 1`, §307), donc pas de division par 0 / NaN atteignable depuis l'écran. Couvert par `derivePlanByWeekDay.test.ts` + `strength-mesocycles.test.ts` + les 4 cas RLS §308.

### 1.2 — Idempotence & multi-nageurs (§308) — 🟢
- Re-génération mid-saison = **remplacement propre** (DELETE borné athlète × fenêtre snapshot, `00201`), isolation 2 athlètes, revert post-départ mid-week : **17/17 tests RLS** (`strength-mesocycle-rpc.test.ts`, §308). Surface convergente.
- **Edge ouvert documenté §308** (confirmé, non régressé) : un ancien plan strictement plus long que le nouveau laisse des slots **au-delà de `v_window_end`** (hors fenêtre de purge). Rare ; à garder en tête si un coach raccourcit fortement un plan.
- **Bord UI §308** (confirmé) : après revert, `getActiveMesocycle` renvoie `null` (`strength-mesocycles.ts:208-223`, filtre `status='active'`) alors que les slots restaurés s'affichent → le **bandeau « mésocycle actif » disparaît** bien que le plan soit là. Confusion mineure (cf. §4).

### 1.3 — Perf — 🟢 bornée
- **`MyPlanTab` ne lit pas « tous » les overrides** : `weekStarts = buildWeekStarts(PLAN_WEEK_COUNT)` avec `PLAN_WEEK_COUNT = 12` (`MyPlanTab.tsx:34,69`), et la lecture est **filtrée serveur** `.eq('athlete_id').in('week_start', weekStarts)` (`strength-planning.ts:74-75`). Le coût est borné à 1 athlète × 12 semaines, **pas** l'historique complet. Le « sans filtre mésocycle » de §308 était une question de **correction** (union d'anciens mésos chevauchants), réglée par le clean-replace — **pas un coût**.
- **`apply`** : nb d'INSERT = N semaines × séances/sem × ~items (≈5) + 1 méso + snapshot. Borné par la durée du plan. L'index `raw_payload->>'mesocycle_id'` (§294) sert le revert et `getMesocycleSessionsContent` (`strength-mesocycles.ts:375`).
- **React Query** : invalidations ciblées après apply (`MesocyclePreview.tsx:437-440`) ; code-splitting lazy en place (CLAUDE.md). Pas de N+1 détecté sur les chemins audités.

---

## 1bis. Robustesse réseau (offline / dégradé / coupure)

### A. Coupure pendant une écriture — comportement par chemin

| Écriture | Type | Reprise sûre ? | Hors-ligne | `withTimeout` |
|---|---|---|---|---|
| `updateAssessmentQuestionnaire` | `UPDATE … .eq(id) .select('id')` | ✅ idempotent (même ligne) + détecte no-op §113 | ❌ throw | ❌ absent |
| `updateAssessmentPhysicalTests` | `UPDATE … .eq(id) .select('id')` | ✅ idempotent + no-op §113 | ❌ throw | ❌ absent |
| `upsertStrengthAthleteSettings` | `UPSERT onConflict athlete_id` | ✅ idempotent | ❌ throw | ❌ absent |
| `recordKpiMeasurement` | **`INSERT` append-only** | ⚠️ **lost-ACK ⇒ doublon** | ❌ throw | ❌ absent |
| `applyMesocycle` (RPC 12-arg) | transactionnelle | ⚠️ pas de garde double-apply | ❌ throw | **❌ absent** |
| `revertMesocycle` (RPC) | transactionnelle | ✅ (revert d'un méso non-actif throw) | ❌ throw | **❌ absent** |

Preuves : `strength-assessments.ts:103,121,166` ; `strength-kpi.ts:28-45` ; `strength-mesocycles.ts:141,178`.

- 🟠 **`apply`/`revert` non bornés.** Le RPC `apply` matérialise N semaines (longue) ; un `await supabase.rpc(...)` brut (`strength-mesocycles.ts:144,180`) sur connexion coupée n'a **aucun timeout client** → le bouton reste `disabled={pending}` (`MesocyclePreview.tsx:1160,1168` — pas de double-clic, bien) mais le **spinner peut traîner indéfiniment** jusqu'au timeout TCP. L'invariant projet (`reconcile-hang-budget`, §298 : awaits bornés sur apply/revert/reconcile/replay) **n'est pas respecté** ici. **Correctif borné** : `withTimeout(supabase.rpc(...), 30_000, 'apply_mesocycle')` (apply long → 30 s ; revert → 15 s), `catch` → toast « Réessaie ». Le `getNonWeightExerciseIds` (§298) montre le pattern exact (`strength.ts:71`).
- 🟠 **Pas de garde-fou double-apply (cas limite prioritaire).** Serveur réussit + client time-out + retry ⇒ chaque `apply` crée **une nouvelle ligne méso + supersede la précédente** (§308 le documente). Avec le clean-replace la **surface converge** (slots du dernier apply), donc **pas de corruption**, mais on accumule des mésos superseded + templates orphelins (filet revert) et, après un double-apply, un revert restaure un snapshot intermédiaire (bandeau `null`, §1.2). Le bouton `disabled` bloque le double-**clic**, pas le **retry après erreur**. **Reco** : avant `apply`, vérifier un actif très récent (`getActiveMesocycle` + delta < N s) ou passer une clé d'idempotence à la RPC.
- 🟡 **`recordKpiMeasurement` lost-ACK.** `INSERT` append-only sans contrainte d'unicité (`strength-kpi.ts:31`). Le `KpiWizard` retry **uniquement les KPIs échoués** (`failedKeys`, `KpiWizard.tsx:167-171,317-323`) — robuste contre la re-soumission d'un KPI **acquitté**, mais **pas** contre le cas « INSERT commité, ACK perdu » → le retry ré-insère ⇒ **doublon**. Cosmétique (`getLatestKpiMeasurements` prend le plus récent), mais le commentaire « append-only, retry uniquement des échoués » survend légèrement la garantie. Sévérité faible.

### B. Fallback localStorage — ❌ absent pour le bilan
La file offline existe (`offlineQueue.ts`, `offlineSync.ts`, `OfflineMutationSync.tsx`, `chrono-save-queue.ts`) mais **aucun fichier bilan/génération ne l'utilise** (grep : zéro référence dans `strength-assessments.ts`, `strength-kpi.ts`, `strength-mesocycles.ts`). Tous les wrappers gardent `if (!canUseSupabase()) … throw / return null`. **Conséquence terrain** : au bord du bassin hors-ligne, le coach **ne peut pas** noter la mobilité / saisir les KPIs / appliquer un méso et synchroniser plus tard — il est **bloqué**. C'est la friction terrain n°1. Faisabilité d'une file : les 3 écritures non-KPI sont idempotentes (UPSERT/UPDATE même ligne) → rejouables sans risque ; le KPI INSERT demanderait une clé de déduplication.

### C. Awaits bornés (invariant §298) — ✅ sur reconcile/replay, ❌ sur apply/revert
- ✅ `reconcileStrengthRunLogs` / replay offline : `getNonWeightExerciseIds` borné `withTimeout(getExercises(), 10_000)` (`strength.ts:67-71`, fix post-§298) ; `logStrengthSet`/`save_strength_run_atomic` bornés (`strength.ts:626,882`). Les chemins §307/§308/§A **n'ont ajouté aucun await reconcile/replay non borné**.
- ❌ `apply`/`revert` (mutations utilisateur, pas reconcile) — non bornés (cf. A). À aligner sur l'invariant.

### D. PWA / service worker — ✅ conforme
`vite.config.ts:36-58` : `registerType:'prompt'`, `skipWaiting:false`, `clientsClaim:false`, `cleanupOutdatedCaches:true` ; `main.tsx:15-44` : update **gaté** via `UpdateNotification` (event `pwa-update-available`), check périodique 1 h (pas sur `visibilitychange` → évite la page blanche iOS PWA), `applyUpdate` **purge tous les caches** avant `skipWaiting`+reload. Conforme à `CLAUDE.md` § Cache bust (« pas de SW sans mise à jour auto »). **Les appels Supabase ne sont pas cachés** (runtimeCaching = fonts + assets seulement) → cohérent avec « offline = pas de données » (point B). Aucun anti-pattern.

### E. Réseau lent (3G dégradé) — ⚠️ partiel
Les écrans gèrent vide/chargement/erreur (cf. §2), mais l'`apply` long sans `withTimeout` (point A) = **pas de feedback de progression** au-delà du spinner ni de borne. Bouton non re-cliquable ✅. Reco : borne + message « Mise en place de N semaines… » pendant l'attente.

---

## 2. UI/UX (par écran × état × rôle, mobile)

### Parcours bilan coach unifié §A — 🟢
- `nextBilanStep()` + `useBilanSteps` (strip DRY, suppression de l'onglet courant) + « Continuer → » à chaque étape + CTA « Démarrer / Reprendre — [étape] » depuis `CoachSwimmerFullView` (impl-log §A). Reprise à l'étape courante OK. Bannière « Profil incomplet » précoce sur `StrengthAssessmentScreen` (`!isProfileComplete`). Skip-link KPIs. **Pas de cul-de-sac** détecté dans le flux.
- Illustrations ROM (`AssessmentRomIllustration`) : arcs SVG animés par score, fallback barre de stabilité pour axes qualitatifs. Angles **indicatifs** (calibrés par score, pas mesurés) — limite documentée §A, acceptable.

### Parcours nageur autonome — 🟢
- Déblocage à `bilan_pending` (`canGenerateMesocycle`, §299) ✅ ; bandeau confiance réduite sur `MesocyclePreview` (mobilité conservatrice). Entrée → questionnaire → KPIs → génération → aperçu → timeline cohérent.

### États par écran — 🟢 avec 1 réserve
- `MesocyclePreview` couvre explicitement : chargement (`PageSkeleton`), profil incomplet (`ProfileIncompleteScreen`, `462-464`), assessment requis (`466-468`), erreur moteur (`470-472`), **catalogue en erreur/vide** (`476-489` — message actionnable « préviens ton coach »), taxonomie non résolue (`491+`). Bon niveau de robustesse d'état.
- 🟡 **Réserve (§1.2)** : après revert, bandeau « actif » disparaît alors que les slots sont là → message trompeur. À clarifier (afficher « plan restauré, non rattaché à un mésocycle »).
- Mobile : tap targets `min-h-[48px]` sur `WeekdayPicker` (§307), sticky CTA pleine largeur (`MesocyclePreview.tsx:1170`). a11y `role=checkbox`/`aria-checked` sur les jours. Pas de régression relevée.

### Reco UI (passe par `/frontend-design`)
- Avertissement écrasement §308 (cf. §4) ; clarification bandeau post-revert.

---

## 3. Cohérence élite — matrice distance × nage × sexe

**Méthode** : valeurs `mult` / `emphasis` **lues en prod** (SQL 2026-05-26), recomposées via `composeTemplate.ts:42`. Comparées à l'audit matrice + correctifs landés depuis.

### 3.1 — Correctifs de l'audit matrice : statut LIVE

| Reco | Cible | Migration | Statut LIVE (SQL) |
|---|---|---|---|
| **R1** papillon `upper_power` ×1.05→1.35, `mobility` ×1.15→1.35 | `strength_stroke_signatures` | `00196_butterfly_signature_recalibration` | ✅ **LANDÉ** (`butterfly: UP 1.35, MOB 1.35, US 1.0, LS 1.0`) |
| **R2** zone adducteurs/aine déclarable + tag | body-map + `dim_exercices` | `00197_contraindication_groin_adductors` + `00198_stroke_prehab_affinity` (§306) | ✅ **LANDÉ** |
| **R3** dos `lower_strength` ×0.857→~0.95 | `strength_stroke_signatures` | `00199_audit_recalibration_r3_r6` | ✅ **LANDÉ** (`backstroke: LS 0.95`) |
| **R6** 100 m `upper_power` 0.60→0.65 | `strength_distance_profiles` | `00199` | ✅ **LANDÉ** (`100: UP 0.65`) |
| **R4** profil fond distinct ≥ 800 | `strength_distance_profiles` | — | ❌ **OUVERT** (`distance_key` s'arrête à `400plus`) |
| **R5** seau tronc/core | `composeTemplate` + tables | — | ❌ **OUVERT** (5 buckets, pas de core) |

**4 des 6 recos de l'audit matrice ont landé.** L'axe élite est largement fermé ; **R4 et R5** restent, toutes deux déjà cotées 🟠/effort moyen-élevé.

### 3.2 — Matrice de verdicts mise à jour (post-correctifs)

| Nage \ Distance | 50 | 100 | 200 | 400+ |
|---|---|---|---|---|
| Crawl | ✅ (nudge UP) | ✅ | ✅ | 🟡 fond ≥800 (R4) |
| Papillon | ✅ *(R1 a corrigé)* | ✅ *(R1)* | 🟢 | 🟢 |
| Dos | 🟢 *(R3 a relevé LS)* | 🟢 *(R3)* | ✅ | 🟡 fond (R4) |
| Brasse | ✅ *(R2 ferme l'aine)* | ✅ *(R2)* | ✅ | 🟡 fond (R4) |
| 4 nages | 🟢 | 🟢 | ✅ | 🟢 |

Le 🔴 sécurité brasse (aine non déclarable) et le 🟠 papillon de-novo de l'audit matrice sont **résolus**. Restent des 🟡 :
- **Fond ≥ 800 (R4)** : `400plus` = `LS .8 / LP .6 / UP .65 / US 1.0 / MOB .8`. Pour un 1500 (~15 min, aérobie), `LP .60` est trop haut (demi-fond ~.40) et `MOB .80` trop bas (préhab volume max ~1.0). `US 1.0` (force lourde = économie) reste juste. → rétablir un profil demi-fond pour `distance_key ≥ 800`.
- **Sprint_50 crawl `upper_power` 0.50** : nudge candidat (start/coulée/breakout). L'audit matrice cotait crawl 50 ✅ ; **non bloquant**, à arbitrer (le 50 papillon est désormais relevé par R1, ce qui réduit l'urgence côté crawl).
- **Core (R5)** : transversal, plus saillant papillon/4N.

### 3.3 — Barèmes (sexe × âge × tier) — 🟢
- **Sexe** : emphasis **non sexée** (correct, `composeTemplate` ne prend pas le sexe) ; seuls les **barèmes KPI** le sont (`kpiBaremes.ts`). Conforme élite (prédicteurs dryland identiques H/F). ✅
- **Medball §309** : barème reconstruit en **indice kg·m** (`transposed`, plus `placeholder`) ; `lowestBaremeConfidence` n'est **plus** tiré à `placeholder` par ce KPI → le seau `upper_power` (relevé par R1 au papillon) repose désormais sur un KPI défendable. **Cohérence R1 ↔ §309 validée** : on muscle un seau dont le KPI a cessé d'être le moins fiable.
- **Tier** : `shiftAnchors` (k = 0/0.18/0.35/0.5) + extrapolation au-delà de p90 (`kpiBaremes.ts:46-95`) → profils élite discriminables. `k(tier)` = estimations de départ à calibrer (déjà noté §303).

---

## 4. Éditabilité a posteriori (fine-tuning coach)

- ✅ **Préservation `mesocycle_id`** : `reconcileMesocyclePayloads` corrèle par `ordre`, préserve le `raw_payload` des items édités et **impose le tag aux items ajoutés** (`mesocycleItemPayload.ts`, §300 Part 1). `updateStrengthSession` ne force plus `raw_payload:null`. La RPC `update_strength_session_atomic` écrit déjà `raw_payload` (§298/§300). Atteignable via deeplink `getStrengthSessionForEdit` (§300 Part 2).
- ✅ **Revert après édition** : CASCADE via le tag, **zéro orphelin** — test RLS **T14** (`strength-mesocycle-rpc.test.ts`, §300).
- ✅ **Édition jour (slot override) / charge (`target_intensity`, gating 1RM §298)** : tiennent (UPSERT idempotent `strength-planning.ts:90`, threading `target_intensity` §298).
- 🟠 **Interaction §308 ↔ édition : écrasement SILENCIEUX.** Re-générer purge le plan (et les édits coach) à partir de la date de départ (comportement voulu §308, restaurable par revert), mais **aucun écran ne le signale** :
  - `MesocycleGeneration.tsx` — aucune détection d'un méso actif, aucun avertissement (grep : zéro `getActiveMesocycle`/`remplace`/`écras`).
  - `CoachMesocyclePanel.tsx:333-337` — « Régénérer » navigue **directement** vers la génération ; le seul dialog de confirmation (`confirmOpen`, `367+`) est pour le **revert**, pas la régénération.
  - `MesocyclePreview` apply — pas de « ceci remplace le plan actuel ».
  → **Réponse au mandat §4.4** : c'est **silencieux et piégeux**. **Garde-fou recommandé** (UI, `/frontend-design`) : quand un méso actif existe, bannière/dialog sur génération **ou** aperçu : « Régénérer remplacera le plan actuel à partir du {date}. Tes ajustements manuels de cette période seront perdus (récupérables via Annuler). »

---

## 5. Cycles longs vs courts inter-compétition — 🟢

`periodize` distribue les phases dans `[min,max]` du template (`structure.phases`). Vérif **Σmin ≤ `max_week_count` ≤ Σmax** sur les **8 profils LIVE** (SQL) :

| Profil | kind | Σmin | min_wc | max_wc | Σmax | Force ? | OK |
|---|---|---|---|---|---|---|---|
| 50 | season | 8 | 8 | 16 | 16 | force_max | ✅ |
| 50 | inter_competition | 5 | 5 | 8 | 8 | *(biais §307)* | ✅ |
| 100 | season | 8 | 8 | 15 | 15 | force_max | ✅ |
| 100 | inter_competition | 5 | 5 | 7 | 7 | *(biais §307)* | ✅ |
| 200 | season | 7 | 7 | 18 | 18 | force_max | ✅ |
| 200 | inter_competition | 5 | 5 | 8 | 8 | *(biais §307)* | ✅ |
| 400+ | season | 9 | 9 | 22 | 22 | force_max | ✅ |
| 400+ | inter_competition | 5 | 5 | 8 | 8 | **force_max** | ✅ |

- **Régression §293 (max_week_count désaligné) : fermée** (§294) — confirmé sur les 8 profils.
- **Bloc force court inter_competition** : les profils 50/100/200 inter_competition **n'ont pas** de phase `force_max` dans le template, mais le moteur applique un **biais force §307** sur les jours développement pour les distances sprint / force pure faible (`mesocycleEngine.ts:560-564, 701-725`, `forceBiasRequired`, dégradation gracieuse si 1RM inconnue). Le 400+ inter_competition garde `force_max` explicite (distance = économie/force lourde). **Cohérent.**
- **Affûtage/pic en fin d'arc** : présents sur tous les profils (`affutage` puis `pic`). **1re semaine partielle §307** : démarre mid-week sans casser la périodisation (skip des séances pré-`v_effective_start`, §307/§308). ✅

---

## Écart existant ↔ cible (tableau)

| Cible (§2 du mandat) | État | Écart |
|---|---|---|
| Moteur non-bloquant sous données partielles | ✅ | — |
| `apply`/`revert` idempotents, scopés athlète | ✅ (§308) | Edge plan-plus-long-que-nouveau (rare, documenté) |
| Lectures (timeline/planning) ne dégénèrent pas | ✅ | Bornées 12 sem. |
| **Non-bloquant sous réseau variable** | ❌ | Bilan **Supabase-only** ; `apply`/`revert` non bornés ; pas de garde double-apply |
| UI 2 rôles × tous états, sans cul-de-sac | 🟢 | Bandeau post-revert trompeur (mineur) |
| Emphasis défendable élite (toute la matrice) | 🟢 | R4 fond, R5 core, nudge sprint_50 UP |
| Barèmes sexés réalistes | 🟢 | `k(tier)` à calibrer (connu) |
| Édition coach préserve `mesocycle_id` + revert propre | ✅ | — |
| Écrasement §308 compréhensible/signalé | ❌ | Silencieux → garde-fou UI requis |

---

## Recommandations priorisées (impact × effort, max 7)

| # | Reco | Axe | Impact | Effort | Type |
|---|---|---|---|---|---|
| **1** | **Borner `applyMesocycle`/`revertMesocycle` avec `withTimeout`** (30 s / 15 s, `catch`→toast). Aligne sur l'invariant §298. | Réseau | Élevé | **Faible (code, 2 chemins)** | **Correctif borné — applicable de suite** |
| **2** | **Garde-fou avertissement écrasement §308** : bannière/dialog quand un méso actif existe, sur génération **ou** aperçu. | Éditabilité | Élevé | Moyen | UI `/frontend-design` + validation coach |
| **3** | **File offline bilan** (ou a minima message explicite « hors-ligne — mesure indisponible, reconnecte-toi ») : décider si la mesure poolside hors-ligne est un besoin réel. | Réseau | Élevé (si terrain) | Moyen-élevé | Décision produit |
| **4** | **Profil fond distinct ≥ 800 (R4)** : nouvelle `distance_key` (ou abaisser `LP`/relever `MOB` du `400plus` au-delà de 800). | Élite | Moyen | Moyen (mig `002XX` + sélecteur) | Migration MCP + validation coach |
| **5** | **Garde double-apply** : pré-`apply`, vérifier un actif très récent, ou clé d'idempotence côté RPC. | Réseau | Moyen | Moyen | Code + (option) RPC |
| **6** | **Seau tronc/core (R5)** : sortir ondulation/rotation/streamline de l'implicite. | Élite | Moyen | Élevé | Chantier (composeTemplate + tables + catalogue) |
| **7** | **Clarifier le bandeau post-revert** (`getActiveMesocycle=null` mais slots présents) + nudge optionnel `sprint_50` `upper_power`. | UI / Élite | Faible | Faible | UI + 1 `UPDATE` |

**Report (déjà documenté, ne pas re-litiger)** : volume 5 items/séance (décidé) ; règle 48-72h (chantier C) ; autorégulation/VBT ; `k(tier)` à calibrer ; medball iso-énergie (suivi masse constante).

---

## Annexes

### Commandes
```
$ npx tsc --noEmit        → 0 erreur (exit 0)
$ npm test                → 1362/1362 node:test + 20/20 vitest (exit 0)
$ npm run build           → (non relancé ; §A l'a validé OK ; aucun code modifié par cet audit)
```
*(Pas de `npm run test:rls` : audit lecture seule, aucune policy/RPC/table RLS touchée.)*

### Migrations vérifiées présentes
`00196_butterfly_signature_recalibration` · `00197_contraindication_groin_adductors` ·
`00198_stroke_prehab_affinity` · `00199_audit_recalibration_r3_r6` ·
`00200_mesocycle_weekday_aware_apply` · `00201_mesocycle_clean_replace`.

### SQL LIVE (extraits, projet `fscnobivsgornxdwqwlk`, 2026-05-26)
- `strength_stroke_signatures` : `butterfly {UP 1.35, MOB 1.35, US 1.0, LS 1.0, LP 1.15}` (R1 ✅) ; `backstroke {LS 0.95, MOB 1.333, UP 1.125}` (R3 ✅).
- `strength_distance_profiles` : `100 {UP 0.65}` (R6 ✅) ; `distance_key ∈ {50,100,200,400plus}` — **pas de fond** (R4 ❌). Σmin ≤ max_wc ≤ Σmax sur les 8 lignes (§5).
- `dim_exercices` buckets : `lower_power(17), lower_strength(19), mobility(15), upper_power(7), upper_strength(37)` — **pas de core** (R5 ❌).

### Méthode & garde-fous
Lecture seule ; chaque fait adossé à `fichier:ligne` / sortie commande / SQL. Aucun agent spawné (Grep/Read directs, cf. `CLAUDE.md` § Agents & coût). Findings de l'audit matrice **non redécouverts** — vérifiés fermés/ouverts via les tables LIVE. Capacités ambiguës marquées explicitement.
