# Calculateur d'allures coach + refactor "Mon équipe"

*Design validé le 2026-04-30. Implémentation à dérouler via `writing-plans` puis `executing-plans`.*

## 1. Contexte & objectifs

Le coach a besoin d'un outil **actionnable et enregistrable** pour projeter les allures d'entraînement de chaque nageur de son équipe à partir d'un temps cible sur une épreuve. Le besoin couvre à la fois :

1. **Gestion d'équipe centralisée** — fusionner dans une seule vue les nageurs avec compte (rattachement actuel via `coach_swimmer_assignments`) et les nageurs sans compte (manuels via `coach_manual_swimmers`, aujourd'hui gérés uniquement depuis Chrono).
2. **Calculateur d'allures** — pour chaque (nageur × nage) une cible (distance + temps) qui génère une matrice [zones × distances] de temps projetés.

Le périmètre §futur **acté unique** : affichage de l'allure projetée dans la séance côté nageur (dérive de cette même donnée).

## 2. Décisions de conception

| # | Décision | Choix |
|---|---|---|
| Q1 | Formule de calcul | Personnalisable par coach. Défauts : V0=140%, V1=130%, V2=115%, V3=110%, Max=105% du temps cible/100m |
| Q2 | Granularité cible | 1 cible par (nageur × nage) — empilable |
| Q3 | Localisation UI | Carte d'accès depuis le **Home coach** (pas dans le dock) |
| Q3 | Persistance | Cibles + zones perso par coach (pas de scénarios nommés en V1) |
| Q5 | Distances affichées | Liste fixe filtrée selon distance d'épreuve |
| Q6 | Profil nageur manuel | Nom + sexe + date de naissance |
| Q7 | Mise en page | Cartes nageur en accordéon (L1) |
| Q8 | Actions V1 | Consultation + Export PDF + ShareMenu |
| — | Création manuelle | **Centralisée** dans la vue d'équipe coach (renommée "Mon équipe"), pas dupliquée dans le calculateur ni Chrono |

## 3. Architecture

### 3.1. Vue "Mon équipe" — refactor

Vue : `src/pages/coach/CoachMySwimmersScreen.tsx` (renommée internement, label header "Mon équipe").

**Structure UI :**

- Header + recherche
- Tabs :
  - **Mon équipe** (par défaut) — comptes rattachés + manuels du coach
  - **Nageurs disponibles** — comptes club non rattachés (existant, déplacé sous tab)
- Tab "Mon équipe" :
  - Bouton primary `[+ Ajouter un nageur sans compte]`
  - Section "Comptes" (rattachés) — action *Retirer*
  - Section "Sans compte" — actions *Éditer* / *Supprimer*
- Dialog "Ajouter / Éditer nageur sans compte" :
  - Nom (requis)
  - Sexe (M/F, requis)
  - Date de naissance (optionnel)

### 3.2. Hook partagé `useMyTeam()`

`src/hooks/useMyTeam.ts`

```ts
export interface TeamMember {
  kind: "account" | "manual";
  id: string;                        // "account-<intId>" | "manual-<uuid>"
  accountId?: number;
  manualId?: string;
  displayName: string;
  birthdate?: string | null;
  sex?: "M" | "F" | null;
  avatarUrl?: string | null;
}

export function useMyTeam(): {
  team: TeamMember[];
  accounts: TeamMember[];
  manuals: TeamMember[];
  isLoading: boolean;
  error: Error | null;
};
```

- React Query key : `["my-team", coachId]`
- Joint `getMySwimmers()` + `listManualSwimmers()` côté client (les 2 sources sont déjà filtrées par RLS)
- Tri : alpha par `displayName`
- Consommé par : `CoachMySwimmersScreen`, `ChronoSetup`, `CoachPaceCalculatorScreen`

### 3.3. Refactor `ChronoSetup.tsx`

- Supprime les onglets "manuals" / "new" (création locale)
- Consomme `useMyTeam()` pour la liste de base
- Garde l'onglet "tous les comptes du club" (cross-team via prop `allAthletes`)
- Ajoute un CTA secondaire `[Gérer mon équipe →]` qui route vers `/coach?section=swimmers&tab=team` (deep-link qui ouvre le tab "Mon équipe")
- Pas de régression UX : le coach voit toujours ses manuels par défaut, ne perd aucun nageur sélectionnable

### 3.4. Calculateur d'allures

**Page** : `src/pages/coach/CoachPaceCalculatorScreen.tsx`
**Section coach** : `pace-calculator` (nouveau case dans `Coach.tsx`)
**Entrée** : carte d'action sur le Home coach (pas dans le dock)

