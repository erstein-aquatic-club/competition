import { Skeleton } from "@/components/ui/skeleton";

export function CalendarSkeleton() {
  return (
    <div className="space-y-3 p-4">
      {/* Week header with nav */}
      <div className="flex items-center justify-between">
        <Skeleton className="h-9 w-9 rounded-xl" />
        <Skeleton className="h-5 w-32" />
        <Skeleton className="h-9 w-9 rounded-xl" />
      </div>
      {/* 7 day columns */}
      <div className="grid grid-cols-7 gap-1.5">
        {Array.from({ length: 7 }).map((_, day) => (
          <div key={day} className="space-y-1.5">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-16 w-full rounded-xl" />
            <Skeleton className="h-16 w-full rounded-xl" />
            <Skeleton className="h-12 w-full rounded-xl" />
          </div>
        ))}
      </div>
    </div>
  );
}
