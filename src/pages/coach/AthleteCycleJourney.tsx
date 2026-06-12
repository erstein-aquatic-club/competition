/**
 * AthleteCycleJourney — page coach plein écran « Parcours du cycle » (§381).
 *
 * Ouverte au clic sur une carte du tableau d'assiduité muscu
 * (`StrengthAttendanceBoard`), route `/coach/strength-cycle/:athleteId`.
 * Remplace le dépliage inline §380 par une timeline VERTICALE enrichie du
 * mésocycle actif du nageur :
 *   • hero : objectif, « Semaine X/Y · phase » (numérotation globale §358),
 *     barre de progression du cycle, CTA « Ajuster le mésocycle » ;
 *   • timeline verticale groupée par segments de phase (rail coloré par
 *     phase), une ligne par semaine : n°, dates, jauge assiduité fait/prévu
 *     + bande 7 pastilles Lun→Dim (semaines passées/courante), séances
 *     prévues (semaines futures), semaine courante surlignée.
 *
 * Sources : phases = `week_type` matérialisés (`strength_planning_week_overrides`,
 * fidèle aux mésos ajustés §338) ; assiduité = `getStrengthAttendanceData` +
 * `computeAttendance` (mêmes briques que le board, fenêtre = tout le méso).
 */
import { useMemo } from 'react';
import { useRoute, useLocation } from 'wouter';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, ArrowRight, Route as RouteIcon } from 'lucide-react';

import {
  getActiveMesocycle,
  getAthletes,
  getStrengthAttendanceData,
  getStrengthPlanningWeekOverrides,
} from '@/lib/api';
import {
  buildJourneyWeekStarts,
  groupPhaseSegments,
  type CycleJourneyWeek,
} from '@/lib/strength/cycleJourney';
import {
  computeAttendance,
  type AttendanceDayStatus,
} from '@/lib/strength/attendance';
import {
  formatEventGroupLabel,
  mesocyclePosition,
} from '@/lib/strength/mesocycleProgress';
import {
  detectPhase,
  shortPhaseLabel,
  PHASE_STYLES,
} from '@/lib/strength/strengthPhaseStyles';
import { useAuth } from '@/lib/auth';
import { addDaysIso, getMonday, toISODate } from '@/lib/date';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

const FR_DAY_MONTH = new Intl.DateTimeFormat('fr-FR', {
  day: 'numeric',
  month: 'short',
});

function shortDate(iso: string): string {
  return FR_DAY_MONTH.format(new Date(iso + 'T00:00:00'));
}

/** Couleur de remplissage des micro-pastilles jour (palette du board §365). */
const DAY_DOT_CLASS: Record<AttendanceDayStatus, string> = {
  completed: 'bg-emerald-500',
  started: 'bg-amber-500',
  todo: 'bg-rose-400',
  shifted: 'bg-muted-foreground/40',
  planned: 'bg-violet-300',
  none: 'bg-muted/60',
};

