import { useEffect, useState } from "react";

/**
 * §265 — Surface UX feedback when a loading state drags on longer than a
 * threshold (default 5 s).
 *
 * Returns `showSlowToast: true` exactly once per loading episode: it flips
 * to true after `loading` has been continuously truthy for `delayMs`, and
 * resets to false when `loading` falls back to false. Consumers typically
 * fire a one-shot toast in a `useEffect` keyed on `showSlowToast`.
 *
 * - Loading completes before `delayMs` → boolean never flips (no toast).
 * - Loading flips true → false → true → triggers two separate episodes.
 *
 * Audit pass 1 §3 recommendation: "Toast 'ça prend du temps…' après 5 s de
 * skeleton sur Dashboard / Coach / Records."
 */
export function useDelayedLoading(
  loading: boolean,
  delayMs = 5000,
): { showSlowToast: boolean } {
  const [showSlowToast, setShowSlowToast] = useState(false);

  useEffect(() => {
    if (!loading) {
      // Loading finished or never started — clear any "slow" indicator so the
      // next loading episode can re-trigger fresh.
      setShowSlowToast(false);
      return;
    }
    const id = setTimeout(() => {
      setShowSlowToast(true);
    }, delayMs);
    return () => {
      clearTimeout(id);
    };
  }, [loading, delayMs]);

  return { showSlowToast };
}
