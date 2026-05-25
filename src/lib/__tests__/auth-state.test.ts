import assert from "node:assert/strict";
import { describe, it, beforeEach, before, after } from "node:test";

// ── Minimal DOM globals (Node has no localStorage/window) ─────────────────
// auth.ts reads `localStorage` (bare) AND `window.localStorage` — both must
// point at the SAME store. hasStoredSupabaseToken() iterates via .length/.key(i),
// so the stub implements the indexed Storage surface too. `window` must be
// defined (typeof window !== "undefined" guards) and expose `location.hash`.
class StorageStub {
  private store = new Map<string, string>();
  get length(): number {
    return this.store.size;
  }
  key(index: number): string | null {
    return Array.from(this.store.keys())[index] ?? null;
  }
  getItem(key: string): string | null {
    return this.store.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.store.set(key, value);
  }
  removeItem(key: string): void {
    this.store.delete(key);
  }
  clear(): void {
    this.store.clear();
  }
}

let restoreGlobals: () => void;
let storage: StorageStub;

before(() => {
  const g = globalThis as Record<string, unknown>;
  const prevLocalStorage = g.localStorage;
  const prevWindow = g.window;
  storage = new StorageStub();
  g.localStorage = storage;
  g.window = { localStorage: storage, location: { hash: "#/" } };
  restoreGlobals = () => {
    g.localStorage = prevLocalStorage;
    g.window = prevWindow;
  };
});

after(() => restoreGlobals());

const { useAuth, handleAuthEvent } = await import("@/lib/auth");

describe("auth — handleAuthEvent", () => {
  beforeEach(() => {
    useAuth.setState({
      user: "Alice",
      userId: 1,
      role: "athlete",
      isApproved: true,
      approvalStatus: "approved",
      isLoaded: true,
      accessToken: "tok",
      refreshToken: "ref",
      selectedAthleteId: null,
      selectedAthleteName: null,
    });
    localStorage.clear();
  });

  it("does NOT logout if INITIAL_SESSION/null arrives with stored Supabase token", () => {
    localStorage.setItem(
      "sb-fscnobivsgornxdwqwlk-auth-token",
      JSON.stringify({ access_token: "x" }),
    );
    handleAuthEvent("INITIAL_SESSION", null);
    assert.equal(useAuth.getState().user, "Alice");
    assert.equal(useAuth.getState().accessToken, "tok");
  });

  it("DOES logout if INITIAL_SESSION/null arrives without any stored token", () => {
    handleAuthEvent("INITIAL_SESSION", null);
    assert.equal(useAuth.getState().user, null);
    assert.equal(useAuth.getState().isLoaded, true);
  });

  it("logouts on explicit SIGNED_OUT regardless of stored token", () => {
    localStorage.setItem(
      "sb-fscnobivsgornxdwqwlk-auth-token",
      JSON.stringify({ access_token: "x" }),
    );
    handleAuthEvent("SIGNED_OUT", null);
    assert.equal(useAuth.getState().user, null);
  });
});
