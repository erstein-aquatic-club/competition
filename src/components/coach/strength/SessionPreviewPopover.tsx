/**
 * SessionPreviewPopover — quick hover/tap preview of a strength session.
 *
 * Used by:
 * - Planif muscu (read-only, §278) : just shows exercises content.
 * - Plan builder (TrainingPlansBrowser, §279) : same preview + edit actions
 *   "Changer de séance" / "Retirer de la grille".
 *
 * UX :
 * - Desktop (hover-capable) : opens on `mouseenter`, closes 60ms after the
 *   cursor leaves the trigger AND the popover content. Short grace bridges
 *   the small gap between trigger and popover (sideOffset=4).
 * - Touch (no hover) : opens on `click` toggle, closes via Radix
 *   pointer-down-outside detection.
 *
 * The exit animation duration is capped at 100ms via `duration-100` to keep
 * the close perception under ~160ms (60ms grace + 100ms animation).
 */
import { useEffect, useRef, useState } from "react";
import { Dumbbell, Pencil, Trash2 } from "lucide-react";

import type { StrengthSessionTemplate } from "@/lib/api/types";
import { detectPhase, PHASE_STYLES } from "@/lib/strength/strengthPhaseStyles";
import { cn } from "@/lib/utils";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

const CLOSE_DELAY_MS = 60;

function formatRest(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const sec = seconds % 60;
  return sec === 0 ? `${m}'` : `${m}'${String(sec).padStart(2, "0")}`;
}

export interface SessionPreviewPopoverActions {
  /** Open the session picker / change flow. */
  onChangeSession?: () => void;
  /** Remove the session from the current cell. */
  onRemove?: () => void;
  /** Disabled state while a remove mutation is in flight. */
  removePending?: boolean;
}

export interface SessionPreviewPopoverProps {
  /** Session template to preview. */
  template: StrengthSessionTemplate;
  /** Optional display name override (defaults to template.title/name). */
  sessionName?: string;
  /** Trigger element (rendered as Radix's PopoverTrigger asChild). */
  children: React.ReactNode;
  /** Optional edit actions rendered at the bottom of the popover. */
  actions?: SessionPreviewPopoverActions;
}

export function SessionPreviewPopover({
  template,
  sessionName: sessionNameOverride,
  children,
  actions,
}: SessionPreviewPopoverProps) {
  const [open, setOpen] = useState(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [hoverCapable, setHoverCapable] = useState(true);

  // Detect hover capability once on mount. Touch-only devices skip the
  // mouse-enter trigger to avoid the iOS phantom-hover that fires on tap.
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      setHoverCapable(window.matchMedia("(hover: hover)").matches);
    } catch {
      setHoverCapable(true);
    }
  }, []);

  const cancelClose = () => {
    if (closeTimer.current) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  };
  const scheduleClose = (ms: number = CLOSE_DELAY_MS) => {
    cancelClose();
    closeTimer.current = setTimeout(() => setOpen(false), ms);
  };

  useEffect(() => () => cancelClose(), []);

  const sessionName = sessionNameOverride ?? template.title ?? template.name ?? "Séance";
  const phase = detectPhase(sessionName);
  const style = PHASE_STYLES[phase] ?? PHASE_STYLES.force;
  const items = template.items ?? [];
  const visibleItems = items.slice(0, 6);
  const overflowCount = Math.max(0, items.length - visibleItems.length);
  const description = template.description;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <span
          onMouseEnter={hoverCapable ? () => { cancelClose(); setOpen(true); } : undefined}
          onMouseLeave={hoverCapable ? () => scheduleClose() : undefined}
          onClick={() => setOpen((o) => !o)}
          className="inline-block w-full"
        >
          {children}
        </span>
      </PopoverTrigger>
      <PopoverContent
        side="top"
        align="center"
        sideOffset={4}
        className={cn("w-[300px] p-3 space-y-2.5 duration-100")}
        onMouseEnter={hoverCapable ? cancelClose : undefined}
        onMouseLeave={hoverCapable ? () => scheduleClose() : undefined}
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        {/* Header — phase dot + session name */}
        <div className="flex items-center gap-2">
          <span className={cn("h-2.5 w-2.5 rounded-full shrink-0", style.dot)} />
          <span className="text-sm font-bold leading-tight truncate">{sessionName}</span>
        </div>

        {description && (
          <p className="text-[11px] text-muted-foreground leading-snug line-clamp-2">
            {description}
          </p>
        )}

        {items.length === 0 ? (
          <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
            <Dumbbell className="h-3.5 w-3.5 text-muted-foreground/40" />
            Aucun exercice.
          </div>
        ) : (
          <ul className="space-y-1">
            {visibleItems
              .slice()
              .sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0))
              .map((item, idx) => {
                const hasPercent = item.percent_1rm != null && item.percent_1rm > 0;
                const hasRest = item.rest_seconds != null && item.rest_seconds > 0;
                return (
                  <li key={idx} className="flex items-baseline gap-2 text-[12px] leading-snug">
                    <span className="text-[10px] text-muted-foreground/60 tabular-nums shrink-0 w-3">
                      {idx + 1}.
                    </span>
                    <span className="font-medium flex-1 truncate">
                      {item.exercise_name ?? `Exercice #${item.exercise_id}`}
                    </span>
                    <span className="text-[11px] text-muted-foreground tabular-nums shrink-0">
                      <span className="font-semibold text-foreground/90">
                        {item.sets}×{item.reps}
                      </span>
                      {hasPercent && (
                        <span className="ml-1.5">{item.percent_1rm}%</span>
                      )}
                      {hasRest && (
                        <span className="ml-1.5">{formatRest(item.rest_seconds)}</span>
                      )}
                    </span>
                  </li>
                );
              })}
            {overflowCount > 0 && (
              <li className="text-[10px] text-muted-foreground/70 italic pt-0.5">
                + {overflowCount} autre{overflowCount > 1 ? "s" : ""} exercice{overflowCount > 1 ? "s" : ""}
              </li>
            )}
          </ul>
        )}

        {/* Optional edit actions */}
        {actions && (actions.onChangeSession || actions.onRemove) && (
          <div className="pt-1.5 border-t border-border/60 flex gap-1">
            {actions.onChangeSession && (
              <button
                type="button"
                onClick={() => {
                  cancelClose();
                  setOpen(false);
                  actions.onChangeSession?.();
                }}
                className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-[11px] font-semibold text-primary hover:bg-primary/10 active:scale-[0.97] transition-all"
              >
                <Pencil className="h-3.5 w-3.5" />
                Changer
              </button>
            )}
            {actions.onRemove && (
              <button
                type="button"
                onClick={() => {
                  cancelClose();
                  setOpen(false);
                  actions.onRemove?.();
                }}
                disabled={actions.removePending}
                className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-[11px] font-semibold text-destructive hover:bg-destructive/10 active:scale-[0.97] transition-all disabled:opacity-50"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Retirer
              </button>
            )}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
