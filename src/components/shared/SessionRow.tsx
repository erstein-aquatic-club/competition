import { type ReactNode } from "react";
import { ChevronRight, Dumbbell } from "lucide-react";
import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

interface SessionRowProps {
  icon?: LucideIcon;
  title: string;
  subtitle?: string;
  badge?: ReactNode;
  trailing?: ReactNode;
  onClick?: () => void;
  className?: string;
}

export function SessionRow({
  icon: Icon = Dumbbell,
  title,
  subtitle,
  badge,
  trailing,
  onClick,
  className,
}: SessionRowProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "group flex items-center gap-2.5 w-full rounded-lg px-2.5 py-2 text-left hover:bg-accent/50 transition-colors",
        className,
      )}
    >
      <Icon className="h-3.5 w-3.5 text-muted-foreground/50 shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="text-[13px] font-medium truncate">{title}</span>
          {badge}
        </div>
        {subtitle && (
          <p className="text-[11px] text-muted-foreground tabular-nums truncate mt-0.5">{subtitle}</p>
        )}
      </div>
      {trailing ?? (
        <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/30 transition-transform group-hover:translate-x-0.5 shrink-0" />
      )}
    </button>
  );
}
