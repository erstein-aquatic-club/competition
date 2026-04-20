# Strength Planning — Phase 2 : Data model + refactor MyPlanTab (Design Doc)

**Date :** 2026-04-20
**Statut :** Prêt à implémenter
**Périmètre :** BDD (4 nouvelles tables + RLS + backfill) + API wrappers + helpers merge + refactor `MyPlanTab.tsx` pour consommer les vraies slots
**Exécution :** agent Sonnet — ce document est auto-suffisant
**Dépendance :** Phase 1 livrée (§156). Les composants visuels `MyPlanWeekCard`/`MyPlanSessionRow`/`MyPlanSessionSheet` sont réutilisés tels quels, seule la source des données change.

---

## 1. Contexte

Phase 1 a livré la timeline hebdo visuelle en **projetant** les cycles existants (`strength_folders` → `strength_session_templates`) sur les semaines ISO via parsing de nom (`S13-S15`). Limites connues :

- **Duplication** : un cycle `S13-S15` affiche les mêmes séances sur 3 semaines. Pas de variation par semaine.
- **Nom-driven** : dépend du parsing du nom du dossier, fragile.
- **Pas d'override nageur** : chaque nageur voit son propre plan (via `athlete_id` sur le root folder), mais pas de plan de groupe + override individuel comme le fait la natation.
- **Pas de Matin/Soir** : le muscu actuel = 1 séance/jour max.

Phase 2 introduit le modèle de données **miroir du swim planning** :

| Natation | Musculation (Phase 2) |
|---|---|
| `swim_planning_slots` (group_id) | `strength_planning_slots` (group_id) |
| `swim_planning_slot_overrides` (athlete_id) | `strength_planning_slot_overrides` (athlete_id) |
| `swim_planning_week_meta` (group_id) | `strength_planning_week_meta` (group_id) |
| `swim_planning_week_overrides` (athlete_id) | `strength_planning_week_overrides` (athlete_id) |
| filière (string) + session_id (nullable) | session_id (nullable) + notes (string, nullable) |

**Différence structurelle** : le muscu n'a pas de concept de "filière". Un slot = lien direct vers un `strength_session_templates.id` + notes libres optionnelles. Si le slot est vide, la case est grisée ; s'il est rempli, on affiche le titre de la session template + nb d'exercices.

---

## 2. Décisions de design

