# Parcours Mésocycle — 2 modes + édition coach — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Réaliser les deux modes d'entrée du Bilan Muscu (nageur autonome + coach piloté) à parité, et donner au coach l'édition fine d'une séance générée, sans toucher au moteur ni au schéma applicatif.

**Architecture:** *Paramétrer, ne pas dupliquer.* Les 3 écrans nageur (`StrengthQuestionnaire`, `MesocycleGeneration`, `MesocyclePreview`) acceptent un `athleteId` optionnel (défaut = session), sur le modèle déjà en place dans `KpiWizard.tsx:138` (`athleteId = isCoach ? selectedAthleteId : userId`). La RPC `apply_strength_mesocycle` autorise déjà l'appelant coach. Le seul DDL est une policy RLS (`pain_coach_write`) + un trigger de notification. Le verrou `completed` qui bloquait l'autonomie est abaissé à `bilan_pending`.

**Tech Stack:** React 19 + TS + Vite + Tailwind 4 + shadcn/ui + Wouter (hash routing) + Zustand + React Query + Supabase (RLS `app_user_id()`/`app_user_role()`). Tests : `node:test`+`tsx` (`npm test`) ; RLS via `npm run test:rls` (Docker). UI vérifiée par `tsc`/`build`/smoke.

**Design de référence:** `docs/plans/2026-05-23-bilan-muscu-parcours-fixes-design.md` · **Audit:** `docs/audits/2026-05-23-audit-parcours-creation-mesocycle.md`.

**Conventions projet (rappel):**
- Migrations : créer le fichier SQL dans `supabase/migrations/00XXX_*.sql` **ET** appliquer via MCP `mcp__plugin_supabase_supabase__apply_migration` (project `fscnobivsgornxdwqwlk`). Numéro = incrément après le dernier existant.
- UI/UX : toute surface nouvelle/modifiée passe par `/frontend-design` (règle projet) avant codage visuel.
- Jamais de déploiement local ni `git push` non demandé.
- Commits fréquents, messages terminés par `Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>`.

---

## Task 0 : Branche de travail + numéro de chantier

**Files:** aucun fichier de code ; setup git.

**Step 1:** Déterminer le prochain § libre. Lancer :
```bash
grep -oE "^## §[0-9]+" docs/implementation-log.md | head -1
git log --oneline --all | grep -oE "§[0-9]+" | sort -u | tail -5
```
Le dernier livré dans le log est §297 ; des commits `§298` existent en git mais sans entrée log (Task 16). **Numéro de ce chantier = §299** (ajuster si un §298/§299 apparaît dans le log entre-temps).

**Step 2:** Créer une branche (worktree recommandé, cf. §297) :
```bash
git checkout -b feat/299-parcours-mesocycle-2modes
```

**Step 3:** Vérifier l'état de départ vert (baseline) :
```bash
npx tsc --noEmit && echo OK
npm test 2>&1 | tail -5
```
Expected : `tsc` exit 0 ; `pass 901 / fail 0`.

---

## Task 1 : Helper pur `canGenerateMesocycle` (W1)

Extraire la règle de gating dans une fonction pure testable (pattern §297 `missing1rmFilter.ts`).

**Files:**
- Create: `src/lib/strength/mesocycleGating.ts`
- Test: `src/lib/strength/__tests__/mesocycleGating.test.ts`

**Step 1: Write the failing test**
```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { canGenerateMesocycle } from "../mesocycleGating";

test("canGenerateMesocycle: bilan_pending unlocks generation (autonomie)", () => {
  assert.equal(canGenerateMesocycle("bilan_pending"), true);
});
test("canGenerateMesocycle: completed unlocks generation", () => {
  assert.equal(canGenerateMesocycle("completed"), true);
});
test("canGenerateMesocycle: questionnaire_pending stays locked", () => {
  assert.equal(canGenerateMesocycle("questionnaire_pending"), false);
});
test("canGenerateMesocycle: null/undefined stays locked", () => {
  assert.equal(canGenerateMesocycle(null), false);
  assert.equal(canGenerateMesocycle(undefined), false);
});
```

