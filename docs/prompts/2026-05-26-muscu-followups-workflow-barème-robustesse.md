# Prompt — Suites §307 : workflow bilan unifié · barème medball · robustesse jour-aware · répétabilité

> À copier-coller dans une **nouvelle session fraîche** (`claude` à la racine du projet,
> `/Users/francoiswagner/Antigravity/Project-EAC/competition`). 4 chantiers issus de la
> revue post-§307. Lis le contexte, **audite avant de coder**, et traite-les dans
> l'ordre de priorité recommandé (§7).

---

Tu es **ingénieur produit + audit logiciel + spécialiste préparation physique** sur
**Suivi Natation V2 / Erstein Aquatic Club** (branche `main`). Le module muscu vient
de recevoir **§307** (générateur de mésocycle « jour-aware » : amorce PAP Lun/Jeu,
biais force le jour développement, 1re semaine partielle, sélecteur de jours+date).
Cette session traite **4 sujets de suite**, certains d'audit, certains d'implémentation.

Tu ne déploies pas localement, tu ne `git push` pas sans qu'on te le demande, et tu
suis le workflow de doc obligatoire (`CLAUDE.md`).

## 1. Contexte à charger (obligatoire, dans l'ordre)

1. `CLAUDE.md` — conventions (stack, RLS via `app_user_id()`/`app_user_role()`,
   migrations **via MCP Supabase** `mcp__plugin_supabase_supabase__apply_migration`
   projet `fscnobivsgornxdwqwlk`, déploiement GitHub Actions only, économie tokens,
   règles tests RLS, **`/frontend-design` OBLIGATOIRE pour toute UI**).
2. `docs/plans/2026-05-25-muscu-jour-aware-amorce-pap-design.md` **et**
   `docs/plans/2026-05-25-muscu-jour-aware-amorce-pap.md` — le design + le plan §307
   (le « pourquoi » : amorce PAP, biais force, jours Lun/Jeu = gros bassins).
3. `docs/implementation-log.md` — entrée **§307** (ce qui a été livré).
4. Les deux prompts d'audit antérieurs `docs/prompts/2026-05-23-audit-creation-mesocycle-friction.md`
   et `docs/prompts/2026-05-23-audit-parcours-mesure-coach-robustesse.md` — la cible
   produit des 2 modes (nageur autonome / coach-piloté) et la séance de mesure.

**Doctrine entraînement du coach** (à respecter dans toute conception muscu) :
fraîcheur/transfert d'abord ; grosses sollicitations bassin **Lun/Jeu/Sam** espacées
48-72 h ; **Lundi = amorce PAP** avant le sprint bassin ; **pas de muscu le samedi** ;
la force est le levier des sprinteurs ; jamais de muscu lourde la veille d'un gros bassin.

## 2. Chantier A — Workflow bilan→génération **unifié, enchaînable en une fois** (coach)

**Constat de départ.** Aujourd'hui le coach mène le bilan sur **4 écrans séparés et non
reliés**, avec re-sélection du nageur sur certains :
`/coach/questionnaire/:athleteId` → `/coach/kpi-wizard/:athleteId` →
`/coach/strength-assessment/:athleteId` (mobilité/mouvement) →
`/coach/mesocycle-generate/:athleteId` → `/strength/mesocycle-preview`.
Pas de fil conducteur, pas d'indicateur d'avancement, pas de CTA « étape suivante ».
Le statut `strength_assessments` passe `questionnaire_pending → bilan_pending → completed` ;
`canGenerateMesocycle` (`src/lib/strength/mesocycleGating.ts`) débloque la génération
dès `bilan_pending`.

