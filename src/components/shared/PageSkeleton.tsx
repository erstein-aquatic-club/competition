import { useEffect } from "react"
import { toast } from "sonner"
import { Skeleton } from "@/components/ui/skeleton"
import { useDelayedLoading } from "@/hooks/useDelayedLoading"

export function PageSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-10 w-48" />
      <div className="space-y-4">
        <Skeleton className="h-64 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    </div>
  )
}

// §266 Gap 1 — Suspense fallback aware of slow chunk-load.
// Use as Suspense fallback when the parent does NOT manage its own
// isLoading state (e.g. lazy-loaded screens via React.lazy + Suspense).
// The component stays mounted while Suspense is active, so the 5 s timer
// reflects the real chunk-load duration.
export function DelayedPageSkeleton({
  message = "Chargement long…",
  description = "Le réseau semble lent. On continue d'essayer.",
}: { message?: string; description?: string } = {}) {
  const { showSlowToast } = useDelayedLoading(true)
  useEffect(() => {
    if (showSlowToast) {
      toast(message, { description })
    }
  }, [showSlowToast, message, description])
  return <PageSkeleton />
}
