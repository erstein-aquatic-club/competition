# Prompt — Audit du parcours de création de mésocycle (friction & vision produit)

> À copier-coller dans une **nouvelle session fraîche** (`claude` à la racine du
> projet). Audit en lecture seule, orienté **parcours utilisateur** et non
> robustesse technique (cf. l'audit technique antérieur
> `docs/audits/2026-05-20-audit-bilan-muscu-293.md`, déjà fait).

---

Tu es un ingénieur produit + audit logiciel. Tu interviens sur le projet
**Suivi Natation V2 / Erstein Aquatic Club**
(`/Users/francoiswagner/Antigravity/Project-EAC/competition`, branche `main`).

Ton mandat : **auditer le parcours complet de création d'un mésocycle de
musculation** (du questionnaire/tests jusqu'au cycle posé sur la timeline),
identifier les **points de friction**, et mesurer l'**écart entre l'existant
et la vision produit cible** ci-dessous.

Tu ne fais **aucune modification de code** sauf si on te le demande
explicitement. Tu lis, tu vérifies, tu rapportes.

## 1. Vision produit cible (la cible à atteindre)

Le flux doit servir **deux modes d'entrée** convergeant vers le même moteur :

### Mode A — Nageur en autonomie
Le nageur, seul, doit pouvoir :
1. remplir un **questionnaire** (douleurs, historique blessures, ressenti
   mobilité, état psychologique) ;
2. réaliser une **première séance de tests d'aptitudes physiques** (les 5 KPIs
   de force/puissance + auto-mesure) ;
3. obtenir un **mésocycle adapté à son épreuve** (sprint, demi-fond, etc.),
   construit automatiquement à partir de ce bilan, posé sur sa timeline.

### Mode B — Bilan piloté par le coach
Si le nageur **n'est pas à l'aise** pour faire ça seul, le coach doit pouvoir
**prendre 30 min – 1 h avec lui** pour réaliser le bilan ensemble :
- **mêmes fonctionnalités** : questionnaire, tests d'aptitudes, séance de
  mesure ;
- mais **piloté par le coach**, qui **initie la génération du cycle** à la
  place / avec le nageur.

### Dans les deux cas — Contrôle coach
Quel que soit le mode de génération, le coach doit pouvoir :
- **visualiser** le cycle généré (raisonnement auditable + plan détaillé) ;
- **l'adapter a posteriori** (éditer une séance, ajuster une charge) ;
- **le rejeter** si c'est un cycle généré en autonomie qui ne lui convient pas.

**La question centrale de l'audit** : *le flux actuel permet-il réellement ces
deux modes, et avec quelle fluidité ?* Identifie chaque friction et chaque gap.

## 2. Contexte projet à charger (5-10 min)

Lis ces fichiers dans cet ordre — c'est ta carte mentale :

1. `CLAUDE.md` — conventions (stack, règles agents, RLS, déploiement, économie tokens).
2. `docs/bilan-muscu-guide-utilisateurs.md` — **la vue utilisateur du flux** (le « quoi » sans jargon). C'est ta référence produit.
3. `docs/implementation-log.md` — lis les § **§285 → §298** (le flux a été construit en plusieurs étapes ; les §296-298 sont les fixes récents post-test réel).
4. `docs/plans/2026-05-18-bilan-muscu-moteur-generation-design.md` — design du moteur.
5. `docs/plans/2026-05-17-bilan-muscu-mesocycle-design.md` — design global du flux (Chantiers A/B/C/D/E).
6. `docs/audits/2026-05-20-audit-bilan-muscu-293.md` — l'audit technique déjà fait (findings encore ouverts à ne pas redécouvrir).

**Conventions critiques** :
- Stack : React 19 + TS + Vite + Tailwind 4 + shadcn/ui + Wouter (hash routing) + Supabase.
- RLS : helpers `app_user_id()` / `app_user_role()`, **jamais** `auth.uid()` directement.
- Project ID Supabase : `fscnobivsgornxdwqwlk` (MCP plugin `mcp__plugin_supabase_supabase__*` disponible).
- **UI/UX** : toute proposition d'écran ou de composant doit passer par `/frontend-design` (règle projet) — mais ici tu **audites**, tu ne construis pas.
- Ne **jamais** déployer localement ni `git push` pendant l'audit.

