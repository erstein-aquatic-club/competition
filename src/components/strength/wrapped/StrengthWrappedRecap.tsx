import { useCallback, useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useStrengthWrapped } from "@/hooks/useStrengthWrapped";
import type { WrappedSlide } from "@/lib/strength/wrappedStats";
import { CoverSlide } from "./slides/CoverSlide";
import { ObjectiveSlide } from "./slides/ObjectiveSlide";
import { ForcesSlide } from "./slides/ForcesSlide";
import { PotentialSlide } from "./slides/PotentialSlide";
import { ProgressionsSlide } from "./slides/ProgressionsSlide";
import { VolumeSlide } from "./slides/VolumeSlide";
import { FunStatSlide } from "./slides/FunStatSlide";
import { OutroSlide } from "./slides/OutroSlide";

/** Durée d'auto-défilement d'une slide (ms), façon "stories". */
const SLIDE_MS = 6000;
/** Mouvement vertical minimal (px) pour interpréter un swipe-down → fermeture. */
const SWIPE_DOWN_PX = 90;
/** Délai (ms) avant qu'un appui maintenu compte comme "pause" (≠ tap de navigation). */
const HOLD_PAUSE_MS = 220;

export interface StrengthWrappedRecapProps {
  athleteId: number;
  open: boolean;
  onClose: () => void;
  /** 'self' = nageur ('Ton récap') ; 'coach' = coach/admin ('Le récap de {prénom}'). */
  viewerContext: "self" | "coach";
  /** Prénom affiché côté coach (cover/outro). */
  displayName?: string;
}

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * Moteur de "stories" plein écran (Spotify Wrapped / Instagram stories) pour le
 * récap muscu. Consomme `useStrengthWrapped` (appelé INCONDITIONNELLEMENT — aucun
 * hook après un early-return, cf. régressions React #310 §316/§326) et joue les
 * slides ordonnées du hook.
 *
 * Navigation : tap moitié droite → suivant, moitié gauche → précédent, appui
 * maintenu → pause, croix / swipe-down → fermeture. Auto-défilement sur `SLIDE_MS`
 * (désactivé si `prefers-reduced-motion` → navigation manuelle uniquement).
 */
export function StrengthWrappedRecap({
  athleteId,
  open,
  onClose,
  viewerContext,
  displayName,
}: StrengthWrappedRecapProps) {
  const { isLoading, slides, athleteName, data } = useStrengthWrapped(athleteId);
  const reduced = prefersReducedMotion();

  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const slideCount = slides.length;
  const resolvedName = displayName?.trim() || athleteName;

  // Référentiels pour gérer hold / tap / swipe sans re-render.
  const pointerDownAt = useRef(0);
  const pointerStart = useRef<{ x: number; y: number } | null>(null);
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const didHold = useRef(false);

  // Reset à chaque ouverture.
  useEffect(() => {
    if (open) {
      setIndex(0);
      setPaused(false);
    }
  }, [open]);

  const goNext = useCallback(() => {
    setIndex((i) => {
      if (i >= slideCount - 1) {
        onClose();
        return i;
      }
      return i + 1;
    });
  }, [slideCount, onClose]);

  const goPrev = useCallback(() => {
    setIndex((i) => Math.max(0, i - 1));
  }, []);

  // Auto-défilement. Désactivé en chargement, en pause, et en reduced-motion.
  useEffect(() => {
    if (!open || isLoading || paused || reduced || slideCount === 0) return;
    const t = setTimeout(goNext, SLIDE_MS);
    return () => clearTimeout(t);
  }, [open, isLoading, paused, reduced, slideCount, index, goNext]);

  // Clavier : flèches + Échap (accessibilité desktop).
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") goNext();
      else if (e.key === "ArrowLeft") goPrev();
      else if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, goNext, goPrev, onClose]);

  // Verrou du scroll body pendant l'overlay.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  const clearHold = () => {
    if (holdTimer.current) {
      clearTimeout(holdTimer.current);
      holdTimer.current = null;
    }
  };

  const handlePointerDown = (e: React.PointerEvent) => {
    pointerDownAt.current = Date.now();
    pointerStart.current = { x: e.clientX, y: e.clientY };
    didHold.current = false;
    clearHold();
    holdTimer.current = setTimeout(() => {
      didHold.current = true;
      setPaused(true);
    }, HOLD_PAUSE_MS);
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    clearHold();
    const start = pointerStart.current;
    pointerStart.current = null;

    // Reprise après une pause par appui maintenu : pas de navigation.
    if (didHold.current) {
      setPaused(false);
      didHold.current = false;
      return;
    }

    // Swipe vers le bas → fermeture.
    if (start && e.clientY - start.y > SWIPE_DOWN_PX) {
      onClose();
      return;
    }

    // Tap : moitié gauche = précédent, moitié droite = suivant.
    const width = (e.currentTarget as HTMLElement).clientWidth || window.innerWidth;
    if (e.clientX < width / 2) goPrev();
    else goNext();
  };

  const handlePointerCancel = () => {
    clearHold();
    pointerStart.current = null;
    if (didHold.current) {
      setPaused(false);
      didHold.current = false;
    }
  };

  if (!open) return null;

  // Écran de chargement plein écran (dégradé cover + spinner discret).
  if (isLoading) {
    return (
      <div className="fixed inset-0 z-modal flex items-center justify-center bg-gradient-to-br from-[#0a0a1f] via-[#1b1145] to-[#3a1078]">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/30 border-t-white" />
      </div>
    );
  }

  const current = slides[Math.min(index, slideCount - 1)];

  return (
    <div
      className="fixed inset-0 z-modal select-none overflow-hidden bg-black"
      role="dialog"
      aria-modal="true"
      aria-label="Récap muscu"
    >
      {/* Zone interactive plein écran (tap / hold / swipe). */}
      <div
        className="absolute inset-0 touch-none"
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
      >
        <SlideRenderer
          slide={current}
          viewerContext={viewerContext}
          displayName={resolvedName}
          data={data}
        />
      </div>

      {/* Barres de progression segmentées (une par slide). */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex gap-1 px-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
        {slides.map((_, i) => (
          <div
            key={i}
            data-testid="wrapped-progress-segment"
            className="h-1 flex-1 overflow-hidden rounded-full bg-white/25"
          >
            <div
              className={cn(
                "h-full rounded-full bg-white",
                i < index && "w-full",
                i > index && "w-0",
              )}
              style={
                i === index
                  ? {
                      animation:
                        reduced || paused
                          ? "none"
                          : `wrapped-fill ${SLIDE_MS}ms linear forwards`,
                      width: reduced ? "100%" : paused ? undefined : "0%",
                    }
                  : undefined
              }
            />
          </div>
        ))}
      </div>

      {/* Croix de fermeture. */}
      <button
        type="button"
        onClick={onClose}
        aria-label="Fermer le récap"
        className="absolute right-3 top-[max(1.5rem,calc(env(safe-area-inset-top)+0.75rem))] z-30 rounded-full bg-black/20 p-2 text-white/90 backdrop-blur-sm transition-transform active:scale-90"
      >
        <X className="h-5 w-5" />
      </button>

      {/* Keyframe d'avancement de la barre courante. */}
      <style>{`@keyframes wrapped-fill { from { width: 0%; } to { width: 100%; } }`}</style>
    </div>
  );
}

/** Aiguille la slide vers son composant présentationnel selon `kind`. */
function SlideRenderer({
  slide,
  viewerContext,
  displayName,
  data,
}: {
  slide: WrappedSlide;
  viewerContext: "self" | "coach";
  displayName?: string;
  data: ReturnType<typeof useStrengthWrapped>["data"];
}) {
  switch (slide.kind) {
    case "cover":
      return <CoverSlide viewerContext={viewerContext} displayName={displayName} />;
    case "objective":
      return data.objective ? <ObjectiveSlide objective={data.objective} /> : null;
    case "forces":
      return <ForcesSlide forces={data.forces} />;
    case "potential":
      return data.potentialAxis ? <PotentialSlide axis={data.potentialAxis} /> : null;
    case "progressions":
      return <ProgressionsSlide progressions={data.progressions} />;
    case "volume":
      return data.volume ? <VolumeSlide volume={data.volume} /> : null;
    case "funstat":
      return data.volume?.topExerciseName ? (
        <FunStatSlide topExerciseName={data.volume.topExerciseName} />
      ) : null;
    case "outro":
      return <OutroSlide viewerContext={viewerContext} displayName={displayName} />;
    default:
      return null;
  }
}

export default StrengthWrappedRecap;