**Cible.** Un **parcours guidé unique**, sur un seul appareil, enchaînant
questionnaire → KPIs → mobilité → génération **sans changement de contexte manuel** :
- contexte nageur **persistant** d'un bout à l'autre (sélection une seule fois) ;
- **fil d'avancement** visible (« Étape 2/4 », ce qui reste à faire) ;
- CTA « Continuer → » à la fin de chaque étape, avec reprise possible si interrompu ;
- réutilise les écrans existants comme étapes (ne pas réécrire le questionnaire / le
  KpiWizard / l'écran mobilité — les **orchestrer**).

**Périmètre** : `src/components/strength/StrengthBilanEntry.tsx`,
`src/pages/StrengthQuestionnaire.tsx`, `src/pages/KpiWizard.tsx`,
`src/pages/coach/StrengthAssessmentScreen.tsx`, `src/pages/MesocycleGeneration.tsx`,
`src/pages/MesocyclePreview.tsx`, `src/pages/coach/CoachSwimmerFullView.tsx`,
routing `src/App.tsx`. Vérifie comment chaque écran reçoit/persiste `athleteId`
(coach mode = `selectedAthleteId`/param d'URL).

**Approche** : c'est de l'UI/UX → **brainstorming d'abord** (1 écran orchestrateur vs
un state machine de bilan vs un stepper sur une route unique), puis **`/frontend-design`
obligatoire** pour l'implémentation. Décris d'abord le flux cible et les états (reprise,
étape sautée, profil incomplet) ; fais-toi valider avant de coder.

**Acceptation** : un coach mène le bilan complet d'un nageur tiers de bout en bout sans
taper d'URL ni re-sélectionner le nageau, avec progression visible ; aucun cul-de-sac ;
mobile-first (bord de bassin) ; `tsc`/`npm test`/`npm run build` verts.

## 3. Chantier B — Rendre le KPI `medball_vertical_throw` **fiable** (barème non-placeholder)

**Constat.** Le barème `medball_vertical_throw` (→ seau `upper_power`) est en confiance
**`placeholder`** dans `src/lib/strength/kpiBaremes.ts` — c'est le score le moins fiable
du bilan, remonté à l'aperçu par `computeLowestBaremeConfidence`
(`src/lib/strength/mesocycleEngine.ts`). Or l'audit matrice
(`docs/audits/2026-05-25-audit-muscu-matrice-complete-vs-elite.md`, §4-A) propose de
**monter** `upper_power` (papillon) → on muscle un seau dont le KPI est le plus incertain.
Le doublon de fragilité est à lever.

**Cible.** Un barème **sourcé/défendable** (sexe × bande d'âge) pour le lancer vertical
de medecine-ball, le passant en `transposed` (transposition argumentée) ou `solid`
(norme sourcée). Vérifie d'abord le **protocole** (`src/lib/strength/kpiProtocols.ts`) :
masse du ballon, position, ce qui est mesuré (hauteur ? distance ? unité) — un barème
n'a de sens que si la mesure est standardisée.

**Approche** : recherche externe (**WebSearch/WebFetch**, sources datées) de normes de
puissance/medecine-ball overhead/vertical throw par sexe (et idéalement âge). Si aucune
norme directe, transpose depuis un prédicteur proche en **documentant l'hypothèse** et en
gardant le flag `transposed` (ne mens pas sur la confiance). Aligne unité protocole↔barème.
Mets à jour les ancres + le flag `confidence` dans `kpiBaremes.ts`.

**Périmètre** : `src/lib/strength/kpiBaremes.ts`, `src/lib/strength/kpiProtocols.ts`,
éventuellement `src/lib/strength/kpiMeasurement.ts`. Données pures → tests `node:test`
(ajoute/maj le test du barème). Pas de migration (barèmes en TS).

**Acceptation** : `medball_vertical_throw` n'est plus `placeholder` ; la confiance affichée
à l'aperçu reflète la nouvelle source ; hypothèse de transposition documentée en commentaire ;
tests verts.

## 4. Chantier C — **Robustesse de la classification jour-aware** pour des sélections quelconques

**Question déclencheuse (coach).** Si le nageur coche **mardi + jeudi/vendredi** (donc
**pas de lundi**), le mécanisme d'allégement « du lundi » pose-t-il problème ?

**Ce qu'il faut savoir (état §307).** L'amorce PAP est pilotée par
`primerWeekdays = {0 (Lun), 3 (Jeu)} ∩ weekdays` — **les jours « gros bassin » sont
codés en dur Lun/Jeu** dans `MesocycleGeneration.tsx` (et par défaut dans le moteur,
`mesocycleEngine.ts`). Le biais force s'applique aux jours `developpement`. Il **n'y a
pas** de mécanisme d'allégement « lundi » distinct : l'allégement = le rôle `amorce_pap`
appliqué par jour-amorce. Donc, sans lundi coché, il n'y a simplement pas de séance lundi
à alléger (Jeudi reste amorce). **À vérifier** que c'est bien sans bug (pas de crash, pas
de NaN, plan cohérent) pour **tous** les sous-ensembles : aucun jour-amorce (ex. Mar/Mer/Ven
→ `primerWeekdays` vide → 0 PAP, tout en `developpement` — est-ce voulu ?), un seul, les deux.

**Le vrai trou à creuser.** Le modèle ne connaît **que** Lun/Jeu comme jours-amorce et
**ignore la contrainte « veille d'un gros bassin »** : un nageur qui coche **vendredi**
fait une séance `developpement` (potentiellement lourde, biais force) **la veille du gros
bassin du samedi** → sprint du samedi compromis. Idem un mardi lourd n'est pas la veille
d'un gros bassin (OK), mais un mercredi lourd est la veille du jeudi (gros bassin) →
problème. **La règle 48-72 h n'est pas appliquée à la sélection muscu.**

**Cible (décision de conception à brainstormer)** — choisir et implémenter l'une des pistes :
- (a) **Déclarer les jours « gros bassin »** du nageur (au lieu de coder Lun/Jeu/Sam en
  dur) → l'amorce et le « pas de lourd la veille » se dérivent de cette déclaration ;
- (b) à défaut, **avertir** quand un jour `developpement` tombe la veille d'un gros bassin
  (Mer→Jeu, Ven→Sam) et proposer un autre jour ;
- (c) garantir la **dégradation gracieuse** pour toute sélection (0/1/2 amorces, jours
  off-bassin seulement, etc.).

**Périmètre** : `src/lib/strength/mesocycleEngine.ts` (`classifyRole`, `primerWeekdays`,
force-bias), `src/lib/strength/mesocycleEngine.types.ts`, `src/pages/MesocycleGeneration.tsx`
(picker + warning), `src/pages/MesocyclePreview.tsx`. Tests `node:test` du moteur pour
chaque sous-ensemble de jours.

**Approche** : **audit d'abord** (reproduis mentalement/par test les sélections Mar/Jeu/Ven,
Mar/Mer/Ven, Jeu seul, etc. — y a-t-il un bug réel ou « juste » un gap de garde-fou ?),
puis **brainstorming** de la piste (a/b/c), puis implémentation (UI → `/frontend-design`).
Ne pas casser le mode legacy (gating derrière `weekdays`).