**Sous-composants :**

```
src/components/coach/pace/
├─ PaceTeamPanel.tsx         # Sélection des membres pris en compte
├─ PaceZonesSettings.tsx     # Drawer réglage % zones
├─ SwimmerPaceCard.tsx       # 1 accordéon nageur
├─ PaceMatrix.tsx            # Matrice zones × distances
├─ PaceTargetForm.tsx        # Saisie cible (nage + distance + temps)
└─ PaceTargetRow.tsx         # Ligne édition + matrice
```

**Hiérarchie écran :**

```
[Header] Calculateur d'allures
   [👥 Équipe (12)]  [⚙ Zones (140/130/115/110/105)]  [↗ Partager]

[PaceTeamPanel]
   ☑ Mon équipe (12 nageurs)
   ☐ Inclure d'autres nageurs du club  →  [+ Eve M. (G2)] [+ Tom B. (G3)]
   [Gérer mon équipe →]

[Liste accordéon SwimmerPaceCard]
  ▼ Léo Martin · 2 cibles  [📄 PDF] [↗]
       NL 100m → [01:05.0]   [+ ajouter cible]
       ┌─── Matrice ─────────────────────────
       │       V0      V1      V2      V3      Max
       │  15m  13.7   12.7    11.2   10.7    10.2
       │  25m  22.8   21.1    18.7   17.9    17.1
       │  50m  45.5   42.3    37.4   35.8    34.1
       │  75m  ...
       │ 100m  1:31.0 1:24.5  1:14.7 1:11.5  1:08.2
       └────────────────────────────────────
       4N 200m → [02:38.0] (matrice idem)

  ▶ Sarah Dupont · 1 cible  [📄 PDF] [↗]
  ▶ ...

[+ Ajouter une cible pour un nageur]
```

### 3.5. Mapping distance cible → lignes affichées

| Épreuve cible | Lignes |
|---|---|
| 50m (NL/Dos/Brasse/Pap) | 15, 20, 25, 50 |
| 100m | 15, 25, 50, 75, 100 |
| 200m | 25, 50, 100, 150, 200 |
| 400m | 50, 100, 200, 300, 400 |
| 800m | 100, 200, 400, 600, 800 |
| 1500m | 100, 200, 400, 800, 1200, 1500 |
| 100 4N | 25, 50, 75, 100 |
| 200 4N | 50, 100, 150, 200 |
| 400 4N | 100, 200, 300, 400 |

## 4. Modèle de données

### 4.1. Migration `supabase/migrations/00148_pace_calculator_and_team.sql`

