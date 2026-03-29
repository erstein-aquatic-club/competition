import { describe, it, expect } from "vitest";
import { computeDailyLoads } from "../hooks/useTrainingLoad";

// We test the pure `computeDailyLoads` function that does all the heavy lifting
// without needing React Query or a React test renderer.

describe("computeDailyLoads", () => {
  // Helper: generate a date string N days ago from today
  function daysAgoStr(n: number): string {
    const d = new Date();
    d.setDate(d.getDate() - n);
    return d.toISOString().slice(0, 10);
  }

  const today = daysAgoStr(0);

  it("returns one entry per day in the given period", () => {
    const result = computeDailyLoads([], [], 7);
    expect(result.length).toBe(7);
    // First entry should be 6 days ago, last should be today
    expect(result[0].date).toBe(daysAgoStr(6));
    expect(result[result.length - 1].date).toBe(today);
  });

  it("aggregates swim sRPE by date (rpe * duration)", () => {
    const swimRows = [
      { session_date: today, rpe: 5, session_duration_minutes: 90, duration: null },
      { session_date: today, rpe: 3, session_duration_minutes: 60, duration: null },
    ];
    const result = computeDailyLoads(swimRows, [], 3);
    const todayEntry = result.find((d) => d.date === today)!;
    // 5*90 + 3*60 = 450 + 180 = 630
    expect(todayEntry.swimLoad).toBe(630);
    expect(todayEntry.strengthLoad).toBe(0);
    expect(todayEntry.totalLoad).toBe(630);
  });

  it("uses legacy duration when session_duration_minutes is null", () => {
    const swimRows = [
      { session_date: today, rpe: 4, session_duration_minutes: null, duration: 60 },
    ];
    const result = computeDailyLoads(swimRows, [], 3);
    const todayEntry = result.find((d) => d.date === today)!;
    // 4 * 60 = 240
    expect(todayEntry.swimLoad).toBe(240);
  });

  it("defaults to 90min when no duration available", () => {
    const swimRows = [
      { session_date: today, rpe: 2, session_duration_minutes: null, duration: null },
    ];
    const result = computeDailyLoads(swimRows, [], 3);
    const todayEntry = result.find((d) => d.date === today)!;
    // 2 * 90 = 180
    expect(todayEntry.swimLoad).toBe(180);
  });

  it("skips swim rows with rpe <= 0", () => {
    const swimRows = [
      { session_date: today, rpe: 0, session_duration_minutes: 90, duration: null },
      { session_date: today, rpe: null, session_duration_minutes: 90, duration: null },
    ];
    const result = computeDailyLoads(swimRows, [], 3);
    const todayEntry = result.find((d) => d.date === today)!;
    expect(todayEntry.swimLoad).toBe(0);
  });

  it("computes strength load from set log RPEs", () => {
    const strengthRuns = [
      {
        started_at: `${today}T08:00:00Z`,
        completed_at: `${today}T08:45:00Z`,
        fatigue: null,
        strength_set_logs: [
          { rpe: 7, weight: 50, reps: 10 },
          { rpe: 8, weight: 60, reps: 8 },
          { rpe: 6, weight: 40, reps: 12 },
        ],
      },
    ];
    const result = computeDailyLoads([], strengthRuns, 3);
    const todayEntry = result.find((d) => d.date === today)!;
    // avg RPE = (7+8+6)/3 = 7, normalized = 0.7
    // duration from timestamps = 45 min
    // sRPE = 0.7 * 45 = 31.5
    expect(todayEntry.strengthLoad).toBeCloseTo(31.5, 0);
  });

  it("falls back to volume-based load when no RPE in logs", () => {
    const strengthRuns = [
      {
        started_at: `${today}T08:00:00Z`,
        completed_at: null,
        fatigue: null,
        strength_set_logs: [
          { rpe: null, weight: 50, reps: 10 },
          { rpe: null, weight: 60, reps: 8 },
        ],
      },
    ];
    const result = computeDailyLoads([], strengthRuns, 3);
    const todayEntry = result.find((d) => d.date === today)!;
    // volume = 50*10 + 60*8 = 500 + 480 = 980, normalized = 980/100 = 9.8, rounded = 10
    expect(todayEntry.strengthLoad).toBe(10);
  });

  it("merges swim and strength loads on the same day", () => {
    const swimRows = [
      { session_date: today, rpe: 5, session_duration_minutes: 90, duration: null },
    ];
    const strengthRuns = [
      {
        started_at: `${today}T14:00:00Z`,
        completed_at: `${today}T14:30:00Z`,
        fatigue: null,
        strength_set_logs: [{ rpe: 8, weight: 50, reps: 10 }],
      },
    ];
    const result = computeDailyLoads(swimRows, strengthRuns, 3);
    const todayEntry = result.find((d) => d.date === today)!;
    expect(todayEntry.swimLoad).toBe(450); // 5 * 90
    expect(todayEntry.strengthLoad).toBeGreaterThan(0);
    expect(todayEntry.totalLoad).toBe(todayEntry.swimLoad + todayEntry.strengthLoad);
  });

  it("excludes data outside the date range", () => {
    const oldDate = daysAgoStr(10);
    const swimRows = [
      { session_date: oldDate, rpe: 8, session_duration_minutes: 90, duration: null },
    ];
    const result = computeDailyLoads(swimRows, [], 3);
    // oldDate is 10 days ago but range is only 3 days
    const allLoads = result.reduce((s, d) => s + d.swimLoad, 0);
    expect(allLoads).toBe(0);
  });

  it("returns sorted entries from oldest to newest", () => {
    const result = computeDailyLoads([], [], 5);
    for (let i = 1; i < result.length; i++) {
      expect(result[i].date >= result[i - 1].date).toBe(true);
    }
  });
});
