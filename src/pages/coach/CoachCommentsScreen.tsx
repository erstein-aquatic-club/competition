import { useEffect, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getSwimmerComments, markCommentsRead } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { ArrowLeft, MessageSquareText } from "lucide-react";
import type { SwimmerComment } from "@/lib/api/coach-comments";
import { formatRelativeDate } from "@/lib/date";

function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

const INDICATORS = [
  { key: "rpe" as const, label: "Diff.", mode: "hard" as const },
  { key: "fatigue" as const, label: "Fat.", mode: "hard" as const },
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

function isAlertComment(c: SwimmerComment): boolean {
  const rpe = Number(c.rpe);
  const fatigue = Number(c.fatigue);
  return (Number.isFinite(rpe) && rpe >= 4) || (Number.isFinite(fatigue) && fatigue >= 4);
}

function getInitials(name: string): string {
  return name
    .split(/\s+/)
    .map((w) => w[0] ?? "")
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

interface Props {
  onBack: () => void;
  onOpenAthlete: (athlete: { id: number | null; display_name: string }) => void;
}

const PAGE_SIZE = 20;

export default function CoachCommentsScreen({ onBack, onOpenAthlete }: Props) {
  const { userId: coachUserId } = useAuth();
  const queryClient = useQueryClient();
  const [pageCount, setPageCount] = useState(1);

  // Fetch comments with pagination
  const { data: comments = [], isLoading } = useQuery({
    queryKey: ["coach-comments", coachUserId, pageCount],
    queryFn: () =>
      getSwimmerComments(coachUserId!, { limit: pageCount * PAGE_SIZE }),
    enabled: !!coachUserId,
  });

  // Auto-mark unread as read — optimistic update pour faire disparaître le badge
  // immédiatement plutôt qu'attendre l'invalidate (lag 1-2s post-mutation).
  const markReadMutation = useMutation({
    mutationFn: (ids: number[]) => markCommentsRead(coachUserId!, ids),
    onMutate: async (ids: number[]) => {
      const queryKey = ["coach-comments-recent-48h", coachUserId];
      await queryClient.cancelQueries({ queryKey });
      const prev = queryClient.getQueryData<{ comments: any[]; unreadCount: number } | undefined>(queryKey);
      queryClient.setQueryData(queryKey, (old: any) => {
        if (!old) return old;
        const idSet = new Set(ids);
        return {
          ...old,
          unreadCount: 0,
          comments: old.comments.map((c: any) =>
            idSet.has(c.session_id) ? { ...c, is_read: true } : c,
          ),
        };
      });
      return { prev };
    },
    onError: (_err, _ids, ctx) => {
      if (ctx?.prev) {
        queryClient.setQueryData(["coach-comments-recent-48h", coachUserId], ctx.prev);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["coach-comments-recent-48h"] });
    },
  });

  const markedIdsRef = useRef<Set<number>>(new Set());

  useEffect(() => {
    if (!coachUserId || comments.length === 0) return;
    const newUnreadIds = comments
      .filter((c) => !c.is_read && !markedIdsRef.current.has(c.session_id))
      .map((c) => c.session_id);
    if (newUnreadIds.length === 0) return;
    newUnreadIds.forEach((id) => markedIdsRef.current.add(id));
    markReadMutation.mutate(newUnreadIds);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [coachUserId, comments]);

  const unreadCount = comments.filter((c) => !c.is_read).length;
  const hasMore = comments.length === pageCount * PAGE_SIZE;

  // Loading skeleton
  if (isLoading || !coachUserId) {
    return (
      <div className="space-y-4">
        {/* Header skeleton */}
        <div className="flex items-center gap-3 mb-2">
          <div className="h-8 w-8 rounded-lg bg-muted animate-pulse motion-reduce:animate-none" />
          <div className="h-5 w-40 rounded bg-muted animate-pulse motion-reduce:animate-none" />
        </div>
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="rounded-2xl border bg-card p-3 animate-pulse motion-reduce:animate-none">
            <div className="flex items-center gap-3 mb-2">
              <div className="h-8 w-8 rounded-full bg-muted" />
              <div className="h-4 w-28 rounded bg-muted" />
              <div className="ml-auto h-3 w-16 rounded bg-muted" />
            </div>
            <div className="h-3 w-48 rounded bg-muted mb-2" />
            <div className="h-3 w-full rounded bg-muted" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={onBack} aria-label="Retour">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
          <MessageSquareText className="h-5 w-5 text-primary" />
          Commentaires
          {unreadCount > 0 && (
            <span className="inline-flex items-center justify-center h-5 min-w-5 px-1.5 rounded-full bg-violet-500 text-white text-[10px] font-bold">
              {unreadCount}
            </span>
          )}
        </h2>
      </div>

      {/* Empty state */}
      {comments.length === 0 && (
        <p className="text-sm text-muted-foreground text-center py-12">
          Aucun commentaire de nageur
        </p>
      )}

      {/* Comments list */}
      {comments.map((c) => (
        <button
          key={c.session_id}
          type="button"
          onClick={() =>
            onOpenAthlete({ id: c.athlete_id, display_name: c.athlete_name })
          }
          className={cn(
            "w-full rounded-2xl border bg-card p-3 text-left hover:border-primary/20 transition-all border-l-4",
            isAlertComment(c) ? "border-l-red-400" : "border-l-emerald-400",
          )}
        >
          {/* Line 1: Avatar + Name + Relative time */}
          <div className="flex items-center gap-2.5">
            {/* Unread dot */}
            {!c.is_read && (
              <span className="h-2 w-2 rounded-full bg-violet-500 shrink-0" />
            )}
            {/* Avatar */}
            {c.avatar_url ? (
              <img
                src={c.avatar_url}
                alt=""
                className="h-8 w-8 rounded-full object-cover shrink-0"
              />
            ) : (
              <span className="h-8 w-8 rounded-full bg-muted flex items-center justify-center text-[10px] font-bold text-muted-foreground shrink-0">
                {getInitials(c.athlete_name)}
              </span>
            )}
            <span className="text-sm font-semibold text-foreground truncate min-w-0">
              {c.athlete_name}
            </span>
            <span className="ml-auto text-[11px] text-muted-foreground whitespace-nowrap shrink-0">
              {formatRelativeDate(c.created_at)}
            </span>
          </div>

          {/* Line 2: Session date + slot + indicators */}
          <div className="flex items-center justify-between gap-2 mt-1.5">
            <div className="text-xs text-muted-foreground min-w-0">
              <span>
                {new Date(c.session_date).toLocaleDateString("fr-FR", {
                  weekday: "short",
                  day: "numeric",
                  month: "short",
                })}
              </span>
              {c.time_slot && (
                <span className="ml-1.5">{c.time_slot}</span>
              )}
            </div>
            <div className="flex items-center gap-1 shrink-0">
              {INDICATORS.map((ind) => {
                const value = c[ind.key] as number | null;
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

          {/* Line 3: Comment text */}
          <p className="text-xs text-foreground whitespace-pre-wrap mt-1.5">
            {c.comments}
          </p>
        </button>
      ))}

      {/* Load more */}
      {hasMore && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setPageCount((p) => p + 1);
          }}
          className="w-full rounded-2xl border border-dashed border-border py-2 text-xs font-medium text-muted-foreground hover:bg-muted transition"
        >
          Charger plus
        </button>
      )}
    </div>
  );
}
