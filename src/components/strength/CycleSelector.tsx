import { Flame, Zap, Weight } from "lucide-react";
import { cn } from "@/lib/utils";
import type { StrengthCycleType } from "@/lib/api";

const cycleConfig = [
  { value: "endurance" as StrengthCycleType, label: "Endurance", icon: Flame },
  { value: "hypertrophie" as StrengthCycleType, label: "Hypertrophie", icon: Zap },
  { value: "force" as StrengthCycleType, label: "Force", icon: Weight },
] as const;

interface CycleSelectorProps {
  cycleType: StrengthCycleType;
  onCycleChange: (cycle: StrengthCycleType) => void;
}

export function CycleSelector({ cycleType, onCycleChange }: CycleSelectorProps) {
  return (
    <div className="grid grid-cols-3 gap-1.5">
      {cycleConfig.map((option) => {
        const active = cycleType === option.value;
        const Icon = option.icon;
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => onCycleChange(option.value)}
            className={cn(
              "relative flex items-center justify-center gap-1.5 rounded-xl px-2 py-2.5 transition-all active:scale-[0.96]",
              active
                ? "bg-primary text-primary-foreground shadow-sm shadow-primary/20"
                : "bg-muted/40 text-muted-foreground hover:bg-muted/60",
            )}
          >
            <Icon className={cn("h-3.5 w-3.5", active ? "text-primary-foreground" : "text-muted-foreground/50")} />
            <span className="text-[12px] font-bold leading-tight">{option.label}</span>
          </button>
        );
      })}
    </div>
  );
}
