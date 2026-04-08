import { useRef, useCallback } from "react";

interface UseSwipeNavigationOptions {
  onSwipeLeft?: () => void;
  onSwipeRight?: () => void;
  threshold?: number;
  velocityThreshold?: number;
}

type SwipeLock = "none" | "horizontal" | "vertical";

export function useSwipeNavigation({
  onSwipeLeft,
  onSwipeRight,
  threshold = 50,
  velocityThreshold = 500,
}: UseSwipeNavigationOptions) {
  const startX = useRef(0);
  const startY = useRef(0);
  const startTime = useRef(0);
  const lock = useRef<SwipeLock>("none");

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    const touch = e.touches[0];
    startX.current = touch.clientX;
    startY.current = touch.clientY;
    startTime.current = Date.now();
    lock.current = "none";
  }, []);

  const onTouchMove = useCallback((e: React.TouchEvent) => {
    if (lock.current !== "none") return;
    const touch = e.touches[0];
    const dx = Math.abs(touch.clientX - startX.current);
    const dy = Math.abs(touch.clientY - startY.current);
    if (dx < 10 && dy < 10) return;
    lock.current = dx > dy ? "horizontal" : "vertical";
  }, []);

  const onTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      if (lock.current !== "horizontal") return;
      const touch = e.changedTouches[0];
      const dx = touch.clientX - startX.current;
      const dt = (Date.now() - startTime.current) / 1000;
      const velocity = dt > 0 ? Math.abs(dx) / dt : 0;

      if (dx < -threshold || velocity > velocityThreshold) {
        onSwipeLeft?.();
      } else if (dx > threshold || velocity > velocityThreshold) {
        onSwipeRight?.();
      }
    },
    [onSwipeLeft, onSwipeRight, threshold, velocityThreshold],
  );

  return { onTouchStart, onTouchMove, onTouchEnd };
}
