import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, type SwimmerPerformance } from "@/lib/api";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import { Check, Trophy } from "lucide-react";
import { eventLabel, ffnNamesFromEventCode } from "@/lib/objectiveHelpers";

// ── Helpers ──────────────────────────────────────────────────────

function formatDateShort(value?: string | null) {
  if (!value) return "—";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime())
    ? value
    : parsed.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "2-digit" });
}

function formatTimeSeconds(value?: number | null) {
  if (value === null || value === undefined) return "—";
  const ms = Math.round(Math.max(0, value * 1000));
  const minutes = Math.floor(ms / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  const centi = Math.floor((ms % 1000) / 10);
  if (minutes > 0) {
    return `${minutes}:${String(seconds).padStart(2, "0")}.${String(centi).padStart(2, "0")}`;
  }
  return `${seconds}.${String(centi).padStart(2, "0")}`;
}

const cx = (...c: Array<string | false | null | undefined>) => c.filter(Boolean).join(" ");

const TIMELINE_OPTS = [
  { label: "90j", days: 90 },
  { label: "6 mois", days: 180 },
  { label: "1 an", days: 360 },
  { label: "2 ans", days: 730 },
  { label: "Tout", days: null },
] as const;

// ── Types ────────────────────────────────────────────────────────

export type EventProgressionContentProps = {
  eventCode: string;
  poolLength: 25 | 50;
  iuf: string | null;
  targetTime?: number | null;
  athleteName?: string;
  /** Gates React Query queries — replaces the old `open` param. Defaults to true. */
  active?: boolean;
};

export type EventProgressionSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Compact event code, e.g. "50NL", "100DOS" */
  eventCode: string;
  poolLength: 25 | 50;
  iuf: string | null;
  targetTime?: number | null;
  /** Optional label shown in the header */
  athleteName?: string;
};

// ── EventProgressionContent ──────────────────────────────────────
// Callers are responsible for rendering the event title and providing top spacing.

