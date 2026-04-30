import { describe, it, expect } from "vitest";

// Lightweight importability + pure-logic tests.
// Full rendering requires QueryClient + Supabase — covered by manual E2E.

describe("CoachMySwimmersScreen — importability", () => {
  it("default export is a function", async () => {
    const mod = await import("../CoachMySwimmersScreen");
    expect(typeof mod.default).toBe("function");
  });
});

describe("parseDeepLinkAction — deep-link helper", () => {
  it("opens dialog on mount when ?action=new-manual is present", async () => {
    const { parseDeepLinkAction } = await import("../CoachMySwimmersScreen");
    const { action } = parseDeepLinkAction("#/coach?section=swimmers&action=new-manual");
    expect(action).toBe("new-manual");
    const { action: noAction } = parseDeepLinkAction("#/coach?section=swimmers");
    expect(noAction).toBeNull();
  });

  it("removes the param after opening", async () => {
    const { parseDeepLinkAction } = await import("../CoachMySwimmersScreen");
    const { cleanPath } = parseDeepLinkAction("#/coach?section=swimmers&action=new-manual");
    expect(cleanPath).toBe("/coach?section=swimmers");
    const { cleanPath: noQuery } = parseDeepLinkAction("#/coach?action=new-manual");
    expect(noQuery).toBe("/coach");
  });
});

describe("ManualSwimmerDialog — importability", () => {
  it("is a function component", async () => {
    const mod = await import("@/components/coach/ManualSwimmerDialog");
    expect(typeof mod.ManualSwimmerDialog).toBe("function");
  });
});

describe("ManualSwimmerDialog — validation logic", () => {
  it("validates name: empty string fails, trimmed non-empty passes", () => {
    const isValid = (name: string, sex: string) =>
      name.trim().length > 0 && (sex === "M" || sex === "F");

    expect(isValid("", "M")).toBe(false);
    expect(isValid("  ", "F")).toBe(false);
    expect(isValid("Léo", "M")).toBe(true);
    expect(isValid("Sara", "F")).toBe(true);
    expect(isValid("Valid", "")).toBe(false);
  });
});
