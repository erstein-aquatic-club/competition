/**
 * MobilityEvolutionChart — courbe d'évolution de la mobilité/mouvement d'un
 * nageur à partir de l'historique de ses bilans (§347, Slice B).
 *
 * Mirroir stylistique de `ExerciseProgressChart` : ResponsiveContainer,
 * petits ticks muted, couleurs `hsl(var(--primary))`, hauteur ~180.
 *
 * - sélecteur d'axe (6 axes mobilité + mouvement)
 * - bascule Gauche / Droite / Côté faible (effective), OU « G & D » qui trace
 *   les deux côtés simultanément pour lire l'asymétrie dans le temps.
 * - état vide quand < 2 points (une courbe a besoin de ≥ 2 mesures).
 *
 * Pure : consomme `buildMobilityEvolution(assessments)`, aucune requête.
 */
import { useMemo, useState } from "react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { LineChart as LineChartIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import type { StrengthAssessment } from "@/lib/api/types";
import {
  buildMobilityEvolution,
  MOBILITY_EVOLUTION_AXES,
  type MobilityEvolutionAxisKey,
} from "@/lib/strength/mobilityEvolution";

interface MobilityEvolutionChartProps {
  assessments: StrengthAssessment[];
}

type ViewMode = "both" | "left" | "right" | "effective";

const VIEW_OPTIONS: { value: ViewMode; label: string }[] = [
  { value: "both", label: "G & D" },
  { value: "left", label: "Gauche" },
  { value: "right", label: "Droite" },
  { value: "effective", label: "Côté faible" },
];

const LEFT_COLOR = "hsl(var(--primary))";
const RIGHT_COLOR = "#f97316"; // orange — contraste lisible avec le primary
const EFFECTIVE_COLOR = "#ef4444"; // rouge — le côté faible, ce que l'on surveille

function ScoreTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border bg-popover px-3 py-2 text-xs shadow-md">
      <p className="font-semibold">{label}</p>
      {payload.map((p: any) => (
        <p key={p.dataKey} className="text-muted-foreground">
          {p.name}{" "}
          <span className="font-mono font-bold" style={{ color: p.color }}>
            {p.value}/3
          </span>
        </p>
      ))}
    </div>
  );
}

export function MobilityEvolutionChart({
  assessments,
}: MobilityEvolutionChartProps) {
  const evolution = useMemo(
    () => buildMobilityEvolution(assessments),
    [assessments],
  );

  const [axisKey, setAxisKey] = useState<MobilityEvolutionAxisKey>(
    MOBILITY_EVOLUTION_AXES[0].key,
  );
  const [mode, setMode] = useState<ViewMode>("both");

  const series = evolution[axisKey];

  const chartData = useMemo(
    () =>
      series.map((pt) => ({
        ...pt,
        shortDate: format(new Date(pt.date), "dd/MM/yy"),
      })),
    [series],
  );

  const hasEnough = chartData.length >= 2;

  return (
    <div className="space-y-3">
      {/* Sélecteur d'axe */}
      <div className="flex flex-wrap gap-1.5">
        {MOBILITY_EVOLUTION_AXES.map((axis) => (
          <button
            key={axis.key}
            type="button"
            onClick={() => setAxisKey(axis.key)}
            className={cn(
              "rounded-full px-2.5 py-1 text-[11px] font-semibold transition-all active:scale-95",
              axisKey === axis.key
                ? "bg-primary text-primary-foreground shadow-sm"
                : "bg-muted/50 text-muted-foreground hover:bg-muted",
            )}
          >
            {axis.label}
          </button>
        ))}
      </div>

      {/* Bascule G / D / côté faible */}
      <div className="flex items-center gap-1.5">
        {VIEW_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => setMode(opt.value)}
            className={cn(
              "rounded-full px-3 py-1 text-[11px] font-semibold transition-all active:scale-95",
              mode === opt.value
                ? "bg-foreground text-background shadow-sm"
                : "bg-muted/50 text-muted-foreground hover:bg-muted",
            )}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {hasEnough ? (
        <ResponsiveContainer width="100%" height={180}>
          <LineChart
            data={chartData}
            margin={{ top: 6, right: 10, left: -18, bottom: 0 }}
          >
            <XAxis
              dataKey="shortDate"
              tick={{ fontSize: 10 }}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              tick={{ fontSize: 10 }}
              tickLine={false}
              axisLine={false}
              domain={[0, 3]}
              ticks={[0, 1, 2, 3]}
              width={28}
            />
            <Tooltip content={<ScoreTooltip />} />
            {mode === "both" && (
              <Legend
                wrapperStyle={{ fontSize: 11 }}
                iconType="plainline"
                verticalAlign="top"
                height={20}
              />
            )}
            {(mode === "both" || mode === "left") && (
              <Line
                type="monotone"
                dataKey="left"
                name="Gauche"
                stroke={LEFT_COLOR}
                strokeWidth={2}
                dot={{ r: 3, fill: LEFT_COLOR, strokeWidth: 0 }}
                activeDot={{ r: 5, strokeWidth: 2, stroke: "hsl(var(--background))" }}
              />
            )}
            {(mode === "both" || mode === "right") && (
              <Line
                type="monotone"
                dataKey="right"
                name="Droite"
                stroke={RIGHT_COLOR}
                strokeWidth={2}
                dot={{ r: 3, fill: RIGHT_COLOR, strokeWidth: 0 }}
                activeDot={{ r: 5, strokeWidth: 2, stroke: "hsl(var(--background))" }}
              />
            )}
            {mode === "effective" && (
              <Line
                type="monotone"
                dataKey="effective"
                name="Côté faible"
                stroke={EFFECTIVE_COLOR}
                strokeWidth={2}
                dot={{ r: 3, fill: EFFECTIVE_COLOR, strokeWidth: 0 }}
                activeDot={{ r: 5, strokeWidth: 2, stroke: "hsl(var(--background))" }}
              />
            )}
          </LineChart>
        </ResponsiveContainer>
      ) : (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed bg-muted/20 py-8 text-center">
          <LineChartIcon className="h-8 w-8 text-muted-foreground/25" />
          <p className="text-sm font-medium text-muted-foreground">
            Pas assez de données
          </p>
          <p className="text-[11px] text-muted-foreground/60">
            Il faut au moins deux bilans notés pour tracer une évolution.
          </p>
        </div>
      )}
    </div>
  );
}
