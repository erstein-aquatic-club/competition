import { useRef, useCallback, useEffect } from "react";
import type { ChronoState } from "../../lib/chrono-types";
import type { ChronoAction } from "../../lib/chrono-reducer";
import { formatTime, formatLap, formatPace, CHRONO_PRECISION } from "../../hooks/useChronoTimer";
import { Info, Gauge, Flag } from "lucide-react";
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
    <div className="flex flex-wrap gap-1.5 px-3 py-2 items-stretch">
      {[...waves]
        .sort((a, b) => a.wave - b.wave)
        .map((w) => {
          const wc = WAVE_COLORS[w.wave - 1] ?? WAVE_COLORS[0];
          const launched = w.startedAt !== null;
          const betweenReps = launched && w.lastFinishedAt !== null;

          // ── Case 1: never launched yet ──
          if (!launched) {
            return (
              <div key={w.wave} className="flex flex-col justify-end h-full flex-[1_1_130px] min-w-[130px] max-w-[220px]">
                <button
                  aria-label={`Lancer la vague ${wc.label}`}
                  onClick={() =>
                    dispatch({
                      type: "LAUNCH_WAVE",
                      wave: w.wave,
                      timestamp: getTimestamp(),
                    })
                  }
                  className={`flex flex-col items-center justify-center rounded-lg ${wc.dot} w-full h-12 animate-pulse active:scale-95 transition-transform cursor-pointer touch-manipulation shadow-sm`}
                >
                  <span className="text-[9px] font-bold uppercase tracking-widest text-white/80 leading-none mb-0.5">
                    {wc.label}{w.currentRep > 0 ? ` S${w.currentRep + 1}${seriesCount > 0 ? `/${seriesCount}` : ""}` : ""}
                  </span>
                  <span className="flex items-center gap-1 text-sm font-black text-white leading-none">
                    <Play className="h-3 w-3 fill-current" /> GO
                  </span>
                </button>
              </div>
            );
          }

          // ── Shared: departure countdown from startedAt ──
          const elapsed = now - (w.startedAt as number);
          const intervalMs = w.departureIntervalSec * 1000;
          const remainingMs = intervalMs > 0 ? intervalMs - elapsed : -1;
          const urgent = remainingMs >= 0 && remainingMs <= 15000;
          const overdue = remainingMs <= 0;

          // ── Case 2: between reps — countdown keeps running + GO button ──
          if (betweenReps) {
            const recoveryElapsed = now - (w.lastFinishedAt as number);

            return (
              <div key={w.wave} className="flex flex-col gap-0 h-full justify-end flex-[1_1_130px] min-w-[130px] max-w-[220px]">
                {/* Departure countdown — keeps ticking between reps */}
                {intervalMs > 0 ? (
                  <div
                    role="timer"
                    aria-label={
                      overdue
                        ? `Récupération dépassée de ${formatTime(-remainingMs)}`
                        : `Récupération restante ${formatTime(remainingMs)}`
                    }
                    className={`flex items-center justify-center gap-1 rounded-t-lg px-2 py-1 font-mono tabular-nums font-black transition-colors ${
                      overdue
                        ? "bg-destructive text-destructive-foreground"
                        : urgent
                          ? "bg-destructive/90 text-destructive-foreground animate-pulse"
                          : "bg-muted text-foreground"
                    }`}
                  >
                    <span className="text-[9px] font-semibold uppercase tracking-wider opacity-70 leading-none">
                      Récup
                    </span>
                    <span className={`text-sm leading-none ${urgent || overdue ? "text-base" : ""}`}>
                      {overdue ? `+${formatTime(-remainingMs)}` : formatTime(remainingMs)}
                    </span>
                  </div>
                ) : (
                  <div
                    role="timer"
                    aria-label={`Récupération en cours ${formatTime(recoveryElapsed)}`}
                    className="flex items-center justify-center gap-1 rounded-t-lg px-2 py-1 font-mono tabular-nums font-black bg-muted text-foreground"
                  >
                    <span className="text-[9px] font-semibold uppercase tracking-wider opacity-70 leading-none">
                      Récup
                    </span>
                    <span className="text-sm leading-none">
                      {formatTime(recoveryElapsed)}
                    </span>
                  </div>
                )}
                <button
                  aria-label={`Lancer la vague ${wc.label}`}
                  onClick={() =>
                    dispatch({
                      type: "LAUNCH_WAVE",
                      wave: w.wave,
                      timestamp: getTimestamp(),
                    })
                  }
                  className={`flex flex-col items-center justify-center rounded-b-lg ${wc.dot} w-full h-12 animate-pulse active:scale-95 transition-transform cursor-pointer touch-manipulation shadow-sm`}
                >
                  <span className="text-[9px] font-bold uppercase tracking-widest text-white/80 leading-none mb-0.5">
                    {wc.label} S{w.currentRep + 1}{seriesCount > 0 ? `/${seriesCount}` : ""}
                  </span>
                  <span className="flex items-center gap-1 text-sm font-black text-white leading-none">
                    <Play className="h-3 w-3 fill-current" /> GO
                  </span>
                </button>
              </div>
            );
          }

          // ── Case 3: actively racing ──
          return (
            <div key={w.wave} className="flex flex-col gap-0 h-full justify-end flex-[1_1_130px] min-w-[130px] max-w-[220px]">
              {/* Recovery countdown — above the card */}
              {intervalMs > 0 && (
                <div
                  role="timer"
                  aria-label={
                    overdue
                      ? `Récupération dépassée de ${formatTime(-remainingMs)}`
                      : `Récupération restante ${formatTime(remainingMs)}`
                  }
                  className={`flex items-center justify-center gap-1 rounded-t-lg px-2 py-0.5 font-mono tabular-nums font-black transition-colors ${
                    overdue
                      ? "bg-destructive text-destructive-foreground"
                      : urgent
                        ? "bg-destructive/90 text-destructive-foreground animate-pulse"
                        : "bg-muted text-foreground"
                  }`}
                >
                  <span className="text-[9px] font-semibold uppercase tracking-wider opacity-70 leading-none">
                    Récup
                  </span>
                  <span className="text-sm leading-none">
                    {overdue ? `+${formatTime(-remainingMs)}` : formatTime(remainingMs)}
                  </span>
                </div>
              )}

              {/* Wave card — compact */}
              <div
                className={`flex items-center gap-2 ${intervalMs > 0 ? "rounded-b-lg" : "rounded-lg"} border ${wc.border} bg-card overflow-hidden px-2 py-1.5`}
              >
                {/* Left: wave chip + series */}
                <div className="flex flex-col items-start gap-0.5 shrink-0">
                  <span className={`inline-flex items-center rounded-full px-1.5 py-0.5 text-[9px] font-bold text-white leading-none ${wc.dot}`}>
                    {wc.label}
                  </span>
                  <button
                    type="button"
                    aria-label="Série suivante"
                    onClick={(e) => {
                      e.stopPropagation();
                      dispatch({ type: "NEXT_REP", wave: w.wave });
                    }}
                    className="rounded px-1 py-0.5 text-[8px] font-bold uppercase border border-border text-muted-foreground hover:bg-muted active:scale-95 transition-all touch-manipulation leading-none"
                    title="Série suivante"
                  >
                    S{w.currentRep + 1}{seriesCount > 0 ? `/${seriesCount}` : ""} ↻
                  </button>
                </div>

                {/* Right: elapsed chrono */}
                <span className={`font-mono tabular-nums font-bold tracking-tight ml-auto ${intervalMs > 0 ? "text-sm text-muted-foreground" : "text-base text-foreground"}`}>
                  {formatTime(elapsed)}
                </span>
              </div>
            </div>
          );
        })}
    </div>
  );
}

