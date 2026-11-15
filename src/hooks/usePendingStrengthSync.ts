import { useEffect, useState } from "react";
import { getQueue, QUEUE_CHANGED_EVENT } from "@/lib/offlineQueue";
import { countPendingStrengthSessions } from "@/lib/strength/pendingStrengthSync";

function readCount(): number {
  try {
    return countPendingStrengthSessions(getQueue());
  } catch {
    return 0;
  }
}

/**
 * Nombre de séances muscu en attente de synchronisation, mis à jour en direct
 * (écritures de la file dans cet onglet + événement `storage` des autres onglets).
 */
export function usePendingStrengthSync(): number {
  const [count, setCount] = useState(readCount);

  useEffect(() => {
    const refresh = () => setCount(readCount());
    window.addEventListener(QUEUE_CHANGED_EVENT, refresh);
    window.addEventListener("storage", refresh);
    refresh();
    return () => {
      window.removeEventListener(QUEUE_CHANGED_EVENT, refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);

  return count;
}
