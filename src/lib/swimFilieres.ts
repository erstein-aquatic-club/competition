export interface Filiere {
  id: string;
  name: string;
  short: string;
  color: string;
}

export const FILIERES: Filiere[] = [
  { id: "entretien-aerobie",        name: "Entretien aérobie",           short: "Entretien",          color: "sky" },
  { id: "capacite-aerobie",         name: "Capacité aérobie",            short: "Cap. aéro.",         color: "emerald" },
  { id: "puissance-aerobie",        name: "Puissance aérobie",           short: "Puiss. aéro.",       color: "orange" },
  { id: "capacite-anaerobie-lact",  name: "Cap. anaérobie lactique",     short: "Cap. ana. lact.",    color: "red" },
  { id: "puissance-anaerobie-lact", name: "Puiss. anaérobie lactique",   short: "Puiss. ana. lact.",  color: "violet" },
  { id: "capacite-anaerobie-alact", name: "Cap. anaérobie alactique",    short: "Cap. ana. alact.",   color: "slate" },
  { id: "puissance-anaerobie-alact",name: "Puiss. anaérobie alactique",  short: "Puiss. ana. alact.", color: "zinc" },
  { id: "technique",                name: "Technique",                   short: "Technique",          color: "cyan" },
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
