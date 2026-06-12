/**
 * AttendanceMesocycleJourney — frise « parcours du cycle » d'un nageur (§380).
 *
 * Montée en lazy quand le coach déplie une carte du tableau d'assiduité muscu
 * (`StrengthAttendanceBoard`). Affiche, pour le mésocycle actif du nageur :
 *   • la position courante : « Semaine X/Y · phase » (numérotation globale
 *     §358 : un méso ajusté mi-cycle reporte `week_offset`) ;
 *   • une frise compacte, un segment par semaine coloré par phase (passé
 *     atténué, semaine courante marquée) ;
 *   • la suite du cycle : segments de phases consécutives avec plage de
 *     semaines + dates (« Force max · S3–S5 · 15 juin – 5 juil. »).
 *
 * Source des phases : `strength_planning_week_overrides.week_type` matérialisé
 * par la RPC apply — fidèle aux mésos ajustés (§338), aucune recomposition de
 * template. Une seule requête, déclenchée au dépliage uniquement.
 */
import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';

import {
  getStrengthPlanningWeekOverrides,
  type ActiveMesocycleWithAthlete,
} from '@/lib/api';
import {
  buildJourneyWeekStarts,
  groupPhaseSegments,
  type CycleJourneyWeek,
} from '@/lib/strength/cycleJourney';
import {
  formatEventGroupLabel,
  mesocyclePosition,
} from '@/lib/strength/mesocycleProgress';
import {
  detectPhase,
  shortPhaseLabel,
  PHASE_STYLES,
} from '@/lib/strength/strengthPhaseStyles';
import { addDaysIso, getMonday, toISODate } from '@/lib/date';
import { cn } from '@/lib/utils';

const FR_DAY_MONTH = new Intl.DateTimeFormat('fr-FR', {
  day: 'numeric',
  month: 'short',
});

function shortDate(iso: string): string {
  return FR_DAY_MONTH.format(new Date(iso + 'T00:00:00'));
}

export default function AttendanceMesocycleJourney({
  meso,
}: {
  meso: ActiveMesocycleWithAthlete;
}) {
  // §340 C3 — même repli que MesocycleAdjust : lundi persisté par la RPC,
  // sinon lundi TZ-safe de la semaine de génération (mésos antérieurs).
  const startMonday =
    meso.start_week_monday ??
    toISODate(getMonday(new Date(`${meso.generated_at.slice(0, 10)}T00:00:00`)));

  const weekStarts = useMemo(
    () => buildJourneyWeekStarts(startMonday, meso.target_week_count),
    [startMonday, meso.target_week_count],
  );

  const { data: overrides, isLoading } = useQuery({
    queryKey: ['strength_planning_week_overrides', meso.athlete_id, weekStarts],
    queryFn: () =>
      getStrengthPlanningWeekOverrides({
        athleteId: meso.athlete_id,
        weekStarts,
      }),
    staleTime: 60_000,
  });

  const currentMonday = toISODate(getMonday(new Date()));

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

  const offset = meso.week_offset ?? 0;
  const position = mesocyclePosition(
    startMonday,
    meso.target_week_count,
    currentMonday,
    offset,
  );
  const currentLabel =
    journeyWeeks.find((w) => w.weekStart === currentMonday)?.label ?? null;
  const currentStyle = PHASE_STYLES[detectPhase(currentLabel ?? '')];

  if (isLoading) {
    return (
      <div className="space-y-2 pt-3">
        <div className="h-3 w-40 animate-pulse rounded bg-muted" />
        <div className="h-2 w-full animate-pulse rounded-full bg-muted" />
        <div className="h-3 w-56 animate-pulse rounded bg-muted" />
      </div>
    );
  }

  return (
    <div className="space-y-2.5 pt-3">
      {/* Position courante */}
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <span className="text-xs font-bold tabular-nums">
          {position.status === 'upcoming'
            ? 'Démarre le ' + shortDate(startMonday)
            : position.status === 'done'
              ? 'Cycle terminé'
              : `Semaine ${position.weekNumber}/${position.totalWeeks}`}
        </span>
        {position.status === 'active' && (
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span
              className={cn('h-2 w-2 shrink-0 rounded-full', currentStyle.dot)}
            />
            <span className={cn('font-medium', currentStyle.text)}>
              {currentLabel ? shortPhaseLabel(currentLabel) : 'phase inconnue'}
            </span>
          </span>
        )}
        <span className="text-[10px] text-muted-foreground">
          {formatEventGroupLabel(meso.event_group)} ·{' '}
          {meso.kind === 'season' ? 'prépa de saison' : 'inter-compétitions'}
        </span>
      </div>

      {/* Frise : un segment par semaine, coloré par phase */}
      <div className="flex items-center gap-0.5">
        {journeyWeeks.map((w) => {
          const style = PHASE_STYLES[detectPhase(w.label ?? '')];
          const isCurrent = w.weekStart === currentMonday;
          const isPast = w.weekStart < currentMonday;
          return (
            <span
              key={w.weekStart}
              title={`Sem. ${shortDate(w.weekStart)} — ${w.label ?? '—'}`}
              className={cn(
                'h-2 flex-1 rounded-full',
                style.dot,
                isPast && !isCurrent && 'opacity-30',
                isCurrent &&
                  'ring-2 ring-foreground/70 ring-offset-1 ring-offset-card',
              )}
            />
          );
        })}
      </div>

      {/* Suite du cycle : segments de phases */}
      <ul className="space-y-1">
        {segments.map((seg) => {
          const style = PHASE_STYLES[detectPhase(seg.label ?? '')];
          const firstNum = seg.startIndex + 1 + offset;
          const lastNum = seg.startIndex + seg.weekCount + offset;
          const lastEnd = addDaysIso(
            seg.weekStart,
            (seg.weekCount - 1) * 7 + 6,
          );
          return (
            <li
              key={seg.weekStart}
              className={cn(
                'flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px]',
                seg.timing === 'past' && 'opacity-40',
              )}
            >
              <span
                className={cn('h-2 w-2 shrink-0 rounded-full', style.dot)}
              />
              <span className={cn('font-semibold', style.text)}>
                {seg.label ? shortPhaseLabel(seg.label) : 'Sans phase'}
              </span>
              <span className="tabular-nums text-muted-foreground">
                {seg.weekCount > 1 ? `S${firstNum}–S${lastNum}` : `S${firstNum}`}{' '}
                · {shortDate(seg.weekStart)} – {shortDate(lastEnd)}
              </span>
              {seg.timing === 'current' && (
                <span className="rounded-full bg-foreground px-1.5 py-px text-[9px] font-bold uppercase tracking-wider text-background">
                  en cours
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
