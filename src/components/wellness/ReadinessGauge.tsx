/**
 * ReadinessGauge — Circular SVG gauge showing readiness score (0-100).
 *
 * Colors: green >70, amber 40-70, red <40 using status CSS variables.
 * Same ProgressRing pattern as ObjectiveCard.tsx.
 */

interface ReadinessGaugeProps {
  score: number; // 0-100
  size?: number; // default 80
  showLabel?: boolean; // default true
}

function gaugeColor(score: number): string {
  if (score > 70) return "hsl(var(--status-success))";
  if (score >= 40) return "hsl(var(--status-warning))";
  return "hsl(var(--status-error))";
}

export function ReadinessGauge({ score, size = 80, showLabel = true }: ReadinessGaugeProps) {
  const strokeWidth = size >= 60 ? 5 : 3;
  const r = (size - strokeWidth) / 2;
  const circ = 2 * Math.PI * r;
  const pct = Math.min(Math.max(score, 0), 100);
  const offset = circ - (pct / 100) * circ;
  const color = gaugeColor(pct);

  // Font size scales with ring size
  const fontSize = size >= 60 ? size * 0.28 : size * 0.32;

  return (
    <div className="flex flex-col items-center gap-1">
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="shrink-0"
        aria-label={`Forme ${pct}%`}
      >
        {/* Background ring */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          className="text-muted-foreground/15"
        />
        {/* Progress arc */}
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
        {/* Score text */}
        <text
          x={size / 2}
          y={size / 2}
          textAnchor="middle"
          dominantBaseline="central"
          fill={color}
          fontSize={fontSize}
          fontWeight="700"
          fontFamily="var(--font-display)"
        >
          {pct}
        </text>
      </svg>
      {showLabel && (
        <span className="text-[10px] font-medium text-muted-foreground">
          Forme
        </span>
      )}
    </div>
  );
}
