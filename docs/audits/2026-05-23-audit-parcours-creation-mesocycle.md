# Audit parcours création mésocycle — 2026-05-23

*Audit **lecture seule** du parcours complet de création d'un mésocycle de
musculation (questionnaire/tests → cycle posé sur la timeline), confronté à la
vision produit « deux modes d'entrée » (nageur autonome / coach piloté).
Aucune modification de code.*

> Méthode : lecture des docs (§2 du mandat), parcours du code des deux flux,
> 4 requêtes SQL prod (`fscnobivsgornxdwqwlk`), `tsc` / `npm test` / `build`.
> Findings déjà fermés de l'audit §293 (2026-05-20) non re-signalés.

---

## Synthèse exécutive

- **Autonomie nageur : ❌ bloquée.** Le nageur ne peut ni **initier** son bilan
  (`createAssessment` est coach-only — `StrengthQuestionnaire.tsx` affiche
  « Ton coach doit d'abord initier un bilan muscu »), ni le **finaliser** : la
  tuile de génération exige `assessment.status === 'completed'`
  (`MesocycleEntry.tsx:44`), et le seul chemin vers `completed` est la notation
  physique du coach (`updateAssessmentPhysicalTests`, coach-only). Le nageur est
  **encadré par le coach aux deux bouts**. C'est la friction n°1 du mandat,
  confirmée par le code **et** par la donnée prod (l'unique mésocycle existant a
  bien été généré par l'athlète, mais sur un bilan `coach_noted = true`).

- **Mode coach-piloté : ⚠️ contournement partiel, pas de flux unifié.** Le coach
  peut créer le bilan, saisir les **KPIs** pour un nageur (`KpiWizard` a une
  étape de sélection de cible) et noter la **mobilité/mouvement**. Mais il ne
  peut **pas remplir le questionnaire à la place du nageur** (l'écran coach reste
  bloqué en « En attente du questionnaire nageur »), ni **générer le mésocycle
  pour un nageur tiers** (`MesocycleGeneration` / `MesocyclePreview` sont câblés
  sur la session courante). La « session bilan 30 min–1 h pilotée par le coach »
  de la vision **n'existe pas comme parcours**.

- **Contrôle coach a posteriori : voir ✅ / rejeter ✅ / éditer ❌.** Visibilité
  réelle (hub `CoachActiveMesocyclesSection` + `CoachMesocyclePanel` + planning
  read-only). Rejet réel (revert all-or-nothing, notif nageur). **Mais
  l'édition séance-par-séance promise par le guide utilisateur n'est atteignable
  par aucune UI** : le planning coach est read-only (§276/§298), le panneau
  mésocycle ne rekrée pas le builder (`CoachMesocyclePanel.tsx:10`), et les
  templates `[Méso …]` sont filtrés du catalogue coach (§296). Le seul levier
  fin est donc… le revert total.

### Top 3 frictions prioritaires

1. **Le nageur ne peut pas démarrer son bilan seul** (pas de `createAssessment`
   côté nageur) → l'« autonomie » est impossible dès l'entrée.
2. **Le passage en `completed` dépend de la notation coach** → même bilan rempli
   + KPIs faits, le nageur reste bloqué tant que le coach n'a pas noté la
   mobilité. Or l'**engine tolère `physical_tests = null`** : le blocage est un
   choix d'UI, pas une contrainte du moteur.
3. **Pas d'édition d'une séance générée** → le coach ne peut « adapter a
   posteriori » qu'en rejetant tout. Le guide utilisateur décrit une capacité
   qui n'existe pas.

---

## Parcours nageur autonome — bout en bout

### Schéma du flux réel (écrans · statuts · acteurs)

```
[COACH]  /coach/strength-assessment
          → sélectionne le nageur
          → "Démarrer un bilan"  → createAssessment(athlete_id, coach_id)
                                     status = questionnaire_pending      ← (1) coach obligatoire
                                            │
[NAGEUR] /strength  (tuile QuestionnairePrompt, visible SSI questionnaire_pending)
          → /strength/questionnaire  → douleurs/historique/mobilité/psy
          → submit  → updateAssessmentQuestionnaire()
                       status = bilan_pending
                                            │
[NAGEUR] /strength  (tuile KpiWizardEntry, toujours visible)
          → /strength/kpi-wizard  → 5 KPIs (auto-bilan possible)        ← seule vraie autonomie
                                            │
[COACH]  /coach/strength-assessment
          → note mobilité (3) + mouvement (3)
          → submit  → updateAssessmentPhysicalTests()
                       status = completed                                ← (2) coach obligatoire
                                            │
[NAGEUR] /strength  (tuile MesocycleEntry, visible SSI completed)
          → /strength/mesocycle-generate  → épreuve · famille · durée · séances
          → "Voir l'aperçu"  → /strength/mesocycle-preview
          → "Confirmer & appliquer"  → applyMesocycle() → timeline /strength "Mon plan"
```

Sous-flux génération seul (bilan déjà `completed`) : **3 écrans**, ~6-8 taps
(tuile → 4 sections de config → aperçu → confirmer). Raisonnable. **Le problème
n'est pas le nombre de taps, c'est les deux jalons coach obligatoires (1) et (2)
qui encadrent le nageur.**

### Frictions

| # | Friction | Preuve | Sévérité |
|---|----------|--------|----------|
| A1 | **Le nageur ne peut pas initier son bilan.** `createAssessment` n'a aucun appelant nageur. | `grep createAssessment(` → seuls `StrengthAssessmentScreen.tsx:219` (coach) + tests. `StrengthQuestionnaire.tsx:292-304` : si `assessment == null` → « Ton coach doit d'abord initier un bilan muscu ». | 🔴 bloquant |
| A2 | **Le nageur ne peut pas finaliser son bilan.** Seule la notation physique coach fait passer `completed`. | `strength-assessments.ts:90-106` (`status:'completed'`) appelé seulement par `StrengthAssessmentScreen.tsx:262`. Tuile gatée : `MesocycleEntry.tsx:44` `status !== 'completed' → return null`. | 🔴 bloquant |
| A3 | **Gate UI plus stricte que le moteur.** L'engine tourne avec `physical_tests = null` (mobility=0, conservateur, `dataConfidence` abaissée). Le blocage `completed` est donc artificiel côté autonomie. | Audit §293 §3.3 + `mesocycleEngine` (scoreMobility→null toléré). | 🟠 moyen (design) |
| A4 | **Nouveau nageur = cul-de-sac partiel.** Sans assessment, `/strength` ne montre que `KpiWizardEntry`. Il peut saisir des KPIs… qui ne mènent à rien sans bilan initié. Le questionnaire et la génération sont invisibles. | `StrengthBilanEntry.tsx:39` (QuestionnairePrompt gaté `questionnaire_pending`), `MesocycleEntry.tsx:44` (gaté `completed`). | 🟠 moyen |
| A5 | **Aucune notification ne route le nageur.** La carte `QuestionnairePrompt` est « le seul point d'entrée in-app » en attendant le système de notifs. | `StrengthBilanEntry.tsx:8-10` (commentaire). | 🟡 mineur |

> **Verdict** : la vision « Mode A — nageur en autonomie » **n'est pas réalisée**.
> Le flux livré (§293) est en réalité un flux **coach-amorcé / nageur-exécutant /
> coach-finalisant / nageur-générant** — l'autonomie se limite à *remplir le
> questionnaire* et *faire les KPIs* dans une fenêtre ouverte et refermée par le
> coach.

---

## Parcours coach-piloté — ce qui existe / ce qui manque

La vision veut que le coach mène **toute** la session (questionnaire + KPIs +
génération) en 30 min–1 h *pour/avec* le nageur. État réel, brique par brique :

| Brique du bilan | Coach peut le faire pour un nageur tiers ? | Preuve |
|---|---|---|
| Initier le bilan | ✅ Oui | `StrengthAssessmentScreen.tsx:214-222` (`createAssessment` avec `selectedAthleteId`) |
| **Questionnaire** (douleurs/psy/mobilité ressentie) | ❌ **Non** | `StrengthAssessmentScreen.tsx:562-585` : sur `questionnaire_pending`, le coach voit « En attente du questionnaire nageur », pas de formulaire. `StrengthQuestionnaire.tsx:83` est câblé sur `userId` (session) — pas de cible. |
| **KPIs** (5 tests) | ✅ Oui | `KpiWizard.tsx:86-138` : `isCoach ? selectedAthleteId : userId`, étape sélection nageur (l.435), `source = wizard_coach` (l.256). |
| Notation mobilité/mouvement | ✅ Oui (coach-only par design) | `StrengthAssessmentScreen.tsx:246-262`. |
| **Générer le mésocycle** | ❌ **Non** | `MesocycleGeneration.tsx:141` et `MesocyclePreview.tsx:198,229-233` câblés sur `useAuth(userId)`. `applyMesocycle` cible `input.assessment.athlete_id` = assessment de la session (`strength-mesocycles.ts:118`). Aucun écran coach ne navigue vers `/strength/mesocycle-generate` (grep). |

### Gaps UI précis

- **Gap 1 — Questionnaire piloté coach absent.** Il faut soit un mode « le coach
  remplit le questionnaire avec le nageur » sur `StrengthAssessmentScreen` (ou un
  `?athleteId=` sur `StrengthQuestionnaire`), soit accepter que le nageur le
  remplisse toujours lui-même (auquel cas « piloté par le coach » est faux).
- **Gap 2 — Génération pilotée coach absente.** `MesocycleGeneration` /
  `MesocyclePreview` n'acceptent pas de cible. La RPC `apply_strength_mesocycle`
  **autorise** pourtant l'appelant coach/admin (`prosecdef = true`, garde-auth
  vérifiée audit §293 §3.1) — il **manque uniquement la couche UI** (sélection du
  nageur + passage de `athleteId` aux deux écrans). Effort modéré, valeur élevée.
- **Conséquence** : le coach qui veut « faire le bilan complet avec un nageur
  pas à l'aise » doit aujourd'hui : créer le bilan (écran coach) → **demander au
  nageur de prendre son téléphone** pour remplir le questionnaire → faire les
  KPIs (écran KPI, OK) → noter la mobilité (écran coach) → **redonner le
  téléphone au nageur** pour qu'il génère. Ce n'est pas « piloté par le coach »,
  c'est un ping-pong d'appareils.

---

## Contrôle coach (visibilité / édition / rejet)

### Visibilité — ✅ réelle

- **Hub** : `CoachActiveMesocyclesSection` dans `CoachHome` (§296) — liste des
  mésocycles actifs club-wide, deeplink vers l'onglet Planning de la fiche nageur.
- **Panneau détaillé** : `CoachMesocyclePanel` (onglet Planning de
  `CoachSwimmerFullView`) — métadonnées + raisonnement parsé (6 scores, top
  priorités, flags) + historique. RLS coach club-wide (§293).
- **Planning** : `StrengthPlanningScreen` mode athlète = `MyPlanTab` read-only
  (§298) → le coach voit l'identique du nageur. ✅ cohérence aperçu/timeline.

### Rejet — ✅ réel mais grossier

- `CoachMesocyclePanel.tsx:158-159,326-362` : bouton « Rejeter » + `AlertDialog` →
  `revertMesocycle(id)`. RPC `revert_strength_mesocycle(p_mesocycle_id)`
  SECURITY DEFINER, restaure le snapshot, notif réciproque nageur (§293, testé).
- **Limite** : c'est **tout ou rien**. Pas de granularité.

### Édition — ❌ **gap majeur**

La vision (« l'adapter a posteriori — éditer une séance, ajuster une charge ») et
le guide utilisateur (« tu cliques sur la séance dans la timeline et tu l'édites
comme n'importe quelle séance ») décrivent une capacité **qui n'existe dans
aucune UI atteignable** :

| Chemin d'édition possible | État | Preuve |
|---|---|---|
| Planning coach → tap séance | Read-only (preview Sheet) | `StrengthPlanningScreen.tsx:2,329-335,455,460-465` (`readOnly`), §276.3 |
| Panneau mésocycle → éditer | Absent (revert seul) | `CoachMesocyclePanel.tsx:10` « Le builder de séance … n'est PAS recréé ici » |
| Bibliothèque coach → séance `[Méso …]` | Filtrées | mig `00180` (§296) : `get_strength_catalog_paginated` exclut `name LIKE '[Méso %'` |

**Conséquence** : pour ajuster une seule charge ou substituer un exercice, le
coach n'a **aucun** levier fin → il doit rejeter tout le mésocycle puis le
régénérer. Friction directe contre la vision.

> **Note sur le risque « revert écrase l'édition coach » (axe 4.3)** : non
> applicable aujourd'hui puisque l'édition n'est pas atteignable. *Si* un éditeur
> était ajouté : `revert` supprime par `raw_payload->>'mesocycle_id'`
> (`00173`) — des items ajoutés par le coach (sans cette clé) seraient
> **orphelins** au revert, et des items dont la clé serait perdue **survivraient**
> au revert. À cadrer au moment d'implémenter l'édition.

---

## Onboarding & états vides / erreurs

- **Nageur jamais évalué** : voit `KpiWizardEntry` seul. Pas d'invite à démarrer
  un bilan, pas de questionnaire (gaté `questionnaire_pending`), pas de tuile
  méso (gatée `completed`). Chemin **non évident** → il croit que les KPIs
  suffisent. (cf. A4)
- **Profil incomplet (sex/birthdate manquants)** : bien géré — `MesocyclePreview`
  détecte `!profile.birthdate || profile.sex ∉ {M,F}` (l.263-265, 340) et affiche
  un écran « Compléter mon profil » (l.1051) au lieu de planter. ✅ (fix §293).
  Reste : **4 profils incomplets en base** dont au moins 1 nageur (audit §293) —
  donnée à corriger côté users.
- **KPIs partiels / aucun** : toléré par le moteur (`dataConfidence` low/partial,
  `null → 0` conservateur). ✅
- **Catalogue vide / aucun groupe** : non re-testé en live ; l'audit §293 a
  confirmé `selectExercises` robuste et le fallback notif `target_user` présent
  mais non exercé (0 athlète sans groupe en base). *Non vérifié en live cette
  session* — pas de cul-de-sac connu.

---

## Écart existant ↔ vision cible

| Capacité visée | État | Gap |
|---|---|---|
| **A1** Nageur remplit le questionnaire seul | ⚠️ | OK *si* le coach a initié le bilan ; sinon invisible |
| **A2** Nageur fait ses KPIs seul | ✅ | `KpiWizard` auto-bilan fonctionne |
| **A3** Nageur obtient son mésocycle **sans intervention coach** | ❌ | Bloqué par `createAssessment` (début) **et** `completed` (fin), tous deux coach-only |
| **B1** Coach initie le bilan pour un nageur | ✅ | `StrengthAssessmentScreen` |
| **B2** Coach remplit le questionnaire avec/pour le nageur | ❌ | Écran coach attend le nageur ; questionnaire câblé session |
| **B3** Coach fait les KPIs pour le nageur | ✅ | `KpiWizard` sélection cible |
| **B4** Coach note mobilité/mouvement | ✅ | `StrengthAssessmentScreen` |
| **B5** Coach **génère** le mésocycle pour le nageur | ❌ | Écrans génération câblés session ; RPC le permet, UI non |
| **C1** Coach **visualise** le cycle + raisonnement | ✅ | Hub + panel + planning read-only |
| **C2** Coach **édite** une séance / ajuste une charge | ❌ | Aucune UI d'édition atteignable |
| **C3** Coach **rejette** un cycle autonome | ✅ | Revert (tout ou rien) + notif nageur |

**Score de couverture vision** : Mode A **1,5/3**, Mode B **3/5**, Contrôle
coach **2/3**. Les deux modes existent « sur le papier » mais convergent vers le
**même point dur** : un seul chemin de génération, lié à la session du nageur, et
verrouillé sur `completed` (coach).

---

## Réponses aux 7 questions clés du mandat

1. **Le nageur peut-il vraiment être autonome ?** **Non.** Blocage exact : (a)
   `createAssessment` coach-only → ne peut pas démarrer ; (b)
   `updateAssessmentPhysicalTests` coach-only → seul chemin vers `completed`, que
   la tuile de génération exige. Donnée prod : 1 seul assessment
   (`athlete_id=1, coach_id=3, completed, coach_noted=true`), 1 seul mésocycle
   (généré par l'athlète, après finalisation coach).
2. **Le mode coach-piloté existe-t-il en UI ?** **Partiellement.** KPIs ✅ +
   notation ✅ + initiation ✅ ; questionnaire pour le nageur ❌ + génération
   pour le nageur ❌. Pas de parcours unifié « bilan complet piloté coach ».
3. **Combien de points de friction ?** Mode A : **5** (A1-A5, dont 2 bloquantes).
   Mode B : **2 gaps** (questionnaire, génération). Contrôle coach : **1 gap**
   majeur (édition).
4. **Le coach garde-t-il le contrôle de bout en bout ?** Voir ✅, Rejeter ✅,
   **Éditer ❌**. Le contrôle est binaire (accepter tel quel ou tout rejeter).
5. **Top 5 frictions priorisées** : voir ci-dessous.

---

## Recommandations priorisées (impact × effort)

> Priorisation par **impact utilisateur** (rapprocher de la vision), pas par
> élégance technique. Effort = ordre de grandeur indicatif.

1. **Débloquer l'autonomie du nageur — autoriser la génération à
   `bilan_pending`** *(impact 🔴 très élevé · effort faible)*
   Permettre à `MesocycleEntry` de s'afficher dès `bilan_pending` (questionnaire
   + KPIs faits) avec un bandeau « bilan physique coach non encore fait —
   confiance réduite », et laisser la notation coach **enrichir** le bilan plus
   tard. Le moteur tolère déjà `physical_tests = null`. C'est le **plus gros gain
   pour le plus petit effort** : ça réalise enfin le Mode A.
   *Alternative produit* : si l'on veut garder le filet coach, ajouter un bouton
   nageur « Démarrer mon bilan » (`createAssessment` avec `coach_id = null`) pour
   au moins lever le **premier** verrou (A1).

2. **Bouton nageur « Démarrer mon bilan »** *(impact 🔴 élevé · effort faible)*
   Aujourd'hui un nouveau nageur ne peut rien initier. Exposer `createAssessment`
   côté `/strength` (avec `coach_id = null`, le coach reste notifié). Lève A1 et
   transforme le cul-de-sac KPI (A4) en parcours.

3. **Écran de génération pilotable par le coach** *(impact 🟠 élevé · effort
   moyen)* Ajouter une sélection de nageur + propagation de `athleteId` à
   `MesocycleGeneration` / `MesocyclePreview` (ou un point d'entrée
   `/coach/...` réutilisant ces écrans avec une cible). La RPC `apply` accepte
   déjà l'appelant coach — c'est purement de l'UI. Réalise B5 et rend le Mode B
   crédible.

4. **Édition fine d'une séance générée** *(impact 🟠 élevé · effort moyen-élevé)*
   Donner au coach un levier entre « rien » et « tout rejeter » : ouvrir une
   séance `[Méso …]` dans un éditeur (charge / substitution) depuis le panneau
   mésocycle ou le planning. **Pré-requis** : décider du comportement du revert
   vis-à-vis des items édités (préserver `mesocycle_id` à l'édition). Aligne le
   produit sur le guide utilisateur (qui le promet déjà).

5. **Questionnaire pilotable par le coach** *(impact 🟡 moyen · effort moyen)*
   Permettre au coach de saisir le questionnaire **avec** le nageur sur
   `StrengthAssessmentScreen` (mode « bilan accompagné »), au lieu d'attendre que
   le nageur le fasse seul. Complète B2 pour la vraie session « 30 min–1 h ».

6. **Aligner le guide utilisateur sur la réalité** *(impact 🟡 · effort faible)*
   Le guide (`bilan-muscu-guide-utilisateurs.md` §1.3, §3 étape 3, §4 étape 3,
   §7) décrit (a) un nageur « autonome » qui ne l'est pas et (b) une édition
   coach séance-par-séance qui n'existe pas. Tant que les reco 1/3/4 ne sont pas
   livrées, corriger la doc pour ne pas promettre des capacités absentes.

7. **Réintégrer l'entrée §298 dans `implementation-log.md`** *(impact 🟡 ·
   effort trivial)* Les commits `§298` existent en git (dont
   `e5d9a5f59 docs(§298): implementation-log…`) mais l'entrée a disparu du
   journal (probablement écrasée au merge #76 de §297). Trou de traçabilité.

---

## Annexes

### A. Sorties tsc / test / build

```
$ npx tsc --noEmit
exit 0

$ npm test
ℹ tests 901
ℹ pass 901
ℹ fail 0
ℹ duration_ms 37429

$ npm run build
exit 0 — PWA generateSW, precache 273 entries (~6.0 MiB), dist/sw.js généré
```

### B. Requêtes SQL prod (`fscnobivsgornxdwqwlk`) + résultats

```sql
-- 5.1 statuts des assessments
SELECT status, COUNT(*) FROM strength_assessments GROUP BY status;
-- → completed : 1   (aucun questionnaire_pending / bilan_pending résiduel)

-- 5.3 détail de l'unique assessment
SELECT id, athlete_id, coach_id, status,
       physical_tests IS NOT NULL AS coach_noted,
       questionnaire  IS NOT NULL AS swimmer_filled,
       bucket_scores  IS NOT NULL AS scored
  FROM strength_assessments ORDER BY created_at DESC LIMIT 20;
-- → athlete_id=1, coach_id=3, completed, coach_noted=true, swimmer_filled=true, scored=false
--   (le scoring n'est pas persisté sur l'assessment — calculé à la preview)

-- 5.2 mésocycles + générateur
SELECT m.status, m.generated_by, u.display_name, u.role, m.event_group, m.kind,
       m.target_week_count FROM strength_mesocycles m
  LEFT JOIN users u ON u.id = m.generated_by ORDER BY m.generated_at DESC;
-- → active, generated_by=1 (François WAGNER, role=athlete), sprint_50,
--   inter_competition, 5 semaines
--   ⇒ généré par le NAGEUR, mais seulement après finalisation coach du bilan

-- 5.4 RPC apply/revert
SELECT proname, pg_get_function_arguments(oid), prosecdef
  FROM pg_proc WHERE proname IN ('apply_strength_mesocycle','revert_strength_mesocycle');
-- → apply (p_athlete_id, …, p_weeks) SECURITY DEFINER=true
--   revert (p_mesocycle_id uuid)      SECURITY DEFINER=true
```

**Lecture** : le flux a été exercé **une seule fois** en prod, et exactement
selon le pattern « coach initie + finalise → nageur génère ». Aucun bilan
autonome (coach_id null) ni mésocycle généré par un coach n'existe — cohérent
avec les verrous identifiés.

### C. Fichiers-preuves (chemin:ligne)

| Constat | Preuve |
|---|---|
| Tuile méso gatée `completed` | `src/components/strength/MesocycleEntry.tsx:44` |
| `completed` = notation coach only | `src/lib/api/strength-assessments.ts:90-106` ← `StrengthAssessmentScreen.tsx:262` |
| Questionnaire = `bilan_pending` (nageur) | `src/lib/api/strength-assessments.ts:72-88` ← `StrengthQuestionnaire.tsx:163` |
| `createAssessment` coach-only | `StrengthAssessmentScreen.tsx:219` (seul appelant non-test) |
| Questionnaire bloqué si null assessment | `StrengthQuestionnaire.tsx:292-304` |
| Coach attend le questionnaire nageur | `StrengthAssessmentScreen.tsx:562-585` |
| KPIs pilotables coach | `KpiWizard.tsx:86-138,256,435` |
| Génération câblée session | `MesocycleGeneration.tsx:141` ; `MesocyclePreview.tsx:198,229-233,309` |
| `applyMesocycle` cible `assessment.athlete_id` | `src/lib/api/strength-mesocycles.ts:118` |
| Planning coach read-only | `StrengthPlanningScreen.tsx:2,329-335,455,460-465` |
| Panneau méso = pas de builder | `CoachMesocyclePanel.tsx:10` |
| Revert (tout ou rien) | `CoachMesocyclePanel.tsx:158-159,326-362` |
| `[Méso]` filtrés du catalogue | mig `00180` (§296) |
| Onboarding nageur (3 tuiles gatées) | `StrengthBilanEntry.tsx:39` + `MesocycleEntry.tsx:44` |
| §298 absent du log | `grep "§298" docs/implementation-log.md` → seule occurrence l.113 « hors scope » |

---

*Audit clos le 2026-05-23 — aucune modification de code. Conclusion : le moteur
et la persistance sont solides (validé §293), mais le **parcours** ne réalise ni
le Mode A (autonomie verrouillée aux deux bouts) ni le Mode B (pas de génération
ni de questionnaire pilotés coach), et le contrôle coach a posteriori se limite
au revert. Les recommandations 1-3 (effort faible-moyen) suffisent à rapprocher
nettement l'existant de la vision.*

---

## Validation indépendante — 2026-05-23

> Ce rapport a été **re-audité de bout en bout** dans une seconde passe (lecture
> seule, aucune modification de code). Objectif : confirmer ou infirmer chaque
> conclusion avant de la considérer comme actionnable. **Verdict : toutes les
> conclusions tiennent.** Aucune correction matérielle nécessaire.

**Sanity reproduit sur l'arbre courant (post-§297)** :

```
npx tsc --noEmit   → exit 0
npm test           → tests 901 / pass 901 / fail 0 (duration ~38,6 s)
npm run build      → ✓ built in 23.67s · PWA generateSW · precache 273 entries (~6.0 MiB)
```

**Points-preuves re-vérifiés ligne par ligne** (tous confirmés) :

| Conclusion du rapport | Re-vérif `fichier:ligne` |
|---|---|
| Tuile méso gatée `completed` | `MesocycleEntry.tsx:44` ✅ |
| `completed` = notation coach uniquement | `strength-assessments.ts:90-106` (seul `status:'completed'`) ← `StrengthAssessmentScreen.tsx:262` ✅ |
| Questionnaire = `bilan_pending` seulement | `strength-assessments.ts:72-88` ← `StrengthQuestionnaire.tsx:163` ✅ |
| Nageur sans bilan → cul-de-sac | `StrengthQuestionnaire.tsx:292-306` « Ton coach doit d'abord initier un bilan muscu » ✅ |
| `createAssessment` coach-only | unique appelant non-test `StrengthAssessmentScreen.tsx:219` (grep) ✅ |
| Coach attend le questionnaire nageur | `StrengthAssessmentScreen.tsx:562-585` (branche `questionnaire_pending` = état d'attente) ✅ |
| KPIs pilotables coach | `KpiWizard.tsx:138` (`athleteId = isCoach ? selectedAthleteId : userId`), `:256` (`source=wizard_coach`) ✅ |
| Génération câblée session courante | `MesocycleGeneration.tsx:141` + `MesocyclePreview.tsx:198,231` (`useAuth(userId)`, aucun `useParams`) ✅ |
| Planning coach read-only | `StrengthPlanningScreen.tsx:336` (`handleSlotTap` no-op), `:455` (`readOnly`), `:460-465` (`MyPlanSessionSheet … readOnly`) ✅ |
| Notif apply → coach / revert → nageur | mig `00172` l.271-302 (target coach via groupe) ; mig `00173` l.173-186 (notif nageur ssi `caller ≠ athlete`) ✅ |
| §298 absent de `implementation-log.md` | commits `§298` présents en git (`e5d9a5f59`…) mais aucune entrée dans le journal (grep) ✅ |

**Donnée prod confirmée** : 1 assessment (`athlete_id=1, coach_id=3, completed`,
questionnaire **et** physical_tests non-null), 1 mésocycle (`generated_by=1`,
rôle `athlete`, `sprint_50 / inter_competition`, 5 sem.) → le seul parcours réel
suit exactement le motif « coach amorce + finalise → nageur génère ».

**Deux points cosmétiques** (non corrigés ici, à intégrer si le rapport est
retravaillé) :
1. Le read-only du planning est étiqueté `§298` dans le code (commentaires
   `StrengthPlanningScreen.tsx:328,401`) ; les commits git `§298` portent eux sur
   les métriques d'intensité / gating 1RM — léger enchevêtrement de numérotation
   (recoupe la reco 7).
2. Ajouter une ligne au § « Frictions » : la notification `apply → coach`
   fonctionne, mais le **handoff coach → nageur au démarrage du bilan est
   silencieux** (aucune notif ; le nageur ne découvre la carte `QuestionnairePrompt`
   qu'en ouvrant `/strength` — déjà partiellement couvert par A5).

*Validation close le 2026-05-23 — findings du rapport intégralement confirmés,
aucune modification de code.*
