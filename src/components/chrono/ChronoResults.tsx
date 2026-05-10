import { useState, useCallback, useMemo } from "react";
import { SwimmerAvatar } from "./SwimmerAvatar";
import { enqueue, isRetriableError } from "../../lib/chrono-save-queue";
import type { ChronoState, SplitRecord } from "../../lib/chrono-types";
import type { ChronoAction } from "../../lib/chrono-reducer";
import { formatTime, formatLap, CHRONO_PRECISION } from "../../hooks/useChronoTimer";
import { WAVE_COLORS, resolveWaveConfig } from "../../lib/chrono-types";
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
import { Send, RotateCcw, Check, AlertCircle, Clock, Trash2, Download, Loader2, UserRound } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "../../lib/supabase";
import { STORAGE_KEYS } from "../../lib/api/client";
import { createStandaloneSwimLog } from "../../lib/api/swim-logs";
import type { SwimExerciseLogInput, ChronoRecordInput } from "../../lib/api/types";
import { createChronoRecord } from "../../lib/api/chrono-records";
import { exportChronoToXlsx } from "../../lib/chronoXlsxExport";

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

/** Build a label from chrono state — prefer explicit title, fallback to config */
function buildLabel(state: ChronoState): string {
  if (state.title.trim()) return state.title.trim();
  const parts: string[] = [];
  if (state.seriesCount > 0) parts.push(`${state.seriesCount}×`);
  if (state.totalDistanceM > 0) parts.push(`${state.totalDistanceM}m`);
  if (parts.length === 0) return "Chrono";
  return parts.join("");
}

/** Convert race state to ChronoRecordInput for DB persistence */
function buildChronoRecordInput(state: ChronoState, status: "draft" | "sent"): ChronoRecordInput {
  const raceEntries = Array.from(state.raceData.values());

  // Collect per-wave overrides for the config payload (only non-null ones).
  const waveOverrides: Record<number, { seriesCount?: number; totalDistanceM?: number; splitDistanceM?: number }> = {};
  for (const w of state.waves) {
    if (w.overrides) waveOverrides[w.wave] = { ...w.overrides };
  }
  const hasOverrides = Object.keys(waveOverrides).length > 0;

  return {
    status,
    label: buildLabel(state),
    config: {
      totalDistanceM: state.totalDistanceM,
      splitDistanceM: state.splitDistanceM,
      seriesCount: state.seriesCount,
      laneCount: state.laneCount,
      ...(hasOverrides ? { waveOverrides } : {}),
    },
    swimmers: raceEntries.map((rs) => {
      const resolved = resolveWaveConfig(state, rs.swimmer.wave);
      return {
        kind: rs.swimmer.kind,
        athleteId: rs.swimmer.athleteId,
        manualId: rs.swimmer.manualId,
        displayName: rs.swimmer.displayName,
        lane: rs.swimmer.lane,
        wave: rs.swimmer.wave,
        splitsByRep: rs.splitsByRep.map((rep) =>
          rep.map((s, i) => ({
            distanceM: resolved.splitDistanceM > 0 ? (i + 1) * resolved.splitDistanceM : 0,
            cumulativeMs: s.cumulativeMs,
            lapMs: s.lapMs,
          })),
        ),
      };
    }),
  };
}

/** Get total time of a series (last split's cumulative time) */
function seriesTotalMs(splits: SplitRecord[]): number {
  return splits.length > 0 ? splits[splits.length - 1].cumulativeMs : 0;
}

/** Find the index of the best (fastest) completed series */
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

/** Build the final ranking rows — one per swimmer, using their best series. */
interface RankingRow {
  key: string;
  displayName: string;
  avatarUrl: string | null;
  wave: number;
  kind: "registered" | "manual";
  bestSeriesIdx: number;
  bestSplits: SplitRecord[];
  bestTotalMs: number;
  completedSeriesCount: number;
  isCustomWave: boolean;
  resolved: { seriesCount: number; totalDistanceM: number; splitDistanceM: number };
}

function rankPodium(idx: number): string {
  if (idx === 0) return "🥇";
  if (idx === 1) return "🥈";
  if (idx === 2) return "🥉";
  return String(idx + 1);
}

