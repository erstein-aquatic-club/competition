import { useState, useCallback } from "react";
import type { ChronoState, SplitRecord } from "../../lib/chrono-types";
import type { ChronoAction } from "../../lib/chrono-reducer";
import { formatTime, formatLap } from "../../hooks/useChronoTimer";
import { WAVE_COLORS } from "../../lib/chrono-types";
import { Button } from "../../components/ui/button";
import { Send, RotateCcw, Check, AlertCircle, Clock } from "lucide-react";
import { toast } from "sonner";
import { createStandaloneSwimLog } from "../../lib/api/swim-logs";
import type { SwimExerciseLogInput } from "../../lib/api/types";

interface ChronoResultsProps {
  state: ChronoState;
  dispatch: React.Dispatch<ChronoAction>;
  onExportComplete?: () => void;
}

type ExportStatus = "pending" | "sent" | "error";

/** Flatten all reps into a single split_times array for export */
function flattenSplits(splitsByRep: SplitRecord[][]): { rep: number; time_seconds: number }[] {
  const result: { rep: number; time_seconds: number }[] = [];
  let idx = 1;
  for (const rep of splitsByRep) {
    for (const s of rep) {
      result.push({ rep: idx++, time_seconds: s.cumulativeMs / 1000 });
    }
  }
  return result;
}

function totalSplitCount(splitsByRep: SplitRecord[][]): number {
  return splitsByRep.reduce((sum, rep) => sum + rep.length, 0);
}