// ── Swimmer Split Card ──────────────────────────────────────────────

function SwimmerCard({
  swimmerKey,
  displayName,
  wave,
  waveStartedAt,
  currentSplits,
  swimmerStoppedAt,
  splitDistanceM,
  totalDistanceM,
  now,
  dispatch,
  getTimestamp,
}: {
  swimmerKey: string;
  displayName: string;
  wave: number;
  waveStartedAt: number | null;
  currentSplits: { cumulativeMs: number; lapMs: number }[];
  swimmerStoppedAt: number | null;
  splitDistanceM: number;
  totalDistanceM: number;
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
      dispatch({ type: "UNDO_SPLIT", key: swimmerKey });
      toast("Split annulé", { duration: 1500 });
      lastTapRef.current = 0;
      return;
    }

    dispatch({ type: "RECORD_SPLIT", key: swimmerKey, timestamp: getTimestamp() });
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
  }, [active, dispatch, swimmerKey, getTimestamp]);

  const handleStop = useCallback((e: React.MouseEvent | React.KeyboardEvent) => {
    e.stopPropagation();
    dispatch({ type: "STOP_SWIMMER", key: swimmerKey, timestamp: getTimestamp() });
    navigator.vibrate?.([50, 30, 50]);
    toast(`${displayName} — Stoppé`, { duration: 2000 });
  }, [dispatch, swimmerKey, getTimestamp, displayName]);

  // ── Telemetry computations ─────────────────────────────────────
  const elapsed = launched
    ? (stopped ? (swimmerStoppedAt as number) : now) - (waveStartedAt as number)
    : 0;
  const lastSplit = currentSplits.length > 0 ? currentSplits[currentSplits.length - 1] : null;
  const recordedSplits = currentSplits.length;

  const hasSplitDist = splitDistanceM > 0;
  const hasTotalDist = totalDistanceM > 0 && hasSplitDist;

  const expectedSplits = hasTotalDist ? Math.max(1, Math.ceil(totalDistanceM / splitDistanceM)) : 0;
  const currentDistM = hasSplitDist ? recordedSplits * splitDistanceM : 0;

  const progressPct = expectedSplits > 0
    ? Math.min(100, (recordedSplits / expectedSplits) * 100)
    : 0;

  // Instant pace : last lap (ms/100m) — shown inline in compact metrics row.
  const instantPacePer100m = lastSplit && hasSplitDist && lastSplit.lapMs > 0
    ? (lastSplit.lapMs / splitDistanceM) * 100
    : 0;

  // Stop emphasis : when next tap would reach/exceed the total distance.
  const shouldPromptStop = active && expectedSplits > 0 && recordedSplits + 1 >= expectedSplits;
  const finishedDistance = active && expectedSplits > 0 && recordedSplits >= expectedSplits;

  return (
    <div
      role="button"
      tabIndex={active ? 0 : -1}
      onClick={handleTap}
      onKeyDown={(e) => { if (active && (e.key === " " || e.key === "Enter")) { e.preventDefault(); handleTap(); } }}
      className={`relative rounded-lg border-l-[3px] ${wc.border} overflow-hidden touch-manipulation transition-all ${
        stopped
          ? "bg-muted opacity-60 border border-border"
          : shouldPromptStop
            ? "bg-card border border-destructive ring-1 ring-destructive/40 shadow-destructive/10 shadow"
            : active
              ? "bg-card border border-border shadow-sm active:scale-[0.98] cursor-pointer"
              : "bg-muted/50 opacity-25 pointer-events-none border border-border"
      }`}
    >
      {/* Flash overlay on split tap */}
      <div
        ref={flashRef}
        className="pointer-events-none absolute inset-0 bg-primary opacity-0 transition-opacity duration-100"
      />

      {/* ── Row 1 : wave chip + name + stop ── */}
      <div className="flex items-center gap-1.5 px-2 pt-1.5 pb-0.5">
        <span
          className={`inline-flex h-4 min-w-[1.5rem] items-center justify-center rounded px-1 text-[9px] font-black text-white leading-none ${wc.dot}`}
          aria-label={`Vague ${wc.label}`}
        >
          {wc.label}
        </span>
        <span className={`text-[13px] font-semibold leading-tight min-w-0 truncate ${stopped ? "text-muted-foreground" : "text-foreground"}`}>
          {displayName}
        </span>
        <div className="ml-auto flex items-center gap-1 shrink-0">
          {stopped && (
            <span className="rounded bg-destructive px-1.5 py-0.5 text-[9px] font-bold uppercase text-destructive-foreground leading-none">
              Stop
            </span>
          )}
          {active && (
            <button
              type="button"
              onClick={handleStop}
              aria-label={`Stopper ${displayName}`}
              className={`flex items-center justify-center rounded-full transition-all ${
                shouldPromptStop
                  ? "h-9 w-9 bg-destructive text-destructive-foreground ring-2 ring-destructive/60 animate-pulse shadow-md"
                  : "h-7 w-7 bg-destructive/15 text-destructive hover:bg-destructive hover:text-destructive-foreground"
              }`}
            >
              <CircleStop className={shouldPromptStop ? "h-5 w-5" : "h-3.5 w-3.5"} strokeWidth={shouldPromptStop ? 3 : 2.5} />
            </button>
          )}
        </div>
      </div>

      {/* ── Row 2 : chrono (2xl, compact) ── */}
      <div className="px-2 pt-0 pb-0.5">
        <div
          className={`font-mono tabular-nums font-black leading-none tracking-tight text-2xl ${
            stopped ? "text-muted-foreground" : shouldPromptStop ? "text-destructive" : "text-foreground"
          }`}
        >
          {launched ? formatTime(elapsed) : "--:--.--"}
        </div>
      </div>

      {/* ── Row 3 : progress bar + counter ── */}
      {launched && (
        <div className="flex items-center gap-2 px-2 pt-1 pb-0.5">
          <div className="h-1 flex-1 rounded-full bg-muted overflow-hidden">
            <div
              className={`h-full rounded-full transition-[width] duration-300 ${
                finishedDistance
                  ? "bg-destructive"
                  : shouldPromptStop
                    ? "bg-destructive/80"
                    : wc.dot
              }`}
              style={{
                width: expectedSplits > 0
                  ? `${progressPct}%`
                  : recordedSplits > 0
                    ? "100%"
                    : "0%",
              }}
              aria-hidden
            />
          </div>
          <span
            className={`text-[10px] font-bold tabular-nums shrink-0 leading-none ${
              shouldPromptStop ? "text-destructive" : "text-muted-foreground"
            }`}
          >
            {expectedSplits > 0 ? `${recordedSplits}/${expectedSplits}` : `#${recordedSplits}`}
          </span>
        </div>
      )}

      {/* ── Row 4 : inline metrics (distance · allure · Δ) ── */}
      {launched && (
        <div className="flex items-center gap-1.5 px-2 pb-1.5 pt-0.5 text-[10px] font-mono tabular-nums text-muted-foreground leading-tight">
          {hasSplitDist && (
            <>
              <Flag className={`h-2.5 w-2.5 shrink-0 ${finishedDistance ? "text-destructive" : ""}`} />
              <span className={`font-semibold ${finishedDistance ? "text-destructive" : "text-foreground/80"}`}>
                {hasTotalDist
                  ? `${currentDistM}/${totalDistanceM}m`
                  : `${currentDistM}m`}
              </span>
              <span className="text-muted-foreground/50">·</span>
            </>
          )}
          {instantPacePer100m > 0 ? (
            <>
              <Gauge className="h-2.5 w-2.5 shrink-0" />
              <span className="font-semibold text-foreground/80">{formatPace(instantPacePer100m)}</span>
              <span className="text-muted-foreground/50">·</span>
            </>
          ) : active && hasSplitDist ? (
            <span className="italic">Tap pour split</span>
          ) : null}
          {lastSplit && (
            <span className="text-muted-foreground">
              Δ {formatLap(lastSplit.lapMs)}
            </span>
          )}
          {!lastSplit && !active && !launched && (
            <span className="italic text-muted-foreground/50">En attente…</span>
          )}
        </div>
      )}

      {/* ── STOP emphasis strip when imminent (compact, not full pleine-card) ── */}
      {shouldPromptStop && (
        <div className="border-t border-destructive/40 bg-destructive/8 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-destructive text-center leading-none">
          {finishedDistance ? "Distance atteinte — stopper" : "Prochain split = arrivée"}
        </div>
      )}
    </div>
  );
}

