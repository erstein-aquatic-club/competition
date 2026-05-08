import { cn } from "@/lib/utils";
import { useLocation } from "wouter";
import { ChevronLeft } from "lucide-react";

interface PageHeaderProps {
  children?: React.ReactNode;
  className?: string;
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  icon?: React.ReactNode;
  action?: React.ReactNode;
  backHref?: string;
  backLabel?: string;
}

/**
 * Shared sticky page header — consistent across Strength, Records, RecordsClub, etc.
 * Applies the standard EAC blur/border pattern.
 */
export function PageHeader({
  children,
  className,
  title,
  subtitle,
  icon,
  action,
  backHref,
  backLabel = "Retour",
}: PageHeaderProps) {
  const [, navigate] = useLocation();

  const handleBack = () => {
    if (typeof window !== "undefined" && window.history.length > 1) {
      window.history.back();
      return;
    }
    if (backHref) {
      navigate(backHref);
    }
  };

  const hasStructuredHeader = title !== undefined || backHref !== undefined || action !== undefined;

  return (
    <div
      className={cn(
        "sticky top-0 z-overlay -mx-4 backdrop-blur-md bg-background/90 border-b border-primary/15",
        className,
      )}
    >
      <div className="px-4 py-2.5 flex items-center justify-between">
        {hasStructuredHeader ? (
          <>
            <div className="flex min-w-0 items-center gap-2.5">
              {backHref ? (
                <button
                  type="button"
                  onClick={handleBack}
                  aria-label={backLabel}
                  className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl border border-primary/15 bg-background/80 text-foreground transition hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <ChevronLeft className="h-5 w-5" />
                </button>
              ) : null}
              {icon ? (
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                  {icon}
                </div>
              ) : null}
              <div className="min-w-0">
                {title ? (
                  <h1 className="text-lg font-semibold tracking-tight text-foreground truncate">
                    {title}
                  </h1>
                ) : null}
                {subtitle ? (
                  <div className="text-xs text-muted-foreground truncate">
                    {subtitle}
                  </div>
                ) : null}
              </div>
            </div>
            {action ? <div className="shrink-0">{action}</div> : null}
          </>
        ) : (
          children
        )}
      </div>
    </div>
  );
}
