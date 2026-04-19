import { useCallback, useDeferredValue, useMemo, useRef, useState } from "react";
import { useQuery, useInfiniteQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { getAthletesPaginated, getFeedbackRatesAllAthletes } from "@/lib/api/users";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search } from "lucide-react";
import type { AthleteSummary } from "@/lib/api/types";
import type { WellnessCheck } from "@/lib/api/types";
import { getGroupWellnessForDate, getWellnessRange, computeReadinessScore } from "@/lib/api/wellness";
import { ReadinessBadge } from "@/components/coach/WellnessTrend";
import WellnessTrend from "@/components/coach/WellnessTrend";
import TrainingLoadIndicators from "@/components/coach/TrainingLoadIndicators";
import CoachSectionHeader from "./CoachSectionHeader";

// --- Types ---

type SortKey = "name" | "forme" | "assiduity" | "readiness" | "charge";

interface AthleteKPIs {
  forme: number | null;
  lastSessionDate: string | null;
  sessionsCount30d: number;
  assiduity: number | null;
  objectivesTotal: number;
  objectivesAchieved: number;
}

// --- Data helpers (unchanged) ---

function computeFormeScore(sessions: Array<{
  effort: number | null;
  performance: number | null;
  engagement: number | null;
  fatigue: number | null;
}>): number | null {
  if (sessions.length === 0) return null;
  const recent = sessions.slice(0, 7);
  const sessionScores: number[] = [];

  for (const s of recent) {
    const values: number[] = [];
    if (s.effort != null) values.push((11 - s.effort) / 2);
    if (s.fatigue != null) values.push((11 - s.fatigue) / 2);
    if (s.performance != null) values.push(s.performance / 2);
    if (s.engagement != null) values.push(s.engagement / 2);
    if (values.length > 0) {
      sessionScores.push(values.reduce((a, b) => a + b, 0) / values.length);
    }
  }

  if (sessionScores.length === 0) return null;
  return Math.round((sessionScores.reduce((a, b) => a + b, 0) / sessionScores.length) * 10) / 10;
}