**Step 2: Run test to verify it fails**
Run: `npx tsx --test src/lib/strength/__tests__/mesocycleGating.test.ts`
Expected: FAIL (`Cannot find module '../mesocycleGating'`).

**Step 3: Write minimal implementation**
```ts
/** Gating de la génération du mésocycle (§299). */
import type { StrengthAssessment } from "@/lib/api/types";

type Status = StrengthAssessment["status"] | null | undefined;

/**
 * La génération est débloquée dès que le questionnaire est soumis
 * (`bilan_pending`). La notation physique coach (`completed`) reste un
 * enrichissement, pas un gate — le moteur tolère `physical_tests = null`.
 */
export function canGenerateMesocycle(status: Status): boolean {
  return status === "bilan_pending" || status === "completed";
}
```

**Step 4: Run test to verify it passes**
Run: `npx tsx --test src/lib/strength/__tests__/mesocycleGating.test.ts`
Expected: PASS (4 tests).

**Step 5: Commit**
```bash
git add src/lib/strength/mesocycleGating.ts src/lib/strength/__tests__/mesocycleGating.test.ts
git commit -m "feat(§299): helper canGenerateMesocycle (gate bilan_pending)"
```

---

## Task 2 : Abaisser le verrou dans `MesocycleEntry` (W1)

**Files:**
- Modify: `src/components/strength/MesocycleEntry.tsx:44`

**Step 1:** Remplacer la garde stricte par le helper. Ligne 44 actuelle :
```tsx
if (!assessment || assessment.status !== "completed") return null;
```
devient :
```tsx
if (!assessment || !canGenerateMesocycle(assessment.status)) return null;
```
Ajouter l'import en tête : `import { canGenerateMesocycle } from "@/lib/strength/mesocycleGating";`

**Step 2:** (UI/UX — `/frontend-design`) Sur la variante « action attendue » (pas de mésocycle actif), si `assessment.status === "bilan_pending"`, ajouter un sous-texte discret « Bilan physique coach non encore réalisé — confiance réduite ». Ne pas bloquer le clic.

**Step 3: Verify**
Run: `npx tsc --noEmit && echo OK`
Expected: exit 0.
Smoke manuel (`npm run dev`) : un nageur `bilan_pending` voit la tuile « Génère ton mésocycle ».

**Step 4: Commit**
```bash
git add src/components/strength/MesocycleEntry.tsx
git commit -m "feat(§299): MesocycleEntry débloque à bilan_pending + bandeau confiance"
```

---

## Task 3 : Entrée nageur « Démarrer mon bilan » (W1)

Aujourd'hui un nageur sans assessment ne voit rien (`QuestionnairePrompt` gaté `questionnaire_pending`). Ajouter une tuile d'amorçage autonome.

**Files:**
- Modify: `src/components/strength/StrengthBilanEntry.tsx` (nouvelle tuile `StartBilanEntry`)
- Modify: `src/pages/Strength.tsx:1052-1055` (monter la tuile)
- Test: `src/lib/api/__tests__/strength-assessments.test.ts` (cas `coach_id: null` déjà couvert l.99 — vérifier, sinon ajouter)

**Step 1:** Vérifier le test wrapper existant :
Run: `npx tsx --test src/lib/api/__tests__/strength-assessments.test.ts`
Expected: PASS. (`createAssessment({athlete_id, coach_id:null})` est déjà testé l.99.)

**Step 2:** (UI/UX — `/frontend-design`) Créer `StartBilanEntry({ userId })` dans `StrengthBilanEntry.tsx` :
- Query `getLatestAssessment(userId)`.
- **Visible uniquement** si `assessment == null` OU `assessment.status === "completed"` (sinon le flux est déjà en cours → `QuestionnairePrompt`/`MesocycleEntry` prennent le relais).
- Au clic : `useMutation` → `createAssessment({ athlete_id: userId, coach_id: null })` → `invalidateQueries(["strength-assessment-latest", userId])` → `navigate("/strength/questionnaire")`.
- Toast succès « Bilan démarré ». Garder anti-double-tap (await refetch, cf. pattern `StrengthAssessmentScreen.tsx:228-237`).

