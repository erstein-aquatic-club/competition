import type { TrainingSlot } from "@/lib/api/types";

type SwimmerGroupContext = {
  permanentGroupIds: number[];
  temporaryGroupIds: number[];
  hasActiveTemporary: boolean;
};

type AthleteFilterEntry = {
  id: number | null;
  group_id?: number | null;
};

type FilterTrainingSlotsArgs = {
  slots: TrainingSlot[];
  filterValue: string;
  athletes: AthleteFilterEntry[];
  swimmerFilterId: number | null;
  swimmerHasCustom?: boolean;
  swimmerSlotsAsTraining: TrainingSlot[];
  swimmerGroupContext?: SwimmerGroupContext | null;
};

export function getVisibleSwimmerGroupIds(
  context?: SwimmerGroupContext | null,
): number[] {
  if (!context) return [];
  return context.hasActiveTemporary
    ? context.temporaryGroupIds
    : context.permanentGroupIds;
}

export function filterCoachTrainingSlots({
  slots,
  filterValue,
  athletes,
  swimmerFilterId,
  swimmerHasCustom,
  swimmerSlotsAsTraining,
  swimmerGroupContext,
}: FilterTrainingSlotsArgs): TrainingSlot[] {
  if (filterValue === "all") return slots;

  if (filterValue.startsWith("group:")) {
    const gid = Number(filterValue.split(":")[1]);
    return slots.filter((slot) =>
      slot.assignments.some((assignment) => assignment.group_id === gid),
    );
  }

  if (filterValue.startsWith("coach:")) {
    const cid = Number(filterValue.split(":")[1]);
    return slots.filter((slot) =>
      (slot.coaches ?? []).some((coach) => coach.coach_id === cid),
    );
  }

  if (!filterValue.startsWith("swimmer:")) {
    return slots;
  }

  if (swimmerHasCustom && swimmerSlotsAsTraining.length > 0) {
    return swimmerSlotsAsTraining;
  }

  const visibleGroupIds = getVisibleSwimmerGroupIds(swimmerGroupContext);
  if (visibleGroupIds.length > 0) {
    return slots.filter((slot) =>
      slot.assignments.some((assignment) =>
        visibleGroupIds.includes(assignment.group_id),
      ),
    );
  }

  const athlete = athletes.find((entry) => entry.id === swimmerFilterId);
  if (athlete?.group_id) {
    return slots.filter((slot) =>
      slot.assignments.some((assignment) => assignment.group_id === athlete.group_id),
    );
  }

  return [];
}
