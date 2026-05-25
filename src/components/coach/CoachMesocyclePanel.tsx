/**
 * CoachMesocyclePanel — vue coach du mésocycle généré par un nageur (§293).
 *
 * S'insère dans l'onglet "Planning" de `CoachSwimmerFullView`. Couvre :
 *   - Phase 6.1 : visibilité du mésocycle actif + raisonnement auditable
 *     (les 6 scores de seau, les top priorités, data_confidence).
 *   - Phase 6.2 : action "Rejeter le mésocycle" → RPC `revertMesocycle`
 *     (la notif côté nageur est posée par la RPC elle-même).
 *
 * Le builder de séance (édition fine d'une séance) n'est PAS recréé ici :
 * le coach utilise l'éditeur de session existant (`StrengthSessionBuilder`)
 * en cliquant sur une session dans la planif natation/muscu — c'est par
 * design (les templates créés par l'apply RPC sont des `strength_sessions`
 * standards, ils s'éditent comme les autres).
 */
import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  getActiveMesocycle,
  getMesocycleSessionsContent,
  listMesocycles,
  revertMesocycle,
} from "@/lib/api";
import type {
  StrengthBucket,
  StrengthMesocycle,
  PeriodizationCycle,
} from "@/lib/api/types";
import type { MesocycleSessionContent } from "@/lib/api";
import { PERIODIZATION_CYCLES } from "@/lib/strength/periodizationCycles";
import { ZONE_LABEL_FR } from "@/lib/strength/zones";
import { ExerciseGifLightbox } from "@/components/strength/ExerciseGifLightbox";

import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Activity,
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  History,
  Layers,
  Loader2,
  RefreshCw,
  Undo2,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ── Constants (mêmes labels que MesocyclePreview) ────────────────────────────

type AnyBucket = StrengthBucket | "psychology";

const BUCKET_LABEL_FR: Record<AnyBucket, string> = {
  lower_strength: "Force bas du corps",
  lower_power: "Puissance bas du corps",
  upper_strength: "Force haut du corps",
  upper_power: "Puissance haut du corps",
  mobility: "Mobilité",
  psychology: "Psychologie",
  // §R5 — tronc/gainage (cf. design R5 §2).
  core: "Tronc / gainage",
};

const BUCKET_SHORT_FR: Record<AnyBucket, string> = {
  lower_strength: "Force bas",
  lower_power: "Puissance bas",
  upper_strength: "Force haut",
  upper_power: "Puissance haut",
  mobility: "Mobilité",
  psychology: "Psycho",
  core: "Tronc",
};

/** Couleurs par cycle (alignées sur MesocyclePreview pour cohérence visuelle). */
const CYCLE_COLOR: Record<PeriodizationCycle, {
  dot: string; ring: string; text: string; bg: string;
}> = {
  prepa_generale: { dot: "bg-sky-500",   ring: "ring-sky-200 dark:ring-sky-900/50",   text: "text-sky-700 dark:text-sky-300",   bg: "bg-sky-50 dark:bg-sky-950/30" },
  force_max:      { dot: "bg-rose-500",  ring: "ring-rose-200 dark:ring-rose-900/50", text: "text-rose-700 dark:text-rose-300", bg: "bg-rose-50 dark:bg-rose-950/30" },
  puissance:      { dot: "bg-amber-500", ring: "ring-amber-200 dark:ring-amber-900/50", text: "text-amber-700 dark:text-amber-300", bg: "bg-amber-50 dark:bg-amber-950/30" },
  maintien:       { dot: "bg-slate-400", ring: "ring-slate-200 dark:ring-slate-700/50", text: "text-slate-700 dark:text-slate-300", bg: "bg-slate-50 dark:bg-slate-950/30" },
  affutage:       { dot: "bg-violet-500",ring: "ring-violet-200 dark:ring-violet-900/50", text: "text-violet-700 dark:text-violet-300", bg: "bg-violet-50 dark:bg-violet-950/30" },
  pic:            { dot: "bg-emerald-500",ring: "ring-emerald-200 dark:ring-emerald-900/50", text: "text-emerald-700 dark:text-emerald-300", bg: "bg-emerald-50 dark:bg-emerald-950/30" },
};