**Step 3:** Monter dans `Strength.tsx` au-dessus de `QuestionnairePrompt` (l.1052) : `<StartBilanEntry userId={userId} />`.

**Step 4: Verify**
Run: `npx tsc --noEmit && echo OK`
Smoke : nageur sans bilan → voit « Démarrer mon bilan » → clic → questionnaire éditable.

**Step 5: Commit**
```bash
git add src/components/strength/StrengthBilanEntry.tsx src/pages/Strength.tsx
git commit -m "feat(§299): tuile nageur 'Démarrer mon bilan' (createAssessment coach_id=null)"
```

---

## Task 4 : Bandeau confiance réduite sur la preview (W1)

**Files:**
- Modify: `src/pages/MesocyclePreview.tsx` (zone raisonnement, ~l.730+)

**Step 1:** (UI/UX — `/frontend-design`) Quand `assessment.status === "bilan_pending"` (donc `physical_tests` absent), afficher au-dessus du raisonnement un bandeau informatif : « Bilan physique coach non encore réalisé — le score Mobilité est conservateur et la confiance des données est réduite. » Réutiliser le pattern bandeau existant de la preview (override/psy).

**Step 2: Verify**
Run: `npx tsc --noEmit && echo OK`
Smoke : preview d'un nageur `bilan_pending` montre le bandeau ; un `completed` ne le montre pas.

**Step 3: Commit**
```bash
git add src/pages/MesocyclePreview.tsx
git commit -m "feat(§299): bandeau confiance réduite sur preview à bilan_pending"
```

---

## Task 5 : Spine `athleteId` — `MesocycleGeneration` (W2)

**Files:**
- Modify: `src/pages/MesocycleGeneration.tsx:141,155-163,220`
- Modify: `src/App.tsx` (route `/coach/mesocycle-generate/:athleteId`)

**Step 1:** Introduire la cible effective. En tête du composant, remplacer l'usage direct de `userId` :
```tsx
// Route param (mode coach) > session (mode nageur)
const params = useParams(); // wouter useParams
const targetParam = params.athleteId ? Number(params.athleteId) : null;
const role = useAuth((s) => s.role);
const isCoach = role === "coach" || role === "admin";
const effectiveAthleteId = (isCoach && targetParam) ? targetParam : userId;
```
Puis remplacer `getLatestAssessment(userId!)`, `getProfile({userId})`, `useCompetitionsByWeek(userId)` par `effectiveAthleteId`. **Garde de rôle** : si `targetParam != null && !isCoach`, rediriger `/strength` (un nageur ne génère que pour lui).

**Step 2:** (UI/UX — `/frontend-design`) Si `effectiveAthleteId !== userId`, afficher un en-tête de cible non ambigu : « Tu génères pour : <nom du nageur> » (résoudre le nom via `getAthletes()` comme `StrengthAssessmentScreen`).

**Step 3:** Ajouter la route dans `App.tsx` (à côté de `/strength/mesocycle-generate`) :
```tsx
<Route path="/coach/mesocycle-generate/:athleteId">
  <Suspense fallback={<PageLoader/>}><MesocycleGeneration/></Suspense>
</Route>
```
Le « Voir l'aperçu » doit naviguer vers `/coach/mesocycle-preview/:athleteId` quand en mode coach (sinon route nageur).

**Step 4: Verify**
Run: `npx tsc --noEmit && echo OK`

**Step 5: Commit**
```bash
git add src/pages/MesocycleGeneration.tsx src/App.tsx
git commit -m "feat(§299): MesocycleGeneration paramétrable par athleteId (mode coach)"
```

---

## Task 6 : Spine `athleteId` — `MesocyclePreview` (W2)

