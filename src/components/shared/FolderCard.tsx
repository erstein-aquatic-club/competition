import { useState, type ReactNode } from "react";
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from "@/components/ui/collapsible";
import { ChevronRight, FolderOpen } from "lucide-react";
import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

interface FolderCardProps {
  name: string;
  icon?: LucideIcon;
  count: number;
  defaultOpen?: boolean;
  variant?: "root" | "nested";
  actions?: ReactNode;
  children: ReactNode;
}

export function FolderCard({
  name,
  icon: Icon = FolderOpen,
  count,
  defaultOpen = false,
  variant = "root",
  actions,
  children,
}: FolderCardProps) {
  const [open, setOpen] = useState(defaultOpen);
  const isRoot = variant === "root";

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger
        className={cn(
          "flex items-center gap-2.5 w-full text-left transition-colors",
          isRoot
            ? "rounded-xl border bg-card px-3 py-2.5 hover:bg-accent/50"
            : "px-1 pt-1.5 pb-0.5"
        )}
      >
        <Icon className={cn("h-4 w-4 shrink-0", isRoot ? "text-muted-foreground" : "text-muted-foreground/70")} />
        <span className={cn(
          "flex-1 truncate",
          isRoot ? "text-[13px] font-semibold" : "text-[11px] font-semibold text-muted-foreground/70"
        )}>
          {name}
        </span>
        <span className="text-[11px] text-muted-foreground tabular-nums shrink-0">{count}</span>
        {actions && (
          <span onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
            {actions}
          </span>
        )}
        <ChevronRight className={cn("h-3.5 w-3.5 text-muted-foreground/40 transition-transform", open && "rotate-90")} />
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className={cn(isRoot ? "pl-3 pt-1 space-y-1" : "pl-2 pt-0.5 space-y-1")}>
          {children}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
