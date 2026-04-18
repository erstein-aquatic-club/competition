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

// ── Wave Header Cell (matrix column header) ─────────────────────────
// Renders 1 of 3 states in a fixed-width column cell :
//   1) Not launched  → GO button (cyan/orange/…, pulses)
//   2) Between reps  → recovery countdown + GO button (stack)
//   3) Racing        → recovery countdown (if interval) + wave status card
// The cell's vertical footprint grows with state, but its horizontal
// span is locked to the matrix column → all swimmer cards of the same
// wave remain perfectly aligned below.

function WaveHeaderCell({
  wave,
  now,
  dispatch,
  getTimestamp,
  seriesCount,
}: {
  wave: ChronoState["waves"][number];
  now: number;
  dispatch: React.Dispatch<ChronoAction>;
  getTimestamp: () => number;
  seriesCount: number;
}) {
  const wc = WAVE_COLORS[wave.wave - 1] ?? WAVE_COLORS[0];
  const launched = wave.startedAt !== null;
  const betweenReps = launched && wave.lastFinishedAt !== null;

  // ── Case 1: never launched yet ──
  if (!launched) {
    return (
      <button
        aria-label={`Lancer la vague ${wc.label}`}
        onClick={() =>
          dispatch({
            type: "LAUNCH_WAVE",
            wave: wave.wave,
            timestamp: getTimestamp(),
          })
        }
        className={`flex flex-col items-center justify-center rounded-md ${wc.dot} w-full h-16 animate-pulse active:scale-95 transition-transform cursor-pointer touch-manipulation shadow-sm`}
      >
        <span className="text-[11px] font-bold uppercase tracking-widest text-white/90 leading-none mb-1">
          {wc.label}{wave.currentRep > 0 ? ` S${wave.currentRep + 1}${seriesCount > 0 ? `/${seriesCount}` : ""}` : ""}
        </span>
        <span className="flex items-center gap-1.5 text-xl font-black text-white leading-none tracking-wide">
          <Play className="h-5 w-5 fill-current" /> GO
        </span>
      </button>
    );
  }

  // Shared: departure countdown
  const elapsed = now - (wave.startedAt as number);
  const intervalMs = wave.departureIntervalSec * 1000;
  const remainingMs = intervalMs > 0 ? intervalMs - elapsed : -1;
  const urgent = remainingMs >= 0 && remainingMs <= 15000;
  const overdue = remainingMs <= 0;

  // ── Case 2: between reps — countdown + GO ──
  if (betweenReps) {
    const recoveryElapsed = now - (wave.lastFinishedAt as number);
    return (
      <div className="flex flex-col gap-0 w-full">
        {intervalMs > 0 ? (
          <div
            role="timer"
            aria-label={
              overdue
                ? `Récupération dépassée de ${formatTime(-remainingMs)}`
                : `Récupération restante ${formatTime(remainingMs)}`
            }
            className={`flex items-center justify-between gap-2 rounded-t-md px-3 py-2 font-mono tabular-nums font-black transition-colors ${
              overdue
                ? "bg-destructive text-destructive-foreground"
                : urgent
                  ? "bg-destructive/90 text-destructive-foreground animate-pulse"
                  : "bg-muted text-foreground"
            }`}
          >
            <span className="text-[10px] font-bold uppercase tracking-widest opacity-70 leading-none">
              Récup
            </span>
            <span className={`font-black leading-none tracking-tight ${urgent || overdue ? "text-2xl" : "text-xl"}`}>
              {overdue ? `+${formatTime(-remainingMs)}` : formatTime(remainingMs)}
            </span>
          </div>
        ) : (
          <div
            role="timer"
            aria-label={`Récupération en cours ${formatTime(recoveryElapsed)}`}
            className="flex items-center justify-between gap-2 rounded-t-md px-3 py-2 font-mono tabular-nums font-black bg-muted text-foreground"
          >
            <span className="text-[10px] font-bold uppercase tracking-widest opacity-70 leading-none">
              Récup
            </span>
            <span className="text-xl font-black leading-none tracking-tight">{formatTime(recoveryElapsed)}</span>
          </div>
        )}
        <button
          aria-label={`Lancer la vague ${wc.label}`}
          onClick={() =>
            dispatch({
              type: "LAUNCH_WAVE",
              wave: wave.wave,
              timestamp: getTimestamp(),
            })
          }
          className={`flex flex-col items-center justify-center rounded-b-md ${wc.dot} w-full h-16 animate-pulse active:scale-95 transition-transform cursor-pointer touch-manipulation shadow-sm`}
        >
          <span className="text-[11px] font-bold uppercase tracking-widest text-white/90 leading-none mb-1">
            {wc.label} S{wave.currentRep + 1}{seriesCount > 0 ? `/${seriesCount}` : ""}
          </span>
          <span className="flex items-center gap-1.5 text-xl font-black text-white leading-none tracking-wide">
            <Play className="h-5 w-5 fill-current" /> GO
          </span>
        </button>
      </div>
    );
  }

  // ── Case 3: actively racing ──
  return (
    <div className="flex flex-col gap-0 w-full">
      {intervalMs > 0 && (
        <div
          role="timer"
          aria-label={
            overdue
              ? `Récupération dépassée de ${formatTime(-remainingMs)}`
              : `Récupération restante ${formatTime(remainingMs)}`
          }
          className={`flex items-center justify-between gap-2 rounded-t-md px-3 py-1.5 font-mono tabular-nums font-black transition-colors ${
            overdue
              ? "bg-destructive text-destructive-foreground"
              : urgent
                ? "bg-destructive/90 text-destructive-foreground animate-pulse"
                : "bg-muted text-foreground"
          }`}
        >
          <span className="text-[10px] font-bold uppercase tracking-widest opacity-70 leading-none">
            Récup
          </span>
          <span className={`font-black leading-none tracking-tight ${urgent || overdue ? "text-xl" : "text-lg"}`}>
            {overdue ? `+${formatTime(-remainingMs)}` : formatTime(remainingMs)}
          </span>
        </div>
      )}
      <div
        className={`flex items-center gap-2 ${intervalMs > 0 ? "rounded-b-md" : "rounded-md"} border ${wc.border} bg-card overflow-hidden px-2 py-1.5`}
      >
        <div className="flex flex-col items-start gap-0.5 shrink-0">
          <span className={`inline-flex items-center rounded-full px-1.5 py-0.5 text-[9px] font-bold text-white leading-none ${wc.dot}`}>
            {wc.label}
          </span>
          <button
            type="button"
            aria-label="Série suivante"
            onClick={(e) => {
              e.stopPropagation();
              dispatch({ type: "NEXT_REP", wave: wave.wave });
            }}
            className="rounded px-1 py-0.5 text-[8px] font-bold uppercase border border-border text-muted-foreground hover:bg-muted active:scale-95 transition-all touch-manipulation leading-none"
            title="Série suivante"
          >
            S{wave.currentRep + 1}{seriesCount > 0 ? `/${seriesCount}` : ""} ↻
          </button>
        </div>
        <span className={`font-mono tabular-nums font-bold tracking-tight ml-auto ${intervalMs > 0 ? "text-sm text-muted-foreground" : "text-base text-foreground"}`}>
          {formatTime(elapsed)}
        </span>
      </div>
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

  // Distance display values (factored out for KPI cells)
  const distLabel = launched
    ? hasTotalDist ? `${currentDistM}/${totalDistanceM}` : `${currentDistM}`
    : hasTotalDist ? `0/${totalDistanceM}` : "0";
  const distSuffix = hasSplitDist ? "m" : "";

  return (
    <div
      className={`relative flex rounded-lg border-l-[3px] ${wc.border} overflow-hidden touch-manipulation transition-all min-h-[116px] ${
        stopped
          ? "bg-muted opacity-70 border border-border"
          : shouldPromptStop
            ? "bg-card border border-destructive ring-1 ring-destructive/40 shadow shadow-destructive/10"
            : active
              ? "bg-card border border-border shadow-sm"
              : "bg-muted/30 border border-border/60"
      }`}
    >
      {/* Flash overlay on split tap */}
      <div
        ref={flashRef}
        className="pointer-events-none absolute inset-0 bg-primary opacity-0 transition-opacity duration-100"
      />

      {/* ── Left : content + tap zone for split ── */}
      <div
        role="button"
        tabIndex={active ? 0 : -1}
        onClick={handleTap}
        onKeyDown={(e) => {
          if (active && (e.key === " " || e.key === "Enter")) {
            e.preventDefault();
            handleTap();
          }
        }}
        className={`flex-1 flex flex-col min-w-0 ${
          active ? "cursor-pointer active:bg-muted/30" : ""
        }`}
      >
        {/* Row 1 : wave chip + name */}
        <div className="flex items-center gap-1.5 px-2.5 pt-2 pb-0.5">
          <span
            className={`inline-flex h-5 min-w-[1.75rem] items-center justify-center rounded px-1.5 text-[10px] font-black text-white leading-none ${wc.dot}`}
            aria-label={`Vague ${wc.label}`}
          >
            {wc.label}
          </span>
          <span
            className={`text-sm font-semibold leading-tight min-w-0 truncate ${
              stopped ? "text-muted-foreground line-through" : "text-foreground"
            }`}
          >
            {displayName}
          </span>
        </div>

        {/* Row 2 : chrono (always text-foreground when launched — destructive is reserved for the STOP column) */}
        <div className="px-2.5 pt-0 pb-0.5">
          <div
            className={`font-mono tabular-nums font-black leading-none tracking-tight text-2xl ${
              stopped
                ? "text-muted-foreground"
                : launched
                  ? "text-foreground"
                  : "text-muted-foreground/50"
            }`}
          >
            {launched ? formatTime(elapsed) : "--:--.--"}
          </div>
        </div>

        {/* Row 3 : progress bar + counter */}
        <div className="flex items-center gap-2 px-2.5 pt-1 pb-1">
          <div className="h-1 flex-1 rounded-full bg-muted overflow-hidden">
            <div
              className={`h-full rounded-full transition-[width] duration-300 ${
                finishedDistance
                  ? "bg-destructive"
                  : shouldPromptStop
                    ? "bg-destructive/80"
                    : launched
                      ? wc.dot
                      : "bg-transparent"
              }`}
              style={{
                width: launched
                  ? expectedSplits > 0
                    ? `${progressPct}%`
                    : recordedSplits > 0
                      ? "100%"
                      : "0%"
                  : "0%",
              }}
              aria-hidden
            />
          </div>
          <span
            className={`text-[11px] font-bold tabular-nums shrink-0 leading-none ${
              shouldPromptStop ? "text-destructive" : "text-muted-foreground"
            }`}
          >
            {launched
              ? expectedSplits > 0
                ? `${recordedSplits}/${expectedSplits}`
                : `#${recordedSplits}`
              : expectedSplits > 0
                ? `0/${expectedSplits}`
                : "—"}
          </span>
        </div>

        {/* Row 4 : KPI grid (2 cells — Δ lap moved to the STOP column) */}
        <div className="grid grid-cols-2 gap-1 px-2.5 pb-2 mt-auto">
          <KPICell
            icon={<Flag className="h-3 w-3" />}
            label="Distance"
            value={distLabel}
            suffix={distSuffix}
            highlight={finishedDistance}
            muted={!launched}
          />
          <KPICell
            icon={<Gauge className="h-3 w-3" />}
            label="Allure"
            value={instantPacePer100m > 0 ? formatPace(instantPacePer100m) : "—"}
            suffix={instantPacePer100m > 0 ? "/100m" : ""}
            muted={!launched || instantPacePer100m === 0}
          />
        </div>
      </div>

      {/* ── Right : full-height stop button (Δ lap top · STOP bottom) ── */}
      {active ? (
        <button
          type="button"
          onClick={handleStop}
          aria-label={`Stopper ${displayName}`}
          className={`shrink-0 w-16 flex flex-col items-stretch justify-between gap-1 py-1.5 transition-all touch-manipulation border-l-2 ${
            shouldPromptStop
              ? "bg-destructive text-destructive-foreground border-destructive animate-pulse ring-inset ring-2 ring-white/30 shadow-inner"
              : "bg-destructive/90 hover:bg-destructive active:scale-95 text-destructive-foreground border-destructive/70"
          }`}
        >
          {/* Top : Δ lap live — the coach's key decision data */}
          <div className="flex flex-col items-center gap-0 px-1">
            <span className="text-[8px] font-bold uppercase tracking-[0.12em] opacity-80 leading-none">
              Δ lap
            </span>
            <span className="font-mono tabular-nums text-base font-black leading-none mt-0.5">
              {lastSplit ? formatLap(lastSplit.lapMs) : "—"}
            </span>
          </div>
          {/* Bottom : STOP action */}
          <div className="flex flex-col items-center gap-0.5 px-1">
            <CircleStop
              className={shouldPromptStop ? "h-6 w-6" : "h-5 w-5"}
              strokeWidth={2.5}
            />
            <span className="text-[10px] font-black uppercase tracking-[0.15em] leading-none">
              {shouldPromptStop ? "Stop !" : "Stop"}
            </span>
          </div>
        </button>
      ) : stopped ? (
        <div className="shrink-0 w-16 flex flex-col items-center justify-center gap-1 bg-muted border-l border-border">
          <CircleStop className="h-5 w-5 text-muted-foreground" strokeWidth={2.5} />
          <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground leading-none">
            Stoppé
          </span>
        </div>
      ) : (
        // Not launched : keep the card geometry stable with a transparent shim.
        <div className="shrink-0 w-16 bg-muted/20 border-l border-dashed border-border/30" aria-hidden />
      )}
    </div>
  );
}

// ── KPI Cell — compact metric block (label + value + optional suffix) ──

function KPICell({
  icon,
  label,
  value,
  suffix,
  highlight,
  muted,
}: {
  icon?: React.ReactNode;
  label: string;
  value: string;
  suffix?: string;
  highlight?: boolean;
  muted?: boolean;
}) {
  return (
    <div
      className={`flex flex-col gap-0.5 rounded px-1.5 py-1 min-w-0 ${
        highlight ? "bg-destructive/10" : muted ? "bg-muted/40" : "bg-muted/70"
      }`}
    >
      <div className="flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider text-muted-foreground/80 leading-none">
        {icon}
        <span className="truncate">{label}</span>
      </div>
      <div className="flex items-baseline gap-0.5 font-mono tabular-nums leading-none">
        <span
          className={`text-sm font-black truncate ${
            highlight
              ? "text-destructive"
              : muted
                ? "text-muted-foreground/60"
                : "text-foreground"
          }`}
        >
          {value}
        </span>
        {suffix && (
          <span className="text-[9px] text-muted-foreground/70">{suffix}</span>
        )}
      </div>
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
  seriesCount,
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
  seriesCount: number;
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

  // CSS Grid : gutter (56px) + N wave columns (min 260px, stretch 1fr).
  const gridTemplate = `56px repeat(${activeWaves.length}, minmax(260px, 1fr))`;

  return (
    <div className="px-3">
      <div className="grid gap-x-2 gap-y-1 items-stretch" style={{ gridTemplateColumns: gridTemplate }}>
        {/* ── Header row : corner + wave GO/status controllers ── */}
        <div className="flex items-end justify-center pb-1 text-[9px] font-bold uppercase tracking-widest text-muted-foreground/60">
          Lig.
        </div>
        {activeWaves.map((w) => {
          const waveState = waves.find((wv) => wv.wave === w);
          if (!waveState) return <div key={`head-${w}`} />;
          return (
            <div key={`head-${w}`} className="flex items-end">
              <WaveHeaderCell
                wave={waveState}
                now={now}
                dispatch={dispatch}
                getTimestamp={getTimestamp}
                seriesCount={seriesCount}
              />
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
      {/* Slim top bar — precision + terminate action (wave GO buttons moved into matrix header) */}
      <div className="sticky top-0 z-20 flex items-center justify-between gap-2 border-b border-border bg-background/95 backdrop-blur-sm px-3 py-1">
        <div className="flex items-center gap-1 text-[10px] font-medium text-amber-700 dark:text-amber-300" title={CHRONO_PRECISION.tooltip}>
          <Info className="h-3 w-3 text-amber-600 dark:text-amber-400 shrink-0" />
          <span>{CHRONO_PRECISION.label} · {CHRONO_PRECISION.precision}</span>
        </div>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button
              variant="destructive"
              size="sm"
              className="h-9 gap-1.5 whitespace-nowrap font-bold px-3 shadow-sm"
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

      {/* Lane × Wave matrix — overview glanceable on wide screens */}
      <div className="flex-1 py-2 overflow-x-auto">
        <LaneWaveMatrix
          lanes={lanes}
          swimmers={state.swimmers}
          waves={state.waves}
          raceData={state.raceData}
          splitDistanceM={state.splitDistanceM}
          totalDistanceM={state.totalDistanceM}
          seriesCount={state.seriesCount}
          now={now}
          dispatch={dispatch}
          getTimestamp={getTimestamp}
        />
      </div>
    </div>
  );
}
