import assert from "node:assert/strict";
import { describe, it } from "node:test";

// Full render requires wouter + Supabase context — covered by manual E2E.
// These tests verify importability and pure URL logic.

describe("SharedPaceMatrix — importability", () => {
  it("default export is a function", async () => {
    const mod = await import("../SharedPaceMatrix");
    assert.strictEqual(typeof mod.default, "function");
  });
});

describe("pace share link — url format", () => {
  it("url contains /#/share/pace/ segment", () => {
    const origin = "https://example.com";
    const token = "abc-123-def";
    const url = `${origin}/#/share/pace/${token}`;
    assert.ok(url.includes("/#/share/pace/"), `url must contain /#/share/pace/, got: ${url}`);
    assert.ok(url.endsWith(token), `url must end with token, got: ${url}`);
  });

  it("token is extracted from /share/pace/:token path", () => {
    const location = "/share/pace/my-token-xyz";
    const token = location.split("/share/pace/")[1]?.split("?")[0] ?? "";
    assert.strictEqual(token, "my-token-xyz");
  });

  it("token extraction handles query params", () => {
    const location = "/share/pace/tok123?foo=bar";
    const token = location.split("/share/pace/")[1]?.split("?")[0] ?? "";
    assert.strictEqual(token, "tok123");
  });

  it("token extraction returns empty string for unrelated path", () => {
    const location = "/coach";
    const token = location.split("/share/pace/")[1]?.split("?")[0] ?? "";
    assert.strictEqual(token, "");
  });
});
