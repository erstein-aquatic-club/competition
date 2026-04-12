import { useMemo } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { getCompetitions, getMyCompetitionIds } from "@/lib/api/index";
import { useAuth } from "@/lib/auth";
import { PageHeader } from "@/components/shared/PageHeader";
import SwimmerObjectivesView from "@/components/profile/SwimmerObjectivesView";
import { Badge } from "@/components/ui/badge";
import { Target, Trophy, MapPin, ExternalLink } from "lucide-react";

function daysBetween(a: string, b: string): number {
  return Math.round(
    (new Date(b + "T00:00:00").getTime() - new Date(a + "T00:00:00").getTime()) / 86400000,
  );
}

export default function SuiviObjectifs() {
  const [, navigate] = useLocation();
  const userId = useAuth((s) => s.userId);
  const todayIso = useMemo(() => new Date().toISOString().split("T")[0], []);

  const { data: competitions = [] } = useQuery({
    queryKey: ["competitions"],
    queryFn: () => getCompetitions(),
    staleTime: 10 * 60_000,
  });

  const { data: myCompIds = [] } = useQuery({
    queryKey: ["my-competition-ids", userId],
    queryFn: () => getMyCompetitionIds(userId!),
    enabled: !!userId,
    staleTime: 10 * 60_000,
  });

  const upcomingCompetitions = useMemo(() => {
    const set = new Set(myCompIds);
    return competitions
      .filter((c) => set.has(c.id) && c.date >= todayIso)
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [myCompIds, competitions, todayIso]);

  return (
    <div className="mx-auto max-w-4xl px-4 pb-24">
      <PageHeader
        title="Mes objectifs"
        icon={<Target className="h-3.5 w-3.5" />}
        backHref="/suivi"
        backLabel="Mon suivi"
      />

      <div className="space-y-6 pt-3">
        {/* Objectives CRUD (existing component) */}
        <SwimmerObjectivesView embedded />

        {/* Upcoming competitions */}
        {upcomingCompetitions.length > 0 && (
          <section className="space-y-2">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Prochaines echeances
            </h2>
            <div className="space-y-2">
              {upcomingCompetitions.map((comp) => {
                const daysUntilComp = daysBetween(todayIso, comp.date);
                return (
                  <button
                    key={comp.id}
                    type="button"
                    className="w-full text-left rounded-2xl border border-primary/20 bg-gradient-to-r from-primary/10 via-primary/5 to-amber-500/10 px-3.5 py-3 shadow-sm transition-all hover:shadow-md active:scale-[0.98]"
                    onClick={() => navigate(`/competition/${comp.id}`)}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Trophy className="h-3.5 w-3.5 text-primary shrink-0" />
                          <span className="text-sm font-semibold">{comp.name}</span>
                        </div>
                        <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                          <span>
                            {new Date(comp.date + "T12:00:00").toLocaleDateString("fr-FR", {
                              day: "2-digit",
                              month: "long",
                              year: "numeric",
                            })}
                          </span>
                          {comp.location && (
                            <>
                              <span>·</span>
                              <MapPin className="h-3 w-3 shrink-0" />
                              <span className="truncate">{comp.location}</span>
                            </>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <Badge variant="outline" className="text-[10px] font-semibold">
                          J-{daysUntilComp}
                        </Badge>
                        <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
