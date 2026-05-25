Tu es **ingénieur produit + audit logiciel + spécialiste préparation physique de
haut niveau (natation)** sur **Suivi Natation V2 / Erstein Aquatic Club**
(`/Users/francoiswagner/Antigravity/Project-EAC/competition`, branche `main` —
après merge du chantier A « bilan coach unifié »).

Ton mandat est un **audit transversal, lecture seule d'abord**, de **toute la
fonctionnalité de génération de plans muscu et de mesure du bilan**, sur **4 axes** :

1. **Robustesse & performance** du moteur de génération et de tout ce qui l'entoure
   (RPC apply/revert, matérialisation planning, données partielles, cas limites,
   idempotence, **variations d'accès réseau internet : offline, dégradé, coupure en
   cours d'opération**, perf des requêtes).
2. **Frictions UI/UX** de bout en bout, pour les **2 rôles** (nageur autonome /
   coach-piloté) et **tous les états** (vide / chargement / erreur / profil
   incomplet / mobile bord de bassin).
3. **Cohérence élite mondiale/olympique** des propositions muscu pour **TOUTES les
   combinaisons distance × nage × sexe** : les plans générés sont-ils défendables
   face à ce qui se fait de mieux en préparation physique de sprinteurs/nageurs
   d'élite ? (emphases par seau, barèmes, périodisation, sélection d'exercices).
4. **Éditabilité a posteriori par le coach** : un coach peut-il **fine-tuner** un
   plan généré (éditer une séance, une charge, un exercice, un jour) **sans casser**
   le mésocycle (tag `mesocycle_id`, revert cohérent), y compris après les
   changements §307 (jour-aware) / §308 (remplacement propre) ?

Et en transverse : **cycles longs (`season`, 8-16 sem.) ET cycles courts
inter-compétition (`inter_competition`, 5-8 sem.)** — vérifier la cohérence de la
périodisation, du bloc force, de l'affûtage/pic et de la 1re semaine partielle pour
les deux familles.

Tu ne modifies pas le code **sauf** correctif clair et borné validé en cours de
route (cf. §7). Tu **cites tes preuves** (`fichier:ligne`, sorties de commandes,
lignes SQL).

---

## 1. Contexte à charger (lecture obligatoire, dans l'ordre)

1. `CLAUDE.md` — conventions (stack, RLS `app_user_id()`/`app_user_role()`,
   migrations **via MCP Supabase** projet `fscnobivsgornxdwqwlk`, déploiement
   GitHub Actions only, **économie de tokens**, règles tests RLS, `/frontend-design`
   obligatoire pour toute UI).
2. `docs/implementation-log.md` — lire **§285 → §309** (le flux a été construit puis
   durci ; les plus récents : §304 couplage niveau↔tier, §305 taxonomie nage×distance,
   §306 prehab ciblée, §307 jour-aware (PAP + biais force), **§308 remplacement propre
   de l'apply (anti-orphelins, mig 00201)**, **§309 KPI medball fiabilisé (lancer assis,
   indice masse×distance)**, §A bilan coach unifié + guidage amplitude).
3. **Audits déjà faits (NE PAS redécouvrir leurs findings — vérifier qu'ils sont
   fermés, et bâtir dessus) :**
   - `docs/audits/2026-05-25-audit-muscu-matrice-complete-vs-elite.md` — **la base de
     l'axe 3** : verdicts par nage/distance (100m ✅, papillon/dos/fond/brasse), gaps
     ouverts (régression fond ≥400, pas de seau tronc/core, `upper_power` sous-pondéré
     en `sprint_50`, préférence traction lestée aux tiers élevés).
   - `docs/audits/2026-05-23-audit-mesure-coach-robustesse.md` et
     `docs/audits/2026-05-23-audit-parcours-creation-mesocycle.md` — parcours mesure +
     2 modes (fermés par §299/§300/§302/§A — vérifier).
   - `docs/audits/2026-05-20-audit-bilan-muscu-293.md` — audit technique initial.
4. Designs : `docs/plans/2026-05-25-muscu-jour-aware-amorce-pap-design.md`,
   `docs/plans/2026-05-25-coach-bilan-unifie-design.md`,
   `docs/plans/2026-05-18-bilan-muscu-moteur-generation-design.md`.

**Conventions critiques** : React 19 + TS + Vite + Tailwind 4 + shadcn/ui + Wouter
(hash routing) + Supabase. RLS via helpers, jamais `auth.uid()` en subquery. Toute
proposition d'écran passe par `/frontend-design`. Ne **jamais** déployer ni `git push`
sans accord explicite.

