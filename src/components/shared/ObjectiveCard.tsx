/**
 * Shared ObjectiveCard — card-based grid design.
 *
 * Top color bar (stroke), SVG progress ring colored by progress %,
 * horizontal layout: ring left, times right.
 *
 * Used across: SwimmerObjectivesView, SwimmerObjectivesTab,
 * CoachObjectivesScreen, AthleteInterviewsSection, SwimmerInterviewsTab.
 */

import React, { type ReactNode } from "react";
import { Calculator, Pencil } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { Objective } from "@/lib/api";
import {
  eventLabel,
  formatTime,
  strokeFromCode,
  findBestPerformance,
  computeProgress,
  STROKE_COLORS,
} from "@/lib/objectiveHelpers";
import {
  parseObjectiveForPace,
  type ParsedObjectiveTarget,
} from "@/lib/objective-pace-link";
import { Surface } from "@/components/shared/Surface";

// ── Stroke colors (top border) ──────────────────────────────────

const STROKE_BORDER_TOP: Record<string, string> = {
  NL: "border-t-stroke-nl",
  DOS: "border-t-stroke-dos",
  BR: "border-t-stroke-br",
  PAP: "border-t-stroke-pap",
  QN: "border-t-stroke-qn",
};

// ── Progress-based ring colors (same palette as progress bar) ───

function progressRingColor(pct: number | null): string {
  if (pct == null) return "hsl(var(--muted-foreground))";
  if (pct >= 100) return "hsl(var(--status-success))";
  if (pct >= 75) return "hsl(var(--intensity-1))";
  if (pct >= 50) return "hsl(var(--status-warning))";
  if (pct >= 25) return "hsl(var(--intensity-4))";
  return "hsl(var(--status-error))";
}

const RING_DEFAULT = "hsl(var(--muted-foreground))";

// ── Helpers ─────────────────────────────────────────────────────

/** "il y a Xj" for recent, "il y a Xm" for older. */
function timeAgo(iso: string): string {
  const d = new Date(iso + "T00:00:00");
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const days = Math.round((now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));
  if (days <= 0) return "aujourd'hui";
  if (days === 1) return "hier";
  if (days < 60) return `il y a ${days}j`;
  const months = Math.round(days / 30);
  return `il y a ${months}m`;
}

// ── Progress Ring (SVG) ─────────────────────────────────────────

function ProgressRing({
  size = 40,
  strokeWidth = 3,
  progress,
  color,
}: {
  size?: number;
  strokeWidth?: number;
  progress: number | null;
  color: string;
}) {
  const r = (size - strokeWidth) / 2;
  const circ = 2 * Math.PI * r;
  const pct = progress != null ? Math.min(Math.max(progress, 0), 100) : 0;
  const offset = circ - (pct / 100) * circ;

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      className="shrink-0"
      aria-hidden
    >
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        className="text-muted-foreground/10"
      />
      {progress != null && (
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeDasharray={circ}
          strokeDashoffset={offset}
          strokeLinecap="round"
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          className="transition-all duration-700"
        />
      )}
      {progress == null && (
        <circle cx={size / 2} cy={size / 2} r={3} fill={color} />
      )}
    </svg>
  );
}

// ── Grid wrapper ────────────────────────────────────────────────

export function ObjectiveGrid({ children }: { children: ReactNode }) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {children}
    </div>
  );
}

// ── Types ────────────────────────────────────────────────────────

type Performance = {
  event_code: string;
  pool_length?: number | null;
  time_seconds?: number | null;
  competition_date?: string | null;
};

export type ObjectiveCardProps = {
  objective: Objective;
  performances?: Performance[];
  onClick?: () => void;
  onEdit?: () => void;
  compact?: boolean;
  showCoachBadge?: boolean;
  /** When "coach", a "→ Allures" button is rendered to prefill the pace calculator. Defaults to "swimmer" (button hidden). */
  context?: "coach" | "swimmer";
  /** Numeric account id of the swimmer; required to enable the pace link button. */
  swimmerAccountId?: number;
  /** Callback fired when the pace link button is clicked with parsed target shape and target time in ms. */
  onPaceLink?: (
    parsed: ParsedObjectiveTarget,
    swimmerAccountId: number,
    target_time_ms: number,
  ) => void;
};

