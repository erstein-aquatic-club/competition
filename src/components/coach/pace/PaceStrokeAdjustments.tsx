import React, { useState, useRef, useCallback, useEffect } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
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
import { STROKE_ADJUSTMENTS_DEFAULT, type EventFamily } from "@/lib/paceData";
import type { StrokeAdjustmentRow } from "@/lib/api/pace-stroke-adjustments";

type SingleStroke = "crawl" | "dos" | "brasse" | "papillon";

const FAMILIES: EventFamily[] = ["50m", "100m", "200m", "400m", "800m_1500m"];
const FAMILY_LABELS: Record<EventFamily, string> = {
  "50m": "50m", "100m": "100m", "200m": "200m", "400m": "400m", "800m_1500m": "800m+",
};

const ADJUSTABLE_STROKES: { stroke: SingleStroke; label: string; accentCls: string; rowBg: string }[] = [
  { stroke: "dos",      label: "Dos",      accentCls: "text-sky-500",     rowBg: "bg-sky-500/5"     },
  { stroke: "brasse",   label: "Brasse",   accentCls: "text-emerald-500", rowBg: "bg-emerald-500/5" },
  { stroke: "papillon", label: "Papillon", accentCls: "text-violet-500",  rowBg: "bg-violet-500/5"  },
];

/** Exported for unit testing — true if the DB has a custom override for this (stroke, family) cell. */
export function isCellOverridden(
  stroke: SingleStroke,
  family: EventFamily,
  overrides: StrokeAdjustmentRow[],
): boolean {
  return overrides.some((r) => r.stroke === stroke && r.event_family === family);
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  adjustments: Record<SingleStroke, Record<EventFamily, number>>;
  overrides: StrokeAdjustmentRow[];
  onUpsertOne: (args: { stroke: SingleStroke; event_family: EventFamily; m_value: number }) => Promise<void>;
  onResetAll: () => Promise<void>;
}

export function PaceStrokeAdjustments({
  open,
  onOpenChange,
  adjustments,
  overrides,
  onUpsertOne,
  onResetAll,
}: Props) {
  const [local, setLocal] = useState<Record<SingleStroke, Record<EventFamily, number>>>({
    crawl:    { ...adjustments.crawl },
    dos:      { ...adjustments.dos },
    brasse:   { ...adjustments.brasse },
    papillon: { ...adjustments.papillon },
  });

  useEffect(() => {
    if (open) {
      setLocal({
        crawl:    { ...adjustments.crawl },
        dos:      { ...adjustments.dos },
        brasse:   { ...adjustments.brasse },
        papillon: { ...adjustments.papillon },
      });
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const debounceMap = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  useEffect(() => {
    const map = debounceMap.current;
    return () => { map.forEach((t) => clearTimeout(t)); };
  }, []);

  const handleChange = useCallback(
    (stroke: SingleStroke, family: EventFamily, value: number) => {
      setLocal((prev) => ({ ...prev, [stroke]: { ...prev[stroke], [family]: value } }));
      const key = `${stroke}:${family}`;
      const existing = debounceMap.current.get(key);
      if (existing) clearTimeout(existing);
      debounceMap.current.set(
        key,
        setTimeout(() => {
          onUpsertOne({ stroke, event_family: family, m_value: value });
          debounceMap.current.delete(key);
        }, 400),
      );
    },
    [onUpsertOne],
  );

  async function handleResetAll() {
    await onResetAll();
    setLocal({
      crawl:    { ...STROKE_ADJUSTMENTS_DEFAULT.crawl },
      dos:      { ...STROKE_ADJUSTMENTS_DEFAULT.dos },
      brasse:   { ...STROKE_ADJUSTMENTS_DEFAULT.brasse },
      papillon: { ...STROKE_ADJUSTMENTS_DEFAULT.papillon },
    });
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-md">
        <SheetHeader className="border-b border-border/30 px-5 py-4 shrink-0">
          <SheetTitle className="text-sm font-semibold">
            Ajustements par nage (mS)
          </SheetTitle>
          <p className="text-[11px] text-muted-foreground leading-snug">
            Module l'allure par nage selon (1 − d/D)². Valeur 0 = même courbe que le crawl (référence).
          </p>
        </SheetHeader>

        <div className="flex-1 overflow-auto px-3 py-4">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  <th className="w-[76px] pb-2.5 pr-2 text-left text-[9px] font-semibold uppercase tracking-widest text-muted-foreground/50">
                    Nage
                  </th>
                  {FAMILIES.map((f) => (
                    <th key={f} className="pb-2.5 px-1 text-center text-[9px] font-semibold uppercase tracking-widest text-muted-foreground/50">
                      {FAMILY_LABELS[f]}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border/15">
                {/* Crawl — read-only reference row */}
                <tr className="bg-muted/15">
                  <td className="py-3 pr-2">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/35">
                      Crawl
                    </span>
                    <span className="ml-1 text-[8px] text-muted-foreground/30">réf.</span>
                  </td>
                  {FAMILIES.map((f) => (
                    <td key={f} className="py-3 px-1 text-center">
                      <span className="font-mono text-[11px] tabular-nums text-muted-foreground/30">
                        0.000
                      </span>
                    </td>
                  ))}
                </tr>

                {/* Adjustable strokes */}
                {ADJUSTABLE_STROKES.map(({ stroke, label, accentCls, rowBg }) => (
                  <tr key={stroke} className={rowBg}>
                    <td className="py-2.5 pr-2">
                      <span className={`text-[10px] font-bold uppercase tracking-widest ${accentCls}`}>
                        {label}
                      </span>
                    </td>
                    {FAMILIES.map((f) => {
                      const val = local[stroke][f];
                      const overridden = isCellOverridden(stroke, f, overrides);
                      return (
                        <td key={f} className="py-2 px-0.5 text-center">
                          <div className="flex flex-col items-center gap-0.5">
                            <input
                              type="number"
                              min="-0.20"
                              max="0.20"
                              step="0.005"
                              value={val.toFixed(3)}
                              onChange={(e) => {
                                const n = parseFloat(e.target.value);
                                if (isNaN(n)) return;
                                handleChange(stroke, f, Math.max(-0.20, Math.min(0.20, n)));
                              }}
                              className="h-7 w-[52px] rounded border border-border/40 bg-background text-center font-mono text-[11px] tabular-nums focus:outline-none focus:ring-1 focus:ring-ring"
                            />
                            {overridden && (
                              <span className="text-[8px] font-semibold uppercase tracking-wide text-amber-500">
                                perso
                              </span>
                            )}
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="border-t border-border/30 bg-background px-5 py-3 shrink-0 space-y-3">
          <p className="text-[10px] text-muted-foreground/45 leading-relaxed">
            Médianes doc §7 — Dos : 0.06/0.045/0.02/0.01/0.01. Brasse : 0.04/0.035/0.025/0.01/0.01.
            Papillon : 0.00/0.00/0.01/0.01/0.01. Crawl = référence (mS = 0).
          </p>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive" size="sm" className="w-full text-xs">
                Réinitialiser aux médianes du doc
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle className="text-base">
                  Réinitialiser les ajustements ?
                </AlertDialogTitle>
                <AlertDialogDescription className="text-sm">
                  Tous les coefficients mS reviendront aux médianes documentées (§7).
                  Vos ajustements personnalisés seront supprimés.
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
