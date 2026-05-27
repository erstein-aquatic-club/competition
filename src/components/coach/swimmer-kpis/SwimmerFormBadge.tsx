import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Moon, Battery, Flame, Smile, Wind, type LucideIcon } from 'lucide-react';
import { getWellnessRange, computeReadinessScore } from '@/lib/api/wellness';
import type { WellnessCheck } from '@/lib/api/types';

type Props = { userId: number };

/* ── Readiness (0-100) — bandes alignées sur ReadinessGauge / WellnessTrend ── */

function readinessConfig(s: number) {
  if (s > 70) return { label: 'Bonne', dot: 'bg-emerald-500', text: 'text-emerald-700', bar: 'bg-emerald-500' };
  if (s >= 40) return { label: 'Moyenne', dot: 'bg-amber-400', text: 'text-amber-700', bar: 'bg-amber-400' };
  return { label: 'Basse', dot: 'bg-red-500', text: 'text-red-700', bar: 'bg-red-500' };
}

/* ── Sous-métriques bien-être (échelle 1-5, libellés alignés sur WellnessForm) ── */

const METRICS: { key: keyof WellnessCheck; label: string; icon: LucideIcon; positive: boolean }[] = [
  { key: 'sleep_quality', label: 'Sommeil', icon: Moon, positive: true },
  { key: 'fatigue', label: 'Fatigue', icon: Battery, positive: false },
  { key: 'soreness', label: 'Courbatures', icon: Flame, positive: false },
  { key: 'mood', label: 'Humeur', icon: Smile, positive: true },
  { key: 'stress', label: 'Stress', icon: Wind, positive: false },
];

/** Moyenne d'un champ 1-5 sur les relevés renseignés (valeurs ≥ 1). */
function avgMetric(checks: WellnessCheck[], key: keyof WellnessCheck): number | null {
  const vals = checks
    .map(c => c[key])
    .filter((v): v is number => typeof v === 'number' && v >= 1);
  if (vals.length === 0) return null;
  return vals.reduce((s, v) => s + v, 0) / vals.length;
}

/** Couleur d'une sous-métrique : on normalise en « bon = 5 » puis on colore. */
function metricTone(avg: number, positive: boolean): string {
  const good = positive ? avg : 6 - avg;
  if (good >= 4) return 'text-emerald-600';
  if (good >= 3) return 'text-amber-600';
  return 'text-red-600';
}

function last7Days(): { start: string; end: string; dates: string[] } {
  const dates: string[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    dates.push(d.toISOString().slice(0, 10));
  }
  return { start: dates[0], end: dates[6], dates };
}

function MetricTile({ metric, avg }: { metric: (typeof METRICS)[number]; avg: number | null }) {
  const Icon = metric.icon;
  return (
    <div className="flex flex-col items-center gap-0.5 rounded-lg bg-card/60 py-1.5">
      <Icon className="h-3.5 w-3.5 text-muted-foreground" />
      <span className="text-[10px] text-muted-foreground leading-none">{metric.label}</span>
      {avg == null ? (
        <span className="text-xs font-semibold text-muted-foreground/50 leading-none">—</span>
      ) : (
        <span className={`text-xs font-semibold leading-none ${metricTone(avg, metric.positive)}`}>
          {avg.toFixed(1)}
          <span className="text-[9px] font-normal text-muted-foreground">/5</span>
        </span>
      )}
    </div>
  );
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

  const avgReadiness =
    withData.reduce((s, c) => s + (c.readiness_score ?? computeReadinessScore(c)), 0) / withData.length;
  const cfg = readinessConfig(avgReadiness);
  const today = filled[6];
  const todayScore = today?.readiness_score ?? null;

  // Moyenne d'heures de sommeil sur les relevés renseignés.
  const sleepHours = withData.map(c => c.sleep_hours).filter(h => typeof h === 'number' && h > 0);
  const avgSleepHours = sleepHours.length
    ? sleepHours.reduce((s, h) => s + h, 0) / sleepHours.length
    : null;

  // Dernière note non vide (relevé le plus récent en tête de `withData`).
  const latestNote = checks.find(c => c.notes && c.notes.trim().length > 0)?.notes?.trim() ?? null;

  return (
    <div className="rounded-xl border bg-muted/30 px-3 py-2.5 space-y-2.5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <span className={`h-2.5 w-2.5 rounded-full shrink-0 ${cfg.dot}`} />
          <div>
            <p className="text-xs text-muted-foreground">Forme (moy. 7j)</p>
            <p className={`text-sm font-semibold ${cfg.text}`}>
              {cfg.label} — {Math.round(avgReadiness)}%
            </p>
          </div>
        </div>
        {todayScore != null && (
          <span className="text-[11px] text-muted-foreground">
            Aujourd'hui : <span className="font-semibold">{todayScore}%</span>
          </span>
        )}
      </div>

      {/* 7-day sparkline (readiness 0-100) */}
      <div className="flex items-end gap-1">
        {filled.map((c, i) => {
          const score = c ? (c.readiness_score ?? computeReadinessScore(c)) : null;
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
          const height = 4 + Math.round((score / 100) * 24);
          const barCfg = readinessConfig(score);
          return (
            <div
              key={i}
              className={`flex-1 rounded-sm ${barCfg.bar} ${isToday ? 'ring-1 ring-offset-1 ring-primary/40' : ''}`}
              style={{ height }}
            />
          );
        })}
      </div>

      {/* Détail des sous-métriques (moyennes 7j) */}
      <div className="grid grid-cols-5 gap-1 border-t border-border/50 pt-2">
        {METRICS.map(m => (
          <MetricTile key={m.key} metric={m} avg={avgMetric(withData, m.key)} />
        ))}
      </div>

      <div className="flex items-center justify-between text-[10px] text-muted-foreground">
        <span>{withData.length}/7 jours renseignés</span>
        {avgSleepHours != null && <span>Sommeil moy. {avgSleepHours.toFixed(1)} h</span>}
      </div>

      {latestNote && (
        <p className="text-[11px] text-muted-foreground border-t border-border/50 pt-2 line-clamp-3">
          <span className="font-medium text-foreground/70">Dernière note :</span> {latestNote}
        </p>
      )}
    </div>
  );
}
