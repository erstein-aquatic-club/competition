/** Shared helpers for the KPI wizard UI (§285). */

/**
 * Two-letter avatar initials from a display name.
 * "Jean Dupont" → "JD", "Léa" → "L", empty → "?".
 */
export function initials(name: string): string {
  return (
    name
      .split(/\s+/)
      .map((p) => p[0])
      .filter(Boolean)
      .slice(0, 2)
      .join("")
      .toUpperCase() || "?"
  );
}
