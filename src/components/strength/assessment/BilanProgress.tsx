/**
 * BilanProgress — le « fil conducteur » du bilan muscu coach (§302).
 *
 * Affiche les 3 étapes (Questionnaire · KPIs · Bilan physique) avec leur état
 * (`done` ✓ / `current` / `todo`) et les rend tappables : c'est le hub qui
 * manquait pour mener toute la séance sur un seul appareil sans se souvenir de
 * ce qui reste. Conçu via /frontend-design — pastilles rondes + connecteurs,
 * accent primary, cohérent avec l'écran bilan.
 */
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import type { StepState } from "@/lib/strength/bilanProgress";

export interface BilanStep {
  key: string;
  label: string;
  state: StepState;
  /** Action au tap. Omis → étape non interactive (ex. l'étape courante). */
  onTap?: () => void;
}

export function BilanProgress({ steps }: { steps: BilanStep[] }) {
  return (
    <div className="rounded-2xl border bg-card px-3 py-3">
      <p className="mb-2.5 px-0.5 text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
        Déroulé du bilan
      </p>
      <div className="flex items-start">
        {steps.map((step, i) => {
          const isLast = i === steps.length - 1;
          const done = step.state === "done";
          const current = step.state === "current";
          const inner = (
            <>
              <span
                className={cn(
                  "flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-bold tabular-nums ring-2 transition-colors",
                  done && "bg-primary text-primary-foreground ring-primary",
                  current && "bg-primary/10 text-primary ring-primary",
                  !done &&
                    !current &&
                    "bg-muted text-muted-foreground ring-transparent",
                )}
              >
                {done ? <Check className="h-4 w-4" /> : i + 1}
              </span>
              <span
                className={cn(
                  "text-[11px] font-semibold leading-tight",
                  done || current ? "text-foreground" : "text-muted-foreground",
                )}
              >
                {step.label}
              </span>
            </>
          );
          const wrapperClass =
            "flex min-w-0 flex-1 flex-col items-center gap-1.5 rounded-xl px-1 py-1 text-center";
          return (
            <div key={step.key} className="flex flex-1 items-start">
              {step.onTap ? (
                <button
                  type="button"
                  onClick={step.onTap}
                  aria-current={current ? "step" : undefined}
                  className={cn(
                    wrapperClass,
                    "cursor-pointer transition-colors hover:bg-muted/60 active:scale-[0.98]",
                  )}
                >
                  {inner}
                </button>
              ) : (
                <div
                  aria-current={current ? "step" : undefined}
                  className={wrapperClass}
                >
                  {inner}
                </div>
              )}
              {!isLast && (
                <span
                  aria-hidden
                  className={cn(
                    "mt-[18px] h-0.5 w-3 shrink-0 rounded-full sm:w-5",
                    done ? "bg-primary" : "bg-border",
                  )}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
