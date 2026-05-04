import type { Objective, SwimmerPerformance, CompetitionAssignment } from "@/lib/api/types";
import { findBestTime } from "@/lib/objectiveHelpers";

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

  const pbSeconds = eventCode
    ? findBestTime(perfs, eventCode, poolLength)
    : null;

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

export function selectLinkableForCompetition(
  objectives: Objective[],
  currentCompetitionId: string,
): Objective[] {
  return objectives.filter((o) => {
    // Back-compat: exclude if the legacy 1:1 column matches (objects not
    // yet migrated to the join table).
    if (o.competition_id === currentCompetitionId) return false;
    // Defensive: tolerate competition_ids missing or non-array (stale cache,
    // partial fetch, fallback path) — treat as not linked → linkable.
    const ids = Array.isArray(o.competition_ids) ? o.competition_ids : [];
    return !ids.includes(currentCompetitionId);
  });
}
