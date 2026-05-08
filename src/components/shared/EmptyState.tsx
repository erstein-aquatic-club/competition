import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * EmptyState — composant partagé iOS-aligned (§203 Chantier D).
 *
 * Unifie les 4 implémentations existantes recensées dans l'audit
 * (`docs/audits/2026-05-08-ui-ux-audit-ios.md`) :
 *  - `<p>` simple (ex `Coach.tsx:856`)
 *  - shadcn `<Empty>` (ex `StrengthCatalog.tsx:1457`)
 *  - inline div centered (ex `AthletePlansTab.tsx:460`)
 *  - icon + 2 lignes texte + CTA (ex `CompetitionDetail.tsx:76-81`)
 *
 * Layout : icon top, title, description, CTA optional, espacement vertical
 * généreux. Variant `compact` pour usage embedded (cards/sections).
 */

interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description?: ReactNode;
  cta?: ReactNode;
  /** Compact = padding réduit pour usage embedded (carte/section). */
  compact?: boolean;
  className?: string;
}

export function EmptyState({
  icon,
  title,
  description,
  cta,
  compact = false,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center text-center",
        compact ? "gap-2 py-6 px-4" : "gap-3 py-12 px-4",
        className,
      )}
      role="status"
    >
      {icon ? (
        <div
          className={cn(
            "text-muted-foreground/60 [&>svg]:mx-auto",
            compact ? "[&>svg]:h-8 [&>svg]:w-8" : "[&>svg]:h-10 [&>svg]:w-10",
          )}
          aria-hidden
        >
          {icon}
        </div>
      ) : null}
      <p className={cn("font-medium text-foreground", compact ? "text-sm" : "text-base")}>
        {title}
      </p>
      {description ? (
        <p
          className={cn(
            "text-muted-foreground max-w-sm",
            compact ? "text-xs" : "text-sm",
          )}
        >
          {description}
        </p>
      ) : null}
      {cta ? <div className={cn(compact ? "mt-1" : "mt-2")}>{cta}</div> : null}
    </div>
  );
}