export default function ChronoResults({ state, dispatch, onExportComplete }: ChronoResultsProps) {
  const [exportStatuses, setExportStatuses] = useState<Map<number, ExportStatus>>(new Map());
  const [exporting, setExporting] = useState(false);

  const raceEntries = Array.from(state.raceData.values());
  const byLane = new Map<number, typeof raceEntries>();
  for (const entry of raceEntries) {
    const lane = entry.swimmer.lane;
    const list = byLane.get(lane) ?? [];
    list.push(entry);
    byLane.set(lane, list);
  }
  const sortedLanes = Array.from(byLane.keys()).sort((a, b) => a - b);
  const hasMultipleReps = raceEntries.some((e) => e.splitsByRep.length > 1);

  const handleExportAll = useCallback(async () => {
    setExporting(true);
    const swimmers = raceEntries.filter((e) => totalSplitCount(e.splitsByRep) > 0);

    if (swimmers.length === 0) {
      toast.error("Aucun split à exporter");
      setExporting(false);
      return;
    }

    const results = await Promise.allSettled(
      swimmers.map(async (raceState) => {
        const { swimmer, splitsByRep } = raceState;
        const repCount = splitsByRep.length;
        const log: SwimExerciseLogInput = {
          exercise_label: "Chrono coach",
          split_times: flattenSplits(splitsByRep),
          notes: `Série chrono — Ligne ${swimmer.lane}${repCount > 1 ? ` — ${repCount} reps` : ""}`,
        };

        await createStandaloneSwimLog(String(swimmer.athleteId), log);
        return swimmer.athleteId;
      }),
    );

    const newStatuses = new Map(exportStatuses);
    let successCount = 0;
    let errorCount = 0;

    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      const athleteId = swimmers[i].swimmer.athleteId;
      if (result.status === "fulfilled") {
        newStatuses.set(athleteId, "sent");
        successCount++;
      } else {
        newStatuses.set(athleteId, "error");
        errorCount++;
      }
    }

    setExportStatuses(newStatuses);
    setExporting(false);

    if (errorCount === 0) {
      toast.success(`${successCount} résultat${successCount > 1 ? "s" : ""} envoyé${successCount > 1 ? "s" : ""}`);
      onExportComplete?.();
    } else {
      toast.error(`${errorCount} erreur${errorCount > 1 ? "s" : ""} sur ${swimmers.length} envoi${swimmers.length > 1 ? "s" : ""}`);
    }
  }, [raceEntries, exportStatuses, onExportComplete]);

  const handleNewSeries = useCallback(() => {
    dispatch({ type: "RESET_FOR_NEW_SERIES" });
  }, [dispatch]);

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Résultats</h2>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleNewSeries}
            disabled={exporting}
          >
            <RotateCcw className="mr-1.5 h-4 w-4" />
            Nouvelle série
          </Button>
          <Button
            size="sm"
            onClick={handleExportAll}
            disabled={exporting}
          >
            <Send className="mr-1.5 h-4 w-4" />
            Envoyer à tous
          </Button>
        </div>
      </div>

      {/* Results cards grouped by lane */}
      {sortedLanes.map((lane) => (
        <div key={lane} className="flex flex-col gap-2">
          <h3 className="text-sm font-medium text-muted-foreground">
            Ligne {lane}
          </h3>
          {byLane.get(lane)!.map((raceState) => {
            const { swimmer, splitsByRep } = raceState;
            const waveColor = WAVE_COLORS[(swimmer.wave - 1) % WAVE_COLORS.length];
            const status = exportStatuses.get(swimmer.athleteId);
            const total = totalSplitCount(splitsByRep);

            return (
              <div
                key={swimmer.athleteId}
                className="rounded-lg border bg-card p-3"
              >
                {/* Swimmer header */}
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm">
                      {swimmer.displayName}
                    </span>
                    <span
                      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold text-white ${waveColor.dot}`}
                    >
                      {waveColor.label}
                    </span>
                  </div>
                  <ExportStatusBadge status={status} />
                </div>

                {/* Splits by rep */}
                {total === 0 ? (
                  <p className="text-sm text-muted-foreground italic">
                    Aucun split enregistré
                  </p>
                ) : (
                  <div className="flex flex-col gap-3">
                    {splitsByRep.map((splits, repIdx) => {
                      if (splits.length === 0) return null;

                      let bestLapIdx = -1;
                      let bestLapMs = Infinity;
                      for (let i = 0; i < splits.length; i++) {
                        if (splits[i].lapMs < bestLapMs) {
                          bestLapMs = splits[i].lapMs;
                          bestLapIdx = i;
                        }
                      }
                      const lastSplit = splits[splits.length - 1];

                      return (
                        <div key={repIdx}>
                          {/* Rep header — only show if multiple reps */}
                          {hasMultipleReps && (
                            <div className="text-xs font-semibold text-muted-foreground mb-1">
                              Rep {repIdx + 1}
                            </div>
                          )}

                          <div className="flex flex-col gap-0.5 mb-1.5">
                            {splits.map((split, i) => {
                              const isBest = i === bestLapIdx;
                              return (
                                <div
                                  key={i}
                                  className={`flex items-center gap-3 font-mono tabular-nums text-sm ${
                                    isBest ? "text-green-600 dark:text-green-400" : "text-foreground"
                                  }`}
                                >
                                  <span className="w-12 text-right text-muted-foreground text-xs">
                                    {state.splitDistanceM > 0 ? `${(i + 1) * state.splitDistanceM}m` : `#${i + 1}`}
                                  </span>
                                  <span className="w-20">
                                    {formatTime(split.cumulativeMs)}
                                  </span>
                                  <span className="text-muted-foreground">
                                    ({formatLap(split.lapMs)})
                                  </span>
                                </div>
                              );
                            })}
                          </div>

                          {/* Rep summary */}
                          <div className="flex flex-wrap gap-x-4 gap-y-0.5 border-t pt-1.5 text-xs text-muted-foreground">
                            <span>
                              Total :{" "}
                              <span className="font-mono tabular-nums text-foreground">
                                {formatTime(lastSplit.cumulativeMs)}
                              </span>
                            </span>
                            <span>
                              Meilleur :{" "}
                              <span className="font-mono tabular-nums text-green-600 dark:text-green-400">
                                {formatLap(bestLapMs)} (#{bestLapIdx + 1})
                              </span>
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

function ExportStatusBadge({ status }: { status?: ExportStatus }) {
  if (!status || status === "pending") {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
        <Clock className="h-3.5 w-3.5" />
        En attente
      </span>
    );
  }
  if (status === "sent") {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-green-600 dark:text-green-400">
        <Check className="h-3.5 w-3.5" />
        Envoyé
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-xs text-destructive">
      <AlertCircle className="h-3.5 w-3.5" />
      Erreur
    </span>
  );
}
