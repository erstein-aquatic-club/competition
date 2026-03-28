import { lazy, Suspense, useState } from "react";
import { CalendarDays, CalendarRange, ArrowLeft } from "lucide-react";
import { PageSkeleton } from "@/components/shared/PageSkeleton";
import type { SwimLibraryEntryContext } from "./swimLibraryEntryContext";

const CoachTrainingSlotsScreen = lazy(() => import("./CoachTrainingSlotsScreen"));
const CoachCalendar = lazy(() => import("./CoachCalendar"));
const SwimCatalog = lazy(() => import("./SwimCatalog"));

type ViewMode = "week" | "month";
const LS_KEY = "eac-coach-week-mode";

function readMode(): ViewMode {
  const v = localStorage.getItem(LS_KEY);
  return v === "month" ? "month" : "week";
}

type CoachWeekViewProps = {
  groups: Array<{ id: number | string; name: string }>;
  athletes: Array<{ id: number | null; display_name: string; group_label?: string | null }>;
  swimSessions?: Array<{ id: number; name: string }>;
  strengthSessions?: Array<{ id: number; title: string }>;
};

export default function CoachWeekView({
  groups,
  athletes,
  swimSessions,
  strengthSessions,
}: CoachWeekViewProps) {
  const [mode, setMode] = useState<ViewMode>(readMode);
  const [libraryContext, setLibraryContext] = useState<SwimLibraryEntryContext | null>(null);
  const [showLibrary, setShowLibrary] = useState(false);

  const switchMode = (m: ViewMode) => {
    setMode(m);
    localStorage.setItem(LS_KEY, m);
  };

  const handleOpenLibrary = (context?: SwimLibraryEntryContext) => {
    setLibraryContext(context ?? null);
    setShowLibrary(true);
  };

  const handleBackFromLibrary = () => {
    setShowLibrary(false);
    setLibraryContext(null);
  };

  // When showing SwimCatalog inline (from week view "open library" callback)
  if (showLibrary) {
    return (
      <div className="space-y-3">
        <button
          type="button"
          onClick={handleBackFromLibrary}
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Retour à la semaine
        </button>
        <Suspense fallback={<PageSkeleton />}>
          <SwimCatalog
            entryContext={libraryContext}
            onEntryContextConsumed={handleBackFromLibrary}
          />
        </Suspense>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Toggle bar */}
      <div className="flex justify-end">
        <div className="flex gap-1.5 rounded-xl border bg-card p-1">
          <button
            type="button"
            onClick={() => switchMode("week")}
            className={[
              "flex flex-1 items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
              mode === "week"
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            ].join(" ")}
          >
            <CalendarDays className="h-4 w-4" />
            Semaine
          </button>
          <button
            type="button"
            onClick={() => switchMode("month")}
            className={[
              "flex flex-1 items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
              mode === "month"
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            ].join(" ")}
          >
            <CalendarRange className="h-4 w-4" />
            Mois
          </button>
        </div>
      </div>

      {/* Content */}
      <Suspense fallback={<PageSkeleton />}>
        {mode === "week" ? (
          <CoachTrainingSlotsScreen
            groups={groups}
            onOpenLibrary={handleOpenLibrary}
          />
        ) : (
          <CoachCalendar
            athletes={athletes}
            groups={groups}
            swimSessions={swimSessions}
            strengthSessions={strengthSessions}
          />
        )}
      </Suspense>
    </div>
  );
}
