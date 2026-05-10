import { useState, useMemo, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { Accordion } from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { SlidersHorizontal, Waves, Zap } from "lucide-react";
import CoachSectionHeader from "./CoachSectionHeader";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PaceZonesSettings } from "@/components/coach/pace/PaceZonesSettings";
import { PaceStrokeAdjustments } from "@/components/coach/pace/PaceStrokeAdjustments";
import { SwimmerPaceCard, buildSwimmerRef } from "@/components/coach/pace/SwimmerPaceCard";
import { useTeamForCoach } from "@/hooks/useMyTeam";
import { listActiveCoaches } from "@/lib/api/coaches";
import { useCoachPaceZonesV2 } from "@/hooks/useCoachPaceZonesV2";
import { useCoachStrokeAdjustments } from "@/hooks/useCoachStrokeAdjustments";
import { listMyPaceTargets, upsertPaceTarget, deletePaceTarget } from "@/lib/api/pace-targets";
import { parseObjectiveForPace, shouldAutoSyncToPaceTarget } from "@/lib/objective-pace-link";
import type { Objective } from "@/lib/api/types";
import { ZONE_COEFFICIENTS, type EventFamily, type Zone } from "@/lib/paceData";
import { downloadBlob } from "@/lib/downloadBlob";
import { createPaceShareLink } from "@/lib/api/pace-share";
import type { AthleteSummary } from "@/lib/api/types";
import type { PaceTarget, SwimmerRef } from "@/lib/api/pace-targets";
import type { TeamMember } from "@/hooks/useMyTeam";
import { consumePacePrefill, type PacePrefillPayload } from "@/lib/pace-prefill-handoff";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { getObjectives } from "@/lib/api";

export type ObjectiveSyncOp = {
  ref: SwimmerRef;
  stroke: PaceTarget["stroke"];
  target_distance_m: number;
  target_time_ms: number;
  target_pool_size: PaceTarget["target_pool_size"];
};

/**
 * Calcule les upserts de cibles d'allures manquantes à partir des objectifs
 * chronométriques. Pure function — testable sans Supabase.
 *
 * Règles :
 * - Ignore les objectifs sans target_time_seconds
 * - Ignore les event_code non-FFN (parseObjectiveForPace → null)
 * - Ignore si une cible (nage + distance + bassin) existe déjà (ne pas écraser)
 * - Ignore si le nageur n'est pas dans l'équipe (auth_uid absent du Map)
 */
export function buildObjectiveSyncOps(
  objectives: Objective[],
  authUidToAccountId: Map<string, number>,
  existingTargets: PaceTarget[],
): ObjectiveSyncOp[] {
  const ops: ObjectiveSyncOp[] = [];
  for (const obj of objectives) {
    if (obj.target_time_seconds == null) continue;
    const accountId = authUidToAccountId.get(obj.athlete_id);
    if (accountId == null) continue;
    const parsed = parseObjectiveForPace(obj.event_code, obj.pool_length);
    if (!parsed) continue;
    if (!shouldAutoSyncToPaceTarget(obj, parsed, existingTargets, accountId)) continue;
    ops.push({
      ref: { kind: "account", accountId },
      stroke: parsed.stroke,
      target_distance_m: parsed.distance,
      target_time_ms: obj.target_time_seconds * 1000,
      target_pool_size: parsed.pool_size,
    });
  }
  return ops;
}

const FAMILIES: EventFamily[] = ["50m", "100m", "200m", "400m", "800m_1500m"];
const TOGGLABLE_FAMILIES: { family: EventFamily; label: string }[] = [
  { family: "200m", label: "200m" },
  { family: "400m", label: "400m" },
  { family: "800m_1500m", label: "800m+" },
];

export type ConsumeResult =
  | { kind: "open-existing"; swimmerAccordionId: string; targetId: string }
  | { kind: "open-create"; swimmerAccordionId: string; payload: PacePrefillPayload }
  | { kind: "unknown-swimmer" };

