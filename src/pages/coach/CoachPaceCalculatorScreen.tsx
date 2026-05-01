import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Accordion } from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { SlidersHorizontal, Waves, Zap } from "lucide-react";
import CoachSectionHeader from "./CoachSectionHeader";
import { PaceTeamPanel } from "@/components/coach/pace/PaceTeamPanel";
import { PaceZonesSettings } from "@/components/coach/pace/PaceZonesSettings";
import { PaceStrokeAdjustments } from "@/components/coach/pace/PaceStrokeAdjustments";
import { SwimmerPaceCard, buildSwimmerRef } from "@/components/coach/pace/SwimmerPaceCard";
import { useMyTeam } from "@/hooks/useMyTeam";
import { useCoachPaceZonesV2 } from "@/hooks/useCoachPaceZonesV2";
import { useCoachStrokeAdjustments } from "@/hooks/useCoachStrokeAdjustments";
import { listMyPaceTargets, upsertPaceTarget, deletePaceTarget } from "@/lib/api/pace-targets";
import { ZONE_COEFFICIENTS, type EventFamily, type Zone } from "@/lib/paceData";
import { DEFAULT_ZONES } from "@/lib/paceCalculator"; // TODO Task 27: remove when pdf supports v2 zones
import { exportPacePdf as exportPacePdfFn } from "@/lib/export-pace-pdf";
import { downloadBlob } from "@/lib/downloadBlob";
import { createPaceShareLink } from "@/lib/api/pace-share";
import type { AthleteSummary } from "@/lib/api/types";
import type { PaceTarget, SwimmerRef } from "@/lib/api/pace-targets";
import type { TeamMember } from "@/hooks/useMyTeam";

const FAMILIES: EventFamily[] = ["50m", "100m", "200m", "400m", "800m_1500m"];
const TOGGLABLE_FAMILIES: { family: EventFamily; label: string }[] = [
  { family: "200m", label: "200m" },
  { family: "400m", label: "400m" },
  { family: "800m_1500m", label: "800m+" },
];

export function belongsTo(target: PaceTarget, swimmer: TeamMember): boolean {
  return swimmer.kind === "account"
    ? target.swimmer_account_id === swimmer.accountId
    : target.swimmer_manual_id === swimmer.manualId;
}

function mergeZonesWithDefaults(
  raw: Partial<Record<EventFamily, Partial<Record<Zone, number>>>> | undefined,
): Record<EventFamily, Partial<Record<Zone, number>>> {
  const result = {} as Record<EventFamily, Partial<Record<Zone, number>>>;
  for (const f of FAMILIES) {
    const c = ZONE_COEFFICIENTS[f];
    const defaults: Partial<Record<Zone, number>> = {
      V0: c.V0, V1: c.V1, V2: c.V2, V3: c.V3, MAX: c.MAX,
    };
    if (c.V4 !== null) defaults.V4 = c.V4;
    result[f] = { ...defaults, ...(raw?.[f] ?? {}) };
  }
  return result;
}

function ZonesPreview({ zones }: { zones: Record<EventFamily, Partial<Record<Zone, number>>> }) {
  const z = zones["100m"];
  return (
    <span className="font-mono text-[10px] tabular-nums text-muted-foreground/60">
      {(z.V0 ?? 0.72).toFixed(2)}/{(z.V2 ?? 0.88).toFixed(2)}/{(z.MAX ?? 1.00).toFixed(2)}
    </span>
  );
}

interface Props {
  athletes: AthleteSummary[];
  allAthletes?: AthleteSummary[];
  onBack?: () => void;
}

