import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getCompetitionAssignments,
  createCompetition,
  getCompetitions,
} from "@/lib/api";
import type { Competition, CompetitionInput } from "@/lib/api";
import { getAllPendingInterviews } from "@/lib/api/interviews";
import { getTrainingCycles } from "@/lib/api/planning";
import { nextCompetition } from "@/lib/competitions/competitionSelectors";
import { toast } from "sonner";
import CoachSectionHeader from "./CoachSectionHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { CalendarDays, Plus, Trophy, Users, ChevronDown, ChevronRight, MapPin } from "lucide-react";
import { isTimelineEventPast } from "./competitionTimeline";
import CompetitionDetail from "@/components/coach/competition/CompetitionDetail";

// ── Helpers ─────────────────────────────────────────────────────

function formatDateFr(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function daysUntil(dateStr: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(dateStr + "T00:00:00");
  return Math.ceil((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

function toLocalIso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// ── Competition Create Sheet (slim: name + dates + location only) ──
// Editing now lives in CompetitionDetail; athlete assignment in its Nageurs tab.

type CompetitionCreateProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (created: Competition) => void;
};

const CompetitionCreateSheet = ({
  open,
  onOpenChange,
  onCreated,
}: CompetitionCreateProps) => {
  const queryClient = useQueryClient();

  const [name, setName] = useState("");
  const [date, setDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [location, setLocation] = useState("");

  // Reset fields each time the sheet opens
  useEffect(() => {
    if (!open) return;
    setName("");
    setDate("");
    setEndDate("");
    setLocation("");
  }, [open]);

  const createMutation = useMutation({
    mutationFn: (input: CompetitionInput) => createCompetition(input),
    onSuccess: (result) => {
      toast("Compétition créée");
      void queryClient.invalidateQueries({ queryKey: ["competitions"] });
      onOpenChange(false);
      onCreated(result);
    },
    onError: (err: Error) => {
      toast.error("Erreur", { description: err.message });
    },
  });

  const dateRangeInvalid = Boolean(date && endDate && endDate < date);

  const dateCls = "flex h-9 w-full rounded-lg border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";

  const handleStartChange = (v: string) => {
    setDate(v);
    if (!endDate || endDate < v) setEndDate(v);
  };

  const handleSubmit = () => {
    if (!name.trim()) {
      toast.error("Nom requis", { description: "Veuillez saisir un nom pour la compétition." });
      return;
    }
    if (!date) {
      toast.error("Date requise", { description: "Veuillez saisir une date." });
      return;
    }
    createMutation.mutate({
      name: name.trim(),
      date,
      end_date: endDate || date || null,
      location: location.trim() || null,
      description: null,
    });
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Nouvelle compétition</SheetTitle>
        </SheetHeader>

        <div className="mt-5 space-y-5">
          {/* ── Name ── */}
          <div className="space-y-1.5">
            <Label htmlFor="comp-name" className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Nom
            </Label>
            <Input
              id="comp-name"
              placeholder="Ex : Championnats Régionaux"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="text-[15px] font-medium"
              maxLength={200}
            />
          </div>

          {/* ── Dates (side by side) ── */}
          <div className="space-y-1.5">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Dates
            </span>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <label htmlFor="comp-date" className="text-[10px] text-muted-foreground/60 pl-0.5">Début</label>
                <input
                  id="comp-date"
                  type="date"
                  value={date}
                  onChange={(e) => handleStartChange(e.target.value)}
                  className={dateCls}
                />
              </div>
              <div className="space-y-1">
                <label htmlFor="comp-end-date" className="text-[10px] text-muted-foreground/60 pl-0.5">Fin</label>
                <input
                  id="comp-end-date"
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  min={date || undefined}
                  className={dateCls}
                />
              </div>
            </div>
          </div>

          {/* ── Location ── */}
          <div className="space-y-1.5">
            <Label htmlFor="comp-location" className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Lieu
            </Label>
            <Input
              id="comp-location"
              placeholder="Ex : Piscine de Strasbourg"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
            />
          </div>

          <p className="text-[11px] leading-snug text-muted-foreground/70">
            Les nageurs engagés et le lien liveffn se règlent après la création,
            dans la fiche de la compétition.
          </p>

          {/* ── Action ── */}
          <Button
            className="w-full"
            onClick={handleSubmit}
            disabled={createMutation.isPending || !name.trim() || !date || !endDate || dateRangeInvalid}
          >
            {createMutation.isPending ? "Création..." : "Créer la compétition"}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
};

// ── Unified Deadline Events ─────────────────────────────────────

type DeadlineEventType = "competition" | "interview" | "cycle_end";

type DeadlineEvent = {
  id: string;
  type: DeadlineEventType;
  date: string;
  end_date?: string;
  name: string;
  subtitle?: string;
  competition?: Competition;
};

const DOT_ACTIVE: Record<DeadlineEventType, string> = {
  competition: "bg-amber-500 shadow-[0_0_6px_rgba(245,158,11,0.4)]",
  interview: "bg-blue-500 shadow-[0_0_6px_rgba(59,130,246,0.4)]",
  cycle_end: "bg-violet-500 shadow-[0_0_6px_rgba(139,92,246,0.4)]",
};

const BADGE_COLORS: Record<DeadlineEventType, string> = {
  competition: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  interview: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  cycle_end: "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400",
};

const INTERVIEW_STATUS_LABELS: Record<string, string> = {
  draft_athlete: "En attente nageur",
  draft_coach: "En attente coach",
  sent: "Envoyé, à signer",
};

// ── Event date label ────────────────────────────────────────────

function eventDateLabel(ev: DeadlineEvent): string {
  const ds = new Date(ev.date + "T00:00:00");
  if (!ev.end_date || ev.end_date === ev.date) {
    return ds.toLocaleDateString("fr-FR", { day: "numeric", month: "short" }).replace(".", "");
  }
  const de = new Date(ev.end_date + "T00:00:00");
  const endFmt = de.toLocaleDateString("fr-FR", { day: "numeric", month: "short" }).replace(".", "");
  return ds.getMonth() === de.getMonth()
    ? `${ds.getDate()}–${endFmt}`
    : `${ds.toLocaleDateString("fr-FR", { day: "numeric", month: "short" }).replace(".", "")} → ${endFmt}`;
}

// ── Event Card ──────────────────────────────────────────────────

const EventCard = ({
  ev,
  isPast,
  onOpenCompetition,
}: {
  ev: DeadlineEvent;
  isPast: boolean;
  onOpenCompetition: (c: Competition) => void;
}) => {
  const days = daysUntil(ev.date);
  const isCompetition = ev.type === "competition" && ev.competition;
  const dateLabel = eventDateLabel(ev);

  const inner = (
    <>
      {/* Type accent dot */}
      <span
        className={cn(
          "mt-[3px] h-2.5 w-2.5 shrink-0 rounded-full border-2 border-card",
          isPast ? "bg-muted-foreground/30" : DOT_ACTIVE[ev.type],
        )}
        aria-hidden
      />

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 min-w-0">
          <span
            className={cn(
              "text-[14px] font-semibold leading-tight truncate flex-1 min-w-0",
              isPast ? "text-muted-foreground" : "text-foreground",
            )}
          >
            {ev.name}
          </span>
          {!isPast && days >= 0 && (
            <span
              className={cn(
                "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold tabular-nums",
                BADGE_COLORS[ev.type],
              )}
            >
              J-{days}
            </span>
          )}
        </div>
        <p
          className={cn(
            "mt-0.5 truncate text-[12px]",
            isPast ? "text-muted-foreground/60" : "text-muted-foreground",
          )}
        >
          {dateLabel}
          {ev.subtitle && ` · ${ev.subtitle}`}
        </p>
      </div>

      {isCompetition && (
        <ChevronRight
          className={cn(
            "mt-0.5 h-4 w-4 shrink-0",
            isPast ? "text-muted-foreground/30" : "text-muted-foreground/50",
          )}
          aria-hidden
        />
      )}
    </>
  );

  const base =
    "flex w-full items-start gap-3 rounded-xl border px-3.5 py-3 text-left transition-colors";

  if (isCompetition) {
    return (
      <button
        type="button"
        onClick={() => onOpenCompetition(ev.competition!)}
        className={cn(
          base,
          isPast
            ? "border-border/50 bg-card/50 opacity-60 hover:opacity-90"
            : "border-border/60 bg-card hover:bg-muted/40 active:bg-muted/60",
        )}
      >
        {inner}
      </button>
    );
  }

  return (
    <div
      className={cn(
        base,
        isPast ? "border-border/50 bg-card/50 opacity-60" : "border-border/60 bg-card",
      )}
    >
      {inner}
    </div>
  );
};

// ── Events List (scannable cards: competitions + interviews + cycles) ──

const EventsList = ({
  events,
  onOpenCompetition,
}: {
  events: DeadlineEvent[];
  onOpenCompetition: (c: Competition) => void;
}) => {
  const [pastOpen, setPastOpen] = useState(false);

  const { past, upcoming } = useMemo(() => {
    const sorted = [...events].sort((a, b) => a.date.localeCompare(b.date));
    const todayStr = toLocalIso(new Date());
    const pastList: DeadlineEvent[] = [];
    const upcomingList: DeadlineEvent[] = [];
    for (const ev of sorted) {
      if (isTimelineEventPast(ev, todayStr)) pastList.push(ev);
      else upcomingList.push(ev);
    }
    return { past: pastList, upcoming: upcomingList };
  }, [events]);

  if (events.length === 0) return null;

  return (
    <div className="space-y-2.5">
      {/* Past (collapsible) */}
      {past.length > 0 && (
        <>
          <button
            type="button"
            className="flex items-center gap-1.5 py-1 text-[11px] font-medium text-muted-foreground/60 transition-colors hover:text-muted-foreground select-none"
            onClick={() => setPastOpen((o) => !o)}
          >
            <ChevronDown
              className={cn("h-3.5 w-3.5 shrink-0 transition-transform", pastOpen && "rotate-180")}
            />
            <span>Passées ({past.length})</span>
          </button>
          {pastOpen &&
            past.map((ev) => (
              <EventCard key={ev.id} ev={ev} isPast onOpenCompetition={onOpenCompetition} />
            ))}
        </>
      )}

      {/* Upcoming */}
      {upcoming.map((ev) => (
        <EventCard key={ev.id} ev={ev} isPast={false} onOpenCompetition={onOpenCompetition} />
      ))}
    </div>
  );
};

// ── Hero "prochaine compétition" card ───────────────────────────

const HeroNextCompetition = ({
  competition,
  onOpenDetail,
  onOpenJourJ,
}: {
  competition: Competition;
  onOpenDetail: () => void;
  onOpenJourJ: () => void;
}) => {
  const days = daysUntil(competition.date);
  const { data: assignments } = useQuery({
    queryKey: ["competition-assignments", competition.id],
    queryFn: () => getCompetitionAssignments(competition.id),
  });
  const count = assignments?.length ?? 0;

  const dateLabel = (() => {
    const sameDay = !competition.end_date || competition.end_date === competition.date;
    return sameDay
      ? formatDateFr(competition.date)
      : `${formatDateFr(competition.date)} → ${formatDateFr(competition.end_date!)}`;
  })();

  const location = competition.location && competition.location !== "??" ? competition.location : null;

  return (
    <div className="overflow-hidden rounded-2xl border border-amber-500/30 bg-gradient-to-br from-amber-500/10 via-card to-card shadow-sm">
      {/* Tappable body → Nageurs */}
      <button
        type="button"
        onClick={onOpenDetail}
        className="block w-full px-4 pt-4 pb-3 text-left transition-colors hover:bg-amber-500/5 active:bg-amber-500/10"
      >
        <div className="flex items-center gap-1.5">
          <Trophy className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" aria-hidden />
          <span className="text-[10px] font-bold uppercase tracking-widest text-amber-700 dark:text-amber-400">
            Prochaine compétition
          </span>
        </div>

        <div className="mt-2.5 flex items-end gap-3">
          {days >= 0 && (
            <span className="text-[34px] font-extrabold leading-none tabular-nums text-amber-600 dark:text-amber-400">
              J-{days}
            </span>
          )}
          <div className="min-w-0 flex-1 pb-0.5">
            <h2 className="truncate text-[17px] font-semibold leading-tight text-foreground">
              {competition.name}
            </h2>
            <p className="mt-0.5 flex items-center gap-2 truncate text-[12px] text-muted-foreground">
              <span className="inline-flex items-center gap-1">
                <CalendarDays className="h-3 w-3 shrink-0" aria-hidden />
                {dateLabel}
              </span>
              {location && (
                <span className="inline-flex min-w-0 items-center gap-1">
                  <MapPin className="h-3 w-3 shrink-0" aria-hidden />
                  <span className="truncate">{location}</span>
                </span>
              )}
            </p>
          </div>
        </div>

        <div className="mt-3 flex items-center gap-1.5 text-[12px] text-muted-foreground">
          <Users className="h-3.5 w-3.5 shrink-0" aria-hidden />
          <span className="tabular-nums">
            {count} nageur{count > 1 ? "s" : ""} engagé{count > 1 ? "s" : ""}
          </span>
        </div>
      </button>

      {/* Primary CTA → Jour J */}
      <div className="px-4 pb-4">
        <Button
          className="w-full bg-amber-600 text-white hover:bg-amber-600/90 dark:bg-amber-500 dark:text-amber-950 dark:hover:bg-amber-500/90"
          onClick={onOpenJourJ}
        >
          Jour J
        </Button>
      </div>
    </div>
  );
};

// ── Main Component ──────────────────────────────────────────────

type CoachCompetitionsScreenProps = {
  onBack?: () => void;
  initialCompetitionId?: string | null;
  onOpenCompetition?: (id: string | null) => void;
};

type DetailTab = "nageurs" | "parametres" | "jourj";

const CoachCompetitionsScreen = ({
  onBack,
  initialCompetitionId,
  onOpenCompetition,
}: CoachCompetitionsScreenProps) => {
  const queryClient = useQueryClient();

  const [showCreate, setShowCreate] = useState(false);
  const [detailComp, setDetailComp] = useState<Competition | null>(null);
  const [detailTab, setDetailTab] = useState<DetailTab>("nageurs");
  // Tracks the last initialCompetitionId we acted on, so closing the detail
  // doesn't re-trigger the deep-link effect (guards against re-open).
  const [appliedInitialId, setAppliedInitialId] = useState<string | null>(null);

  const { data: competitions = [], isLoading: compLoading } = useQuery({
    queryKey: ["competitions"],
    queryFn: () => getCompetitions(),
  });

  const { data: interviews = [], isLoading: intvLoading } = useQuery({
    queryKey: ["coach-events-interviews"],
    queryFn: getAllPendingInterviews,
  });

  const { data: cycles = [], isLoading: cyclesLoading } = useQuery({
    queryKey: ["coach-events-cycles"],
    queryFn: () => getTrainingCycles(),
  });

  const isLoading = compLoading || intvLoading || cyclesLoading;

  const next = useMemo(
    () => nextCompetition(competitions, toLocalIso(new Date())),
    [competitions],
  );

  const allEvents = useMemo<DeadlineEvent[]>(() => {
    // Exclude the hero "next" competition from the list to avoid duplication.
    const comps: DeadlineEvent[] = competitions
      .filter((c) => c.id !== next?.id)
      .map((c) => ({
        id: `comp-${c.id}`,
        type: "competition" as const,
        date: c.date,
        end_date: c.end_date ?? undefined,
        name: c.name,
        subtitle: c.location && c.location !== "??" ? c.location : undefined,
        competition: c,
      }));

    const intvs: DeadlineEvent[] = interviews.map((i) => ({
      id: `intv-${i.id}`,
      type: "interview" as const,
      date: i.date,
      name: `Entretien : ${i.athlete_name}`,
      subtitle: INTERVIEW_STATUS_LABELS[i.status] ?? i.status,
    }));

    const cycleEnds: DeadlineEvent[] = cycles
      .filter((c) => c.end_competition_date != null)
      .map((c) => ({
        id: `cycle-${c.id}`,
        type: "cycle_end" as const,
        date: c.end_competition_date!,
        name: `Fin cycle : ${c.name}`,
        subtitle: c.end_competition_name ?? undefined,
      }));

    return [...comps, ...intvs, ...cycleEnds];
  }, [competitions, interviews, cycles, next]);

  // ── Open / close detail helpers ──
  const openDetail = (c: Competition, tab: DetailTab = "nageurs") => {
    setDetailTab(tab);
    setDetailComp(c);
    onOpenCompetition?.(c.id);
  };

  const closeDetail = () => {
    setDetailComp(null);
    onOpenCompetition?.(null);
  };

  // ── Deep-link: open the competition matching initialCompetitionId, once. ──
  useEffect(() => {
    if (!initialCompetitionId) return;
    if (initialCompetitionId === appliedInitialId) return;
    if (competitions.length === 0) return;
    const found = competitions.find((c) => c.id === initialCompetitionId);
    if (found) {
      setAppliedInitialId(initialCompetitionId);
      setDetailTab("nageurs");
      setDetailComp(found);
      onOpenCompetition?.(found.id);
    }
  }, [initialCompetitionId, appliedInitialId, competitions, onOpenCompetition]);

  // ── Full-screen takeover (AFTER all hooks above) ──
  // `detailComp` is only the competition captured when the detail view opened.
  // Re-derive the live record from the query so edits/imports made inside the
  // detail (Paramètres URL, Résultats import — both invalidate ["competitions"])
  // reflect WITHOUT closing and reopening. Falls back to the captured object
  // until the refetch lands.
  const liveDetailComp = detailComp
    ? competitions.find((c) => c.id === detailComp.id) ?? detailComp
    : null;

  if (liveDetailComp) {
    return (
      <CompetitionDetail
        key={liveDetailComp.id}
        competition={liveDetailComp}
        initialTab={detailTab}
        onBack={closeDetail}
        onDeleted={() => {
          closeDetail();
          void queryClient.invalidateQueries({ queryKey: ["competitions"] });
        }}
      />
    );
  }

  const hasContent = !!next || allEvents.length > 0;

  return (
    <div className="space-y-6 pb-24">
      <CoachSectionHeader
        title="Échéances"
        description="Compétitions, entretiens et fins de cycles"
        onBack={onBack}
        actions={
          <Button variant="outline" size="sm" onClick={() => setShowCreate(true)}>
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            Compétition
          </Button>
        }
      />

      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="rounded-xl border p-3 animate-pulse motion-reduce:animate-none"
            >
              <div className="flex items-center gap-3">
                <div className="h-4 w-40 rounded bg-muted" />
                <div className="ml-auto h-5 w-12 rounded bg-muted" />
              </div>
            </div>
          ))}
        </div>
      ) : !hasContent ? (
        <div className="text-center py-12 space-y-3">
          <CalendarDays className="h-10 w-10 text-muted-foreground mx-auto" />
          <p className="text-sm text-muted-foreground">
            Aucune échéance à venir
          </p>
          <Button variant="outline" size="sm" onClick={() => setShowCreate(true)}>
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            Créer une compétition
          </Button>
        </div>
      ) : (
        <div className="space-y-6">
          {next && (
            <HeroNextCompetition
              competition={next}
              onOpenDetail={() => openDetail(next, "nageurs")}
              onOpenJourJ={() => openDetail(next, "jourj")}
            />
          )}

          {allEvents.length > 0 && (
            <EventsList
              events={allEvents}
              onOpenCompetition={(c) => openDetail(c)}
            />
          )}
        </div>
      )}

      <CompetitionCreateSheet
        open={showCreate}
        onOpenChange={setShowCreate}
        onCreated={(created) => openDetail(created, "parametres")}
      />
    </div>
  );
};

export default CoachCompetitionsScreen;
