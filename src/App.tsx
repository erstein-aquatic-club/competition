
import React, { Suspense, lazy, useState, useEffect } from "react";
import { Switch, Route, Redirect, Router } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useAuth, handlePasswordReset } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { AppLayout } from "@/components/layout/AppLayout";
import { FEATURES } from "@/lib/features";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ErrorBoundary } from "@/components/shared/ErrorBoundary";
import { PageSkeleton } from "@/components/shared/PageSkeleton";
import { UpdateNotification } from "@/components/shared/UpdateNotification";
import { PWAInstallGate } from "@/components/shared/PWAInstallGate";
import { PushPermissionBanner } from "@/components/shared/PushPermissionBanner";
import { requiresApprovalForRole } from "@/lib/authRules";
import { OfflineMutationSync } from "@/components/shared/OfflineMutationSync";

// Retry wrapper for lazy imports — handles stale chunk filenames after deployments
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function lazyWithRetry(factory: () => Promise<{ default: React.ComponentType<any> }>) {
  return lazy(() =>
    factory().catch((err: unknown) => {
      // If chunk loading fails (e.g. stale cache pointing to old filename),
      // try a full page reload once to get fresh index.html
      const hasReloaded = sessionStorage.getItem('chunk_reload');
      if (!hasReloaded) {
        sessionStorage.setItem('chunk_reload', '1');
        window.location.reload();
        // Return a never-resolving promise to prevent rendering while reloading
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return new Promise<{ default: React.ComponentType<any> }>(() => {});
      }
      sessionStorage.removeItem('chunk_reload');
      throw err;
    })
  );
}

// Clear the reload flag on successful app load
sessionStorage.removeItem('chunk_reload');

// Fallback version check — bypasses SW entirely for stuck PWA installs.
// Fetches a tiny version file (cache-busted) and reloads if build differs.
const VERSION_CHECK_INTERVAL_MS = 30 * 60 * 1000; // 30 minutes

