import { describe, it, expect } from "vitest";
import { derivePlanByWeekDay } from "../derivePlanByWeekDay";
import type { TrainingPlanSession } from "@/lib/api/types";
import type { ActiveTrainingPlanApplication } from "@/lib/api/training-plans";

function mkApp(partial: Partial<ActiveTrainingPlanApplication>): ActiveTrainingPlanApplication {
  return {
    id: partial.id ?? 1,
    plan_id: partial.plan_id ?? 1,
    target_user_id: partial.target_user_id ?? 1,
    target_group_id: null,
    start_date: partial.start_date ?? "2026-03-23", // Monday S13/2026
    end_date: partial.end_date ?? null,
    applied_by: 2,
    created_at: "2026-03-20T00:00:00Z",
    updated_at: "2026-03-20T00:00:00Z",
    plan_num_weeks: partial.plan_num_weeks ?? 10,
    plan_discipline: "strength",
    plan_name: partial.plan_name ?? "Test plan",
  };
}

function mkSession(plan_id: number, relative_week: number, day_of_week: number, id = relative_week * 10 + day_of_week): TrainingPlanSession {
  return {
    id,
    plan_id,
    relative_week,
    day_of_week,
    session_template_id: id,
    notes: null,
    created_at: "2026-03-20T00:00:00Z",
    updated_at: "2026-03-20T00:00:00Z",
  };
}

describe("derivePlanByWeekDay", () => {
  it("returns empty map when no applications", () => {
    const result = derivePlanByWeekDay({
      weekKeys: ["2026-03-23", "2026-03-30"],
      applications: [],
      sessions: [],
    });
    expect(result.size).toBe(0);
  });

  it("maps relative_week 1 to start_date Monday", () => {
    const app = mkApp({ plan_id: 1, start_date: "2026-03-23", plan_num_weeks: 4 });
    // Day 0 = Lundi, Day 4 = Vendredi
    const sessions = [mkSession(1, 1, 4)]; // Vendredi semaine 1
    const result = derivePlanByWeekDay({
      weekKeys: ["2026-03-23"],
      applications: [app],
      sessions,
    });
    expect(result.get("2026-03-23")?.get(4)?.relativeWeek).toBe(1);
    expect(result.get("2026-03-23")?.get(4)?.session.session_template_id).toBe(14);
  });

  it("computes relative_week correctly for subsequent weeks", () => {
    const app = mkApp({ plan_id: 1, start_date: "2026-03-23", plan_num_weeks: 10 });
    const sessions = [
      mkSession(1, 2, 0), // Lun S2
      mkSession(1, 3, 2), // Mer S3
      mkSession(1, 4, 4), // Ven S4
    ];
    const result = derivePlanByWeekDay({
      weekKeys: ["2026-03-23", "2026-03-30", "2026-04-06", "2026-04-13"],
      applications: [app],
      sessions,
    });
    // S1 (start) → relative_week 1, no sessions for week 1 → empty
    expect(result.get("2026-03-23")?.size).toBeFalsy();
    // S2 = 2026-03-30 → relative_week 2
    expect(result.get("2026-03-30")?.get(0)?.relativeWeek).toBe(2);
    // S3
    expect(result.get("2026-04-06")?.get(2)?.relativeWeek).toBe(3);
    // S4
    expect(result.get("2026-04-13")?.get(4)?.relativeWeek).toBe(4);
  });

  it("excludes weeks past num_weeks", () => {
    const app = mkApp({ plan_id: 1, start_date: "2026-03-23", plan_num_weeks: 2 });
    const sessions = [mkSession(1, 1, 0), mkSession(1, 3, 0)];
    const result = derivePlanByWeekDay({
      weekKeys: ["2026-03-23", "2026-04-06"], // week 1, week 3
      applications: [app],
      sessions,
    });
    expect(result.get("2026-03-23")?.get(0)?.relativeWeek).toBe(1);
    expect(result.get("2026-04-06")).toBeUndefined();
  });

  it("excludes weeks before start_date", () => {
    const app = mkApp({ plan_id: 1, start_date: "2026-04-06" });
    const sessions = [mkSession(1, 1, 0)];
    const result = derivePlanByWeekDay({
      weekKeys: ["2026-03-23", "2026-03-30", "2026-04-06"],
      applications: [app],
      sessions,
    });
    expect(result.get("2026-03-23")).toBeUndefined();
    expect(result.get("2026-03-30")).toBeUndefined();
    expect(result.get("2026-04-06")?.get(0)).toBeDefined();
  });

  it("respects end_date override", () => {
    const app = mkApp({
      plan_id: 1,
      start_date: "2026-03-23",
      end_date: "2026-04-05", // ends end of week S14
      plan_num_weeks: 10,
    });
    const sessions = [mkSession(1, 1, 0), mkSession(1, 3, 0)];
    const result = derivePlanByWeekDay({
      weekKeys: ["2026-03-23", "2026-04-06"],
      applications: [app],
      sessions,
    });
    expect(result.get("2026-03-23")?.get(0)).toBeDefined();
    // 2026-04-06 = Monday after end_date → excluded
    expect(result.get("2026-04-06")).toBeUndefined();
  });

  it("on overlap, the most recent application wins (sorted desc)", () => {
    const oldApp = mkApp({
      id: 1,
      plan_id: 1,
      start_date: "2026-03-09", // earlier
      plan_num_weeks: 20,
      plan_name: "Old plan",
    });
    const newApp = mkApp({
      id: 2,
      plan_id: 2,
      start_date: "2026-03-23", // later
      plan_num_weeks: 4,
      plan_name: "New plan",
    });
    // newApp comes first (sorted desc)
    const sessions = [
      mkSession(1, 3, 0, 100), // Old plan, S3
      mkSession(2, 1, 0, 200), // New plan, S1
    ];
    const result = derivePlanByWeekDay({
      weekKeys: ["2026-03-23"], // S15/2026 = relative_week 1 for new, 3 for old
      applications: [newApp, oldApp],
      sessions,
    });
    const cell = result.get("2026-03-23")?.get(0);
    expect(cell?.planName).toBe("New plan");
    expect(cell?.session.session_template_id).toBe(200);
  });

  it("multi-day in same week", () => {
    const app = mkApp({ plan_id: 1, start_date: "2026-03-23" });
    const sessions = [
      mkSession(1, 1, 0), // Lun
      mkSession(1, 1, 2), // Mer
      mkSession(1, 1, 4), // Ven
    ];
    const result = derivePlanByWeekDay({
      weekKeys: ["2026-03-23"],
      applications: [app],
      sessions,
    });
    const week = result.get("2026-03-23")!;
    expect(week.size).toBe(3);
    expect(week.get(0)).toBeDefined();
    expect(week.get(1)).toBeUndefined();
    expect(week.get(2)).toBeDefined();
    expect(week.get(3)).toBeUndefined();
    expect(week.get(4)).toBeDefined();
  });
});
