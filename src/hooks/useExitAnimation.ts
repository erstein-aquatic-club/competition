import { useEffect, useRef, useState } from "react";

/**
 * Mimics framer-motion's `<AnimatePresence>` for simple show/hide animations:
 * keeps the component mounted while playing the exit animation, then unmounts
 * after `durationMs`. Returns `shouldRender` (mount flag) and `isExiting`
 * (apply the exit animation class).
 *
 * Used by the 6 shared banners (UpdateNotification, InstallPrompt, OfflineBanner,
 * InlineBanner, OfflineSyncBanner, OfflineDetector) to drop framer-motion from
 * the critical path. See §242.
 */
export function useExitAnimation(visible: boolean, durationMs = 280) {
  const [shouldRender, setShouldRender] = useState(visible);
  const [isExiting, setIsExiting] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (visible) {
      setShouldRender(true);
      setIsExiting(false);
      return;
    }
    if (shouldRender) {
      setIsExiting(true);
      timerRef.current = setTimeout(() => {
        setShouldRender(false);
        setIsExiting(false);
        timerRef.current = null;
      }, durationMs);
    }
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [visible, durationMs, shouldRender]);

  return { shouldRender, isExiting };
}
