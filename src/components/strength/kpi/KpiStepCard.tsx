/**
 * KpiStepCard — one KPI measurement step inside the wizard.
 *
 * Surfaces the full protocol so the binôme can run the test without leaving
 * the screen:
 *  - ordered protocol steps,
 *  - the partner's job (visually emphasized — this is a two-person test),
 *  - the measurement method,
 *  - the demo GIF (placeholder while gifUrl is null),
 *  - the measurement inputs.
 *
 * Input model depends on the KPI:
 *  - 3 KPIs ("simple value") → `protocol.attempts` numeric inputs, best kept;
 *  - `vertical_jump` (power)  → body weight + flight times (VerticalJumpInputs);
 *  - `medball_vertical_throw` → ball mass + distances → indice (MedballThrowInputs).
 */
import { KpiGifPanel } from "./KpiGifPanel";
import { VerticalJumpInputs } from "./VerticalJumpInputs";
import { MedballThrowInputs } from "./MedballThrowInputs";
import { bestAttempt, parseAttempts } from "@/lib/strength/kpiMeasurement";
import type { KpiProtocol } from "@/lib/strength/kpiProtocols";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { Users, Ruler, Trophy } from "lucide-react";

// `parseAttempts` lives in the testable `kpiMeasurement` module; re-exported
// here so existing wizard imports keep their path.
export { parseAttempts };

export interface KpiAttemptsState {
  /** Raw text per attempt slot — keeps the field controlled without NaN flicker. */
  raw: string[];
  /** Raw body-weight text — only used by the vertical-jump (power) step. */
  weight?: string;
}

export function KpiStepCard({
  protocol,
  demoGifUrl = null,
  attempts,
  onChangeAttempt,
  onChangeWeight,
}: {
  protocol: KpiProtocol;
  /**
   * GIF de démo résolu depuis le catalogue (§301 T2). Prioritaire sur
   * `protocol.gifUrl` ; `null` → illustration SVG (fallback `KpiGifPanel`).
   */
  demoGifUrl?: string | null;
  attempts: KpiAttemptsState;
  onChangeAttempt: (index: number, value: string) => void;
  /** Updates the body-weight field — used by the vertical-jump step only. */
  onChangeWeight: (value: string) => void;
}) {
  return (
    <div className="space-y-5">
      {/* Bucket + label */}
      <div>
        <span className="text-[11px] font-semibold uppercase tracking-wider text-primary">
          {protocol.bucket}
        </span>
        <h2 className="mt-0.5 text-xl font-bold tracking-tight text-foreground">
          {protocol.label}
        </h2>
      </div>

      <KpiGifPanel
        gifUrl={demoGifUrl ?? protocol.gifUrl}
        kpiKey={protocol.key}
        label={protocol.label}
      />

      {/* Partner role — emphasized: this is a two-person protocol */}
      <div className="relative overflow-hidden rounded-2xl border border-amber-200/70 bg-amber-50/70 px-3.5 py-3 dark:border-amber-800/50 dark:bg-amber-950/25">
        <span
          aria-hidden
          className="absolute left-0 top-0 bottom-0 w-[3px] bg-amber-400/80 dark:bg-amber-500/70"
        />
        <div className="flex items-start gap-2.5">
          <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-900/60">
            <Users className="h-3.5 w-3.5 text-amber-700 dark:text-amber-300" />
          </span>
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-wider text-amber-700/90 dark:text-amber-300/90">
              Rôle du binôme
            </p>
            <p className="mt-0.5 text-sm font-medium leading-snug text-amber-900 dark:text-amber-100">
              {protocol.partnerRole}
            </p>
          </div>
        </div>
      </div>

      {/* Ordered protocol steps */}
      <div>
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Déroulé
        </p>
        <ol className="space-y-2">
          {protocol.steps.map((step, i) => (
            <li key={i} className="flex items-start gap-2.5">
              <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-secondary text-[11px] font-bold text-secondary-foreground tabular-nums">
                {i + 1}
              </span>
              <span className="text-sm leading-snug text-foreground">{step}</span>
            </li>
          ))}
        </ol>
      </div>

      {/* Measurement method */}
      <div className="flex items-start gap-2.5 rounded-xl border bg-muted/30 px-3.5 py-2.5">
        <Ruler className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            Mesure
          </p>
          <p className="mt-0.5 text-sm leading-snug text-foreground">{protocol.measurement}</p>
        </div>
      </div>

      {/* Measurement inputs — power KPI / medball index / simple-value KPIs */}
      {protocol.key === "vertical_jump" ? (
        <VerticalJumpInputs
          flightTimesRaw={attempts.raw}
          weightRaw={attempts.weight ?? ""}
          onChangeFlightTime={onChangeAttempt}
          onChangeWeight={onChangeWeight}
        />
      ) : protocol.key === "medball_vertical_throw" ? (
        <MedballThrowInputs
          distancesRaw={attempts.raw}
          massRaw={attempts.weight ?? ""}
          onChangeDistance={onChangeAttempt}
          onChangeMass={onChangeWeight}
        />
      ) : (
        <GenericKpiInputs
          protocol={protocol}
          attempts={attempts}
          onChangeAttempt={onChangeAttempt}
        />
      )}
    </div>
  );
}

