import { acwrZone } from "@/lib/trainingLoadHelpers";

interface AcwrBadgeProps {
  acwr: number | null;
  size?: "sm" | "md";
}

const ZONE_CLASSES: Record<"optimal" | "warning" | "danger", string> = {
  optimal:
    "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400",
  warning:
    "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400",
  danger: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
};

export default function AcwrBadge({ acwr, size = "sm" }: AcwrBadgeProps) {
  if (acwr == null) {
    return (
      <span
        className={[
          "inline-flex items-center justify-center rounded-full font-bold tabular-nums bg-muted text-muted-foreground",
          size === "sm" ? "text-[10px] px-1.5 py-0.5 min-w-[28px]" : "text-xs px-2 py-0.5 min-w-[32px]",
        ].join(" ")}
      >
        &mdash;
      </span>
    );
  }

  const zone = acwrZone(acwr);

  return (
    <span
      className={[
        "inline-flex items-center justify-center rounded-full font-bold tabular-nums",
        ZONE_CLASSES[zone],
        size === "sm" ? "text-[10px] px-1.5 py-0.5 min-w-[28px]" : "text-xs px-2 py-0.5 min-w-[32px]",
      ].join(" ")}
    >
      {acwr.toFixed(1)}
    </span>
  );
}