// ── Schéma du snapshot du raisonnement (forme du jsonb) ──────────────────────

interface BucketPriorityDb {
  bucket: AnyBucket;
  score: number;
  rank: number;
  rationale: string;
  overrideApplied: boolean;
}
interface ReasoningDb {
  bucketScores: Partial<Record<AnyBucket, number | null>>;
  bucketPriorities: BucketPriorityDb[];
  bucketAllocations?: unknown[];
  dataConfidence: "low" | "partial" | "full";
  psychFlag: boolean;
  lowestBaremeConfidence: string;
  activeContraindications: string[];
}

const ALL_BUCKETS: AnyBucket[] = [
  "lower_strength",
  "lower_power",
  "upper_strength",
  "upper_power",
  "mobility",
  "psychology",
];

const FR_DATE = new Intl.DateTimeFormat("fr-FR", {
  day: "2-digit",
  month: "short",
  year: "numeric",
});
function fmtDate(iso: string): string {
  return FR_DATE.format(new Date(iso));
}

// ── Composant ────────────────────────────────────────────────────────────────

export interface CoachMesocyclePanelProps {
  athleteId: number;
  athleteName: string;
}

export default function CoachMesocyclePanel({
  athleteId,
  athleteName,
}: CoachMesocyclePanelProps) {
  const queryClient = useQueryClient();
  const [, navigate] = useLocation();
  const [confirmOpen, setConfirmOpen] = useState(false);

  const { data: active, isLoading: activeLoading } = useQuery({
    queryKey: ["strength-mesocycle-active", athleteId],
    queryFn: () => getActiveMesocycle(athleteId),
  });

  const { data: history = [] } = useQuery({
    queryKey: ["strength-mesocycle-history", athleteId],
    queryFn: () => listMesocycles(athleteId),
  });

  const revertMutation = useMutation({
    mutationFn: async (id: string) => revertMesocycle(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["strength-mesocycle-active", athleteId] });
      queryClient.invalidateQueries({ queryKey: ["strength-mesocycle-history", athleteId] });
      queryClient.invalidateQueries({ queryKey: ["strength_planning_slot_overrides", athleteId] });
      queryClient.invalidateQueries({ queryKey: ["strength_planning_week_overrides", athleteId] });
      toast.success("Mésocycle rejeté", {
        description: `La planif d'avant a été restaurée. ${athleteName} sera notifié.`,
      });
      setConfirmOpen(false);
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : "Erreur inconnue";
      toast.error("Impossible de rejeter le mésocycle", { description: msg });
    },
  });

  if (activeLoading) {
    return (
      <div className="rounded-2xl border bg-card p-4">
        <div className="h-24 animate-pulse rounded bg-muted" />
      </div>
    );
  }

  if (!active) {
    return <EmptyState history={history} />;
  }

  // Parse défensif du snapshot reasoning.
  const reasoning = parseReasoning(active.bucket_priorities);

  return (
    <div className="space-y-3">
      <Card className="overflow-hidden rounded-2xl border-violet-200 bg-violet-50/30 dark:border-violet-900/50 dark:bg-violet-950/20">
        {/* ── Header mésocycle ──────────────────────────────────────────── */}
        <div className="border-b border-violet-100 px-4 py-3 dark:border-violet-900/50">
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-violet-600 text-white dark:bg-violet-500">
              <Activity className="h-4 w-4" />
            </div>
            <div className="min-w-0 flex-1 leading-tight">
              <div className="flex items-baseline gap-2">
                <p className="text-[10px] font-black uppercase tracking-[0.16em] text-violet-700 dark:text-violet-300">
                  Mésocycle actif
                </p>
                <Badge
                  variant="outline"
                  className="h-4 border-emerald-300 bg-emerald-50 px-1 text-[9px] font-bold uppercase tracking-wider text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300"
                >
                  active
                </Badge>
              </div>
              <h3 className="mt-0.5 text-sm font-bold">
                {active.event_group} · {active.kind === "season" ? "Saison" : "Mini-prépa"}
              </h3>
              <p className="mt-0.5 font-mono text-[10px] tabular-nums text-muted-foreground">
                {active.target_week_count} sem. ·{" "}
                {active.sessions_per_week} séances/sem. ·{" "}
                généré le {fmtDate(active.generated_at)} · engine v{active.engine_version}
              </p>
            </div>
          </div>
        </div>

        {/* ── Raisonnement auditable ───────────────────────────────────── */}
        {reasoning && (
          <div className="space-y-3 px-4 py-3">
            <h4 className="text-[10px] font-black uppercase tracking-[0.16em] text-violet-700 dark:text-violet-300">
              Le pourquoi (auditable)
            </h4>

            <div>
              <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                Scores des 6 seaux
              </p>
              <ul className="space-y-1">
                {ALL_BUCKETS.map((b) => (
                  <li key={b}>
                    <BucketRow bucket={b} value={reasoning.bucketScores[b] ?? null} />
                  </li>
                ))}
              </ul>
            </div>

            <Separator />

            <div>
              <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                Top 3 priorités
              </p>
              <ol className="space-y-1.5">
                {reasoning.bucketPriorities.slice(0, 3).map((p) => (
                  <li
                    key={p.bucket}
                    className="flex gap-2 rounded-lg border bg-card p-2"
                  >
                    <span
                      className={cn(
                        "flex h-6 w-6 shrink-0 items-center justify-center rounded font-mono text-[9px] font-black tabular-nums",
                        p.overrideApplied
                          ? "bg-rose-600 text-white"
                          : "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900",
                      )}
                    >
                      {String(p.rank).padStart(2, "0")}
                    </span>
                    <div className="min-w-0 flex-1 leading-tight">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-bold">
                          {BUCKET_LABEL_FR[p.bucket]}
                        </span>
                        {p.overrideApplied && (
                          <Badge
                            variant="outline"
                            className="h-4 border-rose-400 bg-rose-50 px-1 text-[8px] font-black uppercase tracking-wider text-rose-700 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-300"
                          >
                            Override
                          </Badge>
                        )}
                      </div>
                      <p className="mt-0.5 text-[10px] leading-relaxed text-muted-foreground">
                        {p.rationale}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
            </div>

            {/* Notes additionnelles */}
            {reasoning.psychFlag && (
              <NoteStrip
                tone="amber"
                icon={<AlertCircle className="h-3.5 w-3.5" />}
                body={`Score psychologie bas — pense à en parler à ${athleteName}.`}
              />
            )}
            {reasoning.activeContraindications.length > 0 && (
              <NoteStrip
                tone="rose"
                icon={<RefreshCw className="h-3.5 w-3.5" />}
                body={`Substitutions actives : ${reasoning.activeContraindications.map((z) => ZONE_LABEL_FR[z] ?? z).join(", ")}.`}
              />
            )}

            <div className="rounded-lg border bg-muted/30 px-2.5 py-1.5 text-[10px] text-muted-foreground">
              Confiance données :{" "}
              <span className="font-mono font-bold text-foreground">{reasoning.dataConfidence}</span>
              {" · "}barème :{" "}
              <span className="font-mono font-bold text-foreground">
                {reasoning.lowestBaremeConfidence}
              </span>
            </div>
          </div>
        )}

        {/* ── Actions coach ─────────────────────────────────────────────── */}
        <div className="border-t border-violet-100 bg-card/60 px-4 py-3 dark:border-violet-900/50">
          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1 text-[11px] leading-relaxed text-muted-foreground">
              Tu peux éditer chaque séance en cliquant dessus dans la timeline
              du nageur — les séances générées sont des templates standards.
              Pour annuler complètement ce mésocycle et restaurer la planif
              d'avant, rejette-le ci-dessous.
            </div>
            <div className="flex shrink-0 flex-col gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                  navigate(`/coach/mesocycle-generate/${athleteId}`)
                }
              >
                <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
                Régénérer
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setConfirmOpen(true)}
                disabled={revertMutation.isPending}
                className="border-rose-300 text-rose-700 hover:bg-rose-50 hover:text-rose-800 dark:border-rose-800 dark:text-rose-300 dark:hover:bg-rose-950/40"
              >
                {revertMutation.isPending ? (
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Undo2 className="mr-1.5 h-3.5 w-3.5" />
                )}
                Rejeter
              </Button>
            </div>
          </div>
        </div>
      </Card>

      {/* ── Plan détaillé du mésocycle (auditable) ──────────────────────── */}
      <MesocyclePlanContent mesocycleId={active.id} />

      {/* ── Historique mésocycles (compact) ─────────────────────────────── */}
      {history.length > 1 && (
        <HistoryStrip history={history} />
      )}

      {/* ── Dialog confirmation revert ──────────────────────────────────── */}
      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Rejeter ce mésocycle ?</AlertDialogTitle>
            <AlertDialogDescription>
              Toute la planif muscu posée par ce mésocycle ({active.target_week_count} semaines)
              sera supprimée, et l'état d'avant restauré. {athleteName} sera notifié.
              Cette action est réversible : tu peux régénérer un mésocycle ensuite.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={revertMutation.isPending}>
              Annuler
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                revertMutation.mutate(active.id);
              }}
              disabled={revertMutation.isPending}
              className="bg-rose-600 text-white hover:bg-rose-700"
            >
              {revertMutation.isPending ? (
                <>
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  Annulation…
                </>
              ) : (
                "Rejeter le mésocycle"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ── Subcomponents ────────────────────────────────────────────────────────────

function BucketRow({
  bucket,
  value,
}: {
  bucket: AnyBucket;
  value: number | null;
}) {
  const v = value ?? 0;
  const color =
    value === null
      ? "bg-slate-300 dark:bg-slate-700"
      : v < 40
        ? "bg-rose-500"
        : v < 70
          ? "bg-amber-500"
          : "bg-emerald-500";
  return (
    <div className="flex items-center gap-2.5">
      <div className="w-[100px] shrink-0 text-[11px] font-medium text-foreground/80">
        {BUCKET_SHORT_FR[bucket]}
      </div>
      <div className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-slate-200/60 dark:bg-slate-800/60">
        {value === null ? (
          <div
            className="h-full w-full opacity-50"
            style={{
              backgroundImage:
                "repeating-linear-gradient(45deg, currentColor 0 2px, transparent 2px 5px)",
              color: "rgb(148 163 184)",
            }}
          />
        ) : (
          <div
            className={cn("h-full", color)}
            style={{ width: `${Math.max(2, Math.min(100, v))}%` }}
          />
        )}
      </div>
      <div className="w-9 shrink-0 text-right font-mono text-[10px] font-bold tabular-nums">
        {value === null ? "—" : Math.round(v)}
      </div>
    </div>
  );
}

function NoteStrip({
  tone,
  icon,
  body,
}: {
  tone: "amber" | "rose";
  icon: React.ReactNode;
  body: string;
}) {
  const toneClass =
    tone === "amber"
      ? "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-800/60 dark:bg-amber-950/30 dark:text-amber-100"
      : "border-rose-300 bg-rose-50 text-rose-900 dark:border-rose-800/60 dark:bg-rose-950/30 dark:text-rose-100";
  return (
    <div
      className={cn(
        "flex items-start gap-2 rounded-lg border px-2.5 py-2 text-[11px] leading-relaxed",
        toneClass,
      )}
    >
      <div className="mt-0.5 shrink-0">{icon}</div>
      <p className="min-w-0">{body}</p>
    </div>
  );
}

// ── Plan détaillé du mésocycle (auditable) ──────────────────────────────────

/**
 * Affiche le contenu complet du mésocycle (semaines → séances → exercices)
 * en miroir de l'aperçu nageur. Le coach peut ainsi auditer le PLAN, pas
 * seulement le POURQUOI (= raisonnement, déjà rendu plus haut).
 *
 * Toutes les semaines repliées par défaut, comme côté nageur (§294, fix
 * cohérence Coach ↔ Nageur). Bouton « Tout déplier » disponible.
 */
function MesocyclePlanContent({ mesocycleId }: { mesocycleId: string }) {
  const { data: sessions = [], isLoading } = useQuery({
    queryKey: ["mesocycle-content", mesocycleId],
    queryFn: () => getMesocycleSessionsContent(mesocycleId),
    staleTime: 60_000,
  });

  // Regroupe par week_number → liste de sessions.
  const weeks = useMemo(() => {
    const m = new Map<number, MesocycleSessionContent[]>();
    for (const s of sessions) {
      const arr = m.get(s.weekNumber) ?? [];
      arr.push(s);
      m.set(s.weekNumber, arr);
    }
    return Array.from(m.entries())
      .sort(([a], [b]) => a - b)
      .map(([weekNumber, ss]) => ({
        weekNumber,
        cycle: ss[0]?.cycle ?? "",
        sessions: ss.sort((a, b) => a.sessionNumber - b.sessionNumber),
      }));
  }, [sessions]);

  const [expanded, setExpanded] = useState<Set<number>>(() => new Set());

  if (isLoading) {
    return (
      <Card className="rounded-2xl border bg-card p-4">
        <div className="h-24 animate-pulse rounded bg-muted" />
      </Card>
    );
  }

  if (weeks.length === 0) {
    return (
      <Card className="rounded-2xl border-dashed bg-muted/20 p-4 text-center">
        <p className="text-[11px] leading-relaxed text-muted-foreground">
          Aucune séance trouvée pour ce mésocycle dans la base.
        </p>
      </Card>
    );
  }

  const allExpanded = expanded.size === weeks.length;
  const toggleAll = () => {
    if (allExpanded) setExpanded(new Set());
    else setExpanded(new Set(weeks.map((w) => w.weekNumber)));
  };
  const toggleWeek = (n: number) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(n)) next.delete(n);
      else next.add(n);
      return next;
    });
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between px-1">
        <div className="min-w-0 leading-tight">
          <p className="text-[10px] font-black uppercase tracking-[0.18em] text-violet-600 dark:text-violet-400">
            Plan auditable
          </p>
          <h3 className="flex items-center gap-2 text-sm font-bold">
            <Layers className="h-4 w-4 text-violet-600 dark:text-violet-400" />
            Plan détaillé
          </h3>
        </div>
        <button
          type="button"
          onClick={toggleAll}
          className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground hover:text-foreground"
        >
          {allExpanded ? "Tout replier" : "Tout déplier"}
        </button>
      </div>

      <ol className="space-y-2">
        {weeks.map((w) => {
          const cycle = (w.cycle as PeriodizationCycle) || "prepa_generale";
          const c = CYCLE_COLOR[cycle] ?? CYCLE_COLOR.prepa_generale;
          const cycleLabel = PERIODIZATION_CYCLES[cycle]?.label ?? w.cycle;
          const isOpen = expanded.has(w.weekNumber);
          return (
            <li
              key={w.weekNumber}
              className="overflow-hidden rounded-xl border bg-card"
            >
              <button
                type="button"
                onClick={() => toggleWeek(w.weekNumber)}
                className="flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-muted/40"
                aria-expanded={isOpen}
              >
                <span className={cn("block h-2.5 w-2.5 shrink-0 rounded-full ring-4", c.dot, c.ring)} />
                <div className="min-w-0 flex-1 leading-tight">
                  <div className="flex items-baseline gap-2">
                    <span className="font-mono text-[10px] font-black tabular-nums tracking-wider text-muted-foreground">
                      S{String(w.weekNumber).padStart(2, "0")}
                    </span>
                    <span className="text-xs font-bold">{cycleLabel}</span>
                  </div>
                  <p className="mt-0.5 text-[10px] text-muted-foreground">
                    <span className="tabular-nums">{w.sessions.length}</span> séances ·{" "}
                    <span className="tabular-nums">
                      {w.sessions.reduce((s, sess) => s + sess.exercises.length, 0)}
                    </span>{" "}
                    exercices
                  </p>
                </div>
                <div className="shrink-0">
                  {isOpen ? (
                    <ChevronUp className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <ChevronDown className="h-4 w-4 text-muted-foreground" />
                  )}
                </div>
              </button>

              {isOpen && (
                <div className={cn("border-t px-2 py-2", c.bg)}>
                  <div className="space-y-2">
                    {w.sessions.map((s) => (
                      <SessionContentCard
                        key={s.sessionNumber}
                        session={s}
                        cycleColor={c}
                      />
                    ))}
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function SessionContentCard({
  session,
  cycleColor,
}: {
  session: MesocycleSessionContent;
  cycleColor: (typeof CYCLE_COLOR)[PeriodizationCycle];
}) {
  return (
    <div className="rounded-lg border bg-background p-2.5 shadow-sm">
      <div className="mb-2 flex items-center justify-between gap-3">
        <h4 className="flex items-center gap-2 text-xs font-bold">
          <span className="font-mono text-[9px] font-black tabular-nums text-muted-foreground">
            J{session.sessionNumber}
          </span>
          <span>Séance {session.sessionNumber}</span>
        </h4>
        <div className="flex flex-wrap items-center justify-end gap-1">
          {session.buckets.map((b) => (
            <Badge
              key={b}
              variant="outline"
              className={cn(
                "h-4 px-1 text-[9px] font-black uppercase tracking-wider",
                b === "mobility"
                  ? "border-slate-300 bg-slate-100 text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
                  : cn(cycleColor.bg, cycleColor.text, "border-current/30"),
              )}
            >
              {BUCKET_SHORT_FR[b as AnyBucket] ?? b}
            </Badge>
          ))}
        </div>
      </div>

      <ul className="divide-y divide-border/60">
        {session.exercises.map((ex, idx) => (
          <li key={idx} className="flex items-start gap-2 py-1.5">
            <span className="mt-0.5 w-5 shrink-0 font-mono text-[10px] font-black tabular-nums text-muted-foreground">
              {String(idx + 1).padStart(2, "0")}
            </span>
            <ExerciseGifLightbox
              src={ex.illustrationGif}
              alt={ex.nomExercice}
              size="xs"
              className="mt-0.5"
            />
            <div className="min-w-0 flex-1 leading-tight">
              <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
                <span className="text-xs font-semibold">{ex.nomExercice}</span>
                <Badge
                  variant="outline"
                  className="h-4 px-1 text-[9px] font-bold uppercase tracking-wider text-muted-foreground"
                >
                  {BUCKET_SHORT_FR[ex.bucket as AnyBucket] ?? ex.bucket}
                </Badge>
                {ex.isCore && (
                  <Badge
                    variant="outline"
                    className="h-4 border-violet-300 bg-violet-50 px-1 text-[9px] font-bold uppercase tracking-wider text-violet-700 dark:border-violet-800 dark:bg-violet-950/40 dark:text-violet-300"
                  >
                    core
                  </Badge>
                )}
                {ex.substituted && (
                  <Badge
                    variant="outline"
                    className="h-4 border-orange-300 bg-orange-50 px-1 text-[9px] font-bold uppercase tracking-wider text-orange-700 dark:border-orange-800 dark:bg-orange-950/40 dark:text-orange-300"
                  >
                    remplace #{ex.originalExerciseId}
                  </Badge>
                )}
              </div>
              {ex.intention && (
                <p className="mt-0.5 text-[10px] italic leading-relaxed text-muted-foreground">
                  {ex.intention}
                </p>
              )}
            </div>
            <div className="shrink-0 text-right">
              <p className="font-mono text-[11px] font-bold tabular-nums">
                {ex.sets ?? "?"} × {ex.reps ?? "?"}
                {ex.intensityPct1rm != null && (
                  <span className="text-muted-foreground"> @ {ex.intensityPct1rm}%</span>
                )}
              </p>
              {ex.restSeconds != null && (
                <p className="font-mono text-[9px] tabular-nums text-muted-foreground">
                  {ex.restSeconds}s
                </p>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function HistoryStrip({ history }: { history: StrengthMesocycle[] }) {
  // Skip the active one (already shown above).
  const past = history.filter((m) => m.status !== "active").slice(0, 5);
  if (past.length === 0) return null;
  return (
    <div className="rounded-2xl border bg-card p-3">
      <div className="mb-2 flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground">
        <History className="h-3 w-3" />
        Historique mésocycles
      </div>
      <ul className="space-y-1">
        {past.map((m) => (
          <li
            key={m.id}
            className="flex items-center gap-3 rounded-lg border bg-muted/20 px-2 py-1.5 text-[11px]"
          >
            <Badge
              variant="outline"
              className={cn(
                "h-4 px-1 text-[9px] font-bold uppercase tracking-wider",
                m.status === "reverted"
                  ? "border-rose-300 bg-rose-50 text-rose-700"
                  : "border-slate-300 bg-slate-50 text-slate-700",
              )}
            >
              {m.status}
            </Badge>
            <span className="font-mono tabular-nums text-muted-foreground">
              {m.target_week_count}sem ·{" "}
              {m.sessions_per_week}/sem
            </span>
            <span className="ml-auto font-mono tabular-nums text-muted-foreground">
              {fmtDate(m.generated_at)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function EmptyState({ history }: { history: StrengthMesocycle[] }) {
  return (
    <Card className="rounded-2xl border-dashed bg-muted/20 p-5 text-center">
      <div className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-muted">
        <CheckCircle2 className="h-5 w-5 text-muted-foreground" />
      </div>
      <p className="text-sm font-semibold">Aucun mésocycle actif</p>
      <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
        Le nageur n'a pas encore généré de mésocycle muscu, ou l'a rejeté.
        Il peut en générer un depuis son écran muscu, une fois son bilan
        complété.
      </p>
      {history.length > 0 && (
        <p className="mt-2 text-[10px] font-mono tabular-nums text-muted-foreground">
          {history.length} mésocycle{history.length > 1 ? "s" : ""} dans l'historique
        </p>
      )}
    </Card>
  );
}

// ── Parsing du jsonb bucket_priorities ───────────────────────────────────────

function parseReasoning(raw: Record<string, unknown> | null): ReasoningDb | null {
  if (!raw || typeof raw !== "object") return null;
  // Best-effort cast — le snapshot suit la forme de MesocycleReasoning (cf.
  // mesocycleEngine.types.ts) ; on est tolérant aux champs manquants.
  const r = raw as Partial<ReasoningDb>;
  if (!r.bucketScores || !Array.isArray(r.bucketPriorities)) return null;
  return {
    bucketScores: r.bucketScores,
    bucketPriorities: r.bucketPriorities as BucketPriorityDb[],
    bucketAllocations: Array.isArray(r.bucketAllocations) ? r.bucketAllocations : [],
    dataConfidence:
      r.dataConfidence === "full" || r.dataConfidence === "partial" || r.dataConfidence === "low"
        ? r.dataConfidence
        : "low",
    psychFlag: !!r.psychFlag,
    lowestBaremeConfidence:
      typeof r.lowestBaremeConfidence === "string"
        ? r.lowestBaremeConfidence
        : "placeholder",
    activeContraindications: Array.isArray(r.activeContraindications)
      ? (r.activeContraindications as string[])
      : [],
  };
}
