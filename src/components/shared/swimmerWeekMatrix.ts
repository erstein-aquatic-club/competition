/**
 * Pure helpers for SwimmerWeekMatrixCard — classify a (date, half-day) cell
 * into a visual state, and fold multiple slot-instance states into one.
 */

export type CellState =
  | "none"
  | "unassigned"
  | "assigned-future"
  | "assigned-today"
  | "done"
  | "missed-feedback"
  | "past-no-session";

export type ClassifyInput = {
  /** Slot-instance state from useSlotCalendar — undefined means no slot at all */
  state: "empty" | "published" | "draft" | "cancelled" | undefined;
  hasAssignment: boolean;
  hasFeedback: boolean;
  isPast: boolean;
  isToday: boolean;
};

export function classifyCell(input: ClassifyInput): CellState {
  if (input.state === undefined) return "none";

  // Drafts and cancelled instances are not visible to swimmers — treat them
  // as "no session assigned" for cell purposes.
  const treatAsEmpty =
    input.state === "empty" ||
    input.state === "draft" ||
    input.state === "cancelled" ||
    !input.hasAssignment;

  if (treatAsEmpty) {
    return input.isPast ? "past-no-session" : "unassigned";
  }

  // Published + assigned
  if (input.isPast) {
    return input.hasFeedback ? "done" : "missed-feedback";
  }
  return input.isToday ? "assigned-today" : "assigned-future";
}

/**
 * When two slots share the same half-day (e.g. two morning groups), fold to
 * the most actionable state so the swimmer notices what matters first.
 *
 * Priority (highest first): missed-feedback > unassigned > assigned-today >
 * assigned-future > done > past-no-session > none.
 */
const PRIORITY: Record<CellState, number> = {
  "missed-feedback": 6,
  unassigned: 5,
  "assigned-today": 4,
  "assigned-future": 3,
  done: 2,
  "past-no-session": 1,
  none: 0,
};

export function foldCellStates(states: CellState[]): CellState {
  if (states.length === 0) return "none";
  let best: CellState = states[0];
  for (let i = 1; i < states.length; i += 1) {
    if (PRIORITY[states[i]] > PRIORITY[best]) best = states[i];
  }
  return best;
}
