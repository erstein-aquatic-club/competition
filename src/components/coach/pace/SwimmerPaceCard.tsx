import React, { useState } from "react";
import {
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FileDown, Loader2, Share2, Plus, Trash2 } from "lucide-react";
import { PaceMatrix } from "./PaceMatrix";
import { Pace4NSegmentMatrix } from "./Pace4NSegmentMatrix";
import { PaceTargetForm } from "./PaceTargetForm";
import { ShareMenu } from "@/components/shared/ShareMenu";
import { normalizeStroke, eventFamily } from "@/lib/paceCalculatorV2";
import type { TeamMember } from "@/hooks/useMyTeam";
import type { PaceTarget, SwimmerRef } from "@/lib/api/pace-targets";
import type { EventFamily, Zone } from "@/lib/paceData";

type SingleStroke = "crawl" | "dos" | "brasse" | "papillon";

export function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

export function buildSwimmerRef(swimmer: TeamMember): SwimmerRef {
  if (swimmer.kind === "account") return { kind: "account", accountId: swimmer.accountId! };
  return { kind: "manual", manualId: swimmer.manualId! };
}

function nameToHue(name: string): number {
  let hash = 0;
  for (const ch of name) hash = (hash * 31 + ch.charCodeAt(0)) & 0xffffffff;
  return Math.abs(hash) % 360;
}

function formatTargetLabel(t: PaceTarget): string {
  const dist = t.target_distance_m >= 1000
    ? `${t.target_distance_m / 1000} km`
    : `${t.target_distance_m} m`;
  const pool = t.target_pool_size ?? "50m";
  return `${t.stroke} ${dist} · ${pool}`;
}

interface Props {
  swimmer: TeamMember;
  targets: PaceTarget[];
  zones: Record<EventFamily, Partial<Record<Zone, number>>>;
  strokeAdjustments: Record<SingleStroke, Record<EventFamily, number>>;
  v4ByFamily: Record<EventFamily, boolean>;
  onUpsertTarget: (
    ref: SwimmerRef,
    v: { stroke: PaceTarget["stroke"]; target_distance_m: number; target_time_ms: number; target_pool_size: PaceTarget["target_pool_size"] },
  ) => void;
  onDeleteTarget: (id: string) => void;
  onExportPdf: () => void | Promise<void>;
  onShare?: () => Promise<{ url: string }>;
  isPdfExporting?: boolean;
}

export function SwimmerPaceCard({
  swimmer,
  targets,
  zones,
  strokeAdjustments,
  v4ByFamily,
  onUpsertTarget,
  onDeleteTarget,
  onExportPdf,
  onShare,
  isPdfExporting = false,
}: Props) {
  const [showAddForm, setShowAddForm] = useState(false);
  const hue = nameToHue(swimmer.displayName);
  const ref = buildSwimmerRef(swimmer);

  return (
    <AccordionItem value={swimmer.id} className="border-b border-border/30">
      <AccordionTrigger className="hover:no-underline px-0 py-3">
        <div className="flex w-full items-center gap-3 min-w-0">
          {/* Avatar */}
          <span
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold tracking-wide"
            style={{
              background: `hsl(${hue} 30% 88%)`,
              color: `hsl(${hue} 40% 35%)`,
            }}
          >
            {getInitials(swimmer.displayName)}
          </span>

          {/* Name + badges */}
          <span className="flex min-w-0 flex-1 items-center gap-2 truncate">
            <span className="truncate text-sm font-semibold">{swimmer.displayName}</span>
            {swimmer.kind === "manual" && (
              <Badge variant="secondary" className="shrink-0 px-1.5 py-0 text-[10px] font-normal">
                Sans compte
              </Badge>
            )}
            {targets.length > 0 && (
              <Badge
                variant="outline"
                className="shrink-0 px-1.5 py-0 text-[10px] font-normal text-muted-foreground"
              >
                {targets.length} cible{targets.length > 1 ? "s" : ""}
              </Badge>
            )}
          </span>

          {/* Action buttons — stopPropagation prevents accordion toggle */}
          <span className="flex shrink-0 items-center gap-1" onClick={(e) => e.stopPropagation()}>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-muted-foreground hover:text-foreground"
              onClick={() => void onExportPdf()}
              disabled={isPdfExporting}
              title="Exporter PDF"
            >
              {isPdfExporting
                ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                : <FileDown className="h-3.5 w-3.5" />
              }
            </Button>
            <ShareMenu
              trigger={
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-muted-foreground hover:text-foreground"
                  title="Partager"
                >
                  <Share2 className="h-3.5 w-3.5" />
                </Button>
              }
              onOpen={onShare ? async () => {
                const { url } = await onShare();
                return {
                  url,
                  title: `Allures de ${swimmer.displayName}`,
                  text: `Voir les allures de ${swimmer.displayName} — expire dans 30 jours`,
                };
              } : undefined}
            />
          </span>
        </div>
      </AccordionTrigger>

      <AccordionContent className="pb-4">
        <div className="space-y-4 pt-1">
          {/* Target list */}
          {targets.map((target) => {
            const is4NMatrix =
              target.stroke === "4N" &&
              (target.target_distance_m === 200 || target.target_distance_m === 400);
            return (
              <div key={target.id} className="rounded-md border border-border/30 bg-muted/10 p-3">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-[11px] font-medium uppercase tracking-widest text-muted-foreground">
                    {formatTargetLabel(target)}
                  </span>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 text-muted-foreground/50 hover:text-destructive"
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Supprimer la cible ?</AlertDialogTitle>
                        <AlertDialogDescription>
                          La cible {formatTargetLabel(target)} de {swimmer.displayName} sera
                          définitivement supprimée.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Annuler</AlertDialogCancel>
                        <AlertDialogAction
                          className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                          onClick={() => onDeleteTarget(target.id)}
                        >
                          Supprimer
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
                {is4NMatrix ? (
                  <Pace4NSegmentMatrix
                    targetTimeMs={target.target_time_ms}
                    targetDistanceM={target.target_distance_m as 200 | 400}
                    swimmerSex={swimmer.sex ?? null}
                    targetPool={target.target_pool_size}
                    zones={zones}
                    strokeAdjustments={strokeAdjustments}
                  />
                ) : (
                  <PaceMatrix
                    targetTimeMs={target.target_time_ms}
                    targetDistanceM={target.target_distance_m}
                    stroke={normalizeStroke(target.stroke)}
                    zones={zones}
                    strokeAdjustments={strokeAdjustments}
                    swimmerSex={swimmer.sex ?? null}
                    targetPool={target.target_pool_size}
                    v4EnabledForFamily={
                      target.stroke === "4N"
                        ? false
                        : v4ByFamily[eventFamily(target.target_distance_m)]
                    }
                  />
                )}
              </div>
            );
          })}

          {/* Inline add form */}
          {showAddForm ? (
            <div className="rounded-md border border-dashed border-border/50 bg-muted/5 p-3">
              <p className="mb-3 text-[10px] uppercase tracking-widest text-muted-foreground/60">
                Nouvelle cible
              </p>
              <PaceTargetForm
                onSubmit={(v) => {
                  onUpsertTarget(ref, v);
                  setShowAddForm(false);
                }}
                onCancel={() => setShowAddForm(false)}
              />
            </div>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-full justify-start gap-1.5 border border-dashed border-border/40 text-xs text-muted-foreground hover:border-border/70 hover:text-foreground"
              onClick={() => setShowAddForm(true)}
            >
              <Plus className="h-3.5 w-3.5" />
              Ajouter une cible
            </Button>
          )}
        </div>
      </AccordionContent>
    </AccordionItem>
  );
}
