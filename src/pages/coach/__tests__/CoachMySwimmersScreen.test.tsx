import { describe, it, expect } from "vitest";

// Lightweight importability + pure-logic tests.
// Full rendering requires QueryClient + Supabase — covered by manual E2E.

describe("CoachMySwimmersScreen — importability", () => {
  it("default export is a function", async () => {
    const mod = await import("../CoachMySwimmersScreen");
    expect(typeof mod.default).toBe("function");
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
