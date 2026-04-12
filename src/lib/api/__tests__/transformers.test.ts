import assert from "node:assert/strict";
import { test } from "node:test";
import { buildRunUpdatePayload } from "@/lib/api/transformers";

test("buildRunUpdatePayload keeps completed run ressentis", () => {
  const payload = buildRunUpdatePayload({
    status: "completed",
    progress_pct: 100,
    feeling: 4,
    fatigue: 3,
    rpe: 8,
    duration: 42,
    comments: "Bonne seance",
  });

  assert.equal(payload.progress_pct, 100);
  assert.equal(payload.status, "completed");
  assert.equal(payload.feeling, 4);
  assert.equal(payload.fatigue, 3);
  assert.equal(payload.rpe, 8);
  assert.equal(payload.duration, 42);
  assert.equal(payload.comments, "Bonne seance");
  assert.equal(typeof payload.completed_at, "string");
});