**Files:**
- Modify: `src/pages/MesocyclePreview.tsx:198,224-238,272`
- Modify: `src/App.tsx` (route `/coach/mesocycle-preview/:athleteId`)

**Step 1:** Même pattern que Task 5 (`effectiveAthleteId`). Remplacer `userId` dans `getProfile`, `getLatestAssessment`, `getLatestKpiMeasurements`, et l'invalidation `["strength-mesocycle-active", userId]` → `effectiveAthleteId`. `applyMesocycle` cible déjà `assessment.athlete_id` (l.272) → correct dès que l'assessment chargé est celui de la cible.

**Step 2:** En-tête de cible (réutiliser le composant de Task 5).

**Step 3:** Après `applyMesocycle` réussi en mode coach, naviguer vers `/coach/swimmer/:athleteId` (onglet Planning) plutôt que `/strength`.

**Step 4:** Route `App.tsx` :
```tsx
<Route path="/coach/mesocycle-preview/:athleteId">
  <Suspense fallback={<PageLoader/>}><MesocyclePreview/></Suspense>
</Route>
```

**Step 5: Verify**
Run: `npx tsc --noEmit && echo OK`

**Step 6: Commit**
```bash
git add src/pages/MesocyclePreview.tsx src/App.tsx
git commit -m "feat(§299): MesocyclePreview paramétrable par athleteId + retour fiche nageur"
```

---

## Task 7 : Points d'entrée coach vers la génération (W2)

**Files:**
- Modify: `src/pages/coach/StrengthAssessmentScreen.tsx:465-493` (done-state)
- Modify: `src/components/coach/CoachMesocyclePanel.tsx` (bouton Générer/Régénérer)

