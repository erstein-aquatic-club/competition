import { useEffect, useState } from "react"
import { WifiOff, Wifi } from "lucide-react"
import { cn } from "@/lib/utils"
import { useExitAnimation } from "@/hooks/useExitAnimation"
import { useSystemBanner } from "@/lib/systemBanners"

/**
 * OfflineDetector shows a floating pill at the top when the user goes offline.
 * Auto-hides when back online after a brief "reconnected" animation.
 *
 * §243 — animation migrated from framer-motion to CSS @keyframes.
 */
export function OfflineDetector() {
  const [isOffline, setIsOffline] = useState(!navigator.onLine)
  const [isTransitioning, setIsTransitioning] = useState(false)

  useEffect(() => {
    const handleOnline = () => {
      setIsTransitioning(true)
      setTimeout(() => {
        setIsOffline(false)
        setIsTransitioning(false)
      }, 2000)
    }

    const handleOffline = () => {
      setIsOffline(true)
      setIsTransitioning(false)
    }

    window.addEventListener("online", handleOnline)
    window.addEventListener("offline", handleOffline)

    return () => {
      window.removeEventListener("online", handleOnline)
      window.removeEventListener("offline", handleOffline)
    }
  }, [])

  const show = isOffline || isTransitioning
  // §210 — gate via system banner queue (priorité 1 = top).
  const shouldShow = useSystemBanner("offline", show)
  const { shouldRender, isExiting } = useExitAnimation(shouldShow)

  if (!shouldRender) return null

  return (
    <div className="fixed top-12 left-0 right-0 z-[var(--z-index-toast)] pointer-events-none flex justify-center px-4">
      <div
        role="alert"
        aria-live="assertive"
        className={cn(
          "pointer-events-auto inline-flex items-center gap-2 rounded-full px-4 py-2",
          "shadow-lg shadow-black/10 dark:shadow-black/30",
          "backdrop-blur-xl border",
          isTransitioning
            ? "bg-status-success/90 text-white border-status-success/30"
            : "bg-status-error/90 text-white border-status-error/30",
          isExiting ? "anim-banner-pill-exit" : "anim-banner-pill-enter",
        )}
      >
        {isTransitioning ? (
          <Wifi className="h-3.5 w-3.5" />
        ) : (
          <WifiOff className="h-3.5 w-3.5" />
        )}
        <span className="text-xs font-semibold">
          {isTransitioning ? "Reconnecté" : "Hors ligne"}
        </span>
      </div>
    </div>
  )
}
