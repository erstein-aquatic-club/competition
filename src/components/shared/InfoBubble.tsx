import { Info } from "lucide-react";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "@/components/ui/popover";

interface InfoBubbleProps {
  /** Plain text or ReactNode displayed inside the popover */
  children: React.ReactNode;
  /** Side of the trigger to open the popover */
  side?: "top" | "bottom" | "left" | "right";
  /** Alignment relative to trigger */
  align?: "start" | "center" | "end";
  /** Icon size in px */
  size?: number;
}

export default function InfoBubble({
  children,
  side = "bottom",
  align = "end",
  size = 14,
}: InfoBubbleProps) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-full p-0.5 text-muted-foreground/60 hover:text-muted-foreground active:scale-90 transition-all touch-manipulation"
          aria-label="Plus d'infos"
        >
          <Info style={{ width: size, height: size }} strokeWidth={2.5} />
        </button>
      </PopoverTrigger>
      <PopoverContent
        side={side}
        align={align}
        className="w-[280px] max-w-[calc(100vw-2rem)] p-0 text-popover-foreground shadow-lg"
      >
        {children}
      </PopoverContent>
    </Popover>
  );
}

// ── Reusable info content blocks ────────────────────────────

interface ZoneIndicatorProps {
  color: string;
  label: string;
  description: string;
}

function ZoneIndicator({ color, label, description }: ZoneIndicatorProps) {
  return (
    <div className="flex items-start gap-2">
      <span className={`mt-1 h-2 w-2 shrink-0 rounded-full ${color}`} />
      <p className="text-xs leading-snug text-popover-foreground/80">
        <span className="font-medium text-popover-foreground">{label}</span>
        {" — "}{description}
      </p>
    </div>
  );
}

export function AcwrInfoContent() {
  return (
    <div>
      <div className="border-b border-border/50 px-3 py-2.5">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Charge d'entraînement
        </p>
      </div>
      <div className="space-y-2.5 px-3 py-3">
        <p className="text-xs leading-relaxed text-popover-foreground/80">
          Ressenti d'effort × durée de séance, comparé sur 7 jours vs 28 jours.
          Basé sur le ratio ACWR, utilisé en sport pro pour prévenir les blessures.
        </p>
        <div className="space-y-1.5">
          <ZoneIndicator color="bg-status-success" label="0.8 – 1.3" description="rythme régulier" />
          <ZoneIndicator color="bg-status-warning" label="0.6 – 1.5" description="écart notable" />
          <ZoneIndicator color="bg-status-error" label="< 0.6 ou > 1.5" description="changement brutal" />
        </div>
      </div>
    </div>
  );
}