**Step 1:** (UI/UX — `/frontend-design`) Dans le done-state du bilan (`submittedLocally`), ajouter un bouton primaire **« Générer le mésocycle »** → `navigate("/coach/mesocycle-generate/" + selectedAthleteId)`. (L'écran dit déjà « Le mésocycle pourra être généré » sans action — combler.)

**Step 2:** Dans `CoachMesocyclePanel`, ajouter un bouton **« Régénérer »** (à côté de « Rejeter ») → `/coach/mesocycle-generate/:athleteId`. Le panel connaît déjà l'`athleteId` du nageur affiché.

**Step 3: Verify**
Run: `npx tsc --noEmit && echo OK`
Smoke : coach termine un bilan → bouton « Générer » → écran génération avec en-tête de cible → preview → confirmer → mésocycle posé chez le nageur, visible côté nageur (« Mon plan »).

**Step 4: Commit**
```bash
git add src/pages/coach/StrengthAssessmentScreen.tsx src/components/coach/CoachMesocyclePanel.tsx
git commit -m "feat(§299): points d'entrée coach vers la génération (done-state + panel)"
```

---

## Task 8 : Test RLS — le coach génère pour un nageur (W2)

**Files:**
- Modify: `supabase/tests/rls/strength-mesocycle-rpc.test.ts`

**Pré-requis Docker** : vérifier `docker ps` (1× max). Si Docker n'est pas lancé, **demander à l'utilisateur** de démarrer Docker Desktop et attendre confirmation (règle CLAUDE.md). Puis `supabase start` si besoin.

**Step 1: Write the test** (positif — le scénario négatif « autre athlète bloqué » existe déjà) :
```ts
it("apply_strength_mesocycle: un coach applique pour un nageur de son club", async () => {
  // arrange : coach + athlète + assessment bilan_pending (cf. helpers du harness)
  // act : appel RPC en tant que coach avec p_athlete_id = athlète
  // assert : mésocycle inséré status 'active', generated_by = coach.id,
  //          slot_overrides matérialisés pour l'athlète.
});
```
(Suivre la structure existante du fichier — réutiliser les fixtures et le `callRpcAs`.)

**Step 2: Run**
Run: `npm run test:rls -- strength-mesocycle-rpc`
Expected: tous verts (12 existants + 1 nouveau).

**Step 3: Commit**
```bash
git add supabase/tests/rls/strength-mesocycle-rpc.test.ts
git commit -m "test(§299): RLS coach applique mésocycle pour un nageur"
```

---

## Task 9 : Spine `athleteId` — `StrengthQuestionnaire` (W3)

**Files:**
- Modify: `src/pages/StrengthQuestionnaire.tsx:95-104,158,163`
- Modify: `src/App.tsx` (route `/coach/questionnaire/:athleteId`)

**Step 1:** Pattern `effectiveAthleteId` (Task 5). Remplacer `userId` dans `getLatestAssessment`, `upsertPainReports(effectiveAthleteId, …)`, `updateAssessmentQuestionnaire(assessment.id, …)` (l'`assessment.id` est déjà celui de la cible chargée).

**Step 2:** (UI/UX — `/frontend-design`) En-tête de cible « Bilan de : <nom> » quand `effectiveAthleteId !== userId`. Texte recentré « avec le nageur ».

**Step 3:** Route `App.tsx` `/coach/questionnaire/:athleteId`. Garde de rôle (coach/admin only pour le param).

**Step 4: Verify**
Run: `npx tsc --noEmit && echo OK`

**Step 5: Commit**
```bash
git add src/pages/StrengthQuestionnaire.tsx src/App.tsx
git commit -m "feat(§299): StrengthQuestionnaire paramétrable par athleteId (mode accompagné)"
```

---

## Task 10 : Policy RLS `pain_coach_write` (W3 — seul DDL applicatif)

Le coach qui remplit le questionnaire déclenche `upsertPainReports` (INSERT/UPDATE/DELETE) sur les lignes d'un autre user. Aujourd'hui `pain_reports` n'a que `pain_own` (self) + `pain_coach_read` (SELECT).

**Files:**
- Create: `supabase/migrations/00XXX_pain_coach_write.sql` (numéro = incrément réel)
- Modify: `supabase/tests/schema.sql` + un nouveau test RLS (Task 11)

**Step 1:** Écrire la migration :
```sql
-- 00XXX_pain_coach_write.sql — §299
-- Le coach/admin peut écrire les pain_reports d'un nageur (questionnaire
-- accompagné). Cohérent avec strength_assessments_coach (club-wide).
CREATE POLICY pain_coach_write ON public.pain_reports
  FOR ALL TO authenticated
  USING (app_user_role() = ANY (ARRAY['coach','admin']))
  WITH CHECK (app_user_role() = ANY (ARRAY['coach','admin']));
```

**Step 2:** Appliquer via MCP `mcp__plugin_supabase_supabase__apply_migration` (project `fscnobivsgornxdwqwlk`, name `pain_coach_write`).

**Step 3:** Refléter la policy dans le schéma de test `supabase/tests/schema.sql` (le harness n'a pas la prod — ajouter la policy à la main, cf. `docs/rls-testing.md`).

**Step 4: Verify (post-migration)** via MCP `execute_sql` :
```sql
SELECT policyname, cmd FROM pg_policies WHERE tablename='pain_reports';
```
Expected: `pain_own`(ALL) + `pain_coach_read`(SELECT) + `pain_coach_write`(ALL).

**Step 5: Commit**
```bash
git add supabase/migrations/00XXX_pain_coach_write.sql supabase/tests/schema.sql
git commit -m "feat(§299): RLS pain_coach_write (coach remplit le questionnaire)"
```

---

## Task 11 : Entrée coach « Remplir avec le nageur » + test RLS (W3)

**Files:**
- Modify: `src/pages/coach/StrengthAssessmentScreen.tsx:562-585` (branche `questionnaire_pending`)
- Create/Modify: test RLS `supabase/tests/rls/strength-assessments.test.ts`

**Step 1:** (UI/UX — `/frontend-design`) Sur la branche d'attente, remplacer (ou compléter) le message passif par un bouton **« Remplir avec le nageur »** → `navigate("/coach/questionnaire/" + selectedAthleteId)`. Garder « Évaluer un autre nageur ».

**Step 2: Test RLS** : coach upsert questionnaire + pain pour un nageur :
```ts
it("coach remplit le questionnaire d'un nageur (assessment + pain)", async () => {
  // act : en tant que coach, update strength_assessments.questionnaire (athlète)
  //       + upsert pain_reports (athlète)
  // assert : les deux writes réussissent (RETURNING non vide), status -> bilan_pending
});
```

**Step 3: Run**
`docker ps` (réutiliser le check de Task 8). Puis :
Run: `npm run test:rls -- strength-assessments`
Expected: verts.

**Step 4: Verify UI**
Run: `npx tsc --noEmit && echo OK`
Smoke : coach démarre bilan → « Remplir avec le nageur » → questionnaire (en-tête cible) → submit → bilan passe `bilan_pending` → coach peut noter le physique.

**Step 5: Commit**
```bash
git add src/pages/coach/StrengthAssessmentScreen.tsx supabase/tests/rls/strength-assessments.test.ts
git commit -m "feat(§299): coach 'Remplir avec le nageur' + test RLS questionnaire/pain"
```

---

## Task 12 : Invariant `mesocycle_id` à l'édition — helper + test (W4)

Le revert détruit les items par `raw_payload->>'mesocycle_id'` (mig `00173`). Toute édition coach (y compris items **ajoutés**) doit **préserver** cette clé, sinon orphelin/survivant au revert.

**Files:**
- Create: `src/lib/strength/mesocycleItemPayload.ts` (helper `preserveMesocycleTag`)
- Test: `src/lib/strength/__tests__/mesocycleItemPayload.test.ts`

**Step 1: Write the failing test**
```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { preserveMesocycleTag } from "../mesocycleItemPayload";

test("garde mesocycle_id sur un item édité", () => {
  const prev = { mesocycle_id: "abc", periodization_cycle: "force_max" };
  const out = preserveMesocycleTag({ /* nouveau payload sans la clé */ }, prev);
  assert.equal(out.mesocycle_id, "abc");
});
test("propage mesocycle_id à un item ajouté dans une séance de mésocycle", () => {
  const out = preserveMesocycleTag({}, { mesocycle_id: "abc" });
  assert.equal(out.mesocycle_id, "abc");
});
test("ne fabrique pas de tag hors mésocycle", () => {
  const out = preserveMesocycleTag({}, {});
  assert.equal("mesocycle_id" in out, false);
});
```

**Step 2: Run → FAIL**
Run: `npx tsx --test src/lib/strength/__tests__/mesocycleItemPayload.test.ts`

**Step 3: Implement**
```ts
/** Préserve le tag mésocycle d'un item à l'édition coach (§299). */
type Payload = Record<string, unknown> & { mesocycle_id?: string };

export function preserveMesocycleTag(next: Payload, prev: Payload | null | undefined): Payload {
  const tag = prev?.mesocycle_id;
  if (tag == null) return next;
  return { ...next, mesocycle_id: tag };
}
```

**Step 4: Run → PASS**

**Step 5: Commit**
```bash
git add src/lib/strength/mesocycleItemPayload.ts src/lib/strength/__tests__/mesocycleItemPayload.test.ts
git commit -m "feat(§299): helper preserveMesocycleTag (invariant revert)"
```

---

## Task 13 : Édition coach d'une séance générée (W4)

**Files:**
- Modify: `src/pages/coach/StrengthPlanningScreen.tsx:336,455,460-465` (affordance édition en mode athlète)
- Modify: `src/components/strength/MyPlanSessionSheet.tsx` (ou le builder ciblé) — câbler le save via `preserveMesocycleTag`
- Référence : builder de séance strength existant (cf. `CoachMesocyclePanel.tsx:10` « le builder n'est PAS recréé ici » → on l'y branche)

**Step 1:** (UI/UX — `/frontend-design`) En mode athlète (coach), le tap d'une séance `[Méso …]` ouvre une action **« Éditer »** (en plus du preview read-only). L'édition route vers le builder strength existant chargé sur cette `strength_sessions`.

**Step 2:** Au save du builder pour une séance de mésocycle, passer chaque item par `preserveMesocycleTag(nextPayload, prevPayload)` afin que `raw_payload.mesocycle_id` survive (items modifiés **et** ajoutés). Les writes utilisent les policies coach existantes (`strength_items_write`, `strength_sessions_write` — déjà coach/admin, cf. design § 6).

**Step 3: Verify**
Run: `npx tsc --noEmit && echo OK`
Smoke : coach ouvre une séance générée → change une charge / substitue un exo / ajoute un exo → save → le nageur voit la séance modifiée dans « Mon plan ».

**Step 4: Commit**
```bash
git add src/pages/coach/StrengthPlanningScreen.tsx src/components/strength/MyPlanSessionSheet.tsx
git commit -m "feat(§299): édition fine coach d'une séance générée (builder + tag préservé)"
```

---

## Task 14 : Test RLS/intégration — édit puis revert → 0 résiduel (W4)

**Files:**
- Modify: `supabase/tests/rls/strength-mesocycle-rpc.test.ts`

**Step 1: Write the test**
```ts
it("revert nettoie aussi les items édités/ajoutés par le coach (mesocycle_id préservé)", async () => {
  // arrange : mésocycle appliqué ; coach édite une séance (UPDATE item) +
  //           ajoute un item AVEC raw_payload.mesocycle_id du cycle.
  // act : revert_strength_mesocycle(mesocycle_id) en tant que coach.
  // assert : 0 strength_session_items résiduel avec ce mesocycle_id ;
  //          snapshot pré-mésocycle restauré ; mésocycle status 'reverted'.
});
```

**Step 2: Run**
Run: `npm run test:rls -- strength-mesocycle-rpc`
Expected: verts.

**Step 3: Commit**
```bash
git add supabase/tests/rls/strength-mesocycle-rpc.test.ts
git commit -m "test(§299): revert nettoie les items édités coach (invariant mesocycle_id)"
```

---

## Task 15 : Notification handoff coach→nageur au démarrage du bilan (W5)

Aujourd'hui `createAssessment` côté coach est silencieux (le nageur ne découvre la carte qu'en ouvrant `/strength`). Fermer A5 via un trigger DB (robuste, pas de write notif côté client).

**Files:**
- Create: `supabase/migrations/00XXX_notify_assessment_started.sql`

**Step 1:** Trigger `AFTER INSERT ON strength_assessments` : si `coach_id IS NOT NULL AND coach_id <> athlete_id`, insérer une notification + `notification_targets` pour l'athlète (réutiliser exactement le pattern de notif de `00172` l.279-302, type `strength_assessment`).
```sql
-- 00XXX_notify_assessment_started.sql — §299
CREATE OR REPLACE FUNCTION notify_assessment_started() RETURNS trigger AS $$
DECLARE v_notif_id bigint;
BEGIN
  IF NEW.coach_id IS NOT NULL AND NEW.coach_id <> NEW.athlete_id THEN
    INSERT INTO notifications (title, body, type, created_by, metadata)
    VALUES ('Bilan muscu demandé',
            'Ton coach a démarré un bilan. Remplis ton questionnaire pour le préparer.',
            'strength_assessment', NEW.coach_id,
            jsonb_build_object('assessment_id', NEW.id, 'target_role', 'athlete'))
    RETURNING id INTO v_notif_id;
    INSERT INTO notification_targets (notification_id, target_user_id)
    VALUES (v_notif_id, NEW.athlete_id);
  END IF;
  RETURN NEW;
END; $$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_notify_assessment_started ON public.strength_assessments;
CREATE TRIGGER trg_notify_assessment_started
  AFTER INSERT ON public.strength_assessments
  FOR EACH ROW EXECUTE FUNCTION notify_assessment_started();
```

**Step 2:** Appliquer via MCP. Vérifier les noms de colonnes réels de `notifications`/`notification_targets` avec `list_tables` avant d'appliquer (ne pas inventer).

**Step 3: Verify (post-migration)** via `execute_sql` : insérer un assessment de test (coach_id ≠ athlete_id), vérifier 1 notification + 1 target, puis rollback/cleanup.

**Step 4: Commit**
```bash
git add supabase/migrations/00XXX_notify_assessment_started.sql
git commit -m "feat(§299): notif nageur au démarrage d'un bilan par le coach"
```

> **test:rls** : trigger sur table sous RLS → ajouter un scénario « insert assessment coach crée la notif athlète » si le harness couvre `notifications` ; sinon, vérif MCP suffit (documenter).

---

## Task 16 : Ré-insérer l'entrée §298 perdue (W5 — traçabilité)

**Files:**
- Modify: `docs/implementation-log.md`

**Step 1:** Récupérer le contenu de l'entrée §298 depuis git :
```bash
git show e5d9a5f59:docs/implementation-log.md | sed -n '/## §298/,/## §297/p'
```
(Adapter le commit si besoin — `git log --oneline --all | grep §298`.)

**Step 2:** Ré-insérer le bloc §298 **entre** §299 (ce chantier, en tête) et §297 dans `docs/implementation-log.md`. Ne pas dupliquer.

**Step 3: Commit**
```bash
git add docs/implementation-log.md
git commit -m "docs(§299): restaure l'entrée §298 perdue au merge"
```

---

## Task 17 : Clôture — vérification globale + documentation

**Files:**
- Modify: `docs/implementation-log.md` (entrée §299 complète)
- Modify: `docs/ROADMAP.md` (statut + ligne « Dernière mise à jour »)
- Modify: `docs/FEATURES_STATUS.md` (Mode A / Mode B / Édition coach)
- Modify: `CLAUDE.md` (« Dernier § livré » = §299 ; tableau hubs si nouveau fichier ≥150 l. ou rôle architectural)
- Modify: `docs/claude/files-map.md` (nouveaux fichiers : `mesocycleGating.ts`, `mesocycleItemPayload.ts` ; tailles via `wc -l`)
- Modify: `docs/bilan-muscu-guide-utilisateurs.md` (réaligner : autonomie réelle + génération coach + édition coach — le guide les promet déjà)

**Step 1: Vérification complète**
```bash
npx tsc --noEmit && echo TSC_OK
npm test 2>&1 | tail -5          # attendu : pass = 901 + nouveaux (gating 4 + payload 3)
npm run build 2>&1 | tail -3     # attendu : built OK
# Docker requis (réutiliser le check) :
npm run test:rls 2>&1 | tail -10 # attendu : verts (dont nouveaux W2/W3/W4)
```
Utiliser **superpowers:verification-before-completion** : ne revendiquer « fait » qu'après avoir lu ces sorties.

**Step 2:** Mettre à jour les 6 fichiers de doc (workflow obligatoire CLAUDE.md). L'entrée §299 trace : contexte (audit 2026-05-23), les 5 workstreams, fichiers, migrations (`pain_coach_write`, `notify_assessment_started`), tests, décisions, limites.

**Step 3: Commit**
```bash
git add docs/ CLAUDE.md
git commit -m "docs(§299): clôture — 2 modes + édition coach (log/ROADMAP/FEATURES/CLAUDE/files-map/guide)"
```

**Step 4:** Proposer la suite (PR/merge) via **superpowers:finishing-a-development-branch** — ne pas push/merge sans demande explicite.

---

## Definition of Done (rappel design § 10)

- **Mode A** vérifié bout-en-bout : nageur sans coach démarre → questionnaire → KPIs → génère.
- **Mode B** vérifié bout-en-bout : coach fait tout (bilan + questionnaire avec le nageur + KPIs + physique + génération) sans changer d'appareil.
- **Édition coach** : ouvrir/éditer une séance générée ; l'édit survit jusqu'au revert (test RLS).
- **Non-régression** : `tsc` 0 · `npm test` vert · `build` OK · `test:rls` vert.
- **Doc** réalignée (les 6 fichiers + guide utilisateurs).
