
import { useLocation } from "wouter";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth";
const eacLogo = `${import.meta.env.BASE_URL}logo-eac.webp`;
import { getNavItemsForRole } from "@/components/layout/navItems";
import { OfflineDetector } from "@/components/shared/OfflineDetector";
import { OfflineBanner } from "@/components/shared/OfflineBanner";
import { OfflineSyncBanner } from "@/components/shared/OfflineSyncBanner";
import { InstallPrompt } from "@/components/shared/InstallPrompt";
import { UserCircle } from "lucide-react";

const COACH_SECTION_LABELS: Record<string, string> = {
  home: "Accueil",
  week: "Semaine",
  swimmers: "Nageurs",
  library: "Bibliothèque",
  athlete: "Fiche nageur",
  groups: "Groupes",
  competitions: "Échéances",
  comms: "Communications",
  chrono: "Chrono",
  "chrono-history": "Historique Chronos",
};

/** Fired when user taps the nav icon for the page they're already on. */
export const NAV_RESET_EVENT = "nav:reset";

/** Fired when the coach section changes via bottom nav. */
export const NAV_SECTION_EVENT = "nav:section";

const getHash = () => window.location.hash || "#/";
const subscribeHash = (cb: () => void) => {
  window.addEventListener("hashchange", cb);
  return () => window.removeEventListener("hashchange", cb);
};