## 3. Périmètre — les écrans et briques du parcours

### Côté nageur
- `src/pages/StrengthQuestionnaire.tsx` (`/strength/questionnaire`) — questionnaire (douleurs `BodyHeatMap`, historique, mobilité, psycho).
- `src/pages/KpiWizard.tsx` (`/strength/kpi-wizard`) — saisie guidée des 5 KPIs (nageur **ET** coach ; vérifie le rôle réel).
  - `src/components/strength/kpi/KpiStopwatch.tsx` (§295) — chrono temps de vol intégré.
  - `src/components/strength/kpi/KpiAnimatedIllustration.tsx` + `illustrations/*` (§295) — démos animées.
- `src/components/strength/MesocycleEntry.tsx` — tuile d'entrée sur `/strength` (conditionnée par `assessment.status === 'completed'`).
- `src/pages/MesocycleGeneration.tsx` (`/strength/mesocycle-generate`) — choix épreuve / famille / durée / séances.
- `src/pages/MesocyclePreview.tsx` (`/strength/mesocycle-preview`) — aperçu + raisonnement + confirmation.
- `src/components/strength/MyPlanTab.tsx` — timeline « Mon plan » (cascade Phase 2 mésocycle > Phase 3 training_plan > Phase 1).
- `src/components/strength/SessionDetailPreview.tsx` — preview d'une séance (groupement warmup/main §296).
- `src/components/strength/WorkoutRunner.tsx` — mode focus exécution.

### Côté coach
- `src/pages/coach/StrengthAssessmentScreen.tsx` (`/coach/strength-assessment`) — bilan physique coach (notation mobilité/mouvement). **Vérifie : le coach peut-il aussi déclencher le questionnaire + KPIs + génération depuis ici ?**
- `src/components/coach/CoachActiveMesocyclesSection.tsx` (§296) — hub coach : liste des mésocycles actifs, deeplink onglet Planning.
- `src/components/coach/CoachMesocyclePanel.tsx` — visibilité + raisonnement + revert.
- `src/pages/coach/StrengthPlanningScreen.tsx` (`/coach/strength-planning`) — vue planification muscu (depuis §298, mode athlète = `MyPlanTab` ; mode groupe = `StrengthPlanningTimeline`).
- `src/pages/coach/CoachSwimmerFullView.tsx` — fiche nageur, onglet Planning héberge `CoachMesocyclePanel`.

### Moteur & données
- `src/lib/strength/mesocycleEngine.ts` — moteur (6 fonctions pures + chargement §297 par exercice).
- `src/lib/api/strength-mesocycles.ts` — wrappers (`generateMesocyclePreview`, `applyMesocycle`, `revertMesocycle`, `getActiveMesocycle`, `listActiveMesocyclesWithAthletes`, `getMesocycleSessionsContent`).
- `src/lib/api/strength-assessments.ts` — workflow d'évaluation (`createAssessment`, `getLatestAssessment`, statuts).
- RPC : `apply_strength_mesocycle`, `revert_strength_mesocycle` (SECURITY DEFINER, acceptent nageur OU coach/admin).

## 4. Axes d'audit (chacun → constats + frictions + gaps)

### 4.1 Parcours nageur autonome — bout en bout
Reproduis mentalement (ou via lecture du code) le chemin : carte d'entrée →
questionnaire → KPIs → (bilan coach requis ?) → tuile génération → preview →
confirmation → timeline.
- **Friction n°1 à creuser** : le nageur peut-il aller jusqu'au mésocycle
  **sans intervention coach** ? L'`assessment.status` doit passer
  `questionnaire_pending → bilan_pending → completed`. Or le passage en
  `completed` dépend de la **notation physique du coach**
  (`updateAssessmentPhysicalTests`). **→ Le nageur autonome est-il bloqué tant
  que le coach n'a pas noté sa mobilité/mouvement ?** C'est le point de friction
  le plus probable contre la vision « autonomie ». Documente précisément.
- Le questionnaire et les KPIs sont-ils découvrables sans qu'un coach ait
  « lancé un bilan » au préalable (`createAssessment`) ? Qui crée la ligne
  `strength_assessments` et quand ?
- Combien d'écrans / de taps entre « je veux un plan » et « j'ai un plan » ?

