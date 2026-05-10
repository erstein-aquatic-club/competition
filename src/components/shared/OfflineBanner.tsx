import { WifiOff } from "lucide-react";
import { cn } from "@/lib/utils";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { useExitAnimation } from "@/hooks/useExitAnimation";

/**
 * §243 — animation migrated from framer-motion (height auto + opacity) to
 * CSS @keyframes (max-height 0 ↔ 200px). 200px overestimates a 1-line
 * banner; if the text wraps to 3 lines on very narrow screens it stays inside.
 */
export function OfflineBanner() {
  const isOnline = useOnlineStatus();
  const { shouldRender, isExiting } = useExitAnimation(!isOnline, 240);

  if (!shouldRender) return null;

  return (
    <div
      className={cn(
        "bg-amber-500 text-white px-4 py-2 flex items-center justify-center gap-2 text-sm font-medium",
        isExiting ? "anim-banner-collapse-exit" : "anim-banner-collapse-enter",
      )}
    >
      <WifiOff className="h-4 w-4" />
      Hors connexion — certaines modifications seront synchronisees plus tard
    </div>
  );
}
