import { lazy, Suspense, useDeferredValue, useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/lib/auth";
import { api } from "@/lib/api";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  BellRing,
  CalendarDays,
  ChevronRight,
  Clock,
  Dumbbell,
  HeartPulse,
  Search,
  Trophy,
  Users,
  UsersRound,
  Waves,
  Zap,
} from "lucide-react";
import { PageSkeleton } from "@/components/shared/PageSkeleton";
import { Input } from "@/components/ui/input";
const CoachSwimmersOverview = lazy(() => import("./coach/CoachSwimmersOverview"));
const CoachGroupsScreen = lazy(() => import("./coach/CoachGroupsScreen"));
const CoachCompetitionsScreen = lazy(() => import("./coach/CoachCompetitionsScreen"));
const CoachSwimmerDetail = lazy(() => import("./coach/CoachSwimmerDetail"));
const CoachWeekView = lazy(() => import("./coach/CoachWeekView"));
const CoachLibrary = lazy(() => import("./coach/CoachLibrary"));
const CoachComms = lazy(() => import("./coach/CoachComms"));
import type { LocalStrengthRun } from "@/lib/types";

type CoachSection = "home" | "week" | "swimmers" | "library" | "athlete" | "groups" | "competitions" | "comms";
type KpiLookbackPeriod = 7 | 30 | 365;

type CoachAthleteOption = {
  id: number | null;
  display_name: string;
  group_label?: string | null;
};

type CoachHomeProps = {
  onNavigate: (section: CoachSection) => void;
  onOpenRecordsClub: () => void;
  onOpenAthlete: (athlete: CoachAthleteOption) => void;
  athletes: Array<{ id: number | null; display_name: string; group_label?: string | null; ffn_iuf?: string | null; avatar_url?: string | null }>;
  athletesLoading: boolean;
  kpiLoading: boolean;
  fatigueAlerts: Array<{ athleteName: string; rating: number }>;
  mostLoadedAthlete?: { athleteName: string; loadScore: number } | null;
  formeScores: Map<number, number | null>;
  swimSessionCount?: number;
  strengthSessionCount?: number;
};

// ── Minimal section divider label ──────────────────────────────────────────
function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 pb-0.5">
      <span className="text-[9px] font-black uppercase tracking-[0.28em] text-muted-foreground/70">
        {children}
      </span>
      <div className="flex-1 h-px bg-border/50" />
    </div>
  );
}

/** 5-dot forme indicator — score is 1–5, dots fill from left */
function FormeDots({ score }: { score: number | null }) {
  if (score == null) return null;
  const filled = Math.round(score);
  const dotColor = score >= 3.5 ? "bg-emerald-500" : score >= 2.5 ? "bg-amber-500" : "bg-red-500";
  return (
    <div className="flex items-center gap-0.5">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className={`h-1.5 w-1.5 rounded-full ${i < filled ? dotColor : "bg-muted"}`} />
      ))}
    </div>
  );
}

