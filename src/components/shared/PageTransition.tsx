import { useLocation } from "wouter";
import { type ReactNode } from "react";

/**
 * §255 — Wrapper iOS-style page transitions (CSS @keyframes).
 *
 * Le `key={location}` force React à démonter l'ancienne page et remonter la
 * nouvelle au changement de route — le mount déclenche l'animation CSS d'entry.
 * L'animation d'exit (`x: -8 fade-out` ~180 ms) initialement présente via
 * framer-motion est volontairement abandonnée : à 18 ms d'overlap, l'œil ne la
 * perçoit pas, et la conserver imposait l'import sync de `framer-motion` —
 * 38.27 KB gzip dans le chemin critique online (cf. §254 audit pass 2).
 *
 * `prefers-reduced-motion` honoré via la règle `@media` dans `index.css`.
 *
 * Drop-in compatible avec l'API précédente (§246 sub-§A).
 */
export function PageTransition({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return (
    <div key={location} className="anim-page-transition">
      {children}
    </div>
  );
}
