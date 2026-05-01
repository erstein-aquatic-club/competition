import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { ZONE_COEFFICIENTS, type EventFamily, type Zone } from "@/lib/paceData";

const FAMILIES: { family: EventFamily; label: string }[] = [
  { family: "50m",        label: "50m" },
  { family: "100m",       label: "100m" },
  { family: "200m",       label: "200m" },
  { family: "400m",       label: "400m" },
  { family: "800m_1500m", label: "800m+" },
];

const MANDATORY_ZONES: { zone: Zone; label: string; colorCls: string }[] = [
  { zone: "V0",  label: "V0",  colorCls: "text-sky-500" },
  { zone: "V1",  label: "V1",  colorCls: "text-teal-500" },
  { zone: "V2",  label: "V2",  colorCls: "text-green-500" },
  { zone: "V3",  label: "V3",  colorCls: "text-amber-500" },
  { zone: "MAX", label: "MAX", colorCls: "text-red-500" },
];

const V4_META = { zone: "V4" as Zone, label: "V4", colorCls: "text-orange-500" };

const FAMILIES_WITH_DEFAULT_V4: EventFamily[] = ["50m", "100m"];

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  zones: Record<EventFamily, Partial<Record<Zone, number>>>;
  onUpsertCell: (args: { event_family: EventFamily; zone: Zone; k_value: number }) => Promise<void>;
  onResetAll: () => Promise<void>;
  onToggleV4: (family: EventFamily) => Promise<void>;
}

/** Exported for unit testing — validates that k-values are strictly increasing in speed order. */
export function isZoneOrderValid(
  local: Partial<Record<Zone, number>>,
  family: EventFamily,
  hasV4: boolean,
): boolean {
  const get = (z: Zone): number =>
    local[z] ?? (ZONE_COEFFICIENTS[family][z as keyof typeof ZONE_COEFFICIENTS[EventFamily]] as number ?? 0);
  const v0 = get("V0"), v1 = get("V1"), v2 = get("V2"), v3 = get("V3"), max = get("MAX");
  if (hasV4) {
    const v4 = get("V4");
    return v0 < v1 && v1 < v2 && v2 < v3 && v3 < v4 && v4 < max;
  }
  return v0 < v1 && v1 < v2 && v2 < v3 && v3 < max;
}

