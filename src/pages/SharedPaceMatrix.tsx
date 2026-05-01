import React, { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { AlertCircle, Gauge } from "lucide-react";
import { getPaceSharePayload } from "@/lib/api/pace-share";
import { PaceMatrix } from "@/components/coach/pace/PaceMatrix";
import type { PaceSharePayload } from "@/lib/api/pace-share";
import { normalizeStroke } from "@/lib/paceCalculatorV2";
import { ZONE_COEFFICIENTS, STROKE_ADJUSTMENTS_DEFAULT, type EventFamily, type Zone } from "@/lib/paceData";

// Fallback v2 zones (Task 28 will consume zones_v2 from the share payload)
const FALLBACK_ZONES: Record<EventFamily, Partial<Record<Zone, number>>> = {
  "50m":        { V0: ZONE_COEFFICIENTS["50m"].V0,        V1: ZONE_COEFFICIENTS["50m"].V1,        V2: ZONE_COEFFICIENTS["50m"].V2,        V3: ZONE_COEFFICIENTS["50m"].V3,        V4: ZONE_COEFFICIENTS["50m"].V4 ?? undefined,        MAX: ZONE_COEFFICIENTS["50m"].MAX },
  "100m":       { V0: ZONE_COEFFICIENTS["100m"].V0,       V1: ZONE_COEFFICIENTS["100m"].V1,       V2: ZONE_COEFFICIENTS["100m"].V2,       V3: ZONE_COEFFICIENTS["100m"].V3,       V4: ZONE_COEFFICIENTS["100m"].V4 ?? undefined,       MAX: ZONE_COEFFICIENTS["100m"].MAX },
  "200m":       { V0: ZONE_COEFFICIENTS["200m"].V0,       V1: ZONE_COEFFICIENTS["200m"].V1,       V2: ZONE_COEFFICIENTS["200m"].V2,       V3: ZONE_COEFFICIENTS["200m"].V3,       V4: ZONE_COEFFICIENTS["200m"].V4 ?? undefined,       MAX: ZONE_COEFFICIENTS["200m"].MAX },
  "400m":       { V0: ZONE_COEFFICIENTS["400m"].V0,       V1: ZONE_COEFFICIENTS["400m"].V1,       V2: ZONE_COEFFICIENTS["400m"].V2,       V3: ZONE_COEFFICIENTS["400m"].V3,       MAX: ZONE_COEFFICIENTS["400m"].MAX },
  "800m_1500m": { V0: ZONE_COEFFICIENTS["800m_1500m"].V0, V1: ZONE_COEFFICIENTS["800m_1500m"].V1, V2: ZONE_COEFFICIENTS["800m_1500m"].V2, V3: ZONE_COEFFICIENTS["800m_1500m"].V3, MAX: ZONE_COEFFICIENTS["800m_1500m"].MAX },
};

function formatTargetLabel(stroke: string, distM: number, poolSize?: string): string {
  const dist = distM >= 1000 ? `${distM / 1000} km` : `${distM} m`;
  const pool = poolSize ?? "50m";
  return `${stroke} ${dist} · ${pool}`;
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

  const sortedTargets = [...data.targets].sort((a, b) => a.stroke.localeCompare(b.stroke));

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-lg px-4 pb-16 pt-8">
        {/* Header */}
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
            {sortedTargets.map((target) => (
              <AccordionItem key={target.id} value={target.id} className="border-b border-border/30">
                <AccordionTrigger className="hover:no-underline px-0 py-3 text-sm font-semibold">
                  {formatTargetLabel(target.stroke, target.target_distance_m, target.target_pool_size)}
                </AccordionTrigger>
                <AccordionContent className="pb-4">
                  <PaceMatrix
                    targetTimeMs={target.target_time_ms}
                    targetDistanceM={target.target_distance_m}
                    stroke={normalizeStroke(target.stroke)}
                    zones={FALLBACK_ZONES}
                    strokeAdjustments={STROKE_ADJUSTMENTS_DEFAULT}
                    swimmerSex={data.swimmer_sex ?? null}
                    targetPool={target.target_pool_size}
                    v4EnabledForFamily={false}
                  />
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        )}

        <p className="mt-8 text-center text-[10px] text-muted-foreground/60">
          Partagé via Erstein Aquatic Club · lecture seule
        </p>
      </div>
    </div>
  );
}
