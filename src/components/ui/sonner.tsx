"use client"

import { useTheme } from "next-themes"
import { Toaster as Sonner } from "sonner"

type ToasterProps = React.ComponentProps<typeof Sonner>

/**
 * §381 — Toasts alignés sur le langage "pilule" de l'app (cf. UpdateNotification) :
 * carte translucide bg-card/95 + backdrop-blur + border, coins très arrondis.
 * Position top-center : hors de la zone de clic de la home bar iPhone et des
 * boutons d'action du mode focus (WorkoutRunner), qui vivent en bas d'écran.
 * L'offset respecte le notch en PWA standalone (viewport-fit=cover).
 */
const SAFE_TOP_OFFSET = { top: "max(12px, env(safe-area-inset-top))" }

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme()

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      position="top-center"
      offset={SAFE_TOP_OFFSET}
      mobileOffset={SAFE_TOP_OFFSET}
      duration={3500}
      toastOptions={{
        classNames: {
          toast:
            "group toast group-[.toaster]:rounded-2xl group-[.toaster]:bg-card/95 group-[.toaster]:backdrop-blur-xl group-[.toaster]:text-foreground group-[.toaster]:border-border group-[.toaster]:shadow-lg group-[.toaster]:shadow-black/10 dark:group-[.toaster]:shadow-black/30",
          title: "group-[.toast]:text-xs group-[.toast]:font-semibold",
          description: "group-[.toast]:text-[11px] group-[.toast]:text-muted-foreground",
          actionButton:
            "group-[.toast]:bg-primary group-[.toast]:text-primary-foreground group-[.toast]:rounded-full group-[.toast]:text-[11px] group-[.toast]:font-bold",
          cancelButton:
            "group-[.toast]:bg-muted group-[.toast]:text-muted-foreground group-[.toast]:rounded-full",
        },
      }}
      {...props}
    />
  )
}

export { Toaster }
