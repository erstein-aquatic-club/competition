"use client"

import { useTheme } from "next-themes"
import { Toaster as Sonner } from "sonner"

type ToasterProps = React.ComponentProps<typeof Sonner>

/**
 * §381 → §384 — Toasts redessinés en « pilule » iOS, alignés sur
 * `UpdateNotification` (cf. ce composant) : capsule `rounded-full` qui épouse
 * son contenu, carte translucide `bg-card/95` + `backdrop-blur-xl` + bordure,
 * icône/texte compacts, boutons d'action en pilule `rounded-full`.
 * Position top-center : hors home bar iPhone et boutons du mode focus.
 * L'offset respecte le notch en PWA standalone (viewport-fit=cover).
 * La largeur « au contenu » + le centrage sont forcés en CSS (`index.css`,
 * `[data-sonner-toast]`) car Sonner pose `width` en style inline.
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
            "group toast group-[.toaster]:flex group-[.toaster]:w-fit group-[.toaster]:items-center group-[.toaster]:gap-2.5 group-[.toaster]:rounded-full group-[.toaster]:bg-card/95 group-[.toaster]:backdrop-blur-xl group-[.toaster]:text-foreground group-[.toaster]:border group-[.toaster]:border-border group-[.toaster]:shadow-lg group-[.toaster]:shadow-black/10 dark:group-[.toaster]:shadow-black/30 group-[.toaster]:px-4 group-[.toaster]:py-2.5",
          title: "group-[.toast]:text-xs group-[.toast]:font-semibold group-[.toast]:leading-tight",
          description: "group-[.toast]:text-[11px] group-[.toast]:text-muted-foreground group-[.toast]:leading-tight",
          icon: "group-[.toast]:shrink-0",
          actionButton:
            "group-[.toast]:rounded-full group-[.toast]:bg-primary group-[.toast]:text-primary-foreground group-[.toast]:px-3 group-[.toast]:py-1.5 group-[.toast]:text-[11px] group-[.toast]:font-bold",
          cancelButton:
            "group-[.toast]:rounded-full group-[.toast]:bg-muted group-[.toast]:text-muted-foreground group-[.toast]:px-3 group-[.toast]:py-1.5 group-[.toast]:text-[11px] group-[.toast]:font-semibold",
        },
      }}
      {...props}
    />
  )
}

export { Toaster }