/** Check if a nav item href matches the current hash (supports query params). */
const isNavActive = (hash: string, href: string): boolean => {
  // Full hash path (without leading #), e.g. "/coach?section=swim"
  const full = hash.replace(/^#/, "") || "/";
  const [hrefPath, hrefQuery] = href.split("?");
  const [fullPath, fullQuery] = full.split("?");

  if (fullPath !== hrefPath) return false;

  // Href without query params (e.g. "/coach" = "Plus" button): active only when
  // there's no section param in the current URL
  if (!hrefQuery) return !fullQuery || !new URLSearchParams(fullQuery).has("section");

  // Href with query params: match the section value
  const hrefSection = new URLSearchParams(hrefQuery).get("section");
  const fullSection = fullQuery ? new URLSearchParams(fullQuery).get("section") : null;
  return hrefSection === fullSection;
};

export function AppLayout({ children }: { children: React.ReactNode }) {
  const [location, navigate] = useLocation();
  const hash = useSyncExternalStore(subscribeHash, getHash);
  const role = useAuth((s) => s.role);
  const [isFocusMode, setIsFocusMode] = useState(false);
  const mainRef = useRef<HTMLElement>(null);
  const navItems = getNavItemsForRole(role);

  const scrollToTop = useCallback(() => {
    mainRef.current?.scrollTo(0, 0);
  }, []);

  const handleNavClick = useCallback((href: string) => {
    const [hrefPath, hrefQuery] = href.split("?");
    const alreadyActive = isNavActive(hash, href);

    if (alreadyActive) {
      // Already on this page — reset internal state (but not section)
      // Only dispatch reset for items without a section query param;
      // section items just scroll to top to avoid losing the current page.
      if (!hrefQuery || !new URLSearchParams(hrefQuery).has("section")) {
        window.dispatchEvent(new CustomEvent(NAV_RESET_EVENT));
      }
      scrollToTop();
    } else if (location === hrefPath) {
      // Same base route (e.g. /coach) but different section — update hash
      // and notify Coach.tsx via custom event
      if (hrefQuery) {
        const section = new URLSearchParams(hrefQuery).get("section");
        window.location.hash = `#${href}`;
        if (section) {
          window.dispatchEvent(new CustomEvent(NAV_SECTION_EVENT, { detail: section }));
        }
      } else {
        // No query param (e.g. Home button) — reset to base section
        window.location.hash = `#${hrefPath}`;
        window.dispatchEvent(new CustomEvent(NAV_RESET_EVENT));
      }
      scrollToTop();
    } else {
      navigate(href);
    }
  }, [hash, location, navigate, scrollToTop]);

  useEffect(() => {
    scrollToTop();
  }, [location, scrollToTop]);

  useEffect(() => {
    if (typeof document === "undefined") return;
    const updateFocusMode = () => {
      setIsFocusMode(document.body.dataset.focusMode === "strength");
    };
    updateFocusMode();
    const observer = new MutationObserver(updateFocusMode);
    observer.observe(document.body, { attributes: true, attributeFilter: ["data-focus-mode"] });
    return () => observer.disconnect();
  }, []);

  return (
    <div className="flex flex-col h-[100dvh] bg-background md:pt-16">
      <OfflineBanner />
      <OfflineSyncBanner />
      <OfflineDetector />
      <InstallPrompt />
      {/* Desktop Top Nav */}
      <header className="hidden md:flex fixed top-0 w-full h-16 border-b bg-card/95 backdrop-blur z-nav items-center px-8 justify-between shadow-sm">
        <div className="flex items-center gap-2">
            <img
              src={eacLogo}
              alt="Logo EAC"
              className="h-8 w-8 rounded-full border-2 border-black object-cover"
            />
            <div className="font-display font-bold text-2xl text-foreground italic tracking-tighter">
            SUIVI<span className="text-primary">NATATION</span>
            </div>
        </div>
        <nav aria-label="Navigation principale" className="flex gap-6">
          {navItems.map((item) => {
            const active = isNavActive(hash, item.href);
            return (
              <button
                key={item.href}
                type="button"
                aria-current={active ? "page" : undefined}
                onClick={() => handleNavClick(item.href)}
                className={cn(
                  "flex items-center gap-2 text-sm font-bold uppercase transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 rounded-sm",
                  active ? "text-primary border-b-2 border-primary" : "text-muted-foreground"
                )}
              >
                <item.icon className="h-4 w-4" />
                {item.label}
              </button>
            );
          })}
        </nav>
      </header>

      {/* Main Content — scrollable area */}
      <main ref={mainRef} className="flex-1 overflow-y-auto overscroll-none">
        <div className="container max-w-lg mx-auto p-4 pb-4 md:max-w-3xl lg:max-w-5xl xl:max-w-6xl">
          {/* Coach Header — section title (only on /coach route) */}
          {(role === "coach" || role === "admin") && location === "/coach" && (() => {
            const hashSection = hash.match(/[?&]section=([^&]+)/)?.[1] || "home";
            const sectionLabel = COACH_SECTION_LABELS[hashSection] || hashSection;
            return (
              <div className="sticky top-0 z-10 -mx-4 -mt-4 mb-3 flex items-center justify-between bg-background/95 backdrop-blur px-4 py-2 border-b border-border/40">
                <span className="text-sm font-semibold text-foreground">{sectionLabel}</span>
                <button
                  type="button"
                  onClick={() => handleNavClick("/profile")}
                  className="h-9 w-9 rounded-full border border-border/50 flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                  aria-label="Profil"
                >
                  <UserCircle className="h-5 w-5" />
                </button>
              </div>
            );
          })()}
          {children}
        </div>
      </main>

      {/* Mobile Bottom Nav - static in flex layout, no more position:fixed */}
      <nav
        aria-label="Navigation principale"
        className={cn(
          "md:hidden shrink-0 bg-card/95 backdrop-blur-lg border-t border-border/50 z-mobilenav shadow-[0_-4px_20px_-4px_rgba(0,0,0,0.1)]",
          "supports-[padding:env(safe-area-inset-bottom)]:pb-[env(safe-area-inset-bottom)]",
          isFocusMode && "hidden",
        )}
      >
        <div className="flex items-stretch justify-evenly h-16 overflow-x-auto scrollbar-hide">
          {navItems.map((item) => {
            const active = isNavActive(hash, item.href);
            return (
              <button
                key={item.href}
                type="button"
                aria-current={active ? "page" : undefined}
                onClick={() => handleNavClick(item.href)}
                className={cn(
                  "flex flex-col items-center justify-center gap-0.5 py-2 flex-1 min-w-0 max-w-[72px] transition-colors relative active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded-lg",
                  active
                    ? "text-primary"
                    : "text-muted-foreground active:text-foreground"
                )}
              >
                <div className={cn(
                  "flex items-center justify-center h-7 w-7 rounded-xl transition-colors",
                  active && "bg-primary/10"
                )}>
                  <item.icon className={cn("h-5 w-5", active && "text-primary")} />
                </div>
                <span className={cn(
                  "text-[10px] font-semibold tracking-tight truncate w-full text-center px-0.5",
                  active ? "text-primary" : "text-muted-foreground"
                )}>
                  {item.label}
                </span>
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
