# Éditer un ancien bilan (scores physiques) — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (ou subagent-driven-development) pour implémenter tâche par tâche.

**Goal:** Permettre au coach d'éditer les scores physiques (mobilité/mouvement G/D + notes) d'un ancien bilan depuis l'historique.

**Architecture:** `BilanHistorySection` expose un bouton « Éditer » (lignes notées) → `StrengthAssessmentScreen` passe en « mode édition » (`editingAssessmentId`), recharge le formulaire bilatéral existant prérempli, et la sauvegarde cible cet id au lieu du dernier bilan.

**Tech Stack:** React 19 / TS, vitest jsdom. UI via `/frontend-design` (règle projet). Design : `docs/plans/2026-05-30-edit-past-bilan-design.md`.

**Vérifs :** `npx tsc --noEmit` ; `npx vitest run --config vitest.config.unit.ts <fichier>` ; `node --test --experimental-test-module-mocks --import tsx "src/**/*.test.ts" "src/**/*.test.tsx"` ; `npm run build`. **Aucune migration → pas de `test:rls`.**

---

## Task 1 : Édition d'un ancien bilan (UI + branchement sauvegarde)

> REQUIRED SUB-SKILL : `/frontend-design` (UI). TDD.

**Files:**
- Modify: `src/components/strength/assessment/BilanHistorySection.tsx` (ajouter une prop `onEdit` + bouton « Éditer »)
- Modify: `src/pages/coach/StrengthAssessmentScreen.tsx` (état `editingAssessmentId`, rendu du form en mode édition, cible de sauvegarde, garde du préremplissage)
- Test: `src/pages/coach/StrengthAssessmentScreen.gd.vitest.tsx` (ou un nouveau `*.edit.vitest.tsx`) + éventuel ajout dans `BilanHistorySection.vitest.tsx`

**Contrat précis :**

1. `BilanHistorySection` :
   - Ajouter `onEdit?: (a: StrengthAssessment) => void` aux props.
   - Sur chaque ligne dont `assessment.physical_tests != null`, ajouter un bouton **« Éditer »** (icône crayon, style cohérent app) qui appelle `onEdit?.(assessment)` (sans déclencher l'expand de la ligne — `stopPropagation` si besoin). Pas de bouton sur les lignes sans physical_tests.

2. `StrengthAssessmentScreen` :
   - Nouvel état `const [editingAssessmentId, setEditingAssessmentId] = useState<string | null>(null);`
   - Handler `handleEditPast(a: StrengthAssessment)` : `setEditingAssessmentId(a.id)` + `setScores(scoreStateFromNormalized(normalizePhysicalTests(a.physical_tests)))` (importer `normalizePhysicalTests` de `@/lib/strength/physicalTests` ; `scoreStateFromNormalized` est déjà importé). Passer `onEdit={handleEditPast}` aux deux montages de `<BilanHistorySection>`.
   - **Garde du préremplissage** : l'effet (~ligne 289) qui fait `setScores(scoreStateFromNormalized(...))` depuis le dernier `assessment` doit être gardé par `if (editingAssessmentId) return;` (ne pas écraser les scores en cours d'édition). Ajouter `editingAssessmentId` aux deps.
   - **Rendu du formulaire** : le bloc de saisie bilatérale (champs `AssessmentBilateralField` + note de synthèse + bouton de soumission) doit s'afficher quand `isScoring` **OU** `editingAssessmentId != null`. Si l'écran branche aujourd'hui ce bloc uniquement sous `isScoring` (statut `bilan_pending`), élargir la condition. En mode édition, afficher en tête un **bandeau** « Édition du bilan du {date formatée de l'ancien bilan} » + un bouton **« Annuler »** qui fait `setEditingAssessmentId(null)` (l'effet de préremplissage, désormais non gardé, ré-aligne `scores` sur le dernier bilan).
   - **Cible de sauvegarde** : dans la `mutationFn` de la mutation physique (~ligne 336-348), remplacer `assessment.id` par `editingAssessmentId ?? assessment.id`. Sur `onSuccess`, ajouter `setEditingAssessmentId(null)` et invalider `["assessment-history", selectedAthleteId]` (en plus des invalidations existantes `["strength-assessment", …]`).

**Step 1 — Test RED** (vitest). Dans le mock `@/lib/api`, `listAssessments` doit renvoyer un ancien bilan complété (id `"old-1"`, `physical_tests` v2 avec p.ex. `shoulder_flexion {left:3,right:3}`) + le `getLatestAssessment` habituel. Le test :
- rend l'écran (athlète sélectionné), trouve la ligne d'historique de `old-1`, clique son bouton « Éditer » ;
- vérifie que le formulaire est prérempli (épaule G=3/D=3) et qu'un bandeau « Édition du bilan » est visible ;
- change la **droite** de l'épaule à 0, clique sauvegarder ;
- asserte `updateAssessmentPhysicalTests` appelé avec **`"old-1"`** et un payload où `mobility.shoulder_flexion.right === 0`.
Écrire le test, le lancer → RED (pas de bouton « Éditer » / cible = dernier id).

**Step 2 — Run RED** : `npx vitest run --config vitest.config.unit.ts <le fichier>` → FAIL.

**Step 3 — Implémenter (GREEN)** selon le contrat ci-dessus (via `/frontend-design` pour le bouton + bandeau).

**Step 4 — Run GREEN** : le test passe ; relancer aussi `StrengthAssessmentScreen.vitest.tsx` + `.gd.vitest.tsx` + `BilanHistorySection.vitest.tsx` (non-régression).

**Step 5 — Vérifs** : `npx tsc --noEmit` (0) ; `node --test … "src/**/*.test.ts" "src/**/*.test.tsx"` (pas de régression) ; `npm run build` (OK).

**Step 6 — Commit** : `git add src/components/strength/assessment/BilanHistorySection.tsx src/pages/coach/StrengthAssessmentScreen.tsx <fichiers test> && git commit -m "feat(§348): édition coach d'un ancien bilan (scores physiques G/D)"`

---

## Task 2 : Vérif intégrale + doc

`tsc` 0, suites vertes, build OK. Mettre à jour `docs/implementation-log.md` (§348), `docs/ROADMAP.md` (tête), `docs/FEATURES_STATUS.md` (tête), `CLAUDE.md` (Dernier §). Pas de nouveau fichier ≥150 lignes ni de variation de taille >30 % attendue → files-map probablement inchangé (vérifier `wc -l` de `StrengthAssessmentScreen.tsx` : déjà ~939, l'ajout est petit). Commit.

---

## Risques / pièges

- **Effet de préremplissage** : sans la garde `editingAssessmentId`, l'effet écrase les scores de l'ancien bilan dès un re-render/refetch → bug subtil. Le test doit rester vert après un changement de valeur (pas de ré-écrasement).
- **Statut** : `updateAssessmentPhysicalTests` force `status:'completed'` — c'est voulu (un bilan complété reste complété) ; ne pas ajouter de logique de statut.
- **Annuler** : doit revenir proprement à la vue normale (form du dernier bilan / done-state selon le statut courant).
