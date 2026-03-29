import { WifiOff } from "lucide-react";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { motion, AnimatePresence } from "framer-motion";

export function OfflineBanner() {
  const isOnline = useOnlineStatus();

  return (
    <AnimatePresence>
      {!isOnline && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: "auto", opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          className="bg-amber-500 text-white px-4 py-2 flex items-center justify-center gap-2 text-sm font-medium"
        >
          <WifiOff className="h-4 w-4" />
          Hors connexion — données en lecture seule
        </motion.div>
      )}
    </AnimatePresence>
  );
}
