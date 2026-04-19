/**
 * SwimmerPlanningPanel — Coach's inline swimmer planning panel on the
 * swimmer detail page. Reuses SwimPlanningTimeline in athlete mode, scoped
 * to a single athlete.
 *
 * Read-only by design: shows the merged (group × athlete overrides) view of
 * the swim planning over a short 7-week window (current week + 6 ahead).
 * For edits, the coach clicks "Plein écran" and lands on the full
 * /coach/swim-planning page with the athlete pre-selected via the URL.
 *
 * Replaces the old cycle-based SwimmerPlanningTab (844 LOC, based on
 * training_cycles/training_weeks which are deprecated by the
 * swim_planning_slots + overrides model — §149 individual swim planning).
 */
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { ExternalLink } from "lucide-react";
import { api } from "@/lib/api";
import type { SwimPlanningSlot } from "@/lib/api/types";
import { Button } from "@/components/ui/button";
import SwimPlanningTimeline from "@/components/coach/swim/SwimPlanningTimeline";
import {
  generateWeeks,
  getMonday,
  type WeekInfo,
} from "@/components/coach/swim/swimPlanningShared";
import { useSwimPlanningAthleteMode } from "@/hooks/coach/useSwimPlanningAthleteMode";

interface Props {
  athleteId: number;
}

/** Short embedded window: current week + 6 ahead. Full page uses infinite scroll. */
const EMBEDDED_WEEK_COUNT = 7;

export default function SwimmerPlanningPanel({ athleteId }: Props) {
  // ── Athlete → group resolution ────────────────────────────────────
  const { data: athletes = [] } = useQuery({
    queryKey: ["athletes"],
    queryFn: () => api.getAthletes(),
  });
  const athlete = athletes.find((a) => a.id === athleteId) ?? null;
  const groupId = athlete?.group_id ?? null;

  // ── Week window (stable across renders — generated once per mount) ─
  const weeks: WeekInfo[] = useMemo(
    () => generateWeeks(getMonday(new Date()), EMBEDDED_WEEK_COUNT),
    [],
  );
  const visibleWeekKeys = useMemo(() => weeks.map((w) => w.weekKey), [weeks]);

  // ── Group slots for the window (reference for the merge) ──────────
  const { data: groupSlots = [] } = useQuery({
    queryKey: ["swim-planning-slots", groupId, visibleWeekKeys],
    queryFn: () =>
      api.getSwimPlanningSlots({
        groupId: groupId!,
        weekStarts: visibleWeekKeys,
      }),
    enabled: groupId != null && visibleWeekKeys.length > 0,
  });

  const groupSlotsByWeek = useMemo(() => {
    const m = new Map<string, SwimPlanningSlot[]>();
    for (const s of groupSlots) {
      const arr = m.get(s.week_start) ?? [];
      arr.push(s);
      m.set(s.week_start, arr);
    }
    return m;
  }, [groupSlots]);

  // ── Athlete-mode hook: merge group base with per-athlete overrides ─
  // `syncUrl: false` — we don't want this embedded panel to scribble
  // `?athlete=<id>` into the swimmer-detail URL (that URL sync is reserved
  // for the full-page editor at `/coach/swim-planning`).
  const mode = useSwimPlanningAthleteMode({
    selectedGroupId: groupId,
    visibleWeekKeys,
    groupSlotsByWeek,
    syncUrl: false,
  });

  // Force the panel to stay locked on this athlete — the hook manages its
  // own selection state, so we push our athleteId prop into it whenever it
  // changes (e.g. the coach navigates to a different swimmer). Destructure
  // the two fields we need so the effect is not re-run on every render
  // (the `mode` object identity changes every render).
  const { selectedAthleteId, setSelectedAthleteId } = mode;
  useEffect(() => {
    if (selectedAthleteId !== athleteId) {
      setSelectedAthleteId(athleteId);
    }
  }, [athleteId, selectedAthleteId, setSelectedAthleteId]);

  // ── Local UI state (read-only: only expand/collapse) ──────────────
  const [expandedWeekKey, setExpandedWeekKey] = useState<string | null>(null);
  const toggleWeek = (weekKey: string) =>
    setExpandedWeekKey((prev) => (prev === weekKey ? null : weekKey));

  // ── Early empty states ────────────────────────────────────────────
  if (!athlete) {
    return (
      <p className="text-sm text-muted-foreground">
        Chargement du nageur…
      </p>
    );
  }

  if (!groupId) {
    return (
      <p className="text-sm text-muted-foreground">
        Ce nageur n'est pas rattaché à un groupe — impossible d'afficher le
        planning.
      </p>
    );
  }

  // ── Render ────────────────────────────────────────────────────────
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          Vue lecture seule — 7 semaines. Les overrides filière / type de
          semaine s'appliquent à ce nageur uniquement.
        </p>
        <Button variant="ghost" size="sm" asChild>
          <Link href={`/coach/swim-planning?athlete=${athleteId}`}>
            <ExternalLink className="h-3 w-3 mr-1" />
            Plein écran
          </Link>
        </Button>
      </div>

      <SwimPlanningTimeline
        mode="athlete"
        readOnly
        weeks={weeks}
        slotsByWeek={mode.effectiveSlotsByWeek}
        competitionsByWeek={new Map()}
        expandedWeekKey={expandedWeekKey}
        onToggleWeek={toggleWeek}
        getWeekMeta={(weekKey) => {
          const m = mode.getEffectiveWeekMeta(weekKey);
          return {
            weekType: m.week_type ?? undefined,
            notes: m.notes ?? undefined,
            source: m.source,
          };
        }}
        editingWeekKey={null}
        editWeekType=""
        editWeekNotes=""
        existingWeekTypes={mode.existingWeekTypes}
        // All callbacks are no-ops: `readOnly` guarantees the timeline never
        // fires them. They are required as non-optional props so we keep them.
        onStartEditMeta={() => {}}
        onSaveMeta={() => {}}
        onCancelEditMeta={() => {}}
        onEditTypeChange={() => {}}
        onEditNotesChange={() => {}}
        onSlotClick={() => {}}
        getDayCompetitions={() => []}
        sessionNameMap={new Map()}
        showOverrideBadge
      />
    </div>
  );
}
