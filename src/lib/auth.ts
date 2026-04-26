import { create } from "zustand";
import { supabase } from "./supabase";
import type { Session, User as SupabaseUser } from "@supabase/supabase-js";
import { requiresApprovalForRole } from "./authRules";

const COACH_SELECTED_ATHLETE_ID_KEY = "coach_selected_athlete_id";
const COACH_SELECTED_ATHLETE_NAME_KEY = "coach_selected_athlete_name";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const readStorageValue = (key: string) => {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(key);
  } catch (error) {
    console.warn(`[auth] Unable to read ${key} from storage`, error);
    return null;
  }
};

const setStorageValue = (key: string, value: string | null) => {
  if (typeof window === "undefined") return;
  try {
    if (value === null) {
      window.localStorage.removeItem(key);
    } else {
      window.localStorage.setItem(key, value);
    }
  } catch (error) {
    console.warn(`[auth] Unable to update ${key} in storage`, error);
  }
};

const readStoredSelectedAthleteId = () => {
  const raw = readStorageValue(COACH_SELECTED_ATHLETE_ID_KEY);
  if (!raw) return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
};

const readStoredSelectedAthleteName = () => {
  const raw = readStorageValue(COACH_SELECTED_ATHLETE_NAME_KEY);
  return raw || null;
};

// ---------------------------------------------------------------------------
// Extract app-level user info from Supabase Auth user
// The custom users.id and role are stored in user_metadata or app_metadata
// set during registration or via a database trigger.
// ---------------------------------------------------------------------------

const extractAppUserId = (supabaseUser: SupabaseUser | null | undefined): number | null => {
  if (!supabaseUser) return null;
  const meta = supabaseUser.app_metadata ?? supabaseUser.user_metadata ?? {};
  const raw = meta.app_user_id ?? meta.user_id;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
};

const extractAppUserRole = (supabaseUser: SupabaseUser | null | undefined): string | null => {
  if (!supabaseUser) return null;
  const meta = supabaseUser.app_metadata ?? supabaseUser.user_metadata ?? {};
  return meta.app_user_role ?? meta.role ?? "athlete";
};

const extractDisplayName = (supabaseUser: SupabaseUser | null | undefined): string | null => {
  if (!supabaseUser) return null;
  const meta = supabaseUser.user_metadata ?? {};
  return meta.display_name ?? meta.full_name ?? supabaseUser.email ?? null;
};

// ---------------------------------------------------------------------------
// Public helpers (used by api.ts)
// ---------------------------------------------------------------------------

/** Returns the current Supabase access token, or empty string if none. */
export const getStoredAccessToken = async (): Promise<string> => {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? "";
};

/** Refreshes the Supabase session and returns the new access token, or null. */
export const refreshStoredAccessToken = async (): Promise<string | null> => {
  const { data, error } = await supabase.auth.refreshSession();
  if (error || !data.session) return null;
  return data.session.access_token;
};

// ---------------------------------------------------------------------------
// Zustand Auth Store
// ---------------------------------------------------------------------------

interface AuthState {
  user: string | null;
  userId: number | null;
  role: string | null;
  isApproved: boolean | null;
  approvalStatus: "not_required" | "approved" | "pending" | "unknown";
  isLoaded: boolean;
  selectedAthleteId: number | null;
  selectedAthleteName: string | null;
  accessToken: string | null;
  refreshToken: string | null;

  /** Called after Supabase login/register to populate store from session */
  loginFromSession: (session: Session) => void;
  /** Legacy login method (kept for compatibility during migration) */
  login: (payload: {
    user: string;
    accessToken: string;
    refreshToken: string;
    userId?: number | null;
    role?: string | null;
  }) => void;
  logout: () => Promise<void>;
  updateAccessToken: (token: string) => void;
  setSelectedAthlete: (athlete: { id: number | null; name: string | null } | null) => void;
  loadUser: () => Promise<string | null>;
}