function formatDiff(diffMs: number): string {
  if (diffMs <= 0) return "—";
  return `+${formatLap(diffMs)}`;
}

export default function ChronoResults({ state, dispatch, onExportComplete, onSaveDraft, onDiscard }: ChronoResultsProps) {
  const [exportStatuses, setExportStatuses] = useState<Map<string, ExportStatus>>(new Map());
  const [sending, setSending] = useState(false);
  const [exportingXlsx, setExportingXlsx] = useState(false);
  const [savingDraft, setSavingDraft] = useState(false);

  const raceEntries = useMemo(() => Array.from(state.raceData.values()), [state.raceData]);

  // Ranking : 1 row per swimmer sorted by best total time ascending.
  const ranking = useMemo<RankingRow[]>(() => {
    return raceEntries
      .filter((e) => totalSplitCount(e.splitsByRep) > 0)
      .map((rs) => {
        const bestIdx = findBestSeriesIdx(rs.splitsByRep);
        const bestSplits = rs.splitsByRep[bestIdx] ?? [];
        const bestTotalMs = seriesTotalMs(bestSplits);
        const completedSeriesCount = rs.splitsByRep.filter((s) => s.length > 0).length;
        const waveState = state.waves.find((w) => w.wave === rs.swimmer.wave);
        const isCustomWave = waveState?.overrides != null;
        const resolved = resolveWaveConfig(state, rs.swimmer.wave);
        return {
          key: rs.swimmer.key,
          displayName: rs.swimmer.displayName,
          avatarUrl: rs.swimmer.avatarUrl,
          wave: rs.swimmer.wave,
          kind: rs.swimmer.kind,
          bestSeriesIdx: bestIdx,
          bestSplits,
          bestTotalMs,
          completedSeriesCount,
          isCustomWave,
          resolved,
        };
      })
      .sort((a, b) => a.bestTotalMs - b.bestTotalMs);
  }, [raceEntries, state]);

  const maxSplits = useMemo(
    () => Math.max(0, ...ranking.map((r) => r.bestSplits.length)),
    [ranking],
  );

  const swimmersWithoutSplits = raceEntries.length - ranking.length;
  const leaderMs = ranking[0]?.bestTotalMs ?? 0;

  // Config summary caption : "5 nageurs · 100 m · splits 50 m"
  const configSummary = useMemo(() => {
    const parts: string[] = [];
    parts.push(`${ranking.length} nageur${ranking.length > 1 ? "s" : ""}`);
    if (state.totalDistanceM > 0) {
      parts.push(`${state.seriesCount > 0 ? `${state.seriesCount} × ` : ""}${state.totalDistanceM} m`);
    }
    if (state.splitDistanceM > 0) parts.push(`splits ${state.splitDistanceM} m`);
    return parts.join(" · ");
  }, [ranking.length, state.totalDistanceM, state.splitDistanceM, state.seriesCount]);

  const handleSaveDraft = useCallback(async () => {
    if (savingDraft) return;
    setSavingDraft(true);
    try {
      await createChronoRecord(buildChronoRecordInput(state, "draft"));
      toast.success("Brouillon enregistré");
      onSaveDraft?.();
    } catch (err: any) {
      if (isRetriableError(err)) {
        enqueue({ kind: "record", payload: buildChronoRecordInput(state, "draft"), createdAt: Date.now() });
        toast.info("Brouillon sauvegardé localement — renvoi auto dès retour réseau");
        onSaveDraft?.();
      } else {
        toast.error(err.message || "Erreur de sauvegarde");
      }
    } finally {
      setSavingDraft(false);
    }
  }, [state, onSaveDraft, savingDraft]);

  const handleExportXlsx = useCallback(async () => {
    setExportingXlsx(true);
    try {
      const input = buildChronoRecordInput(state, "draft");
      await exportChronoToXlsx({
        label: input.label,
        config: input.config,
        swimmers: input.swimmers,
        created_at: new Date().toISOString(),
      });
      toast.success("Fichier téléchargé");
    } catch (err: any) {
      toast.error(err?.message || "Échec de l'export");
    } finally {
      setExportingXlsx(false);
    }
  }, [state]);

  const handleExportAll = useCallback(async () => {
    setSending(true);
    // Skip manual swimmers — they have no auth account to push logs to
    const swimmers = raceEntries.filter(
      (e) => e.swimmer.kind === "registered" && totalSplitCount(e.splitsByRep) > 0,
    );

    if (swimmers.length === 0) {
      toast.error("Aucun split à exporter");
      setSending(false);
      return;
    }

    const results = await Promise.allSettled(
      swimmers.map(async (raceState) => {
        const { swimmer, splitsByRep } = raceState;
        const authUid = await resolveAuthUid(swimmer.athleteId!);
        if (!authUid) throw new Error(`UUID introuvable pour ${swimmer.displayName}`);

        const repCount = splitsByRep.filter((s) => s.length > 0).length;
        const log: SwimExerciseLogInput = {
          exercise_label: "Chrono coach",
          split_times: flattenSplits(splitsByRep),
          notes: `Série chrono — Ligne ${swimmer.lane}${repCount > 1 ? ` — ${repCount} séries` : ""}`,
        };
        await createStandaloneSwimLog(authUid, log);
        return swimmer.key;
      }),
    );

    const newStatuses = new Map(exportStatuses);
    let successCount = 0;
    let errorCount = 0;

    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      const entry = swimmers[i];
      const key = entry.swimmer.key;
      if (result.status === "fulfilled") {
        newStatuses.set(key, "sent");
        successCount++;
      } else if (isRetriableError(result.reason)) {
        const authUid = await resolveAuthUid(entry.swimmer.athleteId!).catch(() => null);
        if (authUid) {
          enqueue({
            kind: "export",
            payload: {
              authUid,
              log: {
                exercise_label: "Chrono coach",
                split_times: flattenSplits(entry.splitsByRep),
                notes: `Série chrono — Ligne ${entry.swimmer.lane}`,
              },
            },
            createdAt: Date.now(),
          });
          newStatuses.set(key, "sent");
          successCount++;
        } else {
          newStatuses.set(key, "error");
          errorCount++;
        }
      } else {
        newStatuses.set(key, "error");
        errorCount++;
      }
    }

    setExportStatuses(newStatuses);
    setSending(false);

    try {
      await createChronoRecord(buildChronoRecordInput(state, "sent"));
    } catch (err) {
      if (isRetriableError(err)) {
        enqueue({ kind: "record", payload: buildChronoRecordInput(state, "sent"), createdAt: Date.now() });
      }
    }

    if (errorCount === 0) {
      toast.success(`${successCount} résultat${successCount > 1 ? "s" : ""} envoyé${successCount > 1 ? "s" : ""}`);
      onExportComplete?.();
    } else {
      toast.error(`${errorCount} erreur${errorCount > 1 ? "s" : ""} sur ${swimmers.length} envoi${swimmers.length > 1 ? "s" : ""}`);
    }
  }, [raceEntries, exportStatuses, onExportComplete, state]);

  // Grid columns definition — keep fixed widths for alignment stability.
  // [Rank] [Name] [Wave] [Total] [splits...] [Δ 1er] [Status]
  const splitLabels = useMemo(() => {
    if (maxSplits === 0) return [] as string[];
    if (state.splitDistanceM > 0) {
      return Array.from({ length: maxSplits }, (_, i) => `${(i + 1) * state.splitDistanceM} m`);
    }
    return Array.from({ length: maxSplits }, (_, i) => `#${i + 1}`);
  }, [maxSplits, state.splitDistanceM]);

  const showDiff = ranking.length > 1;
  const gridTemplate = [
    "48px",                              // rank
    "minmax(160px, 1.4fr)",              // name
    "48px",                              // wave
    "minmax(96px, auto)",                // total
    ...splitLabels.map(() => "minmax(72px, auto)"),
    ...(showDiff ? ["minmax(72px, auto)"] : []),
    "minmax(110px, auto)",               // status
  ].join(" ");

  return (
    <div className="flex flex-col gap-4">
      {/* ── Header — title + meta + actions ── */}
      <section className="flex flex-col gap-3">
        <div className="flex items-baseline gap-3">
          <span className="text-[10px] font-black uppercase tracking-[0.22em] text-primary/80">
            Résultats
          </span>
          <span className="text-[11px] text-muted-foreground">{configSummary}</span>
          <span className="h-px flex-1 bg-border/60" />
          <span className="text-[10px] text-muted-foreground/80 tabular-nums" title={CHRONO_PRECISION.tooltip}>
            {CHRONO_PRECISION.precision}
          </span>
        </div>

        <input
          type="text"
          placeholder="Nommer cette séance…"
          value={state.title}
          onChange={(e) => dispatch({ type: "SET_TITLE", title: e.target.value })}
          className="w-full bg-transparent text-2xl font-black tracking-tight text-foreground placeholder:font-semibold placeholder:italic placeholder:text-muted-foreground/50 outline-none focus:placeholder:text-muted-foreground/30 transition-colors"
          aria-label="Titre de la séance"
        />

        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleSaveDraft}
            disabled={sending || savingDraft || exportingXlsx}
            className="gap-1.5"
          >
            {savingDraft ? <Loader2 className="h-4 w-4 animate-spin" /> : <Clock className="h-4 w-4" />}
            Brouillon
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleExportXlsx}
            disabled={sending || exportingXlsx}
            className="gap-1.5"
          >
            {exportingXlsx ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            Exporter xlsx
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => dispatch({ type: "RESET_FOR_NEW_SERIES" })}
            disabled={sending}
            className="gap-1.5"
          >
            <RotateCcw className="h-4 w-4" />
            Nouvelle série
          </Button>
          <Button
            size="sm"
            onClick={handleExportAll}
            disabled={sending || ranking.length === 0}
            className="ml-auto gap-1.5"
          >
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            Envoyer à tous
          </Button>
        </div>
      </section>

      {/* ── Ranking table ── */}
      {ranking.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border/60 py-12 text-center text-sm text-muted-foreground">
          Aucun temps enregistré.
        </div>
      ) : (
        <div className="rounded-xl border bg-card overflow-x-auto">
          <div className="min-w-full">
            {/* Header row */}
            <div
              className="grid items-center gap-3 border-b border-border bg-muted/40 px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-muted-foreground"
              style={{ gridTemplateColumns: gridTemplate }}
            >
              <div className="text-center">#</div>
              <div>Nageur</div>
              <div className="text-center">V.</div>
              <div className="text-right">Total</div>
              {splitLabels.map((lbl, i) => (
                <div key={`h-${i}`} className="text-right tabular-nums">
                  {lbl}
                </div>
              ))}
              {showDiff && <div className="text-right">Δ 1er</div>}
              <div className="text-right">Statut</div>
            </div>

            {/* Data rows */}
            {ranking.map((r, idx) => (
              <RankRow
                key={r.key}
                row={r}
                idx={idx}
                leaderMs={leaderMs}
                gridTemplate={gridTemplate}
                splitLabels={splitLabels}
                showDiff={showDiff}
                status={exportStatuses.get(r.key)}
              />
            ))}
          </div>
        </div>
      )}

      {swimmersWithoutSplits > 0 && (
        <p className="text-center text-[11px] italic text-muted-foreground">
          {swimmersWithoutSplits} nageur{swimmersWithoutSplits > 1 ? "s sans temps enregistré — ignoré" : " sans temps enregistré — ignoré"}{swimmersWithoutSplits > 1 ? "s" : ""}.
        </p>
      )}

      {/* ── Discard button ── */}
      <div className="flex justify-center pt-1 pb-4">
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive hover:bg-destructive/10 gap-1.5" disabled={sending}>
              <Trash2 className="h-4 w-4" />
              Supprimer les résultats
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

