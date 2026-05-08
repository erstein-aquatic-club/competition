import { useEffect, useState } from "react";
import { Bell, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";
import { isPushSupported, getPushPermission, subscribeToPush, hasActivePushSubscription } from "@/lib/push";
import { shouldShowPushBanner } from "@/lib/pushHelpers";
import { Surface } from "@/components/shared/Surface";

const DISMISS_KEY = "eac-push-banner-dismissed";
const DISMISS_AT_KEY = "eac-push-banner-dismissed-at";
const REPROPOSE_AFTER_MS = 60 * 24 * 60 * 60 * 1000;

function readDismissedAt(): number | null {
  try {
    if (localStorage.getItem(DISMISS_KEY) !== "true") return null;
    const raw = localStorage.getItem(DISMISS_AT_KEY);
    if (!raw) return 0; // legacy dismiss sans timestamp → considéré expiré
    const parsed = Number.parseInt(raw, 10);
    return Number.isFinite(parsed) ? parsed : 0;
  } catch {
    return null;
  }
}

export function PushPermissionBanner() {
  const [visible, setVisible] = useState(false);
  const user = useAuth((s) => s.user);
  const userId = useAuth((s) => s.userId);
  const [subscribing, setSubscribing] = useState(false);

  useEffect(() => {
    if (!user || !userId) return;
    if (!isPushSupported()) return;
    if (getPushPermission() === "denied") return;

    const dismissedAt = readDismissedAt();
    if (!shouldShowPushBanner(Date.now(), dismissedAt, REPROPOSE_AFTER_MS)) return;

    hasActivePushSubscription().then((active) => {
      if (!active && getPushPermission() !== "granted") {
        setVisible(true);
      }
    });
  }, [user, userId]);

  const handleEnable = async () => {
    if (!userId) return;
    setSubscribing(true);
    const success = await subscribeToPush(userId);
    setSubscribing(false);
    if (success) setVisible(false);
  };

  const handleDismiss = () => {
    try {
      localStorage.setItem(DISMISS_KEY, "true");
      localStorage.setItem(DISMISS_AT_KEY, String(Date.now()));
    } catch {
      // best-effort
    }
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <Surface
      variant="glass"
      radius="sm"
      className="fixed bottom-20 left-4 right-4 z-bar mx-auto max-w-md shadow-lg p-4 sm:bottom-6"
    >
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10">
          <Bell className="h-5 w-5 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold">Activer les notifications</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Recevez les rappels d'entraînement, les changements de créneau et les messages du coach.
          </p>
          <div className="flex gap-2 mt-3">
            <Button size="sm" onClick={handleEnable} disabled={subscribing}>
              {subscribing ? "Activation..." : "Activer"}
            </Button>
            <Button size="sm" variant="ghost" onClick={handleDismiss}>
              Plus tard
            </Button>
          </div>
        </div>
        <button
          onClick={handleDismiss}
          className="shrink-0 flex h-10 w-10 items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          aria-label="Fermer"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </Surface>
  );
}