export function EventProgressionContent({
  eventCode,
  poolLength,
  iuf,
  targetTime,
  athleteName,
  active,
}: EventProgressionContentProps) {
  const [days, setDays] = useState<number | null>(360);
  const [comparePool, setComparePool] = useState(false);
  const otherPoolLen = poolLength === 25 ? 50 : 25;

  // Fetch all-time performances for main pool (only while active)
  const { data: mainPerfs = [] } = useQuery<SwimmerPerformance[]>({
    queryKey: ["swimmer-performances-all", iuf, poolLength],
    queryFn: () => api.getSwimmerPerformances({ iuf: iuf!, poolLength }),
    enabled: (active ?? true) && !!iuf,
    staleTime: 5 * 60_000,
  });

  // Fetch all-time performances for other pool (lazy, for comparison toggle)
  const { data: otherPerfs = [] } = useQuery<SwimmerPerformance[]>({
    queryKey: ["swimmer-performances-all", iuf, otherPoolLen],
    queryFn: () => api.getSwimmerPerformances({ iuf: iuf!, poolLength: otherPoolLen }),
    enabled: (active ?? true) && !!iuf && comparePool,
    staleTime: 5 * 60_000,
  });

  // Filter to just the requested event
  const ffnNames = useMemo(
    () => ffnNamesFromEventCode(eventCode).map((n) => n.toLowerCase()),
    [eventCode],
  );

  const eventPerfs = useMemo(
    () => mainPerfs.filter((p) => ffnNames.includes(p.event_code.toLowerCase())),
    [mainPerfs, ffnNames],
  );

  const eventOtherPerfs = useMemo(
    () => otherPerfs.filter((p) => ffnNames.includes(p.event_code.toLowerCase())),
    [otherPerfs, ffnNames],
  );

  // Best performance (lowest time)
  const bestId = useMemo(() => {
    if (!eventPerfs.length) return null;
    return eventPerfs.reduce((min, p) => (p.time_seconds < min.time_seconds ? p : min)).id;
  }, [eventPerfs]);

  // Cutoff date
  const cutoff = useMemo(() => {
    if (days == null) return null;
    const d = new Date();
    d.setDate(d.getDate() - days);
    return d.toISOString().slice(0, 10);
  }, [days]);

  // Chart data (ascending date order, filtered by cutoff)
  const chartData = useMemo(() => {
    const mainPoints = [...eventPerfs]
      .filter((p) => p.competition_date && (!cutoff || p.competition_date >= cutoff))
      .sort((a, b) => (a.competition_date ?? "").localeCompare(b.competition_date ?? ""))
      .map((p) => ({
        rawDate: p.competition_date ?? "",
        date: formatDateShort(p.competition_date),
        time: p.time_seconds,
        timeOther: undefined as number | undefined,
        display: p.time_display ?? formatTimeSeconds(p.time_seconds),
      }));

    if (!comparePool || !eventOtherPerfs.length) return mainPoints;

    const filteredOther = eventOtherPerfs.filter(
      (p) => p.competition_date && (!cutoff || p.competition_date >= cutoff),
    );

    const map = new Map<string, (typeof mainPoints)[0]>();
    for (const pt of mainPoints) map.set(pt.rawDate, pt);
    for (const p of filteredOther) {
      const key = p.competition_date ?? "";
      const existing = map.get(key);
      if (existing) {
        existing.timeOther = p.time_seconds;
      } else {
        map.set(key, {
          rawDate: key,
          date: formatDateShort(p.competition_date),
          time: undefined as unknown as number,
          timeOther: p.time_seconds,
          display: "",
        });
      }
    }
    return [...map.values()].sort((a, b) => a.rawDate.localeCompare(b.rawDate));
  }, [eventPerfs, eventOtherPerfs, comparePool, cutoff]);

  // Visible perfs in list (all time, not filtered by cutoff)
  const sortedPerfs = useMemo(
    () => [...eventPerfs].sort((a, b) => (b.competition_date ?? "").localeCompare(a.competition_date ?? "")),
    [eventPerfs],
  );

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        {athleteName ? `${athleteName} · ` : ""}
        {eventPerfs.length} performance{eventPerfs.length !== 1 ? "s" : ""} en bassin {poolLength}m
      </p>

      {/* Chart */}
      {chartData.length > 1 && (
        <div className="rounded-2xl border border-border bg-muted/20 px-2 pt-3 pb-1">
          <div className="flex items-center justify-between mb-2 px-2">
            <span className="text-xs text-muted-foreground">Courbe de progression</span>
            <button
              type="button"
              className={`rounded-full px-2.5 py-0.5 text-[10px] font-medium transition-colors ${
                comparePool
                  ? "bg-orange-500 text-white"
                  : "bg-muted text-muted-foreground hover:bg-muted/80"
              }`}
              onClick={() => setComparePool((v) => !v)}
            >
              {comparePool ? `${poolLength}m + ${otherPoolLen}m` : `+ ${otherPoolLen}m`}
            </button>
          </div>

          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={chartData} margin={{ top: 8, right: 10, left: 0, bottom: 5 }}>
              <defs>
                <linearGradient id="epObjLine" x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0%" stopColor="#f59e0b" stopOpacity={0.85} />
                  <stop offset="50%" stopColor="#10b981" stopOpacity={0.85} />
                  <stop offset="100%" stopColor="#f59e0b" stopOpacity={0.85} />
                </linearGradient>
                <filter id="epDotGlow">
                  <feGaussianBlur stdDeviation="2.5" result="blur" />
                  <feMerge>
                    <feMergeNode in="blur" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
              </defs>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
              <XAxis dataKey="date" tick={{ fontSize: 10 }} className="text-muted-foreground" />
              <YAxis
                domain={[
                  (dataMin: number) =>
                    targetTime != null ? Math.min(dataMin, targetTime) - 0.5 : dataMin,
                  (dataMax: number) =>
                    targetTime != null ? Math.max(dataMax, targetTime) + 0.5 : dataMax,
                ]}
                tick={{ fontSize: 10 }}
                className="text-muted-foreground"
                reversed
                tickFormatter={(v: number) => {
                  const min = Math.floor(v / 60);
                  const sec = Math.floor(v % 60);
                  const cs = Math.round((v % 1) * 100);
                  return min > 0
                    ? `${min}:${String(sec).padStart(2, "0")}`
                    : `${sec}.${String(cs).padStart(2, "0")}`;
                }}
              />
              <Tooltip
                formatter={(value: number, name: string) => {
                  const label = name === "timeOther" ? `${otherPoolLen}m` : `${poolLength}m`;
                  return [formatTimeSeconds(value), label];
                }}
                labelStyle={{ fontSize: 11 }}
                contentStyle={{ borderRadius: 12, fontSize: 12 }}
              />
              {targetTime != null && (
                <ReferenceLine
                  y={targetTime}
                  stroke="#f59e0b"
                  strokeWidth={2}
                  strokeDasharray="8 4"
                  ifOverflow="extendDomain"
                />
              )}
              <Line
                type="monotone"
                dataKey="time"
                name="time"
                stroke="hsl(var(--primary))"
                strokeWidth={2}
                dot={(props: any) => {
                  const { cx: dx, cy: dy, payload, key } = props;
                  if (payload.time == null) return <g key={key} />;
                  const beats = targetTime != null && payload.time <= targetTime;
                  return beats ? (
                    <g key={key} filter="url(#epDotGlow)">
                      <circle cx={dx} cy={dy} r={4.5} fill="#10b981" stroke="#fff" strokeWidth={1.5} />
                    </g>
                  ) : (
                    <circle key={key} cx={dx} cy={dy} r={3} fill="hsl(var(--primary))" stroke="#fff" strokeWidth={1} />
                  );
                }}
                activeDot={{ r: 5 }}
                connectNulls
              />
              {comparePool && (
                <Line
                  type="monotone"
                  dataKey="timeOther"
                  name="timeOther"
                  stroke="hsl(var(--chart-2, 25 95% 53%))"
                  strokeWidth={2}
                  strokeDasharray="4 2"
                  dot={{ r: 2.5 }}
                  activeDot={{ r: 4 }}
                  connectNulls
                />
              )}
            </LineChart>
          </ResponsiveContainer>

          {/* Objective badge */}
          {targetTime != null && (
            <div className="flex items-center justify-center px-2 pt-1 pb-1">
              <div className="flex items-center gap-1.5 rounded-full bg-gradient-to-r from-amber-500/10 via-emerald-500/10 to-amber-500/10 border border-amber-400/25 px-3 py-1">
                <span className="inline-block w-4 h-[2px] rounded-full bg-gradient-to-r from-amber-500 via-emerald-500 to-amber-500" />
                <span className="text-[10px] font-semibold text-amber-600 dark:text-amber-400">Objectif</span>
                <span className="text-[11px] font-bold tabular-nums text-emerald-600 dark:text-emerald-400">
                  {formatTimeSeconds(targetTime)}
                </span>
              </div>
            </div>
          )}

          {comparePool && (
            <div className="flex items-center justify-center gap-4 px-2 pb-1 pt-0.5">
              <span className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                <span className="inline-block w-3 h-0.5 rounded-full bg-primary" />
                {poolLength}m
              </span>
              <span className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                <span className="inline-block w-3 h-0.5 rounded-full" style={{ background: "hsl(var(--chart-2, 25 95% 53%))" }} />
                {otherPoolLen}m
              </span>
            </div>
          )}

          {/* Timeline filter pills */}
          <div className="flex gap-1.5 overflow-x-auto px-2 pb-2 pt-1">
            {TIMELINE_OPTS.map((opt) => (
              <button
                key={opt.label}
                type="button"
                className={`flex-shrink-0 rounded-full px-2.5 py-0.5 text-[10px] font-medium transition-colors ${
                  days === opt.days
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground hover:bg-muted/80"
                }`}
                onClick={() => setDays(opt.days)}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Performance list */}
      {sortedPerfs.length === 0 ? (
        <p className="text-sm text-center text-muted-foreground py-6">
          {iuf ? "Aucune performance trouvée pour cette épreuve." : "IUF FFN manquant."}
        </p>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-border">
          <div className="divide-y divide-border">
            {sortedPerfs.map((perf) => {
              const isBest = perf.id === bestId;
              const beatsObjective = targetTime != null && perf.time_seconds <= targetTime;
              return (
                <div
                  key={perf.id}
                  className={cx(
                    "px-3 py-2.5",
                    beatsObjective ? "bg-emerald-500/5" : isBest ? "bg-primary/5" : undefined,
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 min-w-0">
                      {isBest ? <Trophy className="h-3.5 w-3.5 text-primary shrink-0" /> : null}
                      <span className="text-xs text-muted-foreground tabular-nums">
                        {formatDateShort(perf.competition_date)}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {beatsObjective && <Check className="h-3.5 w-3.5 text-emerald-500" />}
                      <span
                        className={cx(
                          "font-mono tabular-nums text-sm",
                          beatsObjective
                            ? "text-emerald-600 dark:text-emerald-400 font-bold"
                            : isBest
                              ? "text-primary font-bold"
                              : "font-medium",
                        )}
                      >
                        {perf.time_display ?? formatTimeSeconds(perf.time_seconds)}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 mt-0.5 text-xs text-muted-foreground">
                    {perf.ffn_points != null && (
                      <span className="tabular-nums">{String(perf.ffn_points)} pts</span>
                    )}
                    {perf.competition_name && (
                      <span className="truncate">{perf.competition_name}</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ── EventProgressionSheet (thin wrapper) ─────────────────────────

export function EventProgressionSheet({
  open,
  onOpenChange,
  eventCode,
  poolLength,
  iuf,
  targetTime,
  athleteName,
}: EventProgressionSheetProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[90dvh] overflow-y-auto rounded-t-3xl">
        <SheetHeader className="text-left">
          <SheetTitle>{eventLabel(eventCode)}</SheetTitle>
        </SheetHeader>
        <div className="mt-5">
          <EventProgressionContent
            eventCode={eventCode}
            poolLength={poolLength}
            iuf={iuf}
            targetTime={targetTime}
            athleteName={athleteName}
            active={open}
          />
        </div>
      </SheetContent>
    </Sheet>
  );
}