---

## 2. Les 4 cibles (ce qui doit être vrai)

### A. Robustesse & performance
Le moteur déterministe (`mesocycleEngine.ts`) et son intégration (RPC, écrans)
restent **corrects, explicables, non-bloquants** sous données partielles et cas
limites ; les requêtes de lecture (timeline, planning coach) ne dégénèrent pas ;
`apply`/`revert` sont idempotents et scopés par athlète.

### B. UI/UX sans friction (2 rôles, tous états)
Sur mobile bord de bassin, le nageur autonome **et** le coach mènent leur parcours
sans cul-de-sac, avec messages clairs en états vide/chargement/erreur/profil
incomplet, navigation hash cohérente, retours arrière fiables, a11y de base.

### C. Cohérence élite (matrice complète)
Pour **chaque (distance × nage × sexe)**, l'emphasis par seau, le barème, la
périodisation et la sélection d'exercices doivent être **défendables face à la
littérature/pratique de préparation physique des nageurs d'élite**. Les barèmes
sexés (filles/garçons) reflètent les différences réelles ; les emphases NON sexées
(correct) restent cohérentes par épreuve.

### D. Éditabilité a posteriori
Le coach peut éditer une séance générée (exercices, charges, jour) ; l'édition
**préserve** `raw_payload.mesocycle_id` ; un revert ultérieur nettoie tout sans
orphelin ; le **remplacement propre §308** (purge à partir de la date de départ)
n'efface pas silencieusement une édition coach sans que ce soit compréhensible.

---

## 3. Périmètre

### Moteur & données
- `src/lib/strength/mesocycleEngine.ts` (+ `.types.ts`), `periodizationCycles.ts`,
  `composeTemplate.ts`, `mesocycleGating.ts`, `mesocycleItemPayload.ts`,
  `kpiBaremes.ts`, `kpiProtocols.ts`, `medballPower.ts` (§309), `jumpPower.ts`,
  `bilanProgress.ts` (§A).
- Tables de référence : `strength_distance_profiles`, `strength_stroke_signatures`,
  `strength_periodization_templates`, `dim_exercices` (tagging niveau/contre-indications/
  affinité prehab §306).
- RPC : `apply_strength_mesocycle` (mig **00201** §308, 12-arg, jour-aware §307),
  `revert_strength_mesocycle` (00173), `update_strength_session_atomic` (§298/§300).

### Écrans
- Nageur : `Strength.tsx`, `StrengthQuestionnaire.tsx`, `KpiWizard.tsx`,
  `MesocycleGeneration.tsx`, `MesocyclePreview.tsx`, `MyPlanTab.tsx`,
  `WorkoutRunner.tsx`, `MedballThrowInputs.tsx`/`VerticalJumpInputs.tsx` (§309/§295).
- Coach : `coach/StrengthAssessmentScreen.tsx` (+ bilan unifié §A), `BilanProgress.tsx`,
  `AssessmentScoreField.tsx` (+ illustrations amplitude §A), `CoachMesocyclePanel.tsx`,
  `CoachActiveMesocyclesSection.tsx`, `StrengthPlanningScreen.tsx`,
  `CoachSwimmerFullView.tsx`, `StrengthCatalog.tsx` (édition §300).

---

## 4. Axes d'audit détaillés

### 4.1 — Robustesse & perf
- **Données partielles** : aucun KPI / KPIs partiels / `physical_tests` null / catalogue
  vide / aucun groupe → le moteur tourne, abaisse `data_confidence`, ne bloque jamais ;
  override sécurité (douleur ≥3 / dysfonction → mobilité priorité 1).
- **Jour-aware (§307)** : rejouer **tous** les sous-ensembles de jours (0/1/2 amorces,
  jours off-bassin seuls, 1 seul jour, semaine partielle vide) → pas de NaN, plan
  cohérent. (Le gros du gap 48-72h a été tranché chantier C : pas de garde-fou requis —
  ne pas le rouvrir.)
- **Idempotence / multi-nageurs (§308)** : re-générer mid-saison = remplacement propre
  (vérifier qu'aucun orphelin ne subsiste, y compris l'edge « ancien plan plus long que le
  nouveau » au-delà de `v_window_end` — laissé ouvert en §308) ; isolation 2 athlètes ;
  double apply convergent. Note §308 : après revert, `getActiveMesocycle` = null alors que
  les slots sont restaurés → vérifier l'affichage (bandeau méso).
