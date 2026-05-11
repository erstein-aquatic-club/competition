import { lazy, Suspense, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { DelayedPageSkeleton } from "@/components/shared/PageSkeleton";
import type { SwimLibraryEntryContext } from "./swimLibraryEntryContext";

const CoachTrainingSlotsScreen = lazy(() => import("./CoachTrainingSlotsScreen"));
const SwimCatalog = lazy(() => import("./SwimCatalog"));

type CoachWeekViewProps = {
  groups: Array<{ id: number | string; name: string }>;
  initialWeekDate?: string;
};

export default function CoachWeekView({
  groups,
  initialWeekDate,
}: CoachWeekViewProps) {
  const [libraryContext, setLibraryContext] = useState<SwimLibraryEntryContext | null>(null);
  const [showLibrary, setShowLibrary] = useState(false);

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
        <Suspense fallback={<DelayedPageSkeleton />}>
          <SwimCatalog
            entryContext={libraryContext}
            onEntryContextConsumed={() => setLibraryContext(null)}
          />
        </Suspense>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {/* Content */}
      <Suspense fallback={<DelayedPageSkeleton />}>
        <CoachTrainingSlotsScreen
          groups={groups}
          onOpenLibrary={handleOpenLibrary}
          initialWeekDate={initialWeekDate}
        />
      </Suspense>
    </div>
  );
}
