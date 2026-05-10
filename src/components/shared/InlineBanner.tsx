import type { ReactNode, KeyboardEvent } from "react";
import { cn } from "@/lib/utils";
import { useExitAnimation } from "@/hooks/useExitAnimation";

// ── Variant config ────────────────────────────────────────────
// §199 Chantier B — refonte sur tokens sémantiques (--color-status-*).
// Les anciens variants (amber/red/yellow/blue/emerald) restent comme alias
// pour ne casser aucun call-site. À termes : tout doit migrer vers les
// 4 variants sémantiques (info / success / warning / error / muted).

const variants = {
  // Variants sémantiques iOS-aligned ───────────────────────────
  info: {
    dot: "bg-primary",
    text: "text-primary",
    muted: "text-primary/70",
    border: "border-primary/15",
    bg: "bg-primary/5",
  },
  success: {
    dot: "bg-status-success",
    text: "text-status-success",
    muted: "text-status-success/70",
    border: "border-status-success/20",
    bg: "bg-status-success-bg",
  },
  warning: {
    dot: "bg-status-warning",
    text: "text-status-warning",
    muted: "text-status-warning/70",
    border: "border-status-warning/20",
    bg: "bg-status-warning-bg",
  },
  error: {
    dot: "bg-status-error",
    text: "text-status-error",
    muted: "text-status-error/70",
    border: "border-status-error/20",
    bg: "bg-status-error-bg",
  },
  muted: {
    dot: "bg-muted-foreground/40",
    text: "text-foreground",
    muted: "text-muted-foreground",
    border: "border-border",
    bg: "bg-muted/30",
  },
  // Alias back-compat (à migrer progressivement vers sémantiques) ──
  amber: {
    dot: "bg-status-warning",
    text: "text-status-warning",
    muted: "text-status-warning/70",
    border: "border-status-warning/20",
    bg: "bg-status-warning-bg",
  },
  red: {
    dot: "bg-status-error",
    text: "text-status-error",
    muted: "text-status-error/70",
    border: "border-status-error/20",
    bg: "bg-status-error-bg",
  },
  yellow: {
    dot: "bg-status-warning",
    text: "text-status-warning",
    muted: "text-status-warning/70",
    border: "border-status-warning/20",
    bg: "bg-status-warning-bg",
  },
  blue: {
    dot: "bg-primary",
    text: "text-primary",
    muted: "text-primary/70",
    border: "border-primary/15",
    bg: "bg-primary/5",
  },
  emerald: {
    dot: "bg-status-success",
    text: "text-status-success",
    muted: "text-status-success/70",
    border: "border-status-success/20",
    bg: "bg-status-success-bg",
  },
  destructive: {
    dot: "bg-destructive",
    text: "text-destructive",
    muted: "text-destructive/70",
    border: "border-destructive/20",
    bg: "bg-destructive/5",
  },
} as const;

export type BannerVariant = keyof typeof variants;

// ── Component ─────────────────────────────────────────────────
// §243 — animation migrée de framer-motion vers CSS @keyframes
// (`.anim-inline-banner-*` dans index.css), useExitAnimation gère le délai
// d'unmount pour préserver le pattern AnimatePresence d'origine.

interface InlineBannerProps {
  variant?: BannerVariant;
  icon?: ReactNode;
  /** Primary label (bold) */
  label: ReactNode;
  /** Secondary text / right-aligned badge */
  badge?: ReactNode;
  /** Optional second line */
  sublabel?: ReactNode;
  /** Optional sub-badge (right side of second line) */
  subbadge?: ReactNode;
  /** Animate mount/unmount */
  animate?: boolean;
  /** Show / hide */
  visible?: boolean;
  /** Click handler */
  onClick?: () => void;
  className?: string;
}

export function InlineBanner({
  variant = "muted",
  icon,
  label,
  badge,
  sublabel,
  subbadge,
  animate = true,
  visible = true,
  onClick,
  className,
}: InlineBannerProps) {
  const v = variants[variant];
  // When animation is disabled, treat `visible` as a plain conditional render.
  const { shouldRender, isExiting } = useExitAnimation(animate ? visible : true, 220);
  const hasLabel = label != null && label !== false && label !== "";

  if (!animate) {
    if (!visible) return null;
  } else if (!shouldRender) {
    return null;
  }
  if (!hasLabel) {
    if (import.meta.env.DEV) {
      console.warn("InlineBanner requires a non-empty label.");
    }
    return null;
  }

  return (
    <div
      onClick={onClick}
      role={onClick ? "button" : undefined}
      aria-label={onClick && typeof label === "string" ? label : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e: KeyboardEvent) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClick(); } } : undefined}
      className={cn(
        "rounded-xl border px-3 py-2.5",
        "backdrop-blur-sm",
        onClick && "cursor-pointer active:scale-[0.98] transition-transform",
        animate && (isExiting ? "anim-inline-banner-exit" : "anim-inline-banner-enter"),
        v.border,
        v.bg,
        className,
      )}
    >
      {/* Main row */}
      <div className="flex items-center gap-2 min-w-0">
        {icon ? (
          <span className={cn("shrink-0 [&>svg]:h-3.5 [&>svg]:w-3.5", v.text)}>
            {icon}
          </span>
        ) : (
          <span className={cn("h-1.5 w-1.5 rounded-full shrink-0", v.dot)} aria-hidden="true" />
        )}
        <span className={cn("text-[13px] font-semibold truncate", v.text)}>
          {label}
        </span>
        {badge && (
          <span className={cn("text-[11px] font-bold ml-auto shrink-0 tabular-nums", v.text)}>
            {badge}
          </span>
        )}
      </div>

      {/* Sub row */}
      {(sublabel || subbadge) && (
        <div className="flex items-center gap-2 mt-0.5 ml-[calc(0.375rem+0.5rem+0.5rem)]">
          {sublabel && (
            <span className={cn("text-[11px] truncate", v.muted)}>
              {sublabel}
            </span>
          )}
          {subbadge && (
            <span className={cn("text-[11px] font-medium ml-auto shrink-0 tabular-nums", v.muted)}>
              {subbadge}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
