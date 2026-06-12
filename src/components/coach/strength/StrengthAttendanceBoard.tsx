/**
 * StrengthAttendanceBoard — tableau d'assiduité muscu côté coach (Task 5).
 *
 * Pour chaque nageur ayant un mésocycle muscu **actif**, affiche sur une
 * période glissante (1 / 2 / 4 semaines, navigable dans le passé) :
 *   • une jauge "fait / prévu" par semaine (% du volume planifié réalisé,
 *     granularité semaine pour tolérer le décalage d'un jour) ;
 *   • une bande de 7 pastilles Lun→Dim par semaine, chaque pastille codant
 *     l'état du jour (terminé / débuté / à faire / déplacée / prévu / —).
 *
 * Données :
 *   - `listActiveMesocyclesWithAthletes()` → liste des nageurs concernés.
 *   - `getStrengthAttendanceData()` → créneaux planifiés + runs sur la fenêtre.
 *   - `computeAttendance()` (pur) → agrège le tout en lignes par nageur.
 *
 * Mobile-first (le coach consulte au bord du bassin) : cartes empilées,
 * pastilles qui passent à la ligne, aucun débordement horizontal.
 */
import { useMemo, useState } from 'react';
import { useLocation } from 'wouter';
import { useQuery } from '@tanstack/react-query';
import { Check, ChevronLeft, ChevronRight, Dumbbell } from 'lucide-react';

import {
  getStrengthAttendanceData,
  listActiveMesocyclesWithAthletes,
} from '@/lib/api';
import {
  computeAttendance,
  derivePeriodWeekStarts,
  periodDays,
  type AttendanceDayStatus,
} from '@/lib/strength/attendance';
import { addDaysIso, getMonday, toISODate } from '@/lib/date';
import { cn } from '@/lib/utils';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';

type WeeksOption = 1 | 2 | 4;

const FR_DAY_MONTH = new Intl.DateTimeFormat('fr-FR', {
  day: 'numeric',
  month: 'short',
});

const FR_FULL = new Intl.DateTimeFormat('fr-FR', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
});

const WEEKDAY_LETTERS = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];

const STATUS_LABEL: Record<AttendanceDayStatus, string> = {
  completed: 'Terminé',
  started: 'Débuté',
  todo: 'À faire',
  shifted: 'Déplacée (rattrapée)',
  planned: 'Prévu',
  none: '—',
};

/** Parse an ISO "YYYY-MM-DD" as a local-midnight Date (avoids TZ shift). */
function isoToDate(iso: string): Date {
  return new Date(iso + 'T00:00:00');
}

function shortDate(iso: string): string {
  return FR_DAY_MONTH.format(isoToDate(iso));
}

/** Render one status dot (shared by the strip and the legend). */
function StatusDot({ status }: { status: AttendanceDayStatus }) {
  const base = 'h-5 w-5 rounded-full grid place-items-center text-[10px]';
  switch (status) {
    case 'completed':
      return (
        <span className={cn(base, 'bg-emerald-500 text-white')}>
          <Check className="h-3 w-3" />
        </span>
      );
    case 'started':
      return <span className={cn(base, 'bg-amber-500')} />;
    case 'todo':
      return (
        <span
          className={cn(base, 'border-2 border-rose-400 text-rose-500')}
        />
      );
    case 'shifted':
      return (
        <span
          className={cn(
            base,
            'border border-dashed border-muted-foreground/40',
          )}
        />
      );
    case 'planned':
      return <span className={cn(base, 'border-2 border-violet-300')} />;
    case 'none':
    default:
      return <span className={cn(base, 'bg-muted/40 opacity-30')} />;
  }
}