export default function AthleteCycleJourney() {
  const [, params] = useRoute<{ athleteId: string }>(
    '/coach/strength-cycle/:athleteId',
  );
  const [, navigate] = useLocation();
  const role = useAuth((s) => s.role);
  const isCoach = role === 'coach' || role === 'admin';

  const athleteId = params?.athleteId ? Number(params.athleteId) : null;

  const {
    data: meso,
    isLoading: mesoLoading,
    isError: mesoError,
  } = useQuery({
    queryKey: ['strength-mesocycle-active', athleteId],
    queryFn: () => getActiveMesocycle(athleteId!),
    enabled: athleteId != null && isCoach,
  });

  const { data: athletes } = useQuery({
    queryKey: ['athletes'],
    queryFn: () => getAthletes(),
    staleTime: 5 * 60 * 1000,
  });

  // §340 C3 — même repli que MesocycleAdjust : lundi persisté par la RPC,
  // sinon lundi TZ-safe de la semaine de génération (mésos antérieurs).
  const startMonday = useMemo(() => {
    if (!meso) return null;
    if (meso.start_week_monday) return meso.start_week_monday;
    return toISODate(
      getMonday(new Date(`${meso.generated_at.slice(0, 10)}T00:00:00`)),
    );
  }, [meso]);

  const weekStarts = useMemo(
    () =>
      startMonday && meso
        ? buildJourneyWeekStarts(startMonday, meso.target_week_count)
        : [],
    [startMonday, meso],
  );

  const { data: overrides, isLoading: overridesLoading } = useQuery({
    queryKey: ['strength_planning_week_overrides', athleteId, weekStarts],
    queryFn: () =>
      getStrengthPlanningWeekOverrides({
        athleteId: athleteId!,
        weekStarts,
      }),
    enabled: athleteId != null && weekStarts.length > 0,
    staleTime: 60_000,
  });

  const { data: attendanceData } = useQuery({
    queryKey: ['strength-attendance', [athleteId], weekStarts],
    queryFn: () =>
      getStrengthAttendanceData(
        [athleteId!],
        weekStarts,
        weekStarts[0],
        addDaysIso(weekStarts[weekStarts.length - 1], 6),
      ),
    enabled: athleteId != null && weekStarts.length > 0,
    staleTime: 60_000,
  });

  const currentMonday = toISODate(getMonday(new Date()));
  const today = toISODate(new Date());

  const journeyWeeks = useMemo((): CycleJourneyWeek[] => {
    const byStart = new Map<string, string | null>();
    for (const o of overrides ?? []) byStart.set(o.week_start, o.week_type);
    return weekStarts.map((weekStart) => ({
      weekStart,
      label: byStart.get(weekStart) ?? null,
    }));
  }, [overrides, weekStarts]);

  const segments = useMemo(
    () => groupPhaseSegments(journeyWeeks, currentMonday),
    [journeyWeeks, currentMonday],
  );

  const attendance = useMemo(() => {
    if (!attendanceData || athleteId == null) return null;
    return (
      computeAttendance({
        athleteIds: [athleteId],
        plannedSlots: attendanceData.plannedSlots,
        runs: attendanceData.runs,
        periodWeekStarts: weekStarts,
        today,
      })[0] ?? null
    );
  }, [attendanceData, athleteId, weekStarts, today]);

  const weekStats = useMemo(() => {
    const map = new Map<string, { planned: number; completed: number; pct: number | null }>();
    for (const w of attendance?.weeks ?? []) {
      map.set(w.weekStart, { planned: w.planned, completed: w.completed, pct: w.pct });
    }
    return map;
  }, [attendance]);

  const athleteName =
    athletes?.find((a) => a.id === athleteId)?.display_name ??
    (athleteId != null ? `Athlète ${athleteId}` : 'Athlète');

  const offset = meso?.week_offset ?? 0;
  const position =
    meso && startMonday
      ? mesocyclePosition(startMonday, meso.target_week_count, currentMonday, offset)
      : null;
  const currentLabel =
    journeyWeeks.find((w) => w.weekStart === currentMonday)?.label ?? null;
  const currentStyle = PHASE_STYLES[detectPhase(currentLabel ?? '')];

  const loading = mesoLoading || (meso != null && overridesLoading);

  // ── Corps ───────────────────────────────────────────────────────────────────
  let body: React.ReactNode;
  if (!isCoach) {
    body = <EmptyState message="Réservé aux entraîneurs." />;
  } else if (athleteId == null) {
    body = <EmptyState message="Nageur introuvable." />;
  } else if (loading) {
    body = (
      <div className="space-y-3">
        <div className="h-32 animate-pulse rounded-2xl border bg-muted/40" />
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-20 animate-pulse rounded-2xl border bg-muted/40" />
        ))}
      </div>
    );
  } else if (mesoError || !meso || !position) {
    body = <EmptyState message="Aucun mésocycle actif pour ce nageur." />;
  } else {
    const progressPct = Math.round(
      (position.weekNumber / position.totalWeeks) * 100,
    );
    body = (
      <div className="space-y-5">
        {/* Hero — position courante */}
        <div className="rounded-2xl border bg-card p-4">
          <p className="text-base font-bold">{athleteName}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {formatEventGroupLabel(meso.event_group)} ·{' '}
            {meso.kind === 'season' ? 'prépa de saison' : 'inter-compétitions'} ·{' '}
            {meso.sessions_per_week} séances/sem
          </p>

          <div className="mt-3 flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
            <span className="text-xl font-bold tabular-nums">
              {position.status === 'upcoming'
                ? `Démarre le ${shortDate(startMonday!)}`
                : position.status === 'done'
                  ? 'Cycle terminé'
                  : `Semaine ${position.weekNumber}/${position.totalWeeks}`}
            </span>
            {position.status === 'active' && (
              <span className="flex items-center gap-1.5 text-sm">
                <span className={cn('h-2.5 w-2.5 shrink-0 rounded-full', currentStyle.dot)} />
                <span className={cn('font-semibold', currentStyle.text)}>
                  {currentLabel ? shortPhaseLabel(currentLabel) : 'Phase inconnue'}
                </span>
              </span>
            )}
          </div>

          <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary"
              style={{ width: `${position.status === 'done' ? 100 : position.status === 'upcoming' ? 0 : progressPct}%` }}
            />
          </div>

          <div className="mt-3 flex items-center justify-between gap-2">
            <p className="text-[10px] text-muted-foreground">
              Généré le {shortDate(meso.generated_at.slice(0, 10))}
              {offset > 0 && ' · ajusté mi-cycle'}
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 gap-1 text-xs"
              onClick={() => navigate(`/strength/mesocycle-adjust/${athleteId}`)}
            >
              Ajuster le mésocycle
              <ArrowRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>

        {/* Timeline verticale par segments de phase */}
        <div className="space-y-0">
          {segments.map((seg) => {
            const style = PHASE_STYLES[detectPhase(seg.label ?? '')];
            const firstNum = seg.startIndex + 1 + offset;
            const lastNum = seg.startIndex + seg.weekCount + offset;
            const segWeeks = journeyWeeks.slice(
              seg.startIndex,
              seg.startIndex + seg.weekCount,
            );
            return (
              <div
                key={seg.weekStart}
                className={cn(
                  'relative border-l-2 pb-5 pl-4',
                  style.border,
                  seg.timing === 'past' && 'opacity-55',
                )}
              >
                {/* Pastille de phase sur le rail */}
                <span
                  className={cn(
                    'absolute -left-[7px] top-0.5 h-3 w-3 rounded-full ring-2 ring-background',
                    style.dot,
                  )}
                />
                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                  <span className={cn('text-sm font-bold', style.text)}>
                    {seg.label ? shortPhaseLabel(seg.label) : 'Sans phase'}
                  </span>
                  <span className="text-[11px] tabular-nums text-muted-foreground">
                    {seg.weekCount > 1 ? `S${firstNum}–S${lastNum}` : `S${firstNum}`} ·{' '}
                    {seg.weekCount} sem.
                  </span>
                  {seg.timing === 'current' && (
                    <span className="rounded-full bg-foreground px-1.5 py-px text-[9px] font-bold uppercase tracking-wider text-background">
                      en cours
                    </span>
                  )}
                </div>

                <div className="mt-2 space-y-1.5">
                  {segWeeks.map((w, i) => (
                    <WeekRow
                      key={w.weekStart}
                      weekNumber={firstNum + i}
                      weekStart={w.weekStart}
                      currentMonday={currentMonday}
                      stats={weekStats.get(w.weekStart) ?? null}
                      days={
                        attendance?.days.filter(
                          (d) =>
                            d.date >= w.weekStart &&
                            d.date <= addDaysIso(w.weekStart, 6),
                        ) ?? []
                      }
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-24">
      <div className="sticky top-0 z-20 border-b bg-background/80 backdrop-blur-lg">
        <div className="flex items-center gap-2.5 px-4 py-3">
          <button
            type="button"
            onClick={() => navigate('/coach/strength-planning')}
            className="-ml-1 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground active:scale-[0.97]"
            aria-label="Retour"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <RouteIcon className="h-4 w-4 shrink-0 text-primary" />
          <h1 className="min-w-0 truncate text-lg font-bold tracking-tight text-foreground">
            Parcours du cycle
          </h1>
        </div>
      </div>

      <div className="mx-auto max-w-2xl px-4 pt-4">{body}</div>
    </div>
  );
}

// ── Sous-composants ───────────────────────────────────────────────────────────

/** Une ligne semaine de la timeline : n° + dates + assiduité (ou prévision). */
function WeekRow({
  weekNumber,
  weekStart,
  currentMonday,
  stats,
  days,
}: {
  weekNumber: number;
  weekStart: string;
  currentMonday: string;
  stats: { planned: number; completed: number; pct: number | null } | null;
  days: { date: string; status: AttendanceDayStatus }[];
}) {
  const isCurrent = weekStart === currentMonday;
  const isPast = weekStart < currentMonday;
  const planned = stats?.planned ?? 0;
  const completed = stats?.completed ?? 0;
  const pct = stats?.pct ?? 0;
  const fillColor =
    stats?.pct === 100
      ? 'bg-emerald-500'
      : pct > 0
        ? 'bg-amber-500'
        : 'bg-muted-foreground/30';

  return (
    <div
      className={cn(
        'rounded-xl px-2.5 py-2',
        isCurrent
          ? 'bg-accent/60 ring-1 ring-border'
          : 'bg-card/50',
      )}
    >
      <div className="flex items-center gap-2">
        <span className="w-8 shrink-0 text-xs font-bold tabular-nums">
          S{weekNumber}
        </span>
        <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
          {shortDate(weekStart)} – {shortDate(addDaysIso(weekStart, 6))}
        </span>

        {planned === 0 ? (
          <span className="ml-auto text-[10px] italic text-muted-foreground">
            — pas de plan
          </span>
        ) : isPast || isCurrent ? (
          <>
            <span className="ml-auto shrink-0 text-[11px] font-semibold tabular-nums">
              {completed}/{planned}
            </span>
            <div className="h-1.5 w-14 shrink-0 overflow-hidden rounded-full bg-muted">
              <div
                className={cn('h-full rounded-full', fillColor)}
                style={{ width: `${pct}%` }}
              />
            </div>
          </>
        ) : (
          <span className="ml-auto text-[11px] tabular-nums text-muted-foreground">
            {planned} séance{planned > 1 ? 's' : ''} prévue{planned > 1 ? 's' : ''}
          </span>
        )}
      </div>

      {/* Bande 7 micro-pastilles Lun→Dim (semaines entamées uniquement) */}
      {(isPast || isCurrent) && planned > 0 && days.length > 0 && (
        <div className="mt-1.5 flex items-center gap-1 pl-10">
          {[...days]
            .sort((a, b) => a.date.localeCompare(b.date))
            .map((d) => (
              <span
                key={d.date}
                title={`${shortDate(d.date)}`}
                className={cn(
                  'h-1.5 w-1.5 rounded-full',
                  DAY_DOT_CLASS[d.status],
                )}
              />
            ))}
        </div>
      )}
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  const [, navigate] = useLocation();
  return (
    <div className="rounded-2xl border bg-card px-4 py-10 text-center">
      <p className="text-sm text-muted-foreground">{message}</p>
      <Button
        type="button"
        variant="outline"
        className="mt-4"
        onClick={() => navigate('/coach/strength-planning')}
      >
        Retour
      </Button>
    </div>
  );
}
