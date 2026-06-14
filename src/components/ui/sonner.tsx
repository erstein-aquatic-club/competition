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
const SAFE_TOP_OFFSET = { top: "var(--island-top)" }

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
      // §385 — une seule capsule à la fois (comme la Dynamic Island iOS) : évite
      // le stack aux largeurs « au contenu » qui laissait des pilules fantômes
      // décalées derrière. Les toasts suivants s'enchaînent.
      visibleToasts={1}
      toastOptions={{
        classNames: {
          toast:
            "group toast group-[.toaster]:flex group-[.toaster]:items-center group-[.toaster]:gap-2.5 group-[.toaster]:px-4 group-[.toaster]:py-2.5",
          title: "group-[.toast]:text-xs group-[.toast]:font-semibold group-[.toast]:leading-tight",
          description: "group-[.toast]:text-[11px] group-[.toast]:text-muted-foreground group-[.toast]:leading-tight",
          icon: "group-[.toast]:shrink-0",
          actionButton: "group-[.toast]:px-3 group-[.toast]:py-1.5 group-[.toast]:text-[11px]",
          cancelButton: "group-[.toast]:px-3 group-[.toast]:py-1.5 group-[.toast]:text-[11px]",
        },
      }}
      {...props}
    />
  )
}

export { Toaster }
