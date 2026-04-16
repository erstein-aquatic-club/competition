import { useState, useEffect, useRef, useCallback } from "react";

/**
 * Returns a timestamp (Date.now()) that updates at ~60fps
 * while `running` is true. Uses Date.now() for absolute time
 * consistency across page reloads and localStorage restore.
 */
export function useChronoTimer(running: boolean) {
  const [now, setNow] = useState(() => Date.now());
  const rafRef = useRef<number>(0);

  useEffect(() => {
    if (!running) {
      cancelAnimationFrame(rafRef.current);
      return;
    }
    const tick = () => {
      setNow(Date.now());
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [running]);

  const getTimestamp = useCallback(() => Date.now(), []);

  return { now, getTimestamp };
}

/** Format ms to M:SS.cc (centièmes — précision ± 0,01 s) */
export function formatTime(ms: number): string {
  if (ms < 0) return "--:--.--";
  const totalSeconds = ms / 1000;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toFixed(2).padStart(5, "0")}`;
}

/** Format ms to SS.cc (centièmes, no minutes) for lap times */
export function formatLap(ms: number): string {
  if (ms < 0) return "--.--";
  const seconds = ms / 1000;
  if (seconds >= 60) return formatTime(ms);
  return seconds.toFixed(2);
}

/** Precision metadata for UI display */
export const CHRONO_PRECISION = {
  label: "Chronométrage manuel",
  precision: "± 0,01 s",
  tooltip:
    "Précision estimée du chronométrage tablette (latence digitizer + event loop JS). " +
    "Ne reflète pas la réaction humaine du chronométreur. " +
    "Chronométrage officiel FFN : plaques tactiles FAT ± 0,001 s.",
} as const;