```sql
-- (a) Étendre coach_manual_swimmers (Q6.F3)
ALTER TABLE coach_manual_swimmers
  ADD COLUMN IF NOT EXISTS birthdate date,
  ADD COLUMN IF NOT EXISTS sex char(1) CHECK (sex IN ('M','F'));

-- (b) Policy UPDATE manquante sur coach_manual_swimmers (édition nom/sexe/date)
CREATE POLICY "coach_manual_swimmers_update_own"
  ON coach_manual_swimmers FOR UPDATE
  USING (coach_id = (SELECT auth.uid()))
  WITH CHECK (coach_id = (SELECT auth.uid()));

-- (c) coach_pace_zones — overrides du défaut
CREATE TABLE coach_pace_zones (
  coach_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  v0_pct int NOT NULL DEFAULT 140 CHECK (v0_pct BETWEEN 100 AND 200),
  v1_pct int NOT NULL DEFAULT 130 CHECK (v1_pct BETWEEN 100 AND 200),
  v2_pct int NOT NULL DEFAULT 115 CHECK (v2_pct BETWEEN 100 AND 200),
  v3_pct int NOT NULL DEFAULT 110 CHECK (v3_pct BETWEEN 100 AND 200),
  max_pct int NOT NULL DEFAULT 105 CHECK (max_pct BETWEEN 100 AND 200),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (v0_pct >= v1_pct AND v1_pct >= v2_pct AND v2_pct >= v3_pct AND v3_pct >= max_pct)
);
ALTER TABLE coach_pace_zones ENABLE ROW LEVEL SECURITY;
CREATE POLICY "coach_pace_zones_select_own"
  ON coach_pace_zones FOR SELECT USING (coach_id = (SELECT auth.uid()));
CREATE POLICY "coach_pace_zones_upsert_own"
  ON coach_pace_zones FOR INSERT WITH CHECK (coach_id = (SELECT auth.uid()));
CREATE POLICY "coach_pace_zones_update_own"
  ON coach_pace_zones FOR UPDATE USING (coach_id = (SELECT auth.uid()))
  WITH CHECK (coach_id = (SELECT auth.uid()));

-- (d) coach_pace_targets — 1 ligne par (coach × nageur × nage × distance)
CREATE TABLE coach_pace_targets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  swimmer_account_id bigint REFERENCES users(id) ON DELETE CASCADE,
  swimmer_manual_id uuid REFERENCES coach_manual_swimmers(id) ON DELETE CASCADE,
  stroke text NOT NULL CHECK (stroke IN ('NL','Dos','Brasse','Pap','4N')),
  target_distance_m int NOT NULL CHECK (target_distance_m IN (50,100,200,400,800,1500)),
  target_time_ms int NOT NULL CHECK (target_time_ms > 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((swimmer_account_id IS NULL) <> (swimmer_manual_id IS NULL))
);
CREATE UNIQUE INDEX uq_pace_targets_account
  ON coach_pace_targets (coach_id, swimmer_account_id, stroke, target_distance_m)
  WHERE swimmer_account_id IS NOT NULL;
CREATE UNIQUE INDEX uq_pace_targets_manual
  ON coach_pace_targets (coach_id, swimmer_manual_id, stroke, target_distance_m)
  WHERE swimmer_manual_id IS NOT NULL;
ALTER TABLE coach_pace_targets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "coach_pace_targets_all_own"
  ON coach_pace_targets FOR ALL
  USING (coach_id = (SELECT auth.uid()))
  WITH CHECK (coach_id = (SELECT auth.uid()));

-- (e) pace_share_links — token public lecture seule
CREATE TABLE pace_share_links (
  token uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  swimmer_account_id bigint REFERENCES users(id) ON DELETE CASCADE,
  swimmer_manual_id uuid REFERENCES coach_manual_swimmers(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL DEFAULT (now() + INTERVAL '30 days'),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((swimmer_account_id IS NULL) <> (swimmer_manual_id IS NULL))
);
ALTER TABLE pace_share_links ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pace_share_links_owner_all"
  ON pace_share_links FOR ALL
  USING (coach_id = (SELECT auth.uid()))
  WITH CHECK (coach_id = (SELECT auth.uid()));
-- + RPC `get_pace_share_payload(token uuid)` SECURITY DEFINER pour la lecture publique
```

### 4.2. Modules API ajoutés

- `src/lib/api/pace-targets.ts` — CRUD `coach_pace_targets`
- `src/lib/api/pace-zones.ts` — read/upsert `coach_pace_zones` (avec fallback aux défauts si pas de ligne)
- `src/lib/api/pace-share.ts` — création de token + lecture publique via RPC
- `src/lib/api/coach-manual-swimmers.ts` — étendu : `updateManualSwimmer(id, {displayName, sex, birthdate})`

## 5. Logique de calcul

`src/lib/paceCalculator.ts` — module pur, sans dépendance UI :

```ts
export type Stroke = "NL" | "Dos" | "Brasse" | "Pap" | "4N";
export type Zone = "V0" | "V1" | "V2" | "V3" | "Max";

export interface ZoneConfig {
  v0_pct: number; v1_pct: number; v2_pct: number; v3_pct: number; max_pct: number;
}

export const DEFAULT_ZONES: ZoneConfig = {
  v0_pct: 140, v1_pct: 130, v2_pct: 115, v3_pct: 110, max_pct: 105,
};

/** Pace par 100m (en ms) à partir d'un temps cible et de la distance d'épreuve. */
export function pacePer100m(targetTimeMs: number, targetDistanceM: number): number;

/** Temps projeté (en ms) à une distance dans une zone donnée. */
export function zoneTime(
  distanceM: number,
  pacePer100mMs: number,
  zonePct: number,
): number;

/** Lignes de distance à afficher selon la cible. Voir tableau §3.5. */
export function getDistanceRows(
  targetDistanceM: number,
  stroke: Stroke,
): number[];

/** Format mm:ss.x (ms→string lisible). */
export function formatPaceTime(ms: number): string;

/** Parse "1:05.4" / "01:05.40" / "65.4" → ms. */
export function parsePaceTime(input: string): number | null;
```

## 6. Stratégie de tests

### 6.1. Tests unitaires (Vitest)

