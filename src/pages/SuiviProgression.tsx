import { lazy, Suspense } from "react";
import { useLocation } from "wouter";
import { PageHeader } from "@/components/shared/PageHeader";
import { Skeleton } from "@/components/ui/skeleton";
import { TrendingUp, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

const LazyProgressContent = lazy(() =>
  import("@/pages/Progress").then((mod) => ({ default: mod.ProgressContent }))
);

export default function SuiviProgression() {
  const [, navigate] = useLocation();

  return (
    <div className="mx-auto max-w-4xl px-4 pb-24">
      <div className="sticky top-0 z-10 bg-background/80 backdrop-blur-lg pb-2 pt-2">
        <Button
          variant="ghost"
          size="sm"
          className="gap-1 -ml-2 mb-1 text-xs"
          onClick={() => navigate("/suivi")}
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Mon suivi
        </Button>
        <PageHeader
          title="Ma progression"
          icon={<TrendingUp className="h-3.5 w-3.5" />}
        />
      </div>
      <div className="pt-2">
        <Suspense
          fallback={
            <div className="space-y-4">
              <Skeleton className="h-12 rounded-2xl" />
              <Skeleton className="h-64 rounded-2xl" />
            </div>
          }
        >
          <LazyProgressContent />
        </Suspense>
      </div>
    </div>
  );
}
