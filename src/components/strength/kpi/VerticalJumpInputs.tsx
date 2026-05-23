/**
 * VerticalJumpInputs — measurement inputs for the détente verticale KPI.
 *
 * Unlike the 4 other KPIs (a single value per attempt), the vertical jump is
 * a POWER measurement: it needs the athlete's body weight plus the flight
 * time of each jump. Weight + best flight time → height (g·t²/8) → peak power
 * (Sayers) → relative power (W/kg), which is the value actually scored.
 *
 * Modes (§295) :
 *   • CHRONO (défaut) — 3 KpiStopwatch tactiles Start/Stop, mesure directement
 *     dans l'app (performance.now sub-ms).
 *   • TEXTE (fallback) — 3 inputs texte saisis manuellement, révélable via
 *     le lien « Saisir manuellement → » (panne, correction, démo).
 *
 * Le poids reste un input texte dans les 2 modes (pas chronométrable).
 *
 * Cf. §293 — docs/plans/bilan-muscu-barème-puissance-detente.md.
 * Cf. §295 — docs/plans/2026-05-21-kpi-chrono-illustrations-design.md.
 */
import { useMemo, useState } from "react";
import { parseAttempts, parsePositiveNumber } from "@/lib/strength/kpiMeasurement";
import { verticalJumpResult } from "@/lib/strength/jumpPower";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { Pencil, Scale, Timer, Zap } from "lucide-react";
import { KpiStopwatch } from "./KpiStopwatch";

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
  const [manualMode, setManualMode] = useState(false);
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

  // Essais incohérents (chrono manuel) : écart-type relatif > 8 % sur ≥ 2 essais
  // → on invite à refaire le set plutôt qu'à se fier à une mesure douteuse.
  const inconsistent =
    result != null &&
    flightTimes.length >= 2 &&
    result.meanFlightTimeSec > 0 &&
    result.flightTimeStdevSec / result.meanFlightTimeSec > 0.08;

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

      {/* Flight-time attempts — CHRONO (par défaut) ou TEXTE (fallback) */}
      <div>
        <div className="mb-2 flex items-center justify-between">
          <Label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Temps de vol ({flightTimesRaw.length} essais)
          </Label>
          <span className="text-[11px] text-muted-foreground">
            Moyenne retenue
          </span>
        </div>

        {manualMode ? (
          <div className="grid grid-cols-3 gap-2.5">
            {flightTimesRaw.map((value, i) => {
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
                      className="h-14 pr-7 text-center text-lg font-bold tabular-nums"
                    />
                    <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-xs font-medium text-muted-foreground">
                      s
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="space-y-2.5">
            {flightTimesRaw.map((value, i) => (
              <KpiStopwatch
                key={i}
                index={i}
                value={value && value.trim() !== "" ? value : null}
                onStop={(seconds) => onChangeFlightTime(i, seconds)}
                onReset={() => onChangeFlightTime(i, "")}
              />
            ))}
          </div>
        )}

        <div className="mt-2 flex items-center justify-between gap-2">
          <p className="text-[11px] leading-snug text-muted-foreground">
            {manualMode
              ? "Saisis 3 temps en secondes (ex. 0,52)."
              : "Tape ▶ Démarrer au décollage, ⏹ Arrêter au retour au sol."}
          </p>
          <Button
            type="button"
            variant="link"
            size="sm"
            onClick={() => setManualMode((m) => !m)}
            className="h-auto shrink-0 gap-1 px-0 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground"
            aria-label={
              manualMode
                ? "Revenir au mode chronomètre intégré"
                : "Saisir manuellement les temps de vol"
            }
          >
            {manualMode ? (
              <>
                <Timer className="h-3 w-3" /> Revenir au chrono
              </>
            ) : (
              <>
                <Pencil className="h-3 w-3" /> Saisir manuellement →
              </>
            )}
          </Button>
        </div>
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
              Moyenne&nbsp;: {result.meanFlightTimeSec} s
              {flightTimes.length >= 2 && (
                <> (±{result.flightTimeStdevSec} s · {flightTimes.length} essais)</>
              )}{" "}
              → {result.heightCm} cm → {result.peakPowerW} W
            </>
          ) : (
            "Saisis le poids et au moins un temps de vol pour calculer la puissance."
          )}
        </p>
        {result && (
          <p className="mt-1 text-[10px] leading-snug text-muted-foreground/80">
            Estimation : le temps de vol est chronométré à la main — valeur
            indicative, à comparer à technique de mesure constante.
          </p>
        )}
      </div>

      {/* Essais incohérents — invite à refaire le set */}
      {inconsistent && (
        <div className="flex items-start gap-2.5 rounded-xl border border-amber-200/70 bg-amber-50/70 px-3.5 py-2.5 dark:border-amber-800/50 dark:bg-amber-950/25">
          <Timer className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600 dark:text-amber-400" />
          <p className="text-[11px] leading-snug text-amber-900 dark:text-amber-100">
            Essais dispersés (±{result?.flightTimeStdevSec} s). Refais le set pour
            une mesure fiable — les 3 temps de vol devraient être proches.
          </p>
        </div>
      )}
    </div>
  );
}
