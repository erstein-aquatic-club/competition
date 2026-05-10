import { cn } from "@/lib/utils";
import { getEquipmentIconUrl } from "@/components/swim/EquipmentPill";

const shortLabels: Record<string, string> = {
  palmes: "Pal",
  tuba: "Tub",
  plaquettes: "Plq",
  pull: "Pul",
  elastique: "Éla",
};

type EquipmentIconCompactProps = {
  equipment: string;
  className?: string;
  size?: "sm" | "md";
};

export function EquipmentIconCompact({
  equipment,
  className,
  size = "md",
}: EquipmentIconCompactProps) {
  const key = equipment.trim().toLowerCase();
  const iconUrl = getEquipmentIconUrl(equipment);
  const label = shortLabels[key] ?? equipment.slice(0, 3);
  const boxSize = size === "sm" ? "h-7 w-7" : "h-8 w-8";
  const imgSize = size === "sm" ? "h-3.5 w-3.5" : "h-4 w-4";

  return (
    <div className={cn("flex flex-col items-center gap-0.5", className)}>
      <div className={cn(boxSize, "flex items-center justify-center rounded-lg bg-muted")}>
        {iconUrl ? (
          <img src={iconUrl} alt={equipment} className={cn(imgSize, "opacity-70")} aria-hidden="true" loading="lazy" />
        ) : (
          <span className="text-[10px] font-semibold text-muted-foreground">{label}</span>
        )}
      </div>
      <span className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
    </div>
  );
}
