import { useEffect, useState } from "react";
import { Bell, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";
import { isPushSupported, getPushPermission, subscribeToPush, hasActivePushSubscription } from "@/lib/push";

const DISMISS_KEY = "eac-push-banner-dismissed";

export function PushPermissionBanner() {
  const [visible, setVisible] = useState(false);
  const user = useAuth((s) => s.user);
  const userId = useAuth((s) => s.userId);
  const [subscribing, setSubscribing] = useState(false);

  useEffect(() => {
    if (!user || !userId) return;
    if (!isPushSupported()) return;
    if (getPushPermission() === "denied") return;
    if (localStorage.getItem(DISMISS_KEY) === "true") return;

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
    localStorage.setItem(DISMISS_KEY, "true");
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <div className="fixed bottom-20 left-4 right-4 z-bar mx-auto max-w-md rounded-xl border bg-background/95 shadow-lg backdrop-blur p-4 sm:bottom-6">
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
    </div>
  );
}
