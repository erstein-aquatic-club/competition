import { forwardRef, type HTMLAttributes, type ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Surface — primitive iOS-aligned (§199 Chantier B).
 *
 * Unifie les ~8 variantes de "card-like" recensées dans l'audit
 * (`docs/audits/2026-05-08-ui-ux-audit-ios.md`) — Card shadcn, InlineBanner,
 * ObjectiveCard full+compact, LoginInstallBanner, PushPermissionBanner,
 * BottomActionBar, UpdateNotification — derrière une seule API.
 *
 * Variants :
 *  - solid    : bg-card border (la card iOS Settings classique)
 *  - glass    : bg-background/95 backdrop-blur (toolbar/notification flottante)
 *  - tinted   : bg-primary/5 border-primary/15 (callouts brand soft)
 *  - outline  : border, no fill (sec, plates)
 *
 * Radius :
 *  - sm = 12px (rows, badges, dense list items)
 *  - md = 16px (cards standard)
 *  - lg = 22px (sheets bottom, modal hero, panels)
 *
 * Inspiration : UICollectionViewListCell `.insetGrouped` + UIVibrancyEffect.
 */

type SurfaceVariant = "solid" | "glass" | "tinted" | "outline";
type SurfaceRadius = "sm" | "md" | "lg";

const VARIANT_CLASSES: Record<SurfaceVariant, string> = {
  solid: "bg-card border border-border",
  glass: "bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 border border-border/60",
  tinted: "bg-primary/5 border border-primary/15",
  outline: "bg-transparent border border-border",
};

const RADIUS_CLASSES: Record<SurfaceRadius, string> = {
  sm: "rounded-xl", // 12px
  md: "rounded-2xl", // 16px
  lg: "rounded-[22px]", // 22px (iOS sheet card radius)
};

export interface SurfaceProps extends HTMLAttributes<HTMLDivElement> {
  variant?: SurfaceVariant;
  radius?: SurfaceRadius;
  /** Adds active:scale-[0.98] transition (use only when the Surface is tappable). */
  interactive?: boolean;
  children?: ReactNode;
}

export const Surface = forwardRef<HTMLDivElement, SurfaceProps>(
  ({ variant = "solid", radius = "md", interactive = false, className, children, ...rest }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(
          VARIANT_CLASSES[variant],
          RADIUS_CLASSES[radius],
          interactive && "cursor-pointer transition-all active:scale-[0.98]",
          className,
        )}
        {...rest}
      >
        {children}
      </div>
    );
  },
);
Surface.displayName = "Surface";