### 4.2 Parcours coach-piloté — existe-t-il vraiment ?
- Le coach a-t-il un **point d'entrée UI unique** pour mener une session de
  bilan complète avec le nageur (questionnaire + KPIs + génération) ? Ou doit-il
  jongler entre `/coach/strength-assessment`, `/strength/kpi-wizard` (en se
  faisant passer pour le nageur ?), et la génération ?
- **Gap probable** : il n'existe sans doute **pas** d'écran « le coach génère le
  mésocycle pour le nageur ». La RPC `apply_strength_mesocycle` l'autorise
  (auth coach/admin OK) mais y a-t-il un bouton/écran ? `MesocycleGeneration` /
  `MesocyclePreview` sont dans le module nageur (`/strength/...`) — sont-ils
  atteignables/utilisables par un coach pour un nageur tiers ? Vérifie le
  `athleteId` consommé par ces écrans (session courante vs nageur sélectionné).
- Le `KpiWizard` accepte coach + nageur : le coach peut-il saisir les KPIs POUR
  un nageur (sélection de cible) ? Idem questionnaire ?

### 4.3 Visibilité & contrôle coach a posteriori
- Le coach voit-il **tous** les mésocycles actifs (autonomes inclus) ? (cf.
  `CoachActiveMesocyclesSection` §296, RLS club-wide §293).
- Peut-il **éditer une séance** générée ? (les templates sont des
  `strength_sessions` standards — l'éditeur existant les ouvre-t-il ? depuis
  où ? quelle friction ?).
- Le **rejet** (`revertMesocycle`) est-il accessible, clair, réversible ? Le
  nageur est-il notifié ?
- **Adaptation a posteriori** : si le coach édite une séance d'un mésocycle,
  l'édition tient-elle (le `raw_payload.mesocycle_id` est-il préservé ? un revert
  ultérieur écraserait-il l'édition coach ?).

### 4.4 Cohérence & lisibilité du résultat
- L'aperçu (`MesocyclePreview`) et la timeline (`MyPlanTab`) montrent-ils la même
  chose ? Le coach (`StrengthPlanningScreen` mode athlète, §298) voit-il
  l'identique du nageur ?
- Le raisonnement (« le pourquoi ») est-il compréhensible pour un nageur seul,
  ou nécessite-t-il une explication coach ?
- Les notifications (génération → coach, revert → nageur) ferment-elles bien la
  boucle de communication ?

### 4.5 Onboarding & états vides
- Que voit un nageur qui n'a **jamais** fait de bilan ? Le chemin est-il
  évident ? (cf. `StrengthBilanEntry.tsx`, `QuestionnairePrompt`).
- Que voit un nageur avec **profil incomplet** (sex/birthdate manquants —
  requis par les barèmes) ? (cf. fix §293 `Profile.tsx`, écran « profil
  incomplet » sur `MesocyclePreview`).
- États d'erreur (catalogue vide, KPIs partiels, aucun groupe) : messages
  clairs ou culs-de-sac ?

## 5. Vérifs concrètes à exécuter

```bash
# Type check + tests + build (sanity de base)
npx tsc --noEmit
npm test
npm run build
```

Via MCP `mcp__plugin_supabase_supabase__execute_sql` (project `fscnobivsgornxdwqwlk`) :

```sql
-- 5.1 Workflow des assessments : combien à chaque statut, qui les crée
SELECT status, COUNT(*) FROM strength_assessments GROUP BY status;

-- 5.2 Mésocycles existants : qui les a générés (generated_by = nageur ou coach ?)
SELECT m.status, m.generated_by, u.display_name, m.event_group, m.kind,
       m.target_week_count, m.generated_at::date
  FROM strength_mesocycles m LEFT JOIN users u ON u.id = m.generated_by
 ORDER BY m.generated_at DESC;

-- 5.3 Un nageur peut-il avoir un assessment 'completed' sans notation coach ?
--     (physical_tests NULL mais status completed = autonomie possible ;
--      sinon = dépendance coach)
SELECT id, athlete_id, status,
       (physical_tests IS NOT NULL) AS coach_noted,
       (questionnaire IS NOT NULL) AS swimmer_filled
  FROM strength_assessments ORDER BY created_at DESC LIMIT 20;

-- 5.4 RPC apply : qui peut l'appeler (rappel auth)
SELECT proname, pg_get_function_arguments(oid)
  FROM pg_proc WHERE proname IN ('apply_strength_mesocycle','revert_strength_mesocycle');
```

