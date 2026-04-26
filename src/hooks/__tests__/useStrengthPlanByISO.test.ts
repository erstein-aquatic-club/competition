import { describe, expect, it } from "vitest";
import {
  buildWeekStarts,
  isoFromWeekStartAndDay,
} from "@/hooks/useStrengthPlanByISO";

describe("buildWeekStarts", () => {
  // We pass dates via the (year, monthIndex, day, ...) constructor so that
  // the test result is timezone-independent: the parsed-string form of
  // "YYYY-MM-DDTHH:mm:ss" is interpreted as local time, but local Monday
  // can fall on a different UTC day in TZ-sensitive runners (CI in UTC vs
  // dev in CEST). Building via numeric args sidesteps that.
  it("includes the previous week + N future weeks (length = count + 1)", () => {
    // Wed 2026-04-22 → Monday should be 2026-04-20
    const result = buildWeekStarts(12, new Date(2026, 3, 22, 10, 0, 0));
    expect(result).toHaveLength(13);
    expect(result[0]).toBe("2026-04-13"); // previous Monday
    expect(result[1]).toBe("2026-04-20"); // current Monday
  });

  it("anchors to Monday when called on a Sunday (the JS Date.getDay edge case)", () => {
    // Sun 2026-04-26 → JS getDay()=0, must roll back 6 days to Mon 2026-04-20
    const result = buildWeekStarts(1, new Date(2026, 3, 26, 22, 0, 0));
    expect(result).toEqual(["2026-04-13", "2026-04-20"]);
  });

  it("returns Mondays only (each entry shifted by 7 days)", () => {
    const result = buildWeekStarts(5, new Date(2026, 3, 22, 10, 0, 0));
    for (let i = 1; i < result.length; i++) {
      const prev = new Date(result[i - 1] + "T00:00:00").getTime();
      const cur = new Date(result[i] + "T00:00:00").getTime();
      expect(cur - prev).toBe(7 * 24 * 60 * 60 * 1000);
    }
  });
});

describe("isoFromWeekStartAndDay", () => {
  it("returns the Monday itself for day_of_week=0", () => {
    expect(isoFromWeekStartAndDay("2026-04-20", 0)).toBe("2026-04-20");
  });

  it("returns the following Sunday for day_of_week=6", () => {
    expect(isoFromWeekStartAndDay("2026-04-20", 6)).toBe("2026-04-26");
  });

  it("crosses month boundaries correctly (regression — naive date math fails on the 30th)", () => {
    // Mon 2026-03-30 + 6 days = Sun 2026-04-05
    expect(isoFromWeekStartAndDay("2026-03-30", 6)).toBe("2026-04-05");
  });

  it("crosses year boundaries correctly", () => {
    // Mon 2025-12-29 + 6 days = Sun 2026-01-04
    expect(isoFromWeekStartAndDay("2025-12-29", 6)).toBe("2026-01-04");
  });

  it("does NOT shift to UTC (regression — toISOString() at 00:00 local would give the previous day in negative TZ offsets)", () => {
    // The helper must use local-date components so swimmers in timezones
    // west of UTC don't see Saturday sessions appear under Sunday.
    expect(isoFromWeekStartAndDay("2026-04-20", 1)).toBe("2026-04-21");
  });
});
