import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  getCompetitionChecklist,
  getChecklistTemplates,
  applyChecklistTemplate,
  toggleChecklistCheck,
  removeCompetitionChecklist,
  deleteChecklistTemplate,
  createChecklistTemplate,
  type ChecklistTemplate,
  type ChecklistItemInput,
  type CompetitionChecklistCheck,
} from "@/lib/api";
import { queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import {
  AlertDialog,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogAction,
  AlertDialogCancel,
} from "@/components/ui/alert-dialog";
import { ListChecks, Plus, Trash2, X } from "lucide-react";

/* ── Props ──────────────────────────────────────────────── */

interface ChecklistTabProps {
  competitionId: string;
}

/* ── Main component ─────────────────────────────────────── */

export default function ChecklistTab({ competitionId }: ChecklistTabProps) {
  const { toast } = useToast();
  const [sheetOpen, setSheetOpen] = useState(false);

  /* ── Queries ────────────────────────────────────────── */

  const {
    data: compChecklist,
    isLoading: loadingChecklist,
  } = useQuery({
    queryKey: ["competition-checklist", competitionId],
    queryFn: () => getCompetitionChecklist(competitionId),
  });

  const { data: templates = [], isLoading: loadingTemplates } = useQuery({
    queryKey: ["checklist-templates"],
    queryFn: () => getChecklistTemplates(),
  });

  /* ── Mutations ──────────────────────────────────────── */

  const applyMutation = useMutation({
    mutationFn: (templateId: string) =>
      applyChecklistTemplate(competitionId, templateId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["competition-checklist", competitionId] });
      toast({ title: "Checklist appliquee" });
    },
    onError: () => toast({ title: "Erreur", description: "Impossible d'appliquer la checklist", variant: "destructive" }),
  });

  const toggleMutation = useMutation({
    mutationFn: ({ checkId, checked }: { checkId: string; checked: boolean }) =>
      toggleChecklistCheck(checkId, checked),
    onMutate: async ({ checkId, checked }) => {
      await queryClient.cancelQueries({ queryKey: ["competition-checklist", competitionId] });
      const prev = queryClient.getQueryData<typeof compChecklist>(["competition-checklist", competitionId]);
      if (prev) {
        queryClient.setQueryData(["competition-checklist", competitionId], {
          ...prev,
          checks: prev.checks.map((c) =>
            c.id === checkId ? { ...c, checked, checked_at: checked ? new Date().toISOString() : null } : c,
          ),
        });
      }
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(["competition-checklist", competitionId], ctx.prev);
      toast({ title: "Erreur", variant: "destructive" });
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["competition-checklist", competitionId] }),
  });

  const removeMutation = useMutation({
    mutationFn: (id: string) => removeCompetitionChecklist(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["competition-checklist", competitionId] });
      toast({ title: "Checklist retirée" });
    },
    onError: () => toast({ title: "Erreur", variant: "destructive" }),
  });

  const deleteTemplateMutation = useMutation({
    mutationFn: (id: string) => deleteChecklistTemplate(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["checklist-templates"] });
      toast({ title: "Template supprime" });
    },
    onError: () => toast({ title: "Erreur", variant: "destructive" }),
  });

  /* ── Loading state ──────────────────────────────────── */

  if (loadingChecklist || loadingTemplates) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-violet-500 border-t-transparent" />
      </div>
    );
  }

  /* ── Active checklist view ──────────────────────────── */

  if (compChecklist) {
    const template = templates.find((t) => t.id === compChecklist.checklist.checklist_template_id);
    const items = template?.items ?? [];
    const checks = compChecklist.checks;
    const total = checks.length;
    const done = checks.filter((c) => c.checked).length;
    const pct = total > 0 ? Math.round((done / total) * 100) : 0;

    // Map checklist_item_id → check row for fast lookup
    const checkByItemId = new Map<string, CompetitionChecklistCheck>();
    for (const c of checks) checkByItemId.set(c.checklist_item_id, c);

    return (
      <div className="space-y-4">
        {/* Progress */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs">
            <span className="font-medium text-foreground">{done}/{total}</span>
            <span className="text-muted-foreground">{pct}%</span>
          </div>
          <div className="h-2 w-full rounded-full bg-muted/30 overflow-hidden">
            <div
              className="h-full rounded-full bg-violet-500 transition-all duration-300"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>

        {/* Items */}
        <div className="space-y-2">
          {items.map((item) => {
            const check = checkByItemId.get(item.id);
            if (!check) return null;
            return (
              <label
                key={check.id}
                className="flex items-center gap-3 rounded-2xl border bg-card px-3 py-2.5 cursor-pointer active:scale-[0.98] transition-transform"
              >
                <Checkbox
                  checked={check.checked}
                  onCheckedChange={(v) =>
                    toggleMutation.mutate({ checkId: check.id, checked: !!v })
                  }
                  className="data-[state=checked]:bg-violet-500 data-[state=checked]:border-violet-500"
                />
                <span
                  className={
                    check.checked
                      ? "text-sm text-muted-foreground line-through"
                      : "text-sm text-foreground"
                  }
                >
                  {item.label}
                </span>
              </label>
            );
          })}
        </div>

        {/* Change checklist */}
        <button
          type="button"
          onClick={() => removeMutation.mutate(compChecklist.checklist.id)}
          disabled={removeMutation.isPending}
          className="w-full text-center text-xs text-muted-foreground hover:text-foreground transition py-1"
        >
          Changer de checklist
        </button>
      </div>
    );
  }

  /* ── Template picker view ──────────────────────────── */

  return (
    <div className="space-y-4">
      {templates.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-border bg-card/60 p-6 text-center">
          <ListChecks className="mx-auto h-8 w-8 text-muted-foreground/40" />
          <p className="mt-3 text-sm font-medium">Aucun template</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Cree ton premier template de checklist
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {templates.map((tmpl) => (
            <div
              key={tmpl.id}
              className="flex items-center justify-between rounded-2xl border bg-card px-3 py-2.5"
            >
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium truncate">{tmpl.name}</p>
                <p className="text-xs text-muted-foreground">
                  {tmpl.items?.length ?? 0} items
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => applyMutation.mutate(tmpl.id)}
                  disabled={applyMutation.isPending}
                  className="rounded-xl bg-violet-500/10 px-3 py-1.5 text-xs font-medium text-violet-700 dark:text-violet-300 hover:bg-violet-500/20 transition"
                >
                  Appliquer
                </button>
                <DeleteTemplateButton
                  templateId={tmpl.id}
                  onConfirm={() => deleteTemplateMutation.mutate(tmpl.id)}
                />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create template button */}
      <button
        type="button"
        onClick={() => setSheetOpen(true)}
        className="flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-violet-500/30 bg-violet-500/5 px-3 py-3 text-xs font-medium text-violet-700 dark:text-violet-300 hover:bg-violet-500/10 transition"
      >
        <Plus className="h-3.5 w-3.5" />
        Creer un template
      </button>

      {/* Create template sheet */}
      <CreateTemplateSheet open={sheetOpen} onOpenChange={setSheetOpen} />
    </div>
  );
}

/* ── Create Template Sheet ──────────────────────────────── */

function CreateTemplateSheet({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const { toast } = useToast();
  const [name, setName] = useState("");
  const [items, setItems] = useState<string[]>([""]);

  const createMutation = useMutation({
    mutationFn: ({ n, its }: { n: string; its: ChecklistItemInput[] }) =>
      createChecklistTemplate(n, its),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["checklist-templates"] });
      toast({ title: "Template cree" });
      setName("");
      setItems([""]);
      onOpenChange(false);
    },
    onError: () => toast({ title: "Erreur", variant: "destructive" }),
  });

  function addItem() {
    setItems((prev) => [...prev, ""]);
  }

  function removeItem(idx: number) {
    setItems((prev) => prev.filter((_, i) => i !== idx));
  }

  function updateItem(idx: number, value: string) {
    setItems((prev) => prev.map((v, i) => (i === idx ? value : v)));
  }

  function handleSave() {
    const trimmed = name.trim();
    if (!trimmed) return;
    const validItems = items
      .map((label) => label.trim())
      .filter(Boolean)
      .map((label, i) => ({ label, sort_order: i }));
    createMutation.mutate({ n: trimmed, its: validItems });
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex flex-col overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Nouveau template</SheetTitle>
          <SheetDescription>
            Cree une checklist réutilisable pour tes compétitions.
          </SheetDescription>
        </SheetHeader>

        <div className="mt-4 flex-1 space-y-4">
          {/* Name */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Nom</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex : Sac de compet"
              className="w-full rounded-xl border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-violet-500/40"
            />
          </div>

          {/* Items */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Items</label>
            <div className="space-y-2">
              {items.map((item, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <input
                    type="text"
                    value={item}
                    onChange={(e) => updateItem(idx, e.target.value)}
                    placeholder={`Item ${idx + 1}`}
                    className="flex-1 rounded-xl border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-violet-500/40"
                  />
                  {items.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeItem(idx)}
                      className="h-8 w-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={addItem}
              className="flex items-center gap-1.5 text-xs text-violet-600 dark:text-violet-400 hover:underline mt-1"
            >
              <Plus className="h-3 w-3" />
              Ajouter un item
            </button>
          </div>
        </div>

        {/* Save */}
        <div className="mt-4 pt-4 border-t">
          <button
            type="button"
            onClick={handleSave}
            disabled={!name.trim() || createMutation.isPending}
            className="w-full rounded-xl bg-violet-500 px-4 py-2.5 text-sm font-medium text-white hover:bg-violet-600 disabled:opacity-50 transition"
          >
            {createMutation.isPending ? "Sauvegarde..." : "Sauvegarder"}
          </button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

/* ── Delete Template Button ─────────────────────────────── */

function DeleteTemplateButton({
  templateId,
  onConfirm,
}: {
  templateId: string;
  onConfirm: () => void;
}) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <button
          type="button"
          className="h-8 w-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Supprimer le template ?</AlertDialogTitle>
          <AlertDialogDescription>
            Cette action est irréversible. Le template et ses items seront définitivement supprimés.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Annuler</AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            Supprimer
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
