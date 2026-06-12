
import React, { Suspense, useState, useEffect } from "react";
import { Switch, Route, Redirect, Router } from "wouter";
import { queryClient } from "./lib/queryClient";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { createSyncStoragePersister } from "@tanstack/query-sync-storage-persister";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useAuth } from "@/lib/auth";
import { getGroups } from "@/lib/api";
import { supabase } from "@/lib/supabase";
import { AppLayout } from "@/components/layout/AppLayout";
import { ErrorBoundary } from "@/components/shared/ErrorBoundary";
import { PageSkeleton } from "@/components/shared/PageSkeleton";
import {
  DashboardSkeleton,
  HomeSkeleton,
  CalendarSkeleton,
  ListSkeleton,
} from "@/components/shared/skeletons";
import { PWAInstallGate } from "@/components/shared/PWAInstallGate";
import { requiresApprovalForRole } from "@/lib/authRules";
import { lazyWithRetry } from "@/lib/lazyWithRetry";
import { useInAppPushBridge } from "@/hooks/useInAppPushBridge";
import { usePushSubscriptionRefresh } from "@/hooks/usePushSubscriptionRefresh";

// Clear the reload flag on successful app load
sessionStorage.removeItem('chunk_reload');

// §248 — React Query cache persistence (Chantier A sub-§A audit perf pass 1).
// Survives reloads — critical for offline PWA: without this, a cold start
// offline shows blank surfaces because the in-memory cache is empty.
// `buster` ties cache to the current build → automatic invalidation on deploy
// when the schema/types change.
declare const __BUILD_TIMESTAMP__: string;
const rqPersister =
  typeof window !== "undefined"
    ? createSyncStoragePersister({
        storage: window.localStorage,
        key: "eac-rq-cache",
      })
    : undefined;
