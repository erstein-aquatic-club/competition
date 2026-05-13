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
  CalendarDays,
  Dumbbell,
  MoreHorizontal,
  Plus,
  Search,
  Send,
  Trash2,
  Users,
  X,
} from "lucide-react";
import { toast } from "sonner";

import {
  applyTrainingPlan,
  createTrainingPlan,
  deleteTrainingPlan,
  deleteTrainingPlanApplication,
  deleteTrainingPlanSession,
  getAthletes,
  getGroups,
  getStrengthFolders,
  getStrengthSessions,
  getTrainingPlanApplications,
  getTrainingPlanSessions,
  getTrainingPlans,
  updateTrainingPlan,
  upsertTrainingPlanSession,
} from "@/lib/api";
import type {
  AthleteSummary,
  StrengthFolder,
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
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { FolderCard } from "@/components/shared/FolderCard";

const DAY_LABELS = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];

function PickerSessionRow({
  session,
  isSelected,
  isPending,
  onPick,
}: {
  session: StrengthSessionTemplate;
  isSelected: boolean;
  isPending: boolean;
  onPick: (id: number) => void;
}) {
  const phase = detectPhase(session.title ?? session.name ?? "");
  const style = PHASE_STYLES[phase] ?? PHASE_STYLES.force;
  const itemCount = session.items?.length ?? 0;
  return (
    <button
      type="button"
      onClick={() => onPick(session.id)}
      disabled={isPending}
      className={cn(
        "w-full flex items-center gap-3 rounded-xl px-3.5 py-3 text-left transition-all min-h-[48px] active:scale-[0.98]",
        isSelected ? cn(style.bg, "ring-2 ring-primary/30") : "hover:bg-muted/50",
      )}
    >
      <span className={cn("h-2.5 w-2.5 rounded-full shrink-0", style.dot)} />
      <div className="flex-1 min-w-0">
        <span className="text-sm font-medium block truncate">
          {session.title ?? session.name}
        </span>
        {session.description && (
          <span className="text-[11px] text-muted-foreground line-clamp-1">
            {session.description}
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
}

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

  const { data: sessionFolders = [] } = useQuery({
    queryKey: ["strength_folders", "session", null],
    queryFn: () => getStrengthFolders("session", { athleteId: null }),
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

  // Detail drawer for a populated cell (shows exercises/sets/reps/%1RM/rest)
  const [cellDetail, setCellDetail] = useState<TrainingPlanSession | null>(null);
  const [removeLastWeekConfirmOpen, setRemoveLastWeekConfirmOpen] = useState(false);

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
    mutationFn: (patch: { name?: string; description?: string | null; is_draft?: boolean; num_weeks?: number }) =>
      updateTrainingPlan(planId, patch),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["training_plans"] });
    },
  });

  // Append one empty week at the end : increment num_weeks. Sessions remain
  // unchanged ; the new row appears in the grid with empty cells.
  const addWeekMut = useMutation({
    mutationFn: (currentNumWeeks: number) =>
      updateTrainingPlan(planId, { num_weeks: currentNumWeeks + 1 }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["training_plans"] });
      toast("Semaine ajoutée");
    },
    onError: (err: unknown) => {
      toast.error("Erreur", {
        description: err instanceof Error ? err.message : "Ajout échoué",
      });
    },
  });

  // Remove the LAST week : delete all training_plan_sessions for that week
  // then decrement num_weeks. Sessions in middle weeks are never touched —
  // re-numbering them implicitly would surprise the coach.
  const removeLastWeekMut = useMutation({
    mutationFn: async (currentNumWeeks: number) => {
      if (currentNumWeeks <= 1) throw new Error("Un plan doit avoir au moins une semaine");
      const lastWeek = currentNumWeeks;
      const sessionsOfLastWeek = sessions.filter((s) => s.relative_week === lastWeek);
      await Promise.all(
        sessionsOfLastWeek.map((s) => deleteTrainingPlanSession(s.id)),
      );
      return updateTrainingPlan(planId, { num_weeks: currentNumWeeks - 1 });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["training_plans"] });
      queryClient.invalidateQueries({ queryKey: ["training_plan_sessions", planId] });
      toast("Dernière semaine supprimée");
    },
    onError: (err: unknown) => {
      toast.error("Erreur", {
        description: err instanceof Error ? err.message : "Suppression échouée",
      });
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
  const [applyOpen, setApplyOpen] = useState(false);

  // IMPORTANT: keep all hook calls above any early return. Moving this
  // useMemo below `if (!plan) return` violates the Rules of Hooks (the hook
  // count differs between the loading render and the loaded render) and
  // surfaces as React error #310 in production builds.
  const filteredTemplates = useMemo(() => {
    if (!debouncedSearch.trim()) return templates;
    const q = debouncedSearch.toLowerCase();
    return templates.filter(
      (t) =>
        (t.title ?? "").toLowerCase().includes(q) ||
        (t.name ?? "").toLowerCase().includes(q),
    );
  }, [templates, debouncedSearch]);

  const { pickerFolders, pickerUnfiled } = useMemo(() => {
    const byFolder = new Map<number, StrengthSessionTemplate[]>();
    const unfiled: StrengthSessionTemplate[] = [];
    for (const t of filteredTemplates) {
      if (t.folder_id != null) {
        const arr = byFolder.get(t.folder_id) ?? [];
        arr.push(t);
        byFolder.set(t.folder_id, arr);
      } else {
        unfiled.push(t);
      }
    }
    const folders = sessionFolders
      .map((f) => ({ folder: f, sessions: byFolder.get(f.id) ?? [] }))
      .filter(({ sessions }) => sessions.length > 0);
    return { pickerFolders: folders, pickerUnfiled: unfiled };
  }, [filteredTemplates, sessionFolders]);

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
          <div className="flex items-center gap-2">
            <Button size="sm" onClick={() => setApplyOpen(true)}>
              <Send className="h-4 w-4 mr-1.5" />
              Appliquer
            </Button>
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
                          onTap={() => {
                            // Tap on filled cell → open detail drawer ; on empty
                            // cell → open picker to create a new entry.
                            if (cell) {
                              setCellDetail(cell);
                            } else {
                              setPicker({
                                relativeWeek: wk,
                                dayOfWeek: dow,
                                existingId: null,
                              });
                            }
                          }}
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

        {/* Week actions */}
        <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 border-t bg-muted/10">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => addWeekMut.mutate(plan.num_weeks)}
            disabled={addWeekMut.isPending || plan.num_weeks >= 104}
            className="text-xs"
          >
            <Plus className="h-3.5 w-3.5 mr-1" />
            Ajouter une semaine
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setRemoveLastWeekConfirmOpen(true)}
            disabled={removeLastWeekMut.isPending || plan.num_weeks <= 1}
            className="text-xs text-destructive hover:text-destructive hover:bg-destructive/10"
          >
            <Trash2 className="h-3.5 w-3.5 mr-1" />
            Supprimer la dernière semaine
          </Button>
        </div>
      </div>

      {/* Applications list */}
      <PlanApplicationsList planId={planId} planNumWeeks={plan.num_weeks} />

      {/* Apply dialog */}
      <ApplyPlanDialog
        open={applyOpen}
        onOpenChange={setApplyOpen}
        planId={planId}
        planNumWeeks={plan.num_weeks}
      />

      {/* Cell detail drawer (exercises / sets / reps / %1RM / rest) */}
      <CellDetailDrawer
        cell={cellDetail}
        template={
          cellDetail?.session_template_id != null
            ? templatesById.get(cellDetail.session_template_id) ?? null
            : null
        }
        onClose={() => setCellDetail(null)}
        onChangeSession={() => {
          if (!cellDetail) return;
          // Switch to picker for the same cell.
          setPicker({
            relativeWeek: cellDetail.relative_week,
            dayOfWeek: cellDetail.day_of_week,
            existingId: cellDetail.session_template_id ?? null,
          });
          setCellDetail(null);
        }}
        onRemove={() => {
          if (!cellDetail) return;
          deleteSessionMut.mutate(cellDetail.id, {
            onSuccess: () => setCellDetail(null),
            onError: (err: unknown) => {
              toast.error("Erreur", {
                description: err instanceof Error ? err.message : "Suppression échouée",
              });
            },
          });
        }}
        removePending={deleteSessionMut.isPending}
      />

      {/* Remove last week confirmation */}
      <Dialog open={removeLastWeekConfirmOpen} onOpenChange={setRemoveLastWeekConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Supprimer la dernière semaine ?</DialogTitle>
            <DialogDescription>
              La semaine S{plan.num_weeks} et ses {sessions.filter((s) => s.relative_week === plan.num_weeks).length} séance(s)
              seront supprimées. Cette action ne peut pas être annulée.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRemoveLastWeekConfirmOpen(false)}>
              Annuler
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                setRemoveLastWeekConfirmOpen(false);
                removeLastWeekMut.mutate(plan.num_weeks);
              }}
              disabled={removeLastWeekMut.isPending}
            >
              Supprimer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
          <div className="flex-1 overflow-y-auto -mx-1 px-1 pb-4 space-y-2">
            {filteredTemplates.length === 0 ? (
              <div className="text-center py-8">
                <Dumbbell className="h-8 w-8 text-muted-foreground/20 mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">Aucune séance trouvée</p>
              </div>
            ) : (
              <>
                {pickerFolders.map(({ folder, sessions }) => (
                  <FolderCard
                    key={folder.id}
                    name={folder.name}
                    count={sessions.length}
                    defaultOpen={false}
                  >
                    <div className="space-y-1 pt-1">
                      {sessions.map((s) => (
                        <PickerSessionRow
                          key={s.id}
                          session={s}
                          isSelected={picker?.existingId === s.id}
                          isPending={upsertSession.isPending}
                          onPick={handlePick}
                        />
                      ))}
                    </div>
                  </FolderCard>
                ))}
                {pickerUnfiled.length > 0 && (
                  <>
                    {pickerFolders.length > 0 && (
                      <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/60 px-1 pt-1">
                        Non classées
                      </p>
                    )}
                    <div className="space-y-1">
                      {pickerUnfiled.map((s) => (
                        <PickerSessionRow
                          key={s.id}
                          session={s}
                          isSelected={picker?.existingId === s.id}
                          isPending={upsertSession.isPending}
                          onPick={handlePick}
                        />
                      ))}
                    </div>
                  </>
                )}
              </>
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
   Applications list (per-plan)
   ═══════════════════════════════════════════════════════════════════ */

function PlanApplicationsList({
  planId,
  planNumWeeks,
}: {
  planId: number;
  planNumWeeks: number;
}) {
  const queryClient = useQueryClient();

  const { data: applications = [], isLoading } = useQuery({
    queryKey: ["training_plan_applications", "by-plan", planId],
    queryFn: () => getTrainingPlanApplications({ planId }),
  });

  const { data: athletes = [] } = useQuery({
    queryKey: ["athletes"],
    queryFn: () => getAthletes(),
    staleTime: 5 * 60_000,
  });
  const { data: groups = [] } = useQuery({
    queryKey: ["groups"],
    queryFn: () => getGroups(),
    staleTime: 5 * 60_000,
  });

  const athleteName = (id: number | null): string =>
    athletes.find((a) => a.id === id)?.display_name ?? `Nageur #${id}`;
  const groupName = (id: number | null): string =>
    groups.find((g) => g.id === id)?.name ?? `Groupe #${id}`;

  const deleteAppMut = useMutation({
    mutationFn: (id: number) => deleteTrainingPlanApplication(id),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["training_plan_applications", "by-plan", planId],
      });
      toast("Application retirée");
    },
    onError: (err: unknown) => {
      toast.error("Erreur", {
        description: err instanceof Error ? err.message : "Suppression échouée",
      });
    },
  });

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <div className="p-3 border-b bg-muted/30 flex items-center gap-2">
        <Send className="h-3.5 w-3.5 text-muted-foreground" />
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          Applications ({applications.length})
        </p>
      </div>
      {isLoading ? (
        <div className="p-3 space-y-2">
          {[1, 2].map((i) => (
            <div
              key={i}
              className="h-10 rounded-md bg-muted/40 animate-pulse motion-reduce:animate-none"
            />
          ))}
        </div>
      ) : applications.length === 0 ? (
        <p className="text-xs text-muted-foreground p-4 text-center">
          Aucune application pour l'instant. Tape "Appliquer" pour assigner ce plan à un nageur ou un groupe.
        </p>
      ) : (
        <ul className="divide-y divide-border">
          {applications.map((app) => (
            <li
              key={app.id}
              className="flex items-center gap-2 px-3 py-2.5 hover:bg-muted/20 group"
            >
              <span
                className={cn(
                  "inline-flex items-center justify-center h-6 w-6 rounded-full shrink-0",
                  app.target_user_id != null
                    ? "bg-blue-500/15 text-blue-700 dark:text-blue-300"
                    : "bg-violet-500/15 text-violet-700 dark:text-violet-300",
                )}
              >
                {app.target_user_id != null ? (
                  <Dumbbell className="h-3 w-3" />
                ) : (
                  <Users className="h-3 w-3" />
                )}
              </span>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate">
                  {app.target_user_id != null
                    ? athleteName(app.target_user_id)
                    : groupName(app.target_group_id)}
                </div>
                <div className="text-[11px] text-muted-foreground">
                  Démarre le {formatFrenchDate(app.start_date)}
                  {app.end_date
                    ? ` — termine le ${formatFrenchDate(app.end_date)}`
                    : ` — durée ${planNumWeeks} sem.`}
                </div>
              </div>
              <button
                type="button"
                onClick={() => deleteAppMut.mutate(app.id)}
                disabled={deleteAppMut.isPending}
                className="opacity-0 group-hover:opacity-100 inline-flex h-9 w-9 items-center justify-center rounded-full text-destructive hover:bg-destructive/10 shrink-0"
                aria-label="Retirer cette application"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   Apply plan dialog
   ═══════════════════════════════════════════════════════════════════ */

function ApplyPlanDialog({
  open,
  onOpenChange,
  planId,
  planNumWeeks,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  planId: number;
  planNumWeeks: number;
}) {
  const userId = useAuth((s) => s.userId);
  const queryClient = useQueryClient();

  const { data: athletes = [] } = useQuery({
    queryKey: ["athletes"],
    queryFn: () => getAthletes(),
    staleTime: 5 * 60_000,
  });
  const { data: groups = [] } = useQuery({
    queryKey: ["groups"],
    queryFn: () => getGroups(),
    staleTime: 5 * 60_000,
  });

  const permanentGroups = useMemo(
    () => groups.filter((g) => !g.is_temporary),
    [groups],
  );
  const sortedAthletes = useMemo(
    () =>
      [...athletes]
        .filter((a): a is AthleteSummary & { id: number } => a.id != null)
        .sort((a, b) => a.display_name.localeCompare(b.display_name, "fr")),
    [athletes],
  );

  const [targetKind, setTargetKind] = useState<"user" | "group">("user");
  const [targetUserId, setTargetUserId] = useState<number | null>(null);
  const [targetGroupId, setTargetGroupId] = useState<number | null>(null);
  const [startDate, setStartDate] = useState<string>(() => nextMondayIso(new Date()));

  // Reset on close
  useEffect(() => {
    if (!open) {
      setTargetKind("user");
      setTargetUserId(null);
      setTargetGroupId(null);
      setStartDate(nextMondayIso(new Date()));
    }
  }, [open]);

  const startDateError = !isMondayIso(startDate)
    ? "La date doit être un lundi."
    : null;
  const endDateIso = useMemo(() => {
    if (!isMondayIso(startDate)) return null;
    const d = new Date(startDate + "T00:00:00");
    d.setDate(d.getDate() + planNumWeeks * 7 - 1);
    return d.toISOString().slice(0, 10);
  }, [startDate, planNumWeeks]);

  const targetReady =
    targetKind === "user" ? targetUserId != null : targetGroupId != null;
  const canSubmit =
    targetReady && startDateError == null && userId != null;

  const applyMut = useMutation({
    mutationFn: () => {
      if (userId == null) throw new Error("Non authentifié");
      return applyTrainingPlan(
        {
          plan_id: planId,
          target_user_id: targetKind === "user" ? targetUserId : null,
          target_group_id: targetKind === "group" ? targetGroupId : null,
          start_date: startDate,
        },
        userId,
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["training_plan_applications", "by-plan", planId],
      });
      toast("Plan appliqué");
      onOpenChange(false);
    },
    onError: (err: unknown) => {
      toast.error("Erreur", {
        description: err instanceof Error ? err.message : "Application échouée",
      });
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Appliquer ce plan</DialogTitle>
          <DialogDescription>
            Choisis un nageur ou un groupe et la semaine de démarrage. La séance
            du jour pour chaque nageur sera dérivée de la grille du plan.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Target kind */}
          <div className="space-y-2">
            <Label className="text-xs">Cible</Label>
            <RadioGroup
              value={targetKind}
              onValueChange={(v) => setTargetKind(v as "user" | "group")}
              className="grid grid-cols-2 gap-2"
            >
              <Label
                htmlFor="apply-target-user"
                className={cn(
                  "flex items-center gap-2 rounded-lg border p-2.5 cursor-pointer transition-colors",
                  targetKind === "user"
                    ? "border-primary bg-primary/5"
                    : "border-border hover:bg-muted/40",
                )}
              >
                <RadioGroupItem id="apply-target-user" value="user" />
                <Dumbbell className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-sm font-medium">Un nageur</span>
              </Label>
              <Label
                htmlFor="apply-target-group"
                className={cn(
                  "flex items-center gap-2 rounded-lg border p-2.5 cursor-pointer transition-colors",
                  targetKind === "group"
                    ? "border-primary bg-primary/5"
                    : "border-border hover:bg-muted/40",
                )}
              >
                <RadioGroupItem id="apply-target-group" value="group" />
                <Users className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-sm font-medium">Un groupe</span>
              </Label>
            </RadioGroup>
          </div>

          {/* Target picker */}
          {targetKind === "user" ? (
            <div className="space-y-1.5">
              <Label htmlFor="apply-user-select" className="text-xs">
                Nageur
              </Label>
              <Select
                value={targetUserId?.toString() ?? ""}
                onValueChange={(v) => setTargetUserId(Number(v))}
              >
                <SelectTrigger id="apply-user-select">
                  <SelectValue placeholder="Choisir un nageur..." />
                </SelectTrigger>
                <SelectContent className="max-h-[50dvh]">
                  {sortedAthletes.map((a) => (
                    <SelectItem key={a.id} value={String(a.id)}>
                      {a.display_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : (
            <div className="space-y-1.5">
              <Label htmlFor="apply-group-select" className="text-xs">
                Groupe
              </Label>
              <Select
                value={targetGroupId?.toString() ?? ""}
                onValueChange={(v) => setTargetGroupId(Number(v))}
              >
                <SelectTrigger id="apply-group-select">
                  <SelectValue placeholder="Choisir un groupe..." />
                </SelectTrigger>
                <SelectContent>
                  {permanentGroups.map((g) => (
                    <SelectItem key={g.id} value={String(g.id)}>
                      {g.name}
                      {g.member_count != null && (
                        <span className="text-muted-foreground ml-1.5">
                          ({g.member_count})
                        </span>
                      )}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Start date */}
          <div className="space-y-1.5">
            <Label htmlFor="apply-start-date" className="text-xs">
              Lundi de la semaine 1
            </Label>
            <Input
              id="apply-start-date"
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
            {startDateError ? (
              <p className="text-[11px] text-destructive flex items-center gap-1">
                <CalendarDays className="h-3 w-3" />
                {startDateError}{" "}
                <button
                  type="button"
                  className="underline hover:text-foreground"
                  onClick={() => setStartDate(nextMondayIso(new Date(startDate + "T00:00:00")))}
                >
                  Lundi suivant ?
                </button>
              </p>
            ) : (
              endDateIso && (
                <p className="text-[11px] text-muted-foreground flex items-center gap-1">
                  <CalendarDays className="h-3 w-3" />
                  Fin : {formatFrenchDate(endDateIso)} ({planNumWeeks} sem.)
                </p>
              )
            )}
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={applyMut.isPending}
          >
            Annuler
          </Button>
          <Button
            onClick={() => applyMut.mutate()}
            disabled={!canSubmit || applyMut.isPending}
          >
            {applyMut.isPending ? "Application..." : "Appliquer"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   Date helpers
   ═══════════════════════════════════════════════════════════════════ */

function isMondayIso(iso: string): boolean {
  if (!iso) return false;
  const d = new Date(iso + "T00:00:00");
  if (Number.isNaN(d.getTime())) return false;
  return d.getDay() === 1;
}

function nextMondayIso(from: Date): string {
  const d = new Date(from);
  d.setHours(0, 0, 0, 0);
  const day = d.getDay(); // 0 = Sun, 1 = Mon, ..., 6 = Sat
  const diff = day === 1 ? 0 : day === 0 ? 1 : 8 - day;
  d.setDate(d.getDate() + diff);
  return d.toISOString().slice(0, 10);
}

function formatFrenchDate(iso: string): string {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

/* ═══════════════════════════════════════════════════════════════════
   Cell detail drawer — shows the session's exercises with sets/reps/%1RM/rest
   Designed for "5-second read" : large names, compact metric chips, clear
   visual rhythm between exercises.
   ═══════════════════════════════════════════════════════════════════ */

const CYCLE_LABEL: Record<string, string> = {
  endurance: "Endurance",
  hypertrophie: "Hypertrophie",
  force: "Force",
};

/** Convert a rest duration in seconds to a runner-style "M'SS" string.
 *  60 → "1'", 90 → "1'30", 180 → "3'", 45 → "45s". */
function formatRest(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const sec = seconds % 60;
  return sec === 0 ? `${m}'` : `${m}'${String(sec).padStart(2, "0")}`;
}

function CellDetailDrawer({
  cell,
  template,
  onClose,
  onChangeSession,
  onRemove,
  removePending,
}: {
  cell: TrainingPlanSession | null;
  template: StrengthSessionTemplate | null;
  onClose: () => void;
  onChangeSession: () => void;
  onRemove: () => void;
  removePending: boolean;
}) {
  const open = cell != null;
  const sessionName = template?.title ?? template?.name ?? "Séance";
  const phase = sessionName ? detectPhase(sessionName) : "force";
  const style = PHASE_STYLES[phase] ?? PHASE_STYLES.force;
  const items = template?.items ?? [];
  const cycleLabel = template?.cycle ? CYCLE_LABEL[template.cycle] ?? template.cycle : null;

  return (
    <Sheet open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <SheetContent side="bottom" className="rounded-t-2xl max-h-[85dvh] flex flex-col">
        {/* Header — large title for instant scan */}
        <SheetHeader className="pb-3 shrink-0">
          <SheetTitle className="text-lg font-bold flex items-center gap-2.5 leading-tight">
            <span className={cn("h-3 w-3 rounded-full shrink-0", style.dot)} />
            <span className="truncate">{sessionName}</span>
          </SheetTitle>
          {cell && (
            <SheetDescription className="text-sm text-muted-foreground font-medium pl-[22px] flex items-center gap-2 flex-wrap">
              <span>S{cell.relative_week} · {DAY_LABELS[cell.day_of_week]}</span>
              {cycleLabel && (
                <Badge
                  variant="outline"
                  className={cn("text-[10px] uppercase tracking-wide font-bold border-0", style.bg, style.text)}
                >
                  {cycleLabel}
                </Badge>
              )}
            </SheetDescription>
          )}
        </SheetHeader>

        <div className="flex-1 overflow-y-auto -mx-1 px-1 pb-4 space-y-4">
          {template?.description && (
            <div className="rounded-xl bg-muted/40 px-3.5 py-2.5">
              <p className="text-sm text-foreground/85 leading-relaxed">
                {template.description}
              </p>
            </div>
          )}

          {items.length === 0 ? (
            <div className="text-center py-10">
              <Dumbbell className="h-10 w-10 text-muted-foreground/20 mx-auto mb-2.5" />
              <p className="text-sm text-muted-foreground">
                Aucun exercice dans cette séance.
              </p>
            </div>
          ) : (
            <ul className="space-y-2">
              {items
                .slice()
                .sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0))
                .map((item, idx) => {
                  const hasPercent = item.percent_1rm != null && item.percent_1rm > 0;
                  const hasRest = item.rest_seconds != null && item.rest_seconds > 0;
                  return (
                    <li
                      key={idx}
                      className="rounded-xl border border-border bg-card px-3.5 py-3"
                    >
                      <div className="flex items-start gap-3">
                        {/* Index chip — large enough to ground the eye */}
                        <span className="inline-flex items-center justify-center h-7 w-7 shrink-0 rounded-full bg-muted text-foreground text-sm font-bold tabular-nums">
                          {idx + 1}
                        </span>
                        <div className="flex-1 min-w-0 space-y-1.5">
                          {/* Exercise name — biggest text in the card */}
                          <p className="text-[15px] font-semibold leading-snug">
                            {item.exercise_name ?? `Exercice #${item.exercise_id}`}
                          </p>
                          {/* Primary metrics — bold "N × M" + %1RM chip */}
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-base font-bold tabular-nums leading-none">
                              {item.sets} <span className="text-muted-foreground/60 font-medium mx-0.5">×</span> {item.reps}
                              <span className="ml-1.5 text-xs font-medium text-muted-foreground">reps</span>
                            </span>
                            {hasPercent && (
                              <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-primary/10 text-primary text-xs font-bold tabular-nums">
                                {item.percent_1rm}% 1RM
                              </span>
                            )}
                          </div>
                          {/* Secondary line — rest time only */}
                          {hasRest && (
                            <p className="text-xs text-muted-foreground">
                              Repos <span className="font-semibold text-foreground/80 tabular-nums">{formatRest(item.rest_seconds)}</span>
                            </p>
                          )}
                          {item.notes && (
                            <p className="text-xs text-muted-foreground italic leading-snug">
                              {item.notes}
                            </p>
                          )}
                        </div>
                      </div>
                    </li>
                  );
                })}
            </ul>
          )}

          {/* Actions */}
          <div className="pt-3 space-y-1">
            <div className="h-px bg-border" />
            <button
              type="button"
              className="w-full flex items-center gap-3 rounded-xl px-3.5 py-3.5 text-left transition-all min-h-[52px] text-primary hover:bg-primary/10 active:scale-[0.98]"
              onClick={onChangeSession}
            >
              <Dumbbell className="h-4 w-4 shrink-0" />
              <span className="text-sm font-semibold">Changer de séance</span>
            </button>
            <button
              type="button"
              className="w-full flex items-center gap-3 rounded-xl px-3.5 py-3.5 text-left transition-all min-h-[52px] text-destructive hover:bg-destructive/10 active:scale-[0.98] disabled:opacity-50"
              onClick={onRemove}
              disabled={removePending}
            >
              <Trash2 className="h-4 w-4 shrink-0" />
              <span className="text-sm font-semibold">Retirer de la grille</span>
            </button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
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
