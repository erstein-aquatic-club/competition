/**
 * §244 — Web Vibration API helper, respectful of prefers-reduced-motion.
 *
 * iOS Safari supporte limitéement la Web Vibration API (Chrome iOS et Android OK).
 * On ne fait rien sur les plateformes non-supportées (no-op, pas d'erreur).
 *
 * Patterns typiques (pas trop intrusifs) :
 * - light()   — feedback discret (10ms)
 * - success() — confirmation positive (3 tap pulses)
 * - error()   — alerte (2 pulses longs)
 */

function canVibrate(): boolean {
  if (typeof window === "undefined") return false;
  if (!("vibrate" in navigator)) return false;
  // Respect WCAG : si prefers-reduced-motion, no haptic.
  if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return false;
  return true;
}

function vibrate(pattern: number | number[]) {
  if (!canVibrate()) return;
  try {
    navigator.vibrate(pattern);
  } catch {
    // No-op on unsupported platforms / iframe contexts.
  }
}

export const haptic = {
  light: () => vibrate(10),
  medium: () => vibrate(20),
  success: () => vibrate([12, 50, 12]),
  error: () => vibrate([30, 40, 30]),
};