function formeBadge(score: number | null): { label: string; className: string } {
  if (score == null) return { label: "—", className: "bg-muted text-muted-foreground" };
  if (score >= 3.5) return { label: `${score.toFixed(1)}`, className: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400" };
  if (score >= 2.5) return { label: `${score.toFixed(1)}`, className: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400" };
  return { label: `${score.toFixed(1)}`, className: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400" };
}

// --- Visual helpers ---

/** 5-dot forme indicator — score is 1–5, dots fill from left */
function FormeDots({ score }: { score: number | null }) {
  if (score == null) {
    return <span className="text-[11px] text-muted-foreground">—</span>;
  }
  const filled = Math.round(score);
  const isGood = score >= 3.5;
  const isMid = score >= 2.5;
  const dotColor = isGood
    ? "bg-emerald-500"
    : isMid
    ? "bg-amber-500"
    : "bg-red-500";

  return (
    <div className="flex items-center gap-1">
      <div className="flex gap-0.5">
        {Array.from({ length: 5 }).map((_, i) => (
          <div
            key={i}
            className={`h-2 w-2 rounded-full transition-colors ${i < filled ? dotColor : "bg-muted"}`}
          />
        ))}
      </div>
      <span className={`text-[10px] font-bold tabular-nums ${isGood ? "text-emerald-600 dark:text-emerald-400" : isMid ? "text-amber-600 dark:text-amber-400" : "text-red-600 dark:text-red-400"}`}>
        {score.toFixed(1)}
      </span>
    </div>
  );
}

/** 5-bar rising sparkline for 30-day session assiduité (relative to group max) */
function SparkBar({ value, max }: { value: number; max: number }) {
  const segments = 5;
  const ratio = max > 0 ? value / max : 0;
  const filled = Math.ceil(ratio * segments);
  // Rising heights: 35% → 55% → 70% → 85% → 100%
  const heights = [35, 55, 70, 85, 100];
  const barColor =
    ratio >= 0.7 ? "bg-emerald-500 dark:bg-emerald-400"
    : ratio >= 0.4 ? "bg-blue-500 dark:bg-blue-400"
    : "bg-amber-500 dark:bg-amber-400";

  return (
    <div className="flex items-end gap-0.5" style={{ height: "18px" }}>
      {Array.from({ length: segments }).map((_, i) => (
        <div
          key={i}
          className={`w-1.5 rounded-sm transition-all ${i < filled ? barColor : "bg-muted"}`}
          style={{ height: `${heights[i]}%` }}
        />
      ))}
    </div>
  );
}

/** Relative last-session label */
function LastSeenLabel({ dateStr }: { dateStr: string | null }) {
  if (!dateStr) return <span className="text-[10px] text-muted-foreground/60">Aucune séance</span>;
  const d = new Date(dateStr);
  const daysAgo = Math.floor((Date.now() - d.getTime()) / 86_400_000);
  const label =
    daysAgo === 0 ? "Aujourd'hui" :
    daysAgo === 1 ? "Hier" :
    daysAgo < 7 ? `Il y a ${daysAgo}j` :
    d.toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
  const urgent = daysAgo >= 14;
  return (
    <span className={`text-[10px] ${urgent ? "text-amber-600 dark:text-amber-400 font-semibold" : "text-muted-foreground"}`}>
      {label}
    </span>
  );
}

function FeedbackRateKPI({
  feedback,
  assigned,
  total,
}: {
  feedback: number;
  assigned: number;
  total: number;
}) {
  const coachGap = total - assigned;
  const ratio = total > 0 ? feedback / total : 0;
  const pct = Math.min(100, Math.round(ratio * 100));
  const ratioColor =
    ratio >= 0.75
      ? "text-emerald-600 dark:text-emerald-400"
      : ratio >= 0.4
      ? "text-amber-600 dark:text-amber-400"
      : "text-red-600 dark:text-red-400";

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          Ressentis 30j
        </span>
        <span className={`text-[11px] font-bold tabular-nums ${ratioColor}`}>
          {feedback}/{total}
          <span className="ml-1 font-normal text-[10px] text-muted-foreground">({pct}%)</span>
        </span>
      </div>
      {coachGap > 0 && (
        <div className="flex justify-end">
          <span className="inline-flex items-center gap-0.5 rounded-md bg-orange-100 dark:bg-orange-950/30 px-1.5 py-0.5 text-[9px] font-semibold text-orange-700 dark:text-orange-400">
            ⚠ {coachGap} non planifié{coachGap > 1 ? "s" : ""}
          </span>
        </div>
      )}
    </div>
  );
}

// --- Component ---

interface Props {
  athletes: AthleteSummary[];
  athletesLoading: boolean;
  onBack?: () => void;
  onOpenAthlete: (athlete: AthleteSummary) => void;
  isAdmin?: boolean;
  coachesList?: { id: number; display_name: string }[];
  allAssignments?: { swimmer_id: number; coach_id: number }[];
}

const PAGE_SIZE = 20;

export default function CoachSwimmersOverview({ athletes: propAthletes, athletesLoading: propAthletesLoading, onBack, onOpenAthlete, isAdmin, coachesList, allAssignments }: Props) {
  const [groupFilter, setGroupFilter] = useState<number | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [coachFilter, setCoachFilter] = useState<number | null>(null);
  const [searchText, setSearchText] = useState("");
  const deferredSearch = useDeferredValue(searchText);

  // Paginated athletes query
  const {
    data: paginatedPages,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading: paginatedLoading,
  } = useInfiniteQuery({
    queryKey: ['athletes-paginated', deferredSearch, groupFilter],
    queryFn: ({ pageParam = 0 }) =>
      getAthletesPaginated({
        offset: pageParam,
        limit: PAGE_SIZE,
        search: deferredSearch || undefined,
        groupId: groupFilter ?? undefined,
      }),
    getNextPageParam: (lastPage, allPages) => {
      if (lastPage.athletes.length < PAGE_SIZE) return undefined;
      const loaded = allPages.reduce((sum, p) => sum + p.athletes.length, 0);
      return loaded < lastPage.total ? loaded : undefined;
    },
    initialPageParam: 0,
  });

  // Use paginated results when available, fall back to props
  const athletes = paginatedPages
    ? paginatedPages.pages.flatMap((p) => p.athletes)
    : propAthletes;
  const athletesLoading = paginatedPages ? paginatedLoading : propAthletesLoading;

  // ACWR values reported by TrainingLoadIndicators children (for sorting)
  const acwrMapRef = useRef(new Map<number, number | null>());
  const [acwrMapVersion, setAcwrMapVersion] = useState(0);
  const handleAcwrReady = useCallback((userId: number, acwr: number | null) => {
    const prev = acwrMapRef.current.get(userId);
    if (prev !== acwr) {
      acwrMapRef.current.set(userId, acwr);
      setAcwrMapVersion((v) => v + 1);
    }
  }, []);

  const { data: recentSessions = [] } = useQuery({
    queryKey: ["recent-sessions-all", 30],
    queryFn: () => api.getRecentSessionsAllAthletes(30),
    enabled: athletes.length > 0,
    staleTime: 5 * 60 * 1000,
  });

  const { data: objectiveCounts } = useQuery({
    queryKey: ["objectives-counts-by-user"],
    queryFn: () => api.getObjectivesCountsByUser(),
    enabled: athletes.length > 0,
    staleTime: 5 * 60 * 1000,
  });

  const { data: feedbackRates } = useQuery({
    queryKey: ["feedback-rates-all-athletes", 30],
    queryFn: () => getFeedbackRatesAllAthletes(30),
    enabled: athletes.length > 0,
    staleTime: 5 * 60 * 1000,
  });

  // ── Wellness data ───────────────────────────────────────
  const todayISO = useMemo(() => new Date().toISOString().slice(0, 10), []);

  const { data: todayWellness = [] } = useQuery({
    queryKey: ["group-wellness-today", todayISO],
    queryFn: () => getGroupWellnessForDate(todayISO),
    enabled: athletes.length > 0,
    staleTime: 5 * 60 * 1000,
  });

  // Build a map userId -> today's readiness score
  const wellnessByUser = useMemo(() => {
    const map = new Map<number, number>();
    for (const w of todayWellness) {
      map.set(w.user_id, w.readiness_score ?? computeReadinessScore(w));
    }
    return map;
  }, [todayWellness]);

  // Fetch last 3 days of wellness for all swimmers to detect declining trends
  const threeDaysAgo = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - 2);
    return d.toISOString().slice(0, 10);
  }, []);

  const { data: recentWellnessAll = [] } = useQuery({
    queryKey: ["group-wellness-recent-3d", threeDaysAgo, todayISO],
    queryFn: async () => {
      // Fetch all wellness for last 3 days
      const results: WellnessCheck[] = [];
      for (let i = 0; i < 3; i++) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const dateStr = d.toISOString().slice(0, 10);
        const dayData = await getGroupWellnessForDate(dateStr);
        results.push(...dayData);
      }
      return results;
    },
    enabled: athletes.length > 0,
    staleTime: 5 * 60 * 1000,
  });

  // Detect declining trends: 3 consecutive days of decreasing readiness
  const decliningUsers = useMemo(() => {
    const byUser = new Map<number, Map<string, number>>();
    for (const w of recentWellnessAll) {
      if (!byUser.has(w.user_id)) byUser.set(w.user_id, new Map());
      byUser.get(w.user_id)!.set(w.date, w.readiness_score ?? computeReadinessScore(w));
    }
    const declining = new Set<number>();
    for (const [userId, dateMap] of byUser) {
      const dates: string[] = [];
      for (let i = 2; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        dates.push(d.toISOString().slice(0, 10));
      }
      const scores = dates.map((d) => dateMap.get(d));
      if (scores[0] != null && scores[1] != null && scores[2] != null) {
        if (scores[1] < scores[0] && scores[2] < scores[1]) {
          declining.add(userId);
        }
      }
    }
    return declining;
  }, [recentWellnessAll]);

  // Use propAthletes for group extraction (full list, not paginated subset)
  const groups = useMemo(() => {
    const map = new Map<number, string>();
    const source = propAthletes.length > 0 ? propAthletes : athletes;
    source.forEach((a) => {
      if (a.group_id && a.group_label) map.set(a.group_id, a.group_label);
    });
    return Array.from(map.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name, "fr"));
  }, [propAthletes, athletes]);

  const athleteKPIs = useMemo(() => {
    const kpiMap = new Map<number, AthleteKPIs>();
    const sessionsByAthleteId = new Map<number, typeof recentSessions>();
    for (const s of recentSessions) {
      if (s.athlete_id == null) continue;
      const list = sessionsByAthleteId.get(s.athlete_id) ?? [];
      list.push(s);
      sessionsByAthleteId.set(s.athlete_id, list);
    }
    for (const athlete of athletes) {
      if (athlete.id == null) continue;
      const sessions = sessionsByAthleteId.get(athlete.id) ?? [];
      const forme = computeFormeScore(sessions);
      const lastSessionDate = sessions.length > 0 ? sessions[0].session_date : null;
      kpiMap.set(athlete.id, {
        forme,
        lastSessionDate,
        sessionsCount30d: sessions.length,
        assiduity: null,
        objectivesTotal: objectiveCounts?.get(athlete.id) ?? 0,
        objectivesAchieved: 0,
      });
    }
    return kpiMap;
  }, [athletes, recentSessions, objectiveCounts]);

  // Max sessions in current view (for relative sparkline normalisation)
  const maxSessions30d = useMemo(() => {
    let max = 0;
    for (const [, kpi] of athleteKPIs) {
      if (kpi.sessionsCount30d > max) max = kpi.sessionsCount30d;
    }
    return Math.max(max, 1);
  }, [athleteKPIs]);

  const sortedAthletes = useMemo(() => {
    let list = [...athletes];
    if (groupFilter != null) {
      list = list.filter((a) => a.group_id === groupFilter);
    }
    if (coachFilter !== null && allAssignments) {
      const swimmerIdsForCoach = new Set(
        allAssignments.filter((a) => a.coach_id === coachFilter).map((a) => a.swimmer_id)
      );
      list = list.filter((a) => a.id != null && swimmerIdsForCoach.has(a.id));
    }
    switch (sortKey) {
      case "forme":
        list.sort((a, b) => {
          const fa = a.id != null ? (athleteKPIs.get(a.id)?.forme ?? 99) : 99;
          const fb = b.id != null ? (athleteKPIs.get(b.id)?.forme ?? 99) : 99;
          return fa - fb;
        });
        break;
      case "assiduity":
        list.sort((a, b) => {
          const sa = a.id != null ? (athleteKPIs.get(a.id)?.sessionsCount30d ?? 99) : 99;
          const sb = b.id != null ? (athleteKPIs.get(b.id)?.sessionsCount30d ?? 99) : 99;
          return sa - sb;
        });
        break;
      case "readiness":
        list.sort((a, b) => {
          const ra = a.id != null ? (wellnessByUser.get(a.id) ?? 999) : 999;
          const rb = b.id != null ? (wellnessByUser.get(b.id) ?? 999) : 999;
          return ra - rb; // lowest readiness first
        });
        break;
      case "charge":
        // Sort by ACWR descending — danger (highest/lowest extremes) first
        // ACWR far from 1.0 is more dangerous, so sort by distance from 1.0 descending
        list.sort((a, b) => {
          const aa = a.id != null ? acwrMapRef.current.get(a.id) : undefined;
          const ab = b.id != null ? acwrMapRef.current.get(b.id) : undefined;
          // null/undefined ACWR goes last
          if (aa == null && ab == null) return 0;
          if (aa == null) return 1;
          if (ab == null) return -1;
          // Danger first: sort by distance from optimal center (1.05)
          const distA = Math.abs(aa - 1.05);
          const distB = Math.abs(ab - 1.05);
          return distB - distA; // higher distance = more danger = first
        });
        break;
      default:
        list.sort((a, b) => a.display_name.localeCompare(b.display_name, "fr"));
    }
    return list;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [athletes, groupFilter, sortKey, athleteKPIs, wellnessByUser, acwrMapVersion, coachFilter, allAssignments]);

  // (pagination is now handled via useInfiniteQuery)

  return (
    <div className="space-y-4 pb-4">
      <CoachSectionHeader
        title="Nageurs"
        description={
          athletesLoading
            ? "Chargement…"
            : `${paginatedPages ? paginatedPages.pages[0]?.total ?? athletes.length : athletes.length} nageur${(paginatedPages ? paginatedPages.pages[0]?.total ?? athletes.length : athletes.length) !== 1 ? "s" : ""}`
        }
        onBack={onBack}
      />

      {/* Search input */}
      <div className="flex items-center gap-2 rounded-2xl border border-border bg-card px-3 py-2">
        <Search className="h-4 w-4 text-muted-foreground" />
        <input
          className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          placeholder="Rechercher un nageur"
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
        />
      </div>

      {/* Group filter chips */}
      {groups.length > 1 && (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setGroupFilter(null)}
            className={`rounded-full px-3 py-2 text-xs font-semibold border transition-colors ${
              groupFilter == null
                ? "bg-foreground text-background border-foreground"
                : "bg-card text-foreground border-border hover:bg-muted"
            }`}
          >
            Tous
          </button>
          {groups.map((g) => (
            <button
              key={g.id}
              type="button"
              onClick={() => setGroupFilter(groupFilter === g.id ? null : g.id)}
              className={`rounded-full px-3 py-2 text-xs font-semibold border transition-colors ${
                groupFilter === g.id
                  ? "bg-foreground text-background border-foreground"
                  : "bg-card text-foreground border-border hover:bg-muted"
              }`}
            >
              {g.name}
            </button>
          ))}
        </div>
      )}

      {isAdmin && coachesList && coachesList.length > 0 ? (
        <Select
          value={coachFilter === null ? "all" : String(coachFilter)}
          onValueChange={(v) => setCoachFilter(v === "all" ? null : Number(v))}
        >
          <SelectTrigger className="h-8 w-auto min-w-[140px] text-xs">
            <SelectValue placeholder="Coach" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tous les coachs</SelectItem>
            {coachesList.map((c) => (
              <SelectItem key={c.id} value={String(c.id)}>
                {c.display_name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : null}

      {/* Sort buttons */}
      <div className="flex items-center gap-2">
        <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">Trier :</span>
        {([
          { key: "name" as const, label: "Nom" },
          { key: "forme" as const, label: "Forme" },
          { key: "readiness" as const, label: "Bien-être" },
          { key: "assiduity" as const, label: "Activité" },
          { key: "charge" as const, label: "Charge ↑" },
        ]).map((opt) => (
          <button
            key={opt.key}
            type="button"
            onClick={() => setSortKey(opt.key)}
            className={`rounded-full px-3 py-1.5 text-xs font-semibold border transition-colors ${
              sortKey === opt.key
                ? "bg-primary/10 text-primary border-primary/30"
                : "bg-card text-muted-foreground border-border hover:bg-muted"
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* Athlete grid */}
      {athletesLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="rounded-2xl border bg-card p-4 animate-pulse motion-reduce:animate-none">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-muted" />
                <div className="space-y-1.5 flex-1">
                  <div className="h-4 w-24 rounded bg-muted" />
                  <div className="h-3 w-16 rounded bg-muted" />
                </div>
              </div>
              <div className="mt-4 space-y-2.5">
                <div className="h-2.5 w-full rounded-full bg-muted" />
                <div className="h-2.5 w-2/3 rounded-full bg-muted" />
              </div>
            </div>
          ))}
        </div>
      ) : sortedAthletes.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-8">
          {groupFilter != null ? "Aucun nageur dans ce groupe." : "Aucun nageur disponible."}
        </p>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {sortedAthletes.map((athlete) => {
              const kpis = athlete.id != null ? athleteKPIs.get(athlete.id) : null;
              const forme = formeBadge(kpis?.forme ?? null);
              const sessionsCount = kpis?.sessionsCount30d ?? 0;
              const hasLowActivity = sessionsCount === 0;
              const formScore = kpis?.forme ?? null;
              const isLowForme = formScore !== null && formScore < 2.5;
              const readiness = athlete.id != null ? wellnessByUser.get(athlete.id) ?? null : null;
              const isDeclining = athlete.id != null && decliningUsers.has(athlete.id);
              const feedbackRate = athlete.id != null ? feedbackRates?.get(athlete.id) : null;

              return (
                <button
                  key={athlete.id ?? athlete.display_name}
                  type="button"
                  onClick={() => onOpenAthlete(athlete)}
                  className={[
                    "group rounded-2xl border bg-card p-4 text-left transition-all duration-150",
                    "hover:shadow-lg hover:border-primary/20 hover:-translate-y-0.5",
                    "active:scale-[0.98] active:shadow-sm",
                    isLowForme ? "border-red-200/60 dark:border-red-900/30" : "",
                  ].join(" ")}
                >
                  {/* Header row */}
                  <div className="flex items-center gap-3">
                    {athlete.avatar_url ? (
                      <img
                        src={athlete.avatar_url}
                        alt=""
                        className="h-10 w-10 rounded-full object-cover border border-border flex-shrink-0"
                      />
                    ) : (
                      <div
                        className={[
                          "h-10 w-10 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0",
                          isLowForme
                            ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
                            : "bg-primary/10 text-primary",
                        ].join(" ")}
                      >
                        {athlete.display_name.charAt(0).toUpperCase()}
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold truncate">{athlete.display_name}</p>
                      {athlete.group_label && (
                        <Badge variant="secondary" className="text-[10px] px-1.5 py-0 mt-0.5">
                          {athlete.group_label}
                        </Badge>
                      )}
                    </div>
                    {/* Objectives badge */}
                    {(kpis?.objectivesTotal ?? 0) > 0 && (
                      <div className="flex shrink-0 items-center gap-1 rounded-full bg-amber-100 dark:bg-amber-900/30 px-2 py-0.5">
                        <span className="text-[10px] font-bold text-amber-700 dark:text-amber-400">
                          {kpis!.objectivesTotal}
                        </span>
                        <span className="text-[9px] text-amber-600 dark:text-amber-500">obj</span>
                      </div>
                    )}
                  </div>

                  {/* ── KPI row ── */}
                  <div className="mt-3.5 space-y-2.5">
                    {/* Forme dots */}
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                        Forme
                      </span>
                      <FormeDots score={kpis?.forme ?? null} />
                    </div>

                    {/* Readiness (wellness) */}
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                        Bien-être
                      </span>
                      <div className="flex items-center gap-2">
                        {athlete.id != null && (
                          <WellnessTrend userId={athlete.id} days={7} mode="compact" />
                        )}
                        <ReadinessBadge score={readiness} declining={isDeclining} />
                      </div>
                    </div>

                    {/* Charge (ACWR + load mini chart) */}
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                        Charge
                      </span>
                      {athlete.id != null ? (
                        <TrainingLoadIndicators userId={athlete.id} onAcwrReady={handleAcwrReady} />
                      ) : (
                        <span className="text-[10px] text-muted-foreground">&mdash;</span>
                      )}
                    </div>

                    {/* Assiduité sparkline */}
                    <div className="flex items-center justify-between">
                      <div className="flex flex-col">
                        <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                          Activité 30j
                        </span>
                        <span className={`text-[10px] mt-0.5 ${hasLowActivity ? "text-amber-600 dark:text-amber-400 font-semibold" : "text-muted-foreground"}`}>
                          {sessionsCount} séance{sessionsCount !== 1 ? "s" : ""}
                        </span>
                      </div>
                      <SparkBar value={sessionsCount} max={maxSessions30d} />
                    </div>

                    {/* Feedback rate */}
                    {feedbackRate != null && feedbackRate.total > 0 && (
                      <FeedbackRateKPI
                        feedback={feedbackRate.feedback}
                        assigned={feedbackRate.assigned}
                        total={feedbackRate.total}
                      />
                    )}

                    {/* Last seen */}
                    <div className="flex items-center justify-between border-t border-border/40 pt-2">
                      <span className="text-[10px] text-muted-foreground/70">Dernier ressenti</span>
                      <LastSeenLabel dateStr={kpis?.lastSessionDate ?? null} />
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          {hasNextPage && (
            <Button
              variant="outline"
              className="w-full mt-4"
              onClick={() => fetchNextPage()}
              disabled={isFetchingNextPage}
            >
              {isFetchingNextPage ? "Chargement..." : "Charger plus"}
            </Button>
          )}
        </>
      )}
    </div>
  );
}
