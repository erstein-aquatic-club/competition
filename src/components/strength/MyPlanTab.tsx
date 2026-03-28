import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { StrengthSessionTemplate, StrengthFolder } from "@/lib/api/types";
import { ChevronRight, Dumbbell, FolderOpen } from "lucide-react";
import { cn } from "@/lib/utils";

/* ── Phase colours ── */
const PHASE_STYLES: Record<string, { border: string; bg: string; text: string; dot: string }> = {
  reprise:     { border: "border-l-slate-400",  bg: "bg-slate-400/10",  text: "text-slate-600",  dot: "bg-slate-400" },
  force:       { border: "border-l-red-500",    bg: "bg-red-500/10",    text: "text-red-600",    dot: "bg-red-500" },
  puissance:   { border: "border-l-orange-500", bg: "bg-orange-500/10", text: "text-orange-600", dot: "bg-orange-500" },
  taper:       { border: "border-l-blue-500",   bg: "bg-blue-500/10",   text: "text-blue-600",   dot: "bg-blue-500" },
  compétition: { border: "border-l-emerald-500",bg: "bg-emerald-500/10",text: "text-emerald-600",dot: "bg-emerald-500" },
};

function detectPhase(name: string): string {
  const n = name.toLowerCase();
  if (n.includes("reprise") || n.includes("s0")) return "reprise";
  if (n.includes("force")) return "force";
  if (n.includes("puissance")) return "puissance";
  if (n.includes("taper")) return "taper";
  if (n.includes("compét") || n.includes("compet") || n.includes("s9")) return "compétition";
  return "force";
}

/* ── Day ordering & badges ── */
const DAY_ORDER: [RegExp, string, string][] = [
  [/^lun/i,  "Lun", "bg-sky-500/15 text-sky-700 dark:text-sky-400"],
  [/^mar/i,  "Mar", "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"],
  [/^mer/i,  "Mer", "bg-amber-500/15 text-amber-700 dark:text-amber-400"],
  [/^jeu/i,  "Jeu", "bg-violet-500/15 text-violet-700 dark:text-violet-400"],
  [/^ven/i,  "Ven", "bg-orange-500/15 text-orange-700 dark:text-orange-400"],
  [/^sam/i,  "Sam", "bg-rose-500/15 text-rose-700 dark:text-rose-400"],
  [/^dim/i,  "Dim", "bg-gray-500/15 text-gray-600 dark:text-gray-400"],
];

function getDayInfo(title: string | undefined | null): { index: number; label: string; color: string } | null {
  if (!title) return null;
  const t = title.trim();
  for (let i = 0; i < DAY_ORDER.length; i++) {
    const [pattern, label, color] = DAY_ORDER[i];
    if (pattern.test(t)) return { index: i, label, color };
  }
  return null;
}

/** Strip the day prefix from title for cleaner display */
function stripDayPrefix(title: string): string {
  return title.replace(/^(lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche)\s*[—–\-:]\s*/i, "").trim();
}

function sortByDay(sessions: StrengthSessionTemplate[]): StrengthSessionTemplate[] {
  return [...sessions].sort((a, b) => {
    const da = getDayInfo(a.title ?? a.name);
    const db = getDayInfo(b.title ?? b.name);
    if (da && db) return da.index - db.index;
    if (da) return -1;
    if (db) return 1;
    return 0;
  });
}

/* ── Component ── */
interface MyPlanTabProps {
  athleteId: number;
  onSelectSession: (session: StrengthSessionTemplate) => void;
}