| Question | Choix | Raison |
|---|---|---|
| Scope slot | **Group-level** + per-athlete overrides | Parité swim, économie de saisie coach |
| time_slot | **Conserver** `'morning' \| 'evening'` | Parité swim, flexibilité future (muscu matin pour stages) |
| day_of_week | **0-6** (Lun-Dim) | Muscu peut tomber le dimanche (récup active, stages) |
| Lien session | FK nullable vers `strength_session_templates(id)` ON DELETE **SET NULL** | Conserver la slot vide si la session template est supprimée |
| Notes par slot | Colonne `notes text` | Permet annotations coach sans créer de session dédiée |
| week_type | Même vocabulaire que swim : `reprise \| force \| puissance \| taper \| compétition` (texte libre, pas d'enum) | Parité, phase déjà détectée par `detectPhase()` |
| Backfill | **Oui** depuis les cycles existants → `strength_planning_slot_overrides` (per-athlete) | Continuité de données, pas de saisie perdue |
| Backfill group | **Non** — cycles actuels sont tous per-athlete, pas de notion de groupe | Le coach recréera les plans de groupe via l'éditeur Phase 3 |
| Policies RLS | Miroir exact swim 00131 (select all authenticated, write coach/admin) avec `(SELECT app_user_role())` wrap §124 | Éviter `auth_rls_initplan` |
| Fallback UI si aucun slot | **Afficher l'état actuel** (cycles parsés) si un root folder existe mais aucun slot BDD | Rétrocompat douce, rassurant pendant la migration |
| Retrait cycles | **Non en Phase 2** — cycles = template library, coexistent | Phase 4 éventuelle pour migration finale |
| Suppression `planCheckHelpers` localStorage | **Non** — on garde le check localStorage, il est indépendant du modèle slots | Zéro risque |

---

## 3. Schéma cible

### 3.1 Migration SQL — `00136_strength_planning_slots.sql`

```sql
-- =============================================================================
-- Migration 00136: Strength planning slots — group + per-athlete overrides
-- Mirror of swim_planning_* (migrations 00071 + 00131).
-- Links a (group, week, day, time_slot) to a strength_session_templates.id.
-- =============================================================================

-- 1. Group-level slots
CREATE TABLE IF NOT EXISTS strength_planning_slots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id integer NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  week_start date NOT NULL,
  day_of_week smallint NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  time_slot text NOT NULL CHECK (time_slot IN ('morning', 'evening')),
  session_template_id integer NULL REFERENCES strength_session_templates(id) ON DELETE SET NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(group_id, week_start, day_of_week, time_slot)
);

CREATE INDEX idx_strength_planning_slots_group_week
  ON strength_planning_slots(group_id, week_start);

-- 2. Per-athlete slot overrides
CREATE TABLE IF NOT EXISTS strength_planning_slot_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  athlete_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  week_start date NOT NULL,
  day_of_week smallint NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  time_slot text NOT NULL CHECK (time_slot IN ('morning', 'evening')),
  session_template_id integer NULL REFERENCES strength_session_templates(id) ON DELETE SET NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(athlete_id, week_start, day_of_week, time_slot)
);

CREATE INDEX idx_strength_planning_slot_overrides_athlete_week
  ON strength_planning_slot_overrides(athlete_id, week_start);

-- 3. Group-level week meta (week_type, notes)
CREATE TABLE IF NOT EXISTS strength_planning_week_meta (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id integer NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  week_start date NOT NULL,
  week_type text,
  notes text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(group_id, week_start)
);

CREATE INDEX idx_strength_planning_week_meta_group_week
  ON strength_planning_week_meta(group_id, week_start);

-- 4. Per-athlete week meta overrides
CREATE TABLE IF NOT EXISTS strength_planning_week_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  athlete_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  week_start date NOT NULL,
  week_type text,
  notes text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(athlete_id, week_start)
);

CREATE INDEX idx_strength_planning_week_overrides_athlete_week
  ON strength_planning_week_overrides(athlete_id, week_start);

-- =============================================================================
-- RLS (mirror swim_planning_* §124 — wrap (SELECT app_user_role()))
-- =============================================================================

ALTER TABLE strength_planning_slots ENABLE ROW LEVEL SECURITY;
ALTER TABLE strength_planning_slot_overrides ENABLE ROW LEVEL SECURITY;
ALTER TABLE strength_planning_week_meta ENABLE ROW LEVEL SECURITY;
ALTER TABLE strength_planning_week_overrides ENABLE ROW LEVEL SECURITY;

-- strength_planning_slots
CREATE POLICY strength_planning_slots_select ON strength_planning_slots
  FOR SELECT TO authenticated USING (true);
CREATE POLICY strength_planning_slots_insert ON strength_planning_slots
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT app_user_role()) IN ('coach','admin'));
CREATE POLICY strength_planning_slots_update ON strength_planning_slots
  FOR UPDATE TO authenticated
  USING ((SELECT app_user_role()) IN ('coach','admin'));
CREATE POLICY strength_planning_slots_delete ON strength_planning_slots
  FOR DELETE TO authenticated
  USING ((SELECT app_user_role()) IN ('coach','admin'));

-- strength_planning_slot_overrides
CREATE POLICY strength_planning_slot_overrides_select ON strength_planning_slot_overrides
  FOR SELECT TO authenticated USING (true);
CREATE POLICY strength_planning_slot_overrides_insert ON strength_planning_slot_overrides
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT app_user_role()) IN ('coach','admin'));
CREATE POLICY strength_planning_slot_overrides_update ON strength_planning_slot_overrides
  FOR UPDATE TO authenticated
  USING ((SELECT app_user_role()) IN ('coach','admin'));
CREATE POLICY strength_planning_slot_overrides_delete ON strength_planning_slot_overrides
  FOR DELETE TO authenticated
  USING ((SELECT app_user_role()) IN ('coach','admin'));

-- strength_planning_week_meta
CREATE POLICY strength_planning_week_meta_select ON strength_planning_week_meta
  FOR SELECT TO authenticated USING (true);
CREATE POLICY strength_planning_week_meta_insert ON strength_planning_week_meta
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT app_user_role()) IN ('coach','admin'));
CREATE POLICY strength_planning_week_meta_update ON strength_planning_week_meta
  FOR UPDATE TO authenticated
  USING ((SELECT app_user_role()) IN ('coach','admin'));
CREATE POLICY strength_planning_week_meta_delete ON strength_planning_week_meta
  FOR DELETE TO authenticated
  USING ((SELECT app_user_role()) IN ('coach','admin'));

-- strength_planning_week_overrides
CREATE POLICY strength_planning_week_overrides_select ON strength_planning_week_overrides
  FOR SELECT TO authenticated USING (true);
CREATE POLICY strength_planning_week_overrides_insert ON strength_planning_week_overrides
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT app_user_role()) IN ('coach','admin'));
CREATE POLICY strength_planning_week_overrides_update ON strength_planning_week_overrides
  FOR UPDATE TO authenticated
  USING ((SELECT app_user_role()) IN ('coach','admin'));
CREATE POLICY strength_planning_week_overrides_delete ON strength_planning_week_overrides
  FOR DELETE TO authenticated
  USING ((SELECT app_user_role()) IN ('coach','admin'));

-- =============================================================================
-- BACKFILL: cycles existants (per-athlete) → strength_planning_slot_overrides
-- =============================================================================
-- Parse "SNN-SMM" ou "SNN" dans le nom du cycle, explose en weeks ISO,
-- map les session_templates par préfixe jour (Lun/Mar/Mer/Jeu/Ven/Sam/Dim),
-- insère dans slot_overrides avec time_slot='evening' (convention muscu).
-- Les cycles sans préfixe jour ou parsing impossible sont ignorés (logged).
--
-- Pour garder la migration SQL idempotente et évitée d'embarquer du code
-- procédural complexe, on délègue le backfill à une fonction plpgsql dédiée
-- qu'on exécute UNE fois. Si le backfill échoue (cas exotique), le coach
-- recréera via l'éditeur Phase 3.

DO $$
DECLARE
  r record;
  week_num int;
  start_num int;
  end_num int;
  cur_year int := EXTRACT(YEAR FROM CURRENT_DATE)::int;
  week_monday date;
  day_idx int;
  session_rec record;
BEGIN
  -- Boucle sur chaque cycle per-athlete ayant des session templates
  FOR r IN
    SELECT
      sf.id as cycle_id,
      sf.name as cycle_name,
      sfp.athlete_id,
      substring(sf.name from '^S([0-9]+)') as start_s,
      substring(sf.name from '^S[0-9]+-S([0-9]+)') as end_s
    FROM strength_folders sf
    JOIN strength_folders sfp ON sfp.id = sf.parent_id
    WHERE sfp.athlete_id IS NOT NULL
      AND sf.name ~ '^S[0-9]+'
  LOOP
    start_num := COALESCE(r.start_s::int, 0);
    end_num := COALESCE(r.end_s::int, start_num);
    IF start_num = 0 THEN CONTINUE; END IF;

    FOR week_num IN start_num..end_num LOOP
      -- Monday of ISO week week_num in cur_year
      week_monday := (date_trunc('week',
        to_date(cur_year::text || '-W' || lpad(week_num::text, 2, '0') || '-1',
                'IYYY-"W"IW-ID')))::date;

      -- Session par préfixe jour
      FOR session_rec IN
        SELECT id, title,
          CASE
            WHEN title ~* '^lun' THEN 0
            WHEN title ~* '^mar' THEN 1
            WHEN title ~* '^mer' THEN 2
            WHEN title ~* '^jeu' THEN 3
            WHEN title ~* '^ven' THEN 4
            WHEN title ~* '^sam' THEN 5
            WHEN title ~* '^dim' THEN 6
            ELSE -1
          END as dow
        FROM strength_session_templates
        WHERE folder_id = r.cycle_id
      LOOP
        IF session_rec.dow = -1 THEN CONTINUE; END IF;
        INSERT INTO strength_planning_slot_overrides
          (athlete_id, week_start, day_of_week, time_slot, session_template_id)
        VALUES
          (r.athlete_id, week_monday, session_rec.dow, 'evening', session_rec.id)
        ON CONFLICT (athlete_id, week_start, day_of_week, time_slot) DO NOTHING;
      END LOOP;
    END LOOP;
  END LOOP;
END $$;
```

### 3.2 Contrainte cascade

- `strength_session_templates` supprimé → `session_template_id` devient NULL (slot reste). Coach peut réattribuer une autre session template.
- `groups` supprimé → cascade delete du slot.
- `users` (athlete) supprimé → cascade delete de l'override.

---

## 4. Types TypeScript — `src/lib/api/types.ts`

Ajouter en fin de fichier :

```ts
// ═══════════════════════════════════════════════════════════════════
// Strength planning — groups + per-athlete overrides (Phase 2)
// ═══════════════════════════════════════════════════════════════════

export interface StrengthPlanningSlot {
  id: string;
  group_id: number;
  week_start: string;
  day_of_week: number;
  time_slot: "morning" | "evening";
  session_template_id: number | null;
  notes: string | null;
  created_at: string;
}
export interface StrengthPlanningSlotInput {
  group_id: number;
  week_start: string;
  day_of_week: number;
  time_slot: "morning" | "evening";
  session_template_id?: number | null;
  notes?: string | null;
}

export interface StrengthPlanningSlotOverride {
  id: string;
  athlete_id: number;
  week_start: string;
  day_of_week: number;
  time_slot: "morning" | "evening";
  session_template_id: number | null;
  notes: string | null;
  created_at: string;
}
export interface StrengthPlanningSlotOverrideInput {
  athlete_id: number;
  week_start: string;
  day_of_week: number;
  time_slot: "morning" | "evening";
  session_template_id?: number | null;
  notes?: string | null;
}

export interface StrengthPlanningWeekMeta {
  id: string;
  group_id: number;
  week_start: string;
  week_type: string | null;
  notes: string | null;
  updated_at: string;
}
export interface StrengthPlanningWeekMetaInput {
  group_id: number;
  week_start: string;
  week_type?: string | null;
  notes?: string | null;
}

export interface StrengthPlanningWeekOverride {
  id: string;
  athlete_id: number;
  week_start: string;
  week_type: string | null;
  notes: string | null;
  updated_at: string;
}
export interface StrengthPlanningWeekOverrideInput {
  athlete_id: number;
  week_start: string;
  week_type?: string | null;
  notes?: string | null;
}
```

---

## 5. API wrapper — `src/lib/api/strength-planning.ts`

**Clone intégral** de `src/lib/api/swim-planning.ts` (169 l.) avec renommage :
- `swim_planning_*` → `strength_planning_*`
- `SwimPlanning*` → `StrengthPlanning*`
- `filiere` → `session_template_id` (supprimer les références filière)

8 fonctions exportées :
- `getStrengthPlanningSlots({ groupId, weekStarts })`
- `upsertStrengthPlanningSlot(input)` — onConflict `group_id,week_start,day_of_week,time_slot`
- `deleteStrengthPlanningSlot(id)`
- `getStrengthPlanningSlotOverrides({ athleteId, weekStarts })`
- `upsertStrengthPlanningSlotOverride(input)` — onConflict `athlete_id,week_start,day_of_week,time_slot`
- `deleteStrengthPlanningSlotOverride(id)` — **avec `.select("id")` pour détecter le §113 no-op** (cf. swim:93-105)
- `getStrengthPlanningWeekMeta({ groupId, weekStarts })`
- `upsertStrengthPlanningWeekMeta(input)` — onConflict `group_id,week_start`
- `getStrengthPlanningWeekOverrides({ athleteId, weekStarts })`
- `upsertStrengthPlanningWeekOverride(input)` — onConflict `athlete_id,week_start`

Re-exports dans `src/lib/api/index.ts` (ajouter au block existant) + `src/lib/api.ts` façade.

---

## 6. Helpers merge — `src/lib/strengthPlanningMerge.ts`

**Clone** de `src/lib/swimPlanningMerge.ts` (112 l.) avec adaptations :

```ts
import type {
  StrengthPlanningSlot,
  StrengthPlanningSlotOverride,
  StrengthPlanningWeekMeta,
  StrengthPlanningWeekOverride,
} from "@/lib/api/types";

export interface EffectiveStrengthSlot {
  id: string;
  group_id?: number;
  athlete_id?: number;
  week_start: string;
  day_of_week: number;
  time_slot: "morning" | "evening";
  session_template_id: number | null;
  notes: string | null;
  overridden?: boolean;
  overrideId?: string;
}

export interface EffectiveStrengthWeekMeta {
  week_type: string | null;
  notes: string | null;
  source: "group" | "athlete" | "none";
}

export function mergeStrengthSlots(
  groupSlots: StrengthPlanningSlot[],
  athleteOverrides: StrengthPlanningSlotOverride[],
): EffectiveStrengthSlot[];

export function mergeStrengthWeekMeta(
  groupMeta: StrengthPlanningWeekMeta | null,
  athleteOverride: StrengthPlanningWeekOverride | null,
): EffectiveStrengthWeekMeta;
```

Algorithme identique swim : override per-slot écrase, override per-athlete-only s'ajoute, week meta = athlete si présent sinon group sinon none.

**Tests unitaires** `src/lib/__tests__/strengthPlanningMerge.test.ts` : calquer `swimPlanningMerge.test.ts` (cas override, pas d'override, add-only par athlète, etc.).

---

## 7. Tests RLS intégration — **OBLIGATOIRE** (§121 CLAUDE.md)

Le patch crée 4 tables sous RLS → Docker + `supabase start` + `npm run test:rls` requis.

### 7.1 Mise à jour schéma test — `supabase/tests/schema.sql`

Ajouter après le bloc `swim_planning_*` (ligne 753+) :

```sql
-- strength_planning_* (migration 00136)
CREATE TABLE public.strength_planning_slots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id integer NOT NULL,
  week_start date NOT NULL,
  day_of_week smallint NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  time_slot text NOT NULL CHECK (time_slot IN ('morning', 'evening')),
  session_template_id integer NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(group_id, week_start, day_of_week, time_slot)
);
CREATE TABLE public.strength_planning_slot_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  athlete_id integer NOT NULL,
  week_start date NOT NULL,
  day_of_week smallint NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  time_slot text NOT NULL CHECK (time_slot IN ('morning', 'evening')),
  session_template_id integer NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(athlete_id, week_start, day_of_week, time_slot)
);
CREATE TABLE public.strength_planning_week_meta (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id integer NOT NULL,
  week_start date NOT NULL,
  week_type text,
  notes text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(group_id, week_start)
);
CREATE TABLE public.strength_planning_week_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  athlete_id integer NOT NULL,
  week_start date NOT NULL,
  week_type text,
  notes text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(athlete_id, week_start)
);

ALTER TABLE public.strength_planning_slots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.strength_planning_slot_overrides ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.strength_planning_week_meta ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.strength_planning_week_overrides ENABLE ROW LEVEL SECURITY;

-- Policies identiques au swim (select all, write coach/admin)
-- ... (copier le pattern exact de swim_planning_* dans schema.sql)
```

### 7.2 Tests — `supabase/tests/rls/strength_planning.test.ts`

Couverture minimale (miroir `swim_planning` s'il existait — sinon pattern `dim_sessions.test.ts`) :

1. **SELECT** : authenticated peut lire tous les slots.
2. **INSERT** : athlete bloqué, coach autorisé, admin autorisé.
3. **UPDATE** : coach peut modifier un slot (même créé par un autre coach).
4. **DELETE (regression §113)** : athlete tente `DELETE WHERE id=X` → 0 rows `RETURNING`, pas d'erreur silent. Test sur `strength_planning_slot_overrides` où la policy `DELETE` est bloquée pour athlete.
5. **Write idempotent** : double upsert même `(group_id, week_start, day_of_week, time_slot)` → update et non second insert.

Fixtures : fichier peut réutiliser `seed.sql` existant (Alice id=1 athlete, Carol id=3 coach, Diana id=4 admin). Ajouter si besoin un groupe id=1 et session_template id=1 dans `seed.sql`.

---

## 8. Refactor `MyPlanTab.tsx` — consommation des vrais slots

### 8.1 Stratégie

Le composant Phase 1 calcule `weekInstances` via `buildWeekInstances(rootFolder, cycles, sessionsByFolder)`. Phase 2 remplace cette source :

1. Query `getStrengthPlanningSlotOverrides({ athleteId, weekStarts })` + `getStrengthPlanningWeekOverrides(...)`.
2. Résoudre le `group_id` du nageur via `useQuery profile` (déjà fait dans `SuiviPlanification.tsx`) puis `getStrengthPlanningSlots({ groupId, weekStarts })` + `getStrengthPlanningWeekMeta(...)`.
3. `mergeStrengthSlots` + `mergeStrengthWeekMeta` → `effectiveSlotsByWeek`.
4. Construire `WeekInstance[]` à partir des effective slots + sessions templates catalog pour récupérer `items.length`, `title`, `cycle`.
5. **Fallback** : si `effectiveSlots.size === 0` ET `rootFolders.length > 0` → conserver l'ancien rendu `buildWeekInstances` (compatibilité pendant la migration).

### 8.2 Contrat préservé

La prop `athleteId` et `onSelectSession` restent identiques. Aucun changement côté parents (`Strength.tsx`, `SuiviPlanification.tsx`).

### 8.3 Nouveau flux data

```
useQuery profile → groupId
useQuery slots (groupId, weeks)    ┐
useQuery overrides (athleteId, weeks) ┼→ mergeStrengthSlots → effectiveSlotsByWeek
useQuery weekMeta (groupId)        │
useQuery weekOverrides (athleteId) ┘

useQuery templates (global catalog) → lookup table by id

// Pour chaque semaine visible :
//   effectiveSlots[weekKey].map(slot => {
//     if (!slot.session_template_id) → empty cell
//     else → template = templates.find(t => t.id === slot.session_template_id)
//     sessions.push({ dayIndex: slot.day_of_week, session: template, timeSlot: slot.time_slot })
//   })
```

### 8.4 Plage semaines visibles

- Par défaut : **12 semaines à partir de la semaine courante** (cohérent avec swim `INITIAL_WEEK_COUNT`).
- Infinite scroll **non requis Phase 2** (pourra être ajouté Phase 3 côté coach puis déporté).
- Pour fallback cycle-based : ignorer la contrainte 12 semaines, tout afficher (comportement Phase 1).

### 8.5 Gestion Matin/Soir

- Si le nageur a 2 slots le même jour (morning + evening) → la carte semaine affiche **2 lignes** pour ce jour (l'une marquée "Matin" badge, l'autre "Soir"). Mineur vs Phase 1 qui supposait 1/jour.
- Si seulement 1 slot `evening` (cas 99%) → ligne unique sans badge.

Implémentation : `MyPlanSessionRow` accepte une prop optionnelle `timeSlotBadge?: "Matin" | "Soir"`. Quand `dayRows[dayIndex].length > 1` → passer le badge.

---

## 9. Plan d'implémentation (étapes ordonnées)

### Étape 1 — Migration + types (~2 h)
- [ ] Créer `supabase/migrations/00136_strength_planning_slots.sql` (§3.1).
- [ ] Appliquer via `mcp__plugin_supabase_supabase__apply_migration` (project id `fscnobivsgornxdwqwlk`).
- [ ] Vérifier backfill : `SELECT COUNT(*) FROM strength_planning_slot_overrides` doit être > 0 si au moins un cycle parseable existait.
- [ ] Ajouter types dans `src/lib/api/types.ts` (§4).

### Étape 2 — API wrapper + re-exports (~1 h)
- [ ] Créer `src/lib/api/strength-planning.ts` (§5).
- [ ] Ajouter imports/exports dans `src/lib/api/index.ts`.
- [ ] Ajouter stubs dans la façade `src/lib/api.ts` (pattern existant : `getStrengthPlanningSlots: (...) => strengthPlanningApi.getStrengthPlanningSlots(...)`).
- [ ] `npx tsc --noEmit` passe.

### Étape 3 — Helpers merge + tests unit (~1 h)
- [ ] Créer `src/lib/strengthPlanningMerge.ts` (§6).
- [ ] Créer `src/lib/__tests__/strengthPlanningMerge.test.ts` (calquer swim test).
- [ ] `npm test strengthPlanningMerge` → vert.

### Étape 4 — Tests RLS (~2 h, **Docker requis**)
- [ ] Vérifier `docker ps` (1 seule fois, retenir résultat).
- [ ] Si Docker non lancé, **demander à l'utilisateur** de lancer Docker Desktop (cf. CLAUDE.md § règles RLS).
- [ ] `supabase start` (1 seule fois).
- [ ] Mettre à jour `supabase/tests/schema.sql` (§7.1) — ajouter 4 tables + policies.
- [ ] Créer `supabase/tests/rls/strength_planning.test.ts` (§7.2).
- [ ] `npm run test:rls` → vert.

### Étape 5 — Refactor `MyPlanTab.tsx` (~3 h)
- [ ] Ajouter queries slots/overrides/weekMeta/weekOverrides (§8.3).
- [ ] Calculer `effectiveSlotsByWeek` via `mergeStrengthSlots`.
- [ ] Construire `WeekInstance[]` depuis effective slots + templates catalog.
- [ ] Fallback : si effectiveSlots vide ET rootFolders présent → `buildWeekInstances` Phase 1.
- [ ] Ajouter prop `timeSlotBadge` à `MyPlanSessionRow` (§8.5).
- [ ] `npx tsc --noEmit` + `npm test` verts.

### Étape 6 — Vérification manuelle (~30 min)
- [ ] `/suivi/planification` onglet Musculation : timeline affiche les données BDD.
- [ ] Si aucune slot en BDD mais un cycle `S13` existe → fallback Phase 1 s'affiche.
- [ ] Cocher/décocher persistance OK.

### Étape 7 — Docs obligatoires (~30 min)
- [ ] `docs/implementation-log.md` §157 (contexte, changements, fichiers, tests RLS, décisions).
- [ ] `docs/claude/files-map.md` : ajouter `strength-planning.ts`, `strengthPlanningMerge.ts`, tests. Mettre à jour `MyPlanTab.tsx` si taille > 30% variation. Mettre à jour `types.ts`.
- [ ] `docs/ROADMAP.md` : §157 + update `*Dernière mise à jour*`.
- [ ] `CLAUDE.md` : "Dernière entrée en date : §157". Ajouter ligne table "Edge Functions" ? Non, pas d'edge function ici.
- [ ] `docs/FEATURES_STATUS.md` : si une ligne "Mon plan muscu" existe, la passer à ⚠️→✅ selon le niveau.

---

## 10. Risques & mitigations

| Risque | Impact | Mitigation |
|---|---|---|
| Backfill SQL incorrect | Overrides fantômes | Tester sur une copie staging avant prod. `DO $$` idempotent via `ON CONFLICT DO NOTHING` |
| RLS trop permissive (swim pattern copié) | Athlete peut voir plans autres groupes | Assumé (c'est le pattern swim). Si privacy requise : filtrer via group_members à l'avenir |
| Session template supprimée → slot orphelin | FK `SET NULL` → slot vide | Acceptable. Coach réattribue ou supprime le slot |
| Duplicate key sur backfill si migration réappliquée | Erreur SQL | `ON CONFLICT (athlete_id, week_start, day_of_week, time_slot) DO NOTHING` couvre |
| Performance query 4 tables × 12 semaines | Lenteur TTI | Index déjà en place `(group_id, week_start)` et `(athlete_id, week_start)` |
| Coach sans group (cas admin) | `groupId=null` → requête skip | Fallback Phase 1 s'active automatiquement |
| Nageur sans groupe (inscrit en attente) | Pas de slots groupes affichés | Fallback Phase 1 affiche cycles perso existants |

---

## 11. Hors scope

- ❌ Éditeur coach (Phase 3).
- ❌ Retrait définitif des `strength_folders` cycle-based (potentielle Phase 4).
- ❌ Group-level muscu plans côté coach (uniquement les overrides seront utilisés tant que Phase 3 n'est pas livrée).
- ❌ Extension day_of_week > 6 ou time_slot autres valeurs.
- ❌ Drag & drop dans l'UI nageur (lecture seule).

---

## 12. Critères d'acceptation

1. **Migration appliquée** : 4 tables + 16 policies + backfill en place sur Supabase prod (via MCP).
2. **Types** : tous les nouveaux types utilisables sans erreur TS.
3. **Tests unit merge** : 100% passant.
4. **Tests RLS** : `npm run test:rls` vert, couvre select/insert/update/delete + §113 regression.
5. **UI** : nageur avec cycles existants voit ses séances via le nouveau modèle (backfill a fonctionné). Nageur sans backfill voit le fallback Phase 1.
6. **Non-regression** : Phase 1 features intactes (check localStorage, Sheet aperçu, compétitions).
7. **TypeScript** : `npx tsc --noEmit` zéro erreur.
8. **Tests unit globaux** : `npm test` vert (existants + nouveaux merge).
9. **Docs** : §157 + files-map à jour.

---

*Fin du design doc Phase 2. L'agent Sonnet dispose de tout le contexte nécessaire. Une fois Phase 2 livrée, attaquer Phase 3 (éditeur coach) via son propre design doc.*
