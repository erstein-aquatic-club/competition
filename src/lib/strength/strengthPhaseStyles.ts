export type StrengthPhase = "reprise" | "force" | "puissance" | "taper" | "compétition";

export const PHASE_STYLES: Record<StrengthPhase, {
  border: string; bg: string; text: string; dot: string;
}> = {
  reprise:     { border: "border-l-slate-400",   bg: "bg-slate-400/10",   text: "text-slate-600 dark:text-slate-400",   dot: "bg-slate-400" },
  force:       { border: "border-l-red-500",     bg: "bg-red-500/10",     text: "text-red-600 dark:text-red-400",       dot: "bg-red-500" },
  puissance:   { border: "border-l-orange-500",  bg: "bg-orange-500/10",  text: "text-orange-600 dark:text-orange-400", dot: "bg-orange-500" },
  taper:       { border: "border-l-blue-500",    bg: "bg-blue-500/10",    text: "text-blue-600 dark:text-blue-400",     dot: "bg-blue-500" },
  compétition: { border: "border-l-emerald-500", bg: "bg-emerald-500/10", text: "text-emerald-600 dark:text-emerald-400", dot: "bg-emerald-500" },
};

export function detectPhase(name: string): StrengthPhase {
  // V3 (§341) — un libellé vide (semaine sans week_override) ne doit PAS
  // retomber sur "force" (badge/point rouge trompeur). Neutre = reprise (gris).
  if (!name.trim()) return "reprise";
  const n = name.toLowerCase();
  if (n.includes("reprise") || n.includes("s0") || n.includes("préparation générale") || n.includes("prepa")) return "reprise";
  if (n.includes("force")) return "force";
  if (n.includes("puissance") || n.includes("vitesse")) return "puissance";
  // §293 — vocabulaire mésocycle : maintien et affûtage = phase de taper.
  if (n.includes("taper") || n.includes("maintien") || n.includes("affûtage") || n.includes("affutage")) return "taper";
  if (n.includes("compét") || n.includes("compet") || n.includes("pic")) return "compétition";
  return "force";
}

/**
 * V6 (§341) — libellé COMPACT et DISTINCT pour le badge de phase, à partir du
 * `week_type` matérialisé (`phaseName`). Évite (a) la clé enum brute (« TAPER »)
 * et (b) la confusion Maintien/Affûtage (qui partageaient « TAPER »). Raccourcit
 * uniquement les 2 libellés longs du mésocycle ; tout autre libellé (cycles
 * legacy, plans coach) passe inchangé.
 */
export function shortPhaseLabel(phaseName: string): string {
  switch (phaseName) {
    case "Préparation générale":
      return "Prépa";
    case "Puissance / vitesse":
      return "Puissance";
    default:
      return phaseName;
  }
}
