/**
 * SwimmerRaceSheet — Jour J race detail bottom sheet.
 *
 * Opened by tapping a LINKED swimmer's race row in the Jour J startlist. Shows,
 * for that swimmer + event:
 *   - their best time THIS SEASON (with date)
 *   - their record perso / best time ALL-TIME (with date)
 *   - the pace table (PaceMatrixInline) for their objective on that event.
 *
 * Pure presentational: all data (perfs, objectives, competition pool) is passed
 * in by the panel — NO fetch here. The pace pool defaults to the competition
 * bassin, falling back to the objective's own pool_length.
 *
 * #310 discipline: ALL useMemo hooks are unconditional, at the TOP, computed
 * defensively with `row?.` so they NEVER sit below a conditional return. The
 * inner content is rendered conditionally on `row` (conditional JSX), and the
 * `return null` for `!row` happens AFTER all hooks.
 */

import { useMemo } from "react";

import type { StartlistRow } from "@/lib/liveffn/buildStartlistRows";
import { bestForEvent, currentSeasonStart } from "@/lib/competitions/seasonBest";
import { parseObjectiveForPace } from "@/lib/objective-pace-link";
import { formatTime } from "@/lib/objectiveHelpers";
import PaceMatrixInline from "@/components/coach/pace/PaceMatrixInline";

import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

type PerfRow = {
  event_code: string;
  pool_length?: number | null;
  time_seconds?: number | null;
  competition_date?: string | null;
};
type ObjRow = {
  event_code?: string | null;
  pool_length?: number | null;
  target_time_seconds?: number | null;
};

/** "2026-05-24" → "24 mai 2026" (fr). Defensive against empty/null input. */
function formatFrDate(date: string | null | undefined): string {
  if (!date) return "—";
  return new Date(date + "T00:00:00").toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export default function SwimmerRaceSheet({
  open,
  onOpenChange,
  row,
  perfs,
  objectives,
  competitionPoolLength,
}: {
  open: boolean;
  onOpenChange: (b: boolean) => void;
  row: StartlistRow | null;
  perfs: PerfRow[];
  objectives: ObjRow[];
  competitionPoolLength: number | null;
}) {
  const todayIso = new Date().toISOString().slice(0, 10);

  // ── Times (all hooks unconditional, defensive on row?.) ──
  // Restrict the bests to the competition basin so a 50 m meet shows 50 m times
  // (not a faster 25 m PB). When the basin is unset, show the all-basin best.
  const seasonBest = useMemo(
    () =>
      row?.eventCode
        ? bestForEvent(perfs, row.eventCode, {
            fromDate: currentSeasonStart(todayIso),
            poolLength: competitionPoolLength,
          })
        : null,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [perfs, row?.eventCode, competitionPoolLength],
  );
  const allTimeBest = useMemo(
    () =>
      row?.eventCode
        ? bestForEvent(perfs, row.eventCode, { poolLength: competitionPoolLength })
        : null,
    [perfs, row?.eventCode, competitionPoolLength],
  );

  // ── Pace target (competition bassin wins over the objective pool) ──
  const obj = useMemo(
    () =>
      row?.eventCode
        ? (objectives.find(
            (o) => o.event_code === row.eventCode && o.target_time_seconds != null,
          ) ?? null)
        : null,
    [objectives, row?.eventCode],
  );
  const parsed =
    obj && row?.eventCode
      ? parseObjectiveForPace(row.eventCode, competitionPoolLength ?? obj.pool_length)
      : null;
  const targetTimeMs =
    obj?.target_time_seconds != null ? obj.target_time_seconds * 1000 : null;

  // Subtitle line: event · day time · série · couloir (omit série/couloir when null).
  const subtitle = useMemo(() => {
    if (!row) return "";
    const parts: string[] = [];
    if (row.eventLabel) parts.push(row.eventLabel);
    const when = [row.day, row.time].filter(Boolean).join(" ");
    if (when) parts.push(when);
    if (row.heat != null) parts.push(`série ${row.heat}`);
    if (row.lane != null) parts.push(`couloir ${row.lane}`);
    return parts.join(" · ");
  }, [row]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="max-h-[85vh] overflow-y-auto overscroll-none rounded-t-3xl"
      >
        {row && (
          <>
            <SheetHeader className="text-left">
              <SheetTitle className="truncate">{row.swimmerName}</SheetTitle>
              {subtitle && (
                <p className="text-[12px] text-muted-foreground leading-snug">
                  {subtitle}
                </p>
              )}
            </SheetHeader>

            {row.eventCode && (
              <>
              <p className="mt-4 text-[10px] font-medium uppercase tracking-wider text-muted-foreground/60">
                Meilleurs temps{" "}
                {competitionPoolLength != null
                  ? `· bassin ${competitionPoolLength} m`
                  : "· toutes piscines"}
              </p>
              <div className="mt-1.5 grid grid-cols-2 gap-2.5">
                <div className="rounded-lg bg-muted/40 p-3">
                  <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/70">
                    Meilleur temps saison
                  </p>
                  {seasonBest ? (
                    <p className="mt-1 text-[15px] font-semibold tabular-nums leading-tight">
                      {formatTime(seasonBest.time)}
                      <span className="ml-1.5 text-[11px] font-normal text-muted-foreground">
                        {formatFrDate(seasonBest.date)}
                      </span>
                    </p>
                  ) : (
                    <p className="mt-1 text-[15px] font-semibold tabular-nums leading-tight text-muted-foreground/40">
                      —
                    </p>
                  )}
                </div>

                <div className="rounded-lg bg-muted/40 p-3">
                  <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/70">
                    Record perso
                  </p>
                  {allTimeBest ? (
                    <p className="mt-1 text-[15px] font-semibold tabular-nums leading-tight">
                      {formatTime(allTimeBest.time)}
                      <span className="ml-1.5 text-[11px] font-normal text-muted-foreground">
                        {formatFrDate(allTimeBest.date)}
                      </span>
                    </p>
                  ) : (
                    <p className="mt-1 text-[15px] font-semibold tabular-nums leading-tight text-muted-foreground/40">
                      —
                    </p>
                  )}
                </div>
              </div>
              </>
            )}

            <div className="mt-5">
              {parsed && targetTimeMs != null ? (
                <>
                  <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70">
                    Allures objectif
                  </p>
                  <PaceMatrixInline
                    targetTimeMs={targetTimeMs}
                    targetDistance={parsed.distance}
                    stroke={parsed.stroke}
                    targetPoolSize={parsed.pool_size}
                    swimmerSex={null}
                  />
                </>
              ) : (
                <p className="rounded-lg bg-muted/30 p-3 text-[12px] text-muted-foreground">
                  Aucun objectif positionné pour cette épreuve.
                </p>
              )}
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
