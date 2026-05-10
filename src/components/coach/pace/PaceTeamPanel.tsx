import React, { useState } from "react";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ChevronDown, ChevronUp, Users } from "lucide-react";
import type { TeamMember } from "@/hooks/useMyTeam";
import type { AthleteSummary } from "@/lib/api/types";

const COLLAPSE_THRESHOLD = 8;

export function buildCrossTeamAthletes(
  team: TeamMember[],
  allAthletes: AthleteSummary[],
): AthleteSummary[] {
  const teamAccountIds = new Set(
    team.filter((m) => m.kind === "account").map((m) => m.accountId!),
  );
  return allAthletes.filter((a) => a.id !== null && !teamAccountIds.has(a.id as number));
}

interface Props {
  team: TeamMember[];
  allAthletes: AthleteSummary[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
}

export function PaceTeamPanel({ team, allAthletes, selectedIds, onChange }: Props) {
  const [showAll, setShowAll] = useState(false);
  const [includeCrossTeam, setIncludeCrossTeam] = useState(false);

  const crossTeam = buildCrossTeamAthletes(team, allAthletes);
  const visibleTeam = showAll ? team : team.slice(0, COLLAPSE_THRESHOLD);

  function toggle(id: string) {
    onChange(
      selectedIds.includes(id) ? selectedIds.filter((s) => s !== id) : [...selectedIds, id],
    );
  }

  function toggleCross(a: AthleteSummary) {
    toggle(`account-${a.id}`);
  }

  return (
    <div className="space-y-4">
      {/* Team section */}
      <div>
        <div className="mb-2 flex items-center gap-1.5">
          <Users className="h-3.5 w-3.5 text-muted-foreground/50" />
          <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60">
            Mon équipe ({team.length})
          </span>
        </div>

        <div className="space-y-0.5">
          {visibleTeam.map((member) => (
            <label
              key={member.id}
              className="flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5 transition-colors hover:bg-muted/40"
            >
              <Checkbox
                id={`ptm-${member.id}`}
                checked={selectedIds.includes(member.id)}
                onCheckedChange={() => toggle(member.id)}
                className="shrink-0"
              />
              <span className="flex min-w-0 flex-1 items-center gap-1.5">
                <span className="truncate text-sm">{member.displayName}</span>
                {member.kind === "manual" && (
                  <Badge
                    variant="secondary"
                    className="shrink-0 px-1.5 py-0 text-[9px] font-normal"
                  >
                    Sans compte
                  </Badge>
                )}
              </span>
            </label>
          ))}
        </div>

        {team.length > COLLAPSE_THRESHOLD && (
          <Button
            variant="ghost"
            size="sm"
            className="mt-1 h-7 w-full gap-1 text-[11px] text-muted-foreground"
            onClick={() => setShowAll((v) => !v)}
          >
            {showAll ? (
              <>
                <ChevronUp className="h-3 w-3" />
                Réduire
              </>
            ) : (
              <>
                <ChevronDown className="h-3 w-3" />
                Voir tout ({team.length - COLLAPSE_THRESHOLD} de plus)
              </>
            )}
          </Button>
        )}
      </div>

      {/* Cross-team section */}
      <div className="border-t border-border/30 pt-3 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <Label
            htmlFor="ptp-cross"
            className="cursor-pointer text-xs text-muted-foreground/70"
          >
            Inclure d'autres nageurs du club
          </Label>
          <Switch
            id="ptp-cross"
            checked={includeCrossTeam}
            onCheckedChange={setIncludeCrossTeam}
          />
        </div>

        {includeCrossTeam && (
          crossTeam.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {crossTeam.map((a) => {
                const id = `account-${a.id}`;
                const selected = selectedIds.includes(id);
                return (
                  <button
                    key={a.id}
                    type="button"
                    onClick={() => toggleCross(a)}
                    className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] transition-colors ${
                      selected
                        ? "border-foreground/25 bg-foreground/8 text-foreground"
                        : "border-border/40 text-muted-foreground hover:border-border hover:text-foreground"
                    }`}
                  >
                    {a.display_name}
                  </button>
                );
              })}
            </div>
          ) : (
            <p className="text-[11px] text-muted-foreground/70">
              Aucun autre nageur dans le club.
            </p>
          )
        )}
      </div>

      {/* Footer */}
      <div className="border-t border-border/20 pt-2">
        <a
          href="#/coach?section=swimmers"
          className="text-[11px] text-muted-foreground/50 underline-offset-2 transition-colors hover:text-muted-foreground hover:underline"
        >
          Gérer mon équipe →
        </a>
      </div>
    </div>
  );
}
