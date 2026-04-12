import { useState, useCallback } from "react";
import type { ChronoState, SplitRecord } from "../../lib/chrono-types";
import type { ChronoAction } from "../../lib/chrono-reducer";
import { formatTime, formatLap } from "../../hooks/useChronoTimer";
import { WAVE_COLORS } from "../../lib/chrono-types";
import { Button } from "../../components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "../../components/ui/alert-dialog";
import { Send, RotateCcw, Check, AlertCircle, Clock, ChevronDown, Trophy, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "../../lib/supabase";
import { STORAGE_KEYS } from "../../lib/api/client";
import { createStandaloneSwimLog } from "../../lib/api/swim-logs";
import type { SwimExerciseLogInput, ChronoRecordInput } from "../../lib/api/types";
import { createChronoRecord } from "../../lib/api/chrono-records";

/** Resolve public.users integer ID → auth.users UUID */
async function resolveAuthUid(athleteId: number): Promise<string | null> {
  const { data, error } = await supabase.rpc("get_auth_uid_for_user", {
    p_user_id: athleteId,
  });
  if (error) return null;
  return data as string | null;
}

interface ChronoResultsProps {
  state: ChronoState;
  dispatch: React.Dispatch<ChronoAction>;
  onExportComplete?: () => void;
  onSaveDraft?: () => void;
  onDiscard?: () => void;
}

type ExportStatus = "pending" | "sent" | "error";

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

/** Build a label from chrono state config */
function buildLabel(state: ChronoState): string {
  const parts: string[] = [];
  if (state.seriesCount > 0) parts.push(`${state.seriesCount}×`);
  if (state.totalDistanceM > 0) parts.push(`${state.totalDistanceM}m`);
  if (parts.length === 0) return "Chrono";
  return parts.join("");
}

/** Convert race state to ChronoRecordInput for DB persistence */
function buildChronoRecordInput(state: ChronoState, status: "draft" | "sent"): ChronoRecordInput {
  const raceEntries = Array.from(state.raceData.values());
  return {
    status,
    label: buildLabel(state),
    config: {
      totalDistanceM: state.totalDistanceM,
      splitDistanceM: state.splitDistanceM,
      seriesCount: state.seriesCount,
      laneCount: state.laneCount,
    },
    swimmers: raceEntries.map((rs) => ({
      athleteId: rs.swimmer.athleteId,
      displayName: rs.swimmer.displayName,
      lane: rs.swimmer.lane,
      wave: rs.swimmer.wave,
      splitsByRep: rs.splitsByRep.map((rep) =>
        rep.map((s, i) => ({
          distanceM: state.splitDistanceM > 0 ? (i + 1) * state.splitDistanceM : 0,
          cumulativeMs: s.cumulativeMs,
          lapMs: s.lapMs,
        })),
      ),
    })),
  };
}

/** Get total time of a series (last split's cumulative time) */
function seriesTotalMs(splits: SplitRecord[]): number {
  return splits.length > 0 ? splits[splits.length - 1].cumulativeMs : 0;
}

/** Find the index of the best (fastest) series */
function findBestSeriesIdx(splitsByRep: SplitRecord[][]): number {
  let bestIdx = -1;
  let bestMs = Infinity;
  for (let i = 0; i < splitsByRep.length; i++) {
    if (splitsByRep[i].length === 0) continue;
    const total = seriesTotalMs(splitsByRep[i]);
    if (total > 0 && total < bestMs) {
      bestMs = total;
      bestIdx = i;
    }
  }
  return bestIdx;
}

export default function ChronoResults({ state, dispatch, onExportComplete, onSaveDraft, onDiscard }: ChronoResultsProps) {
  const [exportStatuses, setExportStatuses] = useState<Map<number, ExportStatus>>(new Map());
  const [exporting, setExporting] = useState(false);
  const [savingDraft, setSavingDraft] = useState(false);
  const [expandedCards, setExpandedCards] = useState<Set<string>>(new Set());

  const toggleExpand = (key: string) => {
    setExpandedCards((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const handleSaveDraft = useCallback(async () => {
    if (savingDraft) return;
    setSavingDraft(true);
    try {
      await createChronoRecord(buildChronoRecordInput(state, "draft"));
      toast.success("Brouillon enregistré");
      onSaveDraft?.();
    } catch (err: any) {
      toast.error(err.message || "Erreur de sauvegarde");
    } finally {
      setSavingDraft(false);
    }
  }, [state, onSaveDraft, savingDraft]);

  const raceEntries = Array.from(state.raceData.values());
  const byLane = new Map<number, typeof raceEntries>();
  for (const entry of raceEntries) {
    const lane = entry.swimmer.lane;
    const list = byLane.get(lane) ?? [];
    list.push(entry);
    byLane.set(lane, list);
  }
  const sortedLanes = Array.from(byLane.keys()).sort((a, b) => a - b);

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

        // Resolve auth UUID from public.users integer ID
        const authUid = await resolveAuthUid(swimmer.athleteId);
        if (!authUid) throw new Error(`UUID introuvable pour ${swimmer.displayName}`);

        const repCount = splitsByRep.filter((s) => s.length > 0).length;
        const log: SwimExerciseLogInput = {
          exercise_label: "Chrono coach",
          split_times: flattenSplits(splitsByRep),
          notes: `Série chrono — Ligne ${swimmer.lane}${repCount > 1 ? ` — ${repCount} séries` : ""}`,
        };
        await createStandaloneSwimLog(authUid, log);
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

    // Save chrono record as "sent" for history
    try {
      await createChronoRecord(buildChronoRecordInput(state, "sent"));
    } catch { /* non-blocking — history save failure shouldn't block export */ }

    if (errorCount === 0) {
      toast.success(`${successCount} résultat${successCount > 1 ? "s" : ""} envoyé${successCount > 1 ? "s" : ""}`);
      onExportComplete?.();
    } else {
      toast.error(`${errorCount} erreur${errorCount > 1 ? "s" : ""} sur ${swimmers.length} envoi${swimmers.length > 1 ? "s" : ""}`);
    }
  }, [raceEntries, exportStatuses, onExportComplete, state]);

  return (
    <div className="flex flex-col gap-5">
      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Résultats</h2>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={handleSaveDraft} disabled={exporting || savingDraft}>
            <Clock className="mr-1.5 h-4 w-4" />
            Brouillon
          </Button>
          <Button variant="outline" size="sm" onClick={() => dispatch({ type: "RESET_FOR_NEW_SERIES" })} disabled={exporting}>
            <RotateCcw className="mr-1.5 h-4 w-4" />
            Nouvelle série
          </Button>
          <Button size="sm" onClick={handleExportAll} disabled={exporting}>
            <Send className="mr-1.5 h-4 w-4" />
            Envoyer à tous
          </Button>
        </div>
      </div>

      {/* ── Results by lane ── */}
      {sortedLanes.map((lane) => (
        <div key={lane} className="flex flex-col gap-3">
          <div className="flex items-center gap-3">
            <div className="h-px flex-1 bg-border" />
            <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              Ligne {lane}
            </h3>
            <div className="h-px flex-1 bg-border" />
          </div>

          {byLane.get(lane)!.map((raceState) => {
            const { swimmer, splitsByRep } = raceState;
            const wc = WAVE_COLORS[(swimmer.wave - 1) % WAVE_COLORS.length];
            const status = exportStatuses.get(swimmer.athleteId);
            const total = totalSplitCount(splitsByRep);
            const bestSeriesIdx = findBestSeriesIdx(splitsByRep);
            const completedSeries = splitsByRep.filter((s) => s.length > 0);
            const cardKey = `${swimmer.athleteId}`;
            const isExpanded = expandedCards.has(cardKey);

            return (
              <div key={swimmer.athleteId} className="rounded-xl border bg-card overflow-hidden">
                {/* ── Swimmer header ── */}
                <div className="flex items-center justify-between px-4 pt-3 pb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-base font-bold text-foreground">
                      {swimmer.displayName}
                    </span>
                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold text-white ${wc.dot}`}>
                      {wc.label}
                    </span>
                  </div>
                  <ExportStatusBadge status={status} />
                </div>

                {total === 0 ? (
                  <div className="px-4 pb-3">
                    <p className="text-sm text-muted-foreground italic">Aucun temps enregistré</p>
                  </div>
                ) : (
                  <>
                    {/* ── Series totals — horizontal row ── */}
                    <div className="px-4 pb-2">
                      <div className="flex flex-wrap gap-2">
                        {splitsByRep.map((splits, idx) => {
                          if (splits.length === 0) return null;
                          const totalMs = seriesTotalMs(splits);
                          const isBest = idx === bestSeriesIdx && completedSeries.length > 1;
                          return (
                            <div
                              key={idx}
                              className={`rounded-lg border px-3 py-1.5 ${
                                isBest
                                  ? "border-green-500/50 bg-green-500/10"
                                  : "border-border bg-muted/50"
                              }`}
                            >
                              <div className="flex items-center gap-1.5">
                                {isBest && <Trophy className="h-3 w-3 text-green-500" />}
                                <span className="text-[10px] font-medium text-muted-foreground">
                                  S{idx + 1}
                                </span>
                              </div>
                              <span className={`font-mono tabular-nums text-lg font-black leading-tight ${
                                isBest ? "text-green-600 dark:text-green-400" : "text-foreground"
                              }`}>
                                {formatTime(totalMs)}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* ── Expand/collapse splits ── */}
                    <button
                      type="button"
                      onClick={() => toggleExpand(cardKey)}
                      className="flex w-full items-center justify-center gap-1 border-t py-1.5 text-xs text-muted-foreground hover:bg-muted/50 transition-colors"
                    >
                      <ChevronDown className={`h-3.5 w-3.5 transition-transform ${isExpanded ? "rotate-180" : ""}`} />
                      {isExpanded ? "Masquer les splits" : "Voir les splits"}
                    </button>

                    {/* ── Splits detail (collapsible) ── */}
                    {isExpanded && (
                      <div className="border-t px-4 py-3 flex flex-col gap-3">
                        {splitsByRep.map((splits, repIdx) => {
                          if (splits.length === 0) return null;
                          const isBest = repIdx === bestSeriesIdx && completedSeries.length > 1;
                          return (
                            <div key={repIdx}>
                              {completedSeries.length > 1 && (
                                <div className={`text-xs font-semibold mb-1 ${isBest ? "text-green-600 dark:text-green-400" : "text-muted-foreground"}`}>
                                  {isBest && "★ "}Série {repIdx + 1}
                                </div>
                              )}
                              <div className="flex flex-col gap-0.5">
                                {splits.map((split, i) => (
                                  <div key={i} className="flex items-center gap-3 font-mono tabular-nums text-sm text-foreground">
                                    <span className="w-12 text-right text-xs text-muted-foreground">
                                      {state.splitDistanceM > 0 ? `${(i + 1) * state.splitDistanceM}m` : `#${i + 1}`}
                                    </span>
                                    <span className="w-20">{formatTime(split.cumulativeMs)}</span>
                                    <span className="text-muted-foreground">({formatLap(split.lapMs)})</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </>
                )}
              </div>
            );
          })}
        </div>
      ))}

      {/* ── Discard button ── */}
      <div className="flex justify-center pt-2 pb-4">
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive hover:bg-destructive/10 gap-1.5" disabled={exporting}>
              <Trash2 className="h-4 w-4" />
              Supprimer
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Supprimer ces résultats ?</AlertDialogTitle>
              <AlertDialogDescription>
                Les chronos seront perdus définitivement.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Annuler</AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                onClick={() => {
                  localStorage.removeItem(STORAGE_KEYS.CHRONO_BACKUP);
                  dispatch({ type: "RESET_FOR_NEW_SERIES" });
                  onDiscard?.();
                  toast("Résultats supprimés", { duration: 2000 });
                }}
              >
                Supprimer
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
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
