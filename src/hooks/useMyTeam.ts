import { useQuery } from "@tanstack/react-query";
import { getMySwimmers } from "@/lib/api/coach-assignments";
import { listManualSwimmers, type CoachManualSwimmer } from "@/lib/api/coach-manual-swimmers";
import type { AthleteSummary } from "@/lib/api/types";

export interface TeamMember {
  kind: "account" | "manual";
  id: string;
  accountId?: number;
  manualId?: string;
  displayName: string;
  birthdate?: string | null;
  sex?: "M" | "F" | null;
  avatarUrl?: string | null;
}

export function buildTeam(
  mySwimmerIds: number[],
  allAthletes: AthleteSummary[],
  manuals: CoachManualSwimmer[],
): { team: TeamMember[]; accounts: TeamMember[]; manuals: TeamMember[] } {
  const idSet = new Set(mySwimmerIds);

  const accounts: TeamMember[] = allAthletes
    .filter(a => a.id !== null && idSet.has(a.id as number))
    .map(a => ({
      kind: "account" as const,
      id: `account-${a.id}`,
      accountId: a.id as number,
      displayName: a.display_name,
      avatarUrl: a.avatar_url ?? null,
    }));

  const manualMembers: TeamMember[] = manuals.map(m => ({
    kind: "manual" as const,
    id: `manual-${m.id}`,
    manualId: m.id,
    displayName: m.display_name,
    birthdate: m.birthdate,
    sex: m.sex,
  }));

  const team = [...accounts, ...manualMembers].sort((a, b) =>
    a.displayName.localeCompare(b.displayName, undefined, { sensitivity: "base" }),
  );

  return { team, accounts, manuals: manualMembers };
}

export function useMyTeam(allAthletes?: AthleteSummary[]): {
  team: TeamMember[];
  accounts: TeamMember[];
  manuals: TeamMember[];
  isLoading: boolean;
  error: Error | null;
} {
  const idsQuery = useQuery({
    queryKey: ["my-swimmer-ids"],
    queryFn: getMySwimmers,
  });

  const manualsQuery = useQuery({
    queryKey: ["my-manual-swimmers"],
    queryFn: listManualSwimmers,
  });

  const isLoading = idsQuery.isLoading || manualsQuery.isLoading;
  const error = (idsQuery.error || manualsQuery.error) as Error | null;

  if (isLoading || error || !idsQuery.data || !manualsQuery.data) {
    return { team: [], accounts: [], manuals: [], isLoading, error };
  }

  const athletes = allAthletes ?? [];
  const built = buildTeam(idsQuery.data, athletes, manualsQuery.data);
  return { ...built, isLoading: false, error: null };
}
