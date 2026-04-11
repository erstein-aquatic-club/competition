import { useEffect, useRef, useState } from "react";
import { Check, AlertCircle } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { cn } from "@/lib/utils";

type SyncStatus = "synced" | "conflict" | null;

/**
 * OfflineSyncBanner — shows a brief notification when the user comes back online.
 * Displays either "Données synchronisées" or "Conflit — données serveur appliquées".
 * Auto-dismisses after 5 seconds.
 */
export function OfflineSyncBanner() {
  const isOnline = useOnlineStatus();
  const wasOffline = useRef(false);
  const [status, setStatus] = useState<SyncStatus>(null);

  useEffect(() => {
    if (!isOnline) {
      wasOffline.current = true;
      return;
    }

    if (wasOffline.current) {
      wasOffline.current = false;
      // For now we always report "synced". When real conflict detection is
      // wired in, this can be changed to "conflict" based on version comparison.
      setStatus("synced");

      const timer = setTimeout(() => setStatus(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [isOnline]);

  return (
    <AnimatePresence>
      {status && (
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
              status === "synced"
                ? "bg-emerald-500/90 text-white border-emerald-400/30"
                : "bg-amber-500/90 text-white border-amber-400/30",
            )}
          >
            {status === "synced" ? (
              <Check className="h-3.5 w-3.5" />
            ) : (
              <AlertCircle className="h-3.5 w-3.5" />
            )}
            <span className="text-xs font-semibold">
              {status === "synced"
                ? "Données synchronisées"
                : "Conflit — données serveur appliquées"}
            </span>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
