import React from "react";
import { CheckCircle2, Loader2, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { successBounce } from "@/lib/animations";
import { durationsSeconds } from "@/lib/design-tokens";

export type SaveState = "idle" | "saving" | "saved" | "error";

interface BottomActionBarProps {
  children: React.ReactNode;
  className?: string;
  containerClassName?: string;
  saveState?: SaveState;
  saveMessage?: string;
  position?: "fixed" | "static";
}

/**
 * Fixed bottom action bar for mobile-first pages.
 *
 * Positioned above mobile navigation (64px from bottom) with optional save state indicator.
 *
 * @param saveState - Current save state: idle, saving, saved, or error
 * @param saveMessage - Optional message to display with save state
 *
 * @example
 * <BottomActionBar saveState="saved" saveMessage="Modifications enregistrées">
 *   <Button>Save</Button>
 * </BottomActionBar>
 */
export function BottomActionBar({
  children,
  className,
  containerClassName,
  saveState = "idle",
  saveMessage,
  position = "fixed",
}: BottomActionBarProps) {
  const reduce = useReducedMotion();
  return (
    <div
      role="region"
      aria-label="Actions"
      className={cn(
        position === "fixed"
          ? // Position au-dessus de la nav mobile (64px = bottom-16) avec z-index supérieur
            "fixed bottom-16 left-0 right-0 z-bar md:bottom-0 md:z-bar"
          : // Static mode: stays in document flow (for drawers/modals)
            "shrink-0",
        className
      )}
    >
      {/* Save state indicator */}
      <AnimatePresence mode="wait">
        {saveState !== "idle" && (
          <motion.div
            key={saveState}
            variants={reduce ? undefined : (saveState === "saved" ? successBounce : undefined)}
            initial={reduce ? false : "hidden"}
            animate={reduce ? { opacity: 1 } : "visible"}
            exit={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.8 }}
            className={cn(
              "mx-auto mb-2 flex max-w-md items-center justify-center gap-2 rounded-full px-4 py-2 text-sm font-medium shadow-lg motion-reduce:animate-none",
              saveState === "saving" && "bg-muted text-muted-foreground",
              saveState === "saved" && "bg-status-success text-white",
              saveState === "error" && "bg-destructive text-destructive-foreground"
            )}
            role="status"
            aria-live="polite"
          >
            {saveState === "saving" && (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>{saveMessage || "Enregistrement..."}</span>
              </>
            )}
            {saveState === "saved" && (
              <>
                <motion.div
                  initial={reduce ? false : { scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={reduce ? { duration: 0 } : { delay: durationsSeconds.fast, type: "spring", stiffness: 300 }}
                >
                  <CheckCircle2 className="h-4 w-4" />
                </motion.div>
                <span>{saveMessage || "Enregistré"}</span>
              </>
            )}
            {saveState === "error" && (
              <>
                <AlertCircle className="h-4 w-4" />
                <span>{saveMessage || "Erreur lors de l'enregistrement"}</span>
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      <div
        className={cn(
          "flex w-full items-center justify-between gap-2 border-t bg-background/95 backdrop-blur-sm px-4 py-3",
          position === "fixed" && "mx-auto max-w-md rounded-t-2xl shadow-[0_-4px_20px_rgba(0,0,0,0.08)]",
          position === "fixed" && "pb-[max(0.75rem,env(safe-area-inset-bottom))]",
          position === "static" && "pb-[max(0.75rem,env(safe-area-inset-bottom))]",
          containerClassName,
        )}
      >
        {children}
      </div>
    </div>
  );
}
