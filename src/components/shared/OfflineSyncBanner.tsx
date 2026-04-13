import { useEffect, useRef, useState } from "react";
import { Check } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { cn } from "@/lib/utils";

/**
 * OfflineSyncBanner — shows a brief notification when the user comes back online.
 * Displays either "Données synchronisées" or "Conflit — données serveur appliquées".
 * Auto-dismisses after 5 seconds.
 */
export function OfflineSyncBanner() {
  const isOnline = useOnlineStatus();
  const wasOffline = useRef(false);
  const [showBanner, setShowBanner] = useState(false);

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

  return (
    <AnimatePresence>
      {showBanner && (
        <div className="fixed top-3 left-0 right-0 z-[var(--z-index-toast)] pointer-events-none flex justify-center px-4">
          <motion.div
            initial={{ opacity: 0, y: -20, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -12, scale: 0.95 }}
            transition={{ type: "spring", stiffness: 500, damping: 30 }}
            role="status"
            aria-live="polite"
            className={cn(
              "pointer-events-auto inline-flex items-center gap-2 rounded-full px-4 py-2",
              "shadow-lg shadow-black/10 dark:shadow-black/30",
              "backdrop-blur-xl border",
              "bg-emerald-500/90 text-white border-emerald-400/30",
            )}
          >
            <Check className="h-3.5 w-3.5" />
            <span className="text-xs font-semibold">
              Connexion rétablie
            </span>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
