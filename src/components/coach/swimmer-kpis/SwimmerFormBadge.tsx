import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { getWellnessRange } from '@/lib/api/wellness';
import type { WellnessCheck } from '@/lib/api/types';

type Props = { userId: number };

const SCORE_CONFIG = [
  { min: 7, label: 'Bonne',   dot: 'bg-emerald-500', text: 'text-emerald-700', bar: 'bg-emerald-500' },
  { min: 5, label: 'Moyenne', dot: 'bg-amber-400',   text: 'text-amber-700',   bar: 'bg-amber-400'   },
  { min: 0, label: 'Basse',   dot: 'bg-red-500',     text: 'text-red-700',     bar: 'bg-red-500'     },
] as const;

function scoreConfig(s: number) {
  return SCORE_CONFIG.find(c => s >= c.min) ?? SCORE_CONFIG[2];
}

function last7Days(): { start: string; end: string; dates: string[] } {
  const dates: string[] = [];
  const end = new Date();
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    dates.push(d.toISOString().slice(0, 10));
  }
  return { start: dates[0], end: dates[6], dates };
}

export default function SwimmerFormBadge({ userId }: Props) {
  const { start, end, dates } = React.useMemo(() => last7Days(), []);

  const { data: checks = [], isLoading } = useQuery<WellnessCheck[]>({
    queryKey: ['wellness-range', userId, start, end],
    queryFn: () => getWellnessRange(userId, start, end),
    enabled: !!userId,
    staleTime: 5 * 60_000,
  });

  if (isLoading) {
    return <div className="h-14 rounded-xl bg-muted/30 animate-pulse" />;
  }

  const byDate = Object.fromEntries(checks.map(c => [c.date, c]));
  const filled = dates.map(d => byDate[d] ?? null);
  const withData = filled.filter(Boolean) as WellnessCheck[];

  if (withData.length === 0) {
    return (
      <div className="flex items-center gap-2.5 rounded-xl border bg-muted/30 px-3 py-2.5">
        <span className="h-2.5 w-2.5 rounded-full bg-muted-foreground/30 shrink-0" />
        <p className="text-xs text-muted-foreground">Forme — Aucun relevé sur 7 jours</p>
      </div>
    );
  }

  const avgReadiness = withData.reduce((s, c) => s + (c.readiness_score ?? 5), 0) / withData.length;
  const cfg = scoreConfig(Math.round(avgReadiness));
  const today = filled[6];
  const todayScore = today?.readiness_score ?? null;

  return (
    <div className="rounded-xl border bg-muted/30 px-3 py-2.5 space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <span className={`h-2.5 w-2.5 rounded-full shrink-0 ${cfg.dot}`} />
          <div>
            <p className="text-xs text-muted-foreground">Forme (moy. 7j)</p>
            <p className={`text-sm font-semibold ${cfg.text}`}>
              {cfg.label} — {avgReadiness.toFixed(1)}/10
            </p>
          </div>
        </div>
        {todayScore != null && (
          <span className="text-[11px] text-muted-foreground">
            Aujourd'hui : <span className="font-semibold">{todayScore}/10</span>
          </span>
        )}
      </div>

      {/* 7-day sparkline */}
      <div className="flex items-end gap-1">
        {filled.map((c, i) => {
          const score = c?.readiness_score ?? null;
          const isToday = i === 6;
          if (score == null) {
            return (
              <div
                key={i}
                className={`flex-1 rounded-sm bg-muted-foreground/15 ${isToday ? 'ring-1 ring-muted-foreground/30' : ''}`}
                style={{ height: 12 }}
              />
            );
          }
          const height = 4 + Math.round((score / 10) * 20);
          const barCfg = scoreConfig(score);
          return (
            <div
              key={i}
              className={`flex-1 rounded-sm ${barCfg.bar} ${isToday ? 'ring-1 ring-offset-1 ring-primary/40' : ''}`}
              style={{ height }}
            />
          );
        })}
      </div>

      <p className="text-[10px] text-muted-foreground text-right">
        {withData.length}/7 jours renseignés
      </p>
    </div>
  );
}
