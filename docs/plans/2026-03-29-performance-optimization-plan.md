# Performance Optimization — Plan d'implémentation

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Transformer l'app EAC d'un outil de gestion en un outil d'optimisation de la performance, en 5 vagues ordonnées par dépendances et impact.

**Architecture:** 5 vagues incrémentales. Chaque vague livre de la valeur visible. Les données collectées en Vague 1 (wellness, sRPE, difficulté muscu) alimentent les dashboards de la Vague 2 (charge, analytics). Les Vagues 3-5 exploitent les données accumulées pour l'engagement et les features premium.

**Tech Stack:** React 19, TypeScript, Supabase (PostgreSQL + RLS), Recharts, Zustand, React Query 5, Tailwind CSS 4, Radix UI/Shadcn

**Design doc:** `docs/plans/2026-03-29-performance-optimization-design.md`

---

## Conventions du plan

- Chaque tâche est autonome et peut être implémentée dans une session Claude Code indépendante
- Les tâches au sein d'une vague sont ordonnées par dépendances
- Chaque tâche suit le cycle : migration → API module → tests → composant UI → tests UI → commit
- Les fichiers existants importants sont référencés avec leur chemin exact
- Le workflow de documentation (`docs/implementation-log.md`, `FEATURES_STATUS.md`, `ROADMAP.md`, `CLAUDE.md`) s'applique à chaque tâche complétée

---

# VAGUE 1 — Socle data

## Tâche 1.1 : Table wellness_checks + API module

**Dépendances :** Aucune
**But :** Créer la table, les policies RLS, et le module API CRUD pour le wellness quotidien.

**Files:**
- Create: `supabase/migrations/00XXX_wellness_checks.sql`
- Create: `src/lib/api/wellness.ts`
- Modify: `src/lib/api/index.ts` (re-export)
- Modify: `src/lib/api/types.ts` (interface WellnessCheck)
- Test: `src/__tests__/wellness.test.ts`

**Step 1: Écrire la migration**

```sql
-- supabase/migrations/00XXX_wellness_checks.sql

CREATE TABLE IF NOT EXISTS wellness_checks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  sleep_quality SMALLINT NOT NULL CHECK (sleep_quality BETWEEN 1 AND 5),
  sleep_hours NUMERIC(3,1) CHECK (sleep_hours BETWEEN 0 AND 16),
  fatigue SMALLINT NOT NULL CHECK (fatigue BETWEEN 1 AND 5),
  soreness SMALLINT NOT NULL CHECK (soreness BETWEEN 1 AND 5),
  mood SMALLINT NOT NULL CHECK (mood BETWEEN 1 AND 5),
  stress SMALLINT NOT NULL CHECK (stress BETWEEN 1 AND 5),
  readiness_score SMALLINT NOT NULL CHECK (readiness_score BETWEEN 0 AND 100),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, date)
);

-- Index pour les requêtes coach (tous les nageurs d'un groupe sur une période)
CREATE INDEX idx_wellness_user_date ON wellness_checks(user_id, date DESC);

-- RLS
ALTER TABLE wellness_checks ENABLE ROW LEVEL SECURITY;

-- Nageur : CRUD sur ses propres données
CREATE POLICY wellness_own ON wellness_checks
  FOR ALL USING (user_id = app_user_id())
  WITH CHECK (user_id = app_user_id());

-- Coach : lecture des nageurs de ses groupes
CREATE POLICY wellness_coach_read ON wellness_checks
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = app_user_id() AND u.role IN ('coach', 'admin')
    )
  );
```

**Step 2: Écrire l'interface TypeScript**

Ajouter dans `src/lib/api/types.ts` :

```typescript
export interface WellnessCheck {
  id: string;
  user_id: number;
  date: string;
  sleep_quality: number;
  sleep_hours: number;
  fatigue: number;
  soreness: number;
  mood: number;
  stress: number;
  readiness_score: number;
  notes?: string | null;
  created_at: string;
}
```

**Step 3: Écrire le module API**

Créer `src/lib/api/wellness.ts` avec :

```typescript
// Fonctions à implémenter :
// - getWellnessForDate(userId, date) → WellnessCheck | null
// - getWellnessRange(userId, startDate, endDate) → WellnessCheck[]
// - getGroupWellnessForDate(groupId, date) → WellnessCheck[] (coach)
// - upsertWellness(data) → WellnessCheck (INSERT ON CONFLICT UPDATE)
// - computeReadinessScore(data) → number (0-100)
//
// Formule readiness :
// ((sleep_quality + (11 - fatigue*2) + (11 - soreness*2) + mood + (11 - stress*2)) / 25) * 100
// Clamped à [0, 100]
```

**Step 4: Écrire les tests**

```typescript
// src/__tests__/wellness.test.ts
// - Test computeReadinessScore avec valeurs extrêmes (tout à 1, tout à 5, mix)
// - Test upsertWellness crée puis met à jour (UNIQUE constraint)
// - Test getWellnessRange retourne les bons jours ordonnés
```

**Step 5: Re-exporter dans `src/lib/api/index.ts`**

**Step 6: Commit**

```bash
git commit -m "feat(wellness): add wellness_checks table, API module, and tests"
```

---

## Tâche 1.2 : UI Questionnaire Wellness (nageur)

**Dépendances :** Tâche 1.1
**But :** Formulaire wellness quotidien accessible depuis le Dashboard nageur.

**Files:**
- Create: `src/components/wellness/WellnessForm.tsx`
- Create: `src/components/wellness/WellnessBanner.tsx`
- Create: `src/components/wellness/ReadinessGauge.tsx`
- Modify: `src/pages/Dashboard.tsx` (~936 lignes) — ajouter banner + drawer
- Modify: `src/lib/api/types.ts` si besoin

**Contexte fichiers existants :**
- `src/pages/Dashboard.tsx` : le dashboard nageur, contient déjà le calendrier et le FeedbackDrawer
- `src/components/dashboard/FeedbackDrawer.tsx` : le formulaire de ressenti post-session (1026 lignes)
- `src/components/shared/ObjectiveCard.tsx` : contient un ring SVG réutilisable pour le readiness score

