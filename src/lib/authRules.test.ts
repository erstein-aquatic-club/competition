import assert from "node:assert/strict";
import { test } from "node:test";

import { requiresApprovalForRole, requiresPasswordForRole } from "./authRules";

test("requiresPasswordForRole returns true for athlete role", () => {
  assert.equal(requiresPasswordForRole("athlete"), true);
});

test("requiresPasswordForRole returns true for privileged roles", () => {
  assert.equal(requiresPasswordForRole("coach"), true);
  assert.equal(requiresPasswordForRole("comite"), true);
  assert.equal(requiresPasswordForRole("admin"), true);
});

test("requiresPasswordForRole handles nullish roles", () => {
  assert.equal(requiresPasswordForRole(null), false);
  assert.equal(requiresPasswordForRole(undefined), false);
});

test("requiresApprovalForRole only requires validation for coach accounts", () => {
  assert.equal(requiresApprovalForRole("coach"), true);
  assert.equal(requiresApprovalForRole("athlete"), false);
  assert.equal(requiresApprovalForRole("admin"), false);
  assert.equal(requiresApprovalForRole("comite"), false);
});

test("requiresApprovalForRole handles nullish roles", () => {
  assert.equal(requiresApprovalForRole(null), false);
  assert.equal(requiresApprovalForRole(undefined), false);
});
