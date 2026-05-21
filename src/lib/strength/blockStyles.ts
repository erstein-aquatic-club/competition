/**
 * Styles partagés pour distinguer warmup / main dans les écrans muscu (§296).
 *
 * Direction esthétique : sky blue pour le warmup (apaisant, "respire",
 * évoque la préparation), neutre pour le main (déjà l'effort par défaut).
 * Cohérent avec les pastilles cycle existantes (palettes Tailwind discrètes).
 *
 * Consommé par :
 *   - `MyPlanSessionSheet` (preview bottom sheet)
 *   - `WorkoutRunner` (mode focus + sidebar/recap)
 *   - `SessionDetailPreview` (vue détail séance)
 */

export const BLOCK_STYLES = {
  warmup: {
    /** Fond visible (preview, items liste). */
    bg: 'bg-sky-50/70 dark:bg-sky-950/30',
    /** Fond plus subtil (focus card large, sidebar items). */
    bgSubtle: 'bg-sky-50/40 dark:bg-sky-950/20',
    /** Bordure (focus card). */
    border: 'border-sky-200 dark:border-sky-800/50',
    /** Texte plein (badge, label). */
    text: 'text-sky-700 dark:text-sky-300',
    /** Texte atténué (numéro, repos, etc.). */
    textMuted: 'text-sky-700/70 dark:text-sky-300/70',
    /** Badge (pill compact). */
    badge:
      'bg-sky-100 text-sky-700 dark:bg-sky-900/50 dark:text-sky-300',
    /** Trait séparateur (eyebrow horizontal). */
    divider: 'bg-sky-200/60 dark:bg-sky-800/40',
  },
  /** main = pas de styles dédiés (= neutre = bg-card / muted-foreground). */
  main: null,
} as const;
