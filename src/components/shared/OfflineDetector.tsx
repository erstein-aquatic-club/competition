import { useEffect, useState } from "react"
import { WifiOff, Wifi } from "lucide-react"
import { motion, AnimatePresence } from "framer-motion"
import { cn } from "@/lib/utils"
import { useSystemBanner } from "@/lib/systemBanners"

/**
 * OfflineDetector shows a floating pill at the top when the user goes offline.
 * Auto-hides when back online after a brief "reconnected" animation.
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
  const shouldRender = useSystemBanner("offline", show)

  return (
    <AnimatePresence>
      {shouldRender && (
        <div className="fixed top-12 left-0 right-0 z-[var(--z-index-toast)] pointer-events-none flex justify-center px-4">
          <motion.div
            initial={{ opacity: 0, y: -20, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -12, scale: 0.95 }}
            transition={{ type: "spring", stiffness: 500, damping: 30 }}
            role="alert"
            aria-live="assertive"
            className={cn(
              "pointer-events-auto inline-flex items-center gap-2 rounded-full px-4 py-2",
              "shadow-lg shadow-black/10 dark:shadow-black/30",
              "backdrop-blur-xl border",
              isTransitioning
                ? "bg-status-success/90 text-white border-status-success/30"
                : "bg-status-error/90 text-white border-status-error/30",
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
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  )
}
