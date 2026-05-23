# Design — Fixes du parcours de création du mésocycle (Bilan Muscu)

*Document de design validé le 2026-05-23. Donne suite à l'audit lecture-seule
`docs/audits/2026-05-23-audit-parcours-creation-mesocycle.md` (+ sa validation
indépendante du même jour). Objectif : rapprocher le parcours livré (§293→§297)
de la vision produit « deux portes d'entrée vers un moteur commun ».*

> **Pré-requis de lecture** : l'audit ci-dessus (constats + preuves `fichier:ligne`).
> Ce design ne re-démontre pas les findings ; il les corrige.

## 1. Objet

Le moteur (`mesocycleEngine.ts`), la persistance (RPC `apply`/`revert`,
`strength_planning_*`) et la visibilité coach sont **solides** (validés §293).
Le **parcours** ne l'est pas : il ne réalise ni le Mode A (autonomie nageur,
verrouillée aux deux bouts) ni le Mode B (génération / questionnaire pilotés
coach, inexistants), et le contrôle coach a posteriori se limite au revert
tout-ou-rien.

Ce chantier livre **les deux modes à parité** + **l'édition fine coach**, sans
toucher au moteur ni à la sémantique du modèle de données — l'essentiel du
travail est une **couche UI paramétrée par `athleteId`** et **un seul ajustement
RLS**.

## 2. Décisions de cadrage (brainstorming validé 2026-05-23)

| # | Décision | Choix retenu |
|---|----------|--------------|
| 1 | Modèle d'autonomie | **Les deux modes à parité.** Mode A (réelle autonomie nageur) ET Mode B (génération pilotée coach), moteur commun. |
| 2 | Verrou `completed` | **Levé pour la génération.** Le nageur génère dès `bilan_pending` (questionnaire + KPIs faits). La notation physique coach devient un **enrichissement** (`data_confidence` ↑), plus un gate. Le moteur tolère déjà `physical_tests = null`. |
| 3 | Profondeur édition coach | **Édition fine complète** : ouvrir une séance générée dans le builder existant (charge / substitution / ajout-retrait), avec préservation de `mesocycle_id`. |
| 4 | Spine technique | **Paramétrer, ne pas dupliquer.** Les 3 écrans nageur acceptent un `athleteId` optionnel (défaut = session). Le coach les atteint avec une cible. |
| 5 | Questionnaire piloté coach | **Mode « avec le nageur »** sur l'appareil du coach (write `athleteId`), libellé *avec* et non *à la place de* (le questionnaire est subjectif : douleur, psy). Le mode nageur-sur-son-appareil reste disponible. |

Décisions héritées (non re-litigées) : moteur déterministe ; un seul mésocycle
`active` par nageur ; snapshot/revert comme filet ; RLS via `app_user_id()` /
`app_user_role()`.

## 3. Spine technique — *paramétrer, ne pas dupliquer*

La RPC `apply_strength_mesocycle` **autorise déjà l'appelant coach/admin**
(garde-auth `00172` l. 76-80, validé audit §293 §3.1). Le gap est **purement
UI** : `MesocycleGeneration.tsx:141`, `MesocyclePreview.tsx:198` et
`StrengthQuestionnaire.tsx:95-104` sont câblés sur `useAuth(userId)`.

**Pattern de référence : `KpiWizard.tsx:138`** —
`const athleteId = isCoach ? selectedAthleteId : userId;` — l'écran KPI sait déjà
servir nageur **et** coach. On réplique ce pattern sur les 3 écrans restants :

```
athleteId (prop/route param) ?? session userId
```

Conséquence gratuite : la **parité aperçu ↔ timeline ↔ vue coach** (audit 4.4)
est garantie *par construction*, puisque c'est le même composant rendu avec une
cible différente.

```
                       ┌──────────────────────────────────┐
   Mode A (nageur)  ─→ │  StrengthQuestionnaire(athleteId?) │
   Mode B (coach)   ─→ │  MesocycleGeneration(athleteId?)   │ ─→ RPC apply (coach OU nageur)
                       │  MesocyclePreview(athleteId?)      │      → timeline /strength
                       └──────────────────────────────────┘
```

