import { useState, useMemo, useEffect } from "react";
import { useRoute, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import {
  getCompetitions,
  getCompetitionRaces,
  getRaceRoutines,
  getRoutineTemplates,
} from "@/lib/api";
import { eventLabel } from "@/lib/objectiveHelpers";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import RacesTab from "@/components/competition/RacesTab";
import ChecklistTab from "@/components/competition/ChecklistTab";
import RoutinesTab from "@/components/competition/RoutinesTab";
import TimelineTab from "@/components/competition/TimelineTab";
import {
  ArrowLeft,
  Trophy,
  MapPin,
  CalendarDays,
  ListChecks,
  Timer,
  Repeat,
} from "lucide-react";

/* ── Helpers ──────────────────────────────────────────────── */

function formatDate(iso: string): string {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
}

function formatDateRange(start: string, end?: string | null): string {
  if (!end || end === start) return formatDate(start);
  const s = new Date(start + "T00:00:00");
  const e = new Date(end + "T00:00:00");
  if (s.getMonth() === e.getMonth() && s.getFullYear() === e.getFullYear()) {
    return `${s.getDate()} – ${e.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })}`;
  }
  return `${formatDate(start)} – ${formatDate(end)}`;
}

function daysUntil(iso: string): number {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const target = new Date(iso + "T00:00:00");
  return Math.round((target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

function countdownBadge(days: number): { label: string; variant: "default" | "secondary" | "outline" } {
  if (days < 0) return { label: "Terminée", variant: "outline" };
  if (days === 0) return { label: "Aujourd'hui", variant: "default" };
  return { label: `J-${days}`, variant: "secondary" };
}

/* ── Tab types ────────────────────────────────────────────── */

type CompetitionTab = "courses" | "routines" | "timeline" | "checklist";

/* ── Main component ───────────────────────────────────────── */

export default function CompetitionPrep() {
  const [, params] = useRoute("/competition/:id/prep");
  const [, navigate] = useLocation();
  const competitionId = params?.id ?? null;

  // Persist the active tab per competition in sessionStorage so that
  // hitting back/forward or navigating away and coming back preserves
  // the user's context (checklist → routines → back shouldn't reset to
  // checklist, which was the pre-audit behavior).
  const tabStorageKey = competitionId ? `competition-tab-${competitionId}` : null;
  const [activeTab, setActiveTab] = useState<CompetitionTab>(() => {
    if (typeof window === "undefined" || !tabStorageKey) return "checklist";
    const stored = window.sessionStorage.getItem(tabStorageKey);
    if (stored === "courses" || stored === "routines" || stored === "timeline" || stored === "checklist") {
      return stored;
    }
    return "checklist";
  });

  useEffect(() => {
    if (typeof window === "undefined" || !tabStorageKey) return;
    window.sessionStorage.setItem(tabStorageKey, activeTab);
  }, [activeTab, tabStorageKey]);

  const { data: competitions = [] } = useQuery({
    queryKey: ["competitions"],
    queryFn: () => getCompetitions(),
  });

  const competition = useMemo(
    () => competitions.find((c) => c.id === competitionId) ?? null,
    [competitions, competitionId],
  );

  /* ── Queries for notification scheduling (hits React Query cache) ── */

  const { data: races = [] } = useQuery({
    queryKey: ["competition-races", competitionId],
    queryFn: () => getCompetitionRaces(competitionId!),
    enabled: !!competitionId,
  });

  const { data: raceRoutines = [] } = useQuery({
    queryKey: ["race-routines", competitionId],
    queryFn: () => getRaceRoutines(competitionId!),
    enabled: !!competitionId,
  });

  const { data: templates = [] } = useQuery({
    queryKey: ["routine-templates"],
    queryFn: () => getRoutineTemplates(),
  });

  /* ── Schedule push notifications for first routine step ── */

  const getScheduledNotifs = (): Set<string> => {
    try {
      const stored = sessionStorage.getItem("eac-comp-notif-scheduled");
      return stored ? new Set(JSON.parse(stored)) : new Set();
    } catch { return new Set(); }
  };
  const addScheduledNotif = (key: string) => {
    const set = getScheduledNotifs();
    set.add(key);
    sessionStorage.setItem("eac-comp-notif-scheduled", JSON.stringify([...set]));
  };

  useEffect(() => {
    if (!competition || races.length === 0) return;

    // Only schedule on competition day(s)
    const today = new Date();
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

    // Build routine map: raceId -> template
    const routineByRaceId = new Map<string, typeof templates[number]>();
    for (const rr of raceRoutines) {
      const tmpl = templates.find((t) => t.id === rr.routine_id);
      if (tmpl) routineByRaceId.set(rr.race_id, tmpl);
    }

    const timeouts: ReturnType<typeof setTimeout>[] = [];

    for (const race of races) {
      if (race.race_day !== todayStr || !race.start_time) continue;

      const routine = routineByRaceId.get(race.id);
      if (!routine?.steps?.length) continue;

      // Find the earliest step (most negative offset)
      const firstStep = [...routine.steps].sort((a, b) => a.offset_minutes - b.offset_minutes)[0];

      // Compute absolute time of this step
      const [rh, rm] = race.start_time.slice(0, 5).split(":").map(Number);
      const stepMinutes = rh * 60 + rm + firstStep.offset_minutes;
      const stepDate = new Date(today);
      stepDate.setHours(Math.floor(stepMinutes / 60), stepMinutes % 60, 0, 0);

      const delayMs = stepDate.getTime() - Date.now();
      if (delayMs < 0) continue; // Already past

      // Deduplicate — don't re-schedule if already done for this race
      const key = `${race.id}-${firstStep.offset_minutes}`;
      if (getScheduledNotifs().has(key)) continue;
      addScheduledNotif(key);

      const suffix = race.race_type === "finale"
        ? race.final_letter ? ` — Finale ${race.final_letter}` : " — Finale"
        : "";
      const raceLabel = eventLabel(race.event_code) + suffix;
      const notifTitle = `🏊 ${raceLabel}`;
      const notifBody = `${firstStep.label} — c'est parti !`;

      const tid = setTimeout(() => {
        if (Notification.permission === "granted") {
          navigator.serviceWorker?.ready.then((reg) => {
            reg.showNotification(notifTitle, {
              body: notifBody,
              icon: "/competition/icon-192.png",
              badge: "/competition/favicon.png",
              tag: `routine-${race.id}`,
              data: { url: `#/competition/${competition.id}` },
              vibrate: [200, 100, 200],
            } as NotificationOptions & { vibrate?: number[] });
          });
        }
      }, delayMs);

      timeouts.push(tid);
    }

    return () => timeouts.forEach(clearTimeout);
  }, [competition, races, raceRoutines, templates]);

  const days = competition ? daysUntil(competition.date) : null;
  const badge = days != null ? countdownBadge(days) : null;

  if (!competition) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-4">
        <button
          type="button"
          onClick={() => navigate("/")}
          className="h-9 w-9 rounded-xl border border-border bg-card flex items-center justify-center hover:bg-muted transition"
          aria-label="Retour"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div className="mt-8 text-center">
          <Trophy className="mx-auto h-10 w-10 text-muted-foreground/40" />
          <p className="mt-3 text-sm font-medium">Compétition introuvable</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Elle a peut-être été supprimée.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-4 space-y-4">
      {/* ── Header ────────────────────────────────────────── */}
      <div className="flex items-start gap-3">
        <button
          type="button"
          onClick={() => navigate(`/competition/${competition.id}`)}
          className="mt-0.5 h-9 w-9 rounded-xl border border-border bg-card flex items-center justify-center hover:bg-muted transition shrink-0"
          aria-label="Retour"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>

        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="flex items-start gap-2 flex-wrap">
            <h1 className="text-lg font-bold">{competition.name}</h1>
            {badge && (
              <Badge variant={badge.variant} className="text-[10px] px-2 py-0.5 shrink-0">
                {badge.label}
              </Badge>
            )}
          </div>

          <div className="flex items-center gap-3 flex-wrap text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <CalendarDays className="h-3 w-3" />
              {formatDateRange(competition.date, competition.end_date)}
            </span>
            {competition.location && (
              <span className="flex items-center gap-1">
                <MapPin className="h-3 w-3" />
                {competition.location}
              </span>
            )}
          </div>

          {competition.description && (
            <p className="text-xs text-muted-foreground/80 line-clamp-2">
              {competition.description}
            </p>
          )}
        </div>
      </div>

      {/* ── Tabs ──────────────────────────────────────────── */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as CompetitionTab)}>
        <TabsList className="grid h-auto w-full grid-cols-4 gap-1.5 bg-transparent p-0">
          <TabsTrigger
            value="checklist"
            className="rounded-xl border bg-card px-2 py-2 text-[11px] data-[state=active]:border-violet-500 data-[state=active]:bg-violet-500/5 data-[state=active]:text-violet-700 dark:data-[state=active]:text-violet-300"
          >
            <ListChecks className="mr-1 h-3 w-3" />
            Check
          </TabsTrigger>
          <TabsTrigger
            value="courses"
            className="rounded-xl border bg-card px-2 py-2 text-[11px] data-[state=active]:border-amber-500 data-[state=active]:bg-amber-500/5 data-[state=active]:text-amber-700 dark:data-[state=active]:text-amber-300"
          >
            <Trophy className="mr-1 h-3 w-3" />
            Courses
          </TabsTrigger>
          <TabsTrigger
            value="routines"
            className="rounded-xl border bg-card px-2 py-2 text-[11px] data-[state=active]:border-blue-500 data-[state=active]:bg-blue-500/5 data-[state=active]:text-blue-700 dark:data-[state=active]:text-blue-300"
          >
            <Repeat className="mr-1 h-3 w-3" />
            Routines
          </TabsTrigger>
          <TabsTrigger
            value="timeline"
            className="rounded-xl border bg-card px-2 py-2 text-[11px] data-[state=active]:border-emerald-500 data-[state=active]:bg-emerald-500/5 data-[state=active]:text-emerald-700 dark:data-[state=active]:text-emerald-300"
          >
            <Timer className="mr-1 h-3 w-3" />
            Jour J
          </TabsTrigger>
        </TabsList>

        {/* ── Checklist tab ───────────────────────────────── */}
        <TabsContent value="checklist" className="mt-4">
          <ChecklistTab competitionId={competition.id} />
        </TabsContent>

        {/* ── Courses tab ─────────────────────────────────── */}
        <TabsContent value="courses" className="mt-4">
          <RacesTab
            competitionId={competition.id}
            competitionDate={competition.date}
            competitionEndDate={competition.end_date}
          />
        </TabsContent>

        {/* ── Routines tab ────────────────────────────────── */}
        <TabsContent value="routines" className="mt-4">
          <RoutinesTab competitionId={competition.id} />
        </TabsContent>

        {/* ── Timeline tab ────────────────────────────────── */}
        <TabsContent value="timeline" className="mt-4">
          <TimelineTab
            competitionId={competition.id}
            competitionDate={competition.date}
            competitionEndDate={competition.end_date}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
