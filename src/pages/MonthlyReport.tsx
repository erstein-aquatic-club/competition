/**
 * MonthlyReport — page rapport mensuel nageur
 * Route: /#/report/:userId/:month
 */

import { useMemo, useState } from "react";
import { useRoute, useLocation } from "wouter";
import { useAuth } from "@/lib/auth";
import { useMonthlyReport } from "@/hooks/useMonthlyReport";
import { motion } from "framer-motion";
import { fadeIn, staggerChildren, listItem } from "@/lib/animations";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  CalendarCheck,
  Waves,
  Dumbbell,
  Heart,
  Activity,
  Target,
  Award,
  TrendingUp,
  TrendingDown,
  Minus,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const MONTH_NAMES = [
  "Janvier", "Fevrier", "Mars", "Avril", "Mai", "Juin",
  "Juillet", "Aout", "Septembre", "Octobre", "Novembre", "Decembre",
];

function formatMonthLabel(month: string): string {
  const [year, m] = month.split("-").map(Number);
  return `${MONTH_NAMES[m - 1]} ${year}`;
}

function currentMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function shiftMonth(month: string, delta: number): string {
  const [year, m] = month.split("-").map(Number);
  const d = new Date(year, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function formatTonnage(kg: number): string {
  if (kg >= 1000) return `${(kg / 1000).toFixed(1)} t`;
  return `${kg} kg`;
}

function formatMeters(m: number): string {
  if (m >= 1000) return `${(m / 1000).toFixed(1)} km`;
  return `${m} m`;
}

// Stroke labels
const STROKE_LABELS: Record<string, string> = {
  NL: "Nage libre",
  DOS: "Dos",
  BR: "Brasse",
  PAP: "Papillon",
  QN: "4 nages",
  EDU: "Educatif",
  MIXTE: "Mixte",
};

const STROKE_COLORS: Record<string, string> = {
  NL: "bg-blue-500",
  DOS: "bg-emerald-500",
  BR: "bg-amber-500",
  PAP: "bg-rose-500",
  QN: "bg-violet-500",
  EDU: "bg-cyan-500",
  MIXTE: "bg-gray-400",
};

// Badge display names
const BADGE_LABELS: Record<string, string> = {
  first_session: "Premiere seance",
  streak_7: "Serie de 7 jours",
  streak_30: "Serie de 30 jours",
  tonnage_1000: "1 tonne soulevee",
  tonnage_10000: "10 tonnes soulevees",
  pr_first: "Premier record",
  pr_10: "10 records",
  wellness_streak_7: "Bien-etre 7 jours",
  swim_100k: "100 km nages",
};

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function ReportCard({
  icon: Icon,
  iconColor,
  title,
  children,
}: {
  icon: typeof CalendarCheck;
  iconColor: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <motion.div
      variants={listItem}
      className="rounded-2xl border border-border bg-card p-4 space-y-3"
    >
      <div className="flex items-center gap-2">
        <Icon className={`h-4 w-4 ${iconColor}`} />
        <h3 className="text-sm font-semibold">{title}</h3>
      </div>
      {children}
    </motion.div>
  );
}

function DeltaBadge({ value, suffix = "" }: { value: number; suffix?: string }) {
  if (value === 0) return (
    <span className="inline-flex items-center gap-0.5 text-xs text-muted-foreground">
      <Minus className="h-3 w-3" /> =
    </span>
  );
  const positive = value > 0;
  return (
    <span className={`inline-flex items-center gap-0.5 text-xs font-medium ${positive ? "text-emerald-600" : "text-rose-600"}`}>
      {positive ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
      {positive ? "+" : ""}{value}{suffix}
    </span>
  );
}

function BigKPI({ value, label, unit }: { value: string | number; label: string; unit?: string }) {
  return (
    <div className="text-center">
      <p className="text-3xl font-bold tabular-nums">
        {value}
        {unit ? <span className="text-lg font-normal text-muted-foreground ml-0.5">{unit}</span> : null}
      </p>
      <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
    </div>
  );
}

function MiniBar({
  items,
  total,
}: {
  items: Array<{ key: string; value: number; color: string; label: string }>;
  total: number;
}) {
  if (total <= 0) return null;
  return (
    <div className="space-y-2">
      <div className="flex h-3 w-full overflow-hidden rounded-full bg-muted">
        {items.map((item) => {
          const pct = (item.value / total) * 100;
          if (pct < 1) return null;
          return (
            <div
              key={item.key}
              className={`${item.color} transition-all`}
              style={{ width: `${pct}%` }}
              title={`${item.label}: ${formatMeters(item.value)}`}
            />
          );
        })}
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-1">
        {items
          .filter((i) => i.value > 0)
          .map((item) => (
            <span key={item.key} className="flex items-center gap-1 text-[11px] text-muted-foreground">
              <span className={`inline-block h-2 w-2 rounded-full ${item.color}`} />
              {item.label}: {formatMeters(item.value)}
            </span>
          ))}
      </div>
    </div>
  );
}

function Sparkline({ values, height = 40 }: { values: number[]; height?: number }) {
  if (values.length === 0) return null;
  const max = Math.max(...values, 100);
  const min = Math.min(...values, 0);
  const range = max - min || 1;
  const w = 200;
  const points = values
    .map((v, i) => {
      const x = (i / (values.length - 1 || 1)) * w;
      const y = height - ((v - min) / range) * (height - 4);
      return `${x},${y}`;
    })
    .join(" ");

  return (
    <svg viewBox={`0 0 ${w} ${height}`} className="w-full" style={{ height }}>
      <polyline
        points={points}
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        className="text-primary"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Red zone line at 40 */}
      <line
        x1="0"
        y1={height - ((40 - min) / range) * (height - 4)}
        x2={w}
        y2={height - ((40 - min) / range) * (height - 4)}
        stroke="currentColor"
        strokeWidth="1"
        strokeDasharray="4 4"
        className="text-rose-400"
        opacity={0.5}
      />
    </svg>
  );
}

function AcwrBadge({ value }: { value: number }) {
  let color = "bg-amber-100 text-amber-800";
  let label = "Attention";
  if (value >= 0.8 && value <= 1.3) {
    color = "bg-emerald-100 text-emerald-800";
    label = "Optimal";
  } else if (value > 1.5 || value < 0.5) {
    color = "bg-rose-100 text-rose-800";
    label = "Danger";
  }
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${color}`}>
      {value.toFixed(2)} - {label}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function MonthlyReport() {
  const [, params] = useRoute("/report/:userId/:month");
  const [, navigate] = useLocation();
  const authUserId = useAuth((s) => s.userId);

  const userId = params?.userId ? Number(params.userId) : (authUserId ?? 0);
  const [month, setMonth] = useState(() => params?.month ?? currentMonth());

  const report = useMonthlyReport({ userId, month });

  const canGoNext = month < currentMonth();

  const handlePrev = () => setMonth(shiftMonth(month, -1));
  const handleNext = () => {
    const next = shiftMonth(month, 1);
    if (next <= currentMonth()) setMonth(next);
  };

  const strokeItems = useMemo(() => {
    return Object.entries(report.swimByStroke)
      .map(([key, value]) => ({
        key,
        value,
        color: STROKE_COLORS[key] ?? "bg-gray-400",
        label: STROKE_LABELS[key] ?? key,
      }))
      .sort((a, b) => b.value - a.value);
  }, [report.swimByStroke]);

  if (report.isLoading) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-6 space-y-4">
        <div className="flex items-center gap-3">
          <Skeleton className="h-9 w-9 rounded-xl" />
          <Skeleton className="h-6 w-48" />
        </div>
        <Skeleton className="h-10 w-full rounded-xl" />
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-32 w-full rounded-2xl" />
        ))}
      </div>
    );
  }

  return (
    <motion.div
      className="mx-auto max-w-2xl px-4 py-6 space-y-5"
      variants={fadeIn}
      initial="hidden"
      animate="visible"
    >
      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => navigate("/profile")}
          className="h-9 w-9 rounded-xl border border-border bg-card flex items-center justify-center hover:bg-muted transition"
          aria-label="Retour"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div className="min-w-0 flex-1">
          <h1 className="text-lg font-bold truncate">
            Rapport mensuel
          </h1>
          {report.swimmerName && (
            <p className="text-xs text-muted-foreground truncate">{report.swimmerName}</p>
          )}
        </div>
      </div>

      {/* Month selector */}
      <div className="flex items-center justify-center gap-2">
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handlePrev}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <span className="text-sm font-semibold min-w-[160px] text-center">
          {formatMonthLabel(month)}
        </span>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={handleNext}
          disabled={!canGoNext}
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      {/* Cards grid */}
      <motion.div
        className="grid grid-cols-1 sm:grid-cols-2 gap-4"
        variants={staggerChildren}
        initial="hidden"
        animate="visible"
      >
        {/* Attendance */}
        <ReportCard icon={CalendarCheck} iconColor="text-blue-500" title="Presence">
          <div className="flex items-end justify-between">
            <BigKPI value={report.sessionsCount} label="seances" />
            <DeltaBadge value={report.attendanceDelta} suffix=" vs mois prec." />
          </div>
        </ReportCard>

        {/* Swimming */}
        <ReportCard icon={Waves} iconColor="text-cyan-500" title="Natation">
          <BigKPI
            value={report.swimTotalMeters >= 1000
              ? (report.swimTotalMeters / 1000).toFixed(1)
              : report.swimTotalMeters}
            label="volume total"
            unit={report.swimTotalMeters >= 1000 ? "km" : "m"}
          />
          <MiniBar items={strokeItems} total={report.swimTotalMeters} />
        </ReportCard>

        {/* Strength */}
        <ReportCard icon={Dumbbell} iconColor="text-orange-500" title="Musculation">
          <div className="grid grid-cols-2 gap-3">
            <BigKPI value={report.strengthSessionCount} label="seances" />
            <BigKPI value={formatTonnage(report.totalTonnage)} label="tonnage" />
          </div>
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>
              {report.prsThisMonth > 0
                ? `${report.prsThisMonth} record${report.prsThisMonth > 1 ? "s" : ""} perso`
                : "Aucun nouveau RP"}
            </span>
            {report.topExercise && (
              <span className="truncate ml-2">Top: {report.topExercise}</span>
            )}
          </div>
        </ReportCard>

        {/* Wellness */}
        <ReportCard icon={Heart} iconColor="text-rose-500" title="Bien-etre">
          {report.avgReadiness != null ? (
            <>
              <BigKPI value={report.avgReadiness} label="readiness moyen" unit="%" />
              <Sparkline values={report.readinessTrend} />
              <p className="text-xs text-muted-foreground text-center">
                {report.daysInRedZone > 0
                  ? `${report.daysInRedZone} jour${report.daysInRedZone > 1 ? "s" : ""} en zone rouge (<40%)`
                  : "Aucun jour en zone rouge"}
              </p>
            </>
          ) : (
            <p className="text-xs text-muted-foreground text-center py-4">
              Aucune donnee bien-etre ce mois-ci
            </p>
          )}
        </ReportCard>

        {/* Training load */}
        <ReportCard icon={Activity} iconColor="text-violet-500" title="Charge d'entrainement">
          {report.avgAcwr != null ? (
            <>
              <div className="flex items-center justify-between">
                <BigKPI value={report.avgAcwr.toFixed(2)} label="ACWR moyen" />
                <AcwrBadge value={report.avgAcwr} />
              </div>
              <p className="text-xs text-muted-foreground text-center">
                {report.daysInOptimalZone} jour{report.daysInOptimalZone > 1 ? "s" : ""} en zone optimale (0.8-1.3)
              </p>
            </>
          ) : (
            <p className="text-xs text-muted-foreground text-center py-4">
              Donnees insuffisantes pour le calcul de charge
            </p>
          )}
        </ReportCard>

        {/* Objectives */}
        <ReportCard icon={Target} iconColor="text-amber-500" title="Objectifs">
          {report.objectivesTotal > 0 ? (
            <BigKPI value={report.objectivesTotal} label="objectifs actifs" />
          ) : (
            <p className="text-xs text-muted-foreground text-center py-4">
              Aucun objectif defini
            </p>
          )}
        </ReportCard>

        {/* Badges */}
        {report.badgesUnlockedThisMonth.length > 0 && (
          <ReportCard icon={Award} iconColor="text-yellow-500" title="Badges debloques">
            <div className="flex flex-wrap gap-2">
              {report.badgesUnlockedThisMonth.map((key) => (
                <span
                  key={key}
                  className="inline-flex items-center gap-1 rounded-full bg-yellow-100 px-2.5 py-1 text-xs font-medium text-yellow-800"
                >
                  <Award className="h-3 w-3" />
                  {BADGE_LABELS[key] ?? key}
                </span>
              ))}
            </div>
          </ReportCard>
        )}
      </motion.div>
    </motion.div>
  );
}
