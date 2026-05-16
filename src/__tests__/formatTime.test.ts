import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { fmtTime } from "../lib/formatTime";

describe("fmtTime", () => {
  it("formats sub-minute times with 1 decimal by default", () => {
    assert.equal(fmtTime(23.62), "23.6");
    assert.equal(fmtTime(5.7), "5.7");
  });

  it("formats sub-minute times with 2 decimals when asked", () => {
    assert.equal(fmtTime(23.62, 2), "23.62");
    assert.equal(fmtTime(5.694, 2), "5.69");
  });

  it("formats times >= 60 s as m:ss with zero-padded seconds", () => {
    assert.equal(fmtTime(60), "1:00.0");
    assert.equal(fmtTime(83.62), "1:23.6");
    assert.equal(fmtTime(65.3), "1:05.3");
  });

  it("formats times >= 60 s with 2 decimals (m:ss.cc)", () => {
    assert.equal(fmtTime(60, 2), "1:00.00");
    assert.equal(fmtTime(113, 2), "1:53.00");
    assert.equal(fmtTime(65.3, 2), "1:05.30");
  });

  it("returns an em dash for non-positive durations", () => {
    assert.equal(fmtTime(0), "—");
    assert.equal(fmtTime(-5), "—");
  });
});