**Step 1: Créer le composant WellnessForm**

- 6 champs avec boutons 1-5 (style identique aux indicateurs du FeedbackDrawer lignes 69-84)
- Champ sleep_hours avec stepper (même pattern que DistanceStepper dans FeedbackDrawer lignes 155-280)
- Champ notes optionnel (textarea)
- Bouton "Enregistrer" qui appelle `upsertWellness()`
- Après soumission : affiche le ReadinessGauge avec le score

**Step 2: Créer WellnessBanner**

- Banner conditionnelle : visible si `getWellnessForDate(userId, today)` retourne null
- Texte : "Comment te sens-tu ce matin ?" avec bouton "Remplir"
- Au tap : ouvre un Drawer/Sheet avec le WellnessForm
- Disparaît après soumission (invalidation React Query)
- Position : au-dessus du calendrier dans Dashboard.tsx (même position que la bannière compétition existante)

**Step 3: Créer ReadinessGauge**

- Ring SVG circulaire (réutiliser le pattern du ring dans ObjectiveCard.tsx)
- Score 0-100 au centre, couleur : vert >70, orange 40-70, rouge <40
- Mini-sparkline 7 jours en dessous (7 barres verticales, même pattern que l'activité dans CoachSwimmersOverview lignes 396-406)

**Step 4: Intégrer dans Dashboard.tsx**

- Ajouter la query React Query `["wellness", userId, todayDate]`
- Insérer `<WellnessBanner>` au-dessus du calendrier
- Optionnel : afficher le ReadinessGauge mini dans un coin du dashboard si rempli

**Step 5: Tests**

- Test WellnessForm : soumission valide, validation des bornes 1-5
- Test WellnessBanner : visible si pas rempli, masquée si rempli
- Test ReadinessGauge : couleur correcte selon score

**Step 6: Commit**

```bash
git commit -m "feat(wellness): add daily wellness questionnaire UI on swimmer dashboard"
```

---

## Tâche 1.3 : Wellness côté coach (fiche nageur + overview)

**Dépendances :** Tâche 1.2
**But :** Le coach voit le wellness de ses nageurs.

**Files:**
- Create: `src/components/coach/WellnessTrend.tsx`
- Modify: `src/pages/coach/CoachSwimmersOverview.tsx` (~433 lignes) — ajouter pastille readiness
- Modify: `src/pages/coach/CoachSwimmerDetail.tsx` (~120 lignes) — ajouter section/onglet wellness

**Contexte fichiers existants :**
- `src/pages/coach/CoachSwimmersOverview.tsx` : grille cards nageurs avec KPIs (forme 5-dots, activité 30j, last seen). Fonction `computeFormeScore()` lignes 24-47.
- `src/pages/coach/CoachSwimmerDetail.tsx` : fiche nageur avec onglets (Résumé, Planning, Échanges, Comms)

**Step 1: Créer WellnessTrend**

- Composant réutilisable : graphique Recharts (AreaChart ou LineChart) des 4 dernières semaines
- Props : `userId`, `period` (default 28 jours)
- Query : `getWellnessRange(userId, startDate, endDate)`
- 2 vues possibles :
  - **Compact** (pour l'overview) : sparkline readiness seul
  - **Full** (pour la fiche nageur) : 6 métriques + readiness, avec legend, même style que Progress.tsx

**Step 2: Enrichir CoachSwimmersOverview**

- Ajouter une query batch `getGroupWellnessForDate(groupId, today)` pour tous les nageurs
- Sur chaque card nageur, ajouter une pastille readiness à côté du score Forme existant :
  - Cercle coloré (vert/orange/rouge) avec le score en texte
  - Si pas de wellness aujourd'hui : pastille grise "—"
- Ajouter une alerte visuelle (icône ⚠️ orange) si le readiness est en baisse sur 3+ jours consécutifs
  - Logique : comparer readiness J, J-1, J-2. Si les 3 sont en baisse stricte → alerte

**Step 3: Ajouter à la fiche nageur**

- Option A : nouvel onglet "Bien-être" dans CoachSwimmerDetail
- Option B : section dans l'onglet "Résumé" existant
- Contenu : `<WellnessTrend userId={athleteId} />` en mode full

**Step 4: Tests**

- Test WellnessTrend : rendu correct avec données mock, mode compact vs full
- Test alerte tendance baissière : 3 jours consécutifs en baisse → alerte, sinon non

**Step 5: Commit**

```bash
git commit -m "feat(wellness): add readiness indicator on coach overview + wellness trend on swimmer detail"
```

---

## Tâche 1.4 : Enrichir le feedback natation avec sRPE

**Dépendances :** Tâche 1.1 (pour la cohérence conceptuelle, pas technique)
**But :** Calculer le sRPE automatiquement à partir du champ `effort` (difficulté 1-5) existant et de la durée du créneau.

**Files:**
- Create: `supabase/migrations/00XXX_session_duration.sql`
- Modify: `src/lib/api/types.ts` (ajouter `session_duration_minutes` à Session)
- Modify: `src/pages/Dashboard.tsx` — passer la durée du créneau au save
- Modify: `src/components/dashboard/FeedbackDrawer.tsx` — optionnel: afficher la durée dérivée
- Create: `src/lib/trainingLoadHelpers.ts` — fonctions pures de calcul

**Contexte fichiers existants :**
- `dim_sessions` table : contient déjà `rpe` (= effort/difficulté 1-5) et `duration` (en secondes, mais souvent 0)
- `src/hooks/useSlotCalendar.ts` : matérialise les créneaux récurrents → contient start_time/end_time
- `src/lib/api/training-slots.ts` : CRUD créneaux, contient les horaires

**Step 1: Migration — s'assurer que la durée est disponible**

```sql
-- Si dim_sessions.duration est souvent vide, ajouter un champ dédié
ALTER TABLE dim_sessions ADD COLUMN IF NOT EXISTS session_duration_minutes INTEGER;

-- Rétrofill depuis les créneaux si possible (optionnel, peut être fait en JS)
COMMENT ON COLUMN dim_sessions.session_duration_minutes IS 'Durée session en minutes, dérivée du créneau ou saisie manuellement';
```

**Step 2: Créer trainingLoadHelpers.ts**

```typescript
// src/lib/trainingLoadHelpers.ts — Fonctions pures, testables

export function computeSRPE(difficulty: number, durationMinutes: number): number {
  // difficulty 1-5 (échelle existante), duration en minutes
  return difficulty * durationMinutes;
}

export function computeAcuteLoad(srpeValues: { date: string; srpe: number }[]): number {
  // Somme des sRPE sur les 7 derniers jours
}

export function computeChronicLoad(srpeValues: { date: string; srpe: number }[]): number {
  // Moyenne quotidienne des sRPE sur les 28 derniers jours
}

export function computeACWR(acute: number, chronic: number): number | null {
  // acute / chronic, null si chronic === 0 (pas assez de données)
}

export function acwrZone(acwr: number): 'optimal' | 'warning' | 'danger' {
  if (acwr >= 0.8 && acwr <= 1.3) return 'optimal';
  if (acwr >= 0.6 && acwr <= 1.5) return 'warning';
  return 'danger';
}

export function computeMonotony(dailyLoads: number[]): number {
  // mean / stddev sur 7 jours
}

export function computeStrain(totalLoad7d: number, monotony: number): number {
  return totalLoad7d * monotony;
}
```

**Step 3: Enrichir la sauvegarde dans Dashboard.tsx**

- Lors du `saveFeedback()` (lignes 521-574), dériver `session_duration_minutes` depuis le créneau assigné (training slot start_time → end_time)
- Stocker dans `dim_sessions.session_duration_minutes`
- Le sRPE n'est pas stocké en base — il est calculé à la volée (effort × duration)

**Step 4: Tests**

```typescript
// src/__tests__/trainingLoadHelpers.test.ts
// - computeSRPE(3, 90) === 270
// - computeSRPE(5, 60) === 300
// - computeACWR(acute, chronic) cas normaux + chronic === 0
// - acwrZone pour chaque zone
// - computeMonotony avec données connues
```

**Step 5: Commit**

```bash
git commit -m "feat(training-load): add sRPE derivation from existing difficulty + training load helpers"
```

---

## Tâche 1.5 : Difficulté optionnelle par série (musculation)

**Dépendances :** Aucune (parallélisable avec 1.1-1.4)
**But :** Ajouter un champ difficulté 1-5 optionnel par série dans le WorkoutRunner.

**Files:**
- Create: `supabase/migrations/00XXX_strength_set_difficulty.sql`
- Modify: `src/components/strength/WorkoutRunner.tsx` (~1301 lignes) — ajouter champ difficulté
- Modify: `src/lib/api/strength.ts` (~850 lignes) — sauvegarder la difficulté
- Modify: `src/lib/api/types.ts` — ajouter `difficulty` à SetLogEntry

**Contexte fichiers existants :**
- `strength_set_logs` table : contient déjà `rpe` (INTEGER, souvent null). On peut réutiliser ce champ ou en ajouter un nouveau nommé `difficulty`.
- `WorkoutRunner.tsx` : le composant de saisie par série, lignes 155-189 pour le state

**Step 1: Migration**

```sql
-- Si le champ rpe existe déjà dans strength_set_logs, on le renomme pour clarté
-- OU on ajoute un champ difficulty séparé
ALTER TABLE strength_set_logs ADD COLUMN IF NOT EXISTS difficulty SMALLINT CHECK (difficulty BETWEEN 1 AND 5);
```

**Step 2: Ajouter le champ UI dans WorkoutRunner**

- Badge discret à côté du champ reps/charge de chaque série
- 5 petits cercles (1-5) ou un mini toggle group
- Par défaut : rien de sélectionné (nullable)
- Au tap : sélectionne la difficulté, re-tap pour désélectionner
- Ne doit PAS ralentir le flow de saisie — le nageur peut l'ignorer complètement

**Step 3: Sauvegarder dans strength.ts**

- Inclure `difficulty` dans le payload de `logSetData()` et `saveStrengthRun()`
- Ajouter `difficulty` à l'interface `SetLogEntry` dans types.ts

**Step 4: Tests**

- Test sauvegarde avec et sans difficulté
- Test UI : la série se sauvegarde correctement si difficulté est null

**Step 5: Commit**

```bash
git commit -m "feat(strength): add optional difficulty 1-5 per set in WorkoutRunner"
```

---

# VAGUE 2 — Exploitation data

## Tâche 2.1 : Hook useTrainingLoad + données agrégées

**Dépendances :** Tâches 1.4
**But :** Hook React centralisé pour calculer toutes les métriques de charge d'un nageur.

**Files:**
- Create: `src/hooks/useTrainingLoad.ts`
- Test: `src/__tests__/useTrainingLoad.test.ts`

**Step 1: Créer le hook**

```typescript
// src/hooks/useTrainingLoad.ts
//
// Props : { userId: number, days?: number }
// Returns : {
//   dailyLoads: { date: string; swimLoad: number; strengthLoad: number; totalLoad: number }[]
//   acuteLoad: number
//   chronicLoad: number
//   acwr: number | null
//   acwrZone: 'optimal' | 'warning' | 'danger'
//   monotony: number
//   strain: number
//   isLoading: boolean
// }
//
// Queries internes :
// 1. Sessions natation (dim_sessions) : effort × session_duration_minutes
// 2. Sessions musculation (strength_session_runs + strength_set_logs) :
//    - Si difficulty renseignée : avg(difficulty) × durée run
//    - Sinon : volume normalisé (total tonnage / facteur de normalisation)
// 3. Utilise les fonctions pures de trainingLoadHelpers.ts
```

**Step 2: Tests**

- Mock des données React Query
- Vérifier les calculs ACWR avec des datasets connus

**Step 3: Commit**

```bash
git commit -m "feat(training-load): add useTrainingLoad hook for centralized load computation"
```

---

## Tâche 2.2 : Dashboard charge coach — vue grille enrichie

**Dépendances :** Tâches 1.3, 2.1
**But :** Ajouter ACWR et charge sur les cards nageurs du CoachSwimmersOverview.

**Files:**
- Modify: `src/pages/coach/CoachSwimmersOverview.tsx` (~433 lignes)
- Create: `src/components/coach/AcwrBadge.tsx`
- Create: `src/components/coach/LoadMiniChart.tsx`

**Contexte :**
- CoachSwimmersOverview.tsx lignes 325-416 : card nageur actuelle avec Forme (5-dots), Activité (sparkline), Last seen

**Step 1: Créer AcwrBadge**

- Badge compact : "0.9" en vert, "1.4" en orange, "1.7" en rouge
- Tooltip au long-press : "Ratio charge aiguë/chronique — zone optimale : 0.8-1.3"

**Step 2: Créer LoadMiniChart**

- Mini bar chart 4 semaines (4 barres, charge hebdo totale)
- Même pattern que les sparklines existantes (CoachSwimmersOverview lignes 396-406)

**Step 3: Intégrer dans les cards**

- Ajouter une rangée sous les KPIs existants : `[Readiness pastille] [ACWR badge] [Charge 4sem]`
- Utiliser `useTrainingLoad` pour chaque nageur visible (attention perf : limiter aux nageurs affichés, pas tous)
- Tri/filtre : ajouter options "Readiness ↑", "ACWR hors zone" dans le filtre existant

**Step 4: Tests**

- Test AcwrBadge : couleur correcte par zone
- Test intégration : la card affiche les 3 nouveaux indicateurs

**Step 5: Commit**

```bash
git commit -m "feat(coach): add ACWR badge and load mini chart on swimmer overview cards"
```

---

## Tâche 2.3 : Dashboard charge coach — vue détaillée (fiche nageur)

**Dépendances :** Tâche 2.1
**But :** Graphique charge détaillé dans la fiche nageur.

**Files:**
- Create: `src/components/coach/TrainingLoadChart.tsx`
- Modify: `src/pages/coach/CoachSwimmerDetail.tsx` — ajouter section/onglet

**Step 1: Créer TrainingLoadChart**

- Recharts ComposedChart (même lib que Progress.tsx) :
  - Barres empilées quotidiennes : nage (bleu) + muscu (violet)
  - Ligne superposée : ACWR
  - ReferenceArea grisée : zone optimale 0.8-1.3
  - Période : 4 semaines par défaut, toggle 8 semaines
- En dessous : wellness sparklines (réutiliser WellnessTrend de la tâche 1.3)
- En dessous : tableau semaine en cours (jour | charge | difficulté | wellness | présence)
- Alertes textuelles conditionnelles :
  - ACWR > 1.5 → "⚠️ Risque de surcharge"
  - ACWR < 0.6 → "⚠️ Sous-entraînement"
  - ACWR dans 0.8-1.3 → "✅ Zone optimale"

**Step 2: Intégrer dans la fiche nageur**

- Ajouter comme section dans l'onglet Résumé existant, ou comme nouvel onglet "Charge"

**Step 3: Tests**

- Test TrainingLoadChart : rendu avec données mock, alertes conditionnelles

**Step 4: Commit**

```bash
git commit -m "feat(coach): add detailed training load chart on swimmer detail page"
```

---

## Tâche 2.4 : Analytics volume natation — agrégation

**Dépendances :** Aucune technique (les blocs SwimBlock existent déjà)
**But :** Fonctions d'agrégation du volume natation depuis les séances structurées.

**Files:**
- Create: `src/lib/swimAnalytics.ts`
- Test: `src/__tests__/swimAnalytics.test.ts`

**Contexte :**
- `SwimExercise` (swimTextParser.ts:53-63) : `stroke`, `strokeType`, `distance`, `intensity`, `equipment`
- `SwimBlock` (swimTextParser.ts:65-72) : `exercises[]`, `repetitions`
- Les séances sont stockées avec leur `raw_payload` contenant les blocs parsés
- Les assignments lient séances → groupes/nageurs
- La présence est trackée dans `dim_sessions`

**Step 1: Créer swimAnalytics.ts**

```typescript
// src/lib/swimAnalytics.ts — Fonctions pures d'agrégation

export interface SwimVolumeEntry {
  date: string;
  totalMeters: number;
  byStroke: Record<string, number>;     // NL, DOS, BR, PAP, QN, EDU, MIXTE
  byType: Record<string, number>;       // endurance, technique, vitesse, mixte
  byIntensity: Record<string, number>;  // V0, V1, V2, V3, Max, Prog
}

// Mapper stroke du parser vers catégorie normalisée
export function normalizeStroke(stroke: string): string { ... }

// Mapper intensity + strokeType vers type de travail
export function classifyWorkType(intensity: string, strokeType: string): string { ... }

// Calculer le volume d'une séance depuis ses blocs
export function computeSessionVolume(blocks: SwimBlock[]): SwimVolumeEntry { ... }

// Agréger par semaine
export function aggregateByWeek(entries: SwimVolumeEntry[]): WeeklySwimVolume[] { ... }
```

**Step 2: Tests**

```typescript
// src/__tests__/swimAnalytics.test.ts
// - computeSessionVolume avec blocs connus (2×400 NL V1 + 4×100 PAP Max)
// - normalizeStroke couvre les variantes (crawl→NL, papillon→PAP, etc.)
// - aggregateByWeek regroupe correctement
// - Cas avec repetitions sur les blocs (multiply distance)
```

**Step 3: Commit**

```bash
git commit -m "feat(swim-analytics): add pure aggregation functions for swim volume by stroke/type/intensity"
```

---

## Tâche 2.5 : Analytics volume natation — UI coach

**Dépendances :** Tâche 2.4
**But :** Graphiques de volume natation dans l'interface coach.

**Files:**
- Create: `src/components/coach/SwimVolumeCharts.tsx`
- Create: `src/hooks/useSwimAnalytics.ts`
- Modify: navigation coach — ajouter accès Analytics

**Step 1: Créer useSwimAnalytics hook**

```typescript
// Props : { groupId?: number, userId?: number, weeks: number }
// 1. Fetch les séances assignées sur la période (assignments + swim_catalog items)
// 2. Pour chaque séance : extraire les blocs depuis raw_payload
// 3. Croiser avec la présence (dim_sessions) pour filtrer sur qui était là
// 4. Appeler computeSessionVolume() + aggregateByWeek()
// Returns : { weeklyVolumes: WeeklySwimVolume[], isLoading }
```

**Step 2: Créer SwimVolumeCharts**

- 3 graphiques Recharts StackedBarChart :
  1. **Volume par nage** : barres empilées par semaine, une couleur par nage
  2. **Volume par type** : endurance (bleu), technique (vert), vitesse (rouge), mixte (gris)
  3. **Volume par intensité** : V0-V3 + Max, dégradé de couleur
- Filtre : groupe, période (4 / 8 sem / saison)
- Ligne totale superposée
- Mode compact (un seul graphique) pour la fiche nageur, mode full pour la page analytics

**Step 3: Intégrer dans la navigation coach**

- Nouvel onglet "Analytics" dans CoachLibrary ou nouvelle page accessible depuis le dashboard coach
- Dans la fiche nageur : section dans l'onglet Résumé ou nouvel onglet

**Step 4: Ajouter la comparaison individuel vs groupe**

- En vue individuelle : ligne pointillée = moyenne du groupe sur la même période
- Tooltip : "Moyenne groupe : X m — Toi : Y m"

**Step 5: Tests**

- Test SwimVolumeCharts : rendu avec données mock
- Test useSwimAnalytics : agrégation correcte

**Step 6: Commit**

```bash
git commit -m "feat(swim-analytics): add swim volume charts for coach (by stroke, type, intensity)"
```

---

# VAGUE 3 — Analytics & engagement

## Tâche 3.1 : Détection PR live (musculation)

**Dépendances :** Aucune
**But :** Détecter et célébrer les records personnels pendant la séance muscu.

**Files:**
- Create: `src/lib/prDetection.ts`
- Modify: `src/components/strength/WorkoutRunner.tsx` — ajouter la détection + toast
- Test: `src/__tests__/prDetection.test.ts`

**Contexte :**
- `one_rm_records` table : stocke les 1RM par exercice et athlète
- `strength_set_logs` : historique de toutes les séries
- `WorkoutRunner.tsx` : lignes 155-189 pour le state, `onLogSets` callback

**Step 1: Créer prDetection.ts**

```typescript
// src/lib/prDetection.ts

export type PrType = 'estimated_1rm' | 'weight_at_reps' | 'session_volume';

export interface PrDetection {
  type: PrType;
  exerciseId: number;
  newValue: number;
  previousValue: number;
  improvement: number; // pourcentage
}

// Formule Epley : 1RM = weight × (1 + reps / 30)
export function estimateOneRM(weight: number, reps: number): number { ... }

// Comparer la série courante avec l'historique
export function detectPR(
  currentSet: { exerciseId: number; weight: number; reps: number },
  history: { weight: number; reps: number; estimated1rm: number }[],
  currentBest1rm: number
): PrDetection | null { ... }
```

**Step 2: Intégrer dans WorkoutRunner**

- À chaque série validée : appeler `detectPR()` avec l'historique de l'exercice
- Si PR détecté : afficher un toast animé (Sonner ou custom) avec confetti léger
  - "🏆 Nouveau record ! 1RM estimé : 85kg (+5%)"
- Marquer la série avec une icône trophée dans l'UI
- Pas de stockage supplémentaire — le 1RM est déjà mis à jour via le flow existant

**Step 3: Badge PR dans l'historique**

- Dans la liste des séances historiques (Strength.tsx tab Historique) : afficher un badge "PR" sur les séances contenant au moins un record

**Step 4: Tests**

```typescript
// - estimateOneRM(100, 5) ≈ 116.67
// - detectPR avec nouveau record → retourne PrDetection
// - detectPR sans record → retourne null
// - detectPR avec reps uniquement (poids du corps) → weight_at_reps
```

**Step 5: Commit**

```bash
git commit -m "feat(strength): add live PR detection with toast celebration in WorkoutRunner"
```

---

## Tâche 3.2 : Graphiques détaillés par exercice

**Dépendances :** Tâche 1.5 (pour overlay difficulté), mais fonctionnel sans
**But :** Courbes de progression par exercice de musculation.

**Files:**
- Create: `src/components/strength/ExerciseProgressChart.tsx`
- Create: `src/hooks/useExerciseHistory.ts`
- Modify: `src/pages/Strength.tsx` — ajouter navigation vers le graphique

**Contexte :**
- `strength_set_logs` : toutes les séries par exercice
- `one_rm_records` : historique 1RM
- `Progress.tsx` : pattern Apple Health déjà utilisé (hero KPI + graphique)

**Step 1: Créer useExerciseHistory hook**

```typescript
// Props : { exerciseId: number, userId: number, months?: number }
// Returns : {
//   sessions: { date: string; sets: SetLog[]; estimated1rm: number; totalVolume: number; bestSet: SetLog; avgDifficulty?: number }[]
//   current1rm: number
//   delta1rm: number (vs début de période)
//   isLoading: boolean
// }
```

**Step 2: Créer ExerciseProgressChart**

- **Hero KPI** : 1RM actuel + delta (même style que Progress.tsx)
- **LineChart** : courbe 1RM estimé dans le temps
- **BarChart** : volume par séance (séries × reps × charge)
- Si difficulté renseignée : couleur des barres selon difficulté moyenne (vert 1-2, jaune 3, orange 4, rouge 5)
- Période : 3 mois par défaut, toggle 6 mois / 1 an

**Step 3: Intégrer dans Strength.tsx**

- Depuis l'historique : tap sur un exercice → ouvre ExerciseProgressChart en drawer ou page
- Depuis le WorkoutRunner : lien "Voir progression" sur chaque exercice

**Step 4: Tests**

- Test rendu avec données mock
- Test delta 1RM calcul correct

**Step 5: Commit**

```bash
git commit -m "feat(strength): add per-exercise progress charts (1RM, volume, difficulty overlay)"
```

---

## Tâche 3.3 : Corrélation présence → performance

**Dépendances :** Aucune (données existantes)
**But :** Scatter plot montrant le lien entre assiduité et progression des temps.

**Files:**
- Create: `src/components/coach/AttendancePerformanceChart.tsx`
- Create: `src/hooks/useAttendancePerformance.ts`
- Modify: navigation coach Analytics

**Contexte :**
- `dim_sessions` : présence par nageur/date
- `swimmer_performances` : temps compétition FFN par nageur/épreuve
- `training_slot_assignments` : nombre de créneaux attendus

**Step 1: Créer useAttendancePerformance hook**

```typescript
// Props : { groupId?: number, months: number, eventCode?: string }
// Pour chaque nageur :
//   1. Calculer taux de présence = sessions enregistrées / créneaux assignés sur la période
//   2. Calculer progression = (meilleur temps fin de période - meilleur temps début) / meilleur temps début × 100
//      (négatif = amélioration, car temps plus bas = meilleur)
// Returns : { points: { name: string; attendance: number; improvement: number }[], correlation: number }
```

**Step 2: Créer AttendancePerformanceChart**

- ScatterChart Recharts : X = présence (%), Y = amélioration temps (%)
- Un point par nageur, label au hover
- Ligne de tendance (régression linéaire simple)
- Stat résumée : "Les nageurs >80% de présence ont amélioré leurs temps de X% en moyenne"
- Filtre : période (3/6/12 mois), groupe, épreuve (ou toutes)

**Step 3: Intégrer dans la page Analytics coach**

**Step 4: Tests**

- Test calcul corrélation avec dataset connu
- Test rendu avec 0 points, 1 point, N points

**Step 5: Commit**

```bash
git commit -m "feat(coach-analytics): add attendance vs performance correlation scatter plot"
```

---

# VAGUE 4 — Engagement

## Tâche 4.1 : Système de badges (achievements)

**Dépendances :** Tâches 1.2 (wellness), 3.1 (PR detection)
**But :** Infrastructure de badges + déclenchement + affichage.

**Files:**
- Create: `supabase/migrations/00XXX_achievements.sql`
- Create: `src/lib/api/achievements.ts`
- Create: `src/lib/achievementRules.ts`
- Create: `src/components/shared/AchievementToast.tsx`
- Create: `src/components/profile/BadgesGrid.tsx`
- Modify: `src/pages/Profile.tsx` — ajouter section badges
- Modify: `src/lib/api/types.ts`

**Step 1: Migration + API**

```sql
CREATE TABLE IF NOT EXISTS achievements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  key TEXT NOT NULL,
  unlocked_at TIMESTAMPTZ DEFAULT now(),
  metadata JSONB DEFAULT '{}',
  UNIQUE(user_id, key)
);

ALTER TABLE achievements ENABLE ROW LEVEL SECURITY;
CREATE POLICY achievements_own ON achievements FOR ALL USING (user_id = app_user_id());
CREATE POLICY achievements_coach_read ON achievements FOR SELECT USING (
  EXISTS (SELECT 1 FROM users u WHERE u.id = app_user_id() AND u.role IN ('coach', 'admin'))
);
```

**Step 2: Créer achievementRules.ts**

```typescript
// Définition des badges et leurs conditions
export const BADGE_DEFINITIONS = [
  { key: 'streak_5', type: 'streak', label: 'Flamme 5j', condition: streak >= 5 },
  { key: 'streak_10', type: 'streak', label: 'Flamme 10j', condition: streak >= 10 },
  { key: 'streak_20', type: 'streak', label: 'Flamme 20j', condition: streak >= 20 },
  { key: 'streak_50', type: 'streak', label: 'Flamme 50j', condition: streak >= 50 },
  { key: 'pr_5', type: 'pr', label: 'PR Hunter', condition: prCount >= 5 },
  { key: 'pr_15', type: 'pr', label: 'PR Master', condition: prCount >= 15 },
  { key: 'wellness_7', type: 'wellness', label: 'Wellness 7j', condition: wellnessStreak >= 7 },
  { key: 'wellness_14', type: 'wellness', label: 'Wellness 14j', condition: wellnessStreak >= 14 },
  { key: 'wellness_30', type: 'wellness', label: 'Wellness 30j', condition: wellnessStreak >= 30 },
  { key: 'iron_10', type: 'attendance', label: 'Iron Will 10', condition: strengthSessions >= 10 },
  { key: 'iron_25', type: 'attendance', label: 'Iron Will 25', condition: strengthSessions >= 25 },
  { key: 'comp_3', type: 'attendance', label: 'Compétiteur', condition: comps >= 3 },
  // ...
];

// Vérifier les badges non-déverrouillés et déclencher
export async function checkAndUnlockBadges(userId: number, context: BadgeContext): Promise<Achievement[]> { ... }
```

**Step 3: Créer AchievementToast**

- Toast animé (framer-motion) avec icône du badge, nom, description
- Subtil mais visible — apparaît en bas de l'écran pendant 4 secondes

**Step 4: Créer BadgesGrid + intégrer dans Profile.tsx**

- Grille de badges dans le Profil : icône + nom, déverrouillés en couleur, verrouillés grisés avec condition
- Compteur "X/Y badges débloqués"

**Step 5: Appeler checkAndUnlockBadges aux moments clés**

- Après sauvegarde feedback (streak présence)
- Après soumission wellness (streak wellness)
- Après PR détecté (pr count)
- Après complétion séance muscu (session count)

**Step 6: Streak sur le dashboard**

- Compteur flamme avec le nombre de jours consécutifs, à côté de la date ou dans un coin

**Step 7: Tests + Commit**

```bash
git commit -m "feat(gamification): add achievement system with badges, toast notifications, and profile grid"
```

---

## Tâche 4.2 : Challenges mensuels d'équipe

**Dépendances :** Tâche 4.1
**But :** Le coach crée des challenges collectifs, les nageurs voient la progression.

**Files:**
- Create: `supabase/migrations/00XXX_challenges.sql`
- Create: `src/lib/api/challenges.ts`
- Create: `src/components/shared/ChallengeProgressBar.tsx`
- Modify: Dashboard coach — section création challenges
- Modify: Dashboard nageur — section challenge actif

**Step 1: Migration + API**

Table `challenges` (voir design doc). CRUD coach, lecture nageur (si dans le groupe).

**Step 2: UI coach — création de challenge**

- Formulaire simple : titre, type (présence / wellness / custom), objectif numérique, dates, groupe cible
- Liste des challenges actifs/passés avec progression

**Step 3: UI nageur — barre de progression**

- Card sur le dashboard nageur : titre du challenge, barre de progression collective, "X/Y — encore Z pour l'objectif"
- Couleur selon avancement (rouge <33%, orange <66%, vert >66%)

**Step 4: Calcul progression**

- `attendance` : nb sessions collectives / objectif
- `wellness` : nb jours wellness rempli par tous / objectif
- `custom` : progression manuelle par le coach

**Step 5: Tests + Commit**

```bash
git commit -m "feat(gamification): add team challenges with collective progress bar"
```

---

## Tâche 4.3 : Leaderboard musculation

**Dépendances :** Aucune
**But :** Classement entre nageurs sur les exercices principaux.

**Files:**
- Create: `src/components/strength/StrengthLeaderboard.tsx`
- Create: `src/hooks/useStrengthLeaderboard.ts`
- Modify: `src/pages/Strength.tsx` — ajouter onglet/section
- Modify: `src/lib/api/types.ts` — ajouter poids corporel à UserProfile

**Contexte :**
- `one_rm_records` : 1RM par exercice/athlète
- `src/pages/HallOfFame.tsx` : pattern podium existant (Podium.tsx)
- `user_profiles` : profil nageur (ajouter body_weight)

**Step 1: Ajouter body_weight au profil**

```sql
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS body_weight NUMERIC(4,1);
```

Ajouter le champ dans le formulaire d'édition profil (Profile.tsx).

**Step 2: Créer useStrengthLeaderboard**

```typescript
// Props : { exerciseId: number, groupId?: number }
// Fetch les 1RM de tous les nageurs pour cet exercice
// Si body_weight disponible : score = 1RM / body_weight
// Sinon : score = 1RM (valeur absolue)
// Returns : { entries: { name, score, weight, bodyWeight?, rank }[], userRank: number }
```

**Step 3: Créer StrengthLeaderboard**

- Réutiliser le pattern Podium du HallOfFame (top 3 visuel + liste 4+)
- Select exercice (squat, bench, deadlift, pull-ups, ou tous les exercices avec historique)
- Filtre : groupe ou tout le club
- Opt-in : check dans les settings nageur pour apparaître (par défaut visible)

**Step 4: Intégrer dans Strength.tsx**

- Nouvel onglet "Classement" ou section en bas de l'historique

**Step 5: Tests + Commit**

```bash
git commit -m "feat(strength): add strength leaderboard with body-weight relative scoring"
```

---

## Tâche 4.4 : Rapports mensuels automatiques

**Dépendances :** Tâches 2.1 (training load), 2.4 (swim analytics), 4.1 (badges)
**But :** Page rapport mensuel agrégé pour nageur et coach.

**Files:**
- Create: `src/pages/MonthlyReport.tsx`
- Create: `src/hooks/useMonthlyReport.ts`
- Modify: navigation — ajouter accès depuis Profil et fiche nageur

**Step 1: Créer useMonthlyReport hook**

```typescript
// Props : { userId: number, month: string (YYYY-MM) }
// Agrège toutes les sources :
// - Assiduité : sessions / créneaux assignés
// - Natation : volume total, répartition (swimAnalytics), meilleur temps si applicable
// - Musculation : nb séances, PRs battus, tonnage total
// - Wellness : readiness moyenne, tendance, jours zone rouge
// - Charge : ACWR moyen, pic, % jours en zone optimale
// - Objectifs : progression (ring %)
// - Badges : débloqués ce mois
```

**Step 2: Créer MonthlyReport page**

- Route : `/#/report/:userId/:month`
- Style imprimable (responsive, pas de scroll infini)
- Sections avec KPI hero + graphiques compacts :
  1. Résumé assiduité (% + delta vs mois précédent)
  2. Natation (mini stacked bar par semaine, volume total)
  3. Musculation (PRs, tonnage, exercice le plus travaillé)
  4. Wellness (sparkline readiness + score moyen)
  5. Charge (ACWR trend mini)
  6. Objectifs (rings)
  7. Badges débloqués (icônes)

**Step 3: Accès**

- Nageur : depuis Profil, bouton "Mon rapport du mois"
- Coach : depuis fiche nageur, bouton "Rapport mensuel" + sélecteur mois
- Coach : rapport de groupe (mêmes métriques agrégées sur tout le groupe)

**Step 4: Tests + Commit**

```bash
git commit -m "feat(reports): add monthly report page with all aggregated KPIs"
```

---

# VAGUE 5 — Premium

## Tâche 5.1 : Body Heat Map douleurs

**Dépendances :** Tâche 1.2 (wellness quotidien)
**But :** Schéma corporel interactif pour signaler les douleurs, intégré au wellness.

**Files:**
- Create: `supabase/migrations/00XXX_pain_reports.sql`
- Create: `src/lib/api/painReports.ts`
- Create: `src/components/wellness/BodyHeatMap.tsx`
- Create: `src/components/wellness/BodySvg.tsx` (SVG face + dos)
- Modify: `src/components/wellness/WellnessForm.tsx` — ajouter étape optionnelle
- Modify: fiche nageur coach — ajouter historique heat map

**Step 1: Migration + API**

```sql
CREATE TABLE IF NOT EXISTS pain_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  body_zone TEXT NOT NULL,
  intensity SMALLINT NOT NULL CHECK (intensity BETWEEN 1 AND 3),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_pain_user_date ON pain_reports(user_id, date DESC);
ALTER TABLE pain_reports ENABLE ROW LEVEL SECURITY;
-- Mêmes policies que wellness_checks
```

**Step 2: Créer BodySvg**

- SVG du corps humain (vue face + vue dos), zones cliquables/tappables
- Zones : épaule gauche/droite, coude, poignet, dos haut/bas, hanche, genou, cheville (≈16 zones)
- Chaque zone = `<path>` ou `<circle>` avec id correspondant au `body_zone`

**Step 3: Créer BodyHeatMap**

- Composant interactif : tap une zone → sélectionne intensité (1-3 avec couleur jaune/orange/rouge)
- Re-tap pour désélectionner
- Mode lecture (coach) : zones colorées selon les derniers signalements
- Mode historique (coach) : overlay des zones les plus signalées sur N jours (opacité proportionnelle à la fréquence)

**Step 4: Intégrer dans WellnessForm**

- Étape optionnelle après les 6 questions : "As-tu des douleurs ?" → toggle → si oui, affiche BodyHeatMap
- Sauvegarde les pain_reports en même temps que le wellness

**Step 5: Vue coach — patterns douleurs**

- Dans la fiche nageur : section "Douleurs" avec heat map agrégé sur 4 semaines
- Alerte si une zone est signalée 3+ fois en 14 jours

**Step 6: Tests + Commit**

```bash
git commit -m "feat(wellness): add interactive body heat map for pain reporting"
```

---

## Tâche 5.2 : Messaging in-app (éventuel)

**Dépendances :** Aucune
**But :** Chat 1:1 coach ↔ nageur. À implémenter uniquement si le besoin est confirmé.

**Files:**
- Create: `supabase/migrations/00XXX_messages.sql`
- Create: `src/lib/api/messages.ts`
- Create: `src/pages/Messages.tsx`
- Create: `src/components/chat/ChatThread.tsx`
- Create: `src/components/chat/MessageBubble.tsx`
- Modify: navigation — ajouter accès Messages

**Step 1: Migration**

```sql
CREATE TABLE IF NOT EXISTS messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id INTEGER NOT NULL REFERENCES users(id),
  receiver_id INTEGER NOT NULL REFERENCES users(id),
  content TEXT NOT NULL,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_messages_thread ON messages(
  LEAST(sender_id, receiver_id),
  GREATEST(sender_id, receiver_id),
  created_at DESC
);
```

**Step 2: API + UI**

- Liste des conversations (dernier message, badge non-lu)
- Thread de messages (bulles style iMessage, scroll infini)
- Input texte + envoi
- Notification push via le système existant (push-send edge function)
- Polling React Query (pas de realtime Supabase pour commencer — trop complexe)

**Step 3: Tests + Commit**

```bash
git commit -m "feat(messaging): add in-app 1:1 chat between coach and swimmer"
```

---

# Récapitulatif des dépendances

```
Vague 1 (socle) :
  1.1 wellness_checks table + API
  1.2 UI wellness nageur ──────────── dépend de 1.1
  1.3 wellness coach ──────────────── dépend de 1.2
  1.4 sRPE + trainingLoadHelpers ──── indépendant (exploite l'existant)
  1.5 difficulté série muscu ──────── indépendant

Vague 2 (exploitation) :
  2.1 useTrainingLoad hook ─────────── dépend de 1.4
  2.2 dashboard charge grille ──────── dépend de 1.3 + 2.1
  2.3 dashboard charge détail ──────── dépend de 2.1
  2.4 swim analytics agrégation ────── indépendant
  2.5 swim analytics UI ────────────── dépend de 2.4

Vague 3 (analytics) :
  3.1 PR detection live ────────────── indépendant
  3.2 graphiques exercice ──────────── dépend légèrement de 1.5 (overlay difficulté)
  3.3 corrélation présence/perf ────── indépendant

Vague 4 (engagement) :
  4.1 badges (achievements) ────────── dépend de 1.2 (wellness streak) + 3.1 (PR count)
  4.2 challenges d'équipe ──────────── dépend de 4.1
  4.3 leaderboard muscu ────────────── indépendant
  4.4 rapports mensuels ────────────── dépend de 2.1 + 2.4 + 4.1

Vague 5 (premium) :
  5.1 body heat map ────────────────── dépend de 1.2 (wellness form)
  5.2 messaging ────────────────────── indépendant
```

# Parallélisation possible

Au sein de chaque vague, certaines tâches sont indépendantes et peuvent être développées en parallèle (Agent Teams) :

| Vague | Parallèle A | Parallèle B |
|-------|-------------|-------------|
| 1 | 1.1 → 1.2 → 1.3 | 1.4 + 1.5 (indépendants) |
| 2 | 2.1 → 2.2 + 2.3 | 2.4 → 2.5 |
| 3 | 3.1 + 3.3 | 3.2 |
| 4 | 4.1 → 4.2 | 4.3 (indépendant) |

---

# Documentation à mettre à jour après chaque tâche

1. `docs/implementation-log.md` — entrée par tâche (obligatoire)
2. `docs/FEATURES_STATUS.md` — nouvelles sections pour wellness, training load, analytics, gamification
3. `docs/ROADMAP.md` — nouveaux chantiers correspondant aux vagues
4. `CLAUDE.md` — fichiers clés ajoutés (wellness.ts, trainingLoadHelpers.ts, swimAnalytics.ts, etc.)