// ── Lane × Wave Matrix ──────────────────────────────────────────────
// Each row = 1 lane, each column = 1 wave. Swimmers of the same wave are
// vertically aligned across lanes → easy overview "who is in wave V1?".

function LaneWaveMatrix({
  lanes,
  swimmers,
  waves,
  raceData,
  splitDistanceM,
  totalDistanceM,
  now,
  dispatch,
  getTimestamp,
}: {
  lanes: number[];
  swimmers: ChronoState["swimmers"];
  waves: ChronoState["waves"];
  raceData: ChronoState["raceData"];
  splitDistanceM: number;
  totalDistanceM: number;
  now: number;
  dispatch: React.Dispatch<ChronoAction>;
  getTimestamp: () => number;
}) {
  // Only waves with at least 1 swimmer, sorted ascending.
  const activeWaves = Array.from(new Set(swimmers.map((s) => s.wave))).sort(
    (a, b) => a - b,
  );
  // Only lanes containing swimmers (skip empty lanes).
  const activeLanes = lanes.filter((lane) =>
    swimmers.some((s) => s.lane === lane),
  );

  if (activeLanes.length === 0 || activeWaves.length === 0) {
    return (
      <p className="text-center py-8 text-sm text-muted-foreground">
        Aucun nageur dans la série.
      </p>
    );
  }

  // CSS Grid : gutter (56px) + N wave columns (min 220px, stretch 1fr).
  const gridTemplate = `56px repeat(${activeWaves.length}, minmax(220px, 1fr))`;

  return (
    <div className="px-3">
      <div className="grid gap-x-2 gap-y-1" style={{ gridTemplateColumns: gridTemplate }}>
        {/* ── Header row : corner + wave labels ── */}
        <div />
        {activeWaves.map((w) => {
          const wc = WAVE_COLORS[w - 1] ?? WAVE_COLORS[0];
          return (
            <div
              key={`head-${w}`}
              className={`flex items-center justify-center gap-1.5 rounded-md px-2 py-1 text-[10px] font-black uppercase tracking-[0.2em] text-white shadow-sm ${wc.dot}`}
            >
              <span className="h-1.5 w-1.5 rounded-full bg-white/80" />
              {wc.label}
            </div>
          );
        })}

        {/* ── Lane rows ── */}
        {activeLanes.map((lane, idx) => {
          const isAlt = idx % 2 === 1;
          return (
            // Use a React.Fragment-equivalent via explicit keys on each cell
            // (fragments can't take style, but we don't need a wrapper — grid auto-flow row handles placement).
            <LaneRow
              key={lane}
              lane={lane}
              isAlt={isAlt}
              activeWaves={activeWaves}
              swimmers={swimmers}
              waves={waves}
              raceData={raceData}
              splitDistanceM={splitDistanceM}
              totalDistanceM={totalDistanceM}
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

// ── Single lane row — rendered as fragments to sit in the parent grid ──

function LaneRow({
  lane,
  isAlt,
  activeWaves,
  swimmers,
  waves,
  raceData,
  splitDistanceM,
  totalDistanceM,
  now,
  dispatch,
  getTimestamp,
}: {
  lane: number;
  isAlt: boolean;
  activeWaves: number[];
  swimmers: ChronoState["swimmers"];
  waves: ChronoState["waves"];
  raceData: ChronoState["raceData"];
  splitDistanceM: number;
  totalDistanceM: number;
  now: number;
  dispatch: React.Dispatch<ChronoAction>;
  getTimestamp: () => number;
}) {
  // Shared row background class (applied to every cell in the row for contrast).
  const rowBg = isAlt
    ? "bg-muted/25 dark:bg-muted/10"
    : "bg-background";
  const rowBorder = "border-y border-border/60";

  return (
    <>
      {/* Lane gutter — sticky left hint + lane number in a pool-lane-rope inspired badge */}
      <div
        className={`flex items-center justify-center rounded-md px-2 py-2 ${rowBg} ${rowBorder} border-l-4 border-l-primary/30`}
      >
        <span className="text-xl font-black font-mono text-foreground/80 tabular-nums leading-none">
          L{lane}
        </span>
      </div>

      {/* Wave cells */}
      {activeWaves.map((w) => {
        const cellSwimmers = swimmers.filter(
          (s) => s.lane === lane && s.wave === w,
        );
        if (cellSwimmers.length === 0) {
          return (
            <div
              key={`${lane}-${w}`}
              className={`rounded-md border border-dashed border-border/30 ${rowBg} ${rowBorder}`}
              aria-hidden
            />
          );
        }
        return (
          <div
            key={`${lane}-${w}`}
            className={`flex flex-col gap-1 rounded-md p-0.5 ${rowBg} ${rowBorder}`}
          >
            {cellSwimmers.map((s) => {
              const waveState = waves.find((wv) => wv.wave === s.wave);
              const race = raceData.get(s.key);
              return (
                <SwimmerCard
                  key={s.key}
                  swimmerKey={s.key}
                  displayName={s.displayName}
                  wave={s.wave}
                  waveStartedAt={waveState?.startedAt ?? null}
                  currentSplits={
                    race ? race.splitsByRep[race.splitsByRep.length - 1] : []
                  }
                  swimmerStoppedAt={race?.stoppedAt ?? null}
                  splitDistanceM={splitDistanceM}
                  totalDistanceM={totalDistanceM}
                  now={now}
                  dispatch={dispatch}
                  getTimestamp={getTimestamp}
                />
              );
            })}
          </div>
        );
      })}
    </>
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

  // Lock screen orientation to landscape on mobile
  useEffect(() => {
    const so = screen?.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void>; unlock?: () => void };
    if (!so?.lock) return;
    so.lock("landscape").catch(() => {/* not supported or denied */});
    return () => { so.unlock?.(); };
  }, []);

  return (
    // Full-bleed : breaks out of the AppLayout container max-w-6xl constraint.
    // The chrono is the only route that needs the full viewport width.
    <div className="flex min-h-dvh flex-col bg-background w-screen relative left-[calc(50%-50vw)] -my-4">
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
          <div className="pr-3 shrink-0">
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  variant="destructive"
                  size="sm"
                  className="h-10 gap-1.5 whitespace-nowrap font-bold px-3 shadow-sm"
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

      {/* Precision badge — compact single line */}
      <div className="flex items-center justify-center gap-1 py-0.5 bg-amber-500/5 border-b border-amber-500/20">
        <Info className="h-2.5 w-2.5 text-amber-600 dark:text-amber-400 shrink-0" />
        <span className="text-[9px] font-medium text-amber-700 dark:text-amber-300" title={CHRONO_PRECISION.tooltip}>
          {CHRONO_PRECISION.label} · {CHRONO_PRECISION.precision}
        </span>
      </div>

      {/* Lane × Wave matrix — overview glanceable on wide screens */}
      <div className="flex-1 py-2 overflow-x-auto">
        <LaneWaveMatrix
          lanes={lanes}
          swimmers={state.swimmers}
          waves={state.waves}
          raceData={state.raceData}
          splitDistanceM={state.splitDistanceM}
          totalDistanceM={state.totalDistanceM}
          now={now}
          dispatch={dispatch}
          getTimestamp={getTimestamp}
        />
      </div>
    </div>
  );
}
