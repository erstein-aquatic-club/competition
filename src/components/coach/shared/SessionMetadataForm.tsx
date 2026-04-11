import React from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

interface SessionMetadataFormProps {
  name: string;
  onNameChange: (value: string) => void;
  estimatedDuration?: number;
  onEstimatedDurationChange?: (value: number) => void;
  totalDistance?: number;
  showDuration?: boolean;
  showTotalDistance?: boolean;
  additionalFields?: React.ReactNode;
  collapsible?: boolean;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
  collapsedSummary?: React.ReactNode;
}

export function SessionMetadataForm({
  name,
  onNameChange,
  estimatedDuration,
  onEstimatedDurationChange,
  totalDistance,
  showDuration = true,
  showTotalDistance = true,
  additionalFields,
  collapsible = false,
  collapsed = false,
  onToggleCollapse,
  collapsedSummary,
}: SessionMetadataFormProps) {
  return (
    <Card className="rounded-2xl border-border">
      <div className="space-y-3 p-4">
        <button
          type="button"
          className={cn(
            "flex w-full items-center justify-between text-left",
            collapsible && "cursor-pointer"
          )}
          onClick={collapsible ? onToggleCollapse : undefined}
          disabled={!collapsible}
        >
          <div className="text-sm font-semibold">Infos séance</div>
          {collapsible && (
            <ChevronDown
              className={cn(
                "h-4 w-4 text-muted-foreground transition-transform",
                !collapsed && "rotate-180"
              )}
            />
          )}
        </button>

        {collapsible && collapsed && collapsedSummary && (
          <div className="pt-1">{collapsedSummary}</div>
        )}

        {(!collapsible || !collapsed) && (
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <div className="text-xs font-semibold text-muted-foreground">Nom</div>
              <div className="mt-1">
                <Input
                  value={name}
                  onChange={(e) => onNameChange(e.target.value)}
                  placeholder="Nom de la séance"
                  className="rounded-2xl"
                  maxLength={200}
                />
              </div>
            </div>

            {showDuration && onEstimatedDurationChange && (
              <div>
                <div className="text-xs font-semibold text-muted-foreground">Durée estimée (min)</div>
                <div className="mt-1">
                  <Input
                    type="number"
                    min={0}
                    value={estimatedDuration || ""}
                    onChange={(e) =>
                      onEstimatedDurationChange(e.target.value === "" ? 0 : Number(e.target.value))
                    }
                    placeholder="55"
                    className="rounded-2xl"
                  />
                </div>
              </div>
            )}

            {showTotalDistance && totalDistance !== undefined && (
              <div>
                <div className="text-xs font-semibold text-muted-foreground">Distance totale</div>
                <div className="mt-1 rounded-2xl border border-border bg-muted px-3 py-2 text-sm font-semibold">
                  {totalDistance}m
                </div>
              </div>
            )}

            {additionalFields}
          </div>
        )}
      </div>
    </Card>
  );
}
