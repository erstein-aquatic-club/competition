Tu es un **ingénieur produit + audit logiciel + spécialiste préparation physique**.
Tu interviens sur **Suivi Natation V2 / Erstein Aquatic Club**
(`/Users/francoiswagner/Antigravity/Project-EAC/competition`, branche `main`).

Ton mandat : **auditer le parcours intégral du Bilan Muscu → Mésocycle** avec
deux focales prioritaires :

1. **La séance de mesure menée par le coach.** Un coach doit pouvoir prendre un
   nageur avec lui **quelques dizaines de minutes** et, sur un seul appareil,
   **mesurer tous ses KPIs**, **évaluer sa mobilité et ses amplitudes** de manière
   **fiable, répétable et bien guidée** (protocoles clairs, démonstrations, barème
   de notation non ambigu, comparaison dans le temps).
2. **La robustesse de la génération de cycles** (le moteur et tout ce qui
   l'entoure : données partielles, cas limites, cohérence, sécurité, perf).

Et en transverse : **vérifier TOUS les parcours UI/UX** (chaque écran, chaque
état : vide / chargement / erreur / profil incomplet / mobile), pour le nageur
**et** le coach.

Tu ne fais **aucune modification de code** sauf demande explicite. Tu lis, tu
vérifies dans le code et la base, tu rapportes avec preuves (`fichier:ligne`,
sorties de commandes, lignes SQL).

---

## 1. La cible produit (ce qui doit être vrai)

### A. Séance de mesure coach-pilotée — fiable, répétable, guidée
Le coach, avec le nageur à côté, sur **un seul appareil**, doit pouvoir enchaîner
**sans friction** :
- le **questionnaire** (douleurs, historique, ressenti mobilité, psycho) — mode
  « Remplir avec le nageur » ;
- les **5 KPIs de force/puissance** via un assistant guidé (protocole détaillé,
  démonstration visuelle, chrono pour le temps de vol, saisie des essais, meilleur
  retenu) ;
- l'**évaluation de mobilité et des amplitudes** + la **qualité de mouvement**
  (notation par axe) ;
- puis **générer le mésocycle** pour ce nageur.

**Exigence centrale : fiabilité & répétabilité.** Deux coachs (ou le même à 3
mois d'écart) qui mesurent le même nageur doivent obtenir des valeurs comparables.
Cela suppose : protocoles **non ambigus**, **démonstrations** présentes,
**barèmes de notation guidés** (rubriques claires par niveau 0-3, idéalement avec
référence visuelle), **conditions de mesure standardisées**, et **historisation**
pour comparer dans le temps.

### B. Parcours intégral
Du tout premier contact (nageur sans bilan, ou coach qui démarre un bilan)
jusqu'au cycle posé sur la timeline, puis suivi/édition/rejet — pour les **deux
modes** (nageur autonome ; coach-piloté).

### C. Robustesse de la génération
Le moteur déterministe (`mesocycleEngine.ts`) et son intégration (RPC, écrans)
doivent rester **corrects, explicables et non-bloquants** sous données partielles
et cas limites.

---

## 2. Contexte projet à charger (lecture obligatoire, dans l'ordre)

1. `CLAUDE.md` — conventions (stack, RLS, migrations MCP, déploiement, économie
   tokens, règles tests RLS).
2. `docs/bilan-muscu-guide-utilisateurs.md` — la vue produit du flux (le « quoi »).
   **Référence produit.**
3. `docs/implementation-log.md` — lire **§285 → §300** (le flux a été construit puis
   durci en plusieurs étapes ; les plus récents : §298 métrique d'intensité, §299
   parcours 2 modes, §300 édition coach).
4. `docs/plans/2026-05-17-bilan-muscu-mesocycle-design.md` et
   `docs/plans/2026-05-18-bilan-muscu-moteur-generation-design.md` — design global
   + moteur.
5. `docs/audits/2026-05-20-audit-bilan-muscu-293.md` et
   `docs/audits/2026-05-23-audit-parcours-creation-mesocycle.md` — les **audits
   déjà faits** (ne pas redécouvrir leurs findings ; vérifier qu'ils sont bien
   fermés par §294/§299/§300).

**Conventions critiques** : React 19 + TS + Vite + Tailwind 4 + shadcn/ui + Wouter
(hash routing `/#/path`) + Supabase. RLS via `app_user_id()` / `app_user_role()`,
**jamais** `auth.uid()` en subquery. Project Supabase `fscnobivsgornxdwqwlk` (MCP
`mcp__plugin_supabase_supabase__*`). Toute proposition d'écran passe par
`/frontend-design` (mais ici tu **audites**). Ne **jamais** déployer ni `git push`.

---

## 3. Périmètre — écrans, composants, données

### Mesure & évaluation (cœur de l'audit)
- `src/pages/StrengthQuestionnaire.tsx` — questionnaire ; route nageur
  `/strength/questionnaire` ET coach `/coach/questionnaire/:athleteId` (§299).
- `src/pages/KpiWizard.tsx` — assistant des 5 KPIs (nageur **et** coach :
  `athleteId = isCoach ? selectedAthleteId : userId`).
  - `src/components/strength/kpi/KpiStopwatch.tsx` — chrono temps de vol (§295).
  - `src/components/strength/kpi/KpiAnimatedIllustration.tsx` +
    `illustrations/*` — démos SVG animées (§295).
  - `src/components/strength/kpi/KpiGifPanel.tsx`, `KpiStepCard.tsx`,
    `VerticalJumpInputs.tsx`, `KpiSwimmerPicker.tsx`, `kpiHelpers.ts`.
- `src/lib/strength/kpiProtocols.ts` — fiches-protocole des 5 KPIs (le « comment
  mesurer »). **Pièce maîtresse pour la fiabilité.**
- `src/lib/strength/kpiBaremes.ts` — barèmes (mesure brute → score 0-100, sexe ×
  bande d'âge, flags de confiance `transposed`/`placeholder`).
- `src/lib/strength/jumpPower.ts` — calcul puissance détente (temps de vol →
  hauteur → Sayers).
- `src/lib/strength/kpiMeasurement.ts` — `bestAttempt`, `parseAttempts`.
- `src/pages/coach/StrengthAssessmentScreen.tsx` — bilan physique coach :
  notation **mobilité** (flexion épaule, T-spine, hanche) + **qualité de
  mouvement** (contrôle scapulaire, alignement tronc-nuque, charnière hanche),
  6 axes 0-3.
  - `src/components/strength/assessment/assessmentScores.ts` (libellés, hints,
    légende 0-3), `AssessmentContext.tsx`, `src/components/strength/questionnaire/ScaleField.tsx`.

### Génération & moteur
- `src/lib/strength/mesocycleEngine.ts` (+ `mesocycleEngine.types.ts`),
  `periodizationCycles.ts`, `mesocycleGating.ts` (§299 `canGenerateMesocycle`),
  `mesocycleItemPayload.ts` (§299/§300 `preserveMesocycleTag`,
  `reconcileMesocyclePayloads`).
- `src/pages/MesocycleGeneration.tsx` (`/strength/mesocycle-generate` +
  `/coach/mesocycle-generate/:athleteId`), `src/pages/MesocyclePreview.tsx`.
- `src/lib/api/strength-mesocycles.ts`, `src/lib/api/strength-assessments.ts`.
- RPC `apply_strength_mesocycle`, `revert_strength_mesocycle`,
  `update_strength_session_atomic` (écrit `raw_payload` + `target_intensity`).

### Contrôle & suivi coach
- `src/components/strength/MyPlanTab.tsx`, `MyPlanSessionSheet.tsx`,
  `SessionDetailPreview.tsx`, `WorkoutRunner.tsx`.
- `src/components/coach/CoachMesocyclePanel.tsx`,
  `CoachActiveMesocyclesSection.tsx`.
- `src/pages/coach/StrengthPlanningScreen.tsx`, `CoachSwimmerFullView.tsx`,
  `StrengthCatalog.tsx` (édition §300 via `getStrengthSessionForEdit` + deeplink).
- Entrées : `src/components/strength/StrengthBilanEntry.tsx` (`StartBilanEntry`,
  `QuestionnairePrompt`, `KpiWizardEntry` — §299), `MesocycleEntry.tsx`.

---

## 4. Axes d'audit (chacun → constats + frictions + gaps + risques)

### 4.1 — FIABILITÉ & RÉPÉTABILITÉ DES MESURES (axe prioritaire)
Pour **chacun des 5 KPIs** et **chacun des 6 axes mobilité/mouvement**, évalue la
**qualité du guidage** et la **reproductibilité** :
- **Protocole** (`kpiProtocols.ts`) : position de départ, consigne, rôle du
  binôme, nombre d'essais, ce qui compte, conditions standardisées. Assez précis
  pour que deux opérateurs obtiennent la même valeur ? Ambiguïtés ?
- **Démonstration visuelle** : les **5 GIFs de démo** sont-ils livrés, ou seules
  les illustrations SVG animées font office de fallback (cf. §294/§295 — GIFs
  notés « à fournir ») ? Une démo absente ou pauvre nuit à la répétabilité.
  Vérifie `dim_exercices.illustration_gif` pour les KPIs / le cascade
  `KpiGifPanel`.
- **Chrono temps de vol** (`KpiStopwatch`) : précision réelle vs délai de réaction
  humain (~150-250 ms, noté §295). Le protocole atténue-t-il ce biais (moyenne,
  meilleur de 3, consigne de déclenchement) ?
- **Barème** (`kpiBaremes.ts`) : combien des 5 KPIs sont sur barèmes
  `transposed`/`placeholder` (non sourcés natation) ? Le flag de confiance
  est-il visible au coach ? Risque de sur-/sous-estimation des scores.
- **Mobilité & amplitudes** (`StrengthAssessmentScreen` + `assessmentScores.ts`) :
  c'est une notation **subjective 0-3** par axe. Les **rubriques** par niveau
  sont-elles assez explicites (labelLow/labelHigh/hint) pour être répétables ?
  Y a-t-il une **référence visuelle / schéma d'amplitude** par axe (il n'y en a
  probablement pas) ? **C'est le point faible le plus probable pour « fiable et
  répétable »** : une amplitude (ROM) notée à l'œil sans repère chiffré ni photo
  dérive d'un coach à l'autre. Documente précisément le gap et propose des pistes
  (rubrique enrichie, photos de référence par niveau, mesure goniométrique
  optionnelle, capture).
- **Historisation / comparaison** : les KPIs sont une série temporelle
  (`strength_kpi_measurements`) ; le wizard montre-t-il le diff vs mesure
  précédente ? La mobilité/mouvement est-elle historisée et comparable dans le
  temps (ou écrasée à chaque bilan) ? Sans comparaison, pas de suivi de progrès.
- **Saut d'un test** : un bilan partiel est-il géré proprement (confiance
  abaissée, pas de blocage) côté wizard ET côté coach ?

### 4.2 — Séance coach-pilotée : fluidité bout-en-bout (un seul appareil)
Reproduis le chemin réel : coach → fiche nageur → démarrer le bilan → « Remplir
avec le nageur » (questionnaire) → KPIs (wizard, sélection du nageur) → bilan
physique (mobilité/mouvement) → « Générer le mésocycle » → preview → confirmer.
- Combien d'écrans / de taps / de changements de contexte ? Le coach doit-il
  jongler entre plusieurs entrées, ou est-ce un **enchaînement guidé** ?
- Y a-t-il un **fil conducteur** (progression « étape 1/4 », état d'avancement du
  bilan visible) ou le coach doit-il se souvenir de ce qui reste à faire ?
- La **sélection du nageur** est-elle cohérente et persistante entre les écrans
  (KpiWizard, StrengthAssessmentScreen, génération coach) ou re-sélectionne-t-on
  à chaque étape ?
- **Friction à creuser** : le questionnaire en mode coach écrit-il bien les
  `pain_reports` du nageur (policy `pain_coach_write` §299) ? L'enchaînement
  questionnaire→physique→génération est-il sans cul-de-sac ?

### 4.3 — Parcours intégral & états (les DEUX modes)
- **Nageur autonome** : `StartBilanEntry` (démarrage seul, §299) → questionnaire
  → KPIs → génération dès `bilan_pending` (`canGenerateMesocycle`, §299) →
  preview (bandeau confiance réduite) → timeline. Vérifie qu'il n'y a plus de
  blocage (les findings de l'audit 2026-05-23 doivent être fermés).
- **Coach-piloté** : routes `/coach/mesocycle-generate/:athleteId`,
  `/coach/questionnaire/:athleteId` ; en-têtes de cible non ambigus ; retour
  fiche nageur après apply.
- **États** pour CHAQUE écran : vide (jamais de bilan), chargement, erreur
  réseau, **profil incomplet** (sex/birthdate manquants — requis par les
  barèmes), catalogue vide, KPIs partiels, aucun groupe. Messages clairs ou
  culs-de-sac ?

### 4.4 — Robustesse de la génération de cycles
- **Déterminisme & données partielles** : aucun KPI / KPI partiels / mobilité
  absente (`physical_tests` null) → le moteur tourne, abaisse `data_confidence`,
  ne bloque jamais. Override sécurité (douleur intense / dysfonction → mobilité
  priorité 1).
- **Périodisation** : `periodize` distribue les phases sur la durée cible dans
  `[min, max]` ; refuse hors plage. Cohérence des templates
  (`strength_periodization_templates`) : `Σmin ≤ durée ≤ Σmax`,
  `max_week_count` aligné (cf. finding B de l'audit §293, corrigé §294 — vérifier
  qu'il n'y a pas de régression).
- **Sélection d'exercices** : filtre seau + niveau + exclusion contre-indications
  (douleur) + substitution ; `is_core` cohérent (cf. nettoyage §294). Le
  chargement par exercice/cycle (§297) et les métriques d'intensité non-poids
  (§298, `target_intensity`, gating 1RM) sont-ils corrects dans le plan généré ?
- **Cohérence aperçu ↔ timeline ↔ vue coach** : `MesocyclePreview`, `MyPlanTab`,
  `StrengthPlanningScreen` (mode athlète §298) montrent-ils la même chose ?
- **Idempotence/transaction** : apply (snapshot → supersede → insert →
  matérialisation → notif) ; revert (restaure snapshot, identifie les séances
  `[Méso]` via `raw_payload->>'mesocycle_id'` puis CASCADE).
- **Édition coach (§300)** : éditer une séance générée préserve `raw_payload`
  (`reconcileMesocyclePayloads`), items ajoutés héritent du `mesocycle_id` ; un
  revert ultérieur nettoie tout (T14). Vérifie qu'aucun chemin d'édition ne
  réintroduit `raw_payload:null` (le bug §300 Part 1).

### 4.5 — TOUS les parcours UI/UX (transverse)
Pour **chaque écran** du périmètre § 3, vérifie :
- **Mobile-first** (l'app est utilisée sur téléphone au bord du bassin) : zones de
  tap, dépassements, sticky bars, safe-area, lisibilité, le « focus mode » (dock
  masqué) sur les écrans bilan/wizard.
- **Navigation & deeplinks** : routes hash (`/#/...`), deeplink édition §300
  (planif → « Éditer la séance » → `sessionStorage` + `#/coach?section=library`
  → `StrengthCatalog` ouvre la bonne séance), deeplink onglet Planning (§296),
  retours arrière cohérents (mode coach vs nageur).
- **Accessibilité de base** : libellés, contrastes, `aria` sur les contrôles
  custom (ScaleField, KpiStopwatch, sliders).
- **Cohérence visuelle** : tuiles `/strength`, bandeaux, badges (OVERRIDE,
  confiance, substitution), pastilles de cycle.
- **Cohérence des libellés/feedback** : toasts, états de chargement, messages
  d'erreur exploitables.

### 4.6 — Sécurité / RLS / perf (rappel)
- Coach écrit pour un nageur : `strength_assessments` (coach FOR ALL),
  `strength_kpi_measurements` (coach FOR ALL), `pain_reports`
  (`pain_coach_write` §299), `strength_planning_*` / `strength_session_items`
  (coach). RPC `apply`/`revert` SECURITY DEFINER + garde-auth. **`pain_coach_write`
  n'a pas de test d'intégration RLS** (vérifié par revue § §299) — confirme par
  `pg_policies`.
- Perf : index `raw_payload->>'mesocycle_id'` (§294) ; nombre d'INSERT par apply.

---

## 5. Vérifs concrètes à exécuter

```bash
npx tsc --noEmit
npm test
npm run build
# RLS (si tu touches/soupçonnes une policy ; Docker requis — demander à l'utilisateur)
npm run test:rls -- strength-mesocycle-rpc strength-assessments
```

Via MCP `execute_sql` (project `fscnobivsgornxdwqwlk`) :

```sql
-- 5.1 KPIs : combien de barèmes transposés/placeholder (fiabilité des scores)
--     → lire kpiBaremes.ts ; recouper avec les flags de confiance affichés.

-- 5.2 GIFs de démo des 5 KPIs présents ?
SELECT nom_exercice, illustration_gif
  FROM dim_exercices
 WHERE nom_exercice ILIKE ANY (ARRAY['%tirage%','%détente%','%saut%','%traction%','%lancer%','%médecine%']);

-- 5.3 Mobilité/mouvement : historisée ou écrasée ? (1 ligne par athlète ?)
SELECT athlete_id, COUNT(*) AS n_assessments,
       COUNT(*) FILTER (WHERE physical_tests IS NOT NULL) AS n_coach_noted
  FROM strength_assessments GROUP BY athlete_id ORDER BY n_assessments DESC;

-- 5.4 KPI série temporelle : y a-t-il des re-mesures (répétabilité observable) ?
SELECT athlete_id, kpi_key, COUNT(*) AS n, MIN(measured_at)::date, MAX(measured_at)::date
  FROM strength_kpi_measurements GROUP BY athlete_id, kpi_key ORDER BY n DESC LIMIT 30;

-- 5.5 Templates : Σmin ≤ max_week_count ≤ Σmax cohérents
SELECT event_group, kind, min_week_count, max_week_count, structure
  FROM strength_periodization_templates ORDER BY event_group, kind;

-- 5.6 pain_reports : policy coach write présente
SELECT policyname, cmd FROM pg_policies WHERE tablename='pain_reports';

-- 5.7 Profils incomplets (bloquent les barèmes)
SELECT COUNT(*) FILTER (WHERE sex IS NULL OR birthdate IS NULL) AS incomplets,
       COUNT(*) AS total FROM user_profiles;
```

**Idéalement, fais un smoke test manuel** (l'app est déployée sur GitHub Pages) ou
décris précisément le parcours écran par écran si l'environnement ne le permet pas
— la couche UI n'est pas couverte par les tests automatiques (pas de jsdom).

---

## 6. Déjà corrigé — NE PAS re-signaler comme bugs

- **Timezone** `toISODate` (§296). **`is_core` gainage** nettoyé (§294).
- **Autonomie nageur** : génération débloquée à `bilan_pending`
  (`canGenerateMesocycle`), tuile `StartBilanEntry` (§299) — le nageur n'est
  **plus** bloqué par la notation coach.
- **Mode coach-piloté** : génération + questionnaire paramétrés par `athleteId`,
  entrées « Générer le mésocycle » / « Remplir avec le nageur » / « Régénérer »
  (§299).
- **`pain_coach_write`** (policy, §299), **notif** coach→nageur au démarrage du
  bilan (trigger §299).
- **Métriques d'intensité non-poids** (`target_intensity`, gating 1RM, §298) ;
  **`is_bodyweight`** + estimation 1RM inline (§297).
- **Édition coach d'une séance générée** : atteignable (deeplink), `raw_payload`
  préservé (`reconcileMesocyclePayloads`), revert cohérent (§300). Ne pas
  re-signaler « impossible d'éditer » ni « raw_payload:null écrase ».
- **Volume 5 items/séance** (2 warmup + 2 primary + 1 complement) : décidé,
  validé. Le signaler comme *recommandation* si tu penses que c'est trop pour la
  fraîcheur natation, pas comme bug.

## 7. Anti-patterns à éviter
- ❌ Ne **modifie pas** le code (lecture seule sauf demande).
- ❌ Ne **re-signale pas** le § 6.
- ❌ Ne **spawn pas d'agents** sans nécessité (Grep/Read directs ; cf. CLAUDE.md
  § Agents & coût).
- ❌ Ne **devine pas** : capacité ambiguë → « non vérifié — raison ».
- ✅ **Cite tes preuves** (`fichier:ligne`, sorties, SQL).
- ✅ **Distingue** *friction* (pénible) / *gap* (inexistant) / *bug* (cassé).
- ✅ **Priorise par impact utilisateur** (fiabilité de la mesure d'abord).

## 8. Questions clés auxquelles le rapport doit répondre
1. **Un coach peut-il mesurer un nageur de façon fiable et répétable** en une
   séance de 30-60 min, sur un seul appareil ? Où sont les angles morts
   (protocoles flous, démos manquantes, amplitudes subjectives non guidées,
   barèmes non sourcés) ?
2. **L'évaluation mobilité/amplitudes est-elle suffisamment guidée** pour être
   reproductible d'un coach à l'autre ? Sinon, quel dispositif minimal le
   rendrait fiable ?
3. **Le suivi dans le temps** (re-mesure, comparaison avant/après) est-il possible
   pour les KPIs ET la mobilité/mouvement ?
4. **La génération est-elle robuste** sous données partielles et cas limites, et
   **cohérente** entre aperçu / timeline / vue coach ?
5. **Tous les parcours UI/UX** (2 rôles × tous les états) tiennent-ils sur mobile,
   sans cul-de-sac ?
6. **Top 5-7 frictions/gaps priorisés** (impact × effort) + recommandations.

## 9. Livrable attendu
Un rapport markdown sauvé dans
`docs/audits/2026-05-23-audit-mesure-coach-robustesse.md`, structuré :

```markdown
# Audit mesure coach + robustesse génération — 2026-05-23

## Synthèse exécutive
- Fiabilité/répétabilité des mesures : ✅ / ⚠️ / ❌ — pourquoi
- Séance coach-pilotée (fluidité 1 appareil) : état
- Robustesse génération : état
- UI/UX (2 rôles, tous états) : état
- Top 3 frictions prioritaires

## 1. Fiabilité & répétabilité des mesures
### KPIs (×5) — protocole, démo, chrono, barème, historisation
### Mobilité & amplitudes — rubriques, référence visuelle, répétabilité
### Suivi dans le temps

## 2. Séance coach-pilotée bout-en-bout
- Schéma du flux réel (écrans · taps · changements de contexte)
- Frictions (fichier:ligne / SQL)

## 3. Parcours intégral & états (2 modes)

## 4. Robustesse de la génération

## 5. Parcours UI/UX (par écran : mobile, états, navigation, a11y)

## 6. Sécurité / RLS / perf

## Écart existant ↔ cible
| Capacité visée | État | Gap |

## Recommandations priorisées (impact × effort) — max 7

## Annexes
- Sorties tsc / test / build / test:rls
- Requêtes SQL + résultats
- Captures / parcours écran par écran (si smoke test)
```

## 10. Budget
~1 h 30 - 2 h : lecture docs (20-30 min) + parcours code mesure+génération
(40-50 min) + vérifs SQL + (idéalement) smoke test UI (20-30 min) + rédaction
(20-30 min). Objectif : un rapport **actionnable** qui débouche sur un plan pour
rendre la mesure coach fiable/répétable et la génération robuste — pas un
inventaire.

---

**Démarre maintenant.** Premier livrable : un message de checkpoint après lecture
des docs (« contexte chargé ; voici ma compréhension de la cible mesure-coach +
les 3 zones de fragilité que je soupçonne déjà — typiquement : démos KPI
manquantes, amplitudes notées sans référence visuelle, et X »). Puis attaque les
vérifs.
