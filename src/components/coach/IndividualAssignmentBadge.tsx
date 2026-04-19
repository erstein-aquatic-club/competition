import { User } from "lucide-react";

interface IndividualAssignmentBadgeProps {
  size?: "sm" | "md";
}

export default function IndividualAssignmentBadge({ size = "sm" }: IndividualAssignmentBadgeProps) {
  return (
    <span
      className={[
        "inline-flex items-center gap-1 rounded-full font-medium tabular-nums",
        "bg-violet-100 text-violet-800 dark:bg-violet-900/30 dark:text-violet-300",
        "ring-1 ring-inset ring-violet-200 dark:ring-violet-800/50",
        size === "sm" ? "text-[10px] px-1.5 py-0.5" : "text-xs px-2 py-0.5",
      ].join(" ")}
      title="Séance personnalisée (assignation individuelle)"
    >
      <User className={size === "sm" ? "h-2.5 w-2.5" : "h-3 w-3"} aria-hidden="true" />
      Perso
    </span>
  );
}
