import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { api } from "@/lib/api";
import { groupAndSortAssignments, type ParticipantProfile } from "./info-helpers";
import { Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface Props {
  competitionId: string;
}

export default function InfoParticipants({ competitionId }: Props) {
  const [, navigate] = useLocation();

  const { data: assignments = [], isLoading: assignmentsLoading } = useQuery({
    queryKey: ["competition-assignments", competitionId],
    queryFn: () => api.getCompetitionAssignments(competitionId),
  });

  const { data: athletes = [], isLoading: athletesLoading } = useQuery({
    queryKey: ["athletes"],
    queryFn: () => api.getAthletes(),
  });

  const { data: objectives = [], isLoading: objectivesLoading } = useQuery({
    queryKey: ["competition-objectives", competitionId],
    queryFn: () => api.getObjectivesByCompetition(competitionId),
  });

  const isLoading = assignmentsLoading || athletesLoading || objectivesLoading;

  const profilesByUserId = useMemo(() => {
    const map = new Map<number, ParticipantProfile>();
    for (const a of athletes) {
      if (a.id == null) continue;
      map.set(a.id, {
        user_id: a.id,
        display_name: a.display_name,
        group_label: a.group_label ?? null,
        avatar_url: a.avatar_url ?? null,
      });
    }
    return map;
  }, [athletes]);

  const objectivesByAthlete = useMemo(() => {
    const map = new Map<number, number>();
    for (const o of objectives) {
      const id = Number(o.athlete_id);
      if (Number.isFinite(id)) {
        map.set(id, (map.get(id) ?? 0) + 1);
      }
    }
    return map;
  }, [objectives]);

  const rows = useMemo(
    () => groupAndSortAssignments(assignments, profilesByUserId, objectivesByAthlete),
    [assignments, profilesByUserId, objectivesByAthlete],
  );

  if (isLoading) {
    return (
      <div className="rounded-xl border border-border bg-card p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Users className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold">Nageurs participants</h2>
        </div>
        <div className="space-y-2">
          <div className="h-10 rounded-md bg-muted/40 animate-pulse" />
          <div className="h-10 rounded-md bg-muted/40 animate-pulse" />
          <div className="h-10 rounded-md bg-muted/40 animate-pulse" />
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-card p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Users className="h-4 w-4 text-muted-foreground" />
        <h2 className="text-sm font-semibold">
          Nageurs participants ({rows.length})
        </h2>
      </div>

      {rows.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          Aucun nageur assigné pour le moment.
        </p>
      ) : (
        <ul className="divide-y divide-border">
          {rows.map((row) => (
            <li key={row.athleteId}>
              <button
                type="button"
                onClick={() => navigate(`/profile/${row.athleteId}`)}
                className="w-full flex items-center gap-3 py-2 hover:bg-muted/40 rounded-md px-2 -mx-2 transition min-h-[48px]"
              >
                <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center overflow-hidden shrink-0">
                  {row.avatarUrl ? (
                    <img src={row.avatarUrl} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <span className="text-[10px] font-medium text-muted-foreground">
                      {row.displayName.slice(0, 2).toUpperCase()}
                    </span>
                  )}
                </div>
                <div className="min-w-0 flex-1 text-left">
                  <p className="text-xs font-medium truncate">{row.displayName}</p>
                  <p className="text-[10px] text-muted-foreground truncate">{row.groupLabel}</p>
                </div>
                {row.objectivesCount > 0 ? (
                  <Badge variant="secondary" className="text-[10px] shrink-0">
                    {row.objectivesCount} obj
                  </Badge>
                ) : (
                  <span className="text-[10px] text-muted-foreground shrink-0">—</span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
