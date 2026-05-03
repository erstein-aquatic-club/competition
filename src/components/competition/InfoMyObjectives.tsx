import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { api } from "@/lib/api";
import { eventLabel, formatTime } from "@/lib/objectiveHelpers";
import { computeObjectivePerfRow } from "./info-helpers";
import { Target } from "lucide-react";

interface Props {
  competitionId: string;
  /** numeric user_id used to fetch swimmer_performances rows */
  userId: number | null;
}

export default function InfoMyObjectives({ competitionId, userId }: Props) {
  const [, navigate] = useLocation();

  const { data: objectives = [], isLoading: objectivesLoading } = useQuery({
    queryKey: ["athlete-objectives"],
    queryFn: () => api.getAthleteObjectives(),
  });

  const competitionObjectives = useMemo(
    () => objectives.filter((o) => o.competition_id === competitionId),
    [objectives, competitionId],
  );

  // Rolling 12-month window for PB lookup
  const fromDateIso = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - 365);
    return d.toISOString().slice(0, 10);
  }, []);

  const { data: perfs = [], isLoading: perfsLoading } = useQuery({
    queryKey: ["swimmer-performances-rolling-12m", userId, fromDateIso],
    queryFn: () =>
      userId
        ? api.getSwimmerPerformances({ userId, fromDate: fromDateIso })
        : Promise.resolve([]),
    enabled: !!userId,
  });

  const rows = useMemo(
    () => competitionObjectives.map((o) => computeObjectivePerfRow(o, perfs)),
    [competitionObjectives, perfs],
  );

  const isAuthBootstrapping = userId == null;
  const isInitialLoading = isAuthBootstrapping || objectivesLoading || perfsLoading;

  if (isInitialLoading) {
    return (
      <div className="rounded-xl border border-border bg-card p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Target className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold">Mes objectifs</h2>
        </div>
        <div className="space-y-2">
          <div className="h-8 rounded-md bg-muted/40 animate-pulse" />
          <div className="h-8 rounded-md bg-muted/40 animate-pulse" />
          <div className="h-8 rounded-md bg-muted/40 animate-pulse" />
        </div>
      </div>
    );
  }

  if (competitionObjectives.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-card p-4">
        <div className="flex items-center gap-2 mb-2">
          <Target className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold">Mes objectifs</h2>
        </div>
        <p className="text-xs text-muted-foreground">
          Aucun objectif défini sur cette compétition.
        </p>
        <button
          type="button"
          onClick={() => navigate("/profile?section=objectives")}
          className="mt-3 inline-flex h-10 items-center rounded-lg border border-border px-3 text-xs font-medium hover:bg-muted"
        >
          En définir un
        </button>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-card p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Target className="h-4 w-4 text-muted-foreground" />
        <h2 className="text-sm font-semibold">Mes objectifs</h2>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-muted-foreground border-b border-border">
              <th className="text-left font-medium pb-2 pr-3">Épreuve</th>
              <th className="text-right font-medium pb-2 pr-3">Cible</th>
              <th className="text-right font-medium pb-2 pr-3">PB 12 mois</th>
              <th className="text-right font-medium pb-2">Δ</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.objectiveId} className="border-b border-border last:border-0">
                <td className="py-2 pr-3">
                  {r.eventCode ? eventLabel(r.eventCode) : (r.text ?? "—")}
                </td>
                <td className="py-2 pr-3 text-right tabular-nums">
                  {r.targetSeconds != null ? formatTime(r.targetSeconds) : "—"}
                </td>
                <td className="py-2 pr-3 text-right tabular-nums">
                  {r.pbSeconds != null ? formatTime(r.pbSeconds) : "—"}
                </td>
                <td
                  className={`py-2 text-right tabular-nums ${
                    r.deltaSeconds == null
                      ? "text-muted-foreground"
                      : r.deltaSeconds > 0
                        ? "text-rose-600 dark:text-rose-400"
                        : "text-emerald-600 dark:text-emerald-400"
                  }`}
                >
                  {r.deltaSeconds == null
                    ? "—"
                    : `${r.deltaSeconds > 0 ? "+" : ""}${r.deltaSeconds.toFixed(2)}`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