export const useAuth = create<AuthState>((set) => ({
  user: null,
  userId: null,
  role: null,
  isApproved: null,
  approvalStatus: "unknown",
  isLoaded: false,
  selectedAthleteId: readStoredSelectedAthleteId(),
  selectedAthleteName: readStoredSelectedAthleteName(),
  accessToken: null,
  refreshToken: null,

  loginFromSession: (session: Session) => {
    const supabaseUser = session.user;
    const displayName = extractDisplayName(supabaseUser);
    const userId = extractAppUserId(supabaseUser);
    const role = extractAppUserRole(supabaseUser);
    const requiresApproval = requiresApprovalForRole(role);
    set({
      user: displayName,
      userId,
      role,
      isApproved: requiresApproval ? null : true,
      approvalStatus: requiresApproval ? "unknown" : "not_required",
      isLoaded: false,
      accessToken: session.access_token,
      refreshToken: session.refresh_token,
    });
  },

  login: ({ user, accessToken, refreshToken, userId, role }) => {
    const resolvedRole = role ?? null;
    const requiresApproval = requiresApprovalForRole(resolvedRole);
    set({
      user,
      accessToken,
      refreshToken,
      userId: userId ?? null,
      role: resolvedRole,
      isApproved: requiresApproval ? null : true,
      approvalStatus: requiresApproval ? "unknown" : "not_required",
      isLoaded: true,
    });
  },

  logout: async () => {
    await supabase.auth.signOut();
    setStorageValue(COACH_SELECTED_ATHLETE_ID_KEY, null);
    setStorageValue(COACH_SELECTED_ATHLETE_NAME_KEY, null);
    set({
      user: null,
      userId: null,
      role: null,
      isApproved: null,
      approvalStatus: "not_required",
      isLoaded: true,
      accessToken: null,
      refreshToken: null,
      selectedAthleteId: null,
      selectedAthleteName: null,
    });
  },

  updateAccessToken: (token: string) => {
    set({ accessToken: token });
  },

  setSelectedAthlete: (athlete) => {
    if (!athlete) {
      setStorageValue(COACH_SELECTED_ATHLETE_ID_KEY, null);
      setStorageValue(COACH_SELECTED_ATHLETE_NAME_KEY, null);
      set({ selectedAthleteId: null, selectedAthleteName: null });
      return;
    }
    setStorageValue(
      COACH_SELECTED_ATHLETE_ID_KEY,
      athlete.id !== null && athlete.id !== undefined ? String(athlete.id) : null,
    );
    setStorageValue(COACH_SELECTED_ATHLETE_NAME_KEY, athlete.name ?? null);
    set({ selectedAthleteId: athlete.id ?? null, selectedAthleteName: athlete.name ?? null });
  },

  loadUser: async () => {
    const { data, error } = await supabase.auth.getSession();
    if (error || !data.session) {
      set({
        user: null,
        userId: null,
        role: null,
        isApproved: null,
        approvalStatus: "not_required",
        isLoaded: true,
        accessToken: null,
        refreshToken: null,
      });
      return null;
    }
    let session = data.session;
    let supabaseUser = session.user;
    let displayName = extractDisplayName(supabaseUser);
    let userId = extractAppUserId(supabaseUser);

    // If userId is missing (JWT generated before signup trigger updated app_metadata),
    // force a session refresh to get the latest claims.
    if (!userId) {
      const { data: refreshed } = await supabase.auth.refreshSession();
      if (refreshed.session) {
        session = refreshed.session;
        supabaseUser = session.user;
        displayName = extractDisplayName(supabaseUser);
        userId = extractAppUserId(supabaseUser);
      }
    }

    let role = extractAppUserRole(supabaseUser);
    let isApproved: boolean | null = requiresApprovalForRole(role) ? null : true;
    let approvalStatus: AuthState["approvalStatus"] = requiresApprovalForRole(role)
      ? "unknown"
      : "not_required";

    // Fetch the authoritative role from public.users to handle stale JWT claims.
    // The JWT claim (app_user_role) can be outdated if the role was changed
    // without a subsequent token refresh.
    if (userId) {
      try {
        const { data: dbUser } = await supabase
          .from("users")
          .select("role")
          .eq("id", userId)
          .maybeSingle();
        if (dbUser?.role) {
          role = dbUser.role;
        }
      } catch {
        // Fall back to JWT claim if DB query fails
      }

      // Fetch approval status from user_profiles
      const requiresApproval = requiresApprovalForRole(role);
      isApproved = requiresApproval ? null : true;
      approvalStatus = requiresApproval ? "unknown" : "not_required";

      if (requiresApproval) {
        try {
          const { data: profile, error: profileError } = await supabase
            .from("user_profiles")
            .select("is_approved")
            .eq("user_id", userId)
            .maybeSingle();
          if (profileError) {
            throw profileError;
          }
          if (profile?.is_approved === true) {
            isApproved = true;
            approvalStatus = "approved";
          } else if (profile?.is_approved === false) {
            isApproved = false;
            approvalStatus = "pending";
          } else {
            isApproved = null;
            approvalStatus = "unknown";
          }
        } catch {
          // Keep the gate closed when approval cannot be verified
          isApproved = null;
          approvalStatus = "unknown";
        }
      }
    }

    set({
      user: displayName,
      userId,
      role,
      isApproved,
      approvalStatus,
      isLoaded: true,
      accessToken: session.access_token,
      refreshToken: session.refresh_token,
    });

    return displayName;
  },
}));

// ---------------------------------------------------------------------------
// Password reset helper
// ---------------------------------------------------------------------------

export const handlePasswordReset = async (newPassword: string): Promise<{ error: string | null }> => {
  try {
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) return { error: error.message };
    return { error: null };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Erreur lors de la modification du mot de passe";
    return { error: message };
  }
};

// ---------------------------------------------------------------------------
// Listen to Supabase auth state changes (token refresh, sign-out from
// another tab, etc.) and keep the Zustand store in sync.
// ---------------------------------------------------------------------------

/** Timestamp of last successful token refresh (used by proactive refresh). */
let lastRefreshAt = Date.now();

