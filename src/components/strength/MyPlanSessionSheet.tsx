import { Fragment } from "react";
import { Dumbbell } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetFooter,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import type { StrengthSessionItem, StrengthSessionTemplate } from "@/lib/api/types";
import type { StrengthPhase } from "@/lib/strength/strengthPhaseStyles";
import { PHASE_STYLES } from "@/lib/strength/strengthPhaseStyles";
import { BLOCK_STYLES } from "@/lib/strength/blockStyles";
import { warmupMetaFromItem, warmupSectionLabel, correctiveChipLabel } from "@/lib/strength/warmupLabels";

interface MyPlanSessionSheetProps {
  session: StrengthSessionTemplate | null;
  phase: StrengthPhase | null;
  onClose: () => void;
  onLaunch?: (session: StrengthSessionTemplate) => void;
  /** §298 — mode lecture seule (coach) : masque le bouton « Lancer la séance ». */
  readOnly?: boolean;
  /** §300 Part 2 — si fourni (coach), affiche « Éditer la séance » → ouvre
   *  l'éditeur catalogue par deeplink (préserve le raw_payload du mésocycle). */
  onEdit?: (session: StrengthSessionTemplate) => void;
}

export function MyPlanSessionSheet({
  session,
  phase,
  onClose,
  onLaunch,
  readOnly = false,
  onEdit,
}: MyPlanSessionSheetProps) {
  const style = phase ? PHASE_STYLES[phase] : null;
  const items = session?.items ?? [];

  return (
    <Sheet open={!!session} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="bottom" className="rounded-t-2xl max-h-[70dvh] overflow-y-auto">
        {session && (
          <>
            <SheetHeader className="pb-3">
              <SheetTitle className="flex items-center gap-2 text-base text-left min-w-0">
                <Dumbbell className="h-4 w-4 shrink-0 text-muted-foreground" />
                <span className="flex-1 min-w-0 truncate">{session.title ?? session.name}</span>
                {style && phase && (
                  <span
                    className={cn(
                      "inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-semibold border-0 shrink-0",
                      style.bg,
                      style.text,
                    )}
                  >
                    {phase.toUpperCase()}
                  </span>
                )}
              </SheetTitle>
              {session.description && (
                <p className="text-xs text-muted-foreground text-left mt-1">
                  {session.description}
                </p>
              )}
            </SheetHeader>

            {items.length > 0 && (
              <ItemsList items={items} />
            )}

            <SheetFooter className="sticky bottom-0 bg-background pt-2 pb-safe flex gap-2 mt-2">
              <Button variant="outline" className="flex-1" onClick={onClose}>
                Fermer
              </Button>
              {onEdit && (
                <Button
                  size="lg"
                  variant="secondary"
                  className="flex-1"
                  onClick={() => onEdit(session)}
                >
                  Éditer la séance
                </Button>
              )}
              {!readOnly && onLaunch && (
                <Button
                  size="lg"
                  className="flex-1"
                  onClick={() => onLaunch(session)}
                >
                  Lancer la séance
                </Button>
              )}
            </SheetFooter>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

/**
 * Liste des items groupés par block (warmup → main).
 *
 * Si TOUS les items sont sans `block` (templates legacy) OU s'il n'y a
 * que du main, on rend sans header (= comportement historique).
 * §296 — distinction visuelle sky pour le warmup.
 */
/** §353 — un item est échauffement si son `warmup_kind` est posé (prioritaire,
 *  couvre l'activation à bucket non-mobility) ou, à défaut (legacy), via `block`. */
function isWarmupItem(i: StrengthSessionItem): boolean {
  return warmupMetaFromItem(i).kind != null || i.block === "warmup";
}

function ItemsList({ items }: { items: StrengthSessionItem[] }) {
  const warmupItems = items.filter(isWarmupItem);
  const mainItems = items.filter((i) => !isWarmupItem(i));
  const hasGroups = warmupItems.length > 0 && mainItems.length > 0;
  const renderLimit = 10;
  // Limite globale = renderLimit items affichés, tous blocs confondus.
  const warmupShown = warmupItems.slice(0, renderLimit);
  const mainShown = mainItems.slice(
    0,
    Math.max(0, renderLimit - warmupShown.length),
  );

  const renderItem = (
    item: StrengthSessionItem,
    displayIdx: number,
    isWarmup: boolean,
  ) => (
    <div
      key={`${item.exercise_id}-${displayIdx}`}
      className={cn(
        "flex items-center gap-2 py-1.5 px-2 rounded-lg",
        isWarmup ? BLOCK_STYLES.warmup.bg : "bg-muted/30",
      )}
    >
      <span
        className={cn(
          "text-[11px] tabular-nums w-5 shrink-0",
          isWarmup
            ? BLOCK_STYLES.warmup.textMuted
            : "text-muted-foreground",
        )}
      >
        {displayIdx + 1}.
      </span>
      <span className="text-[12px] font-medium flex-1 truncate">
        {item.exercise_name ?? `Exercice ${displayIdx + 1}`}
      </span>
      {(() => {
        const meta = warmupMetaFromItem(item);
        const chip =
          meta.kind === "corrective"
            ? correctiveChipLabel(meta.correctiveAxis, meta.correctiveSide)
            : null;
        return chip ? (
          <span
            className={cn(
              "text-[9px] font-bold normal-case shrink-0 rounded px-1 py-0.5",
              BLOCK_STYLES.warmup.badge,
            )}
          >
            {chip}
          </span>
        ) : null;
      })()}
      <span
        className={cn(
          "text-[11px] tabular-nums shrink-0",
          isWarmup
            ? BLOCK_STYLES.warmup.textMuted
            : "text-muted-foreground",
        )}
      >
        {item.sets}×{item.reps}
        {item.percent_1rm > 0 && ` @ ${item.percent_1rm}%`}
      </span>
    </div>
  );

  return (
    <div className="pb-4">
      {warmupShown.length > 0 && (
        <div className="space-y-1 mb-3">
          {/* §353 — sous-sections par warmup_kind (articulaire / correctif /
              activation) ; legacy sans kind → en-tête unique « Échauffement · Mobilité ». */}
          {warmupShown.map((item, i) => {
            const meta = warmupMetaFromItem(item);
            const label = meta.kind
              ? warmupSectionLabel(meta.kind)
              : "Échauffement · Mobilité";
            const prevMeta = i > 0 ? warmupMetaFromItem(warmupShown[i - 1]) : null;
            const prevLabel = !prevMeta
              ? null
              : prevMeta.kind
                ? warmupSectionLabel(prevMeta.kind)
                : "Échauffement · Mobilité";
            return (
              <Fragment key={`w-${item.exercise_id}-${i}`}>
                {label !== prevLabel && (
                  <div className="flex items-center gap-2 px-1 pb-1 pt-1">
                    <span
                      className={cn(
                        "text-[9px] font-bold uppercase tracking-[0.18em]",
                        BLOCK_STYLES.warmup.textMuted,
                      )}
                    >
                      {label}
                    </span>
                    <div className={cn("h-px flex-1", BLOCK_STYLES.warmup.divider)} />
                  </div>
                )}
                {renderItem(item, i, true)}
              </Fragment>
            );
          })}
        </div>
      )}

      {mainShown.length > 0 && (
        <div className="space-y-1">
          {hasGroups && (
            <div className="flex items-center gap-2 px-1 pb-1">
              <span className="text-[9px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
                Bloc principal
              </span>
              <div className="h-px flex-1 bg-border" />
            </div>
          )}
          {mainShown.map((item, i) =>
            renderItem(item, warmupShown.length + i, false),
          )}
        </div>
      )}

      {items.length > renderLimit && (
        <p className="text-[11px] text-muted-foreground text-center pt-2">
          +{items.length - renderLimit} autres exercices
        </p>
      )}
    </div>
  );
}
