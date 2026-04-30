import React, { useState, useEffect } from "react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Slider } from "@/components/ui/slider";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { DEFAULT_ZONES } from "../../../lib/paceCalculator";
import type { ZoneConfig } from "../../../lib/paceCalculator";

export const ZONE_ROWS = [
  { key: "v0_pct" as const, label: "V0", colorClass: "text-intensity-1" },
  { key: "v1_pct" as const, label: "V1", colorClass: "text-intensity-2" },
  { key: "v2_pct" as const, label: "V2", colorClass: "text-intensity-3" },
  { key: "v3_pct" as const, label: "V3", colorClass: "text-intensity-4" },
  { key: "max_pct" as const, label: "Max", colorClass: "text-intensity-5" },
] as const;

export function isZoneOrdered(z: ZoneConfig): boolean {
  return (
    z.v0_pct >= z.v1_pct &&
    z.v1_pct >= z.v2_pct &&
    z.v2_pct >= z.v3_pct &&
    z.v3_pct >= z.max_pct
  );
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentZones: ZoneConfig;
  onSave: (zones: ZoneConfig) => void;
}

export function PaceZonesSettings({ open, onOpenChange, currentZones, onSave }: Props) {
  const [zones, setZones] = useState<ZoneConfig>(currentZones);

  useEffect(() => {
    if (open) setZones(currentZones);
  }, [open]);

  const ordered = isZoneOrdered(zones);

  function set(key: keyof ZoneConfig, value: number) {
    setZones((prev) => ({ ...prev, [key]: Math.min(200, Math.max(80, Math.round(value))) }));
  }

  function handleSave() {
    if (!ordered) return;
    onSave(zones);
    onOpenChange(false);
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-sm">
        <SheetHeader className="border-b border-border/30 px-5 py-4">
          <SheetTitle className="text-sm font-semibold">Zones d'intensité</SheetTitle>
          <SheetDescription className="text-xs text-muted-foreground">
            Pourcentage du temps cible par zone. V0 ≥ V1 ≥ V2 ≥ V3 ≥ Max.
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-5 py-5">
          <div className="space-y-6">
            {ZONE_ROWS.map(({ key, label, colorClass }) => (
              <div key={key} className="space-y-2.5">
                <span className={`flex items-center gap-1.5 ${colorClass}`}>
                  <span className="h-1.5 w-1.5 rounded-full bg-current opacity-80" />
                  <span className="text-[10px] font-semibold uppercase tracking-widest">
                    {label}
                  </span>
                </span>
                <div className="flex items-center gap-3">
                  <Slider
                    min={80}
                    max={200}
                    step={1}
                    value={[zones[key]]}
                    onValueChange={([v]) => set(key, v)}
                    className="flex-1"
                  />
                  <Input
                    type="number"
                    min={80}
                    max={200}
                    value={zones[key]}
                    onChange={(e) => set(key, Number(e.target.value))}
                    className="h-8 w-16 shrink-0 text-center font-mono text-sm"
                  />
                  <span className="w-3 text-right text-xs text-muted-foreground/50">%</span>
                </div>
              </div>
            ))}

            {!ordered && (
              <p className="rounded-md border border-destructive/20 bg-destructive/5 px-3 py-2 text-[11px] text-destructive/80">
                L'ordre doit respecter V0 ≥ V1 ≥ V2 ≥ V3 ≥ Max.
              </p>
            )}
          </div>
        </div>

        <SheetFooter className="border-t border-border/30 bg-background px-5 py-3">
          <div className="flex w-full items-center justify-between gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setZones(DEFAULT_ZONES)}
              className="text-xs text-muted-foreground"
            >
              Réinitialiser
            </Button>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
                Annuler
              </Button>
              <Button size="sm" disabled={!ordered} onClick={handleSave}>
                Enregistrer
              </Button>
            </div>
          </div>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
