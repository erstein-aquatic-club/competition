import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { StrengthSessionTemplate, TeamAthletePlan } from "@/lib/api/types";
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from "@/components/ui/collapsible";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { MyPlanTab } from "@/components/strength/MyPlanTab";

interface TeamPlansSectionProps {
  currentAthleteId: number;
  onSelectSession: (session: StrengthSessionTemplate) => void;
}

export function TeamPlansSection({ currentAthleteId, onSelectSession }: TeamPlansSectionProps) {
  const { data: plans = [], isLoading } = useQuery({
    queryKey: ["team_athlete_plans", currentAthleteId],
    queryFn: () => api.getTeamAthletePlans(currentAthleteId),
  });

  if (isLoading || plans.length === 0) return null;

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2 pt-1">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/60">Plans d'équipe</span>
        <div className="flex-1 h-px bg-border/40" />
      </div>

      {plans.map((plan) => (
        <AthletePlanAccordion
          key={plan.athleteId}
          plan={plan}
          onSelectSession={onSelectSession}
        />
      ))}
    </div>
  );
}

function AthletePlanAccordion({
  plan,
  onSelectSession,
}: {
  plan: TeamAthletePlan;
  onSelectSession: (session: StrengthSessionTemplate) => void;
}) {
  const [open, setOpen] = useState(false);
  const initial = plan.athleteName.charAt(0).toUpperCase();

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger className="flex items-center gap-2.5 w-full rounded-xl border bg-card px-3 py-2.5 text-left hover:bg-accent/50 transition-colors">
        <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-primary text-[11px] font-bold shrink-0">
          {initial}
        </div>
        <span className="text-[13px] font-semibold flex-1 truncate">{plan.athleteName}</span>
        <ChevronRight className={cn("h-3.5 w-3.5 text-muted-foreground/40 transition-transform", open && "rotate-90")} />
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="pt-1">
          <MyPlanTab athleteId={plan.athleteId} onSelectSession={onSelectSession} />
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