// ── CoachHome ──────────────────────────────────────────────────────────────
const CoachHome = ({
  onNavigate,
  onOpenRecordsClub,
  onOpenAthlete,
  athletes,
  athletesLoading,
  kpiLoading,
  fatigueAlerts,
  mostLoadedAthlete,
  formeScores,
  swimSessionCount,
  strengthSessionCount,
}: CoachHomeProps) => {
  const today = new Date().toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search.trim().toLocaleLowerCase("fr-FR"));

  const visibleAthletes = useMemo(() => {
    if (!deferredSearch) {
      return athletes.slice(0, 5);
    }
    return athletes
      .filter((athlete) => {
        const name = athlete.display_name.toLocaleLowerCase("fr-FR");
        const group = athlete.group_label?.toLocaleLowerCase("fr-FR") ?? "";
        return name.includes(deferredSearch) || group.includes(deferredSearch);
      })
      .slice(0, 6);
  }, [athletes, deferredSearch]);

  const hasAlerts = fatigueAlerts.length > 0;

  const primaryAction = {
    label: "Créer une séance",
    detail: "Natation · Explorer la bibliothèque",
    action: () => onNavigate("week"),
  };

  const tools = [
    { label: "Natation", icon: Waves, action: () => onNavigate("week"), color: "text-cyan-500" },
    { label: "Muscu", icon: Dumbbell, action: () => onNavigate("library"), color: "text-violet-500" },
    { label: "Groupes", icon: UsersRound, action: () => onNavigate("groups"), color: "text-emerald-500" },
    { label: "Échéances", icon: CalendarDays, action: () => onNavigate("competitions"), color: "text-orange-500" },
    { label: "Créneaux", icon: Clock, action: () => onNavigate("week"), color: "text-blue-500" },
    { label: "SMS", icon: BellRing, action: () => onNavigate("comms"), color: "text-rose-500" },
    { label: "Records", icon: Trophy, action: onOpenRecordsClub, color: "text-orange-500" },
  ];

  return (
    <div className="space-y-5 pb-24">
      {/* CSS keyframes for glow animations */}
      <style>{`
        @keyframes cta-breathe {
          0%, 100% { opacity: 0.55; transform: scale(1); }
          50%       { opacity: 0.85; transform: scale(1.06); }
        }
        @keyframes shimmer-slide {
          0%   { transform: translateX(-100%) skewX(-12deg); }
          100% { transform: translateX(300%) skewX(-12deg); }
        }
        .cta-glow     { animation: cta-breathe 3.5s ease-in-out infinite; }
        .cta-shimmer  { animation: shimmer-slide 2.8s ease-in-out infinite 0.8s; }
      `}</style>

      {/* ── STICKY HEADER ── */}
      <div className="sticky top-0 z-20 -mx-4 border-b bg-background/95 px-4 py-3 backdrop-blur">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => onNavigate("home")}
            className="shrink-0 rounded-full border px-3 py-2 text-sm font-semibold active:bg-muted"
          >
            Aujourd'hui
          </button>
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Rechercher un nageur"
              className="h-10 rounded-full pl-9"
            />
          </div>
          <Button size="sm" className="shrink-0 rounded-full" onClick={() => onNavigate("comms")}>
            Message
          </Button>
        </div>
        <p className="mt-2 text-[11px] uppercase tracking-[0.18em] text-muted-foreground capitalize">
          {today}
        </p>
      </div>

      {/* ── SECTION 1 : LE QUOTIDIEN ── */}
      <section className="space-y-2.5">
        <SectionLabel>Le Quotidien</SectionLabel>

        {/* ── PRIMARY CTA — giant animated button ── */}
        <button
          type="button"
          onClick={primaryAction.action}
          className="relative w-full overflow-hidden rounded-3xl text-white transition-all duration-200 active:scale-[0.97] bg-gradient-to-br from-primary via-primary/80 to-primary/60"
        >
          {/* Radial background glow */}
          <div
            className="cta-glow absolute inset-0"
            style={{
              background: "radial-gradient(ellipse at 20% 60%, rgba(255,255,255,0.2) 0%, transparent 65%)",
            }}
          />
          {/* Diagonal shimmer stripe */}
          <div
            className="cta-shimmer absolute top-0 bottom-0 left-0 w-1/3 pointer-events-none"
            style={{ background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.12), transparent)" }}
          />

          <div className="relative flex items-center gap-4 px-6 py-7">
            <div className="min-w-0 flex-1">
              <p className="text-[1.6rem] font-bold leading-tight tracking-tight">{primaryAction.label}</p>
              <p className="mt-1.5 text-sm opacity-75">{primaryAction.detail}</p>
            </div>
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-white/15 backdrop-blur-sm border border-white/20">
              <Waves className="h-7 w-7" />
            </div>
          </div>
        </button>

        {/* Secondary quick action */}
        <button
          type="button"
          onClick={() => onNavigate("comms")}
          className="flex w-full items-center gap-2.5 rounded-2xl border bg-card px-4 py-3.5 text-left transition-colors active:bg-muted"
        >
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-blue-100 dark:bg-blue-900/30">
            <BellRing className="h-4 w-4 text-blue-600 dark:text-blue-400" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold">Message</p>
            <p className="text-[11px] text-muted-foreground">Notifier un groupe</p>
          </div>
        </button>
      </section>

      {/* ── SECTION 2 : TOUR DE CONTRÔLE ── */}
      <section className="space-y-2.5">
        <SectionLabel>Tour de Contrôle</SectionLabel>

        <div
          className={[
            "rounded-3xl border p-4 space-y-3 transition-colors",
            hasAlerts
              ? "border-red-200 bg-red-50/70 dark:border-red-900/50 dark:bg-red-950/25"
              : "bg-card border-border",
          ].join(" ")}
        >
          {/* Fatigue alert list — front and center */}
          {hasAlerts && !kpiLoading && (
            <div className="space-y-1.5">
              {fatigueAlerts.map((alert) => (
                <button
                  key={alert.athleteName}
                  type="button"
                  onClick={() => onNavigate("swimmers")}
                  className="flex w-full items-center gap-3 rounded-2xl bg-white/70 dark:bg-black/20 px-3.5 py-2.5 text-left transition-colors active:bg-white/90"
                >
                  <span className="relative flex h-3 w-3 shrink-0">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-60" />
                    <span className="relative inline-flex h-3 w-3 rounded-full bg-red-500" />
                  </span>
                  <span className="flex-1 text-sm font-semibold text-red-900 dark:text-red-200">
                    {alert.athleteName}
                  </span>
                  <span className="text-[9px] font-black uppercase tracking-widest text-red-600 dark:text-red-400">
                    Fatigue max
                  </span>
                  <ChevronRight className="h-3.5 w-3.5 text-red-400" />
                </button>
              ))}
            </div>
          )}

          {/* KPI pair */}
          <div className="grid grid-cols-2 gap-2.5">
            <div
              className={[
                "rounded-2xl p-3.5",
                hasAlerts ? "bg-white/50 dark:bg-black/20" : "bg-muted/40",
              ].join(" ")}
            >
              <div className="mb-2 flex items-center gap-1.5">
                <HeartPulse
                  className={`h-3.5 w-3.5 ${fatigueAlerts.length > 0 ? "text-red-500" : "text-muted-foreground"}`}
                />
                <span className="text-[9px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
                  Alertes
                </span>
              </div>
              <p
                className={`text-4xl font-black tabular-nums leading-none ${fatigueAlerts.length > 0 ? "text-red-600 dark:text-red-400" : "text-foreground"
                  }`}
              >
                {kpiLoading ? "–" : fatigueAlerts.length}
              </p>
              <p className="mt-1.5 text-[11px] text-muted-foreground truncate">
                {kpiLoading
                  ? "Calcul…"
                  : fatigueAlerts.length > 0
                    ? fatigueAlerts.slice(0, 2).map((a) => a.athleteName.split(" ")[0]).join(", ")
                    : "Aucune alerte"}
              </p>
            </div>

            <div
              className={[
                "rounded-2xl p-3.5",
                hasAlerts ? "bg-white/50 dark:bg-black/20" : "bg-muted/40",
              ].join(" ")}
            >
              <div className="mb-2 flex items-center gap-1.5">
                <Zap className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-[9px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
                  Plus chargé
                </span>
              </div>
              <p className="text-2xl font-black truncate leading-none">
                {kpiLoading ? "–" : mostLoadedAthlete?.athleteName?.split(" ")[0] ?? "–"}
              </p>
              <p className="mt-1.5 text-[11px] text-muted-foreground">
                {kpiLoading
                  ? "Calcul…"
                  : mostLoadedAthlete
                    ? `Charge ${Math.round(mostLoadedAthlete.loadScore)}`
                    : "Pas de données"}
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ── SECTION 3 : NAGEURS ── */}
      <section className="space-y-2.5">
        <div className="flex items-center gap-3 pb-0.5">
          <span className="text-[9px] font-black uppercase tracking-[0.28em] text-muted-foreground/70">
            Nageurs
          </span>
          <div className="flex-1 h-px bg-border/50" />
          {search ? (
            <button
              type="button"
              onClick={() => setSearch("")}
              className="text-[10px] font-bold text-primary"
            >
              Effacer
            </button>
          ) : (
            <button
              type="button"
              onClick={() => onNavigate("swimmers")}
              className="flex items-center gap-0.5 text-[10px] font-bold text-primary"
            >
              Tous <ChevronRight className="h-3 w-3" />
            </button>
          )}
        </div>

        <div className="overflow-hidden rounded-3xl border bg-card shadow-sm">
          {athletesLoading ? (
            <div className="divide-y divide-border/60">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="flex items-center gap-3 px-4 py-3.5">
                  <div className="h-9 w-9 animate-pulse rounded-full bg-muted" />
                  <div className="flex-1 space-y-1.5">
                    <div className="h-3.5 w-28 animate-pulse rounded bg-muted" />
                    <div className="h-3 w-18 animate-pulse rounded bg-muted" />
                  </div>
                </div>
              ))}
            </div>
          ) : visibleAthletes.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-muted-foreground">
              Aucun nageur trouvé.
            </p>
          ) : (
            <div className="divide-y divide-border/60">
              {visibleAthletes.map((athlete) => {
                const isFatigueAlert = fatigueAlerts.some(
                  (a) => a.athleteName === athlete.display_name,
                );
                const initials = athlete.display_name.charAt(0).toUpperCase();
                const formeScore = athlete.id != null ? (formeScores.get(athlete.id) ?? null) : null;

                return (
                  <button
                    key={athlete.id ?? athlete.display_name}
                    type="button"
                    onClick={() => onOpenAthlete(athlete)}
                    className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors active:bg-muted"
                  >
                    {/* Avatar with alert ring */}
                    {athlete.avatar_url ? (
                      <img
                        src={athlete.avatar_url}
                        alt=""
                        className={[
                          "h-9 w-9 shrink-0 rounded-full object-cover border",
                          isFatigueAlert
                            ? "border-red-400/60 ring-2 ring-red-400/60 ring-offset-1"
                            : "border-border",
                        ].join(" ")}
                      />
                    ) : (
                      <div
                        className={[
                          "flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-bold transition-all",
                          isFatigueAlert
                            ? "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400 ring-2 ring-red-400/60 ring-offset-1"
                            : "bg-primary/10 text-primary",
                        ].join(" ")}
                      >
                        {initials}
                      </div>
                    )}

                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">{athlete.display_name}</p>
                      <div className="flex items-center gap-2">
                        <p className="truncate text-[11px] text-muted-foreground">
                          {athlete.group_label || "Sans groupe"}
                        </p>
                        {formeScore != null && <FormeDots score={formeScore} />}
                      </div>
                    </div>

                    {isFatigueAlert ? (
                      <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-red-100 px-2.5 py-1 text-[9px] font-black uppercase tracking-widest text-red-600 dark:bg-red-900/30 dark:text-red-400">
                        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-current" />
                        Alerte
                      </span>
                    ) : (
                      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </section>

      {/* ── SECTION 4 : ARSENAL ── */}
      <section className="space-y-2.5">
        <SectionLabel>Arsenal</SectionLabel>

        <div className="space-y-2 rounded-3xl border bg-card p-3 shadow-sm">
          {/* Session assignment row */}
          <button
            type="button"
            onClick={() => onNavigate("week")}
            className="flex w-full items-center gap-3 rounded-2xl bg-muted/40 px-4 py-3.5 text-left transition-colors active:bg-muted"
          >
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-violet-100 dark:bg-violet-900/30">
              <CalendarDays className="h-4.5 w-4.5 text-violet-600 dark:text-violet-400" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold">Calendrier · Assigner</p>
              <p className="text-[11px] text-muted-foreground">
                {swimSessionCount ?? 0} séances nat · {strengthSessionCount ?? 0} muscu
              </p>
            </div>
            <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
          </button>

          {/* Tools grid 4-col */}
          <div className="grid grid-cols-4 gap-1.5">
            {tools.map((tool) => (
              <button
                key={tool.label}
                type="button"
                onClick={tool.action}
                className="flex flex-col items-center gap-1.5 rounded-2xl border bg-card px-1.5 py-3 text-center transition-colors active:bg-muted"
              >
                <tool.icon className={`h-4.5 w-4.5 ${tool.color}`} />
                <span className="text-[9px] font-semibold leading-tight text-muted-foreground">
                  {tool.label}
                </span>
              </button>
            ))}
          </div>

          {/* All swimmers link */}
          <button
            type="button"
            onClick={() => onNavigate("swimmers")}
            className="flex w-full items-center gap-3 rounded-2xl bg-muted/40 px-4 py-3.5 text-left transition-colors active:bg-muted"
          >
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-100 dark:bg-blue-900/30">
              <Users className="h-4.5 w-4.5 text-blue-600 dark:text-blue-400" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold">Voir tous les nageurs</p>
              <p className="text-[11px] text-muted-foreground">
                {athletesLoading
                  ? "Chargement…"
                  : `${athletes.length} nageur${athletes.length > 1 ? "s" : ""}`}
              </p>
            </div>
            <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
          </button>
        </div>
      </section>
    </div>
  );
};

// ── Data helpers (unchanged) ───────────────────────────────────────────────
const getDateOnly = (value: Date) => value.toISOString().split("T")[0];
const getRunTimestamp = (run: LocalStrengthRun) =>
  new Date(run.completed_at || run.started_at || run.date || run.created_at || 0).getTime();

const buildFatigueRating = (values: number[]) => {
  if (!values.length) return null;
  const average = values.reduce((sum, value) => sum + value, 0) / values.length;
  // Values are already normalized to 1-5 scale by mapFromDbSession/normalizeScaleToFive
  const rating = Math.min(5, Math.max(1, Math.round(average)));
  return { average, rating };
};

// ── Coach (outer router component — unchanged) ─────────────────────────────
export default function Coach() {
  const role = useAuth((state) => state.role);
  const setSelectedAthlete = useAuth((state) => state.setSelectedAthlete);
  const [, navigate] = useLocation();
  const [activeSection, setActiveSection] = useState<CoachSection>(() => {
    const hash = window.location.hash;
    const match = hash.match(/[?&]section=([^&]+)/);
    return (match?.[1] as CoachSection) || "home";
  });
  const kpiPeriod: KpiLookbackPeriod = 7;
  const [selectedCoachAthlete, setSelectedCoachAthlete] = useState<CoachAthleteOption | null>(null);

  // Sync activeSection → URL (replaceState to avoid extra history entries)
  useEffect(() => {
    const base = "/coach";
    const target =
      activeSection && activeSection !== "home"
        ? `#${base}?section=${activeSection}`
        : `#${base}`;
    if (window.location.hash !== target) {
      window.history.replaceState(null, "", target);
    }
  }, [activeSection]);

  // Reset to home when nav icon is tapped while already on /coach
  useEffect(() => {
    const reset = () => {
      setActiveSection("home");
      setSelectedCoachAthlete(null);
    };
    window.addEventListener("nav:reset", reset);
    return () => window.removeEventListener("nav:reset", reset);
  }, []);

  // Switch section when bottom nav triggers a section change
  useEffect(() => {
    const onSection = (e: Event) => {
      const section = (e as CustomEvent<string>).detail as CoachSection;
      setActiveSection(section);
      setSelectedCoachAthlete(null);
    };
    window.addEventListener("nav:section", onSection);
    return () => window.removeEventListener("nav:section", onSection);
  }, []);

  const coachAccess = role === "coach" || role === "admin";
  const shouldLoadCatalogs = activeSection === "home" || activeSection === "week";
  const shouldLoadAthletes =
    activeSection === "home" ||
    activeSection === "comms" ||
    activeSection === "swimmers" ||
    activeSection === "athlete" ||
    activeSection === "week" ||
    activeSection === "groups";
  const shouldLoadGroups =
    activeSection === "week" ||
    activeSection === "comms" ||
    activeSection === "groups";

  // Queries
  const { data: swimSessions } = useQuery({
    queryKey: ["swim_catalog"],
    queryFn: () => api.getSwimCatalog(),
    enabled: coachAccess && shouldLoadCatalogs,
  });
  const { data: strengthSessions } = useQuery({
    queryKey: ["strength_catalog"],
    queryFn: () => api.getStrengthSessions(),
    enabled: coachAccess && shouldLoadCatalogs,
  });
  const { data: athletes = [], isLoading: athletesLoading } = useQuery({
    queryKey: ["athletes"],
    queryFn: () => api.getAthletes(),
    enabled: coachAccess && shouldLoadAthletes,
  });
  const topAthletes = useMemo(() => athletes.slice(0, 5), [athletes]);
  const { data: groups = [] } = useQuery({
    queryKey: ["groups"],
    queryFn: () => api.getGroups(),
    enabled: coachAccess && shouldLoadGroups,
  });
  const coachKpisQuery = useQuery({
    queryKey: ["coach-kpis", kpiPeriod, topAthletes.map((athlete) => athlete.id ?? athlete.display_name)],
    enabled: coachAccess && activeSection === "home" && topAthletes.length > 0,
    queryFn: async () => {
      const lookbackDays = kpiPeriod;
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - lookbackDays);
      const fromDate = getDateOnly(startDate);
      const toDate = getDateOnly(new Date());

      const perAthlete = await Promise.all(
        topAthletes.map(async (athlete) => {
          const [sessions, strength] = await Promise.all([
            api.getSessions(athlete.display_name, athlete.id),
            api.getStrengthHistory(athlete.display_name, {
              athleteId: athlete.id,
              limit: 50,
              from: fromDate,
              to: toDate,
            }),
          ]);
          const recentSessions = sessions.filter(
            (session) => new Date(session.date).getTime() >= startDate.getTime(),
          );
          const sessionFatigueValues = recentSessions
            .map((session) => session.fatigue ?? session.feeling)
            .filter((value): value is number => Number.isFinite(value));
          const swimLoad = recentSessions.reduce(
            (sum, session) => sum + (Number(session.duration) || 0) * (Number(session.effort) || 0),
            0,
          );
          const runs = strength?.runs ?? [];
          const recentRuns = runs.filter((run: LocalStrengthRun) => getRunTimestamp(run) >= startDate.getTime());
          const runFatigueValues = recentRuns
            .map((run: LocalStrengthRun) => run.fatigue ?? run.feeling ?? run.rpe)
            .filter((value: unknown): value is number => Number.isFinite(Number(value)))
            .map((value: unknown) => Number(value));
          const strengthLoad = recentRuns.reduce((sum: number, run: LocalStrengthRun) => {
            const runEffort = Number(run.feeling ?? run.rpe ?? 0);
            const runDuration = Number(run.duration ?? 0);
            if (runDuration > 0 && runEffort > 0) {
              return sum + runDuration * runEffort;
            }
            const setCount = Array.isArray(run.logs) ? run.logs.length : 0;
            return sum + setCount * 5;
          }, 0);
          const fatigueRating = buildFatigueRating([...sessionFatigueValues, ...runFatigueValues]);
          // Compute forme score from most recent session (same pattern as CoachSwimmersOverview)
          const lastSession = recentSessions[0];
          let formeScore: number | null = null;
          if (lastSession) {
            const fv: number[] = [];
            const eff = lastSession.effort;
            const fat = lastSession.fatigue ?? lastSession.feeling;
            const perf = lastSession.performance;
            const eng = lastSession.engagement;
            // Values are normalized to 1-5 scale — invert effort and fatigue (high = bad)
            if (eff != null && Number.isFinite(eff)) fv.push(6 - eff);
            if (fat != null && Number.isFinite(fat)) fv.push(6 - fat);
            if (perf != null && Number.isFinite(perf)) fv.push(perf);
            if (eng != null && Number.isFinite(eng)) fv.push(eng);
            if (fv.length > 0) {
              formeScore = Math.round((fv.reduce((a, b) => a + b, 0) / fv.length) * 10) / 10;
            }
          }
          return {
            athleteId: athlete.id,
            athleteName: athlete.display_name,
            loadScore: swimLoad + strengthLoad,
            fatigueRating,
            formeScore,
          };
        }),
      );

      const fatigueAlerts = perAthlete
        .filter((entry) => entry.fatigueRating?.rating === 5)
        .map((entry) => ({
          athleteName: entry.athleteName,
          rating: entry.fatigueRating?.rating ?? 0,
        }));
      const mostLoadedAthlete = perAthlete
        .filter((entry) => entry.loadScore > 0)
        .sort((a, b) => b.loadScore - a.loadScore)[0];

      const formeScores = new Map<number, number | null>();
      for (const entry of perAthlete) {
        if (entry.athleteId != null) {
          formeScores.set(entry.athleteId, entry.formeScore);
        }
      }

      return { fatigueAlerts, mostLoadedAthlete: mostLoadedAthlete ?? null, formeScores };
    },
  });

  const handleOpenAthlete = (athlete: CoachAthleteOption) => {
    setSelectedAthlete({ id: athlete.id ?? null, name: athlete.display_name });
    if (athlete.id == null) {
      navigate("/progress");
      return;
    }
    setSelectedCoachAthlete(athlete);
    setActiveSection("athlete");
  };

  if (!coachAccess) {
    return (
      <div className="flex items-center justify-center min-h-[60vh] animate-in fade-in motion-reduce:animate-none">
        <Card className="w-full max-w-sm shadow-xl border-t-4 border-t-primary">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 uppercase italic">
              <Users className="h-5 w-5 text-primary" />
              Accès Coach
            </CardTitle>
            <CardDescription>Cette section est réservée aux coachs et administrateurs.</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Connectez-vous avec un compte autorisé pour accéder aux outils de gestion.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {activeSection === "home" ? (
        <CoachHome
          onNavigate={setActiveSection}
          onOpenRecordsClub={() => navigate("/records-club")}
          onOpenAthlete={handleOpenAthlete}
          athletes={athletes}
          athletesLoading={athletesLoading}
          kpiLoading={coachKpisQuery.isLoading}
          fatigueAlerts={coachKpisQuery.data?.fatigueAlerts ?? []}
          mostLoadedAthlete={coachKpisQuery.data?.mostLoadedAthlete ?? null}
          formeScores={coachKpisQuery.data?.formeScores ?? new Map()}
          swimSessionCount={swimSessions?.length}
          strengthSessionCount={strengthSessions?.length}
        />
      ) : null}

      {activeSection === "week" ? (
        <Suspense fallback={<PageSkeleton />}>
          <CoachWeekView
            groups={groups}
            athletes={athletes}
            swimSessions={swimSessions}
            strengthSessions={strengthSessions}
          />
        </Suspense>
      ) : null}

      {activeSection === "library" ? (
        <Suspense fallback={<PageSkeleton />}>
          <CoachLibrary />
        </Suspense>
      ) : null}

      {activeSection === "swimmers" ? (
        <Suspense fallback={<PageSkeleton />}>
          <CoachSwimmersOverview
            athletes={athletes}
            athletesLoading={athletesLoading}
            onBack={() => setActiveSection("home")}
            onOpenAthlete={handleOpenAthlete}
          />
        </Suspense>
      ) : null}

      {activeSection === "athlete" ? (
        <Suspense fallback={<PageSkeleton />}>
          <CoachSwimmerDetail
            athleteId={selectedCoachAthlete?.id ?? null}
            athleteName={selectedCoachAthlete?.display_name ?? null}
            onBack={() => setActiveSection("swimmers")}
          />
        </Suspense>
      ) : null}

      {activeSection === "groups" ? (
        <Suspense fallback={<PageSkeleton />}>
          <CoachGroupsScreen
            onBack={() => setActiveSection("home")}
            athletes={athletes}
            groups={groups}
            athletesLoading={athletesLoading}
          />
        </Suspense>
      ) : null}

      {activeSection === "competitions" ? (
        <Suspense fallback={<PageSkeleton />}>
          <CoachCompetitionsScreen
            onBack={() => setActiveSection("home")}
          />
        </Suspense>
      ) : null}

      {activeSection === "comms" ? (
        <Suspense fallback={<PageSkeleton />}>
          <CoachComms
            athletes={athletes}
            groups={groups}
            athletesLoading={athletesLoading}
          />
        </Suspense>
      ) : null}

    </div>
  );
}