## 6. Pièges connus (déjà corrigés — ne PAS les re-signaler comme bugs)

- **Timezone** : `toISODate` (local) au lieu de `toISOString().split` (UTC) — corrigé sur 13 fichiers en §296. Restent intentionnels : `Login.tsx:533`, `strength.ts:1049` (commentés).
- **Cascade MyPlanTab** : Phase 2 mésocycle prioritaire si `getActiveMesocycle` non-null (§296).
- **Library coach polluée** par les templates `[Méso …]` — filtrée via `description` (mig 00180/00182).
- **Naming séances** : `Force haut + Puissance bas` (§296), plus `[Méso XX] S03 …`.
- **Chargement** : warmup à 0% + %1RM par exercice + modulation cycle (§297, mig 00183/00184).
- **Vue coach = vue nageur** en mode athlète (§298).
- **Volume des séances** : décidé à 2 warmup + 2 primary + 1 complement = 5 items (validé utilisateur). Si tu penses que c'est trop pour préserver la fraîcheur natation, signale-le comme *recommandation*, pas comme bug.

## 7. Questions clés auxquelles le rapport doit répondre

1. **Le nageur peut-il vraiment être autonome ?** (oui/non + le blocage exact si non — probablement la notation physique coach obligatoire pour `completed`).
2. **Le mode coach-piloté existe-t-il en UI ?** (oui/non + les écrans manquants si non).
3. **Combien de points de friction** entre l'intention et le mésocycle posé, par mode ?
4. **Le coach garde-t-il le contrôle** (voir / éditer / rejeter) de bout en bout, pour les 2 modes ?
5. **Top 5 frictions priorisées** (impact × effort) + recommandations.

## 8. Livrable attendu

Un rapport markdown **sauvé dans `docs/audits/2026-05-23-audit-parcours-creation-mesocycle.md`**, structuré :

```markdown
# Audit parcours création mésocycle — 2026-05-23

## Synthèse exécutive
- Autonomie nageur : ✅ réelle / ⚠️ partielle / ❌ bloquée — pourquoi
- Mode coach-piloté : ✅ existe / ⚠️ contournement / ❌ absent — pourquoi
- Contrôle coach a posteriori : état
- Top 3 frictions prioritaires

## Parcours nageur autonome
- Schéma du flux réel (écrans, statuts, taps)
- Frictions (avec fichier:ligne / requête SQL à l'appui)

## Parcours coach-piloté
- Ce qui existe / ce qui manque
- Gaps UI précis

## Contrôle coach (visibilité / édition / rejet)
- …

## Onboarding & états vides / erreurs
- …

## Écart existant ↔ vision cible
| Capacité visée | État | Gap |

## Recommandations priorisées (impact × effort)
1. …  (max 7)

## Annexes
- Sorties tsc / test / build
- Requêtes SQL + résultats
```

## 9. Anti-patterns à éviter

- ❌ Ne **modifie pas** le code (lecture seule, sauf demande explicite).
- ❌ Ne **re-signale pas** les bugs déjà corrigés du § 6.
- ❌ Ne **spawn pas d'agents** sans nécessité (cf. CLAUDE.md § Agents & coût) ; Grep/Read directs pour la plupart des vérifs.
- ❌ Ne **devine pas** : si une capacité est ambiguë, écris « non vérifié — raison ».
- ✅ **Cite tes preuves** : `fichier:ligne`, sorties de commandes, lignes SQL.
- ✅ **Distingue** clairement *friction* (ça marche mais c'est pénible) de *gap*
  (ça n'existe pas) de *bug* (ça ne marche pas).
- ✅ **Priorise** par impact utilisateur, pas par élégance technique.

## 10. Budget

~1 h - 1 h 30 : lecture docs (20 min) + parcours du code des 2 flux (30-40 min)
+ vérifs SQL (10 min) + rédaction (20-30 min). Objectif : un rapport actionnable
qui débouche sur un plan d'amélioration du parcours, pas un inventaire.

---

**Démarre maintenant.** Premier livrable : un message de checkpoint après lecture
des docs du § 2 (« contexte chargé, voici ma compréhension des 2 modes cibles +
les 3 frictions que je soupçonne déjà »). Puis attaque les vérifs.
