import { beforeEach, describe, expect, it } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { useStrengthState } from "@/hooks/useStrengthState";

const key = "strength-focus-state-42";
const saved = {
  screenMode: "list",
  session: {
    id: 123,
    title: "Séance hors-ligne",
    items: [{ exercise_id: 10, sets: 3, reps: 5, order_index: 0 }],
  },
  assignment: null,
  runId: -123456,
  runLogs: [{ exercise_id: 10, set_number: 1, reps: 5, weight: 60 }],
  runnerStep: 1,
  cycleType: "force",
  inlineEstimationExercises: [10],
};

describe("Focus PWA hydration", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("restores a run after leaving Focus for the list, without deleting its snapshot", async () => {
    window.localStorage.setItem(key, JSON.stringify(saved));
    const { result } = renderHook(() => useStrengthState({ athleteKey: 42 }));
    await waitFor(() => expect(result.current.activeRunId).toBe(-123456));
    expect(result.current.screenMode).toBe("list");
    expect(result.current.activeSession?.id).toBe(123);
    expect(result.current.activeRunLogs).toHaveLength(1);
    expect(JSON.parse(window.localStorage.getItem(key) ?? "{}").runId).toBe(-123456);
  });

  it("does not destroy an active run on a dock navigation reset", async () => {
    window.localStorage.setItem(key, JSON.stringify(saved));
    const { result } = renderHook(() => useStrengthState({ athleteKey: 42 }));
    await waitFor(() => expect(result.current.activeRunId).toBe(-123456));
    act(() => window.dispatchEvent(new Event("nav:reset")));
    expect(result.current.screenMode).toBe("list");
    expect(result.current.activeRunId).toBe(-123456);
    expect(result.current.activeRunLogs).toHaveLength(1);
  });
});
