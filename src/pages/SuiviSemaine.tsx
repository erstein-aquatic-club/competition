/**
 * SuiviSemaine — Weekly timeline view for swimmers.
 *
 * Shows a day-by-day breakdown of the current (or past) week with:
 * - Logged sessions (ressentis) with indicator pastilles
 * - Missed sessions (no feedback yet) with tap-to-log CTA
 * - Absent sessions with undo capability
 * - Wellness CTA banner when today's check is not logged
 */

import { useState, useMemo, useCallback } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  XCircle,
  Undo2,
  MapPin,
  Clock,
  Droplets,
  Heart,
} from "lucide-react";
import { api } from "@/lib/api";
import type { Session, PlannedAbsence } from "@/lib/api";
import type { ResolvedSlotAssignment } from "@/lib/api/types";
import { resolveSwimmerAssignmentsBatch } from "@/lib/api/assignments";
import { getWellnessForDate } from "@/lib/api/wellness";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { PageHeader } from "@/components/shared/PageHeader";
import { WellnessForm } from "@/components/wellness/WellnessForm";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

// ── Helpers ──────────────────────────────────────────────────

function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

/** Monday-based week start for a given date */
function getMonday(d: Date): Date {
  const copy = new Date(d);
  const day = copy.getDay(); // 0=Sun, 1=Mon, ...
  const diff = day === 0 ? -6 : 1 - day;
  copy.setDate(copy.getDate() + diff);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function addDays(d: Date, n: number): Date {
  const copy = new Date(d);
  copy.setDate(copy.getDate() + n);
  return copy;
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function isToday(d: Date): boolean {
  return isoDate(d) === isoDate(new Date());
}

function isFuture(d: Date): boolean {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const copy = new Date(d);
  copy.setHours(0, 0, 0, 0);
  return copy > today;
}

const DAY_NAMES_FR = ["Lun.", "Mar.", "Mer.", "Jeu.", "Ven.", "Sam.", "Dim."];
const DAY_NAMES_FULL = ["lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi", "dimanche"];

function formatDateShort(d: Date): string {
  return d.toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
}

function formatWeekRange(monday: Date): string {
  const sunday = addDays(monday, 6);
  const m = monday.toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
  const s = sunday.toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
  return `${m} — ${s}`;
}

/** Derive AM/PM slot key from a time string like "17:00" */
function slotKeyFromTime(time: string): "AM" | "PM" {
  const hour = parseInt(time.split(":")[0], 10);
  return hour < 12 ? "AM" : "PM";
}

// ── Indicator colors (from SwimmerFeedbackTab pattern) ────────

const INDICATORS = [
  { key: "effort" as const, label: "Diff.", mode: "hard" as const },
  { key: "feeling" as const, label: "Fat.", mode: "hard" as const },
  { key: "performance" as const, label: "Perf", mode: "good" as const },
  { key: "engagement" as const, label: "Eng.", mode: "good" as const },
];

function indicatorColor(mode: "hard" | "good", value: number | null | undefined): string {
  const v = Number(value);
  if (!Number.isFinite(v) || v < 1 || v > 5) return "bg-muted text-muted-foreground";
  const effective = mode === "hard" ? 6 - v : v;
  if (effective >= 4) return "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400";
  if (effective >= 3) return "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400";
  return "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400";
}

// ── Types ────────────────────────────────────────────────────

type CardType = "logged" | "missed" | "absent";

interface TimelineCard {
  type: CardType;
  date: Date;
  iso: string;
  slotKey: "AM" | "PM";
  slotTime?: string;
  slotLocation?: string;
  title: string;
  km: number | null;
  session?: Session;
  absenceReason?: string | null;
  swimmerSlotId?: string;
  assignmentId?: number;
  assignmentSource?: "individual" | "subgroup" | "group" | "none";
}

// ── Component ────────────────────────────────────────────────

export default function SuiviSemaine() {
  const [, navigate] = useLocation();
  const user = useAuth((s) => s.user);
  const userId = useAuth((s) => s.userId);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Week navigation
  const [weekOffset, setWeekOffset] = useState(0);
  const monday = useMemo(() => addDays(getMonday(new Date()), weekOffset * 7), [weekOffset]);
  const weekDates = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(monday, i)), [monday]);
  const weekISOs = useMemo(() => weekDates.map(isoDate), [weekDates]);

  // Wellness sheet
  const [wellnessOpen, setWellnessOpen] = useState(false);

  // Expanded session cards
  const [expandedKey, setExpandedKey] = useState<string | null>(null);

  // ── Data fetching ──────────────────────────────────────────

  // Swimmer slots
  const { data: swimmerSlots = [] } = useQuery({
    queryKey: ["swimmer-slots", userId],
    queryFn: () => api.getSwimmerSlots(userId!),
    enabled: !!userId,
  });

  // Resolved assignments for the week
  const { data: assignmentsMap } = useQuery({
    queryKey: ["swimmer-assignments-batch", userId, weekISOs[0]],
    queryFn: () => resolveSwimmerAssignmentsBatch(userId!, weekISOs),
    enabled: !!userId && weekISOs.length > 0,
  });

  // Sessions (ressentis)
  const { data: allSessions = [] } = useQuery({
    queryKey: ["sessions", userId],
    queryFn: () => api.getSessions(user!, userId),
    enabled: !!user,
  });

  // Absences
  const { data: myAbsences = [] } = useQuery({
    queryKey: ["my-absences"],
    queryFn: () => api.getMyPlannedAbsences(),
    enabled: !!userId,
  });

  // Today's wellness
  const todayISO = isoDate(new Date());
  const { data: todayWellness } = useQuery({
    queryKey: ["wellness", userId, todayISO],
    queryFn: () => getWellnessForDate(userId!, todayISO),
    enabled: !!userId,
  });

  // ── Mutations ──────────────────────────────────────────────

  const absenceMutation = useMutation({
    mutationFn: ({ date, reason }: { date: string; reason?: string }) =>
      api.setPlannedAbsence(date, reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["my-absences"] });
      toast({ title: "Absence enregistree" });
    },
  });

  const removeAbsenceMutation = useMutation({
    mutationFn: (date: string) => api.removePlannedAbsence(date),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["my-absences"] });
      toast({ title: "Absence annulee" });
    },
  });

  // ── Build timeline cards ───────────────────────────────────

  const absencesByDate = useMemo(() => {
    const map = new Map<string, PlannedAbsence>();
    for (const a of myAbsences) map.set(a.date, a);
    return map;
  }, [myAbsences]);

  const sessionsByDateSlot = useMemo(() => {
    const map = new Map<string, Session>();
    for (const s of allSessions) {
      // Only keep sessions within this week
      if (!weekISOs.includes(s.date)) continue;
      const key = `${s.date}_${s.slot}`;
      // Keep the most recent (first in descending order)
      if (!map.has(key)) map.set(key, s);
    }
    return map;
  }, [allSessions, weekISOs]);

  const cards = useMemo<TimelineCard[]>(() => {
    const result: TimelineCard[] = [];

    for (let dayIdx = 0; dayIdx < 7; dayIdx++) {
      const date = weekDates[dayIdx];
      const iso = weekISOs[dayIdx];
      const dayOfWeek = dayIdx + 1; // 1=Monday

      // Get resolved assignments for this date
      const resolved: ResolvedSlotAssignment[] = assignmentsMap?.get(iso) ?? [];

      if (resolved.length === 0) {
        // Check if there are slots for this day (even without assignment)
        const daySlots = swimmerSlots.filter((s) => s.day_of_week === dayOfWeek);
        for (const slot of daySlots) {
          const sk = slotKeyFromTime(slot.start_time);
          const matchKey = `${iso}_${sk}`;
          const session = sessionsByDateSlot.get(matchKey);
          const absence = absencesByDate.get(iso);

          if (session) {
            result.push({
              type: "logged",
              date,
              iso,
              slotKey: sk,
              slotTime: `${slot.start_time}-${slot.end_time}`,
              slotLocation: slot.location,
              title: "Entraînement",
              km: session.distance > 0 ? session.distance : null,
              session,
              swimmerSlotId: slot.id,
            });
          } else if (absence) {
            result.push({
              type: "absent",
              date,
              iso,
              slotKey: sk,
              slotTime: `${slot.start_time}-${slot.end_time}`,
              slotLocation: slot.location,
              title: "Entraînement",
              km: null,
              absenceReason: absence.reason,
              swimmerSlotId: slot.id,
            });
          } else if (!isFuture(date)) {
            result.push({
              type: "missed",
              date,
              iso,
              slotKey: sk,
              slotTime: `${slot.start_time}-${slot.end_time}`,
              slotLocation: slot.location,
              title: "Entraînement",
              km: null,
              swimmerSlotId: slot.id,
            });
          }
        }
        continue;
      }

      for (const r of resolved) {
        const sk = slotKeyFromTime(r.slotTime.split("-")[0]);
        const matchKey = `${iso}_${sk}`;
        const session = sessionsByDateSlot.get(matchKey);
        const absence = absencesByDate.get(iso);
        const title = r.assignment?.title || "Entraînement";

        if (session) {
          result.push({
            type: "logged",
            date,
            iso,
            slotKey: sk,
            slotTime: r.slotTime,
            slotLocation: r.slotLocation,
            title,
            km: session.distance > 0 ? session.distance : null,
            session,
            swimmerSlotId: r.swimmerSlotId,
            assignmentId: r.assignmentId ?? undefined,
            assignmentSource: r.source,
          });
        } else if (absence) {
          result.push({
            type: "absent",
            date,
            iso,
            slotKey: sk,
            slotTime: r.slotTime,
            slotLocation: r.slotLocation,
            title,
            km: null,
            absenceReason: absence.reason,
            swimmerSlotId: r.swimmerSlotId,
            assignmentId: r.assignmentId ?? undefined,
            assignmentSource: r.source,
          });
        } else if (!isFuture(date)) {
          result.push({
            type: "missed",
            date,
            iso,
            slotKey: sk,
            slotTime: r.slotTime,
            slotLocation: r.slotLocation,
            title,
            km: null,
            swimmerSlotId: r.swimmerSlotId,
            assignmentId: r.assignmentId ?? undefined,
            assignmentSource: r.source,
          });
        }
      }
    }

    return result;
  }, [weekDates, weekISOs, assignmentsMap, swimmerSlots, sessionsByDateSlot, absencesByDate]);

  // ── Group cards by day ─────────────────────────────────────

  const cardsByDay = useMemo(() => {
    const grouped = new Map<string, TimelineCard[]>();
    for (const card of cards) {
      const key = card.iso;
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key)!.push(card);
    }
    return grouped;
  }, [cards]);

  // ── Navigate to calendar for feedback ──────────────────────

  const openFeedback = useCallback(
    (iso: string) => {
      // Navigate to the natation calendar, which has FeedbackDrawer
      // The date is encoded in the URL to pre-select it
      navigate(`/natation?date=${iso}`);
    },
    [navigate],
  );

  // ── Wellness banner visibility ─────────────────────────────

  const showWellnessBanner = weekOffset === 0 && !todayWellness && userId;

  // ── Render ─────────────────────────────────────────────────

  return (
    <div className="mx-auto max-w-4xl px-4 pb-28">
      <PageHeader
        title="Ma semaine"
        backHref="/suivi"
        backLabel="Mon suivi"
      />

      {/* Week navigator */}
      <div className="flex items-center justify-between py-3">
        <button
          type="button"
          onClick={() => setWeekOffset((o) => o - 1)}
          className="h-9 w-9 rounded-xl border border-border bg-card flex items-center justify-center hover:bg-muted transition active:scale-95"
          aria-label="Semaine precedente"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <div className="text-center">
          <p className="text-sm font-semibold text-foreground">
            {formatWeekRange(monday)}
          </p>
          {weekOffset === 0 && (
            <p className="text-[10px] text-muted-foreground">Cette semaine</p>
          )}
        </div>
        <button
          type="button"
          onClick={() => setWeekOffset((o) => o + 1)}
          disabled={weekOffset >= 0}
          className="h-9 w-9 rounded-xl border border-border bg-card flex items-center justify-center hover:bg-muted transition active:scale-95 disabled:opacity-30"
          aria-label="Semaine suivante"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      {/* Wellness CTA banner */}
      {showWellnessBanner && (
        <button
          type="button"
          onClick={() => setWellnessOpen(true)}
          className="w-full mb-4 rounded-2xl border border-primary/20 bg-primary/5 p-3 flex items-center gap-3 hover:bg-primary/10 transition active:scale-[0.98]"
        >
          <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
            <Heart className="h-5 w-5 text-primary" />
          </div>
          <div className="text-left min-w-0">
            <p className="text-sm font-semibold text-foreground">Comment te sens-tu ce matin ?</p>
            <p className="text-[11px] text-muted-foreground">Remplis ton check bien-etre du jour</p>
          </div>
          <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
        </button>
      )}

      {/* Timeline */}
      <div className="space-y-1">
        {weekDates.map((date, dayIdx) => {
          const iso = weekISOs[dayIdx];
          const dayCards = cardsByDay.get(iso) ?? [];
          const dayName = DAY_NAMES_FR[dayIdx];
          const today = isToday(date);
          const future = isFuture(date);

          return (
            <div key={iso}>
              {/* Day separator */}
              <div className={cn(
                "flex items-center gap-2 py-2 mt-2",
                today && "text-primary",
                future && "opacity-50",
              )}>
                <span className={cn(
                  "text-xs font-bold uppercase tracking-wide",
                  today ? "text-primary" : "text-muted-foreground",
                )}>
                  {dayName}
                </span>
                <span className={cn(
                  "text-xs",
                  today ? "text-primary font-semibold" : "text-muted-foreground",
                )}>
                  {formatDateShort(date)}
                </span>
                {today && (
                  <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                )}
                <div className="flex-1 border-t border-border" />
              </div>

              {/* Cards or empty state */}
              {dayCards.length === 0 && !future ? (
                <p className="text-[11px] text-muted-foreground py-1 pl-1">
                  Pas de créneau
                </p>
              ) : dayCards.length === 0 && future ? null : (
                <div className="space-y-2">
                  {dayCards.map((card) => {
                    const cardKey = `${card.iso}_${card.slotKey}_${card.swimmerSlotId ?? "x"}`;
                    const isExpanded = expandedKey === cardKey;

                    if (card.type === "logged") {
                      return (
                        <LoggedCard
                          key={cardKey}
                          card={card}
                          expanded={isExpanded}
                          onToggle={() => setExpandedKey(isExpanded ? null : cardKey)}
                        />
                      );
                    }

                    if (card.type === "absent") {
                      return (
                        <AbsentCard
                          key={cardKey}
                          card={card}
                          onUndo={() => removeAbsenceMutation.mutate(card.iso)}
                        />
                      );
                    }

                    // missed
                    return (
                      <MissedCard
                        key={cardKey}
                        card={card}
                        onTap={() => openFeedback(card.iso)}
                        onMarkAbsent={() =>
                          absenceMutation.mutate({ date: card.iso })
                        }
                      />
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Wellness Sheet */}
      <Sheet open={wellnessOpen} onOpenChange={setWellnessOpen}>
        <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto rounded-t-2xl">
          <SheetHeader>
            <SheetTitle>Bien-etre du jour</SheetTitle>
          </SheetHeader>
          <div className="pt-2">
            {userId && (
              <WellnessForm
                userId={userId}
                date={todayISO}
                onSaved={() => {
                  setWellnessOpen(false);
                  queryClient.invalidateQueries({ queryKey: ["wellness", userId, todayISO] });
                }}
              />
            )}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

// ── Sub-components ───────────────────────────────────────────

function LoggedCard({
  card,
  expanded,
  onToggle,
}: {
  card: TimelineCard;
  expanded: boolean;
  onToggle: () => void;
}) {
  const session = card.session!;
  return (
    <button
      type="button"
      onClick={onToggle}
      className="w-full rounded-2xl border bg-card p-3 text-left hover:border-primary/20 transition-all"
    >
      {/* Top row: slot info */}
      <div className="flex items-center gap-2 text-[11px] text-muted-foreground mb-1.5">
        {card.slotTime && (
          <span className="flex items-center gap-0.5">
            <Clock className="h-3 w-3" />
            {card.slotTime}
          </span>
        )}
        {card.slotLocation && (
          <span className="flex items-center gap-0.5">
            <MapPin className="h-3 w-3" />
            {card.slotLocation}
          </span>
        )}
      </div>

      {/* Title + distance + indicators */}
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <span className="text-sm font-semibold text-foreground">{card.title}</span>
          {session.distance > 0 && (
            <span className="text-xs text-muted-foreground ml-1.5">
              {session.distance}m
            </span>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {INDICATORS.map((ind) => {
            const value = session[ind.key] as number | null | undefined;
            return (
              <span
                key={ind.key}
                className={cn(
                  "inline-flex items-center justify-center h-6 w-6 rounded-lg text-[10px] font-bold",
                  indicatorColor(ind.mode, value),
                )}
                title={ind.label}
              >
                {value ?? "\u2014"}
              </span>
            );
          })}
        </div>
      </div>

      {/* Expandable details */}
      {(session.comments || session.coach_notes) && (
        <div className="flex justify-end mt-1">
          <ChevronDown
            className={cn(
              "h-3.5 w-3.5 text-muted-foreground transition-transform",
              expanded && "rotate-180",
            )}
          />
        </div>
      )}

      {expanded && (
        <div className="mt-2 pt-2 border-t border-border space-y-2">
          {session.comments && (
            <p className="text-xs text-foreground whitespace-pre-wrap">{session.comments}</p>
          )}
          {session.coach_notes && (
            <div className="rounded-lg bg-blue-50 dark:bg-blue-950/20 border-l-4 border-blue-400 p-2">
              <p className="text-[10px] font-semibold text-blue-600 dark:text-blue-400">Note du coach</p>
              <p className="text-xs text-blue-800 dark:text-blue-300">{session.coach_notes}</p>
            </div>
          )}
        </div>
      )}
    </button>
  );
}

function MissedCard({
  card,
  onTap,
  onMarkAbsent,
}: {
  card: TimelineCard;
  onTap: () => void;
  onMarkAbsent: () => void;
}) {
  return (
    <div className="rounded-2xl border-2 border-dashed border-border p-3 opacity-70">
      {/* Slot info */}
      <div className="flex items-center gap-2 text-[11px] text-muted-foreground mb-1.5">
        {card.slotTime && (
          <span className="flex items-center gap-0.5">
            <Clock className="h-3 w-3" />
            {card.slotTime}
          </span>
        )}
        {card.slotLocation && (
          <span className="flex items-center gap-0.5">
            <MapPin className="h-3 w-3" />
            {card.slotLocation}
          </span>
        )}
      </div>

      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-foreground">{card.title}</p>
          <p className="text-[11px] text-muted-foreground mt-0.5">Pas de ressenti</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onMarkAbsent();
            }}
            className="flex items-center gap-1 rounded-lg border border-border px-2 py-1 text-[10px] font-medium text-muted-foreground hover:bg-muted transition active:scale-95"
          >
            <XCircle className="h-3 w-3" />
            Absent
          </button>
          <button
            type="button"
            onClick={onTap}
            className="flex items-center gap-1 rounded-lg bg-primary/10 px-2.5 py-1 text-[10px] font-semibold text-primary hover:bg-primary/20 transition active:scale-95"
          >
            <Droplets className="h-3 w-3" />
            Saisir
          </button>
        </div>
      </div>
    </div>
  );
}

function AbsentCard({
  card,
  onUndo,
}: {
  card: TimelineCard;
  onUndo: () => void;
}) {
  return (
    <div className="rounded-2xl border border-border bg-muted/30 p-2.5 flex items-center justify-between gap-2">
      <div className="flex items-center gap-2 min-w-0">
        {card.slotTime && (
          <span className="text-[11px] text-muted-foreground flex items-center gap-0.5">
            <Clock className="h-3 w-3" />
            {card.slotTime}
          </span>
        )}
        <span className="rounded-md bg-red-100 dark:bg-red-900/30 px-1.5 py-0.5 text-[10px] font-semibold text-red-700 dark:text-red-400">
          Absent
        </span>
        {card.absenceReason && (
          <span className="text-[10px] text-muted-foreground truncate">{card.absenceReason}</span>
        )}
      </div>
      <button
        type="button"
        onClick={onUndo}
        className="h-7 w-7 rounded-lg border border-border bg-card flex items-center justify-center hover:bg-muted transition active:scale-95 shrink-0"
        aria-label="Annuler absence"
      >
        <Undo2 className="h-3.5 w-3.5 text-muted-foreground" />
      </button>
    </div>
  );
}
