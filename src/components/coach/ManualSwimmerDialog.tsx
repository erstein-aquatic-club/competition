import { useState, useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createManualSwimmer, updateManualSwimmer, type CoachManualSwimmer } from "@/lib/api/coach-manual-swimmers";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

interface ManualSwimmerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Prefill for edit mode — omit for create mode */
  swimmer?: CoachManualSwimmer;
}

export function ManualSwimmerDialog({ open, onOpenChange, swimmer }: ManualSwimmerDialogProps) {
  const isEdit = !!swimmer;
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [sex, setSex] = useState<"M" | "F" | "">("");
  const [birthdate, setBirthdate] = useState("");

  // Prefill on open (edit mode)
  useEffect(() => {
    if (open) {
      setName(swimmer?.display_name ?? "");
      setSex((swimmer?.sex as "M" | "F" | "") ?? "");
      setBirthdate(swimmer?.birthdate ?? "");
    }
  }, [open, swimmer]);

  const isValid = name.trim().length > 0 && (sex === "M" || sex === "F");

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["my-manual-swimmers"] });
    queryClient.invalidateQueries({ queryKey: ["my-team"] });
  };

  const createMutation = useMutation({
    mutationFn: () =>
      createManualSwimmer(name.trim(), {
        sex: sex as "M" | "F",
        birthdate: birthdate || null,
      }),
    onSuccess: () => {
      invalidate();
      onOpenChange(false);
      toast("Nageur ajouté");
    },
    onError: (e: Error) => toast.error("Erreur", { description: e.message }),
  });

  const updateMutation = useMutation({
    mutationFn: () =>
      updateManualSwimmer(swimmer!.id, {
        displayName: name.trim(),
        sex: sex as "M" | "F",
        birthdate: birthdate || null,
      }),
    onSuccess: () => {
      invalidate();
      onOpenChange(false);
      toast("Nageur mis à jour");
    },
    onError: (e: Error) => toast.error("Erreur", { description: e.message }),
  });

  const isPending = createMutation.isPending || updateMutation.isPending;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValid) return;
    if (isEdit) updateMutation.mutate();
    else createMutation.mutate();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Modifier le nageur" : "Ajouter un nageur sans compte"}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 pt-1">
          {/* Nom */}
          <div className="space-y-1.5">
            <Label htmlFor="ms-name">Nom complet <span className="text-destructive">*</span></Label>
            <Input
              id="ms-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="ex. Léo Martin"
              autoFocus
              disabled={isPending}
            />
          </div>

          {/* Sexe */}
          <div className="space-y-1.5">
            <Label>Sexe <span className="text-destructive">*</span></Label>
            <div className="flex gap-3">
              {(["M", "F"] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setSex(s)}
                  disabled={isPending}
                  className={[
                    "flex-1 rounded-lg border py-2 text-sm font-semibold transition-colors",
                    sex === s
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border bg-card text-muted-foreground hover:bg-muted/40",
                  ].join(" ")}
                >
                  {s === "M" ? "Garçon" : "Fille"}
                </button>
              ))}
            </div>
          </div>

          {/* Date de naissance */}
          <div className="space-y-1.5">
            <Label htmlFor="ms-birthdate">Date de naissance <span className="text-muted-foreground text-xs">(optionnel)</span></Label>
            <Input
              id="ms-birthdate"
              type="date"
              value={birthdate}
              onChange={(e) => setBirthdate(e.target.value)}
              disabled={isPending}
            />
          </div>

          <DialogFooter className="pt-2 gap-2">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={isPending}>
              Annuler
            </Button>
            <Button type="submit" disabled={!isValid || isPending}>
              {isPending ? "Enregistrement..." : isEdit ? "Enregistrer" : "Ajouter"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
