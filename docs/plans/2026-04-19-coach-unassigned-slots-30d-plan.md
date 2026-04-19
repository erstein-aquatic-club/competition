# Créneaux non assignés 30j — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Sur la Coach Home, ajouter entre "Ma semaine" et "Accès rapides" une section accordéon listant les créneaux `swim` non assignés sur les 30 derniers jours (J-30 → J-1), avec navigation directe vers la vue semaine concernée au clic.

**Architecture:** Nouvelle RPC Supabase `get_unassigned_slot_instances_30d()` mirrors §00121. Wrapper API `getUnassignedSlots30d()` côté client. Section accordéon dans `CoachHome`. Deep-link semaine via `weekDate` dans `coachRouteState`, initialise `weekMonday` dans `CoachTrainingSlotsScreen`.

**Tech Stack:** React 19, TypeScript, Vitest, Tailwind CSS 4, Supabase (PostgreSQL + RPC), React Query 5, Wouter (hash routing).

**Design document:** `docs/plans/2026-04-19-coach-unassigned-slots-30d-design.md`

---

## Task 1 — Migration Supabase : RPC `get_unassigned_slot_instances_30d`

**Files:**
- Create: `supabase/migrations/00117_unassigned_slot_instances_30d.sql`

**Step 1: Écrire le fichier SQL**

Créer le fichier avec le contenu suivant :

```sql
-- Migration 00117: get_unassigned_slot_instances_30d
--
-- Retourne, pour les 30 derniers jours (J-30 à J-1, aujourd'hui exclu),
-- la liste des occurrences de créneaux de natation (swim) actifs qui
-- n'ont reçu aucune séance assignée.
--
-- Convention de fenêtre alignée sur get_feedback_rates_all_athletes (§00121).
-- Mêmes exclusions : overrides status='cancelled' et session_assignments status='cancelled'.

DROP FUNCTION IF EXISTS get_unassigned_slot_instances_30d();

CREATE OR REPLACE FUNCTION get_unassigned_slot_instances_30d()
RETURNS TABLE (
  slot_id          uuid,
  scheduled_date   date,
  day_of_week      smallint,
  start_time       time,
  end_time         time,
  location         text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  WITH
  since_date AS (
    SELECT (current_date - 30)::date AS d
  ),
  dates AS (
    SELECT gs::date AS d, EXTRACT(ISODOW FROM gs)::smallint AS dow
    FROM generate_series((SELECT d FROM since_date), current_date - 1, '1 day'::interval) gs
  ),
  expected AS (
    -- Slots récurrents : toutes les occurrences ISODOW dans la fenêtre
    SELECT ts.id AS slot_id, d.d AS scheduled_date, ts.day_of_week,
           ts.start_time, ts.end_time, ts.location
    FROM training_slots ts
    JOIN dates d ON d.dow = ts.day_of_week
    WHERE ts.is_active = true
      AND ts.session_type = 'swim'
      AND ts.scheduled_date IS NULL
    UNION ALL
    -- Slots one-off : garder si scheduled_date tombe dans la fenêtre
    SELECT ts.id, ts.scheduled_date, ts.day_of_week,
           ts.start_time, ts.end_time, ts.location
    FROM training_slots ts
    WHERE ts.is_active = true
      AND ts.session_type = 'swim'
      AND ts.scheduled_date IS NOT NULL
      AND ts.scheduled_date >= (SELECT d FROM since_date)
      AND ts.scheduled_date <  current_date
  ),
  cancelled AS (
    SELECT slot_id, override_date
    FROM training_slot_overrides
    WHERE status = 'cancelled'
      AND override_date >= (SELECT d FROM since_date)
      AND override_date <  current_date
  ),
  assigned AS (
    SELECT DISTINCT training_slot_id AS slot_id, scheduled_date
    FROM session_assignments
    WHERE training_slot_id IS NOT NULL
      AND assignment_type = 'swim'
      AND status <> 'cancelled'
      AND scheduled_date >= (SELECT d FROM since_date)
      AND scheduled_date <  current_date
  )
  SELECT e.slot_id, e.scheduled_date, e.day_of_week,
         e.start_time, e.end_time, e.location
  FROM expected e
  WHERE NOT EXISTS (
    SELECT 1 FROM cancelled c
    WHERE c.slot_id = e.slot_id AND c.override_date = e.scheduled_date
  )
  AND NOT EXISTS (
    SELECT 1 FROM assigned a
    WHERE a.slot_id = e.slot_id AND a.scheduled_date = e.scheduled_date
  )
  ORDER BY e.scheduled_date DESC, e.start_time;
$$;

GRANT EXECUTE ON FUNCTION get_unassigned_slot_instances_30d() TO authenticated;
```