**Acceptation** : aucune sélection de jours ne produit de plan incohérent ; la contrainte
« pas de lourd la veille d'un gros bassin » est soit appliquée soit signalée ; tests couvrant
les sous-ensembles ; tsc/test/build verts.

## 5. Chantier D — **Répétabilité / idempotence** des générations en cours de semaine, multi-nageurs

**Question déclencheuse (coach).** Si je déploie de **nouvelles générations de plans en
cours de semaine pour d'autres nageurs**, tout le système est-il répétable ?

**Ce qu'il faut savoir (état §307).** La RPC `apply_strength_mesocycle` (migration
**`00200`**, déjà en prod) est **scopée par athlète** : `supersede` ne touche que
`WHERE athlete_id = p_athlete_id AND status='active'` ; le snapshot
(`strength_planning_snapshots`) et les overrides (`strength_planning_slot_overrides` /
`_week_overrides`) sont clés par `athlete_id` (+ `week_start`, `day_of_week`). Le moteur
est **déterministe**. La 1re semaine partielle saute les jours `< p_start_date` (param
`p_start_date date DEFAULT NULL`).

**Ce qu'il faut auditer (idempotence & cas limites)** :
- **Isolation multi-nageurs** : générer pour le nageur B ne doit rien toucher chez A
  (vérifier qu'aucune requête n'est non-filtrée par `athlete_id`). Concurrence : deux
  générations simultanées sur 2 athlètes distincts.
