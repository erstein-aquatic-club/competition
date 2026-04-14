import { Trophy, MapPin, ChevronRight } from "lucide-react";
import type { Competition } from "@/lib/api/types";

interface CompetitionDayBannerProps {
  competition: Competition;
  dayIndex: number;
  totalDays: number;
  onTap: () => void;
}

export function CompetitionDayBanner({
  competition,
  dayIndex,
  totalDays,
  onTap,
}: CompetitionDayBannerProps) {
  return (
    <button
      type="button"
      onClick={onTap}
      className="w-full rounded-2xl border border-rose-500/25 bg-gradient-to-br from-rose-500/10 via-rose-500/5 to-orange-500/10 p-3 text-left shadow-sm transition-all duration-150 hover:shadow-md active:scale-[0.98]"
    >
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-rose-500/15">
          <Trophy className="h-5 w-5 text-rose-600 dark:text-rose-400" />
        </div>

        <div className="min-w-0 flex-1">
          <p className="text-[9px] font-bold uppercase tracking-widest text-rose-600/80 dark:text-rose-400/80">
            Compétition
          </p>
          <p className="truncate text-sm font-semibold text-foreground">
            {competition.name}
          </p>
          {competition.location && (
            <div className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
              <MapPin className="h-3 w-3 opacity-50" />
              <span className="truncate">{competition.location}</span>
            </div>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          {totalDays > 1 && (
            <span className="rounded-full bg-rose-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-rose-600 dark:text-rose-400">
              Jour {dayIndex}/{totalDays}
            </span>
          )}
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        </div>
      </div>
    </button>
  );
}

export default CompetitionDayBanner;
