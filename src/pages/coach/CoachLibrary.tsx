import { lazy, Suspense, useState } from "react";
import { Waves, Dumbbell } from "lucide-react";
import { FEATURES } from "@/lib/features";
import { PageSkeleton } from "@/components/shared/PageSkeleton";

const SwimCatalog = lazy(() => import("./SwimCatalog"));
const StrengthCatalog = lazy(() => import("./StrengthCatalog"));

type LibraryTab = "swim" | "strength";
const LS_KEY = "eac-coach-library-tab";

function readTab(): LibraryTab {
  const v = localStorage.getItem(LS_KEY);
  return v === "strength" && FEATURES.coachStrength ? "strength" : "swim";
}

export default function CoachLibrary() {
  const [tab, setTab] = useState<LibraryTab>(readTab);

  const switchTab = (t: LibraryTab) => {
    setTab(t);
    localStorage.setItem(LS_KEY, t);
  };

  return (
    <div className="space-y-4">
      {/* Tab bar */}
      <div className="flex gap-1.5 rounded-xl border bg-card p-1">
        <button
          type="button"
          onClick={() => switchTab("swim")}
          className={[
            "flex flex-1 items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
            tab === "swim"
              ? "bg-primary text-primary-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground",
          ].join(" ")}
        >
          <Waves className="h-4 w-4" />
          Natation
        </button>
        {FEATURES.coachStrength && (
          <button
            type="button"
            onClick={() => switchTab("strength")}
            className={[
              "flex flex-1 items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
              tab === "strength"
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            ].join(" ")}
          >
            <Dumbbell className="h-4 w-4" />
            Musculation
          </button>
        )}
      </div>

      {/* Content */}
      <Suspense fallback={<PageSkeleton />}>
        {tab === "swim" ? <SwimCatalog /> : <StrengthCatalog />}
      </Suspense>
    </div>
  );
}
