import { useEffect, useState } from "react";
import { X, Share, Plus } from "lucide-react";
import { Surface } from "@/components/shared/Surface";

const DISMISS_KEY = "eac-login-install-dismissed";

function isStandalone(): boolean {
  // iOS Safari
  if ("standalone" in navigator && (navigator as any).standalone) return true;
  // Other browsers
  if (window.matchMedia("(display-mode: standalone)").matches) return true;
  return false;
}

function isMobile(): boolean {
  return /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
}

function isIOS(): boolean {
  return /iPhone|iPad|iPod/i.test(navigator.userAgent);
}

/**
 * Banner shown on the Login page for mobile users not in PWA mode.
 * - iOS: shows Share → Add to Home Screen instructions
 * - Android: triggers beforeinstallprompt if available, otherwise shows menu instructions
 * - Dismissible per session (sessionStorage)
 */
export function LoginInstallBanner() {
  const [visible, setVisible] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [ios, setIos] = useState(false);

  useEffect(() => {
    // Don't show if not mobile, already standalone, or dismissed this session
    if (!isMobile() || isStandalone()) return;
    if (sessionStorage.getItem(DISMISS_KEY) === "true") return;

    setIos(isIOS());
    setVisible(true);

    // Listen for Android install prompt
    const handlePrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };
    window.addEventListener("beforeinstallprompt", handlePrompt);
    return () => window.removeEventListener("beforeinstallprompt", handlePrompt);
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    setDeferredPrompt(null);
    setVisible(false);
  };

  const handleDismiss = () => {
    sessionStorage.setItem(DISMISS_KEY, "true");
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <Surface
      variant="tinted"
      radius="sm"
      className="w-full max-w-md mx-auto mt-4 px-4 py-3"
    >
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-foreground">
            Installer l'application
          </p>
          {ios ? (
            <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
              Appuyez sur{" "}
              <Share className="inline h-3.5 w-3.5 -mt-0.5 text-primary" />{" "}
              puis{" "}
              <span className="inline-flex items-center gap-0.5 font-medium text-foreground">
                <Plus className="inline h-3 w-3" />
                Sur l'écran d'accueil
              </span>
            </p>
          ) : deferredPrompt ? (
            <button
              onClick={handleInstall}
              className="mt-1.5 text-xs font-semibold text-primary underline underline-offset-2"
            >
              Ajouter à l'écran d'accueil
            </button>
          ) : (
            <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
              Ouvrez le menu{" "}
              <span className="font-bold text-foreground">&#8942;</span>{" "}
              puis « Ajouter à l'écran d'accueil »
            </p>
          )}
        </div>
        <button
          onClick={handleDismiss}
          className="shrink-0 p-1 rounded-md text-muted-foreground hover:text-foreground transition-colors"
          aria-label="Fermer"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </Surface>
  );
}
