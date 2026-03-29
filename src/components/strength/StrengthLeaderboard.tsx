import { useState, useMemo } from "react";
import { Crown, Medal, Trophy } from "lucide-react";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { useStrengthLeaderboard, type LeaderboardEntry } from "@/hooks/useStrengthLeaderboard";

interface StrengthLeaderboardProps {
  userId: number;
}

// ── Podium (top 3) ─────────────────────────────────────────

const RANK_STYLES = {
  1: {
    color: "text-rank-gold",
    bg: "bg-rank-gold/10",
    border: "border-rank-gold",
    pedestal: "from-rank-gold/30",
    fill: "fill-rank-gold",
  },
  2: {
    color: "text-rank-silver",
    bg: "bg-rank-silver/10",
    border: "border-rank-silver",
    pedestal: "from-rank-silver/30",
    fill: "fill-rank-silver",
  },
  3: {
    color: "text-rank-bronze",
    bg: "bg-rank-bronze/10",
    border: "border-rank-bronze",
    pedestal: "from-rank-bronze/30",
    fill: "fill-rank-bronze",
  },
} as const;

const PODIUM_CONFIG = [
  { rank: 1, height: "h-24", avatarSize: "h-12 w-12 text-lg", colOrder: "order-2" },
  { rank: 2, height: "h-16", avatarSize: "h-10 w-10 text-base", colOrder: "order-1" },
  { rank: 3, height: "h-10", avatarSize: "h-10 w-10 text-base", colOrder: "order-3" },
] as const;

function getAvatarSrc(entry: LeaderboardEntry): string {
  if (entry.avatarUrl) return entry.avatarUrl;
  return `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(entry.name)}`;
}

function formatScore(score: number): string {
  return score % 1 === 0 ? String(score) : score.toFixed(1);
}

function PodiumColumn({
  entry,
  config,
  isCurrentUser,
}: {
  entry: LeaderboardEntry;
  config: (typeof PODIUM_CONFIG)[number];
  isCurrentUser: boolean;
}) {
  const style = RANK_STYLES[config.rank as 1 | 2 | 3];
  const Icon = config.rank === 1 ? Crown : Medal;
  const initials = entry.name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className={`flex flex-col items-center gap-1 ${config.colOrder} flex-1`}>
      <Icon
        className={cn("h-5 w-5", style.color, style.fill)}
      />
      <Avatar className={cn(config.avatarSize, "border-2", style.border, isCurrentUser && "ring-2 ring-primary ring-offset-2")}>
        <AvatarImage src={getAvatarSrc(entry)} alt={entry.name} />
        <AvatarFallback className={cn(style.bg, "font-bold font-display")}>{initials}</AvatarFallback>
      </Avatar>
      <div className="font-bold uppercase tracking-tight text-xs text-center truncate max-w-full px-1">
        {entry.name}
      </div>
      <div className="text-sm font-semibold tabular-nums">
        {formatScore(entry.score)} kg
      </div>
      <div
        className={cn(
          config.height,
          "w-full rounded-t-xl bg-gradient-to-b to-muted/50 border-t-2",
          style.pedestal,
          style.border,
        )}
      />
    </div>
  );
}

function Podium({ entries, userId }: { entries: LeaderboardEntry[]; userId: number }) {
  const top3 = entries.slice(0, 3);
  if (top3.length === 0) return null;

  if (top3.length === 1) {
    return (
      <div className="flex justify-center py-2">
        <div className="w-1/3">
          <PodiumColumn entry={top3[0]} config={PODIUM_CONFIG[0]} isCurrentUser={top3[0].userId === userId} />
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-end justify-center gap-2 py-2">
      <PodiumColumn entry={top3[1]} config={PODIUM_CONFIG[1]} isCurrentUser={top3[1].userId === userId} />
      <PodiumColumn entry={top3[0]} config={PODIUM_CONFIG[0]} isCurrentUser={top3[0].userId === userId} />
      {top3[2] && (
        <PodiumColumn entry={top3[2]} config={PODIUM_CONFIG[2]} isCurrentUser={top3[2].userId === userId} />
      )}
    </div>
  );
}

// ── Row (rank 4+) ──────────────────────────────────────────

function LeaderboardRow({ entry, isCurrentUser }: { entry: LeaderboardEntry; isCurrentUser: boolean }) {
  const initials = entry.name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-xl px-3 py-2.5 transition-colors",
        isCurrentUser ? "bg-primary/10 ring-1 ring-primary/20" : "bg-card",
      )}
    >
      <span className="w-7 text-center text-sm font-semibold text-muted-foreground tabular-nums">
        {entry.rank}
      </span>
      <Avatar className="h-8 w-8">
        <AvatarImage src={getAvatarSrc(entry)} alt={entry.name} />
        <AvatarFallback className="text-xs font-bold">{initials}</AvatarFallback>
      </Avatar>
      <span className={cn("flex-1 text-sm font-medium truncate", isCurrentUser && "font-bold")}>
        {entry.name}
      </span>
      <span className="text-sm font-semibold tabular-nums">
        {formatScore(entry.score)} kg
      </span>
    </div>
  );
}