export function MyPlanTab({ athleteId, onSelectSession }: MyPlanTabProps) {
  const { data: folders = [], isLoading: foldersLoading } = useQuery({
    queryKey: ["strength_folders", "session", athleteId],
    queryFn: () => api.getStrengthFolders("session", { athleteId }),
  });

  const { data: allSessions = [] } = useQuery({
    queryKey: ["strength_catalog"],
    queryFn: () => api.getStrengthSessions(),
  });

  const rootFolders = useMemo(() => folders.filter((f) => !f.parent_id), [folders]);

  const subFoldersMap = useMemo(() => {
    const map = new Map<number, StrengthFolder[]>();
    for (const f of folders) {
      if (f.parent_id) {
        const arr = map.get(f.parent_id) ?? [];
        arr.push(f);
        map.set(f.parent_id, arr);
      }
    }
    return map;
  }, [folders]);

  const sessionsByFolder = useMemo(() => {
    const folderIdSet = new Set(folders.map((f) => f.id));
    const map = new Map<number, StrengthSessionTemplate[]>();
    for (const s of allSessions) {
      if (s.folder_id && folderIdSet.has(s.folder_id)) {
        // Exclude sessions with 0 strength items (e.g. swim-only sessions)
        if ((s.items?.length ?? 0) === 0) continue;
        const arr = map.get(s.folder_id) ?? [];
        arr.push(s);
        map.set(s.folder_id, arr);
      }
    }
    return map;
  }, [folders, allSessions]);

  if (foldersLoading) {
    return (
      <div className="space-y-6 pt-2">
        {[1, 2, 3].map((i) => (
          <div key={i} className="space-y-2">
            <div className="h-5 w-48 rounded bg-muted animate-pulse" />
            <div className="h-14 w-full rounded-xl bg-muted animate-pulse" />
            <div className="h-14 w-full rounded-xl bg-muted animate-pulse" />
          </div>
        ))}
      </div>
    );
  }

  if (rootFolders.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <FolderOpen className="h-10 w-10 mb-4 text-muted-foreground/30" />
        <p className="text-sm font-medium text-muted-foreground">Aucun plan personnalisé</p>
        <p className="text-xs text-muted-foreground/60 mt-1.5 max-w-[240px]">
          Ton coach peut créer un plan d'entraînement depuis le catalogue musculation.
        </p>
      </div>
    );
  }

  return (
    <div className="relative pt-1 pb-4">
      {/* Vertical timeline rail */}
      <div className="absolute left-[11px] top-6 bottom-6 w-px bg-border" />

      {rootFolders.map((root) => {
        const cycles = subFoldersMap.get(root.id) ?? [];
        return (
          <div key={root.id} className="space-y-5">
            {cycles.map((cycle, idx) => {
              const raw = sessionsByFolder.get(cycle.id) ?? [];
              const sessions = sortByDay(raw);
              if (sessions.length === 0) return null;
              const phase = detectPhase(cycle.name);
              const style = PHASE_STYLES[phase] ?? PHASE_STYLES.force;
              // Extract short label (e.g. "S1" or "S4-S6")
              const shortLabel = cycle.name.match(/^(S\d[\d-]*)/)?.[1] ?? "";
              // Extract phase name (after —)
              const phaseName = cycle.name.replace(/^S[\d-]+\s*[—–\-]\s*/, "").replace(/\s*\(.*\)$/, "").trim();

              return (
                <div key={cycle.id} className="relative pl-8">
                  {/* Timeline dot */}
                  <div className={cn("absolute left-[7px] top-1 h-[9px] w-[9px] rounded-full ring-2 ring-background", style.dot)} />

                  {/* Cycle header */}
                  <div className="mb-2.5">
                    <div className="flex items-center gap-2">
                      {shortLabel && (
                        <span className={cn("inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-bold tracking-wide uppercase", style.bg, style.text)}>
                          {shortLabel}
                        </span>
                      )}
                      <span className="text-sm font-semibold text-foreground">{phaseName}</span>
                    </div>
                    {/* Date range from folder name */}
                    {cycle.name.match(/\((.+)\)/) && (
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        {cycle.name.match(/\((.+)\)/)?.[1]}
                      </p>
                    )}
                  </div>

                  {/* Sessions */}
                  <div className={cn("rounded-xl border-l-[3px] overflow-hidden divide-y divide-border/50", style.border)}>
                    {sessions.map((s) => {
                      const dayInfo = getDayInfo(s.title ?? s.name);
                      const cleanTitle = stripDayPrefix(s.title ?? s.name ?? "Sans titre");
                      const itemCount = s.items?.length ?? 0;

                      return (
                        <button
                          key={s.id}
                          onClick={() => onSelectSession(s)}
                          className="flex items-center gap-3 w-full text-left px-3.5 py-3 bg-card hover:bg-accent/50 transition-colors"
                        >
                          {dayInfo ? (
                            <span className={cn(
                              "inline-flex items-center justify-center rounded-md px-1.5 py-0.5 text-[10px] font-bold shrink-0 min-w-[32px]",
                              dayInfo.color,
                            )}>
                              {dayInfo.label}
                            </span>
                          ) : (
                            <Dumbbell className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                          )}

                          <span className="text-[13px] font-medium flex-1 truncate">{cleanTitle}</span>

                          <span className="text-[11px] text-muted-foreground tabular-nums shrink-0">
                            {itemCount} ex.
                          </span>
                          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/40 shrink-0" />
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}

            {/* End dot */}
            <div className="relative pl-8">
              <div className="absolute left-[7px] top-1 h-[9px] w-[9px] rounded-full bg-muted-foreground/20 ring-2 ring-background" />
              <p className="text-[11px] text-muted-foreground/50 font-medium">Fin du plan</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