const rqPersistOptions = rqPersister
  ? {
      persister: rqPersister,
      maxAge: 24 * 60 * 60 * 1000, // 24h
      buster: __BUILD_TIMESTAMP__,
      dehydrateOptions: {
        // Skip queries in error/pending state — persist only successful data.
        shouldDehydrateQuery: (query: { state: { status: string } }) =>
          query.state.status === "success",
      },
    }
  : null;

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

    // Check on mount (5s delay) + periodically every 30 min.
    // Do NOT check on visibilitychange: it causes window.location.reload()
    // every time the app returns from background, resulting in a blank page.
    const timeout = setTimeout(checkVersion, 5_000);
    const interval = setInterval(checkVersion, VERSION_CHECK_INTERVAL_MS);

    return () => {
      clearTimeout(timeout);
      clearInterval(interval);
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
const KpiWizard = lazyWithRetry(() => import("@/pages/KpiWizard"));
const StrengthQuestionnaire = lazyWithRetry(() => import("@/pages/StrengthQuestionnaire"));
const MesocycleGeneration = lazyWithRetry(() => import("@/pages/MesocycleGeneration"));
const MesocyclePreview = lazyWithRetry(() => import("@/pages/MesocyclePreview"));
const MesocycleAdjust = lazyWithRetry(() => import("@/pages/MesocycleAdjust"));
const Suivi = lazyWithRetry(() => import("@/pages/Suivi"));
const SuiviSemaine = lazyWithRetry(() => import("@/pages/SuiviSemaine"));
const SuiviPlanification = lazyWithRetry(() => import("@/pages/SuiviPlanification"));
const SuiviObjectifs = lazyWithRetry(() => import("@/pages/SuiviObjectifs"));
const SuiviProgression = lazyWithRetry(() => import("@/pages/SuiviProgression"));
const SuiviEntretiens = lazyWithRetry(() => import("@/pages/SuiviEntretiens"));
const Profile = lazyWithRetry(() => import("@/pages/Profile"));
const Records = lazyWithRetry(() => import("@/pages/Records"));
const RecordsAdmin = lazyWithRetry(() => import("@/pages/RecordsAdmin"));
const RecordsClub = lazyWithRetry(() => import("@/pages/RecordsClub"));
const SwimSessionView = lazyWithRetry(() => import("@/pages/SwimSessionView"));
const SharedSwimSession = lazyWithRetry(() => import("@/pages/SharedSwimSession"));
const SharedPaceMatrix = lazyWithRetry(() => import("@/pages/SharedPaceMatrix"));
const CoachSwimmerDetail = lazyWithRetry(() => import("@/pages/coach/CoachSwimmerDetail"));
const SwimPlanningDemo = lazyWithRetry(() => import("@/pages/coach/SwimPlanningDemo"));
const StrengthPlanningScreen = lazyWithRetry(() => import("@/pages/coach/StrengthPlanningScreen"));
const AthleteCycleJourney = lazyWithRetry(() => import("@/pages/coach/AthleteCycleJourney"));
const StrengthAssessmentScreen = lazyWithRetry(() => import("@/pages/coach/StrengthAssessmentScreen"));
const CompetitionPrep = lazyWithRetry(() => import("@/pages/CompetitionPrep"));
const CompetitionDetail = lazyWithRetry(() => import("@/pages/CompetitionDetail"));
const SwimNotes = lazyWithRetry(() => import("@/pages/SwimNotes"));
const MonthlyReport = lazyWithRetry(() => import("@/pages/MonthlyReport"));
const SwimmerHome = lazyWithRetry(() => import("@/pages/SwimmerHome"));
const ComingSoon = lazyWithRetry(() => import("@/pages/ComingSoon"));
const AwaitingApproval = lazyWithRetry(() => import("@/pages/AwaitingApproval"));
const NotFound = lazyWithRetry(() => import("@/pages/not-found"));
const ResetPassword = lazyWithRetry(() => import("@/pages/ResetPassword"));

// §377 — bannières/sync non critiques au premier rendu, lazy-loadées pour
// sortir leurs dépendances du chunk principal (UpdateNotification tire
// useStrengthState, OfflineMutationSync tire offlineSync + l'API).
const UpdateNotification = lazyWithRetry(() =>
  import("@/components/shared/UpdateNotification").then((m) => ({ default: m.UpdateNotification })),
);
const OfflineMutationSync = lazyWithRetry(() =>
  import("@/components/shared/OfflineMutationSync").then((m) => ({ default: m.OfflineMutationSync })),
);
const PushPermissionBanner = lazyWithRetry(() =>
  import("@/components/shared/PushPermissionBanner").then((m) => ({ default: m.PushPermissionBanner })),
);

/**
 * §377 — monte les bannières/sync APRÈS le premier paint (1 s) : leur chunk ne
 * concurrence pas le chargement de la route initiale. Le différé ne change pas
 * leur comportement : check SW périodique (UpdateNotification), cooldown 7 j
 * (PushPermissionBanner), replay de la queue offline déclenché au mount ou au
 * retour réseau (OfflineMutationSync).
 */
function DeferredBootExtras() {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const id = window.setTimeout(() => setReady(true), 1_000);
    return () => window.clearTimeout(id);
  }, []);
  if (!ready) return null;
  return (
    <Suspense fallback={null}>
      <UpdateNotification />
      <OfflineMutationSync />
      <PushPermissionBanner />
    </Suspense>
  );
}

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
            <Route path="/share/pace/:token" component={SharedPaceMatrix} />
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
            <Route path="/">
              {role === "coach" || role === "admin" ? (
                <Redirect to="/coach" />
              ) : (
                <Suspense fallback={<HomeSkeleton />}>
                  <SwimmerHome />
                </Suspense>
              )}
            </Route>
            <Route path="/natation">
              <Suspense fallback={<DashboardSkeleton />}>
                <Dashboard />
              </Suspense>
            </Route>
            <Route path="/progress"><Redirect to="/suivi/progression" /></Route>
            <Route path="/hall-of-fame" component={HallOfFame} />
            <Route path="/competition/:id/prep" component={CompetitionPrep} />
            <Route path="/competition/:id" component={CompetitionDetail} />
            <Route path="/coach/swimmer/:id" component={CoachSwimmerDetail} />
            <Route path="/coach/swim-planning">
              <Suspense fallback={<CalendarSkeleton />}>
                <SwimPlanningDemo />
              </Suspense>
            </Route>
            <Route path="/coach/strength-planning">
              <Suspense fallback={<CalendarSkeleton />}>
                <StrengthPlanningScreen />
              </Suspense>
            </Route>
            <Route path="/coach/strength-cycle/:athleteId">
              <Suspense fallback={<ListSkeleton />}>
                <AthleteCycleJourney />
              </Suspense>
            </Route>
            <Route path="/coach/strength-assessment/:athleteId">
              <Suspense fallback={<ListSkeleton />}>
                <StrengthAssessmentScreen />
              </Suspense>
            </Route>
            <Route path="/coach/strength-assessment">
              <Suspense fallback={<ListSkeleton />}>
                <StrengthAssessmentScreen />
              </Suspense>
            </Route>
            <Route path="/coach">
              <Suspense fallback={<HomeSkeleton />}>
                <Coach />
              </Suspense>
            </Route>
            <Route path="/admin" component={Admin} />
            <Route path="/administratif" component={Administratif} />
            <Route path="/comite" component={Comite} />
            <Route path="/coach/kpi-wizard/:athleteId">
              <Suspense fallback={<ListSkeleton />}>
                <KpiWizard />
              </Suspense>
            </Route>
            <Route path="/strength/kpi-wizard">
              <Suspense fallback={<ListSkeleton />}>
                <KpiWizard />
              </Suspense>
            </Route>
            <Route path="/strength/questionnaire">
              <Suspense fallback={<ListSkeleton />}>
                <StrengthQuestionnaire />
              </Suspense>
            </Route>
            <Route path="/coach/questionnaire/:athleteId">
              <Suspense fallback={<ListSkeleton />}>
                <StrengthQuestionnaire />
              </Suspense>
            </Route>
            <Route path="/strength/mesocycle-generate">
              <Suspense fallback={<ListSkeleton />}>
                <MesocycleGeneration />
              </Suspense>
            </Route>
            <Route path="/coach/mesocycle-generate/:athleteId">
              <Suspense fallback={<ListSkeleton />}>
                <MesocycleGeneration />
              </Suspense>
            </Route>
            <Route path="/strength/mesocycle-preview">
              <Suspense fallback={<ListSkeleton />}>
                <MesocyclePreview />
              </Suspense>
            </Route>
            <Route path="/strength/mesocycle-adjust/:athleteId">
              <Suspense fallback={<ListSkeleton />}>
                <MesocycleAdjust />
              </Suspense>
            </Route>
            <Route path="/strength">
              <Suspense fallback={<ListSkeleton />}>
                <Strength />
              </Suspense>
            </Route>
            <Route path="/records">
              <Suspense fallback={<ListSkeleton />}>
                <Records />
              </Suspense>
            </Route>
            <Route path="/records-admin">
              <Suspense fallback={<ListSkeleton />}>
                <RecordsAdmin />
              </Suspense>
            </Route>
            <Route path="/records-club">
              <Suspense fallback={<ListSkeleton />}>
                <RecordsClub />
              </Suspense>
            </Route>
            <Route path="/swim-session" component={SwimSessionView} />
            <Route path="/swim-notes" component={SwimNotes} />
            <Route path="/s/:token" component={SharedSwimSession} />
            <Route path="/share/pace/:token" component={SharedPaceMatrix} />
            <Route path="/report/:userId/:month" component={MonthlyReport} />
            <Route path="/suivi/semaine">
              <Suspense fallback={<ListSkeleton />}>
                <SuiviSemaine />
              </Suspense>
            </Route>
            <Route path="/suivi/objectifs">
              <Suspense fallback={<ListSkeleton />}>
                <SuiviObjectifs />
              </Suspense>
            </Route>
            <Route path="/suivi/saison">
              <Suspense fallback={<ListSkeleton />}>
                <SuiviPlanification />
              </Suspense>
            </Route>
            <Route path="/suivi/progression">
              <Suspense fallback={<ListSkeleton />}>
                <SuiviProgression />
              </Suspense>
            </Route>
            <Route path="/suivi/entretiens">
              <Suspense fallback={<ListSkeleton />}>
                <SuiviEntretiens />
              </Suspense>
            </Route>
            <Route path="/suivi">
              <Suspense fallback={<ListSkeleton />}>
                <Suivi />
              </Suspense>
            </Route>
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

