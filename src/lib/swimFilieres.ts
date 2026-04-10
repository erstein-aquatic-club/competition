export interface FiliereTechnicals {
  heartRate: string;
  lactate: string;
  effort: string;
  duration: string;
  distance: string;
  reps: string;
  intensity: string;
  recovery: string;
  workType: string;
}

export interface Filiere {
  id: string;
  name: string;
  short: string;
  color: string;
  technicals: FiliereTechnicals;
}

export const FILIERES: Filiere[] = [
  {
    id: "entretien-aerobie",
    name: "Entretien aérobie",
    short: "Entretien",
    color: "sky",
    technicals: {
      heartRate: "120-150",
      lactate: "2",
      effort: "8-12",
      duration: "6-25mn",
      distance: "300-1500m",
      reps: "1-4",
      intensity: "70-85% VMA",
      recovery: "10-30s passive",
      workType: "Continu, échauffement, technique, récupération",
    },
  },
  {
    id: "capacite-aerobie",
    name: "Capacité aérobie",
    short: "Cap. aéro.",
    color: "emerald",
    technicals: {
      heartRate: "150-175",
      lactate: "2-4",
      effort: "12-15",
      duration: "20-45mn",
      distance: "50-3000m",
      reps: "30/1",
      intensity: "80-90% VMA",
      recovery: "10s passive / sans",
      workType: "Distances continues, fartleck, interval training lent",
    },
  },
  {
    id: "puissance-aerobie",
    name: "Puissance aérobie",
    short: "Puiss. aéro.",
    color: "orange",
    technicals: {
      heartRate: "170-max",
      lactate: "5-12",
      effort: "14-20",
      duration: "6-15mn",
      distance: "25-500m",
      reps: "20/1",
      intensity: "90-110% VMA",
      recovery: "10-30s passive / sans",
      workType: "Distances continues, interval training rapide, intermittent",
    },
  },
  {
    id: "capacite-anaerobie-lact",
    name: "Cap. anaérobie lactique",
    short: "Cap. ana. lact.",
    color: "red",
    technicals: {
      heartRate: "max",
      lactate: "8-max",
      effort: "16-20",
      duration: "2min30-6mn",
      distance: "50-100m",
      reps: "3x3/3",
      intensity: "85-95% VMA lact.",
      recovery: "10s+2mn / 3mn",
      workType: "Fractionné (passive et/ou active)",
    },
  },
  {
    id: "puissance-anaerobie-lact",
    name: "Puiss. anaérobie lactique",
    short: "Puiss. ana. lact.",
    color: "violet",
    technicals: {
      heartRate: "max",
      lactate: "12-max",
      effort: "18-20",
      duration: "30s-3mn",
      distance: "50-200m",
      reps: "4 (10s récup)/1",
      intensity: "90-100% VMA lact.",
      recovery: "Complète (5-10mn)",
      workType: "Fractionné, simulateurs, épreuves 50-100 (active entre répét.)",
    },
  },
  {
    id: "capacite-anaerobie-alact",
    name: "Cap. anaérobie alactique",
    short: "Cap. ana. alact.",
    color: "slate",
    technicals: {
      heartRate: "N/A",
      lactate: "N/A",
      effort: "N/A",
      duration: "15s-5mn",
      distance: "12.5-25m",
      reps: "1/4",
      intensity: "90-100% VMA alact.",
      recovery: "1mn",
      workType: "Séries répétées (passive)",
    },
  },
  {
    id: "puissance-anaerobie-alact",
    name: "Puiss. anaérobie alactique",
    short: "Puiss. ana. alact.",
    color: "zinc",
    technicals: {
      heartRate: "N/A",
      lactate: "N/A",
      effort: "N/A",
      duration: "7s-10min",
      distance: "12.5-12.5m",
      reps: "1/4",
      intensity: "90-100% VMA alact.",
      recovery: "2min30",
      workType: "Sprints départ, reprises de nages, virages (passive ou active)",
    },
  },
  {
    id: "technique",
    name: "Technique",
    short: "Technique",
    color: "cyan",
    technicals: {
      heartRate: "Variable",
      lactate: "Variable",
      effort: "Variable",
      duration: "Variable",
      distance: "Variable",
      reps: "Variable",
      intensity: "Variable",
      recovery: "Variable",
      workType: "Éducatifs, drills, coordination, coulées",
    },
  },
] as const;

export const FILIERE_MAP = new Map(FILIERES.map((f) => [f.id, f]));

export const FILIERE_STYLES: Record<string, { bg: string; text: string; dot: string }> = {
  sky:     { bg: "bg-sky-100 dark:bg-sky-900/30",         text: "text-sky-700 dark:text-sky-300",         dot: "bg-sky-500" },
  emerald: { bg: "bg-emerald-100 dark:bg-emerald-900/30", text: "text-emerald-700 dark:text-emerald-300", dot: "bg-emerald-500" },
  orange:  { bg: "bg-orange-100 dark:bg-orange-900/30",   text: "text-orange-700 dark:text-orange-300",   dot: "bg-orange-500" },
  red:     { bg: "bg-red-100 dark:bg-red-900/30",         text: "text-red-700 dark:text-red-300",         dot: "bg-red-500" },
  violet:  { bg: "bg-violet-100 dark:bg-violet-900/30",   text: "text-violet-700 dark:text-violet-300",   dot: "bg-violet-500" },
  slate:   { bg: "bg-slate-200 dark:bg-slate-800/50",     text: "text-slate-700 dark:text-slate-300",     dot: "bg-slate-500" },
  zinc:    { bg: "bg-zinc-200 dark:bg-zinc-800/50",       text: "text-zinc-700 dark:text-zinc-300",       dot: "bg-zinc-500" },
  cyan:    { bg: "bg-cyan-100 dark:bg-cyan-900/30",       text: "text-cyan-700 dark:text-cyan-300",       dot: "bg-cyan-500" },
};
