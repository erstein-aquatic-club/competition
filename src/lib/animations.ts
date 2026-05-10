import { Variants } from "framer-motion";
import { durationsSeconds } from "./design-tokens";

/**
 * Framer Motion animation presets for consistent, performant animations.
 * All animations include reduced motion support via Tailwind's motion-reduce utility.
 */

// Basic fade in animation
export const fadeIn: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { duration: durationsSeconds.normal } },
};

// Slide up with fade
export const slideUp: Variants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: durationsSeconds.medium } },
};

// Scale in with fade
export const scaleIn: Variants = {
  hidden: { opacity: 0, scale: 0.95 },
  visible: { opacity: 1, scale: 1, transition: { duration: durationsSeconds.normal } },
};

// Stagger children animation
export const staggerChildren = {
  visible: { transition: { staggerChildren: 0.05 } },
};

// List item animation (for use with staggerChildren)
export const listItem: Variants = {
  hidden: { opacity: 0, x: -10 },
  visible: { opacity: 1, x: 0 },
};

// Success animation with bounce effect
export const successBounce: Variants = {
  hidden: { opacity: 0, scale: 0.8 },
  visible: {
    opacity: 1,
    scale: 1,
    transition: {
      type: "spring",
      stiffness: 300,
      damping: 20,
    },
  },
};

// Slide in from bottom (for drawers)
export const slideInFromBottom: Variants = {
  hidden: { opacity: 0, y: "100%" },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      type: "spring",
      stiffness: 300,
      damping: 30,
    },
  },
  exit: {
    opacity: 0,
    y: "100%",
    transition: { duration: durationsSeconds.normal },
  },
};

// Slide in from right (for side panels)
export const slideInFromRight: Variants = {
  hidden: { opacity: 0, x: "100%" },
  visible: {
    opacity: 1,
    x: 0,
    transition: {
      type: "spring",
      stiffness: 300,
      damping: 30,
    },
  },
  exit: {
    opacity: 0,
    x: "100%",
    transition: { duration: durationsSeconds.normal },
  },
};

/** §244 — Spring presets centralisés (réutilisables via framer transition prop). */
export const springSoft = {
  type: "spring" as const,
  stiffness: 150,
  damping: 20,
};

export const springStiff = {
  type: "spring" as const,
  stiffness: 400,
  damping: 25,
};

export const springGentle = {
  type: "spring" as const,
  stiffness: 100,
  damping: 18,
};