## 4. Les cinq workstreams

### W1 — Mode A : réelle autonomie nageur *(effort faible · impact 🔴 max)*

| Item | Changement | Cible |
|---|---|---|
| Verrou génération | Gate `status === 'completed'` → `status ∈ {bilan_pending, completed}` | `MesocycleEntry.tsx:44` |
| Démarrage autonome | Nouvelle entrée nageur **« Démarrer mon bilan »** → `createAssessment({athlete_id: userId, coach_id: null})` → `questionnaire_pending` | `StrengthBilanEntry.tsx` (nouvelle tuile, à côté de `KpiWizardEntry`) |
| Confiance réduite | Bandeau **« bilan physique coach non encore réalisé — confiance réduite »** sur la preview quand on génère à `bilan_pending` | `MesocyclePreview.tsx` (au-dessus du raisonnement) |
| Enrichissement | La notation physique coach (`updateAssessmentPhysicalTests`) reste possible **après** génération ; elle n'est plus un gate, elle alimente `data_confidence` au prochain bilan | aucune logique nouvelle — juste le retrait du gate |

**Sémantique** : `createAssessment` côté nageur passe `coach_id = null`. Le coach
reste notifié (W5). Lève A1, A2, A3, A4 de l'audit.

### W2 — Mode B : génération pilotée coach *(effort moyen)*

| Item | Changement | Cible |
|---|---|---|
| Paramétrage | `MesocycleGeneration` / `MesocyclePreview` acceptent `athleteId` (route param ou prop) ; tous les `getLatestAssessment/getProfile/getLatestKpiMeasurements(userId)` deviennent `(athleteId ?? userId)` | `MesocycleGeneration.tsx:141,155-157` · `MesocyclePreview.tsx:198,224-238` |
| Entrée coach #1 | Bouton **« Générer le mésocycle »** sur le done-state du bilan (l'écran promet déjà « le mésocycle pourra être généré » sans bouton) | `StrengthAssessmentScreen.tsx:465-493` |
| Entrée coach #2 | Bouton **« Générer / régénérer »** depuis `CoachMesocyclePanel` et/ou la section hub | `CoachMesocyclePanel.tsx`, `CoachActiveMesocyclesSection.tsx` |
| Routes | `/coach/mesocycle-generate/:athleteId` + `/coach/mesocycle-preview/:athleteId` (ou réutiliser les routes nageur avec garde de rôle qui lit le param) | `App.tsx` |

**RLS** : aucune nouvelle policy (cf. § 6) — `apply` est SECURITY DEFINER et
auto-authentifie le coach ; les lectures coach (assessment / profil / KPIs) sont
déjà couvertes club-wide.

### W3 — Mode B : questionnaire accompagné *(effort moyen · 1 ajustement RLS)*

| Item | Changement | Cible |
|---|---|---|
| Paramétrage | `StrengthQuestionnaire` accepte `athleteId` ; `getLatestAssessment` + `updateAssessmentQuestionnaire` + `upsertPainReports` ciblent `(athleteId ?? userId)` | `StrengthQuestionnaire.tsx:95-104,158,163` |
| Entrée coach | Sur la branche d'attente `questionnaire_pending`, bouton **« Remplir avec le nageur »** (au lieu d'attendre passivement) | `StrengthAssessmentScreen.tsx:562-585` |
| Libellé | UI « avec le nageur », pas « à la place de » — le questionnaire reste subjectif (douleur/psy) ; le nageur répond, le coach saisit | textes de l'entrée |
| **RLS** | **Nouvelle policy `pain_coach_write`** sur `pain_reports` (cf. § 6) — c'est le seul write coach manquant | mig nouvelle |

### W4 — Édition fine coach *(effort moyen-élevé · item « soin données »)*

