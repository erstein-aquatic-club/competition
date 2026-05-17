/**
 * KpiGifPanel — visual demo slot for a KPI protocol.
 *
 * `gifUrl` is currently null for all 5 protocols (Chantier A will add them).
 * Until then this renders a tasteful neutral placeholder instead of an empty
 * box — keeps the step visually balanced and signals "demo coming".
 */
import { ImageOff } from "lucide-react";

export function KpiGifPanel({ gifUrl, label }: { gifUrl: string | null; label: string }) {
  if (gifUrl) {
    return (
      <div className="overflow-hidden rounded-2xl border bg-muted">
        <img
          src={gifUrl}
          alt={`Démonstration : ${label}`}
          className="aspect-video w-full object-cover"
          loading="lazy"
        />
      </div>
    );
  }

  return (
    <div
      className="flex aspect-video w-full flex-col items-center justify-center gap-1.5 rounded-2xl border border-dashed border-border bg-muted/40"
      aria-hidden
    >
      <ImageOff className="h-7 w-7 text-muted-foreground/40" />
      <span className="text-[11px] font-medium text-muted-foreground/60">
        Démonstration à venir
      </span>
    </div>
  );
}
