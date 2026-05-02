import React, { useEffect, useState } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { Objective } from "@/lib/api";
import type { PaceTarget } from "@/lib/api/pace-targets";
import PaceMatrixInline from "@/components/coach/pace/PaceMatrixInline";
import { EventProgressionContent } from "@/components/shared/EventProgressionSheet";
import { eventLabel } from "@/lib/objectiveHelpers";
import { parseObjectiveForPace } from "@/lib/objective-pace-link";

type Tab = "allures" | "progression";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  objective: Objective | null;
  matchingTarget: PaceTarget | null;
  iuf: string | null;
}

export function ObjectiveDetailSheet({
  open,
  onOpenChange,
  objective,
  matchingTarget,
  iuf,
}: Props) {
  const [tab, setTab] = useState<Tab>("allures");

  useEffect(() => {
    if (open) setTab("allures");
  }, [open]);

  if (!objective?.event_code) return null;

  const parsed = parseObjectiveForPace(objective.event_code, objective.pool_length);
  const targetTimeMs = parsed != null && objective.target_time_seconds != null
    ? objective.target_time_seconds * 1000
    : null;
  // Toggle shown when objective is parseable + has a target time — no DB target required
  const canShowAllures = parsed != null && targetTimeMs != null;

  // Default to 25m when pool_length is unknown — mirrors SwimmerObjectivesView convention
  const poolLength: 25 | 50 = objective.pool_length === 50 ? 50 : 25;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[90dvh] overflow-y-auto rounded-t-3xl">
        <SheetHeader className="text-left">
          <SheetTitle>{eventLabel(objective.event_code)}</SheetTitle>
        </SheetHeader>

        {canShowAllures && (
          <div className="mt-4">
            <ToggleGroup
              type="single"
              variant="outline"
              value={tab}
              onValueChange={(v) => {
                if (v) setTab(v as Tab);
              }}
              className="w-full"
            >
              <ToggleGroupItem value="allures" className="flex-1 text-xs h-8">
                Allures
              </ToggleGroupItem>
              <ToggleGroupItem value="progression" className="flex-1 text-xs h-8">
                Progression
              </ToggleGroupItem>
            </ToggleGroup>
          </div>
        )}

        <div className="mt-4">
          {canShowAllures && tab === "allures" && parsed && targetTimeMs != null ? (
            <PaceMatrixInline
              targetTimeMs={targetTimeMs}
              targetDistance={parsed.distance}
              stroke={parsed.stroke}
              targetPoolSize={matchingTarget?.target_pool_size ?? parsed.pool_size}
              swimmerSex={null}
              compact={false}
            />
          ) : (
            <EventProgressionContent
              eventCode={objective.event_code}
              poolLength={poolLength}
              iuf={iuf}
              targetTime={objective.target_time_seconds}
              active={tab === "progression" || !canShowAllures}
            />
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
