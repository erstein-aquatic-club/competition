import { useRef, useCallback } from "react";
import type { ChronoState } from "../../lib/chrono-types";
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
import { Square, Play, CircleStop } from "lucide-react";
import { toast } from "sonner";

interface ChronoRaceProps {
  state: ChronoState;
  dispatch: React.Dispatch<ChronoAction>;
  now: number;
  getTimestamp: () => number;
}

// ── Wave Bar ────────────────────────────────────────────────────────

function WaveBar({
  waves,
  now,
  dispatch,
  getTimestamp,
  seriesCount,
}: {
  waves: ChronoState["waves"];
  now: number;
  dispatch: React.Dispatch<ChronoAction>;
  getTimestamp: () => number;
  seriesCount: number;
}) {

  return (
    <div className="grid grid-cols-1 gap-1.5 px-4 py-3 md:grid-cols-2 xl:grid-cols-3">
      {[...waves]
        .sort((a, b) => a.wave - b.wave)
        .map((w) => {
          const wc = WAVE_COLORS[w.wave - 1] ?? WAVE_COLORS[0];
          const launched = w.startedAt !== null;

          if (!launched) {
            return (
              <button
                key={w.wave}
                onClick={() =>
                  dispatch({
                    type: "LAUNCH_WAVE",
                    wave: w.wave,
                    timestamp: getTimestamp(),
                  })
                }
                className={`flex flex-col items-center justify-center rounded-xl ${wc.dot} min-w-[110px] h-16 animate-pulse active:scale-95 transition-transform cursor-pointer touch-manipulation shadow-md`}
              >
                <span className="text-[11px] font-bold uppercase tracking-widest text-white/80">
                  {wc.label}{w.currentRep > 0 ? ` S${w.currentRep + 1}${seriesCount > 0 ? `/${seriesCount}` : ""}` : ""}
                </span>
                <span className="flex items-center gap-1.5 text-lg font-black text-white">
                  <Play className="h-4 w-4 fill-current" /> GO
                </span>
              </button>
            );
          }

          const elapsed = now - (w.startedAt as number);
          const intervalMs = w.departureIntervalSec * 1000;
          const remainingMs = intervalMs > 0 ? intervalMs - elapsed : -1;
          const urgent = remainingMs >= 0 && remainingMs <= 15000;
          const overdue = remainingMs <= 0;

          return (
            <div key={w.wave} className="flex flex-col gap-0">
              {/* Recovery countdown — above the card */}
              {intervalMs > 0 && (
                <div
                  className={`flex items-center justify-center gap-1.5 rounded-t-xl px-3 py-1.5 font-mono tabular-nums font-black transition-colors ${
                    overdue
                      ? "bg-destructive text-destructive-foreground"
                      : urgent
                        ? "bg-destructive/90 text-destructive-foreground animate-pulse"
                        : "bg-muted text-foreground"
                  }`}
                >
                  <span className="text-[10px] font-semibold uppercase tracking-wider opacity-70">
                    Récup
                  </span>
                  <span className={`text-xl leading-none ${urgent || overdue ? "text-2xl" : ""}`}>
                    {overdue ? `+${formatTime(-remainingMs)}` : formatTime(remainingMs)}
                  </span>
                </div>
              )}

              {/* Wave card */}
              <div
                className={`flex items-center gap-3 ${intervalMs > 0 ? "rounded-b-xl" : "rounded-xl"} border-2 ${wc.border} bg-card overflow-hidden px-4 py-2`}
              >
                {/* Left: wave info */}
                <div className="flex flex-col items-center gap-0.5 shrink-0">
                  <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold text-white ${wc.dot}`}>
                    {wc.label}
                  </span>
                  <span className="text-[10px] font-medium text-muted-foreground">
                    Série {w.currentRep + 1}{seriesCount > 0 ? `/${seriesCount}` : ""}
                  </span>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      dispatch({ type: "NEXT_REP", wave: w.wave });
                    }}
                    className="mt-0.5 rounded px-1.5 py-0.5 text-[9px] font-bold uppercase border border-border text-muted-foreground hover:bg-muted active:scale-95 transition-all touch-manipulation"
                  >
                    Série suiv.
                  </button>
                </div>

                {/* Right: elapsed chrono */}
                <div className="flex flex-col items-end ml-auto">
                  <span className={`font-mono tabular-nums font-bold tracking-tight ${intervalMs > 0 ? "text-base text-muted-foreground" : "text-xl text-foreground"}`}>
                    {formatTime(elapsed)}
                  </span>
                </div>
              </div>
            </div>
          );
        })}
    </div>
  );
}

// ── Swimmer Split Card ──────────────────────────────────────────────

function SwimmerCard({
  athleteId,
  displayName,
  wave,
  waveStartedAt,
  currentSplits,
  swimmerStoppedAt,
  totalReps,
  splitDistanceM,
  now,
  dispatch,
  getTimestamp,
}: {
  athleteId: number;
  displayName: string;
  wave: number;
  waveStartedAt: number | null;
  currentSplits: { cumulativeMs: number; lapMs: number }[];
  swimmerStoppedAt: number | null;
  totalReps: number;
  splitDistanceM: number;
  now: number;
  dispatch: React.Dispatch<ChronoAction>;
  getTimestamp: () => number;
}) {
  const lastTapRef = useRef(0);
  const flashRef = useRef<HTMLDivElement>(null);
  const wc = WAVE_COLORS[wave - 1] ?? WAVE_COLORS[0];
  const launched = waveStartedAt !== null;
  const stopped = swimmerStoppedAt !== null;
  const active = launched && !stopped;

  const handleTap = useCallback(() => {
    if (!active) return;

    const tapTime = Date.now();
    const gap = tapTime - lastTapRef.current;
    lastTapRef.current = tapTime;

    if (gap < 300 && gap > 0) {
      dispatch({ type: "UNDO_SPLIT", athleteId });
      toast("Split annulé", { duration: 1500 });
      lastTapRef.current = 0;
      return;
    }

    dispatch({ type: "RECORD_SPLIT", athleteId, timestamp: getTimestamp() });
    navigator.vibrate?.(50);

    const el = flashRef.current;
    if (el) {
      el.style.opacity = "0.3";
      requestAnimationFrame(() => {
        setTimeout(() => {
          el.style.opacity = "0";
        }, 100);
      });
    }
  }, [active, dispatch, athleteId, getTimestamp]);

  const handleStop = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    dispatch({ type: "STOP_SWIMMER", athleteId, timestamp: getTimestamp() });
    navigator.vibrate?.([50, 30, 50]);
    toast(`${displayName} — Stoppé`, { duration: 2000 });
  }, [dispatch, athleteId, getTimestamp, displayName]);

  const elapsed = launched
    ? (stopped ? swimmerStoppedAt : now) - waveStartedAt
    : 0;
  const lastSplit = currentSplits.length > 0 ? currentSplits[currentSplits.length - 1] : null;

  return (
    <div
      role="button"
      tabIndex={active ? 0 : -1}
      onClick={handleTap}
      className={`relative rounded-xl border-l-4 ${wc.border} border border-border overflow-hidden touch-manipulation ${
        stopped
          ? "bg-muted opacity-60"
          : active
            ? "bg-card active:scale-[0.97] cursor-pointer shadow transition-transform"
            : "bg-muted/50 opacity-25 pointer-events-none"
      }`}
    >
      {/* Flash overlay */}
      <div
        ref={flashRef}
        className="pointer-events-none absolute inset-0 bg-primary opacity-0 transition-opacity duration-100"
      />

      {/* ── Row 1: Name ── */}
      <div className="flex items-center gap-2 px-3 pt-3 pb-0.5">
        <span className={`text-base font-bold leading-snug min-w-0 truncate ${stopped ? "text-muted-foreground" : "text-foreground"}`}>
          {displayName}
        </span>
        <div className="ml-auto flex items-center gap-1.5 shrink-0">
          {active && (
            <button
              type="button"
              onClick={handleStop}
              className="flex h-7 w-7 items-center justify-center rounded-md bg-destructive/15 text-destructive hover:bg-destructive/30 active:scale-90 transition-all"
            >
              <CircleStop className="h-3.5 w-3.5" />
            </button>
          )}
          {stopped && (
            <span className="rounded bg-destructive px-1.5 py-0.5 text-[9px] font-bold uppercase text-destructive-foreground">
              Stop
            </span>
          )}
          <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold text-white ${wc.dot}`}>
            {wc.label}
          </span>
        </div>
      </div>

      {/* ── Row 2: Chrono ── */}
      <div className="px-3 py-1.5">
        <span className={`font-mono tabular-nums text-3xl font-black leading-none tracking-tight ${stopped ? "text-muted-foreground" : "text-foreground"}`}>
          {launched ? formatTime(elapsed) : "--:--.--"}
        </span>
      </div>

      {/* ── Row 3: Split info ── */}
      <div className="px-3 pb-3 pt-0.5">
        {launched && lastSplit ? (
          <div className="flex items-baseline gap-2">
            <span className={`text-xs font-bold text-white rounded px-1 py-0.5 ${wc.dot}`}>
              {splitDistanceM > 0 ? `${currentSplits.length * splitDistanceM}m` : `#${currentSplits.length}`}
            </span>
            <span className="font-mono tabular-nums text-sm font-semibold text-foreground">
              {formatTime(lastSplit.cumulativeMs)}
            </span>
            <span className="font-mono tabular-nums text-xs text-muted-foreground">
              ({formatLap(lastSplit.lapMs)})
            </span>
          </div>
        ) : active ? (
          <span className="text-sm text-muted-foreground">Tap pour split</span>
        ) : !launched ? (
          <span className="text-xs text-muted-foreground/50">En attente</span>
        ) : null}
      </div>
    </div>
  );
}

// ── Lane Grid ───────────────────────────────────────────────────────

function LaneSection({
  lane,
  swimmers,
  waves,
  raceData,
  splitDistanceM,
  now,
  dispatch,
  getTimestamp,
}: {
  lane: number;
  swimmers: ChronoState["swimmers"];
  waves: ChronoState["waves"];
  raceData: ChronoState["raceData"];
  splitDistanceM: number;
  now: number;
  dispatch: React.Dispatch<ChronoAction>;
  getTimestamp: () => number;
}) {
  const laneSwimmers = swimmers.filter((s) => s.lane === lane);
  if (laneSwimmers.length === 0) return null;

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-3 px-4">
        <div className="h-px flex-1 bg-border" />
        <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          Ligne {lane}
        </h3>
        <div className="h-px flex-1 bg-border" />
      </div>
      <div className="grid grid-cols-1 gap-3 px-4 md:grid-cols-2 xl:grid-cols-3">
        {laneSwimmers.map((s) => {
          const waveState = waves.find((w) => w.wave === s.wave);
          const race = raceData.get(s.athleteId);
          return (
            <SwimmerCard
              key={s.athleteId}
              athleteId={s.athleteId}
              displayName={s.displayName}
              wave={s.wave}
              waveStartedAt={waveState?.startedAt ?? null}
              currentSplits={race ? race.splitsByRep[race.splitsByRep.length - 1] : []}
              swimmerStoppedAt={race?.stoppedAt ?? null}
              totalReps={race?.splitsByRep.length ?? 1}
              splitDistanceM={splitDistanceM}
              now={now}
              dispatch={dispatch}
              getTimestamp={getTimestamp}
            />
          );
        })}
      </div>
    </div>
  );
}

// ── Main Component ──────────────────────────────────────────────────

export default function ChronoRace({
  state,
  dispatch,
  now,
  getTimestamp,
}: ChronoRaceProps) {
  const lanes = Array.from({ length: state.laneCount }, (_, i) => i + 1);

  return (
    <div className="flex min-h-dvh flex-col bg-background">
      {/* Sticky top bar: waves + stop button */}
      <div className="sticky top-0 z-20 border-b border-border bg-background/95 backdrop-blur-sm">
        <div className="flex items-center gap-2">
          <div className="flex-1 overflow-hidden">
            <WaveBar
              waves={state.waves}
              now={now}
              dispatch={dispatch}
              getTimestamp={getTimestamp}
              seriesCount={state.seriesCount}
            />
          </div>
          <div className="pr-4 shrink-0">
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  variant="destructive"
                  size="sm"
                  className="gap-1.5 whitespace-nowrap font-semibold"
                >
                  <Square className="h-4 w-4 fill-current" />
                  Terminer
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Terminer la série ?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Tous les chronos seront arrêtés.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Annuler</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() =>
                      dispatch({
                        type: "STOP_RACE",
                        timestamp: getTimestamp(),
                      })
                    }
                  >
                    Confirmer
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>
      </div>

      {/* Lane grid — full width */}
      <div className="flex-1 space-y-4 py-4">
        {lanes.map((lane) => (
          <LaneSection
            key={lane}
            lane={lane}
            swimmers={state.swimmers}
            waves={state.waves}
            raceData={state.raceData}
            splitDistanceM={state.splitDistanceM}
            now={now}
            dispatch={dispatch}
            getTimestamp={getTimestamp}
          />
        ))}
      </div>
    </div>
  );
}
