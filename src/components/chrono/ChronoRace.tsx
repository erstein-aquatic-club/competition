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
import { Square, Play } from "lucide-react";
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
}: {
  waves: ChronoState["waves"];
  now: number;
  dispatch: React.Dispatch<ChronoAction>;
  getTimestamp: () => number;
}) {
  return (
    <div className="flex gap-2 overflow-x-auto px-3 py-2">
      {[...waves]
        .sort((a, b) => a.wave - b.wave)
        .map((w) => {
          const color = WAVE_COLORS[w.wave - 1] ?? WAVE_COLORS[0];
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
                className={`flex flex-col items-center justify-center rounded-xl border-2 ${color.border} ${color.bg} min-w-[100px] h-16 animate-pulse active:scale-95 transition-transform`}
              >
                <span className={`text-xs font-medium ${color.text}`}>
                  {color.label}
                </span>
                <span className="flex items-center gap-1 text-lg font-bold text-white">
                  <Play className="h-4 w-4 fill-current" /> GO
                </span>
              </button>
            );
          }

          const elapsed = now - (w.startedAt as number);
          return (
            <div
              key={w.wave}
              className={`flex flex-col items-center justify-center rounded-xl border-2 ${color.border} ${color.bg} min-w-[100px] h-16 px-3`}
            >
              <span className={`text-[10px] font-medium ${color.text}`}>
                {color.label} — En course
              </span>
              <span className="font-mono tabular-nums text-lg font-bold text-white">
                {formatTime(elapsed)}
              </span>
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
  splits,
  now,
  dispatch,
  getTimestamp,
}: {
  athleteId: number;
  displayName: string;
  wave: number;
  waveStartedAt: number | null;
  splits: { cumulativeMs: number; lapMs: number }[];
  now: number;
  dispatch: React.Dispatch<ChronoAction>;
  getTimestamp: () => number;
}) {
  const lastTapRef = useRef(0);
  const flashRef = useRef<HTMLDivElement>(null);
  const color = WAVE_COLORS[wave - 1] ?? WAVE_COLORS[0];
  const launched = waveStartedAt !== null;

  const handleTap = useCallback(() => {
    if (!launched) return;

    const tapTime = performance.now();
    const gap = tapTime - lastTapRef.current;
    lastTapRef.current = tapTime;

    if (gap < 300 && gap > 0) {
      // Double-tap → undo
      dispatch({ type: "UNDO_SPLIT", athleteId });
      toast("Split annulé", { duration: 1500 });
      lastTapRef.current = 0; // reset to avoid triple-tap undo
      return;
    }

    // Single tap → record split
    dispatch({ type: "RECORD_SPLIT", athleteId, timestamp: getTimestamp() });
    navigator.vibrate?.(50);

    // Flash feedback
    const el = flashRef.current;
    if (el) {
      el.style.opacity = "0.3";
      requestAnimationFrame(() => {
        setTimeout(() => {
          el.style.opacity = "0";
        }, 80);
      });
    }
  }, [launched, dispatch, athleteId, getTimestamp]);

  const elapsed = launched ? now - waveStartedAt : 0;
  const lastSplit = splits.length > 0 ? splits[splits.length - 1] : null;

  return (
    <button
      type="button"
      disabled={!launched}
      onClick={handleTap}
      className={`relative flex flex-col items-start rounded-xl border-l-4 ${color.border} p-3 text-left transition-transform select-none min-h-[100px] ${
        launched
          ? `${color.bg} active:scale-95 cursor-pointer`
          : "bg-muted/30 opacity-40 pointer-events-none"
      }`}
    >
      {/* Flash overlay */}
      <div
        ref={flashRef}
        className="pointer-events-none absolute inset-0 rounded-xl bg-white opacity-0 transition-opacity duration-150"
      />

      {/* Header: name + wave chip */}
      <div className="flex w-full items-center gap-2">
        <span className="truncate text-sm font-medium text-white">
          {displayName}
        </span>
        <span
          className={`ml-auto flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${color.bg} ${color.text}`}
        >
          <span className={`inline-block h-1.5 w-1.5 rounded-full ${color.dot}`} />
          {color.label}
        </span>
      </div>

      {/* Running chrono */}
      <span className="mt-1 font-mono tabular-nums text-2xl font-bold text-white">
        {launched ? formatTime(elapsed) : "--:--.--"}
      </span>

      {/* Split info */}
      {launched && lastSplit ? (
        <div className="mt-auto flex w-full items-baseline gap-2 text-xs text-muted-foreground">
          <span className="font-medium">Split {splits.length}</span>
          <span className="font-mono tabular-nums">
            {formatTime(lastSplit.cumulativeMs)}
          </span>
          <span className="font-mono tabular-nums text-[10px] opacity-70">
            ({formatLap(lastSplit.lapMs)})
          </span>
        </div>
      ) : launched ? (
        <span className="mt-auto text-xs text-muted-foreground/60">
          Tap pour split
        </span>
      ) : (
        <span className="mt-auto text-xs text-muted-foreground/40">
          En attente
        </span>
      )}
    </button>
  );
}

// ── Lane Grid ───────────────────────────────────────────────────────

function LaneSection({
  lane,
  swimmers,
  waves,
  raceData,
  now,
  dispatch,
  getTimestamp,
}: {
  lane: number;
  swimmers: ChronoState["swimmers"];
  waves: ChronoState["waves"];
  raceData: ChronoState["raceData"];
  now: number;
  dispatch: React.Dispatch<ChronoAction>;
  getTimestamp: () => number;
}) {
  const laneSwimmers = swimmers.filter((s) => s.lane === lane);
  if (laneSwimmers.length === 0) return null;

  return (
    <div className="space-y-2">
      <h3 className="px-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        Ligne {lane}
      </h3>
      <div className="grid grid-cols-2 gap-2 px-3 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
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
              splits={race?.splits ?? []}
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
      <div className="sticky top-0 z-20 border-b border-border/40 bg-background/95 backdrop-blur-sm">
        <div className="flex items-center gap-2">
          <div className="flex-1 overflow-hidden">
            <WaveBar
              waves={state.waves}
              now={now}
              dispatch={dispatch}
              getTimestamp={getTimestamp}
            />
          </div>

          {/* Stop button */}
          <div className="pr-3">
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  variant="destructive"
                  size="sm"
                  className="gap-1.5 whitespace-nowrap"
                >
                  <Square className="h-4 w-4" />
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

      {/* Lane grid */}
      <div className="flex-1 space-y-4 py-4">
        {lanes.map((lane) => (
          <LaneSection
            key={lane}
            lane={lane}
            swimmers={state.swimmers}
            waves={state.waves}
            raceData={state.raceData}
            now={now}
            dispatch={dispatch}
            getTimestamp={getTimestamp}
          />
        ))}
      </div>
    </div>
  );
}
