import assert from "node:assert/strict";
import { test } from "node:test";
import { buildRunUpdatePayload } from "@/lib/api/transformers";

// Aligné post-§6dce3687f : duration/feeling/rpe ont été retirées de la
// signature car les colonnes correspondantes n'existent pas en DB.
// Le payload supporte uniquement status/progress_pct/fatigue/comments
// (+ completed_at auto-stampé quand status === "completed").
test("buildRunUpdatePayload builds payload for completed run", () => {
  const payload = buildRunUpdatePayload({
    status: "completed",
    progress_pct: 100,
    fatigue: 3,
    comments: "Bonne seance",
  });

  assert.equal(payload.progress_pct, 100);
  assert.equal(payload.status, "completed");
  assert.equal(payload.fatigue, 3);
  assert.equal(payload.comments, "Bonne seance");
  assert.equal(typeof payload.completed_at, "string");
});
