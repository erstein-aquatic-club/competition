/**
 * TrainingPlansBrowser — list + edit generic training plans (§275.4).
 *
 * - List view : my plans (filter ownerId = current user) ; click → opens editor.
 * - Editor    : grid (num_weeks × 7 days), each cell = session_template_id
 *               (or empty). Picker bottom sheet to pick a strength_sessions
 *               template. Delete cell clears the row.
 *
 * Applications UI (apply a plan to a user/group) is delivered in §275.5.
 */
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  Dumbbell,
  MoreHorizontal,
  Plus,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";

import {
  createTrainingPlan,
  deleteTrainingPlan,
  deleteTrainingPlanSession,
  getStrengthSessions,
  getTrainingPlanSessions,
  getTrainingPlans,
  updateTrainingPlan,
  upsertTrainingPlanSession,
} from "@/lib/api";
import type {
  StrengthSessionTemplate,
  TrainingPlan,
  TrainingPlanSession,
} from "@/lib/api/types";
import { useAuth } from "@/lib/auth";
import { detectPhase, PHASE_STYLES } from "@/lib/strength/strengthPhaseStyles";
import { cn } from "@/lib/utils";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { EmptyState } from "@/components/shared/EmptyState";

const DAY_LABELS = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];

export default function TrainingPlansBrowser() {
  const userId = useAuth((s) => s.userId);
  const [selectedPlanId, setSelectedPlanId] = useState<number | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  if (selectedPlanId != null) {
    return (
      <TrainingPlanEditor
        planId={selectedPlanId}
        onBack={() => setSelectedPlanId(null)}
      />
    );
  }

  return (
    <>
      <TrainingPlansList
        ownerId={userId ?? null}
        onSelect={(id) => setSelectedPlanId(id)}
        onCreate={() => setCreateOpen(true)}
      />
      <CreatePlanDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        ownerId={userId ?? null}
        onCreated={(plan) => {
          setCreateOpen(false);
          setSelectedPlanId(plan.id);
        }}
      />
    </>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   List view
   ═══════════════════════════════════════════════════════════════════ */

function TrainingPlansList({
  ownerId,
  onSelect,
  onCreate,
}: {
  ownerId: number | null;
  onSelect: (planId: number) => void;
  onCreate: () => void;
}) {
  const { data: plans = [], isLoading } = useQuery({
    queryKey: ["training_plans", "by-owner", ownerId],
    queryFn: () => getTrainingPlans(ownerId != null ? { ownerId } : {}),
    enabled: ownerId != null,
  });

  // Per-plan session count (single round-trip via separate query)
  const { data: allSessions = [] } = useQuery({
    queryKey: ["training_plan_sessions_counts", ownerId],
    queryFn: async () => {
      // No public batch query yet — fetch per plan in parallel. Acceptable
      // until we have many plans ; if it grows we'll wrap in an RPC.
      const results = await Promise.all(
        (plans ?? []).map((p) => getTrainingPlanSessions(p.id)),
      );
      return results.flat();
    },
    enabled: plans.length > 0,
  });

  const sessionCountByPlan = useMemo(() => {
    const map = new Map<number, number>();
    for (const s of allSessions) {
      map.set(s.plan_id, (map.get(s.plan_id) ?? 0) + 1);
    }
    return map;
  }, [allSessions]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          Mes plans d'entraînement (modèles réutilisables — applicables à un nageur
          ou un groupe).
        </p>
        <Button size="sm" onClick={onCreate}>
          <Plus className="h-4 w-4 mr-1.5" />
          Nouveau plan
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-20 rounded-xl border bg-muted/20 animate-pulse motion-reduce:animate-none"
            />
          ))}
        </div>
      ) : plans.length === 0 ? (
        <EmptyState
          icon={<Dumbbell />}
          title="Aucun plan d'entraînement"
          description="Crée un plan pour structurer tes semaines, puis applique-le à un nageur ou un groupe."
          cta={
            <Button onClick={onCreate}>
              <Plus className="h-4 w-4 mr-2" />
              Créer un plan
            </Button>
          }
        />
      ) : (
        <div className="space-y-2">
          {plans.map((p) => (
            <PlanCard
              key={p.id}
              plan={p}
              sessionCount={sessionCountByPlan.get(p.id) ?? 0}
              onSelect={() => onSelect(p.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function PlanCard({
  plan,
  sessionCount,
  onSelect,
}: {
  plan: TrainingPlan;
  sessionCount: number;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className="w-full flex items-center gap-3 rounded-xl border border-border bg-card p-3 text-left hover:border-primary/40 hover:shadow-sm transition-all active:scale-[0.99]"
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-semibold truncate">{plan.name}</span>
          {plan.is_draft && (
            <Badge variant="outline" className="text-[10px] px-1.5 py-0">
              Brouillon
            </Badge>
          )}
          <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
            {plan.num_weeks} sem.
          </Badge>
        </div>
        {plan.description && (
          <p className="text-[11px] text-muted-foreground mt-1 line-clamp-1">
            {plan.description}
          </p>
        )}
        <p className="text-[11px] text-muted-foreground/70 mt-0.5">
          {sessionCount} séance{sessionCount !== 1 ? "s" : ""}
        </p>
      </div>
    </button>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   Create plan dialog
   ═══════════════════════════════════════════════════════════════════ */

function CreatePlanDialog({
  open,
  onOpenChange,
  ownerId,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  ownerId: number | null;
  onCreated: (plan: TrainingPlan) => void;
}) {
  const [name, setName] = useState("");
  const [numWeeks, setNumWeeks] = useState(8);
  const queryClient = useQueryClient();

  const create = useMutation({
    mutationFn: () => {
      if (ownerId == null) throw new Error("Utilisateur non authentifié");
      return createTrainingPlan(
        { name: name.trim(), num_weeks: numWeeks, is_draft: true },
        ownerId,
      );
    },
    onSuccess: (plan) => {
      queryClient.invalidateQueries({ queryKey: ["training_plans"] });
      toast("Plan créé");
      setName("");
      setNumWeeks(8);
      onCreated(plan);
    },
    onError: (err: unknown) => {
      toast.error("Erreur", {
        description: err instanceof Error ? err.message : "Création échouée",
      });
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nouveau plan d'entraînement</DialogTitle>
          <DialogDescription>
            Crée un plan brouillon. Tu pourras l'éditer et l'appliquer ensuite à
            un nageur ou un groupe.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="plan-name">Nom</Label>
            <Input
              id="plan-name"
              placeholder="Ex : Prépa sprint 50m"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="plan-weeks">Durée (semaines)</Label>
            <Input
              id="plan-weeks"
              type="number"
              min={1}
              max={104}
              value={numWeeks}
              onChange={(e) => {
                const n = parseInt(e.target.value, 10);
                if (Number.isFinite(n) && n > 0 && n <= 104) setNumWeeks(n);
              }}
            />
          </div>
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={create.isPending}
          >
            Annuler
          </Button>
          <Button
            onClick={() => create.mutate()}
            disabled={create.isPending || !name.trim() || ownerId == null}
          >
            {create.isPending ? "Création..." : "Créer"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   Editor (grid num_weeks × 7)
   ═══════════════════════════════════════════════════════════════════ */

function TrainingPlanEditor({
  planId,
  onBack,
}: {
  planId: number;
  onBack: () => void;
}) {
  const queryClient = useQueryClient();

  const { data: plans = [] } = useQuery({
    queryKey: ["training_plans", "all"],
    queryFn: () => getTrainingPlans(),
  });
  const plan = plans.find((p) => p.id === planId) ?? null;

  const { data: sessions = [], isLoading: sessionsLoading } = useQuery({
    queryKey: ["training_plan_sessions", planId],
    queryFn: () => getTrainingPlanSessions(planId),
    enabled: planId != null,
  });

  const { data: templates = [] } = useQuery({
    queryKey: ["strength-sessions"],
    queryFn: () => getStrengthSessions(),
    staleTime: 5 * 60_000,
  });

  const templatesById = useMemo(() => {
    const map = new Map<number, StrengthSessionTemplate>();
    for (const t of templates) map.set(t.id, t);
    return map;
  }, [templates]);

  const sessionByWeekDay = useMemo(() => {
    const map = new Map<string, TrainingPlanSession>();
    for (const s of sessions) {
      map.set(`${s.relative_week}|${s.day_of_week}`, s);
    }
    return map;
  }, [sessions]);

  // Picker state
  const [picker, setPicker] = useState<{
    relativeWeek: number;
    dayOfWeek: number;
    existingId: number | null;
  } | null>(null);
  const [pickerSearch, setPickerSearch] = useState("");
  const debouncedSearch = useDebouncedValue(pickerSearch, 200);

  // Mutations
  const upsertSession = useMutation({
    mutationFn: (input: {
      relative_week: number;
      day_of_week: number;
      session_template_id: number;
    }) =>
      upsertTrainingPlanSession({
        plan_id: planId,
        relative_week: input.relative_week,
        day_of_week: input.day_of_week,
        session_template_id: input.session_template_id,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["training_plan_sessions", planId] });
    },
  });

  const deleteSessionMut = useMutation({
    mutationFn: (id: number) => deleteTrainingPlanSession(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["training_plan_sessions", planId] });
    },
  });

  const updatePlan = useMutation({
    mutationFn: (patch: { name?: string; description?: string | null; is_draft?: boolean }) =>
      updateTrainingPlan(planId, patch),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["training_plans"] });
    },
  });

  const deletePlanMut = useMutation({
    mutationFn: () => deleteTrainingPlan(planId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["training_plans"] });
      toast("Plan supprimé");
      onBack();
    },
    onError: (err: unknown) => {
      toast.error("Erreur", {
        description: err instanceof Error ? err.message : "Suppression échouée",
      });
    },
  });

  // Local editable name/description (saved on blur)
  const [nameDraft, setNameDraft] = useState(plan?.name ?? "");
  const [descDraft, setDescDraft] = useState(plan?.description ?? "");
  // Re-sync drafts when plan loads/changes
  useEffect(() => {
    if (plan) {
      setNameDraft(plan.name);
      setDescDraft(plan.description ?? "");
    }
  }, [plan]);

  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);

  if (!plan) {
    return (
      <div className="space-y-3">
        <button
          onClick={onBack}
          className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Retour
        </button>
        <p className="text-sm text-muted-foreground">Chargement du plan…</p>
      </div>
    );
  }

  const handlePick = (templateId: number) => {
    if (!picker) return;
    upsertSession.mutate(
      {
        relative_week: picker.relativeWeek,
        day_of_week: picker.dayOfWeek,
        session_template_id: templateId,
      },
      {
        onSuccess: () => setPicker(null),
        onError: (err: unknown) => {
          toast.error("Erreur", {
            description: err instanceof Error ? err.message : "Sauvegarde échouée",
          });
        },
      },
    );
  };

  const filteredTemplates = useMemo(() => {
    if (!debouncedSearch.trim()) return templates;
    const q = debouncedSearch.toLowerCase();
    return templates.filter(
      (t) =>
        (t.title ?? "").toLowerCase().includes(q) ||
        (t.name ?? "").toLowerCase().includes(q),
    );
  }, [templates, debouncedSearch]);

  return (
    <div className="space-y-4">
      {/* Breadcrumb */}
      <button
        onClick={onBack}
        className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        <span>Plans</span>
        <span className="text-muted-foreground/60">/</span>
        <span className="font-medium text-foreground truncate">{plan.name}</span>
      </button>

      {/* Header: name + description + actions */}
      <div className="rounded-xl border border-border bg-card p-3 space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor="plan-edit-name">Nom</Label>
          <Input
            id="plan-edit-name"
            value={nameDraft}
            onChange={(e) => setNameDraft(e.target.value)}
            onBlur={() => {
              const trimmed = nameDraft.trim();
              if (trimmed && trimmed !== plan.name) {
                updatePlan.mutate({ name: trimmed });
              } else {
                setNameDraft(plan.name);
              }
            }}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="plan-edit-desc">Description</Label>
          <Textarea
            id="plan-edit-desc"
            className="min-h-[60px] resize-none"
            value={descDraft}
            onChange={(e) => setDescDraft(e.target.value)}
            onBlur={() => {
              const trimmed = descDraft.trim() || null;
              if (trimmed !== (plan.description ?? null)) {
                updatePlan.mutate({ description: trimmed });
              }
            }}
            placeholder="Description ou contexte du plan…"
          />
        </div>
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-3">
            <Switch
              id="plan-draft-toggle"
              checked={!plan.is_draft}
              onCheckedChange={(v) => updatePlan.mutate({ is_draft: !v })}
            />
            <Label htmlFor="plan-draft-toggle" className="text-xs text-muted-foreground">
              {plan.is_draft ? "Brouillon" : "Publié"}
            </Label>
          </div>
          <Popover>
            <PopoverTrigger asChild>
              <button className="h-9 w-9 inline-flex items-center justify-center rounded-full hover:bg-muted">
                <MoreHorizontal className="h-4 w-4 text-muted-foreground" />
              </button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-44 p-1">
              <button
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-destructive hover:bg-muted"
                onClick={() => setDeleteConfirmOpen(true)}
              >
                <Trash2 className="h-4 w-4" />
                Supprimer le plan
              </button>
            </PopoverContent>
          </Popover>
        </div>
      </div>

      {/* Grid */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="p-3 border-b bg-muted/30">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Grille — {plan.num_weeks} semaines × 7 jours
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b">
                <th className="text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground px-2 py-2 w-[60px]">
                  Sem.
                </th>
                {DAY_LABELS.map((d) => (
                  <th
                    key={d}
                    className="text-center text-[10px] font-semibold uppercase tracking-wider text-muted-foreground px-1 py-2"
                  >
                    {d}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: plan.num_weeks }, (_, i) => i + 1).map((wk) => (
                <tr key={wk} className="border-b last:border-0">
                  <td className="px-2 py-1.5 text-xs font-semibold text-muted-foreground tabular-nums">
                    S{wk}
                  </td>
                  {[0, 1, 2, 3, 4, 5, 6].map((dow) => {
                    const cell = sessionByWeekDay.get(`${wk}|${dow}`);
                    const tpl = cell?.session_template_id
                      ? templatesById.get(cell.session_template_id) ?? null
                      : null;
                    return (
                      <td key={dow} className="px-0.5 py-0.5">
                        <PlanCell
                          template={tpl}
                          loading={sessionsLoading}
                          onTap={() =>
                            setPicker({
                              relativeWeek: wk,
                              dayOfWeek: dow,
                              existingId: cell?.session_template_id ?? null,
                            })
                          }
                          onClear={
                            cell
                              ? () => deleteSessionMut.mutate(cell.id)
                              : undefined
                          }
                        />
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Picker bottom sheet */}
      <Sheet
        open={picker != null}
        onOpenChange={(open) => {
          if (!open) setPicker(null);
        }}
      >
        <SheetContent side="bottom" className="rounded-t-2xl max-h-[85dvh] flex flex-col">
          <SheetHeader className="pb-2 shrink-0">
            <SheetTitle className="text-base">Choisir une séance</SheetTitle>
            <SheetDescription className="text-xs text-muted-foreground">
              {picker
                ? `S${picker.relativeWeek} — ${DAY_LABELS[picker.dayOfWeek]}`
                : ""}
            </SheetDescription>
          </SheetHeader>
          <div className="relative shrink-0 mb-3">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/50" />
            <Input
              className="pl-9 h-9 text-sm"
              placeholder="Rechercher une séance..."
              value={pickerSearch}
              onChange={(e) => setPickerSearch(e.target.value)}
            />
          </div>
          <div className="flex-1 overflow-y-auto -mx-1 px-1 pb-4 space-y-1">
            {filteredTemplates.length === 0 ? (
              <div className="text-center py-8">
                <Dumbbell className="h-8 w-8 text-muted-foreground/20 mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">Aucune séance trouvée</p>
              </div>
            ) : (
              filteredTemplates.map((s) => {
                const phase = detectPhase(s.title ?? s.name ?? "");
                const style = PHASE_STYLES[phase] ?? PHASE_STYLES.force;
                const itemCount = s.items?.length ?? 0;
                const isSelected = picker?.existingId === s.id;
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => handlePick(s.id)}
                    disabled={upsertSession.isPending}
                    className={cn(
                      "w-full flex items-center gap-3 rounded-xl px-3.5 py-3 text-left transition-all min-h-[48px] active:scale-[0.98]",
                      isSelected
                        ? cn(style.bg, "ring-2 ring-primary/30")
                        : "hover:bg-muted/50",
                    )}
                  >
                    <span className={cn("h-2.5 w-2.5 rounded-full shrink-0", style.dot)} />
                    <div className="flex-1 min-w-0">
                      <span className="text-sm font-medium block truncate">
                        {s.title ?? s.name}
                      </span>
                      {s.description && (
                        <span className="text-[11px] text-muted-foreground line-clamp-1">
                          {s.description}
                        </span>
                      )}
                    </div>
                    {itemCount > 0 && (
                      <Badge variant="secondary" className="text-[10px] shrink-0">
                        {itemCount} ex.
                      </Badge>
                    )}
                  </button>
                );
              })
            )}
          </div>
        </SheetContent>
      </Sheet>

      {/* Delete confirmation */}
      <Dialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Supprimer ce plan ?</DialogTitle>
            <DialogDescription>
              Le plan "{plan.name}" et toutes ses séances seront supprimés. Les
              applications déjà faites seront elles aussi retirées. Action irréversible.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirmOpen(false)}>
              Annuler
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                setDeleteConfirmOpen(false);
                deletePlanMut.mutate();
              }}
              disabled={deletePlanMut.isPending}
            >
              Supprimer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   Plan cell (single grid cell)
   ═══════════════════════════════════════════════════════════════════ */

function PlanCell({
  template,
  loading,
  onTap,
  onClear,
}: {
  template: StrengthSessionTemplate | null;
  loading: boolean;
  onTap: () => void;
  onClear?: () => void;
}) {
  if (loading) {
    return <div aria-hidden className="h-9 rounded-md bg-muted/40 animate-pulse motion-reduce:animate-none" />;
  }
  if (!template) {
    return (
      <button
        type="button"
        onClick={onTap}
        className="h-9 w-full rounded-md border border-dashed border-muted-foreground/20 flex items-center justify-center hover:border-muted-foreground/40 hover:bg-muted/30 transition-colors active:scale-95"
        aria-label="Ajouter une séance"
      >
        <Plus className="h-3.5 w-3.5 text-muted-foreground/40" />
      </button>
    );
  }
  const sessionName = template.title ?? template.name ?? "Séance";
  const phase = detectPhase(sessionName);
  const style = PHASE_STYLES[phase] ?? PHASE_STYLES.force;
  const displayName = sessionName.replace(/^[A-Za-z]{3,4}\s*[—–-]\s*/u, "").slice(0, 18);
  return (
    <div className={cn("relative h-9 w-full rounded-md flex items-center gap-1 px-1 group", style.bg)}>
      <button
        type="button"
        onClick={onTap}
        className="flex-1 min-w-0 flex items-center gap-1 text-left active:scale-[0.97]"
      >
        <span className={cn("h-2 w-2 rounded-full shrink-0", style.dot)} />
        <span className={cn("text-[10px] font-semibold truncate", style.text)}>
          {displayName}
        </span>
      </button>
      {onClear && (
        <button
          type="button"
          onClick={onClear}
          className="opacity-0 group-hover:opacity-100 inline-flex h-5 w-5 items-center justify-center rounded-full hover:bg-background/50 shrink-0"
          aria-label="Retirer la séance"
        >
          <X className="h-3 w-3 text-muted-foreground" />
        </button>
      )}
    </div>
  );
}