export function PaceZonesSettings({
  open,
  onOpenChange,
  zones,
  onUpsertCell,
  onResetAll,
  onToggleV4,
}: Props) {
  const [localZones, setLocalZones] = useState<Record<EventFamily, Partial<Record<Zone, number>>>>({
    ...zones,
  });

  // Sync from prop when sheet opens
  useEffect(() => {
    if (open) setLocalZones({ ...zones });
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  // Debounce map: key="${family}:${zone}" → timer id
  const debounceMap = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  // Cleanup on unmount
  useEffect(() => {
    const map = debounceMap.current;
    return () => { map.forEach((t) => clearTimeout(t)); };
  }, []);

  const handleSliderChange = useCallback(
    (family: EventFamily, zone: Zone, value: number) => {
      setLocalZones((prev) => ({
        ...prev,
        [family]: { ...prev[family], [zone]: value },
      }));
      const key = `${family}:${zone}`;
      const existing = debounceMap.current.get(key);
      if (existing) clearTimeout(existing);
      debounceMap.current.set(
        key,
        setTimeout(() => {
          onUpsertCell({ event_family: family, zone, k_value: value });
          debounceMap.current.delete(key);
        }, 400),
      );
    },
    [onUpsertCell],
  );

  async function resetFamily(family: EventFamily) {
    const coeffs = ZONE_COEFFICIENTS[family];
    const defaults: Partial<Record<Zone, number>> = {
      V0: coeffs.V0, V1: coeffs.V1, V2: coeffs.V2, V3: coeffs.V3, MAX: coeffs.MAX,
    };
    if (coeffs.V4 !== null) defaults.V4 = coeffs.V4;
    setLocalZones((prev) => ({ ...prev, [family]: defaults }));
    const upserts = (["V0", "V1", "V2", "V3", "MAX"] as Zone[]).map((z) =>
      onUpsertCell({ event_family: family, zone: z, k_value: coeffs[z] as number }),
    );
    if (coeffs.V4 !== null) {
      upserts.push(onUpsertCell({ event_family: family, zone: "V4", k_value: coeffs.V4 }));
    }
    await Promise.all(upserts);
  }

  async function handleResetAll() {
    await onResetAll();
    // Sync local state to defaults
    const defaults = Object.fromEntries(
      FAMILIES.map(({ family }) => {
        const c = ZONE_COEFFICIENTS[family];
        const z: Partial<Record<Zone, number>> = {
          V0: c.V0, V1: c.V1, V2: c.V2, V3: c.V3, MAX: c.MAX,
        };
        if (c.V4 !== null) z.V4 = c.V4;
        return [family, z];
      }),
    ) as Record<EventFamily, Partial<Record<Zone, number>>>;
    setLocalZones(defaults);
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-md">
        <SheetHeader className="border-b border-border/30 px-5 py-4 shrink-0">
          <SheetTitle className="text-sm font-semibold">
            Coefficients de zones
          </SheetTitle>
          <p className="text-[11px] text-muted-foreground leading-snug">
            Coefficient k (vitesse relative). Ordre requis : V0 &lt; V1 &lt; V2 &lt; V3 &lt; V4 &lt; MAX.
          </p>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto">
          <Tabs defaultValue="50m" className="h-full flex flex-col">
            <TabsList className="mx-4 mt-3 mb-0 shrink-0 grid grid-cols-5 h-9">
              {FAMILIES.map(({ family, label }) => (
                <TabsTrigger
                  key={family}
                  value={family}
                  className="text-[10px] font-semibold px-1"
                >
                  {label}
                </TabsTrigger>
              ))}
            </TabsList>

            {FAMILIES.map(({ family }) => {
              const localFamily = localZones[family] ?? {};
              const defaultCoeffs = ZONE_COEFFICIENTS[family];
              const alwaysHasV4 = FAMILIES_WITH_DEFAULT_V4.includes(family);
              const hasV4 = localFamily["V4"] !== undefined || zones[family]?.["V4"] !== undefined;
              const valid = isZoneOrderValid(localFamily, family, hasV4);

              return (
                <TabsContent key={family} value={family} className="flex-1 overflow-y-auto mt-0">
                  <div className="px-5 py-4 space-y-5">
                    {/* Mandatory zones + V4 */}
                    {MANDATORY_ZONES.map(({ zone, label, colorCls }) => {
                      const current = localFamily[zone] ?? (defaultCoeffs[zone] as number);
                      const isMAX = zone === "MAX";
                      return (
                        <ZoneSliderRow
                          key={zone}
                          label={label}
                          colorCls={colorCls}
                          value={current}
                          step={isMAX ? 0.005 : 0.005}
                          max={1.00}
                          onChange={(v) => handleSliderChange(family, zone, v)}
                        />
                      );
                    })}

                    {/* V4 row */}
                    {alwaysHasV4 ? (
                      <ZoneSliderRow
                        label={V4_META.label}
                        colorCls={V4_META.colorCls}
                        value={localFamily["V4"] ?? (defaultCoeffs.V4 as number)}
                        onChange={(v) => handleSliderChange(family, "V4", v)}
                      />
                    ) : (
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className={`text-[10px] font-bold uppercase tracking-widest ${V4_META.colorCls}`}>
                              {V4_META.label}
                            </span>
                            <span className="text-[9px] text-muted-foreground/50">optionnelle</span>
                          </div>
                          <Switch
                            checked={hasV4}
                            onCheckedChange={() => onToggleV4(family)}
                            aria-label={`Activer V4 pour ${family}`}
                          />
                        </div>
                        {hasV4 && (
                          <ZoneSliderRow
                            label=""
                            colorCls={V4_META.colorCls}
                            value={localFamily["V4"] ?? (defaultCoeffs.V4 ?? 0.985)}
                            onChange={(v) => handleSliderChange(family, "V4", v)}
                          />
                        )}
                      </div>
                    )}

                    {/* Validation warning */}
                    {!valid && (
                      <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2">
                        <p className="text-[11px] text-destructive/80">
                          Ordre de vitesse non respecté. Correction requise avant l'enregistrement.
                        </p>
                      </div>
                    )}

                    {/* Reset family */}
                    <div className="pt-2 border-t border-border/20">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-xs text-muted-foreground hover:text-foreground w-full justify-start"
                        onClick={() => resetFamily(family)}
                      >
                        Réinitialiser cette famille
                      </Button>
                    </div>
                  </div>
                </TabsContent>
              );
            })}
          </Tabs>
        </div>

        {/* Footer — reset all */}
        <div className="border-t border-border/30 bg-background px-5 py-3 shrink-0">
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive" size="sm" className="w-full text-xs">
                Réinitialiser toutes les familles
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle className="text-base">
                  Réinitialiser toutes les familles ?
                </AlertDialogTitle>
                <AlertDialogDescription className="text-sm">
                  Tous les coefficients reviendront aux valeurs par défaut (doc §4).
                  Cette action supprime vos ajustements personnalisés.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Annuler</AlertDialogCancel>
                <AlertDialogAction
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  onClick={handleResetAll}
                >
                  Réinitialiser
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </SheetContent>
    </Sheet>
  );
}

// ─── Sub-component ─────────────────────────────────────────────────────────

interface ZoneSliderRowProps {
  label: string;
  colorCls: string;
  value: number;
  min?: number;
  max?: number;
  step?: number;
  onChange: (v: number) => void;
}

function ZoneSliderRow({
  label,
  colorCls,
  value,
  min = 0.50,
  max = 1.00,
  step = 0.005,
  onChange,
}: ZoneSliderRowProps) {
  return (
    <div className="space-y-2">
      {label && (
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <span className={`h-1.5 w-1.5 rounded-full bg-current ${colorCls}`} />
            <span className={`text-[10px] font-bold uppercase tracking-widest ${colorCls}`}>
              {label}
            </span>
          </div>
          <span className="font-mono text-[11px] text-muted-foreground tabular-nums">
            {value.toFixed(3)}
          </span>
        </div>
      )}
      <Slider
        min={min}
        max={max}
        step={step}
        value={[value]}
        onValueChange={([v]) => onChange(v)}
        className="w-full"
      />
    </div>
  );
}
