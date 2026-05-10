import { useEffect, useState } from "react"
import { X, Download } from "lucide-react"
import { cn } from "@/lib/utils"
import { useExitAnimation } from "@/hooks/useExitAnimation"
import { useSystemBanner } from "@/lib/systemBanners"

const STORAGE_KEY = "eac-install-prompt-dismissed"

/**
 * InstallPrompt detects if the app is installable and shows a floating pill
 * prompting users to install it as a PWA.
 *
 * §243 — animation migrated from framer-motion to CSS @keyframes.
 */
export function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<Event | null>(null)
  const [isDismissed, setIsDismissed] = useState(false)
  const [isInstalling, setIsInstalling] = useState(false)

  useEffect(() => {
    const dismissed = localStorage.getItem(STORAGE_KEY)
    if (dismissed === "true") {
      setIsDismissed(true)
      return
    }

    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault()
      setDeferredPrompt(e)
    }

    const handleAppInstalled = () => {
      setDeferredPrompt(null)
      setIsDismissed(true)
    }

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt)
    window.addEventListener("appinstalled", handleAppInstalled)

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt)
      window.removeEventListener("appinstalled", handleAppInstalled)
    }
  }, [])

  const handleInstallClick = async () => {
    if (!deferredPrompt) return
    setIsInstalling(true)
    const promptEvent = deferredPrompt as any
    promptEvent.prompt()
    await promptEvent.userChoice
    setDeferredPrompt(null)
    setIsInstalling(false)
  }

  const handleDismiss = () => {
    localStorage.setItem(STORAGE_KEY, "true")
    setIsDismissed(true)
  }

  const show = !isDismissed && !!deferredPrompt
  // §210 — gate via system banner queue (priorité 4 = la plus basse).
  const shouldShow = useSystemBanner("install", show)
  const { shouldRender, isExiting } = useExitAnimation(shouldShow)

  if (!shouldRender) return null

  return (
    <div className="fixed top-3 left-0 right-0 z-[var(--z-index-toast)] pointer-events-none flex justify-center px-4">
      <div
        role="alert"
        aria-live="polite"
        className={cn(
          "pointer-events-auto inline-flex items-center gap-2.5 rounded-full bg-card/95 backdrop-blur-xl border border-border shadow-lg shadow-black/10 dark:shadow-black/30 pl-3.5 pr-1.5 py-1.5",
          isExiting ? "anim-banner-pill-exit" : "anim-banner-pill-enter",
        )}
      >
        <Download className="h-3.5 w-3.5 text-primary shrink-0" />
        <span className="text-xs font-semibold text-foreground">
          Installer l'app
        </span>
        <button
          onClick={handleInstallClick}
          disabled={isInstalling}
          className="rounded-full bg-primary text-primary-foreground px-3 py-1.5 text-[11px] font-bold transition-opacity hover:opacity-90 active:opacity-80 disabled:opacity-50"
          aria-label="Installer l'application"
        >
          {isInstalling ? "..." : "Installer"}
        </button>
        <button
          onClick={handleDismiss}
          className="rounded-full p-1 text-muted-foreground hover:text-foreground transition-colors"
          aria-label="Fermer"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  )
}
