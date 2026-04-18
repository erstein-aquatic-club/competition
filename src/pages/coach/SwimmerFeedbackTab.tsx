import { useState } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { BarChart3, ChevronDown, StickyNote, X } from "lucide-react";

function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

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

interface Props {
  athleteId: number;
  athleteName: string;
  onOpenProgression?: () => void;
  showProgressAction?: boolean;
}

function CoachNotePopover({
  sessionId,
  athleteId,
  athleteName,
  existingNotes,
}: {
  sessionId: number;
  athleteId: number;
  athleteName: string;
  existingNotes: string | null | undefined;
}) {
  const [open, setOpen] = useState(false);
  const [notes, setNotes] = useState(existingNotes ?? "");
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const mutation = useMutation({
    mutationFn: (newNotes: string | null) =>
      api.updateSessionCoachNotes(sessionId, newNotes),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sessions", athleteId] });
      setOpen(false);
      toast({ title: "Note sauvegardée" });
    },
    onError: () => {
      toast({ title: "Erreur", description: "Impossible de sauvegarder la note.", variant: "destructive" });
    },
  });

  return (
    <Popover open={open} onOpenChange={(v) => { setOpen(v); if (v) setNotes(existingNotes ?? ""); }}>
      <PopoverTrigger asChild>
        <button
          type="button"
          onClick={(e) => e.stopPropagation()}
          className={cn(
            "h-6 w-6 rounded-lg flex items-center justify-center transition-colors",
            existingNotes
              ? "bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400"
              : "bg-muted text-muted-foreground hover:bg-muted/80",
          )}
          title="Note du coach"
        >
          <StickyNote className="h-3.5 w-3.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="w-64 p-3 space-y-2"
        onClick={(e) => e.stopPropagation()}
        align="end"
      >
        <p className="text-xs font-semibold">Note du coach</p>
        <Textarea
          className="text-xs min-h-[60px]"
          placeholder="Ajouter une note..."
          rows={3}
          maxLength={2000}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
        <div className="flex gap-2">
          <Button
            size="sm"
            className="flex-1 text-xs h-7"
            onClick={() => mutation.mutate(notes.trim() || null)}
            disabled={mutation.isPending}
          >
            {mutation.isPending ? "..." : "Enregistrer"}
          </Button>
          {existingNotes && (
            <Button
              size="sm"
              variant="ghost"
              className="text-xs h-7 text-destructive"
              onClick={() => mutation.mutate(null)}
              disabled={mutation.isPending}
            >
              <X className="h-3 w-3" />
            </Button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

export default function SwimmerFeedbackTab({
  athleteId,
  athleteName,
  onOpenProgression,
  showProgressAction = true,
}: Props) {
  const [, navigate] = useLocation();
  const { setSelectedAthlete } = useAuth();
  const [limit, setLimit] = useState(20);
  const [collapsedIds, setCollapsedIds] = useState<Set<number>>(new Set());
  const [activeTooltip, setActiveTooltip] = useState<string | null>(null);

  const { data: sessions = [], isLoading } = useQuery({
    queryKey: ["sessions", athleteId],
    queryFn: () => api.getSessions(athleteName, athleteId),
  });

  const displayed = sessions.slice(0, limit);
  const hasMore = sessions.length > limit;

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="rounded-2xl border bg-card p-3 animate-pulse motion-reduce:animate-none">
            <div className="h-4 w-32 rounded bg-muted mb-2" />
            <div className="h-3 w-full rounded bg-muted" />
          </div>
        ))}
      </div>
    );
  }

  if (sessions.length === 0) {
    return (
      <p className="text-sm text-muted-foreground text-center py-8">
        Aucun ressenti enregistre.
      </p>
    );
  }

  const handleOpenProgression = () => {
    if (onOpenProgression) {
      onOpenProgression();
      return;
    }
    setSelectedAthlete({ id: athleteId, name: athleteName });
    navigate("/progress");
  };

  return (
    <div className="space-y-2">
      {showProgressAction ? (
        <Button
          variant="outline"
          size="sm"
          className="w-full text-xs gap-1.5"
          onClick={handleOpenProgression}
        >
          <BarChart3 className="h-3.5 w-3.5" />
          Voir l&apos;analyse
        </Button>
      ) : null}

      {displayed.map((session) => {
        const hasText = !!(session.comments || session.coach_notes);
        const isExpanded = hasText && !collapsedIds.has(session.id);
        return (
          <button
            key={session.id}
            type="button"
            onClick={() => {
              setActiveTooltip(null);
              if (!hasText) return;
              setCollapsedIds((prev) => {
                const next = new Set(prev);
                if (next.has(session.id)) next.delete(session.id);
                else next.add(session.id);
                return next;
              });
            }}
            className="w-full rounded-2xl border bg-card p-3 text-left hover:border-primary/20 transition-all"
          >
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <span className="text-sm font-semibold text-foreground">
                  {new Date(session.date).toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" })}
                </span>
                <span className="text-xs text-muted-foreground ml-1.5">{session.slot}</span>
              </div>
              <div className="flex items-center gap-1">
                <CoachNotePopover
                  sessionId={session.id}
                  athleteId={athleteId}
                  athleteName={athleteName}
                  existingNotes={session.coach_notes}
                />
                {INDICATORS.map((ind) => {
                  const value = session[ind.key] as number | null | undefined;
                  const tooltipId = `${session.id}-${ind.key}`;
                  const isTooltipActive = activeTooltip === tooltipId;
                  return (
                    <span
                      key={ind.key}
                      className="relative group"
                      onClick={(e) => {
                        e.stopPropagation();
                        setActiveTooltip(isTooltipActive ? null : tooltipId);
                      }}
                    >
                      <span
                        className={cn(
                          "inline-flex items-center justify-center h-6 w-6 rounded-lg text-[10px] font-bold cursor-pointer",
                          indicatorColor(ind.mode, value)
                        )}
                      >
                        {value ?? "—"}
                      </span>
                      {/* Tooltip: hover on desktop, tap on mobile */}
                      <span
                        className={cn(
                          "absolute -top-7 left-1/2 -translate-x-1/2 rounded-md bg-foreground text-background px-1.5 py-0.5 text-[9px] font-semibold whitespace-nowrap pointer-events-none transition-opacity",
                          "opacity-0 group-hover:opacity-100",
                          isTooltipActive && "opacity-100"
                        )}
                      >
                        {ind.label}
                      </span>
                    </span>
                  );
                })}
              </div>
            </div>

            <div className="flex items-center justify-between mt-1.5">
              <span className="text-xs text-muted-foreground">
                {session.distance > 0 ? `${session.distance}m` : "—"}
              </span>
              {(session.comments || session.coach_notes) && (
                <ChevronDown className={cn("h-3.5 w-3.5 text-muted-foreground transition-transform", isExpanded && "rotate-180")} />
              )}
            </div>

            {isExpanded && (
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
      })}

      {hasMore && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); setLimit((l) => l + 20); }}
          className="w-full rounded-2xl border border-dashed border-border py-2 text-xs font-medium text-muted-foreground hover:bg-muted transition"
        >
          Charger plus ({sessions.length - limit} restants)
        </button>
      )}
    </div>
  );
}
