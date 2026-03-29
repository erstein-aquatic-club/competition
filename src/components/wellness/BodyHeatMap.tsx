/**
 * BodyHeatMap — Wrapper for BodySvg with front/back toggle and state management.
 */

import { useState, useCallback } from "react";
import { BodySvg, BODY_ZONES } from "./BodySvg";

export interface BodyHeatMapProps {
  selectedZones: Record<string, number>;
  onChange: (zones: Record<string, number>) => void;
  mode?: "edit" | "view";
  viewData?: Record<string, number>;
}

export function BodyHeatMap({
  selectedZones,
  onChange,
  mode = "edit",
  viewData,
}: BodyHeatMapProps) {
  const [side, setSide] = useState<"front" | "back">("front");

  const handleZoneToggle = useCallback(
    (zoneId: string, intensity: number | null) => {
      const next = { ...selectedZones };
      if (intensity === null) {
        delete next[zoneId];
      } else {
        next[zoneId] = intensity;
      }
      onChange(next);
    },
    [selectedZones, onChange],
  );

  const activeCount = Object.keys(selectedZones).length;
  const frontCount = Object.keys(selectedZones).filter((z) =>
    BODY_ZONES.find((b) => b.id === z)?.side === "front",
  ).length;
  const backCount = Object.keys(selectedZones).filter((z) =>
    BODY_ZONES.find((b) => b.id === z)?.side === "back",
  ).length;

  // For view mode, count from viewData
  const viewFrontCount = viewData
    ? Object.keys(viewData).filter((z) =>
        BODY_ZONES.find((b) => b.id === z)?.side === "front",
      ).length
    : 0;
  const viewBackCount = viewData
    ? Object.keys(viewData).filter((z) =>
        BODY_ZONES.find((b) => b.id === z)?.side === "back",
      ).length
    : 0;

  return (
    <div className="space-y-3">
      {/* Toggle front/back */}
      <div className="flex justify-center gap-1.5">
        <button
          type="button"
          onClick={() => setSide("front")}
          className={[
            "px-3 py-1.5 rounded-lg text-xs font-semibold transition-all",
            side === "front"
              ? "bg-primary text-primary-foreground"
              : "bg-muted text-muted-foreground hover:bg-muted/70",
          ].join(" ")}
        >
          Face avant
          {mode === "edit" && frontCount > 0 && (
            <span className="ml-1 inline-flex h-4 w-4 items-center justify-center rounded-full bg-white/20 text-[9px]">
              {frontCount}
            </span>
          )}
          {mode === "view" && viewFrontCount > 0 && (
            <span className="ml-1 inline-flex h-4 w-4 items-center justify-center rounded-full bg-white/20 text-[9px]">
              {viewFrontCount}
            </span>
          )}
        </button>
        <button
          type="button"
          onClick={() => setSide("back")}
          className={[
            "px-3 py-1.5 rounded-lg text-xs font-semibold transition-all",
            side === "back"
              ? "bg-primary text-primary-foreground"
              : "bg-muted text-muted-foreground hover:bg-muted/70",
          ].join(" ")}
        >
          Face arrière
          {mode === "edit" && backCount > 0 && (
            <span className="ml-1 inline-flex h-4 w-4 items-center justify-center rounded-full bg-white/20 text-[9px]">
              {backCount}
            </span>
          )}
          {mode === "view" && viewBackCount > 0 && (
            <span className="ml-1 inline-flex h-4 w-4 items-center justify-center rounded-full bg-white/20 text-[9px]">
              {viewBackCount}
            </span>
          )}
        </button>
      </div>

      {/* Body SVG */}
      <div className="flex justify-center">
        <BodySvg
          selectedZones={selectedZones}
          onZoneToggle={handleZoneToggle}
          mode={mode}
          viewData={viewData}
          side={side}
        />
      </div>

      {/* Legend */}
      {mode === "edit" && (
        <div className="flex justify-center gap-3 text-[10px] text-muted-foreground">
          <span className="flex items-center gap-1">
            <span className="inline-block h-2.5 w-2.5 rounded-full bg-yellow-500/70" />
            Légère
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block h-2.5 w-2.5 rounded-full bg-orange-500/75" />
            Modérée
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block h-2.5 w-2.5 rounded-full bg-red-500/80" />
            Forte
          </span>
        </div>
      )}

      {/* Active zones list */}
      {mode === "edit" && activeCount > 0 && (
        <div className="flex flex-wrap gap-1.5 justify-center">
          {BODY_ZONES.filter((z) => selectedZones[z.id]).map((z) => {
            const intensity = selectedZones[z.id];
            const colorClass =
              intensity === 1
                ? "bg-yellow-500/20 text-yellow-700 dark:text-yellow-400 border-yellow-500/30"
                : intensity === 2
                  ? "bg-orange-500/20 text-orange-700 dark:text-orange-400 border-orange-500/30"
                  : "bg-red-500/20 text-red-700 dark:text-red-400 border-red-500/30";
            return (
              <span
                key={z.id}
                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium border ${colorClass}`}
              >
                {z.label}
                <button
                  type="button"
                  onClick={() => handleZoneToggle(z.id, null)}
                  className="ml-0.5 hover:opacity-70"
                  aria-label={`Retirer ${z.label}`}
                >
                  x
                </button>
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}
