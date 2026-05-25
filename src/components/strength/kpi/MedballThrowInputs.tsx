/**
 * MedballThrowInputs — saisie du KPI « lancer médecine-ball assis » (§309).
 *
 * Comme la détente verticale, ce n'est pas une valeur brute unique : la
 * grandeur scorée est un INDICE balistique = masse du ballon (kg) × meilleure
 * distance (m), en kg·m. La masse est choisie par le coach selon l'athlète (un
 * ballon trop léger plafonne, trop lourd est inatteignable) puis conservée d'un
 * bilan à l'autre pour le suivi. Cf. `medballPower.ts`.
 *
 * Style aligné sur `VerticalJumpInputs` (cohérence du wizard) : un champ
 * numérique annexe (la masse, comme le poids du nageur) + les essais de mesure
 * (distances, comme les temps de vol) + un encart de valeur calculée en direct.
 */
import { useMemo } from "react";
import { parseAttempts, parsePositiveNumber } from "@/lib/strength/kpiMeasurement";
import { medballThrowResult } from "@/lib/strength/medballPower";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { Dumbbell, Target } from "lucide-react";

export function MedballThrowInputs({
  distancesRaw,
  massRaw,
  onChangeDistance,
  onChangeMass,
}: {
  /** Raw text per distance attempt (cm). */
  distancesRaw: string[];
  /** Raw text for the ball-mass field (kg). */
  massRaw: string;
  onChangeDistance: (index: number, value: string) => void;
  onChangeMass: (value: string) => void;
}) {
  const massKg = parsePositiveNumber(massRaw);
  const distances = useMemo(() => parseAttempts(distancesRaw), [distancesRaw]);

  // L'indice n'est calculable qu'avec une masse ET ≥ 1 distance.
  const result = useMemo(() => {
    if (massKg == null || distances.length === 0) return null;
    return medballThrowResult(massKg, distances);
  }, [massKg, distances]);

  return (
    <div className="space-y-5">
      {/* Masse du ballon — précondition du calcul de l'indice */}
      <div>
        <div className="mb-2 flex items-center justify-between">
          <Label
            htmlFor="mb-mass"
            className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground"
          >
            Masse du ballon
          </Label>
          <span className="text-[11px] text-muted-foreground">
            Même masse à chaque bilan
          </span>
        </div>
        <div className="relative">
          <Dumbbell className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            id="mb-mass"
            inputMode="decimal"
            type="text"
            value={massRaw}
            onChange={(e) => onChangeMass(e.target.value)}
            placeholder="—"
            aria-label="Masse du médecine-ball en kilogrammes"
            className="h-14 pl-10 pr-9 text-lg font-bold tabular-nums"
          />
          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-muted-foreground">
            kg
          </span>
        </div>
      </div>

      {/* Distances — meilleur essai retenu */}
      <div>
        <div className="mb-2 flex items-center justify-between">
          <Label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Distance du lancer ({distancesRaw.length} essais)
          </Label>
          <span className="text-[11px] text-muted-foreground">
            Meilleur retenu
          </span>
        </div>
        <div className="grid grid-cols-3 gap-2.5">
          {distancesRaw.map((value, i) => (
            <div key={i}>
              <span className="mb-1 block text-center text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                Essai {i + 1}
              </span>
              <div className="relative">
                <Input
                  inputMode="decimal"
                  type="text"
                  value={value}
                  onChange={(e) => onChangeDistance(i, e.target.value)}
                  placeholder="—"
                  aria-label={`Distance du lancer — essai ${i + 1} en centimètres`}
                  className="h-14 pr-8 text-center text-lg font-bold tabular-nums"
                />
                <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-xs font-medium text-muted-foreground">
                  cm
                </span>
              </div>
            </div>
          ))}
        </div>
        <p className="mt-2 text-[11px] leading-snug text-muted-foreground">
          Mètre ruban, du mur au 1er contact du ballon. Lancer ~45° vers l'avant.
        </p>
      </div>

      {/* Indice calculé en direct */}
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
            <Target
              className={cn(
                "h-4 w-4",
                result ? "text-primary" : "text-muted-foreground/40",
              )}
            />
            Indice retenu
          </span>
          <span className="text-lg font-bold tabular-nums text-foreground">
            {result ? (
              <>
                {Math.round(result.value * 10) / 10}
                <span className="ml-1 text-sm font-medium text-muted-foreground">
                  kg·m
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
              Meilleur&nbsp;: {result.bestDistanceM} m × {result.ballMassKg} kg →
              indice masse × distance
            </>
          ) : (
            "Saisis la masse du ballon et au moins une distance pour calculer l'indice."
          )}
        </p>
        {result && (
          <p className="mt-1 text-[10px] leading-snug text-muted-foreground/80">
            Indice ∝ énergie au lâcher — compare un même nageur à masse constante.
          </p>
        )}
      </div>
    </div>
  );
}