/**
 * Bridge for foreground push notifications from Service Worker.
 * Displays in-app toasts and invalidates query cache.
 */
function PushBridge() {
  useInAppPushBridge();
  usePushSubscriptionRefresh();
  return null;
}

/**
 * Warms React Query cache with pivot queries right after login. Fire-and-forget :
 * a failed prefetch cannot break any render path, and the existing `useQuery`
 * calls will pick up the cached data transparently on first mount.
 */
function CacheWarmer() {
  const userId = useAuth((s) => s.userId);
  useEffect(() => {
    if (!userId) return;
    void queryClient
      .prefetchQuery({
        queryKey: ["groups"],
        queryFn: () => getGroups(),
        staleTime: 10 * 60 * 1000,
      })
      .catch(() => {});
  }, [userId]);
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

  const queryProviderContent = (
    <>
      <DarkModeApplier />
      <CacheWarmer />
      <PushBridge />
      <TooltipProvider>
        <DeferredBootExtras />
        <Toaster />
        <Router hook={useHashLocation}>
          <AppRouter />
        </Router>
      </TooltipProvider>
    </>
  );

  return (
    <PWAInstallGate>
      {rqPersistOptions ? (
        <PersistQueryClientProvider
          client={queryClient}
          persistOptions={rqPersistOptions}
        >
          {queryProviderContent}
        </PersistQueryClientProvider>
      ) : (
        // SSR fallback (jamais utilisé en pratique côté Vite SPA, défensif).
        <PersistQueryClientProvider
          client={queryClient}
          persistOptions={{ persister: rqPersister! }}
        >
          {queryProviderContent}
        </PersistQueryClientProvider>
      )}
    </PWAInstallGate>
  );
}

export default App;