**Step 2: Vérifier la structure des tables référencées**

Avant d'appliquer, confirmer que les colonnes existent bien :

Run: `mcp__plugin_supabase_supabase__list_tables` sur le schéma `public` pour vérifier :
- `training_slots` : colonnes `id (uuid)`, `is_active`, `session_type`, `scheduled_date`, `day_of_week`, `start_time`, `end_time`, `location`
- `training_slot_overrides` : `slot_id`, `override_date`, `status`
- `session_assignments` : `training_slot_id`, `assignment_type`, `status`, `scheduled_date`

Si un nom de colonne diffère (ex: `slot_id` vs `training_slot_id`), adapter le SQL avant d'appliquer.

**Step 3: Appliquer la migration via MCP**

Run: `mcp__plugin_supabase_supabase__apply_migration` avec :
- `name`: `unassigned_slot_instances_30d`
- `query`: le contenu du fichier `.sql` (sans les commentaires en en-tête optionnel)

Expected: OK (pas d'erreur de nom/colonne/type).

**Step 4: Smoke-test la RPC**

Run: `mcp__plugin_supabase_supabase__execute_sql` avec :
```sql
SELECT COUNT(*) AS n, MIN(scheduled_date) AS min_d, MAX(scheduled_date) AS max_d
FROM get_unassigned_slot_instances_30d();
```

Expected:
- `n` >= 0 (pas d'erreur SQL)
- Si `n > 0` : `min_d >= current_date - 30` et `max_d < current_date`

**Step 5: Commit**

```bash
git add supabase/migrations/00117_unassigned_slot_instances_30d.sql
git commit -m "feat(slots): RPC get_unassigned_slot_instances_30d — créneaux J-30 non assignés"
```

---

## Task 2 — Tests RLS intégration

**Files:**
- Create: `supabase/tests/rls/coach_unassigned_slots.test.ts`

**Step 1: Vérifier Docker et supabase start**

Run: `docker ps`

Si Docker n'est pas lancé, demander à l'utilisateur de lancer Docker Desktop et attendre confirmation.

Si Docker OK mais conteneurs down : `supabase start`.

**Step 2: Lire le schéma de test pour savoir si les tables existent**

Run: `head -n 100 supabase/tests/schema.sql` via Read.

Si `training_slots`, `training_slot_overrides`, `session_assignments` manquent du schéma de test, **court-circuiter cette task** : ajouter juste une note dans le commit "skipped — harness schema does not include slot tables; migration tested via MCP smoke-test in Task 1". Passer à Task 3.

**Step 3: Écrire un test minimal si les tables existent**

Reproduire le pattern d'un test RLS existant (voir `supabase/tests/rls/*.test.ts`). Le test crée :
- Un slot actif `swim` jour 1 (lundi)
- Zéro assignment
- Vérifie que `get_unassigned_slot_instances_30d()` retourne des lignes pour les 4 lundis passés.

Puis crée une assignment sur l'un de ces lundis et vérifie que le compte baisse de 1.

**Step 4: Run**

Run: `npm run test:rls`
Expected: PASS

**Step 5: Commit**

```bash
git add supabase/tests/rls/coach_unassigned_slots.test.ts
git commit -m "test(rls): get_unassigned_slot_instances_30d"
```

---

## Task 3 — Wrapper API `getUnassignedSlots30d`

**Files:**
- Modify: `src/lib/api/assignments.ts` (ajouter en fin, avant les helpers swimmer-centric L514)
- Modify: `src/lib/api/index.ts` (ajouter à l'import L148-158)
- Modify: `src/lib/api.ts` (import L158 + façade L728)

**Step 1: Ajouter la fonction dans `assignments.ts`**

Après `getAssignedSwimCatalogIds` (~L512) et avant le commentaire `// ── Swimmer-centric resolution ──` :

```ts
/** Get unassigned swim slot occurrences over the past 30 days (J-30 → J-1). */
export async function getUnassignedSlots30d(): Promise<Array<{
  slot_id: string;
  scheduled_date: string;   // YYYY-MM-DD
  day_of_week: number;      // 1=Mon…7=Sun (ISO)
  start_time: string;       // HH:MM:SS
  end_time: string;         // HH:MM:SS
  location: string | null;
}>> {
  if (!canUseSupabase()) return [];
  const { data, error } = await supabase.rpc("get_unassigned_slot_instances_30d");
  if (error) throw new Error(error.message);
  return (data ?? []).map((row: any) => ({
    slot_id: String(row.slot_id),
    scheduled_date: String(row.scheduled_date),
    day_of_week: Number(row.day_of_week),
    start_time: String(row.start_time),
    end_time: String(row.end_time),
    location: row.location ?? null,
  }));
}
```

**Step 2: Re-export dans `src/lib/api/index.ts`**

Dans le bloc qui importe depuis `./assignments` (L148-158), ajouter `getUnassignedSlots30d,` en fin de liste.

**Step 3: Façade dans `src/lib/api.ts`**

Dans l'import L155-161, ajouter :
```ts
getUnassignedSlots30d as _getUnassignedSlots30d,
```

Dans l'objet façade, après `getSlotAssignments` (~L728) :
```ts
async getUnassignedSlots30d() { return _getUnassignedSlots30d(); },
```

**Step 4: Type check**

Run: `npx tsc --noEmit`
Expected: aucune nouvelle erreur (erreurs préexistantes `*.stories.tsx` et `TimesheetHelpers.test.ts` tolérées — cf MEMORY.md).

**Step 5: Commit**

```bash
git add src/lib/api/assignments.ts src/lib/api/index.ts src/lib/api.ts
git commit -m "feat(api): getUnassignedSlots30d wrapper"
```

---

## Task 4 — Ajouter `weekDate` au route state

**Files:**
- Modify: `src/pages/coach/coachRouteState.ts`
- Create: `src/pages/coach/__tests__/coachRouteState.test.ts` (nouveau fichier)

**Step 1: Écrire le test qui échoue**

Créer `src/pages/coach/__tests__/coachRouteState.test.ts` :

```ts
import { describe, it, expect } from "vitest";
import { parseCoachHashLocation, buildCoachHash } from "../coachRouteState";

describe("coachRouteState — weekDate", () => {
  it("parses weekDate when section=week", () => {
    const state = parseCoachHashLocation("#/coach?section=week&weekDate=2026-04-14");
    expect(state.section).toBe("week");
    expect(state.weekDate).toBe("2026-04-14");
  });

  it("ignores weekDate when section is not week", () => {
    const state = parseCoachHashLocation("#/coach?section=swimmers&weekDate=2026-04-14");
    expect(state.weekDate).toBeUndefined();
  });

  it("ignores invalid weekDate format", () => {
    const state = parseCoachHashLocation("#/coach?section=week&weekDate=not-a-date");
    expect(state.weekDate).toBeUndefined();
  });

  it("round-trips weekDate through build", () => {
    const hash = buildCoachHash({ section: "week", weekDate: "2026-04-14" });
    expect(hash).toContain("section=week");
    expect(hash).toContain("weekDate=2026-04-14");
  });

  it("omits weekDate from hash when undefined", () => {
    const hash = buildCoachHash({ section: "week" });
    expect(hash).not.toContain("weekDate");
  });

  it("strips weekDate when section changes away from week", () => {
    const hash = buildCoachHash({ section: "swimmers" }, "#/coach?section=week&weekDate=2026-04-14");
    expect(hash).not.toContain("weekDate");
  });
});
```

**Step 2: Vérifier qu'il échoue**

Run: `npm test -- src/pages/coach/__tests__/coachRouteState.test.ts`
Expected: FAIL — `weekDate` n'existe pas encore sur `CoachRouteState`.

**Step 3: Implémenter**

Dans `src/pages/coach/coachRouteState.ts` :

1. Étendre le type :
```ts
export type CoachRouteState = {
  section: CoachSection;
  tab?: CoachCommsTab;
  athleteId?: number | null;
  weekDate?: string;  // YYYY-MM-DD, uniquement pour section="week"
};
```

2. Dans `parseCoachHashLocation`, après le parse de `athleteId`, ajouter :
```ts
const rawWeekDate = params.get("weekDate");
const weekDateValid = rawWeekDate !== null && /^\d{4}-\d{2}-\d{2}$/.test(rawWeekDate);
```

Et dans le return, ajouter :
```ts
weekDate: section === "week" && weekDateValid ? rawWeekDate! : undefined,
```

3. Dans `buildCoachHash`, après le bloc `if (nextState.section === "comms") { ... } else { ... }` (L66-81), **avant** `const query = params.toString()`, ajouter :

```ts
if (nextState.section === "week") {
  if (nextState.weekDate && /^\d{4}-\d{2}-\d{2}$/.test(nextState.weekDate)) {
    params.set("weekDate", nextState.weekDate);
  } else {
    params.delete("weekDate");
  }
} else {
  params.delete("weekDate");
}
```

**Step 4: Vérifier que les tests passent**

Run: `npm test -- src/pages/coach/__tests__/coachRouteState.test.ts`
Expected: PASS (6 tests verts).

**Step 5: Commit**

```bash
git add src/pages/coach/coachRouteState.ts src/pages/coach/__tests__/coachRouteState.test.ts
git commit -m "feat(coach-routing): weekDate query param for deep-linking week view"
```

---

## Task 5 — Propager `initialWeekDate` → `CoachTrainingSlotsScreen`

**Files:**
- Modify: `src/pages/coach/CoachWeekView.tsx`
- Modify: `src/pages/coach/CoachTrainingSlotsScreen.tsx` (props + init + effect)
- Modify: `src/pages/Coach.tsx` (transmission au render `section === "week"`)

**Step 1: Ajouter la prop dans `CoachWeekView`**

Dans `src/pages/coach/CoachWeekView.tsx` :

Étendre `CoachWeekViewProps` (L18-23) :
```ts
type CoachWeekViewProps = {
  groups: Array<{ id: number | string; name: string }>;
  athletes: Array<{ id: number | null; display_name: string; group_label?: string | null }>;
  swimSessions?: Array<{ id: number; name: string }>;
  strengthSessions?: Array<{ id: number; title: string }>;
  initialWeekDate?: string;
};
```

Destructurer dans la signature (L25-30) et passer à `CoachTrainingSlotsScreen` (L108-112) :
```tsx
<CoachTrainingSlotsScreen
  groups={groups}
  onOpenLibrary={handleOpenLibrary}
  modeToggle={modeToggle}
  initialWeekDate={initialWeekDate}
/>
```

**Step 2: Étendre `CoachTrainingSlotsScreenProps`**

Dans `src/pages/coach/CoachTrainingSlotsScreen.tsx` L298-303 :
```ts
type CoachTrainingSlotsScreenProps = {
  onBack?: () => void;
  groups: Array<{ id: number | string; name: string }>;
  onOpenLibrary?: (context?: SwimLibraryEntryContext) => void;
  modeToggle?: React.ReactNode;
  initialWeekDate?: string;
};
```

**Step 3: Utiliser la prop dans l'init `weekMonday`**

L1831-1836 (destructuring) : ajouter `initialWeekDate`.

L1850 : remplacer :
```ts
const [weekMonday, setWeekMonday] = useState(() => getMonday(new Date()));
```
par :
```ts
const [weekMonday, setWeekMonday] = useState(() =>
  getMonday(initialWeekDate ? new Date(initialWeekDate + "T00:00:00") : new Date())
);

// Re-align when the deep-link prop changes (home → slot click → week view on a different week)
useEffect(() => {
  if (initialWeekDate) {
    setWeekMonday(getMonday(new Date(initialWeekDate + "T00:00:00")));
  }
}, [initialWeekDate]);
```

Vérifier que `useEffect` est déjà importé en haut du fichier (grep `import.*useEffect`).

Run: `rg -n "import .* useEffect" src/pages/coach/CoachTrainingSlotsScreen.tsx | head -2`

Si absent de l'import React, l'ajouter.

**Step 4: Transmettre depuis `Coach.tsx`**

Dans `src/pages/Coach.tsx`, localiser le render `activeSection === "week"` (~L1088-1097) :

```tsx
{activeSection === "week" ? (
  <Suspense fallback={<PageSkeleton />}>
    <CoachWeekView
      groups={groups}
      athletes={athletes}
      swimSessions={swimSessions}
      strengthSessions={strengthSessions}
      initialWeekDate={routeState.weekDate}
    />
  </Suspense>
) : null}
```

**Step 5: Type check**

Run: `npx tsc --noEmit`
Expected: aucune nouvelle erreur.

**Step 6: Smoke-test manuel**

Run: `npm run dev`

Ouvrir `#/coach?section=week&weekDate=2026-04-07` directement dans la barre d'URL.
Vérifier que la vue semaine s'ouvre sur la semaine du 7 avr. 2026 (lundi 7).

Revenir sur home → section week sans param → la semaine courante s'affiche bien.

**Step 7: Commit**

```bash
git add src/pages/coach/CoachWeekView.tsx src/pages/coach/CoachTrainingSlotsScreen.tsx src/pages/Coach.tsx
git commit -m "feat(coach-week): initialWeekDate prop drives weekMonday from deep-link"
```

---

## Task 6 — Section accordéon "Créneaux à compléter" dans `CoachHome`

**Files:**
- Modify: `src/pages/Coach.tsx`

**Step 1: Ajouter la query + helpers en haut de `CoachHome`**

Dans `src/pages/Coach.tsx`, au début du corps de `CoachHome` (après les `useMemo` existants pour monday/sunday/today, ~L240, avant `// ── Section B: Slot data ──`) :

```tsx
// ── Section "Créneaux à compléter (30j)" ──────────────────────
const { data: unassignedSlots = [], isLoading: unassignedLoading } = useQuery({
  queryKey: ["unassigned-slots-30d"],
  queryFn: () => api.getUnassignedSlots30d(),
  staleTime: 5 * 60 * 1000,
});

const [unassignedExpanded, setUnassignedExpanded] = useState(false);

/** Monday (ISO) of the week containing `dateIso`, as YYYY-MM-DD. */
function mondayIsoOfDate(dateIso: string): string {
  const d = new Date(dateIso + "T00:00:00");
  const jsDay = d.getDay();
  const diff = jsDay === 0 ? -6 : 1 - jsDay;
  d.setDate(d.getDate() + diff);
  return formatDateIso(d);
}

/** Group unassigned slots by their ISO Monday, preserving RPC order (most recent first). */
const unassignedByWeek = useMemo(() => {
  const groups = new Map<string, typeof unassignedSlots>();
  for (const slot of unassignedSlots) {
    const monday = mondayIsoOfDate(slot.scheduled_date);
    const list = groups.get(monday) ?? [];
    list.push(slot);
    groups.set(monday, list);
  }
  return Array.from(groups.entries()); // [mondayIso, slots[]][]
}, [unassignedSlots]);

const DOW_LABELS_SHORT = ["Lun.", "Mar.", "Mer.", "Jeu.", "Ven.", "Sam.", "Dim."] as const;
function formatSlotDateLabel(dateIso: string): string {
  const d = new Date(dateIso + "T00:00:00");
  const jsDay = d.getDay();
  const dowIdx = jsDay === 0 ? 6 : jsDay - 1;
  const month = d.toLocaleDateString("fr-FR", { month: "short" });
  return `${DOW_LABELS_SHORT[dowIdx]} ${d.getDate()} ${month}`;
}
function formatSlotTimeLabel(start: string, end: string): string {
  return `${start.slice(0, 5)}-${end.slice(0, 5)}`;
}
function formatWeekLabel(mondayIso: string): string {
  const d = new Date(mondayIso + "T00:00:00");
  return `Semaine du ${d.toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}`;
}
```

**Step 2: Ajouter la prop `onOpenWeekAt` au composant**

Étendre `CoachHomeProps` (L63-80) :
```ts
type CoachHomeProps = {
  // …existing props…
  onOpenWeekAt: (weekDate: string) => void;
  // …
};
```

Destructurer dans la signature (L214-225).

**Step 3: Ajouter le JSX de la section**

Dans le return de `CoachHome`, insérer la section **juste après la section B "Ma semaine"** (après la fermeture `</section>` L545) et **avant la section C "Alertes"** (L548) :

```tsx
{/* ── Section B-bis: Créneaux à compléter (30j) ── */}
<section className="space-y-2.5">
  <SectionLabel>Créneaux à compléter</SectionLabel>

  {unassignedLoading ? (
    <div className="rounded-2xl border bg-card p-4">
      <div className="h-4 w-48 animate-pulse rounded bg-muted" />
    </div>
  ) : unassignedSlots.length === 0 ? (
    <div className="flex items-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50/70 px-4 py-3 dark:border-emerald-900/50 dark:bg-emerald-950/25">
      <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
      <span className="text-[12px] font-semibold text-emerald-900 dark:text-emerald-200">
        Tous les créneaux des 30 derniers jours sont assignés
      </span>
    </div>
  ) : (
    <div className="overflow-hidden rounded-2xl border border-amber-200 bg-amber-50/60 dark:border-amber-900/50 dark:bg-amber-950/20">
      <button
        type="button"
        onClick={() => setUnassignedExpanded((v) => !v)}
        className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors active:bg-amber-100/60 dark:active:bg-amber-950/40"
        aria-expanded={unassignedExpanded}
      >
        <AlertCircle className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
        <span className="flex-1 text-[13px] font-semibold text-amber-900 dark:text-amber-200">
          {unassignedSlots.length} créneau{unassignedSlots.length > 1 ? "x" : ""} à compléter
          <span className="ml-1 text-[11px] font-normal text-amber-700/80 dark:text-amber-300/80">
            (30 derniers jours)
          </span>
        </span>
        <ChevronRight
          className={[
            "h-4 w-4 shrink-0 text-amber-600 transition-transform dark:text-amber-400",
            unassignedExpanded ? "rotate-90" : "",
          ].join(" ")}
        />
      </button>

      {unassignedExpanded && (
        <div className="border-t border-amber-200/70 dark:border-amber-900/40">
          {unassignedByWeek.map(([mondayIso, weekSlots]) => (
            <div key={mondayIso}>
              <div className="bg-amber-100/40 px-4 py-1.5 text-[10px] font-black uppercase tracking-[0.15em] text-amber-900/70 dark:bg-amber-950/30 dark:text-amber-200/70">
                {formatWeekLabel(mondayIso)}
              </div>
              <div className="divide-y divide-amber-200/50 dark:divide-amber-900/30">
                {weekSlots.map((slot) => (
                  <button
                    key={`${slot.slot_id}-${slot.scheduled_date}`}
                    type="button"
                    onClick={() => onOpenWeekAt(mondayIso)}
                    className="flex w-full items-center gap-3 bg-white/60 px-4 py-2.5 text-left transition-colors active:bg-white/90 dark:bg-black/10 dark:active:bg-black/20"
                  >
                    <span className="text-[12px] font-semibold text-foreground min-w-[5.5rem]">
                      {formatSlotDateLabel(slot.scheduled_date)}
                    </span>
                    <span className="text-[11px] tabular-nums text-muted-foreground">
                      {formatSlotTimeLabel(slot.start_time, slot.end_time)}
                    </span>
                    {slot.location && (
                      <span className="truncate text-[11px] text-muted-foreground/80">
                        · {slot.location}
                      </span>
                    )}
                    <ChevronRight className="ml-auto h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )}
</section>
```

Vérifier que `CheckCircle2`, `AlertCircle`, `ChevronRight` sont déjà dans les imports L10-27 (ils le sont — `AlertCircle`, `CheckCircle2`, `ChevronRight` sont déjà présents).

**Step 4: Ajouter l'import `useState` si manquant**

`useState` est déjà importé L1.

**Step 5: Type check**

Run: `npx tsc --noEmit`
Expected: aucune nouvelle erreur.

**Step 6: Commit**

```bash
git add src/pages/Coach.tsx
git commit -m "feat(coach-home): section accordéon créneaux non assignés 30j"
```

---

## Task 7 — Handler `onOpenWeekAt` dans `Coach` (câblage final)

**Files:**
- Modify: `src/pages/Coach.tsx`

**Step 1: Ajouter le handler et le passer à `CoachHome`**

Dans le composant `Coach` (outer router, ~L804), localiser le render `activeSection === "home"` (~L1073) et ajouter la prop `onOpenWeekAt` :

```tsx
<CoachHome
  onNavigate={(section) => setRouteState({ section })}
  onOpenRecordsClub={() => navigate("/records-club")}
  onOpenRecordsAdmin={() => navigate("/records-admin")}
  onOpenSwimPlanning={() => navigate("/coach/swim-planning")}
  onOpenAthlete={handleOpenAthlete}
  onOpenWeekAt={(weekDate) => setRouteState({ section: "week", weekDate })}
  athletes={myAthletes}
  athletesLoading={athletesLoading}
  kpiLoading={coachKpisQuery.isLoading}
  fatigueAlerts={coachKpisQuery.data?.fatigueAlerts ?? []}
  groups={groups}
/>
```

**Step 2: Smoke-test manuel complet**

Run: `npm run dev`

Scénarios :

1. **État vide** : si tous les slots 30j sont assignés, afficher la carte verte "Tous les créneaux des 30 derniers jours sont assignés".
2. **État avec données** : carte ambre, compteur correct, clic → déploie la liste groupée par semaine.
3. **Click sur une ligne** : naviguer vers la vue week sur la bonne semaine (vérifier l'URL `#/coach?section=week&weekDate=YYYY-MM-DD` puis que la semaine affichée commence bien par le lundi de la date cliquée).
4. **Retour sur home** : le state accordéon se réinitialise (replié par défaut — comportement attendu).
5. **État loading** : skeleton visible 200-500ms au premier chargement.

**Step 3: Type check final**

Run: `npx tsc --noEmit`
Expected: aucune nouvelle erreur.

**Step 4: Commit**

```bash
git add src/pages/Coach.tsx
git commit -m "feat(coach-home): câblage onOpenWeekAt vers deep-link semaine"
```

---

## Task 8 — Documentation (obligatoire)

**Files:**
- Modify: `docs/implementation-log.md` (nouvelle entrée §145)
- Modify: `docs/ROADMAP.md` (nouvelle ligne)
- Modify: `docs/FEATURES_STATUS.md` (update ligne home coach ou créer ligne dédiée)
- Modify: `CLAUDE.md` (phrase "Dernière entrée en date")
- Modify: `docs/claude/files-map.md` (tailles `Coach.tsx`, `CoachTrainingSlotsScreen.tsx`, `coachRouteState.ts`, `assignments.ts` si delta >30%)

**Step 1: Mesurer les tailles réelles après patch**

Run : `wc -l src/pages/Coach.tsx src/pages/coach/CoachTrainingSlotsScreen.tsx src/pages/coach/coachRouteState.ts src/lib/api/assignments.ts supabase/migrations/00117_unassigned_slot_instances_30d.sql`

Comparer avec les tailles initiales :
- `Coach.tsx` : 1194 avant
- `CoachTrainingSlotsScreen.tsx` : 3351 avant
- `coachRouteState.ts` : 85 avant
- `assignments.ts` : 1034 avant

Si delta > 30% sur l'un, mettre à jour la taille dans `docs/claude/files-map.md`. Sinon laisser.

**Step 2: Ajouter l'entrée §145 dans `docs/implementation-log.md`**

Structure :
- Contexte : coach perd la trace des créneaux non assignés au-delà de la semaine courante.
- Changements : RPC `get_unassigned_slot_instances_30d` + wrapper `getUnassignedSlots30d` + section accordéon dans `CoachHome` + query param `weekDate` + init `weekMonday` depuis prop.
- Fichiers modifiés : lister les 8 fichiers.
- Tests : tests unit sur `coachRouteState` (6 cas) + RLS si applicable.
- Décisions : fenêtre J-30/J-1 alignée sur §00121 ; accordéon plié par défaut ; pas de pagination.
- Limites : pas de filtre groupe/lieu, pas de notification push.

**Step 3: Mettre à jour `docs/ROADMAP.md`**

Ajouter la ligne dans la table des chantiers, statut `Fait (§145)`. Mettre à jour la ligne `*Dernière mise à jour*` (2026-04-19).

**Step 4: Mettre à jour `docs/FEATURES_STATUS.md`**

Localiser la section "Coach — Home" et ajouter une ligne ou enrichir la ligne existante avec la nouvelle section accordéon (statut ✅).

**Step 5: Mettre à jour `CLAUDE.md`**

Remplacer "§144" par "§145" dans la phrase "Dernière entrée en date". Pas de mise à jour du tableau "Hubs & orchestrateurs critiques" (pas de nouveau hub).

**Step 6: Commit**

```bash
git add docs/implementation-log.md docs/ROADMAP.md docs/FEATURES_STATUS.md CLAUDE.md docs/claude/files-map.md
git commit -m "docs: §145 — créneaux non assignés 30j sur coach home"
```

---

## Notes de vérification finale

Avant de considérer la branche comme terminée :

1. ✅ `npm test -- src/pages/coach/__tests__/coachRouteState.test.ts` → 6 tests verts.
2. ✅ `npm run test:rls` si Task 2 livrée (sinon skippée avec note).
3. ✅ `npx tsc --noEmit` → pas de nouvelle erreur (erreurs préexistantes tolérées cf MEMORY.md).
4. ✅ Smoke-test UI : 5 scénarios Task 7 Step 2 validés.
5. ✅ RPC testée via MCP (Task 1 Step 4).
6. ✅ Docs mises à jour (Task 8).

**Déploiement** : pousser sur `main` → GitHub Actions redéploie. Ne **jamais** faire `npx gh-pages -d dist` localement (cf CLAUDE.md § Déploiement).