supabase.auth.onAuthStateChange((event, session) => {
  if (event === "TOKEN_REFRESHED" && session) {
    lastRefreshAt = Date.now();
    startRefreshTimer();
    useAuth.setState({
      accessToken: session.access_token,
      refreshToken: session.refresh_token,
    });
    return;
  }

  if (event === "SIGNED_OUT") {
    stopRefreshTimer();
    setStorageValue(COACH_SELECTED_ATHLETE_ID_KEY, null);
    setStorageValue(COACH_SELECTED_ATHLETE_NAME_KEY, null);
    useAuth.setState({
      user: null,
      userId: null,
      role: null,
      isApproved: null,
      approvalStatus: "not_required",
      isLoaded: true,
      accessToken: null,
      refreshToken: null,
      selectedAthleteId: null,
      selectedAthleteName: null,
    });
    if (typeof window !== "undefined" && window.location.hash !== "#/") {
      window.location.hash = "#/";
    }
    return;
  }

  // All other events (INITIAL_SESSION, SIGNED_IN, PASSWORD_RECOVERY, etc.)
  if (session) {
    const state = useAuth.getState();
    lastRefreshAt = Date.now();
    startRefreshTimer();

    if (state.isLoaded && state.user) {
      // User already loaded (e.g. app returning from background): only update tokens,
      // do NOT reset isLoaded to false — that would blank the UI.
      useAuth.setState({
        accessToken: session.access_token,
        refreshToken: session.refresh_token,
      });
    } else {
      // First load: call loginFromSession then loadUser to complete the profile fetch.
      state.loginFromSession(session);
      state.loadUser().catch(() => {});
    }
  } else {
    useAuth.setState({
      user: null,
      userId: null,
      role: null,
      isApproved: null,
      approvalStatus: "not_required",
      isLoaded: true,
      accessToken: null,
      refreshToken: null,
    });
  }
});


// ---------------------------------------------------------------------------
// Proactive session refresh timer
// Every 60 s, check if the token is older than 55 minutes and refresh it
// preemptively so the user never hits an expired-token error.
// The timer is started on SIGNED_IN / INITIAL_SESSION / TOKEN_REFRESHED and
// stopped on SIGNED_OUT so it doesn't run against an invalid session.
// ---------------------------------------------------------------------------

const REFRESH_CHECK_INTERVAL_MS = 60_000; // 60 seconds
const REFRESH_THRESHOLD_MS = 55 * 60 * 1000; // 55 minutes
/**
 * Number of consecutive proactive-refresh failures before forcing signOut.
 * Lower values previously kicked the swimmer mid-set when the network
 * blipped: a single failed refresh during a workout meant a brutal logout
 * + page redirect to "/". Tolerating up to 3 transient failures keeps the
 * UI alive long enough to reach the next interval (≈ 3 minutes) where the
 * network usually recovers.
 */
const REFRESH_FAILURE_TOLERANCE = 3;

let proactiveRefreshTimer: ReturnType<typeof setInterval> | null = null;
let consecutiveRefreshFailures = 0;

function startRefreshTimer() {
  if (proactiveRefreshTimer) return; // already running
  proactiveRefreshTimer = setInterval(async () => {
    const { accessToken } = useAuth.getState();
    if (!accessToken) return;

    const elapsed = Date.now() - lastRefreshAt;
    if (elapsed < REFRESH_THRESHOLD_MS) return;

    const handleFailure = async (reason: unknown) => {
      consecutiveRefreshFailures += 1;
      console.warn(
        `[auth] Proactive refresh failure #${consecutiveRefreshFailures}/${REFRESH_FAILURE_TOLERANCE}`,
        reason,
      );
      if (consecutiveRefreshFailures >= REFRESH_FAILURE_TOLERANCE) {
        console.warn("[auth] Refresh tolerance exhausted, signing out");
        await supabase.auth.signOut();
      }
      // Below threshold: leave the user logged in. Network may recover before
      // the next tick; if not, we'll escalate. The next REFRESH_THRESHOLD_MS
      // window keeps the existing JWT valid (Supabase tokens last 1h, we
      // refresh at 55 min — there's still ≈ 5 min of slack on first failure).
    };

    try {
      const { data, error } = await supabase.auth.refreshSession();
      if (error || !data.session) {
        await handleFailure(error);
        return;
      }
      // On success, onAuthStateChange TOKEN_REFRESHED handler updates store
      consecutiveRefreshFailures = 0;
    } catch (err) {
      await handleFailure(err);
    }
  }, REFRESH_CHECK_INTERVAL_MS);

  // Prevent the timer from keeping Node / test processes alive
  if (typeof proactiveRefreshTimer === "object" && "unref" in proactiveRefreshTimer) {
    (proactiveRefreshTimer as ReturnType<typeof setInterval>).unref();
  }
}

function stopRefreshTimer() {
  if (proactiveRefreshTimer) {
    clearInterval(proactiveRefreshTimer);
    proactiveRefreshTimer = null;
  }
  consecutiveRefreshFailures = 0;
}