export default function StrengthAttendanceBoard() {
  const [, navigate] = useLocation();
  const [weeks, setWeeks] = useState<WeeksOption>(2);
  const [offset, setOffset] = useState(0);

  const todayMonday = toISODate(getMonday(new Date()));
  const today = toISODate(new Date());

  const periodWeekStarts = useMemo(
    () => derivePeriodWeekStarts(todayMonday, weeks, offset),
    [todayMonday, weeks, offset],
  );
  const days = useMemo(() => periodDays(periodWeekStarts), [periodWeekStarts]);
  const fromISO = periodWeekStarts[0];
  const toISO = days[days.length - 1];

  const { data: mesoItems = [], isLoading: mesoLoading } = useQuery({
    queryKey: ['active-mesocycles-coach'],
    queryFn: () => listActiveMesocyclesWithAthletes(),
    staleTime: 60_000,
  });

  const athleteIds = useMemo(
    () => mesoItems.map((m) => m.athlete_id),
    [mesoItems],
  );
  const nameById = useMemo(() => {
    const map = new Map<number, string>();
    for (const m of mesoItems) map.set(m.athlete_id, m.athlete_name);
    return map;
  }, [mesoItems]);

  const { data: attendanceData } = useQuery({
    queryKey: ['strength-attendance', athleteIds, periodWeekStarts],
    queryFn: () =>
      getStrengthAttendanceData(athleteIds, periodWeekStarts, fromISO, toISO),
    enabled: athleteIds.length > 0,
  });

  const rows = useMemo(() => {
    if (!attendanceData) return [];
    return computeAttendance({
      athleteIds,
      plannedSlots: attendanceData.plannedSlots,
      runs: attendanceData.runs,
      periodWeekStarts,
      today,
    });
  }, [attendanceData, athleteIds, periodWeekStarts, today]);

  const periodLabel =
    days.length > 0
      ? `${shortDate(days[0])} – ${shortDate(days[days.length - 1])}`
      : '';

  return (
    <TooltipProvider>
      <section className="space-y-3">
        {/* Header */}
        <div className="flex flex-wrap items-center gap-x-2 gap-y-2">
          <Dumbbell className="h-3.5 w-3.5 text-violet-500" />
          <h2 className="text-[11px] font-bold uppercase tracking-[0.16em] text-muted-foreground">
            Assiduité muscu
          </h2>
          <div className="ml-auto">
            <ToggleGroup
              type="single"
              size="sm"
              value={String(weeks)}
              onValueChange={(v) => {
                if (v) setWeeks(Number(v) as WeeksOption);
              }}
            >
              <ToggleGroupItem value="1" className="text-[11px]">
                1 sem
              </ToggleGroupItem>
              <ToggleGroupItem value="2" className="text-[11px]">
                2 sem
              </ToggleGroupItem>
              <ToggleGroupItem value="4" className="text-[11px]">
                4 sem
              </ToggleGroupItem>
            </ToggleGroup>
          </div>
        </div>

        {/* Period navigation */}
        <div className="flex items-center justify-center gap-3">
          <button
            type="button"
            onClick={() => setOffset((o) => o - 1)}
            className="grid h-7 w-7 place-items-center rounded-lg border bg-card text-muted-foreground transition-colors hover:bg-accent"
            aria-label="Période précédente"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="min-w-[7.5rem] text-center text-xs font-medium tabular-nums text-muted-foreground">
            {periodLabel}
          </span>
          <button
            type="button"
            onClick={() => setOffset((o) => o + 1)}
            disabled={offset >= 0}
            className="grid h-7 w-7 place-items-center rounded-lg border bg-card text-muted-foreground transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-40"
            aria-label="Période suivante"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>

        {/* Legend */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[10px] text-muted-foreground">
          {(
            [
              'completed',
              'started',
              'todo',
              'shifted',
              'planned',
            ] as AttendanceDayStatus[]
          ).map((status) => (
            <span key={status} className="flex items-center gap-1">
              <span className="scale-75">
                <StatusDot status={status} />
              </span>
              {STATUS_LABEL[status]}
            </span>
          ))}
        </div>

        {/* Body */}
        {mesoLoading ? (
          <div className="space-y-2">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="h-24 animate-pulse rounded-2xl border bg-muted/40"
              />
            ))}
          </div>
        ) : athleteIds.length === 0 ? (
          <div className="rounded-2xl border bg-card p-4 text-center">
            <p className="text-sm font-semibold">Aucun mésocycle actif</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Les nageurs avec un plan muscu actif apparaîtront ici.
            </p>
          </div>
        ) : (
          <div className="space-y-2.5">
            {rows.map((row) => {
              const name =
                nameById.get(row.athleteId) ?? `#${row.athleteId}`;
              return (
                <div
                  key={row.athleteId}
                  className="rounded-2xl border bg-card p-3.5"
                >
                  {/* §381 — ouvre la page plein écran « Parcours du cycle ». */}
                  <button
                    type="button"
                    onClick={() =>
                      navigate(`/coach/strength-cycle/${row.athleteId}`)
                    }
                    className="-m-1 flex w-full items-center gap-2 rounded-lg p-1 text-left transition-colors hover:bg-accent/50"
                  >
                    <p className="min-w-0 flex-1 truncate text-sm font-bold">
                      {name}
                    </p>
                    <span className="text-[10px] text-muted-foreground">
                      Cycle
                    </span>
                    <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                  </button>

                  <div className="mt-2 space-y-3">
                    {row.weeks.map((wk) => {
                      const end = addDaysIso(wk.weekStart, 6);
                      const weekDays = row.days
                        .filter(
                          (d) => d.date >= wk.weekStart && d.date <= end,
                        )
                        .sort((a, b) => a.date.localeCompare(b.date));
                      const hasPlan = wk.planned > 0;
                      const pct = wk.pct ?? 0;
                      const fillColor =
                        wk.pct === 100
                          ? 'bg-emerald-500'
                          : pct > 0
                            ? 'bg-amber-500'
                            : 'bg-muted-foreground/30';

                      return (
                        <div key={wk.weekStart} className="space-y-1.5">
                          {/* Week label + gauge */}
                          <div className="flex items-center gap-2">
                            <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground">
                              Sem. {shortDate(wk.weekStart)}
                            </span>
                            {hasPlan ? (
                              <>
                                <span className="shrink-0 text-[11px] font-semibold tabular-nums">
                                  {wk.completed}/{wk.planned}
                                </span>
                                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                                  <div
                                    className={cn(
                                      'h-full rounded-full',
                                      fillColor,
                                    )}
                                    style={{ width: `${pct}%` }}
                                  />
                                </div>
                              </>
                            ) : (
                              <span className="text-[10px] italic text-muted-foreground">
                                — pas de plan
                              </span>
                            )}
                          </div>

                          {/* 7-dot strip Lun→Dim */}
                          {hasPlan && (
                            <div>
                              <div className="grid grid-cols-7 gap-1">
                                {WEEKDAY_LETTERS.map((letter, i) => (
                                  <span
                                    key={i}
                                    className="text-center text-[9px] font-medium text-muted-foreground"
                                  >
                                    {letter}
                                  </span>
                                ))}
                              </div>
                              <div className="mt-1 grid grid-cols-7 place-items-center gap-1">
                                {weekDays.map((d) => (
                                  <Tooltip key={d.date}>
                                    <TooltipTrigger asChild>
                                      <span className="inline-flex">
                                        <StatusDot status={d.status} />
                                      </span>
                                    </TooltipTrigger>
                                    <TooltipContent>
                                      {FR_FULL.format(isoToDate(d.date))} —{' '}
                                      {STATUS_LABEL[d.status]}
                                    </TooltipContent>
                                  </Tooltip>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </TooltipProvider>
  );
}
