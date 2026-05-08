import React from "react";
import { cn } from "@/lib/utils";

const scaleValues = [1, 2, 3, 4, 5] as const;

// §198 QW5 — bascule sur les tokens semantic --color-intensity-{1..5}
// (emerald → green → yellow → orange → red) au lieu d'un mono-rouge primary.
// Restaure le canal visuel d'intensité que le composant prétendait offrir.
const ACTIVE_BG: Record<number, string> = {
  1: "bg-[hsl(var(--intensity-1))] border-[hsl(var(--intensity-1))]",
  2: "bg-[hsl(var(--intensity-2))] border-[hsl(var(--intensity-2))]",
  3: "bg-[hsl(var(--intensity-3))] border-[hsl(var(--intensity-3))]",
  4: "bg-[hsl(var(--intensity-4))] border-[hsl(var(--intensity-4))]",
  5: "bg-[hsl(var(--intensity-5))] border-[hsl(var(--intensity-5))]",
};

type ScaleSelector5Props = {
  value?: number | null;
  onChange?: (value: number) => void;
  className?: string;
  disabled?: boolean;
  size?: "sm" | "md";
  ariaLabel?: string;
};

export function ScaleSelector5({
  value,
  onChange,
  className,
  disabled = false,
  size = "md",
  ariaLabel = "Sélecteur d'échelle 1 à 5",
}: ScaleSelector5Props) {
  const sizeClasses =
    size === "sm"
      ? "h-10 w-10 text-xs"
      : "h-11 w-11 text-sm";

  return (
    <div className={cn("flex items-center gap-2", className)} role="group" aria-label={ariaLabel}>
      {scaleValues.map((item) => {
        const isActive = value === item;
        return (
          <button
            key={item}
            type="button"
            className={cn(
              "flex items-center justify-center rounded-full border font-semibold transition active:scale-95",
              sizeClasses,
              isActive
                ? cn(ACTIVE_BG[item], "text-white shadow-sm")
                : "border-muted-foreground/30 bg-background text-foreground",
              disabled && "opacity-60",
            )}
            aria-pressed={isActive}
            disabled={disabled}
            onClick={() => {
              if (!disabled) {
                onChange?.(item);
              }
            }}
          >
            {item}
          </button>
        );
      })}
    </div>
  );
}
