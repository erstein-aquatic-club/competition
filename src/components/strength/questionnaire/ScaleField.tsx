/**
 * ScaleField — 1-N pill scale for the Strength Questionnaire (§285).
 *
 * Used for the mobility-feel (1-5) and the three psychology scales
 * (1-5). Mirrors the visual language of WellnessForm's rated items:
 * row of equal-width pills, low/high labels underneath.
 *
 * Unlike WellnessForm this is a neutral scale (no green/red intensity
 * tokens) — the questionnaire is self-report, not a readiness score.
 */
import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

export interface ScaleFieldProps {
  /** Section/question label. */
  label: string;
  /** Optional leading icon. */
  icon?: LucideIcon;
  /** Current value (0 = not yet answered). */
  value: number;
  onChange: (value: number) => void;
  /** Number of steps — default 5. */
  steps?: number;
  /** Caption under the low end. */
  labelLow: string;
  /** Caption under the high end. */
  labelHigh: string;
}

export function ScaleField({
  label,
  icon: Icon,
  value,
  onChange,
  steps = 5,
  labelLow,
  labelHigh,
}: ScaleFieldProps) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        {Icon && (
          <Icon className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
        )}
        <span className="text-sm font-semibold text-foreground">{label}</span>
      </div>
      <div className="flex gap-1.5" role="radiogroup" aria-label={label}>
        {Array.from({ length: steps }, (_, i) => i + 1).map((n) => {
          const active = value === n;
          return (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={active}
              aria-label={`${label} : ${n}`}
              onClick={() => onChange(n)}
              className={cn(
                "h-11 flex-1 rounded-xl border text-sm font-bold transition-all active:scale-95",
                active
                  ? "border-primary bg-primary text-primary-foreground shadow-sm"
                  : "border-border bg-muted text-muted-foreground hover:bg-muted/70",
              )}
            >
              {n}
            </button>
          );
        })}
      </div>
      <div className="flex justify-between px-0.5">
        <span className="text-[10px] text-muted-foreground">{labelLow}</span>
        <span className="text-[10px] text-muted-foreground">{labelHigh}</span>
      </div>
    </div>
  );
}