export function selectAccordionTargetForPrefill(args: {
  payload: PacePrefillPayload;
  team: Array<{ id: string; kind: string; accountId?: number }>;
  targets: PaceTarget[];
}): ConsumeResult {
  const { payload, team, targets } = args;
  const member = team.find(
    (m) => m.kind === "account" && m.accountId === payload.swimmer_account_id,
  );
  if (!member) return { kind: "unknown-swimmer" };
  const existing = targets.find((t) =>
    t.swimmer_account_id === payload.swimmer_account_id &&
    t.stroke === payload.stroke &&
    t.target_distance_m === payload.target_distance_m &&
    t.target_pool_size === payload.target_pool_size,
  );
  if (existing) {
    return { kind: "open-existing", swimmerAccordionId: member.id, targetId: existing.id };
  }
  return { kind: "open-create", swimmerAccordionId: member.id, payload };
}

/** Pure function — exported for unit testing. */
export function buildSelectedMembers(
  team: TeamMember[],
  effectiveSelectedIds: string[],
  crossAthletes: AthleteSummary[],
): TeamMember[] {
  const teamById = new Set(team.map((m) => m.id));
  const teamSelected = team.filter((m) => effectiveSelectedIds.includes(m.id));
  const crossSelected = effectiveSelectedIds
    .filter((id) => !teamById.has(id) && id.startsWith("account-"))
    .map((id): TeamMember | null => {
      const accountId = parseInt(id.replace("account-", ""), 10);
      const athlete = crossAthletes.find((a) => a.id === accountId);
      if (!athlete) return null;
      return { kind: "account", id, accountId, displayName: athlete.display_name };
    })
    .filter((m): m is TeamMember => m !== null);
  return [...teamSelected, ...crossSelected];
}

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
    if ((f === "50m" || f === "100m") && c.V4 !== null) defaults.V4 = c.V4;
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
  const coachName = useAuth((s) => s.user) ?? undefined;
  const connectedCoachId = useAuth((s) => s.userId);
  const [selectedCoachId, setSelectedCoachId] = useState<number | null>(null);
  const effectiveCoachId = selectedCoachId ?? connectedCoachId;
  const coachesQuery = useQuery({
    queryKey: ["active-coaches"],
    queryFn: listActiveCoaches,
    staleTime: 5 * 60 * 1000,
  });
  const coaches = coachesQuery.data ?? [];
  const { team, isLoading: teamLoading } = useTeamForCoach(effectiveCoachId, athletes);
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

  // Auto-sync : objectifs chronométriques → cibles d'allures (§260)
  // S'exécute une fois après le chargement initial. Silent best-effort.
  const hasSyncedObjectivesRef = useRef(false);
  useEffect(() => {
    if (teamLoading || targetsQuery.isLoading) return;
    if (hasSyncedObjectivesRef.current) return;
    hasSyncedObjectivesRef.current = true;

    const accountIds = team
      .filter((m): m is TeamMember & { kind: "account"; accountId: number } => m.kind === "account" && m.accountId != null)
      .map((m) => m.accountId);
    if (accountIds.length === 0) return;

    const run = async () => {
      try {
        const [{ data: authRows }, objectives] = await Promise.all([
          supabase.rpc("get_auth_uids_for_users", { p_user_ids: accountIds }),
          getObjectives(),
        ]);
        const authUidToAccountId = new Map<string, number>();
        for (const row of authRows ?? []) {
          authUidToAccountId.set(row.auth_uid, row.user_id);
        }
        const fresh = qc.getQueryData<PaceTarget[]>(["pace-targets"]) ?? [];
        const ops = buildObjectiveSyncOps(objectives, authUidToAccountId, fresh);
        if (ops.length === 0) return;
        await Promise.all(
          ops.map((op) =>
            upsertPaceTarget({
              swimmer: op.ref,
              stroke: op.stroke,
              target_distance_m: op.target_distance_m,
              target_time_ms: op.target_time_ms,
              target_pool_size: op.target_pool_size,
            }),
          ),
        );
        qc.invalidateQueries({ queryKey: ["pace-targets"] });
      } catch {
        // silent — best-effort sync
      }
    };
    void run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teamLoading, targetsQuery.isLoading]);

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

  useEffect(() => {
    if (teamLoading || targetsQuery.isLoading) return;
    const payload = consumePacePrefill();
    if (!payload) return;
    const result = selectAccordionTargetForPrefill({
      payload,
      team,
      targets: targetsQuery.data ?? [],
    });
    if (result.kind === "unknown-swimmer") {
      toast.error("Nageur introuvable dans votre équipe");
      return;
    }
    setOpenSwimmerIds((prev) =>
      prev.includes(result.swimmerAccordionId) ? prev : [...prev, result.swimmerAccordionId],
    );
    if (result.kind === "open-existing") {
      toast.success("Cible déjà calibrée — modification possible");
    } else {
      upsertMutation.mutate({
        ref: { kind: "account", accountId: payload.swimmer_account_id },
        stroke: payload.stroke,
        target_distance_m: payload.target_distance_m,
        target_time_ms: payload.target_time_ms,
        target_pool_size: payload.target_pool_size,
      });
      toast.success("Cible créée depuis l'objectif");
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teamLoading, targetsQuery.isLoading]);

  return (
    <div className="space-y-4 pb-24">
      <CoachSectionHeader
        title="Calculateur d'allures"
        onBack={onBack}
        actions={
          <div className="flex items-center gap-1.5">
            <Badge variant="secondary" className="shrink-0 text-xs font-normal">
              <span className="hidden sm:inline">Équipe </span>({team.length})
            </Badge>

            <Button
              variant="outline"
              size="sm"
              className="h-11 gap-1 px-2 text-xs sm:gap-1.5 sm:px-3"
              onClick={() => setZonesOpen(true)}
            >
              <SlidersHorizontal className="h-3 w-3" />
              <span className="hidden sm:inline">Zones</span>
              <span className="hidden sm:inline"><ZonesPreview zones={fullZones} /></span>
            </Button>

            <Button
              variant="outline"
              size="sm"
              className="h-11 gap-1 px-2 text-xs sm:gap-1.5 sm:px-3"
              onClick={() => setAdjustmentsOpen(true)}
            >
              <Waves className="h-3 w-3" />
              <span className="hidden sm:inline">Ajust.</span>
            </Button>

            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="h-11 gap-1 px-2 text-xs sm:gap-1.5 sm:px-3">
                  <Zap className="h-3 w-3" />
                  <span className="hidden sm:inline">V4</span>
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
                        className=""
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

      {/* Coach selector — défaut = coach connecté */}
      <div className="flex items-center gap-3 rounded-lg border bg-muted/20 p-3">
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Équipe :
        </span>
        <Select
          value={effectiveCoachId !== null && effectiveCoachId !== undefined ? String(effectiveCoachId) : ""}
          onValueChange={(v) => setSelectedCoachId(v ? Number(v) : null)}
        >
          <SelectTrigger className="h-9 flex-1 max-w-xs">
            <SelectValue placeholder="Sélectionner un coach…" />
          </SelectTrigger>
          <SelectContent>
            {coaches.map((c) => (
              <SelectItem key={c.id} value={String(c.id)}>
                {c.display_name}
                {c.id === connectedCoachId ? " (moi)" : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="text-xs text-muted-foreground">
          {team.length} nageur{team.length !== 1 ? "s" : ""}
        </span>
      </div>

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
          {team.map((swimmer) => (
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
              onExportPdf={async (pool) => {
                setExportingPdfId(swimmer.id);
                try {
                  const { exportPacePdf } = await import("@/lib/export-pace-pdf");
                  const blob = await exportPacePdf({
                    swimmer,
                    targets: targets.filter((t) => belongsTo(t, swimmer)),
                    zones: fullZones,
                    strokeAdjustments: adjustHook.adjustments,
                    outputPool: pool,
                    coachName,
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
