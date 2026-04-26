import { describe, it, expect, beforeEach } from "vitest";
import { useAuth, handleAuthEvent } from "@/lib/auth";

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
    expect(useAuth.getState().user).toBe("Alice");
    expect(useAuth.getState().accessToken).toBe("tok");
  });

  it("DOES logout if INITIAL_SESSION/null arrives without any stored token", () => {
    handleAuthEvent("INITIAL_SESSION", null);
    expect(useAuth.getState().user).toBeNull();
    expect(useAuth.getState().isLoaded).toBe(true);
  });

  it("logouts on explicit SIGNED_OUT regardless of stored token", () => {
    localStorage.setItem(
      "sb-fscnobivsgornxdwqwlk-auth-token",
      JSON.stringify({ access_token: "x" }),
    );
    handleAuthEvent("SIGNED_OUT", null);
    expect(useAuth.getState().user).toBeNull();
  });
});
