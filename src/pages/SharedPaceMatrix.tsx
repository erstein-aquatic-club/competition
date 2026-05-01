import React, { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { AlertCircle, Gauge } from "lucide-react";
import { getPaceSharePayload } from "@/lib/api/pace-share";
import { PaceMatrix } from "@/components/coach/pace/PaceMatrix";
import { Pace4NSegmentMatrix } from "@/components/coach/pace/Pace4NSegmentMatrix";
import type { PaceSharePayload } from "@/lib/api/pace-share";
import { normalizeStroke, eventFamily } from "@/lib/paceCalculatorV2";
import { ZONE_COEFFICIENTS, STROKE_ADJUSTMENTS_DEFAULT, type EventFamily, type Zone } from "@/lib/paceData";

const FAMILIES: EventFamily[] = ["50m", "100m", "200m", "400m", "800m_1500m"];

/** Pure helper — exported for testing. Merges zones_v2 payload overlay on top of ZONE_COEFFICIENTS defaults. */
export function mergeZonesFromPayload(
  zones_v2: Record<string, Record<string, number>> | undefined,
): Record<EventFamily, Partial<Record<Zone, number>>> {
  const result = {} as Record<EventFamily, Partial<Record<Zone, number>>>;
  for (const f of FAMILIES) {
    const c = ZONE_COEFFICIENTS[f];
    const defaults: Partial<Record<Zone, number>> = {
      V0: c.V0, V1: c.V1, V2: c.V2, V3: c.V3, MAX: c.MAX,
    };
    if (c.V4 !== null) defaults.V4 = c.V4;
    const raw = zones_v2?.[f] ?? {};
    for (const [k, v] of Object.entries(raw)) {
      (defaults as Record<string, number>)[k] = v;
    }
    result[f] = defaults;
  }
  return result;
}

function formatTargetLabel(stroke: string, distM: number, poolSize?: string | null): string {
  const dist = distM >= 1000 ? `${distM / 1000} km` : `${distM} m`;
  const pool = poolSize ?? "50m";
  return `${stroke} ${dist} · ${pool}`;
}

/** Exported for unit testing — renders the loaded (non-expired) state. Read-only, no mutations. */
export function SharedPaceMatrixContent({ data }: { data: PaceSharePayload }) {
  const mergedZones = mergeZonesFromPayload(data.zones_v2);
  const v4ByFamily: Record<EventFamily, boolean> = {
    "50m":        true,
    "100m":       true,
    "200m":       mergedZones["200m"].V4 !== undefined,
    "400m":       mergedZones["400m"].V4 !== undefined,
    "800m_1500m": mergedZones["800m_1500m"].V4 !== undefined,
  };

  const sortedTargets = [...data.targets].sort((a, b) => a.stroke.localeCompare(b.stroke));

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-lg px-4 pb-16 pt-8">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-cyan-100 dark:bg-cyan-900/30">
            <Gauge className="h-5 w-5 text-cyan-600" />
          </div>
          <div>
            <h1 className="text-base font-semibold">{data.swimmer_name}</h1>
            <p className="text-[11px] text-muted-foreground uppercase tracking-widest">
              Calculateur d'allures
            </p>
          </div>
        </div>

        {sortedTargets.length === 0 ? (
          <p className="text-sm text-muted-foreground">Aucune cible enregistrée.</p>
        ) : (
          <Accordion type="multiple" defaultValue={sortedTargets.map((t) => t.id)}>
            {sortedTargets.map((target) => {
              const is4N =
                target.stroke === "4N" &&
                (target.target_distance_m === 200 || target.target_distance_m === 400);
              return (
                <AccordionItem key={target.id} value={target.id} className="border-b border-border/30">
                  <AccordionTrigger className="hover:no-underline px-0 py-3 text-sm font-semibold">
                    {formatTargetLabel(target.stroke, target.target_distance_m, target.target_pool_size)}
                  </AccordionTrigger>
                  <AccordionContent className="pb-4">
                    {is4N ? (
                      <Pace4NSegmentMatrix
                        targetTimeMs={target.target_time_ms}
                        targetDistanceM={target.target_distance_m as 200 | 400}
                        swimmerSex={data.swimmer_sex ?? null}
                        targetPool={target.target_pool_size}
                        zones={mergedZones}
                        strokeAdjustments={STROKE_ADJUSTMENTS_DEFAULT}
                      />
                    ) : (
                      <PaceMatrix
                        targetTimeMs={target.target_time_ms}
                        targetDistanceM={target.target_distance_m}
                        stroke={normalizeStroke(target.stroke)}
                        zones={mergedZones}
                        strokeAdjustments={STROKE_ADJUSTMENTS_DEFAULT}
                        swimmerSex={data.swimmer_sex ?? null}
                        targetPool={target.target_pool_size}
                        v4EnabledForFamily={v4ByFamily[eventFamily(target.target_distance_m)]}
                      />
                    )}
                  </AccordionContent>
                </AccordionItem>
              );
            })}
          </Accordion>
        )}

        <p className="mt-8 text-center text-[10px] text-muted-foreground/60">
          Partagé via Erstein Aquatic Club · lecture seule
        </p>
      </div>
    </div>
  );
}

export default function SharedPaceMatrix() {
  const [location] = useLocation();
  const [data, setData] = useState<PaceSharePayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [expired, setExpired] = useState(false);

  const token = location.split("/share/pace/")[1]?.split("?")[0] ?? "";

  useEffect(() => {
    if (!token) {
      setExpired(true);
      setLoading(false);
      return;
    }
    let cancelled = false;
    getPaceSharePayload(token)
      .then((result) => {
        if (cancelled) return;
        if (result) {
          setData(result);
        } else {
          setExpired(true);
        }
        setLoading(false);
      })
      .catch(() => {
        if (!cancelled) {
          setExpired(true);
          setLoading(false);
        }
      });
    return () => { cancelled = true; };
  }, [token]);

  if (loading) {
    return (
      <div className="min-h-screen bg-background p-4 pt-10">
        <div className="mx-auto max-w-lg space-y-4">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-5 w-32" />
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-24 w-full" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (expired || !data) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background p-6 text-center">
        <AlertCircle className="h-10 w-10 text-destructive" />
        <h1 className="text-lg font-semibold">Lien expiré ou invalide</h1>
        <p className="text-sm text-muted-foreground">Ce lien de partage n'est plus actif.</p>
        <Button variant="outline" onClick={() => { window.location.hash = "/"; }}>
          Retour à l'accueil
        </Button>
      </div>
    );
  }

  return <SharedPaceMatrixContent data={data} />;
}