// ── Exercise Pills ─────────────────────────────────────────

function ExercisePills({
  exercises,
  selected,
  onSelect,
}: {
  exercises: Array<{ id: number; name: string; athleteCount: number }>;
  selected: number | null;
  onSelect: (id: number | null) => void;
}) {
  return (
    <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-hide">
      <button
        type="button"
        onClick={() => onSelect(null)}
        className={cn(
          "shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap",
          selected === null
            ? "bg-primary text-primary-foreground"
            : "bg-muted text-muted-foreground hover:bg-muted/80",
        )}
      >
        Tous
      </button>
      {exercises.map((ex) => (
        <button
          key={ex.id}
          type="button"
          onClick={() => onSelect(ex.id)}
          className={cn(
            "shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap",
            selected === ex.id
              ? "bg-primary text-primary-foreground"
              : "bg-muted text-muted-foreground hover:bg-muted/80",
          )}
        >
          {ex.name}
        </button>
      ))}
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────

export function StrengthLeaderboard({ userId }: StrengthLeaderboardProps) {
  const [selectedExercise, setSelectedExercise] = useState<number | null>(null);

  const { entries, userRank, isLoading, popularExercises } = useStrengthLeaderboard({
    exerciseId: selectedExercise,
    userId,
  });

  // Score label
  const scoreLabel = useMemo(() => {
    return selectedExercise ? "1RM (kg)" : "Total 1RM (kg)";
  }, [selectedExercise]);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-full rounded-full" />
        <div className="flex items-end justify-center gap-2 py-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex flex-col items-center gap-2 flex-1">
              <Skeleton className="h-10 w-10 rounded-full" />
              <Skeleton className="h-3 w-16" />
              <Skeleton className={cn("w-full rounded-t-xl", i === 1 ? "h-24" : i === 2 ? "h-16" : "h-10")} />
            </div>
          ))}
        </div>
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-12 rounded-xl" />
        ))}
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <Trophy className="h-10 w-10 text-muted-foreground/40 mb-3" />
        <p className="text-sm text-muted-foreground">
          Aucun classement disponible.
        </p>
        <p className="text-xs text-muted-foreground/70 mt-1">
          Enregistre des 1RM pour apparaitre ici.
        </p>
      </div>
    );
  }

  const remaining = entries.slice(3);

  return (
    <div className="space-y-4">
      {/* Exercise filter pills */}
      {popularExercises.length > 0 && (
        <ExercisePills
          exercises={popularExercises}
          selected={selectedExercise}
          onSelect={setSelectedExercise}
        />
      )}

      {/* Score type label */}
      <div className="text-center">
        <span className="text-xs text-muted-foreground uppercase tracking-wider font-medium">
          {scoreLabel}
        </span>
      </div>

      {/* Podium */}
      <Podium entries={entries} userId={userId} />

      {/* Current user rank callout */}
      {userRank && userRank > 3 && (
        <div className="text-center text-xs text-muted-foreground">
          Tu es class&eacute; <span className="font-bold text-foreground">{userRank}e</span> sur {entries.length}
        </div>
      )}

      {/* Remaining entries */}
      {remaining.length > 0 && (
        <div className="space-y-1.5">
          {remaining.map((entry) => (
            <LeaderboardRow
              key={entry.userId}
              entry={entry}
              isCurrentUser={entry.userId === userId}
            />
          ))}
        </div>
      )}
    </div>
  );
}
