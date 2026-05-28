import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import type { WrappedSlideKind } from "@/lib/strength/wrappedStats";

/**
 * Palette par slide — chaque page du récap a son propre dégradé vif plein écran
 * (sensation "Spotify Wrapped"). Couleurs choisies pour un univers sportif/électrique :
 * dominantes saturées + accent contrasté, jamais le cliché violet-sur-blanc.
 */
export const SLIDE_GRADIENTS: Record<WrappedSlideKind, string> = {
  // Nuit électrique → l'ouverture.
  cover: "from-[#0a0a1f] via-[#1b1145] to-[#3a1078]",
  // Bleu profond → cyan : le cap, l'objectif.
  objective: "from-[#021b3a] via-[#053a6b] to-[#0894b3]",
  // Braise → ambre : la force brute.
  forces: "from-[#3d0a06] via-[#a01818] to-[#f25c05]",
  // Vert émeraude → lime : le potentiel à venir, la croissance.
  potential: "from-[#02261c] via-[#0b6b43] to-[#5fd35a]",
  // Magenta → corail : le podium, la fête.
  progressions: "from-[#3a0426] via-[#9c1458] to-[#ff7b54]",
  // Indigo → fuchsia : la masse soulevée.
  volume: "from-[#0c0633] via-[#5a1cae] to-[#e021a0]",
  // Or chaud : la stat fun, le trophée.
  funstat: "from-[#2a1903] via-[#a86a06] to-[#ffd24a]",
  // Retour nuit étoilée : la clôture.
  outro: "from-[#04122e] via-[#241456] to-[#6d1b8e]",
};

/** Accent texte par slide pour les chiffres / mots-clés mis en exergue. */
export const SLIDE_ACCENTS: Record<WrappedSlideKind, string> = {
  cover: "text-[#c4b5ff]",
  objective: "text-[#7df0ff]",
  forces: "text-[#ffd089]",
  potential: "text-[#caffb0]",
  progressions: "text-[#ffd0bc]",
  volume: "text-[#ffb3ee]",
  funstat: "text-[#fff0bc]",
  outro: "text-[#d8c4ff]",
};

/**
 * Coquille commune d'une slide : dégradé plein écran + texture grain + halo,
 * et un conteneur de contenu centré, en colonne, avec marges sûres (notch / home bar).
 */
export function SlideShell({
  kind,
  children,
  className,
}: {
  kind: WrappedSlideKind;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "relative flex h-full w-full flex-col justify-center overflow-hidden bg-gradient-to-br text-white",
        SLIDE_GRADIENTS[kind],
      )}
    >
      {/* Halo lumineux décalé — donne de la profondeur au dégradé. */}
      <div
        aria-hidden
        className="pointer-events-none absolute -right-1/4 -top-1/4 h-[70vh] w-[70vh] rounded-full opacity-40 blur-3xl"
        style={{
          background:
            "radial-gradient(circle, rgba(255,255,255,0.35) 0%, rgba(255,255,255,0) 70%)",
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-1/3 -left-1/4 h-[60vh] w-[60vh] rounded-full opacity-30 blur-3xl"
        style={{
          background:
            "radial-gradient(circle, rgba(0,0,0,0.5) 0%, rgba(0,0,0,0) 70%)",
        }}
      />
      {/* Texture grain — casse l'aplat parfait, atmosphère analogique. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.12] mix-blend-overlay"
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='120'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")",
        }}
      />
      <div
        className={cn(
          "relative z-10 flex h-full flex-col justify-center px-7 pb-24 pt-24",
          className,
        )}
      >
        {children}
      </div>
    </div>
  );
}

/** Petit kicker (sur-titre) condensé Oswald, façon étiquette éditoriale. */
export function SlideKicker({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "font-display text-xs font-semibold uppercase tracking-[0.35em] text-white/70",
        className,
      )}
    >
      {children}
    </span>
  );
}