- **Perf** : nb d'INSERT par apply ; `MyPlanTab` lit **tous** les slot_overrides de
  l'athlète (sans filtre méso) — coût sur plusieurs semaines ? index
  `raw_payload->>'mesocycle_id'` (§294) utilisé par le revert ; staleness React Query ;
  code-splitting lazy.

### 4.2 — UI/UX (2 rôles × tous états, mobile-first)
- Parcours **bilan coach unifié §A** : enchaînement « Continuer → », reprise à l'étape
  courante, saut d'étape, bandeau profil incomplet précoce, guidage amplitude
  (illustrations + arcs d'angle) — fluide, sans cul-de-sac ?
- Parcours **nageur autonome** : entrée → questionnaire → KPIs → génération dès
  `bilan_pending` → aperçu (bandeau confiance) → timeline.
- Chaque écran : vide / chargement / erreur réseau / profil incomplet (sex/birthdate) /
  catalogue vide / KPIs partiels. Mobile : zones de tap, sticky bars, safe-area, focus
  mode. Navigation hash + deeplinks (édition §300, onglet Planning §296). a11y.
- **Toute reco d'écran/correctif UI → `/frontend-design`** (mais ici tu audites).

### 4.3 — Cohérence élite (MATRICE complète distance × nage × sexe)
**Bâtis sur** `2026-05-25-audit-muscu-matrice-complete-vs-elite.md` (ne pas redécouvrir).
- **Vérifier que les correctifs ont landé** : papillon (`upper_power`/`mobility` remontés,
  mig évoquées 00196/00199), dos `lower_strength`, brasse groin (§306). Recouper avec les
  valeurs **live** des tables `strength_stroke_signatures` + `strength_distance_profiles`
  (SQL), pas les seeds.
- **Étendre la matrice** : pour chaque distance (50/100/200/400+) × nage (crawl/papillon/
  dos/brasse/4N) × sexe, l'emphasis composée (`composeTemplate`) est-elle cohérente avec
  l'élite ? Cibler les **angles morts non couverts par l'audit précédent** et l'impact des
  ajouts depuis (§307 amorce PAP, §309 medball → seau `upper_power`).
- **Barèmes** (`kpiBaremes.ts`) : revue sexe × âge × tier de TOUS les KPIs, dont le
  **nouvel indice medball §309** (`transposed`, masse×distance) — les ancres sont-elles
  réalistes pour des nageurs d'élite ? Le `shiftAnchors` par tier place-t-il la barre
  élite au bon niveau ?
- **Gaps ouverts à trancher** : régression fond ≥400 (tout mappé sur l'ancien 400m), pas
  de seau **tronc/core**, `upper_power` sous-pondéré en `sprint_50`, **préférence** (vs
  simple disponibilité) de la traction lestée / power clean aux tiers élevés.
- **Correctifs** : la calibration vit dans 2 tables (`strength_stroke_signatures`,
  `strength_distance_profiles`) + les barèmes TS → un correctif élite = petite **migration
  MCP** sur ces tables (incrémenter `002XX`) OU édition `kpiBaremes.ts`, **validés par le
  coach** avant application (décision métier, pas paramètre).

### 4.4 — Éditabilité a posteriori (fine-tuning coach)
- Reproduire : générer un méso → éditer une séance via le deeplink §300
  (`getStrengthSessionForEdit` → catalogue) → vérifier `raw_payload.mesocycle_id`
  **préservé** (`reconcileMesocyclePayloads`), items ajoutés tagués, **aucun
  `raw_payload:null` réintroduit** (bug §300 Part 1 fermé).
- **Revert après édition** : nettoie l'édité + l'ajouté (CASCADE via le tag), zéro
  orphelin (cf. test RLS T14).
- **Interaction §308 ↔ édition** : une re-génération mid-saison (remplacement propre)
  **écrase** la fenêtre à partir de la date de départ → une édition coach y est perdue
  (restaurable par revert). Est-ce **compréhensible/signalé** au coach, ou silencieux et
  piégeux ? Recommander un garde-fou si besoin.
- Édition d'un **jour** (slot override) et d'une **charge/intensité** (`target_intensity`,
  gating 1RM §298) : tiennent-elles ?

### 4.5 — Robustesse réseau (offline / dégradé / coupure en cours d'opération)
L'app est utilisée **au bord du bassin** sur mobile (wifi/4G capricieux) et annonce une
**persistance hybride** (Supabase primary, **localStorage fallback offline** — cf.
`CLAUDE.md`). Vérifier le comportement du bilan + génération sous réseau variable :
- **Coupure pendant une écriture** : questionnaire submit (`upsertPainReports` +
  `updateAssessmentQuestionnaire`), `recordKpiMeasurement`, `updateAssessmentPhysicalTests`,
  `applyMesocycle` (RPC transactionnelle), `revertMesocycle`. Que voit l'utilisateur ?
  Donnée perdue silencieusement ? Message clair + possibilité de réessayer sans dupliquer ?
- **Pattern anti-duplication existant** : le `KpiWizard` insère en **append-only, sans
  fail-fast, retry uniquement des KPIs échoués** (`KpiWizard.tsx` ~303-352) — vérifier qu'il
  résiste vraiment à une coupure partielle (pas de double insert au retry). Les autres
  écritures (questionnaire, physique) ont-elles une garde équivalente ?
- **Apply RPC + timeout client** : si le **serveur réussit** mais le **client time-out**
  puis **retry** → risque de **double mésocycle** (supersede en cascade du méso fraîchement
  créé + nouveau). Y a-t-il un garde-fou (idempotency key, désactivation du bouton,
  vérification d'un actif récent) ? **Cas limite prioritaire.**
- **Fallback localStorage** : le module bilan/génération l'utilise-t-il réellement, ou
  est-il **Supabase-only** ? Si offline au bord du bassin, le coach peut-il **mesurer les
  KPIs / noter la mobilité** et **synchroniser plus tard**, ou est-il **bloqué** ? (Si
  bloqué, le signaler — c'est une friction terrain majeure ; recommander une file d'attente
  offline si pertinent.)
- **Awaits bornés (`withTimeout`)** : invariant projet — tout nouvel await sur les chemins
  apply/revert/reconcile/replay doit être **`withTimeout`-borné** (un await non borné a déjà
  gelé `npm test` 2 h, cf. §298). Vérifier les chemins récents (§307/§308/§A).
- **React Query** : `retry`, `staleTime`, comportement hors-ligne (données en cache vs
  spinner infini), invalidations après apply/revert sous réseau lent.
- **Service worker / PWA** (`dist/sw.js`, workbox) : comportement offline, **staleness du
  cache** (cf. `CLAUDE.md` § Cache bust — pas de service worker sans mise à jour auto),
  `index.html` no-cache.
- **Réseau lent (3G dégradé)** : états de chargement explicites, timeouts, **pas de
  cul-de-sac ni de spinner infini** ; l'apply matérialise N semaines (RPC longue) → feedback
  pendant l'attente, bouton non re-cliquable.

> **Comment tester sans casser la prod** : DevTools → Network throttling (Offline / Slow 3G)
> sur l'app déployée, ou simulation côté code (mock `client.ts` qui rejette/temporise) en
> `node:test`/vitest. **Ne jamais muter la prod** pour tester une coupure.

### Transverse — cycles longs vs courts inter-compétition
- `periodize` distribue les phases dans `[min, max]` du template ; vérifier pour
  **`season`** (8-16 sem.) ET **`inter_competition`** (5-8 sem.) : Σmin ≤ durée ≤ Σmax,
  `max_week_count` aligné (régression de l'audit §293 fermée §294 ?), présence du bloc
  **force** (le 7-sem. inter_competition substitue `force_max` aux semaines maintien via
  le biais force §307 — cohérent ?), **affûtage/pic** en fin d'arc, 1re semaine partielle
  (§307) qui démarre mid-week sans casser la périodisation. Cohérence de l'arc avec le
  calendrier de compétitions (`useCompetitionsByWeek`).

---

## 5. Vérifs concrètes

```bash
npx tsc --noEmit
npm test
npm run build
# RLS uniquement si tu touches policy/RPC/table RLS (Docker requis — demander à l'user) :
npm run test:rls -- strength-mesocycle-rpc strength-assessments
```

Via MCP `execute_sql` (projet `fscnobivsgornxdwqwlk`, **lecture seule**) :
```sql
-- Calibration LIVE (recouper avec l'audit matrice — pas les seeds)
SELECT * FROM strength_stroke_signatures ORDER BY stroke;
SELECT event_group, kind, min_week_count, max_week_count, structure
  FROM strength_distance_profiles ORDER BY event_group, kind;
SELECT event_group, kind, min_week_count, max_week_count, structure
  FROM strength_periodization_templates ORDER BY event_group, kind;
-- Cohérence Σmin ≤ max_week_count ≤ Σmax (long vs court)
-- Exercices élite servis par tier/niveau
SELECT nom_exercice, level, bucket, is_core FROM dim_exercices
 WHERE bucket IN ('upper_strength','lower_strength','upper_power','lower_power')
 ORDER BY bucket, level;
-- Profils incomplets (bloquent la génération)
SELECT COUNT(*) FILTER (WHERE sex IS NULL OR birthdate IS NULL) AS incomplets,
       COUNT(*) AS total FROM user_profiles;
```

---

## 6. Déjà traité — NE PAS re-signaler comme bugs
- Timezone `toISODate` (§296) ; autonomie nageur débloquée à `bilan_pending` (§299) ;
  mode coach paramétré `athleteId` (§299) ; édition coach atteignable + `raw_payload`
  préservé + revert cohérent (§300) ; vue coach = vue nageur (§298).
- Jour-aware §307 (amorce PAP Lun/Jeu, biais force, 1re semaine partielle, signature
  12-arg) ; **remplacement propre §308** (purge à partir de la date de départ — c'est le
  comportement VOULU, ne pas le re-signaler ; auditer seulement ses bords) ; **medball
  §309** (lancer assis, indice masse×distance, `transposed` — l'hypothèse iso-énergie
  est documentée et acceptée, suivi à masse constante).
- **Règle 48-72h / lourd la veille** : tranchée chantier C — le coach considère que
  seul le lourd **le jour J** (gros bassin) pose problème, **pas la veille (J-1)** ; le
  modèle est déjà sûr (Lun/Jeu = amorce légère, samedi off). **Ne pas rouvrir.**
- Volume 5 items/séance : décidé. Le signaler en *recommandation* si tu juges que ça nuit
  à la fraîcheur, pas en bug.

## 7. Démarche & livraison
- **Audit d'abord** (lecture seule, preuves). Distingue **friction** (pénible) / **gap**
  (inexistant) / **bug** (cassé) / **incohérence élite** (proposition discutable).
- Pour un **must-fix clair et borné** (ex. emphasis élite manifestement fausse, orphelin
  §308 résiduel, perte d'édition coach silencieuse) : **propose** le correctif, fais-toi
  **valider**, puis applique (migration MCP `002XX` + fichier `supabase/migrations/`, ou
  édition data TS, ou UI via `/frontend-design`), avec test. Workflow doc obligatoire.
- **Livrable** : rapport `docs/audits/2026-05-26-audit-robustesse-perf-elite-edition.md` :
  ```
  ## Synthèse exécutive (Robustesse [dont réseau] / UI-UX / Cohérence élite / Éditabilité — ✅⚠️❌ + top 5 frictions)
  ## 1. Robustesse & perf
  ## 1bis. Robustesse réseau (offline / dégradé / coupure — double-submit, fallback localStorage, awaits bornés, PWA)
  ## 2. UI/UX (par écran × état × rôle, mobile)
  ## 3. Cohérence élite — matrice distance × nage × sexe (tableau + verdicts + correctifs proposés)
  ## 4. Éditabilité a posteriori (fine-tuning coach)
  ## 5. Cycles longs vs courts inter-compétition
  ## Écart existant ↔ cible (tableau)
  ## Recommandations priorisées (impact × effort, max 7)
  ## Annexes (tsc/test/build/SQL)
  ```

## 8. Anti-patterns
- ❌ Ne modifie pas le code hors correctif validé. ❌ Ne re-signale pas le §6.
- ❌ Ne redécouvre pas l'audit matrice — bâtis dessus. ❌ Ne spawn pas d'agents sans
  nécessité (Grep/Read directs ; cf. CLAUDE.md § Agents & coût). ❌ Ne devine pas :
  capacité ambiguë → « non vérifié — raison ».
- ✅ Cite tes preuves. ✅ Priorise par impact (cohérence élite + robustesse d'abord).

## 9. Budget, séquencement & checkpoint
~2 h - 3 h. **Séquencement recommandé** : (1) robustesse [dont réseau offline/dégradé/
coupure §4.5] + cycles longs/courts (vérifs ciblées) ; (2) éditabilité (reproduction §300
+ interaction §308) ; (3) **cohérence élite
matrice** (le plus lourd — bâtir sur l'audit existant) ; (4) UI/UX (parcours + états). Si
le temps manque, **prioriser** et lister les vérifs différées plutôt que bâcler.

**Démarre par un checkpoint** après lecture du contexte : ta compréhension des 4 axes +
les 3-4 zones de fragilité que tu soupçonnes déjà (typiquement : régression fond ≥400 et
absence de seau core côté élite ; coût lecture `MyPlanTab` ; perte d'édition coach
silencieuse à la re-génération §308 ; barème medball §309 à valider pour l'élite ;
**double apply au retry après timeout réseau ; bilan bloqué hors-ligne si Supabase-only**).
Puis attaque l'audit.
