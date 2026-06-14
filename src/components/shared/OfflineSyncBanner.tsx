import { useEffect, useRef, useState } from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { useExitAnimation } from "@/hooks/useExitAnimation";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";

/**
 * OfflineSyncBanner — discrete pill confirming the connection has been restored.
 * Auto-dismisses after 5 seconds. Does not report sync status — the actual queue
 * replay outcome is surfaced by the toast in OfflineMutationSync (single source of truth).
 *
 * §243 — animation migrated from framer-motion to CSS @keyframes.
 */
export function OfflineSyncBanner() {
  const isOnline = useOnlineStatus();
  const wasOffline = useRef(false);
  const [showBanner, setShowBanner] = useState(false);
  const { shouldRender, isExiting } = useExitAnimation(showBanner);

  useEffect(() => {
    if (!isOnline) {
      wasOffline.current = true;
      return;
    }

    if (wasOffline.current) {
      wasOffline.current = false;
      setShowBanner(true);

      const timer = setTimeout(() => setShowBanner(false), 5000);
      return () => clearTimeout(timer);
    }
  }, [isOnline]);

  if (!shouldRender) return null;

  return (
    <div className="fixed top-island left-0 right-0 z-[var(--z-index-toast)] pointer-events-none flex justify-center px-4">
      <div
        role="status"
        aria-live="polite"
        className={cn(
          "pointer-events-auto inline-flex items-center gap-2 rounded-full px-4 py-2",
          "shadow-lg shadow-black/10 dark:shadow-black/30",
          "backdrop-blur-xl border",
          "bg-emerald-500/90 text-white border-emerald-400/30",
          isExiting ? "anim-banner-pill-exit" : "anim-banner-pill-enter",
        )}
      >
        <Check className="h-3.5 w-3.5" />
        <span className="text-xs font-semibold">
          Connexion rétablie
        </span>
      </div>
    </div>
  );
}
