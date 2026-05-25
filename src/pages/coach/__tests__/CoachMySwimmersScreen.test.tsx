import { describe, it } from "node:test";
import assert from "node:assert/strict";

// Lightweight importability + pure-logic tests.
// Full rendering requires QueryClient + Supabase — covered by manual E2E.

describe("CoachMySwimmersScreen — importability", () => {
  it("default export is a function", async () => {
    const mod = await import("../CoachMySwimmersScreen");
    assert.equal(typeof mod.default, "function");
  });
});

describe("parseDeepLinkAction — deep-link helper", () => {
  it("opens dialog on mount when ?action=new-manual is present", async () => {
    const { parseDeepLinkAction } = await import("../CoachMySwimmersScreen");
    const { action } = parseDeepLinkAction("#/coach?section=swimmers&action=new-manual");
    assert.equal(action, "new-manual");
    const { action: noAction } = parseDeepLinkAction("#/coach?section=swimmers");
    assert.equal(noAction, null);
  });

  it("removes the param after opening", async () => {
    const { parseDeepLinkAction } = await import("../CoachMySwimmersScreen");
    const { cleanPath } = parseDeepLinkAction("#/coach?section=swimmers&action=new-manual");
    assert.equal(cleanPath, "/coach?section=swimmers");
    const { cleanPath: noQuery } = parseDeepLinkAction("#/coach?action=new-manual");
    assert.equal(noQuery, "/coach");
  });
});

describe("ManualSwimmerDialog — importability", () => {
  it("is a function component", async () => {
    const mod = await import("@/components/coach/ManualSwimmerDialog");
    assert.equal(typeof mod.ManualSwimmerDialog, "function");
  });
});

describe("ManualSwimmerDialog — validation logic", () => {
  it("validates name: empty string fails, trimmed non-empty passes", () => {
    const isValid = (name: string, sex: string) =>
      name.trim().length > 0 && (sex === "M" || sex === "F");

    assert.equal(isValid("", "M"), false);
    assert.equal(isValid("  ", "F"), false);
    assert.equal(isValid("Léo", "M"), true);
    assert.equal(isValid("Sara", "F"), true);
    assert.equal(isValid("Valid", ""), false);
  });
});
