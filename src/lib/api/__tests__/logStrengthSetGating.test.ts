import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { shouldSkipOneRm } from "@/lib/api/strength";
import { BODYWEIGHT_SENTINEL } from "@/lib/api/client";

describe("shouldSkipOneRm (§298)", () => {
  it("skip si bodyweight sentinel", () => assert.equal(shouldSkipOneRm(BODYWEIGHT_SENTINEL), true));
  it("skip si flag explicite (métrique non-poids)", () => assert.equal(shouldSkipOneRm(60, true), true));
  it("ne skip pas un vrai poids", () => assert.equal(shouldSkipOneRm(75, false), false));
  it("ne skip pas un vrai poids sans flag", () => assert.equal(shouldSkipOneRm(75), false));
});