function useVersionCheck() {
  useEffect(() => {
    const currentBuild = (window as any).__eacBuildTimestamp as string | undefined;
    if (!currentBuild) return;

    const checkVersion = async () => {
      try {
        // Fetch version.json with cache-busting query to bypass SW + HTTP cache
        const res = await fetch(`${import.meta.env.BASE_URL}version.json?_=${Date.now()}`, {
          cache: 'no-store',
        });
        if (!res.ok) return;
        const { build } = await res.json();
        if (build && build !== currentBuild) {
          console.log(`[EAC] Version mismatch: running ${currentBuild}, server has ${build}. Reloading…`);
          // Clear all caches then reload
          if ('caches' in window) {
            const keys = await caches.keys();
            await Promise.all(keys.map((k) => caches.delete(k)));
          }
          window.location.reload();
        }
      } catch { /* offline or fetch error — ignore */ }
    };

    // Check on mount + periodically + on visibility change
    const timeout = setTimeout(checkVersion, 5_000); // 5s after app load
    const interval = setInterval(checkVersion, VERSION_CHECK_INTERVAL_MS);
    const onVisible = () => {
      if (document.visibilityState === 'visible') checkVersion();
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      clearTimeout(timeout);
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);
}

// Lazy load all pages for code splitting (with retry for stale chunks)
const Login = lazyWithRetry(() => import("@/pages/Login"));
const LoginDebug = lazyWithRetry(() => import("@/pages/LoginDebug"));
const Dashboard = lazyWithRetry(() => import("@/pages/Dashboard"));
const Progress = lazyWithRetry(() => import("@/pages/Progress"));
const HallOfFame = lazyWithRetry(() => import("@/pages/HallOfFame"));
const Coach = lazyWithRetry(() => import("@/pages/Coach"));
const Admin = lazyWithRetry(() => import("@/pages/Admin"));
const Administratif = lazyWithRetry(() => import("@/pages/Administratif"));
const Comite = lazyWithRetry(() => import("@/pages/Comite"));
const Strength = lazyWithRetry(() => import("@/pages/Strength"));
const Suivi = lazyWithRetry(() => import("@/pages/Suivi"));
const SuiviSemaine = lazyWithRetry(() => import("@/pages/SuiviSemaine"));
const SuiviSaison = lazyWithRetry(() => import("@/pages/SuiviSaison"));
const SuiviProgression = lazyWithRetry(() => import("@/pages/SuiviProgression"));
const SuiviEntretiens = lazyWithRetry(() => import("@/pages/SuiviEntretiens"));
const Profile = lazyWithRetry(() => import("@/pages/Profile"));
const Records = lazyWithRetry(() => import("@/pages/Records"));
const RecordsAdmin = lazyWithRetry(() => import("@/pages/RecordsAdmin"));
const RecordsClub = lazyWithRetry(() => import("@/pages/RecordsClub"));
const SwimSessionView = lazyWithRetry(() => import("@/pages/SwimSessionView"));
const SharedSwimSession = lazyWithRetry(() => import("@/pages/SharedSwimSession"));
const CoachSwimmerDetail = lazyWithRetry(() => import("@/pages/coach/CoachSwimmerDetail"));
const SwimPlanningDemo = lazyWithRetry(() => import("@/pages/coach/SwimPlanningDemo"));
const CompetitionDetail = lazyWithRetry(() => import("@/pages/CompetitionDetail"));
const SwimNotes = lazyWithRetry(() => import("@/pages/SwimNotes"));
const MonthlyReport = lazyWithRetry(() => import("@/pages/MonthlyReport"));
const SwimmerHome = lazyWithRetry(() => import("@/pages/SwimmerHome"));
const ComingSoon = lazyWithRetry(() => import("@/pages/ComingSoon"));
const AwaitingApproval = lazyWithRetry(() => import("@/pages/AwaitingApproval"));
const NotFound = lazyWithRetry(() => import("@/pages/not-found"));

// Loading fallback for lazy components (kept for backward compatibility)
function PageLoader() {
  return (
    <div className="flex items-center justify-center min-h-[50vh]">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
    </div>
  );
}

const useHashLocation = (): [string, (to: string, options?: { replace?: boolean }) => void] => {
  const getHashPath = () => {
    const hash = window.location.hash || "#/";
    const full = hash.replace(/^#/, "") || "/";
    return full.split("?")[0] || "/";
  };

  const [path, setPath] = React.useState(getHashPath);

  React.useEffect(() => {
    const onHashChange = () => setPath(getHashPath());
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  const navigate = React.useCallback((to: string, options?: { replace?: boolean }) => {
    const target = to.startsWith("/") ? `#${to}` : `#/${to}`;
    if (options?.replace) {
      window.location.replace(target);
    } else {
      window.location.hash = target;
    }
  }, []);

  return [path, navigate];
};

function ResetPassword() {
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword.length < 6) {
      setError("Le mot de passe doit contenir au moins 6 caractères.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("Les mots de passe ne correspondent pas.");
      return;
    }
    setLoading(true);
    setError(null);
    const result = await handlePasswordReset(newPassword);
    if (result.error) {
      setError(result.error);
      setLoading(false);
    } else {
      setSuccess(true);
      setLoading(false);
      setTimeout(() => {
        window.location.hash = "#/";
      }, 2000);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-background">
      <Card className="w-full max-w-sm shadow-2xl">
        <CardHeader className="text-center">
          <CardTitle className="text-xl">Nouveau mot de passe</CardTitle>
        </CardHeader>
        <CardContent>
          {success ? (
            <div className="text-center space-y-4">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-muted">
                <span className="text-3xl text-primary">&#10003;</span>
              </div>
              <p className="text-sm font-medium">Mot de passe modifié avec succès</p>
              <p className="text-xs text-muted-foreground">Redirection en cours...</p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="new-password">Nouveau mot de passe</Label>
                <Input
                  id="new-password"
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Nouveau mot de passe"
                  required
                  autoFocus
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirm-password">Confirmer le mot de passe</Label>
                <Input
                  id="confirm-password"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Confirmer le mot de passe"
                  required
                />
              </div>
              {error ? (
                <div className="rounded-lg border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive text-center">
                  {error}
                </div>
              ) : null}
              <Button
                type="submit"
                className="w-full"
                disabled={!newPassword || !confirmPassword || loading}
              >
                {loading ? "Modification..." : "Modifier le mot de passe"}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function AppRouter() {
  const user = useAuth((s) => s.user);
  const role = useAuth((s) => s.role);
  const isApproved = useAuth((s) => s.isApproved);
  const approvalStatus = useAuth((s) => s.approvalStatus);
  const isLoaded = useAuth((s) => s.isLoaded);

  if (!isLoaded) {
    return <PageSkeleton />;
  }

  if (!user) {
    return (
      <ErrorBoundary>
        <Suspense fallback={<PageSkeleton />}>
          <Switch>
            <Route path="/reset-password" component={ResetPassword} />
            <Route path="/login-debug" component={LoginDebug} />
            <Route path="/s/:token" component={SharedSwimSession} />
            <Route path="/" component={Login} />
            <Route path="/:rest*" component={() => <Redirect to="/" />} />
          </Switch>
        </Suspense>
      </ErrorBoundary>
    );
  }

  if (user && requiresApprovalForRole(role) && approvalStatus !== "approved") {
    return (
      <ErrorBoundary>
        <Suspense fallback={<PageSkeleton />}>
          <AwaitingApproval mode={isApproved === false ? "pending" : "verification-error"} />
        </Suspense>
      </ErrorBoundary>
    );
  }

  return (
    <AppLayout>
      <ErrorBoundary>
        <Suspense fallback={<PageSkeleton />}>
          <Switch>
            <Route path="/reset-password" component={ResetPassword} />
            <Route path="/">{role === "coach" || role === "admin" ? <Redirect to="/coach" /> : <SwimmerHome />}</Route>
            <Route path="/natation" component={Dashboard} />
            <Route path="/progress">{() => { window.location.hash = "#/suivi/progression"; return null; }}</Route>
            <Route path="/hall-of-fame" component={FEATURES.hallOfFame ? HallOfFame : ComingSoon} />
            <Route path="/competition/:id" component={CompetitionDetail} />
            <Route path="/coach/swimmer/:id" component={CoachSwimmerDetail} />
            <Route path="/coach/swim-planning" component={SwimPlanningDemo} />
            <Route path="/coach" component={Coach} />
            <Route path="/admin" component={Admin} />
            <Route path="/administratif" component={Administratif} />
            <Route path="/comite" component={Comite} />
            <Route path="/strength" component={FEATURES.strength ? Strength : ComingSoon} />
            <Route path="/records" component={Records} />
            <Route path="/records-admin" component={RecordsAdmin} />
            <Route path="/records-club" component={RecordsClub} />
            <Route path="/swim-session" component={SwimSessionView} />
            <Route path="/swim-notes" component={SwimNotes} />
            <Route path="/s/:token" component={SharedSwimSession} />
            <Route path="/report/:userId/:month" component={MonthlyReport} />
            <Route path="/suivi/semaine" component={SuiviSemaine} />
            <Route path="/suivi/saison" component={SuiviSaison} />
            <Route path="/suivi/progression" component={SuiviProgression} />
            <Route path="/suivi/entretiens" component={SuiviEntretiens} />
            <Route path="/suivi" component={Suivi} />
            <Route path="/profile" component={Profile} />
            <Route path="/coming-soon" component={ComingSoon} />
            <Route component={NotFound} />
          </Switch>
        </Suspense>
      </ErrorBoundary>
    </AppLayout>
  );
}

function useDarkMode() {
  const [userPref, setUserPref] = useState<string | null>(() =>
    localStorage.getItem("eac-theme")
  );

  // Listen for localStorage changes (from Profile toggle)
  useEffect(() => {
    const handler = () => setUserPref(localStorage.getItem("eac-theme"));
    window.addEventListener("eac-theme-change", handler);
    return () => window.removeEventListener("eac-theme-change", handler);
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    const mode = userPref ?? "light";

    let cleanup: (() => void) | undefined;

    if (mode === "dark") {
      root.classList.add("dark");
    } else if (mode === "system") {
      const mql = window.matchMedia("(prefers-color-scheme: dark)");
      root.classList.toggle("dark", mql.matches);
      const handler = (e: MediaQueryListEvent) =>
        root.classList.toggle("dark", e.matches);
      mql.addEventListener("change", handler);
      cleanup = () => mql.removeEventListener("change", handler);
    } else {
      root.classList.remove("dark");
    }

    return () => {
      cleanup?.();
    };
  }, [userPref]);
}

/** Applies dark_mode setting from app_settings. Must be inside QueryClientProvider. */
function DarkModeApplier() {
  useDarkMode();
  return null;
}

function App() {
  const { loadUser } = useAuth();
  useVersionCheck();

  React.useEffect(() => {
    void loadUser();
  }, [loadUser]);

  // Detect Supabase recovery tokens in the URL hash
  useEffect(() => {
    const hash = window.location.hash;
    if (hash && hash.includes('type=recovery')) {
      // Supabase puts tokens as: #access_token=...&refresh_token=...&type=recovery
      // Remove leading '#' for URLSearchParams parsing
      const rawParams = hash.substring(1);
      const params = new URLSearchParams(rawParams);
      const accessToken = params.get('access_token');
      const refreshToken = params.get('refresh_token');
      const type = params.get('type');

      if (type === 'recovery' && accessToken && refreshToken) {
        supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        }).then(({ error }) => {
          if (!error) {
            window.location.hash = '#/reset-password';
          }
        });
      }
    }
  }, []);

  return (
    <PWAInstallGate>
      <QueryClientProvider client={queryClient}>
        <DarkModeApplier />
        <TooltipProvider>
          <UpdateNotification />
          <OfflineMutationSync />
          <PushPermissionBanner />
          <Toaster />
          <Router hook={useHashLocation}>
            <AppRouter />
          </Router>
        </TooltipProvider>
      </QueryClientProvider>
    </PWAInstallGate>
  );
}

export default App;
