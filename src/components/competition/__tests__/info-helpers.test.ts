import { describe, it, expect } from "vitest";
import { computeObjectivePerfRow } from "../info-helpers";
import type { Objective, SwimmerPerformance } from "@/lib/api/types";

const baseObjective = (over: Partial<Objective> = {}): Objective => ({
  id: "o1",
  athlete_id: "a1",
  competition_id: "c1",
  event_code: "50_FREE",
  pool_length: 50,
  target_time_seconds: 24.5,
  text: null,
  ...over,
});

const perf = (over: Partial<SwimmerPerformance> = {}): SwimmerPerformance => ({
  id: 1,
  user_id: 1,
  swimmer_iuf: "X",
  event_code: "50_FREE",
  pool_length: 50,
  time_seconds: 24.82,
  competition_date: "2025-12-01",
  ...over,
} as SwimmerPerformance);

describe("computeObjectivePerfRow", () => {
  it("returns label, target, pb and positive delta when PB is above target", () => {
    const row = computeObjectivePerfRow(baseObjective(), [perf()]);
    expect(row.targetSeconds).toBe(24.5);
    expect(row.pbSeconds).toBe(24.82);
    expect(row.deltaSeconds).toBeCloseTo(0.32, 2);
  });

  it("returns negative delta when PB is below target", () => {
    const row = computeObjectivePerfRow(baseObjective(), [perf({ time_seconds: 24.10 })]);
    expect(row.deltaSeconds).toBeCloseTo(-0.40, 2);
  });

  it("returns null pb when no perf matches event_code+poolLength", () => {
    const row = computeObjectivePerfRow(baseObjective(), [perf({ event_code: "100_FREE" })]);
    expect(row.pbSeconds).toBeNull();
    expect(row.deltaSeconds).toBeNull();
  });

  it("picks the minimum (best) time when multiple perfs match", () => {
    const row = computeObjectivePerfRow(baseObjective(), [
      perf({ time_seconds: 25.10 }),
      perf({ time_seconds: 24.55 }),
      perf({ time_seconds: 24.95 }),
    ]);
    expect(row.pbSeconds).toBe(24.55);
  });

  it("returns null target and pb when objective has no target_time_seconds", () => {
    const row = computeObjectivePerfRow(baseObjective({ target_time_seconds: null }), [perf()]);
    expect(row.targetSeconds).toBeNull();
    expect(row.deltaSeconds).toBeNull();
    // pb is still computed because it doesn't depend on target
    expect(row.pbSeconds).toBe(24.82);
  });

  it("respects pool_length when filtering perfs", () => {
    const row = computeObjectivePerfRow(
      baseObjective({ pool_length: 25 }),
      [perf({ pool_length: 50, time_seconds: 24.10 })],
    );
    expect(row.pbSeconds).toBeNull();
  });
});