| Item | Changement | Cible |
|---|---|---|
| Entrée édition | Ouvrir une séance `[Méso …]` dans le **builder strength existant** depuis le planning athlète (aujourd'hui `readOnly`) et/ou `CoachMesocyclePanel` | `StrengthPlanningScreen.tsx:336,455,460-465` · `CoachMesocyclePanel.tsx:10` |
| **Invariant** | Toute édition (y compris items **ajoutés**) **préserve `raw_payload.mesocycle_id`** → un `revert` ultérieur les nettoie correctement (pas d'orphelin) | builder + mapping save |
| Revert | **Confirmé** : revert détruit tout le cycle (édits inclus) et restaure le snapshot pré-mésocycle. Documenter « éditer puis revert annule les édits » comme comportement voulu | mig `00173` (inchangée) |
| Catalogue | Les `[Méso …]` restent filtrés du catalogue (mig `00180`) — l'édition passe par le planning/panel, pas par la bibliothèque | inchangé |
| Notif (option) | Notifier le nageur « ton coach a ajusté une séance » | W5 |

**Risque maîtrisé** : la seule façon de créer un orphelin au revert est qu'une
édition **strippe** `mesocycle_id`. L'invariant ci-dessus l'empêche — c'est le
point de vigilance n°1 de l'implémentation, à couvrir par un test RLS/intégration
(édit → revert → 0 item résiduel du cycle).

### W5 — Boucles & traçabilité *(effort faible)*

| Item | Changement | Cible |
|---|---|---|
| Handoff coach→nageur | Notif **« Ton coach a démarré un bilan »** à `createAssessment` côté coach (aujourd'hui silencieux ; ferme A5) | `createAssessment` ou trigger |
| Notif édition (option) | Voir W4 | — |
| Traçabilité §298 | Ré-insérer l'entrée **§298** perdue dans `implementation-log.md` (commits `e5d9a5f59`… présents en git) ; numéroter ce chantier au **prochain § libre** | docs |

## 5. Modèle de données

**Aucune nouvelle table. Aucun changement de schéma applicatif.** Le seul DDL est
**une policy RLS** (§ 6). Tout le reste réutilise l'existant
(`strength_assessments`, `strength_kpi_measurements`, `strength_planning_*`,
`strength_session_items`, RPC `apply`/`revert`).

## 6. RLS — analyse précise (requête `pg_policies` 2026-05-23)

État vérifié des policies sur les tables touchées par les writes coach :

| Table | Write coach déjà couvert ? | Policy |
|---|---|---|
| `strength_assessments` | ✅ | `strength_assessments_coach` = `ALL` coach/admin (USING + CHECK) |
| `user_profiles` | ✅ | `user_profiles_upsert` = `ALL` self **OU** coach/admin |
| `strength_kpi_measurements` | ✅ | `strength_kpi_measurements_coach` = `ALL` coach/admin |
| `strength_sessions` | ✅ | `strength_sessions_write` = `ALL` coach/admin |
| `strength_session_items` | ✅ | `strength_items_write` = `ALL` coach/admin |
| `strength_planning_slot_overrides` | ✅ | INSERT/UPDATE/DELETE coach/admin (SELECT = true) |
| **`pain_reports`** | ❌ **manquant** | `pain_own` = `ALL` self ; `pain_coach_read` = **SELECT seulement** |

**Conséquence** : le **seul** ajustement RLS du chantier est une policy
**`pain_coach_write`** sur `pain_reports`, requise par W3 (le coach qui remplit
le questionnaire déclenche `upsertPainReports(athleteId, …)` — INSERT/UPDATE/DELETE
sur les lignes d'un autre user). Trois options, à trancher en implémentation :

1. **Policy `pain_coach_write`** `FOR ALL` coach/admin (cohérent avec
   `strength_assessments_coach`, club-wide). *Recommandé* — simple, aligné sur le
   modèle existant.
2. Router le miroir de douleur via une **RPC SECURITY DEFINER** (plus de surface,
   inutile ici).
3. **Skip** le miroir `pain_reports` quand `athleteId !== userId` (le nageur le
   resynchronise via son wellness). Dégrade la cohérence des vues douleur coach.

> **Découle des règles CLAUDE.md** : W3 (+ W4 sur la réconciliation revert/édit)
> touchent des writes sur tables sous RLS dépendant du rôle → **`npm run test:rls`
> obligatoire**. Docker requis : à démarrer par l'utilisateur le moment venu.
> Tests RLS à ajouter : (a) coach remplit le questionnaire d'un nageur (assessment
> + pain) ; (b) coach génère pour un nageur (apply via coach) ; (c) coach édite une
> séance puis revert → 0 item résiduel.

## 7. UX

Toute UI nouvelle ou modifiée passe par **`/frontend-design`** (règle projet
obligatoire) au moment de l'implémentation. Surfaces concernées :

- W1 : tuile « Démarrer mon bilan » (nageur) ; bandeau confiance réduite (preview).
- W2 : boutons « Générer le mésocycle » (done-state bilan, panel, hub) ; en-tête
  de cible (« Tu génères pour : <nageur> ») sur les écrans génération/preview en
  mode coach.
- W3 : bouton « Remplir avec le nageur » + en-tête de cible sur le questionnaire.
- W4 : affordance d'édition sur la séance générée (planning/panel) ; le builder
  existant est réutilisé tel quel.

**Sécurité d'affichage** : sur tous les écrans paramétrés, un en-tête de cible
non ambigu évite le risque « le coach croit agir sur lui-même ». En mode nageur
(`athleteId == null`), zéro changement visuel.

## 8. Découpage & exécution

Ordre conseillé (valeur décroissante / risque croissant) :

1. **W1** — débloque l'autonomie (plus gros gain, plus petit effort, zéro RLS).
2. **W5 (traçabilité §298)** — trivial, à faire tôt pour ne pas le perdre.
3. **W2** — génération coach (réutilise la spine ; zéro RLS).
4. **W3** — questionnaire accompagné (+ policy `pain_coach_write` + test:rls).
5. **W4** — édition fine (invariant `mesocycle_id` + test:rls réconciliation).
6. **Clôture** — `npm test`, `npx tsc --noEmit`, `npm run build`, `npm run test:rls`,
   doc (implementation-log, ROADMAP, FEATURES_STATUS, CLAUDE.md, files-map).

**Parallélisme** (règle globale équipe d'agents) : W1+W2+W5 partagent la spine et
peuvent être menés ensemble (orchestration Opus, dev Sonnet) ; W3 et W4 dépendent
de la spine et de leurs tests RLS respectifs. Le type `athleteId?: number` figé
tôt sur les 3 écrans est l'interface commune.

## 9. Points laissés à l'implémentation

- **Forme exacte de l'entrée coach génération** : route dédiée `/coach/...` vs
  réutilisation des routes nageur avec garde de rôle lisant le param. (Recommandé :
  routes dédiées coach pour clarté de navigation + garde RLS implicite côté UI.)
- **`pain_coach_write`** : option 1/2/3 du § 6 (recommandé : 1).
- **Notification d'édition coach** : incluse (W4) ou différée — selon volume de
  bruit notif acceptable.
- **Numéro de § du chantier** : prochain libre (≥ §299, après résolution du tangle
  de numérotation §298 noté en W5).
- **`MesocycleEntry` à `bilan_pending`** : confirmer le wording exact du bandeau
  de confiance réduite avec le coach (pédagogie).

## 10. Critères d'acceptation (definition of done)

- **Mode A** : un nageur **sans coach** peut, depuis `/strength`, démarrer son
  bilan → remplir le questionnaire → faire ses KPIs → générer son mésocycle, sans
  aucune action coach. ✅ vérifié bout-en-bout.
- **Mode B** : un coach peut, pour un nageur tiers, démarrer le bilan → remplir le
  questionnaire avec lui → saisir les KPIs → noter le physique → **générer** le
  mésocycle, sans changer d'appareil/compte. ✅ vérifié bout-en-bout.
- **Contrôle coach** : voir ✅ (déjà) · **éditer une séance** ✅ (nouveau, édit
  survit jusqu'au revert) · rejeter ✅ (déjà).
- **Non-régression** : `tsc` 0 · `npm test` vert · `npm run build` OK ·
  `npm run test:rls` vert (dont les 3 nouveaux scénarios coach-write).
- **Doc** : guide utilisateurs réaligné (le guide promet déjà l'édition coach et
  l'autonomie — il deviendra enfin exact).
