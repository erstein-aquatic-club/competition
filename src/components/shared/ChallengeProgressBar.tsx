import type { Challenge } from "@/lib/api/types";
import { Badge } from "@/components/ui/badge";

interface ChallengeProgressBarProps {
  challenge: Challenge;
}

const TYPE_LABELS: Record<Challenge["type"], string> = {
  attendance: "Assiduité",
  wellness: "Bien-être",
  custom: "Défi",
};

const TYPE_COLORS: Record<Challenge["type"], string> = {
  attendance: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  wellness: "bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300",
  custom: "bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300",
};

function formatDateShort(iso: string): string {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
}

export function ChallengeProgressBar({ challenge }: ChallengeProgressBarProps) {
  const pct = challenge.target > 0 ? Math.min((Number(challenge.current_value) / Number(challenge.target)) * 100, 100) : 0;
  const remaining = Math.max(0, Number(challenge.target) - Number(challenge.current_value));

  // Color based on progress
  let barColor = "bg-red-500";
  if (pct >= 66) barColor = "bg-emerald-500";
  else if (pct >= 33) barColor = "bg-amber-500";

  return (
    <div className="rounded-xl border bg-card p-3 space-y-2">
      <div className="flex items-center gap-2">
        <span className="text-sm font-semibold flex-1 truncate">{challenge.title}</span>
        <Badge variant="secondary" className={`text-[10px] px-1.5 py-0 ${TYPE_COLORS[challenge.type]}`}>
          {TYPE_LABELS[challenge.type]}
        </Badge>
      </div>

      {/* Progress bar */}
      <div className="h-2 rounded-full bg-muted overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${barColor}`}
          style={{ width: `${pct}%` }}
        />
      </div>

      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span className="tabular-nums">
          {Number(challenge.current_value)} / {Number(challenge.target)}
          {remaining > 0 ? ` — encore ${remaining} pour l'objectif` : " — objectif atteint !"}
        </span>
      </div>

      <p className="text-[10px] text-muted-foreground">
        Du {formatDateShort(challenge.start_date)} au {formatDateShort(challenge.end_date)}
      </p>
    </div>
  );
}
