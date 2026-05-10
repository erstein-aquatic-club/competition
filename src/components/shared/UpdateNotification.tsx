import { useEffect, useRef, useState } from "react";
import { RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { useExitAnimation } from "@/hooks/useExitAnimation";
import { useStrengthState } from "@/hooks/useStrengthState";
import { useSystemBanner } from "@/lib/systemBanners";

/**
 * §176 — Shows a "mise à jour disponible" pill.
 * - No auto-reload: user must explicitly click "Recharger".
 * - "Plus tard" dismisses the banner (listener stays active for next reload).
 * - Focus-mode guard: if activeRunId !== null (WorkoutRunner active) the
 *   banner is suppressed. A ref records that an update arrived during focus
 *   so the banner re-appears as soon as activeRunId returns to null.
 *
 * §243 — animation migrated from framer-motion to CSS @keyframes (critical
 * path bundle slim). See `useExitAnimation` + `.anim-banner-pill-*` in index.css.
 */
export function UpdateNotification() {
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [isReloading, setIsReloading] = useState(false);

  // useStrengthState requires an athleteKey; pass null (anonymous) — we only
  // need activeRunId, which is initialised from localStorage independently.
  const { activeRunId } = useStrengthState({ athleteKey: null });

  // Tracks whether an update event arrived while a workout was in focus.
  const pendingUpdateDuringFocus = useRef(false);

  // Listen for the PWA update event.
  useEffect(() => {
    const handler = () => {
      if (activeRunId !== null) {
        // Workout in progress: defer the banner, remember we have a pending update.
        pendingUpdateDuringFocus.current = true;
      } else {
        setUpdateAvailable(true);
        setDismissed(false);
      }
    };
    window.addEventListener("pwa-update-available", handler);
    return () => window.removeEventListener("pwa-update-available", handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeRunId]);

  // Re-evaluate when activeRunId transitions back to null after a deferred update.
  useEffect(() => {
    if (activeRunId === null && pendingUpdateDuringFocus.current) {
      pendingUpdateDuringFocus.current = false;
      setUpdateAvailable(true);
      setDismissed(false);
    }
  }, [activeRunId]);

  const handleReload = async () => {
    setIsReloading(true);
    const applyUpdate = (window as any).__pwaApplyUpdate;
    if (typeof applyUpdate === "function") {
      await applyUpdate();
    } else {
      window.location.reload();
    }
  };

  const handleDismiss = () => {
    setDismissed(true);
  };

  const show = updateAvailable && !dismissed && activeRunId === null;
  // §210 — gate via system banner queue (priorité 2).
  const shouldShow = useSystemBanner("update", show);
  const { shouldRender, isExiting } = useExitAnimation(shouldShow);

  if (!shouldRender) return null;

  return (
    <div className="fixed top-3 left-0 right-0 z-toast pointer-events-none flex justify-center px-4">
      <div
        className={cn(
          "pointer-events-auto inline-flex items-center gap-3 rounded-full bg-card/95 backdrop-blur-xl border border-border shadow-lg shadow-black/10 dark:shadow-black/30 pl-4 pr-1.5 py-1.5",
          isExiting ? "anim-banner-pill-exit" : "anim-banner-pill-enter",
        )}
      >
        <RefreshCw className="h-3.5 w-3.5 text-primary shrink-0" />
        <span className="text-xs font-semibold text-foreground">
          Mise à jour disponible
        </span>
        <button
          onClick={handleDismiss}
          className="rounded-full px-3 py-1.5 text-[11px] font-semibold text-muted-foreground transition-colors hover:text-foreground hover:bg-muted active:bg-muted/80"
        >
          Plus tard
        </button>
        <button
          onClick={handleReload}
          disabled={isReloading}
          className="rounded-full bg-primary text-primary-foreground px-3 py-1.5 text-[11px] font-bold transition-opacity hover:opacity-90 active:opacity-80 disabled:opacity-50"
        >
          {isReloading ? "..." : "Recharger"}
        </button>
      </div>
    </div>
  );
}
