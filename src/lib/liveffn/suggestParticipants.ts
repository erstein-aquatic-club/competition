/** Matched liveffn user ids (nulls = unmatched lines) not yet in the assigned set; de-duped, order preserved. */
export function suggestedParticipants(matchedUserIds: Array<number | null>, assignedUserIds: number[]): number[] {
  const assigned = new Set(assignedUserIds);
  const out = new Set<number>();
  for (const id of matchedUserIds) if (id != null && !assigned.has(id)) out.add(id);
  return [...out];
}
