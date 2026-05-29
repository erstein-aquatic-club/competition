import { useEffect, useRef, useState } from "react";

/**
 * Animation de comptage d'un nombre de 0 → `value` (façon "Wrapped").
 * Respecte `prefers-reduced-motion` : affiche directement la valeur finale.
 *
 * Présentation pure : aucune logique métier, aucune valeur de poids de corps.
 */
export interface CountUpProps {
  value: number;
  /** Durée de l'animation en ms (par défaut 1500). */
  durationMs?: number;
  /** Nombre de décimales (par défaut 0). */
  decimals?: number;
  /** Réinitialise et relance l'animation quand cette clé change (ex: slide index). */
  replayKey?: string | number;
  className?: string;
  /** Préfixe/suffixe collés au nombre (ex: "+", "%"). */
  prefix?: string;
  suffix?: string;
}

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** Ease-out cubic : démarrage rapide, fin douce — sensation "compteur qui ralentit". */
function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

export function CountUp({
  value,
  durationMs = 1500,
  decimals = 0,
  replayKey,
  className,
  prefix = "",
  suffix = "",
}: CountUpProps) {
  const reduced = prefersReducedMotion();
  const [display, setDisplay] = useState(reduced ? value : 0);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (reduced) {
      setDisplay(value);
      return;
    }
    let start: number | null = null;
    const animate = (now: number) => {
      if (start === null) start = now;
      const elapsed = now - start;
      const progress = Math.min(elapsed / durationMs, 1);
      setDisplay(value * easeOutCubic(progress));
      if (progress < 1) {
        rafRef.current = requestAnimationFrame(animate);
      } else {
        setDisplay(value);
      }
    };
    setDisplay(0);
    rafRef.current = requestAnimationFrame(animate);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
    // replayKey volontairement dans les deps pour relancer le comptage par slide.
  }, [value, durationMs, reduced, replayKey]);

  const formatted =
    decimals > 0
      ? display.toLocaleString("fr-FR", {
          minimumFractionDigits: decimals,
          maximumFractionDigits: decimals,
        })
      : Math.round(display).toLocaleString("fr-FR");

  return (
    <span className={className}>
      {prefix}
      {formatted}
      {suffix}
    </span>
  );
}
