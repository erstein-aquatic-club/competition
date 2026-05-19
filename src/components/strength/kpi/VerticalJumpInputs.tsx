/**
 * VerticalJumpInputs — measurement inputs for the détente verticale KPI.
 *
 * Unlike the 4 other KPIs (a single value per attempt), the vertical jump is
 * a POWER measurement: it needs the athlete's body weight plus the flight
 * time of each jump. Weight + best flight time → height (g·t²/8) → peak power
 * (Sayers) → relative power (W/kg), which is the value actually scored.
 *
 * Cf. §293 — docs/plans/bilan-muscu-barème-puissance-detente.md.
 */
import { useMemo } from "react";
import { parseAttempts, parsePositiveNumber } from "@/lib/strength/kpiMeasurement";
import { verticalJumpResult } from "@/lib/strength/jumpPower";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { Scale, Zap } from "lucide-react";

export function VerticalJumpInputs({
  flightTimesRaw,
  weightRaw,
  onChangeFlightTime,
  onChangeWeight,
}: {
  /** Raw text per flight-time attempt slot. */
  flightTimesRaw: string[];
  /** Raw text for the body-weight field. */
  weightRaw: string;
  onChangeFlightTime: (index: number, value: string) => void;
  onChangeWeight: (value: string) => void;
}) {
  const weightKg = parsePositiveNumber(weightRaw);
  const flightTimes = useMemo(
    () => parseAttempts(flightTimesRaw),
    [flightTimesRaw],
  );

  // Power can only be computed once we have a weight AND ≥ 1 flight time.
  const result = useMemo(() => {
    if (weightKg == null || flightTimes.length === 0) return null;
    return verticalJumpResult(weightKg, flightTimes);
  }, [weightKg, flightTimes]);

  const bestFlightTime = flightTimes.length > 0 ? Math.max(...flightTimes) : null;

  return (
    <div className="space-y-5">
      {/* Body weight — a precondition of the power computation */}
      <div>
        <div className="mb-2 flex items-center justify-between">
          <Label
            htmlFor="vj-weight"
            className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground"
          >
            Poids du nageur
          </Label>
          <span className="text-[11px] text-muted-foreground">
            Entre dans le calcul
          </span>
        </div>
        <div className="relative">
          <Scale className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            id="vj-weight"
            inputMode="decimal"
            type="text"
            value={weightRaw}
            onChange={(e) => onChangeWeight(e.target.value)}
            placeholder="—"
            aria-label="Poids du nageur en kilogrammes"
            className="h-14 pl-10 pr-9 text-lg font-bold tabular-nums"
          />
          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-muted-foreground">
            kg
          </span>
        </div>
      </div>

      {/* Flight-time attempts */}
      <div>
        <div className="mb-2 flex items-center justify-between">
          <Label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Temps de vol ({flightTimesRaw.length} essais)
          </Label>
          <span className="text-[11px] text-muted-foreground">
            Meilleur retenu
          </span>
        </div>
        <div className="grid grid-cols-3 gap-2.5">
          {flightTimesRaw.map((value, i) => {
            const numeric = Number(String(value).replace(",", "."));
            const isBest =
              bestFlightTime != null &&
              Number.isFinite(numeric) &&
              numeric > 0 &&
              numeric === bestFlightTime;
            return (
              <div key={i}>
                <span className="mb-1 block text-center text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Essai {i + 1}
                </span>
                <div className="relative">
                  <Input
                    inputMode="decimal"
                    type="text"
                    value={value}
                    onChange={(e) => onChangeFlightTime(i, e.target.value)}
                    placeholder="—"
                    aria-label={`Temps de vol — essai ${i + 1} en secondes`}
                    className={cn(
                      "h-14 pr-7 text-center text-lg font-bold tabular-nums",
                      isBest &&
                        "border-primary/50 bg-primary/5 ring-1 ring-primary/20",
                    )}
                  />
                  <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-xs font-medium text-muted-foreground">
                    s
                  </span>
                </div>
              </div>
            );
          })}
        </div>
        <p className="mt-2 text-[11px] leading-snug text-muted-foreground">
          Temps de vol chronométré par le binôme — du décollage des pieds à
          leur retour au sol (ex. 0,52).
        </p>
      </div>

      {/* Computed power readout */}
      <div
        className={cn(
          "rounded-2xl border px-4 py-3 transition-colors",
          result
            ? "border-primary/30 bg-primary/5"
            : "border-dashed border-border bg-muted/30",
        )}
      >
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <Zap
              className={cn(
                "h-4 w-4",
                result ? "text-primary" : "text-muted-foreground/40",
              )}
            />
            Puissance retenue
          </span>
          <span className="text-lg font-bold tabular-nums text-foreground">
            {result ? (
              <>
                {result.value}
                <span className="ml-1 text-sm font-medium text-muted-foreground">
                  W/kg
                </span>
              </>
            ) : (
              <span className="text-muted-foreground/50">—</span>
            )}
          </span>
        </div>
        <p className="mt-1.5 text-[11px] leading-snug text-muted-foreground tabular-nums">
          {result ? (
            <>
              Meilleur saut&nbsp;: {bestFlightTime} s → {result.heightCm} cm →{" "}
              {result.peakPowerW} W
            </>
          ) : (
            "Saisis le poids et au moins un temps de vol pour calculer la puissance."
          )}
        </p>
      </div>
    </div>
  );
}
