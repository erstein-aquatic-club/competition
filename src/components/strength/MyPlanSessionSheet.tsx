import { Dumbbell } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetFooter,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import type { StrengthSessionTemplate } from "@/lib/api/types";
import type { StrengthPhase } from "@/lib/strength/strengthPhaseStyles";
import { PHASE_STYLES } from "@/lib/strength/strengthPhaseStyles";

interface MyPlanSessionSheetProps {
  session: StrengthSessionTemplate | null;
  phase: StrengthPhase | null;
  onClose: () => void;
  onLaunch: (session: StrengthSessionTemplate) => void;
}

export function MyPlanSessionSheet({
  session,
  phase,
  onClose,
  onLaunch,
}: MyPlanSessionSheetProps) {
  const style = phase ? PHASE_STYLES[phase] : null;
  const items = session?.items ?? [];

  return (
    <Sheet open={!!session} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="bottom" className="rounded-t-2xl max-h-[70dvh] overflow-y-auto">
        {session && (
          <>
            <SheetHeader className="pb-3">
              <SheetTitle className="flex items-center gap-2 text-base text-left">
                <Dumbbell className="h-4 w-4 shrink-0 text-muted-foreground" />
                <span className="flex-1">{session.title ?? session.name}</span>
                {style && phase && (
                  <span
                    className={cn(
                      "inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-semibold border-0 shrink-0",
                      style.bg,
                      style.text,
                    )}
                  >
                    {phase.toUpperCase()}
                  </span>
                )}
              </SheetTitle>
              {session.description && (
                <p className="text-xs text-muted-foreground text-left mt-1">
                  {session.description}
                </p>
              )}
            </SheetHeader>

            {items.length > 0 && (
              <div className="space-y-1 pb-4">
                {items.slice(0, 10).map((item, idx) => (
                  <div
                    key={idx}
                    className="flex items-center gap-2 py-1.5 px-2 rounded-lg bg-muted/30"
                  >
                    <span className="text-[11px] text-muted-foreground tabular-nums w-4 shrink-0">
                      {idx + 1}.
                    </span>
                    <span className="text-[12px] font-medium flex-1 truncate">
                      {item.exercise_name ?? `Exercice ${idx + 1}`}
                    </span>
                    <span className="text-[11px] text-muted-foreground tabular-nums shrink-0">
                      {item.sets}×{item.reps}
                      {item.percent_1rm > 0 && ` @ ${item.percent_1rm}%`}
                    </span>
                  </div>
                ))}
                {items.length > 10 && (
                  <p className="text-[11px] text-muted-foreground text-center pt-1">
                    +{items.length - 10} autres exercices
                  </p>
                )}
              </div>
            )}

            <SheetFooter className="sticky bottom-0 bg-background pt-2 pb-safe flex gap-2">
              <Button variant="outline" className="flex-1" onClick={onClose}>
                Fermer
              </Button>
              <Button
                size="lg"
                className="flex-1"
                onClick={() => onLaunch(session)}
              >
                Lancer la séance
              </Button>
            </SheetFooter>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
