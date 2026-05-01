import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Accordion } from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { SlidersHorizontal } from "lucide-react";
import CoachSectionHeader from "./CoachSectionHeader";
import { PaceTeamPanel } from "@/components/coach/pace/PaceTeamPanel";
import { PaceZonesSettings } from "@/components/coach/pace/PaceZonesSettings";
import { SwimmerPaceCard, buildSwimmerRef } from "@/components/coach/pace/SwimmerPaceCard";
import { useMyTeam } from "@/hooks/useMyTeam";
import { getMyPaceZones, upsertMyPaceZones } from "@/lib/api/pace-zones";
import { listMyPaceTargets, upsertPaceTarget, deletePaceTarget } from "@/lib/api/pace-targets";
import { DEFAULT_ZONES } from "@/lib/paceCalculator";
import { exportPacePdf } from "@/lib/export-pace-pdf";
import { downloadBlob } from "@/lib/downloadBlob";
import { createPaceShareLink } from "@/lib/api/pace-share";
import type { AthleteSummary } from "@/lib/api/types";
import type { PaceTarget, SwimmerRef } from "@/lib/api/pace-targets";
import type { TeamMember } from "@/hooks/useMyTeam";
import type { Stroke } from "@/lib/paceCalculator";

export function belongsTo(target: PaceTarget, swimmer: TeamMember): boolean {
  return swimmer.kind === "account"
    ? target.swimmer_account_id === swimmer.accountId
    : target.swimmer_manual_id === swimmer.manualId;
}

function ZonesPreview({ v0_pct, v1_pct, v2_pct, v3_pct, max_pct }: {
  v0_pct: number; v1_pct: number; v2_pct: number; v3_pct: number; max_pct: number;
}) {
  return (
    <span className="font-mono text-[10px] tabular-nums text-muted-foreground/70">
      {v0_pct}/{v1_pct}/{v2_pct}/{v3_pct}/{max_pct}
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
  const [exportingPdfId, setExportingPdfId] = useState<string | null>(null);
  // Controlled accordion: persists across Accordion unmount/remount (teamLoading ternary)
  const [openSwimmerIds, setOpenSwimmerIds] = useState<string[]>([]);

  const zonesQuery = useQuery({
    queryKey: ["pace-zones"],
    queryFn: getMyPaceZones,
    staleTime: 5 * 60 * 1000,
  });
  const zones = zonesQuery.data ?? DEFAULT_ZONES;

  const targetsQuery = useQuery({
    queryKey: ["pace-targets"],
    queryFn: listMyPaceTargets,
    staleTime: 2 * 60 * 1000,
  });
  const targets = targetsQuery.data ?? [];

  const upsertMutation = useMutation({
    mutationFn: (args: { ref: SwimmerRef; stroke: Stroke; target_distance_m: number; target_time_ms: number }) =>
      upsertPaceTarget({ swimmer: args.ref, stroke: args.stroke, target_distance_m: args.target_distance_m, target_time_ms: args.target_time_ms }),
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
        updated_at: new Date().toISOString(),
      };
      const existing = prev.findIndex(
        (t) =>
          t.swimmer_account_id === optimistic.swimmer_account_id &&
          t.swimmer_manual_id === optimistic.swimmer_manual_id &&
          t.stroke === optimistic.stroke &&
          t.target_distance_m === optimistic.target_distance_m,
      );
      const next = existing >= 0 ? prev.map((t, i) => (i === existing ? optimistic : t)) : [...prev, optimistic];
      qc.setQueryData<PaceTarget[]>(["pace-targets"], next);
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(["pace-targets"], ctx.prev);
    },
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
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(["pace-targets"], ctx.prev);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["pace-targets"] }),
  });

  const zonesMutation = useMutation({
    mutationFn: upsertMyPaceZones,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["pace-zones"] }),
  });

  // Sync selectedIds when team loads (avoids empty initial state)
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
          <div className="flex items-center gap-2">
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
              <ZonesPreview {...zones} />
            </Button>
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
              zones={zones}
              onUpsertTarget={(ref, v) => upsertMutation.mutate({ ref, ...v })}
              onDeleteTarget={(id) => deleteMutation.mutate(id)}
              onExportPdf={async () => {
                setExportingPdfId(swimmer.id);
                try {
                  const blob = await exportPacePdf({
                    swimmer,
                    targets: targets.filter((t) => belongsTo(t, swimmer)),
                    zones,
                  });
                  const slug = swimmer.displayName.toLowerCase().replace(/\s+/g, "-");
                  downloadBlob(blob, `allures-${slug}.pdf`);
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
        currentZones={zones}
        onSave={(z) => zonesMutation.mutate(z)}
      />
    </div>
  );
}
