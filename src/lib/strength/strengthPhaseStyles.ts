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
  const n = name.toLowerCase();
  if (n.includes("reprise") || n.includes("s0") || n.includes("préparation générale") || n.includes("prepa")) return "reprise";
  if (n.includes("force")) return "force";
  if (n.includes("puissance") || n.includes("vitesse")) return "puissance";
  // §293 — vocabulaire mésocycle : maintien et affûtage = phase de taper.
  if (n.includes("taper") || n.includes("maintien") || n.includes("affûtage") || n.includes("affutage")) return "taper";
  if (n.includes("compét") || n.includes("compet") || n.includes("pic")) return "compétition";
  return "force";
}