export default function CoachPaceCalculatorScreen({ athletes, allAthletes, onBack }: Props) {
  const qc = useQueryClient();
  const { team, isLoading: teamLoading } = useMyTeam(athletes);
  const [selectedIds, setSelectedIds] = useState<string[]>(() => team.map((m) => m.id));
  const [zonesOpen, setZonesOpen] = useState(false);
  const [adjustmentsOpen, setAdjustmentsOpen] = useState(false);
  const [exportingPdfId, setExportingPdfId] = useState<string | null>(null);
  const [openSwimmerIds, setOpenSwimmerIds] = useState<string[]>([]);

  // ─── v2 hooks ─────────────────────────────────────────────────────────────
  const zonesHook = useCoachPaceZonesV2();
  const adjustHook = useCoachStrokeAdjustments();

  const fullZones = useMemo(
    () => mergeZonesWithDefaults(zonesHook.zones),
    [zonesHook.zones],
  );

  const v4ByFamily = useMemo((): Record<EventFamily, boolean> => ({
    "50m":        true,
    "100m":       true,
    "200m":       fullZones["200m"]?.V4 !== undefined,
    "400m":       fullZones["400m"]?.V4 !== undefined,
    "800m_1500m": fullZones["800m_1500m"]?.V4 !== undefined,
  }), [fullZones]);

  // ─── Targets ──────────────────────────────────────────────────────────────
  const targetsQuery = useQuery({
    queryKey: ["pace-targets"],
    queryFn: listMyPaceTargets,
    staleTime: 2 * 60 * 1000,
  });
  const targets = targetsQuery.data ?? [];

  const upsertMutation = useMutation({
    mutationFn: (args: { ref: SwimmerRef; stroke: PaceTarget["stroke"]; target_distance_m: number; target_time_ms: number; target_pool_size: PaceTarget["target_pool_size"] }) =>
      upsertPaceTarget({ swimmer: args.ref, stroke: args.stroke, target_distance_m: args.target_distance_m, target_time_ms: args.target_time_ms, target_pool_size: args.target_pool_size }),
    onMutate: async (args) => {
      await qc.cancelQueries({ queryKey: ["pace-targets"] });
      const prev = qc.getQueryData<PaceTarget[]>(["pace-targets"]) ?? [];
      const optimistic: PaceTarget = {
        id: `optimistic-${Date.now()}`,
        coach_id: "",
        swimmer_account_id: args.ref.kind === "account" ? args.ref.accountId : null,
        swimmer_manual_id: args.ref.kind === "manual" ? args.ref.manualId : null,
        stroke: args.stroke,
        target_distance_m: args.target_distance_m,
        target_time_ms: args.target_time_ms,
        target_pool_size: args.target_pool_size,
        updated_at: new Date().toISOString(),
      };
      const existing = prev.findIndex(
        (t) =>
          t.swimmer_account_id === optimistic.swimmer_account_id &&
          t.swimmer_manual_id === optimistic.swimmer_manual_id &&
          t.stroke === optimistic.stroke &&
          t.target_distance_m === optimistic.target_distance_m,
      );
      qc.setQueryData<PaceTarget[]>(["pace-targets"],
        existing >= 0 ? prev.map((t, i) => (i === existing ? optimistic : t)) : [...prev, optimistic],
      );
      return { prev };
    },
    onError: (_e, _v, ctx) => { if (ctx?.prev) qc.setQueryData(["pace-targets"], ctx.prev); },
    onSettled: () => qc.invalidateQueries({ queryKey: ["pace-targets"] }),
  });

  const deleteMutation = useMutation({
    mutationFn: deletePaceTarget,
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: ["pace-targets"] });
      const prev = qc.getQueryData<PaceTarget[]>(["pace-targets"]) ?? [];
      qc.setQueryData<PaceTarget[]>(["pace-targets"], prev.filter((t) => t.id !== id));
      return { prev };
    },
    onError: (_e, _v, ctx) => { if (ctx?.prev) qc.setQueryData(["pace-targets"], ctx.prev); },
    onSettled: () => qc.invalidateQueries({ queryKey: ["pace-targets"] }),
  });

  const effectiveSelectedIds = useMemo(
    () => (selectedIds.length === 0 && team.length > 0 ? team.map((m) => m.id) : selectedIds),
    [selectedIds, team],
  );
  const selectedMembers = useMemo(
    () => team.filter((m) => effectiveSelectedIds.includes(m.id)),
    [team, effectiveSelectedIds],
  );
  const crossAthletes = allAthletes ?? athletes;

  return (
    <div className="space-y-4 pb-24">
      <CoachSectionHeader
        title="Calculateur d'allures"
        onBack={onBack}
        actions={
          <div className="flex items-center gap-1.5">
            <Badge variant="secondary" className="text-xs font-normal">
              Équipe ({effectiveSelectedIds.length})
            </Badge>

            <Button
              variant="outline"
              size="sm"
              className="h-7 gap-1.5 text-xs"
              onClick={() => setZonesOpen(true)}
            >
              <SlidersHorizontal className="h-3 w-3" />
              Zones
              <ZonesPreview zones={fullZones} />
            </Button>

            <Button
              variant="outline"
              size="sm"
              className="h-7 gap-1.5 text-xs"
              onClick={() => setAdjustmentsOpen(true)}
            >
              <Waves className="h-3 w-3" />
              Ajust.
            </Button>

            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="h-7 gap-1.5 text-xs">
                  <Zap className="h-3 w-3" />
                  V4
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-44 p-3" align="end">
                <p className="mb-2 text-[9px] font-semibold uppercase tracking-widest text-muted-foreground/60">
                  Zone V4
                </p>
                <div className="space-y-2">
                  {/* Always-on families */}
                  {(["50m", "100m"] as const).map((f) => (
                    <div key={f} className="flex items-center justify-between opacity-40">
                      <span className="text-xs">{f}</span>
                      <span className="text-[9px] text-muted-foreground">toujours</span>
                    </div>
                  ))}
                  {/* Togglable families */}
                  {TOGGLABLE_FAMILIES.map(({ family, label }) => (
                    <div key={family} className="flex items-center justify-between">
                      <span className="text-xs">{label}</span>
                      <Switch
                        checked={v4ByFamily[family]}
                        onCheckedChange={() => zonesHook.toggleV4(family)}
                        className="scale-[0.7] origin-right"
                        aria-label={`Activer V4 pour ${label}`}
                      />
                    </div>
                  ))}
                </div>
              </PopoverContent>
            </Popover>
          </div>
        }
      />

      <PaceTeamPanel
        team={team}
        allAthletes={crossAthletes}
        selectedIds={effectiveSelectedIds}
        onChange={setSelectedIds}
      />

      {teamLoading || targetsQuery.isLoading ? (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-12 w-full rounded-lg" />
          ))}
        </div>
      ) : (
        <Accordion
          type="multiple"
          value={openSwimmerIds}
          onValueChange={setOpenSwimmerIds}
          className="space-y-0"
        >
          {selectedMembers.map((swimmer) => (
            <SwimmerPaceCard
              key={swimmer.id}
              swimmer={swimmer}
              targets={targets.filter((t) => belongsTo(t, swimmer))}
              zones={fullZones}
              strokeAdjustments={adjustHook.adjustments}
              v4ByFamily={v4ByFamily}
              onUpsertTarget={(ref, v) =>
                upsertMutation.mutate({ ref, stroke: v.stroke, target_distance_m: v.target_distance_m, target_time_ms: v.target_time_ms, target_pool_size: v.target_pool_size })
              }
              onDeleteTarget={(id) => deleteMutation.mutate(id)}
              onExportPdf={async () => {
                setExportingPdfId(swimmer.id);
                try {
                  const blob = await exportPacePdfFn({
                    swimmer,
                    targets: targets.filter((t) => belongsTo(t, swimmer)),
                    zones: DEFAULT_ZONES, // TODO Task 27: upgrade to v2 zones
                  });
                  downloadBlob(blob, `allures-${swimmer.displayName.toLowerCase().replace(/\s+/g, "-")}.pdf`);
                } catch (err) {
                  console.error("PDF export failed", err);
                } finally {
                  setExportingPdfId(null);
                }
              }}
              isPdfExporting={exportingPdfId === swimmer.id}
              onShare={() => createPaceShareLink(buildSwimmerRef(swimmer))}
            />
          ))}
        </Accordion>
      )}

      <PaceZonesSettings
        open={zonesOpen}
        onOpenChange={setZonesOpen}
        zones={fullZones}
        onUpsertCell={async (args) => { zonesHook.upsertCell(args); }}
        onResetAll={async () => { zonesHook.resetToDefaults(); }}
        onToggleV4={async (family) => { zonesHook.toggleV4(family); }}
      />

      <PaceStrokeAdjustments
        open={adjustmentsOpen}
        onOpenChange={setAdjustmentsOpen}
        adjustments={adjustHook.adjustments}
        overrides={adjustHook.overrides}
        onUpsertOne={async (args) => { adjustHook.upsertOne(args); }}
        onResetAll={async () => { adjustHook.resetAll(); }}
      />
    </div>
  );
}
