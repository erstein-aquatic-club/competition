/**
 * AssessmentRomIllustration — animated joint-angle arc for each bilan axis.
 *
 * Angular axes (shoulder, t-spine, hip, hip-hinge): SVG joint diagram with
 * a color-filled arc that sweeps from 0° to the score-mapped ROM angle.
 * Qualitative axes (scapula, trunk): a segmented stability bar.
 *
 * CSS-only animation (stroke-dashoffset sweep). Re-mounts on score change
 * via key= so the animation replays each time the coach adjusts the score.
 */
import { useMemo } from "react";
import type { MobilityScoreKey, MovementScoreKey } from "./assessmentScores";

type AxisKey = MobilityScoreKey | MovementScoreKey;

const SCORE_COLORS: Record<number, string> = {
  [-1]: "#94a3b8",
  0: "#f43f5e",
  1: "#f59e0b",
  2: "#06b6d4",
  3: "#10b981",
};

interface AngularConfig {
  kind: "angular";
  // ROM angle in degrees achieved at each score level 0-3
  angles: [number, number, number, number];
  // Start arm direction (SVG coords: right=0°, down=90°)
  fixedDeg: number;
  // Whether the arc sweeps clockwise from fixedDeg
  cw: boolean;
}

interface StabilityConfig {
  kind: "stability";
}

type AxisConfig = AngularConfig | StabilityConfig;

const AXIS_CONFIG: Partial<Record<AxisKey, AxisConfig>> = {
  shoulder_flexion: { kind: "angular", angles: [28, 112, 158, 180], fixedDeg: 90, cw: false },
  t_spine:          { kind: "angular", angles: [15,  37,  47,  55],  fixedDeg: 90, cw: true  },
  hip:              { kind: "angular", angles: [30,  70,  95, 120],  fixedDeg: 90, cw: true  },
  hip_hinge:        { kind: "angular", angles: [20,  50,  70,  90],  fixedDeg:  0, cw: true  },
  scapula_control:       { kind: "stability" },
  trunk_neck_alignment:  { kind: "stability" },
};

// ── SVG math helpers ──────────────────────────────────────────────────────────

function toRad(deg: number) {
  return (deg * Math.PI) / 180;
}

function polar(cx: number, cy: number, r: number, deg: number) {
  return { x: cx + r * Math.cos(toRad(deg)), y: cy + r * Math.sin(toRad(deg)) };
}

function arcPath(cx: number, cy: number, R: number, startDeg: number, angleDeg: number, cw: boolean): string {
  const { x: sx, y: sy } = polar(cx, cy, R, startDeg);
  const endDeg = cw ? startDeg + angleDeg : startDeg - angleDeg;
  const { x: ex, y: ey } = polar(cx, cy, R, endDeg);
  const large = angleDeg > 180 ? 1 : 0;
  const sweep = cw ? 1 : 0;
  return `M ${sx.toFixed(2)} ${sy.toFixed(2)} A ${R} ${R} 0 ${large} ${sweep} ${ex.toFixed(2)} ${ey.toFixed(2)}`;
}

function arcLen(R: number, angleDeg: number) {
  return (angleDeg * Math.PI * R) / 180;
}

// ── Stability bar (qualitative axes) ─────────────────────────────────────────

function StabilityBar({ score }: { score: number }) {
  const color = SCORE_COLORS[score] ?? SCORE_COLORS[-1];
  return (
    <div className="flex flex-col items-center gap-1.5 py-1">
      <div className="flex items-center gap-1">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className="h-2.5 w-7 rounded-sm"
            style={{
              backgroundColor: score >= 0 && i <= score ? color : "#e2e8f0",
              transition: `background-color 0.35s ease ${i * 90}ms`,
            }}
          />
        ))}
      </div>
      <span className="text-[10px] font-bold tabular-nums" style={{ color }}>
        {score < 0 ? "—" : `${score} / 3`}
      </span>
    </div>
  );
}

// ── Angular joint diagram ─────────────────────────────────────────────────────

const CX = 40, CY = 44, R_ARC = 26, R_ARM = 34;