- `src/__tests__/paceCalculator.test.ts`
  - `pacePer100m` : cas standards, edge cases (distance 0, négative)
  - `zoneTime` : Max < V3 < V2 < V1 < V0 (ordre cohérent)
  - `getDistanceRows` : toutes les combinaisons du tableau §3.5 (12+ cas)
  - `formatPaceTime` / `parsePaceTime` : aller-retour, formats variés
- `src/hooks/__tests__/useMyTeam.test.ts`
  - Fusion accounts+manuals
  - Tri alpha
  - Loading/error states

### 6.2. Tests RLS (Docker requis)

- `supabase/tests/rls/coach_pace_targets.test.ts` — coach A ↛ B (SELECT/INSERT/UPDATE/DELETE)
- `supabase/tests/rls/coach_pace_zones.test.ts` — idem + CHECK ordre des % validé
- `supabase/tests/rls/coach_manual_swimmers_update.test.ts` — nouvelle policy UPDATE
- `supabase/tests/rls/pace_share_links.test.ts` — token public via RPC, expires_at respecté

### 6.3. Tests composants

- `src/pages/coach/__tests__/CoachMySwimmersScreen.test.tsx`
  - Tab "Mon équipe" affiche comptes + manuels
  - Dialog création manuel (validation champs, succès, échec)
  - Dialog édition manuel
- `src/components/coach/pace/__tests__/PaceMatrix.test.tsx`
  - Render correct des cellules
  - Update des zones %
- `src/pages/coach/__tests__/CoachPaceCalculatorScreen.test.tsx`
  - Smoke : chargement, ajout cible, persistance, suppression

## 7. Plan de livraison (phases)

1. **Migration + extension table** (00148) — appliquée via MCP Supabase
2. **API modules** (`pace-targets.ts`, `pace-zones.ts`, `pace-share.ts`, extension `coach-manual-swimmers.ts`)
3. **Hook `useMyTeam`** + tests
4. **Refactor `CoachMySwimmersScreen`** (Mon équipe + dialog manuels) + tests
5. **Refactor `ChronoSetup`** pour consommer `useMyTeam` (suppression onglets manuals/new) + non-régression chrono
6. **Module `paceCalculator.ts`** pur + tests unitaires complets
7. **Composants matrice** (`PaceMatrix`, `PaceTargetForm`, `SwimmerPaceCard`, `PaceTeamPanel`, `PaceZonesSettings`) + tests
8. **Page `CoachPaceCalculatorScreen`** + section dans `Coach.tsx` + carte d'accès Home coach
9. **Export PDF** (réemploi pattern `export-session-pdf.ts` §183)
10. **ShareMenu** + page publique `/share/pace/<token>`
11. **Tests E2E smoke** + RLS
12. **Doc** : entrée `implementation-log.md` + mise à jour `ROADMAP.md`, `FEATURES_STATUS.md`, `CLAUDE.md`, `files-map.md`

## 8. §futur (validé hors-V1)

**Affichage allure projetée dans la séance côté nageur**
Quand un nageur consulte `SwimSessionView`, on enrichit chaque exercice avec l'allure projetée correspondant à son `coach_pace_targets` (si la cible existe pour la nage de l'exo). Affiché en chip discret type "🎯 1:14.7 (V2)".

Critères d'unlock : V1 livrée et stable, retours coach + nageur recueillis, alignement sur la sémantique `intensity` de l'exo (V0/V1/V2/V3/Max) avec celle des zones du calculateur.

## 9. Risques & mitigations

| Risque | Mitigation |
|---|---|
| Refactor `ChronoSetup` casse une UX critique | Tests de non-régression chrono ; review manuelle "ajouter manuel" + "passer en chrono" |
| Volume RLS tests Docker | Lancer `npm run test:rls` une seule fois après l'ensemble des migrations, pas par patch |
| Calculs flottants → temps affichés faux d'1 dixième | Tout en `int` ms ; arrondi seulement au format d'affichage |
| Confusion UX entre "Mon équipe" et "Nageurs disponibles" | Tab clair, badges count, copy explicite |
| Token de partage public exposé | RPC `SECURITY DEFINER` + `expires_at` strict ; pas de PII sensible exposée (juste nom + matrice) |

## 10. Contraintes techniques rappelées

- Toutes les migrations via MCP Supabase (project `fscnobivsgornxdwqwlk`)
- RLS via helpers `app_user_role()` / `app_user_id()` (pas `auth.uid()` direct dans subqueries)
- Pas de déploiement local (`npx gh-pages -d dist` interdit)
- Économie tokens : `docker ps` 1× max, `npm run test:rls` uniquement post-migrations
- Tests Vitest avant commit (`npm test`, `npx tsc --noEmit`)
