import { useState, useEffect, useRef, useCallback } from "react";

/**
 * Returns a high-resolution timestamp that updates at ~60fps
 * while `running` is true. Uses performance.now() for precision.
 */
export function useChronoTimer(running: boolean) {
  const [now, setNow] = useState(() => performance.now());
  const rafRef = useRef<number>(0);

  useEffect(() => {
    if (!running) {
      cancelAnimationFrame(rafRef.current);
      return;
    }
    const tick = () => {
      setNow(performance.now());
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [running]);

  const getTimestamp = useCallback(() => performance.now(), []);

  return { now, getTimestamp };
}

/** Format ms to MM:SS.d (1 decimal) */
export function formatTime(ms: number): string {
  if (ms < 0) return "--:--.--";
  const totalSeconds = ms / 1000;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toFixed(1).padStart(4, "0")}`;
}

/** Format ms to SS.d (1 decimal, no minutes) for lap times */
export function formatLap(ms: number): string {
  if (ms < 0) return "--.--";
  const seconds = ms / 1000;
  if (seconds >= 60) return formatTime(ms);
  return seconds.toFixed(1);
}