function AngularDiagram({ axisKey, score, config }: { axisKey: AxisKey; score: number; config: AngularConfig }) {
  const color = SCORE_COLORS[score] ?? SCORE_COLORS[-1];

  const derived = useMemo(() => {
    if (score < 0) return null;
    const angleDeg = config.angles[score as 0 | 1 | 2 | 3];
    const movingDeg = config.cw ? config.fixedDeg + angleDeg : config.fixedDeg - angleDeg;
    const fixedEnd = polar(CX, CY, R_ARM, config.fixedDeg);
    const movingEnd = polar(CX, CY, R_ARM, movingDeg);
    const path = arcPath(CX, CY, R_ARC, config.fixedDeg, angleDeg, config.cw);
    const len = arcLen(R_ARC, angleDeg);
    const bgPath = arcPath(CX, CY, R_ARC, config.fixedDeg, config.angles[3], config.cw);
    return { angleDeg, fixedEnd, movingEnd, path, len, bgPath };
  }, [score, config]);

  // Unique animation name per axis to avoid cross-component conflicts
  const animName = `rom-${axisKey.replace(/_/g, "-")}`;

  return (
    <svg
      key={score}
      viewBox="0 0 80 80"
      width={76}
      height={76}
      className="shrink-0 overflow-visible"
      aria-hidden
    >
      {derived && (
        <style>{`
          @keyframes ${animName} {
            from { stroke-dashoffset: ${derived.len.toFixed(2)}; }
            to   { stroke-dashoffset: 0; }
          }
          @keyframes ${animName}-appear {
            from { opacity: 0; }
            to   { opacity: 1; }
          }
        `}</style>
      )}

      {/* Ghost arc — full extent at score 3, shows potential */}
      {derived && (
        <path d={derived.bgPath} fill="none" stroke="#e2e8f0" strokeWidth={3} strokeLinecap="round" />
      )}

      {/* Fixed reference arm */}
      {derived && (
        <line
          x1={CX} y1={CY}
          x2={derived.fixedEnd.x} y2={derived.fixedEnd.y}
          stroke="#cbd5e1"
          strokeWidth={1.5}
          strokeLinecap="round"
        />
      )}

      {/* Animated arc */}
      {derived && (
        <path
          d={derived.path}
          fill="none"
          stroke={color}
          strokeWidth={4}
          strokeLinecap="round"
          strokeDasharray={derived.len.toFixed(2)}
          strokeDashoffset={derived.len.toFixed(2)}
          style={{ animation: `${animName} 0.55s cubic-bezier(0.34, 1.4, 0.64, 1) 0.08s forwards` }}
        />
      )}

      {/* Moving arm — appears after arc sweep */}
      {derived && (
        <line
          x1={CX} y1={CY}
          x2={derived.movingEnd.x} y2={derived.movingEnd.y}
          stroke={color}
          strokeWidth={2}
          strokeLinecap="round"
          style={{ opacity: 0, animation: `${animName}-appear 0.15s ease-out 0.62s forwards` }}
        />
      )}

      {/* Center pivot */}
      <circle cx={CX} cy={CY} r={3.5} fill={derived ? color : "#94a3b8"} />

      {/* Angle readout */}
      {derived && (
        <text
          x={CX} y={76}
          textAnchor="middle"
          fontSize={9}
          fontWeight={700}
          fill={color}
          fontFamily="ui-monospace, monospace"
        >
          {derived.angleDeg}°
        </text>
      )}

      {/* Unset placeholder */}
      {!derived && (
        <text x={CX} y={CY + 5} textAnchor="middle" fontSize={11} fill="#94a3b8" fontFamily="monospace">—</text>
      )}
    </svg>
  );
}

// ── Public component ──────────────────────────────────────────────────────────

export function AssessmentRomIllustration({ axisKey, score }: { axisKey: AxisKey; score: number }) {
  const config = AXIS_CONFIG[axisKey];

  if (!config || config.kind === "stability") {
    return <StabilityBar score={score} />;
  }

  return <AngularDiagram axisKey={axisKey} score={score} config={config} />;
}
