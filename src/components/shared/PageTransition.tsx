import { AnimatePresence, motion } from "framer-motion";
import { useLocation } from "wouter";
import { type ReactNode } from "react";

/**
 * §244 — Wrapper iOS-style page transitions.
 * Subtle slide + fade on route change, respectful of prefers-reduced-motion
 * via framer-motion's MotionConfig at app root if needed.
 */
export function PageTransition({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={location}
        initial={{ opacity: 0, x: 16 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: -8 }}
        transition={{ duration: 0.18, ease: "easeOut" }}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}
