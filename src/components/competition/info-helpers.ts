import type { Objective, SwimmerPerformance, CompetitionAssignment } from "@/lib/api/types";

export interface ObjectivePerfRow {
  objectiveId: string;
  eventCode: string | null;
  poolLength: number | null;
  targetSeconds: number | null;
  pbSeconds: number | null;
  deltaSeconds: number | null;
  /** Free-text fallback when objective has no parseable target. */
  text: string | null;
}

export function computeObjectivePerfRow(
  objective: Objective,
  perfs: SwimmerPerformance[],
): ObjectivePerfRow {
  const eventCode = objective.event_code ?? null;
  const poolLength = objective.pool_length ?? null;
  const targetSeconds = objective.target_time_seconds ?? null;

  const matching = perfs.filter(
    (p) =>
      p.event_code === eventCode &&
      (poolLength == null || p.pool_length === poolLength),
  );
  const pbSeconds =
    matching.length > 0 ? Math.min(...matching.map((p) => p.time_seconds)) : null;

  const deltaSeconds =
    targetSeconds != null && pbSeconds != null ? pbSeconds - targetSeconds : null;

  return {
    objectiveId: objective.id,
    eventCode,
    poolLength,
    targetSeconds,
    pbSeconds,
    deltaSeconds,
    text: objective.text ?? null,
  };
}

export interface ParticipantProfile {
  user_id: number;
  display_name: string;
  group_label: string | null;
  avatar_url: string | null;
}

export interface ParticipantRow {
  athleteId: number;
  displayName: string;
  groupLabel: string;
  avatarUrl: string | null;
  objectivesCount: number;
}

const NO_GROUP_BUCKET = "Sans groupe";

export function groupAndSortAssignments(
  assignments: CompetitionAssignment[],
  profilesByUserId: Map<number, ParticipantProfile>,
  objectivesByAthlete: Map<number, number>,
): ParticipantRow[] {
  const rows: ParticipantRow[] = [];
  for (const assignment of assignments) {
    const profile = profilesByUserId.get(assignment.athlete_id);
    if (!profile) continue;
    rows.push({
      athleteId: assignment.athlete_id,
      displayName: profile.display_name,
      groupLabel: profile.group_label ?? NO_GROUP_BUCKET,
      avatarUrl: profile.avatar_url,
      objectivesCount: objectivesByAthlete.get(assignment.athlete_id) ?? 0,
    });
  }
  rows.sort((a, b) => {
    const aLast = a.groupLabel === NO_GROUP_BUCKET;
    const bLast = b.groupLabel === NO_GROUP_BUCKET;
    if (aLast !== bLast) return aLast ? 1 : -1;
    if (a.groupLabel !== b.groupLabel) return a.groupLabel.localeCompare(b.groupLabel, "fr");
    return a.displayName.localeCompare(b.displayName, "fr");
  });
  return rows;
}

export function selectLinkableObjectives(objectives: Objective[]): Objective[] {
  return objectives.filter((o) => o.competition_id == null);
}
