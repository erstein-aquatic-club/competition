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

/* ── Vivid wave accent colors for scoreboard contrast ──────────── */
const WAVE_ACCENTS = [
  { bg: "bg-cyan-500",    bgMuted: "bg-cyan-950",    border: "border-cyan-400",    text: "text-cyan-300",    glow: "shadow-cyan-500/40" },
  { bg: "bg-orange-500",  bgMuted: "bg-orange-950",  border: "border-orange-400",  text: "text-orange-300",  glow: "shadow-orange-500/40" },
  { bg: "bg-emerald-500", bgMuted: "bg-emerald-950", border: "border-emerald-400", text: "text-emerald-300", glow: "shadow-emerald-500/40" },
  { bg: "bg-pink-500",    bgMuted: "bg-pink-950",    border: "border-pink-400",    text: "text-pink-300",    glow: "shadow-pink-500/40" },
  { bg: "bg-yellow-500",  bgMuted: "bg-yellow-950",  border: "border-yellow-400",  text: "text-yellow-300",  glow: "shadow-yellow-500/40" },
  { bg: "bg-purple-500",  bgMuted: "bg-purple-950",  border: "border-purple-400",  text: "text-purple-300",  glow: "shadow-purple-500/40" },
] as const;

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
    <div className="flex gap-3 px-4 py-3">
      {[...waves]
        .sort((a, b) => a.wave - b.wave)
        .map((w) => {
          const wc = WAVE_COLORS[w.wave - 1] ?? WAVE_COLORS[0];
          const accent = WAVE_ACCENTS[(w.wave - 1) % WAVE_ACCENTS.length];
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
                className={`flex flex-col items-center justify-center rounded-2xl ${accent.bg} min-w-[120px] h-[72px] shadow-lg ${accent.glow} animate-pulse active:scale-95 transition-transform cursor-pointer`}
              >
                <span className="text-[11px] font-bold uppercase tracking-widest text-white/80">
                  {wc.label}
                </span>
                <span className="flex items-center gap-1.5 text-xl font-black text-white drop-shadow-md">
                  <Play className="h-5 w-5 fill-current" /> GO
                </span>
              </button>
            );
          }

          const elapsed = now - (w.startedAt as number);
          return (
            <div
              key={w.wave}
              className={`flex flex-col items-center justify-center rounded-2xl border-2 ${accent.border} ${accent.bgMuted} min-w-[120px] h-[72px] px-4`}
            >
              <span className={`text-[10px] font-semibold uppercase tracking-wider ${accent.text}`}>
                {wc.label} — En course
              </span>
              <span className="font-mono tabular-nums text-2xl font-black text-white tracking-tight">
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
  const wc = WAVE_COLORS[wave - 1] ?? WAVE_COLORS[0];
  const accent = WAVE_ACCENTS[(wave - 1) % WAVE_ACCENTS.length];
  const launched = waveStartedAt !== null;

  const handleTap = useCallback(() => {
    if (!launched) return;

    const tapTime = performance.now();
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
      el.style.opacity = "0.35";
      requestAnimationFrame(() => {
        setTimeout(() => {
          el.style.opacity = "0";
        }, 100);
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
      className={`relative flex flex-col rounded-xl border-l-[5px] ${accent.border} text-left transition-all select-none min-h-[120px] ${
        launched
          ? "bg-zinc-900 active:scale-[0.97] cursor-pointer shadow-md hover:bg-zinc-800/90"
          : "bg-zinc-900/30 opacity-30 pointer-events-none border-l-zinc-700"
      }`}
    >
      {/* Flash overlay */}
      <div
        ref={flashRef}
        className="pointer-events-none absolute inset-0 rounded-xl bg-white opacity-0 transition-opacity duration-150"
      />

      {/* Header: name + wave chip */}
      <div className="flex w-full items-center gap-2 px-3 pt-3 pb-1">
        <span className="truncate text-sm font-semibold text-zinc-100">
          {displayName}
        </span>
        <span
          className={`ml-auto flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold ${accent.bgMuted} ${accent.text} border ${accent.border}`}
        >
          <span className={`inline-block h-2 w-2 rounded-full ${accent.bg}`} />
          {wc.label}
        </span>
      </div>

      {/* Running chrono — THE MAIN ELEMENT */}
      <div className="flex-1 flex items-center px-3">
        <span className="font-mono tabular-nums text-[2rem] font-black text-white tracking-tight leading-none drop-shadow-sm">
          {launched ? formatTime(elapsed) : "--:--.--"}
        </span>
      </div>

      {/* Split info */}
      <div className="px-3 pb-2.5 pt-1">
        {launched && lastSplit ? (
          <div className="flex w-full items-baseline gap-2">
            <span className={`text-xs font-bold ${accent.text}`}>
              Split {splits.length}
            </span>
            <span className="font-mono tabular-nums text-sm font-semibold text-zinc-300">
              {formatTime(lastSplit.cumulativeMs)}
            </span>
            <span className="font-mono tabular-nums text-xs text-zinc-500">
              ({formatLap(lastSplit.lapMs)})
            </span>
          </div>
        ) : launched ? (
          <span className="text-xs font-medium text-zinc-500">
            Tap pour split
          </span>
        ) : (
          <span className="text-xs text-zinc-600">
            En attente
          </span>
        )}
      </div>
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
      <div className="flex items-center gap-2 px-4">
        <div className="h-px flex-1 bg-zinc-800" />
        <h3 className="text-xs font-bold uppercase tracking-[0.2em] text-zinc-500">
          Ligne {lane}
        </h3>
        <div className="h-px flex-1 bg-zinc-800" />
      </div>
      <div className="grid grid-cols-2 gap-2.5 px-4 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
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
    <div className="flex min-h-dvh flex-col bg-black">
      {/* Sticky top bar: waves + stop button */}
      <div className="sticky top-0 z-20 border-b border-zinc-800 bg-black/95 backdrop-blur-sm">
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
          <div className="pr-4">
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  variant="destructive"
                  size="sm"
                  className="gap-1.5 whitespace-nowrap font-bold shadow-lg shadow-red-900/30"
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

      {/* Lane grid */}
      <div className="flex-1 space-y-5 py-5">
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