// ── Ranking row ──────────────────────────────────────────────────────

function RankRow({
  row,
  idx,
  leaderMs,
  gridTemplate,
  splitLabels,
  showDiff,
  status,
}: {
  row: RankingRow;
  idx: number;
  leaderMs: number;
  gridTemplate: string;
  splitLabels: string[];
  showDiff: boolean;
  status?: ExportStatus;
}) {
  const wc = WAVE_COLORS[(row.wave - 1) % WAVE_COLORS.length];
  const isLeader = idx === 0;
  const diffMs = row.bestTotalMs - leaderMs;
  const isManual = row.kind === "manual";

  // Build the "Personnalisée : …" label only for customized waves.
  let customLabel = "";
  if (row.isCustomWave) {
    const head: string[] = [];
    if (row.resolved.seriesCount > 0) head.push(`${row.resolved.seriesCount}×`);
    if (row.resolved.totalDistanceM > 0) head.push(`${row.resolved.totalDistanceM}m`);
    const parts: string[] = [];
    if (head.length > 0) parts.push(head.join(""));
    if (row.resolved.splitDistanceM > 0) parts.push(`splits ${row.resolved.splitDistanceM}m`);
    customLabel = parts.join(" ");
  }

  return (
    <div
      className={`grid items-center gap-3 border-b border-border/50 px-3 py-2 transition-colors last:border-b-0 ${
        isLeader ? "bg-amber-500/5" : "hover:bg-muted/30"
      }`}
      style={{ gridTemplateColumns: gridTemplate }}
    >
      {/* Rank */}
      <div
        className={`flex items-center justify-center text-lg ${
          idx < 3 ? "" : "text-sm font-bold text-muted-foreground tabular-nums"
        }`}
        title={`Rang ${idx + 1}`}
      >
        {rankPodium(idx)}
      </div>

      {/* Name + meta */}
      <div className="flex flex-col min-w-0">
        <div className="flex items-center gap-1.5 min-w-0">
          <SwimmerAvatar swimmer={{ displayName: row.displayName, avatarUrl: row.avatarUrl }} size="xs" className="shrink-0" />
          {isManual && (
            <UserRound className="h-3 w-3 shrink-0 text-muted-foreground/70" aria-label="Nageur manuel" />
          )}
          <span className={`truncate text-sm font-semibold ${isLeader ? "text-foreground" : "text-foreground"}`}>
            {row.displayName}
          </span>
        </div>
        {row.isCustomWave && (
          <span
            className={`mt-0.5 inline-flex w-fit items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium ${wc.bg} ${wc.text}`}
          >
            <Check className="h-2.5 w-2.5" />
            Personnalisée{customLabel ? ` : ${customLabel}` : ""}
          </span>
        )}
        {row.completedSeriesCount > 1 && (
          <span className="text-[10px] text-muted-foreground leading-tight mt-0.5">
            Meilleure · série {row.bestSeriesIdx + 1} sur {row.completedSeriesCount}
          </span>
        )}
        {isManual && (
          <span className="text-[10px] italic text-muted-foreground/70 leading-tight mt-0.5">
            Manuel
          </span>
        )}
      </div>

      {/* Wave chip */}
      <div className="flex justify-center">
        <span
          className={`inline-flex items-center justify-center rounded-full px-2 py-0.5 text-[10px] font-black text-white tabular-nums ${wc.dot}`}
        >
          {wc.label}
        </span>
      </div>

      {/* Total — hero time */}
      <div
        className={`text-right font-mono tabular-nums text-lg font-black leading-tight ${
          isLeader ? "text-amber-600 dark:text-amber-400" : "text-foreground"
        }`}
      >
        {formatTime(row.bestTotalMs)}
      </div>

      {/* Split columns */}
      {splitLabels.map((_, i) => {
        const split = row.bestSplits[i];
        return (
          <div
            key={`c-${i}`}
            className="text-right font-mono tabular-nums text-sm text-muted-foreground leading-tight"
          >
            {split ? formatTime(split.cumulativeMs) : <span className="text-muted-foreground/70">—</span>}
          </div>
        );
      })}

      {/* Δ 1er */}
      {showDiff && (
        <div
          className={`text-right font-mono tabular-nums text-sm font-semibold leading-tight ${
            isLeader
              ? "text-muted-foreground/70"
              : diffMs <= 1000
                ? "text-green-600 dark:text-green-400"
                : diffMs <= 3000
                  ? "text-amber-600 dark:text-amber-400"
                  : "text-muted-foreground"
          }`}
        >
          {formatDiff(diffMs)}
        </div>
      )}

      {/* Status */}
      <div className="flex justify-end">
        <ExportStatusBadge status={status} kind={row.kind} />
      </div>
    </div>
  );
}

// ── Export status badge ──────────────────────────────────────────────

function ExportStatusBadge({ status, kind }: { status?: ExportStatus; kind?: "registered" | "manual" }) {
  if (kind === "manual") {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground/70 italic">
        Fichier seul
      </span>
    );
  }
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
