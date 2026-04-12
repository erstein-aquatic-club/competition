import { useState, useEffect, useMemo } from "react";
import { useAuth } from "@/lib/auth";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { Competition } from "@/lib/api";
import { useLocation } from "wouter";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card } from "@/components/ui/card";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import SwimmerWeekSlots from "@/components/shared/SwimmerWeekSlots";
import { WellnessBanner } from "@/components/wellness/WellnessBanner";
import { WellnessForm } from "@/components/wellness/WellnessForm";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { motion } from "framer-motion";
import { slideUp, staggerChildren } from "@/lib/animations";
import {
  Waves,
  Dumbbell,
  Check,
  Clock,
  Sun,
  Moon,
  Trophy,
  Crown,
  FileText,
  BarChart3,
  MessageCircle,
  MapPin,
  ChevronRight,
  Coffee,
} from "lucide-react";
import { resolveSwimmerAssignmentsBatch } from "@/lib/api/assignments";
import type { SwimmerTrainingSlot } from "@/lib/api/types";

// ── Helpers ────────────────────────────────────────────────────

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function toISODate(d: Date) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function todayISO(): string {
  return toISODate(new Date());
}

function metersToKm(m: number | string | null | undefined) {
  const n = Number(m);
  if (!Number.isFinite(n)) return 0;
  return Math.round((n / 1000) * 100) / 100;
}

function fmtKm(km: number | string | null | undefined) {
  const n = Number(km);
  if (!Number.isFinite(n)) return "—";
  const rounded = Math.round(n * 100) / 100;
  const str = String(rounded);
  return str.endsWith(".0") ? str.slice(0, -2) : str;
}

type SlotKey = "AM" | "PM";

type TodaySession = {
  id: string;
  slotKey: SlotKey;
  title: string;
  km: number | null;
  isEmpty: boolean;
  slotTime?: string;
  slotLocation?: string;
  isMuscu?: boolean;
  assignmentId?: number;
};

// ── Assignment helpers (simplified from useDashboardState) ─────

function pickAssignmentSlotKey(a: Record<string, unknown>, fallbackIdx: number): SlotKey {
  const direct =
    a?.slot ?? a?.session_slot ?? a?.assigned_slot ?? a?.time_slot ?? a?.slotKey;
  const norm = String(direct || "").toLowerCase();
  if (norm.includes("mat") || norm.includes("morning") || norm === "am") return "AM";
  if (norm.includes("soir") || norm.includes("evening") || norm === "pm") return "PM";
  return fallbackIdx === 0 ? "AM" : "PM";
}

function assignmentIso(a: Record<string, unknown>): string | null {
  const raw = a?.assigned_date ?? a?.date ?? a?.day ?? a?.scheduled_for ?? null;
  if (!raw) return null;
  const s = String(raw);
  const iso = s.length >= 10 ? s.slice(0, 10) : s;
  return /\d{4}-\d{2}-\d{2}/.test(iso) ? iso : null;
}

function assignmentPlannedKm(a: Record<string, unknown>): number | null {
  if (Array.isArray(a?.items)) {
    let totalMeters = 0;
    for (const item of a.items as any[]) {
      const dist = Number(item?.distance);
      if (!Number.isFinite(dist) || dist <= 0) continue;
      const payload = item?.raw_payload as Record<string, any> | null | undefined;
      const exerciseReps = Number(payload?.exercise_repetitions);
      const blockReps = Number(payload?.block_repetitions);
      const reps = Number.isFinite(exerciseReps) && exerciseReps > 0 ? exerciseReps : 1;
      const blockMultiplier = Number.isFinite(blockReps) && blockReps > 0 ? blockReps : 1;
      totalMeters += dist * reps * blockMultiplier;
    }
    if (totalMeters > 0) return metersToKm(totalMeters);
  }
  const meters = a?.distance_meters ?? a?.distanceMeters ?? a?.distance ?? null;
  if (meters != null && Number.isFinite(Number(meters))) {
    const n = Number(meters);
    if (n > 0 && n <= 50) return n;
    return metersToKm(n);
  }
  const km = a?.km ?? a?.distance_km ?? a?.planned_km ?? null;
  if (km != null && Number.isFinite(Number(km))) return Number(km);
  return null;
}

// ── Component ──────────────────────────────────────────────────