- **Re-génération mid-week pour le même nageur** : supersede de l'actif + snapshot +
  nouveaux overrides. Le **revert** (`revert_strength_mesocycle`) restaure-t-il bien le
  snapshot après une génération à départ **mid-week** (fenêtre `BETWEEN p_start_week_monday
  AND v_window_end`) ?
- **Slots orphelins pré-départ** : avec un départ mid-week, les jours **avant** `p_start_date`
  de la 1re semaine sont `CONTINUE`-és (non écrits). Si le nageau avait déjà un plan actif
  (superseded ici) avec des slots ces jours-là, **restent-ils affichés** (orphelins du plan
  superseded) ? Est-ce le comportement voulu (les jours avant le départ gardent l'ancien) ou
  faut-il nettoyer ?
- **Idempotence stricte** : ré-appliquer **deux fois** le même mésocycle (mêmes entrées,
  même `p_start_date`) produit-il le même état final (UPSERT `ON CONFLICT` sur slots/weeks) ?
- **Déterminisme moteur** : mêmes KPI/évaluation/jours/date → même plan.

**Périmètre** : `supabase/migrations/00200_mesocycle_weekday_aware_apply.sql` (corps RPC),
`supabase/migrations/00173*` (revert), `src/lib/api/strength-mesocycles.ts`, et le harness
RLS `supabase/tests/rls/strength-mesocycle-rpc.test.ts` / `strength-mesocycles.test.ts`.

**Approche** : **audit d'abord** (lecture RPC + SQL prod en lecture seule via
`mcp__plugin_supabase_supabase__execute_sql` si besoin, **sans muter la prod**). Si tu
identifies un correctif (ex. nettoyage des slots orphelins, ou un filtre manquant), propose-le,
puis applique via **nouvelle migration MCP** (incrémente `00201…`). Comme tu touches au
comportement de la RPC, **`npm run test:rls`** est pertinent (Docker requis — demande à
l'utilisateur de lancer Docker, cf. `CLAUDE.md`) : étends le harness pour couvrir départ
mid-week + supersede + revert + 2 athlètes.

**Acceptation** : un rapport clair « répétable OUI/NON + pourquoi », les cas limites
documentés, tout correctif livré avec test RLS, migration via MCP, prod non corrompue.

## 6. Conventions & garde-fous (rappel)

- **`/frontend-design` obligatoire** pour A et la partie UI de C.
- Migrations : fichier dans `supabase/migrations/00XXX_…` **ET** appliqué via MCP, même
  session ; jamais `supabase db push`. RLS via `app_user_id()`/`app_user_role()`.
- Tests : `npm test` (node:test + vitest scopé), `npx tsc --noEmit`, `npm run build`.
  `npm run test:rls` **uniquement** si tu touches policy/RPC/table RLS (chantier D), après
  `docker ps` (1×/session) et accord utilisateur pour lancer Docker.
- **Ne pas re-signaler** comme bugs les points déjà traités en §307 (gating legacy, amorce
  PAP, biais force, 1re semaine partielle, signature 12-arg backward-compatible).
- **Différé connu** : badges jour/rôle dans `MyPlanTab.tsx` (Task 4.3 §307) — si tu y touches,
  c'est un bonus, pas le cœur.
- Workflow doc obligatoire à chaque § livré (implementation-log + ROADMAP + FEATURES_STATUS
  + CLAUDE.md + files-map).

## 7. Priorité & séquencement recommandés

1. **C (audit) + D (audit)** d'abord — ce sont des vérifs de robustesse sur du code **qui
   vient d'être déployé en prod** ; ils peuvent révéler un must-fix (ex. lourd la veille d'un
   gros bassin, slots orphelins) à corriger vite.
2. **B** (barème medball) — petit, isolé, data-only, fort ROI (fiabilise un KPI affiché).
3. **A** (workflow bilan unifié) — le plus gros (UI/UX, plusieurs écrans) ; brainstorming +
   `/frontend-design` ; à faire en dernier ou en session dédiée.

Commence par un **checkpoint** après lecture du contexte : ta compréhension des 4 chantiers
+ pour C et D, les 2-3 cas limites que tu soupçonnes déjà. Puis attaque C/D en audit.
