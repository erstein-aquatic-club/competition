/**
 * Builds the `SwimLibraryEntryContext` passed to `onOpenLibrary` when a
 * coach navigates from the timeline into the swim catalog (create or edit).
 * Extracted from CoachTrainingSlotsScreen.tsx (§168).
 *
 * Behaviour : if `mode === "edit"` AND a `swimCatalogId` is provided, the
 * context carries the full edit payload. Any other combination (including
 * `mode === "edit"` without a `swimCatalogId`) falls back to `"create"` —
 * this matches the pre-refactor behaviour where a missing catalog id on an
 * edit request was silently treated as a fresh create.
 */

import type { SlotInstance } from "@/hooks/useSlotCalendar";
import type { SwimLibraryEntryContext } from "../swimLibraryEntryContext";

export function buildSwimLibraryContext(
  instance: SlotInstance,
  mode: "create" | "edit",
  swimCatalogId?: number,
): SwimLibraryEntryContext {
  const base = {
    slot: {
      trainingSlotId: instance.slot.id,
      scheduledDate: instance.date,
      startTime: instance.slot.start_time,
      endTime: instance.slot.end_time,
      location: instance.slot.location,
    },
  };

  if (mode === "edit" && swimCatalogId != null) {
    return {
      mode,
      swimCatalogId,
      ...base,
    };
  }

  return {
    mode: "create",
    ...base,
  };
}
