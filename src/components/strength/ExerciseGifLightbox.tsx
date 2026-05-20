/**
 * ExerciseGifLightbox — composant thumbnail GIF cliquable + viewer fullscreen.
 *
 * Pattern extrait de WorkoutRunner pour réutilisation dans MesocyclePreview
 * (vue nageur) et CoachMesocyclePanel (vue coach). Affiche un thumbnail carré
 * compact ; tap/click ouvre un overlay plein écran avec backdrop semi-opaque.
 *
 * Comportement :
 *   - src absent → render NULL (pas de placeholder pour ne pas alourdir les listes).
 *   - tap thumbnail → ouvre le viewer fullscreen (z-50, backdrop click ferme).
 *   - Bouton X en haut-droite + tap backdrop = ferme.
 */
import { useState } from "react";
import { X } from "lucide-react";
import { ExerciseGif } from "./ExerciseGif";
import { cn } from "@/lib/utils";

interface ExerciseGifLightboxProps {
  src: string | null | undefined;
  alt?: string;
  /** Taille du thumbnail. Default "sm" = 36×36. */
  size?: "xs" | "sm" | "md";
  className?: string;
}

const THUMB_SIZE: Record<NonNullable<ExerciseGifLightboxProps["size"]>, string> =
  {
    xs: "h-8 w-8",
    sm: "h-9 w-9",
    md: "h-12 w-12",
  };

export function ExerciseGifLightbox({
  src,
  alt = "",
  size = "sm",
  className,
}: ExerciseGifLightboxProps) {
  const [open, setOpen] = useState(false);
  if (!src) return null;

  return (
    <>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen(true);
        }}
        aria-label={alt ? `Aperçu ${alt}` : "Aperçu exercice"}
        className={cn(
          "group relative shrink-0 overflow-hidden rounded-md ring-1 ring-border transition-transform hover:scale-105 hover:ring-violet-400",
          THUMB_SIZE[size],
          className,
        )}
      >
        <ExerciseGif
          src={src}
          alt={alt}
          className="h-full w-full"
          imgClassName="h-full w-full object-cover"
        />
        {/* halo visuel discret au survol */}
        <span className="pointer-events-none absolute inset-0 bg-black/0 transition-colors group-hover:bg-black/10" />
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          onClick={() => setOpen(false)}
          role="dialog"
          aria-modal="true"
          aria-label={alt ? `${alt} — démonstration` : "Démonstration exercice"}
        >
          <div
            className="relative"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              aria-label="Fermer"
              onClick={() => setOpen(false)}
              className="absolute -right-3 -top-3 z-10 rounded-full bg-background p-2 shadow-lg ring-1 ring-border"
            >
              <X className="h-4 w-4" />
            </button>
            <ExerciseGif
              src={src}
              alt={alt}
              className="max-h-[80dvh] max-w-[92vw] rounded-2xl bg-black/20"
              imgClassName="max-h-[80dvh] w-auto max-w-[92vw] object-contain"
            />
            {alt && (
              <p className="mt-2 text-center text-sm font-semibold text-white drop-shadow">
                {alt}
              </p>
            )}
          </div>
        </div>
      )}
    </>
  );
}
