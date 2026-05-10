import { useEffect, useRef, useState } from "react";

/**
 * §249 — Real connectivity check, not just `navigator.onLine`.
 *
 * `navigator.onLine` returns `true` for a captive portal Wi-Fi, a coupé VPN,
 * or when Supabase is down but the network interface is up — false positives
 * that prevent the offline fallback from kicking in. We complement it with a
 * lightweight HEAD probe on `/version.json` (already served by the app, ~50
 * bytes, cache-bust query string forces a real round-trip).
 *
 * The probe runs every 30s when the last one succeeded, every 5s when the
 * last one failed (recover faster), and is skipped when `navigator.onLine`
 * is already false (no point trying).
 *
 * Public API unchanged: returns a single `boolean`. All consumers
 * (OfflineDetector, OfflineMutationSync, OfflineSyncBanner, etc.) get
 * fewer false positives transparently.
 */
const PING_PATH = "version.json";
const PING_INTERVAL_OK_MS = 30 * 1000;
const PING_INTERVAL_FAIL_MS = 5 * 1000;
const PING_TIMEOUT_MS = 5 * 1000;

async function probeConnectivity(): Promise<boolean> {
  if (typeof window === "undefined") return true;
  try {
    const url = `${import.meta.env.BASE_URL}${PING_PATH}?_=${Date.now()}`;
    const ctrl = new AbortController();
    const timeoutId = setTimeout(() => ctrl.abort(), PING_TIMEOUT_MS);
    const res = await fetch(url, {
      method: "HEAD",
      cache: "no-store",
      signal: ctrl.signal,
    });
    clearTimeout(timeoutId);
    return res.ok;
  } catch {
    return false;
  }
}

export function useOnlineStatus() {
  const initial = typeof navigator !== "undefined" ? navigator.onLine : true;
  const [isOnline, setIsOnline] = useState(initial);
  const lastPingOkRef = useRef<boolean>(initial);
  const cancelledRef = useRef<boolean>(false);

  useEffect(() => {
    cancelledRef.current = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const recompute = (pingOk: boolean) => {
      if (cancelledRef.current) return;
      lastPingOkRef.current = pingOk;
      const navOnline = typeof navigator !== "undefined" ? navigator.onLine : true;
      const realOnline = navOnline && pingOk;
      setIsOnline((prev) => (prev !== realOnline ? realOnline : prev));
    };

    const tick = async () => {
      if (cancelledRef.current) return;
      const navOnline = typeof navigator !== "undefined" ? navigator.onLine : true;
      if (!navOnline) {
        recompute(false);
        timer = setTimeout(tick, PING_INTERVAL_FAIL_MS);
        return;
      }
      const ok = await probeConnectivity();
      if (cancelledRef.current) return;
      recompute(ok);
      timer = setTimeout(tick, ok ? PING_INTERVAL_OK_MS : PING_INTERVAL_FAIL_MS);
    };

    const handleOnline = () => {
      // Browser fired `online` — schedule an immediate confirmation probe.
      if (timer) clearTimeout(timer);
      timer = setTimeout(tick, 100);
    };
    const handleOffline = () => {
      // Browser fired `offline` — bypass probe, mark offline immediately.
      recompute(false);
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    void tick();

    return () => {
      cancelledRef.current = true;
      if (timer) clearTimeout(timer);
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  return isOnline;
}