export default function SwimmerHome() {
  const user = useAuth((s) => s.user);
  const userId = useAuth((s) => s.userId);
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();

  const [wellnessOpen, setWellnessOpen] = useState(false);

  // Auto-open wellness via deep link
  useEffect(() => {
    const hash = window.location.hash;
    if (hash.includes("wellness=open")) {
      setWellnessOpen(true);
      const hashBase = hash.split("?")[0];
      window.history.replaceState(null, "", window.location.pathname + hashBase);
    }
  }, []);

  // ── Profile ──────────────────────────────────────────────────
  const { data: profile } = useQuery({
    queryKey: ["profile", user, userId],
    queryFn: () => api.getProfile({ displayName: user, userId }),
    enabled: !!user,
  });

  const firstName = (profile?.display_name || user || "").split(" ")[0];
  const today = format(new Date(), "EEEE d MMMM", { locale: fr });
  const todayDate = todayISO();

  // ── Section C: Today's sessions ──────────────────────────────
  const { data: assignments } = useQuery({
    queryKey: ["assignments", user],
    queryFn: () => api.getAssignments(user!, userId),
    enabled: !!user,
  });

  const { data: sessions } = useQuery({
    queryKey: ["sessions", userId ?? user],
    queryFn: () => api.getSessions(user!, userId),
    enabled: !!user,
  });

  const { data: swimmerSlots } = useQuery({
    queryKey: ["swimmer-slots", userId],
    queryFn: () => api.getSwimmerSlots(userId!),
    enabled: !!userId,
    staleTime: 5 * 60 * 1000,
  });

  // Filter swim slots (exclude gym)
  const swimSlots = useMemo(() => {
    if (!swimmerSlots?.length) return [];
    return swimmerSlots.filter((s: SwimmerTrainingSlot) => {
      const loc = s.location?.toLowerCase() ?? "";
      return !loc.includes("salle");
    });
  }, [swimmerSlots]);

  // Get today's day of week
  const todayDayOfWeek = useMemo(() => {
    const jsDay = new Date().getDay();
    return jsDay === 0 ? 7 : jsDay;
  }, []);

  const todaySwimSlots = useMemo(
    () => swimSlots.filter((s: SwimmerTrainingSlot) => s.day_of_week === todayDayOfWeek),
    [swimSlots, todayDayOfWeek],
  );

  const hasSwimmerSlots = swimSlots.length > 0;

  // Today's assignments
  const todayAssignments = useMemo(() => {
    const list = Array.isArray(assignments) ? assignments : [];
    return list.filter((a) => {
      const iso = assignmentIso(a as unknown as Record<string, unknown>);
      return iso === todayDate;
    });
  }, [assignments, todayDate]);

  // Resolve assignments for today if swimmer has personal slots
  const { data: resolvedByDate } = useQuery({
    queryKey: ["resolved-assignments-batch", userId, [todayDate]],
    queryFn: () => resolveSwimmerAssignmentsBatch(userId!, [todayDate]),
    enabled: !!userId && hasSwimmerSlots && todayAssignments.length > 0,
    staleTime: 2 * 60 * 1000,
  });

  // Build today's sessions list
  const todaySessions = useMemo((): TodaySession[] => {
    // Check for muscu assignments
    const muscuAssignments = (Array.isArray(assignments) ? assignments : []).filter((a) => {
      const iso = assignmentIso(a as unknown as Record<string, unknown>);
      return iso === todayDate && a?.session_type === "strength";
    });

    const swimSessions: TodaySession[] = [];

    if (hasSwimmerSlots && todaySwimSlots.length > 0) {
      const resolved = resolvedByDate?.get(todayDate);

      for (const slot of todaySwimSlots) {
        const hour = parseInt(slot.start_time.split(":")[0], 10);
        const slotKey: SlotKey = hour < 13 ? "AM" : "PM";
        const slotTime = `${slot.start_time.slice(0, 5)}-${slot.end_time.slice(0, 5)}`;

        const match = resolved?.find((r) => r.swimmerSlotId === slot.id);

        if (match && match.assignment) {
          const a = match.assignment;
          const aRecord = a as unknown as Record<string, unknown>;
          swimSessions.push({
            id: `${todayDate}__${slot.id}`,
            slotKey,
            title: String(a.title ?? "Séance coach"),
            km: assignmentPlannedKm(aRecord),
            isEmpty: false,
            slotTime,
            slotLocation: slot.location,
            assignmentId: match.assignmentId ?? undefined,
          });
        } else if (todayAssignments.length > 0) {
          // Fallback: try timing-based match
          const fallback = todayAssignments.find(
            (a) => a.session_type === "swim" && a.target_user_id === userId,
          ) ?? todayAssignments.find(
            (a) => a.session_type === "swim" && !a.target_user_id,
          );
          if (fallback) {
            const fRecord = fallback as unknown as Record<string, unknown>;
            swimSessions.push({
              id: `${todayDate}__${slot.id}`,
              slotKey,
              title: String(fallback.title ?? "Séance coach"),
              km: assignmentPlannedKm(fRecord),
              isEmpty: false,
              slotTime,
              slotLocation: slot.location,
              assignmentId: typeof fallback.id === "number" ? fallback.id : Number(fallback.id) || undefined,
            });
          } else {
            swimSessions.push({
              id: `${todayDate}__${slot.id}`,
              slotKey,
              title: "Séance vide",
              km: null,
              isEmpty: true,
              slotTime,
              slotLocation: slot.location,
            });
          }
        } else {
          swimSessions.push({
            id: `${todayDate}__${slot.id}`,
            slotKey,
            title: "Séance vide",
            km: null,
            isEmpty: true,
            slotTime,
            slotLocation: slot.location,
          });
        }
      }
    } else {
      // Legacy path: AM/PM slots
      const swimAssigns = todayAssignments.filter((a) => a?.session_type === "swim");
      const usedSlots = new Set<SlotKey>();

      for (const [idx, a] of swimAssigns.entries()) {
        const aRecord = a as unknown as Record<string, unknown>;
        const slotKey = pickAssignmentSlotKey(aRecord, idx);
        if (usedSlots.has(slotKey)) continue;
        usedSlots.add(slotKey);
        swimSessions.push({
          id: `${todayDate}__${slotKey}`,
          slotKey,
          title: String(a?.title ?? "Séance coach"),
          km: assignmentPlannedKm(aRecord),
          isEmpty: false,
          assignmentId: typeof a?.id === "number" ? a.id : Number(a?.id) || undefined,
        });
      }
    }

    // Add muscu sessions
    for (const a of muscuAssignments) {
      const aRecord = a as unknown as Record<string, unknown>;
      const slotKey = pickAssignmentSlotKey(aRecord, 1);
      swimSessions.push({
        id: `${todayDate}__muscu_${a.id}`,
        slotKey,
        title: String(a?.title ?? "Séance musculation"),
        km: null,
        isEmpty: false,
        isMuscu: true,
        assignmentId: typeof a?.id === "number" ? a.id : Number(a?.id) || undefined,
      });
    }

    return swimSessions;
  }, [
    assignments,
    todayDate,
    hasSwimmerSlots,
    todaySwimSlots,
    resolvedByDate,
    todayAssignments,
    userId,
  ]);

  // Check if sessions have been logged today
  const logsBySessionKey = useMemo(() => {
    const list = Array.isArray(sessions) ? sessions : [];
    const map: Record<string, boolean> = {};
    for (const s of list) {
      const iso = String(s?.date ?? "").slice(0, 10);
      if (iso !== todayDate) continue;
      const slot: SlotKey = s?.slot === "Soir" ? "PM" : "AM";
      map[`${iso}__${slot}`] = true;
    }
    return map;
  }, [sessions, todayDate]);

  function isSessionLogged(session: TodaySession): boolean {
    // Check by legacy key
    if (logsBySessionKey[`${todayDate}__${session.slotKey}`]) return true;
    return false;
  }

  // ── Section D: Next competition ──────────────────────────────
  const { data: competitions = [] } = useQuery({
    queryKey: ["competitions"],
    queryFn: () => api.getCompetitions(),
  });

  const { data: myCompetitionIds } = useQuery({
    queryKey: ["my-competition-ids", userId],
    queryFn: () => api.getMyCompetitionIds(userId),
    enabled: !!userId,
  });

  const nextCompetition = useMemo((): (Competition & { daysUntil: number }) | null => {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const today30 = new Date(now);
    today30.setDate(today30.getDate() + 30);

    const visible =
      myCompetitionIds && myCompetitionIds.length > 0
        ? competitions.filter((c) => myCompetitionIds.includes(c.id))
        : competitions;

    const upcoming = visible
      .filter((c) => {
        if (!c.date) return false;
        const d = new Date(c.date.slice(0, 10) + "T00:00:00");
        return d >= now && d <= today30;
      })
      .sort((a, b) => a.date.localeCompare(b.date));

    if (upcoming.length === 0) return null;

    const comp = upcoming[0];
    const target = new Date(comp.date.slice(0, 10) + "T00:00:00");
    const daysUntil = Math.round((target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

    return { ...comp, daysUntil };
  }, [competitions, myCompetitionIds]);

  // Competition detail data (races + checklist)
  const { data: compRaces } = useQuery({
    queryKey: ["competition-races", nextCompetition?.id],
    queryFn: () => api.getCompetitionRaces(nextCompetition!.id),
    enabled: !!nextCompetition,
  });

  const { data: compChecklist } = useQuery({
    queryKey: ["competition-checklist", nextCompetition?.id],
    queryFn: () => api.getCompetitionChecklist(nextCompetition!.id),
    enabled: !!nextCompetition,
  });

  const checklistProgress = useMemo(() => {
    if (!compChecklist || !Array.isArray(compChecklist)) return null;
    const total = compChecklist.length;
    const done = compChecklist.filter((c: any) => c.checked).length;
    return { done, total };
  }, [compChecklist]);

  // ── Section E: Coach messages ────────────────────────────────
  const { data: notificationsResult } = useQuery({
    queryKey: ["notifications-home", userId],
    queryFn: () =>
      api.notifications_list({
        targetUserId: userId,
        limit: 20,
        status: "unread",
      }),
    enabled: !!userId,
    staleTime: 60_000,
  });

  const unreadNotifications = useMemo(() => {
    const notifs = notificationsResult?.notifications ?? [];
    return notifs.filter((n) => !n.read);
  }, [notificationsResult]);

  const unreadCount = unreadNotifications.length;
  const latestUnread = unreadNotifications[0] ?? null;

  // ── Section F: Quick access links ────────────────────────────
  const quickLinks = useMemo(
    () => [
      { icon: Trophy, label: "Records", href: "/records", color: "text-amber-600 dark:text-amber-400 bg-amber-500/12 dark:bg-amber-500/20" },
      { icon: Crown, label: "Club", href: "/hall-of-fame", color: "text-yellow-600 dark:text-yellow-400 bg-yellow-500/12 dark:bg-yellow-500/20" },
      { icon: FileText, label: "Notes", href: "/swim-notes", color: "text-blue-600 dark:text-blue-400 bg-blue-500/12 dark:bg-blue-500/20" },
      {
        icon: BarChart3,
        label: "Rapport",
        href: `/report/${userId}/${format(new Date(), "yyyy-MM")}`,
        color: "text-emerald-600 dark:text-emerald-400 bg-emerald-500/12 dark:bg-emerald-500/20",
      },
    ],
    [userId],
  );

  // ── Render ───────────────────────────────────────────────────
  return (
    <div className="mx-auto max-w-lg px-4 pb-4">
      {/* Section A — Header */}
      <div className="flex items-center justify-between pt-5 pb-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">
            Bonjour <span className="font-bold">{firstName}</span>
          </h1>
          <p className="text-[13px] text-muted-foreground/80 capitalize mt-0.5">{today}</p>
        </div>
        <button onClick={() => navigate("/profile")} className="shrink-0">
          <Avatar className="h-9 w-9 ring-2 ring-primary/25 shadow-md shadow-primary/10">
            <AvatarImage src={profile?.avatar_url ?? undefined} />
            <AvatarFallback className="text-xs font-semibold bg-primary/10 text-primary">
              {firstName?.[0]?.toUpperCase() ?? "?"}
            </AvatarFallback>
          </Avatar>
        </button>
      </div>

      <motion.div
        className="space-y-5"
        initial="hidden"
        animate="visible"
        variants={staggerChildren}
      >
        {/* Section B — Wellness du jour */}
        <motion.div variants={slideUp}>
          <WellnessBanner
            userId={userId ?? 0}
            onOpen={() => setWellnessOpen(true)}
          />
        </motion.div>

        <Sheet open={wellnessOpen} onOpenChange={setWellnessOpen}>
          <SheetContent side="bottom" className="max-h-[90dvh] overflow-y-auto rounded-t-2xl">
            <SheetHeader>
              <SheetTitle>Bien-être du jour</SheetTitle>
            </SheetHeader>
            <div className="px-1 pb-4">
              <WellnessForm
                userId={userId ?? 0}
                date={todayDate}
                onSaved={() => {
                  setWellnessOpen(false);
                  queryClient.invalidateQueries({ queryKey: ["wellness"] });
                }}
              />
            </div>
          </SheetContent>
        </Sheet>

        {/* Section C — Aujourd'hui */}
        <motion.div variants={slideUp}>
          <p className="text-xs text-muted-foreground uppercase tracking-wide font-semibold mb-2">
            Aujourd'hui
          </p>
          {todaySessions.length === 0 ? (
            <Card className="p-4 bg-gradient-to-br from-sky-50/50 to-blue-50/30 dark:from-sky-950/20 dark:to-blue-950/10 border-sky-100/60 dark:border-sky-900/30">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-sky-100/80 dark:bg-sky-900/30">
                  <Coffee className="h-5 w-5 text-sky-600 dark:text-sky-400" />
                </div>
                <div>
                  <p className="text-sm font-medium text-foreground">Jour de repos</p>
                  <p className="text-xs text-muted-foreground/70">Profite bien de ta journée</p>
                </div>
              </div>
            </Card>
          ) : (
            <div className="space-y-2">
              {todaySessions.map((session) => {
                const logged = isSessionLogged(session);
                const SlotIcon = session.slotKey === "AM" ? Sun : Moon;
                const TypeIcon = session.isMuscu ? Dumbbell : Waves;

                return (
                  <Card
                    key={session.id}
                    className={`relative overflow-hidden p-3 cursor-pointer transition-all hover:bg-accent/50 active:scale-[0.98] ${
                      session.isMuscu
                        ? "border-l-[3px] border-l-amber-500"
                        : "border-l-[3px] border-l-primary"
                    }`}
                    onClick={() => {
                      if (session.isMuscu) {
                        navigate("/strength");
                      } else {
                        navigate("/natation");
                      }
                    }}
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
                          session.isMuscu
                            ? "bg-amber-500/10"
                            : "bg-primary/10"
                        }`}
                      >
                        <TypeIcon
                          className={`h-5 w-5 ${
                            session.isMuscu ? "text-amber-600 dark:text-amber-400" : "text-primary"
                          }`}
                        />
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <SlotIcon className="h-3 w-3 text-muted-foreground/70" />
                          <span className="text-xs text-muted-foreground font-medium">
                            {session.slotKey === "AM" ? "Matin" : "Soir"}
                            {session.slotTime && ` · ${session.slotTime}`}
                          </span>
                        </div>
                        <p className="text-sm font-semibold truncate mt-0.5">
                          {session.isEmpty ? "Entraînement libre" : session.title}
                        </p>
                        {session.km != null && (
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {fmtKm(session.km)} km
                          </p>
                        )}
                      </div>

                      <div className="shrink-0">
                        {logged ? (
                          <div className="flex h-7 items-center gap-1.5 rounded-full bg-emerald-500/15 px-2.5">
                            <Check className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                            <span className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-400">
                              Fait
                            </span>
                          </div>
                        ) : session.isMuscu ? (
                          <span className="text-xs font-semibold text-amber-700 dark:text-amber-300 bg-amber-500/15 px-2.5 py-1 rounded-full">
                            Lancer
                          </span>
                        ) : (
                          <div className="flex h-7 items-center gap-1.5 rounded-full bg-orange-500/10 px-2.5">
                            <Clock className="h-3.5 w-3.5 text-orange-500 dark:text-orange-400" />
                            <span className="text-[11px] font-semibold text-orange-600 dark:text-orange-400">
                              A faire
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </motion.div>

        {/* Section D — Prochaine compétition (conditional) */}
        {nextCompetition && (
          <motion.div variants={slideUp}>
            <p className="text-xs text-muted-foreground uppercase tracking-wide font-semibold mb-2">
              Prochaine compétition
            </p>
            <Card
              className="p-4 cursor-pointer transition-all hover:bg-amber-50/40 dark:hover:bg-amber-950/20 active:scale-[0.98] border-amber-200/60 dark:border-amber-800/40 bg-gradient-to-br from-amber-50/40 to-orange-50/20 dark:from-amber-950/15 dark:to-orange-950/10"
              onClick={() => navigate(`/competition/${nextCompetition.id}`)}
            >
              <div className="flex items-start gap-3">
                <div className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-amber-500/15 dark:bg-amber-500/20">
                  <Trophy className="h-5 w-5 text-amber-600 dark:text-amber-400" />
                  <span className="absolute -top-1.5 -right-1.5 flex h-6 min-w-6 items-center justify-center rounded-full bg-amber-500 text-[11px] font-extrabold text-white px-1 shadow-sm">
                    {nextCompetition.daysUntil === 0 ? "J" : `J-${nextCompetition.daysUntil}`}
                  </span>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold truncate text-amber-950 dark:text-amber-100">
                    {nextCompetition.name}
                  </p>
                  {nextCompetition.location && (
                    <div className="flex items-center gap-1 mt-0.5">
                      <MapPin className="h-3 w-3 text-amber-600/60 dark:text-amber-400/60" />
                      <span className="text-xs text-amber-800/70 dark:text-amber-300/60 truncate">
                        {nextCompetition.location}
                      </span>
                    </div>
                  )}
                  <div className="flex items-center gap-3 mt-1.5 text-xs text-amber-700/70 dark:text-amber-400/60">
                    {compRaces && compRaces.length > 0 && (
                      <span>{compRaces.length} course{compRaces.length > 1 ? "s" : ""}</span>
                    )}
                    {checklistProgress && (
                      <span>
                        Checklist {checklistProgress.done}/{checklistProgress.total}
                      </span>
                    )}
                  </div>
                </div>
                <ChevronRight className="h-4 w-4 text-amber-400 dark:text-amber-500 mt-1 shrink-0" />
              </div>
            </Card>
          </motion.div>
        )}

        {/* Section E — Messages coach (conditional) */}
        {unreadCount > 0 && (
          <motion.div variants={slideUp}>
            <p className="text-xs text-muted-foreground uppercase tracking-wide font-semibold mb-2">
              Messages
            </p>
            <Card
              className="p-4 cursor-pointer transition-all hover:bg-violet-50/60 dark:hover:bg-violet-950/30 active:scale-[0.98] border-violet-200/60 dark:border-violet-800/40 bg-gradient-to-br from-violet-50/50 to-purple-50/30 dark:from-violet-950/20 dark:to-purple-950/10"
              onClick={() => navigate("/profile?section=messages")}
            >
              <div className="flex items-center gap-3">
                <div className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-violet-500/15 dark:bg-violet-500/20">
                  <MessageCircle className="h-5 w-5 text-violet-600 dark:text-violet-400" />
                  <span className="absolute -top-1 -right-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-violet-600 text-[10px] font-bold text-white px-1 shadow-sm">
                    {unreadCount}
                  </span>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-violet-900 dark:text-violet-200">
                    {unreadCount} message{unreadCount > 1 ? "s" : ""} non lu{unreadCount > 1 ? "s" : ""}
                  </p>
                  {latestUnread && (
                    <p className="text-xs text-violet-700/60 dark:text-violet-300/50 truncate mt-0.5">
                      {latestUnread.title}
                      {latestUnread.message ? ` — ${latestUnread.message}` : ""}
                    </p>
                  )}
                </div>
                <ChevronRight className="h-4 w-4 text-violet-400 dark:text-violet-500 shrink-0" />
              </div>
            </Card>
          </motion.div>
        )}

        {/* Section F — Accès rapides */}
        <motion.div variants={slideUp}>
          <p className="text-xs text-muted-foreground uppercase tracking-wide font-semibold mb-2">
            Accès rapides
          </p>
          <div className="grid grid-cols-4 gap-2.5">
            {quickLinks.map((link) => (
              <button
                key={link.href}
                onClick={() => navigate(link.href)}
                className="flex flex-col items-center gap-2 rounded-2xl border border-border/80 bg-card p-3.5 transition-all hover:bg-accent/50 hover:shadow-sm active:scale-95"
              >
                <div className={`flex h-11 w-11 items-center justify-center rounded-xl ${link.color}`}>
                  <link.icon className="h-[22px] w-[22px]" />
                </div>
                <span className="text-[11px] font-semibold text-muted-foreground">
                  {link.label}
                </span>
              </button>
            ))}
          </div>
        </motion.div>

        {/* Section G — Ma semaine */}
        <motion.div variants={slideUp}>
          <SwimmerWeekSlots swimmerSlots={swimmerSlots ?? []} />
        </motion.div>
      </motion.div>
    </div>
  );
}