// ── Component ───────────────────────────────────────────────────

export function ObjectiveCard({
  objective,
  performances = [],
  onClick,
  onEdit,
  compact = false,
  showCoachBadge = false,
  context = "swimmer",
  swimmerAccountId,
  onPaceLink,
}: ObjectiveCardProps) {
  const hasChrono = !!objective.event_code;
  const stroke = hasChrono ? strokeFromCode(objective.event_code!) : null;
  const topBorder = stroke ? STROKE_BORDER_TOP[stroke] ?? "" : "";
  const leftBorder = stroke ? STROKE_COLORS[stroke] ?? "" : "";

  const bestPerf = hasChrono
    ? findBestPerformance(performances, objective.event_code!, objective.pool_length)
    : null;

  let delta: number | null = null;
  let progressPct: number | null = null;
  if (bestPerf && objective.target_time_seconds != null && objective.event_code) {
    delta = bestPerf.time - objective.target_time_seconds;
    progressPct = computeProgress(bestPerf.time, objective.target_time_seconds, objective.event_code);
  }

  const ringColor = progressRingColor(progressPct);

  const Tag = onClick ? "button" : "div";

  // ── Compact (embedded in interviews — single row, left border) ──
  if (compact) {
    return (
      <Tag
        type={onClick ? "button" : undefined}
        className={[
          "w-full text-left flex items-center gap-2.5 rounded-lg border-l-4 px-2.5 py-1.5",
          leftBorder || "border-l-muted-foreground/20",
          "bg-card transition-colors hover:bg-muted/30 active:scale-[0.995]",
        ].join(" ")}
        onClick={onClick}
      >
        <ProgressRing size={22} strokeWidth={2.5} progress={progressPct} color={ringColor} />
        <div className="flex-1 min-w-0 flex items-baseline gap-1.5">
          <span className="text-xs font-semibold truncate">
            {hasChrono ? eventLabel(objective.event_code!) : (objective.text ?? "—")}
          </span>
          {hasChrono && objective.pool_length && (
            <span className="text-[10px] text-muted-foreground/50 shrink-0">{objective.pool_length}m</span>
          )}
        </div>
        {objective.target_time_seconds != null && (
          <span className="text-[11px] font-mono tabular-nums text-primary shrink-0">
            {formatTime(objective.target_time_seconds)}
          </span>
        )}
        {delta != null && (
          <span className={`text-[10px] font-mono tabular-nums shrink-0 ${delta <= 0 ? "text-status-success font-semibold" : "text-muted-foreground/60"}`}>
            {delta <= 0 ? "OK" : `+${delta.toFixed(2)}`}
          </span>
        )}
        {showCoachBadge && (
          <Badge variant="secondary" className="text-[8px] px-1 py-0 leading-tight shrink-0">C</Badge>
        )}
      </Tag>
    );
  }

  // ── Card (for grid layout) ──
  return (
    <Surface
      variant="solid"
      radius="sm"
      interactive
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      className={[
        "w-full text-left overflow-hidden shadow-sm hover:shadow-md",
        topBorder ? `border-t-[3px] ${topBorder}` : "",
        "transition-all",
      ].join(" ")}
      onClick={onClick}
    >
      <div className="px-3 pt-3 pb-2.5 space-y-2">
        {/* Header: event name + badge + edit */}
        <div className="flex items-start justify-between gap-1">
          <div className="min-w-0">
            <p className="text-sm font-semibold truncate leading-tight">
              {hasChrono ? eventLabel(objective.event_code!) : "Objectif"}
            </p>
            {hasChrono && objective.pool_length && (
              <p className="text-[10px] text-muted-foreground/50 mt-0.5">{objective.pool_length}m</p>
            )}
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {showCoachBadge && (
              <Badge variant="secondary" className="text-[9px] px-1 py-0 leading-tight">
                Coach
              </Badge>
            )}
            {onEdit && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onEdit(); }}
                className="p-0.5 rounded text-muted-foreground/30 hover:text-muted-foreground transition-colors"
                aria-label="Modifier l'objectif"
              >
                <Pencil className="h-3 w-3" />
              </button>
            )}
          </div>
        </div>

        {/* Text objective */}
        {objective.text && (
          <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">{objective.text}</p>
        )}

        {/* Ring (left) + times (right) */}
        {objective.target_time_seconds != null && (
          <div className="flex items-center gap-2.5">
            <ProgressRing size={40} strokeWidth={3} progress={progressPct} color={ringColor} />
            <div className="flex-1 min-w-0 space-y-0.5">
              {/* Target time */}
              <p className="text-sm font-mono tabular-nums text-primary font-semibold leading-none">
                {formatTime(objective.target_time_seconds)}
              </p>
              {/* Current time + date */}
              {bestPerf && (
                <p className="text-[10px] font-mono tabular-nums text-muted-foreground/50 leading-none">
                  {formatTime(bestPerf.time)}
                  {bestPerf.date && (
                    <span className="text-muted-foreground/30 font-sans ml-1">
                      {timeAgo(bestPerf.date)}
                    </span>
                  )}
                </p>
              )}
              {/* Delta */}
              {delta != null && (
                <p className={`text-xs font-mono tabular-nums font-semibold leading-none ${delta <= 0 ? "text-status-success" : "text-status-warning"}`}>
                  {delta <= 0 ? "Atteint" : `+${delta.toFixed(2)}s`}
                </p>
              )}
              {/* No perf */}
              {!bestPerf && performances.length > 0 && (
                <p className="text-[10px] text-muted-foreground/40 italic">Pas encore de temps</p>
              )}
            </div>
          </div>
        )}

        {/* Text-only: ring only if no chrono */}
        {!hasChrono && (
          <div className="flex items-center gap-2.5">
            <ProgressRing size={40} strokeWidth={3} progress={null} color={RING_DEFAULT} />
            <p className="text-[10px] text-muted-foreground/40 italic">Objectif qualitatif</p>
          </div>
        )}

        {/* Pace link button (coach context only) */}
        {context === "coach" && (() => {
          const parsed = parseObjectiveForPace(objective.event_code, objective.pool_length);
          const canCalculate =
            !!parsed && objective.target_time_seconds != null && swimmerAccountId != null;
          const tooltipText = !objective.event_code
            ? "Code épreuve manquant"
            : !parsed
              ? `Code épreuve "${objective.event_code}" non reconnu`
              : objective.target_time_seconds == null
                ? "Temps cible manquant"
                : swimmerAccountId == null
                  ? "Nageur sans compte (manuel) — non lié aux allures"
                  : "Pré-remplir le calculateur d'allures";
          return (
            <button
              type="button"
              disabled={!canCalculate}
              title={tooltipText}
              onClick={(e) => {
                e.stopPropagation();
                if (
                  canCalculate &&
                  parsed &&
                  onPaceLink &&
                  swimmerAccountId != null &&
                  objective.target_time_seconds != null
                ) {
                  onPaceLink(
                    parsed,
                    swimmerAccountId,
                    Math.round(objective.target_time_seconds * 1000),
                  );
                }
              }}
              className={[
                "mt-2 inline-flex h-9 items-center gap-1.5 rounded-md border border-input bg-background px-3 text-xs font-medium",
                canCalculate ? "hover:bg-muted" : "cursor-not-allowed opacity-50",
              ].join(" ")}
            >
              <Calculator className="h-3.5 w-3.5" />
              → Allures
            </button>
          );
        })()}
      </div>
    </Surface>
  );
}

export default ObjectiveCard;