/**
 * Measurement inputs for the 4 "simple value" KPIs — `protocol.attempts`
 * numeric fields, the best (highest) value retained live.
 */
function GenericKpiInputs({
  protocol,
  attempts,
  onChangeAttempt,
}: {
  protocol: KpiProtocol;
  attempts: KpiAttemptsState;
  onChangeAttempt: (index: number, value: string) => void;
}) {
  const allowNonPositive = protocol.allowNonPositive ?? false;
  const parsed = parseAttempts(attempts.raw, { allowNonPositive });
  const retained = parsed.length > 0 ? bestAttempt(parsed) : null;

  return (
    <>
      {/* Attempt inputs */}
      <div>
        <div className="mb-2 flex items-center justify-between">
          <Label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Essais ({protocol.attempts})
          </Label>
          <span className="text-[11px] text-muted-foreground">Meilleur retenu</span>
        </div>
        <div
          className={cn(
            "grid gap-2.5",
            protocol.attempts === 2 ? "grid-cols-2" : "grid-cols-3",
          )}
        >
          {Array.from({ length: protocol.attempts }).map((_, i) => {
            const value = attempts.raw[i] ?? "";
            const numeric = Number(String(value).replace(",", "."));
            const isValid =
              value.trim() !== "" &&
              Number.isFinite(numeric) &&
              (allowNonPositive || numeric > 0);
            const isBest = retained != null && isValid && numeric === retained;
            return (
              <div key={i} className="relative">
                <span className="mb-1 block text-center text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Essai {i + 1}
                </span>
                <div className="relative">
                  <Input
                    inputMode="decimal"
                    type="text"
                    value={value}
                    onChange={(e) => onChangeAttempt(i, e.target.value)}
                    placeholder="—"
                    aria-label={`${protocol.label} — essai ${i + 1} en ${protocol.unit}`}
                    className={cn(
                      "h-14 pr-8 text-center text-lg font-bold tabular-nums",
                      isBest && "border-primary/50 bg-primary/5 ring-1 ring-primary/20",
                    )}
                  />
                  <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-xs font-medium text-muted-foreground">
                    {protocol.unit}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Retained value readout */}
      <div
        className={cn(
          "flex items-center justify-between rounded-2xl border px-4 py-3 transition-colors",
          retained != null
            ? "border-primary/30 bg-primary/5"
            : "border-dashed border-border bg-muted/30",
        )}
      >
        <span className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
          <Trophy
            className={cn(
              "h-4 w-4",
              retained != null ? "text-primary" : "text-muted-foreground/40",
            )}
          />
          Valeur retenue
        </span>
        <span className="text-lg font-bold tabular-nums text-foreground">
          {retained != null ? (
            <>
              {retained}
              <span className="ml-1 text-sm font-medium text-muted-foreground">
                {protocol.unit}
              </span>
            </>
          ) : (
            <span className="text-muted-foreground/50">—</span>
          )}
        </span>
      </div>
    </>
  );
}
