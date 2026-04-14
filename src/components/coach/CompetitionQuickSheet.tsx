import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Trophy, MapPin, Calendar, ArrowRight } from "lucide-react";
import type { Competition } from "@/lib/api/types";

interface CompetitionQuickSheetProps {
  competition: Competition | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onViewDetail: () => void;
}

function formatDateFr(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export function CompetitionQuickSheet({
  competition,
  open,
  onOpenChange,
  onViewDetail,
}: CompetitionQuickSheetProps) {
  if (!competition) return null;

  const isMultiDay =
    competition.end_date && competition.end_date !== competition.date;
  const dateLabel = isMultiDay
    ? `du ${formatDateFr(competition.date)} au ${formatDateFr(competition.end_date!)}`
    : formatDateFr(competition.date);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="rounded-t-2xl">
        <SheetHeader className="text-left">
          <div className="flex items-start gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-rose-500/15">
              <Trophy className="h-5 w-5 text-rose-600 dark:text-rose-400" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-bold uppercase tracking-widest text-rose-600/80 dark:text-rose-400/80">
                Compétition
              </p>
              <SheetTitle className="text-base leading-snug">
                {competition.name}
              </SheetTitle>
            </div>
          </div>
        </SheetHeader>

        <div className="mt-4 space-y-3">
          <div className="flex items-start gap-2 text-sm text-muted-foreground">
            <Calendar className="mt-0.5 h-4 w-4 shrink-0 opacity-60" />
            <span className="capitalize">{dateLabel}</span>
          </div>

          {competition.location && (
            <div className="flex items-start gap-2 text-sm text-muted-foreground">
              <MapPin className="mt-0.5 h-4 w-4 shrink-0 opacity-60" />
              <span>{competition.location}</span>
            </div>
          )}

          {competition.description && (
            <p className="whitespace-pre-wrap text-sm text-foreground/80">
              {competition.description}
            </p>
          )}
        </div>

        <div className="mt-6 pb-2">
          <Button onClick={onViewDetail} className="w-full" size="lg">
            Voir la compétition
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

export default CompetitionQuickSheet;
